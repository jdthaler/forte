// staircase.js — one point of the lock map: C4 plus a second lamp `cents`
// above it, at a given coupling, for the circuit P.
//
// With pulse coupling alone the answer is exact (sync-theory.js): two lamps
// that have fired together step to their next shared firing, and the counts
// give the lock p:q. Rail sag adds a continuous coupling with no closed form,
// so with it on the point is simulated instead (from a shared firing, so the
// map is reproducible).

import { NeonEngine } from './neon-engine.js';
import { nearestRatio } from './tuning.js';
import { deltaOf, lockRatio } from './sync-theory.js';

const FS = 24000;                  // plenty for locking; 2× faster
const F0 = 261.6256;
export const QMAX = 24;            // tongues are drawn for locks with q ≤ QMAX

export const exactMap = (P) => !(P.rSrc > 0);

function simulate(P, cents, kick) {
  const e = new NeonEngine(FS);
  e.setParams({ ...P, kick, pitchHold: 0, drift: 0 });
  e.noteOn(60, 1, { f: F0, phase: 0, settled: true });
  e.noteOn(61, 1, { f: F0 * 2 ** (cents / 1200), phase: 0, settled: true });
  const L = new Float32Array(256), R = new Float32Array(256);
  for (let s = 0; s < 0.6 * FS; s += 256) e.process(L, R, 256);
  const [a, b] = e.report(0.4);
  if (!a.f || !b.f) return null;
  return 1200 * Math.log2(b.f / a.f);
}

// [interval actually played (cents), lock code p·100 + q, or 0 if none drawn]
export function stairPoint(P, cents, kick) {
  if (exactMap(P)) {
    if (!(kick > 0)) return [cents, 0];
    const lr = lockRatio(2 ** (cents / 1200), deltaOf(kick, P.vNom, P.vStrike, P.vExt));
    if (!lr) return [cents, 0];
    return [1200 * Math.log2(lr.p / lr.q), lr.q <= QMAX ? lr.p * 100 + lr.q : 0];
  }
  const m = simulate(P, cents, kick);
  if (m === null) return [NaN, 0];
  const nr = nearestRatio(2 ** (m / 1200), QMAX);
  return [m, Math.abs(nr.cents) < 0.3 ? nr.p * 100 + nr.q : 0];
}
