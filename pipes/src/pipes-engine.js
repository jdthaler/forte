// pipes-engine.js — the real-time pipe organ. Runs in the AudioWorklet (through shared/worklet.js)
// and in Node (tests, renders, the tuning tool).
//
//   reservoir ─▶ trunk ─▶ chest P_c ─▶ pallet ─▶ groove ─▶ slider ─▶ foot p ─▶ jet U_j = √(2p/ρ)
//                                                                              │
//        modes of the pipe ◀── Δp = (ρδ_d/S_m) dQ_in/dt − ½ρ(v/α)²sgn v ◀── Q_in = bHU_j(1 + tanh((η − y₀)/b))
//              │                                                                 ▲
//              └── mouth flow v ── delay τ = W/c_pU_j ── low-pass ── η = (hA/U_j)·v(t − τ) + turbulence
//
// Per sample, each sounding pipe reads the flow through its mouth a jet transit earlier from a
// delay line (Catmull–Rom), passes it through the jet's low-pass, splits the jet on the labium
// (tanh), and drives its modes with the time derivative of the flow it puts into the pipe plus the
// vortex-shedding loss. Each mode advances exactly over the step under that pressure, held. Pipes
// that sound at 2 kHz or more run at twice the sample rate, brought down by a 63-tap half-band
// FIR; the others at the sample rate. Every pipe's flue draws on the chest, whose pressure the
// wind system integrates once per sample.
//
// One voice per key holds its six pipes (Principal 8′, Octave 4′, Gedackt 8′, Mixture ×3); the
// stops' sliders open and shut the pipes' feet over 40 ms, even under held keys. Pressing a
// sounding key again reopens the same pallet. Beyond 20 keys the quietest released key fades out
// over 30 ms, never one under 50 ms old.

import { TAU } from '../../shared/dsp.js';
import {
  AIR, CP, PHI_C, ALPHA_VC, RANKS, engaged, pipeFreq, pipeModel, PALLET, palletTime, closeTime,
  windSystem, WIND, chestPan,
} from './pipes-model.js';
import { TUNING } from './tuning-table.js';

const OUT = 0.08;             // output per m³/s² of the mouths' volume acceleration: ρ/4πr, the sound pressure (Pa) 1.2 m from a monopole
const MAX_KEYS = 20;          // keys sounding at once
const FADE = 0.03;            // s: a stolen key fades out over this
const YOUNG = 0.05;           // s: a key this young is never stolen
const SLIDER = 0.04;          // s: a stop's slider travels over this
const GLIDE = 0.02;           // s: live knobs (pressure, tremulant) glide
const F_OS = 2000;            // Hz: pipes from here up run at twice the sample rate (below it, at 1×, aliased lines stay ~60 dB down)
const U_BUF = 2;              // m/s: delay lines hold a slower jet's transit than this (2.4 Pa) only up to their length
const NOISE_N = 16384;        // the seeded table of jet turbulence
const NOISE = 2e-3;           // turbulence: velocity fluctuations at the flue of NOISE × U_j × the knob (uniform, ±½), smeared by the jet like the acoustic ones
const POST_BLOCKS = 6;
const TRACE = 256;            // points in the live trace of the focused pipe
const RANK_ORDER = [0, 2, 1, 3, 4, 5]; // the pipe the views show: the first drawn of P8, G8, O4, mixture
export const OS_FREQ = F_OS;

// xorshift32: seeded, so renders repeat exactly
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 - 0.5; }; }

// Half-band low-pass for the 2× decimation (Kaiser-windowed sinc, cut-off at the output Nyquist).
function halfband(N = 63, beta = 8) {
  const h = new Float64Array(N), M = (N - 1) / 2;
  const I0 = (x) => { let s = 1, t = 1; for (let k = 1; k < 40; k++) { t *= (x / (2 * k)) ** 2; s += t; } return s; };
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const n = i - M, sinc = n === 0 ? 0.5 : Math.sin((Math.PI * n) / 2) / (Math.PI * n);
    h[i] = sinc * (I0(beta * Math.sqrt(1 - (n / M) ** 2)) / I0(beta)); sum += h[i];
  }
  for (let i = 0; i < N; i++) h[i] /= sum;
  return h;
}

// One pipe: its constants and state in typed arrays, so the hot loop reads plain doubles.
// Modes: per mode 6 constants (exact transition over one step for x'' + 2σx' + ω²x = F/M, F held)
// and 2 states (volume displacement x, volume flow v).
class Pipe {
  constructor(eng, R, rank) {
    this.R = R; this.rank = rank; this.stopped = R.stopped;
    this.os = R.f >= eng.fOS ? 2 : 1;
    const fsI = eng.fs * this.os, h = 1 / fsI, m = R.modes, n = m.length;
    this.fsI = fsI; this.h = h; this.n = n;
    const c = (this.c = new Float64Array(6 * n));
    this.x = new Float64Array(n); this.v = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const w = m[k].om, z = m[k].sigma / w, wd = w * Math.sqrt(Math.max(1e-12, 1 - z * z)), e = Math.exp(-m[k].sigma * h);
      const co = Math.cos(wd * h), si = Math.sin(wd * h);
      const p11 = e * (co + ((z * w) / wd) * si), p12 = (e * si) / wd, p21 = (-e * w * w * si) / wd, p22 = e * (co - ((z * w) / wd) * si);
      const kk = R.M * w * w;
      c[6 * k] = p11; c[6 * k + 1] = p12; c[6 * k + 2] = p21; c[6 * k + 3] = p22; c[6 * k + 4] = (1 - p11) / kk; c[6 * k + 5] = -p21 / kk;
    }
    const g = R.geo;
    let cvs = 0;
    for (let k = 0; k < n; k++) cvs += c[6 * k + 5];
    this.cv = cvs / g.Sm;                       // the mouth speed one step of a held pressure adds, per pascal
    // the jet
    this.W = g.W; this.b = g.b; this.H = g.H; this.y0 = g.y0; this.ib = 1 / g.b;
    this.bH = g.b * g.H;                         // jet flow into the pipe = bHU_j(1 + tanh)
    this.hA = g.h * R.A;                         // η = (hA/U_j)·v
    this.Ks = (AIR.rho * g.dd) / g.Sm;           // Δp_src = Ks dQ_in/dt
    this.Kl = AIR.rho / (2 * ALPHA_VC * ALPHA_VC); // Δp_los = −Kl v|v|
    this.iSm = 1 / g.Sm;
    this.tauK = (g.W / CP) * fsI;               // τ in samples = tauK / U_j
    this.kxc = PHI_C / this.tauK;               // the jet low-pass's ω_c·h = φ_c/τ = kxc·U_j
    this.flue = g.h * g.H;                      // the flue's area: the wind it draws is hH·U_j
    let N = 64;
    while (N < Math.min(8192, this.tauK / U_BUF + 8)) N <<= 1;
    this.buf = new Float64Array(N); this.mask = N - 1; this.maxD = N - 4; this.w = 0;
    this.noise = eng.noise; this.ni = Math.floor(NOISE_N * (0.5 + eng.rand())) % NOISE_N;
    // state
    this.lp = 0; this.qin = 0; this.vm = 0; this.Q = 0; this.dp = 0; this.eta = 0;
    this.out = 0; this.asleep = true; this.foot = 0; this.Uj = 0;
    // the live pitch (tests, tools): upward zero crossings of the mouth flow through its running mean
    this.track = !!eng.track; this.dsp = 0; this.mean = 0; this.prev = 0; this.t = 0; this.last = -1; this.per = 0; this.nx = 0;
    this.kMean = 1 - Math.exp(-h * 2 * Math.PI * Math.min(20, R.f / 8));
  }
  freq() { return this.per > 0 ? this.fsI / this.per : 0; }
  reset() {
    this.x.fill(0); this.v.fill(0); this.buf.fill(0);
    this.lp = 0; this.qin = 0; this.vm = 0; this.Q = 0; this.dp = 0; this.eta = 0; this.out = 0;
  }
  energy() { // a measure of the modes' motion (volume flow², m⁶/s²)
    let e = 0;
    for (let k = 0; k < this.n; k++) e += this.v[k] * this.v[k] + (this.R.modes[k].om * this.x[k]) ** 2;
    return e;
  }
  // One step at this pipe's own rate with jet speed Uj (m/s), 1/Uj, and noise scaled by nz. Leaves
  // the radiated d/dt(mouth flow) in this.out.
  step(Uj, iU, nz) {
    const buf = this.buf, mask = this.mask;
    let qin = 0, eta = 0, lp = this.lp;
    if (Uj > 0) { // as the wind dies the jet's flow goes smoothly to nothing (bHU_j → 0)
      const tau = this.tauK * iU;
      let d = tau - 1; // one sample of the loop is in the held force and the backward difference
      if (d < 1) d = 1; else if (d > this.maxD) d = this.maxD;
      const i = d | 0, f = d - i, p = this.w - 1 - i;
      const x0 = buf[(p + 1) & mask], x1 = buf[p & mask], x2 = buf[(p - 1) & mask], x3 = buf[(p - 2) & mask];
      const vd = (((0.5 * (x3 - x0) + 1.5 * (x1 - x2)) * f + (x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3)) * f + 0.5 * (x2 - x0)) * f + x1;
      const ni = this.ni;
      this.ni = ni + 1 === NOISE_N ? 0 : ni + 1;
      const xc = this.kxc * Uj; // the jet's low-pass, corner ω_c τ = φ_c (backward Euler), turbulence included
      lp += (xc / (1 + xc)) * (vd + nz * Uj * this.noise[ni] - lp);
      eta = this.hA * iU * lp;
      let u = (eta - this.y0) * this.ib;
      u = u > 3 ? 1 : u < -3 ? -1 : (u * (27 + u * u)) / (27 + 9 * u * u); // tanh, Padé (C¹ at ±3)
      qin = this.bH * Uj * (1 + u);
    } else lp *= 0.99;
    this.lp = lp; this.eta = eta;
    // the modes' free motion over the step, then the pressure: the jet's drive Ks·dQ_in/dt, and the
    // vortex-shedding loss −Kl·v|v| at the new mouth speed v = v_free + cv·F (implicit: a quadratic)
    const c = this.c, X = this.x, V = this.v, n = this.n;
    let vf = 0;
    for (let k = 0, j = 0; k < n; k++, j += 6) {
      const x = X[k], v = V[k];
      X[k] = c[j] * x + c[j + 1] * v;
      const nv = c[j + 2] * x + c[j + 3] * v;
      V[k] = nv; vf += nv;
    }
    const Fs = this.Ks * (qin - this.qin) * this.fsI, cv = this.cv, r = (vf * this.iSm) + cv * Fs, ar = r < 0 ? -r : r;
    const kc = cv * this.Kl, vn = ar > 0 ? (2 * ar) / (1 + Math.sqrt(1 + 4 * kc * ar)) : 0, v2 = r < 0 ? -vn : vn;
    const F = Fs - this.Kl * v2 * vn;
    this.qin = qin; this.dp = F;
    let Q = 0;
    for (let k = 0, j = 0; k < n; k++, j += 6) { X[k] += c[j + 4] * F; const nv = V[k] + c[j + 5] * F; V[k] = nv; Q += nv; }
    this.vm = v2;
    buf[this.w] = v2; this.w = (this.w + 1) & mask;
    this.out = (Q - this.Q) * this.fsI; this.Q = Q;
    if (this.track) { // on the flow's running integral (the air's displacement), which the upper modes disturb less
      const dsp = (this.dsp = this.dsp * (1 - this.kMean) + v2), m = (this.mean += this.kMean * (dsp - this.mean)), y = dsp - m, py = this.prev, t = ++this.t;
      if (py < 0 && y >= 0) {
        const tc = t - 1 + py / (py - y);
        if (this.last >= 0) { const T1 = tc - this.last; this.per = this.per > 0 ? this.per + 0.3 * (T1 - this.per) : T1; }
        this.last = tc; this.nx++;
      }
      this.prev = y;
    }
  }
}

// A key's hot numbers.
class Voice {
  constructor(eng, key, models, version) {
    this.key = key; this.version = version;
    this.pipes = models.map((R, r) => new Pipe(eng, R, r));
    this.slider = new Float64Array(RANKS.length); this.open = new Float64Array(RANKS.length); // slider travel, and the foot's opening
    const on = engaged(eng.P, eng.on);
    for (let r = 0; r < RANKS.length; r++) this.slider[r] = this.open[r] = on[r] ? 1 : 0;
    let flues = 0;
    for (const p of this.pipes) flues += p.flue;
    this.kPal = 1 / (PALLET.cd * PALLET.area * flues); // k = Σ s·hH × kPal
    this.a = 0; this.aTarget = 0; this.aRate = 0; this.fade = 1; this.env = 0;
    this.down = false; this.fading = false; this.dead = false; this.age = 0; this.pg = 0;
    const pan = chestPan(key), ang = ((pan * 0.85 + 1) * Math.PI) / 4;
    this.gl = Math.cos(ang); this.gr = Math.sin(ang);
    this.list = new Array(RANKS.length).fill(null); this.nList = 0;
  }
}

export class PipeEngine {
  constructor(fs, seed = 1, opts = {}) {
    this.fOS = opts.fOS ?? F_OS;
    this.track = !!opts.track; // follow every pipe's pitch (tests, tools)
    this.fs = fs; this.P = null; this.voices = []; this.byKey = new Map(); this.models = new Map();
    this.version = 0; this.designKey = '';
    this.rand = rng(seed);
    this.noise = new Float64Array(NOISE_N);
    for (let i = 0; i < NOISE_N; i++) this.noise[i] = this.rand();
    this.h = 1 / fs;
    // wind
    this.Pset = 0; this.Pr = 0; this.Qt = 0; this.Pc = 0; this.Qdraw = 0; this.started = false;
    this.trem = 0; this.tremPh = 0; this.Qtrem = 0;
    this.wsys = windSystem(0.3); this.stiff = -1;
    // decimator
    this.fir = halfband(); this.hist = [new Float64Array(2 * this.fir.length), new Float64Array(2 * this.fir.length)]; this.hpos = 0;
    this.hiL = new Float64Array(4096); this.hiR = new Float64Array(4096); this.loL = new Float64Array(2048); this.loR = new Float64Array(2048);
    this.focus = null; this.blocks = 0;
    this.on = new Array(RANKS.length).fill(false);
    this.msg = {
      type: 'pipe', key: 0, rank: 0, Pc: 0, Pr: 0, Pset: 0, Q: 0, pipes: 0, fs,
      v: new Float64Array(TRACE), dp: new Float64Array(TRACE), eta: new Float64Array(TRACE), qin: new Float64Array(TRACE), n: 0, dt: 0,
      Uj: 0, foot: 0, f: 0, W: 0, b: 0, h: 0, H: 0, D: 0, A: 0, y0: 0, theta: 0, tau: 0,
    };
    this.trace = { v: new Float64Array(TRACE * 8), dp: new Float64Array(TRACE * 8), eta: new Float64Array(TRACE * 8), qin: new Float64Array(TRACE * 8), w: 0, dec: 1, cnt: 0 };
    this.Qsum = 0; this.Qcnt = 0;
  }

  setParams(P) {
    this.P = P;
    const dk = `${P.cutup}|${P.gain}|${P.offset}`;
    if (dk !== this.designKey) { this.designKey = dk; this.version++; if (this.models.size > 1024) this.models.clear(); }
    if (!this.started) { this.Pset = P.pressure; this.Pr = P.pressure; this.Pc = P.pressure; this.nz = NOISE * P.noise; this.started = true; }
    if (P.wind !== this.stiff) { this.stiff = P.wind; this.wsys = windSystem(P.wind); }
  }

  modelsFor(key) {
    const P = this.P, out = [];
    for (let r = 0; r < RANKS.length; r++) {
      const f = pipeFreq(key, r), stopped = RANKS[r].stopped;
      const id = `${f.toFixed(4)}|${stopped}|${this.version}`;
      let R = this.models.get(id);
      if (!R) { R = pipeModel(f, stopped, P, { tune: TUNING.lookup(f, stopped) }); this.models.set(id, R); }
      out.push(R);
    }
    return out;
  }

  noteOn(key, velocity = 0.7) {
    if (!this.P) return;
    let v = this.byKey.get(key);
    if (v && (v.dead || v.fading || v.version !== this.version)) { if (!v.dead) { v.fading = true; v.down = false; v.aTarget = 0; } v = null; }
    if (!v) {
      v = new Voice(this, key, this.modelsFor(key), this.version);
      this.voices.push(v); this.byKey.set(key, v);
      let live = 0;
      for (const u of this.voices) if (!u.fading && !u.dead) live++;
      if (live > MAX_KEYS) { // the quietest released key (never a young one) fades out
        let victim = null, score = Infinity;
        for (const u of this.voices) {
          if (u === v || u.fading || u.age < YOUNG) continue;
          const s = (u.down ? 1e6 : 0) + u.env;
          if (s < score) { score = s; victim = u; }
        }
        if (victim) victim.fading = true;
      }
    }
    v.down = true; v.aTarget = 1; v.aRate = 1 / (palletTime(velocity, this.P.rise) * this.fs);
    for (let r = 0; r < RANKS.length; r++) if (v.slider[r] > 0) v.pipes[r].asleep = false;
    this.focus = v;
  }

  noteOff(key, velocity) {
    const v = this.byKey.get(key);
    if (!v) return;
    v.down = false; v.aTarget = 0; v.aRate = 1 / (closeTime(velocity) * this.fs);
  }

  allNotesOff() { for (const v of this.voices) { v.fading = true; v.down = false; v.aTarget = 0; } }
  voiceCount() { let n = 0; for (const v of this.voices) for (const p of v.pipes) if (!p.asleep) n++; return n; }

  process(L, R, n) {
    L.fill(0, 0, n); R.fill(0, 0, n);
    if (!this.P) return;
    const P = this.P, h = this.h, hiL = this.hiL, hiR = this.hiR, rho = AIR.rho;
    const on = engaged(P, this.on), sStep = h / SLIDER, g = 1 - Math.exp(-h / GLIDE);
    const ws = this.wsys, kr = h / ws.Cr, kt = h / ws.Mt, kc = h / ws.Cc, cd2 = PALLET.cd * Math.sqrt(2 / rho);
    const tremOn = P.tremulant ? P.tremDepth : 0, tremW = TAU * P.tremRate * h, nzT = NOISE * P.noise;
    const vs = this.voices, fadeK = 1 - h / FADE;
    for (const v of vs) { // wake the pipes whose stop is drawn under a held key; list the pipes that are awake
      v.nList = 0;
      for (let r = 0; r < RANKS.length; r++) {
        if (on[r] && v.down) v.pipes[r].asleep = false;
        if (!v.pipes[r].asleep) v.list[v.nList++] = v.pipes[r];
        else v.slider[r] = v.open[r] = on[r] ? 1 : 0; // a silent pipe's slider is simply where its stop is
      }
    }
    let Pset = this.Pset, Pr = this.Pr, Qt = this.Qt, Pc = this.Pc, trem = this.trem, ph = this.tremPh, nz = this.nz;
    const Ptarget = P.pressure, f = this.focus && !this.focus.dead ? this.focus : null;
    const shown = f ? this.shownRank(f) : -1;
    const loL = this.loL, loR = this.loR;
    let Qdraw = this.Qdraw;
    for (let i = 0; i < n; i++) {
      Pset += g * (Ptarget - Pset); trem += g * (tremOn - trem); nz += g * (nzT - nz);
      // the wind: reservoir, trunk, chest (explicit, the draw from the last sample)
      const Qtr = trem > 1e-6 ? cd2 * WIND.tremArea * trem * 0.5 * (1 - Math.cos(ph)) * Math.sqrt(Pc > 0 ? Pc : 0) : 0;
      ph += tremW; if (ph > TAU) ph -= TAU;
      Pr += kr * (ws.Gr * (Pset - Pr) - Qt);
      Qt += kt * (Pr - Pc - ws.Rt * Qt);
      Pc += kc * (Qt + ws.Gs * (Pset - Pc) - Qdraw - Qtr);
      if (Pc < 0) Pc = 0;
      this.Qtrem = Qtr;
      let draw = 0, l1 = 0, r1 = 0, l2a = 0, l2b = 0, r2a = 0, r2b = 0;
      for (let k = 0; k < vs.length; k++) {
        const v = vs[k];
        if (v.dead) continue;
        let a = v.a;
        if (a !== v.aTarget) { a = v.aTarget > a ? Math.min(v.aTarget, a + v.aRate) : Math.max(v.aTarget, a - v.aRate); v.a = a; }
        // the groove: the pallet's flow equals the flues' (quasi-static)
        // the sliders move towards their stops; each opens its pipe's foot as a valve (smoothstep)
        let kk = 0;
        const list = v.list, nl = v.nList, sl = v.slider, so = v.open;
        for (let r = 0; r < nl; r++) {
          const q = list[r].rank, tgt = on[q] ? 1 : 0;
          let x = sl[q];
          if (x !== tgt) { x = tgt > x ? Math.min(1, x + sStep) : Math.max(0, x - sStep); sl[q] = x; so[q] = x * x * (3 - 2 * x); }
          kk += list[r].flue * so[q];
        }
        kk *= v.kPal;
        const pg = a > 0 ? (Pc * a * a) / (a * a + kk * kk) : 0;
        v.pg = pg;
        let s1 = 0, s2a = 0, s2b = 0;
        const Ug = pg > 0 ? Math.sqrt((2 * pg) / rho) : 0, iUg = Ug > 0 ? 1 / Ug : 0; // the jet speed with the slider open
        for (let r = 0; r < nl; r++) {
          const p = list[r], o = so[p.rank];
          let Uj = Ug, iU = iUg;
          if (o < 1) { Uj = o > 0 && Ug > 0 ? Ug * Math.sqrt(o) : 0; iU = Uj > 0 ? 1 / Uj : 0; }
          p.foot = pg * o; p.Uj = Uj;
          draw += p.flue * Uj;
          if (p.os === 2) { p.step(Uj, iU, nz); s2a += p.out; p.step(Uj, iU, nz); s2b += p.out; }
          else { p.step(Uj, iU, nz); s1 += p.out; }
        }
        const fade = v.fade;
        if (v.fading) v.fade = fade * fadeK;
        const gF = OUT * fade;
        s1 *= gF; s2a *= gF; s2b *= gF;
        l1 += v.gl * s1; r1 += v.gr * s1;
        l2a += v.gl * s2a; l2b += v.gl * s2b; r2a += v.gr * s2a; r2b += v.gr * s2b;
        const as = Math.abs(s1 + s2a);
        v.env = as > v.env ? as : v.env * 0.9998;
      }
      Qdraw = draw;
      loL[i] = l1; loR[i] = r1;
      hiL[2 * i] = l2a; hiL[2 * i + 1] = l2b; hiR[2 * i] = r2a; hiR[2 * i + 1] = r2b;
      this.Qsum += draw; this.Qcnt++;
      if (f && shown >= 0) this.record(f.pipes[shown]);
    }
    this.Pset = Pset; this.Pr = Pr; this.Qt = Qt; this.Pc = Pc; this.Qdraw = Qdraw; this.trem = trem; this.tremPh = ph; this.nz = nz;
    this.decimate(L, R, n);
    for (let i = 0; i < n; i++) { L[i] += loL[i]; R[i] += loR[i]; }
    // retire: pallet shut, every pipe quiet
    for (const v of vs) {
      v.age += n / this.fs;
      if (v.fading && v.fade < 1e-4) { v.dead = true; continue; }
      let awake = 0;
      for (const p of v.pipes) {
        if (p.asleep) continue;
        if ((v.a === 0 || v.slider[p.rank] === 0) && p.foot === 0 && p.energy() < 1e-14) { p.asleep = true; p.reset(); } else awake++;
      }
      if (!awake && !v.down && v.a === 0) v.dead = true;
    }
    let j = 0;
    for (const v of vs) { if (v.dead) { if (this.byKey.get(v.key) === v) this.byKey.delete(v.key); } else vs[j++] = v; }
    vs.length = j;
    if (this.focus && this.focus.dead) this.focus = null;
    if (this.post && ++this.blocks >= POST_BLOCKS) { this.blocks = 0; this.postView(); }
  }

  // 2× → 1×: the half-band FIR, whose every other tap (but the centre) is zero.
  decimate(L, R, n) {
    const h = this.fir, M = h.length, c = (M - 1) / 2, hl = this.hist[0], hr = this.hist[1], hiL = this.hiL, hiR = this.hiR;
    let p = this.hpos;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 2; k++) { const xl = hiL[2 * i + k], xr = hiR[2 * i + k]; hl[p] = hl[p + M] = xl; hr[p] = hr[p + M] = xr; p = p + 1 === M ? 0 : p + 1; }
      let sl = h[c] * hl[p + M - 1 - c], sr = h[c] * hr[p + M - 1 - c];
      for (let t = 0; t < M; t += 2) { const q = p + M - 1 - t; sl += h[t] * hl[q]; sr += h[t] * hr[q]; }
      L[i] = sl; R[i] = sr;
    }
    this.hpos = p;
  }

  shownRank(v) {
    for (const r of RANK_ORDER) if (v.slider[r] > 0 && !v.pipes[r].asleep) return r;
    for (const r of RANK_ORDER) if (!v.pipes[r].asleep) return r;
    return 0;
  }
  record(p) {
    const tr = this.trace;
    if (++tr.cnt < tr.dec) return;
    tr.cnt = 0;
    const w = tr.w;
    tr.v[w] = p.vm; tr.dp[w] = p.dp; tr.eta[w] = p.eta; tr.qin[w] = p.qin;
    tr.w = w + 1 === tr.v.length ? 0 : w + 1;
  }
  postView() {
    const m = this.msg, v = this.focus, tr = this.trace;
    m.Pc = this.Pc; m.Pr = this.Pr; m.Pset = this.Pset; m.Q = this.Qcnt ? this.Qsum / this.Qcnt : this.Qdraw; this.Qsum = 0; this.Qcnt = 0;
    m.pipes = this.voiceCount(); m.trem = this.Qtrem;
    if (!v) { m.key = 0; m.n = 0; this.post(m); return; }
    const r = this.shownRank(v), p = v.pipes[r], R = p.R, g = R.geo;
    m.key = v.key; m.rank = r; m.f = R.f; m.W = g.W; m.b = g.b; m.h = g.h; m.H = g.H; m.D = g.D; m.A = R.A; m.y0 = g.y0;
    m.Uj = p.Uj; m.foot = p.foot; m.theta = p.Uj / (R.f * g.W); m.tau = p.Uj > 0 ? g.W / (CP * p.Uj) : 0;
    // the trace: about 2.5 periods at TRACE points, decimated from the pipe's rate (×1 or ×2 per sample)
    const per = this.fs / R.f, dec = Math.max(1, Math.round((2.5 * per) / TRACE));
    if (dec !== tr.dec) { tr.dec = dec; tr.cnt = 0; }
    const N = tr.v.length;
    for (let i = 0; i < TRACE; i++) { const q = (tr.w - TRACE + i + N) % N; m.v[i] = tr.v[q]; m.dp[i] = tr.dp[q]; m.eta[i] = tr.eta[q]; m.qin[i] = tr.qin[q]; }
    m.n = TRACE; m.dt = dec / this.fs;
    this.post(m);
  }
}

globalThis.PipeEngine = PipeEngine;
