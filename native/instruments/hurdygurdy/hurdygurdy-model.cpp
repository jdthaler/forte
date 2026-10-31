// hurdygurdy-model.cpp — the hurdy-gurdy's physics (hurdygurdy-model.h).

#include "hurdygurdy-model.h"

#include <algorithm>

#include "hurdygurdy-params.h"
#include "hurdygurdy-tuning.h"

namespace forte::hurdygurdy {

double TANGENT_TUNE[KEY_TOP - KEY_OPEN + 1], DRONE_TUNE[5];
static const bool tuned = [] {
  for (int i = 0; i <= KEY_TOP - KEY_OPEN; i++) TANGENT_TUNE[i] = TANGENTS[i];
  for (int i = 0; i < 5; i++) DRONE_TUNE[i] = DRONES[i];
  return true;
}();
static double tuneOf(int id, const Params &P) {
  if (id <= CH2) return TANGENT_TUNE[0];
  if (id == TROMP) return DRONE_TUNE[P.tromC ? 1 : 0];
  return DRONE_TUNE[id - 1];
}

Params paramsOf(const double *P) {
  Params x;
  x.crank = P[p::crank]; x.coups = COUPS[std::clamp((int)P[p::coups], 0, 6)]; x.coup = P[p::coup];
  x.uneven = P[p::uneven]; x.start = P[p::start]; x.keep = P[p::keep] != 0;
  x.on[CH1] = x.on[CH2] = P[p::chanterelles] != 0;
  x.on[TROMP] = P[p::trompette] != 0; x.on[MOUCHE] = P[p::mouche] != 0; x.on[PETIT] = P[p::petit] != 0; x.on[GROS] = P[p::gros] != 0;
  x.tromC = (int)P[p::tromNote] == tromNote_::c4;
  x.unison = P[p::unison]; x.pressure = P[p::pressure]; x.wheelPos = P[p::wheelPos];
  x.tirant = P[p::tirant]; x.chienMass = P[p::chienMass]; x.bounce = P[p::bounce];
  x.mus = P[p::mus]; x.mud = P[p::mud]; x.v0 = P[p::v0]; x.memory = P[p::memory]; x.grain = P[p::grain]; x.losses = P[p::losses];
  x.mobility = P[p::mobility]; x.boardEta = P[p::boardEta];
  x.tuning = tuningOf(P);
  return x;
}

const Params &defaults() {
  static const Params P = [] {
    double d[p::count];
    for (int i = 0; i < p::count; i++) d[i] = kParams[i].def;
    return paramsOf(d);
  }();
  return P;
}

// Mersenne: f = (1/2L)√(T/μ), so T = μ(2Lf)²; c = 2Lf, Z₀ = μc. The second chanterelle is tuned
// `unison` cents sharp of the first.
StringDesign stringDesign(int id, const Params &P) {
  const StringSpec &s = SPEC[id];
  const int key = stringKey(id, P);
  double f = keyFreq(key) * P.tuning.ratio(key) * fdlibm::pow(2.0, tuneOf(id, P) / 1200);
  if (id == CH2) f *= fdlibm::pow(2.0, P.unison / 1200);
  const double c = 2 * s.L * f;
  return {id, key, f, s.L, s.mu, s.mu * c * c, c, s.mu * c, s.wound};
}

double stopLength(int key, const Params &P) {
  if (key <= KEY_OPEN) return SPEC[CH1].L;
  const int k = std::min(key, KEY_TOP);
  const double fOpen = keyFreq(KEY_OPEN) * P.tuning.ratio(KEY_OPEN), f = keyFreq(k) * P.tuning.ratio(k);
  return SPEC[CH1].L * fOpen / f * fdlibm::pow(2.0, (TANGENT_TUNE[0] - TANGENT_TUNE[k - KEY_OPEN]) / 1200);
}

// ---- the soundboard -----------------------------------------------------------------------------
double plateYinf() { return bowed::plateYinf(BOARD); }

std::vector<Mode> boardModes(double fMax, double eta) {
  static const double MICS[2][2] = {{0.7, PI * 0.92}, {0.7, PI * 0.08}}; // as the Viola Organista's
  std::vector<Mode> out;
  const double M = (BOARD.rhoH * BOARD.a * BOARD.b) / 4;
  for (int m = 1; m < 40; m++) for (int n = 1; n < 40; n++) {
    const double f = bowed::plateFreq(m, n, BOARD);
    if (f > fMax) { if (n == 1) m = 99; break; }
    Mode x{};
    x.m = m; x.n = n; x.f = f; x.M = M; x.sigma = PI * f * eta;
    for (int j = 0; j < NDRIVE; j++) x.drive[j] = bowed::plateShape(m, n, DRIVE_XY[j][0] * BOARD.a, DRIVE_XY[j][1] * BOARD.b, BOARD) / M;
    for (int j = 0; j < 2; j++) bowed::wallace(m, n, f, MICS[j][0], MICS[j][1], x.w[j], BOARD);
    out.push_back(x);
  }
  std::stable_sort(out.begin(), out.end(), [](const Mode &a, const Mode &b) { return a.f < b.f; });
  return out;
}

// ---- bowing -------------------------------------------------------------------------------------
bowed::Friction friction(const Params &P) { return {P.mus, std::min(P.mud, P.mus - 0.02), P.v0, P.memory / 1000, P.grain}; }

// Σ Z₀ of the strings on string id's bridge: the chanterelles share the middle one, each drone has
// its own at the side, and the trompette stands on the chien
double zBridge(int id, const Params &P) {
  if (id == TROMP) return 0;
  if (id > CH2) return stringDesign(id, P).Z0;
  return stringDesign(CH1, P).Z0 + stringDesign(CH2, P).Z0;
}

Loop loopDesign(const StringDesign &s, double Ls, const Params &P, double fs) {
  const double f0 = s.c / (2 * Ls), N0 = fs / f0;
  const double beta = std::min(0.5, std::max(P.wheelPos / Ls, 2.6 / N0)); // (the bridge side needs ≥ 1.3 samples each way)
  const double fh = std::min(0.35 * fs, std::max(4000.0, 3 * f0));
  const double s0 = stringSigma(f0, P, s.wound), sh = stringSigma(fh, P, s.wound);
  const bowed::LossFilter lb = bowed::lossFilter(f0, s0, fh, sh, fs, beta / f0), ln = bowed::lossFilter(f0, s0, fh, sh, fs, (1 - beta) / f0);
  Loop L;
  L.f0 = f0; L.Ls = Ls; L.beta = beta; L.N0 = N0;
  L.Db = (beta * N0 - lb.tau) / 2; L.Dn = ((1 - beta) * N0 - ln.tau) / 2;
  L.gb = lb.g; L.pb = lb.p; L.gn = ln.g; L.pn = ln.p;
  // the bridge's loss (|reflection| for this string alone on it), or none on the chien
  const double G = bridgeG(P), rB = s.id == TROMP ? 1 : 1 - (2 * G * s.Z0) / (1 + G * zBridge(s.id, P));
  L.sigma1 = -f0 * fdlibm::log(rB) + s0;
  return L;
}

Schelleng schelleng(const StringDesign &s, const Loop &L, const Params &P, double vB) {
  const bowed::Friction F = friction(P);
  const double dmu = F.mus - F.mud, R = (2 * s.Z0 * L.f0) / std::max(1e-6, L.sigma1), w = vB + L.beta * F.v0;
  return {(2 * s.Z0 * w) / (dmu * L.beta), (s.Z0 * s.Z0 * w) / (2 * R * dmu * L.beta * L.beta)};
}

double voiced(int id) {
  static const std::array<double, NSTR> table = [] {
    std::array<double, NSTR> t{};
    const Params &P = defaults();
    for (int i = 0; i < NSTR; i++) {
      const StringDesign s = stringDesign(i, P);
      const double Ls = i <= CH2 ? stopLength(KEY_TOP, P) : s.L;
      t[i] = (i > TROMP ? 0.4 : i == TROMP ? 0.5 : 0.625) * schelleng(s, loopDesign(s, Ls, P, 48000), P, wheelSpeed(P.crank)).Fmax;
    }
    return t;
  }();
  return id >= 0 && id < NSTR ? table[id] : 0;
}

int oversample(int id, double fs) {
  if (id <= CH2) return bowed::oversample(KEY_TOP, fs);
  if (id == TROMP) return std::max(1, bowed::oversample(KEY_TOP, fs) / 2); // the chien's landings want fine steps
  return bowed::oversample(SPEC[id].key + 7, fs);
}

// ---- the chien ----------------------------------------------------------------------------------
// Lifting needs F_s > F_t: the drag's mean, about the sliding friction's share on the bridge side
// (1 − β)·μd·F_N, and the sawtooth's peak above it, Z₀v_B/β.
double buzzThreshold(const Params &P) {
  const StringDesign s = stringDesign(TROMP, P);
  const Loop L = loopDesign(s, s.L, P, 48000);
  const double mean = (1 - L.beta) * friction(P).mud * wheelForce(TROMP, P);
  const double v = std::max(0.0, P.tirant - mean) * L.beta / s.Z0;
  return v / (PI * WHEEL_D);
}

// In units of the contact's natural frequency and the speed it lands with, the penetration is
// x = e^{−ζt} sin(ω t)/ω (ω = √(1 − ζ²)); the force x + 2ζẋ ∝ (1 − 2ζ²) sin ωt/ω + 2ζ cos ωt first
// vanishes past ωt = π/2, and the foot leaves at the speed ẋ then.
static double restitution(double z) {
  const double w = std::sqrt(1 - z * z), th = PI - fdlibm::atan2(2 * z * w, 1 - 2 * z * z), t = th / w;
  return fdlibm::exp(-z * t) * std::abs(fdlibm::cos(th) - z * fdlibm::sin(th) / w);
}
double contactZeta(double e) {
  e = std::max(1e-6, std::min(0.999, e));
  double lo = 0, hi = 0.999; // e falls as ζ grows
  for (int i = 0; i < 60; i++) { const double z = (lo + hi) / 2; (restitution(z) > e ? lo : hi) = z; }
  return (lo + hi) / 2;
}

void chienStep(Chien &c, double F, double Z, double Ft, double m, double zeta, double dt) {
  double Fc = 0;
  if (c.y < 0) Fc = std::max(0.0, CHIEN_K * -c.y - 2 * zeta * std::sqrt(CHIEN_K * m) * c.v);
  c.v = (m * c.v + dt * (F - Ft + Fc)) / (m + dt * Z);
  c.y += dt * c.v;
  c.Fs = F - Z * c.v; c.Fc = Fc;
  if (c.y > 1e-6) c.up = true;
  else if (c.up && c.y < 0) { c.up = false; c.hits++; }
}

// ---- the crank ----------------------------------------------------------------------------------
double coupShape(double u, int N, double r) {
  if (N <= 0) return 0;
  const double w = std::min(0.8, 0.07 * r * N);
  if (u >= w) return 0;
  const double s = fdlibm::sin(PI * u / w);
  return s * s;
}

} // namespace forte::hurdygurdy
