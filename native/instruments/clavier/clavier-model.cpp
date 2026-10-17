// clavier-model.cpp — the tangent clavier's physics, as clavier-model.js computes it.

#include "clavier-model.h"

#include <algorithm>
#include <memory>

#include "forte/linalg.h"

namespace forte::clavier {

static double interpLog(int key, const double (*pts)[2], int n) {
  for (int i = 1; i < n; i++) if (key <= pts[i][0] || i == n - 1) {
    const double x0 = pts[i - 1][0], y0 = pts[i - 1][1], x1 = pts[i][0], y1 = pts[i][1];
    const double t = std::min(1.0, std::max(0.0, (key - x0) / (x1 - x0)));
    return std::exp(std::log(y0) + t * (std::log(y1) - std::log(y0)));
  }
  return pts[n - 1][1];
}

// Linear density of a string with a round-wire winding of diameter w on a core d.
static double windMu(double d, double D) {
  const double w = (D - d) / 2;
  return (STEEL.rho * PI * d * d) / 4 + (WIND_RHO * PI * PI * w * (d + w)) / 4;
}

Gauge gauge(int key) {
  if (!isWound(key)) { const double d = key >= 56 ? 0.2286e-3 : 0.2794e-3; return {false, d, d, (STEEL.rho * PI * d * d) / 4}; }
  const double D = key <= 38 ? 0.813e-3 : key <= 43 ? 0.711e-3 : 0.559e-3;
  static const double pts[3][2] = {{29, 5e-4}, {34, 2e-4}, {51, 9.5e-5}};
  const double L = speakingLength(key), f = keyFreq(key), Bt = interpLog(key, pts, 3);
  const auto B = [&](double d) { return (std::pow(PI, 3) * STEEL.E * std::pow(d, 4)) / (64 * windMu(d, D) * std::pow(2 * L * f, 2) * L * L); };
  double lo = 0.1 * D, hi = 0.98 * D;
  for (int i = 0; i < 60; i++) { const double m = (lo + hi) / 2; if (B(m) < Bt) lo = m; else hi = m; }
  const double d = (lo + hi) / 2;
  return {true, d, D, windMu(d, D)};
}

double tipK(const double *P) { return TUNE_FORCE / std::pow(P[p::tip] * 1e-3, 1.5); }
double tipDepth(double F, const double *P) { return std::pow(std::max(0.0, F) / tipK(P), 2.0 / 3); }
double wrapLength(double F, const double *P) { return std::pow(tipDepth(F, P), 2) / (2 * P[p::wrap] * 1e-3); }

StringDesign stringDesign(int key, const double *P) {
  StringDesign S{};
  const double f0 = keyFreq(key), L = speakingLength(key), Ln = NONSPEAK * L;
  const Gauge g = gauge(key);
  const double A = (PI * g.d * g.d) / 4, EA = STEEL.E * A, EI = P[p::stiff] * STEEL.E * (PI * std::pow(g.d, 4)) / 64;
  // tuned held down at TUNE_FORCE: f1 = (1/2L)·√(T/μ)·√(1 + π²EI/TL²) exactly for a pinned stiff string
  const double T = g.mu * std::pow(2 * L * f0, 2) - (std::pow(PI, 2) * EI) / (L * L);
  const double gap = P[p::gap] * 1e-3;
  const double dLnom = (gap * gap) / (2 * L) + wrapLength(TUNE_FORCE, P);
  const double dTnom = (EA * dLnom) / L, T0 = T - dTnom; // T0: the straight string at rest
  S.key = key; S.f0 = f0; S.L = L; S.Ln = Ln;
  S.wound = g.wound; S.d = g.d; S.D = g.D; S.mu = g.mu;
  S.A = A; S.EA = EA; S.EI = EI; S.T = T; S.T0 = T0; S.dTnom = dTnom; S.dLnom = dLnom; S.gap = gap;
  S.B = (std::pow(PI, 2) * EI) / (T * L * L);
  S.stress = T / A; S.c = std::sqrt(T / g.mu);
  S.mag = std::pow(g.d / 0.2286e-3, 2);   // steel cross-section under the pickup, re a 0.009″ wire
  S.pull = T * gap * (1 / L + 1 / Ln);    // force the string exerts to lift off the anvil
  S.fRelease = f0 * L / (L + Ln);         // ideal full-length pitch after release
  return S;
}

double speakingFreq(int n, const StringDesign &S) { return n * S.f0 * std::sqrt((1 + S.B * n * n) / (1 + S.B)); }
double sigma1(double f0, const double *P) { return (std::log(1000.0) / P[p::t60]) * std::pow(f0 / 110, 0.6); }
double modeSigma(double f, double f0, const double *P) {
  return sigma1(f0, P) + P[p::hf] * std::max(0.0, std::pow(f / 1000, 2) - std::pow(f0 / 1000, 2));
}

double tensionCents(const StringDesign &S, double dT) {
  const double r = (S.T + dT + (std::pow(PI, 2) * S.EI) / (S.L * S.L)) / (S.T + (std::pow(PI, 2) * S.EI) / (S.L * S.L));
  return 600 * std::log2(r);
}
double pressureTension(const StringDesign &S, double F, const double *P) { return (S.EA * (wrapLength(F, P) - wrapLength(TUNE_FORCE, P))) / S.L; }
double pressureCents(int key, double F, const double *P) { const StringDesign S = stringDesign(key, P); return tensionCents(S, pressureTension(S, F, P)); }
double duffingShift(const StringDesign &S, int n, double A) { const double k = (n * PI) / S.L; return (3 * S.EA * k * k * A * A) / (32 * S.T); }

PickupX pickupX(int key, const double *P) {
  const double L = speakingLength(key);
  const auto lim = [L](double x) { return std::min(0.95 * L, std::max(0.003, x)); };
  return {lim((P[p::xLower] + (60 - key) * 0.1525) * 1e-2), lim((P[p::xUpper] + (60 - key) * 0.0254) * 1e-2)};
}
std::pair<double, double> pickupMix(int sel) {
  switch (sel) {
    case pickup_::lower: return {1, 0};
    case pickup_::upper: return {0, 1};
    case pickup_::diff: return {1, -1};
    default: return {1, 1};
  }
}
double pickupWeight(int n, double x, double L) {
  const double u = (n * PI * POLE_WIDTH) / (2 * L);
  return std::sin((n * PI * x) / L) * (u > 1e-9 ? std::sin(u) / u : 1);
}

// soft R‖C 30 kΩ‖0.1 µF, medium 10 kΩ‖15 nF, treble 2 H‖4.7 nF, brilliant 0.6 H (Gabrielli et al. 2013)
struct ToneNet { int param; double C, G, Gam; };
static const ToneNet TONE_NET[] = {
  {p::soft, 0.1e-6, 1 / 30e3, 0},
  {p::medium, 15e-9, 1 / 10e3, 0},
  {p::treble, 4.7e-9, 0, 1.0 / 2},
  {p::brilliant, 0, 0, 1 / 0.6},
};
ToneAnalog toneAnalog(const double *P) {
  double C = 0, G = 0, Gam = 0;
  bool any = false;
  for (const ToneNet &t : TONE_NET) if (P[t.param] != 0) { C += t.C; G += t.G; Gam += t.Gam; any = true; }
  return {any, PICKUP_R * C, 1 + PICKUP_R * G, PICKUP_R * Gam};
}
double toneResponse(double f, const double *P) {
  const ToneAnalog t = toneAnalog(P);
  if (!t.any) return 0;
  const double w = 2 * PI * f, re = t.a0 - t.a2 * w * w, im = t.a1 * w;
  return w / std::hypot(re, im);
}
// Bilinear transform, prewarped at 1 kHz.
ToneBiquad toneBiquad(const double *P, double fs) {
  const ToneAnalog t = toneAnalog(P);
  if (!t.any) return {0, 0, 0, 0, 0};
  const double w0 = 2 * PI * 1000, K = w0 / std::tan(w0 / (2 * fs));
  const double A0 = t.a2 * K * K + t.a1 * K + t.a0, A1 = 2 * t.a0 - 2 * t.a2 * K * K, A2 = t.a2 * K * K - t.a1 * K + t.a0;
  return {K / A0, 0, -K / A0, A1 / A0, A2 / A0};
}

Osc osc(double f, double sigma, double fs) {
  const double k = 1 / fs, w0 = 2 * PI * f;
  if (sigma < w0) {
    const double wd = std::sqrt(w0 * w0 - sigma * sigma), r = std::exp(-sigma * k);
    return {2 * r * std::cos(wd * k), r * r, (k * r * std::sin(wd * k)) / wd};
  }
  const double sq = std::sqrt(sigma * sigma - w0 * w0), l1 = -sigma + sq, l2 = -sigma - sq, e1 = std::exp(l1 * k), e2 = std::exp(l2 * k);
  return {e1 + e2, std::exp(-2 * sigma * k), sq > 1e-9 ? (k * (e1 - e2)) / (l1 - l2) : k * k * std::exp(-sigma * k)};
}

void keyModel(int key, const double *P, double fs, KeyModel &out) {
  const StringDesign S = stringDesign(key, P);
  const double L = S.L, Ln = S.Ln, mu = S.mu;
  out.S = S;
  // speaking modes: pinned at the tailpiece and at the anvil, tension T
  int N = 0;
  for (int n = 1; n <= N_MAX; n++) {
    const double f = speakingFreq(n, S);
    if (f > F_MAX && n > 1) break;
    const double kn = (n * PI) / L, sig = modeSigma(f, S.f0, P);
    const Osc o = osc(f, sig, fs);
    out.modes[N++] = {n, f, sig, o.a1, o.a2, o.b, kn};
  }
  out.nModes = N;
  // yarn modes: quarter-wave, free at the anvil, pinned at the tuning pin, tension T0. Truncation
  // stiffens the yarn's static spring (Σ1/(m−½)² < π²/2); softening all its modes by that ratio
  // restores the exact static stiffness T0/Ln.
  int M = 0;
  for (int m = 1; m <= M_MAX; m++) {
    const double km = ((m - 0.5) * PI) / Ln, f = std::sqrt((S.T0 * km * km + S.EI * std::pow(km, 4)) / mu) / (2 * PI);
    if (f > F_MAX && m > 1) break;
    out.yarn[M++] = {m, km, f, 0, 0, 0, 0};
  }
  out.nYarn = M;
  double sum = 0;
  for (int j = 0; j < M; j++) sum += 1 / std::pow(out.yarn[j].m - 0.5, 2);
  const double soften = std::sqrt(sum / (PI * PI / 2));
  for (int j = 0; j < M; j++) {
    YarnMode &y = out.yarn[j];
    y.f *= soften;
    y.sigma = P[p::yarn] + modeSigma(y.f, S.f0, P);
    const Osc o = osc(y.f, y.sigma, fs);
    y.a1 = o.a1; y.a2 = o.a2; y.b = o.b;
  }
  out.X = pickupX(key, P);
}

int releasedFreqs(int key, const double *P, int count, double *out) {
  const auto mdl = std::make_unique<KeyModel>(); // (off WebAssembly's small stack)
  KeyModel &km = *mdl;
  keyModel(key, P, 48000, km);
  const StringDesign &S = km.S;
  const double L = S.L, Ln = S.Ln, mu = S.mu, T0 = S.T0;
  // DOFs: s, q_1..q_N, r_1..r_M with s = Σ r: eliminate s → DOFs (q, r)
  const int N = km.nModes, M = km.nYarn, n = N + M;
  Matrix Mm = Matrix::Zero(n, n), K = Matrix::Zero(n, n);
  const double ms = (mu * L) / 3, nu = (mu * Ln) / 2;
  for (int i = 0; i < N; i++) {
    const double c = (mu * L * (i % 2 ? -1 : 1)) / ((i + 1) * PI);
    const double kn = km.modes[i].kn;
    Mm(i, i) = (mu * L) / 2; K(i, i) = (L / 2) * (T0 * kn * kn + S.EI * std::pow(kn, 4));
    for (int j = 0; j < M; j++) { Mm(i, N + j) += c; Mm(N + j, i) += c; }
  }
  for (int a = 0; a < M; a++) for (int b = 0; b < M; b++) {
    Mm(N + a, N + b) += ms + (a == b ? nu : 0);
    K(N + a, N + b) += T0 / L + (a == b ? nu * std::pow(2 * PI * km.yarn[a].f, 2) : 0);
  }
  const auto eig = genEig(K, Mm);
  if (!eig) return 0;
  const int m = std::min(count, n);
  for (int i = 0; i < m; i++) out[i] = std::sqrt(eig->lambda[i]) / (2 * PI);
  return m;
}

} // namespace forte::clavier
