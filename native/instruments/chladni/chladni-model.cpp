// chladni-model.cpp — the Chladni Plate's physics (chladni-model.h).

#include "chladni-model.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/dsp.h"
#include "forte/linalg.h"
#include "chladni-params.h"

namespace forte::chladni {

constexpr double PI = std::numbers::pi;

const std::array<Material, 4> MATERIALS = {{
  {"brass", 100e9, 8500, 0.34},
  {"glass", 70e9, 2500, 0.22},
  {"steel", 200e9, 7850, 0.29},
  {"aluminium", 69e9, 2700, 0.33},
}};

// chladni/src/chladni-params.js FIGURES, in its order: (block, place in it) on the clamped brass plate
const std::array<Figure, NFIG> FIGURES = {{
  {1, 0}, // one line through the clamp: the plate rocks about it
  {3, 0}, // the cross
  {0, 1}, // the diagonals
  {1, 1}, // a line and two arcs
  {0, 2}, // four arcs round the corners
  {1, 2}, // three lines
  {3, 1}, // the star
  {3, 2}, // a cross between corner arcs
  {0, 3}, // a ring
  {3, 4}, // a cross with an X in each quarter
}};

namespace {

constexpr int NG = 40; // Gauss–Legendre points along a side: exact for the products of P0 … P23 and their derivatives

struct Legendre1D {
  std::array<double, NG> x{}, w{};
  // normalised Legendre polynomials (∫ Pn² = 1 on −1 … 1) and their first and second derivatives at the points
  std::array<std::array<double, NG>, ORDER> v{}, d1{}, d2{};
  // their integrals: ∫ Pi Pk, ∫ Pi′ Pk′, ∫ Pi″ Pk″, ∫ Pi Pk″
  std::array<std::array<double, ORDER>, ORDER> a00{}, a11{}, a22{}, a02{};
};

// Pn, Pn′ and Pn″ at x by the recurrences, normalised.
void legendre(double x, double *v, double *d1, double *d2, int n) {
  double p0 = 1, p1 = x, q0 = 0, q1 = 1, r0 = 0, r1 = 0;
  for (int k = 0; k < n; k++) {
    const double s = std::sqrt(k + 0.5);
    double p, q, r;
    if (k == 0) { p = 1; q = 0; r = 0; }
    else if (k == 1) { p = x; q = 1; r = 0; }
    else {
      // (k) Pk = (2k−1) x Pk−1 − (k−1) Pk−2; Pk′ = Pk−2′ + (2k−1) Pk−1; Pk″ = Pk−2″ + (2k−1) Pk−1′
      p = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k;
      q = q0 + (2 * k - 1) * p1;
      r = r0 + (2 * k - 1) * q1;
      p0 = p1; p1 = p; q0 = q1; q1 = q; r0 = r1; r1 = r;
    }
    v[k] = s * p; if (d1) d1[k] = s * q; if (d2) d2[k] = s * r;
  }
}

const Legendre1D &basis() {
  static const Legendre1D B = [] {
    Legendre1D b;
    for (int i = 0; i < NG; i++) { // Gauss–Legendre nodes by Newton on P_NG
      double z = std::cos(PI * (i + 0.75) / (NG + 0.5)), dp = 1;
      for (int it = 0; it < 100; it++) {
        double p0 = 1, p1 = z;
        for (int k = 2; k <= NG; k++) { const double p = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p; }
        dp = NG * (z * p1 - p0) / (z * z - 1);
        const double dz = p1 / dp;
        z -= dz;
        if (std::fabs(dz) < 1e-15) break;
      }
      b.x[i] = z; b.w[i] = 2 / ((1 - z * z) * dp * dp);
    }
    for (int g = 0; g < NG; g++) {
      double v[ORDER], d1[ORDER], d2[ORDER];
      legendre(b.x[g], v, d1, d2, ORDER);
      for (int k = 0; k < ORDER; k++) { b.v[k][g] = v[k]; b.d1[k][g] = d1[k]; b.d2[k][g] = d2[k]; }
    }
    for (int i = 0; i < ORDER; i++)
      for (int k = 0; k < ORDER; k++) {
        double s00 = 0, s11 = 0, s22 = 0, s02 = 0;
        for (int g = 0; g < NG; g++) {
          s00 += b.w[g] * b.v[i][g] * b.v[k][g];
          s11 += b.w[g] * b.d1[i][g] * b.d1[k][g];
          s22 += b.w[g] * b.d2[i][g] * b.d2[k][g];
          s02 += b.w[g] * b.v[i][g] * b.d2[k][g];
        }
        b.a00[i][k] = s00; b.a11[i][k] = s11; b.a22[i][k] = s22; b.a02[i][k] = s02;
      }
    return b;
  }();
  return B;
}

// The polynomials of block (px, py): P(px + 2i)(x) · P(py + 2j)(y), b = i·HALF + j.
inline int degX(int block, int b) { return (block & 1) + 2 * (b / HALF); }
inline int degY(int block, int b) { return ((block >> 1) & 1) + 2 * (b % HALF); }

} // namespace

// Rayleigh–Ritz: the strain energy of a Kirchhoff plate,
//   U = D/2 ∫∫ [w_xx² + w_yy² + 2ν w_xx w_yy + 2(1 − ν) w_xy²],
// and its kinetic energy ρh ω²/2 ∫∫ w², on products of Legendre polynomials (free edges are the
// natural conditions of the energy, so the basis needs none). The clamp holds a disc at the centre
// flat between stiff pads: a foundation of stiffness κ (in D/(a/2)⁴) over the disc. Each symmetry
// block is solved alone.
void solvePlate(Plate &pl, double nu, bool clamped, double kappa, bool spots) {
  const Legendre1D &B = basis();
  pl.count = 0; // (no Plate{} here: it would pass through the stack, and a plate is ~130 kB)
  pl.nu = nu; pl.clamped = clamped;
  // the clamp's disc, by Gauss points in radius (weight r) and even angles
  constexpr int NR = 8, NT = 32;
  std::vector<std::array<double, 3>> disc; // x, y, weight
  if (clamped) {
    const double R = 2 * CLAMP;
    // Gauss–Legendre on [0, R] with NR points (weight r), even angles
    double xr[NR], wr[NR];
    for (int i = 0; i < NR; i++) {
      double z = std::cos(PI * (i + 0.75) / (NR + 0.5)), dp = 1;
      for (int it = 0; it < 100; it++) {
        double p0 = 1, p1 = z;
        for (int k = 2; k <= NR; k++) { const double p = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p; }
        dp = NR * (z * p1 - p0) / (z * z - 1);
        const double dz = p1 / dp;
        z -= dz;
        if (std::fabs(dz) < 1e-15) break;
      }
      xr[i] = 0.5 * R * (z + 1); wr[i] = 0.5 * R * 2 / ((1 - z * z) * dp * dp);
    }
    for (int i = 0; i < NR; i++)
      for (int t = 0; t < NT; t++) {
        const double th = (2 * PI * (t + 0.5)) / NT;
        disc.push_back({xr[i] * std::cos(th), xr[i] * std::sin(th), wr[i] * xr[i] * (2 * PI / NT)});
      }
  }
  std::vector<PlateMode> all;
  for (int block = 0; block < 4; block++) {
    Matrix K(BLOCK, BLOCK), M(BLOCK, BLOCK);
    for (int a = 0; a < BLOCK; a++)
      for (int b = 0; b < BLOCK; b++) {
        const int i = degX(block, a), j = degY(block, a), k = degX(block, b), l = degY(block, b);
        K(a, b) = B.a22[i][k] * B.a00[j][l] + B.a00[i][k] * B.a22[j][l] + nu * (B.a02[k][i] * B.a02[j][l] + B.a02[i][k] * B.a02[l][j]) +
                  2 * (1 - nu) * B.a11[i][k] * B.a11[j][l];
        M(a, b) = B.a00[i][k] * B.a00[j][l];
      }
    if (clamped) { // K += κ Φᵀ W Φ over the disc's points
      double vx[ORDER], vy[ORDER];
      Matrix Phi((int)disc.size(), BLOCK);
      for (int q = 0; q < (int)disc.size(); q++) {
        legendre(disc[q][0], vx, nullptr, nullptr, ORDER);
        legendre(disc[q][1], vy, nullptr, nullptr, ORDER);
        const double w = std::sqrt(kappa * disc[q][2]);
        for (int a = 0; a < BLOCK; a++) Phi(q, a) = w * vx[degX(block, a)] * vy[degY(block, a)];
      }
      K.noalias() += Phi.transpose() * Phi;
    }
    const auto e = genEig(K, M);
    if (!e) continue;
    int index = 0;
    for (int c = 0; c < BLOCK; c++) {
      const double l2 = e->lambda[c];
      if (l2 < 1) continue; // a free plate's rigid motions
      PlateMode m;
      m.lambda = std::sqrt(l2);
      m.block = block; m.index = index++;
      // Xᵀ M X = I: ∫∫ φ² = 1 over the area 4; scale to a mean square of 1, and fix the sign so the
      // corner (1, 1) moves up (or, where it stays, the edge's middle)
      for (int a = 0; a < BLOCK; a++) m.c[a] = 2 * e->X(a, c);
      all.push_back(m);
    }
  }
  std::sort(all.begin(), all.end(), [](const PlateMode &a, const PlateMode &b) { return a.lambda < b.lambda; });
  pl.count = std::min((int)all.size(), MAXMODES);
  for (int n = 0; n < pl.count; n++) pl.m[n] = all[n];
  for (int n = 0; n < pl.count; n++) {
    double s = shape(pl, n, 1, 1);
    if (std::fabs(s) < 1e-6) s = shape(pl, n, 1, 0.37);
    if (s < 0) for (double &c : pl.m[n].c) c = -c;
  }
  if (!spots) return;
  for (int n = 0; n < pl.count; n++)
    for (int i = 0; i < PATH; i++) {
      double x, y;
      pathPoint((2.0 * i) / (PATH - 1), x, y);
      pl.edge[n][i] = (float)shape(pl, n, x, y);
    }
  for (int f = 0; f < NFIG; f++) pl.spots[f] = figureSpots(pl, f);
}

void pathPoint(double s, double &x, double &y) {
  s = std::clamp(s, 0.0, 2.0);
  if (s <= 1) { x = 1; y = s; } else { x = 2 - s; y = 1; }
}

double pathShift(double s, double d) {
  double t = std::fmod(s + d, 4.0);
  if (t < 0) t += 4;
  return t > 2 ? 4 - t : t;
}

double edgeShape(const Plate &pl, int n, double s) {
  const double u = std::clamp(s, 0.0, 2.0) * ((PATH - 1) / 2.0);
  const int i = std::min((int)u, PATH - 2);
  const double t = u - i;
  return pl.edge[n][i] + t * (pl.edge[n][i + 1] - pl.edge[n][i]);
}

int figureMode(const Plate &pl, int figure) {
  const Figure F = FIGURES[std::clamp(figure, 0, NFIG - 1)];
  if (pl.clamped && std::fabs(pl.nu - MATERIALS[0].nu) < 1e-12) {
    for (int n = 0; n < pl.count; n++) if (pl.m[n].block == F.block && pl.m[n].index == F.index) return n;
    return 0;
  }
  // the clamped brass plate (made once, by whichever thread asks first)
  static const Plate &ref = [] () -> const Plate & { static Plate p; solvePlate(p, MATERIALS[0].nu, true, KAPPA, false); return p; }();
  int r = 0;
  for (int n = 0; n < ref.count; n++) if (ref.m[n].block == F.block && ref.m[n].index == F.index) r = n;
  // the most alike: the largest overlap ∫∫ φ φref (the blocks' polynomials are orthonormal)
  int best = 0;
  double most = -1;
  for (int n = 0; n < pl.count; n++) {
    if (pl.m[n].block != F.block) continue;
    double o = 0;
    for (int b = 0; b < BLOCK; b++) o += pl.m[n].c[b] * ref.m[r].c[b];
    if (std::fabs(o) > most) { most = std::fabs(o); best = n; }
  }
  return best;
}

// The figure's mode t speaks from the bow where its drive beats every other mode's: a mode n's gain
// from the bow's friction goes with its swing there, φn(b)², and its loss with the metal's
// (η/2 · ωn) and the fingers' (FINGER Σ φn(f)² / 2m). Over the bow's path, put a finger on t's
// nodal lines where it leaves t the biggest lead over its strongest rival, then a second finger
// the same way, and keep the bow's place where that lead is biggest. A rival near a harmonic of t
// counts more: the stick and slip drive it too.
Spots figureSpots(const Plate &pl, int figure) {
  Spots sp;
  const int t = figureMode(pl, figure);
  sp.mode = t;
  const Material &M = MATERIALS[0];
  const double h = 1.5e-3, c = h * std::sqrt(M.E / (12 * M.rho * (1 - M.nu * M.nu)));
  // the finger's loss over ωt, per φ² under it: FINGER / (2 m ωt), m ωt = ρ h a² ωt = 4 ρ h Λt c
  const double zf = FINGER / (2 * 4 * M.rho * h * pl.m[t].lambda * c), zm = ETA_SPOTS / 2;
  // the rivals: every mode up to twelve times t's pitch
  std::vector<int> rivals;
  for (int n = 0; n < pl.count; n++) if (n != t && pl.m[n].lambda < 12 * pl.m[t].lambda) rivals.push_back(n);
  const int R = (int)rivals.size();
  // the fingers' candidates: t's nodal lines, off the clamp and the edges
  constexpr int G = 41;
  struct Cand { double x, y; std::vector<double> phi2; };
  std::vector<Cand> cands;
  double peak = 0;
  for (int i = 0; i < G; i++)
    for (int j = 0; j < G; j++) peak = std::max(peak, std::fabs(shape(pl, t, -1 + (2.0 * i) / (G - 1), -1 + (2.0 * j) / (G - 1))));
  for (int i = 1; i < G - 1; i++)
    for (int j = 1; j < G - 1; j++) {
      const double x = -1 + (2.0 * i) / (G - 1), y = -1 + (2.0 * j) / (G - 1);
      if (std::hypot(x, y) < 0.45 || std::max(std::fabs(x), std::fabs(y)) > 0.92) continue;
      if (std::fabs(shape(pl, t, x, y)) > 0.04 * peak) continue;
      Cand cd{x, y, {}};
      for (int n : rivals) { const double f = shape(pl, n, x, y); cd.phi2.push_back(f * f); }
      cands.push_back(std::move(cd));
    }
  if (cands.empty()) cands.push_back({0.6, 0.6, std::vector<double>(R, 0.0)});
  const double lt = pl.m[t].lambda;
  std::vector<double> b2(R), loss(R);
  double best = -1;
  for (int i = 0; i <= 100; i++) {
    const double s = i / 50.0;
    const double bt = edgeShape(pl, t, s), gt = (bt * bt) / zm; // t's own loss: the plate's (its shape under the fingers is ~0)
    if (bt * bt < 0.5) continue; // the bow needs the figure's mode to swing well there
    for (int r = 0; r < R; r++) {
      const double bn = edgeShape(pl, rivals[r], s), q = pl.m[rivals[r]].lambda / lt, k = std::round(q), d = (q - k) / q;
      // a rival near a harmonic of the figure is driven by the stick and slip's harmonics too, and
      // is the likeliest to take over: count it four times as strong
      b2[r] = bn * bn * (k >= 2 ? 1 + 3 * std::exp(-(d * d) / (0.02 * 0.02)) : 1);
      loss[r] = zm * q;
    }
    // the strongest rival's gain over loss with the fingers' extra loss e (per φ² summed)
    auto worst = [&](const std::vector<double> *a, const std::vector<double> *b) {
      double w = 0;
      for (int r = 0; r < R; r++) w = std::max(w, b2[r] / (loss[r] + zf * ((a ? (*a)[r] : 0) + (b ? (*b)[r] : 0))));
      return w;
    };
    int c1 = 0, c2 = 0;
    double w1 = 1e300, w2 = 1e300;
    for (int c = 0; c < (int)cands.size(); c++) { const double w = worst(&cands[c].phi2, nullptr); if (w < w1) { w1 = w; c1 = c; } }
    for (int c = 0; c < (int)cands.size(); c++) {
      if (std::hypot(cands[c].x - cands[c1].x, cands[c].y - cands[c1].y) < 0.3) continue; // two fingers, a hand's width apart
      const double w = worst(&cands[c1].phi2, &cands[c].phi2);
      if (w < w2) { w2 = w; c2 = c; }
    }
    if (w2 > 1e299) { c2 = c1; w2 = w1; }
    const double score = gt / (w2 + 1e-9);
    if (score > best) { best = score; sp.bow = s; sp.fx = {cands[c1].x, cands[c2].x}; sp.fy = {cands[c1].y, cands[c2].y}; }
  }
  for (int n = 0; n < pl.count; n++) {
    const double a = shape(pl, n, sp.fx[0], sp.fy[0]), b = shape(pl, n, sp.fx[1], sp.fy[1]);
    sp.finger[n] = a * a + b * b;
  }
  return sp;
}

int plateId(const double *P) { return 2 * std::clamp((int)P[p::material], 0, (int)MATERIALS.size() - 1) + (P[p::hold] < 0.5 ? 1 : 0); }

KeyPlate keyPlate(int key, const double *P, const Plate &pl) {
  KeyPlate k;
  const Material &M = MATERIALS[plateId(P) / 2];
  k.plate = &pl;
  const int t = pl.spots[std::clamp((int)P[p::figure], 0, NFIG - 1)].mode;
  k.target = t;
  // the note: equal temperament × the keyboard's tuning (forte/tuning.h; exactly 1 at its defaults)
  k.f0 = keyFreq(key) * tuningOf(P).ratio(key);
  const double h = P[p::thickness] * 1e-3, c = h * std::sqrt(M.E / (12 * M.rho * (1 - M.nu * M.nu)));
  // ωt = Λt c / (a/2)²: the side that puts the figure on the note
  k.side = 2 * std::sqrt((pl.m[t].lambda * c) / (2 * PI * k.f0));
  k.mass = M.rho * h * k.side * k.side;
  // the loss, a fixed fraction of each cycle: the metal's, the clamp's leather and the air's, made
  // so that every plate's figure rings for the Ring time, as far as the leather can take it (a Q of
  // QMIN: below that, the bigger, lower plates ring longer)
  k.eta = std::min(std::log(1000.0) / (PI * k.f0 * P[p::ring]), 1 / QMIN);
  for (int n = 0; n < pl.count; n++) {
    const double f = k.f0 * pl.m[n].lambda / pl.m[t].lambda;
    if (f > 18000) break;
    k.f[n] = f; k.sigma[n] = PI * f * k.eta;
    k.count = n + 1;
  }
  return k;
}

Friction friction(const double *P) { return {0.35 + 0.65 * P[p::rosin], 0.3, 0.1}; }

double threshold(const KeyPlate &k, const double *P) {
  const Spots &sp = k.plate->spots[std::clamp((int)P[p::figure], 0, NFIG - 1)];
  const int t = k.target;
  const double b = edgeShape(*k.plate, t, sp.bow);
  const double sigma = k.sigma[t] + (P[p::finger] > 0.5 ? (FINGER * sp.finger[t]) / (2 * k.mass) : 0);
  return (2 * k.mass * sigma) / (friction(P).slope(P[p::speed]) * b * b);
}

double shape(const Plate &pl, int n, double x, double y) {
  double vx[ORDER], vy[ORDER];
  legendre(x, vx, nullptr, nullptr, ORDER);
  legendre(y, vy, nullptr, nullptr, ORDER);
  const PlateMode &m = pl.m[n];
  double s = 0;
  for (int b = 0; b < BLOCK; b++) s += m.c[b] * vx[degX(m.block, b)] * vy[degY(m.block, b)];
  return s;
}

const Plate &plate(int material, bool clamped) {
  static std::array<std::array<Plate, 2>, MATERIALS.size()> cache;
  static std::array<std::array<bool, 2>, MATERIALS.size()> done{};
  material = std::clamp(material, 0, (int)MATERIALS.size() - 1);
  if (!done[material][clamped]) { done[material][clamped] = true; solvePlate(cache[material][clamped], MATERIALS[material].nu, clamped); }
  return cache[material][clamped];
}

} // namespace forte::chladni
