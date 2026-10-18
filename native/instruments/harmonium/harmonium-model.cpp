// harmonium-model.cpp — the free-reed organ's model (harmonium-model.h).

#include "harmonium-model.h"

#include <algorithm>
#include <cmath>

namespace forte::harmonium {

static double clamp(double x, double a, double b) { return std::min(b, std::max(a, x)); }

void engaged(const double *P, bool on[NRANKS]) {
  const int m = (int)P[p::musette];
  on[0] = P[p::bourdon] != 0; on[1] = P[p::principal] != 0; on[4] = P[p::piccolo] != 0;
  on[2] = m == musette_::two || m == musette_::three;
  on[3] = m == musette_::three;
}

Voicing voicingOf(const double *P) {
  Voicing v;
  v.set = P[p::set]; v.clearance = P[p::clearance]; v.q = P[p::q]; v.throat = P[p::throat]; v.cell = P[p::cell]; v.detune = P[p::detune];
  return v;
}

// The sounding frequency a rank's reed is made for on key m.
double rankFreq(int m, int r, const Voicing &v) {
  return keyFreq(m) * std::pow(2.0, RANKS[r].oct) * std::pow(2.0, (RANKS[r].cents * v.detune) / 1200);
}

// ---------------------------------------------------------------------------
// The tongue. Frequency equation (μ = M/ρAL):
//   1 + cos λ cosh λ + μλ (cos λ sinh λ − sin λ cosh λ) = 0,   ω = λ² √(EI/ρA) / L²
std::array<double, 2> tipMassRoots(double mu) {
  const auto F = [mu](double x) { return (1 + std::cos(x) * std::cosh(x) + mu * x * (std::cos(x) * std::sinh(x) - std::sin(x) * std::cosh(x))) / std::cosh(x); };
  std::array<double, 2> roots{};
  int n = 0;
  for (double x = 0.05; n < 2 && x < 40; x += 0.01) {
    if (F(x) * F(x + 0.01) <= 0) {
      double a = x, c = x + 0.01;
      for (int i = 0; i < 60; i++) { const double m = 0.5 * (a + c); if (F(a) * F(m) <= 0) c = m; else a = m; }
      roots[n++] = 0.5 * (a + c);
    }
  }
  return roots;
}
// Mode shape for root λ, normalised so that the tip moves by 1.
double modeShape(double lam, double u) {
  const double s = (std::cosh(lam) + std::cos(lam)) / (std::sinh(lam) + std::sin(lam));
  const auto f = [s](double z) { return std::cosh(z) - std::cos(z) - s * (std::sinh(z) - std::sin(z)); };
  return f(lam * u) / f(lam);
}
// ∫₀¹ g(u) du by Simpson's rule
template <class G>
static double simpson(G g, int n = 200) {
  double s = g(0.0) + g(1.0);
  for (int i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * g((double)i / n);
  return s / (3 * n);
}

// The scale of the reeds: thickness and width growing towards the bass, and below G3 a tuning
// weight at the tip; the length then tunes the reed.
struct ScaleRule { double h, hExp, b, bExp, weight, weightFrom, weightOct; };
constexpr ScaleRule SCALE{0.5e-3, -0.35, 4.5e-3, -0.35, 1.0, 196, 2.58};
Scale reedScale(double fNat) {
  const double r = fNat / F_REF;
  const double h = SCALE.h * std::pow(r, SCALE.hExp), b = SCALE.b * std::pow(r, SCALE.bExp);
  const double mu = SCALE.weight * clamp(std::log2(SCALE.weightFrom / fNat) / SCALE.weightOct, 0, 1);
  const auto lam = tipMassRoots(mu);
  const double om = TAU * fNat;
  const double L = lam[0] * std::sqrt((std::sqrt(BRASS.E / (12 * BRASS.rho)) * h) / om);
  return {h, b, mu, lam, L};
}

// ---------------------------------------------------------------------------
// The slot: A(y) = 2 ∫₀ᴸ g(y ψ(x)) dx + (b + 2δ) g(y),   g(w) = √(d(w)² + δ²)
double gapWidth(double w, double e, double h, double delta) {
  const double d = w < 0 ? -w : w > e + h ? w - e - h : 0;
  return std::sqrt(d * d + delta * delta);
}
double slotArea(double y, const Geo &geo) {
  constexpr int N = 48;
  double s = 0;
  for (int i = 0; i <= N; i++) { // trapezoid along the side
    const double u = (double)i / N, g = gapWidth(y * modeShape(geo.lam[0], u), geo.e, geo.h, geo.delta);
    s += (i == 0 || i == N ? 0.5 : 1) * g;
  }
  return 2 * geo.L * (s / N) + (geo.b + 2 * geo.delta) * gapWidth(y, geo.e, geo.h, geo.delta);
}
// A(y) tabulated on a uniform grid, extrapolated linearly beyond it.
void areaTable(const Geo &geo, AreaTable &T) {
  const int n = AREA_N;
  const double lo = -0.45 * geo.L, hi = 0.45 * geo.L, dy = (hi - lo) / (n - 1);
  double shape[49];
  for (int i = 0; i <= 48; i++) shape[i] = modeShape(geo.lam[0], (double)i / 48);
  for (int j = 0; j < n; j++) {
    const double y = lo + j * dy;
    double s = 0;
    for (int i = 0; i <= 48; i++) s += (i == 0 || i == 48 ? 0.5 : 1) * gapWidth(y * shape[i], geo.e, geo.h, geo.delta);
    T.A[j] = 2 * geo.L * (s / 48) + (geo.b + 2 * geo.delta) * gapWidth(y, geo.e, geo.h, geo.delta);
  }
  T.lo = lo; T.dy = dy; T.n = n;
}
Area areaAt(const AreaTable &T, double y) { // linear interpolation
  const double u = (y - T.lo) / T.dy;
  double j = std::floor(u);
  if (j < 0) j = 0; else if (j > T.n - 2) j = T.n - 2;
  if (!(j >= 0)) j = 0; // NaN
  const int i = (int)j;
  const double a0 = T.A[i], a1 = T.A[i + 1], dA = (a1 - a0) / T.dy;
  return {a0 + dA * (u - j) * T.dy, dA};
}

// ---------------------------------------------------------------------------
// One reed, made for a sounding frequency under the knobs.
struct DesignRules { double setExp, setLen, deltaExp, plate0, plate1, throat, cellRatio, inlet, zeta2, cd; };
constexpr DesignRules DESIGN{0.2, 0.8, 1, 0.6e-3, 0.03, 0.4, 3, 6, 2, 2};

// The reed's two modes for a natural frequency fNat (no air).
struct Tongue { double h, b, mu; std::array<double, 2> lam; double L, m0, M; std::array<Mode, 2> modes; double sag; };
static Tongue tongue(double fNat, double q) {
  const Scale sc = reedScale(fNat);
  const double h = sc.h, b = sc.b, L = sc.L, rho = BRASS.rho;
  const double m0 = rho * b * h * L, M = sc.mu * m0; // tongue mass, tip weight
  Tongue t{h, b, sc.mu, sc.lam, L, m0, M, {}, 0};
  for (int n = 0; n < 2; n++) {
    const double ln = sc.lam[n];
    const auto shape = [ln](double u) { return modeShape(ln, u); };
    const double I1 = simpson(shape), I2 = simpson([&](double u) { const double s = shape(u); return s * s; });
    const double m = m0 * I2 + M, om = (ln * ln * std::sqrt((BRASS.E * h * h) / (12 * rho))) / (L * L);
    const double zeta = (n == 0 ? 1 : DESIGN.zeta2) / (2 * q);
    const double I3 = simpson([&](double u) { return std::pow(shape(u), 3); });
    t.modes[n] = Mode{n, ln, om / TAU, om, m, m * om * om, b * L * I1, I1, I2, I3, zeta};
  }
  t.sag = 0 + t.modes[0].S / t.modes[0].k + t.modes[1].S / t.modes[1].k; // static tip deflection per pascal
  return t;
}
static const Tongue &ref() { static const Tongue t = tongue(F_REF, 500); return t; } // the C4 reed: the knobs are set at C4

// One reed, voiced. The voicer's rules (all scaled from C4, where the knobs are set):
//  - the set y0 grows with the reed's length and a little with how far the wind bends it,
//    ∝ L^0.8 (deflection at P_NOM)^0.2, so the soft bass reeds stand well clear of their slots
//    and the stiff treble ones close to them;
//  - the clearance δ ∝ length; the plate is e = 0.6 mm + 0.03 L thick;
//  - the throat's air mass is sized against the jet's resistance at the working point:
//    ω M_a = 0.4 u* R_j, where u* is the inertance that drives a blown-closed reed hardest well
//    above threshold (the voicer gives up some of that drive for a lower threshold); the Air
//    mass knob multiplies it;
//  - the cell's volume puts its Helmholtz resonance with the throat 3× above the reed (× the
//    Cell knob's 1/√ ratio), and the pallet opens 6× the reed's working gap.
void reedDesign(double fNat, const Voicing &P, ReedModel &d) {
  const Tongue t = tongue(fNat, P.q), &REF = ref();
  const double h = t.h, b = t.b, L = t.L;
  const auto &modes = t.modes;
  const double lr = L / REF.L;
  const double e = DESIGN.plate0 + DESIGN.plate1 * L;
  const double delta = P.clearance * 1e-6 * std::pow(lr, DESIGN.deltaExp);
  const double y0 = P.set * 1e-3 * std::pow(t.sag / REF.sag, DESIGN.setExp) * std::pow(lr, DESIGN.setLen);
  const Geo geo{L, b, h, e, delta, t.lam, t.mu, y0};
  const double perim = 2 * L * modes[0].I1 + b; // dA/dy above the plate
  // the working point: deflected by P_NOM, the jet at √(2 P_NOM/ρ)
  const double yNom = -y0 + P_NOM * t.sag, Anom = slotArea(yNom, geo), xNom = std::sqrt((2 * P_NOM) / AIR.rho);
  const double Rj = (AIR.rho * xNom) / (CD * Anom);
  const double eps = (modes[0].om * modes[0].S) / (CD * xNom * perim), uOpt = std::sqrt(1 + eps * eps) - eps;
  const double Ma = (DESIGN.throat * P.throat * uOpt * Rj) / modes[0].om;
  const double omCell = (TAU * DESIGN.cellRatio * fNat) / std::sqrt(P.cell);
  const double C = 1 / (Ma * omCell * omCell), V = C * AIR.rho * AIR.c * AIR.c;
  const double Ain = DESIGN.inlet * Anom;
  const double ca = CD * Ain, K = (0.5 * AIR.rho) / (ca * ca); // orifice: Δp = K U|U|
  // the air's form drag on the swinging tongue: on mode 1, −D|ẏ|ẏ
  const double drag = 0.5 * AIR.rho * DESIGN.cd * b * L * modes[0].I3;
  d.fNat = fNat; d.geo = geo; d.modes = modes; d.perim = perim; d.Ma = Ma; d.C = C; d.V = V; d.Ain = Ain; d.K = K;
  d.lj = e + h; d.drag = drag; d.fCell = omCell / TAU; d.m0 = t.m0; d.M = t.M; d.sag = t.sag; d.Anom = Anom; d.Rj = Rj;
  d.eps = eps; d.uOpt = uOpt; d.throatLA = Ma / AIR.rho;
}

// The voicer's tuning (tuning-table.h): how far the default wind pulls a reed below its natural pitch.
double tuneRatio(double fSound) {
  const double u = clamp(12 * std::log2(fSound / keyFreq(TUNE_LO)), 0, TUNE_N - 1), j = std::min((double)TUNE_N - 2, std::floor(u));
  const int i = (int)j;
  return TUNE[i] + (TUNE[i + 1] - TUNE[i]) * (u - j);
}
void reedModel(double fSound, const Voicing &P, ReedModel &d, bool tuned) {
  const double r = tuned ? tuneRatio(fSound) : 1;
  reedDesign(fSound / r, P, d);
  d.fSound = fSound; d.tune = r;
  areaTable(d.geo, d.table);
}

// ---------------------------------------------------------------------------
// The steady state at wind pressure Pw (no motion).
Equilibrium equilibrium(const ReedModel &R, double Pw, double pd) {
  Area a{0, 0};
  double dp = Pw, x = 0, y = 0, U = 0;
  for (int it = 0; it < 200; it++) {
    y = 0;
    for (const Mode &md : R.modes) y += (md.n == 0 ? -R.geo.y0 : 0) + (md.S * dp) / md.k;
    a = areaAt(R.table, y);
    x = dp > 0 ? (-EPS_V + std::sqrt(EPS_V * EPS_V + 2 * AIR.rho * dp)) / AIR.rho : 0;
    U = CD * a.A * x;
    const double next = Pw - R.K * U * U - pd;
    if (std::fabs(next - dp) < 1e-10 * Pw) { dp = next; break; }
    dp += 0.7 * (next - dp);
  }
  return {y, x, U, dp, Pw - R.K * U * U, a.A, a.dA};
}

// ---------------------------------------------------------------------------
// Small oscillations about the steady state ∝ e^{st}:
//   F(s) = 1 + Z_eff(s) Σₙ Sₙ (s Sₙ + G_A) / (mₙ (s² + 2ζₙωₙ s + ωₙ²)) = 0   (solved times Πₙ Dₙ/ωₙ²)
static Cx cadd(Cx a, Cx b) { return {a.re + b.re, a.im + b.im}; }
static Cx cmul(Cx a, Cx b) { return {a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re}; }
static Cx cdiv(Cx a, Cx b) { const double d = b.re * b.re + b.im * b.im; return {(a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d}; }

namespace {
struct Operator {
  const ReedModel &R;
  const Cassotto *cass;
  double Rj, Mj, GA, Rin;
  Operator(const ReedModel &R, double Pw, const Cassotto *cass) : R(R), cass(cass) {
    const Equilibrium eq = equilibrium(R, Pw);
    Rj = (AIR.rho * eq.x + EPS_V) / (CD * eq.A); Mj = (AIR.rho * R.lj) / (CD * eq.A); GA = CD * eq.x * eq.dA; Rin = 2 * R.K * eq.U;
  }
  Cx operator()(Cx s) const {
    const Cx rj{Rj + Mj * s.re, Mj * s.im}; // the jet: its resistance and its air's mass
    const Cx zin{R.Ma * s.re + Rin, R.Ma * s.im};
    Cx zt = cdiv(zin, cadd({1, 0}, cmul({R.C * s.re, R.C * s.im}, zin)));
    if (cass) {
      const Cx zn{cass->M * s.re + cass->R, cass->M * s.im};
      zt = cadd(zt, cdiv(zn, cadd({1, 0}, cmul({cass->C * s.re, cass->C * s.im}, zn))));
    }
    const Cx zeff = cdiv(cmul(zt, rj), cadd(zt, rj));
    Cx ds[2];
    for (int n = 0; n < 2; n++) { const Mode &md = R.modes[n]; ds[n] = cadd(cmul(s, s), {2 * md.zeta * md.om * s.re + md.om * md.om, 2 * md.zeta * md.om * s.im}); }
    Cx prod{1, 0}, sum{0, 0};
    for (int n = 0; n < 2; n++) {
      const Mode &md = R.modes[n];
      const double w2 = md.om * md.om;
      prod = cmul(prod, {ds[n].re / w2, ds[n].im / w2});
      Cx other{1, 0};
      for (int k = 0; k < 2; k++) if (k != n) { const double wk = R.modes[k].om * R.modes[k].om; other = cmul(other, {ds[k].re / wk, ds[k].im / wk}); }
      sum = cadd(sum, cmul(other, {(md.S * (md.S * s.re + GA)) / (md.m * w2), (md.S * md.S * s.im) / (md.m * w2)}));
    }
    return cadd(prod, cmul(zeff, sum));
  }
};
} // namespace

// The root of F near s0 (Newton, complex secant derivative).
std::optional<Cx> linearRoot(const ReedModel &R, double Pw, const Cx *s0, const Cassotto *cass) {
  const Operator F(R, Pw, cass);
  Cx s = s0 ? *s0 : Cx{-R.modes[0].zeta * R.modes[0].om, R.modes[0].om};
  for (int it = 0; it < 60; it++) {
    const Cx f = F(s);
    const double dh = 1e-6 * std::hypot(s.re, s.im);
    const Cx f2 = F({s.re + dh, s.im});
    const Cx df{(f2.re - f.re) / dh, (f2.im - f.im) / dh}; // F is analytic: dF/ds = ∂F/∂re
    const Cx step = cdiv(f, df);
    s = {s.re - step.re, s.im - step.im};
    if (std::hypot(step.re, step.im) < 1e-11 * std::hypot(s.re, s.im)) return s;
  }
  if (std::isfinite(s.re)) return s;
  return std::nullopt;
}
// The threshold blowing pressure: where the reed's root crosses into the right half plane
// (followed from 2 Pa upwards on a log grid, then bisected).
std::optional<Threshold> threshold(const ReedModel &R, double pMax, const Cassotto *cass) {
  auto s = linearRoot(R, 2, nullptr, cass);
  if (!s) return std::nullopt;
  double pPrev = 2;
  Cx sPrev = *s;
  if (s->re > 0) return Threshold{2, s->im / TAU};
  for (double p = 2 * 1.05; p <= pMax; p *= 1.05) {
    const Cx prev = *s;
    const auto sn = linearRoot(R, p, &prev, cass);
    if (!sn) return std::nullopt;
    if (sn->re > 0) {
      double a = pPrev, b = p;
      Cx sa = sPrev;
      for (int i = 0; i < 50; i++) {
        const double m = std::sqrt(a * b);
        const auto sm = linearRoot(R, m, &sa, cass);
        if (!sm) return std::nullopt;
        if (sm->re > 0) b = m; else { a = m; sa = *sm; }
      }
      const auto sf = linearRoot(R, b, &sa, cass);
      if (!sf) return std::nullopt;
      return Threshold{b, sf->im / TAU};
    }
    pPrev = p; sPrev = *sn; s = sn;
  }
  return std::nullopt;
}

// ---------------------------------------------------------------------------
// Pumping: two feeders worked alternately, each delivering ∝ |sin| over its stroke.
double pumpShape(double t, double rate) {
  if (!(rate > 0)) return 1;
  return 1 - WIND.pumpDepth + WIND.pumpDepth * (PI / 2) * std::fabs(std::sin(TAU * rate * t));
}

Cassotto cassotto(double f) {
  constexpr double A = 20e-4, l = 0.03, Q = 2;
  const double M = (AIR.rho * l) / A, om = TAU * f, C = 1 / (M * om * om);
  return {M, C, (om * M) / Q, C * AIR.rho * AIR.c * AIR.c, f};
}

double palletOpen(double vel) { const double u = 1 - clamp(vel, 0, 1); return 0.003 + 0.027 * (u * u); }
double palletClose(double rel) { return rel < 0 ? 0.008 : 0.003 + 0.012 * (1 - clamp(rel, 0, 1)); }
double percussionSpeed(double vel) { return 0.6 * clamp(vel, 0.05, 1); }

} // namespace forte::harmonium
