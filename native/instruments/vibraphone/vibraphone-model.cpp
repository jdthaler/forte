// vibraphone-model.cpp — the vibraphone's physics (vibraphone-model.h).

#include "vibraphone-model.h"

#include <algorithm>

#include "bar-table.h"

namespace forte::vibraphone {

using std::numbers::pi;

static double clamp(double x, double a, double b) { return std::min(b, std::max(a, x)); }
static double tKey(int k) { return clamp((double)(k - KEY_LO) / (KEY_HI - KEY_LO), 0, 1); }

// ---------------------------------------------------------------------------
// The bars

Blank barBlank(int k) {
  const double t = tKey(k);
  return {0.057 - 0.019 * t, 0.0127, 0.22 + 0.63 * t};
}

static constexpr bool IS_ACC[12] = {0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0};
Layout barLayout(int k) {
  int nat = 0, acc = 0;
  double x = 0;
  for (int m = KEY_LO; m < k; m++) if (IS_ACC[m % 12]) acc++; else nat++;
  for (int m = k; m < KEY_LO; m++) if (IS_ACC[m % 12]) acc--; else nat--; // below F3: counted back from it
  const bool accidental = IS_ACC[k % 12];
  // naturals sit side by side (bar width + 8 mm); an accidental sits over the gap between two naturals
  if (accidental) x = barLayout(k - 1).x + (barBlank(k - 1).b + 0.008) / 2;
  else if (k < KEY_LO) { // the frame carried on to the left of F3 (x = 0 is F3's outer edge)
    x = -0.008 - barBlank(k).b / 2;
    for (int m = k + 1; m < KEY_LO; m++) if (!IS_ACC[m % 12]) x -= barBlank(m).b + 0.008;
  } else for (int m = KEY_LO; m <= k; m++) if (!IS_ACC[m % 12]) x += m == k ? barBlank(m).b / 2 : barBlank(m).b + 0.008;
  return {accidental, accidental ? acc : nat, x};
}
double frameLength() {
  static const double frame = barLayout(KEY_HI).x + barBlank(KEY_HI).b / 2;
  return frame;
}

std::array<double, 2> barPan(int k, double width) {
  // the pan spans the F3–F6 frame; the bars past it take its end bars' places
  const double p = width * clamp((2 * barLayout(k).x) / frameLength() - 1, -1, 1), a = ((p + 1) * pi) / 4;
  return {std::cos(a), std::sin(a)};
}

Geometry barGeometry(int k, double depth) {
  k = std::min(KEY_MAX, std::max(KEY_MIN, k));
  const Blank bl = barBlank(k);
  const BarRow &row = BAR_TABLE[k - KEY_MIN];
  const double A = row.A, D = row.D * depth;
  auto cutFor = [&](double L) { return Cut{bl.h0, (A * L) / 2, (bl.cf * A * L) / 2, D * bl.h0}; };
  double L = row.L;
  if (depth != 1) {
    // at a fixed shape f₁ ∝ 1/L², nearly (shear and rotary inertia add a little)
    for (int it = 0; it < 8; it++) {
      const double f1 = bendingFreqs3(cutFor(L), L, bl.b)[0], r = f1 / keyFreq(k);
      L *= std::sqrt(r);
      if (std::fabs(r - 1) < 1e-9) break;
    }
  }
  return {k, L, bl.b, bl.h0, bl.cf, A, D, depth, cutFor(L)};
}

static const double D_TH = THERMO.k / (AL.rho * THERMO.cp);
double zener(double h, double f) {
  const double wt = (TAU * f * h * h) / (pi * pi * D_TH);
  return (ZENER_DELTA * wt) / (1 + wt * wt);
}

// A thin strip moving normal to itself radiates as a line of dipoles:
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

BarModel barModel(int k, double depth) {
  const Geometry g = barGeometry(k, depth);
  const BarModes m = barModes(g.cut, g.L, g.b);
  const Air ar = air(T_TUNE);
  const double c = ar.c, rho = ar.rho;
  const std::vector<double> &xs = m.xs, &w1 = m.bend[0].w;
  // the cords hang at mode 1's nodes
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
  BarModel model{g.key, g, xs, {}, nodes, m.mass, g.h0 - g.cut.d};
  for (size_t n = 0; n < m.bend.size(); n++) {
    const BendMode &md = m.bend[n];
    const double kw = (TAU * md.f) / c, J = radiationJ(xs, md.w, (pi * g.b * g.b) / 4, kw, g.L);
    const double sigRad = (rho * c * std::pow(kw, 4) * J * std::pow(dip(kw), 2)) / (32 * pi);
    double eta = 0;
    for (const auto &e : md.elems) eta += e.share * zener(e.h, md.f);
    model.modes.push_back({false, (int)n + 1, md.f, md.f / m.bend[0].f, md.sym, md.w, pi * md.f * eta, supportSigma(md.w), sigRad,
                           (kw * std::sqrt(J) * dip(kw)) / 2});
  }
  for (size_t n = 0; n < m.tors.size(); n++) {
    const TorsMode &md = m.tors[n];
    const double kw = (TAU * md.f) / c, J = radiationJ(xs, md.psi, (pi * std::pow(g.b, 4) * kw) / 128, kw, g.L);
    const double sigRad = (rho * c * std::pow(kw, 4) * J * std::pow(dip(kw), 2)) / (32 * pi);
    // torsion: the cords sit on the centre line, so they barely touch it; no bending, so no thermoelastic loss
    model.modes.push_back({true, (int)n + 1, md.f, md.f / m.bend[0].f, md.sym, md.psi, 0, 0, sigRad, (kw * std::sqrt(J) * dip(kw)) / 2});
  }
  return model;
}

// ---------------------------------------------------------------------------
// The resonators

double tubeRadius(int k) { return 0.038 * std::pow(0.021 / 0.038, tKey(k)); }

TubeGeometry tubeGeometry(int k, const BarModel &bar) {
  const double a = tubeRadius(k), L = bar.geom.L, b = bar.geom.b;
  const std::vector<double> &w1 = bar.modes[0].w;
  const int N = 64;
  double Sb = 0;
  for (int i = 0; i < N; i++) {
    const double x = -a + (2 * a * (i + 0.5)) / N, chord = std::min(b, 2 * std::sqrt(std::max(0.0, a * a - x * x)));
    Sb += chord * interp(bar.xs, w1, L / 2 + x) * ((2 * a) / N);
  }
  return {a, pi * a * a, std::fabs(Sb), std::min(b / 2, a), 0.61 * a, 0.25 * a};
}

TubeState tubeState(const TubeGeometry &tg, double f1, double gap, double detune, double temp, double cd) {
  const double g = std::max(1e-3, gap);
  const Air a0 = air(T_TUNE), A = air(temp);
  // cut the tube at the tuning temperature, with the disc open
  const double wT = TAU * f1 * std::pow(2.0, detune / 1200), lx = (std::log(1 + tg.Rb / g) * tg.S) / (TAU * g);
  const double le = -lx + std::sqrt(lx * lx + std::pow((pi * a0.c) / (2 * wT), 2));
  const double ma = (A.rho * le) / (2 * tg.S), Ka = ma * std::pow((pi * A.c) / (2 * le), 2), mg = gapInertance(A.rho, g, tg.Rb);
  const double k = (TAU * f1) / A.c, Rrad = (A.rho * A.c * k * k) / (4 * pi), sw = 2.95e-5 * std::sqrt(f1) / tg.a * A.c;
  TubeState ts;
  ts.length = le - tg.delta0; ts.le = le; ts.ma = ma; ts.Ka = Ka; ts.mg = mg; ts.Sb = tg.Sb; ts.Rrad = Rrad;
  ts.Rwall = 2 * sw * ma; ts.R = Rrad + 2 * sw * ma;
  ts.lvS = (A.rho * tg.lv) / tg.S; ts.cd = cd;
  ts.M11 = 1 + mg * tg.Sb * tg.Sb; ts.M12 = -mg * tg.Sb; ts.M22 = ma + mg; // + m_c(θ) on M22
  return ts;
}

Coupling coupling(const TubeState &ts, double theta, double fb) {
  const double m22 = ts.M22 + discMass(ts, theta);
  return {-ts.M12 / std::sqrt(ts.M11 * m22), std::sqrt(ts.Ka / m22) / TAU, fb / std::sqrt(ts.M11), m22};
}

std::array<double, 2> twoOscillator(double fb, double ft, double kappa) {
  const double wb = TAU * fb, wt = TAU * ft, s = wb * wb + wt * wt, dsc = std::sqrt(s * s - 4 * (1 - kappa * kappa) * wb * wb * wt * wt);
  return {std::sqrt((s - dsc) / (2 * (1 - kappa * kappa))) / TAU, std::sqrt((s + dsc) / (2 * (1 - kappa * kappa))) / TAU};
}

std::vector<Damped> coupledModes(double M11, double M12, double M22, double C11, double C22, double K11, double K22) {
  const double a4 = M11 * M22 - M12 * M12, a3 = M11 * C22 + M22 * C11, a2 = M11 * K22 + M22 * K11 + C11 * C22, a1 = C11 * K22 + C22 * K11, a0 = K11 * K22;
  const double c[4] = {a3 / a4, a2 / a4, a1 / a4, a0 / a4};
  auto P = [&](double re, double im, double &pr, double &pim) { // z⁴ + c0 z³ + c1 z² + c2 z + c3
    pr = 1; pim = 0;
    for (double ck : c) { const double r = pr * re - pim * im + ck, i = pr * im + pim * re; pr = r; pim = i; }
  };
  const double scale = std::sqrt(std::sqrt(c[3]));
  double z[4][2], zn[4][2];
  for (int j = 0; j < 4; j++) { z[j][0] = scale * std::cos(0.4 + (j * pi) / 2); z[j][1] = scale * std::sin(0.4 + (j * pi) / 2); }
  for (int it = 0; it < 500; it++) {
    double move = 0;
    for (int j = 0; j < 4; j++) {
      const double re = z[j][0], im = z[j][1];
      double nr, ni, dr = 1, di = 0;
      P(re, im, nr, ni);
      for (int q = 0; q < 4; q++) if (q != j) { const double xr = re - z[q][0], xi = im - z[q][1], t = dr * xr - di * xi; di = dr * xi + di * xr; dr = t; }
      const double den = dr * dr + di * di, qr = (nr * dr + ni * di) / den, qi = (ni * dr - nr * di) / den;
      move = std::max(move, std::hypot(qr, qi));
      zn[j][0] = re - qr; zn[j][1] = im - qi;
    }
    for (int j = 0; j < 4; j++) { z[j][0] = zn[j][0]; z[j][1] = zn[j][1]; }
    if (move < 1e-12 * scale) break;
  }
  std::vector<Damped> out;
  for (auto &r : z) if (r[1] > 0) out.push_back({r[1] / TAU, -r[0]});
  std::stable_sort(out.begin(), out.end(), [](const Damped &x, const Damped &y) { return x.f < y.f; });
  return out;
}

// ---------------------------------------------------------------------------

VoiceData voiceData(int k, double depth) {
  const BarModel bar = barModel(k, depth);
  const TubeGeometry tg = tubeGeometry(k, bar);
  const Layout lay = barLayout(k);
  const int nx = (int)bar.xs.size(), N = (int)bar.modes.size();
  VoiceData d;
  d.key = k; d.depth = depth; d.L = bar.geom.L; d.b = bar.geom.b; d.nx = nx; d.N = N; d.nb = 0;
  d.w.resize(N * nx);
  const double xd = (1 - DAMPER_X) * d.L; // the inner end (x = L), where the views draw it
  const double d1 = interp(bar.xs, bar.modes[0].w, xd);
  for (int i = 0; i < N; i++) {
    const Mode &m = bar.modes[i];
    std::copy(m.w.begin(), m.w.end(), d.w.begin() + i * nx);
    if (!m.tors) d.nb++;
    d.f.push_back(m.f);
    d.tors.push_back(m.tors ? 1 : 0);
    d.sigFixed.push_back(m.sigTE + m.sigSup + m.sigRad);
    d.out.push_back(m.out);
    // the damper felt: a line across the bar at x_d (torsion: averaged over the width)
    d.dampW.push_back(std::pow((interp(bar.xs, m.w, xd) * (m.tors ? bar.geom.b / std::sqrt(12.0) : 1)) / d1, 2));
  }
  d.tube = tg; d.accidental = lay.accidental; d.shaftIndex = lay.index; d.pan = barPan(k);
  return d;
}

// key, depth, L, b, nx, N, nb, accidental, shaftIndex, pan (2), tube (6), then N × (f, tors,
// sigFixed, out, dampW), then w (N × nx)
int packVoiceData(const VoiceData &d, double *out) {
  int n = 0;
  for (double v : {(double)d.key, d.depth, d.L, d.b, (double)d.nx, (double)d.N, (double)d.nb, d.accidental ? 1.0 : 0.0, (double)d.shaftIndex,
                   d.pan[0], d.pan[1], d.tube.a, d.tube.S, d.tube.Sb, d.tube.Rb, d.tube.delta0, d.tube.lv}) out[n++] = v;
  for (int i = 0; i < d.N; i++) for (double v : {d.f[i], (double)d.tors[i], d.sigFixed[i], d.out[i], d.dampW[i]}) out[n++] = v;
  for (double v : d.w) out[n++] = v;
  return n;
}
bool unpackVoiceData(const double *in, int n, VoiceData &d) {
  if (n < 17) return false;
  const int nx = (int)in[4], N = (int)in[5];
  if (!(nx >= 2 && nx <= 128 && N >= 1 && N <= 8 && n == 17 + 5 * N + N * nx)) return false;
  d.key = (int)in[0]; d.depth = in[1]; d.L = in[2]; d.b = in[3]; d.nx = nx; d.N = N; d.nb = (int)in[6];
  d.accidental = in[7] != 0; d.shaftIndex = (int)in[8]; d.pan = {in[9], in[10]};
  d.tube = {in[11], in[12], in[13], in[14], in[15], in[16]};
  const double *m = in + 17;
  d.f.resize(N); d.tors.resize(N); d.sigFixed.resize(N); d.out.resize(N); d.dampW.resize(N);
  for (int i = 0; i < N; i++, m += 5) { d.f[i] = m[0]; d.tors[i] = m[1] != 0; d.sigFixed[i] = m[2]; d.out[i] = m[3]; d.dampW[i] = m[4]; }
  d.w.assign(m, m + N * nx);
  return true;
}

} // namespace forte::vibraphone
