// tines-model.cpp — the tine piano key's mechanics, as tines/src/tine.js computes them.

#include "tines-model.h"

#include <algorithm>
#include <cmath>
#include <cstring>

#include "forte/linalg.h"

namespace forte::tines {

static double clamp(double x, double a, double b) { return std::min(b, std::max(a, x)); }
static double tKey(int m) { return clamp((double)(m - KEY_LO) / (KEY_HI - KEY_LO), 0, 1); }

double keyFreq(int m) { return 440 * std::pow(2.0, (m - 69) / 12.0); }

std::string noteName(int m) {
  static const char *const NAMES[12] = {"C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"};
  return std::string(NAMES[m % 12]) + std::to_string(m / 12 - 1);
}

// Hermite cubic shape functions on an element of length l at ξ ∈ [0,1].
static std::array<double, 4> hermite(double xi, double l) {
  return {1 - 3 * xi * xi + 2 * std::pow(xi, 3), l * (xi - 2 * xi * xi + std::pow(xi, 3)), 3 * xi * xi - 2 * std::pow(xi, 3),
          l * (-xi * xi + std::pow(xi, 3))};
}

Cantilever cantilever(double L, double d, double ms, double s, int nel, int nModes) {
  const double E = STEEL.E, rho = STEEL.rho;
  const double A = (PI * d * d) / 4, I = (PI * std::pow(d, 4)) / 64, EI = E * I, mu = rho * A;
  const double l = L / nel;
  const int NF = 2 * (nel + 1);
  std::vector<double> Kf((size_t)NF * NF, 0.0), Mf((size_t)NF * NF, 0.0);
  const double ke[4][4] = {{12, 6 * l, -12, 6 * l}, {6 * l, 4 * l * l, -6 * l, 2 * l * l}, {-12, -6 * l, 12, -6 * l}, {6 * l, 2 * l * l, -6 * l, 4 * l * l}};
  const double me[4][4] = {{156, 22 * l, 54, -13 * l}, {22 * l, 4 * l * l, 13 * l, -3 * l * l}, {54, 13 * l, 156, -22 * l}, {-13 * l, -3 * l * l, -22 * l, 4 * l * l}};
  const double kc = EI / std::pow(l, 3), mc = (mu * l) / 420;
  for (int e = 0; e < nel; e++) {
    const int dof[4] = {2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3};
    for (int a = 0; a < 4; a++) for (int b = 0; b < 4; b++) {
      Kf[dof[a] * NF + dof[b]] += kc * ke[a][b];
      Mf[dof[a] * NF + dof[b]] += mc * me[a][b];
    }
  }
  if (ms > 0) {
    const int e = std::min(nel - 1, (int)std::floor(s / l));
    const double xi = s / l - e;
    const auto Nv = hermite(xi, l);
    const int dof[4] = {2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3};
    for (int a = 0; a < 4; a++) for (int b = 0; b < 4; b++) Mf[dof[a] * NF + dof[b]] += ms * Nv[a] * Nv[b];
  }
  // rigid translation of the whole tine (incl. the clamped node)
  std::vector<double> g(NF, 0.0);
  for (int i = 0; i < NF; i++) for (int j = 0; j < NF; j += 2) g[i] += Mf[i * NF + j];
  double mt = 0;
  for (int i = 0; i < NF; i += 2) mt += g[i];
  // clamp node 0
  const int N = NF - 2;
  Matrix K(N, N), M(N, N);
  for (int i = 0; i < N; i++) for (int j = 0; j < N; j++) { K(i, j) = Kf[(i + 2) * NF + j + 2]; M(i, j) = Mf[(i + 2) * NF + j + 2]; }
  const int nv = std::min(nModes, N);
  Cantilever c;
  c.L = L; c.d = d; c.mu = mu; c.EI = EI; c.mt = mt; c.ms = ms; c.s = s; c.nel = nel; c.N = N; c.nModes = nv;
  const auto eig = genEig(K, M);
  if (!eig) { c.nModes = 0; return c; }
  c.X.assign((size_t)N * nv, 0.0);
  for (int n = 0; n < nv; n++) {
    c.omega.push_back(std::sqrt(eig->lambda[n]));
    for (int i = 0; i < N; i++) c.X[i * nv + n] = eig->X(i, n);
    double G = 0;
    for (int i = 0; i < N; i++) G += c.X[i * nv + n] * g[i + 2];
    // sign: tip displacement positive
    const double tip = c.X[(N - 2) * nv + n];
    if (tip < 0) { for (int i = 0; i < N; i++) c.X[i * nv + n] *= -1; G = -G; }
    c.Gamma.push_back(G);
  }
  return c;
}

double Cantilever::shape(int n, double x) const {
  const double l = L / nel, xx = clamp(x, 0, L);
  const int e = std::min(nel - 1, (int)std::floor(xx / l));
  const double xi = xx / l - e;
  const auto Nv = hermite(xi, l);
  auto dofVal = [&](int gd) { return gd < 2 ? 0.0 : X[(gd - 2) * nModes + n]; };
  return Nv[0] * dofVal(2 * e) + Nv[1] * dofVal(2 * e + 1) + Nv[2] * dofVal(2 * e + 2) + Nv[3] * dofVal(2 * e + 3);
}

Pickup pickupFor(int m, const double *P) {
  const double gap = P[p::gap] * 1e-3 * (1 - 0.35 * tKey(m));
  const double wid = std::sqrt(gap * gap + std::pow(P[p::poleRadius] * 1e-3, 2));
  const double gain = std::pow(10.0, (P[p::voicing] * std::log2(keyFreq(m) / 261.63)) / 20);
  return {gap, wid, P[p::offset] * wid, gain};
}

HammerTip hammerDefaults(int m) {
  const double t = tKey(m);
  return {10e-3 * (1 - t) + 4e-3 * t, std::exp(std::log(8e6) * (1 - t) + std::log(1.2e8) * t), 2.0};
}

KeyModel computeKey(int m, const double *P, double fs) {
  KeyModel km;
  const double f0 = keyFreq(m), om0 = 2 * PI * f0;
  const double d = P[p::tineDiameter] * 1e-3;
  const double mu = STEEL.rho * PI * d * d / 4;
  // geometry is self-similar in L (spring mass ∝ tine mass, position ∝ L), so f₁ ∝ 1/L²: solve
  // once at 10 cm, then scale the length to tune the key
  const double Lr = 0.1;
  const Cantilever ref = cantilever(Lr, d, P[p::springMass] * mu * Lr, P[p::springPos] * Lr, 16, 1);
  if (ref.nModes < 1) return km;
  const double L = Lr * std::sqrt(ref.omega[0] / om0);
  const double fmax = std::min(18000.0, 0.45 * 2 * fs);
  Cantilever tine = cantilever(L, d, P[p::springMass] * mu * L, P[p::springPos] * L, 24, MAX_TINE_MODES);
  if (tine.nModes < 1) return km;
  int nq = 0;
  while (nq < tine.nModes && tine.omega[nq] / (2 * PI) < fmax) nq++;
  nq = std::max(1, nq);

  // tone bar, block, mount
  const double Mb = std::max(1e-6, P[p::barMass] * tine.mt);
  const double omB = om0 * std::pow(2.0, P[p::barTune] / 1200);
  const double Gb = std::sqrt(0.613 * Mb); // uniform cantilever, mode 1
  // mounting block + effective harp mass on a rubber grommet; the grommet's resonance is set per
  // register, as a fraction of the note frequency
  const double M0 = P[p::blockMass] * tine.mt;
  const double K0 = M0 * std::pow(P[p::mountRatio] * om0, 2);
  const double c0 = 2 * P[p::mountDamp] * std::sqrt(K0 * M0);

  const int n = nq + 2, iu = 0, ip = nq + 1;
  Matrix Mm = Matrix::Zero(n, n), Km = Matrix::Zero(n, n);
  Mm(0, 0) = tine.mt + Mb + M0;
  for (int j = 0; j < nq; j++) {
    Mm(iu, 1 + j) = Mm(1 + j, iu) = tine.Gamma[j];
    Mm(1 + j, 1 + j) = 1;
    Km(1 + j, 1 + j) = std::pow(tine.omega[j], 2);
  }
  Mm(iu, ip) = Mm(ip, iu) = Gb;
  Mm(ip, ip) = 1;
  Km(0, 0) = K0;
  Km(ip, ip) = omB * omB;
  const auto eig = genEig(Km, Mm);
  if (!eig) return km;
  const Vector &lambda = eig->lambda;
  const Matrix &X = eig->X;

  // damping (diagonal in the uncoupled coordinates) projected onto coupled modes
  const double b1 = 0.25 * P[p::tineLoss], b3 = 4e-8 * P[p::hfLoss];
  std::vector<double> cDiag(n, 0.0);
  cDiag[0] = c0;
  for (int j = 0; j < nq; j++) cDiag[1 + j] = 2 * (b1 + b3 * std::pow(tine.omega[j], 2));
  cDiag[ip] = 2 * 0.12 * P[p::barLoss];

  const double xh = clamp(P[p::strike] * 1e-3, 0.02 * L, 0.6 * L);
  const double xd = 0.6 * L; // damper felt
  std::vector<double> phiH, phiTip, phiD;
  for (int j = 0; j < nq; j++) { phiH.push_back(tine.shape(j, xh)); phiTip.push_back(tine.shape(j, L)); phiD.push_back(tine.shape(j, xd)); }

  std::vector<Mode> modes;
  for (int k = 0; k < n; k++) {
    const double om = std::sqrt(std::max(lambda[k], 0.0));
    auto col = [&](int i) { return X(i, k); };
    double sig = 0, w = col(iu), pk = col(iu), wd = col(iu), tineE = 0;
    for (int i = 0; i < n; i++) sig += 0.5 * cDiag[i] * std::pow(col(i), 2);
    for (int j = 0; j < nq; j++) {
      w += phiH[j] * col(1 + j);
      pk += phiTip[j] * col(1 + j);
      wd += phiD[j] * col(1 + j);
      tineE += std::pow(col(1 + j), 2);
    }
    // rough energy split (ignores the inertial cross terms)
    const double barE = std::pow(col(ip), 2), blockE = Mm(0, 0) * std::pow(col(iu), 2), tot = tineE + barE + blockE;
    modes.push_back({k, om / (2 * PI), sig, w, pk, std::pow(wd / phiD[0], 2), tineE / tot, barE / tot, blockE / tot});
  }
  // keep audible modes
  for (const Mode &md : modes) if (md.f < 0.45 * 2 * fs && md.f > 5) km.modes.push_back(md);

  const HammerTip hd = hammerDefaults(m);
  const Pickup pu = pickupFor(m, P);
  km.ok = true;
  km.key = m;
  Info &info = km.info;
  info.key = m; info.f0 = f0; info.L = L; info.d = d; info.mt = tine.mt; info.ms = tine.ms; info.s = tine.s; info.xh = xh;
  for (int j = 0; j < nq; j++) info.tineRatios.push_back(tine.omega[j] / tine.omega[0]);
  info.f1tine = tine.omega[0] / (2 * PI); info.Mb = Mb; info.M0 = M0; info.fBar = omB / (2 * PI); info.gap = pu.gap; info.wid = pu.wid;
  km.nq = nq; km.xh = xh;
  km.n = n; km.iu = iu; km.ip = ip;
  km.X.resize((size_t)n * n);
  for (int i = 0; i < n; i++) for (int c = 0; c < n; c++) km.X[i * n + c] = X(i, c);
  km.tine = std::move(tine);

  VoiceData &v = km.voice;
  v.key = m; v.n = (int)km.modes.size();
  for (int i = 0; i < v.n; i++) {
    const Mode &md = km.modes[i];
    v.freq[i] = md.f; v.sigma[i] = md.sigma; v.dampW[i] = md.dampW; v.w[i] = md.w; v.pk[i] = md.pk;
  }
  v.hammer = {hd.mass * P[p::hammerMass], hd.K * P[p::hardness], hd.p + P[p::tipExp], P[p::hysteresis]};
  v.pickup = pu;
  v.hasDamper = m <= 94;
  return km;
}

bool isModelParam(int i) {
  switch (i) {
    case p::tineDiameter: case p::springMass: case p::springPos: case p::strike:
    case p::barMass: case p::barTune: case p::blockMass: case p::mountRatio: case p::mountDamp:
    case p::hardness: case p::tipExp: case p::hammerMass: case p::hysteresis:
    case p::tineLoss: case p::hfLoss: case p::barLoss: return true;
    default: return false;
  }
}

// FNV-1a over the values' bits (−0 as 0), kept below 2⁵² so a double carries it exactly.
uint64_t modelVersion(const double *P, double fs) {
  uint64_t h = 1469598103934665603ull;
  auto add = [&](double v) {
    v += 0.0;
    uint64_t b;
    std::memcpy(&b, &v, 8);
    for (int k = 0; k < 8; k++) { h ^= (b >> (8 * k)) & 0xff; h *= 1099511628211ull; }
  };
  add(fs);
  for (int i = 0; i < p::count; i++) if (isModelParam(i)) add(P[i]);
  return (h & ((1ull << 52) - 1)) | 1; // never 0
}

int packVoiceData(const VoiceData &d, double *out) {
  const double head[PACK_HEAD] = {(double)d.version, (double)d.key, (double)d.n, d.hammer.mass, d.hammer.K, d.hammer.p, d.hammer.alpha,
                                  d.pickup.gap, d.pickup.wid, d.pickup.yoff, d.pickup.gain, d.hasDamper ? 1.0 : 0.0, 0};
  std::memcpy(out, head, sizeof head);
  double *o = out + PACK_HEAD;
  const int n = d.n;
  for (const std::array<double, MAX_MODES> *a : {&d.freq, &d.sigma, &d.dampW, &d.w, &d.pk}) { std::copy_n(a->begin(), n, o); o += n; }
  return PACK_HEAD + 5 * n;
}

bool unpackVoiceData(const double *in, int count, VoiceData &d) {
  if (count < PACK_HEAD) return false;
  const int n = (int)in[2];
  if (n < 0 || n > MAX_MODES || count < PACK_HEAD + 5 * n) return false;
  d = VoiceData{};
  d.version = (uint64_t)in[0]; d.key = (int)in[1]; d.n = n;
  d.hammer = {in[3], in[4], in[5], in[6]};
  d.pickup = {in[7], in[8], in[9], in[10]};
  d.hasDamper = in[11] != 0;
  const double *o = in + PACK_HEAD;
  for (std::array<double, MAX_MODES> *a : {&d.freq, &d.sigma, &d.dampW, &d.w, &d.pk}) { std::copy_n(o, n, a->begin()); o += n; }
  return true;
}

double flux(double Y, double w) { return std::pow(1 + std::pow(Y / w, 2), -1.5); }

} // namespace forte::tines
