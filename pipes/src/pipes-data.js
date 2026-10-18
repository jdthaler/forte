// pipes-data.js — what the page needs besides the physics: the compass, the stops and their ranks,
// and the organ's names for keys and pipes. The pipes themselves (scale, voicing, the linear
// analysis, the wind) are computed in C++ (native/instruments/pipes/pipes-model.h): the page asks
// the WebAssembly model (pipes-wasm.js) for them.

export const AIR = { rho: 1.2, c: 343 };
export const KEY_LO = 36, KEY_HI = 89;      // C–f³, 54 keys: the manual's compass
export const KEY_MIN = 21, KEY_MAX = 108;   // A0–C8, with the full range open
export const CP = 0.4;                      // jet phase velocity over jet velocity, as pipes-model.h has it
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
// Organ-pitch names: C (36) … B (47), c (48) … b, c¹ (60), c² (72), c³ (84); below, the contra
// octave C₁ (24) … B₁ and the sub-contra A₂ (21) … B₂; above, c⁴ (96) and c⁵ (108)
const SUP = ['', '¹', '²', '³', '⁴', '⁵'], SUB = ['', '', '₁', '₂'];
export function organName(m) {
  const pc = NAMES[((m % 12) + 12) % 12], o = Math.floor(m / 12) - 4;
  return o < 0 ? pc + SUB[-o] : pc.toLowerCase() + SUP[o];
}

// Each key has six pipes: Principal 8′, Octave 4′, Gedackt 8′ and the Mixture's three ranks.
export const STOPS = [
  { id: 'principal', name: 'Principal 8′' },
  { id: 'octave', name: 'Octave 4′' },
  { id: 'gedackt', name: 'Gedackt 8′' },
  { id: 'mixture', name: 'Mixture III' },
];
export const RANKS = [
  { id: 'P8', stop: 0, stopped: false },
  { id: 'O4', stop: 1, stopped: false },
  { id: 'G8', stop: 2, stopped: true },
  { id: 'M1', stop: 3, stopped: false },
  { id: 'M2', stop: 3, stopped: false },
  { id: 'M3', stop: 3, stopped: false },
];
// footage of a pipe sounding harmonic n of the 8′: 8/n feet, written as organists write it
export function footage(n) {
  const F = { 1: '8′', 1.5: '5⅓′', 2: '4′', 3: '2⅔′', 4: '2′', 6: '1⅓′', 8: '1′', 12: '⅔′' };
  return F[n] || `${(8 / n).toFixed(2)}′`;
}
// Which ranks the drawn stops engage.
export function engaged(P, on = new Array(RANKS.length)) {
  const s = [!!P.principal, !!P.octave, !!P.gedackt, !!P.mixture];
  for (let r = 0; r < RANKS.length; r++) on[r] = s[RANKS[r].stop];
  return on;
}
