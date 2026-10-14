// sync-theory.js — exact results for the Huygens keyboard's pulse coupling.
//
// Each lamp's capacitor charges as V(t) = S − (S − V_e) e^{−t/τ}, fires at V_s
// and drops to V_e: period T = τ g, g = ln[(S − V_e)/(S − V_s)]. When one lamp
// fires, every other lamp sees its voltage lifted by K for an instant. A lamp
// with V + K ≥ V_s fires with it; any other lamp is left exactly as it was.
// In time, a lamp is captured if its own next firing was due within δ·T, with
//
//   δ = ln[(S − V_s + K)/(S − V_s)] / ln[(S − V_e)/(S − V_s)],
//
// the same fraction of a period for every key. So the supply and lamp voltages
// enter the locking only through δ: they rescale the coupling axis.
//
// Two lamps that have fired together are in the same state as at the start, so
// from then on the motion repeats exactly. Stepping from that firing to the
// next shared one gives the lock ratio directly (lockRatio). The p:q lock (the
// higher lamp fires p times while the lower fires q times) needs
//
//   (p − δ)/q ≤ f_hi/f_lo ≤ p/(q − δ),
//
// unless a simpler ratio captures the pair first. Every interval locks to
// something: by Dirichlet's theorem some q ≤ 1/δ brings a firing within the
// window, so the staircase is complete, with no unlocked gaps between steps.

// δ for a kick given as a fraction of the lamp's swing V_s − V_e
export function deltaOf(kick, vNom, vStrike, vExt) {
  if (!(kick > 0)) return 0;
  const a = vNom - vStrike, K = kick * (vStrike - vExt);
  return Math.log((a + K) / a) / Math.log((vNom - vExt) / a);
}

// the kick (fraction of swing) that gives window δ
export function kickFor(delta, vNom, vStrike, vExt) {
  const a = vNom - vStrike, g = Math.log((vNom - vExt) / a);
  return (a * Math.expm1(delta * g)) / (vStrike - vExt);
}

// edges of the p:q tongue in r = f_hi/f_lo
export const tongue = (p, q, delta) => [(p - delta) / q, p / (q - delta)];

// Two lamps that have just fired together: the low one with period 1, the high
// one with period 1/r (r > 0). Returns { p, q } (high : low firings until they
// next fire together), or null if no shared firing comes within maxFirings.
export function lockRatio(r, delta, maxFirings = 100000) {
  const TB = 1 / r;
  let tA = 1, tB = TB, nA = 0, nB = 0;
  for (let i = 0; i < maxFirings; i++) {
    if (tA <= tB) {                              // low lamp fires
      nA++;
      if (tB - tA <= delta * TB) return { p: nB + 1, q: nA };
      tA = nA + 1;
    } else {                                     // high lamp fires
      nB++;
      if (tA - tB <= delta) return { p: nB, q: nA + 1 };
      tB = (nB + 1) * TB;
    }
  }
  return null;
}

// Worst-case time for a pair starting from arbitrary phases to lock onto p:q
// (to first order in the detuning). Until they first fire together, the
// differences between their firing times form a lattice of spacing T_lo/p that
// slides at the beat rate Δ = |p f_lo − q f_hi|; the capture window covers a
// fraction δ(p + q) of the spacing, and each lattice point is tested once per
// q periods of the lower lamp. So the wait is at most about (1 − δ(p+q))/Δ,
// plus q + 1 periods of the lower lamp.
export function captureBound(p, q, fLo, fHi, delta) {
  const beat = Math.abs(p * fLo - q * fHi);
  const frac = Math.max(0, 1 - delta * (p + q));
  const slide = beat > 0 ? (((fHi * q) / (fLo * p)) * frac) / beat : frac > 0 ? Infinity : 0;
  return slide + (q + 1) / fLo;
}
