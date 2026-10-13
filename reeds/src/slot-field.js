// slot-field.js — the electrostatics of one pickup slot, solved numerically.
//
// Cross-section through the reed tip, looking along the reed:
//
//              ┊ symmetry            ┊ middle of the tooth (symmetry)
//      frame (ground) ───────────────────────────────  y = +H
//              ┊
//              ┊┌─────┐←g→▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
//              ┊│reed │   ▓ comb (+V), thickness t   reed: height h, at
//              ┊└─────┘   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓      height y above the
//              ┊                                       comb's mid-plane
//      frame (ground) ───────────────────────────────  y = −H
//
// Every reed sits in its own slot, and the slots repeat along the keyboard,
// so the reed's centre line and the middle of each tooth are symmetry planes
// (∂φ/∂x = 0). Laplace's equation ∇²φ = 0 is solved by successive
// over-relaxation on a uniform grid. The reed's charge per unit length,
// Q′ = ε₀ ∮ ∂φ/∂n (Gauss), is its mutual capacitance per unit length with the
// comb; × the depth ℓ the tip reaches into the slot gives C(y).
//
// tools/reeds-slot-table.mjs runs this over a range of gaps and writes the
// table the engine interpolates (slot-table.js); the page runs it coarse and
// warm-started to draw the field in the slot as the reed moves.

export const EPS0 = 8.8541878128e-12;

// The slot every reed sits in (metres): reed tongue h × b, comb thickness t,
// comb teeth (solid plate between slots) `tooth` wide, grounded frame ±H.
export const SLOT_GEOM = { h: 0.5e-3, b: 2.4e-3, t: 0.8e-3, tooth: 10e-3, H: 6e-3 };

// geometry in metres: { h, b, t, g, tooth, H }; grid step dx (h/2, b/2, t/2, g, tooth/2, H
// should be multiples of dx so the conductors' faces fall on grid lines)
export function makeSlot({ h, b, t, g, tooth, H, frame = 'ground' }, dx) {
  const nx = Math.round((b / 2 + g + tooth / 2) / dx) + 1, ny = 2 * Math.round(H / dx) + 1;
  return { h, b, t, g, tooth, H, frame, dx, nx, ny, phi: new Float64Array(nx * ny), kind: new Uint8Array(nx * ny), y: NaN };
}

// Mark conductors for reed height y: 0 = free, 1 = reed (φ = 0), 2 = comb (φ = 1), 3 = frame (φ = 0).
// frame: 'ground' (grounded top and bottom) or 'neumann' (insulating; for tests).
export function placeReed(S, y) {
  const { nx, ny, dx, kind, phi } = S, xw = S.b / 2 + S.g, j0 = (ny - 1) / 2, e = 1e-3 * dx;
  for (let j = 0; j < ny; j++) {
    const Y = (j - j0) * dx;
    for (let i = 0; i < nx; i++) {
      const X = i * dx, k = j * nx + i;
      let c = 0;
      if (S.frame === 'ground' && (j === 0 || j === ny - 1)) c = 3;
      else if (X >= xw - e && Math.abs(Y) <= S.t / 2 + e) c = 2;
      else if (X <= S.b / 2 + e && Math.abs(Y - y) <= S.h / 2 + e) c = 1;
      if (c) phi[k] = c === 2 ? 1 : 0; // a node the reed just left keeps φ = 0 as its first guess
      kind[k] = c;
    }
  }
  S.y = y;
}

// SOR sweeps. Mirror (Neumann) at i = 0, i = nx−1 and, for frame 'neumann',
// at j = 0, ny−1. Returns the largest update of the last sweep.
export function relax(S, sweeps, w = 1.9) {
  const { nx, ny, phi, kind } = S, neu = S.frame !== 'ground';
  let dmax = 0;
  for (let it = 0; it < sweeps; it++) {
    dmax = 0;
    for (let j = neu ? 0 : 1; j < (neu ? ny : ny - 1); j++) {
      const r = j * nx, up = j > 0 ? -nx : nx, dn = j < ny - 1 ? nx : -nx;
      for (let i = 0; i < nx; i++) {
        const k = r + i;
        if (kind[k]) continue;
        const l = i > 0 ? phi[k - 1] : phi[k + 1], rt = i < nx - 1 ? phi[k + 1] : phi[k - 1];
        const d = w * (0.25 * (l + rt + phi[k + up] + phi[k + dn]) - phi[k]);
        phi[k] += d;
        if (d > dmax) dmax = d; else if (-d > dmax) dmax = -d;
      }
    }
  }
  return dmax;
}

// Relax until the largest update falls below tol (or maxSweeps).
export function solve(S, tol = 1e-7, maxSweeps = 20000, w = 1.9) {
  let n = 0;
  while (n < maxSweeps) { n += 10; if (relax(S, 10, w) < tol) break; }
  return n;
}

// Reed charge per unit length per volt (F/m), whole reed (both halves).
// Each free→reed link carries flux (φ_free − 0)/dx × dx = φ_free per unit
// length. Nodes on a mirror plane own only half a cell, so their links along
// that plane count ½; the half-domain holds half the reed, hence × 2.
export function reedCharge(S) {
  const { nx, ny, phi, kind } = S, neu = S.frame !== 'ground';
  let q = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    if (kind[k] !== 1) continue;
    const hx = i === 0 ? 0.5 : 1, hy = neu && (j === 0 || j === ny - 1) ? 0.5 : 1;
    if (i + 1 < nx && kind[k + 1] === 0) q += hy * phi[k + 1];
    if (i > 0 && kind[k - 1] === 0) q += hy * phi[k - 1];
    if (j > 0 && kind[k - nx] === 0) q += hx * phi[k - nx];
    if (j < ny - 1 && kind[k + nx] === 0) q += hx * phi[k + nx];
  }
  return 2 * EPS0 * q;
}

// C(y) in farads per metre of insertion depth, sweeping y with warm starts.
export function slotProfile(geom, ys, dx, tol = 1e-7) {
  const S = makeSlot(geom, dx);
  return ys.map((y) => { placeReed(S, y); solve(S, tol); return reedCharge(S); });
}
