// harpsichord-engine.js — the real-time harpsichord. Runs in the AudioWorklet
// (through shared/worklet.js) and in Node (tests, renders).
//
//   key ─▶ its jacks rise at the key's speed ─▶ each engaged plectrum catches its string,
//          slides along and slips off (string.js: implicit contacts, every sample)
//   key up ─▶ the jacks fall: plectra brush past on their tongues, the dampers land
//   strings (front 8′, back 8′, 4′) ─▶ bridge force at their bridge points (5 segments)
//   soundboard: plate modes driven by the segments, two microphones over it,
//          plus a residual path above its modal band
//   knocks: the key landing on its cloth, the jack dropping back, into the board
//
// One voice per key: it holds that key's strings (made when first plucked) and
// its jacks. Pressing a sounding key again plucks the same strings. Physics
// knobs (tuning, scale, losses) give the next press a new voice and fade the
// old one; registration, plectra and pluck points apply to the next press.

import {
  KEY_LO, KEY_HI, ROWS, ACTION, SEGS, DEFAULT_RELEASE, registration, plectrumFor, pluckPoint, rowGap,
  buildString, segmentWeights, jackSpeed, fallSpeed, boardModel, BOARD,
} from './harpsichord-model.js';
import { PT } from './string.js';

const OUT = 0.06;           // board microphone units → output
const DRY = 0.05;           // bridge force (N) → output, with the soundboard off (about as loud as the board)
const MAXBL = 4096;         // largest block process() accepts
const MAX_VOICES = 16;      // keys sounding at once; beyond this the quietest released one fades
const HARD_VOICES = 24;     // never more than this: then the quietest sounding one fades too
const KILL_SIGMA = 200;     // s⁻¹: a stolen or retuned voice dies away this fast (−60 dB in 35 ms)
const QUIET = 4e-6;         // N: a string whose bridge force stays below this is put to sleep
const DROP = 1e-6;          // N: top partials below this stop being integrated
const RAMP = 0.02;          // s: the buff's leather and the soundboard switch glide over this
const KNOCK_COUPLING = 0.04;// share of a knock's impulse that reaches the board at the bridge (estimate)
const FAST_FALL = fallSpeed(1);
// Physics parameters: a change makes new strings for the next press.
const PHYS = ['pitch', 'temperament', 'detune', 'loss', 'damper', 'fmax'];

class Voice {
  constructor(eng, key) {
    this.key = key; this.version = eng.version;
    this.strings = { front: null, back: null, four: null };
    this.lifts = { front: false, back: false, four: false };
    this.list = [];  // the strings made so far, with their choir (iterated on the audio thread)
    this.lift = 0; this.V = 0.3; this.vDown = fallSpeed(DEFAULT_RELEASE); this.keyDown = false; this.pending = false;
    this.top = ACTION.top + rowGap('four', eng.P);
    this.knockT = -1; this.knockAmp = 0; this.knockN = Math.max(2, Math.round(ACTION.knock * eng.fs));
    this.killing = false; this.dead = false; this.sounded = false; this.peak = 0; this.quiet = 0; this.age = 0;
    this.kw = segmentWeights(key, 'back');
  }

  // Key down at velocity vel: arm the engaged plectra and send the jacks up.
  press(eng, vel) {
    const P = eng.P, reg = registration(P), m = this.key;
    this.V = jackSpeed(vel);
    for (const ch of ['front', 'back', 'four']) {
      const rows = reg.rows.filter((r) => ROWS[r].string === ch);
      this.lifts[ch] = reg.lift[ch];
      if (!rows.length && !this.strings[ch]) continue;
      let st = this.strings[ch];
      if (!st) {
        st = this.strings[ch] = eng.makeString(m, ch); st.ch = ch;
        st.w = segmentWeights(m, ch); st.w0 = st.w.findIndex((x) => x > 0); st.w1 = st.w.findLastIndex((x) => x > 0); st.sleep = false; st.quiet = 0;
        this.list.push(st);
      }
      st.wake(); st.sleep = false; st.quiet = 0;
      for (const row of ch === 'back' ? ['back', 'lute'] : [ch]) {
        const p = row === 'lute' ? PT.LUTE : PT.MAIN, on = rows.includes(row), gap = rowGap(row, P);
        st.armPlectrum(p, on ? plectrumFor(m, row, P) : null, on ? pluckPoint(m, row, P) : 0, gap, on, this.lift - gap > 0);
      }
      st.onRelease = this.onRelease;
    }
    // a plectrum still above its string must come back under it first
    this.pending = false;
    for (const st of this.list) if (st.phase[0] === 'above' || st.phase[1] === 'above') this.pending = true;
    this.keyDown = !this.pending;
    this.knockT = -1;
  }
  release(r) { this.keyDown = false; this.pending = false; this.vDown = fallSpeed(r); }
  kill() {
    if (this.killing) return;
    this.killing = true; this.keyDown = false; this.pending = false;
    for (const st of this.list) {
      st.extra.fill(KILL_SIGMA); st.setDamping(st.extra); st.phase[0] = st.phase[1] = 'off'; st.wake(); st.sleep = false;
    }
  }

  render(eng, n) {
    const lb = eng.liftBuf, h = 1 / eng.fs;
    let lift = this.lift;
    // the jacks: up at the key's speed to the rail, or down as the key comes up
    for (let t = 0; t < n; t++) {
      if (this.keyDown) {
        if (lift < this.top) { lift += this.V * h; if (lift >= this.top) { lift = this.top; this.knock(eng, ACTION.keyMass * this.V); } }
      } else if (lift > 0) {
        lift -= (this.pending ? FAST_FALL : this.vDown) * h;
        if (lift <= 0) { lift = 0; if (!this.killing) this.knock(eng, ACTION.jackMass * (this.pending ? FAST_FALL : this.vDown)); }
      }
      lb[t] = lift;
    }
    this.lift = lift;
    if (this.pending) {
      let back = true;
      for (let i = 0; i < this.list.length; i++) { const st = this.list[i]; if (st.phase[0] === 'above' || st.phase[1] === 'above') back = false; }
      if (back) { this.pending = false; this.keyDown = true; }
    }
    // knocks: a half-sine of force on the cloth, into the board through the case
    if (this.knockT >= 0) {
      const seg = eng.seg, w = this.kw, N = this.knockN;
      for (let t = 0; t < n && this.knockT < N; t++, this.knockT++) {
        const f = this.knockAmp * Math.sin((Math.PI * (this.knockT + 0.5)) / N);
        for (let s = 0; s < 3; s++) if (w[s]) seg[s * MAXBL + t] += w[s] * f;
      }
      if (this.knockT >= N) this.knockT = -1;
    }
    // the strings
    let peak = 0, awake = false;
    for (let i = 0; i < this.list.length; i++) {
      const st = this.list[i], ch = st.ch;
      if (st.sleep) continue;
      const lifted = this.lifts[ch] && !this.killing;
      const pk = st.render(n, lifted ? lb : eng.zeroBuf, this.keyDown && lifted, ch === 'back' ? eng.buffBuf : eng.zeroBuf, eng.seg, MAXBL, st.w, st.w0, st.w1, 1);
      if (pk > peak) peak = pk;
      if (!(pk < 1e4) || !Number.isFinite(st.q[0])) { this.dead = true; eng.emit({ type: 'error', key: this.key, message: 'numerical instability' }); return; }
      st.dropTop(DROP);
      // asleep once quiet and nothing is about to touch it (a plectrum waiting to
      // pluck, or the jack on its way down)
      const waiting = lifted && (this.pending || (this.keyDown && (st.phase[0] === 'under' || st.phase[1] === 'under')) || (!this.keyDown && this.lift > 0));
      st.quiet = pk < QUIET ? st.quiet + 1 : 0;
      if (st.quiet > 30 && !waiting) { st.sleep = true; st.q.fill(0); st.q1.fill(0); st.hv.fill(0); }
      else awake = true;
    }
    this.peak = peak; this.age += n;
    if (peak > 1e-3) this.sounded = true;
    if (this.killing && (peak < QUIET || !awake)) this.dead = true;
    if (!awake && !this.keyDown && !this.pending && this.lift <= 0 && this.knockT < 0) this.dead = true;
  }
  knock(eng, J) { // J: impulse (N·s); half-sine of duration τ has peak πJ/2τ
    this.knockAmp = (KNOCK_COUPLING * Math.PI * J) / (2 * ACTION.knock); this.knockT = 0;
  }
}

// The soundboard: a bank of plate modes driven at the bridge points, heard
// as acceleration × each mode's weight at two microphones, plus the residual
// path of the modes above the bank. The bridge's mass makes the board's drive
// point mass-like above f_b = 1/(2π m_b G₀): a one-pole low-pass on the force.
class Board {
  constructor(fs) {
    const B = boardModel(), K = B.K, S = SEGS.length, k = 1 / fs;
    this.K = K; this.S = S; this.fs = fs;
    this.e0 = new Float64Array(K); this.e1 = new Float64Array(K); this.a1 = new Float64Array(K); this.a2 = new Float64Array(K);
    this.ph = new Float64Array(K * S); this.ml = new Float64Array(K); this.mr = new Float64Array(K);
    const hp = (f) => (f / 100) / Math.hypot(1, f / 100); // the acoustic short circuit round the case (first order, 100 Hz)
    for (let i = 0; i < K; i++) {
      const om = 2 * Math.PI * B.f[i], sig = B.sigma[i], r = Math.exp(-sig * k), od = Math.sqrt(om * om - sig * sig);
      this.a1[i] = 2 * r * Math.cos(od * k); this.a2[i] = r * r;
      const b = (k * r * Math.sin(od * k)) / od;
      for (let s = 0; s < S; s++) this.ph[i * S + s] = b * B.phi[i * S + s];
      this.ml[i] = fs * fs * B.mic[2 * i] * hp(B.f[i]); this.mr[i] = fs * fs * B.mic[2 * i + 1] * hp(B.f[i]);
    }
    this.fb = 1 / (2 * Math.PI * BOARD.mb * B.Ginf); // f_b
    this.lpG = 1 - Math.exp((-2 * Math.PI * this.fb) / fs);
    this.lp = new Float64Array(S);
    // residual: per segment, the modal band's mean response at its top (both mics), through a
    // 4th-order high-pass there. Above the band a bending wave dies out within a few wavelengths of
    // the bridge, so each bridge point is heard mostly by the nearer microphone (an equal-power pan
    // by its place along the bridge: bass end left, treble end right).
    this.res = new Float64Array(2 * S);
    for (let s = 0; s < S; s++) {
      const g = Math.hypot(residualGain(B, s, 0, hp), residualGain(B, s, 1, hp)), pan = ((SEGS[s].t - 0.5) * 1.2 + 1) * Math.PI / 4;
      this.res[2 * s] = g * Math.cos(pan); this.res[2 * s + 1] = g * Math.sin(pan);
    }
    this.hpc = hpCoeffs(B.fTop, fs);
    this.hz = new Float64Array(8); // two biquads per mic
    this.quiet = 0;
  }
  run(seg, L, R, n) {
    const K = this.K, S = this.S, e0 = this.e0, e1 = this.e1, A1 = this.a1, A2 = this.a2, PH = this.ph, ML = this.ml, MR = this.mr, lp = this.lp, g = this.lpG, res = this.res;
    const c = this.hpc, z = this.hz;
    for (let t = 0; t < n; t++) {
      let rl = 0, rr = 0;
      for (let s = 0; s < S; s++) { lp[s] += g * (seg[s * MAXBL + t] - lp[s]); rl += res[2 * s] * lp[s]; rr += res[2 * s + 1] * lp[s]; }
      const f0 = lp[0], f1 = lp[1], f2 = lp[2], f3 = lp[3], f4 = lp[4];
      let ml = 0, mr = 0;
      for (let i = 0, j = 0; i < K; i++, j += 5) {
        const x0 = e0[i], x1 = e1[i];
        const xn = A1[i] * x0 - A2[i] * x1 + PH[j] * f0 + PH[j + 1] * f1 + PH[j + 2] * f2 + PH[j + 3] * f3 + PH[j + 4] * f4;
        const acc = xn - 2 * x0 + x1;
        e1[i] = x0; e0[i] = xn;
        ml += ML[i] * acc; mr += MR[i] * acc;
      }
      // residual through two biquads per mic (Butterworth high-pass, 4th order)
      let y = rl;
      for (let b = 0; b < 2; b++) { const o = 2 * b; const v = c.b0 * y + z[o]; z[o] = c.b1 * y - c.a1 * v + z[o + 1]; z[o + 1] = c.b2 * y - c.a2 * v; y = v; }
      ml += y;
      y = rr;
      for (let b = 2; b < 4; b++) { const o = 2 * b; const v = c.b0 * y + z[o]; z[o] = c.b1 * y - c.a1 * v + z[o + 1]; z[o + 1] = c.b2 * y - c.a2 * v; y = v; }
      mr += y;
      L[t] = ml; R[t] = mr;
    }
  }
}
// RBJ Butterworth high-pass biquad (Q = 1/√2) at f.
function hpCoeffs(f, fs) {
  const w = (2 * Math.PI * Math.min(f, 0.45 * fs)) / fs, c = Math.cos(w), al = Math.sin(w) / Math.SQRT2, a0 = 1 + al;
  return { b0: (1 + c) / 2 / a0, b1: -(1 + c) / a0, b2: (1 + c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - al) / a0 };
}
// |pressure per newton| at mic j from segment s, averaged (rms) over the top
// third of the modal band: the residual path's level, so the two join.
function residualGain(B, s, j, hp) {
  let e = 0, cnt = 0;
  for (let i = 0; i < 32; i++) {
    const f = B.fTop * (0.66 + (0.34 * i) / 31), w = 2 * Math.PI * f;
    let re = 0, im = 0;
    for (let k = 0; k < B.K; k++) {
      const wk = 2 * Math.PI * B.f[k], d = wk * wk - w * w, s2 = 2 * B.sigma[k] * w, den = d * d + s2 * s2, gk = B.mic[2 * k + j] * hp(B.f[k]) * B.phi[k * SEGS.length + s] * -w * w;
      re += (gk * d) / den; im -= (gk * s2) / den;
    }
    e += re * re + im * im; cnt++;
  }
  return Math.sqrt(e / cnt);
}

export class HarpsichordEngine {
  constructor(fs) {
    this.fs = fs;
    this.P = null; this.version = 0; this.physSig = '';
    this.voices = []; this.byKey = new Map();
    this.seg = new Float64Array(SEGS.length * MAXBL);
    this.liftBuf = new Float64Array(MAXBL); this.zeroBuf = new Float64Array(MAXBL); this.buffBuf = new Float64Array(MAXBL);
    this.bL = new Float64Array(MAXBL); this.bR = new Float64Array(MAXBL);
    this.board = new Board(fs);
    this.buff = 0; this.mix = 1; this.glide = 1 - Math.exp(-1 / (RAMP * fs));
    this.listeners = [];
    this.lastPluck = null;
    this.pluckMsg = { type: 'pluck', key: 0, choir: '', lute: false, F: 0, u: 0, w: 0, s: 0, theta: 0, x: 0 }; // reused: no allocation on the audio thread
  }

  emit(m) { if (this.post) this.post(m); for (const f of this.listeners) f(m); }

  setParams(P) {
    const first = !this.P;
    this.P = { ...P };
    const sig = PHYS.map((id) => P[id]).join('|');
    if (sig !== this.physSig) { this.physSig = sig; this.version++; }
    if (first) { this.buff = P.buff ? 1 : 0; this.mix = P.soundboard === false ? 0 : 1; }
  }

  makeString(m, ch) {
    const st = buildString(m, ch, this.P, this.fs);
    st.extra = new Float64Array(st.N);
    return st;
  }

  noteOn(key, velocity) {
    if (!this.P || key < KEY_LO || key > KEY_HI) return null;
    let v = this.byKey.get(key);
    if (v && (v.killing || v.dead || v.version !== this.version)) { if (!v.dead) v.kill(); v = null; }
    if (!v) {
      v = new Voice(this, key);
      const eng = this;
      v.onRelease = function onRelease(p, r) { eng.pluckInfo(v, this, p, r); };
      this.voices.push(v); this.byKey.set(key, v);
      this.steal(v);
    }
    v.press(this, Math.min(1, Math.max(0, velocity)));
    return v;
  }
  // relVel: the MIDI note-off's release velocity (0..1); the computer and on-screen keys have none.
  noteOff(key, relVel) {
    const v = this.byKey.get(key);
    if (v) v.release(Number.isFinite(relVel) ? Math.min(1, Math.max(0, relVel)) : DEFAULT_RELEASE);
  }
  allNotesOff() { for (const v of this.voices) v.kill(); this.byKey.clear(); }
  voiceCount() { return this.voices.length; }

  // Too many keys sounding: fade the quietest released one; never one that has not sounded yet.
  steal(keep) {
    const live = this.voices.filter((v) => !v.killing && v !== keep);
    if (live.length + 1 <= MAX_VOICES) return;
    let victim = null;
    for (const v of live) if (!v.keyDown && v.sounded && (!victim || v.peak < victim.peak)) victim = v;
    if (!victim && live.length + 1 > HARD_VOICES) for (const v of live) if (v.sounded && (!victim || v.peak < victim.peak)) victim = v;
    if (victim) { victim.kill(); if (this.byKey.get(victim.key) === victim) this.byKey.delete(victim.key); }
  }

  pluckInfo(v, st, p, r) {
    const m = this.pluckMsg;
    m.key = v.key; m.choir = st.S.choir; m.lute = p === PT.LUTE; m.F = r.F; m.u = r.u; m.w = r.w; m.s = r.s; m.theta = r.theta; m.x = st.x[p];
    this.lastPluck = m;
    this.emit(m);
  }

  process(L, R, n) {
    const P = this.P;
    L.fill(0, 0, n); R.fill(0, 0, n);
    if (!P) return;
    const S = SEGS.length, seg = this.seg, g = this.glide, bb = this.buffBuf;
    for (let s = 0; s < S; s++) seg.fill(0, s * MAXBL, s * MAXBL + n);
    // the buff's leather comes on and off gradually
    const bT = P.buff ? 1 : 0;
    let b = this.buff;
    for (let t = 0; t < n; t++) { b += g * (bT - b); if (Math.abs(bT - b) < 1e-6) b = bT; bb[t] = b; }
    this.buff = b;
    for (const v of this.voices) if (!v.dead) v.render(this, n);
    let j = 0;
    for (const v of this.voices) { if (v.dead) { if (this.byKey.get(v.key) === v) this.byKey.delete(v.key); } else this.voices[j++] = v; }
    this.voices.length = j;
    // soundboard microphones, or the bridge force itself (soundboard off), crossfaded
    const bL = this.bL, bR = this.bR;
    this.board.run(seg, bL, bR, n);
    const mT = P.soundboard === false ? 0 : 1;
    let mix = this.mix;
    for (let t = 0; t < n; t++) {
      mix += g * (mT - mix);
      const d0 = seg[t], d1 = seg[MAXBL + t], d2 = seg[2 * MAXBL + t], d3 = seg[3 * MAXBL + t], d4 = seg[4 * MAXBL + t];
      const dl = DRY * (d0 + 0.7 * d1 + 0.3 * d2 + d3 * 0.85 + d4 * 0.15), dr = DRY * (0.3 * d0 + 0.7 * d1 + d2 + d3 * 0.15 + d4 * 0.85);
      L[t] = OUT * mix * bL[t] + (1 - mix) * dl;
      R[t] = OUT * mix * bR[t] + (1 - mix) * dr;
    }
    this.mix = Math.abs(mix - mT) < 1e-6 ? mT : mix;
  }
}

globalThis.HarpsichordEngine = HarpsichordEngine;
