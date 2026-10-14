// quantum-engine.js — the real-time part. Runs in the AudioWorklet (through
// shared/worklet.js) and in Node (tests, renders).
//
// Each voice is one wavepacket, |ψ(t)⟩ = Σ cₙ e^(−iEₙt/ħ)|n⟩, summed exactly:
//   * one unit phasor aₙ = e^(−iθₙ·count) per state. Its phase is recomputed from the
//     integer sample count at the start of every block (cos/sin in double precision),
//     then rotated sample by sample inside the block, so phases never drift and a
//     revival 10⁵ periods later is still sample-accurate;
//   * the detector signal is the sum over pairs (m, n) of w_mn·Re(a_m* aₙ) = w_mn cos ω_mn t
//     (or w_mn·Im(a_m* aₙ) = −w_mn sin ω_mn t for the coil);
//   * pairs are grouped by Δn = k: pure dephasing multiplies group k by e^(−k²t/T_φ),
//     population decay multiplies everything by e^(−t/T₁);
//   * the pump pulse builds the packet over its own duration τ = 1/(√2 σ ω): the
//     coherences grow as g(t)², g = ½(1 + erf(t/√2τ)).

import { keyPan } from '../../shared/dsp.js';
import { makePacket } from './quantum-model.js';

const OUT = 0.3;        // launch peak at full velocity
const MAX_VOICES = 24;
const TAU_MIN = 1e-4;   // shortest pump ramp, s (keeps the onset below Nyquist)
const DC_FADE = 0.06;    // s: the electrode's AC coupling (a raised-cosine fade, sub-audio)

function erf(x) { // Abramowitz & Stegun 7.1.26, |error| < 1.5e-7
  const s = x < 0 ? -1 : 1, a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a));
}

class Voice {
  constructor(eng, key, vel, pk) {
    const fs = eng.fs, NP = pk.pairs.length;
    this.key = key; this.pk = pk; this.NP = NP;
    // States lo..hi (every state some pair uses). Pairs come sorted by Δn = k and then
    // by i, so each group k is a contiguous run of i: (i, i+k), i = a…b−1.
    let lo = Infinity, hi = -Infinity;
    for (const p of pk.pairs) { lo = Math.min(lo, p.i); hi = Math.max(hi, p.j); }
    const S = NP ? hi - lo + 1 : 0, Eref = NP ? pk.E[lo] : 0;
    this.S = S;
    this.th = new Float64Array(S); this.cr = new Float64Array(S); this.ci = new Float64Array(S);
    this.re = new Float64Array(S); this.im = new Float64Array(S);
    for (let s = 0; s < S; s++) {
      const th = (2 * Math.PI * pk.scale * (pk.E[lo + s] - Eref)) / fs;
      this.th[s] = th; this.cr[s] = Math.cos(th); this.ci[s] = Math.sin(th);
    }
    const groups = [];
    for (const p of pk.pairs) {
      const g = groups[groups.length - 1];
      if (g && g.k === p.k) { g.w[p.i - lo - g.a] = p.w; g.b = Math.max(g.b, p.i - lo + 1); }
      else groups.push({ k: p.k, a: p.i - lo, b: p.i - lo + 1, w: { [0]: p.w } });
    }
    const G = groups.length;
    let nw = 0;
    for (const g of groups) nw += g.b - g.a;
    this.G = G; this.w = new Float64Array(nw);
    this.gk = new Int32Array(G); this.ga = new Int32Array(G); this.gb = new Int32Array(G); this.gw = new Int32Array(G);
    this.gD = new Float64Array(G).fill(1); this.gR = new Float64Array(G).fill(1);
    nw = 0;
    groups.forEach((g, q) => {
      this.gk[q] = g.k; this.ga[q] = g.a; this.gb[q] = g.b; this.gw[q] = nw;
      for (let i = g.a; i < g.b; i++) this.w[nw++] = g.w[i - g.a] || 0;
    });
    this.useIm = pk.d === 1;
    // the electrode's Franck–Condon offset, faded out by its AC coupling over DC_FADE
    this.dc = pk.dc || 0; this.dcEnd = Math.round(DC_FADE * fs);
    // pump pulse: τ = 1/(√2 σ ω_cl); the coherences start at count = −4τ·fs
    const tau = Math.max(TAU_MIN, 1 / (Math.SQRT2 * pk.sigma * 2 * Math.PI * pk.pitch));
    this.rampK = 1 / (Math.SQRT2 * tau * fs);
    this.count = -Math.ceil(4 * tau * fs);
    this.rampEnd = -this.count;
    this.env = OUT * vel;
    this.pan = keyPan(key);
    this.released = false; this.quench = false; this.stolen = false; this.dead = false;
    this.rates(eng);
  }
  rates(eng) { // T₁ (or the release quench) and T_φ, applied live
    const P = eng.P, fs = eng.fs;
    const T1 = this.stolen ? 0.005 : this.quench ? P.release : P.T1;
    this.r1 = Math.exp(-1 / (fs * T1));
    const G = Math.max(0, P.dephase || 0); // Γ_φ = 1/T_φ
    for (let g = 0; g < this.G; g++) this.gR[g] = Math.exp(-(this.gk[g] * this.gk[g] * G) / fs);
  }
  // Exact phases from the sample counter: aₙ = e^(−iθₙ·count).
  sync() {
    const c = this.count;
    for (let s = 0; s < this.S; s++) { const ph = this.th[s] * c; this.re[s] = Math.cos(ph); this.im[s] = -Math.sin(ph); }
  }
  render(L, R, n) {
    this.sync();
    const { re, im, cr, ci, w, gD, gR, gk, ga, gb, gw, S, G, useIm } = this;
    const gl = this.pan[0], gr = this.pan[1];
    let env = this.env;
    for (let t = 0; t < n; t++) {
      const c = ++this.count, dec = c >= 0; // decoherence clocks start at the pump's centre
      for (let s = 0; s < S; s++) {
        const x = re[s], y = im[s];
        re[s] = x * cr[s] + y * ci[s]; im[s] = y * cr[s] - x * ci[s];
      }
      let acc = 0;
      for (let g = 0; g < G; g++) {
        const D = gD[g];
        if (D === 0) continue;
        const k = gk[g], b = gb[g];
        let q = gw[g], sum = 0;
        if (useIm) for (let i = ga[g]; i < b; i++, q++) sum += w[q] * (re[i] * im[i + k] - im[i] * re[i + k]);
        else for (let i = ga[g]; i < b; i++, q++) sum += w[q] * (re[i] * re[i + k] + im[i] * im[i + k]);
        acc += D * sum;
        if (dec) { const Dn = D * gR[g]; gD[g] = Dn < 1e-9 ? 0 : Dn; }
      }
      let ramp = 1;
      if (c < this.rampEnd) { const gg = 0.5 * (1 + erf(c * this.rampK)); ramp = gg * gg; }
      if (this.dc && c > 0) acc -= c < this.dcEnd ? 0.5 * this.dc * (1 + Math.cos((Math.PI * c) / this.dcEnd)) : 0;
      else acc -= this.dc;
      const v = env * ramp * acc;
      L[t] += gl * v; R[t] += gr * v;
      if (dec) env *= this.r1;
    }
    this.env = env;
    if (env < 3e-6) this.dead = true;
  }
}

export class QuantumEngine {
  constructor(fs) {
    this.fs = fs;
    this.P = null;
    this.voices = [];
    this.sustain = false;
  }
  setParams(P) {
    this.P = P;
    for (const v of this.voices) v.rates(this);
  }
  setSustain(on) {
    this.sustain = on;
    if (!on) for (const v of this.voices) if (v.released && !v.quench) { v.quench = true; v.rates(this); }
  }
  // data: the packet precomputed by the page (makePacket); computed here if absent.
  // A restrike excites a fresh packet; the old one rings on (or is already quenching).
  noteOn(key, velocity, data) {
    if (!this.P) return;
    const pk = data && data.pairs ? data : makePacket(key, this.P, { fMax: Math.min(20000, 0.45 * this.fs) });
    if (!pk.pairs.length) return;
    this.voices.push(new Voice(this, key, velocity, pk));
    let live = 0;
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      if (v.stolen) continue;
      if (++live > MAX_VOICES) { v.stolen = true; v.rates(this); }
    }
  }
  noteOff(key) {
    for (const v of this.voices) if (v.key === key && !v.released) {
      v.released = true;
      if (!this.sustain) { v.quench = true; v.rates(this); }
    }
  }
  allNotesOff() { this.voices.length = 0; }
  voiceCount() { return this.voices.length; }
  process(L, R, n) {
    L.fill(0, 0, n); R.fill(0, 0, n);
    for (const v of this.voices) v.render(L, R, n);
    let j = 0; // drop finished voices in place (no allocation)
    for (let i = 0; i < this.voices.length; i++) if (!this.voices[i].dead) this.voices[j++] = this.voices[i];
    this.voices.length = j;
  }
}

globalThis.QuantumEngine = QuantumEngine;
