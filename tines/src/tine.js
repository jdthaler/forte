// tine.js — the page's small helpers for the tine piano: the key range, note names and the
// tone bar's drawn shape. The mechanics (the tine's finite elements, the coupled tine, tone bar
// and block, the pickup) are the C++ in native/instruments/tines, run here as WebAssembly
// (tines-wasm.js).

export const KEY_LO = 28, KEY_HI = 100; // the Mark I's 73 keys, E1–E7
export const KEY_MIN = 21, KEY_MAX = 108; // what it plays: the 88-key Mark I and II's A0–C8
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);

// Uniform cantilever, mode 1, normalised to 2 at the tip (for drawing the bar).
export function barShape(xi) {
  const b = 1.8751040687;
  const sig = (Math.cosh(b) + Math.cos(b)) / (Math.sinh(b) + Math.sin(b));
  const f = (x) => Math.cosh(b * x) - Math.cos(b * x) - sig * (Math.sinh(b * x) - Math.sin(b * x));
  return (2 * f(xi)) / f(1);
}
