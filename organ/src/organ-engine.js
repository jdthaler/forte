// organ-engine.js — real-time tonewheel organ, signal path of a B-3 + Leslie 122.
//
//   motor ─▶ 91 tonewheels ─▶ key contacts ─▶ 9 busbars ─▶ drawbars ─┐
//                        └─▶ percussion (1′ contacts, single-trigger) ┤
//     preamp (expression) ─▶ scanner vibrato (LC delay line) ─▶ tube drive + coupling capacitor
//       ─▶ Leslie: crossover ─▶ rotating horn + drum (Doppler, directivity,
//                                cabinet reflection) ─▶ two microphones
//
// Runs in the AudioWorklet (shared/worklet.js; exposed on globalThis) and in Node for tests,
// on the engine contract there. setParams is all a host sends: the generator's tables are
// built here from the parameters and the sample rate (tonewheels.js buildGenerator).
// Every 6 blocks of 128 samples it posts its state (shaft, rotors, scanner) for the views.

import { buildGenerator, GEN_PARAMS } from './tonewheels.js';

const TAU = 2 * Math.PI;
const C_SOUND = 343;
const NW = 92; // wheel arrays are 1-based
const HARM = [0.5, 1.5, 1, 2, 3, 4, 5, 6, 8]; // drawbar footages as harmonics of 8′
const SMOOTH_T = 0.015; // s: live gains, drive and crossover glide (no zipper noise)

// Tube drive: a triode biased off-centre, y = n·(tanh(k·x + B0) − tanh B0). The
// bias B0 sits outside the gain k = 15·drive², so the curve stays asymmetric
// (even harmonics) without turning into a rectifier. n is set so a full chord
// (DRIVE_REF) comes out at its own level: more drive compresses the dynamics
// and adds grit, and the output can never exceed n(1 + tanh B0).
const DRIVE_B0 = 0.25, DRIVE_REF = 0.25, DRIVE_TB0 = Math.tanh(DRIVE_B0);
function driveNorm(k) { return k > 1e-6 ? DRIVE_REF / (Math.tanh(k * DRIVE_REF + DRIVE_B0) - DRIVE_TB0) : 0; }
const near = (a, b) => Math.abs(a - b) <= 1e-7 * (1 + Math.abs(b));

// Leslie cabinet: rotor axis to rear wall; it grows if the horn is made longer,
// and the mics stay at least MIC_CLEAR outside it.
const CABINET = 0.32, MIC_CLEAR = 0.08;
export function leslieGeometry(p) {
  const wall = Math.max(CABINET, p.hornRadius + 0.04);
  return { wall, micDist: Math.max(p.micDist, wall + MIC_CLEAR) };
}

export const ORGAN_DEFAULTS = {
  tuning: 'gears', mains: 60, wheelHarm: 0.4, crosstalk: -48, leakage: -70,
  drawbars: [8, 8, 8, 0, 0, 0, 0, 0, 0],
  motor: true, inertia: 6, spinUp: 1.2,
  loading: 0.25,
  spread: 1.2, bounce: 0.5, contactTime: 20,
  percOn: false, percSoft: false, percFast: true, percThird: true,
  percFastTau: 0.15, percSlowTau: 0.6, percLevel: 1,
  vib: 'C3', sections: 18, sectionDelay: 50, scanRate: 6.87,
  expression: 0.85, drive: 0.15, master: 1,
  leslieOn: true, leslie: 'slow',
  hornSlow: 0.8, hornFast: 6.75, drumSlow: 0.67, drumFast: 5.9,
  hornAccel: 0.7, hornDecel: 0.9, drumAccel: 4.5, drumDecel: 5.5,
  hornRadius: 0.18, micDist: 0.8, micSpread: 120, balance: 0, crossover: 800, reflections: 0.35,
};

const VIB_DEPTH = { V1: 0.33, V2: 0.62, V3: 1, C1: 0.33, C2: 0.62, C3: 1 };

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// RBJ biquad, transposed direct form II
class Biquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.z1 = 0; this.z2 = 0; }
  set(type, f, Q, fs) {
    const w = (TAU * f) / fs, c = Math.cos(w), al = Math.sin(w) / (2 * Q), a0 = 1 + al;
    if (type === 'lp') { this.b0 = (1 - c) / 2 / a0; this.b1 = (1 - c) / a0; this.b2 = this.b0; }
    else { this.b0 = (1 + c) / 2 / a0; this.b1 = -(1 + c) / a0; this.b2 = this.b0; }
    this.a1 = (-2 * c) / a0; this.a2 = (1 - al) / a0;
  }
  run(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

// Ring buffer read with cubic Hermite interpolation at a fractional delay.
function readFrac(buf, mask, w, delay) {
  const pos = w - delay;
  const i = Math.floor(pos), f = pos - i;
  const x0 = buf[(i - 1) & mask], x1 = buf[i & mask], x2 = buf[(i + 1) & mask], x3 = buf[(i + 2) & mask];
  const c1 = 0.5 * (x2 - x0), c2 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3, c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2);
  return ((c3 * f + c2) * f + c1) * f + x1;
}

export class OrganEngine {
  constructor(fs) {
    this.fs = fs;
    this.dt = 1 / fs;
    this.p = { ...ORGAN_DEFAULTS, drawbars: [...ORGAN_DEFAULTS.drawbars] };
    this.rand = rng(7);
    this.now = 0;
    this.peak = 0;
    this.stateClock = 0; // samples since the last state message

    // generator (built by the first setParams)
    this.gen = null;
    this.genOf = null; // the GEN_PARAMS values it was built from
    this.cr = new Float64Array(NW); this.ci = new Float64Array(NW);
    this.rc = new Float64Array(NW); this.rs = new Float64Array(NW);
    this.v = new Float64Array(NW);
    for (let w = 1; w < NW; w++) { const ph = TAU * this.rand(); this.cr[w] = Math.cos(ph); this.ci[w] = Math.sin(ph); }
    this.speed = 1; // shaft speed / synchronous speed

    // keys and busbars (keyArr: the same keys, iterated without allocating)
    this.keys = new Map();
    this.keyArr = [];
    this.held = 0;
    this.num = new Float64Array(10);
    this.den = new Float64Array(10);
    this.percEnv = 0;

    // scanner vibrato: LC ladder, normalised to Z0 = 1 (so L = C = τ per section)
    this.I = new Float64Array(64);
    this.V = new Float64Array(65);
    this.scanPhase = 0;
    this.scanPos = 0;

    // Leslie
    this.hornAng = 0; this.drumAng = 1.3;
    this.hornHz = this.p.hornSlow; this.drumHz = this.p.drumSlow;
    this.bufLen = 4096; this.mask = this.bufLen - 1;
    this.hornBuf = new Float64Array(this.bufLen);
    this.drumBuf = new Float64Array(this.bufLen);
    this.wi = 0;
    this.lp1 = new Biquad(); this.lp2 = new Biquad(); this.hp1 = new Biquad(); this.hp2 = new Biquad();
    this.mics = new Float64Array(4);
    this.dcIn = 0; this.dcOut = 0;
    this.aSm = 1 - Math.exp(-this.dt / SMOOTH_T);
    this.updateDerived();
    this.snapLive();
  }

  configure(gen) {
    this.gen = gen;
    this.updateRotations();
    for (let i = 0; i < this.keyArr.length; i++) this.initKeyOsc(this.keyArr[i]);
  }

  setParams(p) {
    const prevSections = this.p.sections;
    Object.assign(this.p, p);
    if (p.drawbars) this.p.drawbars = [...p.drawbars];
    if (this.p.sections !== prevSections) { this.I.fill(0); this.V.fill(0); }
    this.updateDerived();
    // the generator: built on the first call, rebuilt when a parameter it depends on changes
    if (!this.gen || GEN_PARAMS.some((k, i) => this.p[k] !== this.genOf[i])) {
      this.genOf = GEN_PARAMS.map((k) => this.p[k]);
      this.configure(buildGenerator(this.p, this.fs));
    }
    // glide while anything is audible; jump when only the leakage hiss is left
    if (this.keyArr.length || this.peak > 1e-3) this.gliding = true; else this.snapLive();
  }

  // Targets of the parameters that glide while the organ plays.
  liveTargets() {
    const p = this.p;
    this.tPre = 0.11 * this.expGain;
    this.tDrive = p.drive;
    this.tLam = p.loading;
    this.tMaster = p.master;
    this.tHornG = Math.min(1, 1 + p.balance);
    this.tDrumG = Math.min(1, 1 - p.balance);
    this.tRefl = p.reflections;
    this.tXo = p.crossover;
  }

  snapLive() {
    this.liveTargets();
    this.sPre = this.tPre; this.sDrive = this.tDrive; this.sLam = this.tLam; this.sMaster = this.tMaster;
    this.sHornG = this.tHornG; this.sDrumG = this.tDrumG; this.sRefl = this.tRefl; this.sXo = this.tXo;
    this.driveK = 15 * this.sDrive * this.sDrive; this.driveN = driveNorm(this.driveK);
    this.setCrossover(this.sXo);
    this.gliding = false;
  }

  setCrossover(f) {
    const q = 0.7071, fs = this.fs;
    this.lp1.set('lp', f, q, fs); this.lp2.set('lp', f, q, fs);
    this.hp1.set('hp', f, q, fs); this.hp2.set('hp', f, q, fs);
  }

  updateDerived() {
    const p = this.p;
    this.alphaC = p.contactTime <= 0 ? 1 : 1 - Math.exp(-this.dt / (p.contactTime * 1e-6));
    const tau = p.percFast ? p.percFastTau : p.percSlowTau;
    this.percDecay = Math.exp(-this.dt / tau);
    this.dbg = p.drawbars.map((n) => (n <= 0 ? 0 : 10 ** ((-3 * (8 - n)) / 20)));
    if (p.percOn) {
      this.dbg[8] = 0; // the 1′ contacts are borrowed to key the percussion
      if (!p.percSoft) for (let d = 0; d < 9; d++) this.dbg[d] *= 0.708;
    }
    this.percGain = p.percOn ? p.percLevel * (p.percSoft ? 0.5 : 1) : 0;
    this.expGain = 10 ** (((p.expression - 1) * 40) / 20);
    const os = 2, h = this.dt / os;
    this.lcTau = Math.max(p.sectionDelay * 1e-6, 1.25 * h);
    this.lcN = Math.max(2, Math.min(60, Math.round(p.sections)));
    this.lcK = h / this.lcTau;
    this.liveTargets();
  }

  updateRotations() {
    const g = this.gen;
    if (!g) return;
    for (let w = 1; w < NW; w++) {
      const d = TAU * g.wheelHz[w] * this.speed * this.dt;
      this.rc[w] = Math.cos(d); this.rs[w] = Math.sin(d);
      // renormalise the phasor to stop amplitude drift
      const m = this.cr[w] * this.cr[w] + this.ci[w] * this.ci[w];
      const s = 1.5 - 0.5 * m;
      this.cr[w] *= s; this.ci[w] *= s;
    }
    for (let i = 0; i < this.keyArr.length; i++) this.updateKeyRot(this.keyArr[i]);
  }

  // "harmonic" (ideal additive) mode: each key owns nine exact harmonics
  initKeyOsc(k) {
    if (!k.hc) {
      k.hc = new Float64Array(9); k.hs = new Float64Array(9); k.hrc = new Float64Array(9); k.hrs = new Float64Array(9);
      k.hv = new Float64Array(9); k.hmute = new Uint8Array(9);
      for (let d = 0; d < 9; d++) { const ph = TAU * this.rand(); k.hc[d] = Math.cos(ph); k.hs[d] = Math.sin(ph); }
    }
    this.updateKeyRot(k);
  }

  updateKeyRot(k) {
    if (!k.hc || !this.gen) return;
    const f0 = this.gen.keyHz[k.idx];
    for (let d = 0; d < 9; d++) {
      const f = f0 * HARM[d];
      const dd = f < 0.45 * this.fs ? TAU * f * this.speed * this.dt : 0;
      k.hrc[d] = Math.cos(dd); k.hrs[d] = Math.sin(dd);
      k.hmute[d] = f < 0.45 * this.fs ? 0 : 1;
      const m = k.hc[d] * k.hc[d] + k.hs[d] * k.hs[d], s = 1.5 - 0.5 * m;
      k.hc[d] *= s; k.hs[d] *= s;
    }
  }

  // Nine contact springs touch their busbars at slightly different points in
  // the key travel, and each may bounce. A faster key press closes them
  // closer together.
  schedule(k, closing, keySpeed) {
    const p = this.p, fs = this.fs, r = this.rand;
    const spread = (p.spread * 1e-3 * fs) / keySpeed;
    const ev = [];
    for (let d = 0; d < 9; d++) {
      let t = this.now + 1 + Math.round(k.order[d] * spread * (0.8 + 0.4 * r()));
      ev.push({ t, d, s: closing ? 1 : 0 });
      const nb = Math.floor(p.bounce * (1 + 3 * r()));
      for (let b = 0; b < nb; b++) {
        t += Math.max(1, Math.round((0.04 + 0.2 * r()) * 1e-3 * fs * (1 + b)));
        ev.push({ t, d, s: closing ? 0 : 1 });
        t += Math.max(1, Math.round((0.03 + 0.15 * r()) * 1e-3 * fs));
        ev.push({ t, d, s: closing ? 1 : 0 });
      }
    }
    ev.sort((a, b) => a.t - b.t);
    k.ev = ev;
    k.evi = 0;
  }

  // velocity 0..1 (MIDI velocity / 127; the computer keys play 100): it sets the key speed
  noteOn(key, velocity = 100 / 127) {
    const idx = key - 36;
    if (idx < 0 || idx > 60) return;
    let k = this.keys.get(key);
    if (!k) {
      // each key's contacts have their own fixed geometry
      const kr = rng(1000 + key);
      k = { key, idx, g: new Float64Array(9), tgt: new Uint8Array(9), order: Array.from({ length: 9 }, () => kr()), down: false, ev: [], evi: 0 };
      if (this.gen && this.gen.harmonic) this.initKeyOsc(k);
      this.keys.set(key, k);
      this.keyArr.push(k);
    }
    if (k.down) return;
    if (this.held === 0) this.percEnv = 1; // single trigger: re-arms only when all keys are up
    this.held++;
    k.down = true;
    this.schedule(k, true, 0.5 + velocity);
  }

  noteOff(key) {
    const k = this.keys.get(key);
    if (!k || !k.down) return;
    k.down = false;
    this.held = Math.max(0, this.held - 1);
    this.schedule(k, false, 1.2);
  }

  allNotesOff() {
    for (let i = 0; i < this.keyArr.length; i++) if (this.keyArr[i].down) this.noteOff(this.keyArr[i].key);
  }

  voiceCount() { return this.keys.size; } // keys sounding, or still opening their contacts

  // every 768 samples (6 blocks of 128, as the page's views expect): the state for the views
  tick(n) {
    this.stateClock += n;
    if (this.stateClock >= 768) { this.stateClock -= 768; this.post?.(this.state()); }
  }

  process(L, R, n) {
    const p = this.p, g = this.gen;
    L.fill(0, 0, n); R.fill(0, 0, n);
    if (!g) { this.tick(n); return; }
    const dtb = n * this.dt;

    // motor: synchronous lock when powered, viscous + Coulomb coast-down when not
    if (p.motor) this.speed += (1 - this.speed) * (1 - Math.exp(-dtb / p.spinUp));
    else this.speed = Math.max(0, this.speed - (this.speed / p.inertia + 0.012) * dtb);
    this.updateRotations();

    // Leslie rotor speeds: first-order approach with separate up/down times
    const tgtH = p.leslie === 'fast' ? p.hornFast : p.leslie === 'slow' ? p.hornSlow : 0;
    const tgtD = p.leslie === 'fast' ? p.drumFast : p.leslie === 'slow' ? p.drumSlow : 0;
    this.hornHz += (tgtH - this.hornHz) * (1 - Math.exp(-dtb / (tgtH > this.hornHz ? p.hornAccel : p.hornDecel)));
    this.drumHz += (tgtD - this.drumHz) * (1 - Math.exp(-dtb / (tgtD > this.drumHz ? p.drumAccel : p.drumDecel)));

    const cr = this.cr, ci = this.ci, rc = this.rc, rs = this.rs, v = this.v;
    const lvl = g.level, A2 = g.a2, A3 = g.a3, LK = g.leak, PT = g.partner, XT = g.xtalk, KM = g.keyMap;
    const percMap = p.percThird ? g.perc3 : g.perc2, percD = p.percThird ? 4 : 3;
    const harmonic = g.harmonic;
    const num = this.num, den = this.den, dbg = this.dbg;
    const alphaC = this.alphaC;
    const keys = this.keyArr;
    const speed = this.speed;
    const vibOn = p.vib in VIB_DEPTH, chorus = vibOn && p.vib[0] === 'C';
    const lcN = this.lcN, lcK = this.lcK, I = this.I, V = this.V;
    const scanInc = p.scanRate * speed * this.dt;
    const depth = vibOn ? VIB_DEPTH[p.vib] * lcN : 0;
    const fs = this.fs, mask = this.mask, hb = this.hornBuf, db = this.drumBuf;
    // as leslieGeometry(p), without allocating
    const wall = Math.max(CABINET, p.hornRadius + 0.04), D = Math.max(p.micDist, wall + MIC_CLEAR);
    const sp = (p.micSpread * Math.PI) / 360;
    const mics = this.mics;
    mics[0] = -Math.sin(sp) * D; mics[1] = Math.cos(sp) * D; mics[2] = Math.sin(sp) * D; mics[3] = mics[1];
    const rH = p.hornRadius, rD = 0.15;
    const hornInc = TAU * this.hornHz * this.dt, drumInc = TAU * this.drumHz * this.dt;
    // live parameters: glide sample by sample towards their targets while gliding
    const gliding = this.gliding, aS = this.aSm;
    const tPre = this.tPre, tLam = this.tLam, tMaster = this.tMaster, tHornG = this.tHornG, tDrumG = this.tDrumG, tRefl = this.tRefl;
    let pre = this.sPre, lam = this.sLam, master = this.sMaster, hornG = this.sHornG, drumG = this.sDrumG, refl = this.sRefl;
    let dK = this.driveK, dN = this.driveN;
    let peak = 0;

    for (let s = 0; s < n; s++) {
      if (gliding) {
        pre += (tPre - pre) * aS; lam += (tLam - lam) * aS; master += (tMaster - master) * aS;
        hornG += (tHornG - hornG) * aS; drumG += (tDrumG - drumG) * aS; refl += (tRefl - refl) * aS;
        if (this.sDrive !== this.tDrive) {
          this.sDrive += (this.tDrive - this.sDrive) * aS;
          if (Math.abs(this.tDrive - this.sDrive) < 1e-6) this.sDrive = this.tDrive;
          dK = 15 * this.sDrive * this.sDrive; dN = driveNorm(dK);
        }
        if (this.sXo !== this.tXo) {
          this.sXo += (this.tXo - this.sXo) * aS;
          if (Math.abs(this.tXo - this.sXo) < 0.01) this.sXo = this.tXo;
          this.setCrossover(this.sXo);
        }
      }
      // --- tonewheels (EMF ∝ shaft speed)
      let leakSum = 0;
      for (let w = 1; w < NW; w++) {
        const c = cr[w], si = ci[w];
        const nc = c * rc[w] - si * rs[w], ns = c * rs[w] + si * rc[w];
        cr[w] = nc; ci[w] = ns;
        const val = speed * lvl[w] * (ns + A2[w] * 2 * ns * nc + A3[w] * (3 * ns - 4 * ns * ns * ns));
        v[w] = val;
        leakSum += LK[w] * val;
      }

      // --- contacts → busbars
      for (let d = 0; d < 10; d++) { num[d] = 0; den[d] = 0; }
      for (let j = 0; j < keys.length; j++) {
        const k = keys[j];
        while (k.evi < k.ev.length && k.ev[k.evi].t <= this.now) { const e = k.ev[k.evi++]; k.tgt[e.d] = e.s; }
        const kg = k.g, kt = k.tgt;
        if (harmonic && k.hc) {
          for (let d = 0; d < 9; d++) {
            const c = k.hc[d], si = k.hs[d];
            const nc = c * k.hrc[d] - si * k.hrs[d], ns = c * k.hrs[d] + si * k.hrc[d];
            k.hc[d] = nc; k.hs[d] = ns;
            k.hv[d] = k.hmute[d] ? 0 : speed * ns;
          }
        }
        for (let d = 0; d < 9; d++) {
          let gg = kg[d];
          const t = kt[d];
          if (gg !== t) {
            gg += (t - gg) * alphaC;
            if (Math.abs(gg - t) < 1e-5) gg = t;
            kg[d] = gg;
          }
          if (gg > 0) {
            let x;
            if (harmonic && k.hc) x = k.hv[d];
            else { const w = KM[k.idx * 9 + d]; x = v[w] + XT[w] * v[PT[w]]; }
            num[d] += gg * x;
            den[d] += gg;
          }
        }
        if (kg[8] > 0 && this.percGain > 0) {
          let x;
          if (harmonic && k.hc) x = k.hv[percD];
          else { const w = percMap[k.idx]; x = v[w] + XT[w] * v[PT[w]]; }
          num[9] += kg[8] * x;
          den[9] += kg[8];
        }
      }
      // busbar loading, Millman's theorem: n wheels of source resistance R_s on a
      // busbar loaded by R_L give Σv·(1+λ)/(1+λn), λ = R_L/R_s
      let x = 0;
      for (let d = 0; d < 9; d++) if (den[d] > 0) x += dbg[d] * num[d] * (1 + lam) / (1 + lam * den[d]);
      if (den[9] > 0) x += this.percGain * this.percEnv * num[9] * (1 + lam) / (1 + lam * den[9]);
      this.percEnv *= this.percDecay;
      x = pre * (x + leakSum);

      // --- scanner vibrato: LC ladder (2× oversampled, symplectic Euler)
      if (vibOn) {
        for (let o = 0; o < 2; o++) {
          I[1] = (I[1] + lcK * (x - V[1])) / (1 + lcK);
          for (let k = 2; k <= lcN; k++) I[k] += lcK * (V[k - 1] - V[k]);
          for (let k = 1; k < lcN; k++) V[k] += lcK * (I[k] - I[k + 1]);
          V[lcN] = (V[lcN] + lcK * I[lcN]) / (1 + lcK);
        }
        V[0] = x - I[1];
        this.scanPhase += scanInc;
        if (this.scanPhase >= 1) this.scanPhase -= 1;
        const tri = 1 - Math.abs(2 * this.scanPhase - 1);
        const pos = depth * tri;
        const i0 = Math.min(lcN - 1, Math.floor(pos)), f = pos - i0;
        this.scanPos = pos;
        const pick = 2 * ((1 - f) * V[i0] + f * V[i0 + 1]);
        x = chorus ? 0.5 * (x + pick) : pick;
      }

      // --- tube drive (biased soft clip, see DRIVE_B0) and the coupling capacitor
      if (dK > 1e-6) x = dN * (Math.tanh(dK * x + DRIVE_B0) - DRIVE_TB0);
      const yDC = x - this.dcIn + 0.9995 * this.dcOut;
      this.dcIn = x; this.dcOut = yDC; x = yDC;

      let yl, yr;
      if (!p.leslieOn) {
        yl = yr = x;
      } else {
        // --- Leslie: 800 Hz crossover, then moving sources heard by two mics
        const lo = this.lp2.run(this.lp1.run(x)), hi = this.hp2.run(this.hp1.run(x));
        this.wi = (this.wi + 1) & mask;
        hb[this.wi] = hi; db[this.wi] = lo;
        this.hornAng += hornInc; if (this.hornAng > TAU) this.hornAng -= TAU;
        this.drumAng += drumInc; if (this.drumAng > TAU) this.drumAng -= TAU;
        const sh = Math.sin(this.hornAng), chh = Math.cos(this.hornAng);
        const sd = Math.sin(this.drumAng), cd = Math.cos(this.drumAng);
        yl = 0; yr = 0;
        for (let m = 0; m < 2; m++) {
          const mx = mics[2 * m], my = mics[2 * m + 1];
          // horn: highly directional bell at radius rH; plus its image in the rear
          // wall. The mics are outside the cabinet; dd ≥ 5 cm guards the 1/r law.
          let dx = mx - rH * sh, dy = my - rH * chh, dd = Math.max(0.05, Math.hypot(dx, dy));
          let ca = (dx * sh + dy * chh) / dd, dir = (1 + ca) / 2;
          let y = hornG * (0.08 + 0.92 * dir * dir) * (D / dd) * readFrac(hb, mask, this.wi, (dd / C_SOUND) * fs);
          dy = my + 2 * wall + rH * chh; dd = Math.hypot(dx, dy);
          ca = (dx * sh - dy * chh) / dd; dir = (1 + ca) / 2;
          y += refl * hornG * (0.08 + 0.92 * dir * dir) * (D / dd) * readFrac(hb, mask, this.wi, (dd / C_SOUND) * fs);
          // drum: rotating baffle, broader pattern
          dx = mx - rD * sd; dy = my - rD * cd; dd = Math.max(0.05, Math.hypot(dx, dy));
          ca = (dx * sd + dy * cd) / dd;
          y += drumG * (0.45 + 0.55 * (1 + ca) / 2) * (D / dd) * readFrac(db, mask, this.wi, (dd / C_SOUND) * fs);
          dy = my + 2 * wall + rD * cd; dd = Math.hypot(dx, dy);
          ca = (dx * sd - dy * cd) / dd;
          y += 0.5 * refl * drumG * (0.45 + 0.55 * (1 + ca) / 2) * (D / dd) * readFrac(db, mask, this.wi, (dd / C_SOUND) * fs);
          if (m === 0) yl = y; else yr = y;
        }
      }
      yl *= master; yr *= master;
      L[s] = yl; R[s] = yr;
      const a = Math.max(Math.abs(yl), Math.abs(yr));
      if (a > peak) peak = a;
      this.now++;
    }

    // the glide: write back, and stop once everything has arrived
    if (gliding) {
      if (near(pre, tPre) && near(lam, tLam) && near(master, tMaster) && near(hornG, tHornG) && near(drumG, tDrumG)
        && near(refl, tRefl) && this.sDrive === this.tDrive && this.sXo === this.tXo) {
        pre = tPre; lam = tLam; master = tMaster; hornG = tHornG; drumG = tDrumG; refl = tRefl;
        this.gliding = false;
      }
      this.sPre = pre; this.sLam = lam; this.sMaster = master; this.sHornG = hornG; this.sDrumG = drumG; this.sRefl = refl;
      this.driveK = dK; this.driveN = dN;
    }

    // retire keys whose contacts are all open
    let j = 0;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      let any = k.down || k.evi < k.ev.length;
      for (let d = 0; d < 9 && !any; d++) if (k.g[d] > 0) any = true;
      if (any) keys[j++] = k; else this.keys.delete(k.key);
    }
    keys.length = j;
    if (!(peak < 1e3)) { // NaN or blow-up: reset the delay line and rotors
      this.I.fill(0); this.V.fill(0); this.hornBuf.fill(0); this.drumBuf.fill(0);
      this.post?.({ type: 'error', message: 'numerical instability — signal path reset' });
    }
    this.peak = peak;
    this.tick(n);
  }

  state() {
    return {
      type: 'state', shaft: this.speed, hornAng: this.hornAng, hornHz: this.hornHz,
      drumAng: this.drumAng, drumHz: this.drumHz, scanPos: this.scanPos, lcN: this.lcN, percEnv: this.percEnv,
    };
  }
}

globalThis.OrganEngine = OrganEngine;
