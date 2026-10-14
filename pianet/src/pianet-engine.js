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
//
// Knob moves never jump: pickup positions glide per sample, the amp is
// crossfaded in and out (its speaker filters always run), and a pickup switch
// ducks the output to zero and back.

import { Biquad, OnePole } from '../../shared/dsp.js';
import { Pluck, PlateRail, keyReed, emFlux, esCap, voicing, voicingT, PAD } from './pianet-model.js';

const OS = 2;
// Pickup → output units (a forte note peaks ≈ 0.3). The T's e = −N dΦ/dt is the
// flux step per sample × the sample rate, so GAIN_EM is quoted per sample at
// EM_RATE (the 2× rate of a 48 kHz page) and rescaled for other rates.
const GAIN_EM = 84, GAIN_ES = 6.5, EM_RATE = 96000;
const MAX_VOICES = 40;
const FADE = 1 / 480; // per-sample fade for retired voices (5 ms at 96 kHz)
const GLIDE = 0.015;  // s: the pickup follows its knobs through two such lags (critically damped),
                      // so it starts moving with zero speed: the T's output, ∝ dΦ/dt, cannot step
const XFADE = 0.02;   // s: switching the valve combo in or out crossfades over this
const DUCK = 0.01;    // s: a pickup switch fades out over this, then back in
const RETACK = 0.95;  // a re-pressed key fires once its dropped pad has re-tacked this much of its disc …
const RETACK_MAX = 0.15; // s … or after this long at most

class Voice {
  constructor(eng, key) {
    this.key = key; this.version = eng.version;
    this.p = new Pluck(keyReed(key, eng.P, eng.fs2), eng.P, eng.fs2);
    this.pol = key % 2 ? -1 : 1;
    this.held = false; this.posted = false; this.sleep = false; this.quiet = 0;
    this.pending = false; this.pressVel = 0; this.wait = 0; // a re-press waiting for its pad to land and re-tack
    this.msg = { type: 'release', key, y: 0, F: 0, v: 0, t: 0, V: 0 };
    this.fade = 1; this.dying = false; this.dead = false;
    this.g = this.g1 = 0; this.ye = this.ye1 = 0;
    this.setPickup(eng, true);
    this.phiPrev = emFlux(this.p.y, this.g);
    this.dC = 0;
  }
  // Pickup position for the knobs, voiced for this key (pianet-model.js). The
  // pickup is set relative to the free reed (y = 0); at rest the pad holds the
  // tip at yRest, so that is the zero of the rail's ΔC (voices come and go silently).
  setPickup(eng, now = false) {
    const P = eng.P, v = voicing(this.key);
    this.gT = (P.pickup === 'es' ? P.plateGap * v : P.gap * voicingT(this.key)) * 1e-3;
    this.yeT = P.offset * 1e-3 * v;
    if (now) { this.g = this.g1 = this.gT; this.ye = this.ye1 = this.yeT; }
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
    this.glideA = 1 - Math.exp(-1 / (GLIDE * this.fs2));
    this.mix = 0; this.mixStep = 1 / (XFADE * fs); this.duckStep = 1 / (DUCK * fs);
    this.waitMax = Math.round(RETACK_MAX * this.fs2);
    // decimation FIR: Blackman-windowed sinc, cutoff just below the output Nyquist
    const T = 63, h = new Float64Array(T), c = 0.23;
    let sum = 0;
    for (let i = 0; i < T; i++) {
      const m = i - (T - 1) / 2, x = 2 * Math.PI * c * m;
      h[i] = (m === 0 ? 1 : Math.sin(x) / x) * (0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (T - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (T - 1)));
      sum += h[i];
    }
    for (let i = 0; i < T; i++) h[i] /= sum;
    // symmetric, so it is applied folded; the history is written twice (i and
    // i + 128) so the taps read straight back from hist[hi + 128]
    this.fir = h; this.T = T; this.hist = new Float64Array(256); this.hi = 0;
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
    if (!old) this.mix = P.amp === 'combo' ? 1 : 0;
    this.toneLP.set(P.tone, this.fs);
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
    const p = v.p;
    if (p.down || v.pending) {
      // The pad is up (latched by the sustain catch, or a repeated note-on), so
      // there is nothing to drag. Drop it, and press again once it has landed,
      // choked the reed and re-tacked (≈ 40–55 ms; see process).
      if (p.down) { p.lift(); v.wait = 0; }
      v.pending = true; v.pressVel = velocity;
    } else p.press(velocity);
  }
  noteOff(key) {
    const v = this.byKey.get(key);
    if (!v) return;
    if (this.sustain) v.held = true;
    else { v.pending = false; v.p.lift(); v.sleep = false; }
  }
  setSustain(on) {
    this.sustain = !!on;
    if (!on) for (const v of this.voices) if (v.held) { v.held = false; v.pending = false; v.p.lift(); v.sleep = false; }
  }
  allNotesOff() { for (const v of this.voices) v.retire(); this.byKey.clear(); }
  voiceCount() { return this.voices.length; }

  // One block of a voice whose pickup is moving: the same as in process(), with
  // the pickup following its knobs smoothly (no zipper, no click).
  glide(v, n2, es) {
    const p = v.p, mono = this.mono, dCs = this.dCs, ga = this.glideA;
    const gT = v.gT, yeT = v.yeT, yRest = p.yRest, pol = v.pol;
    let g = v.g, g1 = v.g1, ye = v.ye, ye1 = v.ye1, c0 = v.c0, phiPrev = v.phiPrev, fade = v.fade, dC = 0;
    p.stop = es ? Infinity : g;
    for (let s = 0; s < n2; s++) {
      g1 += ga * (gT - g1); g += ga * (g1 - g); ye1 += ga * (yeT - ye1); ye += ga * (ye1 - ye);
      if (es) c0 = esCap(yRest, g, ye); else p.stop = g;
      const y = p.step();
      if (v.dying) { fade -= FADE; if (fade < 0) fade = 0; }
      if (es) { dC = fade * (esCap(y, g, ye) - c0); dCs[s] += dC; }
      else { const phi = emFlux(y, g); mono[s] += fade * pol * (phiPrev - phi); phiPrev = phi; }
    }
    if (Math.abs(gT - g) + Math.abs(gT - g1) + Math.abs(yeT - ye) + Math.abs(yeT - ye1) < 1e-9) { g = g1 = gT; ye = ye1 = yeT; c0 = esCap(yRest, g, ye); }
    v.g = g; v.g1 = g1; v.ye = ye; v.ye1 = ye1; v.c0 = c0;
    v.phiPrev = es ? emFlux(p.y, g) : phiPrev; v.fade = fade; v.dC = dC;
  }

  process(L, R, n) {
    const n2 = n * OS, mono = this.mono, dCs = this.dCs, P = this.P;
    mono.fill(0, 0, n2);
    if (!P) { L.fill(0, 0, n); R.fill(0, 0, n); return; }
    if (P.pickup !== this.pick && this.duck <= 0) this.pick = P.pickup;
    const es = this.pick === 'es';
    if (es) dCs.fill(0, 0, n2);
    for (const v of this.voices) {
      const p = v.p;
      if (v.pending && ((p.hv === 0 && p.F <= 0 && p.a >= RETACK * PAD.a0) || (v.wait += n2) > this.waitMax)) {
        v.pending = false; p.press(v.pressVel); v.sleep = false; v.quiet = 0;
      }
      const gliding = v.g !== v.gT || v.g1 !== v.gT || v.ye !== v.yeT || v.ye1 !== v.yeT;
      if (v.sleep && !gliding) { if (es) for (let s = 0; s < n2; s++) dCs[s] += v.dC; continue; }
      if (gliding) this.glide(v, n2, es);
      else {
        const g = v.g, ye = v.ye, c0 = v.c0, pol = v.pol;
        let phiPrev = v.phiPrev, fade = v.fade, dC = 0;
        p.stop = es ? Infinity : g; // the T's pole piece sits in the reed's path
        for (let s = 0; s < n2; s++) {
          const y = p.step();
          if (v.dying) { fade -= FADE; if (fade < 0) fade = 0; }
          if (es) { dC = fade * (esCap(y, g, ye) - c0); dCs[s] += dC; }
          else { const phi = emFlux(y, g); mono[s] += fade * pol * (phiPrev - phi); phiPrev = phi; }
        }
        v.phiPrev = es ? emFlux(p.y, g) : phiPrev; v.fade = fade; v.dC = dC;
      }
      if (p.released && !v.posted) {
        v.posted = true;
        if (this.post) { const m = v.msg, r = p.rel; m.y = r.y; m.F = r.F; m.v = r.v; m.t = r.t; m.V = r.V; this.post(m); }
      }
      // bookkeeping: retire faded voices; sleep or free reeds that have stopped
      if (v.dying && fade <= 0) v.dead = true;
      else if (!(Math.abs(p.y) < 1)) { v.dead = true; if (this.post) this.post({ type: 'error', message: 'numerical instability', key: v.key }); }
      else if (p.hv === 0 && !v.pending && !(p.F > 0 && p.a > 0) && p.energy() < 1e-13) { // (a bond under tension may still be creeping)
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
      const coil = this.coil, gk = (GAIN_EM * this.fs2) / EM_RATE; // ΔΦ per sample × fs = dΦ/dt
      for (let s = 0; s < n2; s++) mono[s] = gk * coil.run(mono[s]);
    }

    // valve drive (at 2×), decimate, tone RC, speaker, level. The combo is
    // crossfaded in and out over XFADE (its speaker filters start from rest
    // when it comes in; the fade covers their settling).
    const hist = this.hist, fir = this.fir, T = this.T, Th = (T - 1) >> 1, tone = this.toneLP, spk = this.spk;
    const dk = this.driveK, dn = this.driveN, mixT = P.amp === 'combo' ? 1 : 0, mStep = this.mixStep, dStep = this.duckStep;
    const switching = P.pickup !== this.pick, fading = this.mix !== mixT, combo = mixT === 1 && !fading;
    if (fading && this.mix === 0) for (const b of spk) b.reset();
    if (combo) for (let s = 0; s < n2; s++) mono[s] = (Math.tanh(dk * mono[s] + 0.2) - 0.19738) * dn;
    let hi = this.hi, mix = this.mix, duck = this.duck;
    for (let s = 0; s < n2; s++) {
      let x2 = mono[s];
      if (fading) x2 += mix * ((Math.tanh(dk * x2 + 0.2) - 0.19738) * dn - x2);
      hi = (hi + 1) & 127;
      hist[hi] = hist[hi + 128] = x2;
      if (s & 1) {
        const b = hi + 128, e = b - T + 1;
        let a = fir[Th] * hist[b - Th];
        for (let t = 0; t < Th; t++) a += fir[t] * (hist[b - t] + hist[e + t]);
        let x = tone.run(a);
        if (combo) x = spk[3].run(spk[2].run(spk[1].run(spk[0].run(x))));
        else if (fading) {
          x += mix * (spk[3].run(spk[2].run(spk[1].run(spk[0].run(x)))) - x);
          mix = mixT > mix ? Math.min(mixT, mix + mStep) : Math.max(mixT, mix - mStep);
        }
        // switching pickups: duck to zero, switch, come back (no click)
        if (switching) duck = Math.max(0, duck - dStep);
        else if (duck < 1) duck = Math.min(1, duck + dStep);
        L[s >> 1] = R[s >> 1] = x * duck;
      }
    }
    this.hi = hi; this.mix = mix; this.duck = duck;
  }
}

globalThis.PianetEngine = PianetEngine;
