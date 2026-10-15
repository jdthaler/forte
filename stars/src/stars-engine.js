// stars-engine.js — the real-time Star Keyboard. Runs in the AudioWorklet (through shared/worklet.js)
// and in Node (tests, renders).
//
//   key ─▶ a star (stars-model.js: its modes, sped up K times into the audio band)
//       ─▶ every mode a damped oscillator (an exact two-pole recursion at its frequency and linewidth),
//          kicked once per block by Gaussian noise while the key is down: convection driving it
//       ─▶ seen at the set inclination: each m component weighted by √(V_l² E_lm(i))
//       ─▶ panned by the key's place on the keyboard
//
// The noise kicks come every block, at random sizes and phases: white in frequency, so each mode's
// spectrum is the Lorentzian of its own damping, and its mean power is set exactly by the kick
// variance, σ² = p(1 − e^(−2ηT)) for a block of length T and an amplitude damping rate η = πΓ.
// Key-down also gives every mode a coherent kick (a flare, after Wolff 1972), so a note speaks at
// once; key-up stops the driving, and every mode rings down at its own linewidth. The pedal keeps
// the convection on. δ Scuti stars have no noise: each mode grows by itself (the κ-mechanism) until
// the Landau term βA² stops it.
//
// One voice per key: pressing a sounding key drives the same star again. No allocation in process().

import { KEY_LO, KEY_HI, SUN, VIS, Elm, keyStar, starId, rng } from './stars-model.js';

export const OUT = 0.088;   // output scale: a star's rms is OUT·√½·drive
const MAX_VOICES = 14;      // stars sounding at once; the quietest older one fades beyond this
const FADE = 0.05;          // s: a stolen voice fades over this
const YOUNG = 0.05;         // s: a voice this young is never stolen
const GLIDE = 0.03;         // s: live knobs glide over this
const PRUNE = 1e-7;         // after release, a mode below this × the voice's peak power is let go (−70 dB)
const DEAD = 10 ** -6.5;    // and the voice when its whole power is below this × its peak (−65 dB)
const GN = 8192;            // a table of Gaussian numbers, indexed at random
const POST_EVERY = 0.06;    // s: the focus star's mode amplitudes, for the page's views

// Equal-power pan of the key across the keyboard (low left, high right).
const panOf = (key) => { const p = 0.6 * (2 * (key - KEY_LO) / (KEY_HI - KEY_LO) - 1), a = ((p + 1) * Math.PI) / 4; return [Math.cos(a), Math.sin(a)]; };
// The voicing: +1.5 dB an octave down the keyboard (the stars are levelled to the same power; the ear
// is less sensitive in the bass).
export const voicing = (key) => 2 ** ((60 - key) / 48);

class Voice {
  constructor(eng, key, data) {
    const md = data.modes, N = data.N, F = () => new Float64Array(N);
    this.key = key; this.id = data.id; this.data = data; this.N = N; this.dscuti = data.family === 'dscuti';
    this.F0 = md.f; this.L = md.l; this.M = md.m; this.WE = md.wEnv; this.WC = md.wCore; this.P = md.p; this.GAM = md.gamma; this.Z = md.zeta; this.AS = md.asat;
    this.W = F(); this.C = F(); this.S = F(); this.RHO = F(); this.A1 = F(); this.A2 = F(); this.Y1 = F(); this.Y2 = F();
    this.G = F(); this.GT = F(); this.AMP = F(); this.KS = F(); this.ETA = F();
    this.act = new Uint8Array(N).fill(1); this.idx = new Int32Array(N); this.nAct = 0;
    this.post = new Float32Array(N);
    this.buf = new Float64Array(1024);
    [this.gl, this.gr] = panOf(key);
    this.vel = 0.7; this.pressure = 1; this.held = false; this.age = 0; this.fade = 1; this.fading = false; this.dead = false;
    this.peak = 1e-12; this.level = 0; this.seed = rng(key * 104729 + (eng.presses++ & 0xffff));
    this.compact();
    this.freqs(eng); this.coeffs(eng); this.gains(eng, true);
    if (this.dscuti) { // a tiny seed in every mode, random phase: a self-excited mode grows from noise
      for (let i = 0; i < N; i++) this.addC(i, 1e-3 * this.AS[i] * Math.cos(TAUr(this.seed)), 1e-3 * this.AS[i] * Math.sin(TAUr(this.seed)));
    }
  }
  compact() { let k = 0; for (let r = 0; r < this.N; r++) if (this.act[r]) this.idx[k++] = r; this.nAct = k; }
  // frequencies with rotational splitting: δν = m (w_env Ω_env + w_core Ω_core)/2π, sped up K times
  freqs(eng) {
    const K = this.data.K * 1e-6, env = eng.S.spin * SUN.rot, core = env * (this.dscuti ? 1 : eng.S.core), fs = eng.fs;
    for (let i = 0; i < this.N; i++) {
      const f = Math.min(0.45 * fs, Math.max(1, this.F0[i] + this.M[i] * K * (this.WE[i] * env + this.WC[i] * core)));
      const w = (2 * Math.PI * f) / fs; this.W[i] = w; this.C[i] = Math.cos(w); this.S[i] = Math.sin(w);
    }
  }
  // damping per sample from the linewidth: amplitude rate η = πΓ (× the damping knob)
  coeffs(eng) {
    const fs = eng.fs;
    if (this.dscuti) return; // set per block in render
    for (let i = 0; i < this.N; i++) {
      const eta = Math.PI * this.GAM[i] * eng.S.damping, r = Math.exp(-eta / fs);
      this.ETA[i] = eta; this.RHO[i] = r; this.A1[i] = 2 * r * this.C[i]; this.A2[i] = r * r;
    }
  }
  // what the observer sees of each m component: √(V_l² E_lm(i)), and the voicing
  gains(eng, now = false) {
    const g = OUT * voicing(this.key), tab = eng.gtab;
    for (let i = 0; i < this.N; i++) { this.GT[i] = g * tab[this.L[i] * 7 + this.M[i] + 3]; if (now) this.G[i] = this.GT[i]; }
  }
  // add δC to mode i's complex amplitude C (y1 = Re C, y2 = Re(C e^(−iω))/ρ)
  addC(i, u, v) {
    const r = this.RHO[i] || 1;
    this.Y1[i] += u; this.Y2[i] += (u * this.C[i] + v * this.S[i]) / r;
  }
  // |C|² of mode i from its two states
  amp2(i) {
    const y1 = this.Y1[i], v = (this.Y2[i] * (this.RHO[i] || 1) - y1 * this.C[i]) / this.S[i];
    return y1 * y1 + v * v;
  }

  // Key-down: the convection drives the star, and a flare kicks every mode at once. The flare is a
  // point on the star (random, seeded), an impulse of force: each mode is pushed in proportion to its
  // spherical harmonic there (real basis: P_l^|m| cos mφ, P_l^|m| sin |m|φ), coherently across radial
  // orders (so the kick echoes at the large separation), and to its share of the p mode, 1 − ζ (a heavy,
  // core-trapped mode barely moves). Being a push, it starts each mode from rest, in sine phase.
  press(eng, velocity) {
    this.vel = velocity; this.held = true; this.fading = false; this.fade = 1; this.dead = false; this.age = 0;
    if (this.nAct < this.N) { this.act.fill(1); this.compact(); }
    const F = eng.S.flare * velocity * (this.dscuti ? 0.3 : 1);
    if (!(F > 0)) return;
    const x = 2 * this.seed() - 1, s = Math.sqrt(1 - x * x), phi0 = 2 * Math.PI * this.seed();
    for (let i = 0; i < this.N; i++) {
      const l = this.L[i], m = this.M[i], a = Math.abs(m);
      const P = l === 0 ? 1 : l === 1 ? (a ? s : x) : l === 2 ? (a === 0 ? 0.5 * (3 * x * x - 1) : a === 1 ? 3 * x * s : 3 * s * s)
        : (a === 0 ? 0.5 * x * (5 * x * x - 3) : a === 1 ? 1.5 * (5 * x * x - 1) * s : a === 2 ? 15 * x * s * s : 15 * s * s * s);
      const ang = m > 0 ? Math.SQRT2 * Math.cos(m * phi0) : m < 0 ? Math.SQRT2 * Math.sin(a * phi0) : 1;
      const norm = Math.sqrt((2 * l + 1) * FACT[l - a] / FACT[l + a]);
      const size = this.dscuti ? F * this.AS[i] : F * Math.sqrt(this.P[i] * (1 - this.Z[i]));
      this.addC(i, 0, -size * norm * P * ang);
    }
  }

  render(L, R, n, eng) {
    const N = this.N, buf = this.buf, glide = 1 - Math.exp(-n / (GLIDE * eng.fs));
    const driving = this.held || eng.sustain;
    if (eng.freqMoved) { this.freqs(eng); this.coeffs(eng); }
    else if (eng.dampMoved) this.coeffs(eng);
    if (eng.inclMoved) this.gains(eng);
    if (this.dscuti) this.landau(eng, n, driving);
    else if (driving) {
      // the convection: one random push per mode per block, a force impulse (it changes the mode's velocity,
      // not its displacement, so the sound stays continuous), of variance p·D²·(1 − ρ^2n)
      const D = eng.S.driving * this.vel * this.pressure, tab = eng.gauss;
      let st = eng.rs;
      for (let q = 0; q < this.nAct; q++) {
        const i = this.idx[q], sd = D * Math.sqrt(this.P[i] * (1 - Math.exp(-2 * this.ETA[i] * n / eng.fs)));
        st ^= st << 13; st ^= st >>> 17; st ^= st << 5;
        this.Y2[i] += (sd * tab[st & (GN - 1)] * this.S[i]) / this.RHO[i];
      }
      eng.rs = st;
    }
    buf.fill(0, 0, n);
    ring(this.A1, this.A2, this.Y1, this.Y2, this.G, this.GT, this.idx, this.nAct, buf, n, glide);
    if (this.nAct < N) for (let i = 0; i < N; i++) if (!this.act[i]) this.G[i] += glide * (this.GT[i] - this.G[i]);
    const gl = this.gl, gr = this.gr, fadeStep = this.fading ? 1 / (FADE * eng.fs) : 0;
    let fade = this.fade;
    for (let s = 0; s < n; s++) {
      const y = buf[s] * fade;
      if (fadeStep) { fade -= fadeStep; if (fade < 0) fade = 0; }
      L[s] += gl * y; R[s] += gr * y;
    }
    this.fade = fade;
    if (this.fading && fade <= 0) this.dead = true;
    this.age += n / eng.fs;
    // every block: the power of each mode (for the views, pruning and the voice's level)
    let sum = 0;
    const tab = eng.gtab;
    for (let q = 0; q < this.nAct; q++) {
      const i = this.idx[q], a2 = this.amp2(i), g2 = tab[this.L[i] * 7 + this.M[i] + 3] ** 2;
      this.AMP[i] = a2; sum += g2 * a2;
    }
    this.level = 0.5 * sum;
    if (this.level > this.peak) this.peak = this.level;
    if (!driving && !this.dscuti && this.age > YOUNG) {
      let changed = false;
      const floor = PRUNE * this.peak;
      for (let q = 0; q < this.nAct; q++) {
        const i = this.idx[q];
        if (VIS[this.L[i]] * this.AMP[i] < floor) { this.act[i] = 0; this.AMP[i] = 0; this.Y1[i] = 0; this.Y2[i] = 0; changed = true; }
      }
      if (changed) this.compact();
      if (!this.nAct || this.level < DEAD * this.peak) this.dead = true;
    }
    if (this.dscuti && !driving && this.level < DEAD * this.peak && this.age > YOUNG) this.dead = true;
    if (!(sum < 1e9)) { this.dead = true; eng.post?.({ type: 'error', message: `star ${this.key}: numerical failure` }); }
  }

  // δ Scuti: dA/dt = (γ − βA²)A while the key is down (γ = 1/growth time, β = γ/A_sat²); on release
  // the modes damp at the release rate. One step per block on the recursion's own decay.
  landau(eng, n, driving) {
    const gam = 1 / eng.S.growth, rel = 2 * eng.S.damping, fs = eng.fs;
    for (let q = 0; q < this.nAct; q++) {
      const i = this.idx[q], as = this.AS[i];
      let lam;
      if (driving) { const at = as * this.vel * this.pressure * eng.S.driving, a2 = this.amp2(i); lam = gam * (1 - a2 / (at * at + 1e-30)); }
      else lam = -rel;
      lam = Math.max(-200, Math.min(200, lam));
      const r = Math.exp(lam / fs), old = this.RHO[i] || 1;
      // keep C unchanged under the new ρ: y2 holds Re(C e^(−iω))/ρ
      this.Y2[i] *= old / r;
      this.RHO[i] = r; this.A1[i] = 2 * r * this.C[i]; this.A2[i] = r * r;
    }
  }
}
const FACT = [1, 1, 2, 6, 24, 120, 720];
const TAUr = (r) => 2 * Math.PI * r();

// ---- the hot loop: free ringing with output gains ramping over the block, four modes at a time ----
function ring(A1, A2, Y1, Y2, G, GT, idx, na, buf, n, glide) {
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
      buf[s] += g0 * x0 + g1 * x1 + g2 * x2 + g3 * x3;
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
    for (let s = 0; s < n; s++) { const y = a1 * y1 - a2 * y2; buf[s] += g * y; y2 = y1; y1 = y; g += dg; }
    Y1[r] = y1; Y2[r] = y2; G[r] = g;
  }
}

export class StarEngine {
  constructor(fs) {
    this.fs = fs; this.P = null; this.S = null; this.T = null;
    this.voices = []; this.byKey = new Map(); this.sustain = false; this.cache = new Map();
    this.presses = 0; this.focus = null; this.postT = 0;
    this.ampMsg = { type: 'amps', key: 0, id: '', amp: null, drive: 0, held: false }; // reused: nothing is allocated in process()
    this.freqMoved = this.dampMoved = this.inclMoved = false;
    this.gtab = new Float64Array(28); // √(V_l² E_lm(i)) at [l·7 + m + 3]
    // Gaussian numbers (Box–Muller from a seeded generator), and the state of the index generator
    const r = rng(20240611);
    this.gauss = new Float64Array(GN);
    for (let i = 0; i < GN; i += 2) { const a = Math.sqrt(-2 * Math.log(1 - r())), b = 2 * Math.PI * r(); this.gauss[i] = a * Math.cos(b); this.gauss[i + 1] = a * Math.sin(b); }
    let m = 0; for (const g of this.gauss) m += g * g; m = Math.sqrt(m / GN); for (let i = 0; i < GN; i++) this.gauss[i] /= m; // unit variance exactly
    this.rs = 0x2545f491;
  }

  setParams(P) {
    const first = !this.P;
    this.P = P;
    this.T = { spin: P.spin, core: P.coreRatio, incl: P.incl, damping: P.damping, driving: P.driving, flare: P.flare, growth: P.growth };
    if (first) { this.S = { ...this.T }; this.table(); this.warmUp(); }
  }
  table() {
    const inc = (this.S.incl * Math.PI) / 180;
    for (let l = 0; l <= 3; l++) for (let m = -l; m <= l; m++) this.gtab[l * 7 + m + 3] = Math.sqrt(VIS[l] * Elm(l, m, inc));
  }
  setSustain(on) { this.sustain = !!on; }

  // Before the first note: play a small made-up star through every path (driving, the flare, release,
  // the pedal, gliding knobs, pruning, fading), so the JIT has compiled them before real notes.
  warmUp() {
    const mk = (fam) => {
      const N = 24, md = { f: new Float64Array(N), l: new Int8Array(N), m: new Int8Array(N), zeta: new Float64Array(N), p: new Float64Array(N), gamma: new Float64Array(N), wEnv: new Float64Array(N), wCore: new Float64Array(N), asat: new Float64Array(N), mult: new Int32Array(N) };
      for (let i = 0; i < N; i++) { md.f[i] = 300 + 13 * i; md.l[i] = i % 2; md.m[i] = 0; md.p[i] = 1 / N; md.gamma[i] = 0.5; md.wEnv[i] = 1; md.asat[i] = 0.2; }
      return { id: `warm|${fam}`, key: 60, K: 5e5, family: fam, N, modes: md };
    };
    const bL = new Float32Array(128), bR = new Float32Array(128), post = this.post, T = this.T, keep = { ...T };
    this.post = null;
    for (let i = 0; i < 300; i++) {
      if (i === 0) this.start(60, 0.8, mk('track'));
      if (i === 20) this.start(62, 0.8, mk('dscuti'));
      if (i === 60) { this.noteOff(60); this.noteOff(62); }
      if (i === 70) this.setSustain(true);
      if (i === 80) { this.setSustain(false); T.spin = keep.spin + 1; T.damping = keep.damping * 1.5; T.incl = (keep.incl + 30) % 90; T.driving = keep.driving + 0.1; }
      if (i === 120) Object.assign(T, keep);
      if (i === 200) this.allNotesOff();
      this.process(bL, bR, 128);
    }
    this.voices.length = 0; this.byKey.clear(); this.focus = null; this.sustain = false;
    Object.assign(this.S, keep); Object.assign(T, keep); this.table(); this.post = post; this.presses = 0;
  }

  // A key's star: sent by the page with the note (data), or built here (in Node; the page builds
  // them in spare moments, since a red giant's mixed modes take some milliseconds).
  starOf(key, data) {
    const id = `${starId(this.P)}|${key}`;
    if (data && data.id === id && data.N > 0) return data;
    let c = this.cache.get(id);
    if (!c) { c = keyStar(key, this.P); if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value); this.cache.set(id, c); }
    return c;
  }
  noteOn(key, velocity, data) {
    if (!this.P || !(key >= KEY_LO && key <= KEY_HI) || !(velocity > 0)) return;
    this.start(key, velocity, this.starOf(key, data));
  }
  start(key, velocity, data) {
    let v = this.byKey.get(key);
    if (!v || v.dead || v.fading || v.id !== data.id) {
      if (v && !v.dead) v.fading = true; // another star now sits on this key: the old one fades
      v = new Voice(this, key, data);
      this.voices.push(v); this.byKey.set(key, v);
    }
    v.press(this, velocity);
    this.focus = v; this.postT = POST_EVERY; // post its amplitudes soon
    let live = 0;
    for (const u of this.voices) if (!u.fading) live++;
    if (live > MAX_VOICES) {
      let victim = null, score = Infinity;
      for (const u of this.voices) {
        if (u === v || u.fading || u.age < YOUNG) continue;
        const s = u.level * (u.held ? 4 : 1); // released stars go first
        if (s < score) { score = s; victim = u; }
      }
      if (victim) victim.fading = true;
    }
  }
  noteOff(key) { const v = this.byKey.get(key); if (v) v.held = false; }
  allNotesOff() { for (const v of this.voices) { v.fading = true; v.held = false; } }
  voiceCount() { return this.voices.length; }
  handle(m) {
    if (m.type === 'pressure') { // aftertouch: the convection drives harder, up to twice the amplitude
      const p = 1 + Math.max(0, Math.min(1, m.value));
      for (const v of this.voices) if (m.key == null || v.key === m.key) v.pressure = p;
    }
  }

  process(L, R, n) {
    L.fill(0, 0, n); R.fill(0, 0, n);
    if (!this.P) return;
    const S = this.S, T = this.T, a = 1 - Math.exp(-n / (GLIDE * this.fs));
    let freq = false, damp = false, incl = false;
    for (const id in T) {
      if (S[id] === T[id]) continue;
      S[id] += a * (T[id] - S[id]);
      if (Math.abs(T[id] - S[id]) < 1e-6 * (Math.abs(T[id]) + 1e-6)) S[id] = T[id];
      if (id === 'spin' || id === 'core') freq = true; else if (id === 'damping') damp = true; else if (id === 'incl') incl = true;
    }
    if (incl) this.table();
    this.freqMoved = freq; this.dampMoved = damp; this.inclMoved = incl;
    for (const v of this.voices) v.render(L, R, n, this);
    this.freqMoved = this.dampMoved = this.inclMoved = false;
    let j = 0;
    for (const v of this.voices) {
      if (v.dead) { if (this.byKey.get(v.key) === v) this.byKey.delete(v.key); if (this.focus === v) this.focus = null; } else this.voices[j++] = v;
    }
    this.voices.length = j;
    // the focus star's mode amplitudes, observed (√(V_l² E_lm)·|C|), for the échelle, spectrum and sphere
    this.postT += n / this.fs;
    if (this.post && this.focus && this.postT >= POST_EVERY) {
      this.postT = 0;
      const v = this.focus, out = v.post, tab = this.gtab;
      for (let i = 0; i < v.N; i++) out[i] = v.act[i] ? tab[v.L[i] * 7 + v.M[i] + 3] * Math.sqrt(v.AMP[i]) : 0;
      const m = this.ampMsg; m.key = v.key; m.id = v.id; m.amp = out; m.drive = S.driving * v.vel * v.pressure; m.held = v.held || this.sustain;
      this.post(m);
    }
  }
}

globalThis.StarEngine = StarEngine;
