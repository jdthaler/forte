// windharp-engine.cpp — the Wind Harp's engine (windharp-engine.h).

#include "windharp-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/fdlibm.h"

namespace forte::windharp {

namespace {
constexpr double OUT = 6.2;            // output units per pascal at 1 m
constexpr double FADE = 0.03;          // s: a stolen key fades out over this
constexpr double YOUNG = 0.05;         // s: a key this young is never stolen
constexpr double GLIDE = 0.06;         // s: the wind slider glides
constexpr double BEND_T = 0.02;        // s: the pitch wheel's glide
constexpr double AFTER = 0.5;          // full aftertouch raises the wind by this fraction
constexpr int POST_BLOCKS = 4;         // post the views' data every 4 blocks
constexpr double LINE_LO = 0.002, LINE_HI = 0.015; // the free wake's relative line width (FWHM) for Re ≤ 180 and Re ≥ 1000
constexpr double WH_MAX = 0.4;         // a string steps at 1/2 or 1/4 of the sample rate while ω h stays under this
constexpr double PI = std::numbers::pi;
using fdlibm::exp;
using fdlibm::pow;

// JavaScript's ToUint32 of a number
uint32_t toUint32(double x) {
  if (!std::isfinite(x)) return 0;
  double m = std::fmod(std::trunc(x), 4294967296.0);
  if (m < 0) m += 4294967296.0;
  return (uint32_t)m;
}
// xorshift32, seeded: uniform in [−0.5, 0.5)
uint32_t rngSeed(double seed) { const uint32_t s = toUint32(seed); return s ? s : 1; }
double rngNext(uint32_t &s) { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return s / 4294967296.0 - 0.5; }
double jmax(double a, double b) { return a != a || b != b ? NAN : a > b ? a : b; }

// Exact response of ä + 2ζωȧ + ω²a = g(t) over one step h, with g running linearly from g0 to g1
// (a first-order hold): p11 p12 p21 p22, then the hold's a0 a1 b0 b1.
void foh(double w, double z, double h, double *out) {
  const double wd = w * std::sqrt(1 - z * z), e = exp(-z * w * h), c = fdlibm::cos(wd * h), s = fdlibm::sin(wd * h), zw = z * w;
  const double p11 = e * (c + (zw / wd) * s), p12 = (e * s) / wd, p21 = (-e * w * w * s) / wd, p22 = e * (c - (zw / wd) * s);
  const double w2 = w * w;
  const double i11 = (-2 * zw) / w2, i12 = -1 / w2, i21 = 1, i22 = 0;
  const double m1 = p12, m2 = p22 - 1;
  const double g0a = i11 * m1 + i12 * m2, g0v = i21 * m1 + i22 * m2;
  const double s0a = i11 * g0a + i12 * g0v, s0v = i21 * g0a + i22 * g0v;
  const double g1a = s0a / h + 1 / w2, g1v = s0v / h;
  out[0] = p11; out[1] = p12; out[2] = p21; out[3] = p22;
  out[4] = g0a - g1a; out[5] = g1a; out[6] = g0v - g1v; out[7] = g1v;
}
} // namespace

WindHarpEngine::WindHarpEngine(double fs, double seed, Options o) : Engine(fs), opts(o), seed(seed), h(1 / fs) {
  randState = rngSeed(seed * 31337 + 7);
  for (int k = 0; k < 5; k++) bp[k].set(Biquad::bp, BOX.modes[k].f, BOX.modes[k].Q, fs);
  // the top's radiation efficiency, (1 + s/ω₁)/(1 + s/ω₂), by the bilinear transform with both corners prewarped
  auto pw = [&](double f) { return 2 * fs * std::tan((PI * f) / fs); };
  const double K = 2 * fs, w1 = pw(BOX.shelfF1), w2 = pw(BOX.shelfF2), a0 = 1 + K / w2;
  shelf[0] = (1 + K / w1) / a0; shelf[1] = (1 - K / w1) / a0; shelf[2] = (1 - K / w2) / a0;
}

void WindHarpEngine::configure(double s, Options o) {
  seed = s; opts = o;
  randState = rngSeed(seed * 31337 + 7);
}

double WindHarpEngine::rand() { return rngNext(randState); }
double WindHarpEngine::gauss() { double s = 0; for (int k = 0; k < 4; k++) s += rand(); return s * std::sqrt(3.0); }

void WindHarpEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  const double dk[4] = {P[p::n0], P[p::tuning], P[p::unison], P[p::mass]};
  const forte::Tuning kb = tuningOf(P);
  if (!hasParams || dk[0] != designKey[0] || dk[1] != designKey[1] || dk[2] != designKey[2] || dk[3] != designKey[3] || !(kb == designKeyboard)) {
    for (int i = 0; i < 4; i++) designKey[i] = dk[i];
    designKeyboard = kb;
    version++;
  }
  hasParams = true;
  if (!started) { Uw = P[p::wind]; started = true; }
}

// ---- a string ------------------------------------------------------------------------------------
void WindHarpEngine::initString(Str &s, int key, const StringDesign &S) {
  s = Str{};
  s.key = key; s.S = S;
  // modes kept: below 0.42 fs, at least one
  int N = 0;
  while (N < S.N && S.f[N] < 0.42 * fs) N++;
  N = std::max(1, N);
  const int J = N, Jh = J >> 1, odd = J & 1;
  s.N = N; s.J = J; s.Jh = Jh; s.odd = odd;
  for (int n = 0; n < N; n++) { s.w[n] = TAU * S.f[n]; s.w2[n] = pow(s.w[n], 2); s.kb[n] = (S.T * (n + 1) * PI) / S.L; }
  const int No = (N + 1) >> 1, Ne = N >> 1;
  s.No = No; s.Ne = Ne;
  for (int n = 0; n < N; n++) {
    for (int j = 0; j < Jh; j++) {
      const double ph = fdlibm::sin(((n + 1) * PI * (j + 0.5)) / J);
      s.phi[n * Jh + j] = ph;
      if (n & 1) s.phiE[j * Ne + (n >> 1)] = ph; else s.phiO[j * No + (n >> 1)] = ph;
    }
    s.phiMid[n] = odd ? fdlibm::sin(((n + 1) * PI) / 2) : 0;
  }
  uint32_t rs = rngSeed(seed * 7919 + key * 104729 + S.idx * 31);
  s.rs = (toUint32(seed * 2654435761) ^ toUint32(key * 40503.0) ^ toUint32(S.idx * 977.0) ^ 0x9e3779b9u) | 1u;
  for (int j = 0; j < J; j++) s.q[j] = 1e-3 * rngNext(rs); // the stagnant air's leftover swirl
  s.Ad = opts.rigid ? 0 : WAKE.A / S.D; // a rigid string (tests): the wake of a fixed cylinder
  s.home = homeHarmonic(S);
  // its own step: the sample period × D (1, 2 or 4), as long as ω h stays under WH_MAX for its top mode
  // and its shedding at 1.5 × the top wind
  const double wTop = std::max(s.w[N - 1], TAU * shedding(1.5 * U_MAX, S.D).fs);
  s.Dmax = 1;
  while (s.Dmax < 4 && wTop * h * s.Dmax * 2 <= WH_MAX) s.Dmax *= 2;
  s.D = s.Dmax; s.hs = h * s.D;
  if (bendNow != 1) tension(s, bendNow);
}

// Pitch bend: the string's tension × r², its stiff modes f_n = n f₀ √(r² + B n²) and the pull at the
// bridge (tension × slope) with it. The wind and its wake do not change: a string bent out of its
// lock-in band moves to the harmonic the wake picks, as a real one would.
void WindHarpEngine::tension(Str &s, double r) {
  const StringDesign &S = s.S;
  for (int n = 0; n < s.N; n++) {
    const double Bn = S.B * (n + 1) * (n + 1);
    s.w[n] = TAU * S.f[n] * std::sqrt((r * r + Bn) / (1 + Bn)); s.w2[n] = pow(s.w[n], 2);
    s.kb[n] = (S.T * r * r * (n + 1) * PI) / S.L;
  }
  s.bent = r; s.zetaAt = -1; // the modes' coefficients again at the next block
}

// the wind-dependent numbers at wind U (end of this block), the shutter moving from x0 to x1, and the modes' coefficients
void WindHarpEngine::prepare(Str &s, double U, int n, double x0, double x1, double target) {
  // the step: D samples (a block that D does not divide is stepped sample by sample)
  const int D = n % s.Dmax == 0 ? s.Dmax : 1;
  if (D != s.D) { s.D = D; s.hs = h * D; s.zetaAt = -1; }
  const StringDesign &S = s.S;
  const double hh = s.hs;
  const int J = s.J;
  n /= D;
  // the shedding at this wind (as shedding() in the model)
  const double Uu = std::max(U, 0.05), Re = (Uu * S.D) / AIR.nu, rOn = onset(Re);
  const double Om = (TAU * strouhal(Re) * Uu) / S.D / vdpKappa(WAKE.eps * jmax(rOn, 0));
  const double open = x0, sw = fdlibm::sin(0.5 * Om * hh), line = LINE_LO + (LINE_HI - LINE_LO) * std::min(1.0, std::max(0.0, (Re - 180) / 820));
  double *k1 = s.k1;
  k1[0] = (4 / (hh * hh)) * sw * sw;
  k1[1] = opts.eps * Om;
  k1[2] = rOn;
  k1[3] = opts.rigid ? 0 : (0.25 * AIR.rho * U * U * S.D * WAKE.CL0 * 2) / (S.m * J);
  k1[4] = opts.noise * std::max(0.0, std::min(1.0, rOn)) * std::sqrt(24 * 4 * line * pow(Om, 3) * hh); // none in a steady (laminar) wake
  if (!s.started) { for (int i = 0; i < 5; i++) s.k0[i] = k1[i]; s.started = true; }
  const double inv = 1.0 / n;
  for (int i = 0; i < 5; i++) s.dk[i] = (k1[i] - s.k0[i]) * inv;
  s.Ucur = U; s.Om = Om; s.Re = Re; s.r = rOn;
  // the shutter moves; each station's exposure ramps across the block
  const double x = x1;
  for (int j = 0; j < J; j++) { const double e1 = std::min(1.0, std::max(0.0, x * J - j)); s.de[j] = (e1 - s.e[j]) * inv; }
  s.x = x; s.target = target;
  // the flow's damping r_f = γΩρD² over the uncovered span joins the string's own (recomputed when either moves)
  const double zeta = 1 / (2 * P[p::q]), mean = 0.5 * (open + x);
  if (std::fabs(zeta - s.zetaAt) > 1e-9 || std::fabs(Om * mean - s.OmAt) > 1e-6 * Om + 1e-9) {
    const double rf = WAKE.gamma * Om * AIR.rho * S.D * S.D * mean;
    for (int m = 0; m < s.N; m++) { const double z = std::min(0.5, zeta + rf / (2 * S.m * s.w[m])); foh(s.w[m], z, hh, s.co + 8 * m); s.cv[m] = 2 * z * s.w[m]; }
    s.zetaAt = zeta; s.OmAt = Om * mean;
  }
}

// A shut string whose wake has died rings on by itself: just its modes (no wake, no lift).
bool WindHarpEngine::quiet(const Str &s) {
  if (s.x != 0 || s.target != 0) return false;
  double m = 0;
  for (int j = 0; j < s.J; j++) m = jmax(jmax(m, std::fabs(s.q[j])), std::fabs(s.qv[j]) / (s.Om + 1));
  return m < 1e-7;
}
void WindHarpEngine::ring(Str &s, int n) {
  const int N = s.N;
  double *a = s.a, *v = s.v;
  const double *co = s.co, *kb = s.kb;
  for (int m = 0; m < N; m++) s.gOld[m] = 0;
  for (int i = 0; i < n; i++) {
    double F = 0;
    for (int m = 0; m < N; m++) { const int o = 8 * m; const double am = a[m], vm = v[m], an = co[o] * am + co[o + 1] * vm; v[m] = co[o + 2] * am + co[o + 3] * vm; a[m] = an; F += kb[m] * an; }
    fbs[i] = F; dips[i] = 0;
  }
}

// run a block of n samples: n/D steps of its own, then back to the sample rate (linear interpolation)
void WindHarpEngine::run(Str &s, int n) {
  const int D = s.D, ns = n / D;
  if (quiet(s)) ring(s, ns); else step(s, ns);
  if (D == 1) { for (int i = 0; i < n; i++) { fb[i] = fbs[i]; dip[i] = dips[i]; } }
  else {
    double f0 = s.fbLast, d0 = s.dipLast;
    int i = 0;
    const double inv = 1.0 / D;
    for (int k = 0; k < ns; k++) {
      const double f1 = fbs[k], d1 = dips[k], df = (f1 - f0) * inv, dd = (d1 - d0) * inv;
      for (int r = 1; r <= D; r++, i++) { fb[i] = f0 + df * r; dip[i] = d0 + dd * r; }
      f0 = f1; d0 = d1;
    }
  }
  s.fbLast = fbs[ns - 1]; s.dipLast = dips[ns - 1];
}

// n steps of the string and its wake; writes the bridge force and lift into fbs, dips
void WindHarpEngine::step(Str &s, int n) {
  const int N = s.N, J = s.J, Jh = s.Jh, odd = s.odd, No = s.No, Ne = s.Ne;
  const double hs = s.hs;
  double *a = s.a, *v = s.v, *gOld = s.gOld, *accO = s.accO, *accE = s.accE;
  const double *co = s.co, *cv = s.cv, *w2 = s.w2, *kb = s.kb, *phi = s.phi, *phiO = s.phiO, *phiE = s.phiE, *phiMid = s.phiMid;
  double *q = s.q, *qv = s.qv, *ya = s.ya, *e = s.e, *sp = s.sp, *sm = s.sm;
  const double *de = s.de, *dk = s.dk;
  double *k0 = s.k0;
  const double Ad = s.Ad;
  double Ow2 = k0[0], eO = k0[1], r = k0[2], kl = k0[3], nz = k0[4];
  uint32_t rs = s.rs;
  const double dOw2 = dk[0], deO = dk[1], dr = dk[2], dkl = dk[3], dnz = dk[4];
  const double hh = 0.5 * hs, U32 = 2.3283064365386963e-10;
  for (int i = 0; i < n; i++) {
    Ow2 += dOw2; eO += deO; r += dr; kl += dkl; nz += dnz;
    // 1. modal accelerations now (the lift is gOld), split into odd and even harmonics
    for (int k = 0, m = 0; k < No; k++, m += 2) accO[k] = gOld[m] - cv[m] * v[m] - w2[m] * a[m];
    for (int k = 0, m = 1; k < Ne; k++, m += 2) accE[k] = gOld[m] - cv[m] * v[m] - w2[m] * a[m];
    // 2. the stations' accelerations Σ_n φ_nj ä_n: odd harmonics symmetric about the middle, even antisymmetric
    for (int j = 0; j < Jh; j++) {
      double so = 0, se = 0;
      const int oo = j * No, oe = j * Ne;
      for (int k = 0; k < No; k++) so += phiO[oo + k] * accO[k];
      for (int k = 0; k < Ne; k++) se += phiE[oe + k] * accE[k];
      ya[j] = so + se; ya[J - 1 - j] = so - se;
    }
    if (odd) { double so = 0; for (int k = 0; k < No; k++) so += phiMid[2 * k] * accO[k]; ya[Jh] = so; }
    // 3. the wake at each station (leapfrog; damping by the mean of old and new velocity; turbulence)
    double lift = 0;
    for (int j = 0; j < J; j++) {
      const double ej = e[j] + de[j]; e[j] = ej;
      rs ^= rs << 13; rs ^= rs >> 17; rs ^= rs << 5;
      const double qj = q[j], c = eO * (qj * qj - (ej * r - (1 - ej))) * hh;
      const double vj = (qv[j] * (1 - c) + hs * (Ad * ej * ya[j] - Ow2 * qj) + nz * ej * (rs * U32 - 0.5)) / (1 + c);
      qv[j] = vj;
      const double qn = qj + hs * vj; q[j] = qn;
      ya[j] = ej * qn; lift += ya[j]; // ya now holds the lift's pattern f_j = e_j q_j
    }
    for (int j = 0; j < Jh; j++) { const double f1 = ya[j], f2 = ya[J - 1 - j]; sp[j] = f1 + f2; sm[j] = f1 - f2; }
    // 4. the lift on each mode (the same transform back, odd and even harmonics apart), and 5. each mode's exact step
    double F = 0;
    const double fm = odd ? ya[Jh] : 0;
    for (int m = 0; m < N; m++) {
      double g = 0;
      const int o0 = m * Jh;
      const double *src = m & 1 ? sm : sp;
      for (int j = 0; j < Jh; j++) g += phi[o0 + j] * src[j];
      g = (g + phiMid[m] * fm) * kl;
      const int o = 8 * m;
      const double am = a[m], vm = v[m], g0 = gOld[m];
      const double an = co[o] * am + co[o + 1] * vm + co[o + 4] * g0 + co[o + 5] * g;
      v[m] = co[o + 2] * am + co[o + 3] * vm + co[o + 6] * g0 + co[o + 7] * g;
      a[m] = an; gOld[m] = g;
      F += kb[m] * an;
    }
    fbs[i] = F; dips[i] = lift;
  }
  k0[0] = Ow2; k0[1] = eO; k0[2] = r; k0[3] = kl; k0[4] = nz; s.rs = rs;
}

// ---- keys ----------------------------------------------------------------------------------------
void WindHarpEngine::Voice::open(double velocity) { target = 1; rate = 1 / shutterOpen(velocity); held = true; }
void WindHarpEngine::Voice::close(double velocity) { target = 0; rate = 1 / shutterClose(velocity); held = false; }

// A free voice from the pool; failing that (only under a flood of stolen keys), the most faded one.
WindHarpEngine::Voice *WindHarpEngine::freeVoice() {
  for (Voice &v : pool) if (!v.used) return &v;
  Voice *victim = nullptr;
  for (int i = 0; i < nv; i++) if (voices[i]->fading && (!victim || voices[i]->fade < victim->fade)) victim = voices[i];
  if (!victim) return nullptr;
  int j = 0;
  for (int i = 0; i < nv; i++) if (voices[i] != victim) voices[j++] = voices[i];
  nv = j;
  if (byKey[victim->key] == victim) byKey[victim->key] = nullptr;
  if (focus == victim) focus = nullptr;
  victim->used = false;
  return victim;
}

void WindHarpEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < 0 || key > 127) return;
  Voice *v = byKey[key];
  if (v && (v->dead || v->fading || v->version != version)) { if (!v->dead) v->fading = true; v = nullptr; }
  if (!v) {
    v = freeVoice();
    if (!v) return;
    v->used = true; v->key = key; v->version = version;
    DesignParams dp;
    dp.n0 = P[p::n0]; dp.tuning = (int)P[p::tuning]; dp.unison = P[p::unison]; dp.mass = P[p::mass]; dp.q = P[p::q];
    dp.keyboard = designKeyboard;
    CourseOffset o[COURSE_MAX];
    v->ns = courseOffsets(key, o);
    for (int i = 0; i < v->ns; i++) initString(v->strings[i], key, stringDesign(key, dp, o[i]));
    v->x = 0; v->target = 0; v->rate = 0; v->held = false; v->pedal = false;
    v->fading = false; v->fade = 1; v->dead = false; v->age = 0; v->env = 0; v->press = 0; v->pressS = 0;
    v->pb = boxGain(key);
    const auto [gl, gr] = keyPan(key, 0.6, KEY_LO, KEY_HI);
    v->gl = gl; v->gr = gr; v->liftPrev = 0;
    voices[nv++] = v; byKey[key] = v;
    int live = 0;
    for (int i = 0; i < nv; i++) if (!voices[i]->fading && !voices[i]->dead) live++;
    if (live > MAX_VOICES) {
      Voice *victim = nullptr;
      double score = INFINITY;
      for (int i = 0; i < nv; i++) {
        Voice *u = voices[i];
        if (u == v || u->fading || u->dead || u->age < YOUNG) continue;
        const double sc = (u->held || u->pedal ? 1e6 : 0) + u->env;
        if (sc < score) { score = sc; victim = u; }
      }
      if (victim) victim->fading = true;
    }
  }
  v->pedal = false;
  v->open(velocity);
  focus = v;
}

void WindHarpEngine::noteOff(int key, double velocity) {
  Voice *v = key >= 0 && key <= 127 ? byKey[key] : nullptr;
  if (!v || !v->held) return;
  if (sustain) { v->held = false; v->pedal = true; return; }
  v->close(velocity);
}

void WindHarpEngine::setSustain(bool on) {
  sustain = on;
  if (!on) for (int i = 0; i < nv; i++) if (voices[i]->pedal) { voices[i]->pedal = false; voices[i]->close(-1); }
}

void WindHarpEngine::allNotesOff() { for (int i = 0; i < nv; i++) { voices[i]->fading = true; voices[i]->held = false; voices[i]->target = 0; } }

int WindHarpEngine::voiceCount() const { int n = 0; for (int i = 0; i < nv; i++) if (!voices[i]->dead) n++; return n; }

void WindHarpEngine::pressure(double value, int key) {
  if (key < 0) chanPress = value;
  else if (key <= 127 && byKey[key]) byKey[key]->press = value;
}

// the wind at the end of a block of n samples: slider glide, gusts, aftertouch (all gliding)
double WindHarpEngine::wind(int n) {
  const double dt = n * h;
  Uw += (P[p::wind] - Uw) * (1 - exp(-dt / GLIDE));
  const double I = P[p::gust], Tu = P[p::gustTime], t1 = Tu, t2 = Tu / GUST.ratio, w2 = GUST.w2;
  if (I > 0) {
    const double e1 = exp(-dt / t1), e2 = exp(-dt / t2);
    g1 = g1 * e1 + std::sqrt(1 - e1 * e1) * gauss();
    g2 = g2 * e2 + std::sqrt(1 - e2 * e2) * gauss();
  } else { g1 *= 0.99; g2 *= 0.99; }
  Ug = std::sqrt(1 - w2) * g1 + std::sqrt(w2) * g2; // unit variance
  const double kp = 1 - exp(-dt / GLIDE);
  chanS += (chanPress - chanS) * kp;
  for (int i = 0; i < nv; i++) { Voice *v = voices[i]; v->pressS += (v->press - v->pressS) * kp; }
  const double u = Uw * (1 + I * Ug) * (1 + AFTER * chanS);
  U = std::max(0.05, std::min(1.5 * U_MAX, u));
  return U;
}

void WindHarpEngine::bend(double value) {
  bendTo = fdlibm::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12);
}

void WindHarpEngine::process(float *L, float *R, int n) {
  for (; n > BLOCK; n -= BLOCK, L += BLOCK, R += BLOCK) process(L, R, BLOCK);
  std::fill(L, L + n, 0.0f); std::fill(R, R + n, 0.0f);
  if (!hasParams) return;
  if (bendNow != bendTo) { // pitch bend glides; the strings are retuned each block
    bendNow += (bendTo - bendNow) * (1 - fdlibm::exp(-n * h / BEND_T));
    if (std::fabs(bendNow - bendTo) < 1e-9) bendNow = bendTo;
    for (int vi = 0; vi < nv; vi++) for (int i = 0; i < voices[vi]->ns; i++) tension(voices[vi]->strings[i], bendNow);
  }
  const double Unow = wind(n);
  std::fill(flatL, flatL + n, 0.0); std::fill(flatR, flatR + n, 0.0); std::fill(mono, mono + n, 0.0);
  std::fill(dipL, dipL + n, 0.0); std::fill(dipR, dipR + n, 0.0);
  const double fadeK = 1 - h / FADE;
  const double dipGain = 1 / (4 * PI * AIR.c * BOX.r); // p = (cos θ/4πcr) dF/dt, cos θ = 1 (the listener faces the board)
  for (int vi = 0; vi < nv; vi++) {
    Voice &v = *voices[vi];
    if (v.dead) continue;
    const double Uv = Unow * (1 + AFTER * v.pressS);
    // the shutter moves
    const double x0 = v.x;
    if (v.x != v.target) { const double st = v.rate * n * h; v.x = v.target > v.x ? std::min(v.target, v.x + st) : std::max(v.target, v.x - st); }
    std::fill(fbSum, fbSum + n, 0.0); std::fill(dipSum, dipSum + n, 0.0);
    double wq = 0;
    for (int si = 0; si < v.ns; si++) {
      Str &s = v.strings[si];
      const StringDesign &S = s.S;
      prepare(s, Uv, n, x0, v.x, v.target);
      run(s, n);
      // lift per unit Σ e q: ¼ρU²D C_L0 Δx, each station's span heard as incoherent cells of the correlation length, √(ℓ_c Δx)
      const double dx = S.L / s.J, lg = 0.25 * AIR.rho * Uv * Uv * S.D * WAKE.CL0 * std::sqrt(std::min(1.0, S.lc / dx)) * dx * dipGain * fs;
      for (int i = 0; i < n; i++) { fbSum[i] += fb[i]; dipSum[i] += lg * dip[i]; }
      for (int j = 0; j < s.J; j++) wq += s.q[j] * s.q[j];
    }
    // the key's outputs: its bridge force into the box; its lift radiated as a dipole
    const double pb = v.pb, gl = v.gl, gr = v.gr;
    double fade = v.fade, env = v.env, prev = v.liftPrev;
    for (int i = 0; i < n; i++) {
      if (v.fading) fade *= fadeK;
      const double F = fbSum[i] * fade, pr = pb * F;
      flatL[i] += gl * pr; flatR[i] += gr * pr; mono[i] += pr;
      const double l = dipSum[i] * fade, d = l - prev;
      prev = l;
      dipL[i] += gl * d; dipR[i] += gr * d;
      const double af = F < 0 ? -F : F;
      env = af > env ? af : env * 0.9997;
    }
    v.fade = fade; v.env = env; v.liftPrev = prev; v.age += n / fs;
    // retire: faded, or shut and silent
    const StringDesign &S = v.strings[0].S;
    if (v.fading && fade < 1e-4) v.dead = true;
    if (!v.fading && v.target == 0 && v.x == 0 && env < 1e-7 * (S.T / S.L) * S.D && wq < 1e-6) v.dead = true;
  }
  // the box's resonances on the summed (centre) pressure, and the mix
  for (int i = 0; i < n; i++) {
    const double x = mono[i];
    double l = flatL[i], r = flatR[i];
    for (int k = 0; k < 5; k++) { const double y = (BOX.modes[k].G - 1) * bp[k].run(x); l += BOX.modes[k].sign[0] * y * 0.7071; r += BOX.modes[k].sign[1] * y * 0.7071; }
    // the top's radiation efficiency (first-order shelf, one per microphone)
    const double yl = shelf[0] * l + shelfZ[0], yr = shelf[0] * r + shelfZ[1];
    shelfZ[0] = shelf[1] * l - shelf[2] * yl; shelfZ[1] = shelf[1] * r - shelf[2] * yr;
    L[i] = (float)(OUT * (yl + dipL[i])); R[i] = (float)(OUT * (yr + dipR[i]));
  }
  // drop dead voices in place
  int j = 0;
  for (int i = 0; i < nv; i++) {
    Voice *v = voices[i];
    if (!v->dead) voices[j++] = v;
    else { if (byKey[v->key] == v) byKey[v->key] = nullptr; v->used = false; if (focus == v) focus = nullptr; }
  }
  nv = j;
  if (messages && ++blocks >= POST_BLOCKS) { blocks = 0; postState(); }
}

// the dominant mode of a string and its amplitude
WindHarpEngine::Dominant WindHarpEngine::dominant(const Str &s) {
  int best = 0;
  double be = -1;
  for (int m = 0; m < s.N; m++) { const double e = s.v[m] * s.v[m] + s.w[m] * s.w[m] * s.a[m] * s.a[m]; if (e > be) { be = e; best = m; } }
  return {best + 1, std::sqrt(std::max(0.0, be)) / s.w[best]};
}

void WindHarpEngine::postState() {
  Message m;
  const Voice *f = focus;
  if (f) {
    const Str &s0 = f->strings[0];
    const double *arrays[6] = {s0.a, s0.v, s0.w, s0.q, s0.qv, s0.e};
    for (int k = 0; k < 6; k++) {
      m = Message{};
      m.type = msg::array; m.key = (int16_t)k; m.count = (uint16_t)(k < 3 ? s0.N : s0.J);
      for (int i = 0; i < m.count; i++) m.values[i] = (float)arrays[k][i];
      post(m);
    }
  }
  int nk = 0;
  m = Message{};
  m.type = msg::keys;
  for (int i = 0; i < nv; i++) {
    const Voice *v = voices[i];
    if (v->dead || nk >= MAX_VOICES + 2) continue;
    const Dominant d = dominant(v->strings[0]);
    if (m.count == 0) { m.values[0] = (float)nk; m.count = 1; }
    m.values[m.count++] = (float)v->key; m.values[m.count++] = (float)d.n; m.values[m.count++] = (float)(d.amp / v->strings[0].S.D);
    nk++;
    if (m.count >= 28) { post(m); m = Message{}; m.type = msg::keys; }
  }
  if (m.count) post(m);
  m = Message{};
  m.type = msg::harp;
  float *o = m.values;
  o[0] = (float)U; o[1] = (float)Uw; o[2] = (float)voiceCount();
  if (f) {
    const Str &s0 = f->strings[0];
    const Dominant d = dominant(s0);
    m.key = (int16_t)f->key;
    o[3] = (float)s0.N; o[4] = (float)s0.J; o[5] = (float)s0.Om; o[6] = (float)s0.S.D; o[7] = (float)s0.S.L;
    o[8] = (float)d.n; o[9] = (float)(d.amp / s0.S.D); o[10] = (float)s0.home; o[11] = (float)f->x; o[12] = (float)s0.Ucur;
    o[13] = (float)s0.Re; o[14] = (float)f->ns;
  } else m.key = -1;
  o[15] = (float)nk;
  m.count = 16;
  post(m);
}

} // namespace forte::windharp
