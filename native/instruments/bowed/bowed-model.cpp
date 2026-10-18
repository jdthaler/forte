// bowed-model.cpp — the viola organista's physics (bowed-model.h).

#include "bowed-model.h"

#include <algorithm>

#include "bowed-params.h"
#include "bowed-tuning.h"
#include "forte/dsp.h"

namespace forte::bowed {

namespace {
constexpr double PI = std::numbers::pi;
Params fromDefaults() {
  double d[p::count];
  for (int i = 0; i < p::count; i++) d[i] = kParams[i].def;
  Params P;
  P.speed = d[p::speed]; P.beta = d[p::beta]; P.treadle = d[p::treadle]; P.treadleRate = d[p::treadleRate];
  P.force = d[p::force]; P.attack = d[p::attack]; P.mus = d[p::mus]; P.mud = d[p::mud]; P.v0 = d[p::v0];
  P.memory = d[p::memory]; P.grain = d[p::grain]; P.torsionQ = d[p::torsionQ]; P.losses = d[p::losses];
  P.mobility = d[p::mobility]; P.boardEta = d[p::boardEta]; P.damper = d[p::damper]; P.lifted = d[p::lifted] != 0;
  return P;
}
} // namespace

double cTorsion() {
  static const double c = std::sqrt(STEEL.G / STEEL.rho);
  return c;
}
double zAll() {
  static const double z = [] {
    double s = 0;
    for (int k = KEY_LO; k <= KEY_HI; k++) s += stringDesign(k).Z0;
    return s;
  }();
  return z;
}

const Params &defaults() {
  static const Params P = fromDefaults();
  return P;
}

StringDesign stringDesign(int key) {
  const double fKey = keyFreq(key), f0 = fKey * fdlibm::pow(2.0, TUNE[key - KEY_LO] / 1200);
  const double L = 0.36 * fdlibm::pow(2.0, (-0.8 * (key - 72)) / 12);
  const double T = 95 + 35 * std::min(1.0, std::max(0.0, (84 - key) / 48.0));
  const double c = 2 * L * f0, mu = T / (c * c), Z0 = T / c;
  const double d = std::sqrt((4 * mu) / (PI * STEEL.rho));                                // as plain steel wire
  const double B = (fdlibm::pow(PI, 3) * STEEL.E * fdlibm::pow(d, 4)) / (64 * T * L * L); // inharmonicity (neglected)
  return {key, fKey, f0, L, T, c, mu, Z0, d, B, STEEL.rho * c * c, wound(key) > 0};
}

// ---- soundboard ---------------------------------------------------------------------------------
double plateYinf(const Board &B) { return 1 / (8 * std::sqrt(B.rhoH) * fdlibm::pow(B.Dx * B.Dy, 0.25)); }
double plateDensity(const Board &B) { return (B.a * B.b * std::sqrt(B.rhoH)) / (2 * fdlibm::pow(B.Dx * B.Dy, 0.25)); }
double plateFreq(int m, int n, const Board &B) {
  return (PI / 2) * (std::sqrt(B.Dx) * fdlibm::pow(m / B.a, 2) + std::sqrt(B.Dy) * fdlibm::pow(n / B.b, 2)) / std::sqrt(B.rhoH);
}

void bridgePoint(double key, double out[2], const Board &B) {
  const double u = (key - KEY_LO) / (KEY_HI - KEY_LO);
  out[0] = B.a * (0.18 + 0.6 * u); out[1] = B.b * (0.78 - 0.5 * u);
}

void wallace(int m, int n, double f, double theta, double phi, double out[2], const Board &B) {
  const double k = (2 * PI * f) / 343;
  const double al = k * B.a * fdlibm::sin(theta) * fdlibm::cos(phi), ga = k * B.b * fdlibm::sin(theta) * fdlibm::sin(phi);
  auto term = [](int q, double x, double r[2]) { // ((−1)^q e^{−ix} − 1) / ((x / qπ)² − 1)
    const double s = q % 2 ? -1 : 1, den = fdlibm::pow(x / (q * PI), 2) - 1;
    const double re = s * fdlibm::cos(x) - 1, im = -s * fdlibm::sin(x);
    if (std::fabs(den) < 1e-6) { r[0] = 0; r[1] = ((-q * PI) / 2) * (x > 0 ? 1 : x < 0 ? -1 : 0); return; } // removable: x = ±qπ
    r[0] = re / den; r[1] = im / den;
  };
  double a[2], b[2];
  term(m, al, a); term(n, ga, b);
  const double pr = a[0] * b[0] - a[1] * b[1], pi = a[0] * b[1] + a[1] * b[0];
  const double g = (k * B.a * B.b) / (fdlibm::pow(PI, 2) * m * n);
  out[0] = -g * pi; out[1] = g * pr; // × i k
}

double stringLoad(int m, int n, const Board &B) {
  double s = 0;
  for (int k = KEY_LO; k <= KEY_HI; k++) {
    double xy[2];
    bridgePoint(k, xy, B);
    s += stringDesign(k).Z0 * fdlibm::pow(plateShape(m, n, xy[0], xy[1], B), 2);
  }
  return s / (2 * ((B.rhoH * B.a * B.b) / 4));
}

static const double MICS[2][2] = {{0.7, PI * 0.92}, {0.7, PI * 0.08}};
std::vector<BoardMode> boardModes(double fMax, double eta, const Board &B) {
  std::vector<BoardMode> out;
  for (int m = 1; m < 60; m++) for (int n = 1; n < 60; n++) {
    const double f = plateFreq(m, n, B);
    if (f > fMax) { if (n == 1) m = 99; break; }
    BoardMode x{};
    x.m = m; x.n = n; x.f = f; x.load = stringLoad(m, n, B);
    x.sigma = PI * f * eta + x.load; x.M = (B.rhoH * B.a * B.b) / 4;
    for (int j = 0; j < 2; j++) wallace(m, n, f, MICS[j][0], MICS[j][1], x.w[j], B);
    out.push_back(x);
  }
  std::stable_sort(out.begin(), out.end(), [](const BoardMode &x, const BoardMode &y) { return x.f < y.f; });
  return out;
}

// ---- friction -----------------------------------------------------------------------------------
Friction friction(const Params &P) {
  return {P.mus, std::min(P.mud, P.mus - 0.02), P.v0, P.memory / 1000, P.grain};
}

static double slipRoot(int s, double dv, double c, const Friction &F) { // relative slip speed u > 0 on branch s, or −1
  const double a = s * dv, B = F.v0 - a + c * F.mud, C = F.v0 * (c * F.mus - a), disc = B * B - 4 * C;
  return disc < 0 ? -1 : 0.5 * (-B + std::sqrt(disc));
}
double frictionForce(double vh, double vB, double FN, double Y, const Friction &F, FrictionState &state) {
  if (!(FN > 0)) { state.s = vh > vB ? 1 : -1; return 0; }
  const double dv = vh - vB, c = Y * FN, v0 = F.v0;
  if (state.s != 0) {
    const double u = slipRoot(state.s, dv, c, F);
    if (u > 0) return -state.s * FN * (F.mud + ((F.mus - F.mud) * v0) / (v0 + u));
  }
  if (std::fabs(dv) <= c * F.mus) { state.s = 0; return -dv / Y; }
  const int s = dv > 0 ? 1 : -1;
  const double u = slipRoot(s, dv, c, F);
  state.s = s;
  return -s * FN * (F.mud + ((F.mus - F.mud) * v0) / (v0 + std::max(u, 0.0)));
}
double frictionForceMem(double vh, double vB, double FN, double Y, const Friction &F, FrictionState &state, double a) {
  const double dv = vh - vB, m = F.mud + ((F.mus - F.mud) * F.v0) / (F.v0 + state.u), lim = Y * m * FN;
  double f, du;
  if (std::fabs(dv) <= lim) { f = -dv / Y; du = 0; state.s = 0; }
  else { state.s = dv > 0 ? 1 : -1; f = -state.s * m * FN; du = std::fabs(dv) - lim; }
  state.u += a * (du - state.u);
  return f;
}

// ---- bridge and loop ------------------------------------------------------------------------------
LossFilter lossFilter(double f0, double s0, double fh, double sh, double fs, double dur) {
  const double w0 = (2 * PI * f0) / fs, wh = (2 * PI * fh) / fs, c0 = fdlibm::cos(w0);
  const double G0 = fdlibm::exp(-s0 * dur), Gh = fdlibm::exp(-sh * dur), R2 = fdlibm::pow(Gh / G0, 2);
  double p = 0;
  if (R2 < 1 - 1e-12) {
    const double A = (R2 * fdlibm::cos(wh) - c0) / (R2 - 1);
    p = A > 1 ? A - std::sqrt(A * A - 1) : 1;
  }
  // a passive filter: the gain at DC, g, must not exceed q < 1 (else the loop grows)
  const double q = 0.9999;
  if (G0 < q) {
    const double B = (q * q - G0 * G0 * c0) / (q * q - G0 * G0); // > 1 when G0 < q
    p = std::max(0.0, std::min(p, B - std::sqrt(B * B - 1)));
  } else p = 0;
  const double g = (G0 * std::sqrt(1 - 2 * p * c0 + p * p)) / (1 - p);
  const double tau = fdlibm::atan2(p * fdlibm::sin(w0), 1 - p * c0) / w0;
  return {g, p, tau};
}

static int os48(int key) { return (int)std::min(4.0, fdlibm::pow(2.0, std::max(0.0, std::ceil(std::log2((180 * keyFreq(key)) / 48000))))); }
int oversample(int key, double fs) { return std::max(1, (int)std::floor((os48(key) * 48000) / fs + 0.5)); }

double torsionEcho(int key) { const double c = stringDesign(key).c; return c / (c + cTorsion()); }

Loop loopDesign(int key, const Params &P, double fs) {
  const StringDesign s = stringDesign(key);
  const double G = bridgeG(P);
  const double N0 = fs / s.f0;
  const double beta = std::min(0.5, std::max(P.beta * wheelBeta(key), 2.6 / N0)); // the bridge side needs ≥ 1.3 samples each way
  const double fh = std::min(0.35 * fs, std::max(4000.0, 3 * s.f0));
  const double s0 = stringSigma(s.f0, P, key), sh = stringSigma(fh, P, key);
  const LossFilter lb = lossFilter(s.f0, s0, fh, sh, fs, beta / s.f0), ln = lossFilter(s.f0, s0, fh, sh, fs, (1 - beta) / s.f0);
  Loop L;
  static_cast<StringDesign &>(L) = s;
  L.G = G; L.Zall = zAll(); L.N0 = N0; L.beta = beta; L.wheel = wheelSpeed(key); L.vB = P.speed * wheelSpeed(key);
  L.Db = (beta * N0 - lb.tau) / 2; L.Dn = ((1 - beta) * N0 - ln.tau) / 2;
  L.gb = lb.g; L.pb = lb.p; L.gn = ln.g; L.pn = ln.p;
  L.rB = 1 - (2 * G * s.Z0) / (1 + G * zAll());   // |bridge reflection|, one string alone
  L.sigma1 = -s.f0 * fdlibm::log(L.rB) + s0;         // bridge + the string's own loss at f₀
  // torsion: waves at c_t = √(G/ρ); impedance μ c_t / 2 at the surface; both ends clamp the twist
  const double Zt = P.torsionQ > 0 ? (s.mu * cTorsion()) / 2 : 0, ft = cTorsion() / (2 * s.L), st = (PI * ft) / std::max(1.0, P.torsionQ);
  const double Dtb = std::max(2.0, (2 * beta * s.L * fs) / cTorsion()), Dtn = std::max(2.0, (2 * (1 - beta) * s.L * fs) / cTorsion());
  L.Zt = Zt; L.ft = ft; L.Dtb = Dtb; L.Dtn = Dtn;
  L.rtb = fdlibm::exp((-st * Dtb) / fs); L.rtn = fdlibm::exp((-st * Dtn) / fs);
  return L;
}

// ---- Schelleng's bounds -----------------------------------------------------------------------------
// Schelleng (1973), in the form of Schoonderwaldt, Guettler & Askenfelt (2008) for a hyperbolic
// friction curve; R the bridge resistance that would give the string's actual decay σ₁.
Schelleng schelleng(const Loop &L, const Params &P, double beta, double vB) {
  const Friction F = friction(P);
  const double dmu = F.mus - F.mud, R = (2 * L.Z0 * L.f0) / L.sigma1;
  const double w = vB + beta * F.v0;
  return {R, (2 * L.Z0 * w) / (dmu * beta), (L.Z0 * L.Z0 * w) / (2 * R * dmu * beta * beta)};
}

// ---- what the string is doing ---------------------------------------------------------------------------
Motion classifyMotion(const double *iv, int n) {
  double sum = 0, dev = 0;
  for (int j = 0; j < n; j++) { sum += iv[j]; dev = std::max(dev, std::fabs(iv[j] - 1)); }
  Motion out;
  out.spp = n / sum;
  if (dev < 0.12) { out.kind = Kind::helmholtz; return out; }
  // a repeating pattern: some group of k consecutive intervals spans one period
  for (int k = 2; k <= 4; k++) {
    bool ok = n >= 2 * k;
    for (int j = 0; ok && j + k <= n; j++) {
      double span = 0;
      for (int i = j; i < j + k; i++) span += iv[i];
      if (std::fabs(span - 1) > 0.12) ok = false;
    }
    if (ok) { out.kind = Kind::multiple; return out; }
  }
  out.kind = out.spp > 1.3 ? Kind::multiple : Kind::raucous;
  return out;
}

// ---- the key action -------------------------------------------------------------------------------
double voiced(int key) {
  static const std::array<double, NK> table = [] {
    std::array<double, NK> t{};
    for (int k = KEY_LO; k <= KEY_HI; k++) t[k - KEY_LO] = 0.5 * schelleng(loopDesign(k, defaults(), 48000), defaults()).Fmax;
    return t;
  }();
  return key >= KEY_LO && key <= KEY_HI ? table[key - KEY_LO] : 0;
}

} // namespace forte::bowed
