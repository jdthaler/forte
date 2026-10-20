// pianet-model.cpp — the reed, the bond, the pickups and the mechanism of one key (pianet-model.h).

#include "pianet-model.h"

#include <algorithm>

#include "forte/fdlibm.h"
#include "forte/linalg.h"

namespace forte::pianet {

using fdlibm::pow;
constexpr double TWO_PI = 2 * PI;

// ---- the reed ----------------------------------------------------------------------------------

// Hermite cubic shape functions (and their x-derivatives) on an element of length l.
static std::array<double, 4> hermite(double xi, double l) {
  return {1 - 3 * xi * xi + 2 * pow(xi, 3), l * (xi - 2 * xi * xi + pow(xi, 3)), 3 * xi * xi - 2 * pow(xi, 3), l * (-xi * xi + pow(xi, 3))};
}
static std::array<double, 4> hermiteD(double xi, double l) {
  return {(-6 * xi + 6 * xi * xi) / l, 1 - 4 * xi + 3 * xi * xi, (6 * xi - 6 * xi * xi) / l, -2 * xi + 3 * xi * xi};
}

double UnitReed::shape(int n, double x) const {
  const double l = 1.0 / NEL, xx = std::min(1.0, std::max(0.0, x));
  const int e = std::min(NEL - 1, (int)std::floor(xx / l));
  const double xi = xx / l - e;
  const auto Nv = hermite(xi, l);
  const auto d = [&](int g) { return dof[g * UNIT_MODES + n]; };
  return Nv[0] * d(2 * e) + Nv[1] * d(2 * e + 1) + Nv[2] * d(2 * e + 2) + Nv[3] * d(2 * e + 3);
}

UnitReed unitReed(double r, double s, double j, int nModes) {
  const int nel = NEL, NF = NDOF;
  const double l = 1.0 / nel;
  Matrix Kf = Matrix::Zero(NF, NF), Mf = Matrix::Zero(NF, NF);
  const double ke[4][4] = {{12, 6 * l, -12, 6 * l}, {6 * l, 4 * l * l, -6 * l, 2 * l * l}, {-12, -6 * l, 12, -6 * l}, {6 * l, 2 * l * l, -6 * l, 4 * l * l}};
  const double me[4][4] = {{156, 22 * l, 54, -13 * l}, {22 * l, 4 * l * l, 13 * l, -3 * l * l}, {54, 13 * l, 156, -22 * l}, {-13 * l, -3 * l * l, -22 * l, 4 * l * l}};
  const double kc = 1 / pow(l, 3), mc = l / 420;
  for (int e = 0; e < nel; e++)
    for (int a = 0; a < 4; a++) for (int b = 0; b < 4; b++) {
      Kf(2 * e + a, 2 * e + b) += kc * ke[a][b];
      Mf(2 * e + a, 2 * e + b) += mc * me[a][b];
    }
  if (r > 0 || j > 0) { // solder: M N(s)ᵀN(s) + J N'(s)ᵀN'(s)
    const int e = std::min(nel - 1, (int)std::floor(s / l));
    const double xi = s / l - e;
    const auto Nv = hermite(xi, l), Nd = hermiteD(xi, l);
    for (int a = 0; a < 4; a++) for (int b = 0; b < 4; b++) Mf(2 * e + a, 2 * e + b) += r * Nv[a] * Nv[b] + j * Nd[a] * Nd[b];
  }
  const int N = NF - 2; // clamp node 0
  const Matrix K = Kf.bottomRightCorner(N, N), M = Mf.bottomRightCorner(N, N);
  UnitReed u;
  const auto eig = genEig(K, M);
  if (!eig) return u;
  const int nv = std::min({nModes, N, UNIT_MODES});
  u.nModes = nv;
  for (int n = 0; n < nv; n++) {
    u.Lam[n] = std::sqrt(eig->lambda[n]);
    const double sg = eig->X(N - 2, n) < 0 ? -1 : 1;
    for (int i = 0; i < N; i++) u.dof[(i + 2) * UNIT_MODES + n] = sg * eig->X(i, n);
  }
  return u;
}

std::vector<double> tipMassRoots(double R, int count) {
  const auto g = [R](double b) { return 1 + fdlibm::cos(b) * std::cosh(b) + R * b * (fdlibm::cos(b) * std::sinh(b) - fdlibm::sin(b) * std::cosh(b)); };
  const auto sign = [](double x) { return x > 0 ? 1 : x < 0 ? -1 : 0; };
  std::vector<double> roots;
  double g0 = g(0.05);
  for (double b = 0.06; (int)roots.size() < count && b < 60; b += 0.01) {
    const double g1 = g(b);
    if (sign(g1) != sign(g0)) {
      double lo = b - 0.01, hi = b;
      for (int it = 0; it < 80; it++) { const double mid = 0.5 * (lo + hi); if (sign(g(mid)) == sign(g(lo))) lo = mid; else hi = mid; }
      roots.push_back(0.5 * (lo + hi));
    }
    g0 = g1;
  }
  return roots;
}

// ---- the model ---------------------------------------------------------------------------------

double tedDelta() { static const double d = (2.0e11 * pow(1.2e-5, 2) * 293) / 3.6e6; return d; }
double keyFreq(double m) { return 440 * pow(2, (m - 69) / 12); }
double keySpeed(double vel) { return 0.03 * pow(40.0 / 3, std::min(1.0, std::max(0.0, vel))); }
double pullOffStatic(double a, double F0) { return F0 * pow(a / PAD.a0, 1.5); }
double workOfAdhesion(double F0) { return (F0 * F0) / (8 * PI * pow(PAD.a0, 3) * PAD.Estar); }
double crackSpeed(double F, double a, double F0, double n) {
  const double g = pow(F / pullOffStatic(a, F0), 2); // G / G₀
  return g > 1 ? PAD.v0 * pow(g - 1, 1 / n) : 0;
}
double pullOff(double R, double F0, double n, double dt) {
  double a = PAD.a0, t = 0;
  for (;;) {
    t += dt;
    a -= crackSpeed(R * t, a, F0, n) * dt;
    if (a <= PAD.aMin * PAD.a0) return R * t;
    if (t > 1e4) return INFINITY;
  }
}
double pullOffFast(double R, double F0, double n) { return F0 * pow((((2 + n) / (3 + n)) * PAD.a0 * R) / (PAD.v0 * F0), n / (2 + n)); }

double reedSigma(double f, double h, double eta) {
  const double fT = (PI * TED_DTH) / (2 * h * h), u = f / fT;
  return AIR_SIGMA + PI * f * (eta + (tedDelta() * u) / (1 + u * u));
}

KeyReed keyReed(int m, double tipMass, double loss, double fs, double ratio) {
  const double E = STEEL.E, rho = STEEL.rho, t = std::min(1.0, std::max(0.0, (double)(m - KEY_LO) / (KEY_HI - KEY_LO)));
  // the key's pitch in the keyboard's tuning (ratio exactly 1 at the defaults): the length is cut
  // to it; the reed's section, solder and voicing stay the key's
  const double f0 = keyFreq(m) * ratio, b = REED.b, h = REED.hBass * (1 - t) + REED.hTreble * t;
  const double r = tipMass * pow(REED.rBass, 1 - t) * pow(REED.rTreble, t), bl = REED.blob;
  KeyReed kr;
  kr.unit = unitReed(r, 1 - bl / 2, (r * (bl * bl + pow(bl / 2, 2))) / 12, REED.nModes);
  const UnitReed &u = kr.unit;
  // f₁ = Λ₁ √(EI/μ) / (2π L²), √(EI/μ) = h √(E / 12ρ): solve L
  const double c = h * std::sqrt(E / (12 * rho)), L = std::sqrt((u.Lam[0] * c) / (TWO_PI * f0));
  const double mu = rho * b * h, EI = (E * b * pow(h, 3)) / 12, nrm = 1 / std::sqrt(mu * L), xc = REED.xPad;
  int N = 0;
  for (int n = 0; n < u.nModes; n++) {
    const double f = (u.Lam[n] * c) / (TWO_PI * L * L);
    if (f > std::min(20000.0, 0.45 * fs)) break;
    const double sigma = reedSigma(f, h, loss);
    kr.modes[N++] = {f, sigma, fdlibm::log(1000) / sigma, f / f0, nrm * u.shape(n, xc), nrm * u.shape(n, 1), 0};
  }
  // stiffness at the pad, and tip deflection per unit pad deflection (static, kept modes)
  double cc = 0, ct = 0;
  for (int n = 0; n < N; n++) { const ReedMode &md = kr.modes[n]; const double w2 = pow(TWO_PI * md.f, 2); cc += pow(md.phiC, 2) / w2; ct += (md.phiC * md.phiT) / w2; }
  for (int n = 0; n < N; n++) { ReedMode &md = kr.modes[n]; md.release = md.phiC / pow(TWO_PI * md.f, 2) / cc; }
  kr.key = m; kr.N = N; kr.f0 = f0; kr.L = L; kr.b = b; kr.h = h; kr.mu = mu; kr.EI = EI; kr.r = r; kr.Msolder = r * mu * L;
  kr.xc = xc * L; kr.kc = 1 / cc; kr.tipGain = ct / cc; kr.nrm = nrm;
  return kr;
}

// ---- pickups -----------------------------------------------------------------------------------
double voicingT(int m) { const double r = 261.63 / keyFreq(m); return r >= 1 ? std::sqrt(r) : std::sqrt(std::sqrt(r)); }
double emH2(double Y, double g) { const double e = Y / (EM_ELL + g); return (2 * (1 - std::sqrt(1 - e * e))) / e; }
PlateRail::PlateRail(double fs) : d(fdlibm::exp(-1 / (fs * ES.R * ES.Cbus))), Q(ES.Cbus * ES.Vb) {}

// ---- the mechanism of one key ------------------------------------------------------------------

Pluck::Pluck(const KeyReed &r, const PadParams &P, double fs_, double bend_, int nMax) : kr(&r), N(std::min(r.N, nMax)), k(1 / fs_), fs(fs_) {
  coeffs(bend_);
  setPad(P);
  // at rest: the pad presses the reed with the preload, bonded over the full disc
  const double Fp = -PAD.preload;
  for (int i = 0; i < N; i++) q[i] = q1[i] = S[i] * Fp;
  yc = ycRest = cStatic * Fp; e = Fp / kp; hRest = yc + e;
  h = hRest; hv = 0; hT = hRest;
  a = PAD.a0; F = Fp; v = 0;
  yRest = tip(); y = yRest;
}

// The modes at bend × their frequencies (the reed's stiffness × bend²): the recursions, the
// compliances at the pad and the tip, and the end stop. A mode bent past 0.45 × the rate (where
// keyReed cuts them) stays there: far above the output's band, and its recursion stays stable.
void Pluck::coeffs(double r) {
  double Csum = 0, cs = 0, Ctip = 0;
  for (int i = 0; i < N; i++) {
    const ReedMode &md = kr->modes[i];
    const double rr = fdlibm::exp(-md.sigma * k), wd = std::min(TWO_PI * md.f * r, TWO_PI * 0.45 * fs);
    A1[i] = 2 * rr * fdlibm::cos(wd * k); A2[i] = rr * rr;
    const double b = (k * rr * fdlibm::sin(wd * k)) / wd;
    PC[i] = md.phiC; PT[i] = md.phiT; B[i] = b * md.phiC; BT[i] = b * md.phiT;
    S[i] = B[i] / (1 - A1[i] + A2[i]); W2[i] = wd * wd;
    Csum += b * md.phiC * md.phiC; cs += S[i] * md.phiC; Ctip += b * md.phiT * md.phiT;
  }
  C = Csum; cStatic = cs;
  // optional end stop under the tip (the magnet pole of the T pickup), y = −stop
  stopDen = 1 / (1 + Ks * Ctip); Ct = Ctip;
  bend = r;
}

// Retune a sounding (or resting) reed: a reed at rest under a constant force keeps its balance.
void Pluck::retune(double r, bool resting) {
  std::array<double, MAX_MODES> S0 = S;
  coeffs(r);
  den = 1 / (1 + Bk * C);
  if (resting) for (int i = 0; i < N; i++) if (S0[i] != 0) { q[i] *= S[i] / S0[i]; q1[i] *= S[i] / S0[i]; }
}

void Pluck::setPad(const PadParams &P) {
  F0 = P.tack; n = P.rate; kp = P.padK * 1e3; cp = P.padC;
  const double ck = cp / k;
  Bk = kp + ck; Ck = ck; den = 1 / (1 + Bk * C);
  relax = ck / (kp + ck); // free foam: backward-Euler relaxation of the face
}

double Pluck::tip() const { double s = 0; for (int i = 0; i < N; i++) s += PT[i] * q[i]; return s; }
void Pluck::press(double vel) { V = keySpeed(vel); hv = V; hT = hRest + PAD.travel; down = true; t = 0; released = false; }
void Pluck::lift() { hv = -PAD.vRet; hT = hRest; down = false; }

double Pluck::step() {
  if (hv != 0) {
    h += hv * k;
    if (hv > 0 ? h >= hT : h <= hT) { h = hT; hv = 0; }
  }
  double yf = 0;
  for (int i = 0; i < N; i++) { const double qn = A1[i] * q[i] - A2[i] * q1[i]; q1[i] = q[i]; q[i] = qn; yf += PC[i] * qn; }
  // foam extension e = h − y_c, force on the reed F = k_p e + c_p ė (implicit in y_c)
  double Fn = (Bk * (h - yf) - Ck * e) * den;
  const bool bonded = a > PAD.aMin * PAD.a0;
  if (!bonded) {
    double eFree = e * relax; // the face springs back towards the holder
    if (std::fabs(eFree) < 1e-30) eFree = 0; // (back: no denormals, which cost the audio thread tenfold)
    if (yf <= h - eFree || Fn >= 0) { e = eFree; Fn = 0; }
  }
  if (Fn != 0) {
    for (int i = 0; i < N; i++) q[i] += B[i] * Fn;
    yc = yf + C * Fn; e = h - yc;
    if (Fn > 0) { // tension: the crack at the bond's edge advances
      const double vc = crackSpeed(Fn, a, F0, n);
      v = vc; a -= vc * k;
      if (a <= PAD.aMin * PAD.a0) {
        a = 0;
        if (down && !released) { released = true; rel = {yc, Fn, vc, t, V}; }
      }
    } else a += (PAD.a0 - a) * (k / PAD.heal); // pressed: the face re-wets the reed
  } else yc = yf;
  F = Fn; t += k;
  double yt = 0;
  for (int i = 0; i < N; i++) yt += PT[i] * q[i];
  if (yt < -stop) { // the tip strikes the pole piece: stiff elastic contact, implicit
    const double Fs = Ks * (-stop - yt) * stopDen;
    for (int i = 0; i < N; i++) q[i] += BT[i] * Fs;
    yt += Ct * Fs; hits++;
  }
  y = yt;
  return yt;
}

double Pluck::energy() const { // vibration energy (J) about the static shape under the present pad force
  double E = 0;
  for (int i = 0; i < N; i++) {
    const double d = (q[i] - q1[i]) * fs, x = q[i] - S[i] * F;
    E += 0.5 * (d * d + W2[i] * x * x);
  }
  return E;
}

// ---- offline runs ------------------------------------------------------------------------------

Simulation simulatePluck(int m, double tipMass, double loss, const PadParams &P, double vel, double fs, double periods, int frames, double maxT, double ratio) {
  const KeyReed kr = keyReed(m, tipMass, loss, fs, ratio);
  Simulation out;
  {
    Pluck p(kr, P, fs);
    p.press(vel);
    while (!p.released && p.t < maxT) p.step();
    out.released = p.released;
    if (p.released) out.rel = p.rel;
    out.tEnd = p.released ? std::min(maxT, p.rel.t + periods / kr.f0) : maxT;
  }
  Pluck p(kr, P, fs); // run again, recording `frames` snapshots
  p.press(vel);
  out.N = kr.N;
  const int every = std::max(1, (int)std::floor((out.tEnd * fs) / frames));
  for (int s = 0; p.t < out.tEnd; s++) {
    p.step();
    if (s % every) continue;
    out.t.push_back(p.t); out.h.push_back(p.h); out.face.push_back(p.h - p.e); out.yc.push_back(p.yc);
    out.y.push_back(p.y); out.F.push_back(p.F); out.a.push_back(p.a / PAD.a0);
    for (int i = 0; i < kr.N; i++) out.q.push_back(p.q[i]);
  }
  return out;
}

ReleasePoint releasePoint(const KeyReed &kr, const PadParams &P, double vel, double fs) {
  Pluck p(kr, P, fs);
  p.press(vel);
  while (!p.released && p.t < 0.5) p.step();
  if (p.released) return {vel, p.rel.V, p.rel.y, p.rel.F, p.rel.v, p.rel.t, false};
  return {vel, keySpeed(vel), p.yc, p.F, 0, p.t, true};
}

} // namespace forte::pianet
