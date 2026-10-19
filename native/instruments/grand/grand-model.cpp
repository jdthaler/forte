// grand-model.cpp — the electric grand's physics (grand-model.h).

#include "grand-model.h"

#include <algorithm>

#include "forte/dsp.h"
#include "grand-params.h"

namespace forte::grand {

namespace {
constexpr double PI = std::numbers::pi, TAU = 2 * PI;
double clamp(double x, double a, double b) { return std::min(b, std::max(a, x)); }
double sq(double x) { return x * x; }
// Math.sign(x || 1): ±1, and 1 for 0 or NaN
double signOr1(double x) { return x == 0 || std::isnan(x) ? 1 : x > 0 ? 1 : -1; }

// Piecewise-linear through the points, extrapolated beyond the ends (as the piano's).
template <size_t N>
double interp(double m, const double (&pts)[N][2]) {
  if (m <= pts[0][0]) return pts[0][1] + ((pts[1][1] - pts[0][1]) * (m - pts[0][0])) / (pts[1][0] - pts[0][0]);
  for (size_t i = 1; i < N; i++) {
    if (m <= pts[i][0] || i == N - 1) return pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * (m - pts[i - 1][0])) / (pts[i][0] - pts[i - 1][0]);
  }
  return 0;
}
} // namespace

ModelParams modelParams(const double *P) {
  ModelParams M;
  M.scale = (int)P[p::scale]; M.stringing = (int)P[p::stringing]; M.stretch = P[p::stretch] != 0; M.mount = (int)P[p::mount];
  M.stiffness = P[p::stiffness]; M.detune = P[p::detune]; M.loss = P[p::loss]; M.gFrame = P[p::gFrame]; M.boardH = P[p::boardH];
  M.tilt = P[p::tilt]; M.hRatio = P[p::hRatio]; M.kH = P[p::kH]; M.hardness = P[p::hardness]; M.strike = P[p::strike]; M.maxFreq = P[p::maxFreq];
  M.tuning = tuningOf(P);
  return M;
}

// ---- scale design ------------------------------------------------------------------------------

// CP-70 short scale: piano-like L ∝ f^−0.9 in the treble, folded so the longest string is 0.68 m.
// Above E7, L ∝ 1/f: a plain wire's stress is 4ρ(Lf)² whatever its gauge, so it stays at E7's.
double cpLength(double m) {
  if (m > KEY_HI) return cpLength(KEY_HI) * std::pow(2.0, -(m - KEY_HI) / 12);
  const double Lf = 0.55 * std::pow(2.0, (-0.9 * (m - 60)) / 12);
  return Lf / std::pow(1 + std::pow(Lf / 0.68, 6), 1.0 / 6);
}
double cpCore(double m) { return 1.065e-3 * std::pow(2.0, (-(m < 60 ? 0.18 : 0.12) * (m - 60)) / 12); }

int stringCount(int m, int stringing) {
  if (stringing == stringing_::single) return 1;
  if (stringing == stringing_::grand) return m <= 30 ? 1 : m <= 44 ? 2 : 3;
  return m <= 42 ? 1 : 2;
}

double jitter(double m, double s) { const double x = std::sin(m * 12.9898 + s * 78.233) * 43758.5453; return x - std::floor(x); }

double scaleLength(double m) {
  const double Lf = 0.62 * std::pow(2.0, (-0.88 * (m - 60)) / 12);
  return Lf / std::pow(1 + std::pow(Lf / 2.0, 6), 1.0 / 6);
}
double scaleDiameter(double m) { return 1.065e-3 * std::pow(2.0, (-0.12 * (m - 60)) / 12); }
double windingMass(double m) {
  const double L = scaleLength(m), f = keyFreq(m), d = scaleDiameter(m);
  const double mu = 7850 * PI * d * d / 4;
  const double Tplain = 4 * L * L * f * f * mu;
  const double Ttarget = 735 * (1 + 1.2 * clamp((48 - m) / 27, 0, 1));
  if (Tplain >= 0.85 * Ttarget) return 0;
  return mu * (Ttarget / Tplain - 1);
}
// Above E7, past the data, the felt hardens so the blow keeps to E7's number of periods: a
// contact τ ∝ (M/K)^(1/(p+1)) that shrinks as 1/f (0.5 ms at C8; the Grand Piano's is 0.4 ms).
HammerDefaults hammerDefaults(double m) {
  if (m > KEY_HI) {
    const HammerDefaults e7 = hammerDefaults(KEY_HI);
    const double mass = clamp(e7.mass + (m - KEY_HI) * (2.2e-3 - 2.97e-3) / 36, 1.8e-3, 7e-3);
    return {mass, e7.K * (mass / e7.mass) * std::pow(2.0, (e7.p + 1) * (m - KEY_HI) / 12), e7.p, clamp(0.010 + (60 - m) * 0.00025, 0.003, 0.022)};
  }
  static const double M[][2] = {{36, 4.9e-3}, {60, 2.97e-3}, {96, 2.2e-3}};
  static const double K[][2] = {{36, std::log(4e8)}, {60, std::log(4.5e9)}, {96, std::log(1e11)}};
  static const double Pw[][2] = {{36, 2.3}, {60, 2.5}, {96, 3.0}};
  return {clamp(interp(m, M), 1.8e-3, 7e-3), std::exp(interp(m, K)), clamp(interp(m, Pw), 2.1, 3.3), clamp(0.010 + (60 - m) * 0.00025, 0.003, 0.022)};
}

// Geometry, tension and inharmonicity of key m, its tension solved so the stiff string's
// fundamental lands on the target f0. The scale (lengths, gauges, windings) is the key's; its
// cents are the target's from 12-TET at A = 440 Hz (the tuning's and the stretch's).
static Scale scaleAt(int m, const ModelParams &P, double f0) {
  const double fd = keyFreq(m);
  double L, d, mu, muCore;
  bool wound;
  if (P.scale == scale_::concert) {
    L = scaleLength(m); d = scaleDiameter(m);
    muCore = (STEEL.rho * PI * d * d) / 4;
    const double dMu = windingMass(m);
    mu = muCore + dMu; wound = dMu > 0;
  } else {
    L = cpLength(m); d = cpCore(m);
    muCore = (STEEL.rho * PI * d * d) / 4;
    const double Tplain = 4 * L * L * fd * fd * muCore;
    wound = Tplain < 0.85 * CP_WOUND_T;
    mu = wound ? CP_WOUND_T / (4 * L * L * fd * fd) : muCore;
  }
  const double EI = (STEEL.E * PI * std::pow(d, 4) * P.stiffness) / 64;
  const double k1 = PI / L, Tflex = 4 * L * L * f0 * f0 * mu;
  const double T = std::max(0.05 * Tflex, Tflex - EI * k1 * k1);
  const double B = (PI * PI * EI) / (T * L * L);
  const double dOut = wound ? std::sqrt(d * d + (4 * (mu - muCore)) / (0.75 * 8900 * PI)) : d;
  Scale S;
  S.key = m; S.f0 = f0; S.cents = 1200 * std::log2(f0 / fd); S.L = L; S.d = d; S.dOut = dOut; S.mu = mu; S.muCore = muCore; S.wound = wound;
  S.T = T; S.EI = EI; S.B = B; S.stress = T / ((PI * d * d) / 4); S.cT = std::sqrt(T / mu);
  return S;
}

// The key's pitch in the keyboard's tuning (exactly keyFreq at the defaults), then stretched.
static double tunedFreq(int m, const ModelParams &P) { return keyFreq(m) * P.tuning.ratio(m); }
Scale stringScale(int m, const ModelParams &P) { return scaleAt(m, P, tunedFreq(m, P) * std::pow(2.0, stretchCents(m, P) / 1200)); }

// Stretch tuning: each octave beatless (partial 2 of the lower note on the fundamental of the
// upper), outward from a temperament octave around A4; iterated, as B depends on the tension.
// On the keyboard's tuning: its octaves are 2 : 1, so the stretch keeps them beatless in any.
constexpr int NKEYS = KEY_MAX - KEY_MIN + 1; // every key: the table outward from A4 leaves E1–E7's as they were
static std::array<double, NKEYS> stretchTable(const ModelParams &P) {
  std::array<double, NKEYS> D{}, s{};
  const int T0 = 63, T1 = 74, A4 = 69;
  auto S = [&](int m) { return s[std::min(NKEYS - 1, std::max(0, m - KEY_MIN))]; };
  for (int it = 0; it < 3; it++) {
    for (int m = KEY_MIN; m <= KEY_MAX; m++) s[m - KEY_MIN] = octaveStretch(scaleAt(m, P, tunedFreq(m, P) * std::pow(2.0, D[m - KEY_MIN] / 1200)).B);
    D[A4 - KEY_MIN] = 0;
    for (int m = A4 + 1; m <= T1; m++) D[m - KEY_MIN] = D[m - 1 - KEY_MIN] + S(m - 7) / 12;
    for (int m = A4 - 1; m >= T0; m--) D[m - KEY_MIN] = D[m + 1 - KEY_MIN] - S(m - 6) / 12;
    for (int m = T1 + 1; m <= KEY_MAX; m++) D[m - KEY_MIN] = D[m - 12 - KEY_MIN] + S(m - 12);
    for (int m = T0 - 1; m >= KEY_MIN; m--) D[m - KEY_MIN] = D[m + 12 - KEY_MIN] - S(m);
  }
  return D;
}
double stretchCents(int m, const ModelParams &P) {
  if (!P.stretch || m < KEY_MIN || m > KEY_MAX) return 0;
  // the table for the last scale, stiffness and tuning, per thread (the engine's worker, or the views)
  struct Memo { int scale = -1; double stiffness = 0; Tuning tuning; std::array<double, NKEYS> D{}; };
  thread_local Memo memo;
  if (memo.scale != P.scale || memo.stiffness != P.stiffness || !(memo.tuning == P.tuning)) {
    memo.D = stretchTable(P); memo.scale = P.scale; memo.stiffness = P.stiffness; memo.tuning = P.tuning;
  }
  return memo.D[m - KEY_MIN];
}

double partialFreq(const Scale &S, int n) { const double k = (n * PI) / S.L; return std::sqrt((S.T * k * k + S.EI * std::pow(k, 4)) / S.mu) / TAU; }

// Fourier transform of a Hann window of total width w (the felt's contact patch).
static double hannFT(double k, double w) {
  const double a = (k * w) / 2;
  if (a < 1e-6) return 1;
  const double den = 1 - sq(a / PI);
  return std::fabs(den) < 1e-6 ? 0.5 : std::sin(a) / a / den;
}

// ---- the soundboard ------------------------------------------------------------------------------

std::array<double, 2> bridgePoint(int s) { const double t = (s + 0.5) / SEGMENTS; return {BOARD.a * (0.15 + 0.7 * t), BOARD.b * (0.72 - 0.44 * t)}; }

// ∫₀ᵃ sin(qx) e^{iκx} dx, as {re, im}.
std::array<double, 2> sinFT(double q, double kap, double a) {
  auto E = [a](double beta) -> std::array<double, 2> { // (e^{iβa} − 1)/(iβ)
    if (std::fabs(beta) < 1e-9) return {a, 0};
    const double c = std::cos(beta * a) - 1, s = std::sin(beta * a);
    return {s / beta, -c / beta};
  };
  const auto [ar, ai] = E(q + kap);
  const auto [br, bi] = E(kap - q);
  return {(ai - bi) / 2, -(ar - br) / 2};
}

const double RES_Q = (std::sqrt(RES_STEP) / (RES_STEP - 1)) * std::sqrt(std::numbers::sqrt2 - 1);
double bandPass(double f, double fc) { return 1 / (1 + RES_Q * RES_Q * sq(f / fc - fc / f)); }
double highPass4(double f, double fc) { const double u = std::pow(f / fc, 4); return u / (1 + u); }

static double meanResponse(const BoardModel &B);

// The plate's modes, their shapes at the bridge points and radiation to the two mics, and the
// residual path of the modes above the modal band (without the microphones' gain).
static BoardModel buildBoard(double boardH, double fmax = BOARD.fmax, int maxModes = BOARD.maxModes) {
  const double s = boardH / 9;
  const double D = BOARD.D * std::pow(s, 3), rhoh = BOARD.rhoh * s, a = BOARD.a, b = BOARD.b;
  const double cB = PI * PI * std::sqrt(D / rhoh), wMax = TAU * fmax, wTop = std::pow(RES_STEP, RES_BANDS) * wMax;
  struct M { int m, n; double w; };
  std::vector<M> all;
  for (int m = 1; cB * sq(m / a) < wTop; m++) {
    for (int n = 1;; n++) {
      const double w = cB * (sq(m / a) + sq(n / b));
      if (w >= wTop) break;
      all.push_back({m, n, w});
    }
  }
  std::stable_sort(all.begin(), all.end(), [](const M &x, const M &y) { return x.w < y.w; });
  int K = 0;
  while (K < (int)all.size() && K < maxModes && all[K].w < wMax) K++;
  const double fRes = K < (int)all.size() ? std::min(fmax, all[K].w / TAU) : fmax;
  const double N = 2 / std::sqrt(rhoh * a * b);
  BoardModel B;
  B.boardH = boardH; B.D = D; B.rhoh = rhoh; B.fmax = fmax; B.K = K; B.fRes = fRes;
  B.omega.resize(K); B.sigma.resize(K); B.phi.resize(K * SEGMENTS); B.RL.resize(K); B.RR.resize(K); B.m.resize(K); B.n.resize(K);
  std::array<double, 2> pts[SEGMENTS];
  for (int i = 0; i < SEGMENTS; i++) pts[i] = bridgePoint(i);
  const double th = (BOARD.theta * PI) / 180;
  const double mics[2] = {(200 * PI) / 180, (-20 * PI) / 180};
  auto shape = [&](int m, int n, int i) { return N * std::sin((m * PI * pts[i][0]) / a) * std::sin((n * PI * pts[i][1]) / b); };
  auto radiation = [&](int m, int n, double w, int j) {
    const double kap = (w / BOARD.c) * std::sin(th);
    const double kl = (w / BOARD.c) * BOARD.ell, shortCircuit = kl / std::hypot(1.0, kl);
    const double kx = kap * std::cos(mics[j]), ky = kap * std::sin(mics[j]);
    const auto [xr, xi] = sinFT((m * PI) / a, kx, a);
    const auto [yr, yi] = sinFT((n * PI) / b, ky, b);
    const double qr = xr * yr - xi * yi, qi = xr * yi + xi * yr, c = -(kx * a + ky * b) / 2;
    const double pr = qr * std::cos(c) - qi * std::sin(c), pi = qr * std::sin(c) + qi * std::cos(c);
    return N * std::hypot(pr, pi) * signOr1(pr + pi) * shortCircuit;
  };
  for (int k = 0; k < K; k++) {
    const M &x = all[k];
    B.omega[k] = x.w; B.sigma[k] = (BOARD.eta * x.w) / 2; B.m[k] = x.m; B.n[k] = x.n;
    for (int i = 0; i < SEGMENTS; i++) B.phi[k * SEGMENTS + i] = shape(x.m, x.n, i);
    B.RL[k] = radiation(x.m, x.n, x.w, 0); B.RR[k] = radiation(x.m, x.n, x.w, 1);
  }
  // the residual path: band centres, and gains per band, segment and mic [band][2·seg + mic]
  constexpr int NO = 2 * SEGMENTS;
  std::array<double, RES_BANDS * NO> want{};
  auto &res = B.res;
  for (int k = 0; k < RES_BANDS; k++) B.resF[k] = fRes * std::pow(RES_STEP, k + 0.5);
  for (size_t t = K; t < all.size(); t++) {
    const M &x = all[t];
    const int k = (int)std::floor(std::log(x.w / (TAU * fRes)) / std::log(RES_STEP));
    if (k < 0 || k >= RES_BANDS) continue;
    for (int i = 0; i < SEGMENTS; i++) {
      const double p = shape(x.m, x.n, i);
      for (int j = 0; j < 2; j++) { const double r = radiation(x.m, x.n, x.w, j) * p; const int o = k * NO + 2 * i + j; want[o] += r * r; res[o] += r; }
    }
  }
  std::array<double, RES_BANDS * RES_BANDS> Lk{}; // Lk[j·B + k]: mean |HP₄ · BPⱼ|² over band k
  for (int k = 0; k < RES_BANDS; k++) {
    const double f1 = fRes * std::pow(RES_STEP, k), df = (RES_STEP - 1) * f1;
    for (int t = 0; t < RES_PTS; t++) {
      const double f = f1 * std::pow(RES_STEP, (t + 0.5) / RES_PTS);
      for (int j = 0; j < RES_BANDS; j++) Lk[j * RES_BANDS + k] += sq(highPass4(f, fRes) * bandPass(f, B.resF[j])) / RES_PTS;
    }
    for (int o = k * NO; o < (k + 1) * NO; o++) { want[o] *= (TAU * B.resF[k]) / (4 * BOARD.eta * df); res[o] = signOr1(res[o]); }
  }
  // gains: Σⱼ gⱼ² Lk[j, k] = want[k] for every band k (non-negative, by projected Gauss–Seidel)
  for (int o = 0; o < NO; o++) {
    std::array<double, RES_BANDS> g2{};
    for (int it = 0; it < 200; it++) for (int k = 0; k < RES_BANDS; k++) {
      double r = want[k * NO + o];
      for (int j = 0; j < RES_BANDS; j++) if (j != k) r -= g2[j] * Lk[j * RES_BANDS + k];
      g2[k] = std::max(0.0, r / Lk[k * RES_BANDS + k]);
    }
    for (int k = 0; k < RES_BANDS; k++) res[k * NO + o] *= std::sqrt(g2[k]);
  }
  B.Ginf = 1 / (8 * std::sqrt(D * rhoh));
  B.mb = BOARD.mb; B.fBridge = 1 / (TAU * BOARD.mb * B.Ginf);
  B.f11 = all.empty() ? 0 : all[0].w / TAU;
  B.density = ((a * b) / 2) * std::sqrt(rhoh / D);
  B.fc = (sq(BOARD.c) / TAU) * std::sqrt(rhoh / D);
  return B;
}

// The microphones' gain, a recording engineer's trim set once on the 9 mm board.
BoardModel boardModel(double boardH, double fmax, int maxModes) {
  static const double ref = meanResponse(buildBoard(9));
  BoardModel B = buildBoard(boardH, fmax, maxModes);
  B.micGain = MIC_TRIM / ref;
  return B;
}

// RMS force → pressure response over a typical string spectrum (flat to 300 Hz, then ∝ 1/f).
static double meanResponse(const BoardModel &B) {
  double e = 0, nf = 0;
  for (int i = 0; i < 96; i++) { const double f = 80 * std::pow(60.0, i / 95.0), w = 1 / (1 + sq(f / 300)); e += w * sq(boardResponse(B, 1, f, 0)); nf += w; }
  return std::sqrt(e / nf);
}

// Driving-point admittance at bridge point seg, with the bridge's mass in series: {Re, Im} s/kg.
std::array<double, 2> boardMobility(const BoardModel &B, int seg, double f) {
  const double w = TAU * f;
  double re = 0, im = 0;
  if (f > B.fmax) re = B.Ginf;
  else {
    for (int k = 0; k < B.K; k++) {
      const double p2 = sq(B.phi[k * SEGMENTS + seg]), d = sq(B.omega[k]) - w * w, s2 = 2 * B.sigma[k] * w;
      const double den = d * d + s2 * s2;
      re += (p2 * w * s2) / den; im += (p2 * w * d) / den;
    }
  }
  const double yy = re * re + im * im, zr = re / yy, zi = -im / yy + w * B.mb, zz = zr * zr + zi * zi;
  return {zr / zz, -zi / zz};
}

// Pressure at microphone mic per newton of bridge force at segment seg (before micGain).
double boardResponse(const BoardModel &B, int seg, double f, int mic) {
  const double w = TAU * f;
  const std::vector<double> &R = mic ? B.RR : B.RL;
  double re = 0, im = 0;
  for (int k = 0; k < B.K; k++) {
    const double g = R[k] * B.phi[k * SEGMENTS + seg] * -w * w, d = sq(B.omega[k]) - w * w, s2 = 2 * B.sigma[k] * w, den = d * d + s2 * s2;
    re += (g * d) / den; im -= (g * s2) / den;
  }
  double r2 = 0;
  for (int k = 0; k < RES_BANDS; k++) r2 += sq(B.res[k * 2 * SEGMENTS + 2 * seg + mic] * highPass4(f, B.fRes) * bandPass(f, B.resF[k]));
  return std::sqrt(re * re + im * im + r2) / std::hypot(1.0, w * B.mb * B.Ginf);
}

// ---- one key -----------------------------------------------------------------------------------

KeyModel keyModel(int m, const ModelParams &P, const BoardModel *board, double fs) {
  KeyModel d;
  const Scale S = stringScale(m, P);
  const int ns = stringCount(m, P.stringing);
  const HammerDefaults hd = hammerDefaults(m);
  const double beta = clamp(P.strike, 0.02, 0.5), xh = beta * S.L;
  const double wH = std::min({hd.width, 2 * xh, 0.5 * S.L});
  const double fmax = std::min(P.maxFreq, 0.45 * fs);
  const double alpha = (P.tilt * PI) / 180, ca = std::cos(alpha), sa = std::sin(alpha);
  const double dk = P.detune * (0.6 + 0.8 * jitter(m));
  const std::array<double, 3> det = ns == 1 ? std::array<double, 3>{0, 0, 0} : ns == 2 ? std::array<double, 3>{-dk / 2, dk / 2, 0} : std::array<double, 3>{-dk / 2, 0, dk / 2};
  // a springy end support lengthens the string by T/K: H sits flat by T/(K_H L)
  const double hShift = -S.T / (P.kH * S.L);
  const double wound = S.wound ? 1.5 : 1;
  const double b1 = LOSS.b1 * P.loss * wound, b3 = LOSS.b3 * P.loss * wound * wound;
  const int seg = keySegment(m);
  const bool useBoard = P.mount == mount_::board && board;
  const double GH = P.hRatio * (useBoard ? board->Ginf : P.gFrame);
  const double xd = 0.16 * S.L, wd = std::min(0.025, 0.3 * S.L);
  const double nrm = std::sqrt(2 / (S.mu * S.L));

  for (int n = 1;; n++) {
    const double k = (n * PI) / S.L, w = std::sqrt((S.T * k * k + S.EI * std::pow(k, 4)) / S.mu), f = w / TAU;
    if (f >= fmax && n > 1) break;
    const double b = nrm * (n % 2 ? -1 : 1) * (S.T * k + S.EI * std::pow(k, 3));
    const double sigInt = b1 + b3 * w * w;
    double GV = P.gFrame, bridgeV;
    if (useBoard) {
      GV = boardMobility(*board, seg, f)[0];
      // strong coupling: a partial cannot drain faster than the board can lose it (Gough 1981)
      bridgeV = std::min((GV * (S.T + S.EI * k * k)) / S.L, (BOARD.eta * w) / 4);
      GV = (bridgeV * S.L) / (S.T + S.EI * k * k);
    } else bridgeV = (GV * (S.T + S.EI * k * k)) / S.L;
    const double bridgeH = (GH * (S.T + S.EI * k * k)) / S.L;
    Partial p;
    p.n = n; p.k = k; p.f = f; p.w = w; p.b = b; p.sigInt = sigInt; p.GV = GV; p.GH = GH; p.bridgeV = bridgeV; p.bridgeH = bridgeH;
    p.fH = f * (1 + hShift);
    p.phiH = nrm * std::sin(k * xh) * hannFT(k, wH);
    p.damp = 1 - (std::sin(k * wd) * std::cos(2 * k * xd)) / (k * wd); // 2⟨sin²kx⟩ over the damper felt
    p.stretch = 1200 * std::log2(f / (n * S.f0));
    d.partials.push_back(p);
  }

  const int np = (int)d.partials.size(), N = 2 * ns * np;
  d.freq.resize(N); d.sigma.resize(N); d.w.resize(N); d.c.resize(N); d.bf.resize(N); d.damp.resize(N); d.g.resize(N); d.str.resize(N); d.idx.resize(N);
  int i = 0;
  for (int pol = 0; pol < 2; pol++) {
    for (const Partial &p : d.partials) {
      for (int s = 0; s < ns; s++) {
        const double f = (pol ? p.fH : p.f) * std::pow(2.0, det[s] / 1200), w = TAU * f;
        d.freq[i] = f; d.sigma[i] = p.sigInt;
        d.w[i] = ((pol ? sa : ca) * p.phiH) / ns;
        d.c[i] = (std::sqrt(pol ? p.GH : p.GV) * p.b) / w;
        d.bf[i] = p.b; d.damp[i] = p.damp; d.g[i] = (p.k * p.k) / S.mu; d.str[i] = (uint8_t)s; d.idx[i] = (uint16_t)p.n;
        i++;
      }
    }
  }
  d.key = m; d.S = S; d.ns = ns; d.det = det; d.seg = seg; d.beta = beta; d.xh = xh; d.wH = wH; d.xd = xd;
  d.hammer = {hd.mass * P.hammerMass * ns, hd.K * P.hardness * ns, hd.p, 5e-5};
  d.hasDamper = m <= 88;
  d.kc = (STEEL.E * (S.muCore / STEEL.rho)) / (2 * S.L); // the core carries the stretch; the winding only adds mass
  d.n = N; d.nV = ns * np;
  return d;
}

DecayRates decayRates(const Partial &p, int ns) {
  const double prompt = p.sigInt + ns * p.bridgeV;
  const double after = std::min(prompt, ns > 1 ? p.sigInt : p.sigInt + p.bridgeH);
  return {prompt, after};
}

} // namespace forte::grand
