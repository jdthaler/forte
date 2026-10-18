// pipes-model.cpp — the flue pipes' physics (pipes-model.h).

#include "pipes-model.h"

#include <algorithm>

#include "tuning-table.h"

namespace forte::pipes {

namespace {
constexpr double PI = std::numbers::pi;
inline Cx cmul(Cx a, Cx b) { return {a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re}; }
inline Cx cdiv(Cx a, Cx b) {
  const double d = b.re * b.re + b.im * b.im;
  return {(a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d};
}
} // namespace

const int *mixtureRanks(int key) {
  const MixtureRow *m = &MIXTURE[0];
  for (const MixtureRow &x : MIXTURE) if (key >= x.from) m = &x;
  return m->h;
}
int rankHarm(int key, int r) {
  if (r == 0 || r == 2) return 1;
  if (r == 1) return 2;
  return mixtureRanks(key)[r - 3];
}

double jsHypot(double x, double y) {
  if (std::isinf(x) || std::isinf(y)) return INFINITY;
  if (std::isnan(x) || std::isnan(y)) return NAN;
  const double ax = std::fabs(x), ay = std::fabs(y);
  double max = 0;
  if (ax > max) max = ax;
  if (ay > max) max = ay;
  if (max == 0) return 0;
  double sum = 0, compensation = 0;
  for (double v : {ax, ay}) {
    const double n = v / max, summand = n * n - compensation, preliminary = sum + summand;
    compensation = (preliminary - sum) - summand;
    sum = preliminary;
  }
  return std::sqrt(sum) * max;
}

// Rayleigh's conductivity of an elliptic hole (semi-axes a ≥ b) in a thin wall: K = 2a·AGM(1, b/a).
double agm(double x, double y) {
  for (int i = 0; i < 30 && std::fabs(x - y) > 1e-15 * x; i++) { const double nx = (x + y) / 2, ny = std::sqrt(x * y); x = nx; y = ny; }
  return x;
}
double ellipseConductivity(double a, double b) {
  if (b > a) std::swap(a, b);
  return 2 * a * agm(1, b / a);
}
// The mouth's end correction: the pipe's area over the conductivity of an ellipse of the mouth's
// area and aspect (H × W).
double mouthCorrection(double Sp, double H, double W) {
  const double k = 2 / std::sqrt(PI);
  return Sp / ellipseConductivity((k * H) / 2, (k * W) / 2);
}
// Losses of a mode (amplitude decay rate σ, 1/s): the wall's boundary layers and radiation.
double wallAlpha(double f, double a) {
  return (std::sqrt((TAU * f * AIR.nu) / 2) * (1 + (AIR.gamma - 1) / std::sqrt(AIR.Pr))) / (a * AIR.c);
}
double modeSigma(double f, double a, double Le, int openings) {
  const double k = (TAU * f) / AIR.c;
  return AIR.c * wallAlpha(f, a) + (openings * std::pow(k * a, 2) * AIR.c) / (4 * Le);
}

// ---- one pipe, voiced ---------------------------------------------------------------------------

namespace {
void modesFor(PipeModel &pipe, double Le, double a, bool stopped) {
  const int openings = stopped ? 1 : 2, max = stopped ? MODES_STOPPED : MODES_OPEN;
  pipe.nModes = 0;
  for (int n = 1; n <= max; n++) {
    const double fn = modeFreq(n, Le, stopped);
    if (fn > F_MAX) break;
    const double sig = modeSigma(fn, a, Le, openings);
    pipe.modes[pipe.nModes++] = {n, fn, TAU * fn, sig, (TAU * fn) / (2 * sig), stopped ? 2 * n - 1 : n};
  }
}
void jetGeometry(Geometry &geo, double W, double off) {
  const double h = geo.h, H = geo.H, b = 0.4 * h, y0 = off * b, dd = (4 / PI) * std::sqrt(2 * h * W), Sm = H * W;
  const double sech2 = 1 / std::pow(std::cosh(y0 / b), 2);
  // the jet's gain per unit amplification: Δp = s·Kj·A·H_lp(s)·e^(−sτ)·Q_ac
  geo.W = W; geo.b = b; geo.y0 = y0; geo.dd = dd; geo.Sm = Sm;
  geo.Kj = (AIR.rho * dd * H * h * sech2) / (Sm * Sm);
  geo.dLm = mouthCorrection(geo.Sp, H, W);
}
void setLength(PipeModel &pipe, double Le) {
  pipe.Le = Le; pipe.M = (AIR.rho * Le) / (2 * pipe.geo.Sp);
  modesFor(pipe, Le, pipe.geo.a, pipe.stopped);
}
void setGain(PipeModel &pipe, double g) { // A for a loop gain g on the fundamental's resonance at the default wind
  const Mode &m1 = pipe.modes[0];
  const double tau = pipe.geo.W / (CP * U_NOM), lp = 1 / jsHypot(1, (m1.om * tau) / PHI_C);
  pipe.A = (2 * m1.sigma * pipe.M * g) / (m1.om * pipe.Kj * lp);
}
} // namespace

PipeModel pipeModel(double f, bool stopped, const Voicing &P, const ModelOptions &opts) {
  const double scale = opts.scale >= 0 ? opts.scale : (stopped ? 0.85 : 1);
  const double cut = P.cutup, gainK = P.gain, off = P.offset, g = voicedGain(f) * gainK;
  const double D = toepferD(f) * scale, a = D / 2, Sp = PI * a * a, H = SCALE.mouth * PI * D;
  const double h = SCALE.h0 * std::pow(D / SCALE.D0, SCALE.hExp);
  const double theta = stopped ? THETA_STOPPED : THETA_OPEN;
  const double W0 = opts.W >= 0 ? opts.W : U_NOM / (theta * f);
  PipeModel pipe;
  pipe.f = f; pipe.stopped = stopped; pipe.theta = theta;
  Geometry &geo = pipe.geo;
  geo.D = D; geo.a = a; geo.Sp = Sp; geo.H = H; geo.h = h; geo.stopped = stopped; geo.dLt = stopped ? 0 : LS_END * a;
  // voice and cut at the default cut-up
  jetGeometry(geo, W0, off); pipe.Kj = geo.Kj;
  setLength(pipe, stopped ? AIR.c / (4 * f) : AIR.c / (2 * f));
  setGain(pipe, g);
  if (opts.retune) {
    for (int it = 0; it < 8; it++) {
      const std::optional<Cx> s = linearRoot(pipe, P_NOM, 0);
      if (!s) break;
      const double k = f / (s->im / TAU);
      setLength(pipe, pipe.Le / k); setGain(pipe, g);
      if (std::fabs(k - 1) < 1e-8) break;
    }
  }
  if (opts.tune != 0 && opts.tune != 1) { setLength(pipe, pipe.Le / opts.tune); setGain(pipe, g); }
  pipe.L = pipe.Le - geo.dLm - geo.dLt; // the speaking length, as cut
  // the Cut-up knob: the same pipe, its mouth cut higher or lower, re-voiced to the same gain
  if (cut != 1) {
    jetGeometry(geo, W0 * cut, off); pipe.Kj = geo.Kj;
    setLength(pipe, pipe.L + geo.dLm + geo.dLt); setGain(pipe, g);
  }
  pipe.fRes = pipe.modes[0].f;
  pipe.Q1 = pipe.modes[0].Q;
  pipe.gain = g;
  return pipe;
}

// ---- the linear analysis ------------------------------------------------------------------------

Cx admittance(const PipeModel &pipe, Cx s) { // Y(s): mouth volume flow per pascal of source
  Cx y = {0, 0};
  for (int k = 0; k < pipe.nModes; k++) {
    const Mode &m = pipe.modes[k];
    const Cx den = {s.re * s.re - s.im * s.im + 2 * m.sigma * s.re + m.om * m.om, 2 * s.re * s.im + 2 * m.sigma * s.im};
    const Cx q = cdiv(s, den);
    y = {y.re + q.re / pipe.M, y.im + q.im / pipe.M};
  }
  return y;
}
double jetDelay(const PipeModel &pipe, double p) {
  const double Uj = std::sqrt((2 * std::max(p, 1e-9)) / AIR.rho);
  return pipe.geo.W / (CP * Uj);
}
Cx loopGain(const PipeModel &pipe, Cx s, double p) {
  const double tau = jetDelay(pipe, p);
  const double e = std::exp(-s.re * tau);
  const Cx del = {e * std::cos(-s.im * tau), e * std::sin(-s.im * tau)};
  const Cx H = cdiv({1, 0}, {1 + (s.re * tau) / PHI_C, (s.im * tau) / PHI_C});
  Cx L = cmul(admittance(pipe, s), {s.re * pipe.Kj * pipe.A, s.im * pipe.Kj * pipe.A});
  L = cmul(cmul(L, H), del);
  return L;
}

namespace {
// Mode n's own pole multiplied out: F(s) = Dₙ(s)(1 − Σ_{m≠n} YₘG) − (s/M)G, smooth at the pole.
Cx rootF(const PipeModel &pipe, Cx s, double p, int n) {
  const Mode &m = pipe.modes[n];
  const double tau = jetDelay(pipe, p);
  const double e = std::exp(-s.re * tau);
  const Cx del = {e * std::cos(-s.im * tau), e * std::sin(-s.im * tau)};
  const Cx H = cdiv({1, 0}, {1 + (s.re * tau) / PHI_C, (s.im * tau) / PHI_C});
  const Cx G = cmul(cmul({s.re * pipe.Kj * pipe.A, s.im * pipe.Kj * pipe.A}, H), del);
  Cx yo = {0, 0};
  for (int k = 0; k < pipe.nModes; k++) {
    if (k == n) continue;
    const Mode &q = pipe.modes[k];
    const Cx den = {s.re * s.re - s.im * s.im + 2 * q.sigma * s.re + q.om * q.om, 2 * s.re * s.im + 2 * q.sigma * s.im};
    const Cx y = cdiv(s, den);
    yo = {yo.re + y.re / pipe.M, yo.im + y.im / pipe.M};
  }
  const Cx D = {s.re * s.re - s.im * s.im + 2 * m.sigma * s.re + m.om * m.om, 2 * s.re * s.im + 2 * m.sigma * s.im};
  const Cx LG = cmul(yo, G), a = cmul(D, {1 - LG.re, -LG.im}), b = cmul({s.re / pipe.M, s.im / pipe.M}, G);
  return {(a.re - b.re) / (m.om * m.om), (a.im - b.im) / (m.om * m.om)};
}
} // namespace

std::optional<Cx> linearRoot(PipeModel &pipe, double p, int n, int steps) {
  if (n < 0 || n >= pipe.nModes) return std::nullopt;
  const Mode m = pipe.modes[n];
  Cx s = {-m.sigma, m.om * std::sqrt(std::max(0.0, 1 - std::pow(m.sigma / m.om, 2)))};
  const double A = pipe.A;
  bool ok = true;
  for (int k = 1; k <= steps && ok; k++) {
    pipe.A = (A * k) / steps;
    ok = false;
    for (int it = 0; it < 50; it++) {
      const Cx f0 = rootF(pipe, s, p, n);
      const double hh = 1e-7 * m.om;
      const Cx f1 = rootF(pipe, {s.re + hh, s.im}, p, n);
      const Cx step = cdiv(f0, {(f1.re - f0.re) / hh, (f1.im - f0.im) / hh});
      const double ms = jsHypot(step.re, step.im), lim = 0.05 * m.om, sc = ms > lim ? lim / ms : 1;
      s = {s.re - sc * step.re, s.im - sc * step.im};
      if (ms < 1e-10 * m.om) { ok = true; break; }
    }
  }
  pipe.A = A;
  if (!ok || !(s.im > 0)) return std::nullopt;
  return s;
}

Window speakingWindow(PipeModel &pipe, int n, double thetaLo, double thetaHi) {
  const auto th2p = [&](double th) { return 0.5 * AIR.rho * std::pow(th * pipe.f * pipe.geo.W, 2); };
  const auto reAt = [&](double th) { const std::optional<Cx> s = linearRoot(pipe, th2p(th), n); return s ? s->re : -INFINITY; };
  constexpr int N = 160;
  Window w;
  for (int i = 0; i <= N; i++) { const double th = thetaLo * std::pow(thetaHi / thetaLo, (double)i / N); w.grid.push_back({th, reAt(th)}); }
  for (int i = 1; i <= N; i++) {
    const double ta = w.grid[i - 1][0], ra = w.grid[i - 1][1], tb = w.grid[i][0], rb = w.grid[i][1];
    if ((ra > 0) != (rb > 0) && std::isfinite(ra) && std::isfinite(rb)) {
      double lo = ta, hi = tb, rlo = ra; // bisect
      for (int k = 0; k < 40; k++) { const double mid = std::sqrt(lo * hi), r = reAt(mid); if ((r > 0) == (rlo > 0)) { lo = mid; rlo = r; } else hi = mid; }
      w.edges.push_back(std::sqrt(lo * hi));
    }
  }
  return w;
}

double tuning(double f, bool stopped) {
  const TuneRow *t = stopped ? TUNING_STOPPED : TUNING_OPEN;
  const int n = stopped ? (int)std::size(TUNING_STOPPED) : (int)std::size(TUNING_OPEN);
  if (!n) return 1;
  const double x = std::log2(f);
  if (x <= t[0].x) return t[0].tune;
  for (int i = 1; i < n; i++) if (x <= t[i].x) { const double x0 = t[i - 1].x, y0 = t[i - 1].tune, x1 = t[i].x, y1 = t[i].tune; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return t[n - 1].tune;
}

// ---- the pallet, the wind, the chest ------------------------------------------------------------

double palletTime(double velocity, double rise) {
  return (rise / 1000) * std::pow(2.0, (0.7 - std::max(0.0, std::min(1.0, velocity))) / 0.3);
}
double closeTime(double velocity) { return velocity < 0 ? 0.008 : 0.02 - 0.017 * std::max(0.0, std::min(1.0, velocity)); }

WindSystem windSystem(double stiff) {
  const double s = std::max(0.0, std::min(1.0, stiff)), Cc = WIND.Vc / (AIR.rho * AIR.c * AIR.c);
  const double Mt = WIND.Mt0 * std::pow(WIND.Mt1 / WIND.Mt0, s), Gs = WIND.Gs * std::pow(1 - s, 2);
  return {Cc, Mt, Gs, WIND.Gr, WIND.Gr * WIND.tauR, WIND.Rt, 1 / (TAU * std::sqrt(Mt * Cc))};
}

double chestPan(int key) {
  const double side = (key - KEY_LO) % 2 == 0 ? -1 : 1;
  const double u = (double)(key - KEY_LO) / (KEY_HI - KEY_LO);
  return side * (0.2 + 0.75 * (1 - u));
}

} // namespace forte::pipes
