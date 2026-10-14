// bell-profile.js — the bell's cross-section (its "rib", as founders call it),
// its modes from the axisymmetric FEM (bell-fem.js), the named partials, and
// the founder's tuning: adjusting the rib until the partials sit where they
// should. Pure physics: no audio, no DOM.
//
//            crown (bolted to the frame)
//      ┌───────────────┐
//     ╱ shoulder         ╲
//    │                     │     the rib is given by its mid-surface (r, z) and its
//    │ waist (thin)        │     thickness t, at ten stations from the crown's bolt
//   ╱                       ╲    hole to the lip; lengths in units of the diameter D
//  ╱ soundbow (thick: struck ╲   at the lip (outer edge)
//  ▔▔ lip                  ▔▔
//
// Founders design a rib once and scale it for every bell of a register: a bell
// of the same rib half the size sounds an octave higher (f ∝ 1/D). Carillon trebles
// use heavier ribs (thicker walls for their size). Here each register's rib is
// tuned on its own (tools/carillon-profile.mjs writes bell-table.js).

import { meshWall, modesOf, TAU } from './bell-fem.js';

import { BRONZE, cBronze } from './bronze.js';
export { BRONZE, cBronze };

// ---- the rib ----------------------------------------------------------------------------------------
// The starting point: a mid-surface and thicknesses at ten stations, proportioned after
// published sections of minor-third carillon bells (height ≈ 0.78 D to the top of the crown,
// a crown about half the lip's diameter, a soundbow about D/13 thick, a waist about a third of
// that). [r, z, t] in units of D (the lip's outer diameter is normalised to 1 afterwards).
export const STATIONS = ['bolt hole', 'crown', 'crown edge', 'shoulder', 'upper waist', 'waist', 'lower waist', 'above the soundbow', 'soundbow', 'lip'];
export const MINOR_START = [
  [0.035, 0.785, 0.055], [0.130, 0.785, 0.055], [0.198, 0.783, 0.052], [0.251, 0.762, 0.046],
  [0.274, 0.660, 0.036], [0.287, 0.500, 0.029], [0.305, 0.350, 0.031], [0.341, 0.210, 0.046],
  [0.425, 0.095, 0.075], [0.466, 0.015, 0.052],
];
// The major-third bell starts from a different shape: the same crown and soundbow, but a waist that
// bulges outward (positive meridional curvature, which stiffens the low-m partials against membrane
// stretching) instead of flaring in a concave sweep.
export const MAJOR_START = MINOR_START.map(([r, z, t], i) => [r + [0, 0, 0, 0, 0.02, 0.04, 0.02, 0, 0, 0][i], z, t]);

// The founder's handles on the rib (the tuning tool moves these; zero leaves the start alone):
//   height  stretches the bell between the lip and the shoulder (a longer waist lowers the hum,
//           prime and tierce against the nominal)
//   flare   pulls the lower waist in, so the bell flares more sharply into the soundbow (more
//           meridional curvature there: the rim partials bunch together)
//   waist   the waist's thickness (stations 4–6), as a log factor
//   upper   thickens the shoulder and upper waist against the lower waist (stations 3–4 vs 6–7)
//   crown   widens the crown and the top of the waist (a more cylindrical upper bell lowers the prime)
//   bow     the soundbow's and lip's thickness (stations 7–9)
//   lip     the lip's own thickness (station 9)
//   ring    a band of extra metal round the upper waist (station 4): one of the handles the
//           major-third bell needs
export const HANDLES = ['height', 'flare', 'waist', 'upper', 'crown', 'bow', 'lip', 'ring'];

// The rib for handle values `h` (an object; missing = 0) on a start `S`, with every thickness
// scaled by `heavy` (a heavier rib for the trebles). Returns stations [r, z, t] with the lip's
// outer diameter normalised to 1.
export function ribStations(S, h = {}, heavy = 1) {
  const v = (k) => h[k] || 0, zs = S[3][1];
  const out = S.map(([r, z, t], i) => {
    let zz = z, rr = r, tt = t;
    if (i >= 3) zz = z * Math.exp(v('height')); else zz = z + zs * (Math.exp(v('height')) - 1); // the crown rides on the shoulder
    if (i === 6) rr -= 0.015 * v('flare'); else if (i === 7) rr -= 0.03 * v('flare');
    if (i >= 4 && i <= 6) tt *= Math.exp(v('waist'));
    if (i === 3 || i === 4) tt *= Math.exp(v('upper')); else if (i === 6 || i === 7) tt *= Math.exp(-v('upper'));
    if (i >= 1 && i <= 3) rr *= Math.exp(v('crown')); else if (i === 4) rr *= Math.exp(0.5 * v('crown'));
    if (i >= 8) tt *= Math.exp(v('bow')); else if (i === 7) tt *= Math.exp(0.5 * v('bow'));
    if (i === 9) tt *= Math.exp(v('lip'));
    // per-station handles: t<i> (log thickness), r<i> (radius, in units of D/50), z<i> (height, log)
    tt *= Math.exp(v(`t${i}`)); rr += 0.02 * v(`r${i}`); zz *= Math.exp(v(`z${i}`));
    if (i === 4) tt *= Math.exp(v('ring'));
    return [rr, zz, tt * heavy];
  });
  // normalise: the lip's outer edge is at r = 1/2
  const g = geomOf(out), [ro] = outerAt(g, 1), s = 0.5 / ro;
  return out.map(([r, z, t]) => [r * s, z * s, t * s]);
}

// ---- smooth curves through the stations -----------------------------------------------------------
// Mid-surface: a C² cubic spline in the chord-length parameter, horizontal at the bolt hole (a flat
// crown) and natural at the lip, so its curvature is spread smoothly between stations. Thickness: a
// monotone cubic (Fritsch–Carlson), so it never overshoots.
function hermite(p0, p1, m0, m1, t, dt) {
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * dt * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * dt * m1;
}
function dhermite(p0, p1, m0, m1, t, dt) {
  const t2 = t * t;
  return ((6 * t2 - 6 * t) * p0 + (3 * t2 - 4 * t + 1) * dt * m0 + (-6 * t2 + 6 * t) * p1 + (3 * t2 - 2 * t) * dt * m1) / dt;
}
// Slopes of the C² cubic spline through (u_i, y_i): first slope given (or natural if null), natural at the end.
function splineSlopes(u, y, s0) {
  const n = u.length, h = [], A = [], B = [], C = [], R = [];
  for (let i = 0; i < n - 1; i++) h.push(u[i + 1] - u[i]);
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      if (s0 === null) { A.push(0); B.push(2 / h[0]); C.push(1 / h[0]); R.push((3 * (y[1] - y[0])) / (h[0] * h[0])); }
      else { A.push(0); B.push(1); C.push(0); R.push(s0); }
    } else if (i === n - 1) { A.push(1 / h[i - 1]); B.push(2 / h[i - 1]); C.push(0); R.push((3 * (y[i] - y[i - 1])) / (h[i - 1] * h[i - 1])); }
    else {
      A.push(1 / h[i - 1]); B.push(2 / h[i - 1] + 2 / h[i]); C.push(1 / h[i]);
      R.push(3 * ((y[i] - y[i - 1]) / (h[i - 1] * h[i - 1]) + (y[i + 1] - y[i]) / (h[i] * h[i])));
    }
  }
  for (let i = 1; i < n; i++) { const f = A[i] / B[i - 1]; B[i] -= f * C[i - 1]; R[i] -= f * R[i - 1]; } // Thomas
  const m = new Array(n);
  m[n - 1] = R[n - 1] / B[n - 1];
  for (let i = n - 2; i >= 0; i--) m[i] = (R[i] - C[i] * m[i + 1]) / B[i];
  return m;
}
export function geomOf(st) {
  const n = st.length, u = [0];
  for (let i = 1; i < n; i++) u.push(u[i - 1] + Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]));
  for (let i = 0; i < n; i++) u[i] /= u[n - 1];
  const mr = splineSlopes(u, st.map((p) => p[0]), null), mz = splineSlopes(u, st.map((p) => p[1]), 0);
  // Fritsch–Carlson slopes for t
  const t = st.map((s) => s[2]), d = [], mt = [];
  for (let i = 0; i < n - 1; i++) d.push((t[i + 1] - t[i]) / (u[i + 1] - u[i]));
  for (let i = 0; i < n; i++) {
    if (i === 0) mt.push(d[0]); else if (i === n - 1) mt.push(d[n - 2]);
    else mt.push(d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]));
  }
  const seg = (x) => { let i = 0; while (i < n - 2 && x > u[i + 1]) i++; return i; };
  const ev = (x, k, m, dv) => {
    const i = seg(x), dt = u[i + 1] - u[i], s = (x - u[i]) / dt;
    return dv ? dhermite(st[i][k], st[i + 1][k], m[i], m[i + 1], s, dt) : hermite(st[i][k], st[i + 1][k], m[i], m[i + 1], s, dt);
  };
  const g = {
    stations: st, u,
    mid: (x) => [ev(x, 0, mr), ev(x, 1, mz)],
    tan: (x) => { const a = ev(x, 0, mr, true), b = ev(x, 1, mz, true), l = Math.hypot(a, b); return [a / l, b / l]; },
    t: (x) => ev(x, 2, mt),
  };
  // Mesh spacing: elements of equal ∫ ds/√t (finer where the wall is thin and bends in short waves).
  const N = 2000, cum = [0];
  let prev = g.mid(0);
  for (let i = 1; i <= N; i++) {
    const x = i / N, p = g.mid(x), ds = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    cum.push(cum[i - 1] + ds / Math.sqrt(g.t(x - 0.5 / N)));
    prev = p;
  }
  g.sGrid = (ns) => {
    const out = [0];
    let j = 0;
    for (let e = 1; e < ns; e++) {
      const target = (cum[N] * e) / ns;
      while (cum[j + 1] < target) j++;
      out.push((j + (target - cum[j]) / (cum[j + 1] - cum[j])) / N);
    }
    out.push(1);
    return out;
  };
  return g;
}
// How close the wall comes to folding over itself: max over the mid-surface of κ·t/2 (κ its curvature;
// at 1 the inner surface would cross itself). The tuner keeps it under 0.8.
export function foldMargin(g) {
  let worst = 0;
  for (let i = 1; i < 400; i++) {
    const u = i / 400, a = g.tan(u - 1e-3), b = g.tan(u + 1e-3), p = g.mid(u - 1e-3), q = g.mid(u + 1e-3);
    worst = Math.max(worst, (Math.abs(a[0] * b[1] - a[1] * b[0]) / Math.hypot(q[0] - p[0], q[1] - p[1])) * 0.5 * g.t(u));
  }
  return worst;
}
// Inner and outer surface points at u: [r, z].
export function outerAt(g, x) { const [r, z] = g.mid(x), [a, b] = g.tan(x), t = g.t(x); return [r - 0.5 * t * b, z + 0.5 * t * a]; }
export function innerAt(g, x) { const [r, z] = g.mid(x), [a, b] = g.tan(x), t = g.t(x); return [r + 0.5 * t * b, z - 0.5 * t * a]; }

// Volume of the rib's solid of revolution (units of D³): Pappus, ∫ 2π r t ds.
export function ribVolume(g) {
  let V = 0, prev = g.mid(0);
  const N = 2000;
  for (let i = 1; i <= N; i++) {
    const x = i / N, p = g.mid(x), xm = x - 0.5 / N, ds = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    V += TAU * g.mid(xm)[0] * g.t(xm) * ds;
    prev = p;
  }
  return V;
}

// ---- modes ------------------------------------------------------------------------------------------
export const MESH = { ns: 40, nt: 2 }; // elements along the wall and through it (the tests refine both)
export const CLAMP_R = 0.1; // the crown is clamped to its headstock out to this radius (units of D)

// The FEM for one rib: modes for m = 0 … mMax, `perM` each (or a list per m). The crown is held
// fixed out to CLAMP_R (a carillon bell is bolted, dead, to a headstock in its frame).
// Returns { mesh, g, modes: { m: [mode…] } }.
export function solveRib(stations, { ns = MESH.ns, nt = MESH.nt, ms = [2, 3, 4], perM = 2, nu = BRONZE.nu, warm = null } = {}) {
  const g = geomOf(stations), mesh = meshWall(g, ns, nt);
  const fixedNodes = [];
  mesh.rows.forEach((row, i) => {
    const e = i >> 1, u = i % 2 ? 0.5 * (mesh.ue[e] + mesh.ue[e + 1]) : mesh.ue[e];
    if (g.mid(u)[0] <= CLAMP_R) for (const p of row) if (p >= 0) fixedNodes.push(p);
  });
  const modes = {};
  for (const m of ms) {
    const k = typeof perM === 'number' ? perM : perM[m] ?? 0;
    if (k > 0) modes[m] = modesOf(mesh, m, nu, k, { fixedNodes, warm });
  }
  return { g, mesh, modes };
}

// A mode's normal displacement along the outer (side = +1) or inner (−1) surface, and along the
// mid-surface (0), at every row of nodes: [{ u, r, z, w }] (w = U · n, n the outward normal).
export function surfaceShape(sol, mode, side = 1) {
  const { mesh, g } = sol, nt = mesh.nt, j = side > 0 ? 2 * nt : side < 0 ? 0 : nt, out = [];
  for (let i = 0; i < mesh.rows.length; i++) {
    const e = i >> 1, u = i % 2 ? 0.5 * (mesh.ue[e] + mesh.ue[e + 1]) : mesh.ue[e];
    let p = mesh.rows[i][j];
    if (p < 0) { // mid-surface on an odd row: average the neighbours across the wall
      const a = mesh.rows[i][j - 1], b = mesh.rows[i][j + 1];
      const [tr, tz] = g.tan(u), nr = -tz, nz = tr;
      const w = 0.5 * ((mode.U[3 * a] + mode.U[3 * b]) * nr + (mode.U[3 * a + 2] + mode.U[3 * b + 2]) * nz);
      const [r, z] = g.mid(u);
      out.push({ u, r, z, w, ut: 0.5 * (mode.U[3 * a + 1] + mode.U[3 * b + 1]) });
      continue;
    }
    // the surface's own normal (side ≠ 0): from the neighbouring nodes on the same surface
    const [r, z] = mesh.nodes[p];
    let nr, nz;
    if (side === 0) { const [tr, tz] = g.tan(u); nr = -tz; nz = tr; }
    else {
      const ip = Math.max(0, i - 1), iq = Math.min(mesh.rows.length - 1, i + 1);
      const P = mesh.nodes[mesh.rows[ip][j]], Q = mesh.nodes[mesh.rows[iq][j]];
      const tr = Q[0] - P[0], tz = Q[1] - P[1], l = Math.hypot(tr, tz);
      nr = -tz / l; nz = tr / l;
    }
    out.push({ u, r, z, w: mode.U[3 * p] * nr + mode.U[3 * p + 2] * nz, ut: mode.U[3 * p + 1], nr, nz });
  }
  return out;
}

// Nodal circles: sign changes of the normal displacement along the mid-surface from the lip up to
// the crown's edge, ignoring parts that barely move (under `floor` of the largest motion), and where
// each lies (height above the lip, as a fraction of the bell's height).
export function nodalCircles(sol, mode, floor = 0.03) {
  const sh = surfaceShape(sol, mode, 0), H = sol.g.mid(0)[1];
  let wmax = 0;
  for (const p of sh) wmax = Math.max(wmax, Math.abs(p.w));
  const pts = sh.filter((p) => p.u >= sol.g.u[2]).reverse(); // lip → crown edge
  const circles = [];
  let last = null;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (Math.abs(p.w) < floor * wmax) continue;
    if (last && Math.sign(p.w) !== Math.sign(last.w)) {
      // locate the zero between last and p by linear interpolation along the points between them
      let a = last, z = null;
      for (let k = pts.indexOf(last) + 1; k <= i; k++) { const b = pts[k]; if (Math.sign(b.w) !== Math.sign(a.w) || b === p) { z = a.z + ((b.z - a.z) * a.w) / (a.w - b.w); if (Math.sign(b.w) !== Math.sign(a.w)) break; } a = b; }
      circles.push(z / H);
    }
    last = p;
  }
  return circles;
}

// ---- the named partials ---------------------------------------------------------------------------
// The partials founders name, by their family m (2m nodal meridians) and their order within it.
// Designations (m, n) count nodal circles; '#' marks the second mode with the same count
// (Rossing & Perrin 1987; Fletcher & Rossing 1998, ch. 21).
export const NAMED = [
  { id: 'hum', name: 'hum', m: 2, k: 0, des: '(2,0)', ideal: 0.5 },
  { id: 'prime', name: 'prime', m: 2, k: 1, des: '(2,1#)', ideal: 1 },
  { id: 'tierce', name: 'tierce', m: 3, k: 0, des: '(3,1)', ideal: 1.2 },
  { id: 'quint', name: 'quint', m: 3, k: 1, des: '(3,1#)', ideal: 1.5 },
  { id: 'nominal', name: 'nominal', m: 4, k: 0, des: '(4,1)', ideal: 2 },
  { id: 'deciem', name: 'deciem', m: 4, k: 1, des: '(4,1#)', ideal: 2.5 },
  { id: 'superquint', name: 'superquint', m: 5, k: 0, des: '(5,1)', ideal: 3 },
  { id: 'octnom', name: 'octave nominal', m: 6, k: 0, des: '(6,1)', ideal: 4 },
];
export const cents = (a, b) => 1200 * Math.log2(a / b);

// ---- the founder's tuning ---------------------------------------------------------------------------
// Which mode of family m is the rim partial (motion largest at the lip; the nominal, superquint and
// octave nominal), among its lowest two. The other is the '#' partial with a nodal circle near the
// soundbow (prime, quint, deciem). For m = 2 and 3 the order decides (hum below prime, tierce below quint).
export function rimIndex(sol, m) {
  const md = sol.modes[m];
  if (m <= 3 || md.length < 2) return 0;
  const lip = (x) => { const sh = surfaceShape(sol, x, 1); let mx = 0; for (const p of sh) mx = Math.max(mx, Math.abs(p.w)); return Math.abs(sh[sh.length - 1].w) / mx; };
  return lip(md[1]) > lip(md[0]) ? 1 : 0;
}
// The eight named partials of a solution (m = 2…6, two modes each): [{ id, m, k, f (√λ) }].
export function named(sol) {
  return NAMED.map((n) => {
    const r = n.m >= 4 ? rimIndex(sol, n.m) : 0, k = n.m >= 4 ? (n.k === 0 ? r : 1 - r) : n.k;
    return { ...n, k, f: Math.sqrt(sol.modes[n.m][k].lambda), mode: sol.modes[n.m][k] };
  });
}
// Errors of the tuned partials, in cents, the way a founder reads a bell: by its nominal, every other
// partial in cents from where it should be: hum, prime, tierce, quint, superquint, octave nominal.
export const TUNED = ['hum', 'prime', 'tierce', 'quint', 'superquint', 'octnom', 'deciem'];
export function partialErrors(sol, tierce = 1.2) {
  const p = Object.fromEntries(named(sol).map((x) => [x.id, x.f])), n = p.nominal;
  const ideal = { hum: 0.25, prime: 0.5, tierce: tierce / 2, quint: 0.75, superquint: 1.5, octnom: 2, deciem: 1.25 };
  return TUNED.map((id) => cents(p[id] / n, ideal[id]));
}

// Levenberg–Marquardt on the handles: bring hum, prime, tierce and quint to 1/4, 1/2, tierce/2 and
// 3/4 of the nominal, and the superquint and octave nominal to 3/2 and 2 of it (weighted `upperW`), with a
// penalty μ|h|² that keeps the rib close to its start; μ is lowered in steps (continuation), so the
// rib moves no further than it must. Returns { h, errors (¢), iterations, evaluations }.
// Every station's thickness, radius and height may move, except the crown's height (the crown stays flat).
export const STATION_HANDLES = [...Array(10).keys()].map((i) => `t${i}`).concat([2, 3, 4, 5, 6, 7, 8, 9].map((i) => `r${i}`), [4, 5, 6, 7, 8].map((i) => `z${i}`));
export function tuneRib(start, { tierce = 1.2, handles = STATION_HANDLES, h0 = {}, heavy = 1,
  mus = [0.03, 3e-3, 3e-4], primaryW = 10, upperW = 0, deciemW = 0, foldMax = 0.8, ns = MESH.ns, nt = MESH.nt, maxIter = 40, log = null } = {}) {
  const n = handles.length, W = [primaryW, primaryW, primaryW, primaryW, upperW, upperW, deciemW], warm = {};
  let p = handles.map((k) => h0[k] || 0), evals = 0, it = 0;
  const hOf = (q) => ({ ...h0, ...Object.fromEntries(handles.map((k, i) => [k, q[i]])) });
  const resid = (q) => {
    evals++;
    const st = ribStations(start, hOf(q), heavy);
    if (foldMargin(geomOf(st)) > foldMax) throw new Error('the wall would fold');
    return partialErrors(solveRib(st, { ns, nt, ms: [2, 3, 4, 5, 6], perM: 2, warm }), tierce).map((c, i) => (W[i] * c) / 100);
  };
  let r = resid(p);
  // the stages: the penalty μ lowered step by step with the soft targets on; then a last stage with
  // only the five tuned partials, so that they end exact, and the soft ones where that leaves them
  const stages = mus.map((mu) => ({ mu, soft: true }));
  if (upperW || deciemW) stages.push({ mu: mus[mus.length - 1], soft: false });
  let anchor = p.map(() => 0); // the penalty pulls toward the start, and in the last stage toward where the soft stages left the rib
  for (const { mu, soft } of stages) {
    if (!soft) { W[4] = W[5] = W[6] = 0; r = resid(p); anchor = p.slice(); }
    const cost = (rr, q) => rr.reduce((s, x) => s + x * x, 0) + mu * q.reduce((s, x, i) => s + (x - anchor[i]) ** 2, 0);
    let lam = 0.01;
    for (let k = 0; k < maxIter; k++, it++) {
      const J = [];
      for (let q = 0; q < n; q++) {
        let d = 1e-3, rr;
        const pp = p.slice(); pp[q] += d;
        try { rr = resid(pp); } catch { pp[q] -= 2 * d; d = -d; rr = resid(pp); }
        J.push(rr.map((x, i) => (x - r[i]) / d));
      }
      let moved = false, gain = 0;
      for (let tries = 0; tries < 10 && !moved; tries++) {
        const A = [];
        for (let a = 0; a < n; a++) {
          const row = [];
          for (let b = 0; b < n; b++) { let s = 0; for (let i = 0; i < r.length; i++) s += J[a][i] * J[b][i]; row.push(s + (a === b ? mu : 0)); }
          let g = 0; for (let i = 0; i < r.length; i++) g += J[a][i] * r[i];
          row[a] *= 1 + lam; row.push(-(g + mu * (p[a] - anchor[a]))); A.push(row);
        }
        for (let c = 0; c < n; c++) { // Gaussian elimination with partial pivoting
          let piv = c; for (let a = c + 1; a < n; a++) if (Math.abs(A[a][c]) > Math.abs(A[piv][c])) piv = a;
          [A[c], A[piv]] = [A[piv], A[c]];
          for (let a = c + 1; a < n; a++) { const f = A[a][c] / A[c][c]; for (let b = c; b <= n; b++) A[a][b] -= f * A[c][b]; }
        }
        const dp = new Array(n).fill(0);
        for (let c = n - 1; c >= 0; c--) { let s = A[c][n]; for (let b = c + 1; b < n; b++) s -= A[c][b] * dp[b]; dp[c] = s / A[c][c]; }
        const big = Math.max(...dp.map(Math.abs)), sc = big > 0.15 ? 0.15 / big : 1;
        const pn = p.map((x, q) => x + sc * dp[q]);
        let rn = null;
        try { rn = resid(pn); } catch { rn = null; }
        if (rn && cost(rn, pn) < cost(r, p)) { gain = cost(r, p) - cost(rn, pn); p = pn; r = rn; lam = Math.max(1e-6, lam / 4); moved = true; } else lam *= 4;
      }
      log?.(mu, it, r.map((x, i) => (W[i] ? (100 * x) / W[i] : NaN)), hOf(p));
      if (!moved || gain < 1e-10) break;
    }
  }
  return { h: hOf(p), errors: r.slice(0, 4).map((x) => (100 * x) / primaryW), iterations: it, evaluations: evals };
}

// ---- everything the instrument needs from one rib -------------------------------------------------------
// Heights (fractions of the bell's height above the lip) at which the inner surface's motion is tabulated:
// where the clapper can strike, from the lip up into the waist.
export const STRIKE_GRID = Array.from({ length: 17 }, (_, i) => 0.02 + 0.03 * i);
const VIEW_N = 25; // points along the mid-surface kept for drawing a mode

// Linear interpolation of y(x) on increasing xs.
export function lerp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  const n = xs.length;
  if (x >= xs[n - 1]) return ys[n - 1];
  let i = 0;
  while (xs[i + 1] < x) i++;
  const f = (x - xs[i]) / (xs[i + 1] - xs[i]);
  return ys[i] * (1 - f) + ys[i + 1] * f;
}

// The modes of a rib up to `rMax` × its prime, for m = 0 … mMax, as plain numbers:
//   { m, k, ratio (to the prime), lam (λ, non-dimensional), kappa (doublet splitting factor),
//     circles (nodal-circle heights / H), win (inner-surface normal motion at STRIKE_GRID, unit modal
//     mass, D = E = ρ = 1), rad: { I (∫ w² dS over the outer surface), a (its w²-weighted radius) },
//     view (normal motion along the mid-surface, crown → lip, for the drawings; low modes only), name? }
export function ribModes(stations, { perM = 6, rMax = 24, ns = MESH.ns, nt = MESH.nt, viewMax = { m: 8, k: 3 } } = {}) {
  // every mode below rMax × the prime: for each m, more modes until the last is above it; more m
  // until the lowest is above it
  const sol = solveRib(stations, { ns, nt, ms: [2], perM: 2 });
  const fp0 = Math.sqrt(sol.modes[2][1].lambda), ms = [];
  for (let m = 0; ; m++) {
    let k = perM, md;
    for (;;) { md = solveRib(stations, { ns, nt, ms: [m], perM: k }).modes[m]; if (Math.sqrt(md[md.length - 1].lambda) / fp0 > rMax) break; k += 4; }
    if (Math.sqrt(md[0].lambda) / fp0 > rMax) break;
    sol.modes[m] = md; ms.push(m);
  }
  const H = sol.g.mid(0)[1], nm = named(sol), fPrime = nm.find((x) => x.id === 'prime').f;
  const out = [];
  for (const m of ms) for (const [k, md] of sol.modes[m].entries()) {
    const ratio = Math.sqrt(md.lambda) / fPrime;
    if (ratio > rMax) continue;
    const inner = surfaceShape(sol, md, -1), outer = surfaceShape(sol, md, 1), mid = surfaceShape(sol, md, 0);
    // inner surface: by height above the lip, lip → up (only the part below the shoulder)
    const inn = inner.filter((p) => p.z < 0.85 * H).sort((a, b) => a.z - b.z);
    const win = STRIKE_GRID.map((h) => lerp(inn.map((p) => p.z / H), inn.map((p) => p.w), h));
    // radiation: ∫ w² dS over the outer surface (dS = r ds dθ; θ-integral π, or 2π for m = 0)
    let I = 0, Ia = 0;
    for (let i = 1; i < outer.length; i++) {
      const a = outer[i - 1], b = outer[i], ds = Math.hypot(b.r - a.r, b.z - a.z);
      const w2 = 0.5 * (a.w * a.w + b.w * b.w), r = 0.5 * (a.r + b.r);
      I += w2 * r * ds; Ia += w2 * r * r * ds;
    }
    const th = m === 0 ? 2 * Math.PI : Math.PI;
    const mode = {
      m, k, ratio, lam: md.lambda, kappa: (md.T.rz - md.T.th) / (md.T.rz + md.T.th),
      circles: nodalCircles(sol, md), win, rad: { I: th * I, a: Ia / I },
    };
    if (m <= viewMax.m && k <= viewMax.k) {
      const us = mid.map((p) => p.u), ws = mid.map((p) => p.w);
      mode.view = Array.from({ length: VIEW_N }, (_, i) => lerp(us, ws, i / (VIEW_N - 1)));
    }
    const n = nm.find((x) => x.m === m && x.k === k);
    if (n) mode.name = n.id;
    out.push(mode);
  }
  out.sort((a, b) => a.ratio - b.ratio);
  return { modes: out, H, volume: ribVolume(sol.g), fPrime, sol };
}
