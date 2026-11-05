// cimbalom-model.cpp — the cimbalom's and the dulcimer's physics (cimbalom-model.h).

#include "cimbalom-model.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace forte::cimbalom {

using std::numbers::pi;
static double clamp(double x, double a, double b) { return std::min(b, std::max(a, x)); }

Params paramsOf(const double *P) {
  Params q;
  q.build = (int)P[p::build]; q.head = (int)P[p::head];
  q.detune = P[p::detune]; q.bridge = P[p::bridge]; q.loss = P[p::loss]; q.mass = P[p::mass]; q.stick = P[p::stick];
  q.strike = P[p::strike]; q.roll = P[p::roll]; q.sympathy = P[p::sympathy];
  q.dampers = (int)P[p::dampers];
  q.tuning = tuningOf(P);
  return q;
}

double keyPitch(int key, const Params &P) { return 440 * std::pow(2.0, (key - 69) / 12.0) * P.tuning.ratio(key); }
static double etPitch(double key) { return 440 * std::pow(2.0, (key - 69) / 12.0); }

// ---- the scale
//
// Plain steel strings at about 1.1 GPa (wave speed 380 m/s, under half the wire's strength), so
// L = 190 m/s / f, folded under each instrument's longest string; below that the bass strings are
// wound with copper, their tension kept and their mass raised to the note.
namespace SCALE {
constexpr double speed = 380; // m/s: 2 L f for the plain treble
constexpr double fold = 2.5;
constexpr double Lmax[2] = {0.88, 0.62};
constexpr int wound[2] = {52, 50}; // below E3 (cimbalom) and D3 (dulcimer) the strings are wound
} // namespace SCALE
static double fold(double Lf, double Lmax) { const double p = SCALE::fold; return Lf / std::pow(1 + std::pow(Lf / Lmax, p), 1 / p); }
static double scaleOf(double key, int build) { return std::max(0.03, fold(SCALE::speed / (2 * etPitch(key)), SCALE::Lmax[build])); }

double speakingLength(int key, int build) {
  if (build == build_::dulcimer && key >= DULCIMER_LEFT) return scaleOf(key - 7, build) * 2 / 3; // the left side of a course tuned a fifth below
  return scaleOf(key, build);
}
bool isWound(int key, int build) { return key < SCALE::wound[build]; }
int stringsOf(int key, int build) { return build == build_::dulcimer ? 2 : isWound(key, build) ? 3 : 4; }
double wireDiameter(int key, int build) {
  if (isWound(key, build)) return 0.50e-3; // the core
  return clamp(0.45e-3 * std::pow(1.2, (69 - key) / 24.0), 0.38e-3, 0.60e-3);
}

double jitter(double m, double s) { const double x = std::sin(m * 12.9898 + s * 78.233) * 43758.5453; return x - std::floor(x); }
double detuneCents(int key, int str, int strings, const Params &P) {
  if (strings < 2) return 0;
  double c[STR_MAX], mean = 0;
  for (int j = 0; j < strings; j++) { c[j] = P.detune * ((double)j / (strings - 1) - 0.5) * (0.6 + 0.8 * jitter(key, j + 1)); mean += c[j] / strings; }
  return c[str] - mean;
}

Course courseOf(int key, const Params &P) {
  Course C;
  const int b = P.build;
  C.key = key; C.strings = stringsOf(key, b); C.wound = isWound(key, b);
  C.L = speakingLength(key, b);
  C.f0 = keyPitch(key, P);
  if (b == build_::dulcimer && key >= DULCIMER_TREBLE) {
    // the treble bridge divides the string 2 : 3 (left : right): left, a fifth above the right
    C.side = key >= DULCIMER_LEFT ? left : right;
    C.Lfar = C.side == right ? C.L * 2 / 3 : C.L * 3 / 2;
    C.ffar = C.side == right ? C.f0 * 3 / 2 : C.f0 * 2 / 3;
  }
  const double c = 2 * C.L * C.f0;
  C.d = wireDiameter(key, b);
  const double muCore = STEEL.rho * pi * C.d * C.d / 4;
  C.EI = STEEL.E * pi * std::pow(C.d, 4) / 64;
  if (C.wound) {
    // the tension of the lowest plain string, carried on
    const int w = SCALE::wound[b];
    const double Lw = speakingLength(w, b), dw = wireDiameter(w, b), cw = 2 * Lw * etPitch(w);
    const double Tw = STEEL.rho * pi * dw * dw / 4 * cw * cw;
    C.mu = std::max(muCore, Tw / (c * c));
    C.eta = WOUND_ETA;
  } else {
    C.mu = muCore;
    C.eta = STEEL.eta;
  }
  C.T = C.mu * c * c;
  C.B = std::pow(pi, 2) * C.EI / (C.T * C.L * C.L);
  C.Bfar = C.Lfar > 0 ? std::pow(pi, 2) * C.EI / (C.T * C.Lfar * C.Lfar) : 0;
  C.Z = std::sqrt(C.T * C.mu);
  C.stress = C.T / (pi * C.d * C.d / 4);
  const int lo = b == build_::dulcimer ? DULCIMER_LO : CIMBALOM_LO, hi = b == build_::dulcimer ? DULCIMER_HI : CIMBALOM_HI;
  C.place = clamp((key - lo) / double(hi - lo), 0, 1);
  return C;
}

// ---- the hammers
//
// Cotton wool wound on the tips: soft and lossy, nearly as a piano's felt (Chaigne and Askenfelt's
// exponent 2.5). Leather: firmer, exponent 2. Bare wood on steel wire: Hertz's contact of crossed
// cylinders (exponent 3/2), K = (4/3)E*√R with wood's modulus across the grain and R ≈ 1 mm.
Face faceOf(int head) {
  switch (head) {
    case head_::wood: return {4.0e8, 1.5, 0.02};
    case head_::leather: return {2.0e9, 2.0, 0.15};
    default: return {1.5e10, 2.5, 0.35};
  }
}
double hammerSpeed(double vel) { return 0.25 * std::pow(10.0, 1.3 * clamp(vel, 0, 1)); }

// ---- partials

constexpr double AIR_ETA = 1.8e-5, AIR_RHO = 1.2;
double sigmaString(const Course &C, double f, double loss) {
  const double dOut = C.wound ? std::sqrt(4 * C.mu / (pi * 8900)) : C.d; // a wound string's outside, from its mass
  const double R = 2 * pi * AIR_ETA + 2 * pi * dOut * std::sqrt(pi * AIR_ETA * AIR_RHO * f);
  return (R / (2 * C.mu) + pi * f * C.eta) * loss;
}

int partials(const Course &C, int str, bool far, const Params &P, double xh, int nmax, double fmax, Partial *out) {
  if (far && !(C.Lfar > 0)) return 0;
  const double cents = detuneCents(C.key, str, C.strings, P), r = std::pow(2.0, cents / 1200);
  const double L = far ? C.Lfar : C.L, f1 = (far ? C.ffar : C.f0) * r, T = C.T * r * r;
  const double B = std::pow(pi, 2) * C.EI / (T * L * L), nrm = std::sqrt(2 / (C.mu * L));
  int N = 0;
  for (int n = 1; n <= nmax; n++) {
    const double f = n * f1 * std::sqrt((1 + B * n * n) / (1 + B));
    if (f > fmax) break;
    const double k = n * pi / L, w = TAU * f;
    Partial &q = out[N++];
    q.f = f; q.k = k;
    q.sigma = sigmaString(C, f, P.loss);
    q.psi = far ? 0 : nrm * std::sin(k * xh);
    q.beta = nrm * (T * k + C.EI * k * k * k);
    q.sigB = std::max(0.0, boardAdmittance(P.build, C.place, f)[0]) * P.bridge * q.beta * q.beta / (2 * w * w);
  }
  return N;
}

// ---- the soundboard: an equivalent simply supported orthotropic plate, its stiffness chosen to
// give the mean admittance G₀ = 1/(8√(Dρh)) (Cremer: the infinite plate's)

std::array<double, 2> bridgePoint(double place, int build) {
  const BoardSpec &s = BOARDS[build];
  return {s.a * (0.22 + 0.56 * place), s.b * (0.70 - 0.38 * place)}; // the bass at the back, the treble nearer the player
}
std::array<double, NSEG> segmentWeights(double t) {
  std::array<double, NSEG> w{};
  t = clamp(t, 0, 1);
  if (t < 0.5) { w[0] = 1 - 2 * t; w[1] = 2 * t; }
  else { w[1] = 2 - 2 * t; w[2] = 2 * t - 1; }
  return w;
}

double BoardModel::shape(int k, double x, double y) const {
  return N0 * std::sin(mm[k] * pi * x / spec.a) * std::sin(nn[k] * pi * y / spec.b);
}

static BoardModel buildBoard(int build) {
  const BoardSpec &S = BOARDS[build];
  BoardModel B;
  B.spec = S;
  const double sq = 1 / (64 * S.rhoh * S.G0 * S.G0), Dy = sq / std::sqrt(S.aniso), Dx = S.aniso * Dy, H = sq / 2;
  const auto omega = [&](int m, int n) {
    return (pi * pi / std::sqrt(S.rhoh)) * std::sqrt(Dx * std::pow((double)m / S.a, 4) + 2 * H * std::pow((double)m / S.a, 2) * std::pow((double)n / S.b, 2) + Dy * std::pow((double)n / S.b, 4));
  };
  struct M { int m, n; double w; };
  std::vector<M> all;
  const double wCap = 6 * omega(1, 1) * std::sqrt((double)BOARD_MODES);
  for (int m = 1; omega(m, 1) < wCap; m++) for (int n = 1; omega(m, n) < wCap; n++) all.push_back({m, n, omega(m, n)});
  std::stable_sort(all.begin(), all.end(), [](const M &p, const M &q) { return p.w < q.w; });
  if ((int)all.size() > BOARD_MODES) all.resize(BOARD_MODES);
  const int K = (int)all.size();
  B.K = K; B.N0 = 2 / std::sqrt(S.rhoh * S.a * S.b); B.Ginf = S.G0;
  B.f.resize(K); B.sigma.resize(K); B.phi.resize(K * NSEG); B.mic.resize(2 * K); B.mm.resize(K); B.nn.resize(K);
  for (int k = 0; k < K; k++) { B.mm[k] = all[k].m; B.nn[k] = all[k].n; }
  std::array<std::array<double, 2>, NSEG> pts;
  for (int s = 0; s < NSEG; s++) pts[s] = bridgePoint(0.5 * s, build);
  constexpr double MIC_W = 0.12;
  for (int k = 0; k < K; k++) {
    B.f[k] = all[k].w / TAU; B.sigma[k] = S.eta * all[k].w / 2;
    for (int s = 0; s < NSEG; s++) B.phi[k * NSEG + s] = B.shape(k, pts[s][0], pts[s][1]);
    for (int j = 0; j < 2; j++) { // ∫∫ φ g dA over the microphone's Gaussian patch (normalised)
      const double cx = MICS[j][0] * S.a, cy = MICS[j][1] * S.b;
      constexpr int nx = 40, ny = 24;
      double sum = 0, wsum = 0;
      for (int ix = 0; ix < nx; ix++) for (int iy = 0; iy < ny; iy++) {
        const double x = (ix + 0.5) * S.a / nx, y = (iy + 0.5) * S.b / ny;
        const double g = std::exp(-(std::pow(x - cx, 2) + std::pow(y - cy, 2)) / (2 * MIC_W * MIC_W));
        sum += g * B.shape(k, x, y); wsum += g;
      }
      B.mic[2 * k + j] = sum / wsum;
    }
  }
  B.fTop = K ? B.f[K - 1] : 1000;
  return B;
}
const BoardModel &boardModel(int build) {
  static const BoardModel B[2] = {buildBoard(0), buildBoard(1)};
  return B[build == build_::dulcimer ? 1 : 0];
}

// The modal sum, the mean conductance G₀ above the modal band (faded in across its top), then the
// bridge's own mass in series, Y_tot = Y/(1 + iω m_b Y).
std::array<double, 2> boardAdmittance(int build, double place, double f) {
  const BoardModel &B = boardModel(build);
  const auto [x, y] = bridgePoint(place, build);
  const double w = TAU * f;
  double re = 0, im = 0;
  for (int k = 0; k < B.K; k++) {
    const double p = B.shape(k, x, y), p2 = p * p, wk = TAU * B.f[k], d = wk * wk - w * w, s2 = 2 * B.sigma[k] * w, den = d * d + s2 * s2;
    re += p2 * w * s2 / den; im += p2 * w * d / den;
  }
  re += B.Ginf / (1 + std::pow(B.fTop / f, 4));
  const double yy = re * re + im * im, zr = re / yy, zi = -im / yy + w * B.spec.mb, zz = zr * zr + zi * zi;
  return {zr / zz, -zi / zz};
}

} // namespace forte::cimbalom
