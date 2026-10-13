// sync-engine.js — bowed strings on one shared bridge.
//
// Each sample:
//   1. every string advances its modes freely (exact damped-oscillator step)
//      and its bow solves the stick–slip friction law against the string's
//      admittance at the bow (hyperbolic friction curve, stick when possible);
//   2. the shared bridge is solved *implicitly* (a 2×2 linear system for its
//      resistive and springy parts), so arbitrarily strong coupling is stable;
//   3. the bridge's reaction is applied to every mode of every string.
//
// The bridge is the only thing connecting notes. When the harmonics of two
// strings nearly coincide (p·f_low ≈ q·f_high), it pulls them into exact
// p:q lock. Each string's frequency is measured from its slip events
// (Helmholtz motion slips once per period), so lock can be read off directly.

const TWO_PI = 2 * Math.PI;
const OUT_SCALE = 0.015;

export const SYNC_DEFAULTS = {
  react: 0,          // 0 = resistive bridge … 1 = springy bridge
  mus: 0.8, mud: 0.3, v0: 0.1,
  pressure: 0.5,     // position in the Schelleng window, log scale
  attack: 0.05,
  releaseDamp: 6,
  drift: 0, driftRate: 0.25,
  master: 1, width: 0.5,
  maxStrings: 24,
};

function coeffs(om, sig, k) {
  const r = Math.exp(-sig * k), od = Math.sqrt(Math.max(om * om - sig * sig, 1e-6));
  return [2 * r * Math.cos(od * k), r * r, (k * r * Math.sin(od * k)) / od];
}

class BowedString {
  constructor(eng, key, d, vB) {
    const N = d.n, k = eng.k;
    this.key = key; this.version = d.version; this.N = N; this.k = k; this.fs = eng.fs;
    const F = () => new Float64Array(N);
    this.q = F(); this.q1 = F();
    this.a1 = F(); this.a2 = F(); this.a1r = F(); this.a2r = F();
    this.bphi = F(); this.pb = F(); this.fc = F(); this.fd = F(); this.ck = F(); this.dd = F(); this.ok = F();
    this.om0 = F(); this.sig = F(); this.b = F();
    let Y = 0, A = 0, Bcd = 0, Cdc = 0, D = 0, cbp = 0, dbp = 0;
    for (let i = 0; i < N; i++) {
      const om = TWO_PI * d.freq[i];
      this.om0[i] = om; this.sig[i] = d.sigma[i];
      const [a1, a2, b] = coeffs(om, d.sigma[i], k);
      this.a1[i] = a1; this.a2[i] = a2; this.b[i] = b;
      this.pb[i] = d.phiB[i];
      this.bphi[i] = b * d.phiB[i];
      this.fc[i] = b * d.c[i]; this.fd[i] = b * d.d[i];
      this.ck[i] = d.c[i] / k; this.dd[i] = d.d[i]; this.ok[i] = d.o[i] / k;
      Y += (d.phiB[i] * d.phiB[i] * b) / k;
      A += (d.c[i] * d.c[i] * b) / k; Bcd += (d.c[i] * d.d[i] * b) / k;
      Cdc += d.d[i] * d.c[i] * b; D += d.d[i] * d.d[i] * b;
      cbp += (d.c[i] * b * d.phiB[i]) / k; dbp += d.d[i] * b * d.phiB[i];
    }
    Object.assign(this, { Y, A, Bcd, Cdc, D, cbp, dbp });
    this.release(eng.p.releaseDamp);
    this.fminPerV = d.fminPerV; this.fmaxPerV = d.fmaxPerV;
    this.f0 = d.f0;
    this.period = eng.fs / d.f0;
    this.vB = 0; this.FN = 0; this.vT = vB; this.bowing = true; this.keyDown = true;
    this.sticking = true; this.slipSign = 1;
    this.slips = new Float64Array(256); this.ns = 0;           // zero-crossing times of mode 1
    this.slipsAtCross = new Float64Array(256); this.slipCount = 0; // stick→slip events
    this.drift = 0; this.driftCents = 0;
    this.F = 0; this.dead = false; this.quiet = 0; this.level = 0;
    const x = Math.max(-1, Math.min(1, ((key - 66) / 30) * eng.p.width));
    this.panL = Math.cos(((x + 1) * Math.PI) / 4) * Math.SQRT2;
    this.panR = Math.sin(((x + 1) * Math.PI) / 4) * Math.SQRT2;
  }

  release(extra) {
    for (let i = 0; i < this.N; i++) {
      const [a1, a2] = coeffs(this.om0[i] * 2 ** (this.driftCents / 1200), this.sig[i] + extra, this.k);
      this.a1r[i] = a1; this.a2r[i] = a2;
    }
    this.releaseExtra = extra;
  }

  // slow random tension wander (Ornstein–Uhlenbeck), cents
  applyDrift(eng, dt) {
    const p = eng.p;
    if (p.drift <= 0 && this.driftCents === 0) return;
    const tau = 1 / Math.max(0.01, p.driftRate);
    const g = Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(TWO_PI * Math.random());
    this.drift += (-this.drift / tau) * dt + p.drift * Math.sqrt((2 * dt) / tau) * g;
    this.driftCents = p.drift > 0 ? this.drift : 0;
    const s = 2 ** (this.driftCents / 1200);
    for (let i = 0; i < this.N; i++) {
      const [a1, a2] = coeffs(this.om0[i] * s, this.sig[i], this.k);
      this.a1[i] = a1; this.a2[i] = a2;
    }
    this.release(this.releaseExtra);
  }

  // phase 1: free step + bow. Returns nothing; leaves predicted bridge sums.
  predict(eng, t) {
    const N = this.N, q = this.q, q1 = this.q1, PB = this.pb, CK = this.ck, DD = this.dd;
    const bowing = this.bowing;
    const A1 = bowing ? this.a1 : this.a1r, A2 = bowing ? this.a2 : this.a2r;
    let vf = 0, sv = 0, sx = 0;
    for (let i = 0; i < N; i++) {
      const q0 = q[i], qn = A1[i] * q0 - A2[i] * q1[i];
      q1[i] = q0; q[i] = qn;
      const dq = qn - q0;
      vf += PB[i] * dq; sv += CK[i] * dq; sx += DD[i] * qn;
    }
    vf /= this.k;
    // bow envelopes
    const p = eng.p;
    const aa = eng.attackAlpha;
    const FNt = bowing ? this.vT * this.fminPerV * (this.fmaxPerV / this.fminPerV) ** p.pressure * eng.pressureMod : 0;
    this.FN += (FNt - this.FN) * aa;
    this.vB += ((bowing ? this.vT * eng.speedMod : 0) - this.vB) * aa;
    let F = 0;
    const FN = this.FN;
    if (FN > 1e-7) {
      // Friction law: stick, or slip with μ(u) = μd + (μs−μd) v0/(v0+u).
      // The string's velocity at the bow responds linearly to the force,
      // Δv = Δv_free + Y F, so a slipping state solves u² + B u + C = 0.
      // Hysteresis (McIntyre–Schumacher–Woodhouse): a slipping bow keeps
      // slipping on its branch until that solution disappears; a sticking bow
      // keeps sticking until the needed force exceeds μs·F_N.
      const Y = this.Y, dvf = vf - this.vB, c = Y * FN, v0 = p.v0;
      const Fst = -dvf / Y, lim = p.mus * FN;
      const slipRoot = (sg) => {
        const a = sg * dvf;
        const B = v0 - a + c * p.mud, C = v0 * (c * p.mus - a), disc = B * B - 4 * C;
        if (disc < 0) return -1;
        return 0.5 * (-B + Math.sqrt(disc));
      };
      let u = -1, sg = 0;
      if (!this.sticking) { sg = this.slipSign; u = slipRoot(sg); }
      if (u <= 0) {
        if (Math.abs(Fst) <= lim) { u = -1; sg = 0; }
        else { sg = dvf > 0 ? 1 : -1; u = slipRoot(sg); }
      }
      if (sg === 0 || u <= 0) {
        F = Fst;
        this.sticking = true;
      } else {
        F = -sg * FN * (p.mud + ((p.mus - p.mud) * v0) / (v0 + u));
        if (this.sticking) this.slipCount++;
        this.sticking = false;
        this.slipSign = sg;
      }
    } else if (!bowing && this.FN < 1e-7) this.FN = 0;
    this.F = F;
    eng.Sv += sv + F * this.cbp;
    eng.Sx += sx + F * this.dbp;
  }

  // phase 2: apply bow force and the bridge reaction; return output
  correct(av, bx, t) {
    const N = this.N, q = this.q, q1 = this.q1, BP = this.bphi, FC = this.fc, FD = this.fd, OK = this.ok, F = this.F;
    let out = 0;
    for (let i = 0; i < N; i++) {
      const qn = q[i] + BP[i] * F - FC[i] * av - FD[i] * bx;
      q[i] = qn;
      out += OK[i] * (qn - q1[i]);
    }
    // the first mode is a clean sinusoid at the string's actual repetition
    // rate whatever the bow is doing: time its upward zero crossings
    if (q1[0] < 0 && q[0] >= 0) {
      const ts = t - 1 + -q1[0] / (q[0] - q1[0]);
      this.slips[this.ns & 255] = ts; this.ns++;
      this.slipsAtCross[(this.ns - 1) & 255] = this.slipCount;
    }
    return out;
  }

  // mean frequency over the last `win` seconds, and slips per period
  // (≈ 1 for clean Helmholtz motion)
  frequency(t, win) {
    const n = Math.min(this.ns, 256);
    if (n < 4) return { f: 0, spp: 0 };
    const iLast = (this.ns - 1) & 255, last = this.slips[iLast];
    if (t - last > 3 * this.period) return { f: 0, spp: 0 };
    let first = last, cnt = 0, iFirst = iLast;
    for (let j = 1; j <= n; j++) {
      const idx = (this.ns - j) & 255, ts = this.slips[idx];
      if (last - ts > win * this.fs) break;
      first = ts; cnt = j; iFirst = idx;
    }
    if (cnt < 3) return { f: 0, spp: 0 };
    return { f: ((cnt - 1) * this.fs) / (last - first), spp: (this.slipsAtCross[iLast] - this.slipsAtCross[iFirst]) / (cnt - 1) };
  }
}

export class SyncEngine {
  constructor(fs) {
    this.fs = fs; this.k = 1 / fs;
    this.p = { ...SYNC_DEFAULTS };
    this.strings = [];
    this.byKey = new Map();
    this.t = 0;
    this.Sv = 0; this.Sx = 0;
    this.pressureMod = 1; this.speedMod = 1;
    this.listeners = [];
    this.update();
  }
  emit(ev) { for (const f of this.listeners) f(ev); }
  update() {
    this.attackAlpha = 1 - Math.exp(-this.k / Math.max(1e-3, this.p.attack));
    const th = (Math.PI / 2) * Math.min(1, Math.max(0, this.p.react));
    this.al = Math.cos(th); this.be = Math.sin(th);
  }
  setParams(p) {
    const old = this.p.releaseDamp;
    this.p = { ...this.p, ...p };
    this.update();
    if (this.p.releaseDamp !== old) for (const s of this.strings) s.release(this.p.releaseDamp);
  }

  noteOn(key, data, vB) {
    let s = this.byKey.get(key);
    if (s && !s.dead && s.version === data.version) {
      s.vT = vB; s.bowing = true; s.keyDown = true;
      return s;
    }
    if (s) { s.bowing = false; s.keyDown = false; }
    s = new BowedString(this, key, data, vB);
    this.strings.push(s);
    this.byKey.set(key, s);
    if (this.strings.length > this.p.maxStrings) {
      const victim = this.strings.find((x) => !x.bowing && x !== s) || this.strings[0];
      victim.dead = true;
    }
    return s;
  }
  noteOff(key) { const s = this.byKey.get(key); if (s) { s.bowing = false; s.keyDown = false; } }
  allOff() { for (const s of this.strings) { s.bowing = false; s.keyDown = false; } }

  process(L, R, n) {
    const ss = this.strings;
    L.fill(0, 0, n); R.fill(0, 0, n);
    if (!ss.length) return;
    // per-block: drift and the implicit-bridge matrix
    let A = 0, Bc = 0, Cd = 0, D = 0;
    for (const s of ss) { s.applyDrift(this, n * this.k); A += s.A; Bc += s.Bcd; Cd += s.Cdc; D += s.D; }
    const al = this.al, be = this.be;
    const m11 = 1 + al * A, m12 = be * Bc, m21 = al * Cd, m22 = 1 + be * D, det = m11 * m22 - m12 * m21;
    const g = OUT_SCALE * this.p.master;
    for (let i = 0; i < n; i++) {
      this.Sv = 0; this.Sx = 0;
      const t = this.t;
      for (let j = 0; j < ss.length; j++) ss[j].predict(this, t);
      const sv = (m22 * this.Sv - m12 * this.Sx) / det, sx = (-m21 * this.Sv + m11 * this.Sx) / det;
      let l = 0, r = 0;
      for (let j = 0; j < ss.length; j++) {
        const s = ss[j], o = s.correct(al * sv, be * sx, t);
        l += s.panL * o; r += s.panR * o;
      }
      L[i] = g * l; R[i] = g * r;
      this.t++;
    }
    // retire silent strings
    let j = 0;
    for (const s of ss) {
      if (!s.bowing && !s.dead) {
        let e = 0;
        for (let i = 0; i < s.N; i++) { const v = s.q[i] - s.q1[i]; e += v * v; }
        s.quiet = e < 1e-16 ? s.quiet + 1 : 0;
        if (s.quiet > 20) s.dead = true;
      }
      if (s.dead) { if (this.byKey.get(s.key) === s) this.byKey.delete(s.key); } else ss[j++] = s;
    }
    ss.length = j;
  }

  // measured frequency of each string that is being bowed
  report(win = 0.3) {
    const out = [];
    for (const s of this.strings) {
      const { f, spp } = s.bowing ? s.frequency(this.t, win) : { f: 0, spp: 0 };
      out.push({ key: s.key, f, spp, f0: s.f0, bowing: s.bowing, drift: s.driftCents });
    }
    return out;
  }
}

globalThis.SyncEngine = SyncEngine;
