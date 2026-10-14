// springs-engine.js — the real-time spring keyboard. Runs in the AudioWorklet (through
// shared/worklet.js) and in Node (tests, renders).
//
//   key ─▶ mallet (a half-sine force pulse on the driving bead, shorter when harder)
//       ─▶ 1–3 springs in parallel, each a bank of modes of Wittrick's helical rod
//          (exact two-pole recursions; frequency, group speed and bead coupling from the model)
//       ─▶ the pickup bead at the far end of each spring (its rotation, or its axial slide)
//       ─▶ each spring panned to its own side of the key's place
//
// One voice per key. Re-striking a sounding key strikes the same springs as they move (the strike
// is a force, and the springs are linear, so it adds to what is ringing). Key-up lets a felt damper
// onto the springs unless the pedal holds it off. Modes that have died below audibility are
// skipped; a voice is done when all of them are.

import { TAU, KEY_LO, KEY_HI, keySprings, geometryId, modeSigma, pulseLength } from './springs-model.js';

const OUT = 0.05;           // output per mode at full velocity, before the voicing below
const MAX_VOICES = 16;      // sounding keys at once; the quietest older one fades out beyond this
const FADE = 0.03;          // s: a stolen voice fades out over this
const YOUNG = 0.05;         // s: a voice this young is never stolen
const GLIDE = 0.03;         // s: damping and output gains glide over this
const PRUNE = 3e-5;         // a mode below this × the voice's loudest (all its modes, in power) is skipped (−90 dB)
const BLOCK_MAX = 1024;
const PULSE_MAX = 0.012;    // s: the longest mallet pulse
const CAPTURE = 1 << 15;    // samples of the focus strike kept for the page's echo view
const PANS = [[0], [-0.3, 0.3], [0, 0.35, -0.35]]; // each spring's pickup, left/right of the key's place

// Equal-power pan of a position p ∈ [−1, 1].
const panOf = (p) => { const a = ((Math.max(-1, Math.min(1, p)) + 1) * Math.PI) / 4; return [Math.cos(a), Math.sin(a)]; };
const keyPos = (key) => 0.6 * ((2 * (key - KEY_LO)) / (KEY_HI - KEY_LO) - 1);

// The pickups' voicing: +3 dB an octave up the keyboard. Every key is the same spring scaled, but a
// mallet of the same contact time reaches fewer of a small spring's modes, and they die sooner.
export const voicing = (key) => 2 ** ((key - 60) / 24);

// One spring: a bank of modes (sp: its length, note and modes, from keySprings).
class Bank {
  constructor(eng, sp, pan, share) {
    const N = sp.f.length, F = () => new Float64Array(N);
    this.sp = sp; this.N = N;
    this.F = F(); this.CG = F(); this.W = F(); this.SIG0 = F(); this.C = F(); this.WD = F();
    this.A1 = F(); this.A2 = F(); this.BC = F(); this.G = F(); this.GT = F(); this.Y1 = F(); this.Y2 = F(); this.AMP = F(); this.KA = F();
    this.act = new Uint8Array(N); this.idx = new Int32Array(N); this.nAct = 0;
    const h = 1 / eng.fs;
    for (let i = 0; i < N; i++) {
      this.F[i] = sp.f[i]; this.CG[i] = sp.cg[i]; this.W[i] = sp.rel[i] * share;
      const w = TAU * sp.f[i]; this.WD[i] = w; this.C[i] = Math.cos(w * h);
      this.act[i] = 1;
    }
    [this.gl, this.gr] = pan;
    this.sigma(eng, 0, true);
    this.gains(eng, true);
  }
  // σ per mode (the fixed part: drag, steel, mounts) and, with the live extra, the recursion's coefficients.
  sigma(eng, extra, fixed = false) {
    const h = 1 / eng.fs, D = eng.S, L = this.sp.L;
    for (let i = 0; i < this.N; i++) {
      if (fixed || eng.lossMoved) this.SIG0[i] = modeSigma(this.F[i], this.CG[i], L, D);
      const sg = this.SIG0[i] + extra, r = Math.exp(-sg * h), w = this.WD[i];
      this.A1[i] = 2 * r * this.C[i]; this.A2[i] = r * r; this.BC[i] = (h * r * Math.sin(w * h)) / w;
    }
  }
  // Output gains: velocity of the far bead (backward difference × fs, corrected to the exact amplitude
  // at the mode's frequency), each bead's inertia passing less of the higher modes.
  gains(eng, now = false) {
    const h = 1 / eng.fs, fb = this.sp.f0 / (Math.PI * Math.max(1e-4, eng.S.bead / 100)), out = OUT * voicing(this.sp.key) * (this.sp.gain ?? 1) * eng.fs;
    for (let i = 0; i < this.N; i++) {
      const w = this.WD[i], corr = (0.5 * w * h) / Math.sin(0.5 * w * h), x = this.F[i] / fb;
      this.GT[i] = (out * corr * this.W[i]) / (1 + x * x);
      if (now) this.G[i] = this.GT[i];
      // amplitude as heard from two successive states (see prune): √(a² − 2ca·b + b²)·KA
      this.KA[i] = (Math.abs(this.GT[i]) * 2 * Math.sin(0.5 * w * h)) / Math.sin(w * h);
    }
  }
  compact() { let k = 0; for (let r = 0; r < this.N; r++) if (this.act[r]) this.idx[k++] = r; this.nAct = k; }
}

class Voice {
  constructor(eng, key, data) {
    const nS = data.springs.length;
    this.key = key; this.id = data.id;
    this.banks = data.springs.map((sp, s) => new Bank(eng, sp, panOf(keyPos(key) + PANS[nS - 1][s]), 1 / nS));
    this.sp = this.banks[0].sp;
    this.buf = new Float64Array(BLOCK_MAX); this.force = new Float64Array(BLOCK_MAX);
    this.pulse = new Float64Array(Math.ceil(PULSE_MAX * eng.fs) + 2); this.pulseN = 0; this.pulseAt = 0; this.tau = 0;
    this.age = 0; this.fade = 1; this.fading = false; this.dead = false; this.peak = 0; this.level = 0;
    this.released = false; this.dampGlide = GLIDE;
    this.extra = eng.S.hand;
    for (const b of this.banks) b.sigma(eng, this.extra); // a hand already on the spring
  }

  // The mallet: a half-sine pulse of force whose impulse is the velocity, laid onto the beads.
  strike(eng, velocity) {
    const tau = Math.min(PULSE_MAX, pulseLength(eng.P, velocity)), n = Math.max(1, Math.round(tau * eng.fs));
    const amp = (velocity * Math.PI * eng.fs) / (2 * n); // Σ F·h = velocity
    for (let i = 0; i < n; i++) this.pulse[i] = amp * Math.sin((Math.PI * (i + 0.5)) / n);
    this.pulseN = n; this.pulseAt = 0; this.tau = tau;
    for (const b of this.banks) { b.act.fill(1); b.compact(); }
    this.fading = false; this.fade = 1; this.dead = false; this.age = 0;
    this.released = false;
  }

  render(L, R, n, eng) {
    const buf = this.buf, force = this.force, glide = 1 - Math.exp(-n / (GLIDE * eng.fs));
    // the force in this block (zero once the pulse is over)
    let pushing = false;
    for (let s = 0; s < n; s++) {
      if (this.pulseAt < this.pulseN) { force[s] = this.pulse[this.pulseAt++]; pushing = true; } else force[s] = 0;
    }
    // the hand and the damper (once the key is up, unless the pedal holds it off): extra damping, gliding in
    const target = eng.S.hand + (this.released && !eng.sustain ? eng.dampSigma : 0);
    if (target !== this.extra || eng.lossMoved) {
      const tg = target > this.extra && this.released ? this.dampGlide : GLIDE;
      this.extra += (1 - Math.exp(-n / (tg * eng.fs))) * (target - this.extra);
      if (Math.abs(target - this.extra) < 1e-3 * (1 + target)) this.extra = target;
      for (const b of this.banks) b.sigma(eng, this.extra);
    }
    let sum = 0;
    for (const b of this.banks) {
      buf.fill(0, 0, n);
      const na = b.nAct;
      if (pushing) pushBlock(b.A1, b.A2, b.BC, b.Y1, b.Y2, b.G, b.GT, b.idx, b.nAct, buf, force, n, glide);
      else ringBlock(b.A1, b.A2, b.Y1, b.Y2, b.G, b.GT, b.idx, b.nAct, buf, n, glide);
      if (na < b.N) for (let r = 0; r < b.N; r++) if (!b.act[r]) b.G[r] += glide * (b.GT[r] - b.G[r]);
      const gl = b.gl, gr = b.gr, fadeStep = this.fading ? 1 / (FADE * eng.fs) : 0;
      let fade = this.fade;
      for (let s = 0; s < n; s++) {
        const y = buf[s] * fade;
        if (fadeStep) { fade -= fadeStep; if (fade < 0) fade = 0; }
        L[s] += gl * y; R[s] += gr * y;
        if (eng.capturing === this) eng.capture[eng.capN + s] += y * 0.7071;
      }
      sum += this.prune(b, eng, pushing);
    }
    if (this.fading) { this.fade -= n / (FADE * eng.fs); if (this.fade <= 0) { this.fade = 0; this.dead = true; } }
    if (eng.capturing === this) { eng.capN += n; if (eng.capN + BLOCK_MAX > eng.capLen) eng.finishCapture(); }
    this.level = Math.sqrt(sum);
    if (this.level > this.peak) this.peak = this.level;
    this.age += n / eng.fs;
    if (!pushing && this.age > YOUNG && !this.anyActive()) this.dead = true;
    if (!(sum < 1e6)) { this.dead = true; eng.post?.({ type: 'error', message: `spring ${this.key}: numerical failure` }); }
  }
  anyActive() { for (const b of this.banks) if (b.nAct) return true; return false; }

  // Each mode's amplitude as heard (from two successive samples: exact for a free decaying
  // sinusoid); skip those far below the voice's loudest. Returns the bank's power, Σ amp².
  prune(b, eng, pushing) {
    const Y1 = b.Y1, Y2 = b.Y2, AMP = b.AMP;
    const sum = amplitudes(Y1, Y2, b.C, b.KA, AMP, b.idx, b.nAct);
    if (pushing || this.age < YOUNG) return sum;
    const floor = Math.max(PRUNE * this.peak, 1e-9);
    let changed = false;
    // (a skipped mode is let go entirely, so a later strike starts it afresh)
    for (let q = 0; q < b.nAct; q++) { const r = b.idx[q]; if (AMP[r] < floor) { b.act[r] = 0; AMP[r] = 0; Y1[r] = 0; Y2[r] = 0; changed = true; } }
    if (changed) b.compact();
    return sum;
  }
}

// ---- the hot loops: plain functions on typed arrays, so the JIT compiles them early and keeps them ----
// Free ringing: four modes at a time (independent recursions in one loop run in parallel), each
// output gain ramping to its target over the block.
function ringBlock(A1, A2, Y1, Y2, G, GT, idx, na, buf, n, glide) {
  const inv = 1 / n;
  let q = 0;
  for (; q + 4 <= na; q += 4) {
    const r0 = idx[q], r1 = idx[q + 1], r2 = idx[q + 2], r3 = idx[q + 3];
    const a10 = A1[r0], a20 = A2[r0], a11 = A1[r1], a21 = A2[r1], a12 = A1[r2], a22 = A2[r2], a13 = A1[r3], a23 = A2[r3];
    let y10 = Y1[r0], y20 = Y2[r0], y11 = Y1[r1], y21 = Y2[r1], y12 = Y1[r2], y22 = Y2[r2], y13 = Y1[r3], y23 = Y2[r3];
    let g0 = G[r0], g1 = G[r1], g2 = G[r2], g3 = G[r3];
    const d0 = glide * (GT[r0] - g0) * inv, d1 = glide * (GT[r1] - g1) * inv, d2 = glide * (GT[r2] - g2) * inv, d3 = glide * (GT[r3] - g3) * inv;
    for (let s = 0; s < n; s++) {
      const x0 = a10 * y10 - a20 * y20, x1 = a11 * y11 - a21 * y21, x2 = a12 * y12 - a22 * y22, x3 = a13 * y13 - a23 * y23;
      buf[s] += g0 * (x0 - y10) + g1 * (x1 - y11) + g2 * (x2 - y12) + g3 * (x3 - y13);
      y20 = y10; y10 = x0; y21 = y11; y11 = x1; y22 = y12; y12 = x2; y23 = y13; y13 = x3;
      g0 += d0; g1 += d1; g2 += d2; g3 += d3;
    }
    Y1[r0] = y10; Y2[r0] = y20; Y1[r1] = y11; Y2[r1] = y21; Y1[r2] = y12; Y2[r2] = y22; Y1[r3] = y13; Y2[r3] = y23;
    G[r0] = g0; G[r1] = g1; G[r2] = g2; G[r3] = g3;
  }
  for (; q < na; q++) {
    const r = idx[q], a1 = A1[r], a2 = A2[r];
    let y1 = Y1[r], y2 = Y2[r], g = G[r];
    const dg = glide * (GT[r] - g) * inv;
    for (let s = 0; s < n; s++) { const y = a1 * y1 - a2 * y2; buf[s] += g * (y - y1); y2 = y1; y1 = y; g += dg; }
    Y1[r] = y1; Y2[r] = y2; G[r] = g;
  }
}
// The mallet is on: every mode takes its share of the force, sample by sample, two at a time.
function pushBlock(A1, A2, BC, Y1, Y2, G, GT, idx, na, buf, force, n, glide) {
  const inv = 1 / n;
  let q = 0;
  for (; q + 2 <= na; q += 2) {
    const r0 = idx[q], r1 = idx[q + 1], a10 = A1[r0], a20 = A2[r0], b0 = BC[r0], a11 = A1[r1], a21 = A2[r1], b1 = BC[r1];
    let y10 = Y1[r0], y20 = Y2[r0], y11 = Y1[r1], y21 = Y2[r1], g0 = G[r0], g1 = G[r1];
    const d0 = glide * (GT[r0] - g0) * inv, d1 = glide * (GT[r1] - g1) * inv;
    for (let s = 0; s < n; s++) {
      const f = force[s], x0 = a10 * y10 - a20 * y20 + b0 * f, x1 = a11 * y11 - a21 * y21 + b1 * f;
      buf[s] += g0 * (x0 - y10) + g1 * (x1 - y11);
      y20 = y10; y10 = x0; y21 = y11; y11 = x1; g0 += d0; g1 += d1;
    }
    Y1[r0] = y10; Y2[r0] = y20; Y1[r1] = y11; Y2[r1] = y21; G[r0] = g0; G[r1] = g1;
  }
  for (; q < na; q++) {
    const r = idx[q], a1 = A1[r], a2 = A2[r], bc = BC[r];
    let y1 = Y1[r], y2 = Y2[r], g = G[r];
    const dg = glide * (GT[r] - g) * inv;
    for (let s = 0; s < n; s++) { const y = a1 * y1 - a2 * y2 + bc * force[s]; buf[s] += g * (y - y1); y2 = y1; y1 = y; g += dg; }
    Y1[r] = y1; Y2[r] = y2; G[r] = g;
  }
}
// Each active mode's amplitude as heard, from two successive states (exact for a free decaying
// sinusoid): √(a² − 2ca·b + b²)·KA. Returns the power, Σ amp².
function amplitudes(Y1, Y2, C, KA, AMP, idx, na) {
  let sum = 0;
  for (let q = 0; q < na; q++) {
    const r = idx[q], c = C[r], a = Y1[r], b = Y2[r];
    const amp = Math.sqrt(Math.max(0, a * a - 2 * c * a * b + b * b)) * KA[r];
    AMP[r] = amp; sum += amp * amp;
  }
  return sum;
}

export class SpringEngine {
  constructor(fs) {
    this.fs = fs; this.P = null; this.S = null; this.T = null;
    this.voices = []; this.byKey = new Map(); this.sustain = false;
    this.cache = new Map(); this.lossMoved = false; this.dampSigma = 0;
    this.capture = new Float32Array(CAPTURE); this.capN = 0; this.capLen = 0; this.capturing = null; this.capKey = 0; this.capVel = 0;
    this.echoMsg = { type: 'echo', key: 0, fs, data: this.capture, n: 0, vel: 0 };
  }

  setParams(P) {
    const first = !this.P;
    this.P = P;
    // live: losses, hand, bead (they glide); the rest applies at the next strike
    this.T = { endLoss: P.endLoss, eta: P.eta, oil: P.oil, hand: 60 * P.hand * P.hand, bead: P.bead };
    if (first) this.S = { ...this.T };
    this.dampSigma = Math.log(1000) / P.damper;
    if (first) this.warmUp();
  }

  // Before the first note: play a small made-up spring through every path the engine has (the mallet,
  // free ringing, the damper, the pedal, gliding knobs, pruning, fading, the capture), so the JIT has
  // compiled them all; otherwise the first real strikes run unoptimised, slowly, and allocate.
  warmUp() {
    const N = 63, sp = { L: 0.4, f0: 262, key: 60, TD: 0.0038, Fc: 4200, gain: 1, f: new Float64Array(N), cg: new Float64Array(N), rel: new Float64Array(N), n: new Int32Array(N) };
    for (let i = 0; i < N; i++) { sp.f[i] = 260 * (i + 1) * (1 - 0.004 * i); sp.cg[i] = 200 - 2 * i; sp.rel[i] = i % 2 ? 1 : -1; sp.n[i] = i + 1; }
    const data = { id: geometryId(this.P), fs: this.fs, springs: [sp, sp] }, bL = new Float32Array(128), bR = new Float32Array(128);
    const T = this.T, keep = { ...T }, post = this.post;
    this.post = null;
    for (let i = 0; i < 360; i++) {
      if (i === 0 || i === 150) this.noteOn(60, 0.8, data);
      if (i === 60) this.noteOff(60, 0.7);
      if (i === 70) this.setSustain(true);
      if (i === 80) { this.setSustain(false); T.bead = keep.bead * 1.5 + 0.25; T.endLoss = keep.endLoss * 2 + 0.01; T.eta = keep.eta * 1.5; T.oil = keep.oil + 0.5; T.hand = keep.hand + 0.5; }
      if (i === 120) Object.assign(T, keep);
      if (i === 240) this.allNotesOff();
      this.process(bL, bR, 128);
    }
    this.voices.length = 0; this.byKey.clear(); this.capturing = null; this.capture.fill(0); this.capN = 0;
    Object.assign(this.S, keep); Object.assign(T, keep); this.sustain = false; this.post = post;
  }
  setSustain(on) { this.sustain = !!on; }

  // A key's springs and their modes: sent by the page with the note (data), or built here (in Node,
  // a few hundred small eigen-solves the first time a key is struck after a change of geometry).
  springsOf(key, data) {
    const id = geometryId(this.P);
    if (data && data.id === id && data.fs === this.fs && data.springs?.length) return data;
    const ck = `${id}|${key}`;
    let c = this.cache.get(ck);
    if (!c) {
      c = keySprings(key, this.P, this.fs);
      if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(ck, c);
    }
    return c;
  }

  noteOn(key, velocity, data) {
    if (!this.P || !(key >= KEY_LO && key <= KEY_HI) || !(velocity > 0)) return;
    const id = geometryId(this.P);
    let v = this.byKey.get(key);
    if (!v || v.dead || v.fading || v.id !== id) {
      if (v && !v.dead) v.fading = true; // a different spring now hangs there: the old one fades out
      v = new Voice(this, key, this.springsOf(key, data));
      this.voices.push(v); this.byKey.set(key, v);
    }
    v.strike(this, velocity);
    // the page's echo view: this strike's first moments
    this.capture.fill(0); this.capN = 0; this.capturing = v; this.capKey = key; this.capVel = velocity;
    this.capLen = Math.min(CAPTURE, Math.max(2048, Math.round(Math.min(10 * v.sp.TD + 0.004, 0.65) * this.fs)));
    let live = 0;
    for (const u of this.voices) if (!u.fading) live++;
    if (live > MAX_VOICES) {
      let victim = null, score = Infinity;
      for (const u of this.voices) {
        if (u === v || u.fading || u.pulseAt < u.pulseN || u.age < YOUNG) continue;
        if (u.level < score) { score = u.level; victim = u; }
      }
      if (victim) victim.fading = true;
    }
  }
  noteOff(key, velocity) {
    const v = this.byKey.get(key);
    if (!v) return;
    // the damper falls onto the springs: its grip glides in over 25–100 ms, faster for a faster release
    v.released = true; v.dampGlide = 0.04 / (0.4 + (velocity ?? 0.5));
  }
  allNotesOff() { for (const v of this.voices) v.fading = true; }
  voiceCount() { return this.voices.length; }

  finishCapture() {
    // (the whole buffer goes, the page reads its first n samples: nothing is allocated here)
    if (this.post && this.capturing) { const m = this.echoMsg; m.key = this.capKey; m.n = this.capN; m.vel = this.capVel; this.post(m); }
    this.capturing = null;
  }

  process(L, R, n) {
    L.fill(0, 0, n); R.fill(0, 0, n);
    if (!this.P) return;
    const S = this.S, T = this.T, a = 1 - Math.exp(-n / (GLIDE * this.fs));
    let lossMoved = false, beadMoved = false;
    for (const id in T) {
      if (S[id] === T[id]) continue;
      S[id] += a * (T[id] - S[id]);
      if (Math.abs(T[id] - S[id]) < 1e-6 * (Math.abs(T[id]) + 1e-6)) S[id] = T[id];
      if (id === 'bead') beadMoved = true; else if (id !== 'hand') lossMoved = true;
    }
    this.lossMoved = lossMoved;
    for (const v of this.voices) {
      if (beadMoved) for (const b of v.banks) b.gains(this);
      v.render(L, R, n, this);
    }
    this.lossMoved = false;
    let j = 0;
    for (const v of this.voices) {
      if (v.dead) { if (this.byKey.get(v.key) === v) this.byKey.delete(v.key); if (this.capturing === v) this.finishCapture(); } else this.voices[j++] = v;
    }
    this.voices.length = j;
  }
}

globalThis.SpringEngine = SpringEngine;
