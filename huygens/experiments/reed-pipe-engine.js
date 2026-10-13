// pipe-engine.js — self-sounding reed pipes that share one windchest.
//
// Each key opens a pallet that admits chest pressure to a reed pipe:
//
//   reed (Bernoulli valve):  ũ = ζ (1 − x) √|x| sgn x,  x = γ − p̃  (x ≥ 1: reed shut)
//   pipe (modal input impedance, peaks A_n at n·f₁, quality Q_n):
//       p̃_n'' + (ω_n/Q_n) p̃_n' + ω_n² p̃_n = 2σ_n A_n ũ'
//
// in units where pressure is scaled by the reed-closing pressure P_M and
// flow by P_M/Z_c. Above a threshold blowing pressure γ ≈ ⅓ the pair
// self-oscillates near the first resonance, with a rich harmonic spectrum.
//
// The coupling is the chest. All open pipes draw on it:
//   dγ_c/dt = κ (⟨U⟩ − Σ ũ_i) + regulator,    κ = c S / V,
// so every pipe's flow (all its harmonics) modulates every other pipe's
// blowing pressure. A small chest (large κ) couples strongly.
//
// Why pipes and not strings: an oscillator's locking range scales with its
// resonator bandwidth (Adler: Δf/f ≈ injection/2Q). Strings (Q ~ 10³) barely
// lock; pipes (Q ~ 20–60) lock over musical detunings.

const TWO_PI = 2 * Math.PI;
const OUT_SCALE = 0.05;

export const PIPE_DEFAULTS = {
  gamma: 0.5,       // supply pressure / reed-closing pressure
  zeta: 0.35,       // reed opening parameter
  kappa: 400,       // chest coupling c·S/V, 1/s (small chest → large κ)
  droop: 0.05,      // regulator droop: steady pressure drop per unit total flow
  regulator: 40,    // regulator bandwidth, Hz: it handles everything slower
  attack: 0.03,     // pallet opening time, s
  release: 0.02,
  noise: 1e-4,      // turbulence that seeds the oscillation
  drift: 0, driftRate: 0.25,
  master: 1, width: 0.5,
  maxPipes: 24,
};

function coeffs(om, sig, k) {
  const r = Math.exp(-sig * k), od = Math.sqrt(Math.max(om * om - sig * sig, 1e-6));
  return [2 * r * Math.cos(od * k), r * r, (k * r * Math.sin(od * k)) / od];
}

class Pipe {
  constructor(eng, key, d) {
    const N = d.n, k = eng.k;
    this.key = key; this.version = d.version; this.N = N; this.k = k; this.fs = eng.fs;
    this.f1 = d.f1; this.fTarget = d.fTarget;
    const F = () => new Float64Array(N);
    this.x = F(); this.x1 = F(); this.a1 = F(); this.a2 = F(); this.b = F(); this.Ck = F();
    this.om = F(); this.sig = F(); this.C = F(); this.rad = F();
    let z = 0;
    for (let i = 0; i < N; i++) {
      const om = TWO_PI * d.freq[i], Q = d.Q[i], sig = om / (2 * Q);
      this.om[i] = om; this.sig[i] = sig;
      this.C[i] = 2 * sig * d.A[i];
      const [a1, a2, b] = coeffs(om, sig, k);
      this.a1[i] = a1; this.a2[i] = a2; this.b[i] = b;
      this.Ck[i] = this.C[i] / k;
      this.rad[i] = d.rad[i];
      z += (this.C[i] * b) / k;
    }
    this.z = z;
    this.open = 0; this.keyDown = true; this.dead = false; this.quiet = 0;
    this.u = 0; this.p = 0; this.p1prev = 0;
    this.cross = new Float64Array(256); this.nc = 0;
    this.drift = 0; this.driftCents = 0;
    this.period = eng.fs / d.fTarget;
    const xp = Math.max(-1, Math.min(1, ((key - 66) / 30) * eng.p.width));
    this.panL = Math.cos(((xp + 1) * Math.PI) / 4) * Math.SQRT2;
    this.panR = Math.sin(((xp + 1) * Math.PI) / 4) * Math.SQRT2;
    this.zeta = eng.p.zeta;
  }

  applyDrift(eng, dt) {
    const p = eng.p;
    if (p.drift <= 0 && this.driftCents === 0) return;
    const tau = 1 / Math.max(0.01, p.driftRate);
    const g = Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(TWO_PI * Math.random());
    this.drift += (-this.drift / tau) * dt + p.drift * Math.sqrt((2 * dt) / tau) * g;
    this.driftCents = p.drift > 0 ? this.drift : 0;
    const s = 2 ** (this.driftCents / 1200);
    for (let i = 0; i < this.N; i++) {
      const [a1, a2] = coeffs(this.om[i] * s, this.sig[i], this.k);
      this.a1[i] = a1; this.a2[i] = a2;
    }
  }

  // one sample; gc = chest pressure; returns radiated output
  step(gc, eng, t) {
    const N = this.N, x = this.x, x1 = this.x1, A1 = this.a1, A2 = this.a2, CK = this.Ck;
    const pa = eng.p;
    this.open += ((this.keyDown ? 1 : 0) - this.open) * (this.keyDown ? eng.attackAlpha : eng.releaseAlpha);
    const gamma = gc * this.open;
    let pf = 0, p1 = 0;
    for (let i = 0; i < N; i++) {
      const x0 = x[i], xn = A1[i] * x0 - A2[i] * x1[i];
      x1[i] = x0; x[i] = xn;
      pf += CK[i] * (xn - x0);
    }
    // reed: solve ũ = F(γ − p_free − z ũ) by safeguarded Newton
    const z = this.z, zeta = this.zeta;
    const Fr = (xx) => (xx >= 1 ? 0 : zeta * (1 - xx) * Math.sqrt(Math.abs(xx)) * (xx >= 0 ? 1 : -1));
    let u = this.u, lo = -50, hi = 50;
    for (let it = 0; it < 30; it++) {
      const xx = gamma - pf - z * u;
      const h = u - Fr(xx);
      if (Math.abs(h) < 1e-12) break;
      if (h > 0) hi = u; else lo = u;
      // dF/dx
      let dF = 0;
      if (xx < 1 && Math.abs(xx) > 1e-9) {
        const s = Math.sqrt(Math.abs(xx));
        dF = zeta * (-s + ((1 - xx) * 0.5) / s);
      }
      const dh = 1 + z * dF;
      let un = dh > 1e-6 ? u - h / dh : 0.5 * (lo + hi);
      if (!(un > lo && un < hi)) un = 0.5 * (lo + hi);
      u = un;
    }
    if (this.open > 1e-4) u += pa.noise * (Math.random() - 0.5) * this.open;
    let out = 0;
    const B = this.b, RAD = this.rad;
    for (let i = 0; i < N; i++) {
      x[i] += B[i] * u;
      const pn = CK[i] * (x[i] - x1[i]);   // pressure in mode n
      out += RAD[i] * pn;
      if (i === 0) p1 = pn;
    }
    this.p = pf + z * u;
    this.u = u;
    // zero crossings of the first mode's pressure → frequency
    if (this.p1prev < 0 && p1 >= 0) {
      this.cross[this.nc & 255] = t - 1 + this.p1prev / (this.p1prev - p1);
      this.nc++;
    }
    this.p1prev = p1;
    return out;
  }

  frequency(t, win) {
    const n = Math.min(this.nc, 256);
    if (n < 4) return 0;
    const last = this.cross[(this.nc - 1) & 255];
    if (t - last > 3 * this.period) return 0;
    let first = last, cnt = 0;
    for (let j = 1; j <= n; j++) {
      const ts = this.cross[(this.nc - j) & 255];
      if (last - ts > win * this.fs) break;
      first = ts; cnt = j;
    }
    return cnt >= 3 ? ((cnt - 1) * this.fs) / (last - first) : 0;
  }
}

export class PipeEngine {
  constructor(fs) {
    this.fs = fs; this.k = 1 / fs;
    this.p = { ...PIPE_DEFAULTS };
    this.pipes = []; this.byKey = new Map();
    this.t = 0;
    this.gc = this.p.gamma;      // chest pressure
    this.Ulp = 0;                // regulator's view of the average flow
    this.ripple = 0;             // audio-rate chest pressure ripple
    this.listeners = [];
    this.update();
  }
  emit(ev) { for (const f of this.listeners) f(ev); }
  update() {
    this.attackAlpha = 1 - Math.exp(-this.k / Math.max(1e-3, this.p.attack));
    this.releaseAlpha = 1 - Math.exp(-this.k / Math.max(1e-3, this.p.release));
    this.regAlpha = 1 - Math.exp(-this.k * TWO_PI * this.p.regulator);
    this.regRate = TWO_PI * this.p.regulator;
  }
  setParams(p) {
    this.p = { ...this.p, ...p };
    for (const pp of this.pipes) pp.zeta = this.p.zeta;
    this.update();
  }
  noteOn(key, data) {
    let pp = this.byKey.get(key);
    if (pp && !pp.dead && pp.version === data.version) { pp.keyDown = true; return pp; }
    if (pp) pp.keyDown = false;
    pp = new Pipe(this, key, data);
    this.pipes.push(pp); this.byKey.set(key, pp);
    if (this.pipes.length > this.p.maxPipes) (this.pipes.find((x) => !x.keyDown) || this.pipes[0]).dead = true;
    return pp;
  }
  noteOff(key) { const pp = this.byKey.get(key); if (pp) pp.keyDown = false; }
  allOff() { for (const pp of this.pipes) pp.keyDown = false; }

  process(L, R, n) {
    const ps = this.pipes, p = this.p, k = this.k;
    for (const pp of ps) pp.applyDrift(this, n * k);
    const g = OUT_SCALE * p.master;
    for (let i = 0; i < n; i++) {
      let l = 0, r = 0, U = 0;
      const gc = this.gc;
      for (let j = 0; j < ps.length; j++) {
        const pp = ps[j], o = pp.step(gc, this, this.t);
        U += pp.u * pp.open;
        l += pp.panL * o; r += pp.panR * o;
      }
      // chest: a compliance 1/κ drained by every open pipe. The regulator
      // (bellows + weights) supplies the *average* flow and restores the
      // average pressure, slowly (~10 Hz); at audio frequencies the chest
      // pressure ripples by κ∫(U_avg − U)dt, and that ripple couples the pipes.
      this.Ulp += this.regAlpha * (U - this.Ulp);
      this.ripple += k * (-p.kappa * (U - this.Ulp) - this.regRate * this.ripple);
      this.gc = p.gamma - p.droop * this.Ulp + this.ripple;
      L[i] = g * l; R[i] = g * r;
      this.t++;
    }
    let j = 0;
    for (const pp of ps) {
      if (!pp.keyDown && pp.open < 1e-4) {
        let e = 0;
        for (let i = 0; i < pp.N; i++) { const v = pp.x[i] - pp.x1[i]; e += v * v; }
        pp.quiet = e < 1e-20 ? pp.quiet + 1 : 0;
        if (pp.quiet > 20) pp.dead = true;
      }
      if (pp.dead) { if (this.byKey.get(pp.key) === pp) this.byKey.delete(pp.key); } else ps[j++] = pp;
    }
    ps.length = j;
  }

  report(win = 0.3) {
    return this.pipes.map((pp) => ({ key: pp.key, f: pp.keyDown ? pp.frequency(this.t, win) : 0, fTarget: pp.fTarget, drift: pp.driftCents, open: pp.open }));
  }
}

globalThis.PipeEngine = PipeEngine;
