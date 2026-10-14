// glass-engine.js — real-time armonica: rotating glass bowls (shell modes in
// the bowl's frame, with their Coriolis coupling), rubbed by wet fingers (a
// skin pad with stick–slip friction, solved implicitly every sample), heard by
// two microphones fixed in the room. Runs in the AudioWorklet and in Node.
//
// Per sample and bowl:
//   1. the spindle has turned by θ; the finger (fixed in the room at φ = 0)
//      sits at φ_b = −θ on the bowl, so each mode's coupling to it turns;
//   2. every doublet (cos nφ, sin nφ about the bowl's irregularity axis)
//      advances exactly (two-pole), with the Coriolis term q̈_c − 2g q̇_s …
//      (g = nBΩ) taken implicitly by a 2×2 solve, and the pressed pulp's
//      radial damping on the rim applied from the last sample's rim velocity;
//   3. the tangential friction between skin pad and rim: the rim's and the
//      pad's velocities are linear in the friction force F, so the contact
//      sticks if the force that holds them together is below μs·N, and
//      otherwise slips at the speed that solves the Stribeck law (Newton);
//   4. output: the rim's radial velocity at two microphone azimuths, each
//      family weighted by its radiation efficiency.

import { TAU, modeCoeffs, keyPan } from '../../shared/dsp.js';
import { bowl, friction, regulation, pulpDamping, SKIN, N_MAX, KEY_LO, KEY_HI } from './glass-model.js';

const OUT = 120;
export const MIC = [35, 55].map((d) => (d * Math.PI) / 180); // microphone azimuths, from the finger
const RIDGE = 4.5e-4;                                         // fingerprint ridge spacing (m)
export const TRACE = 1024;                                    // samples of contact history for the view

class Voice {
  constructor(eng, key, P) {
    this.key = key;
    this.Nreg = regulation(key);
    this.after = eng.pressure;
    this.touch = false; this.vel = 0; this.Nn = 0;
    this.x = 0; this.u = 0; this.F = 0; this.stick = false; this.slip = 0; this.s = 0;
    this.wdot = 0; this.peak = 0; this.quiet = 0; this.dead = false; this.nz = 0; this.Nlift = 0;
    const [pl, pr] = keyPan(key, 0.7, KEY_LO, KEY_HI);
    this.pl = pl; this.pr = pr;
    this.build(eng, P);
  }
  // (Re)derive everything that depends on the bowl's parameters, keeping the motion.
  build(eng, P) {
    const b = bowl(this.key, P), N = b.modes.length, F = () => new Float64Array(N);
    const old = this.qc ? [this.qc, this.qc1, this.qs, this.qs1] : null;
    this.b = b; this.N = N;
    this.qc = F(); this.qc1 = F(); this.qs = F(); this.qs1 = F();
    if (old) ['qc', 'qc1', 'qs', 'qs1'].forEach((f, i) => this[f].set(old[i].subarray(0, Math.min(N, old[i].length))));
    this.a1c = F(); this.a2c = F(); this.bc = F(); this.a1s = F(); this.a2s = F(); this.bs = F(); this.buc = F(); this.bus = F();
    this.n = F(); this.cpsi = F(); this.spsi = F(); this.g = F(); this.gain = F();
    this.cmL = F(); this.smL = F(); this.cmR = F(); this.smR = F();
    this.cx = F(); this.sx = F(); this.dc = F(); this.ds = F(); this.bet = F(); this.bes = F();
    b.modes.forEach((m, i) => {
      const c1 = modeCoeffs(m.f1, m.sigma, eng.fs), c2 = modeCoeffs(m.f2, m.sigma, eng.fs);
      this.a1c[i] = c1.a1; this.a2c[i] = c1.a2; this.buc[i] = c1.b; this.bc[i] = c1.b / m.M; // per unit mass; per newton
      this.a1s[i] = c2.a1; this.a2s[i] = c2.a2; this.bus[i] = c2.b; this.bs[i] = c2.b / m.M;
      this.n[i] = m.n;
      this.cpsi[i] = Math.cos(m.n * m.psi); this.spsi[i] = Math.sin(m.n * m.psi);
      this.g[i] = m.n * m.bryan;        // Coriolis rate per unit spin
      this.gain[i] = m.n * m.rad * b.a; // far-field pressure per unit tangential rim velocity (× ρc/r)
      this.cmL[i] = Math.cos(m.n * MIC[0]); this.smL[i] = Math.sin(m.n * MIC[0]);
      this.cmR[i] = Math.cos(m.n * MIC[1]); this.smR[i] = Math.sin(m.n * MIC[1]);
    });
  }
}

export class ArmonicaEngine {
  constructor(fs) {
    this.fs = fs; this.k = 1 / fs;
    this.P = null;
    this.voices = [];
    this.theta = 0; this.Wbar = 0; this.pressure = 0;
    this.cosn = Array.from({ length: N_MAX + 1 }, () => new Float64Array(128));
    this.sinn = Array.from({ length: N_MAX + 1 }, () => new Float64Array(128));
    this.rng = 22222;
    this.focus = -1; this.tick = 0;
    this.trS = new Float32Array(TRACE); this.trF = new Float32Array(TRACE); this.tw = 0;
    this.msg = { type: 'state', key: -1, theta: 0, rot: 0, N: 0, V: 0, touch: false, nm: 0,
      q: new Float64Array(4 * N_MAX), trS: new Float32Array(TRACE), trF: new Float32Array(TRACE) };
  }
  setParams(P) {
    const old = this.P;
    this.P = P;
    this.fr = friction(P);
    if (!old) this.Wbar = TAU * P.speed;
    else if (old.split !== P.split || old.loss !== P.loss || old.water !== P.water) for (const v of this.voices) v.build(this, P);
  }
  handle(m) {
    if (m.type === 'pressure') { // MIDI aftertouch: channel (key null) or polyphonic
      if (m.key == null) { this.pressure = m.value; for (const v of this.voices) v.after = m.value; }
      else for (const v of this.voices) if (v.key === m.key) v.after = m.value;
    } else if (m.type === 'focus') this.focus = m.key;
  }
  noteOn(key, velocity) {
    if (!this.P) return;
    let v = this.voices.find((x) => x.key === key);
    if (!v) {
      v = new Voice(this, key, this.P); this.voices.push(v);
      if (this.voices.length > 36) { // let go of the quietest bowl nobody is touching
        let q = null;
        for (const x of this.voices) if (!x.touch && x !== v && (!q || x.peak < q.peak)) q = x;
        (q || this.voices[0]).dead = true;
      }
    }
    v.touch = true; v.vel = velocity;
    this.focus = key;
  }
  noteOff(key) { for (const v of this.voices) if (v.key === key && v.touch) { v.touch = false; v.Nlift = (v.Nn * this.k) / SKIN.lift; } }
  allNotesOff() { this.voices = []; }
  voiceCount() { return this.voices.length; }

  // Normal force of the finger on the rim (N), relative to the key's regulated
  // speaking threshold: the slider scales it, velocity sets how firmly the
  // finger lands, aftertouch presses harder.
  force(v) { return v.touch ? v.Nreg * this.P.press * (0.6 + 0.8 * v.vel) * (1 + v.after) : 0; }

  process(L, R, n) {
    L.fill(0, 0, n); R.fill(0, 0, n);
    const P = this.P;
    if (!P) return;
    const k = this.k, fs = this.fs;
    // The spindle: speed follows the treadle through the flywheel (0.5 s), with
    // the foot's push once per turn; cos nθ, sin nθ for every family.
    this.Wbar += (TAU * P.speed - this.Wbar) * (1 - Math.exp((-n * k) / 0.5));
    let th = this.theta;
    const C = this.cosn, S = this.sinn;
    for (let i = 0; i < n; i++) {
      th += this.Wbar * (1 + P.treadle * Math.cos(th)) * k;
      const c1 = Math.cos(th), s1 = Math.sin(th);
      C[1][i] = c1; S[1][i] = s1;
      for (let m = 2; m <= N_MAX; m++) { C[m][i] = C[m - 1][i] * c1 - S[m - 1][i] * s1; S[m][i] = S[m - 1][i] * c1 + C[m - 1][i] * s1; }
    }
    this.theta = th % TAU;
    const W = this.Wbar;
    const { mud, dmu, v0, beta } = this.fr, noise = P.rough;
    const lam = 1 - Math.exp(-k / SKIN.land);
    const Yp = 1 / (SKIN.m / k + SKIN.c + SKIN.k * k), mk = SKIN.m / k; // pad: u⁺ = u0 − Yp F

    for (const v of this.voices) {
      if (v.dead) continue;
      const NM = v.N, qc = v.qc, qc1 = v.qc1, qs = v.qs, qs1 = v.qs1;
      const a1c = v.a1c, a2c = v.a2c, bc = v.bc, a1s = v.a1s, a2s = v.a2s, bs = v.bs, nn = v.n;
      const CX = v.cx, SX = v.sx, DC = v.dc, DS = v.ds, BET = v.bet, BES = v.bes, G = v.gain;
      for (let j = 0; j < NM; j++) { const gw = (v.g[j] * W) / k; BET[j] = v.buc[j] * gw; BES[j] = v.bus[j] * gw; }
      const Nt = this.force(v), Vrim = W * v.b.a, tr = this.focus === v.key;
      const gr = 1 - Math.exp((-TAU * Vrim) / (RIDGE * fs));
      let pk = 0;
      for (let i = 0; i < n; i++) {
        if (v.touch) v.Nn += (Nt - v.Nn) * lam; else v.Nn = Math.max(0, v.Nn - v.Nlift); // lands smoothly, lifts off in SKIN.lift
        const Nf = v.Nn, contact = Nf > 0, Fr = contact ? -pulpDamping(Nf) * v.wdot : 0;
        let vfree = 0, Yg = 0;
        for (let j = 0; j < NM; j++) {
          const m = nn[j], cn = C[m][i], sn = S[m][i];
          const cx = cn * v.cpsi[j] - sn * v.spsi[j], sx = sn * v.cpsi[j] + cn * v.spsi[j]; // χ = n(θ + ψ)
          CX[j] = cx; SX[j] = sx;
          // at the finger: tangential coupling (−sin χ, −cos χ), radial (−n cos χ, n sin χ)
          const det = 1 / (1 + BET[j] * BES[j]);
          const Rc = a1c[j] * qc[j] - a2c[j] * qc1[j] - BET[j] * qs1[j] - bc[j] * m * cx * Fr;
          const Rs = a1s[j] * qs[j] - a2s[j] * qs1[j] + BES[j] * qc1[j] + bs[j] * m * sx * Fr;
          const pc = (Rc + BET[j] * Rs) * det, ps = (Rs - BES[j] * Rc) * det;
          qc1[j] = qc[j]; qs1[j] = qs[j]; qc[j] = pc; qs[j] = ps;
          if (contact) { // response of this doublet to a unit tangential force at the finger
            const ec = -bc[j] * sx, es = -bs[j] * cx;
            const dc = (ec + BET[j] * es) * det, ds = (es - BES[j] * ec) * det;
            DC[j] = dc; DS[j] = ds;
            vfree -= sx * (pc - qc1[j]) + cx * (ps - qs1[j]);
            Yg -= sx * dc + cx * ds;
          }
        }
        let F = 0;
        if (contact) {
          vfree /= k; Yg /= k;
          const u0 = (mk * v.u - SKIN.k * v.x) * Yp;
          const Y = Yg + Yp, s0 = Vrim + vfree - u0, c = Y * Nf;
          this.rng = (Math.imul(this.rng, 1664525) + 1013904223) | 0; // fingerprint ridges: friction noise,
          v.nz += (noise * 1.7 * (this.rng / 2147483648) - v.nz) * gr;   // smoothed over a ridge passage
          const nz = 1 + v.nz;
          const md = mud * nz, dm = dmu * nz;
          // Stick if the force that holds s = 0 is within μs·N; otherwise slip in
          // the direction of s0 at the speed u solving u − |s0| + Y N μ(u) = 0,
          // μ(u) = μd + Δμ/(1 + (u/v0)²) + βu, by Newton from the last slip speed,
          // kept inside the bracket (0, |s0|).
          if (Math.abs(s0) <= c * (md + dm)) { F = -s0 / Y; v.stick = true; v.s = 0; }
          else {
            const sg = s0 > 0 ? 1 : -1, a = sg * s0;
            let lo = 0, hi = a, u = v.slip > 0 && v.slip < a ? v.slip : 0.5 * a, mu = 0;
            for (let it = 0; it < 20; it++) {
              const x = u / v0, e = 1 / (1 + x * x);
              mu = md + dm * e + beta * u;
              const ph = u - a + c * mu;
              if (ph > 0) hi = u; else lo = u;
              if (Math.abs(ph) < 1e-12 + 1e-10 * a) break;
              const d = 1 + c * (beta - (2 * dm * x * e * e) / v0);
              let un = u - ph / d;
              if (!(d > 0 && un > lo && un < hi)) un = 0.5 * (lo + hi);
              u = un;
            }
            F = -sg * Nf * mu; v.stick = false; v.slip = u; v.s = sg * u;
          }
          for (let j = 0; j < NM; j++) { qc[j] += DC[j] * F; qs[j] += DS[j] * F; }
          v.u = u0 - Yp * F; v.x += k * v.u;
        } else { v.x *= 0.995; v.u = 0; v.stick = false; v.slip = 0; v.s = Vrim; }
        v.F = F;
        // rim radial velocity under the finger (next sample's pulp damping) and at the mics
        let wd = 0, oL = 0, oR = 0;
        for (let j = 0; j < NM; j++) {
          const dqc = qc[j] - qc1[j], dqs = qs[j] - qs1[j], cx = CX[j], sx = SX[j];
          wd += nn[j] * (sx * dqs - cx * dqc);
          // at azimuth α the radial motion of the cos/sin modes is −n cos(nα − χ), −n sin(nα − χ)
          oL -= G[j] * ((v.cmL[j] * cx + v.smL[j] * sx) * dqc + (v.smL[j] * cx - v.cmL[j] * sx) * dqs);
          oR -= G[j] * ((v.cmR[j] * cx + v.smR[j] * sx) * dqc + (v.smR[j] * cx - v.cmR[j] * sx) * dqs);
        }
        v.wdot = wd * fs;
        oL *= OUT * fs; oR *= OUT * fs;
        L[i] += v.pl * oL; R[i] += v.pr * oR;
        const amp = Math.abs(oL) + Math.abs(oR);
        if (amp > pk) pk = amp;
        if (tr) { this.trS[this.tw] = v.s; this.trF[this.tw] = F; this.tw = (this.tw + 1) % TRACE; }
      }
      v.peak = pk;
      if (!v.touch && v.Nn === 0) { v.quiet = pk < 1e-5 ? v.quiet + 1 : 0; if (v.quiet > 40) v.dead = true; }
    }
    let j = 0;
    for (const v of this.voices) if (!v.dead) this.voices[j++] = v;
    this.voices.length = j;
    if (this.post && ++this.tick >= 12) { this.tick = 0; this.report(); }
  }

  // Throttled state for the page's views (preallocated; postMessage copies it).
  report() {
    const m = this.msg, v = this.voices.find((x) => x.key === this.focus);
    m.key = this.focus; m.theta = this.theta; m.rot = this.Wbar / TAU; m.nm = 0; m.N = 0; m.touch = false;
    if (v) {
      m.N = v.Nn; m.V = this.Wbar * v.b.a; m.touch = v.touch; m.nm = v.N;
      for (let j = 0; j < v.N; j++) { m.q[4 * j] = v.qc[j]; m.q[4 * j + 1] = v.qs[j]; m.q[4 * j + 2] = v.qc1[j]; m.q[4 * j + 3] = v.qs1[j]; }
    }
    for (let i = 0; i < TRACE; i++) { const p = (this.tw + i) % TRACE; m.trS[i] = this.trS[p]; m.trF[i] = this.trF[p]; }
    this.post(m);
  }
}

globalThis.ArmonicaEngine = ArmonicaEngine;
