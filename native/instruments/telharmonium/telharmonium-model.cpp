// telharmonium-model.cpp — the Telharmonium's physics (telharmonium-model.h).

#include "telharmonium-model.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"
#include "forte/fdlibm.h"
#include "forte/fft.h"

namespace forte::telharmonium {

double shaftUnit(int pc, const double *keyTarget) { return keyTarget[60 + pc] / ownTeeth(60 + pc); }

Assign assign(int key, int root) {
  if (root < 0) return {key % 12, ownTeeth(key)};
  const int d = key - root;
  if (d < 4) return {-1, 0};
  const int base = ownTeeth(root) / 4; // the root's own alternator is 4·base teeth
  if (d % 12 == 4) return {root % 12, base * 5 << ((d - 4) / 12)};
  if (d % 12 == 10) return {root % 12, base * 7 << ((d - 10) / 12)};
  return {-1, 0};
}

bool built(int pc) { return pc != 1 && pc != 6 && pc != 8 && pc != 11; }

double cShaft435(int teeth) { return 435 * fdlibm::pow(2.0, (48 - 69) / 12.0) / 4 * teeth; }

double stopLevel(double k) {
  const double s = std::clamp(std::round(k), 0.0, 8.0);
  return s <= 0 ? 0 : fdlibm::pow(10.0, -3 * (8 - s) / 20);
}

double busRho(double level, double rho) { return (1 + rho) / level - 1; }

double busGain(int N, double level, double rho) {
  if (level <= 0 || N <= 0) return 0;
  return (1 + rho) / (1 + N * busRho(level, rho));
}

cplx circuit(double f, double tau) {
  const cplx s(0, TAU * f * tau);
  return s / (1.0 + s);
}

cplx lineExact(double f, const LineKind &k, double km) {
  if (km <= 0) return 1;
  if (f <= 0) return (R_SOURCE + R_LOAD) / (R_SOURCE + R_LOAD + k.R * km);
  const double w = TAU * f, l = km * 1000;
  const cplx z(k.R / 1000, w * k.L / 1000), y(0, w * k.C / 1000); // per metre
  const cplx g = std::sqrt(z * y), Z0 = std::sqrt(z / y);
  const cplx gl = g * l;
  return (R_SOURCE + R_LOAD) / ((R_SOURCE + R_LOAD) * std::cosh(gl) + (Z0 + R_SOURCE * R_LOAD / Z0) * std::sinh(gl));
}

int lineImpulse(const LineKind &k, double km, double fs, float *out, int max) {
  const int N = LINE_N;
  std::vector<cplx> X(N);
  for (int i = 0; i <= N / 2; i++) {
    const double f = i * fs / N;
    // rolled off over the top fifth of the band, so the response's ringing dies within its delay
    const double u = std::clamp((f / fs - 0.4) / 0.1, 0.0, 1.0), taper = 0.5 * (1 + std::cos(std::numbers::pi * u));
    const cplx H = lineExact(f, k, km) * std::polar(taper, -TAU * f * LINE_DELAY / fs);
    X[i] = H;
    if (i > 0 && i < N / 2) X[N - i] = std::conj(H);
  }
  X[N / 2] = X[N / 2].real();
  FFT(N).inverse(X.data());
  // the tap makes up the loss at TAP_HZ, but lifts no frequency more than LINE_LIFT over what it
  // gets with no line: a long cable's lows stay where its resistance puts them
  double most = 0;
  for (int i = 1; i <= N / 2; i++) most = std::max(most, std::abs(lineExact(i * fs / N, k, km)));
  const double norm = std::min(1 / std::abs(lineExact(TAP_HZ, k, km)), LINE_LIFT / std::max(most, 1e-30));
  double peak = 0;
  for (int i = 0; i < N; i++) peak = std::max(peak, std::fabs(X[i].real()));
  int len = N;
  while (len > LINE_DELAY + 1 && std::fabs(X[len - 1].real()) < 1e-7 * peak) len--;
  len = std::min(max, std::min(N, len + 64));
  for (int i = 0; i < len; i++) {
    const double fade = i < len - 64 ? 1 : 0.5 * (1 + std::cos(std::numbers::pi * (i - (len - 64)) / 64.0));
    out[i] = (float)(X[i].real() * norm * fade);
  }
  return len;
}

double plateF01(double a, double h) {
  const double D = IRON_E * h * h * h / (12 * (1 - IRON_NU * IRON_NU));
  return PLATE_L2 / (TAU * a * a) * std::sqrt(D / (IRON_RHO * h));
}

double voicing(double f, double v) {
  if (v <= 0) return 1;
  const double w = TAU * std::max(f, 1.0) * MOUTH * VOICED_HORN / C_AIR; // ka at the mouth of a six-foot horn
  const double r = DIAPHRAGM_Q * std::sqrt(1 + 1 / (w * w)) / std::abs(receiverResponse(std::max(f, 1.0), receiverF0(0)));
  return std::min(VOICING_MAX, fdlibm::pow(r, v));
}

double receiverF0(int receiver) {
  return receiver == 1 ? plateF01(DIAPHRAGM_A * std::sqrt(10.0), 3 * DIAPHRAGM_H) : plateF01(DIAPHRAGM_A, DIAPHRAGM_H);
}

cplx receiverResponse(double f, double f0) {
  const double w = TAU * f, w0 = TAU * f0;
  return cplx(0, w / w0) * (w0 * w0) / cplx(w0 * w0 - w * w, w * w0 / DIAPHRAGM_Q);
}

// The waveguide the engine plays, in continuous time: a delay T = L/c each way, the mouth's
// reflection −1/(1 + iω/ω_m) (ω_m = c/a, the mouth radius a), the throat's HORN_THROAT; what leaves
// the mouth is the arriving wave times (1 + R_m). The bare receiver radiates its acceleration.
cplx hornResponse(double f, double L) {
  const double w = TAU * f;
  if (L <= 0) return cplx(0, w / (TAU * 1000));
  const double T = L / C_AIR, wm = C_AIR / (MOUTH * L);
  const cplx Rm = -1.0 / cplx(1, w / wm), d = std::exp(cplx(0, -w * T));
  return (1.0 + Rm) * d / (1.0 - HORN_THROAT * Rm * d * d);
}

void expm(const double *A, int d, double *out, double *work) {
  double norm = 0;
  for (int i = 0; i < d; i++) { double s = 0; for (int j = 0; j < d; j++) s += std::fabs(A[i * d + j]); norm = std::max(norm, s); }
  int sq = 0;
  while (norm > 0.25 && sq < 60) { norm /= 2; sq++; }
  const double scale = std::ldexp(1.0, -sq);
  double *X = work, *T = work + d * d, *tmp = work + 2 * d * d, *E = out;
  for (int i = 0; i < d * d; i++) { X[i] = A[i] * scale; T[i] = (i % (d + 1) == 0); E[i] = T[i]; }
  for (int k = 1; k <= 14; k++) { // T ← T X / k, E += T
    for (int i = 0; i < d; i++)
      for (int j = 0; j < d; j++) { double s = 0; for (int m = 0; m < d; m++) s += T[i * d + m] * X[m * d + j]; tmp[i * d + j] = s / k; }
    std::copy(tmp, tmp + d * d, T);
    for (int i = 0; i < d * d; i++) E[i] += T[i];
  }
  for (int s = 0; s < sq; s++) {
    for (int i = 0; i < d; i++)
      for (int j = 0; j < d; j++) { double v = 0; for (int m = 0; m < d; m++) v += E[i * d + m] * E[m * d + j]; tmp[i * d + j] = v; }
    std::copy(tmp, tmp + d * d, E);
  }
}

} // namespace forte::telharmonium
