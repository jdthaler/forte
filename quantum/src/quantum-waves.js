// quantum-waves.js — the views' grid for each well (no audio, no DOM): the display window, the
// potential, the turning points and the axis label, around every state's eigenfunction φₙ, which
// the WebAssembly model computes (quantum-model.cpp's waveGrid: closed forms for the box and the
// harmonic oscillator, Numerov integration at the exact Eₙ for the others, every φₙ positive in its
// first lobe on the inner side); and |ψ|² on that grid at a time t. Also the wells' names.

const PI = Math.PI;
const HYDROGEN_L = 1; // the packet's l (quantum-model.h): one-photon excitation from s states

export const WELLS = {
  box: { name: 'Infinite square well' },
  morse: { name: 'Morse (anharmonic molecule)' },
  hydrogen: { name: 'Hydrogen (Rydberg atom)' },
  bouncer: { name: 'Quantum bouncer (gravity on a mirror)' },
  harmonic: { name: 'Harmonic oscillator' },
};

// The display window, the potential, and every state's φₙ at `rows` points.
//   ys: positions (natural units); V(y); phi[i] for pk.ns[i]; Erange for the plot;
//   turning(E): classical turning points; label/unit for the axis.
// solve(pk, P, rows) gives the φₙ on that window (the WebAssembly model's: quantum-wasm.js).
export function waveGrid(pk, P, rows, solve) {
  const id = pk.id, ns = pk.ns, nHi = ns[ns.length - 1], Ehi = pk.E[pk.E.length - 1];
  const phi = solve(pk, P, rows), ys = new Float64Array(rows);
  const span = (a, b) => { for (let r = 0; r < rows; r++) ys[r] = a + ((b - a) * (r + 0.5)) / rows; };

  if (id === 'box') {
    span(0, 1);
    return { id, ys, phi, V: () => 0, Vmin: 0, Erange: [0, Ehi * 1.08], turning: () => [0, 1], walls: [0, 1], label: 'x / L' };
  }
  if (id === 'harmonic') {
    const X = 1.15 * Math.sqrt(2 * nHi + 1);
    span(-X, X);
    return { id, ys, phi, V: (x) => 0.5 * x * x, Vmin: 0, Erange: [0, Ehi * 1.12], turning: (E) => [-Math.sqrt(2 * E), Math.sqrt(2 * E)], label: 'x / √(ħ/mω)' };
  }
  if (id === 'morse') {
    const D = pk.kap / 4, V = (x) => D * (1 - Math.exp(-x)) ** 2;
    const turning = (E) => { const s = Math.sqrt(Math.min(E / D, 0.999999)); return [-Math.log(1 + s), -Math.log(1 - s)]; };
    const [a, b] = turning(Ehi), pad = 0.12 * (b - a);
    span(a - pad, b + pad);
    return { id, ys, phi, V, Vmin: 0, Erange: [0, Math.min(D, Ehi * 1.12)], turning, D, label: 'x · a (bond stretch)' };
  }
  if (id === 'bouncer') {
    span(0, 1.12 * Ehi);
    return { id, ys, phi, V: (z) => z, Vmin: 0, Erange: [0, Ehi * 1.12], turning: (E) => [0, E], walls: [0], label: 'height z / ℓ' };
  }
  if (id === 'hydrogen') {
    const l = HYDROGEN_L, rOut = (n) => n * n * (1 + Math.sqrt(1 - ((l + 0.5) / n) ** 2));
    span(0, 1.08 * rOut(nHi));
    const Veff = (r) => -1 / r + (l * (l + 1)) / (2 * r * r);
    const E0 = pk.E[0];
    return {
      id, ys, phi, V: Veff, Vmin: 2.2 * E0, Erange: [2.2 * E0, -0.25 * E0],
      turning: (E) => { const e = Math.sqrt(1 + 2 * E * l * (l + 1)), a = -1 / (2 * E); return [a * (1 - e), a * (1 + e)]; }, walls: [0], label: 'r / a₀',
    };
  }
  throw new Error(`no waves for ${id}`);
}

// |ψ(y, t)|² on the grid, at time t (s). With pure dephasing the density matrix is
// the average over a random classical phase ξ (variance 2t/T_φ), taken on M nodes;
// that reproduces ρ_mn ∝ e^(−(m−n)²t/T_φ) exactly up to aliasing at Δn = M.
export function density(pk, G, t, Tphi = Infinity, out = new Float64Array(G.ys.length)) {
  const N = pk.ns.length, rows = G.ys.length, w = 2 * PI * pk.scale, E0 = pk.E[0];
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) { const ph = -w * (pk.E[i] - E0) * t; re[i] = pk.c[i] * Math.cos(ph); im[i] = pk.c[i] * Math.sin(ph); }
  const v = Tphi < 1e6 ? (2 * Math.max(t, 0)) / Tphi : 0;
  let nodes = [[0, 1]];
  if (v > 1e-4) {
    if (v < 0.25) { const s = Math.sqrt(v); nodes = [[-1.7320508 * s, 1 / 6], [0, 2 / 3], [1.7320508 * s, 1 / 6]]; } // 3-point Gauss–Hermite
    else { const M = 16; let tot = 0; nodes = []; for (let j = 0; j < M; j++) { const x = (2 * PI * j) / M - PI; let p = 0; for (let k = -3; k <= 3; k++) p += Math.exp(-((x + 2 * PI * k) ** 2) / (2 * v)); nodes.push([x, p]); tot += p; } nodes.forEach((q) => { q[1] /= tot; }); }
  }
  out.fill(0);
  for (const [xi, p] of nodes) {
    for (let r = 0; r < rows; r++) {
      let a = 0, b = 0;
      for (let i = 0; i < N; i++) {
        const f = G.phi[i][r];
        if (xi === 0) { a += re[i] * f; b += im[i] * f; }
        else { const k = pk.ns[i] - pk.ns[0], c = Math.cos(k * xi), s = Math.sin(k * xi); a += (re[i] * c + im[i] * s) * f; b += (im[i] * c - re[i] * s) * f; }
      }
      out[r] += p * (a * a + b * b);
    }
  }
  return out;
}
