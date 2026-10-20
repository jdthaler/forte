// celesta-engine.cpp — the celesta's engine (celesta-engine.h).

#include "celesta-engine.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace forte::celesta {

using std::numbers::pi;

constexpr double OUT = 0.125;       // output units per m³/s² of volume acceleration
constexpr int MAX_VOICES = 24;      // bars sounding at once; the quietest older one fades out beyond this
constexpr double FADE = 0.03;       // s: a stolen voice fades out over this
constexpr double YOUNG = 0.05;      // s: a voice this young is never stolen
constexpr double HAMMER_MAX = 0.03; // s: the longest a hammer may stay in flight
constexpr double GLIDE[] = {0.03, 0.03, 0.05}; // s: knobs glide (gap, detune, boxes)
constexpr double DAMP_RAMP = 0.008; // s: the damper felt lands (and lifts) over this
constexpr int POST_BLOCKS = 4;      // live view messages every few blocks
constexpr double NYQUIST = 0.45;    // × fs: modes from here up are left out (they would alias)

// ---- a voice: one bar and its box -----------------------------------------------------------

void CelestaEngine::Voice::start(CelestaEngine &eng, const Bar &b, double thickness, double tuned) {
  *this = Voice{};
  inUse = true;
  bar = b; thick = thickness; ratio = tuned;
  key = b.geom.key; N = b.count;
  out0 = b.out[0];
  // Quality: Medium and Low leave out the modes above 16 and 12 kHz, and let the bar go at −70 and
  // −60 dB under its loudest instead of −90
  top = eng.pick(NYQUIST * eng.fs, std::min(NYQUIST * eng.fs, 16000.0), std::min(NYQUIST * eng.fs, 12000.0));
  floor = eng.pick(1e-9, 1e-7, 1e-6);
  coefs(eng);
}

// Exact two-pole coefficients for modes 2… at the current damping (bar losses + damper).
void CelestaEngine::Voice::coefs(const CelestaEngine &eng) {
  const double k = 1 / eng.fs, sd = (6.91 / eng.P[p::damp]) * damp;
  for (int i = 0; i < N; i++) {
    const double f = bar.f[i], om = TAU * f, s = bar.sigTE[i] + bar.sigSup[i] + bar.sigRad[i] + pi * f * eng.P[p::eta] + sd * bar.dampW[i];
    sig[i] = s;
    if (i == 0) { K11 = om * om; sig1 = s; continue; }
    cut[i] = f >= top;
    if (cut[i]) { a1[i] = a2[i] = bc[i] = accOut[i] = 0; continue; } // above what the sample rate holds (or Quality's top): silent, never struck
    const double r = std::exp(-s * k), od = std::sqrt(std::max(om * om - s * s, 1e-6));
    a1[i] = 2 * r * std::cos(od * k); a2[i] = r * r; bc[i] = (k * r * std::sin(od * k)) / od;
    accOut[i] = om * om * bar.out[i];
  }
  dampSet = damp;
}

// The box's state for the knobs as they stand (at the block's end).
void CelestaEngine::Voice::box(const CelestaEngine &eng) {
  const auto &S = eng.S;
  const BoxState bs = boxState(bar.box, bar.f[0], S[gGap], S[gDetune]);
  const double u = S[gBoxes];
  M11n = 1 + u * (bs.M11 - 1); M12n = u * bs.M12; M22n = bs.ma + u * bs.mg; Kan = bs.Ka; Rn = bs.R; boxGainn = u;
  if (fresh) { M11 = M11n; M12 = M12n; M22 = M22n; Ka = Kan; R = Rn; boxGain = boxGainn; fresh = false; }
}

// The hammer lands at x (fraction of the length from the end) and y (fraction of the half-width).
void CelestaEngine::Voice::strike(const CelestaEngine &eng, double velocity) {
  const double *P = eng.P.data();
  const double yb = P[p::across] * (bar.geom.b / 2);
  coefs(eng);
  double comp = 0;
  for (int i = 0; i < N; i++) {
    const double w = shapeAt(bar, i, P[p::strike]), wsi = bar.tors[i] ? w * yb : w;
    ws[i] = wsi;
    if (i > 0) { bws[i] = bc[i] * wsi; comp += bc[i] * wsi * wsi; }
  }
  ws0 = ws[0]; compModes = comp;
  const Hammer H = hammerOf(key, eng.expr.slideOr(key, P[p::hardness]), P[p::mass]); // the key's own felt, or the knob's
  const double v = P[p::speedMax] * std::max(0.0, std::min(1.0, velocity)), h = 1 / eng.fs;
  if (!(v > 0)) return;
  ham = H; kOverM = (h * h) / H.m; halfAlpha = H.alpha / (2 * h);
  // launch the hammer 1.5 steps above the bar's surface where it lands (downward positive)
  double uc = ws0 * qb;
  for (int i = 1; i < N; i++) uc += ws[i] * q[i];
  eta = uc - 1.5 * v * h; etaPrev = eta - v * h;
  dPrev = -1; dPrev2 = -1; hammerOn = true; contact = false; inFlight = 0;
  contactSamples = 0; Fmax = 0;
  released = false; fading = false; fade = 1; age = 0;
}

// Felt force for a compression D at the next step: the discrete gradient of V = Kδ^(p+1)/(p+1)
// between δ two steps back and D (energy-conserving), plus the felt's hysteresis K α d(δ^p)/dt.
double CelestaEngine::Voice::felt(double D) const {
  const double K = ham.K, p = ham.p, Dp = D > 0 ? std::pow(D, p) : 0, dd = D - fd0;
  const double el = std::fabs(dd) > 1e-15 ? ((D > 0 ? (K * Dp * D) / (p + 1) : 0) - fV0) / dd : K * Dp;
  const double f = el + K * halfAlpha * (Dp - fP0);
  return f > 0 ? f : 0;
}
// Solve D + C·F(D) = dFree (C: the bar's and the hammer's compliance over one step).
double CelestaEngine::Voice::contactForce(double dFree, double C) {
  const double d0 = dPrev2, K = ham.K, p = ham.p;
  fd0 = d0; fV0 = d0 > 0 ? (K * std::pow(d0, p + 1)) / (p + 1) : 0; fP0 = d0 > 0 ? std::pow(d0, p) : 0;
  dPrev2 = dPrev;
  if (dFree <= 0 && d0 <= 0) { dPrev = dFree; return 0; }
  double hi = dFree, lo = dFree - C * felt(dFree) - 1e-15, D = 0.5 * (lo + hi);
  for (int it = 0; it < 60; it++) {
    const double F = felt(D), g = D + C * F - dFree;
    if (g > 0) hi = D; else lo = D;
    if (hi - lo <= 1e-13 * (std::fabs(dFree) + 1e-9)) break;
    const double e = 1e-9 * (std::fabs(D) + 1e-9), dg = 1 + (C * (felt(D + e) - F)) / e;
    double Dn = D - g / dg;
    if (!(Dn > lo && Dn < hi)) Dn = 0.5 * (lo + hi);
    D = Dn;
  }
  dPrev = D;
  return felt(D);
}

void CelestaEngine::Voice::render(float *L, float *Rt, int n, CelestaEngine &eng) {
  const double h = 1 / eng.fs, h2 = 0.5 * h * h, hq = 0.25 * h * h, inv = 1.0 / n;
  const double M11a = M11, dM11 = M11n - M11a, M12a = M12, dM12 = M12n - M12a, M22a = M22, dM22 = M22n - M22a;
  const double Kaa = Ka, dKa = Kan - Kaa, Ra = R, dR = Rn - Ra, bga = boxGain, dbg = boxGainn - bga;
  const double c1 = 2 * sig1;
  const double fadeStep = fading ? 1 / (FADE * eng.fs) : 0;
  const double gl = bar.pan[0], gr = bar.pan[1];
  double qb_ = qb, vb_ = vb, X_ = X, vx_ = vx, fade_ = fade;
  for (int s = 0; s < n; s++) {
    const double t = (s + 1) * inv;
    const double m11 = M11a + dM11 * t, m12 = M12a + dM12 * t, m22 = M22a + dM22 * t, ka = Kaa + dKa * t, r22 = Ra + dR * t;
    // pre-warped stiffnesses, so the implicit midpoint rule keeps each oscillator's own frequency
    const double xb = (hq * K11) / m11, xt = (hq * ka) / m22;
    const double wb = 1 + xb * (1.0 / 3 + xb * (2.0 / 15)), wt = 1 + xt * (1.0 / 3 + xt * (2.0 / 15));
    const double k11 = K11 * wb * wb, k22 = ka * wt * wt;
    const double a11 = 2 * m11 + h * c1 * m11 + h2 * k11, a12 = 2 * m12, a22 = 2 * m22 + h * r22 + h2 * k22;
    const double id = 1 / (a11 * a22 - a12 * a12);
    const double r1 = 2 * (m11 * vb_ + m12 * vx_) - h * k11 * qb_, r2 = 2 * (m12 * vb_ + m22 * vx_) - h * k22 * X_;
    double vmb = (a22 * r1 - a12 * r2) * id, vmx = (a11 * r2 - a12 * r1) * id;
    for (int i = 1; i < N; i++) { const double qn = a1[i] * q[i] - a2[i] * q1[i]; q1[i] = q[i]; q[i] = qn; }
    if (hammerOn) {
      double uf = ws0 * (qb_ + h * vmb);
      for (int i = 1; i < N; i++) uf += ws[i] * q[i];
      const double etaF = 2 * eta - etaPrev, C = compModes + h * h * a22 * id * ws0 * ws0 + kOverM;
      const double Fc = contactForce(etaF - uf, C);
      etaPrev = eta; eta = etaF - kOverM * Fc;
      if (Fc > 0) {
        for (int i = 1; i < N; i++) q[i] += bws[i] * Fc;
        const double f0 = ws0 * Fc * h * id;
        vmb += a22 * f0; vmx -= a12 * f0;
        contact = true; contactSamples++;
        if (Fc > Fmax) Fmax = Fc;
      }
      if (++inFlight > eng.hammerMax || (contact && Fc == 0 && dPrev < -1e-4)) {
        hammerOn = false; lastContactMs = (1000.0 * contactSamples) / eng.fs;
      }
    }
    const double vbN = 2 * vmb - vb_, vxN = 2 * vmx - vx_;
    qb_ += h * vmb; X_ += h * vmx;
    double y = (bga + dbg * t) * (vxN - vx_) * eng.fs + out0 * (vbN - vb_) * eng.fs;
    vb_ = vbN; vx_ = vxN;
    for (int i = 1; i < N; i++) y -= accOut[i] * q[i];
    y *= OUT * fade_;
    if (fadeStep) { fade_ -= fadeStep; if (fade_ <= 0) { fade_ = 0; dead = true; } }
    L[s] += (float)(gl * y); Rt[s] += (float)(gr * y);
  }
  qb = qb_; vb = vb_; X = X_; vx = vx_; fade = fade_;
  M11 = M11n; M12 = M12n; M22 = M22n; Ka = Kan; R = Rn; boxGain = boxGainn;
  age += n / eng.fs;
  // energy: bar mode 1 and box (block), the other modes from two successive samples
  const double k = 1 / eng.fs;
  double eb = 0.5 * (M11 * vb * vb + K11 * qb * qb);
  for (int i = 1; i < N; i++) {
    if (cut[i]) continue;
    const double om = TAU * bar.f[i], c = std::cos(om * k), sn = std::sin(om * k), a = q[i], b = q1[i];
    eb += (0.5 * om * om * std::max(0.0, a * a - 2 * c * a * b + b * b)) / (sn * sn);
  }
  const double et = 0.5 * (M22 * vx * vx + Ka * X * X);
  Eb = eb; Et = et; E = eb + et;
  if (E > Emax) Emax = E;
  if (!(E < 1e6)) {
    dead = true;
    Message m;
    m.type = msg::error; m.key = (int16_t)key;
    eng.post(m);
    return;
  }
  if (!hammerOn && age > YOUNG && (E <= floor * Emax || (damp > 0.99 && E < std::max(1e-7, floor) * Emax))) dead = true;
}

// ---- the engine ------------------------------------------------------------------------------

CelestaEngine::CelestaEngine(double fs)
    : Engine(fs), bars(std::make_unique<std::array<Bar, KEY_MAX - KEY_MIN + 1>>()), hammerMax((int)std::round(HAMMER_MAX * fs)) {
  cel.type = msg::cel; cel.key = 0; cel.count = 16;
}

bool CelestaEngine::stale(int key) const {
  const int i = key - KEY_MIN;
  return built[i] != P[p::thick] || builtRatio[i] != tuning.ratio(key);
}

const Bar &CelestaEngine::barFor(int key) {
  const int i = key - KEY_MIN;
  if (stale(key)) {
    buildBar(key, P[p::thick], (*bars)[i], tuning.ratio(key));
    built[i] = P[p::thick]; builtRatio[i] = tuning.ratio(key);
  }
  return (*bars)[i];
}

void CelestaEngine::setParams(const double *p) {
  const bool first = !hasParams;
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
  tuning = tuningOf(P.data());
  T = {P[p::gap] / 1000, P[p::detune], P[p::boxes] != 0 ? 1.0 : 0.0};
  if (first) S = T;
  // bar losses and the damper apply at once to every sounding bar
  for (int i = 0; i < nVoices; i++) voices[i]->coefs(*this);
}

void CelestaEngine::noteOn(int key, double velocity) {
  if (!hasParams || !(key >= KEY_MIN && key <= KEY_MAX)) return; // A0–C8: there is no bar outside
  const Bar &b = barFor(key);
  Voice *v = byKey[key];
  if (!v || v->dead || v->fading || v->thick != P[p::thick] || v->ratio != tuning.ratio(key)) {
    if (v && !v->dead) v->fading = true; // the bar was re-cut: the old one fades out quickly
    Voice *free = nullptr;
    for (Voice &u : pool) if (!u.inUse) { free = &u; break; }
    if (!free) return; // every voice busy (beyond anything the stealing below lets happen)
    v = free;
    v->start(*this, b, P[p::thick], tuning.ratio(key));
    v->box(*this);
    voices[nVoices++] = v; byKey[key] = v;
  }
  v->strike(*this, velocity);
  focus = v;
  int live = 0;
  for (int i = 0; i < nVoices; i++) if (!voices[i]->fading) live++;
  if (live > pick(MAX_VOICES, 16, 10)) { // Quality: fewer bars ring at once at Medium and Low
    Voice *victim = nullptr;
    double score = INFINITY;
    for (int i = 0; i < nVoices; i++) {
      Voice *u = voices[i];
      if (u == v || u->fading || u->hammerOn || u->age < YOUNG) continue;
      if (u->E < score) { score = u->E; victim = u; }
    }
    if (victim) victim->fading = true;
  }
}

void CelestaEngine::noteOff(int key, double) {
  if (key < 0 || key > 127) return;
  if (Voice *v = byKey[key]) v->released = true;
}

void CelestaEngine::allNotesOff() {
  for (int i = 0; i < nVoices; i++) voices[i]->fading = true;
}

void CelestaEngine::process(float *L, float *R, int n) {
  for (int at = 0; at < n; at += BLOCK_MAX) processBlock(L + at, R + at, std::min(BLOCK_MAX, n - at));
}

void CelestaEngine::processBlock(float *L, float *R, int n) {
  std::fill(L, L + n, 0.0f); std::fill(R, R + n, 0.0f);
  if (!hasParams) return;
  // build one bar ahead per block, the compass first, so most notes find theirs ready
  for (int tries = 0; tries < KEY_MAX - KEY_MIN + 1; tries++) {
    const int key = KEY_LO + (warm++ % (KEY_MAX - KEY_MIN + 1)), k = key > KEY_MAX ? key - (KEY_MAX - KEY_MIN + 1) : key;
    if (stale(k)) { barFor(k); break; }
  }
  // knobs glide
  bool moving = false;
  for (int id = 0; id < gCount; id++) {
    if (S[id] == T[id]) continue;
    S[id] += (1 - std::exp(-n / (GLIDE[id] * fs))) * (T[id] - S[id]);
    if (std::fabs(T[id] - S[id]) < 1e-6 * (std::fabs(T[id]) + 1e-3)) S[id] = T[id];
    moving = true;
  }
  const double dStep = n / (DAMP_RAMP * fs);
  const bool lock = P[p::pedalLock] != 0;
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    // the damper felt: on every bar not held by a key, unless the pedal is down
    const double want = v->released && !sustain && !lock ? 1 : 0;
    if (v->damp != want) v->damp = want > v->damp ? std::min(1.0, v->damp + dStep) : std::max(0.0, v->damp - dStep);
    if (v->damp != v->dampSet) v->coefs(*this);
    if (moving || v->fresh) v->box(*this);
    v->render(L, R, n, *this);
  }
  int j = 0;
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    if (v->dead) {
      if (byKey[v->key] == v) byKey[v->key] = nullptr;
      v->inUse = false; // the voice keeps its fields (dead) until it is reused
    } else voices[j++] = v;
  }
  nVoices = j;
  if (focus && focus->dead) focus = nullptr;
  if (messages && ++blocks >= POST_BLOCKS) { blocks = 0; postFocus(); }
}

// Live data for the page's views: the struck bar's mode amplitudes, the energy in bar and box.
void CelestaEngine::postFocus() {
  Voice *v = focus;
  Message &m = cel;
  float *a = m.values;
  if (!v) { m.key = 0; post(m); return; }
  const double k = 1 / fs;
  m.key = (int16_t)v->key;
  for (int i = 0; i < N_MODES; i++) a[i] = 0;
  a[0] = (float)std::sqrt(v->qb * v->qb + (v->vb * v->vb) / v->K11);
  for (int i = 1; i < v->N; i++) {
    if (v->cut[i]) continue;
    const double om = TAU * v->bar.f[i], c = std::cos(om * k), qa = v->q[i], qb = v->q1[i];
    a[i] = (float)(std::sqrt(std::max(0.0, qa * qa - 2 * c * qa * qb + qb * qb)) / std::sin(om * k));
  }
  a[7] = (float)v->Eb; a[8] = (float)v->Et;
  a[9] = (float)std::sqrt(v->X * v->X + (v->vx * v->vx * v->M22) / v->Ka);
  a[10] = (float)v->lastContactMs; a[11] = (float)v->Fmax;
  a[12] = (float)(-v->M12 / std::sqrt(v->M11 * v->M22)); a[13] = (float)(std::sqrt(v->Ka / v->M22) / TAU);
  a[14] = (float)v->damp; a[15] = (float)(v->hammerOn ? 1 : 0);
  post(m);
}

} // namespace forte::celesta
