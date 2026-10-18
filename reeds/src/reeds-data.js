// reeds-data.js — the reed piano's design numbers the page draws with, and capAt, the views'
// reading of a C(y) curve. The physics (the reed's finite elements, its tuning, losses, hammer,
// the slot's C(y) between tabulated gaps, the comb node, the field's pull) is the C++ in
// native/instruments/reeds, run here as WebAssembly (reeds-wasm.js); these numbers are its.
//
//   clamp ▐█▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀●═▓  ← reed tip in a slot of the comb
//         ▐█        ▲ felt hammer       solder   pickup (+V through R)

import { SLOT_GEOM } from './slot-field.js';

export { SLOT_GEOM };
export const KEY_LO = 33, KEY_HI = 96; // 64 keys, A1–C7
export const STEEL = { E: 2.0e11, rho: 7850 };          // spring steel
export const REED = { h: SLOT_GEOM.h, b: SLOT_GEOM.b }; // tongue thickness and width (all keys)
// Pickup: the reed reaches ell into its slot; C0 = everything on the comb's
// node (64 slots, the comb's stray capacitance to the frame, the cable).
export const PICKUP = { ell: 3e-3, C0: 200e-12 };
// The grounded frame above and below the comb (SLOT_GEOM.H = 6 mm from its
// mid-plane) is also an end stop: a reed swinging that far meets it face-on at
// |y| = H − h/2 = 5.75 mm.
export const STOP = { y: SLOT_GEOM.H - SLOT_GEOM.h / 2 };
// Key velocity 0..1 → hammer speed, up to this (m/s)
export const HAMMER_VMAX = 2;

// C, dC/dy and d²C/dy² at height y (m) by Catmull–Rom interpolation of a C(y) curve
// (the model's capCurve: { c, y0, dy, n }).
export function capAt(T, y) {
  const x = Math.min(T.n - 3 - 1e-9, Math.max(1, (y - T.y0) / T.dy)), i = Math.floor(x), f = x - i, c = T.c;
  const p0 = c[i - 1], p1 = c[i], p2 = c[i + 1], p3 = c[i + 2];
  const a1 = 0.5 * (p2 - p0), a2 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3, a3 = 0.5 * (p3 - p0) + 1.5 * (p1 - p2);
  return { C: ((a3 * f + a2) * f + a1) * f + p1, dC: ((3 * a3 * f + 2 * a2) * f + a1) / T.dy, d2C: (6 * a3 * f + 2 * a2) / (T.dy * T.dy) };
}
