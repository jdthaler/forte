// materials.js — the data the page and the knobs need besides the model, which is C++
// (native/instruments/piano), built as WebAssembly (piano-wasm.js): the materials and
// cross-sections the knobs offer (as piano-model.h has them), note names, the cap on partials, and
// the mode shapes the views draw from a family's data.

export const MATERIALS = {
  steel:    { name: 'Steel music wire',          E: 2.00e11, G: 7.9e10, rho: 7850, strength: 2.2e9 },
  brass:    { name: 'Brass',                     E: 1.00e11, G: 3.7e10, rho: 8500, strength: 0.6e9 },
  bronze:   { name: 'Phosphor bronze',           E: 1.10e11, G: 4.2e10, rho: 8860, strength: 0.9e9 },
  titanium: { name: 'Titanium alloy',            E: 1.14e11, G: 4.4e10, rho: 4430, strength: 1.0e9 },
  nylon:    { name: 'Nylon monofilament',        E: 4.0e9,   G: 1.4e9,  rho: 1140, strength: 0.6e9 },
  carbon:   { name: 'Carbon fibre (unidirect.)', E: 1.35e11, G: 5.0e9,  rho: 1600, strength: 1.5e9 },
};

export const SHAPES = {
  round:    'Round wire',
  square:   'Square bar',
  triangle: 'Triangular bar (equilateral)',
  ribbon:   'Flat ribbon (rectangle)',
};

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export function noteName(m) { return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }

// At most this many partials per family (CPU), as the model caps them. With "Highest partial" at
// 12 kHz the cap binds from A0 to A1: the stretched partials of A0 stop at 5.6 kHz, C1's at
// 6.6 kHz (the info panel shows it per key).
export const NMAX_MODES = 140;

// Mode shapes φ_n(x) at the given points: Float64Array (n × xs.length).
export function shapeMatrix(fam, L, xs) {
  const nx = xs.length, out = new Float64Array(fam.n * nx);
  if (fam.shape.kind === 'sine') {
    for (let n = 0; n < fam.n; n++) {
      const kk = ((n + 1) * Math.PI) / L, nrm = fam.shape.norm[n];
      for (let i = 0; i < nx; i++) out[n * nx + i] = nrm * Math.sin(kk * xs[i]);
    }
  } else {
    const { nb, coef } = fam.shape;
    const S = new Float64Array(nb * nx);
    for (let j = 0; j < nb; j++) for (let i = 0; i < nx; i++) S[j * nx + i] = Math.sin(((j + 1) * Math.PI * xs[i]) / L);
    for (let n = 0; n < fam.n; n++) {
      for (let j = 0; j < nb; j++) {
        const c = coef[n * nb + j];
        for (let i = 0; i < nx; i++) out[n * nx + i] += c * S[j * nx + i];
      }
    }
  }
  return out;
}
