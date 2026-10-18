// harpsichord-model.cpp — the harpsichord's physics (harpsichord-model.h).

#include "harpsichord-model.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace forte::harpsichord {

using std::numbers::pi;
static double clamp(double x, double a, double b) { return std::min(b, std::max(a, x)); }

Params paramsOf(const double *P) {
  Params q;
  q.upper = (int)P[p::manual] == manual_::upper;
  q.coupler = P[p::coupler] != 0; q.front8 = P[p::front8] != 0; q.back8 = P[p::back8] != 0;
  q.four = P[p::four] != 0; q.lute = P[p::lute] != 0; q.buff = P[p::buff] != 0;
  q.material = (int)P[p::material] == material_::quill ? 1 : 0;
  q.stiff = P[p::stiff]; q.overlap = P[p::overlap]; q.stagger = P[p::stagger];
  q.xFront = P[p::xFront]; q.xBack = P[p::xBack]; q.xFour = P[p::xFour]; q.xLute = P[p::xLute];
  q.pitch = (int)P[p::pitch] == 1 ? 415 : 440; // the choice's options: A = 440 Hz, A = 415 Hz
  q.temperament = std::clamp((int)P[p::temperament], 0, 2);
  q.detune = P[p::detune]; q.loss = P[p::loss]; q.damper = P[p::damper]; q.fmax = P[p::fmax];
  q.soundboard = P[p::soundboard] != 0;
  return q;
}

// ---- tuning: a pitch standard and a temperament, built from its circle of fifths

static const double PURE_FIFTH = 1200 * std::log2(3.0 / 2);
static const double PYTH_COMMA = 1200 * std::log2(531441.0 / 524288); // 3¹²/2¹⁹
static const double SYNT_COMMA = 1200 * std::log2(81.0 / 80);
static constexpr int CIRCLE[12] = {0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5}; // C G D A E B F♯ C♯ G♯ E♭ B♭ F
// the twelve fifths in circle order, the one that closes the circle NaN (whatever is left over)
static std::array<double, 12> fifthsOf(int id) {
  const double N = NAN, n4 = PURE_FIFTH - SYNT_COMMA / 4, w4 = PURE_FIFTH - PYTH_COMMA / 4, P5 = PURE_FIFTH;
  if (id == temperament_::meantone) return {n4, n4, n4, n4, n4, n4, n4, n4, N, n4, n4, n4};
  if (id == temperament_::werckmeister) return {w4, w4, w4, P5, P5, w4, P5, P5, P5, P5, P5, N};
  return {700, 700, 700, 700, 700, 700, 700, 700, 700, 700, 700, N};
}
static double wrap1200(double x) { return std::fmod(std::fmod(x, 1200) + 1200, 1200); }
static std::array<double, 12> centsOf(int id) {
  const auto fifths = fifthsOf(id);
  std::array<double, 12> c{};
  int w = 0;
  while (!std::isnan(fifths[w])) w++;
  double x = 0;
  for (int i = 0; i < w; i++) { x += fifths[i]; c[CIRCLE[i + 1]] = wrap1200(x); }
  x = 0;
  for (int i = 11; i > w; i--) { x -= fifths[i]; c[CIRCLE[i]] = wrap1200(x); }
  return c;
}
double temperamentCents(int id, int pc) { return centsOf(id)[pc]; }
static const std::array<std::array<double, 12>, 3> OFFSETS = [] {
  std::array<std::array<double, 12>, 3> all{};
  for (int id = 0; id < 3; id++) {
    const auto c = centsOf(id);
    auto &o = all[id];
    for (int pc = 0; pc < 12; pc++) { double d = c[pc] - 100 * pc; if (d > 600) d -= 1200; if (d < -600) d += 1200; o[pc] = d; }
    const double a = o[9];
    for (int i = 0; i < 12; i++) o[i] -= a;
  }
  return all;
}();
double temperamentOffset(int id, int pc) { return OFFSETS[std::clamp(id, 0, 2)][pc]; }
double keyPitch(int m, const Params &P) {
  const double off = temperamentOffset(P.temperament, ((m % 12) + 12) % 12);
  return (P.pitch ? P.pitch : 440) * std::pow(2.0, (m - 69) / 12.0 + off / 1200);
}

// ---- the scale: lengths, wires and tensions

namespace SCALE {
constexpr double c2 = 0.355, fold = 2.5, max8 = 1.7, max4 = 0.9, nut = 0.09;
constexpr int brass8 = 45, brass4 = 40;
} // namespace SCALE

static double fold(double Lf, double Lmax) { const double p = SCALE::fold; return Lf / std::pow(1 + std::pow(Lf / Lmax, p), 1 / p); }
double stringLength(int m, int choir) {
  const bool four = choir == FOUR;
  const double Lc = four ? SCALE::c2 / 2 : SCALE::c2, Lmax = four ? SCALE::max4 : SCALE::max8;
  return (fold(Lc * std::pow(2.0, (C2 - m) / 12.0), Lmax) * Lc) / fold(Lc, Lmax);
}
static double logInterp(double m, double m0, double d0, double m1, double d1) { return d0 * std::pow(d1 / d0, clamp((m - m0) / (m1 - m0), 0, 1)); }
bool isBrass(int m, int choir) { return m <= (choir == FOUR ? SCALE::brass4 : SCALE::brass8); }
double wireDiameter(int m, int choir) {
  if (choir == FOUR) return isBrass(m, choir) ? logInterp(m, 40, 0.26e-3, 29, 0.36e-3) : logInterp(m, 41, 0.24e-3, 89, 0.18e-3);
  if (m < KEY_LO) return 0.56e-3 * std::pow(0.56 / 0.34, (KEY_LO - m) / 16.0); // below FF, the brass gauge goes on thickening
  return isBrass(m, choir) ? logInterp(m, 45, 0.34e-3, 29, 0.56e-3) : logInterp(m, 46, 0.30e-3, 89, 0.20e-3);
}

double jitter(double m, double s) { const double x = std::sin(m * 12.9898 + s * 78.233) * 43758.5453; return x - std::floor(x); }
// The two 8′ choirs a little apart (the front sharp), the 4′ a little off its octave.
double detuneCents(int m, int choir, const Params &P) {
  const double d = P.detune, j = 0.6 + 0.8 * jitter(m, choir == FRONT ? 1 : choir == BACK ? 2 : 3);
  return d * j * (choir == FRONT ? 0.5 : choir == BACK ? -0.5 : 0.25 * (jitter(m, 4) < 0.5 ? -1 : 1));
}
double stringPitch(int m, int choir, const Params &P) { return keyPitch(m, P) * (choir == FOUR ? 2 : 1) * std::pow(2.0, detuneCents(m, choir, P) / 1200); }

// Tuned so that the stiff string's fundamental is the target: T = 4L²f₁²μ − EI(π/L)².
StringDesign stringDesign(int m, int choir, const Params &P, double f1) {
  StringDesign S;
  const Wire &mat = isBrass(m, choir) ? BRASS : IRON;
  const double L = stringLength(m, choir), d = wireDiameter(m, choir);
  const double A = (pi * d * d) / 4, mu = mat.rho * A, EI = (mat.E * pi * std::pow(d, 4)) / 64;
  const double f0 = f1 >= 0 ? f1 : stringPitch(m, choir, P);
  const double T = 4 * L * L * f0 * f0 * mu - (EI * pi * pi) / (L * L);
  const double B = (pi * pi * EI) / (T * L * L);
  S.key = m; S.choir = choir; S.mat = &mat; S.L = L; S.d = d; S.A = A; S.mu = mu; S.EI = EI; S.T = T; S.B = B; S.f0 = f0;
  S.stress = T / A; S.c = std::sqrt(T / mu); S.Z = 2 * std::sqrt(T * mu);
  return S;
}
double partialFreq(const StringDesign &S, int n) { const double k = (n * pi) / S.L; return std::sqrt((S.T * k * k + S.EI * std::pow(k, 4)) / S.mu) / TAU; }

// Air (a viscous drag with a boundary-layer part ∝ √f) and the wire's internal friction.
static constexpr double AIR_ETA = 1.8e-5, AIR_RHO = 1.2;
double sigmaString(const StringDesign &S, double f, double lossScale) {
  const double R = 2 * pi * AIR_ETA + 2 * pi * S.d * std::sqrt(pi * AIR_ETA * AIR_RHO * f);
  return (R / (2 * S.mu) + pi * f * S.mat->eta) * lossScale;
}

// ---- registers

Registration registration(const Params &P) {
  const bool lower = !P.upper, coupled = lower && P.coupler;
  const bool rBack = lower, rFour = lower, rFront = !lower || coupled, rLute = !lower || coupled;
  Registration r;
  r.rows[ROW_BACK] = rBack && P.back8;
  r.rows[ROW_FRONT] = rFront && P.front8;
  r.rows[ROW_FOUR] = rFour && P.four;
  r.rows[ROW_LUTE] = rLute && P.lute;
  if (r.rows[ROW_LUTE] && r.rows[ROW_BACK]) r.rows[ROW_BACK] = false; // the lute plucks the back 8′ strings
  r.lift[FRONT] = rFront; r.lift[BACK] = rBack || rLute; r.lift[FOUR] = rFour;
  return r;
}

double pluckPoint(int m, int row, const Params &P) {
  const int choir = ROW_STRING[row];
  const double L = stringLength(m, choir), Lc = stringLength(C2, choir);
  const double xr = row == ROW_FRONT ? P.xFront : row == ROW_BACK ? P.xBack : row == ROW_FOUR ? P.xFour : P.xLute;
  const double x = xr * 1e-3 * std::sqrt(L / Lc);
  return clamp(x, 0.002, 0.5 * L);
}

double jackSpeed(double vel) { return 0.08 * std::pow(10.0, clamp(vel, 0, 1)); }
double fallSpeed(double r) { return 0.035 * std::pow(10.0, clamp(r, 0, 1)); }

// ---- the soundboard: an equivalent simply supported orthotropic plate

std::array<double, 2> bridgePoint(double m, int choir) {
  const double L = stringLength((int)m, choir), x = clamp(L - SCALE::nut, 0.12 * BOARD::a, 0.88 * BOARD::a);
  const double y = BOARD::b * (0.14 + 0.72 * keyT(m)) + (choir == FOUR ? -0.012 : choir == BACK ? 0.004 : 0);
  return {x, y};
}
std::array<double, NSEG> segmentWeights(int m, int choir) {
  std::array<double, NSEG> w{};
  const double t = keyT(m);
  if (choir == FOUR) { w[3] = 1 - t; w[4] = t; }
  else if (t < 0.5) { w[0] = 1 - 2 * t; w[1] = 2 * t; }
  else { w[1] = 2 - 2 * t; w[2] = 2 * t - 1; }
  return w;
}

double BoardModel::shape(int k, double x, double y) const {
  return N0 * std::sin((list[k].m * pi * x) / BOARD::a) * std::sin((list[k].n * pi * y) / BOARD::b);
}

static BoardModel buildBoard() {
  using namespace BOARD;
  BoardModel B;
  const double sq = 1 / (64 * rhoh * G0 * G0), Dy = sq / std::sqrt(aniso), Dx = aniso * Dy, H = sq / 2; // √(Dx Dy) = sq
  const auto omega = [&](int m, int n) {
    return (pi * pi / std::sqrt(rhoh)) * std::sqrt(Dx * std::pow((double)m / a, 4) + 2 * H * std::pow((double)m / a, 2) * std::pow((double)n / b, 2) + Dy * std::pow((double)n / b, 4));
  };
  std::vector<BoardModel::Mode> all;
  const double wCap = 6 * omega(1, 1) * std::sqrt((double)maxModes);
  for (int m = 1; omega(m, 1) < wCap; m++) for (int n = 1; omega(m, n) < wCap; n++) all.push_back({m, n, omega(m, n)});
  std::stable_sort(all.begin(), all.end(), [](const BoardModel::Mode &p, const BoardModel::Mode &q) { return p.w < q.w; });
  if ((int)all.size() > maxModes) all.resize(maxModes);
  B.list = all;
  const int K = (int)all.size();
  B.K = K; B.N0 = 2 / std::sqrt(rhoh * a * b); B.Dx = Dx; B.Dy = Dy; B.Ginf = G0;
  B.f.resize(K); B.sigma.resize(K); B.phi.resize(K * NSEG); B.mic.resize(2 * K);
  std::array<std::array<double, 2>, NSEG> pts;
  for (int s = 0; s < NSEG; s++) pts[s] = bridgePoint(KEY_LO + SEGS[s].t * (KEY_HI - KEY_LO), SEGS[s].four ? FOUR : BACK);
  constexpr double MIC_W = 0.3;
  for (int k = 0; k < K; k++) {
    B.f[k] = all[k].w / TAU; B.sigma[k] = (eta * all[k].w) / 2;
    for (int s = 0; s < NSEG; s++) B.phi[k * NSEG + s] = B.shape(k, pts[s][0], pts[s][1]);
    for (int j = 0; j < 2; j++) { // ∫∫ φ g dA over the mic's Gaussian patch (normalised)
      const double cx = MICS[j][0] * a, cy = MICS[j][1] * b;
      constexpr int nx = 48, ny = 24;
      double sum = 0, wsum = 0;
      for (int ix = 0; ix < nx; ix++) for (int iy = 0; iy < ny; iy++) {
        const double x = ((ix + 0.5) * a) / nx, y = ((iy + 0.5) * b) / ny;
        const double g = std::exp(-(std::pow(x - cx, 2) + std::pow(y - cy, 2)) / (2 * MIC_W * MIC_W));
        sum += g * B.shape(k, x, y); wsum += g;
      }
      B.mic[2 * k + j] = sum / wsum;
    }
  }
  B.fTop = K ? B.f[K - 1] : 1000;
  B.f11 = K ? B.f[0] : 0;
  return B;
}
const BoardModel &boardModel() {
  static const BoardModel B = buildBoard();
  return B;
}

// The modal sum, the mean conductance G₀ above the integrated band (faded in across its top), then
// the bridge's own mass in series, Y_tot = Y/(1 + iω m_b Y). Returns [Re, Im].
std::array<double, 2> boardAdmittance(double x, double y, double f, const double *shapes) {
  const BoardModel &B = boardModel();
  const double w = TAU * f;
  double re = 0, im = 0;
  for (int k = 0; k < B.K; k++) {
    const double p = shapes ? shapes[k] : B.shape(k, x, y), p2 = p * p, wk = TAU * B.f[k], d = wk * wk - w * w, s2 = 2 * B.sigma[k] * w, den = d * d + s2 * s2;
    re += (p2 * w * s2) / den; im += (p2 * w * d) / den;
  }
  re += B.Ginf / (1 + std::pow(B.fTop / f, 4));
  const double yy = re * re + im * im, zr = re / yy, zi = -im / yy + w * BOARD::mb, zz = zr * zr + zi * zi;
  return {zr / zz, -zi / zz};
}

// ---- one string's partials: mass-normalised shapes √(2/μL) sin(kₙx), bridge force bₙ qₙ with
// bₙ = (−1)ⁿ⁺¹ √(2/μL)(T kₙ + EI kₙ³), each draining into the bridge at σ_b = Re Y(fₙ) bₙ²/2ωₙ².

void stringPartials(const StringDesign &S, const Params &P, double fs, Partials &out) {
  const double fmax = std::min(P.fmax * 1000, 0.45 * fs), nrm = std::sqrt(2 / (S.mu * S.L));
  const auto [bx, by] = bridgePoint(S.key, S.choir);
  const double lossScale = P.loss * P.lossScale, Gs = P.bridgeScale;
  const BoardModel &B = boardModel();
  double shapes[BOARD::maxModes];
  for (int k = 0; k < B.K; k++) shapes[k] = B.shape(k, bx, by);
  out.nrm = nrm; out.N = 0;
  for (int n = 1; n <= N_MAX; n++) {
    const double f = partialFreq(S, n);
    if (f > fmax && n > 1) break;
    const double k = (n * pi) / S.L, w = TAU * f, b = (n % 2 ? 1 : -1) * nrm * (S.T * k + S.EI * std::pow(k, 3));
    const double sigS = sigmaString(S, f, lossScale), sigB = Gs * boardAdmittance(bx, by, f, shapes)[0] * (b * b) / (2 * w * w);
    const int i = out.N++;
    out.f[i] = f; out.k[i] = k; out.b[i] = b; out.sigS[i] = sigS; out.sigB[i] = sigB; out.sigma[i] = sigS + sigB;
  }
}

// ---- putting a string together

// The plectrum of a row at key m: the voicing sets k_tip for a string of K_z = 1000 N/m at its
// plucking point; slacker strings get weaker plectra, k_tip ∝ K_z^0.6.
Plectrum plectrumFor(int m, int row, const Params &P) {
  const StringDesign S = stringDesign(m, ROW_STRING[row], P);
  const double Kz = lateralStiffness(S, pluckPoint(m, row, P)), v = std::pow(Kz / VOICING_KREF, VOICING_EXP);
  PlectrumSpec sp;
  sp.kTip = P.stiff * v; sp.overlap = P.overlap * 1e-3; sp.material = P.material; sp.mu = P.mu; sp.taper = P.taper; sp.foreshortening = P.foreshortening;
  return makePlectrum(sp);
}
double rowGap(int row, const Params &P) { return ACTION::gap + ROW_ORDER[row] * P.stagger * 1e-3; }

void buildString(PluckedString &st, int m, int choir, const Params &P, const StringDesign &S, const Partials &parts, double fs) {
  st.init(S, parts, fs);
  st.feltK = ACTION::feltK; st.feltR = ACTION::feltR * P.damper * std::sqrt(S.T * S.mu); st.feltPre = ACTION::felt;
  st.tongueK = ACTION::tongueK; st.thick = ACTION::thick;
  st.setPoint(PT::DAMPER, std::min(0.5 * S.L, pluckPoint(m, choir, P) + DAMPER_OFFSET)); // the choir's own row: the same index
  if (choir == BACK) {
    // the buff: a leather pad by the nut, lightly sprung and lossy (×√(Tμ))
    st.buffK = 400; st.buffR = BUFF_R * std::sqrt(S.T * S.mu);
    st.setPoint(PT::BUFF, BUFF_X);
  }
}

void simulatePluck(Simulated &out, int m, int row, const Params &P, double V, double fs, double sec, int every, double until) {
  const int choir = ROW_STRING[row];
  const StringDesign S = stringDesign(m, choir, P);
  stringPartials(S, P, fs, out.parts);
  PluckedString &st = out.st;
  buildString(st, m, choir, P, S, out.parts, fs);
  const Plectrum pl = plectrumFor(m, row, P);
  const double x = pluckPoint(m, row, P);
  const int pp = row == ROW_LUTE ? PT::LUTE : PT::MAIN;
  const double gap = rowGap(row, P);
  st.armPlectrum(pp, &pl, x, gap, true, false);
  const int n = (int)std::floor(sec * fs + 0.5);
  double lift[1] = {0}, buff[1] = {0}, seg[NSEG] = {}, wts[NSEG] = {1, 1, 1, 1, 1};
  PluckTrace &tr = out.trace;
  tr = PluckTrace{};
  double L = 0;
  int released = -1;
  const double top = ACTION::top + gap;
  for (int i = 0; i < n; i++) {
    L = std::min(top, L + V / fs); lift[0] = L;
    seg[0] = 0;
    st.render(1, lift, true, buff, seg, 1, wts, 0, 0, 1);
    if (released < 0 && st.released[pp]) released = i;
    if (i % every == 0) {
      const double F = st.Fp[pp], s = st.s[pp];
      tr.t.push_back(i / fs); tr.y.push_back(L - gap); tr.u.push_back(st.dispAtQ(pp, st.q())); tr.F.push_back(F); tr.s.push_back(s);
      tr.z.push_back(st.zOld[pp]); tr.w.push_back(F * beamC(pl, s)); tr.fb.push_back(seg[0]);
    }
    if (until > 0 && released >= 0 && i > released + until * fs) break;
  }
  tr.released = released >= 0 ? released / fs : -1;
  if (released >= 0) tr.rel = st.relInfo[pp];
  tr.pl = pl; tr.S = S; tr.x = x; tr.gap = gap;
  tr.energy = st.energy(); tr.work = st.work; tr.staticCompliance = st.staticCompliance(pp); tr.Kz = st.Kz[pp];
}

} // namespace forte::harpsichord
