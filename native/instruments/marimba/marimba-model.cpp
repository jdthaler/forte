// marimba-model.cpp — the marimba's and the xylophone's physics (marimba-model.h).

#include "marimba-model.h"

#include <algorithm>
#include <numbers>

#include "marimba-bars.h"

namespace forte::marimba {

using std::numbers::pi;
using vibraphone::BarModes;
using vibraphone::BendMode;
using vibraphone::TorsMode;

static double clamp(double x, double a, double b) { return std::min(b, std::max(a, x)); }
static int kindOf(int kind) { return kind == XYLOPHONE ? XYLOPHONE : MARIMBA; }
// How far along its compass a key sits, 0 at the bottom and 1 at the top (held past the ends).
static double tKey(int kind, int k) { const Compass c = COMPASS[kindOf(kind)]; return clamp((double)(k - c.lo) / (c.hi - c.lo), 0, 1); }

// ---------------------------------------------------------------------------
// The bars

Blank barBlank(int kind, int k) {
  const double t = tKey(kind, k);
  if (kindOf(kind) == XYLOPHONE) // narrower, thick bars with a short, shallow cut
    return {0.041 * std::pow(0.032 / 0.041, t), 0.024 - 0.004 * t, 0.3, 0.6 - 0.1 * t};
  // the marimba's: wide in the bass, a wide arch with a short flat; narrower up the compass, the
  // cut a narrower slot with a flat bottom (its length found by the tuning)
  return {0.076 * std::pow(0.041 / 0.076, t), 0.024 - 0.005 * t, 0.2 + 0.5 * t, 0};
}

static constexpr bool IS_ACC[12] = {0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0};
static constexpr double SPACE = 0.010; // m between neighbouring naturals
// x of key k's centre, from the bottom of the compass's outer edge (x = 0), naturals side by side
// and each accidental over the gap between two naturals.
Layout barLayout(int kind, int k) {
  const int lo = COMPASS[kindOf(kind)].lo;
  const bool accidental = IS_ACC[k % 12];
  if (accidental) return {true, barLayout(kind, k - 1).x + (barBlank(kind, k - 1).b + SPACE) / 2};
  double x = 0;
  if (k < lo) { // the frame carried on to the left of the compass
    x = -SPACE - barBlank(kind, k).b / 2;
    for (int m = k + 1; m < lo; m++) if (!IS_ACC[m % 12]) x -= barBlank(kind, m).b + SPACE;
  } else for (int m = lo; m <= k; m++) if (!IS_ACC[m % 12]) x += m == k ? barBlank(kind, m).b / 2 : barBlank(kind, m).b + SPACE;
  return {false, x};
}
double frameLength(int kind) {
  const int hi = COMPASS[kindOf(kind)].hi;
  return barLayout(kind, hi).x + barBlank(kind, hi).b / 2;
}
std::array<double, 2> barPan(int kind, int k, double width) {
  // the pan spans the compass's frame; the bars past it take its end bars' places
  const double p = width * clamp((2 * barLayout(kind, k).x) / frameLength(kind) - 1, -1, 1), a = ((p + 1) * pi) / 4;
  return {std::cos(a), std::sin(a)};
}

static Cut cutOf(const Blank &bl, double A, double D, double L) { return {bl.h0, (A * L) / 2, (bl.cf * A * L) / 2, D * bl.h0}; }
static std::array<double, 3> freqs(const Blank &bl, double A, double D, double L) { return vibraphone::bendingFreqs3(cutOf(bl, A, D, L), L, bl.b, 3, ROSEWOOD); }

// The xylophone's two-mode tuning: the cut's length held (A), its depth D and the bar's length L
// found by Newton's method with a finite-difference Jacobian, as tuneUndercut finds three.
static Tuned tuneTwo(const Blank &bl, double f1, double r2, double D, double L) {
  std::array<double, 2> u = {D, std::log(L)};
  auto res = [&](const std::array<double, 2> &v) -> std::array<double, 2> {
    const auto f = freqs(bl, bl.A, v[0], std::exp(v[1]));
    return {std::log(f[1] / f[0] / r2), std::log(f[0] / f1)};
  };
  auto norm = [](const std::array<double, 2> &x) { return std::hypot(x[0], x[1]); };
  std::array<double, 2> r = res(u);
  int it = 0;
  for (; it < 40; it++) {
    if (std::fabs(r[0]) + std::fabs(r[1]) < 1e-9) break;
    double J[2][2];
    const double e = 1e-6;
    for (int j = 0; j < 2; j++) {
      std::array<double, 2> v = u;
      v[j] += e;
      const auto rj = res(v);
      J[0][j] = (rj[0] - r[0]) / e; J[1][j] = (rj[1] - r[1]) / e;
    }
    const double det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    const double s0 = (-r[0] * J[1][1] + r[1] * J[0][1]) / det, s1 = (-J[0][0] * r[1] + J[1][0] * r[0]) / det;
    double s = std::min(1.0, 0.1 / std::max(std::fabs(s0), 1e-12));
    bool moved = false;
    for (int bt = 0; bt < 12 && !moved; bt++, s *= 0.5) {
      const std::array<double, 2> un = {u[0] + s * s0, u[1] + s * s1};
      if (!(un[0] >= 0 && un[0] < 0.92)) continue;
      const auto rn = res(un);
      if (norm(rn) < norm(r)) { u = un; r = rn; moved = true; }
    }
    if (!moved) break;
  }
  const double cents = 1200 / std::numbers::ln2;
  return {std::exp(u[1]), bl.A, u[0], {cents * r[0], 0, cents * r[1]}, it};
}

Tuned tuneBar(int kind, int k, std::array<double, 3> start) {
  kind = kindOf(kind);
  const Blank bl = barBlank(kind, k);
  const double f1 = keyFreq(k);
  if (kind == XYLOPHONE) return tuneTwo(bl, f1, R2[kind], start[1], start[2]);
  const vibraphone::Tuned t = vibraphone::tuneUndercut(f1, bl.b, bl.h0, bl.cf, start, R2[kind], R3[kind], 3, 40, ROSEWOOD);
  return {t.L, t.A, t.D, {t.residualCents[0], t.residualCents[1], t.residualCents[2]}, t.iterations};
}

Geometry barGeometry(int kind, int k, double depth, double ratio) {
  kind = kindOf(kind);
  k = std::min(KEY_MAX, std::max(KEY_MIN, k));
  const Blank bl = barBlank(kind, k);
  // the tuned cut from the table; until the table is made (tools/marimba-bars.mjs), a guess
  // that the loop below brings to pitch
  const bool tabled = BAR_COUNT == KEY_MAX - KEY_MIN + 1;
  const double A = tabled ? BAR_TABLE[kind][k - KEY_MIN].A : kind == XYLOPHONE ? bl.A : 0.5;
  // (deepened past the tuned cut, the cut stops with a twentieth of the bar left under it, CUT_MAX: only
  // the marimba's bars above its real compass, A7 to C8, whose tuned cuts are the deepest, get there)
  const double D = std::min((tabled ? BAR_TABLE[kind][k - KEY_MIN].D : 0.4) * depth, vibraphone::CUT_MAX);
  double L = tabled ? BAR_TABLE[kind][k - KEY_MIN].L : std::sqrt(0.6 * bl.h0 * std::sqrt(ROSEWOOD.E / ROSEWOOD.rho) / keyFreq(k));
  if (!tabled || depth != 1 || ratio != 1) {
    // at a fixed shape f₁ ∝ 1/L², nearly (shear and rotary inertia add a little)
    L /= std::sqrt(ratio);
    for (int it = 0; it < 12; it++) {
      const double r = freqs(bl, A, D, L)[0] / (keyFreq(k) * ratio);
      L *= std::sqrt(r);
      if (std::fabs(r - 1) < 1e-9) break;
    }
  }
  return {kind, k, L, bl.b, bl.h0, bl.cf, A, D, depth, cutOf(bl, A, D, L)};
}

// A thin strip moving normal to itself radiates as a line of dipoles (as the vibraphone's bars):
// J = ∫(1 − μ²)|I(μ)|² dμ, with a density per unit length that is constant along the bar.
static double radiationJ(const std::vector<double> &xs, const std::vector<double> &shape, double density, double k, double L) {
  const int nx = (int)xs.size(), NM = 24;
  double J = 0;
  for (int j = 0; j < NM; j++) {
    const double mu = -1 + (2 * (j + 0.5)) / NM;
    double re = 0, im = 0;
    for (int i = 0; i < nx; i++) {
      const double wq = (i == 0 || i == nx - 1 ? 0.5 : 1) * (xs[1] - xs[0]);
      const double ph = k * (xs[i] - L / 2) * mu, v = density * shape[i] * wq;
      re += v * std::cos(ph); im += v * std::sin(ph);
    }
    J += (1 - mu * mu) * (re * re + im * im) * (2.0 / NM);
  }
  return J;
}

double interp(const std::vector<double> &xs, const std::vector<double> &ys, double x) {
  const int n = (int)xs.size();
  const double u = clamp(((x - xs[0]) / (xs[n - 1] - xs[0])) * (n - 1), 0, n - 1 - 1e-9), i = std::floor(u), f = u - i;
  return ys[(int)i] * (1 - f) + ys[(int)i + 1] * f;
}
double interp(const double *ys, int nx, double L, double x) {
  const double u = clamp((x / L) * (nx - 1), 0, nx - 1 - 1e-9), i = std::floor(u), f = u - i;
  return ys[(int)i] * (1 - f) + ys[(int)i + 1] * f;
}

BarModel barModel(int kind, int k, double depth, double ratio) {
  const Geometry g = barGeometry(kind, k, depth, ratio);
  const BarModes m = vibraphone::barModes(g.cut, g.L, g.b, 97, 3, 5, 2, ROSEWOOD);
  const double c = C_AIR, rho = RHO_AIR;
  const std::vector<double> &xs = m.xs, &w1 = m.bend[0].w;
  // the cords pass through the bar at mode 1's nodes
  std::vector<double> nodes;
  for (size_t i = 1; i < xs.size(); i++) if (w1[i - 1] * w1[i] < 0) nodes.push_back(xs[i - 1] + ((xs[i] - xs[i - 1]) * w1[i - 1]) / (w1[i - 1] - w1[i]));
  auto at = [&](const std::vector<double> &sh, double x) { return interp(xs, sh, x); };
  auto slope = [&](const std::vector<double> &sh, double x) { return (at(sh, x + 1e-4) - at(sh, x - 1e-4)) / 2e-4; };
  auto supportSigma = [&](const std::vector<double> &sh) {
    double s = 0;
    for (double x : nodes) s = s + 0.5 * SUPPORT.r * (std::pow(at(sh, x), 2) + std::pow(SUPPORT.halfWidth * slope(sh, x), 2) / 3);
    return s;
  };
  auto dip = [&](double kw) { return 1 / std::sqrt(1 + std::pow((kw * g.b) / 2, 2)); };
  BarModel model{g.kind, g.key, g, xs, {}, nodes, m.mass, g.h0 - g.cut.d};
  for (size_t n = 0; n < m.bend.size(); n++) {
    const BendMode &md = m.bend[n];
    const double kw = (TAU * md.f) / c, J = radiationJ(xs, md.w, (pi * g.b * g.b) / 4, kw, g.L);
    const double sigRad = (rho * c * std::pow(kw, 4) * J * std::pow(dip(kw), 2)) / (32 * pi);
    model.modes.push_back({false, (int)n + 1, md.f, md.f / m.bend[0].f, md.sym, md.w, supportSigma(md.w), sigRad, (kw * std::sqrt(J) * dip(kw)) / 2});
  }
  for (size_t n = 0; n < m.tors.size(); n++) {
    const TorsMode &md = m.tors[n];
    const double kw = (TAU * md.f) / c, J = radiationJ(xs, md.psi, (pi * std::pow(g.b, 4) * kw) / 128, kw, g.L);
    const double sigRad = (rho * c * std::pow(kw, 4) * J * std::pow(dip(kw), 2)) / (32 * pi);
    // torsion: the cords sit on the centre line, so they barely touch it
    model.modes.push_back({true, (int)n + 1, md.f, md.f / m.bend[0].f, md.sym, md.psi, 0, sigRad, (kw * std::sqrt(J) * dip(kw)) / 2});
  }
  return model;
}

// ---------------------------------------------------------------------------
// The resonators

double tubeRadius(int kind, int k) {
  const double t = tKey(kind, k);
  return kindOf(kind) == XYLOPHONE ? 0.026 * std::pow(0.015 / 0.026, t) : 0.045 * std::pow(0.020 / 0.045, t);
}

double mouthVolume(const double *w, int nx, double L, double b, double a, double offset) {
  const int N = 64;
  const double xc = L / 2 + offset * L;
  double Sb = 0;
  for (int i = 0; i < N; i++) {
    const double x = -a + (2 * a * (i + 0.5)) / N, chord = std::min(b, 2 * std::sqrt(std::max(0.0, a * a - x * x)));
    const double X = xc + x;
    if (X < 0 || X > L) continue; // past the bar's end: nothing above the mouth there
    Sb += chord * interp(w, nx, L, X) * ((2 * a) / N);
  }
  return Sb;
}

TubeState tubeState(double a, double b, double f1, double gap, double detune) {
  const double g = std::max(1e-3, gap), S = pi * a * a, Rb = std::min(b / 2, a);
  // cut so that, with the bar in place, its first resonance is the bar's (× the detune)
  const double wT = TAU * f1 * std::pow(2.0, detune / 1200), lx = (std::log(1 + Rb / g) * S) / (TAU * g);
  const double le = -lx + std::sqrt(lx * lx + std::pow((pi * C_AIR) / (2 * wT), 2));
  TubeState ts{};
  ts.le = le; ts.length = le - 0.61 * a; ts.Rb = Rb;
  ts.ma = (RHO_AIR * le) / (2 * S);
  ts.mg = gapInertance(g, Rb);
  for (int m = 0; m < 2; m++) {
    const double om = ((2 * m + 1) * pi * C_AIR) / (2 * le); // a quarter wave, then three quarters
    ts.Ka[m] = ts.ma * om * om;
    ts.ft[m] = std::sqrt(ts.Ka[m] / (ts.ma + ts.mg)) / TAU;
    const double f = ts.ft[m], k = (TAU * f) / C_AIR, sw = 2.95e-5 * std::sqrt(f) / a * C_AIR;
    // radiation from the mouth (a small monopole), the walls' boundary layers, and the plug at the
    // closed end (thermal: it sits at a pressure antinode), scaled from the walls' as the vibraphone's
    const double Rrad = (RHO_AIR * C_AIR * k * k) / (4 * pi), Rwall = 2 * sw * ts.ma;
    const double Rplug = (0.32 * sw * 2 * ts.ma / (pi * a * le)) * pi * a * a;
    ts.R[m] = Rrad + Rwall + Rplug;
  }
  return ts;
}

// ---------------------------------------------------------------------------

VoiceData voiceData(int kind, int k, double depth, double ratio) {
  const BarModel bar = barModel(kind, k, depth, ratio);
  const int nx = (int)bar.xs.size(), N = (int)bar.modes.size();
  VoiceData d;
  d.key = k; d.kind = kindOf(kind); d.depth = depth; d.ratio = ratio; d.L = bar.geom.L; d.b = bar.geom.b; d.a = tubeRadius(kind, k);
  d.nx = nx; d.N = N; d.nb = 0;
  d.w.resize(N * nx);
  for (int i = 0; i < N; i++) {
    const Mode &m = bar.modes[i];
    std::copy(m.w.begin(), m.w.end(), d.w.begin() + i * nx);
    if (!m.tors) d.nb++;
    d.f.push_back(m.f);
    d.tors.push_back(m.tors ? 1 : 0);
    d.sigFixed.push_back(m.sigSup + m.sigRad);
    d.out.push_back(m.out);
  }
  d.pan = barPan(kind, k);
  return d;
}

// key, kind, depth, ratio, L, b, a, nx, N, nb, pan (2), then N × (f, tors, sigFixed, out), then w (N × nx)
int packVoiceData(const VoiceData &d, double *out) {
  int n = 0;
  for (double v : {(double)d.key, (double)d.kind, d.depth, d.ratio, d.L, d.b, d.a, (double)d.nx, (double)d.N, (double)d.nb, d.pan[0], d.pan[1]}) out[n++] = v;
  for (int i = 0; i < d.N; i++) for (double v : {d.f[i], (double)d.tors[i], d.sigFixed[i], d.out[i]}) out[n++] = v;
  for (double v : d.w) out[n++] = v;
  return n;
}
bool unpackVoiceData(const double *in, int n, VoiceData &d) {
  if (n < PACK_HEAD) return false;
  const int nx = (int)in[7], N = (int)in[8];
  if (!(nx >= 2 && nx <= 128 && N >= 2 && N <= 8 && n == PACK_HEAD + 4 * N + N * nx)) return false;
  d.key = (int)in[0]; d.kind = (int)in[1]; d.depth = in[2]; d.ratio = in[3]; d.L = in[4]; d.b = in[5]; d.a = in[6];
  d.nx = nx; d.N = N; d.nb = (int)in[9]; d.pan = {in[10], in[11]};
  const double *m = in + PACK_HEAD;
  d.f.resize(N); d.tors.resize(N); d.sigFixed.resize(N); d.out.resize(N);
  for (int i = 0; i < N; i++, m += 4) { d.f[i] = m[0]; d.tors[i] = m[1] != 0; d.sigFixed[i] = m[2]; d.out[i] = m[3]; }
  d.w.assign(m, m + N * nx);
  return true;
}

} // namespace forte::marimba
