// neon-engine.js — a keyboard of relaxation oscillators on one supply rail.
//
// Each key is the circuit van der Pol and van der Mark studied in 1927: a
// capacitor C charged through a resistor R_i from the supply rail, with a neon
// lamp across it. When the capacitor reaches the lamp's striking voltage V_s
// the lamp fires and dumps it to the extinction voltage V_e; then it charges
// again. Period: T = R_i C ln[(V_rail − V_e)/(V_rail − V_s)].
//
// All oscillators hang on one rail, fed through a source resistance R_src and
// smoothed by a reservoir capacitor C_rail. Every firing changes the current
// drawn from the rail, so the rail dips and every *other* oscillator's
// charging slows a little. A relaxation oscillator's phase is easily nudged
// (it has no resonator to hold it), so the oscillators lock onto rational
// frequency ratios over wide ranges: Arnold tongues, a devil's staircase, and
// irregular (chaotic) motion between the steps.
//
// Firing times are found analytically within each sample, so pitch and lock
// are exact; the sawtooth output is band-limited with polyBLEP.

const TWO_PI = 2 * Math.PI;

export const NEON_DEFAULTS = {
  vNom: 150,          // supply (V)
  vStrike: 90,        // lamp striking voltage
  vExt: 60,           // lamp extinction voltage
  cap: 10e-9,         // timing capacitor (F)
  kick: 0.04,         // pulse coupling: lamp-voltage kick as a fraction of (V_s − V_e)
  rSrc: 0,            // source resistance: slow coupling through rail sag (Ω)
  cRail: 2e-9,        // rail reservoir capacitance (F)
  regulate: 1,        // 1 = regulator removes the average sag
  pitchHold: 1,       // 1 = slow supply servo keeps the average pitch on target
  holdTime: 0.4,      // its time constant (s)
  attack: 0.004,      // key contact: rail switched in through a small RC
  release: 0.03,
  drift: 0, driftRate: 0.25,
  master: 1, width: 0.5,
  maxOsc: 32,
};

class Osc {
  constructor(eng, key, d) {
    this.key = key; this.fTarget = d.f;
    this.C = eng.p.cap;
    this.retune(d.f, eng.p);
    this.V = eng.p.vExt + (eng.p.vStrike - eng.p.vExt) * Math.random(); // random initial phase
    this.gate = 0; this.keyDown = true; this.dead = false;
    this.fires = new Float64Array(256); this.nf = 0;
    this.prevOut = 0; // one-sample delay for the polyBLEP
    this.I = 0;     // current drawn from the rail this sample
    this.drift = 0; this.driftCents = 0;
    const x = Math.max(-1, Math.min(1, ((key - 66) / 30) * eng.p.width));
    this.panL = Math.cos(((x + 1) * Math.PI) / 4) * Math.SQRT2;
    this.panR = Math.sin(((x + 1) * Math.PI) / 4) * Math.SQRT2;
  }

  retune(f, p) {
    this.fTarget = f;
    this.R = tuneR(f, p);
    this.tau = this.R * this.C * 2 ** (-(this.driftCents || 0) / 1200);
  }

  applyDrift(eng, dt) {
    const p = eng.p;
    if (p.drift <= 0 && this.driftCents === 0) return;
    const tau = 1 / Math.max(0.01, p.driftRate);
    const g = Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(TWO_PI * Math.random());
    this.drift += (-this.drift / tau) * dt + p.drift * Math.sqrt((2 * dt) / tau) * g;
    this.driftCents = p.drift > 0 ? this.drift : 0;
    this.tau = this.R * this.C * 2 ** (-this.driftCents / 1200); // resistor wander
  }

  // Phase 1 of a sample: connect the key, and find when (if ever) the lamp
  // would strike on its own during this sample.
  plan(vr, eng) {
    const p = eng.p, k = eng.k, vs = p.vStrike;
    this.gate += ((this.keyDown ? 1 : 0) - this.gate) * (this.keyDown ? eng.attackAlpha : eng.releaseAlpha);
    this.supply = vr * this.gate;
    this.V0 = this.V;
    this.fireAt = -1;
    const S = this.supply;
    if (S > vs && S - this.V0 > 1e-12) {
      const ts = this.tau * Math.log((S - this.V0) / (S - vs));
      if (ts < k) this.fireAt = ts / k;
    }
  }

  // capacitor voltage at fraction x of this sample, if it has not fired
  voltageAt(x, k) { return this.supply + (this.V0 - this.supply) * Math.exp((-x * k) / this.tau); }

  // Phase 2: apply the (natural or triggered) firing, return output one
  // sample late so a polyBLEP can correct both sides of each reset.
  finish(eng, t) {
    const p = eng.p, k = eng.k, vs = p.vStrike, ve = p.vExt, S = this.supply;
    let V, jump = 0, d = 0;
    if (this.fireAt >= 0) {
      const x = this.fireAt;
      this.fires[this.nf & 255] = t + x; this.nf++;
      const vBefore = this.voltageAt(x, k);
      V = S + (ve - S) * Math.exp((-(1 - x) * k) / this.tau);
      jump = vBefore - ve;
      d = 1 - x;
    } else V = this.voltageAt(1, k);
    // charge drawn through R this sample (the reset is the lamp's own loop)
    this.I = (this.C * (V - this.V0 + jump)) / k;
    this.V = V;
    let cur = V - 0.5 * (vs + ve);
    if (jump) {
      const h = -jump;                          // downward step
      this.prevOut += (h * d * d) / 2;          // polyBLEP, sample before
      cur += (-h * (1 - d) * (1 - d)) / 2;      // polyBLEP, sample after
    }
    const out = this.prevOut;
    this.prevOut = cur * this.gate;
    return out;
  }

  // Mean frequency over the last `win` seconds: least-squares slope of firing
  // time against firing number. Locked oscillators fire unevenly (pulled
  // firings), and the fit averages that out far better than first-to-last.
  frequency(t, win, fs) {
    const n = Math.min(this.nf, 256);
    if (n < 4) return 0;
    const last = this.fires[(this.nf - 1) & 255];
    if (t - last > (3 * fs) / this.fTarget) return 0;
    let cnt = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let j = 1; j <= n; j++) {
      const ts = this.fires[(this.nf - j) & 255];
      if (last - ts > win * fs) break;
      const x = -j;
      cnt++; sx += x; sy += ts; sxx += x * x; sxy += x * ts;
    }
    if (cnt < 4) return 0;
    const slope = (cnt * sxy - sx * sy) / (cnt * sxx - sx * sx);
    return fs / slope;
  }
}

// Resistor that tunes an oscillator to f with the rail at its nominal voltage.
// (declared below the class but hoisted)
export function tuneR(f, p) {
  return 1 / (f * p.cap * Math.log((p.vNom - p.vExt) / (p.vNom - p.vStrike)));
}

export class NeonEngine {
  constructor(fs) {
    this.fs = fs; this.k = 1 / fs;
    this.p = { ...NEON_DEFAULTS };
    this.osc = []; this.byKey = new Map();
    this.t = 0; this.vr = this.p.vNom; this.Ilp = 0;
    this.hold = 0;      // pitch-hold correction, octaves
    this.listeners = [];
    this.update();
  }
  emit(ev) { for (const f of this.listeners) f(ev); }
  update() {
    this.attackAlpha = 1 - Math.exp(-this.k / Math.max(1e-4, this.p.attack));
    this.releaseAlpha = 1 - Math.exp(-this.k / Math.max(1e-4, this.p.release));
    this.regAlpha = 1 - Math.exp(-this.k * TWO_PI * 4);
  }
  setParams(p) {
    const old = this.p;
    this.p = { ...this.p, ...p };
    if (['vNom', 'vStrike', 'vExt'].some((k) => old[k] !== this.p[k])) for (const o of this.osc) o.retune(o.fTarget, this.p);
    this.update();
  }
  retune(key, f) { const o = this.byKey.get(key); if (o) o.retune(f, this.p); }
  noteOn(key, data) {
    let o = this.byKey.get(key);
    if (o && !o.dead) { o.keyDown = true; if (data.f !== o.fTarget) o.retune(data.f, this.p); return o; }
    if (o) o.keyDown = false;
    o = new Osc(this, key, data);
    this.osc.push(o); this.byKey.set(key, o);
    if (this.osc.length > this.p.maxOsc) (this.osc.find((x) => !x.keyDown) || this.osc[0]).dead = true;
    return o;
  }
  noteOff(key) { const o = this.byKey.get(key); if (o) o.keyDown = false; }
  allOff() { for (const o of this.osc) o.keyDown = false; }

  // Every oscillator's period is R_i C·g(V) with the same g(V) =
  // ln[(V − V_e)/(V − V_s)], so the supply voltage scales the whole keyboard
  // without touching any interval. Pulse coupling only ever advances a lamp,
  // so locked chords run sharp; this servo nudges the supply to hold the
  // average pitch.
  supplySetpoint(dt) {
    const p = this.p;
    if (p.pitchHold) {
      let err = 0, n = 0;
      for (const o of this.osc) {
        if (!o.keyDown || o.gate < 0.9) continue;
        const f = o.frequency(this.t, 0.12, this.fs);
        if (f > 0) { err += Math.log2(f / o.fTarget) + this.hold; n++; }
      }
      // err: what each would play at the nominal supply, in octaves
      if (n) this.hold += ((err / n - this.hold) * dt) / p.holdTime;
      else this.hold *= Math.exp(-dt / (4 * p.holdTime));
    } else this.hold = 0;
    const g0 = Math.log((p.vNom - p.vExt) / (p.vNom - p.vStrike));
    const gT = g0 * 2 ** this.hold, e = Math.exp(gT);
    return Math.max(p.vStrike * 1.02, (p.vExt - p.vStrike * e) / (1 - e));
  }

  process(L, R, n) {
    const os = this.osc, p = this.p, k = this.k;
    for (const o of os) o.applyDrift(this, n * k);
    const vSet = this.supplySetpoint(n * k);
    const tauRail = p.rSrc * p.cRail, eR = tauRail > 0 ? Math.exp(-k / tauRail) : 0;
    const g = 0.004 * p.master;
    const kick = p.kick * (p.vStrike - p.vExt);
    for (let i = 0; i < n; i++) {
      let l = 0, r = 0, I = 0;
      const vr = this.vr;
      for (let j = 0; j < os.length; j++) os[j].plan(vr, this);
      // Pulse coupling through the shared cathode resistor: when a lamp
      // fires, its discharge current briefly lifts the voltage across every
      // other lamp by `kick`. Any lamp that close to striking fires in the
      // same instant (and may set off others).
      if (kick > 0 && os.length > 1) {
        const order = [];
        for (const o of os) if (o.fireAt >= 0) order.push(o);
        order.sort((a, b) => a.fireAt - b.fireAt);
        for (let e = 0; e < order.length; e++) {
          const x = order[e].fireAt;
          for (const o of os) {
            if (o === order[e] || o.gate < 0.5) continue;
            if (o.fireAt >= 0 && o.fireAt <= x) continue;
            if (o.voltageAt(x, k) + kick >= p.vStrike) {
              const was = o.fireAt;
              o.fireAt = x;
              if (was < 0) order.push(o);
              order.sort((a, b) => a.fireAt - b.fireAt);
            }
          }
        }
      }
      for (let j = 0; j < os.length; j++) {
        const o = os[j], s = o.finish(this, this.t);
        I += o.I;
        l += o.panL * s; r += o.panR * s;
      }
      // rail: source (with optional regulator cancelling the average sag)
      this.Ilp += this.regAlpha * (I - this.Ilp);
      const vSrc = vSet + (p.regulate ? p.rSrc * this.Ilp : 0);
      const vInf = vSrc - p.rSrc * I;
      this.vr = vInf + (this.vr - vInf) * eR;
      L[i] = g * l; R[i] = g * r;
      this.t++;
    }
    let j = 0;
    for (const o of os) {
      if (!o.keyDown && o.gate < 1e-4) o.dead = true;
      if (o.dead) { if (this.byKey.get(o.key) === o) this.byKey.delete(o.key); } else os[j++] = o;
    }
    os.length = j;
  }

  report(win = 0.3) {
    return this.osc.map((o) => ({ key: o.key, f: o.keyDown ? o.frequency(this.t, win, this.fs) : 0, fTarget: o.fTarget, drift: o.driftCents }));
  }

  // firing times (in samples) of each sounding oscillator since `since`
  firings(since) {
    return this.osc.filter((o) => o.keyDown).map((o) => {
      const out = [];
      for (let j = 1; j <= Math.min(o.nf, 256); j++) {
        const ts = o.fires[(o.nf - j) & 255];
        if (ts < since) break;
        out.push(ts);
      }
      return { key: o.key, times: out.reverse() };
    });
  }
}

globalThis.NeonEngine = NeonEngine;
