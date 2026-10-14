// bowed-engine.js — the viola organista in real time. Runs in the
// AudioWorklet (through shared/worklet.js) and in Node (tests, renders).
//
// Every sample:
//   1. the treadle sets the wheel speed v_B (with a ripple per stroke);
//   2. the shared bridge velocity follows from all sounding strings at once:
//      V = 2G Σ Z_k a_k / (1 + G ΣZ), a_k the wave each string sends it;
//   3. each string reflects at the bridge, meets the wheel (friction solved
//      implicitly, with the force its key applies) and returns its force on
//      the bridge (string.js);
//   4. the bridge forces drive the soundboard's plate modes, heard by two
//      microphones through each mode's baffled-plate radiation (Wallace 1972),
//      plus a direct path for the dense modes above the modelled range.

import { RANGE, loopDesign, friction, keyForce, riseTime, boardModes, bridgePoint, plateShape, BOARD } from './bowed-model.js';
import { BowedString } from './string.js';
import { Biquad, OnePole, TAU, modeCoeffs } from '../../shared/dsp.js';

const OUT = 13;
const G_DIRECT = 0.0057; // matches the modes' mean radiation (≈ −45 dB per newton) where they overlap
const NSEG = 8;            // the bridge, as 8 drive points along its length
const F_BODY = 2400;       // plate modes are modelled up to here
const SHAPE_N = 96;        // points along the string for the view
const TRACE = 2048;        // bow-point velocity history for the view
const POST_EVERY = 2048;   // samples between view updates (≈ 23 per second)
const STROBE = 1 / 48;     // the shape is sampled stroboscopically: the corner advances 1/48 period per frame

export class OrganistaEngine {
  constructor(fs) {
    this.fs = fs;
    this.P = null;
    this.S = [];
    for (let k = RANGE[0]; k <= RANGE[1]; k++) {
      const s = new BowedString(k, fs);
      Object.assign(s, { down: false, vel: 0, after: 0, FN: 0, FT: 0, up: 0, dn: 0, active: false, idle: 0, seg: Math.round(((k - RANGE[0]) / (RANGE[1] - RANGE[0])) * (NSEG - 1)) });
      this.S[k] = s;
    }
    this.act = new Array(RANGE[1] - RANGE[0] + 1).fill(null); this.nAct = 0;
    this.seg = new Float64Array(NSEG);
    this.ph = 0; this.t = 0; this.Fr = null;
    this.focus = 60; this.lastPost = 0; this.shotAt = 0; this.shotF = 0; this.shot = false;
    this.segOn = new Int32Array(NSEG); this.nSeg = 0; this.bodyE = 0;
    this.shape = new Float32Array(SHAPE_N);
    this.trace = new Float32Array(TRACE); this.traceOut = new Float32Array(TRACE); this.tw = 0;
    this.motion = { spp: 0, kind: 'none' };
    this.hp = [new Biquad(), new Biquad()]; this.mass = new OnePole(4000, fs); // the bridge's mass rolls off the top
    this.dl = new Float64Array(64); this.dw = 0; // right mic is a little further away
    this.etaBody = -1;
  }

  setParams(P) {
    const old = this.P;
    this.P = P;
    this.Fr = friction(P);
    this.vB = P.speed;
    for (let k = RANGE[0]; k <= RANGE[1]; k++) {
      const s = this.S[k];
      s.design(loopDesign(k, P, s.fs));
      s.setDamper(this.damped(s), 6.91 / P.damper);
    }
    const L0 = this.S[RANGE[0]].L;
    this.kB = (2 * L0.G) / (1 + L0.G * L0.Zall);
    if (P.boardEta !== this.etaBody) this.buildBody(P.boardEta);
    if (P.lifted && !(old && old.lifted)) for (let k = RANGE[0]; k <= RANGE[1]; k++) this.activate(this.S[k]);
    if (old && old.force !== P.force) for (let i = 0; i < this.nAct; i++) { const s = this.act[i]; if (s.down) s.FT = keyForce(s.key, s.vel, P.force, s.after); }
  }

  // The soundboard: plate modes driven at NSEG points along the bridge.
  buildBody(eta) {
    this.etaBody = eta;
    const modes = boardModes(F_BODY, eta), M = modes.length, fs = this.fs;
    Object.assign(this, { M, a1: new Float64Array(M), a2: new Float64Array(M), q1: new Float64Array(M), q2: new Float64Array(M),
      drive: new Float64Array(M * NSEG), wLr: new Float64Array(M), wLi: new Float64Array(M), wRr: new Float64Array(M), wRi: new Float64Array(M), om: new Float64Array(M) });
    modes.forEach((m, i) => {
      const c = modeCoeffs(m.f, m.sigma, fs);
      this.a1[i] = c.a1; this.a2[i] = c.a2; this.om[i] = TAU * m.f;
      for (let g = 0; g < NSEG; g++) {
        const [x, y] = bridgePoint(RANGE[0] + ((RANGE[1] - RANGE[0]) * g) / (NSEG - 1));
        this.drive[i * NSEG + g] = (c.b * plateShape(m.m, m.n, x, y, BOARD)) / m.M;
      }
      [[this.wLr, this.wLi], [this.wRr, this.wRi]].forEach(([r, im], j) => { r[i] = m.w[j][0]; im[i] = m.w[j][1]; });
    });
    // above the modelled modes the board is dense: radiate the bridge force directly
    this.hp[0].set('hp', F_BODY, 0.5412, fs); this.hp[1].set('hp', F_BODY, 1.3066, fs);
  }

  damped(s) { return !s.down && !this.P?.lifted; }
  activate(s) {
    if (s.active) return;
    s.clear(); s.active = true; s.idle = 0;
    this.act[this.nAct++] = s;
  }

  noteOn(key, velocity) {
    const s = this.S[key];
    if (!s || !this.P) return;
    this.activate(s);
    s.down = true; s.vel = velocity; s.after = 0;
    s.FT = keyForce(key, velocity, this.P.force);
    const rise = riseTime(velocity, this.P.attack);
    s.up = s.FT / Math.max(1, rise * this.fs);
    s.setDamper(false, 0);
    this.focus = key;
  }
  noteOff(key) {
    const s = this.S[key];
    if (!s || !s.down) return;
    s.down = false; s.FT = 0;
    s.dn = Math.max(s.FN, 1e-6) / (0.015 * this.fs); // the key lifts the string off the wheel in 15 ms
  }
  allNotesOff() { // Panic: every string and the board to rest
    for (let i = 0; i < this.nAct; i++) { const s = this.act[i]; s.down = false; s.FT = 0; s.FN = 0; s.clear(); s.active = false; this.act[i] = null; }
    this.nAct = 0;
    if (this.M) { this.q1.fill(0); this.q2.fill(0); this.bodyE = 0; }
    this.hp[0].reset(); this.hp[1].reset(); this.mass.y = 0; this.dl.fill(0);
    if (this.P?.lifted) for (let k = RANGE[0]; k <= RANGE[1]; k++) this.activate(this.S[k]);
  }
  handle(m) {
    if (m.type === 'pressure') { // MIDI aftertouch: extra finger pressure on one key or all held keys
      for (let i = 0; i < this.nAct; i++) {
        const s = this.act[i];
        if (s.down && (m.key === null || m.key === undefined || m.key === s.key)) { s.after = m.value; s.FT = keyForce(s.key, s.vel, this.P.force, s.after); }
      }
    } else if (m.type === 'focus') this.focus = m.key;
  }
  voiceCount() { let n = 0; for (let i = 0; i < this.nAct; i++) if (this.act[i].down) n++; return n; }

  process(L, R, n) {
    if (!this.P || (this.nAct === 0 && this.bodyE < 1e-18)) { L.fill(0, 0, n); R.fill(0, 0, n); this.t += n; return; }
    const P = this.P, Fr = this.Fr, kB = this.kB, fs = this.fs, M = this.M, seg = this.seg, segOn = this.segOn;
    // the bridge segments that carry sounding strings this block
    let nSeg = 0;
    for (let g = 0; g < NSEG; g++) for (let j = 0; j < this.nAct; j++) if (this.act[j].seg === g) { segOn[nSeg++] = g; break; }
    const dph = (TAU * P.treadleRate) / fs, swing = P.treadle;
    const sDamp = 6.91 / P.damper, fo = this.S[this.focus];
    for (let i = 0; i < n; i++) {
      const vB = this.vB * (1 + swing * Math.sin(this.ph));
      this.ph += dph; if (this.ph > TAU) this.ph -= TAU;
      let za = 0;
      for (let j = 0; j < this.nAct; j++) { const s = this.act[j]; za += s.Z * s.ob; }
      const Vt = kB * za;
      for (let g = 0; g < NSEG; g++) seg[g] = 0;
      let ftot = 0;
      for (let j = 0; j < this.nAct; j++) {
        const s = this.act[j];
        if (s.FN !== s.FT) { // the key action: force ramps at the key's speed
          if (s.FN < s.FT) s.FN = Math.min(s.FT, s.FN + s.up);
          else if (s.FN > s.FT) { s.FN = Math.max(s.FT, s.FN - (s.down ? s.up : s.dn)); if (s.FN === 0 && this.damped(s)) s.setDamper(true, sDamp); }
        }
        const f = s.tick(Vt - s.kself * s.ob, vB, s.FN, Fr);
        seg[s.seg] += f; ftot += f;
      }
      // soundboard
      let l = 0, r = 0;
      for (let m = 0; m < M; m++) {
        const o = m * NSEG;
        let d = 0;
        for (let k = 0; k < nSeg; k++) d += this.drive[o + segOn[k]] * seg[segOn[k]];
        const q = this.a1[m] * this.q1[m] - this.a2[m] * this.q2[m] + d;
        const v = (q - this.q1[m]) * fs, wq = this.om[m] * q;
        this.q2[m] = this.q1[m]; this.q1[m] = q;
        l += this.wLr[m] * v - this.wLi[m] * wq;
        r += this.wRr[m] * v - this.wRi[m] * wq;
      }
      const hf = G_DIRECT * this.mass.run(this.hp[1].run(this.hp[0].run(ftot)));
      this.dl[this.dw] = hf; this.dw = (this.dw + 1) & 63;
      L[i] = OUT * (l + hf);
      R[i] = OUT * (r + this.dl[(this.dw - 23) & 63]);
      if (fo.active) { this.trace[this.tw] = fo.vs; this.tw = (this.tw + 1) % TRACE; }
      if (this.t + i === this.shotAt && fo.active) { fo.shape(this.shape); this.shot = true; }
    }
    this.t += n;
    let e = 0;
    for (let m = 0; m < M; m++) e += this.q1[m] * this.q1[m];
    this.bodyE = e;
    this.retire();
    if (this.post && (this.shot || this.t - this.lastPost >= 2 * POST_EVERY)) this.report();
  }

  // Strings that are damped and silent leave the loop (unless the dampers are lifted).
  retire() {
    let j = 0;
    for (let i = 0; i < this.nAct; i++) {
      const s = this.act[i];
      const quiet = !s.down && s.FN === 0 && !this.P.lifted && s.e < 1e-14 * s.os * 128;
      s.e = 0;
      s.idle = quiet ? s.idle + 1 : 0;
      if (s.idle > 8) { s.active = false; s.clear(); } else this.act[j++] = s;
    }
    for (let i = j; i < this.nAct; i++) this.act[i] = null;
    this.nAct = j;
  }

  // Post the focus string's state to the page, and schedule the next
  // stroboscopic snapshot: a whole number of (bowed) periods plus 1/48.
  report() {
    const s = this.S[this.focus];
    if (!s) return;
    if (s.active) s.motion(16, this.motion); else { this.motion.spp = 0; this.motion.kind = 'none'; }
    if (!s.active) this.shape.fill(0);
    for (let i = 0; i < TRACE; i++) this.traceOut[i] = this.trace[(this.tw + i) % TRACE];
    const P0 = this.fs / s.L.f0, Pact = this.motion.kind === 'helmholtz' ? P0 / this.motion.spp : P0;
    this.post({
      type: 'state', key: this.focus, FN: s.FN, FT: s.FT, vB: this.vB, beta: s.L.beta, down: s.down, active: s.active,
      kind: this.motion.kind, spp: this.motion.spp, shape: this.shape, trace: this.traceOut, period: Pact, f: this.fs / Pact,
    });
    this.lastPost = this.t;
    this.shot = false;
    const m = Math.ceil(POST_EVERY / Pact);
    this.shotF = (this.shotF ?? 0) + m * Pact + STROBE * Pact;
    if (this.shotF < this.t) this.shotF = this.t + Pact;
    this.shotAt = Math.round(this.shotF);
  }
}

globalThis.OrganistaEngine = OrganistaEngine;
