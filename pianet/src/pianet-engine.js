// pianet-engine.js — the real-time part: one sticky-pad mechanism per key
// (pianet-model.js), the pickup, the output network and an optional valve
// combo. Runs in the AudioWorklet (through shared/worklet.js) and in Node.
//
// Voices run 2× oversampled: the pad contact is stiff, and both pickups are
// nonlinear. The sum is decimated with a windowed-sinc FIR. The instrument
// is mono (one pickup rail), so both channels carry the same signal.
//
// Pickups:
//   'em'  Pianet T: e = −N dΦ/dt per reed, coils in series, wound alternately
//         (adjacent keys have opposite polarity), ≈1 H of coils against the
//         cable capacitance: a resonant low-pass near 7 kHz.
//   'es'  Pianet N: every reed is one plate of a capacitor on a shared rail,
//         polarised through R. The rail charge Q obeys dQ/dt = (V_b − Q/C)/R
//         with C = C_bus + Σ C_i(y_i): constant voltage (output ∝ dC/dt) below
//         1/(2πRC_bus) ≈ 106 Hz, constant charge (output ∝ ΔC) above.

import { Biquad, OnePole } from '../../shared/dsp.js';
import { Pluck, PlateRail, keyReed, emFlux, esCap, voicing, PAD } from './pianet-model.js';

const OS = 2;
const GAIN_EM = 75, GAIN_ES = 6.5; // pickup → output units (a forte note peaks ≈ 0.3)
const MAX_VOICES = 40;
const FADE = 1 / 480; // per-sample fade for retired voices (5 ms at 96 kHz)

class Voice {
  constructor(eng, key) {
    this.key = key; this.version = eng.version;
    this.p = new Pluck(keyReed(key, eng.P, eng.fs2), eng.P, eng.fs2);
    this.pol = key % 2 ? -1 : 1;
    this.held = false; this.posted = false; this.sleep = false; this.quiet = 0;
    this.msg = { type: 'release', key, y: 0, F: 0, v: 0, t: 0, V: 0 };
    this.fade = 1; this.dying = false; this.dead = false;
    this.g = 0; this.ye = 0;
    this.setPickup(eng, true);
    this.glide();
    this.phiPrev = emFlux(this.p.y, this.g);
    this.dC = 0;
  }
  setPickup(eng, now = false) {
    const v = voicing(this.key);
    const es = eng.P.pickup === 'es';
    this.gT = (es ? eng.P.plateGap : eng.P.gap) * 1e-3 * v; this.yeT = eng.P.offset * 1e-3 * v;
    if (now) { this.g = this.gT; this.ye = this.yeT; }
  }
  // The pickup is set relative to the free reed (y = 0); at rest the pad holds the
  // tip at yRest, so that is the zero of the rail's ΔC (voices come and go silently).
  glide() { // pickup position follows the knobs smoothly (no zipper while notes ring)
    this.g += 0.08 * (this.gT - this.g); this.ye += 0.08 * (this.yeT - this.ye);
    this.c0 = esCap(this.p.yRest, this.g, this.ye);
  }
  retire() { this.dying = true; }
}

export class PianetEngine {
  constructor(fs) {
    this.fs = fs; this.fs2 = OS * fs;
    this.P = null; this.version = 0; this.reedKey = '';
    this.voices = []; this.byKey = new Map(); this.sustain = false;
    this.mono = new Float64Array(OS * 4096); this.dCs = new Float64Array(OS * 4096);
    this.pick = 'em'; this.duck = 1; this.rail = new PlateRail(this.fs2);
    // decimation FIR: Blackman-windowed sinc, cutoff just below the output Nyquist
    const T = 63, h = new Float64Array(T), c = 0.23;
    let sum = 0;
    for (let i = 0; i < T; i++) {
      const m = i - (T - 1) / 2, x = 2 * Math.PI * c * m;
      h[i] = (m === 0 ? 1 : Math.sin(x) / x) * (0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (T - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (T - 1)));
      sum += h[i];
    }
    for (let i = 0; i < T; i++) h[i] /= sum;
    this.fir = h; this.T = T; this.hist = new Float64Array(128); this.hi = 0;
    this.coil = new Biquad().set('lp', 7000, 1.2, this.fs2);
    this.toneLP = new OnePole(6000, fs);
    this.spk = [new Biquad(), new Biquad(), new Biquad(), new Biquad()];
  }

  setParams(P) {
    const old = this.P;
    this.P = { ...P };
    const rk = `${P.tipMass}|${P.loss}`;
    if (rk !== this.reedKey) { this.reedKey = rk; this.version++; }
    for (const v of this.voices) { v.p.setPad(this.P); v.setPickup(this); }
    if (!this.voices.length) { this.pick = P.pickup; this.duck = 1; } // nothing sounding: switch now
    this.toneLP.set(P.tone, this.fs);
    if (!old || old.amp !== P.amp) for (const b of this.spk) b.reset();
    this.spk[0].set('hp', 80, 0.7, this.fs);
    this.spk[1].set('peak', 110, 1.2, this.fs, 3);
    this.spk[2].set('peak', 2400, 1.5, this.fs, 4);
    this.spk[3].set('lp', 5000, 0.8, this.fs);
    this.driveK = 1 + 12 * P.drive * P.drive; this.driveN = (1 + 0.5 * P.drive) / this.driveK;
  }

  noteOn(key, velocity) {
    if (!this.P) return;
    let v = this.byKey.get(key);
    if (v && v.version !== this.version) { v.retire(); v = null; }
    if (!v) {
      v = new Voice(this, key);
      this.voices.push(v); this.byKey.set(key, v);
      if (this.voices.length > MAX_VOICES) {
        let victim = null, e = Infinity;
        for (const u of this.voices) if (u !== v && !u.dying && !u.p.down && u.p.energy() < e) { e = u.p.energy(); victim = u; }
        if (victim) { victim.retire(); this.byKey.delete(victim.key); }
      }
    }
    v.held = false; v.posted = false; v.sleep = false; v.quiet = 0;
    v.p.press(velocity);
  }
  noteOff(key) {
    const v = this.byKey.get(key);
    if (!v) return;
    if (this.sustain) v.held = true; else { v.p.lift(); v.sleep = false; }
  }
  setSustain(on) {
    this.sustain = !!on;
    if (!on) for (const v of this.voices) if (v.held) { v.held = false; v.p.lift(); v.sleep = false; }
  }
  allNotesOff() { for (const v of this.voices) v.retire(); this.byKey.clear(); }
  voiceCount() { return this.voices.length; }

  process(L, R, n) {
    const n2 = n * OS, mono = this.mono, dCs = this.dCs, P = this.P;
    mono.fill(0, 0, n2);
    if (!P) { L.fill(0, 0, n); R.fill(0, 0, n); return; }
    if (P.pickup !== this.pick && this.duck <= 0) this.pick = P.pickup;
    const es = this.pick === 'es';
    if (es) dCs.fill(0, 0, n2);
    for (const v of this.voices) {
      const p = v.p;
      v.glide();
      if (v.sleep) { if (es) for (let s = 0; s < n2; s++) dCs[s] += v.dC; continue; }
      const g = v.g, ye = v.ye, c0 = v.c0, pol = v.pol;
      p.stop = es ? Infinity : g; // the T's pole piece sits in the reed's path
      let phiPrev = v.phiPrev, fade = v.fade, dC = 0;
      for (let s = 0; s < n2; s++) {
        const y = p.step();
        if (v.dying) { fade -= FADE; if (fade < 0) fade = 0; }
        if (es) { dC = fade * (esCap(y, g, ye) - c0); dCs[s] += dC; }
        else { const phi = emFlux(y, g); mono[s] += fade * pol * (phiPrev - phi); phiPrev = phi; }
      }
      v.phiPrev = es ? emFlux(p.y, g) : phiPrev; v.fade = fade; v.dC = dC;
      if (p.released && !v.posted) {
        v.posted = true;
        if (this.post) { const m = v.msg, r = p.rel; m.y = r.y; m.F = r.F; m.v = r.v; m.t = r.t; m.V = r.V; this.post(m); }
      }
      // bookkeeping: retire faded voices; sleep or free reeds that have stopped
      if (v.dying && fade <= 0) v.dead = true;
      else if (!(Math.abs(p.y) < 1)) { v.dead = true; if (this.post) this.post({ type: 'error', message: 'numerical instability', key: v.key }); }
      else if (p.hv === 0 && !(p.F > 0 && p.a > 0) && p.energy() < 1e-13) { // (a bond under tension may still be creeping)
        if (++v.quiet > 20) { if (p.down || v.held) v.sleep = true; else if (p.a > PAD.aMin * PAD.a0) v.dead = true; }
      } else v.quiet = 0;
    }
    let j = 0;
    for (const v of this.voices) {
      if (v.dead) { if (this.byKey.get(v.key) === v) this.byKey.delete(v.key); } else this.voices[j++] = v;
    }
    this.voices.length = j;

    // pickup rail → output, at 2×
    if (es) {
      const rail = this.rail;
      for (let s = 0; s < n2; s++) mono[s] = GAIN_ES * rail.step(dCs[s]);
    } else {
      const coil = this.coil, gk = GAIN_EM;
      for (let s = 0; s < n2; s++) mono[s] = gk * coil.run(mono[s]);
    }
    const amp = P.amp === 'combo', dk = this.driveK, dn = this.driveN;
    if (amp) for (let s = 0; s < n2; s++) mono[s] = (Math.tanh(dk * mono[s] + 0.2) - 0.19738) * dn;

    // decimate, tone RC, speaker, level
    const hist = this.hist, fir = this.fir, T = this.T, tone = this.toneLP, spk = this.spk;
    for (let s = 0; s < n2; s++) {
      this.hi = (this.hi + 1) & 127;
      hist[this.hi] = mono[s];
      if (s & 1) {
        let a = 0;
        for (let t = 0; t < T; t++) a += fir[t] * hist[(this.hi - t) & 127];
        let x = tone.run(a);
        if (amp) x = spk[3].run(spk[2].run(spk[1].run(spk[0].run(x))));
        // switching pickups: duck to zero, switch, come back (no click)
        if (P.pickup !== this.pick) this.duck = Math.max(0, this.duck - 0.004);
        else if (this.duck < 1) this.duck = Math.min(1, this.duck + 0.004);
        L[s >> 1] = R[s >> 1] = x * this.duck;
      }
    }
  }
}

globalThis.PianetEngine = PianetEngine;
