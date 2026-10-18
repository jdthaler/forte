// tuning.js — the keys, their names and intervals, and the ratios locks are named by. What each
// key is designed to play (equal or just, mistuned) is the C++'s (huygens-model.cpp tunedFreq),
// which the page calls through huygens-wasm.js.

export const KEY_LO = 36, KEY_HI = 96;
export const keyFreq = (m) => 440 * 2 ** ((m - 69) / 12);
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const PC = NAMES;
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// Small-integer ratio nearest to r (both terms ≤ maxQ), for naming locks.
export function nearestRatio(r, maxQ = 12) {
  let best = { p: 1, q: 1, cents: Infinity };
  for (let q = 1; q <= maxQ; q++) {
    const p = Math.round(r * q);
    if (p < 1 || p > 4 * maxQ) continue;
    const c = 1200 * Math.log2(r / (p / q));
    const g = gcd(p, q);
    if (g !== 1) continue;
    if (Math.abs(c) < Math.abs(best.cents) - 1e-9) best = { p, q, cents: c };
  }
  return best;
}
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }

const INTERVALS = ['unison', 'minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th', 'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th'];
export function intervalName(semis) {
  const oct = Math.floor(semis / 12), n = INTERVALS[((semis % 12) + 12) % 12];
  return oct ? `${n} + ${oct} oct` : n;
}
