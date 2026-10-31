// clavichord-model.cpp — the clavichord's physics (clavichord-model.h).

#include "clavichord-model.h"

#include <algorithm>
#include <cmath>
#include <complex>
#include <numbers>

namespace forte::clavichord {

using std::numbers::pi;
static double clamp(double x, double a, double b) { return std::min(b, std::max(a, x)); }

Params paramsOf(const double *P) {
  Params q;
  q.fretted = (int)P[p::fretting] == fretting_::fretted;
  q.octave = P[p::octave] != 0;
  q.board = P[p::soundboard] != 0;
  q.press = P[p::press]; q.bebung = P[p::bebung]; q.rate = P[p::rate]; q.mass = P[p::mass];
  q.detune = P[p::detune]; q.listing = P[p::listing]; q.loss = P[p::loss]; q.fmax = P[p::fmax];
  q.tuning = tuningOf(P);
  return q;
}

// ---- fretting

// Pitch classes 0 (C) … 11 (B): the lower key of a fretted pair, or the key itself.
static constexpr int FRET_LOW[12] = {0, 0, 2, 3, 3, 5, 5, 7, 7, 9, 10, 10};
int courseOf(int key, bool fretted) {
  if (!fretted) return key;
  const int pc = ((key % 12) + 12) % 12;
  return key - pc + FRET_LOW[pc];
}
int courseKeys(int course, bool fretted, int out[2]) {
  out[0] = course;
  if (fretted && course + 1 <= KEY_MAX && courseOf(course + 1, true) == course) { out[1] = course + 1; return 2; }
  return 1;
}

// ---- tuning and the scale

double keyPitch(int m, const Params &P) { return 440 * std::pow(2.0, (m - 69) / 12.0) * P.tuning.ratio(m); }

namespace SCALE {
constexpr double c2 = 0.26, fold = 2.5, max = 1.3, min = 0.04;
constexpr int brass = 47; // brass to B, iron from c
} // namespace SCALE
static double fold(double Lf, double Lmax) { const double p = SCALE::fold; return Lf / std::pow(1 + std::pow(Lf / Lmax, p), 1 / p); }
double scaleLength(int m) {
  const double Lc = SCALE::c2;
  return std::max(SCALE::min, (fold(Lc * std::pow(2.0, (C2 - m) / 12.0), SCALE::max) * Lc) / fold(Lc, SCALE::max));
}
double afterLength(int m) { return 0.12 + 0.16 * keyT(m); }
bool isBrass(int m, int /*choir*/) { return m <= SCALE::brass; }
static double logInterp(double m, double m0, double d0, double m1, double d1) { return d0 * std::pow(d1 / d0, (m - m0) / (m1 - m0)); }
double wireDiameter(int m, int choir) {
  if (choir == 2) return clamp(logInterp(m, KEY_LO, 0.36e-3, OCTAVE_TOP, 0.26e-3), 0.20e-3, 0.42e-3);
  // below FF (the full range) the bass carries on thicker, so its strings stay taut enough to hold the tangent up
  // (and the tangent's give takes their fundamentals: from E₁ down they are mostly the 2nd partial and up)
  if (m < KEY_LO) return std::min(0.8e-3, 0.50e-3 * std::pow(1.5, (KEY_LO - m) / 8.0));
  if (isBrass(m, choir)) return clamp(logInterp(m, KEY_LO, 0.50e-3, SCALE::brass, 0.38e-3), 0.36e-3, 0.62e-3);
  return clamp(logInterp(m, SCALE::brass + 1, 0.36e-3, KEY_HI, 0.20e-3), 0.15e-3, 0.36e-3);
}

double jitter(double m, double s) { const double x = std::sin(m * 12.9898 + s * 78.233) * 43758.5453; return x - std::floor(x); }
// The pair a little apart (one sharp, one flat), the 4′ a little off its octave.
double detuneCents(int m, int choir, const Params &P) {
  const double d = P.detune, j = 0.6 + 0.8 * jitter(m, choir + 1);
  return d * j * (choir == 0 ? 0.5 : choir == 1 ? -0.5 : 0.25 * (jitter(m, 4) < 0.5 ? -1 : 1));
}
int choirsOf(int course, const Params &P) { return P.octave && course <= OCTAVE_TOP ? 3 : 2; }

// On a fretted course the upper key's tangent is set a semitone (in the keyboard's tuning) nearer
// the bridge than its lower neighbour's: L ∝ 1/f along the same string at the same tension.
double tangentPoint(int key, const Params &P) {
  const int c = courseOf(key, P.fretted);
  return scaleLength(c) * (c == key ? 1 : keyPitch(c, P) / keyPitch(key, P));
}

double stretchOf(double z, double L, double a) { return 0.5 * z * z * (1 / L + 1 / a); }
double tensionAt(const StringDesign &S, double z, double L) { const double Ls = S.Lf * L; return S.T0 + (S.EA / S.l) * stretchOf(z, Ls, S.l - Ls); }
double restHeight(const StringDesign *S, int n, double L, double F) {
  if (!(F > 0)) return 0;
  // F = Σ gᵢz(T₀ᵢ + Eᵢgᵢz²/2), gᵢ = 1/Lᵢ + 1/aᵢ, Eᵢ = EAᵢ/lᵢ: Newton from the linear guess (monotonic, convex)
  double A = 0, C = 0;
  for (int i = 0; i < n; i++) {
    const double Ls = S[i].Lf * L, g = 1 / Ls + 1 / (S[i].l - Ls);
    A += g * S[i].T0; C += 0.5 * (S[i].EA / S[i].l) * g * g;
  }
  double z = F / A;
  for (int it = 0; it < 30; it++) {
    const double r = z * (A + C * z * z) - F, d = A + 3 * C * z * z;
    const double dz = r / d;
    z -= dz;
    if (std::fabs(dz) < 1e-12) break;
  }
  return clamp(z, 0.0, ACTION::bed); // no further than the key's bed lets it
}

// The tangent is no rigid nut: the key and the finger on it (mass M, the finger's damping R) ride
// on the strings' springs, and the strings' partials move it. For a small vibration about the
// tangent's rest, with each partial driven by the tangent (gₙz̈, as the engine has it), the tangent
// balances when
//   D(ω) = −ω²M + iωR + Σ_strings [T(1/L + 1/a) − (2T/L)Σₙ ω²/Dₙ − (2T/a)Σₘ ω²/Dₘ] = 0,
// Dₙ = ωₙ² − ω² + 2iσₙω for the speaking length's partials and the afterlength's alike. A
// partial n of the group (the pair, or the 4′) is the root near its own pole: with the rest of D
// as D′ and G = Σ 2T/L over the group, ω² = ωₙ² + 2iσₙω − Gω²/D′(ω), found by iterating. A little
// sharp where the key's mass rules, flat where the springs do; and in the deep bass, where the
// tangent's own bounce falls near the note, by as much as the poles there make it. Returns Re ω
// over ωₙ for string c's partial n.
double tangentShift(const StringDesign *S, int nStr, int c, double L, double M, double R, const Params &P, int n) {
  using C = std::complex<double>;
  static thread_local Modes sp[CHOIRS], af[CHOIRS];
  const auto inGroup = [&](int s) { return (c == 2) == (s == 2); };
  double G = 0;
  for (int s = 0; s < nStr; s++) {
    const double T = S[s].Tnom;
    speakingModes(S[s], L, T, P, 48000, N_MAX, sp[s]);
    afterModes(S[s], L, T, P, M_AFTER, af[s]);
    if (inGroup(s)) G += 2 * T / sp[s].len;
  }
  const double wn = TAU * sp[c].f[n - 1], sn = sp[c].sigma[n - 1];
  const auto rest = [&](C w) {
    C D = -w * w * M + C(0, 1) * w * R;
    for (int s = 0; s < nStr; s++) {
      const double T = S[s].Tnom, Ls = sp[s].len, a = af[s].len;
      C sum = 0, sumA = 0;
      for (int i = 0; i < sp[s].N; i++) {
        if (i == n - 1 && inGroup(s)) continue;
        const double wi = TAU * sp[s].f[i];
        sum += w * w / (wi * wi - w * w + C(0, 2 * sp[s].sigma[i]) * w);
      }
      for (int i = 0; i < af[s].N; i++) {
        const double wi = TAU * af[s].f[i];
        sumA += w * w / (wi * wi - w * w + C(0, 2 * af[s].sigma[i]) * w);
      }
      D += T * (1 / Ls + 1 / a) - (2 * T / Ls) * sum - (2 * T / a) * sumA;
    }
    return D;
  };
  C w = wn;
  for (int it = 0; it < 200; it++) {
    C next = std::sqrt(wn * wn + C(0, 2 * sn) * w - G * w * w / rest(w));
    if (next.real() < 0) next = -next;
    const bool done = std::abs(next - w) < 1e-9 * wn;
    w = 0.5 * (w + next);
    if (done) break;
  }
  return w.real() / wn;
}

// Each string tuned, with the course's own key down at the nominal touch (a key and finger of the
// default mass), so that its fundamental is the target: the stiff string's T = 4L²f²μ − EI(π/L)²
// for f the target over the tangent's shift (tangentShift; a few passes, since the shift depends on
// T). The tangent then rests where the pair's (or three's) pull balances the touch,
// z = F/(ΣT·(1/L + 1/a)); with no key down the strings are that much slacker, T₀ = T − EA·Δl(z)/l.
void designCourse(int course, const Params &P, StringDesign *out, int n) {
  const double L = scaleLength(course), a = afterLength(course);
  for (int c = 0; c < n; c++) {
    StringDesign &S = out[c];
    S = StringDesign{};
    S.course = course; S.choir = c;
    S.mat = isBrass(course, c) ? &BRASS : &IRON;
    S.Lf = c == 2 ? 0.5 : 1;
    S.L = S.Lf * L; S.a = a; S.l = S.L + a;
    S.d = wireDiameter(course, c);
    S.A = pi * S.d * S.d / 4; S.mu = S.mat->rho * S.A; S.EI = S.mat->E * pi * std::pow(S.d, 4) / 64; S.EA = S.mat->E * S.A;
    S.f0 = keyPitch(course, P) * (c == 2 ? 2 : 1) * std::pow(2.0, detuneCents(course, c, P) / 1200);
    S.Tnom = 4 * S.L * S.L * S.f0 * S.f0 * S.mu - S.EI * pi * pi / (S.L * S.L);
  }
  for (int pass = 0; pass < 4; pass++) {
    double sh[CHOIRS];
    for (int c = 0; c < n; c++) sh[c] = tangentShift(out, n, c, L, MASS_NOM, ACTION::damping, P, 1);
    for (int c = 0; c < n; c++) {
      StringDesign &S = out[c];
      const double f = S.f0 / sh[c];
      S.Tnom = 4 * S.L * S.L * f * f * S.mu - S.EI * pi * pi / (S.L * S.L);
    }
  }
  double pull = 0;
  for (int c = 0; c < n; c++) pull += out[c].Tnom * (1 / out[c].L + 1 / a);
  const double z = PRESS_NOM / pull;
  for (int c = 0; c < n; c++) {
    StringDesign &S = out[c];
    S.hnom = z;
    S.T0 = S.Tnom - (S.EA / S.l) * stretchOf(z, S.L, a);
    S.stress = S.Tnom / S.A; S.c = std::sqrt(S.Tnom / S.mu); S.Z = std::sqrt(S.Tnom * S.mu);
    S.B = pi * pi * S.EI / (S.Tnom * S.L * S.L);
  }
}
StringDesign stringDesign(int course, int choir, const Params &P) {
  StringDesign s[CHOIRS];
  designCourse(course, P, s, choirsOf(course, P));
  return s[std::min(choir, choirsOf(course, P) - 1)];
}

static constexpr double AIR_ETA = 1.8e-5, AIR_RHO = 1.2;
double sigmaString(const StringDesign &S, double f, double loss) {
  const double R = 2 * pi * AIR_ETA + 2 * pi * S.d * std::sqrt(pi * AIR_ETA * AIR_RHO * f);
  return (R / (2 * S.mu) + pi * f * S.mat->eta) * loss;
}

double listingWidth(double after) { return std::min(0.7 * after, 0.10); }
double listingSigma(double beta, double w, double listing) {
  const double x = 2 * beta * w;
  return SIG_LIST * listing * (x < 1e-4 ? x * x / 6 : 1 - std::sin(x) / x);
}

// ---- partials: mass-normalised shapes √(2/μℓ) sin(kX); a partial meeting the bridge drains into
// it at σ_B = Re Y(f)·b²/2ω², b = √(2/μℓ)(Tk + EIk³) its force on the bridge per unit amplitude.

void speakingModes(const StringDesign &S, double L8, double T, const Params &P, double fs, int nmax, Modes &out) {
  const double L = S.Lf * L8, fmax = std::min(P.fmax * 1000, 0.45 * fs), nrm = std::sqrt(2 / (S.mu * L));
  const auto [bx, by] = bridgePoint(S.course);
  const BoardModel &B = boardModel();
  double shapes[BOARD::maxModes];
  for (int k = 0; k < B.K; k++) shapes[k] = B.shape(k, bx, by);
  out.N = 0; out.len = L; out.T = T;
  for (int n = 1; n <= std::min(N_MAX, nmax); n++) {
    const double f = partialFreq(S, L, T, n);
    if (f > fmax && n > 1) break;
    const double k = n * pi / L, w = TAU * f, b = nrm * (T * k + S.EI * k * k * k);
    const double sigB = boardAdmittance(bx, by, f, shapes)[0] * b * b / (2 * w * w);
    const int i = out.N++;
    out.f[i] = f; out.k[i] = k; out.sigB[i] = sigB; out.sigma[i] = sigmaString(S, f, P.loss) + sigB;
  }
}

void afterModes(const StringDesign &S, double L8, double T, const Params &P, int mmax, Modes &out) {
  const double a = S.l - S.Lf * L8, w = std::min(listingWidth(S.a), a);
  out.N = 0; out.len = a; out.T = T;
  for (int m = 1; m <= std::min(M_AFTER, mmax); m++) {
    const double k = m * pi / a, f = partialFreq(S, a, T, m);
    const int i = out.N++;
    out.f[i] = f; out.k[i] = k; out.sigB[i] = 0; out.sigma[i] = sigmaString(S, f, P.loss) + listingSigma(k, w, P.listing);
  }
}

void openModes(const StringDesign &S, double T, const Params &P, double fs, int jmax, Modes &out) {
  const double l = S.l, w = listingWidth(S.a), nrm = std::sqrt(2 / (S.mu * l));
  const auto [bx, by] = bridgePoint(S.course);
  out.N = 0; out.len = l; out.T = T;
  for (int j = 1; j <= std::min(J_OPEN, jmax); j++) {
    const double f = partialFreq(S, l, T, j);
    if (f > 0.45 * fs) break;
    const double k = j * pi / l, ww = TAU * f, b = nrm * (T * k + S.EI * k * k * k);
    const double sigB = boardAdmittance(bx, by, f)[0] * b * b / (2 * ww * ww);
    const int i = out.N++;
    out.f[i] = f; out.k[i] = k; out.sigB[i] = sigB; out.sigma[i] = sigmaString(S, f, P.loss) + listingSigma(k, w, P.listing) + sigB;
  }
}

// ---- the soundboard: an equivalent simply supported orthotropic plate, its stiffness chosen to
// give the mean admittance G₀ = 1/(8√(Dρh)) (Cremer: the infinite plate's)

std::array<double, 2> bridgePoint(double m) {
  const double t = keyT(m);
  return {BOARD::a * (0.30 + 0.30 * t), BOARD::b * (0.78 - 0.45 * t)}; // the bass end further in, at the back
}
std::array<double, NSEG> segmentWeights(int m) {
  std::array<double, NSEG> w{};
  const double t = keyT(m);
  if (t < 0.5) { w[0] = 1 - 2 * t; w[1] = 2 * t; }
  else { w[1] = 2 - 2 * t; w[2] = 2 * t - 1; }
  return w;
}

double BoardModel::shape(int k, double x, double y) const {
  return N0 * std::sin(mm[k] * pi * x / BOARD::a) * std::sin(nn[k] * pi * y / BOARD::b);
}

static BoardModel buildBoard() {
  using namespace BOARD;
  BoardModel B;
  const double sq = 1 / (64 * rhoh * G0 * G0), Dy = sq / std::sqrt(aniso), Dx = aniso * Dy, H = sq / 2;
  const auto omega = [&](int m, int n) {
    return (pi * pi / std::sqrt(rhoh)) * std::sqrt(Dx * std::pow((double)m / a, 4) + 2 * H * std::pow((double)m / a, 2) * std::pow((double)n / b, 2) + Dy * std::pow((double)n / b, 4));
  };
  struct M { int m, n; double w; };
  std::vector<M> all;
  const double wCap = 6 * omega(1, 1) * std::sqrt((double)maxModes);
  for (int m = 1; omega(m, 1) < wCap; m++) for (int n = 1; omega(m, n) < wCap; n++) all.push_back({m, n, omega(m, n)});
  std::stable_sort(all.begin(), all.end(), [](const M &p, const M &q) { return p.w < q.w; });
  if ((int)all.size() > maxModes) all.resize(maxModes);
  const int K = (int)all.size();
  B.K = K; B.N0 = 2 / std::sqrt(rhoh * a * b); B.Dx = Dx; B.Dy = Dy; B.Ginf = G0;
  B.f.resize(K); B.sigma.resize(K); B.phi.resize(K * NSEG); B.mic.resize(2 * K); B.mm.resize(K); B.nn.resize(K);
  for (int k = 0; k < K; k++) { B.mm[k] = all[k].m; B.nn[k] = all[k].n; }
  std::array<std::array<double, 2>, NSEG> pts;
  for (int s = 0; s < NSEG; s++) pts[s] = bridgePoint(KEY_LO + 0.5 * s * (KEY_HI - KEY_LO));
  constexpr double MIC_W = 0.1;
  for (int k = 0; k < K; k++) {
    B.f[k] = all[k].w / TAU; B.sigma[k] = eta * all[k].w / 2;
    for (int s = 0; s < NSEG; s++) B.phi[k * NSEG + s] = B.shape(k, pts[s][0], pts[s][1]);
    for (int j = 0; j < 2; j++) { // ∫∫ φ g dA over the microphone's Gaussian patch (normalised)
      const double cx = MICS[j][0] * a, cy = MICS[j][1] * b;
      constexpr int nx = 40, ny = 24;
      double sum = 0, wsum = 0;
      for (int ix = 0; ix < nx; ix++) for (int iy = 0; iy < ny; iy++) {
        const double x = (ix + 0.5) * a / nx, y = (iy + 0.5) * b / ny;
        const double g = std::exp(-(std::pow(x - cx, 2) + std::pow(y - cy, 2)) / (2 * MIC_W * MIC_W));
        sum += g * B.shape(k, x, y); wsum += g;
      }
      B.mic[2 * k + j] = sum / wsum;
    }
  }
  B.fTop = K ? B.f[K - 1] : 1000;
  return B;
}
const BoardModel &boardModel() {
  static const BoardModel B = buildBoard();
  return B;
}

// The modal sum, the mean conductance G₀ above the modal band (faded in across its top), then the
// bridge's own mass in series, Y_tot = Y/(1 + iω m_b Y).
std::array<double, 2> boardAdmittance(double x, double y, double f, const double *shapes) {
  const BoardModel &B = boardModel();
  const double w = TAU * f;
  double re = 0, im = 0;
  for (int k = 0; k < B.K; k++) {
    const double p = shapes ? shapes[k] : B.shape(k, x, y), p2 = p * p, wk = TAU * B.f[k], d = wk * wk - w * w, s2 = 2 * B.sigma[k] * w, den = d * d + s2 * s2;
    re += p2 * w * s2 / den; im += p2 * w * d / den;
  }
  re += B.Ginf / (1 + std::pow(B.fTop / f, 4));
  const double yy = re * re + im * im, zr = re / yy, zi = -im / yy + w * BOARD::mb, zz = zr * zr + zi * zi;
  return {zr / zz, -zi / zz};
}

// ---- the action

double tangentSpeed(double vel) { return 0.04 * std::pow(10.0, clamp(vel, 0, 1)); }
double liftSpeed(double r) { return 0.015 * std::pow(10.0, clamp(r, 0, 1)); }

// ---- projections

// ∫ sin(aX + φ) sin(bX + ψ) = ½∫ cos((a − b)X + φ − ψ) − ½∫ cos((a + b)X + φ + ψ)
static double cosInt(double w, double ph, double x0, double x1) {
  const double h = x1 - x0;
  if (std::fabs(w * h) < 1e-6) return std::cos(w * 0.5 * (x0 + x1) + ph) * h;
  return (std::sin(w * x1 + ph) - std::sin(w * x0 + ph)) / w;
}
double sinSin(double a, double phi, double b, double psi, double x0, double x1) {
  if (!(x1 > x0)) return 0;
  return 0.5 * (cosInt(a - b, phi - psi, x0, x1) - cosInt(a + b, phi + psi, x0, x1));
}
double linSin(double p, double r, double b, double psi, double x0, double x1) {
  if (!(x1 > x0)) return 0;
  const auto G = [&](double x) { return -(p * x + r) * std::cos(b * x + psi) / b + p * std::sin(b * x + psi) / (b * b); };
  return G(x1) - G(x0);
}

} // namespace forte::clavichord
