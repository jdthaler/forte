// sync-theory.js — exact results for the Huygens keyboard's pulse coupling, in closed form: the
// tests hold the C++ to them. δ and the lock ratio themselves (deltaOf, lockRatio) are the C++'s
// (huygens-model.cpp), which the page and the tests call through huygens-wasm.js.
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

// the kick (fraction of swing) that gives window δ
export function kickFor(delta, vNom, vStrike, vExt) {
  const a = vNom - vStrike, g = Math.log((vNom - vExt) / a);
  return (a * Math.expm1(delta * g)) / (vStrike - vExt);
}

// edges of the p:q tongue in r = f_hi/f_lo
export const tongue = (p, q, delta) => [(p - delta) / q, p / (q - delta)];

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
