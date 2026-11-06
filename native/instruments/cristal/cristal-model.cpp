// cristal-model.cpp — the cristal Baschet's physics (cristal-model.h).

#include "cristal-model.h"

#include <algorithm>
#include <limits>
#include <vector>

#include "cristal-tuning.h"
#include "forte/linalg.h"

namespace forte::cristal {

constexpr double PI = std::numbers::pi;

double tuningWeight(int key) { return 0.04 * std::pow(2.0, -(key - 36) / 12.0); }

// Hermite beam elements (w, θ at each node) from the collector (node 0) to the frame (the last
// node), both ends clamped. The rod and its weight sit on the node at h: their mass on w, the
// rod's moment of inertia on θ. A mode's pull on the collector is the reaction at the foot, the
// row of K − ω²M for the foot's w on the free degrees of freedom.
int stemModes(double len, double h, double w, double zeta, Mode *out, int max) {
  const double A = PI * STEM_D * STEM_D / 4, I = PI * std::pow(STEM_D, 4) / 64, EI = E_STEEL * I, rA = RHO_STEEL * A;
  const int NE = ELEMENTS;
  const int n1 = std::clamp((int)std::lround(NE * h), 1, NE - 1), n2 = NE - n1;
  const double s = len * n1 / NE; // the rod's height, on a node
  std::vector<double> x(NE + 1);
  for (int i = 0; i <= n1; i++) x[i] = (s * i) / n1;
  for (int i = 1; i <= n2; i++) x[n1 + i] = s + ((len - s) * i) / n2;
  const int nd = 2 * (NE + 1);
  Matrix K = Matrix::Zero(nd, nd), M = Matrix::Zero(nd, nd);
  for (int e = 0; e < NE; e++) {
    const double l = x[e + 1] - x[e], l2 = l * l;
    const double k[4][4] = {{12, 6 * l, -12, 6 * l}, {6 * l, 4 * l2, -6 * l, 2 * l2}, {-12, -6 * l, 12, -6 * l}, {6 * l, 2 * l2, -6 * l, 4 * l2}};
    const double m[4][4] = {{156, 22 * l, 54, -13 * l}, {22 * l, 4 * l2, 13 * l, -3 * l2}, {54, 13 * l, 156, -22 * l}, {-13 * l, -3 * l2, -22 * l, 4 * l2}};
    const double ks = EI / (l2 * l), ms = (rA * l) / 420;
    for (int a = 0; a < 4; a++) for (int b = 0; b < 4; b++) { K(2 * e + a, 2 * e + b) += ks * k[a][b]; M(2 * e + a, 2 * e + b) += ms * m[a][b]; }
  }
  M(2 * n1, 2 * n1) += ROD_M + w; M(2 * n1 + 1, 2 * n1 + 1) += ROD_J;
  const int N = nd - 4; // the inner nodes' w and θ
  const Matrix Kr = K.block(2, 2, N, N), Mr = M.block(2, 2, N, N);
  const int tip = 2 * n1 - 2;
  const auto eig = genEig(Kr, Mr);
  if (!eig) return 0;
  double top = 0;
  for (int i = 0; i < N; i++) top = std::max(top, eig->X(tip, i) * eig->X(tip, i));
  int c = 0;
  for (int i = 0; i < N && c < max; i++) {
    const double om2 = std::max(0.0, eig->lambda(i)), f = std::sqrt(om2) / (2 * PI);
    if (f > 16000) break;
    const double t = eig->X(tip, i);
    if (t * t < 1e-3 * top) continue; // a mode the finger cannot drive
    double r = 0; // the reaction at the foot per unit of the mode
    for (int j = 0; j < 2; j++) r += (K(0, 2 + j) - om2 * M(0, 2 + j)) * eig->X(j, i);
    out[c++] = {f, zeta, t, r};
  }
  return c;
}

// The mode the finger drives first: the lowest threshold, 2 ζ ω m with m = 1/tip².
static int speaking(const Mode *m, int n) {
  int b = 0;
  double best = std::numeric_limits<double>::infinity();
  for (int i = 0; i < n; i++) {
    const double t = (m[i].zeta * m[i].f) / (m[i].tip * m[i].tip);
    if (t < best) { best = t; b = i; }
  }
  return b;
}

// The stem cut to length so that its speaking mode is on the key's pitch: f ∝ len^(−3/2) near
// enough, so len ← len (f/f0)^(2/3) converges in a few steps.
Stem stem(int key, const StemParams &P) {
  Stem s;
  s.key = key; s.height = P.height; s.weight = tuningWeight(key);
  s.f0 = 440 * std::pow(2.0, (key - 69) / 12.0) * P.ratio;
  // cut sharp by as much as the rod sounds flat at the reference touch (cristal-tuning.h, CUT)
  const double target = s.f0 * std::pow(2.0, (key >= KEY_MIN && key <= KEY_MAX ? CUT[key - KEY_MIN] : 0) / 1200.0);
  const double I = PI * std::pow(STEM_D, 4) / 64, EI = E_STEEL * I;
  double len = std::cbrt((192 * EI) / (std::pow(2 * PI * target, 2) * (ROD_M + s.weight)));
  Mode m[MODES];
  int n = 0, main = 0;
  double bestErr = std::numeric_limits<double>::infinity(), bestLen = len;
  for (int it = 0; it < 60; it++) {
    n = stemModes(len, P.height, s.weight, P.loss, m, MODES);
    if (!n) break;
    main = speaking(m, n);
    const double r = m[main].f / target, err = std::fabs(r - 1);
    if (err < bestErr) { bestErr = err; bestLen = len; }
    if (err < 1e-11) break;
    len *= std::pow(r, it < 30 ? 2.0 / 3 : 1.0 / 3); // (halved steps if it has not settled)
  }
  s.len = bestLen;
  n = stemModes(s.len, P.height, s.weight, P.loss, m, MODES);
  s.count = n;
  s.main = speaking(m, n);
  for (int i = 0; i < n; i++) s.modes[i] = m[i];
  return s;
}

Friction friction(double wet) {
  const double w = std::clamp(wet, 0.0, 1.0), dry = std::clamp((0.6 - w) / 0.6, 0.0, 1.0);
  const double dmu = 0.05 + 1.65 * (w / 0.85) * (w / 0.85); // 1.7 at the default 85 %: μs = 2
  return {0.3 + dmu, 0.3, 0.02, 0.02 * (1 + 5 * dry)};
}

double threshold(const Mode &m, double uf, const Friction &f) {
  const double dmu = f.mus - f.mud;
  if (!(dmu > 0)) return std::numeric_limits<double>::infinity();
  const double mass = 1 / (m.tip * m.tip), x = 1 + std::fabs(uf) / f.v0;
  return (2 * m.zeta * 2 * PI * m.f * mass * f.v0 * x * x) / dmu;
}

double speakingThreshold(const Stem &s, double uf, const Friction &f) {
  double t = std::numeric_limits<double>::infinity();
  for (int i = 0; i < s.count; i++) t = std::min(t, threshold(s.modes[i], uf, f));
  return t;
}

double maxForce(const Mode &m, double uf, const Friction &f) {
  const double mass = 1 / (m.tip * m.tip);
  return (PI * std::fabs(uf) * mass * 2 * PI * m.f) / (2 * (f.mus - f.mud));
}

double regulation(int key) {
  static const std::array<double, NK> table = [] {
    std::array<double, NK> t{};
    const Friction f = friction(0.85);
    for (int k = KEY_MIN; k <= KEY_MAX; k++) t[k - KEY_MIN] = speakingThreshold(stem(k, StemParams{}), U_REF, f);
    return t;
  }();
  if (key >= KEY_MIN && key <= KEY_MAX) return table[key - KEY_MIN];
  return speakingThreshold(stem(key, StemParams{}), U_REF, friction(0.85));
}

double whiskerLength(int i) { return 0.6 * std::pow(1.5 / 0.6, i / double(WHISKERS - 1)); }
double whiskerSway(int i) {
  const double L = whiskerLength(i), bl = 1.8751040687;
  return (bl * bl) / (2 * PI * L * L) * (WHISKER_D / 4) * cSteel();
}

} // namespace forte::cristal
