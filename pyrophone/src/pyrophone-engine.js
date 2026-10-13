// pyrophone-engine.js — the real-time part: one Rijke-tube Galerkin model per
// sounding key. Runs in the AudioWorklet (through shared/worklet.js) and in Node.
//
// Each tube integrates N acoustic modes in its own time (units of L/c). A mode
// is advanced by the exact solution of η̈ + ζη̇ + ω²η = F over one sample with F
// held constant (zero-order hold), so the linear acoustics is exact at any
// pitch; the flame couples the modes through the delayed, nonlinear heat
// release. The ZOH delays the force by half a sample on average, so the flame's
// delay line is read half a sample early to keep the lag exactly τ.

import { keyFreq, keyPan } from '../../shared/dsp.js';
import { tube, tubeKey, heat, tuning, betaOn, T_HOT } from './pyrophone-model.js';

const TAU = 2 * Math.PI;
const OUT = 0.045;          // output scale: a forte note peaks ≈ 0.2–0.4
const HIST = 2048;          // flame delay line (samples): τ ≤ 1.5 L/c down to 60 Hz
const MAXV = 24;
const F_TURB = 300;         // Hz, corner of the flame's turbulence spectrum
const SEP = 0.012;          // s, time for the flames to part or rejoin
const POST_EVERY = 0.016;   // s, view updates
const PRESS = 0.25;         // aftertouch: full pressure parts the flames 25 % further
const PUFF = 3;             // extra turbulence just after the flames part (× velocity)

class Voice {
  constructor(eng, key) {
    const N = eng.sys.N;
    this.key = key; this.N = N; this.fs = eng.fs;
    const F = () => new Float64Array(N);
    this.eta = F(); this.vel = F(); this.cf = F(); this.g = F(); this.wo = F();
    this.m11 = F(); this.m12 = F(); this.m21 = F(); this.m22 = F(); this.b1 = F();
    this.hist = new Float64Array(HIST); this.hw = 0;
    this.pan = keyPan(key, 0.6, 48, 84);
    this.beta = 0; this.betaT = 0; this.press = 0; this.vel0 = 0;
    this.xf = -1; this.h = 0; this.dampKey = '';
    this.gain = 1; this.fade = 0; this.dead = false;
    this.turb = 0; this.amp = 0; this.amp2 = 0; this.peak = 0; this.keyDown = false; this.age = 0; this.since = 0; this.rel = 0; this.chkT = 0; this.chkA = Infinity;
    // strobe + phase portrait for the views
    this.prevE1 = 0; this.period = 100; this.sinceZ = 0; this.strobe = 0; this.snapAt = -1; this.wantSnap = false; this.watch = false;
    this.trail = new Float32Array(512); this.ti = 0; this.tdec = 1; this.tcount = 0;
    this.snap = new Float32Array(2 * N); this.snapped = false;
    this.theta = eng.coolTheta(key);
  }

  // Tube length from the tuning: the steady limit cycle (at this β) lands on
  // the key's frequency when the gas is fully warm, f = W c_hot / (2π L).
  tune(eng, beta) {
    const W = eng.tune.W(eng.P.autotune ? beta : betaOn(eng.P, 0.7));
    this.W = W;
    this.hHot = (TAU * keyFreq(this.key)) / (W * this.fs); // L/c_hot units per sample
  }

  coeffs(eng) {
    const P = eng.P, sys = eng.sys, N = this.N;
    if (this.xf !== P.xf) {
      this.xf = P.xf;
      const a = P.listen, norm = 1 / (1 + a);
      for (let j = 0; j < N; j++) {
        this.cf[j] = sys.cf[j]; this.g[j] = sys.g[j];
        // radiated pressure ∝ d/dt[u(1) − a·u(0)]: top mouth plus (a ×) the bottom mouth
        this.wo[j] = ((j % 2 ? 1 : -1) - a) * norm;
      }
    }
    // gas temperature → sound speed → this tube's time step
    const T = T_HOT - P.drift * (1 - this.theta), h = this.hHot * Math.sqrt(T / T_HOT);
    if (h !== this.h || eng.dampKey !== this.dampKey) {
      this.h = h; this.dampKey = eng.dampKey;
      for (let j = 0; j < N; j++) {
        const w0 = sys.w[j], s = sys.zeta[j] / 2, wd = Math.sqrt(w0 * w0 - s * s);
        const e = Math.exp(-s * h), c = Math.cos(wd * h), sn = Math.sin(wd * h) / wd;
        this.m11[j] = e * (c + s * sn); this.m12[j] = e * sn;
        this.m21[j] = -e * w0 * w0 * sn; this.m22[j] = e * (c - s * sn);
        this.b1[j] = (1 - this.m11[j]) / (w0 * w0);
      }
    }
    this.d = Math.min(HIST - 4, Math.max(0, P.lag / h - 0.5));
  }

  render(eng, L, R, n) {
    const N = this.N, eta = this.eta, vel = this.vel, cf = this.cf, g = this.g, wo = this.wo;
    const m11 = this.m11, m12 = this.m12, m21 = this.m21, m22 = this.m22, b1 = this.b1;
    const hist = this.hist, mask = HIST - 1, di = Math.floor(this.d), fr = this.d - di;
    // turbulence rms; parting the flames stirs the gas: a puff that settles in ~40 ms
    const puff = 1 + PUFF * (this.keyDown ? this.vel0 : 0) * Math.exp(-this.since / 0.04);
    const kb = eng.kSep, eps = eng.P.noise * eng.turbNorm * puff, kt = eng.kTurb;
    const W = this.W, iW2 = 1 / (W * W), c1 = Math.abs(cf[0]);
    const [gl, gr] = this.pan, og = OUT * this.gain;
    let hw = this.hw, beta = this.beta, turb = this.turb, seed = eng.seed;
    let fade = this.fade, gain = 1, peak = 0;
    for (let i = 0; i < n; i++) {
      beta += kb * (this.betaT - beta);
      // flame velocity now, and as the flame felt it τ ago
      let uf = 0;
      for (let j = 0; j < N; j++) uf += cf[j] * eta[j];
      hist[hw] = uf; hw = (hw + 1) & mask;
      const a = hist[(hw - 1 - di) & mask], b = hist[(hw - 2 - di) & mask];
      // turbulence at the flame: low-passed white noise, rms = noise (× mean draught)
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      turb += kt * ((seed / 2147483648) - turb);
      const q = beta * heat(a + fr * (b - a) + eps * turb);
      let y = 0;
      for (let j = 0; j < N; j++) {
        const F = g[j] * q, e = eta[j], v = vel[j];
        eta[j] = m11[j] * e + m12[j] * v + b1[j] * F;
        const vn = m21[j] * e + m22[j] * v + m12[j] * F;
        vel[j] = vn; y += wo[j] * vn;
      }
      if (fade > 0) { gain = Math.max(0, 1 - fade / eng.fadeLen); fade++; }
      const s = og * gain * y;
      L[i] += gl * s; R[i] += gr * s;
      // mode-1 amplitude at the flame (the bifurcation diagram's y axis)
      const e1 = eta[0], v1 = vel[0], amp = c1 * Math.sqrt(e1 * e1 + v1 * v1 * iW2);
      if (amp > peak) peak = amp;
      if (this.watch) this.observe(e1, v1);
    }
    this.hw = hw; this.beta = beta; this.turb = turb; eng.seed = seed; this.fade = fade;
    this.amp = Math.sqrt(eta[0] * eta[0] + vel[0] * vel[0] * iW2) * c1;
    this.amp2 = Math.sqrt(eta[1] * eta[1] + vel[1] * vel[1] * iW2 * 0.25) * Math.abs(cf[1]);
    this.peak = peak;
    if (fade >= eng.fadeLen) this.dead = true;
    if (!Number.isFinite(this.amp)) { this.dead = true; eta.fill(0); vel.fill(0); hist.fill(0); }
  }

  // Strobe: snapshot the modes at a phase that advances by 1/48 cycle per view
  // frame (a slow-motion picture of the real cycle), and keep a trail of mode 1.
  observe(e1, v1) {
    this.sinceZ++;
    if (this.prevE1 < 0 && e1 >= 0) {
      if (this.sinceZ > 4) this.period = 0.8 * this.period + 0.2 * this.sinceZ;
      this.sinceZ = 0;
      if (this.wantSnap) { this.snapAt = Math.round(this.strobe * this.period); this.wantSnap = false; }
    }
    this.prevE1 = e1;
    if (this.sinceZ === this.snapAt) {
      for (let j = 0; j < this.N; j++) { this.snap[j] = this.eta[j]; this.snap[this.N + j] = this.vel[j]; }
      this.snapAt = -1; this.snapped = true; this.strobe = (this.strobe + 1 / 48) % 1;
    }
    if (++this.tcount >= this.tdec) {
      this.tcount = 0;
      this.trail[this.ti] = e1; this.trail[this.ti + 1] = v1 / this.W; this.ti = (this.ti + 2) % this.trail.length;
    }
  }
}

export class PyrophoneEngine {
  constructor(fs) {
    this.fs = fs;
    this.P = null; this.sys = null; this.tune = null;
    this.voices = [];
    this.warm = new Float64Array(128); this.warmAt = new Float64Array(128);
    this.time = 0; this.seed = 0x2545f491; this.focus = -1; this.sincePost = 0; this.pressure = 0;
    this.kSep = 1 - Math.exp(-1 / (SEP * fs));
    this.kTurb = 1 - Math.exp((-TAU * F_TURB) / fs);
    // uniform(−1,1) has rms 1/√3; a one-pole with coefficient k keeps k/(2−k) of the variance
    this.turbNorm = Math.sqrt(3 * (2 - this.kTurb) / this.kTurb);
    this.fadeLen = Math.round(0.03 * fs);
  }

  setParams(P) {
    const old = this.P;
    this.P = P;
    const key = tubeKey(P);
    if (!old || key !== this.tubeKey) {
      this.tubeKey = key;
      this.sys = tube(P);
      this.dampKey = `${P.bore}|${P.damp}`;
      // The page sends the tuning precomputed (P.tune); in Node it is computed
      // here, lazily, at the next note-on. While a slider is dragged the page may
      // still send the previous table: keep using it until the new one arrives.
      if (!P.tune) this.tune = null;
    }
    if (P.tune && P.tune !== this.tuneSrc && (P.tune.key === key || !this.tune)) { this.tuneSrc = P.tune; this.setTune(P.tune); }
    if (old && old.listen !== P.listen) for (const v of this.voices) v.xf = -1;
    // held keys follow the flame power (mod wheel); released ones the key-up power
    for (const v of this.voices) v.betaT = v.keyDown ? betaOn(P, v.vel0) * (1 + PRESS * v.press) : this.betaUp();
  }
  setTune(t) { this.tune = unpack(t); this.betaH = t.betaH; }
  tuneNow() { if (!this.tune) this.setTune(tuning(this.P)); return this.tune; }
  betaUp() { return this.P.keyup * (this.betaH ?? this.tuneNow().betaH); }

  coolTheta(key) { // the tube's warmth, cooled since it last sounded
    return this.warm[key] * Math.exp(-(this.time - this.warmAt[key]) / (this.P.warm * this.fs));
  }

  noteOn(key, velocity) {
    if (!this.P) return;
    this.tuneNow();
    let v = this.voices.find((x) => x.key === key && !x.fade);
    const beta = betaOn(this.P, velocity);
    if (!v) {
      if (this.voices.length >= MAXV) this.steal();
      v = new Voice(this, key);
      v.tune(this, beta);
      this.voices.push(v);
    } else if (v.amp < 0.02) v.tune(this, beta); // a silent tube may be re-cut; a singing one keeps its length
    v.vel0 = velocity; v.press = this.pressure; v.since = 0;
    v.keyDown = true;
    v.betaT = beta * (1 + PRESS * v.press);
    this.focus = key;
  }
  noteOff(key) {
    for (const v of this.voices) if (v.key === key && v.keyDown) { v.keyDown = false; v.betaT = this.betaUp(); v.rel = 0; v.chkT = 0; v.chkA = Infinity; }
  }
  steal() {
    let best = null;
    for (const v of this.voices) if (!v.fade && (!best || (!v.keyDown && best.keyDown) || (v.keyDown === best.keyDown && v.amp < best.amp))) best = v;
    if (best) best.fade = 1;
  }
  allNotesOff() { for (const v of this.voices) { this.store(v); } this.voices = []; }
  store(v) { this.warm[v.key] = v.theta; this.warmAt[v.key] = this.time; }
  handle(m) {
    if (m.type === 'pressure') { // aftertouch: lean on a key to part its flames further
      if (m.key == null) this.pressure = m.value;
      for (const v of this.voices) if (v.keyDown && (m.key == null || m.key === v.key)) { v.press = m.value; v.betaT = betaOn(this.P, v.vel0) * (1 + PRESS * m.value); }
    }
  }
  voiceCount() { return this.voices.length; }

  process(L, R, n) {
    L.fill(0, 0, n); R.fill(0, 0, n);
    if (!this.P) return;
    const P = this.P, dt = n / this.fs, kw = 1 - Math.exp(-dt / P.warm);
    for (const v of this.voices) {
      // warm-up: the gas heats while the flames are apart, cools when they rejoin
      v.theta += kw * ((v.keyDown ? 1 : 0) - v.theta);
      v.watch = v.key === this.focus;
      v.coeffs(this);
      v.render(this, L, R, n);
      v.age += dt; v.since += dt; v.rel += dt;
      // A released tube that has stopped singing fades out and is freed: once it
      // is inaudible, or once it is quiet and no longer dying away (only the
      // flames' breath is left).
      if (!v.keyDown && !v.fade) {
        if (v.peak < 1e-3) v.fade = 1;
        else if (v.rel > 0.25 && v.peak < 0.05 && v.rel - v.chkT > 0.1) {
          if (v.peak > 0.8 * v.chkA) v.fade = 1;
          v.chkT = v.rel; v.chkA = v.peak;
        }
      }
    }
    this.time += n;
    for (const v of this.voices) if (v.dead) this.store(v);
    if (this.voices.some((v) => v.dead)) this.voices = this.voices.filter((v) => !v.dead);
    this.sincePost += dt;
    if (this.post && this.sincePost >= POST_EVERY) { this.sincePost = 0; this.report(); }
  }

  // Live data for the page: every tube's operating point, and the focused tube's
  // strobed mode snapshot and mode-1 trail.
  report() {
    const pts = this.voices.map((v) => [v.key, v.beta, v.amp, v.amp2, v.keyDown ? 1 : 0, v.theta]);
    const f = this.voices.find((v) => v.key === this.focus && !v.fade);
    const msg = { type: 'tubes', pts };
    if (f) {
      f.wantSnap = true;
      f.tdec = Math.max(1, Math.round(f.period / 48));
      const T = T_HOT - this.P.drift * (1 - f.theta);
      msg.focus = {
        key: f.key, W: f.W, beta: f.beta, amp: f.amp, theta: f.theta, T,
        cents: 1200 * Math.log2(Math.sqrt(T / T_HOT)),
        period: f.period / this.fs, trail: f.trail, ti: f.ti,
        snap: f.snapped ? f.snap : null,
      };
      f.snapped = false;
    }
    this.post(msg);
  }
}

// The tuning table, as sent by the page: W(β) on a grid (see tuning() in the model).
function unpack(t) {
  const { b0, db, Ws } = t;
  return {
    ...t,
    W(beta) {
      const x = Math.min(Ws.length - 1.001, Math.max(0, (beta - b0) / db)), i = Math.floor(x), f = x - i;
      return Ws[i] + f * (Ws[i + 1] - Ws[i]);
    },
  };
}

globalThis.PyrophoneEngine = PyrophoneEngine;
