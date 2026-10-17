// neon-engine.js — a keyboard of relaxation oscillators on one supply rail.
//
// Each key is the circuit van der Pol and van der Mark studied in 1927: a
// capacitor C charged through a resistor R_i from the supply rail, with a neon
// lamp across it. When the capacitor reaches the lamp's striking voltage V_s
// the lamp fires and dumps it to the extinction voltage V_e; then it charges
// again. Period: T = R_i C ln[(V_rail − V_e)/(V_rail − V_s)].
//
// Coupling. The lamps share a cathode resistor: when one fires, every other
// lamp sees its voltage lifted by a kick K for an instant. A lamp that is
// within K of striking fires in the same instant (and may set off others); any
// other lamp is left exactly as it was, so sub-threshold kicks leave no trace.
// In time, a lamp is captured if its next firing was due within δ of its own
// period, δ = ln[(S − V_s + K)/(S − V_s)] / g, the same for every key (see
// sync-theory.js). Two lamps that have fired together repeat their motion
// exactly from then on: every interval locks to some ratio p:q, the p:q lock
// needs (p − δ)/q ≤ f_hi/f_lo ≤ p/(q − δ), and there is no unlocked (or
// chaotic) motion between the steps of the two-lamp staircase. A chord whose
// pairs want incompatible ratios can settle into a long repeating pattern.
//
// Optionally the rail has a source resistance R_src and a reservoir capacitor
// C_rail: every firing then also dips the rail a little, a slow, weak,
// continuous coupling.
//
// Keys. A key powers its oscillator up through a small RC (attack) and keys
// its output, like an organ keyer; on release the output fades (release) while
// the oscillator keeps running, and it is switched off once silent. The output
// is taken through a coupling capacitor (a 15 Hz high-pass), so there is no DC
// and no thump when a note stops.
//
// Firing times are found analytically within each sample, so pitch and lock
// are exact; the sawtooth output is band-limited with polyBLEP.
//
// The engine contract is shared/worklet.js's: noteOn(key, velocity, { f }) (a
// lamp has no touch: velocity is ignored), handle({ type: 'retune', list:
// [[key, f]…] }) for keys already sounding. Under shared/worklet.js it posts
// the page a 'state' (the new firings) at most 30 times a second.
//
// The random numbers (each key's starting phase, the resistors' drift) come
// from a seeded generator, so renders and tests repeat exactly and the C++
// port (native/instruments/huygens) draws the same ones.

const TWO_PI = 2 * Math.PI;

// mulberry32 (as shared/impulses.js): small, fast and seedable
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const SEED = 0x48757967; // 'Huyg'

export const NEON_DEFAULTS = {
  vNom: 150,          // supply (V)
  vStrike: 90,        // lamp striking voltage
  vExt: 60,           // lamp extinction voltage
  cap: 10e-9,         // timing capacitor (F)
  kick: 0.055,        // pulse coupling: lamp-voltage kick as a fraction of (V_s − V_e)
  rSrc: 0,            // source resistance: slow coupling through rail sag (Ω)
  cRail: 2e-9,        // rail reservoir capacitance (F)
  regulate: 1,        // 1 = regulator removes the average sag
  pitchHold: 1,       // 1 = slow supply servo keeps the average pitch on target
  holdTime: 0.4,      // its time constant (s)
  attack: 0.004,      // key contact: oscillator powered up and output keyed through a small RC
  release: 0.03,      // output keyer fade after release
  dcCut: 15,          // output coupling capacitor (high-pass corner, Hz)
  drift: 0, driftRate: 0.25,
  master: 1, width: 0.5,
  maxOsc: 32,
};

class Osc {
  constructor(eng, key, d) {
    this.key = key; this.fTarget = d.f;
    this.C = eng.p.cap;
    this.retune(d.f, eng.p);
    // initial phase: random (a real key), or given (0 = just fired) for analysis
    const ph = d.phase ?? eng.rand(), p = eng.p;
    this.V = p.vNom - (p.vNom - p.vExt) * Math.exp(-ph * Math.log((p.vNom - p.vExt) / (p.vNom - p.vStrike)));
    this.gate = d.settled ? 1 : 0;   // output keyer
    this.power = d.settled ? 1 : 0;  // supply connection
    this.keyDown = true; this.dead = false;
    this.fires = new Float64Array(256); this.nf = 0; this.sent = 0;
    this.prevOut = 0; // one-sample delay for the polyBLEP
    this.hx = 0; this.hy = 0; // coupling-capacitor high-pass state
    this.I = 0;     // current drawn from the rail this sample
    this.drift = 0; this.driftCents = 0;
    this.setPan(p.width);
  }

  setPan(width) {
    const x = Math.max(-1, Math.min(1, ((this.key - 66) / 30) * width));
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
    const g = Math.sqrt(-2 * Math.log(eng.rand() + 1e-12)) * Math.cos(TWO_PI * eng.rand());
    this.drift += (-this.drift / tau) * dt + p.drift * Math.sqrt((2 * dt) / tau) * g;
    this.driftCents = p.drift > 0 ? this.drift : 0;
    this.tau = this.R * this.C * 2 ** (-this.driftCents / 1200); // resistor wander
  }

  // Phase 1 of a sample: connect the key, and find when (if ever) the lamp
  // would strike on its own during this sample.
  plan(vr, eng) {
    const p = eng.p, k = eng.k, vs = p.vStrike;
    if (this.keyDown) {
      this.gate += (1 - this.gate) * eng.attackAlpha;
      this.power += (1 - this.power) * eng.attackAlpha;
    } else this.gate -= this.gate * eng.releaseAlpha;
    this.supply = vr * this.power;
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
    const keyed = this.prevOut;
    this.prevOut = cur * this.gate;
    // coupling capacitor: y[n] = x[n] − x[n−1] + ρ y[n−1]
    const y = keyed - this.hx + eng.dcRho * this.hy;
    this.hx = keyed; this.hy = y;
    return y;
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
  constructor(fs, seed = SEED) {
    this.fs = fs; this.k = 1 / fs;
    this.rand = rng(seed);
    this.p = { ...NEON_DEFAULTS };
    this.osc = []; this.byKey = new Map();
    this.t = 0; this.vr = this.p.vNom; this.Ilp = 0;
    this.hold = 0;      // pitch-hold correction, octaves
    this.order = [];    // lamps firing this sample, by firing time (reused)
    this.update();
    // state for the page (this.post), at most 30 times a second: only the new firings
    this.stateEvery = 128 * Math.ceil(fs / 128 / 30); this.sinceState = 0; // samples (whole 128-sample blocks)
    this.fireBuf = new Float64Array(32 * 258);
    this.oscBuf = new Float64Array(32 * 3);
  }
  update() {
    this.attackAlpha = 1 - Math.exp(-this.k / Math.max(1e-4, this.p.attack));
    this.releaseAlpha = 1 - Math.exp(-this.k / Math.max(1e-4, this.p.release));
    this.regAlpha = 1 - Math.exp(-this.k * TWO_PI * 4);
    this.dcRho = Math.exp(-this.k * TWO_PI * Math.max(0, this.p.dcCut));
  }
  setParams(p) {
    const old = this.p;
    this.p = { ...this.p, ...p };
    if (['vNom', 'vStrike', 'vExt'].some((k) => old[k] !== this.p[k])) for (const o of this.osc) o.retune(o.fTarget, this.p);
    if (old.width !== this.p.width) for (const o of this.osc) o.setPan(this.p.width);
    this.update();
  }
  retune(key, f) { const o = this.byKey.get(key); if (o) o.retune(f, this.p); }
  handle(m) { if (m.type === 'retune') for (const [key, f] of m.list) this.retune(key, f); }
  noteOn(key, vel, data) {
    let o = this.byKey.get(key);
    if (o && !o.dead) { o.keyDown = true; if (data.f !== o.fTarget) o.retune(data.f, this.p); return o; }
    if (o) o.keyDown = false;
    o = new Osc(this, key, data);
    this.osc.push(o); this.byKey.set(key, o);
    if (this.osc.length > this.p.maxOsc) (this.osc.find((x) => !x.keyDown) || this.osc[0]).dead = true;
    return o;
  }
  noteOff(key) { const o = this.byKey.get(key); if (o) o.keyDown = false; }
  allNotesOff() { for (const o of this.osc) o.keyDown = false; }
  voiceCount() { return this.osc.length; }

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
        if (!o.keyDown || o.power < 0.9) continue;
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
    const os = this.osc, p = this.p, k = this.k, order = this.order;
    for (let j = 0; j < os.length; j++) os[j].applyDrift(this, n * k);
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
      // same instant (and may set off others); the rest are untouched.
      if (kick > 0 && os.length > 1) {
        let no = 0;
        for (let j = 0; j < os.length; j++) if (os[j].fireAt >= 0) no = insertByTime(order, no, os[j]);
        for (let e = 0; e < no; e++) {
          const src = order[e], x = src.fireAt;
          for (let j = 0; j < os.length; j++) {
            const o = os[j];
            if (o === src || o.power < 0.5) continue;
            if (o.fireAt >= 0 && o.fireAt <= x) continue;
            if (o.voltageAt(x, k) + kick >= p.vStrike) {
              if (o.fireAt >= 0) no = removeAt(order, no, order.indexOf(o, e + 1));
              o.fireAt = x;
              no = insertByTime(order, no, o);   // lands after src: equal times keep arrival order
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
    for (let i = 0; i < os.length; i++) {
      const o = os[i];
      if (!o.keyDown && o.gate < 1e-4) o.dead = true;
      if (o.dead) { if (this.byKey.get(o.key) === o) this.byKey.delete(o.key); } else os[j++] = o;
    }
    os.length = j;
    if (this.post && (this.sinceState += n) >= this.stateEvery) {
      this.sinceState = 0;
      const nf = this.drainFirings(this.fireBuf), no = this.summary(this.oscBuf);
      this.post({ type: 'state', t: this.t, fs: this.fs, hold: this.hold, osc: this.oscBuf.slice(0, no), fires: this.fireBuf.slice(0, nf) });
    }
  }

  report(win = 0.3) {
    return this.osc.map((o) => ({ key: o.key, f: o.keyDown ? o.frequency(this.t, win, this.fs) : 0, fTarget: o.fTarget, drift: o.driftCents }));
  }

  // For the page: firings since the last call, packed as [key, n, t₁ … t_n,
  // key, n, …] (sounding keys only, times in samples) into buf. Returns the
  // length used.
  drainFirings(buf) {
    let w = 0;
    for (const o of this.osc) {
      const n = Math.min(o.nf - o.sent, 256);
      if (!o.keyDown || w + 2 + n > buf.length) { o.sent = o.nf; continue; }
      buf[w++] = o.key; buf[w++] = n;
      for (let j = o.nf - n; j < o.nf; j++) buf[w++] = o.fires[j & 255];
      o.sent = o.nf;
    }
    return w;
  }

  // [key, design frequency, drift (¢)] for each sounding key, into buf
  summary(buf) {
    let w = 0;
    for (const o of this.osc) if (o.keyDown && w + 3 <= buf.length) { buf[w++] = o.key; buf[w++] = o.fTarget; buf[w++] = o.driftCents; }
    return w;
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

// keep order[0..n) sorted by firing time; equal times keep arrival order
function insertByTime(order, n, o) {
  let i = n;
  while (i > 0 && order[i - 1].fireAt > o.fireAt) { order[i] = order[i - 1]; i--; }
  order[i] = o;
  return n + 1;
}
function removeAt(order, n, i) {
  for (let j = i; j < n - 1; j++) order[j] = order[j + 1];
  return n - 1;
}

globalThis.NeonEngine = NeonEngine;
