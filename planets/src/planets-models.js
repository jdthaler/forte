// planets-models.js — the three planets' insides: density, sound speeds and attenuation against
// radius, as the normal-mode solver (tools/planets-modes.mjs) and the page's cross-section read
// them. No DOM. Units: km, g/cm³, km/s.
//
// Each layer is a shell r0 < r < r1 with its properties as polynomials in x = r / R (PREM's form):
// rho, vp, vs (vs = 0: fluid), and its quality factors qmu (shear) and qkappa (bulk).
//
// Earth: PREM (Dziewonski & Anderson 1981), isotropic, its ocean replaced by the upper crust
// (MINEOS's prem_noocean). Its reference period is 1 s (the solver applies the physical dispersion
// of its Q to each mode's own frequency).
// Mars and the Moon: no normal mode of either has been measured, so each is a layered model built
// from what their seismometers and spacecraft did measure (core radii, velocities, crust), with
// the densities of two of its layers fitted to the measured mass and moment of inertia (fitDensity,
// below). README.md lists the sources; test/planets-tests.mjs checks the masses and moments.

export const G = 6.6743e-11; // m³ kg⁻¹ s⁻²

const poly = (c) => (x) => c.reduce((s, a, i) => s + a * x ** i, 0);
const L = (r0, r1, name, rho, vp, vs, qmu, qkappa = 57823) =>
  ({ r0, r1, name, rho: poly(rho), vp: poly(vp), vs: poly(vs), qmu, qkappa, coef: { rho, vp, vs } });

const PREM = {
  id: 'earth', name: 'Earth', R: 6371, day: 86164.1, // sidereal day, s
  fref: 1, // Hz: the reference frequency of the velocities (PREM's 1 s)
  model: 'PREM',
  layers: [
    L(0, 1221.5, 'Inner core', [13.0885, 0, -8.8381], [11.2622, 0, -6.3640], [3.6678, 0, -4.4475], 84.6, 1327.7),
    L(1221.5, 3480, 'Outer core', [12.5815, -1.2638, -3.6426, -5.5281], [11.0487, -4.0362, 4.8023, -13.5732], [0], Infinity, 57823),
    L(3480, 3630, 'D″', [7.9565, -6.4761, 5.5283, -3.0807], [15.3891, -5.3181, 5.5242, -2.5514], [6.9254, 1.4672, -2.0834, 0.9783], 312),
    L(3630, 5600, 'Lower mantle', [7.9565, -6.4761, 5.5283, -3.0807], [24.9520, -40.4673, 51.4832, -26.6419], [11.1671, -13.7818, 17.4575, -9.2777], 312),
    L(5600, 5701, 'Lower mantle', [7.9565, -6.4761, 5.5283, -3.0807], [29.2766, -23.6027, 5.5242, -2.5514], [22.3459, -17.2473, -2.0834, 0.9783], 312),
    L(5701, 5771, 'Transition zone', [5.3197, -1.4836], [19.0957, -9.8672], [9.9839, -4.9324], 143),
    L(5771, 5971, 'Transition zone', [11.2494, -8.0298], [39.7027, -32.6166], [22.3512, -18.5856], 143),
    L(5971, 6151, 'Upper mantle', [7.1089, -3.8045], [20.3926, -12.2569], [8.9496, -4.4597], 143),
    L(6151, 6291, 'Low-velocity zone', [2.6910, 0.6924], [4.1875, 3.9382], [2.1519, 2.3481], 80),
    L(6291, 6346.6, 'Lid', [2.6910, 0.6924], [4.1875, 3.9382], [2.1519, 2.3481], 600),
    L(6346.6, 6356, 'Lower crust', [2.900], [6.800], [3.900], 600),
    L(6356, 6371, 'Upper crust', [2.600], [5.800], [3.200], 600),
  ],
};

// Mars: the liquid core of radius 1830 km (Stähler et al. 2021) with the P-wave speed measured
// through it (4.9 km/s at its top: Irving et al. 2023); a 40 km crust (Knapmeyer-Endrun et al.
// 2021, Wieczorek et al. 2022); a mantle as fast as Khan et al. 2021 found, with the jump near
// 1050 km depth (Stähler et al. 2021). Mass and mean moment of inertia: Konopliv et al. 2020.
// The mantle's Q is a guess within the range InSight's quakes allow (README).
const MARS = {
  id: 'mars', name: 'Mars', R: 3389.5, day: 88642.7,
  mass: 6.4171e23, moi: 0.3638, // kg; I / MR²
  fref: 1,
  model: 'InSight-era model',
  layers: [
    L(0, 1830, 'Liquid core', [6.0], [4.9], [0], Infinity),
    L(1830, 2339.5, 'Lower mantle', [4.0], [9.0], [4.95], 300),
    L(2339.5, 2889.5, 'Upper mantle', [3.6], [8.0], [4.4], 200),
    L(2889.5, 3349.5, 'Lithosphere', [3.4], [7.9], [4.5], 500),
    L(3349.5, 3389.5, 'Crust', [2.9], [6.0], [3.4], 500),
  ],
  // fitted: the core's density, and the mantle's (its lower part 0.25 g/cm³ denser than the rest)
  fit: { a: [0], b: [1, 2, 3], bStep: { 1: 0.25 } },
};
// The liquid core's density rises toward the centre as its own weight compresses it
// (Adams–Williamson, dρ/dr = −ρg/vp², with g ≈ 4πGρr/3): ρ = ρc (1 − b x²), so that it is
// neither stably nor unstably layered.
const awShape = (P, li) => {
  const l = P.layers[li], vp = l.vp(0) * 1000, R = P.R * 1000;
  return (rho) => (2 / 3) * Math.PI * G * rho * 1000 * R * R / (vp * vp);
};
MARS.fit.shape = { 0: awShape(MARS, 0) };

// The Moon: a solid inner core of radius 240 km and density 8.0 g/cm³, a fluid outer core to
// 330 km (5.1 g/cm³, P waves at 4.1 km/s) and a partly molten layer to 480 km, P 10 % and S 30 %
// slower than the mantle above it (Weber et al. 2011); a mantle whose P waves run at 8.5 km/s
// between 738 and 1257 km depth (Weber et al. 2011) and near 7.7 km/s above (Nakamura 1983); a
// 40 km crust of density 2.55 g/cm³ (GRAIL: Wieczorek et al. 2013). The dry Moon's Q is
// thousands in the upper mantle (Nakamura & Koyama 1982). Mass and moment: Williams et al. 2014.
const MOON = {
  id: 'moon', name: 'Moon', R: 1737.1, day: 2360591.5,
  mass: 7.3458e22, moi: 0.3929,
  fref: 1,
  model: 'after Weber et al. 2011',
  layers: [
    L(0, 240, 'Inner core', [8.0], [5.4], [3.0], 300),
    L(240, 330, 'Fluid outer core', [5.1], [4.1], [0], Infinity),
    L(330, 480, 'Partial melt', [3.4], [7.65], [3.15], 100),
    L(480, 999, 'Lower mantle', [3.4], [8.5], [4.5], 1500),
    L(999, 1697.1, 'Upper mantle', [3.35], [7.7], [4.45], 4000),
    L(1697.1, 1737.1, 'Crust', [2.55], [6.0], [3.4], 3000),
  ],
  // fitted: the upper mantle's density, and the lower mantle's with the melt layer's
  fit: { a: [4], b: [2, 3] },
};

// Mass (kg) and I / MR² of a model, by Gauss–Legendre on each layer.
export function massMoment(P) {
  const gx = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498, 0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363];
  const gw = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620, 0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];
  let m = 0, I = 0;
  for (const l of P.layers) {
    const h = (l.r1 - l.r0) / 2, c = (l.r1 + l.r0) / 2;
    for (let i = 0; i < 8; i++) {
      const r = c + h * gx[i], rho = l.rho(r / P.R) * 1000, w = gw[i] * h * 1000, rm = r * 1000;
      m += 4 * Math.PI * rho * rm * rm * w;
      I += (8 * Math.PI / 3) * rho * rm ** 4 * w;
    }
  }
  return { mass: m, moi: I / (m * (P.R * 1000) ** 2) };
}

// Fit two densities (constant within their layers) to the planet's measured mass and moment.
function fitDensity(P) {
  const { a, b, bStep = {} } = P.fit;
  let guess = 6; // the core's density, for its compression (shape)
  const set = (ra, rb) => {
    for (const i of a) {
      const b = P.fit.shape?.[i]?.(guess) ?? 0;
      P.layers[i].rho = (x) => ra * (1 - b * x * x); P.layers[i].coef.rho = [ra, 0, -ra * b];
    }
    for (const i of b) { const v = rb + (bStep[i] ?? 0); P.layers[i].rho = () => v; P.layers[i].coef.rho = [v]; }
  };
  // mass and moment are linear in the two densities: three evaluations give the system
  const ev = (ra, rb) => { set(ra, rb); const { mass, moi } = massMoment(P); return [mass, moi * mass * (P.R * 1000) ** 2]; };
  let ra = 0, rb = 0;
  for (let it = 0; it < 6; it++) {
    const [m0, i0] = ev(0, 0), [ma, ia] = ev(1, 0), [mb, ib] = ev(0, 1);
    const A = [[ma - m0, mb - m0], [ia - i0, ib - i0]];
    const rhs = [P.mass - m0, P.moi * P.mass * (P.R * 1000) ** 2 - i0];
    const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
    ra = (rhs[0] * A[1][1] - A[0][1] * rhs[1]) / det; rb = (A[0][0] * rhs[1] - A[1][0] * rhs[0]) / det;
    guess = ra;
  }
  set(ra, rb);
  return [ra, rb];
}
fitDensity(MARS);
fitDensity(MOON);

export const PLANETS = [PREM, MARS, MOON];

// Gravity g(r) (m/s²) from the density, integrated outward.
export function gravityAt(P, r) {
  let m = 0;
  const gx = [-0.906179845938664, -0.538469310105683, 0, 0.538469310105683, 0.906179845938664];
  const gw = [0.236926885056189, 0.478628670499366, 0.568888888888889, 0.478628670499366, 0.236926885056189];
  for (const l of P.layers) {
    if (l.r0 >= r) break;
    const r1 = Math.min(l.r1, r);
    // split thick shells so the quadrature stays exact enough
    const parts = Math.max(1, Math.ceil((r1 - l.r0) / 100));
    for (let p = 0; p < parts; p++) {
      const a0 = l.r0 + (r1 - l.r0) * p / parts, a1 = l.r0 + (r1 - l.r0) * (p + 1) / parts;
      const h = (a1 - a0) / 2, c = (a1 + a0) / 2;
      for (let i = 0; i < 5; i++) { const rr = c + h * gx[i]; m += 4 * Math.PI * l.rho(rr / P.R) * 1000 * (rr * 1000) ** 2 * gw[i] * h * 1000; }
    }
  }
  return r > 0 ? G * m / (r * 1000) ** 2 : 0;
}
