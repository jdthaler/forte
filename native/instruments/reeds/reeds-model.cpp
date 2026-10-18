// reeds-model.cpp — the reed piano's physics (reeds-model.h).

#include "reeds-model.h"

#include <algorithm>
#include <cstring>

#include "forte/linalg.h"

namespace forte::reeds {

namespace {
double clamp(double x, double a, double b) { return std::min(b, std::max(a, x)); }
double tKey(int m) { return clamp((double)(m - KEY_LO) / (KEY_HI - KEY_LO), 0, 1); }
double geo(double a, double b, double t) { return a * std::pow(b / a, t); }

std::array<double, 4> hermite(double xi, double l) {
  return {1 - 3 * xi * xi + 2 * std::pow(xi, 3), l * (xi - 2 * xi * xi + std::pow(xi, 3)), 3 * xi * xi - 2 * std::pow(xi, 3),
          l * (-xi * xi + std::pow(xi, 3))};
}

// log C′ of every table row
struct LogC { double v[SLOT_NGAPS][SLOT_Y.n]; };
const LogC &logC() {
  static const LogC t = [] {
    LogC r;
    for (int g = 0; g < SLOT_NGAPS; g++) for (int k = 0; k < SLOT_Y.n; k++) r.v[g][k] = std::log(SLOT_C[g][k]);
    return r;
  }();
  return t;
}
} // namespace

// ---- the reed ----------------------------------------------------------------------------------

double ReedFEM::shape(int n, double x) const {
  const double l = L / nel, xx = clamp(x, 0, L);
  const int e = std::min(nel - 1, (int)std::floor(xx / l));
  const auto Nv = hermite(xx / l - e, l);
  auto v = [&](int d) { return d < 2 ? 0.0 : X[(size_t)(d - 2) * nModes + n]; };
  return Nv[0] * v(2 * e) + Nv[1] * v(2 * e + 1) + Nv[2] * v(2 * e + 2) + Nv[3] * v(2 * e + 3);
}

ReedFEM reedFEM(double L, double h, double b, double M, double J, int nel, int nModes) {
  const double E = STEEL.E, rho = STEEL.rho;
  const double A = b * h, I = (b * std::pow(h, 3)) / 12, EI = E * I, mu = rho * A;
  const double l = L / nel;
  const int NF = 2 * (nel + 1);
  std::vector<double> Kf((size_t)NF * NF, 0.0), Mf((size_t)NF * NF, 0.0);
  const double ke[4][4] = {{12, 6 * l, -12, 6 * l}, {6 * l, 4 * l * l, -6 * l, 2 * l * l}, {-12, -6 * l, 12, -6 * l}, {6 * l, 2 * l * l, -6 * l, 4 * l * l}};
  const double me[4][4] = {{156, 22 * l, 54, -13 * l}, {22 * l, 4 * l * l, 13 * l, -3 * l * l}, {54, 13 * l, 156, -22 * l}, {-13 * l, -3 * l * l, -22 * l, 4 * l * l}};
  const double kc = EI / std::pow(l, 3), mc = (mu * l) / 420;
  for (int e = 0; e < nel; e++) {
    for (int a = 0; a < 4; a++) for (int c = 0; c < 4; c++) {
      Kf[(size_t)(2 * e + a) * NF + 2 * e + c] += kc * ke[a][c];
      Mf[(size_t)(2 * e + a) * NF + 2 * e + c] += mc * me[a][c];
    }
  }
  Mf[(size_t)(NF - 2) * NF + NF - 2] += M; // tip translation
  Mf[(size_t)(NF - 1) * NF + NF - 1] += J; // tip rotation
  // inertial loads of a rigid translation and a rigid rotation about the clamp
  std::vector<double> g(NF, 0.0), gs(NF, 0.0);
  for (int i = 0; i < NF; i++) for (int j = 0; j < NF; j += 2) {
    g[i] += Mf[(size_t)i * NF + j];
    gs[i] += Mf[(size_t)i * NF + j] * (j / 2) * l + Mf[(size_t)i * NF + j + 1];
  }
  const int N = NF - 2; // clamp node 0
  Matrix K(N, N), Mm(N, N);
  for (int i = 0; i < N; i++) for (int j = 0; j < N; j++) { K(i, j) = Kf[(size_t)(i + 2) * NF + j + 2]; Mm(i, j) = Mf[(size_t)(i + 2) * NF + j + 2]; }
  const int nv = std::min(nModes, N);
  ReedFEM r;
  r.L = L; r.h = h; r.b = b; r.EI = EI; r.mu = mu; r.m = mu * L; r.M = M; r.J = J; r.nel = nel; r.nModes = nv; r.N = N;
  const auto eig = genEig(K, Mm);
  if (!eig) return r;
  r.X.assign((size_t)N * nv, 0.0);
  for (int i = 0; i < N; i++) for (int n = 0; n < nv; n++) r.X[(size_t)i * nv + n] = eig->X(i, n);
  for (int n = 0; n < nv; n++) {
    r.omega.push_back(std::sqrt(eig->lambda[n]));
    if (r.X[(size_t)(N - 2) * nv + n] < 0) for (int i = 0; i < N; i++) r.X[(size_t)i * nv + n] *= -1; // tip moves +
    double G = 0, Th = 0;
    for (int i = 0; i < N; i++) { G += r.X[(size_t)i * nv + n] * g[i + 2]; Th += r.X[(size_t)i * nv + n] * gs[i + 2]; }
    r.Gamma.push_back(G); r.Theta.push_back(Th);
  }
  r.ok = true;
  return r;
}

std::vector<double> tipMassRoots(double muRatio, int n) {
  auto f = [&](double x) { return 1 + std::cos(x) * std::cosh(x) + muRatio * x * (std::cos(x) * std::sinh(x) - std::sin(x) * std::cosh(x)); };
  auto F = [&](double x) { return f(x) / std::cosh(x); }; // divided by cosh to keep the scan well scaled
  std::vector<double> roots;
  for (double x = 0.05; (int)roots.size() < n && x < 60; x += 0.01) {
    if (F(x) * F(x + 0.01) <= 0) {
      double a = x, c = x + 0.01;
      for (int i = 0; i < 60; i++) { const double m = 0.5 * (a + c); if (F(a) * F(m) <= 0) c = m; else a = m; }
      roots.push_back(0.5 * (a + c));
    }
  }
  return roots;
}

// ---- per-key design ----------------------------------------------------------------------------

// The solder's share of the tongue's mass, graded geometrically from A1 to C7 and carried on past them
// (3.2 at A0, 0.02 at C8: inside what the Solder mass knob already reaches, 0.002–8).
double solderRatio(int m, double scale) { return geo(1.6, 0.04, (double)(m - KEY_LO) / (KEY_HI - KEY_LO)) * scale; }

Blob blob(double M, double h) {
  const double a = std::cbrt(M / SOLDER_RHO);
  return {a, M * (a * a / 6 + std::pow((a + h) / 2, 2))};
}

TunedReed tuneReed(int m, double solderScale, int nModes) {
  const double f0 = keyFreq(m), om0 = 2 * PI * f0, h = REED.h, b = REED.b, mu = STEEL.rho * h * b;
  const double ratio = solderRatio(m, solderScale);
  // start from the exact tip-mass root, then let the FEM (which adds the blob's rotary inertia)
  // correct the length: f₁ ∝ 1/L² at fixed ratio
  const std::vector<double> roots = tipMassRoots(ratio, 1);
  const double lam = roots.empty() ? NAN : roots[0];
  double L = std::sqrt((lam * lam * std::sqrt((STEEL.E * h * h) / (12 * STEEL.rho))) / om0);
  ReedFEM r;
  for (int it = 0; it < 4; it++) {
    const double M = ratio * mu * L, J = blob(M, h).J;
    r = reedFEM(L, h, b, M, J, 20, nModes);
    if (!r.ok) break;
    const double err = r.omega[0] / om0;
    if (std::fabs(err - 1) < 1e-9) break;
    L *= std::sqrt(err);
  }
  TunedReed t;
  static_cast<ReedFEM &>(t) = std::move(r);
  t.f0 = f0; t.ratio = ratio; t.blb = blob(t.M, h);
  return t;
}

Hammer hammerDefaults(int m) {
  const double t = tKey(m);
  return {geo(0.7e-3, 0.25e-3, t), geo(6e8, 6e10, t), 2.5, 0};
}

KeyModel keyModel(int m, double solder, double strike, double hardness, double fs) {
  KeyModel k;
  k.key = m;
  k.reed = tuneReed(m, solder);
  const TunedReed &reed = k.reed;
  const double L = reed.L, f0 = reed.f0;
  const double fmax = std::min(18000.0, 0.45 * 2 * fs);
  const double xh = clamp(strike, 0.05, 0.95) * L, xd = 0.7 * L, xp = L - PICKUP.ell / 2;
  if (reed.ok) {
    for (int n = 0; n < reed.nModes; n++) {
      const double om = reed.omega[n], f = om / (2 * PI);
      if (f > fmax) break;
      const double sigSteel = 0.5 * STEEL.eta * om;
      const double sigClamp = 0.5 * om * om * (LOSS.Yw * std::pow(reed.Gamma[n], 2) + LOSS.Ytheta * std::pow(reed.Theta[n], 2));
      k.modes.push_back({n, f, f / f0, BARE_RATIOS[n], sigSteel + sigClamp, sigSteel, sigClamp, reed.shape(n, xh), reed.shape(n, xp),
                         std::pow(reed.shape(n, xd) / reed.shape(0, xd), 2), reed.Gamma[n], reed.Theta[n]});
    }
  }
  const Hammer hd = hammerDefaults(m);
  const Hammer hammer = {hd.mass, hd.K * hardness, hd.p, 2e-5};
  k.info = {m, f0, L, reed.h, reed.b, reed.m, reed.M, reed.J, reed.blb.a, reed.ratio, xh, xd, xp, hammer,
            reed.ok ? std::pow(reed.omega[0] / reed.shape(0, xp), 2) : NAN};
  VoiceData &v = k.voice;
  v.version = reedVersion(solder, strike, hardness, fs);
  v.key = m; v.n = (int)k.modes.size(); v.hammer = hammer;
  for (int i = 0; i < v.n; i++) {
    const Mode &md = k.modes[i];
    v.freq[i] = md.f; v.sigma[i] = md.sigma; v.w[i] = md.w; v.pk[i] = md.pk; v.dampW[i] = md.dampW;
  }
  return k;
}

uint64_t reedVersion(double solder, double strike, double hardness, double fs) {
  uint64_t h = 1469598103934665603ull;
  for (double v : {fs, solder, strike, hardness}) {
    v += 0.0; // −0 is 0
    uint64_t bits;
    std::memcpy(&bits, &v, 8);
    for (int k = 0; k < 8; k++) { h ^= (bits >> (8 * k)) & 0xff; h *= 1099511628211ull; }
  }
  return (h & ((1ull << 52) - 1)) | 1; // never 0
}

int packVoiceData(const VoiceData &d, double *out) {
  int n = 0;
  for (double v : {(double)d.version, (double)d.key, (double)d.n, d.hammer.mass, d.hammer.K, d.hammer.p, d.hammer.alpha}) out[n++] = v;
  for (const auto *a : {&d.freq, &d.sigma, &d.w, &d.pk, &d.dampW}) for (int i = 0; i < d.n; i++) out[n++] = (*a)[i];
  return n;
}

bool unpackVoiceData(const double *in, int n, VoiceData &d) {
  if (n < 7) return false;
  const int N = (int)in[2];
  if (!(N >= 0 && N <= MAX_MODES && n == 7 + 5 * N)) return false;
  d = VoiceData{};
  d.version = (uint64_t)in[0]; d.key = (int)in[1]; d.n = N;
  d.hammer = {in[3], in[4], in[5], in[6]};
  const double *m = in + 7;
  for (auto *a : {&d.freq, &d.sigma, &d.w, &d.pk, &d.dampW}) for (int i = 0; i < N; i++) (*a)[i] = *m++;
  return true;
}

// ---- the pickup --------------------------------------------------------------------------------

void fillCap(double *c, double gapMM) {
  const double g = clamp(gapMM, SLOT_GAPS[0], SLOT_GAPS[SLOT_NGAPS - 1]);
  int i = 0;
  while (i < SLOT_NGAPS - 2 && g > SLOT_GAPS[i + 1]) i++;
  const double u = std::log(g / SLOT_GAPS[i]) / std::log(SLOT_GAPS[i + 1] / SLOT_GAPS[i]);
  const double *A = logC().v[i], *B = logC().v[i + 1], s = EPS0 * PICKUP.ell;
  for (int k = 0; k < SLOT_Y.n; k++) c[k] = s * std::exp((1 - u) * A[k] + u * B[k]);
}

CapAt capAt(const double *c, double y) {
  const double dy = SLOT_Y.step;
  const double x = clamp((y - SLOT_Y.min) / dy, 1, SLOT_Y.n - 3 - 1e-9), f = x - std::floor(x);
  const int i = (int)std::floor(x);
  const double p0 = c[i - 1], p1 = c[i], p2 = c[i + 1], p3 = c[i + 2];
  const double a1 = 0.5 * (p2 - p0), a2 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3, a3 = 0.5 * (p3 - p0) + 1.5 * (p1 - p2);
  return {((a3 * f + a2) * f + a1) * f + p1, ((3 * a3 * f + 2 * a2) * f + a1) / dy, (6 * a3 * f + 2 * a2) / (dy * dy)};
}

Node pickupNode(double rbias, double bias) {
  const double R = rbias * 1e6, tau = R * PICKUP.C0;
  return {R, tau, 1 / (2 * PI * tau), bias / PICKUP.C0};
}

Shift electrostaticShift(double kPick, double gap, double offset, double bias) {
  double c[SLOT_Y.n];
  fillCap(c, gap);
  const double d2C = capAt(c, offset * 1e-3).d2C;
  const double kE = -0.5 * bias * bias * d2C;
  return {kE, 1200 * std::log2(std::sqrt(1 + kE / kPick))};
}

} // namespace forte::reeds
