// marimba-engine.cpp — the marimba's and the xylophone's engine (marimba-engine.h).

#include "marimba-engine.h"

#include <algorithm>
#include <cmath>
#include <memory>
#include <numbers>

namespace forte::marimba {

using std::numbers::pi;

constexpr double OUT = 0.02;        // output units per m³/s² of volume acceleration
constexpr int MAX_VOICES = 16;      // bars sounding at once; the quietest older one fades out beyond this
constexpr double FADE = 0.03;       // s: a stolen voice fades out over this
constexpr double YOUNG = 0.05;      // s: a voice this young is never stolen
constexpr double MALLET_MAX = 0.03; // s: the longest a mallet may stay in flight
constexpr double GLIDE[] = {0.03, 0.03, 0.05, 0.03}; // s: knobs glide (gap, detune, offset, tubes)
constexpr int POST_BLOCKS = 4;      // live view messages every few blocks
constexpr double NYQUIST = 0.45;    // × fs: modes from here up are left out (they would alias)
constexpr double ROLL_ON = 0.005;   // a roll below this is no roll
constexpr double SECOND = 0.03;     // the second mallet lands this much (× L) nearer the centre

// ---- a voice: one bar and its tube ---------------------------------------------------------

void MarimbaEngine::Voice::start(MarimbaEngine &eng, Data::Ref r, uint64_t ver) {
  *this = Voice{};
  inUse = true;
  ref = r; d = r.data; version = ver;
  key = d->key; N = std::min(d->N, MAX_MODES);
  gl = d->pan[0]; gr = d->pan[1];
  eng.data.acquire(r);
  // Quality: Medium and Low leave out the modes above 16 and 12 kHz, and let the bar go at −70 and
  // −60 dB under its loudest instead of −90
  top = eng.pick(NYQUIST * eng.fs, std::min(NYQUIST * eng.fs, 16000.0), std::min(NYQUIST * eng.fs, 12000.0));
  floor = eng.pick(1e-9, 1e-7, 1e-6);
  coefs(eng);
}

// The implicit midpoint's matrix for a pair, at its masses, stiffnesses and losses: the stiffnesses
// pre-warped so that the rule keeps each oscillator's own frequency.
static void pairMatrix(MarimbaEngine::Pair &p, double h) {
  const double hq = 0.25 * h * h, h2 = 0.5 * h * h;
  const double xb = (hq * p.K11) / p.M11, xt = (hq * p.Ka) / p.M22;
  const double wb = 1 + xb * (1.0 / 3 + xb * (2.0 / 15)), wt = 1 + xt * (1.0 / 3 + xt * (2.0 / 15));
  p.k11 = p.K11 * wb * wb; p.k22 = p.Ka * wt * wt;
  p.a11 = 2 * p.M11 + h * p.c1 * p.M11 + h2 * p.k11; p.a12 = 2 * p.M12; p.a22 = 2 * p.M22 + h * p.R + h2 * p.k22;
  p.id = 1 / (p.a11 * p.a22 - p.a12 * p.a12);
}

// Exact two-pole coefficients for modes 3… and the pairs' bar losses, at the wood's friction.
void MarimbaEngine::Voice::coefs(const MarimbaEngine &eng) {
  const double k = 1 / eng.fs;
  for (int i = 0; i < N; i++) {
    const double f = d->f[i], om = TAU * f, s = d->sigFixed[i] + pi * f * eng.P[p::eta];
    cut[i] = f >= top;
    if (i < PAIRS) {
      Pair &pr = pair[i];
      pr.on = !cut[i];
      pr.K11 = om * om; pr.c1 = 2 * s; pr.out = d->out[i];
      pairMatrix(pr, k);
      continue;
    }
    if (cut[i]) { a1[i] = a2[i] = bc[i] = accOut[i] = 0; continue; } // silent, never struck
    const double r = std::exp(-s * k), od = std::sqrt(std::max(om * om - s * s, 1e-6));
    a1[i] = 2 * r * std::cos(od * k); a2[i] = r * r; bc[i] = (k * r * std::sin(od * k)) / od;
    accOut[i] = om * om * d->out[i];
  }
}

// The resonator's state for the knobs as they stand: its two resonances, each with its bar mode.
void MarimbaEngine::Voice::tube(const MarimbaEngine &eng) {
  const auto &S = eng.S;
  const TubeState ts = tubeState(d->a, d->b, d->f[0], S[gGap], S[gDetune]);
  const double u = S[gTubes];
  tubeGain = u;
  for (int m = 0; m < PAIRS; m++) {
    Pair &pr = pair[m];
    const double Sb = std::fabs(mouthVolume(d->w.data() + m * d->nx, d->nx, d->L, d->b, d->a, S[gOffset]));
    const TubePair c = pairOf(ts, Sb);
    pr.M11 = 1 + u * (c.M11 - 1); pr.M12 = u * c.M12; pr.M22 = ts.ma + u * ts.mg;
    pr.Ka = ts.Ka[m]; pr.R = ts.R[m]; pr.kappa = u * c.kappa; pr.ft = ts.ft[m];
    pairMatrix(pr, 1 / eng.fs);
  }
}

// The mallet lands at x (fraction of the length from the end) and y (fraction of the half-width);
// in a roll, the second mallet a little nearer the centre and on the other side of the centre line.
void MarimbaEngine::Voice::strike(const MarimbaEngine &eng, double velocity) {
  const double *P = eng.P.data();
  const int nx = d->nx;
  const double x = std::min(0.5, P[p::strike] + (hand ? SECOND : 0));
  const double u = std::min(nx - 1 - 1e-9, std::max(0.0, x * (nx - 1))), j = std::floor(u), fr = u - j;
  const int jj = (int)j;
  const double yb = P[p::across] * (d->b / 2) * (hand ? -1 : 1);
  double comp = 0;
  for (int i = 0; i < N; i++) {
    const double w = d->w[i * nx + jj] * (1 - fr) + d->w[i * nx + jj + 1] * fr, wsi = d->tors[i] ? w * yb : w;
    if (i < PAIRS) { pair[i].ws = pair[i].on ? wsi : 0; continue; }
    ws[i] = cut[i] ? 0 : wsi;
    bws[i] = bc[i] * ws[i]; comp += bc[i] * ws[i] * ws[i];
  }
  compModes = comp;
  const Mallet M = malletOf(P[p::hardness], P[p::mass]);
  const double v = P[p::speedMax] * std::max(0.0, std::min(1.0, velocity)), h = 1 / eng.fs;
  if (!(v > 0)) return;
  mal = M; kOverM = (h * h) / M.m; halfAlpha = M.alpha / (2 * h);
  strokes++;
  // launch the head 1.5 steps above the bar's surface where it lands (downward positive)
  double uc = 0;
  for (const Pair &pr : pair) uc += pr.ws * pr.q;
  for (int i = PAIRS; i < N; i++) uc += ws[i] * q[i];
  eta = uc - 1.5 * v * h; etaPrev = eta - v * h;
  dPrev = -1; dPrev2 = -1; malletOn = true; contact = false; inFlight = 0;
  contactSamples = 0; Fmax = 0;
  fading = false; fade = 1; age = 0;
}

// Head force for a compression D at the next step: the discrete gradient of V = Kδ^(p+1)/(p+1)
// between δ two steps back and D (energy-conserving), plus the head's hysteresis K α d(δ^p)/dt.
double MarimbaEngine::Voice::felt(double D) const {
  const double K = mal.K, p = mal.p, Dp = D > 0 ? std::pow(D, p) : 0, dd = D - fd0;
  const double el = std::fabs(dd) > 1e-15 ? ((D > 0 ? (K * Dp * D) / (p + 1) : 0) - fV0) / dd : K * Dp;
  const double f = el + K * halfAlpha * (Dp - fP0);
  return f > 0 ? f : 0;
}
// Solve D + C·F(D) = dFree (C: the bar's and the mallet's compliance over one step).
double MarimbaEngine::Voice::contactForce(double dFree, double C) {
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

void MarimbaEngine::Voice::render(float *L, float *Rt, int n, MarimbaEngine &eng) {
  const double h = 1 / eng.fs, fs = eng.fs;
  const double fadeStep = fading ? 1 / (FADE * fs) : 0;
  Pair &A = pair[0], &B = pair[1];
  const bool bOn = B.on;
  double fade_ = fade;
  for (int s = 0; s < n; s++) {
    // each pair's midpoint velocities without the mallet
    double vmA, vxA, vmB = 0, vxB = 0;
    {
      const double r1 = 2 * (A.M11 * A.v + A.M12 * A.vx) - h * A.k11 * A.q, r2 = 2 * (A.M12 * A.v + A.M22 * A.vx) - h * A.k22 * A.X;
      vmA = (A.a22 * r1 - A.a12 * r2) * A.id; vxA = (A.a11 * r2 - A.a12 * r1) * A.id;
    }
    if (bOn) {
      const double r1 = 2 * (B.M11 * B.v + B.M12 * B.vx) - h * B.k11 * B.q, r2 = 2 * (B.M12 * B.v + B.M22 * B.vx) - h * B.k22 * B.X;
      vmB = (B.a22 * r1 - B.a12 * r2) * B.id; vxB = (B.a11 * r2 - B.a12 * r1) * B.id;
    }
    for (int i = PAIRS; i < N; i++) { const double qn = a1[i] * q[i] - a2[i] * q1[i]; q1[i] = q[i]; q[i] = qn; }
    if (malletOn) {
      double uf = A.ws * (A.q + h * vmA) + B.ws * (B.q + h * vmB);
      for (int i = PAIRS; i < N; i++) uf += ws[i] * q[i];
      const double etaF = 2 * eta - etaPrev;
      const double C = compModes + h * h * (A.a22 * A.id * A.ws * A.ws + B.a22 * B.id * B.ws * B.ws) + kOverM;
      const double Fc = contactForce(etaF - uf, C);
      etaPrev = eta; eta = etaF - kOverM * Fc;
      if (Fc > 0) {
        for (int i = PAIRS; i < N; i++) q[i] += bws[i] * Fc;
        const double fA = A.ws * Fc * h * A.id, fB = B.ws * Fc * h * B.id;
        vmA += A.a22 * fA; vxA -= A.a12 * fA;
        vmB += B.a22 * fB; vxB -= B.a12 * fB;
        contact = true; contactSamples++;
        if (Fc > Fmax) Fmax = Fc;
      }
      if (++inFlight > eng.malletMax || (contact && Fc == 0 && dPrev < -1e-4)) {
        malletOn = false; lastContactMs = (1000.0 * contactSamples) / fs;
      }
    }
    double y = 0;
    {
      const double vbN = 2 * vmA - A.v, vxN = 2 * vxA - A.vx;
      A.q += h * vmA; A.X += h * vxA;
      y += tubeGain * (vxN - A.vx) * fs + A.out * (vbN - A.v) * fs;
      A.v = vbN; A.vx = vxN;
    }
    if (bOn) {
      const double vbN = 2 * vmB - B.v, vxN = 2 * vxB - B.vx;
      B.q += h * vmB; B.X += h * vxB;
      y += tubeGain * (vxN - B.vx) * fs + B.out * (vbN - B.v) * fs;
      B.v = vbN; B.vx = vxN;
    }
    for (int i = PAIRS; i < N; i++) y -= accOut[i] * q[i];
    y *= OUT * fade_;
    if (fadeStep) { fade_ -= fadeStep; if (fade_ <= 0) { fade_ = 0; dead = true; } }
    L[s] += (float)(gl * y); Rt[s] += (float)(gr * y);
  }
  fade = fade_;
  age += n / fs;
  // energy: the pairs (bar and tube), the other modes from two successive samples
  const double k = 1 / fs;
  double eb = 0, et = 0;
  for (const Pair &pr : pair) {
    eb += 0.5 * (pr.M11 * pr.v * pr.v + pr.K11 * pr.q * pr.q);
    et += 0.5 * (pr.M22 * pr.vx * pr.vx + pr.Ka * pr.X * pr.X);
  }
  for (int i = PAIRS; i < N; i++) {
    if (cut[i]) continue;
    const double om = TAU * d->f[i], c = std::cos(om * k), sn = std::sin(om * k), a = q[i], b = q1[i];
    eb += (0.5 * om * om * std::max(0.0, a * a - 2 * c * a * b + b * b)) / (sn * sn);
  }
  Eb = eb; Et = et; E = eb + et;
  if (E > Emax) Emax = E;
  if (!(E < 1e6)) {
    dead = true;
    Message m;
    m.type = msg::error; m.key = (int16_t)key;
    eng.post(m);
    return;
  }
  const bool rolling = held && eng.rollOf(*this) > ROLL_ON;
  if (!malletOn && !rolling && age > YOUNG && E <= floor * Emax) dead = true;
}

// ---- the engine ------------------------------------------------------------------------------

MarimbaEngine::MarimbaEngine(double fs)
    : Engine(fs), data([this](int key, uint64_t version) -> std::unique_ptr<VoiceData> {
        if (key < KEY_MIN || key > KEY_MAX) return nullptr;
        const Snapshot &s = snapshots[version % snapshots.size()];
        const int kind = s.kind.load(std::memory_order_relaxed);
        const double depth = s.depth.load(std::memory_order_relaxed), ratio = s.ratio[key % 12].load(std::memory_order_relaxed);
#if !FORTE_THREADS
        if (offered && offered->key == key && offered->kind == kind && offered->depth == depth && offered->ratio == ratio) return std::move(offered);
#endif
        return std::make_unique<VoiceData>(voiceData(kind, key, depth, ratio));
      }),
      malletMax((int)std::round(MALLET_MAX * fs)) {
  barMsg.type = msg::bar; barMsg.key = 0; barMsg.count = 18;
}

bool MarimbaEngine::offer(const double *packed, int n) {
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

void MarimbaEngine::setParams(const double *p) {
  const bool first = !hasParams;
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
  T = {P[p::gap] / 1000, P[p::detune], P[p::offset], P[p::tubes] != 0 ? 1.0 : 0.0};
  if (first) S = T;
  // the bars are built for the instrument, the depth the knob is at and the tuning, nearest the
  // last key played first
  const forte::Tuning tuning = tuningOf(P.data());
  const int kind = (int)P[p::kind];
  if (first || kind != physKind || P[p::depth] != physDepth || !(tuning == physTuning)) {
    physKind = kind; physDepth = P[p::depth]; physTuning = tuning; version++;
    Snapshot &s = snapshots[version % snapshots.size()];
    s.kind.store(physKind, std::memory_order_relaxed);
    s.depth.store(physDepth + 0.0, std::memory_order_relaxed); // (−0 is 0)
    for (int i = 0; i < 12; i++) s.ratio[i].store(tuning.r[i], std::memory_order_relaxed);
    data.prepare(version, KEY_MIN, KEY_MAX, focus ? focus->key : 60);
  }
  // the wood's losses apply at once to every sounding bar
  for (int i = 0; i < nVoices; i++) voices[i]->coefs(*this);
}

void MarimbaEngine::noteOn(int key, double velocity) {
  if (!hasParams || !(key >= KEY_MIN && key <= KEY_MAX)) return;
  const Data::Ref r = data.get(key, version);
  if (r) { strikeKey(key, velocity, r); return; }
  // the bar is being built (a few ms): the note waits for it
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) { pending[i] = {key, velocity, false}; return; }
  if (nPending < (int)pending.size()) pending[nPending++] = {key, velocity, false};
}

void MarimbaEngine::retryPending() {
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

void MarimbaEngine::strikeKey(int key, double velocity, Data::Ref r) {
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
  v->held = true; v->vel = velocity; v->hand = false; v->strokes = 0;
  v->rollIn = fs / P[p::rollRate];
  v->strike(*this, velocity);
  focus = v;
  int live = 0;
  for (int i = 0; i < nVoices; i++) if (!voices[i]->fading) live++;
  if (live > pick(MAX_VOICES, 12, 8)) { // Quality: fewer bars ring at once at Medium and Low
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

// A marimba has no dampers: letting go of a key only ends its roll.
void MarimbaEngine::noteOff(int key, double) {
  if (key < 0 || key > 127) return;
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) pending[i].off = true;
  if (Voice *v = byKey[key]) v->held = false;
}

void MarimbaEngine::allNotesOff() {
  nPending = 0;
  for (int i = 0; i < nVoices; i++) { voices[i]->fading = true; voices[i]->held = false; }
}

// The roll: the wheel's, or the key's own slide. Pressure does nothing: a Seaboard sends it from any
// finger at rest, which would roll every note.
double MarimbaEngine::rollOf(const Voice &v) const { return expr.slideOr(v.key, P[p::roll]); }

// Held keys roll: the mallets strike in turn, at the roll's share of the first stroke, the strokes
// a little uneven (±3 % in time), as a player's are.
void MarimbaEngine::rolls(int n) {
  for (int i = 0; i < nVoices; i++) {
    Voice &v = *voices[i];
    if (!v.held || v.fading) continue;
    const double amt = rollOf(v);
    if (amt <= ROLL_ON) { v.rollIn = fs / P[p::rollRate]; continue; }
    if ((v.rollIn -= n) > 0) continue;
    rng = rng * 1664525u + 1013904223u;
    v.hand = !v.hand;
    v.strike(*this, v.vel * amt);
    v.rollIn += (fs / P[p::rollRate]) * (1 + 0.06 * ((rng >> 8) / 16777216.0 - 0.5));
  }
}

void MarimbaEngine::process(float *L, float *R, int n) {
  std::fill(L, L + n, 0.0f); std::fill(R, R + n, 0.0f);
  if (!hasParams) { data.audioCycle(); return; }
  if (nPending) retryPending();
  // knobs glide
  bool moving = false;
  for (int id = 0; id < gCount; id++) {
    if (S[id] == T[id]) continue;
    S[id] += (1 - std::exp(-n / (GLIDE[id] * fs))) * (T[id] - S[id]);
    if (std::fabs(T[id] - S[id]) < 1e-6 * (std::fabs(T[id]) + 1e-3)) S[id] = T[id];
    moving = true;
  }
  rolls(n);
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    if (moving) v->tube(*this);
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
  data.audioCycle();
}

// Live data for the page's views: the struck bar's mode amplitudes, the energy in bar and tube,
// and the tube's two resonances.
void MarimbaEngine::postFocus() {
  Voice *v = focus;
  Message &m = barMsg;
  float *a = m.values;
  if (!v) { m.key = 0; post(m); return; }
  const double k = 1 / fs;
  const int N = std::min(v->N, 8);
  m.key = (int16_t)v->key;
  for (int i = 0; i < 8; i++) a[i] = 0;
  for (int i = 0; i < N; i++) {
    if (i < PAIRS) { const Pair &pr = v->pair[i]; a[i] = (float)std::sqrt(pr.q * pr.q + (pr.v * pr.v) / pr.K11); continue; }
    if (v->cut[i]) continue;
    const double om = TAU * v->d->f[i], c = std::cos(om * k), qa = v->q[i], qb = v->q1[i];
    a[i] = (float)(std::sqrt(std::max(0.0, qa * qa - 2 * c * qa * qb + qb * qb)) / std::sin(om * k));
  }
  a[8] = (float)v->Eb; a[9] = (float)v->Et;
  for (int p = 0; p < PAIRS; p++) {
    const Pair &pr = v->pair[p];
    a[10 + p] = (float)std::sqrt(pr.X * pr.X + (pr.vx * pr.vx * pr.M22) / pr.Ka);
    a[12 + p] = (float)pr.kappa; a[14 + p] = (float)pr.ft;
  }
  a[16] = (float)v->lastContactMs; a[17] = (float)v->Fmax;
  post(m);
}

} // namespace forte::marimba
