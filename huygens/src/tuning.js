// tuning.js — what each key is *designed* to play (before any locking).

export const KEY_LO = 36, KEY_HI = 96;
export const keyFreq = (m) => 440 * 2 ** ((m - 69) / 12);
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const PC = NAMES;
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// 5-limit just scale above a tonic
export const JUST = [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8];

// deterministic per-key number in [−1, 1]
function keyNoise(m) {
  let t = (m * 2654435761) >>> 0;
  t ^= t >>> 15; t = Math.imul(t, 2246822519) >>> 0; t ^= t >>> 13;
  return ((t >>> 0) / 4294967296) * 2 - 1;
}

export function tunedFreq(m, P) {
  let f;
  if (P.tuning === 'just') {
    const deg = (((m - P.tonic) % 12) + 12) % 12;
    f = keyFreq(m - deg) * JUST[deg];
  } else f = keyFreq(m);
  if (P.mistune > 0) f *= 2 ** ((P.mistune * keyNoise(m)) / 1200);
  return f;
}

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
