// harmonium-engine.js — the real-time free-reed organ. Runs in the AudioWorklet
// (through shared/worklet.js) and in Node (tests, renders, the tuning tool).
//
//   bellows → reservoir P ─┬─▶ key's pallet ─▶ throat M_a ─▶ cell p_c ─▶ gap A(y) ─▶ jet ─▶ sound ∝ dU_out/dt
//                          │                                   ▲            ▲
//                          │                       reed modes ─┴─ Δp·S ─────┘  (all solved together, implicitly)
//                          └─ every reed draws on P (it sags with big chords)
//
// Reeds that sound at 440 Hz or more are integrated at twice the sample rate (the sum is brought
// down by a 63-tap half-band FIR); the rest at the sample rate. Per step, each reed's two modes
// advance exactly under the mean of the old and new force (held over the step, with the air's
// drag on the tongue), and the jet speed x' through the gap is found by Newton so that the
// cell's air balance closes, the air integrated by BDF2 (writing ẑ = (4z − z⁻)/3):
//   1.5C (p_c' − p̂_c)/h = U_in' − U_g' − Σ Sₙvₙ',
//   p_c' − p_d = ½ρx'|x'| + εx' + 1.5ρℓ_j (x' − x̂)/h            (the jet, with its air's mass),
//   1.5M_a (U_in' − Û_in)/h = a (P − p_c') − K U_in'|U_in'| / a   (the throat: a quadratic),
//   U_g' = c_d A(y') x',   y' = Σ qₙ'(x'),
// so a tiny gap, a slammed pallet or an extreme pressure cannot make it blow up.
//
// One voice per key, holding a reed for every rank (16′, 8′, the musette's two 8′s, 4′);
// the stops open and close the ranks' mutes over 20 ms. Pressing a sounding key again
// reopens the same pallet. Beyond 16 keys the quietest released key fades out over 30 ms,
// never one under 50 ms old.

import { keyPan } from '../../shared/dsp.js';
import {
  AIR, CD, EPS_V, RANKS, engaged, rankFreq, reedModel, cassotto, WIND, windTau, pumpShape,
  palletOpen, palletClose, percussionSpeed, modeShape,
} from './harmonium-model.js';

const OUT = 0.02;             // output units per m³/s² of volume acceleration (p = ρ/4πr · dU/dt is 0.02 Pa per m³/s² at r = 4.8 m)
const MAX_KEYS = 16;          // keys sounding at once
const FADE = 0.03;            // s: a stolen key fades out over this
const YOUNG = 0.05;           // s: a key this young is never stolen
const MUTE = 0.02;            // s: a stop's mutes open or close over this
const GLIDE = 0.02;           // s: live knobs (pressure target, aftertouch, cassotto) glide
const NOISE = 0.004;          // turbulence: a random pressure on the reed, uniform within ±NOISE/2 of Δp
const POST_BLOCKS = 6;
const TRACE = 256;            // points in the live trace of the focused reed
const ENV = 64;               // the focused key's rms per block, kept for the posts
const MAX_INNER = 10;         // Newton iterations per step (1 usually)
const F_OS = 440;             // Hz: reeds from here up are integrated at twice the sample rate (below it, at 1×, the worst aliased line stays under −49 dB)
const NOISE_N = 8192;         // a seeded table of turbulence, read by each reed from its own offset

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

// A reed's constants (K_…) and state (S_…), in typed arrays so that the hot loop reads and
// writes plain doubles.
const K_A11 = 0, K_A12 = 1, K_A21 = 2, K_A22 = 3, K_B11 = 4, K_B12 = 5, K_B21 = 6, K_B22 = 7;
const K_GQ1 = 8, K_GV1 = 9, K_GQ2 = 10, K_GV2 = 11, K_S1 = 12, K_S2 = 13, K_R1 = 14, K_DVS = 15;
const K_RLH = 16, K_CH = 17, K_HAK = 18, K_ALK = 19, K_TLO = 20, K_TDY = 21, K_TIDY = 22, K_TN2 = 23, K_YMA = 24, K_DQ = 25, K_DV = 26;
const S_Q1 = 0, S_V1 = 1, S_Q2 = 2, S_V2 = 3, S_UIN = 4, S_UINP = 5, S_PC = 6, S_PCP = 7, S_X = 8, S_XP = 9;
const S_DP = 10, S_UG = 11, S_W = 12, S_A = 13, S_DW = 14, S_AIN = 22, S_YM = 15, S_PREVY = 16, S_T = 17, S_LASTX = 18, S_PER = 19, S_NX = 20, S_AMP = 21;

class Reed {
  constructor(eng, R, rank) {
    this.R = R; this.rank = rank;
    this.os = R.fSound >= eng.fOS ? 2 : 1;
    const h = 1 / (eng.fs * this.os), m = R.modes, k = (this.k = new Float64Array(32)), st = (this.st = new Float64Array(24));
    this.h = h; this.fsr = 1 / h; this.T = R.table.A;
    this.io = eng.io; // [reservoir pressure, cassotto pressure], shared, read every step
    this.noise = eng.noise; this.ni = Math.floor(NOISE_N * (0.5 + eng.rand())) % NOISE_N;
    // modes: exact transition over one step for x'' + 2ζωx' + ω²x = 0, plus the response to a held force
    const co = (md) => {
      const w = md.om, z = md.zeta, wd = w * Math.sqrt(1 - z * z), e = Math.exp(-z * w * h), c = Math.cos(wd * h), s = Math.sin(wd * h);
      const p11 = e * (c + ((z * w) / wd) * s), p12 = (e * s) / wd, p21 = (-e * w * w * s) / wd, p22 = e * (c - ((z * w) / wd) * s);
      return { p11, p12, p21, p22, gq: (1 - p11) / md.k, gv: -p21 / md.k };
    };
    const c1 = co(m[0]);
    k[K_A11] = c1.p11; k[K_A12] = c1.p12; k[K_A21] = c1.p21; k[K_A22] = c1.p22; k[K_S1] = m[0].S;
    k[K_GQ1] = c1.gq * m[0].S; k[K_GV1] = c1.gv * m[0].S;
    k[K_DQ] = c1.gq * R.drag; k[K_DV] = c1.gv * R.drag; // the tongue's drag, held over the step
    this.m1 = m[0].m; this.k1 = m[0].k;
    // mode 2 only while it is well below the internal Nyquist frequency
    this.two = m[1].om * h < 2.5;
    if (this.two) {
      const c2 = co(m[1]);
      k[K_B11] = c2.p11; k[K_B12] = c2.p12; k[K_B21] = c2.p21; k[K_B22] = c2.p22; k[K_S2] = m[1].S;
      k[K_GQ2] = c2.gq * m[1].S; k[K_GV2] = c2.gv * m[1].S; this.m2 = m[1].m; this.k2 = m[1].k;
    } else { k[K_B11] = 1; k[K_B22] = 1; this.m2 = 1; this.k2 = 1; }
    k[K_R1] = -R.geo.y0;          // the set: the tip rests y0 above the plate (mode 1 carries it)
    k[K_DVS] = 0.5 * (k[K_S1] * k[K_GV1] + k[K_S2] * k[K_GV2]);
    k[K_RLH] = (1.5 * AIR.rho * R.lj) / h; // the jet's air mass per area, for BDF2
    k[K_CH] = (1.5 * R.C) / h; k[K_HAK] = h / (1.5 * R.Ma); k[K_ALK] = (R.K * h) / (1.5 * R.Ma);
    k[K_TLO] = R.table.lo; k[K_TDY] = R.table.dy; k[K_TIDY] = 1 / R.table.dy; k[K_TN2] = R.table.n - 2;
    k[K_YMA] = 1 - Math.exp(-h * 2 * Math.PI * Math.min(20, R.fSound / 8)); // the live frequency: y's running mean
    this.ampK = Math.exp(-h / 0.01); // the amplitude readout falls back over 10 ms
    this.track = eng.trackAll; // the live pitch and amplitude (the focused key's reeds, or all for tests)
    this.reset();
    st[S_LASTX] = -1;
  }
  reset() {
    const st = this.st;
    for (let i = 0; i < S_YM; i++) st[i] = 0;
    st[S_Q1] = this.k[K_R1]; st[S_YM] = this.k[K_R1];
    this.asleep = true;
  }
  get q1() { return this.st[S_Q1]; } set q1(v) { this.st[S_Q1] = v; }
  get v1() { return this.st[S_V1]; } set v1(v) { this.st[S_V1] = v; }
  get q2() { return this.st[S_Q2]; } set q2(v) { this.st[S_Q2] = v; }
  get v2() { return this.st[S_V2]; } set v2(v) { this.st[S_V2] = v; }
  get y() { return this.st[S_Q1] + this.st[S_Q2]; }
  get Uin() { return this.st[S_UIN]; } get pc() { return this.st[S_PC]; } get dp() { return this.st[S_DP]; }
  get Ug() { return this.st[S_UG]; } get W() { return this.st[S_W]; } get A() { return this.st[S_A]; } get x() { return this.st[S_X]; }
  get ym() { return this.st[S_YM]; } get ampEnv() { return this.st[S_AMP]; } get nx() { return this.st[S_NX]; } get lastX() { return this.st[S_LASTX]; }
  get r1() { return this.k[K_R1]; } get S1() { return this.k[K_S1]; } get S2() { return this.k[K_S2]; }
  // set the reed at a steady state (tests): tip offset y, jet speed x, cell pressure pc, flow U
  setSteady(e) {
    const st = this.st, R = this.R;
    st[S_Q1] = this.k[K_R1] + (R.modes[0].S * e.dp) / R.modes[0].k; st[S_Q2] = this.two ? (R.modes[1].S * e.dp) / R.modes[1].k : 0;
    st[S_V1] = 0; st[S_V2] = 0; st[S_X] = st[S_XP] = e.x; st[S_DP] = e.dp; st[S_PC] = st[S_PCP] = e.pc;
    st[S_UIN] = st[S_UINP] = e.U; st[S_UG] = e.U; st[S_A] = e.A; st[S_YM] = st[S_Q1] + st[S_Q2];
  }
  energy() { // mechanical energy about rest, J
    const st = this.st, d1 = st[S_Q1] - this.k[K_R1];
    return 0.5 * (this.k1 * d1 * d1 + this.m1 * st[S_V1] * st[S_V1] + this.k2 * st[S_Q2] * st[S_Q2] + this.m2 * st[S_V2] * st[S_V2]);
  }
  // One step (of this reed's own length h), with st[S_AIN] the reed's share of the pallet opening
  // (0..1), io[0] the reservoir pressure and io[1] the cassotto's (or 0). Leaves in st[S_DW] the
  // rate of change of the flow leaving downstream, d/dt (U_g + Σ Sₙ vₙ) (m³/s²): the reed's sound.
  step() {
    const k = this.k, st = this.st, a = st[S_AIN], P = this.io[0], pd = this.io[1], T = this.T, rho = 1.2, ni = this.ni, nz = this.noise[ni];
    this.ni = ni + 1 === NOISE_N ? 0 : ni + 1;
    const tlo = k[K_TLO], tidy = k[K_TIDY], tdy = k[K_TDY], tn2 = k[K_TN2];
    // free motion of each mode over the step (about its rest)
    const r1 = k[K_R1], q10 = st[S_Q1], v10 = st[S_V1], q20 = st[S_Q2], v20 = st[S_V2];
    const vt = v10 + v20, fd = -(vt < 0 ? -vt : vt) * vt; // the air's drag on the tongue (explicit: it is slow)
    const d1 = q10 - r1, qf1 = r1 + k[K_A11] * d1 + k[K_A12] * v10 + k[K_DQ] * fd, vf1 = k[K_A21] * d1 + k[K_A22] * v10 + k[K_DV] * fd;
    const qf2 = k[K_B11] * q20 + k[K_B12] * v20, vf2 = k[K_B21] * q20 + k[K_B22] * v20;
    const S1 = k[K_S1], S2 = k[K_S2], gq1 = k[K_GQ1], gv1 = k[K_GV1], gq2 = k[K_GQ2], gv2 = k[K_GV2], gq = gq1 + gq2, dvS = k[K_DVS];
    const dpOld = st[S_DP], dp0 = dpOld + nz * NOISE * (dpOld < 0 ? -dpOld : dpOld); // with turbulence
    // BDF2: (3z' − 4z + z⁻)/2h, written as 1.5(z' − ẑ)/h with ẑ = (2z − ½z⁻)/1.5
    const x0 = st[S_X], U0 = st[S_UIN], pc0 = st[S_PC];
    const Uh = (4 * U0 - st[S_UINP]) * (1 / 3), xh = (4 * x0 - st[S_XP]) * (1 / 3), pch = (4 * pc0 - st[S_PCP]) * (1 / 3);
    const rlh = k[K_RLH], Ch = k[K_CH];
    const open = a > 1e-6, ha = open ? a * k[K_HAK] : 0, alpha = open ? k[K_ALK] / a : 0;
    let x = 2 * x0 - st[S_XP], lo = -Infinity, hi = Infinity; // start from the extrapolated jet speed
    let dpn = 0, Un = 0, q1 = 0, v1 = 0, q2 = 0, v2 = 0, A = 0, pcn = 0;
    for (let it = 0; it < MAX_INNER; it++) {
      const ax = x < 0 ? -x : x;
      dpn = rlh * (x - xh) + (0.5 * rho * ax + EPS_V) * x; // unsteady Bernoulli through the gap
      const D = rlh + rho * ax + EPS_V;
      pcn = pd + dpn;
      let dUn = 0;
      if (open) { // the throat, implicit in U_in': U' + α U'|U'| = B
        const B = Uh + ha * (P - pcn), sq = Math.sqrt(1 + 4 * alpha * (B < 0 ? -B : B));
        Un = (2 * B) / (1 + sq); dUn = (-ha * D) / sq;
      } else Un = 0;
      // the reed under the mean pressure difference over the step
      const Fa = 0.5 * (dp0 + dpn);
      q1 = qf1 + gq1 * Fa; v1 = vf1 + gv1 * Fa; q2 = qf2 + gq2 * Fa; v2 = vf2 + gv2 * Fa;
      // the gap's area at the tip's height (table, linear interpolation)
      const u = (q1 + q2 - tlo) * tidy;
      let j = u | 0;
      if (u < 0) j = 0; else if (j > tn2) j = tn2;
      const a0 = T[j], dA = (T[j + 1] - a0) * tidy;
      A = a0 + dA * (u - j) * tdy;
      if (A < 1e-12) A = 1e-12;
      // the cell's air balance (BDF2)
      const r = Ch * (pcn - pch) - Un + CD * A * x + S1 * v1 + S2 * v2;
      const dr = Ch * D - dUn + CD * (A + 0.5 * x * dA * gq * D) + dvS * D;
      const step = r / dr, tol = 1e-2 * (ax + 0.1);
      if (step < tol && step > -tol) { // close enough: take the Newton step, carrying the state along linearly
        const dx = -step, dF = 0.5 * D * dx;
        dpn += D * dx; pcn += D * dx; Un += dUn * dx;
        q1 += gq1 * dF; v1 += gv1 * dF; q2 += gq2 * dF; v2 += gv2 * dF;
        A += dA * gq * dF; x += dx;
        break;
      }
      if (r > 0) hi = x; else lo = x;
      let xn = x - step;
      if (!(xn > lo && xn < hi)) xn = lo > -Infinity && hi < Infinity ? 0.5 * (lo + hi) : r > 0 ? x - 2 * (ax + 1) : x + 2 * (ax + 1);
      x = xn;
    }
    st[S_Q1] = q1; st[S_V1] = v1; st[S_Q2] = q2; st[S_V2] = v2;
    st[S_PCP] = pc0; st[S_UINP] = U0; st[S_XP] = x0;
    st[S_X] = x; st[S_DP] = dpn; st[S_PC] = pcn; st[S_UIN] = Un; st[S_A] = A;
    const Ug = CD * A * x, W = Ug + S1 * v1 + S2 * v2, dW = (W - st[S_W]) * this.fsr;
    st[S_UG] = Ug; st[S_W] = W; st[S_DW] = dW;
    if (this.track) { // live pitch: upward crossings of y through its running mean, and the amplitude
      const y = q1 + q2, ym = st[S_YM] + k[K_YMA] * (y - st[S_YM]), yc = y - ym, py = st[S_PREVY], t = st[S_T] + 1;
      st[S_YM] = ym; st[S_T] = t;
      if (py < 0 && yc >= 0) {
        const tc = t - 1 + py / (py - yc), lx = st[S_LASTX];
        if (lx >= 0) { const T1 = tc - lx, per = st[S_PER]; st[S_PER] = per > 0 ? per + 0.3 * (T1 - per) : T1; }
        st[S_LASTX] = tc; st[S_NX] += 1;
      }
      st[S_PREVY] = yc;
      const ay = yc < 0 ? -yc : yc, amp = st[S_AMP];
      st[S_AMP] = ay > amp ? ay : amp * this.ampK;
    }
  }
  freq() { const p = this.st[S_PER]; return p > 0 ? 1 / (p * this.h) : 0; }
}

// A key's hot numbers live in a typed array (stored per sample without boxing).
const V_A = 0, V_AT = 1, V_AR = 2, V_FADE = 3, V_ENV = 4;
class Voice {
  constructor(eng, key, models, version) {
    this.key = key; this.version = version;
    this.reeds = models.map((R, r) => new Reed(eng, R, r));
    this.mute = new Float64Array(RANKS.length);
    const on = engaged(eng.P, eng.on);
    for (let r = 0; r < RANKS.length; r++) this.mute[r] = on[r] ? 1 : 0;
    this.s = new Float64Array(8); this.s[V_FADE] = 1;
    this.down = false; this.fading = false; this.dead = false; this.age = 0;
    [this.gl, this.gr] = keyPan(key, 0.5, 36, 96);
    this.list = new Array(RANKS.length).fill(null); this.amul = new Float64Array(RANKS.length); this.nList = 0; // the reeds awake this block
  }
  get a() { return this.s[V_A]; } set a(v) { this.s[V_A] = v; }
  get aTarget() { return this.s[V_AT]; } set aTarget(v) { this.s[V_AT] = v; }
  get aRate() { return this.s[V_AR]; } set aRate(v) { this.s[V_AR] = v; }
  get fade() { return this.s[V_FADE]; } get env() { return this.s[V_ENV]; }
}

export class HarmoniumEngine {
  constructor(fs, seed = 1, opts = {}) {
    this.fOS = opts.fOS ?? F_OS; // reeds sounding from this frequency up run at 2× (tests: 0 = all, Infinity = none)
    this.trackAll = !!opts.track; // follow every reed's pitch (tests, the tuning tool), not just the focused key's
    this.fs = fs; this.P = null; this.voices = []; this.byKey = new Map(); this.models = new Map();
    this.version = 0; this.designKey = '';
    this.rand = rng(seed);
    this.io = new Float64Array(2);
    this.noise = new Float64Array(NOISE_N);
    for (let i = 0; i < NOISE_N; i++) this.noise[i] = this.rand();
    this.h = 1 / fs;
    // wind
    this.Pres = 0; this.Ptarget = 0; this.Pt = 0; this.after = 0; this.afterS = 0; this.press = new Float64Array(128);
    this.tWind = 0; this.Utot = 0; this.started = false;
    // cassotto (shared)
    this.cOn = 0; this.pd = 0; this.Uk = 0; this.cassF = 0; this.cass = null; this.UkPrev = 0; this.Wlast = 0;
    // decimator
    this.fir = halfband(); this.hist = [new Float64Array(2 * this.fir.length), new Float64Array(2 * this.fir.length)]; this.hpos = 0;
    this.hiL = new Float64Array(4096); this.hiR = new Float64Array(4096); // the 2× bus
    this.focus = null; this.blocks = 0;
    this.msg = {
      type: 'reed', key: 0, rank: 1, P: 0, Ptarget: 0, Uair: 0, reeds: 0, fs,
      y: new Float64Array(TRACE), U: new Float64Array(TRACE), A: new Float64Array(TRACE), dp: new Float64Array(TRACE), n: 0, dtTrace: 0,
      f: new Float64Array(RANKS.length), amp: new Float64Array(RANKS.length), env: new Float64Array(ENV), nEnv: 0, dtEnv: 0,
      geo: { L: 0, b: 0, h: 0, e: 0, delta: 0, y0: 0, lam: 0 }, fSound: 0, fNat: 0, xm: 0,
    };
    this.trace = { y: new Float64Array(TRACE * 8), U: new Float64Array(TRACE * 8), A: new Float64Array(TRACE * 8), dp: new Float64Array(TRACE * 8), w: 0, dec: 1, cnt: 0 };
    this.envBuf = new Float64Array(ENV); this.nEnv = 0;
    this.on = new Array(RANKS.length).fill(false);
    this.Usum = 0; this.Ucnt = 0; // the air drawn, averaged between posts
  }

  setParams(P) {
    const old = this.P;
    this.P = P;
    const dk = `${P.set}|${P.clearance}|${P.q}|${P.throat}|${P.cell}|${P.detune}`;
    if (dk !== this.designKey) { this.designKey = dk; this.version++; if (this.models.size > 512) this.models.clear(); }
    this.Ptarget = P.pressure;
    if (!this.started) { this.Pres = P.pressure; this.Pt = P.pressure; this.started = true; this.cOn = P.cassotto ? 1 : 0; this.cassF = P.cassF; this.cass = cassotto(P); }
    void old;
  }

  modelsFor(key) {
    const P = this.P, out = [];
    for (let r = 0; r < RANKS.length; r++) {
      const id = `${key}|${r}|${this.version}`;
      let R = this.models.get(id);
      if (!R) { R = reedModel(rankFreq(key, r, P), P); this.models.set(id, R); }
      out.push(R);
    }
    return out;
  }

  noteOn(key, velocity = 0.7) {
    if (!this.P) return;
    let v = this.byKey.get(key);
    if (v && (v.dead || v.fading || v.version !== this.version)) { if (!v.dead) v.fading = true; v = null; }
    if (!v) {
      v = new Voice(this, key, this.modelsFor(key), this.version);
      this.voices.push(v); this.byKey.set(key, v);
      // too many keys: the quietest released one (never a young one) fades out
      let live = 0;
      for (const u of this.voices) if (!u.fading && !u.dead) live++;
      if (live > MAX_KEYS) {
        let victim = null, score = Infinity;
        for (const u of this.voices) {
          if (u === v || u.fading || u.age < YOUNG) continue;
          const s = (u.down ? 1e6 : 0) + u.env;
          if (s < score) { score = s; victim = u; }
        }
        if (victim) victim.fading = true;
      }
    }
    v.down = true; v.aTarget = 1; v.aRate = 1 / (palletOpen(velocity) * this.fs);
    for (let r = 0; r < RANKS.length; r++) if (v.mute[r] > 0) v.reeds[r].asleep = false;
    // percussion: a hammer strikes the 8′ reed (into the slot) as the key goes down
    if (this.P.percussion && v.mute[1] > 0) {
      const rd = v.reeds[1], R = rd.R, xh = 0.7, vt = percussionSpeed(velocity);
      const J = (vt * rd.m1) / modeShape(R.modes[0].lam, xh);
      rd.v1 += J * modeShape(R.modes[0].lam, xh) / rd.m1;
      if (rd.two) rd.v2 += (J * modeShape(R.modes[1].lam, xh)) / rd.m2;
    }
    this.setFocus(v);
  }

  setFocus(v) {
    if (this.focus === v) return;
    if (this.focus && !this.trackAll) for (const rd of this.focus.reeds) rd.track = false;
    this.focus = v;
    if (v) for (const rd of v.reeds) rd.track = true;
  }

  noteOff(key, velocity) {
    const v = this.byKey.get(key);
    if (!v) return;
    v.down = false; v.aTarget = 0; v.aRate = 1 / (palletClose(velocity) * this.fs);
    this.press[key] = 0; this.updateAfter();
  }

  allNotesOff() { for (const v of this.voices) { v.fading = true; v.down = false; v.aTarget = 0; } }
  voiceCount() { let n = 0; for (const v of this.voices) for (const r of v.reeds) if (!r.asleep) n++; return n; }

  handle(m) {
    if (m.type === 'pressure') {
      if (m.key === null || m.key === undefined) { this.press.fill(0); this.after = m.value; }
      else { this.press[m.key] = m.value; this.updateAfter(); }
    }
  }
  updateAfter() { let a = 0; for (let k = 0; k < 128; k++) if (this.press[k] > a) a = this.press[k]; this.after = a; }

  process(L, R, n) {
    L.fill(0, 0, n); R.fill(0, 0, n);
    if (!this.P) return;
    const P = this.P, h = this.h, hiL = this.hiL, hiR = this.hiR;
    const on = engaged(P, this.on), mStep = (n * h) / MUTE, g = 1 - Math.exp(-h / GLIDE);
    // the wind: effort (target × aftertouch × pumping) into the reservoir, or the chest alone
    const Cw = WIND.G * windTau(P), kw = h / Cw, G = WIND.G, pumpRate = P.pump;
    // the cassotto's coefficients (its tuning glides per block)
    const cTarget = P.cassotto ? 1 : 0;
    if (this.cassF !== P.cassF) { this.cassF += (P.cassF - this.cassF) * Math.min(1, n / this.fs / 0.05); if (Math.abs(this.cassF - P.cassF) < 0.5) this.cassF = P.cassF; this.cass = cassotto({ cassF: this.cassF }); }
    const cs = this.cass, cA = cs.C / h, cB = cs.M / h + 0.5 * cs.R, det = cA * cB + 0.25; // trapezoidal Helmholtz step
    const cassRun = cTarget > 0 || this.cOn > 1e-6;
    if (!cassRun) { this.cOn = 0; this.pd = 0; this.Uk = 0; this.UkPrev = 0; this.Wlast = 0; }
    const vs = this.voices, fadeK = 1 - h / FADE;
    for (const v of vs) { // mutes follow the stops; list the reeds that are awake
      v.nList = 0;
      for (let r = 0; r < RANKS.length; r++) {
        const tgt = on[r] ? 1 : 0;
        if (v.mute[r] !== tgt) { v.mute[r] = tgt > v.mute[r] ? Math.min(1, v.mute[r] + mStep) : Math.max(0, v.mute[r] - mStep); if (tgt && v.down) v.reeds[r].asleep = false; }
        if (!v.reeds[r].asleep) { v.list[v.nList] = v.reeds[r]; v.amul[v.nList] = v.mute[r]; v.nList++; }
      }
    }
    let Pt = this.Pt, afterS = this.afterS, cOn = this.cOn, Pres = this.Pres;
    const Ptarget = this.Ptarget, after = this.after;
    const f = this.focus && !this.focus.dead ? this.focus : null, io = this.io;
    let UtotLast = 0, fAcc = 0;
    for (let i = 0; i < n; i++) {
      // knobs glide
      Pt += g * (Ptarget - Pt); afterS += g * (after - afterS);
      let eff = Pt * (1 + afterS);
      if (pumpRate > 0) { eff *= pumpShape(this.tWind, pumpRate); this.tWind += h; }
      io[0] = Pres; io[1] = cassRun ? (cOn += g * (cTarget - cOn)) * this.pd : 0;
      let Utot = 0, Wtot = 0, l0 = 0, l1 = 0, r0 = 0, r1 = 0;
      for (let k = 0; k < vs.length; k++) {
        const v = vs[k];
        if (v.dead) continue;
        const vsd = v.s;
        let va = vsd[V_A];
        const at = vsd[V_AT];
        if (va !== at) { const ar = vsd[V_AR]; va = at > va ? Math.min(at, va + ar) : Math.max(at, va - ar); vsd[V_A] = va; }
        let s0 = 0, s1 = 0, W = 0;
        const list = v.list, amul = v.amul;
        for (let r = 0; r < v.nList; r++) { // each reed at its own rate: two half steps, or one step held
          const rd = list[r], st = rd.st;
          st[S_AIN] = va * amul[r];
          if (rd.os === 2) {
            rd.step(); s0 += st[S_DW]; const u = st[S_UIN], w = st[S_W];
            rd.step(); s1 += st[S_DW]; Utot += 0.5 * (u + st[S_UIN]); W += 0.5 * (w + st[S_W]);
          } else {
            rd.step(); const d = st[S_DW]; s0 += d; s1 += d; Utot += st[S_UIN]; W += st[S_W];
          }
        }
        let fade = vsd[V_FADE];
        if (v.fading) vsd[V_FADE] = fade *= fadeK;
        const gF = OUT * (1 - cOn) * fade;
        s0 *= gF; s1 *= gF;
        Wtot += W * fade;
        l0 += v.gl * s0; l1 += v.gl * s1; r0 += v.gr * s0; r1 += v.gr * s1;
        const as = s0 < 0 ? -s0 : s0, env = vsd[V_ENV];
        vsd[V_ENV] = as > env ? as : env * 0.9998;
        if (v === f) fAcc += s0 * s0 + s1 * s1;
      }
      if (cassRun) { // the cassotto: C dp/dt = ΣW − U_k, M dU_k/dt = p − R U_k (trapezoidal)
        const p0 = this.pd, u0 = this.Uk;
        const rhs1 = cA * p0 + 0.5 * (Wtot + this.Wlast - u0), rhs2 = (cs.M / h) * u0 + 0.5 * (p0 - cs.R * u0);
        const pn = (rhs1 * cB - 0.5 * rhs2) / det, un = (rhs2 + 0.5 * pn) / cB;
        this.pd = pn; this.Uk = un; this.Wlast = Wtot;
        const c = (0.7071 * OUT * cOn * (un - this.UkPrev)) / h; this.UkPrev = un;
        l0 += c; l1 += c; r0 += c; r1 += c;
      }
      hiL[2 * i] = l0; hiL[2 * i + 1] = l1; hiR[2 * i] = r0; hiR[2 * i + 1] = r1;
      // the reservoir: C dP/dt = G (P_effort − P) − Σ U_in
      Pres += kw * (G * (eff - Pres) - Utot);
      if (Pres < 0) Pres = 0;
      UtotLast = Utot; this.Usum += Utot; this.Ucnt++;
      if (f) this.record(f); // the focused reed's trace, for the views
    }
    this.Utot = UtotLast;
    this.Pt = Pt; this.afterS = afterS; this.cOn = cOn; this.Pres = Pres;
    this.decimate(L, R, n);
    // retire voices: pallet shut, every reed asleep
    for (const v of vs) {
      v.age += n / this.fs;
      if (v.fading && v.s[V_FADE] < 1e-4) { v.dead = true; continue; }
      let awake = 0;
      for (let r = 0; r < RANKS.length; r++) {
        const rd = v.reeds[r];
        if (rd.asleep) continue;
        const shut = v.a === 0 || v.mute[r] === 0;
        // asleep once its pallet or mute is shut and it has gone quiet: the output under −100 dB, or a
        // muted reed's own motion under 10⁻⁹ J (the rest of a ring-down is inaudible)
        const quiet = (v.a === 0 && v.s[V_ENV] < 1e-5) || rd.energy() < 1e-9;
        if (shut && quiet && Math.abs(rd.pc) < 0.05 && Math.abs(rd.Uin) < 1e-7) { rd.asleep = true; rd.reset(); } else awake++;
      }
      if (!awake && !v.down && v.a === 0) v.dead = true;
    }
    let j = 0;
    for (const v of vs) { if (v.dead) { if (this.byKey.get(v.key) === v) this.byKey.delete(v.key); } else vs[j++] = v; }
    vs.length = j;
    if (this.focus && this.focus.dead) this.setFocus(null);
    if (this.post) {
      this.envBuf[this.nEnv % ENV] = Math.sqrt(fAcc / (2 * n)); this.nEnv++; // the focused key's rms over the block
      if (++this.blocks >= POST_BLOCKS) { this.blocks = 0; this.postView(n); }
    }
  }

  // 2× → 1×: the half-band FIR, whose every other tap (but the centre) is zero. The history is
  // kept twice over so that the taps read it without wrapping.
  decimate(L, R, n) {
    const h = this.fir, M = h.length, c = (M - 1) / 2, hl = this.hist[0], hr = this.hist[1], hiL = this.hiL, hiR = this.hiR;
    let p = this.hpos;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 2; k++) { const xl = hiL[2 * i + k], xr = hiR[2 * i + k]; hl[p] = hl[p + M] = xl; hr[p] = hr[p + M] = xr; p = p + 1 === M ? 0 : p + 1; }
      // the newest sample sits at p − 1; tap t multiplies the sample t steps back
      let sl = h[c] * hl[p + M - 1 - c], sr = h[c] * hr[p + M - 1 - c];
      for (let t = 0; t < M; t += 2) { const q = p + M - 1 - t; sl += h[t] * hl[q]; sr += h[t] * hr[q]; } // c is odd: the even taps are the nonzero ones
      L[i] = sl; R[i] = sr;
    }
    this.hpos = p;
  }

  // The reed the views show: the focused key's first sounding rank (8′ if it is drawn).
  shownReed(v) {
    const order = [1, 2, 3, 0, 4];
    for (const r of order) if (v.mute[r] > 0 && !v.reeds[r].asleep) return r;
    return 1;
  }
  record(v) {
    const tr = this.trace;
    if (++tr.cnt < tr.dec) return;
    tr.cnt = 0;
    const st = v.reeds[this.shownReed(v)].st, w = tr.w;
    tr.y[w] = st[S_Q1] + st[S_Q2]; tr.U[w] = st[S_UG]; tr.A[w] = st[S_A]; tr.dp[w] = st[S_DP];
    tr.w = w + 1 === tr.y.length ? 0 : w + 1;
  }
  postView(n) {
    const m = this.msg, v = this.focus, tr = this.trace;
    m.P = this.Pres; m.Ptarget = this.Pt * (1 + this.afterS); m.Uair = this.Ucnt ? this.Usum / this.Ucnt : this.Utot; this.Usum = 0; this.Ucnt = 0; m.reeds = this.voiceCount();
    m.dtEnv = n / this.fs;
    const ne = Math.min(this.nEnv, POST_BLOCKS); // the blocks since the last post, oldest first
    for (let i = 0; i < ne; i++) m.env[i] = this.envBuf[(this.nEnv - ne + i) % ENV];
    m.nEnv = ne;
    if (!v) { m.key = 0; m.n = 0; this.post(m); return; }
    const r = this.shownReed(v), rd = v.reeds[r], R = rd.R;
    m.key = v.key; m.rank = r; m.fSound = R.fSound; m.fNat = R.fNat;
    const g = m.geo; g.L = R.geo.L; g.b = R.geo.b; g.h = R.geo.h; g.e = R.geo.e; g.delta = R.geo.delta; g.y0 = R.geo.y0; g.lam = R.modes[0].lam;
    for (let k = 0; k < RANKS.length; k++) { const q = v.reeds[k]; m.f[k] = !q.asleep && v.mute[k] > 0 ? q.freq() : 0; m.amp[k] = q.ampEnv; }
    // the trace: about 2.5 periods at TRACE points, decimated from the internal rate
    const per = 1 / (R.fSound * this.h), dec = Math.max(1, Math.round((2.5 * per) / TRACE));
    if (dec !== tr.dec) { tr.dec = dec; tr.cnt = 0; }
    const L = tr.y.length;
    for (let i = 0; i < TRACE; i++) { const q = (tr.w - TRACE + i + L) % L; m.y[i] = tr.y[q]; m.U[i] = tr.U[q]; m.A[i] = tr.A[q]; m.dp[i] = tr.dp[q]; }
    m.n = TRACE; m.dtTrace = dec * this.h; m.xm = rd.ym;
    this.post(m);
  }
}

globalThis.HarmoniumEngine = HarmoniumEngine;
