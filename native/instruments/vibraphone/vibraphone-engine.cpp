// vibraphone-engine.cpp — the vibraphone's engine (vibraphone-engine.h).

#include "vibraphone-engine.h"

#include <algorithm>
#include <cmath>
#include <memory>
#include <numbers>

namespace forte::vibraphone {

using std::numbers::pi;

constexpr double OUT = 0.034;       // output units per m³/s² of volume acceleration
constexpr int MAX_VOICES = 16;      // bars sounding at once; the quietest older one fades out beyond this
constexpr double FADE = 0.03;       // s: a stolen voice fades out over this
constexpr double YOUNG = 0.05;      // s: a voice this young is never stolen
constexpr double MALLET_MAX = 0.03; // s: the longest a mallet may stay in flight
constexpr double GLIDE[] = {0.03, 0.03, 0.03, 0.03, 0.05, 0.3, 0.3}; // s: knobs glide (gap … shaft2; the discs are turned on their shafts slowly)
constexpr double MOTOR_TAU = 0.35;  // s: the shaft spins up and down with this time constant
constexpr double PARK_HZ = 1.2;     // the shaft parks with a critically damped servo of this natural frequency
constexpr double DAMP_RAMP = 0.008; // s: the damper felt lands (and lifts) over this
constexpr int POST_BLOCKS = 4;      // live view messages every few blocks
constexpr double NYQUIST = 0.45;    // × fs: modes from here up are left out (they would alias)

// ---- a voice: one bar and its tube ---------------------------------------------------------

void VibraphoneEngine::Voice::start(VibraphoneEngine &eng, Data::Ref r, uint64_t ver) {
  *this = Voice{};
  inUse = true;
  ref = r; d = r.data; version = ver;
  key = d->key; N = std::min(d->N, MAX_MODES);
  out0 = d->out[0];
  gl = d->pan[0]; gr = d->pan[1];
  eng.data.acquire(r);
  coefs(eng);
}

// Exact two-pole coefficients for modes 2… at the current damping (bar losses + damper).
void VibraphoneEngine::Voice::coefs(const VibraphoneEngine &eng) {
  const double k = 1 / eng.fs, ts = barTempScale(eng.P[p::temp]), sd = (6.91 / eng.P[p::damp]) * damp;
  for (int i = 0; i < N; i++) {
    const double f = d->f[i] * ts, om = TAU * f, s = d->sigFixed[i] + pi * f * eng.P[p::eta] + sd * d->dampW[i];
    sig[i] = s;
    if (i == 0) { K11 = om * om; sig1 = s; continue; }
    cut[i] = f >= NYQUIST * eng.fs;
    if (cut[i]) { a1[i] = a2[i] = bc[i] = accOut[i] = 0; continue; } // above what the sample rate holds: silent, never struck
    const double r = std::exp(-s * k), od = std::sqrt(std::max(om * om - s * s, 1e-6));
    a1[i] = 2 * r * std::cos(od * k); a2[i] = r * r; bc[i] = (k * r * std::sin(od * k)) / od;
    accOut[i] = om * om * d->out[i];
  }
  dampSet = damp;
}

// The resonator's state for the knobs as they stand (at the block's end).
void VibraphoneEngine::Voice::tube(const VibraphoneEngine &eng) {
  const auto &S = eng.S;
  const TubeState ts = tubeState(d->tube, d->f[0], S[gGap], S[gDetune], S[gTemp], S[gCd]);
  const double u = S[gTubes];
  M11n = 1 + u * (ts.M11 - 1); M12n = u * ts.M12; M22n = ts.ma + u * ts.mg; Kan = ts.Ka; Rn = ts.R;
  lvSn = ts.lvS; cdiscn = ts.cd; tubeGainn = u; Rdn = ts.Rdisc;
  if (fresh) {
    M11 = M11n; M12 = M12n; M22 = M22n; Ka = Kan; R = Rn;
    lvS = lvSn; cdisc = cdiscn; tubeGain = tubeGainn; Rd = Rdn; fresh = false;
  }
  const double ph = ((d->accidental ? S[gShaft2] : 0) + S[gTwist] * d->shaftIndex) * (pi / 180);
  cph = std::cos(ph); sph = std::sin(ph);
}

// The mallet lands at x (fraction of the length from the end) and y (fraction of the half-width).
void VibraphoneEngine::Voice::strike(const VibraphoneEngine &eng, double velocity) {
  const double *P = eng.P.data();
  const int nx = d->nx;
  const double u = std::min(nx - 1 - 1e-9, std::max(0.0, P[p::strike] * (nx - 1))), j = std::floor(u), fr = u - j;
  const int jj = (int)j;
  const double yb = P[p::across] * (d->b / 2);
  coefs(eng);
  double comp = 0;
  for (int i = 0; i < N; i++) {
    const double w = d->w[i * nx + jj] * (1 - fr) + d->w[i * nx + jj + 1] * fr, wsi = d->tors[i] ? w * yb : w;
    ws[i] = wsi;
    if (i > 0) { bws[i] = bc[i] * wsi; comp += bc[i] * wsi * wsi; }
  }
  ws0 = ws[0]; compModes = comp;
  const Mallet M = malletOf(P[p::hardness], P[p::mass]);
  const double v = P[p::speedMax] * std::max(0.0, std::min(1.0, velocity)), h = 1 / eng.fs;
  if (!(v > 0)) return;
  mal = M; kOverM = (h * h) / M.m; halfAlpha = M.alpha / (2 * h);
  // launch the head 1.5 steps above the bar's surface where it lands (downward positive)
  double uc = ws0 * qb;
  for (int i = 1; i < N; i++) uc += ws[i] * q[i];
  eta = uc - 1.5 * v * h; etaPrev = eta - v * h;
  dPrev = -1; dPrev2 = -1; malletOn = true; contact = false; inFlight = 0;
  contactSamples = 0; Fmax = 0;
  released = false; fading = false; fade = 1; age = 0;
}

// Head force for a compression D at the next step: the discrete gradient of V = Kδ^(p+1)/(p+1)
// between δ two steps back and D (energy-conserving), plus the yarn's hysteresis K α d(δ^p)/dt.
double VibraphoneEngine::Voice::felt(double D) const {
  const double K = mal.K, p = mal.p, Dp = D > 0 ? std::pow(D, p) : 0, dd = D - fd0;
  const double el = std::fabs(dd) > 1e-15 ? ((D > 0 ? (K * Dp * D) / (p + 1) : 0) - fV0) / dd : K * Dp;
  const double f = el + K * halfAlpha * (Dp - fP0);
  return f > 0 ? f : 0;
}
// Solve D + C·F(D) = dFree (C: the bar's and the mallet's compliance over one step).
double VibraphoneEngine::Voice::contactForce(double dFree, double C) {
  const double d0 = dPrev2, K = mal.K, p = mal.p;
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

void VibraphoneEngine::Voice::render(float *L, float *Rt, int n, VibraphoneEngine &eng) {
  const double h = 1 / eng.fs, h2 = 0.5 * h * h, hq = 0.25 * h * h, inv = 1.0 / n;
  const double *sinT = eng.sinT.data(), *cosT = eng.cosT.data();
  const double M11a = M11, dM11 = M11n - M11a, M12a = M12, dM12 = M12n - M12a, M22a = M22, dM22 = M22n - M22a;
  const double Kaa = Ka, dKa = Kan - Kaa, Ra = R, dR = Rn - Ra, lvSa = lvS, dlvS = lvSn - lvSa, Rda = Rd, dRd = Rdn - Rda;
  const double cda = cdisc, dcd = cdiscn - cda, tga = tubeGain, dtg = tubeGainn - tga;
  const double c1 = 2 * sig1;
  const double fadeStep = fading ? 1 / (FADE * eng.fs) : 0;
  double qb_ = qb, vb_ = vb, X_ = X, vx_ = vx, fade_ = fade;
  for (int s = 0; s < n; s++) {
    const double t = (s + 1) * inv;
    // the disc in this bar's mouth: open area, and the end correction and boundary-layer loss of the
    // flow squeezing past it
    double sn = sinT[s] * cph + cosT[s] * sph;
    if (sn < 0) sn = -sn;
    const double open = 1 - (cda + dcd * t) * sn, mc = (lvSa + dlvS * t) * (1 / open - 1);
    const double m11 = M11a + dM11 * t, m12 = M12a + dM12 * t, m22 = M22a + dM22 * t + mc, ka = Kaa + dKa * t, r22 = Ra + dR * t + (Rda + dRd * t) * (1 / (open * open) - 1);
    // pre-warped stiffnesses, so the implicit midpoint rule keeps each oscillator's own frequency
    const double xb = (hq * K11) / m11, xt = (hq * ka) / m22;
    const double wb = 1 + xb * (1.0 / 3 + xb * (2.0 / 15)), wt = 1 + xt * (1.0 / 3 + xt * (2.0 / 15));
    const double k11 = K11 * wb * wb, k22 = ka * wt * wt;
    const double a11 = 2 * m11 + h * c1 * m11 + h2 * k11, a12 = 2 * m12, a22 = 2 * m22 + h * r22 + h2 * k22;
    const double id = 1 / (a11 * a22 - a12 * a12);
    const double r1 = 2 * (m11 * vb_ + m12 * vx_) - h * k11 * qb_, r2 = 2 * (m12 * vb_ + m22 * vx_) - h * k22 * X_;
    double vmb = (a22 * r1 - a12 * r2) * id, vmx = (a11 * r2 - a12 * r1) * id;
    for (int i = 1; i < N; i++) { const double qn = a1[i] * q[i] - a2[i] * q1[i]; q1[i] = q[i]; q[i] = qn; }
    if (malletOn) {
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
      if (++inFlight > eng.malletMax || (contact && Fc == 0 && dPrev < -1e-4)) {
        malletOn = false; lastContactMs = (1000.0 * contactSamples) / eng.fs;
      }
    }
    const double vbN = 2 * vmb - vb_, vxN = 2 * vmx - vx_;
    qb_ += h * vmb; X_ += h * vmx;
    double y = (tga + dtg * t) * (vxN - vx_) * eng.fs + out0 * (vbN - vb_) * eng.fs;
    vb_ = vbN; vx_ = vxN;
    for (int i = 1; i < N; i++) y -= accOut[i] * q[i];
    y *= OUT * fade_;
    if (fadeStep) { fade_ -= fadeStep; if (fade_ <= 0) { fade_ = 0; dead = true; } }
    L[s] += gl * y; Rt[s] += gr * y;
  }
  qb = qb_; vb = vb_; X = X_; vx = vx_; fade = fade_;
  M11 = M11n; M12 = M12n; M22 = M22n; Ka = Kan; R = Rn;
  lvS = lvSn; cdisc = cdiscn; tubeGain = tubeGainn; Rd = Rdn;
  age += n / eng.fs;
  // energy: bar mode 1 and tube (block), the other modes from two successive samples
  const double k = 1 / eng.fs;
  double eb = 0.5 * (M11 * vb * vb + K11 * qb * qb);
  for (int i = 1; i < N; i++) {
    if (cut[i]) continue;
    const double om = TAU * d->f[i], c = std::cos(om * k), sn = std::sin(om * k), a = q[i], b = q1[i];
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
  if (!malletOn && age > YOUNG && (E <= 1e-9 * Emax || (damp > 0.99 && E < 1e-7 * Emax))) dead = true;
}

// ---- the engine ------------------------------------------------------------------------------

VibraphoneEngine::VibraphoneEngine(double fs)
    : Engine(fs), data([this](int key, uint64_t version) -> std::unique_ptr<VoiceData> {
        if (key < KEY_MIN || key > KEY_MAX) return nullptr;
        const Snapshot &s = snapshots[version % snapshots.size()];
        const double depth = s.depth.load(std::memory_order_relaxed), ratio = s.ratio[key % 12].load(std::memory_order_relaxed);
#if !FORTE_THREADS
        if (offered && offered->key == key && offered->depth == depth && offered->ratio == ratio) return std::move(offered);
#endif
        return std::make_unique<VoiceData>(voiceData(key, depth, ratio));
      }),
      malletMax((int)std::round(MALLET_MAX * fs)) {
  vibe.type = msg::vibe; vibe.key = 0; vibe.count = 19;
  vibe.values[11] = 1; // open
}

bool VibraphoneEngine::offer(const double *packed, int n) {
#if FORTE_THREADS
  (void)packed; (void)n;
  return false;
#else
  auto d = std::make_unique<VoiceData>();
  if (!unpackVoiceData(packed, n, *d) || d->key < KEY_MIN || d->key > KEY_MAX) return false;
  offered = std::move(d);
  return true;
#endif
}

void VibraphoneEngine::setParams(const double *p) {
  const bool first = !hasParams;
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
  T = {P[p::gap] / 1000, P[p::detune], P[p::temp], P[p::cd], P[p::tubes] != 0 ? 1.0 : 0.0, P[p::twist], P[p::shaft2]};
  if (first) S = T;
  // the bars are built for the depth the knob is at and the tuning, nearest the last key played first
  const forte::Tuning tuning = tuningOf(P.data());
  if (first || P[p::depth] != physDepth || !(tuning == physTuning)) {
    physDepth = P[p::depth]; physTuning = tuning; version++;
    Snapshot &s = snapshots[version % snapshots.size()];
    s.depth.store(physDepth + 0.0, std::memory_order_relaxed); // (−0 is 0)
    for (int i = 0; i < 12; i++) s.ratio[i].store(tuning.r[i], std::memory_order_relaxed);
    data.prepare(version, KEY_MIN, KEY_MAX, focus ? focus->key : 60);
  }
  // bar losses and the damper apply at once to every sounding bar
  for (int i = 0; i < nVoices; i++) voices[i]->coefs(*this);
}

void VibraphoneEngine::noteOn(int key, double velocity) {
  if (!hasParams || !(key >= KEY_MIN && key <= KEY_MAX)) return; // A0–C8: there is no bar outside
  const Data::Ref r = data.get(key, version);
  if (r) { strikeKey(key, velocity, r); return; }
  // the bar is being built (a few ms): the note waits for it
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) { pending[i] = {key, velocity, false}; return; }
  if (nPending < (int)pending.size()) pending[nPending++] = {key, velocity, false};
}

void VibraphoneEngine::retryPending() {
  int j = 0;
  for (int i = 0; i < nPending; i++) {
    const Pending pd = pending[i];
    const Data::Ref r = data.get(pd.key, version);
    if (!r) { pending[j++] = pd; continue; }
    strikeKey(pd.key, pd.velocity, r);
    if (pd.off) noteOff(pd.key, -1);
  }
  nPending = j;
}

void VibraphoneEngine::strikeKey(int key, double velocity, Data::Ref r) {
  Voice *v = byKey[key];
  if (!v || v->dead || v->fading || v->version != version) {
    if (v && !v->dead) v->fading = true; // the bar was re-cut: the old one fades out quickly
    Voice *free = nullptr;
    for (Voice &u : pool) if (!u.inUse) { free = &u; break; }
    if (!free) return; // every voice busy (beyond anything the stealing below lets happen)
    v = free;
    v->start(*this, r, version);
    v->tube(*this);
    voices[nVoices++] = v; byKey[key] = v;
  }
  v->strike(*this, velocity);
  focus = v;
  int live = 0;
  for (int i = 0; i < nVoices; i++) if (!voices[i]->fading) live++;
  if (live > MAX_VOICES) {
    Voice *victim = nullptr;
    double score = INFINITY;
    for (int i = 0; i < nVoices; i++) {
      Voice *u = voices[i];
      if (u == v || u->fading || u->malletOn || u->age < YOUNG) continue;
      if (u->E < score) { score = u->E; victim = u; }
    }
    if (victim) victim->fading = true;
  }
}

void VibraphoneEngine::noteOff(int key, double) {
  if (key < 0 || key > 127) return;
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) pending[i].off = true;
  if (Voice *v = byKey[key]) v->released = true;
}

void VibraphoneEngine::allNotesOff() {
  nPending = 0;
  for (int i = 0; i < nVoices; i++) voices[i]->fading = true;
}

// The shaft: spun by the motor through a belt, with some inertia; stopped, it parks so that the
// naturals' discs stand open (θ = 0) or closed (θ = 90°).
void VibraphoneEngine::shaft(int n) {
  const double dt = n / fs, th0 = theta;
  const int motor = (int)P[p::motor];
  if (motor == motor_::run) {
    parkMode = -1;
    omega += (TAU * P[p::speed] - omega) * (1 - std::exp(-dt / MOTOR_TAU));
    theta += omega * dt;
  } else {
    if (parkMode != motor) {
      parkMode = motor;
      const double off = motor == motor_::closed ? pi / 2 : 0, ahead = theta + omega / (TAU * PARK_HZ);
      parkTarget = off + pi * std::ceil((ahead - off) / pi - 0.5);
    }
    const double wn = TAU * PARK_HZ;
    const int sub = std::max(1, (int)std::ceil(dt * wn * 8));
    const double ds = dt / sub;
    for (int i = 0; i < sub; i++) { // semi-implicit, critically damped
      omega += (wn * wn * (parkTarget - theta) - 2 * wn * omega) * ds;
      theta += omega * ds;
    }
  }
  const double d = theta - th0;
  for (int s = 0; s < n; s++) { const double a = th0 + (d * (s + 1)) / n; sinT[s] = std::sin(a); cosT[s] = std::cos(a); }
  if (theta > 1e4) { const double w = TAU * std::floor(theta / TAU); theta -= w; parkTarget -= w; }
}

void VibraphoneEngine::process(float *L, float *R, int n) {
  for (int at = 0; at < n; at += BLOCK_MAX) processBlock(L + at, R + at, std::min(BLOCK_MAX, n - at));
  data.audioCycle();
}

void VibraphoneEngine::processBlock(float *L, float *R, int n) {
  std::fill(L, L + n, 0.0f); std::fill(R, R + n, 0.0f);
  if (!hasParams) return;
  if (nPending) retryPending();
  // knobs glide
  bool moving = false;
  for (int id = 0; id < gCount; id++) {
    if (S[id] == T[id]) continue;
    S[id] += (1 - std::exp(-n / (GLIDE[id] * fs))) * (T[id] - S[id]);
    if (std::fabs(T[id] - S[id]) < 1e-6 * (std::fabs(T[id]) + 1e-3)) S[id] = T[id];
    moving = true;
  }
  shaft(n);
  const double dStep = n / (DAMP_RAMP * fs);
  const bool lock = P[p::pedalLock] != 0;
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    // the damper felt: on every bar not held by a key, unless the pedal is down
    const double want = v->released && !sustain && !lock ? 1 : 0;
    if (v->damp != want) v->damp = want > v->damp ? std::min(1.0, v->damp + dStep) : std::max(0.0, v->damp - dStep);
    if (v->damp != v->dampSet) v->coefs(*this);
    if (moving || v->fresh) v->tube(*this);
    v->render(L, R, n, *this);
  }
  int j = 0;
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    if (v->dead) {
      if (byKey[v->key] == v) byKey[v->key] = nullptr;
      data.release(v->ref);
      v->ref = {}; v->inUse = false; // the voice keeps its fields (dead) until it is reused
    } else voices[j++] = v;
  }
  nVoices = j;
  if (focus && focus->dead) focus = nullptr;
  if (messages && ++blocks >= POST_BLOCKS) { blocks = 0; postFocus(); }
}

// Live data for the page's views: the struck bar's mode amplitudes, the energy in bar and tube,
// and its disc.
void VibraphoneEngine::postFocus() {
  Voice *v = focus;
  Message &m = vibe;
  float *a = m.values;
  a[16] = (float)theta; a[17] = (float)(omega / TAU);
  if (!v) { m.key = 0; post(m); return; }
  const double k = 1 / fs;
  const int N = std::min(v->N, 8);
  m.key = (int16_t)v->key; a[8] = (float)v->Eb; a[9] = (float)v->Et;
  a[0] = (float)std::sqrt(v->qb * v->qb + (v->vb * v->vb) / v->K11);
  for (int i = 1; i < N; i++) {
    if (v->cut[i]) { a[i] = 0; continue; }
    const double om = TAU * v->d->f[i], c = std::cos(om * k), qa = v->q[i], qb = v->q1[i];
    a[i] = (float)(std::sqrt(std::max(0.0, qa * qa - 2 * c * qa * qb + qb * qb)) / std::sin(om * k));
  }
  const double th = std::atan2(sinT[0] * v->cph + cosT[0] * v->sph, cosT[0] * v->cph - sinT[0] * v->sph);
  const double open = 1 - v->cdisc * std::fabs(std::sin(th)), m22 = v->M22 + v->lvS * (1 / open - 1);
  a[10] = (float)th; a[11] = (float)open; a[12] = (float)(-v->M12 / std::sqrt(v->M11 * m22)); a[13] = (float)(std::sqrt(v->Ka / m22) / TAU);
  a[14] = (float)v->lastContactMs; a[15] = (float)v->Fmax; a[18] = (float)std::sqrt(v->X * v->X + (v->vx * v->vx * m22) / v->Ka);
  post(m);
}

} // namespace forte::vibraphone
