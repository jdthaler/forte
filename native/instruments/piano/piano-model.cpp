// piano-model.cpp — the struck string's mechanics (piano-model.h).

#include "piano-model.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <initializer_list>
#include <utility>

#include "forte/linalg.h"

namespace forte::piano {

const Material MATERIALS[6] = {
    {"Steel music wire", 2.00e11, 7.9e10, 7850, 2.2e9},
    {"Brass", 1.00e11, 3.7e10, 8500, 0.6e9},
    {"Phosphor bronze", 1.10e11, 4.2e10, 8860, 0.9e9},
    {"Titanium alloy", 1.14e11, 4.4e10, 4430, 1.0e9},
    {"Nylon monofilament", 4.0e9, 1.4e9, 1140, 0.6e9},
    {"Carbon fibre (unidirect.)", 1.35e11, 5.0e9, 1600, 1.5e9},
};

static const double SQ3 = std::sqrt(3.0);
static double clamp(double x, double a, double b) { return std::min(b, std::max(a, x)); }

// ---- cross-sections --------------------------------------------------------------------------

static Section rect(double w, double t) {
  const double a = std::max(w, t), b = std::min(w, t), r = b / a;
  // Saint-Venant torsion constant of a rectangle (Roark; <0.5 % error)
  const double J = a * std::pow(b, 3) * (1.0 / 3 - 0.21 * r * (1 - std::pow(r, 4) / 12));
  return {w * t, (w * std::pow(t, 3)) / 12, (t * std::pow(w, 3)) / 12, J, (w * std::pow(t, 3) + t * std::pow(w, 3)) / 12, w / 2, w / 2, w, t};
}

Section sectionProps(int shape, double A, double aspect, double s) {
  if (shape == shape_::ribbon) {
    const double t = std::sqrt(A / aspect);
    return rect(aspect * t * s, t);
  }
  const double As = A * s;
  if (shape == shape_::square) {
    const double a = std::sqrt(As), I = std::pow(a, 4) / 12;
    return {As, I, I, 0.1406 * std::pow(a, 4), 2 * I, a / 2, a / 2, a, a};
  }
  if (shape == shape_::triangle) {
    // any section with ≥3-fold symmetry has an isotropic second-moment tensor
    const double sd = std::sqrt((4 * As) / SQ3), I = (SQ3 * std::pow(sd, 4)) / 96;
    return {As, I, I, (SQ3 * std::pow(sd, 4)) / 80, 2 * I, sd / 2, sd / 2, sd, (SQ3 * sd) / 2};
  }
  const double r = std::sqrt(As / PI), I = (PI * std::pow(r, 4)) / 4;
  // a frictionless hammer pushes along a radius of a round wire: no torque
  return {As, I, I, 2 * I, 2 * I, r, 0, 2 * r, 2 * r};
}

// ---- scale design (a smoothed concert-grand layout, steel reference) --------------------------

double keyFreq(double m) { return 440 * std::pow(2.0, (m - 69) / 12); }

double scaleLength(double m) {
  const double Lf = 0.62 * std::pow(2.0, (-0.88 * (m - 60)) / 12); // ~ f^-0.88 in the treble
  return Lf / std::pow(1 + std::pow(Lf / 2.0, 6), 1.0 / 6);       // foreshortened bass, ≤ 2 m
}

double scaleDiameter(double m) { return 1.065e-3 * std::pow(2.0, (-0.12 * (m - 60)) / 12); }

// Copper winding of the reference steel design, as added mass per length.
double windingMass(double m) {
  const double L = scaleLength(m), f = keyFreq(m), d = scaleDiameter(m);
  const double mu = (7850 * PI * d * d) / 4;
  const double Tplain = 4 * L * L * f * f * mu;
  const double Ttarget = 735 * (1 + 1.2 * clamp((48 - m) / 27, 0, 1));
  if (Tplain >= 0.85 * Ttarget) return 0;
  return mu * (Ttarget / Tplain - 1);
}

// Piecewise-linear through the points, extrapolated beyond the ends.
static double interp(double m, std::initializer_list<std::pair<double, double>> list) {
  const std::pair<double, double> *pts = list.begin();
  const int n = (int)list.size();
  if (m <= pts[0].first) {
    const auto [x0, y0] = pts[0];
    const auto [x1, y1] = pts[1];
    return y0 + ((y1 - y0) * (m - x0)) / (x1 - x0);
  }
  for (int i = 1; i < n; i++) {
    if (m <= pts[i].first || i == n - 1) {
      const auto [x0, y0] = pts[i - 1];
      const auto [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (m - x0)) / (x1 - x0);
    }
  }
  return pts[n - 1].second;
}

// C&A's hammers at C2 and C4; above C4 K rises faster (contact ≈ 1.2 ms at C6, 0.7 ms at C7,
// 0.4 ms at C8 at 1.2 m/s); mass and p follow C&A up to C7 and level off above it.
Hammer pianoHammer(double m) {
  const double mass = clamp(interp(m, {{36, 4.9e-3}, {60, 2.97e-3}, {96, 2.2e-3}, {108, 1.9e-3}}), 1.8e-3, 7e-3);
  const double K = std::exp(interp(m, {{36, std::log(4e8)}, {60, std::log(4.5e9)}, {84, std::log(8e10)}, {96, std::log(3e12)}, {108, std::log(8e12)}}));
  const double p = clamp(interp(m, {{36, 2.3}, {60, 2.5}, {96, 3.0}, {108, 3.0}}), 2.1, 3.0);
  const double width = clamp(0.010 + (60 - m) * 0.00025, 0.003, 0.022);
  return {mass, K, p, width};
}

// ---- Rayleigh–Ritz in the basis sin(jπx/L), j = 1..nb ------------------------------------------

// C[m] = ∫₀ᴸ f(x) cos(mπx/L) dx for m = 0..mMax (midpoint rule).
template <class F>
static std::vector<double> cosMoments(F f, double L, int mMax, int Q) {
  std::vector<double> C(mMax + 1, 0.0);
  const double h = L / Q;
  for (int q = 0; q < Q; q++) {
    const double x = (q + 0.5) * h, w = f(x) * h;
    const double c1 = std::cos((PI * x) / L);
    double cm1 = 1, cm = c1;
    C[0] += w;
    if (mMax >= 1) C[1] += w * c1;
    for (int m = 2; m <= mMax; m++) {
      const double cn = 2 * c1 * cm - cm1;
      C[m] += w * cn;
      cm1 = cm; cm = cn;
    }
  }
  return C;
}

// Gram matrices: ∫ f sin_i sin_j = ½[C(i-j) - C(i+j)], ∫ f cos_i cos_j = ½[C(i-j) + C(i+j)]
static void gram(const std::vector<double> &C, int nb, double sign, const double *wi, Matrix &out, bool accumulate = false) {
  for (int i = 0; i < nb; i++) {
    for (int j = 0; j < nb; j++) {
      const double v = 0.5 * (C[std::abs(i - j)] + sign * C[i + j + 2]) * (wi ? wi[i] * wi[j] : 1);
      if (accumulate) out(i, j) += v; else out(i, j) = v;
    }
  }
}

// One family by Rayleigh–Ritz: mass(x), P(x) (or a constant P), R(x) (or none).
template <class Mass, class Pf, class Rf>
static std::optional<Eigen_> ritzSolve(Mass mass, const Pf *P, double Pconst, const Rf *R, double L, int nb) {
  const int Q = std::max(8 * nb, 256);
  std::vector<double> k(nb), k2(nb);
  for (int j = 0; j < nb; j++) { k[j] = ((j + 1) * PI) / L; k2[j] = k[j] * k[j]; }
  Matrix M(nb, nb), K = Matrix::Zero(nb, nb);
  gram(cosMoments(mass, L, 2 * nb + 2, Q), nb, -1, nullptr, M);
  if (!P) {
    for (int j = 0; j < nb; j++) K(j, j) = (Pconst * k2[j] * L) / 2;
  } else {
    gram(cosMoments(*P, L, 2 * nb + 2, Q), nb, +1, k.data(), K);
  }
  if (R) gram(cosMoments(*R, L, 2 * nb + 2, Q), nb, -1, k2.data(), K, true);
  return genEig(K, M);
}

// Tension that puts the fundamental of a (tapered) bending family at ω0: Newton with
// dλ/dT = x₁ᵀ D x₁ (Hellmann–Feynman), monotone from below.
template <class Mass, class Rf>
static std::pair<double, bool> tuneRitz(Mass mass, Rf R, double L, double omega0, double Tguess) {
  const int nb = 24, Q = 512;
  std::vector<double> k2(nb);
  for (int j = 0; j < nb; j++) k2[j] = std::pow(((j + 1) * PI) / L, 2);
  Matrix M(nb, nb), KR(nb, nb);
  gram(cosMoments(mass, L, 2 * nb + 2, Q), nb, -1, nullptr, M);
  gram(cosMoments(R, L, 2 * nb + 2, Q), nb, -1, k2.data(), KR);
  double T = Tguess;
  for (int it = 0; it < 12; it++) {
    Matrix K = KR;
    for (int j = 0; j < nb; j++) K(j, j) += (T * k2[j] * L) / 2;
    const auto e = genEig(K, M);
    if (!e) return {0, false};
    double dl = 0;
    for (int j = 0; j < nb; j++) dl += (e->X(j, 0) * e->X(j, 0) * k2[j] * L) / 2;
    const double Tn = T + (omega0 * omega0 - e->lambda[0]) / dl;
    if (!(Tn > 0)) return {0, false};
    const bool done = std::fabs(Tn - T) < 1e-10 * T;
    T = Tn;
    if (done) break;
  }
  return {T, true};
}

// Fourier transform of a Hann window of total width w (the felt contact patch).
static double hannFT(double kk, double w) {
  const double a = (kk * w) / 2;
  if (a < 1e-6) return 1;
  const double den = 1 - std::pow(a / PI, 2);
  if (std::fabs(den) < 1e-6) return 0.5;
  return std::sin(a) / a / den;
}

static Family ritzFamily(int type, const Eigen_ &e, int nb, int nKeep, double L, double xh, double wH, double PL, double RL, double fmax, double B) {
  std::vector<double> omegaAll;
  for (int n = 0; n < nKeep; n++) {
    const double om = std::sqrt(std::max(e.lambda[n], 0.0));
    if (om / (2 * PI) >= fmax && n > 0) break;
    omegaAll.push_back(om);
  }
  const int nm = (int)omegaAll.size();
  Family f;
  f.type = type; f.n = nm; f.omega = omegaAll; f.phiH.resize(nm); f.bridge.resize(nm);
  f.ritz = true; f.nb = nb; f.coef.assign((size_t)nb * nm, 0.0); f.B = B;
  std::vector<double> sinH(nb), sgnK(nb);
  for (int j = 0; j < nb; j++) {
    const double kk = ((j + 1) * PI) / L;
    sinH[j] = std::sin(kk * xh) * hannFT(kk, wH);
    sgnK[j] = (j % 2 ? 1 : -1) * (PL * kk + RL * std::pow(kk, 3)); // (−1)^(j+1) with j 1-based
  }
  for (int n = 0; n < nm; n++) {
    double ph = 0, br = 0;
    for (int j = 0; j < nb; j++) {
      const double x = e.X(j, n);
      f.coef[(size_t)n * nb + j] = x;
      ph += x * sinH[j];
      br += x * sgnK[j];
    }
    // fix the arbitrary eigenvector sign so the shape is positive near x = 0
    const double s = f.coef[(size_t)n * nb] >= 0 ? 1 : -1;
    if (s < 0) for (int j = 0; j < nb; j++) f.coef[(size_t)n * nb + j] *= -1;
    f.phiH[n] = s * ph;
    f.bridge[n] = s * br;
  }
  return f;
}

// ∫φ_n′² dx of a mass-normalised bending mode: its share of the stretch per unit q², and
// ∂ω²/∂T (the tension's term in its stiffness, T·∫φ′²)
static double stretchWeight(const Family &f, int n, double L) {
  double g = 0;
  if (f.ritz) for (int j = 0; j < f.nb; j++) { const double kk = ((j + 1) * PI) / L, c = f.coef[(size_t)n * f.nb + j]; g += c * c * kk * kk; }
  else { const double kk = ((n + 1) * PI) / L; g = f.norm[n] * f.norm[n] * kk * kk; }
  return (g * L) / 2;
}

// ---- per-key model ---------------------------------------------------------------------------

KeyModel computeKeyModel(int m, const double *P, double fs) {
  KeyModel model;
  const int matIndex = std::min(5, std::max(0, (int)P[p::material]));
  const Material &mat = MATERIALS[matIndex];
  const double E = mat.E, G = mat.G, rho = mat.rho;
  // the key's pitch: equal temperament's times the keyboard's tuning (exactly 1 at the defaults);
  // the scale (length, gauge, winding, hammers, voicing) stays the key's
  const double f0 = keyFreq(m) * tuningOf(P).ratio(m), omega0 = 2 * PI * f0;
  const double L = scaleLength(m) * P[p::lengthScale];
  const double d = scaleDiameter(m) * P[p::gauge];
  const double A0 = (PI * d * d) / 4;
  const double dMu = P[p::winding] != 0 ? windingMass(m) : 0;
  const int shape = (int)P[p::shape];
  const double aspect = shape == shape_::ribbon ? std::max(1.0, P[p::aspect]) : 1;
  const double tau = clamp(P[p::taper], -0.97, 0.97);
  const bool uniform = std::fabs(tau) < 1e-4;

  model.key = m; model.material = matIndex;
  model.shape = shape; model.A0 = A0; model.aspect = aspect; model.tau = tau; model.uniform = uniform; model.L = L;
  const Section sec0 = sectionProps(shape, A0, aspect, 1);
  auto secAt = [&](double x) { return model.secAt(x); };
  const double dTheta = dMu * 2 * (sec0.Ip / sec0.A); // the winding sits outside the core

  const Hammer hd = pianoHammer(m);
  const double beta = clamp(P[p::strikePos], 0.01, 0.5);
  const double xh = beta * L;
  const double wH = std::min({hd.width * P[p::hammerWidth], 2 * xh, 0.5 * L});
  const double fmax = std::min(P[p::maxFreq], 0.45 * fs);

  auto mass = [&](double x) { return rho * secAt(x).A + dMu; };
  auto thetaMass = [&](double x) { return rho * secAt(x).Ip + dTheta; };

  // tension: tune the fundamental of whichever bending axis faces the hammer to the key's pitch
  const double mu0 = rho * A0 + dMu;
  const double k1 = PI / L;
  const double Tstring = (omega0 * omega0 * mu0) / (k1 * k1); // flexible-string value
  const int tuneAxis = std::fabs(std::cos((P[p::roll] * PI) / 180)) >= std::numbers::sqrt2 / 2 ? 1 : 2;
  double T;
  bool tuned = true;
  if (uniform) {
    T = Tstring - E * (tuneAxis == 1 ? sec0.I1 : sec0.I2) * k1 * k1;
  } else {
    auto R = [&](double x) { const Section s = secAt(x); return E * (tuneAxis == 1 ? s.I1 : s.I2); };
    const auto [Tr, ok] = tuneRitz(mass, R, L, omega0, std::max(Tstring * 0.5, 1.0));
    T = Tr; tuned = ok;
  }
  if (!(T > 0.02 * Tstring)) { T = 0.02 * Tstring; tuned = false; }

  // bending families
  const bool isotropic = std::fabs(sec0.I1 - sec0.I2) < 1e-9 * sec0.I1;
  for (int b = 0; b < 2; b++) {
    if (b == 1 && isotropic) {
      model.families[1] = model.families[0];
      model.families[1].type = 1;
      continue;
    }
    const double I = b == 0 ? sec0.I1 : sec0.I2;
    const double B = (PI * PI * E * I) / (T * L * L);
    int nEst = 0;
    while (nEst < NMAX_MODES && (nEst + 1) * (0.5 / L) * std::sqrt(T / mu0) * std::sqrt(1 + B * std::pow(nEst + 1, 2)) < fmax) nEst++;
    nEst = std::max(nEst, 1);
    Family &f = model.families[b];
    if (uniform) {
      f.type = b; f.n = nEst; f.B = B;
      f.omega.resize(nEst); f.phiH.resize(nEst); f.bridge.resize(nEst); f.norm.resize(nEst);
      const double nrm = std::sqrt(2 / (mu0 * L));
      const double EI = E * I;
      for (int n = 1; n <= nEst; n++) {
        const double kk = (n * PI) / L;
        f.omega[n - 1] = std::sqrt((T * kk * kk + EI * std::pow(kk, 4)) / mu0);
        f.phiH[n - 1] = nrm * std::sin(kk * xh) * hannFT(kk, wH);
        f.bridge[n - 1] = nrm * (n % 2 ? -1 : 1) * (T * kk + EI * std::pow(kk, 3));
        f.norm[n - 1] = nrm;
      }
    } else {
      const int nb = std::min(220, (int)std::ceil(nEst / 0.8) + 6);
      const int nKeep = std::min(nEst + 4, (int)std::floor(0.8 * nb));
      auto R = [&](double x) { const Section s = secAt(x); return E * (b == 0 ? s.I1 : s.I2); };
      const auto e = ritzSolve(mass, (decltype(R) *)nullptr, T, &R, L, nb);
      if (!e) { model.ok = false; return model; }
      const Section sL = secAt(L);
      f = ritzFamily(b, *e, nb, nKeep, L, xh, wH, T, E * (b == 0 ? sL.I1 : sL.I2), fmax, B);
    }
  }

  // torsion family
  const double Pt0 = G * sec0.J + (T * sec0.Ip) / sec0.A;
  const double Th0 = rho * sec0.Ip + dTheta;
  const double cTheta = std::sqrt(Pt0 / Th0);
  {
    const double fT1 = cTheta / (2 * L);
    const int nEst = std::max(1, (int)std::min((double)NMAX_MODES, std::floor(fmax / fT1)));
    Family &f = model.families[2];
    if (uniform) {
      f.type = 2; f.n = nEst;
      f.omega.resize(nEst); f.phiH.resize(nEst); f.bridge.resize(nEst); f.norm.resize(nEst);
      const double nrm = std::sqrt(2 / (Th0 * L));
      for (int n = 1; n <= nEst; n++) {
        const double kk = (n * PI) / L;
        f.omega[n - 1] = cTheta * kk;
        f.phiH[n - 1] = nrm * std::sin(kk * xh) * hannFT(kk, wH);
        f.bridge[n - 1] = nrm * (n % 2 ? -1 : 1) * Pt0 * kk;
        f.norm[n - 1] = nrm;
      }
    } else {
      auto Pfn = [&](double x) { const Section s = secAt(x); return G * s.J + (T * s.Ip) / s.A; };
      const int nb = std::min(220, (int)std::ceil(nEst / 0.8) + 6);
      const int nKeep = std::min(nEst + 4, (int)std::floor(0.8 * nb));
      const auto e = ritzSolve(thetaMass, &Pfn, 0.0, (decltype(Pfn) *)nullptr, L, nb);
      if (!e) { model.ok = false; return model; }
      f = ritzFamily(2, *e, nb, nKeep, L, xh, wH, Pfn(L), 0, fmax, 0);
    }
  }

  const Family &fam1 = model.families[0], &fam2 = model.families[1], &famT = model.families[2];
  const double f1 = fam1.omega[0] / (2 * PI);
  Info &i = model.info;
  i.f0 = f0; i.L = L; i.T = T; i.tuned = tuned;
  i.stress = T / sec0.A; i.strengthRatio = T / sec0.A / mat.strength;
  i.mu = mu0; i.dMu = dMu; i.A = A0;
  i.B1 = fam1.B; i.B2 = fam2.B;
  i.f1 = f1; i.f1hard = fam2.omega[0] / (2 * PI); i.f1torsion = famT.omega[0] / (2 * PI); i.tuneAxis = tuneAxis;
  i.torsionRatio = famT.omega[0] / fam1.omega[0];
  i.cT = std::sqrt(T / mu0); i.cTheta = cTheta;
  i.xh = xh; i.wH = wH; i.beta = beta; i.uniform = uniform; i.taper = tau;
  i.hammer = hd;
  model.T = T; model.xh = xh; model.wH = wH; model.sec = sec0;
  return model;
}

// ---- the arrays the engine runs ----------------------------------------------------------------
//
// Each mode is a damped oscillator q̈ + 2σq̇ + ω²q = Σ forces, with mass-normalised shapes. A
// resistive bridge of conductance G gives the rank-one damping c cᵀ with c_n = √G · F_bridge,n / ω_n.

VoiceData buildVoiceData(const KeyModel &model, const double *P, uint64_t version) {
  const int nu = (int)std::round(clamp(P[p::unisons], 1, 3));
  static const double DET[3][3] = {{0}, {-0.5, 0.5}, {-1, 0, 1}};
  const double *det = DET[nu - 1];
  const double psi = (P[p::roll] * PI) / 180;
  double cps = std::cos(psi), sps = std::sin(psi);
  const auto sign = [](double x) { return x > 0 ? 1.0 : x < 0 ? -1.0 : x; };
  // snap exact face-on / edge-on so the family the hammer cannot reach (weight ~1e-16) is dropped
  if (std::fabs(cps) < 1e-6) { cps = 0; sps = sign(sps); }
  if (std::fabs(sps) < 1e-6) { sps = 0; cps = sign(cps); }
  // a tapered member is struck, and meets the bridge, where it is that wide
  const double lever = P[p::offset] * model.secAt(model.xh).lever;
  const double halfBridge = model.secAt(model.L).half;
  const double Gv = BRIDGE_G * P[p::bridge], Gh = Gv * P[p::bridgeH];
  const double sGv = std::sqrt(Gv), sGh = std::sqrt(Gh);
  const double b1 = 0.25 * P[p::lossLow], b3 = 2.5e-9 * P[p::lossHigh];
  const double polDet = std::pow(2.0, P[p::polDetune] / 1200);

  struct Use { const Family *fam; int id; double hw, v, h, t, det, loss; };
  Use use[3];
  int nUse = 0;
  if (cps != 0) use[nUse++] = {&model.families[0], 0, cps, cps, sps, 0, 1, 1};
  if (sps != 0) use[nUse++] = {&model.families[1], 1, -sps, -sps, cps, 0, polDet, 1};
  // torsion is heard as the edge force of the bridge torque: τ / half-width there
  if (std::fabs(lever) > 1e-12) use[nUse++] = {&model.families[2], 2, lever, 0, 0, 1 / halfBridge, 1, P[p::torsionLoss]};

  VoiceData d;
  int N = 0;
  for (int u = 0; u < nUse; u++) N += use[u].fam->n;
  N *= nu;
  d.version = version; d.key = model.key; d.n = N; d.unisons = nu;
  d.freq.resize(N); d.sigma.resize(N); d.w.resize(N); d.cv.resize(N); d.ch.resize(N); d.ct.resize(N); d.g.resize(N);
  d.famId.resize(N); d.uni.resize(N); d.idx.resize(N);
  int i = 0;
  for (int s = 0; s < nu; s++) {
    const double dS = std::pow(2.0, (det[s] * P[p::unisonDetune]) / 1200);
    for (int k = 0; k < nUse; k++) {
      const Use &u = use[k];
      const Family &f = *u.fam;
      for (int n = 0; n < f.n; n++, i++) {
        const double om = f.omega[n] * dS * u.det;
        d.freq[i] = om / (2 * PI);
        d.sigma[i] = (b1 + b3 * om * om) * u.loss;
        d.w[i] = (u.hw * f.phiH[n]) / nu;
        const double br = f.bridge[n] / f.omega[n];
        d.cv[i] = u.v * sGv * br;
        d.ch[i] = u.h * sGh * br;
        d.ct[i] = u.t * sGv * br;
        d.g[i] = u.id == 2 ? 0 : stretchWeight(f, n, model.L);
        d.famId[i] = (uint8_t)u.id; d.uni[i] = (uint8_t)s; d.idx[i] = (uint16_t)n;
      }
    }
  }
  // "voicing": the per-key loudness balance a technician sets by needling the felt; here a
  // simple tilt in dB per octave about middle C
  const double voice = std::pow(10.0, (P[p::voicing] * std::log2(keyFreq(model.key) / 261.63)) / 20);
  const Hammer &hd = model.info.hammer;
  const double dp = P[p::feltExp];
  const double pe = hd.p + dp;
  const double K = hd.K * P[p::hardness] * std::pow(1e-3, hd.p - pe) * nu; // keep F(1 mm) fixed when p changes
  d.hammer = {hd.mass * P[p::hammerMass] * nu, K, pe, P[p::hysteresis]};
  d.outV = sGv * voice; d.outH = sGh * voice;
  d.hasDamper = model.key <= 88;
  // the core stretches as one spring (the winding carries no load): ΔT = ½∫u_x² / ∫dx/EA
  const double E = MATERIALS[model.material].E;
  double compliance = 0;
  if (model.uniform) compliance = model.L / (E * model.sec.A);
  else {
    const int Q = 64;
    for (int j = 0; j < Q; j++) compliance += model.L / Q / (E * model.secAt((j + 0.5) * model.L / Q).A);
  }
  d.T = model.T; d.kc = 0.5 / compliance;
  return d;
}

int packVoiceData(const VoiceData &d, double *out) {
  const double head[PACK_HEAD] = {(double)d.version, (double)d.key, (double)d.n, (double)d.unisons, d.hammer.mass, d.hammer.K, d.hammer.p, d.hammer.alpha,
                                  d.outV, d.outH, d.hasDamper ? 1.0 : 0.0, d.T, d.kc};
  std::memcpy(out, head, sizeof head);
  double *o = out + PACK_HEAD;
  const int n = d.n;
  for (const std::vector<double> *a : {&d.freq, &d.sigma, &d.w, &d.cv, &d.ch, &d.ct, &d.g}) { std::copy(a->begin(), a->end(), o); o += n; }
  for (int i = 0; i < n; i++) o[i] = d.famId[i];
  o += n;
  for (int i = 0; i < n; i++) o[i] = d.uni[i];
  o += n;
  for (int i = 0; i < n; i++) o[i] = d.idx[i];
  return PACK_HEAD + PACK_ARRAYS * n;
}

bool unpackVoiceData(const double *in, int count, VoiceData &d) {
  if (count < PACK_HEAD) return false;
  const int n = (int)in[2];
  if (n < 0 || n > MAX_N || count < PACK_HEAD + PACK_ARRAYS * n) return false;
  d.version = (uint64_t)in[0]; d.key = (int)in[1]; d.n = n; d.unisons = std::min(3, std::max(1, (int)in[3]));
  d.hammer = {in[4], in[5], in[6], in[7]};
  d.outV = in[8]; d.outH = in[9]; d.hasDamper = in[10] != 0; d.T = in[11]; d.kc = in[12];
  const double *o = in + PACK_HEAD;
  for (std::vector<double> *a : {&d.freq, &d.sigma, &d.w, &d.cv, &d.ch, &d.ct, &d.g}) { a->assign(o, o + n); o += n; }
  d.famId.resize(n); d.uni.resize(n); d.idx.resize(n);
  for (int i = 0; i < n; i++) d.famId[i] = (uint8_t)o[i];
  o += n;
  for (int i = 0; i < n; i++) d.uni[i] = (uint8_t)o[i];
  o += n;
  for (int i = 0; i < n; i++) d.idx[i] = (uint16_t)o[i];
  return true;
}

// Every parameter but these: the tuning's among them (pitch … cents11 move every key's pitch).
bool isModelParam(int i) {
  switch (i) {
    case p::unaCorda: case p::damper: case p::kc: case p::gainV: case p::gainH: case p::gainT:
    case p::soundboard: case p::room: case p::width: case p::volume: return false;
    default: return i >= 0 && i < p::count;
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

} // namespace forte::piano
