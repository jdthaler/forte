// carillon-engine.cpp — the carillon's engine (carillon-engine.h).

#include "carillon-engine.h"

#include <algorithm>
#include <cmath>

namespace forte::carillon {

constexpr double OUT = 0.00156;     // output units per pascal at the listener (30 m away)
constexpr double FADE = 0.03;       // s: a stolen voice fades out over this
constexpr double YOUNG = 0.05;      // s: a voice this young is never stolen
constexpr double FLIGHT_MAX = 0.03; // s: the longest the clapper is followed after it is launched
constexpr double GLIDE = 0.03;      // s: output gains (distance, listener) and the asymmetry glide over this
constexpr double PRUNE = 1e-5;      // a mode below this × the bell's loudest is skipped (−100 dB)
constexpr int POST_BLOCKS = 4;
constexpr int BLOCK_MAX = 1024;
static constexpr double PI = std::numbers::pi;

static void keyPan(int key, double &l, double &r) {
  const double p = 0.5 * ((2.0 * (key - KEY_LO)) / (KEY_HI - KEY_LO) - 1), a = ((p + 1) * PI) / 4;
  l = std::cos(a); r = std::sin(a);
}

CarillonEngine::CarillonEngine(double fs)
    : Engine(fs), pool(new Voice[POOL]), forcesLen((int)std::ceil(FLIGHT_MAX * fs) + 2), buf(BLOCK_MAX) {
  for (int i = 0; i < POOL; i++) pool[i].forces.assign(forcesLen, 0.0);
  byKey.fill(-1);
}

void CarillonEngine::setParams(const double *p) {
  const bool first = !hasParams;
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
  T_asym = P[p::asym] / 100; T_distance = P[p::distance];
  if (first) { S_asym = T_asym; S_distance = T_distance; }
  for (int i = 0; i < nVoices; i++) { Voice &v = pool[order[i]]; coefs(v, false); gains(v, false); } // losses, listener: at once (gains glide)
}

// A fresh voice for a bell at `key`, from a free slot of the pool (or, when every slot holds a
// bell, the faintest of those fading out, or else the faintest).
int CarillonEngine::newVoice(int key) {
  bool used[POOL] = {};
  for (int i = 0; i < nVoices; i++) used[order[i]] = true;
  int slot = -1;
  for (int i = 0; i < POOL && slot < 0; i++) if (!used[i]) slot = i;
  if (slot < 0) {
    int pos = -1;
    double score = INFINITY;
    for (int pass = 0; pass < 2 && pos < 0; pass++)
      for (int i = 0; i < nVoices; i++) {
        const Voice &u = pool[order[i]];
        if (pass == 0 && !u.fading) continue;
        const double s = pass == 0 ? u.fade * u.level : u.level;
        if (s < score) { score = s; pos = i; }
      }
    slot = order[pos];
    if (byKey[pool[slot].key - KEY_LO] == slot) byKey[pool[slot].key - KEY_LO] = -1;
    if (focus == slot) focus = -1;
    std::copy(order.begin() + pos + 1, order.begin() + nVoices, order.begin() + pos);
    nVoices--;
  }
  Voice &v = pool[slot];
  v.key = key; v.profile = (int)P[p::profile]; v.historicAmount = P[p::historic];
  bellOf(key, v.profile, v.historicAmount, v.bell);
  v.nModes = bellModes(v.bell, P.data(), v.modes);
  // resonators: one per m = 0 mode, two (the doublet) per m ≥ 1 mode
  int N = 0;
  for (int i = 0; i < v.nModes; i++) {
    v.src[N] = i; v.mem[N++] = 0;
    if (v.modes[i].m > 0) { v.src[N] = i; v.mem[N++] = 1; }
  }
  v.N = N;
  for (double *a : {v.A1, v.A2, v.Bc, v.PHI, v.B, v.G, v.GT, v.Y1, v.Y2, v.W, v.SIG, v.AMP, v.ANG, v.HRE, v.HIM}) std::fill(a, a + RES_MAX, 0.0);
  std::fill(v.act, v.act + RES_MAX, 0);
  std::fill(v.idx, v.idx + RES_MAX, 0);
  v.nAct = 0;
  keyPan(key, v.gl, v.gr);
  v.eps = 0; v.age = 0; v.fade = 1; v.fading = false; v.dead = false;
  v.peak = 0; v.level = 0; v.released = false;
  v.clap = {}; v.Cm = v.hm = v.fd0 = v.fV0 = 0;
  v.cl = Clap{};
  coefs(v, true);
  gains(v, true);
  order[nVoices++] = slot;
  return slot;
}

// Frequencies (with the doublet split at the current asymmetry) and damping → two-pole coefficients.
void CarillonEngine::coefs(Voice &v, bool first) {
  const double h = 1 / fs, eps = S_asym, nyq = 0.45 * fs;
  v.eps = eps;
  if (first) { // a historic bell's own asymmetry in harmonic 2m, as a phasor (the knob's lies along ψ = 0)
    for (int r = 0; r < v.N; r++) {
      const int m = v.modes[v.src[r]].m;
      const Asymmetry as = asymmetryOf(m, 0, v.bell.hasHist ? &v.bell.hist : nullptr);
      v.HRE[r] = as.e * std::cos(2 * m * as.psi); v.HIM[r] = as.e * std::sin(2 * m * as.psi);
    }
  }
  for (int r = 0; r < v.N; r++) {
    const BellMode &md = v.modes[v.src[r]];
    const int member = v.mem[r], m = md.m;
    const double re = eps + v.HRE[r], im = v.HIM[r], e = std::sqrt(re * re + im * im);
    const double fac = m > 0 ? (member == 0 ? 1 - (e * md.kappa) / 4 : 1 + (e * md.kappa) / 4) : 1; // doubletSplit()
    const double f = md.f * fac, w = TAU * f, sig = md.sigma, rr = std::exp(-sig * h);
    // the pair's orientation is set when the bell is hung (a ringing doublet keeps its axes)
    if (first) v.ANG[r] = e > 0 && m > 0 ? std::atan2(im, re) / (2 * m) : 0;
    v.W[r] = w; v.SIG[r] = sig;
    if (f >= nyq) { v.A1[r] = 0; v.A2[r] = 0; v.Bc[r] = 0; continue; }
    v.A1[r] = 2 * rr * std::cos(w * h); v.A2[r] = rr * rr; v.Bc[r] = (h * rr * std::sin(w * h)) / w;
  }
}

// Output gains toward the listener (targets; they glide): the mode's radiation, its doublet member's
// pattern cos/sin m(β − ψ) at the listener's azimuth β, the distance; × fs for velocity from the
// backward difference, corrected to the exact amplitude at the mode's frequency.
void CarillonEngine::gains(Voice &v, bool now) {
  const double h = 1 / fs, beta = ((P[p::strikeAngle] + P[p::around]) * PI) / 180;
  int lastSrc = -1;
  double dg = 0;
  for (int r = 0; r < v.N; r++) {
    const BellMode &md = v.modes[v.src[r]];
    const int m = md.m, member = v.mem[r];
    const double w = v.W[r];
    const double pat = m == 0 ? 1 : member == 0 ? std::cos(m * (beta - v.ANG[r])) : std::sin(m * (beta - v.ANG[r]));
    const double corr = (0.5 * w * h) / std::sin(0.5 * w * h);
    if (v.A1[r] == 0) v.GT[r] = 0;
    else {
      if (v.src[r] != lastSrc) { dg = distanceGain(md.f, S_distance); lastSrc = v.src[r]; } // a doublet's two members: once
      v.GT[r] = OUT * md.rad * pat * dg * fs * corr;
    }
    if (now) v.G[r] = v.GT[r];
  }
}

// The clapper is launched at the wall where the bell is now: its ball 1.5 steps from the surface,
// moving at v. Each mode's reach at the strike point: the inner surface's motion there, times
// cos/sin m(α − ψ) for the two members of a doublet (α the strike's azimuth).
void CarillonEngine::strike(Voice &v, double velocity) {
  const double h = 1 / fs, alpha = (P[p::strikeAngle] * PI) / 180;
  bellModes(v.bell, P.data(), modesNow); // strike height may have moved
  double C = 0, u = 0;
  for (int r = 0; r < v.N; r++) {
    const BellMode &md = modesNow[v.src[r]];
    const int m = md.m, member = v.mem[r];
    const double ang = m == 0 ? 1 : member == 0 ? std::cos(m * (alpha - v.ANG[r])) : std::sin(m * (alpha - v.ANG[r]));
    const double phi = v.A1[r] == 0 ? 0 : md.reach * ang;
    v.PHI[r] = phi; v.B[r] = v.Bc[r] * phi; C += v.Bc[r] * phi * phi;
    u += phi * v.Y1[r];
    v.act[r] = v.A1[r] != 0 ? 1 : 0;
  }
  compact(v);
  const double speed = clapperSpeed(v.bell, P.data(), velocity);
  if (!(speed > 0)) return;
  Clap &cl = v.cl;
  const Clapper c = clapperOf(v.bell, P.data());
  v.clap = c; v.Cm = C; v.hm = (h * h) / c.m;
  cl.x = u - 1.5 * speed * h; cl.x1 = cl.x - speed * h; cl.d1 = -1; cl.d2 = -1; cl.on = true; cl.n = 0; cl.contact = 0; cl.Fmax = 0; cl.v = speed;
  v.fading = false; v.fade = 1; v.age = 0; v.released = false;
}

// Hertz force for a compression D at the next step: the discrete gradient of V = (2/5) K δ^(5/2)
// between δ two steps back and D, so the impact neither makes nor loses energy numerically.
double CarillonEngine::hertz(Voice &v, double D) const {
  const double K = v.clap.K, d0 = v.fd0;
  const double V = D > 0 ? 0.4 * K * D * D * std::sqrt(D) : 0, dd = D - d0;
  const double f = std::fabs(dd) > 1e-16 ? (V - v.fV0) / dd : D > 0 ? K * D * std::sqrt(D) : 0;
  return f > 0 ? f : 0;
}
// Solve D + C·F(D) = dFree (C: the bell's and the clapper's compliance over one step).
double CarillonEngine::contactForce(Voice &v, double dFree, double C) {
  Clap &cl = v.cl;
  const double d0 = cl.d2, K = v.clap.K;
  v.fd0 = d0; v.fV0 = d0 > 0 ? 0.4 * K * d0 * d0 * std::sqrt(d0) : 0;
  cl.d2 = cl.d1;
  if (dFree <= 0 && d0 <= 0) { cl.d1 = dFree; return 0; }
  double hi = dFree, lo = dFree - C * hertz(v, dFree) - 1e-15, D = 0.5 * (lo + hi);
  for (int it = 0; it < 60; it++) {
    const double F = hertz(v, D), g = D + C * F - dFree;
    if (g > 0) hi = D; else lo = D;
    if (hi - lo <= 1e-14 * (std::fabs(dFree) + 1e-9)) break;
    const double e = 1e-9 * (std::fabs(D) + 1e-9), dg = 1 + (C * (hertz(v, D + e) - F)) / e;
    double Dn = D - g / dg;
    if (!(Dn > lo && Dn < hi)) Dn = 0.5 * (lo + hi);
    D = Dn;
  }
  cl.d1 = D;
  return hertz(v, D);
}

void CarillonEngine::render(Voice &v, float *L, float *R, int n) {
  const int N = v.N;
  double *A1 = v.A1, *A2 = v.A2, *Y1 = v.Y1, *Y2 = v.Y2, *G = v.G, *GT = v.GT, *b = buf.data();
  const uint8_t *act = v.act;
  const double glide = 1 - std::exp(-n / (GLIDE * fs)), inv = 1.0 / n;
  std::fill(b, b + n, 0.0);
  if (v.cl.on) {
    // the clapper is in flight or in contact: every mode, sample by sample
    Clap &cl = v.cl;
    const double *PHI = v.PHI, *B = v.B, C = v.Cm + v.hm;
    for (int r = 0; r < N; r++) G[r] += glide * (GT[r] - G[r]);
    for (int s = 0; s < n; s++) {
      double uf = 0;
      for (int r = 0; r < N; r++) { const double y = A1[r] * Y1[r] - A2[r] * Y2[r]; Y2[r] = Y1[r]; Y1[r] = y; uf += PHI[r] * y; }
      double F = 0;
      if (cl.on) {
        const double xf = 2 * cl.x - cl.x1;
        F = contactForce(v, xf - uf, C);
        cl.x1 = cl.x; cl.x = xf - v.hm * F;
        if (F > 0) { for (int r = 0; r < N; r++) Y1[r] += B[r] * F; cl.contact++; if (F > cl.Fmax) cl.Fmax = F; }
        if (cl.n < forcesLen) v.forces[cl.n] = F;
        if (++cl.n >= forcesLen || (cl.contact > 0 && F == 0 && cl.d1 < -1e-4 * v.bell.D)) endContact(v);
      }
      double y = 0;
      for (int r = 0; r < N; r++) y += G[r] * (Y1[r] - Y2[r]);
      b[s] = y;
    }
  } else {
    // free ringing: mode by mode over the block, four at a time (independent recursions in one loop
    // run in parallel in the CPU), each output gain ramping to its target
    const int *idx = v.idx, na = v.nAct;
    int q = 0;
    for (; q + 4 <= na; q += 4) {
      const int r0 = idx[q], r1 = idx[q + 1], r2 = idx[q + 2], r3 = idx[q + 3];
      const double a10 = A1[r0], a20 = A2[r0], a11 = A1[r1], a21 = A2[r1], a12 = A1[r2], a22 = A2[r2], a13 = A1[r3], a23 = A2[r3];
      double y10 = Y1[r0], y20 = Y2[r0], y11 = Y1[r1], y21 = Y2[r1], y12 = Y1[r2], y22 = Y2[r2], y13 = Y1[r3], y23 = Y2[r3];
      double g0 = G[r0], g1 = G[r1], g2 = G[r2], g3 = G[r3];
      const double d0 = glide * (GT[r0] - g0) * inv, d1 = glide * (GT[r1] - g1) * inv, d2 = glide * (GT[r2] - g2) * inv, d3 = glide * (GT[r3] - g3) * inv;
      for (int s = 0; s < n; s++) {
        const double x0 = a10 * y10 - a20 * y20, x1 = a11 * y11 - a21 * y21, x2 = a12 * y12 - a22 * y22, x3 = a13 * y13 - a23 * y23;
        b[s] += g0 * (x0 - y10) + g1 * (x1 - y11) + g2 * (x2 - y12) + g3 * (x3 - y13);
        y20 = y10; y10 = x0; y21 = y11; y11 = x1; y22 = y12; y12 = x2; y23 = y13; y13 = x3;
        g0 += d0; g1 += d1; g2 += d2; g3 += d3;
      }
      Y1[r0] = y10; Y2[r0] = y20; Y1[r1] = y11; Y2[r1] = y21; Y1[r2] = y12; Y2[r2] = y22; Y1[r3] = y13; Y2[r3] = y23;
      G[r0] = g0; G[r1] = g1; G[r2] = g2; G[r3] = g3;
    }
    for (; q < na; q++) {
      const int r = idx[q];
      const double a1 = A1[r], a2 = A2[r];
      double y1 = Y1[r], y2 = Y2[r], g = G[r];
      const double dg = glide * (GT[r] - g) * inv;
      for (int s = 0; s < n; s++) { const double y = a1 * y1 - a2 * y2; b[s] += g * (y - y1); y2 = y1; y1 = y; g += dg; }
      Y1[r] = y1; Y2[r] = y2; G[r] = g;
    }
    // the skipped modes' gains still follow their targets
    if (na < N) for (int r = 0; r < N; r++) if (!act[r]) G[r] += glide * (GT[r] - G[r]);
  }
  const double gl = v.gl, gr = v.gr, fadeStep = v.fading ? 1 / (FADE * fs) : 0;
  double fade = v.fade;
  for (int s = 0; s < n; s++) {
    const double y = b[s] * fade;
    if (fadeStep) { fade -= fadeStep; if (fade <= 0) { fade = 0; v.dead = true; } }
    L[s] += gl * y; R[s] += gr * y;
  }
  v.fade = fade;
  v.age += n / fs;
  prune(v);
}

void CarillonEngine::endContact(Voice &v) {
  Clap &cl = v.cl;
  cl.on = false; cl.ms = (1000.0 * cl.contact) / fs;
  // the force pulse's width at half its peak
  int a = -1, b = -1;
  for (int i = 0; i < std::min(cl.n, forcesLen); i++) if (v.forces[i] >= 0.5 * cl.Fmax) { if (a < 0) a = i; b = i; }
  cl.fwhm = a >= 0 ? (1000.0 * (b - a + 1)) / fs : 0;
}

// Each mode's amplitude as heard (from two successive samples: exact for a free decaying sinusoid);
// skip those far below the bell's loudest; the bell is done when every mode is.
void CarillonEngine::prune(Voice &v) {
  const double h = 1 / fs;
  const int N = v.N;
  double sum = 0;
  bool any = false;
  for (int r = 0; r < N; r++) {
    if (!v.act[r]) { v.AMP[r] = 0; continue; }
    const double w = v.W[r], c = std::cos(w * h), sn = std::sin(w * h), a = v.Y1[r], b = v.Y2[r];
    // displacement amplitude × the output's gain at this frequency (G·(y − y₁) has gain 2 sin(ωh/2))
    const double amp = (std::sqrt(std::max(0.0, a * a - 2 * c * a * b + b * b)) / sn) * std::fabs(v.GT[r]) * 2 * std::sin(0.5 * w * h);
    v.AMP[r] = amp; sum += amp;
  }
  if (!(sum < 1e6)) {
    v.dead = true;
    Message m;
    m.type = msg::error; m.key = (int16_t)v.key;
    post(m);
    return;
  }
  if (sum > v.peak) v.peak = sum;
  v.level = sum;
  if (v.cl.on || v.age < YOUNG) return;
  const double floor = PRUNE * v.peak;
  for (int r = 0; r < N; r++) if (v.act[r]) { if (v.AMP[r] < floor || v.AMP[r] < 1e-12) v.act[r] = 0; else any = true; }
  compact(v);
  if (!any) v.dead = true;
}

void CarillonEngine::compact(Voice &v) {
  int k = 0;
  for (int r = 0; r < v.N; r++) if (v.act[r]) v.idx[k++] = r;
  v.nAct = k;
}

void CarillonEngine::noteOn(int key, double velocity) {
  if (!hasParams || !(key >= KEY_LO && key <= KEY_HI)) return;
  const int profile = (int)P[p::profile];
  const double hist = P[p::historic];
  int slot = byKey[key - KEY_LO];
  if (slot < 0 || pool[slot].dead || pool[slot].fading || pool[slot].profile != profile || pool[slot].historicAmount != hist) {
    if (slot >= 0 && !pool[slot].dead) pool[slot].fading = true; // a different bell now hangs there: the old one fades out
    slot = newVoice(key);
    byKey[key - KEY_LO] = slot;
  }
  Voice &v = pool[slot];
  strike(v, velocity);
  focus = slot;
  int live = 0;
  for (int i = 0; i < nVoices; i++) if (!pool[order[i]].fading) live++;
  if (live > MAX_VOICES) {
    Voice *victim = nullptr;
    double score = INFINITY;
    for (int i = 0; i < nVoices; i++) {
      Voice &u = pool[order[i]];
      if (&u == &v || u.fading || u.cl.on || u.age < YOUNG) continue;
      if (u.level < score) { score = u.level; victim = &u; }
    }
    if (victim) victim->fading = true;
  }
}

void CarillonEngine::noteOff(int key, double) { // the clapper falls back; the bell rings on
  if (key >= KEY_LO && key <= KEY_HI && byKey[key - KEY_LO] >= 0) pool[byKey[key - KEY_LO]].released = true;
}

void CarillonEngine::allNotesOff() { for (int i = 0; i < nVoices; i++) pool[order[i]].fading = true; }

void CarillonEngine::process(float *L, float *R, int n) {
  for (int at = 0; at < n; at += BLOCK_MAX) block(L + at, R + at, std::min(BLOCK_MAX, n - at));
}

void CarillonEngine::block(float *L, float *R, int n) {
  std::fill(L, L + n, 0.0f); std::fill(R, R + n, 0.0f);
  if (!hasParams) return;
  const double a = 1 - std::exp(-n / (GLIDE * fs));
  bool moved = false;
  for (auto [S, T] : {std::pair{&S_asym, T_asym}, std::pair{&S_distance, T_distance}}) {
    if (*S == T) continue;
    *S += a * (T - *S);
    if (std::fabs(T - *S) < 1e-6 * (std::fabs(T) + 1e-4)) *S = T;
    moved = true;
  }
  for (int i = 0; i < nVoices; i++) {
    Voice &v = pool[order[i]];
    if (moved) { if (v.eps != S_asym) coefs(v, false); gains(v, false); }
    render(v, L, R, n);
  }
  int j = 0;
  for (int i = 0; i < nVoices; i++) {
    const int slot = order[i];
    if (pool[slot].dead) { if (byKey[pool[slot].key - KEY_LO] == slot) byKey[pool[slot].key - KEY_LO] = -1; }
    else order[j++] = slot;
  }
  nVoices = j;
  if (focus >= 0 && pool[focus].dead) focus = -1;
  if (messages && ++blocks >= POST_BLOCKS) { blocks = 0; postFocus(); }
}

// Live data for the page's views: the struck bell's partials as heard (each doublet member), and
// its last clapper impact.
void CarillonEngine::postFocus() {
  Message m;
  m.type = msg::bell;
  if (focus < 0) { m.key = 0; m.count = 1; m.values[0] = 0; post(m); return; }
  const Voice &v = pool[focus];
  const int n = std::min(v.N, 512);
  const double head[] = {(double)n, v.age, v.cl.ms, v.cl.fwhm, v.cl.Fmax, v.cl.v, (double)v.profile, v.historicAmount};
  m.key = (int16_t)v.key; m.count = 8;
  for (int i = 0; i < 8; i++) m.values[i] = (float)head[i];
  post(m);
  for (int at = 0; at < n; at += 29) {
    Message a;
    a.type = msg::amp; a.key = (int16_t)v.key;
    const int c = std::min(29, n - at);
    a.values[0] = (float)at;
    for (int i = 0; i < c; i++) a.values[1 + i] = (float)v.AMP[at + i];
    a.count = (uint16_t)(1 + c);
    post(a);
  }
  Message d;
  d.type = msg::done; d.key = (int16_t)v.key; d.count = 1; d.values[0] = (float)n;
  post(d);
}

} // namespace forte::carillon
