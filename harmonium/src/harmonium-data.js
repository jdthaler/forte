// harmonium-data.js — what the page needs besides the model: the key range, the ranks of reeds
// and which stops engage them, and areaAt, the views' reading of a reed's slot-area table. The
// physics (the reeds, their slots, the air, the wind, the linear analysis) is the C++ in
// native/instruments/harmonium, run here as WebAssembly (harmonium-wasm.js); these are its numbers.

export const KEY_LO = 36, KEY_HI = 96;   // C2–C7, 61 keys (the 8′ rank)
export const AIR = { rho: 1.2, c: 343 };
export const CD = 0.61;                  // vena contracta of a sharp-edged slot

// The ranks of reeds a key can sound. oct: octave relative to the key; cents: the musette's detuning
// (in units of the Musette detune knob); the stops say which are engaged.
export const RANKS = [
  { id: 'L', name: '16′', oct: -1, cents: 0 },
  { id: 'M', name: '8′', oct: 0, cents: 0 },
  { id: 'Mp', name: '8′ +', oct: 0, cents: 1 },
  { id: 'Mm', name: '8′ −', oct: 0, cents: -1 },
  { id: 'H', name: '4′', oct: 1, cents: 0 },
];
// Which ranks the stops engage: 16′, 8′ (with the musette's detuned reeds), 4′.
export function engaged(P, on = new Array(RANKS.length)) {
  const m = P.musette;
  on[0] = !!P.bourdon; on[1] = !!P.principal; on[4] = !!P.piccolo;
  on[2] = m === 'two' || m === 'three';
  on[3] = m === 'three';
  return on;
}

// A reed's slot area A(y) and dA/dy from its table (the model's: { lo, dy, n, A }), interpolated
// linearly and extrapolated beyond it; out.A, out.dA.
export function areaAt(T, y, out) {
  let u = (y - T.lo) / T.dy, j = Math.floor(u);
  if (j < 0) j = 0; else if (j > T.n - 2) j = T.n - 2;
  const a0 = T.A[j], a1 = T.A[j + 1], dA = (a1 - a0) / T.dy;
  out.A = a0 + dA * (u - j) * T.dy; out.dA = dA;
  return out;
}
