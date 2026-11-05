// tubular-engine.cpp — the tubular bells' engine (tubular-engine.h).

#include "tubular-engine.h"

#include <algorithm>
#include <cmath>
#include <memory>
#include <numbers>

namespace forte::tubular {

using std::numbers::pi;

constexpr double OUT = 0.6;         // output units per pascal at the microphones (3 m away; the level is kept at other distances)
constexpr double DIST_REF = 3;      // m
constexpr int MAX_VOICES = 24;      // tubes sounding at once; the quietest older one fades out beyond this
constexpr double FADE = 0.03;       // s: a stolen voice fades out over this
constexpr double YOUNG = 0.05;      // s: a voice this young is never stolen
constexpr double MALLET_MAX = 0.03; // s: the longest a mallet may stay in flight
constexpr double DAMP_RAMP = 0.008; // s: the damper felt lands (and lifts) over this
constexpr int POST_BLOCKS = 4;      // live view messages every few blocks
constexpr double NYQUIST = 0.45;    // × fs: modes from here up are left out (they would alias)

// ---- a voice: one tube ------------------------------------------------------------------------

void TubularEngine::Voice::start(TubularEngine &eng, Data::Ref r, uint64_t ver) {
  *this = Voice{};
  inUse = true;
  ref = r; d = r.data; version = ver;
  key = d->key; N = d->count;
  eng.data.acquire(r);
  // Quality: Medium and Low leave out the modes above 10 and 6 kHz, and let the tube go at −70 and
  // −60 dB under its loudest instead of −90
  top = eng.pick(NYQUIST * eng.fs, std::min(NYQUIST * eng.fs, 10000.0), std::min(NYQUIST * eng.fs, 6000.0));
  floor = eng.pick(1e-9, 1e-7, 1e-6);
  // the paths from the tube's middle to the microphones: the farther one's channel is delayed by
  // the difference, in whole samples, and that much of each mode's phase is taken back
  double path[2];
  for (int side = 0; side < 2; side++) {
    const double dx = d->place.x - (side ? 1 : -1) * MIC_HALF, dy = d->distance + d->place.y, dz = MIC_DROP - d->L / 2;
    path[side] = std::sqrt(dx * dx + dy * dy + dz * dz);
  }
  late = path[1] > path[0] ? 1 : 0;
  lag = std::min(RING - 1, (int)std::floor((std::fabs(path[1] - path[0]) / C_AIR) * eng.fs));
  // each mode's pressure at the microphones, from its state now and a sample ago
  const double k = 1 / eng.fs, scale = OUT * (d->distance / DIST_REF);
  for (int i = 0; i < N; i++) {
    const double om = TAU * d->m[i].f, c = std::cos(om * k), s = std::sin(om * k);
    for (int side = 0; side < 2; side++) {
      const double back = side == late ? om * lag * k : 0;
      const std::complex<double> H = -om * om * scale * d->m[i].gain[side] * std::complex<double>(std::cos(back), std::sin(back));
      const double c1 = s > 1e-9 ? -H.imag() / s : 0, c0 = H.real() - c1 * c;
      (side ? r0 : l0)[i] = c0; (side ? r1 : l1)[i] = c1;
    }
  }
  coefs(eng);
}

// Exact two-pole coefficients for every mode at the current damping (the metal, radiation, the damper).
void TubularEngine::Voice::coefs(const TubularEngine &eng) {
  const double k = 1 / eng.fs, sd = (6.91 / eng.P[p::damp]) * damp;
  for (int i = 0; i < N; i++) {
    const Mode &m = d->m[i];
    const double f = m.f, om = TAU * f, s = m.sigRad + pi * f * eng.P[p::eta] + sd * m.dampW;
    sig[i] = s;
    cut[i] = f >= top;
    if (cut[i]) { a1[i] = a2[i] = bc[i] = 0; continue; } // above what the sample rate holds (or Quality's top): silent, never struck
    const double r = std::exp(-s * k), od = std::sqrt(std::max(om * om - s * s, 1e-6));
    a1[i] = 2 * r * std::cos(od * k); a2[i] = r * r; bc[i] = (k * r * std::sin(od * k)) / od;
  }
  dampSet = damp;
}

// The mallet lands a fraction `strike` of the length down from the top (0: on the cap).
void TubularEngine::Voice::strike(const TubularEngine &eng, double velocity) {
  const double *P = eng.P.data();
  const double x = d->L * (1 - std::min(1.0, std::max(0.0, P[p::strike])));
  coefs(eng);
  double comp = 0;
  for (int i = 0; i < N; i++) {
    ws[i] = cut[i] ? 0 : modeW(d->m[i], d->L, x);
    bws[i] = bc[i] * ws[i]; comp += bc[i] * ws[i] * ws[i];
  }
  compModes = comp;
  const Mallet M = malletOf(eng.expr.slideOr(key, P[p::hardness]), P[p::mass]); // the key's own face, or the knob's
  const double v = P[p::speedMax] * std::max(0.0, std::min(1.0, velocity)), h = 1 / eng.fs;
  if (!(v > 0)) return;
  mal = M; kOverM = (h * h) / M.m; halfAlpha = M.alpha / (2 * h);
  // launch the mallet 1.5 steps from the tube's surface where it lands (towards the tube positive)
  double uc = 0;
  for (int i = 0; i < N; i++) uc += ws[i] * q[i];
  eta = uc - 1.5 * v * h; etaPrev = eta - v * h;
  dPrev = -1; dPrev2 = -1; malletOn = true; contact = false; inFlight = 0;
  contactSamples = 0; Fmax = 0;
  released = false; fading = false; fade = 1; age = 0;
}

// The face's force for a compression D at the next step: the discrete gradient of
// V = Kδ^(p+1)/(p+1) between δ two steps back and D (energy-conserving), plus its hysteresis K α d(δ^p)/dt.
double TubularEngine::Voice::face(double D) const {
  const double K = mal.K, p = mal.p, Dp = D > 0 ? std::pow(D, p) : 0, dd = D - fd0;
  const double el = std::fabs(dd) > 1e-15 ? ((D > 0 ? (K * Dp * D) / (p + 1) : 0) - fV0) / dd : K * Dp;
  const double f = el + K * halfAlpha * (Dp - fP0);
  return f > 0 ? f : 0;
}
// Solve D + C·F(D) = dFree (C: the tube's and the mallet's compliance over one step).
double TubularEngine::Voice::contactForce(double dFree, double C) {
  const double d0 = dPrev2, K = mal.K, p = mal.p;
  fd0 = d0; fV0 = d0 > 0 ? (K * std::pow(d0, p + 1)) / (p + 1) : 0; fP0 = d0 > 0 ? std::pow(d0, p) : 0;
  dPrev2 = dPrev;
  if (dFree <= 0 && d0 <= 0) { dPrev = dFree; return 0; }
  double hi = dFree, lo = dFree - C * face(dFree) - 1e-15, D = 0.5 * (lo + hi);
  for (int it = 0; it < 60; it++) {
    const double F = face(D), g = D + C * F - dFree;
    if (g > 0) hi = D; else lo = D;
    if (hi - lo <= 1e-13 * (std::fabs(dFree) + 1e-9)) break;
    const double e = 1e-9 * (std::fabs(D) + 1e-9), dg = 1 + (C * (face(D + e) - F)) / e;
    double Dn = D - g / dg;
    if (!(Dn > lo && Dn < hi)) Dn = 0.5 * (lo + hi);
    D = Dn;
  }
  dPrev = D;
  return face(D);
}

void TubularEngine::Voice::render(float *L, float *R, int n, TubularEngine &eng) {
  const double fadeStep = fading ? 1 / (FADE * eng.fs) : 0;
  double fade_ = fade;
  for (int s = 0; s < n; s++) {
    for (int i = 0; i < N; i++) { const double qn = a1[i] * q[i] - a2[i] * q1[i]; q1[i] = q[i]; q[i] = qn; }
    if (malletOn) {
      double uf = 0;
      for (int i = 0; i < N; i++) uf += ws[i] * q[i];
      const double etaF = 2 * eta - etaPrev, C = compModes + kOverM;
      const double Fc = contactForce(etaF - uf, C);
      etaPrev = eta; eta = etaF - kOverM * Fc;
      if (Fc > 0) {
        for (int i = 0; i < N; i++) q[i] += bws[i] * Fc;
        contact = true; contactSamples++;
        if (Fc > Fmax) Fmax = Fc;
      }
      if (++inFlight > eng.malletMax || (contact && Fc == 0 && dPrev < -1e-4)) {
        malletOn = false; lastContactMs = (1000.0 * contactSamples) / eng.fs;
      }
    }
    double y[2] = {0, 0};
    for (int i = 0; i < N; i++) { y[0] += l0[i] * q[i] + l1[i] * q1[i]; y[1] += r0[i] * q[i] + r1[i] * q1[i]; }
    // the later channel, through the ring
    ring[at] = (float)y[late];
    y[late] = ring[(at - lag + RING) % RING];
    at = (at + 1) % RING;
    L[s] += (float)(y[0] * fade_); R[s] += (float)(y[1] * fade_);
    if (fadeStep) { fade_ -= fadeStep; if (fade_ <= 0) { fade_ = 0; dead = true; } }
  }
  fade = fade_;
  age += n / eng.fs;
  // energy, from two successive samples of each mode
  const double k = 1 / eng.fs;
  double e = 0;
  for (int i = 0; i < N; i++) {
    if (cut[i]) continue;
    const double om = TAU * d->m[i].f, c = std::cos(om * k), sn = std::sin(om * k), a = q[i], b = q1[i];
    e += (0.5 * om * om * std::max(0.0, a * a - 2 * c * a * b + b * b)) / (sn * sn);
  }
  E = e;
  if (E > Emax) Emax = E;
  if (!(E < 1e6)) {
    dead = true;
    Message m;
    m.type = msg::error; m.key = (int16_t)key;
    eng.post(m);
    return;
  }
  if (!malletOn && age > YOUNG && (E <= floor * Emax || (damp > 0.99 && E < std::max(1e-7, floor) * Emax))) dead = true;
}

// ---- the engine ------------------------------------------------------------------------------

bool TubularEngine::Build::operator==(const Build &o) const {
  return material == o.material && diameter == o.diameter && wall == o.wall && cap == o.cap && distance == o.distance && tuning == o.tuning;
}

TubularEngine::TubularEngine(double fs)
    : Engine(fs), data([this](int key, uint64_t version) -> std::unique_ptr<Tube> {
        if (key < KEY_MIN || key > KEY_MAX) return nullptr;
        const Snapshot &s = snapshots[version % snapshots.size()];
        const int material = (int)s.material.load(std::memory_order_relaxed);
        const double diameter = s.diameter.load(std::memory_order_relaxed), wall = s.wall.load(std::memory_order_relaxed);
        const double cap = s.cap.load(std::memory_order_relaxed), distance = s.distance.load(std::memory_order_relaxed);
        const double ratio = s.ratio[key % 12].load(std::memory_order_relaxed);
#if !FORTE_THREADS
        if (offered && offered->key == key && offered->material == material && offered->diameterMm == diameter && offered->wallMm == wall &&
            offered->capGrams == cap && offered->distance == distance && offered->ratio == ratio)
          return std::move(offered);
#endif
        auto t = std::make_unique<Tube>();
        buildTube(key, material, diameter, wall, cap, ratio, distance, *t);
        return t;
      }),
      malletMax((int)std::round(MALLET_MAX * fs)) {
  view.type = msg::tube; view.key = 0; view.count = VIEW_MODES + 5;
}

bool TubularEngine::offer(const double *packed, int n) {
#if FORTE_THREADS
  (void)packed; (void)n;
  return false;
#else
  auto t = std::make_unique<Tube>();
  if (!unpackTube(packed, n, *t)) return false;
  offered = std::move(t);
  return true;
#endif
}

void TubularEngine::setParams(const double *p) {
  const bool first = !hasParams;
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
  // the tubes are built for the knobs that cut them and the tuning, nearest the last key played first
  const Build b = {P[p::material], P[p::diameter] + 0.0, P[p::wall] + 0.0, P[p::cap] + 0.0, P[p::distance] + 0.0, tuningOf(P.data())}; // (−0 is 0)
  if (first || !(b == built)) {
    built = b; version++;
    Snapshot &s = snapshots[version % snapshots.size()];
    s.material.store(b.material, std::memory_order_relaxed); s.diameter.store(b.diameter, std::memory_order_relaxed);
    s.wall.store(b.wall, std::memory_order_relaxed); s.cap.store(b.cap, std::memory_order_relaxed);
    s.distance.store(b.distance, std::memory_order_relaxed);
    for (int i = 0; i < 12; i++) s.ratio[i].store(b.tuning.r[i], std::memory_order_relaxed);
    data.prepare(version, KEY_MIN, KEY_MAX, focus ? focus->key : 68);
  }
  // the metal's losses and the damper apply at once to every sounding tube
  for (int i = 0; i < nVoices; i++) voices[i]->coefs(*this);
}

void TubularEngine::noteOn(int key, double velocity) {
  if (!hasParams || !(key >= KEY_MIN && key <= KEY_MAX)) return; // A0–C8: there is no tube outside
  const Data::Ref r = data.get(key, version);
  if (r) { strikeKey(key, velocity, r); return; }
  // the tube is being built (a few ms): the note waits for it
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) { pending[i] = {key, velocity, false}; return; }
  if (nPending < (int)pending.size()) pending[nPending++] = {key, velocity, false};
}

void TubularEngine::retryPending() {
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

void TubularEngine::strikeKey(int key, double velocity, Data::Ref r) {
  Voice *v = byKey[key];
  if (!v || v->dead || v->fading || v->version != version) {
    if (v && !v->dead) v->fading = true; // the tube was re-cut: the old one fades out quickly
    Voice *free = nullptr;
    for (Voice &u : pool) if (!u.inUse) { free = &u; break; }
    if (!free) return; // every voice busy (beyond anything the stealing below lets happen)
    v = free;
    v->start(*this, r, version);
    voices[nVoices++] = v; byKey[key] = v;
  }
  v->strike(*this, velocity);
  focus = v;
  int live = 0;
  for (int i = 0; i < nVoices; i++) if (!voices[i]->fading) live++;
  if (live > pick(MAX_VOICES, 14, 8)) { // Quality: fewer tubes ring at once at Medium and Low
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

void TubularEngine::noteOff(int key, double) {
  if (key < 0 || key > 127) return;
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) pending[i].off = true;
  if (Voice *v = byKey[key]) v->released = true;
}

void TubularEngine::allNotesOff() {
  nPending = 0;
  for (int i = 0; i < nVoices; i++) voices[i]->fading = true;
}

void TubularEngine::process(float *L, float *R, int n) {
  for (int at = 0; at < n; at += BLOCK_MAX) processBlock(L + at, R + at, std::min(BLOCK_MAX, n - at));
  data.audioCycle();
}

void TubularEngine::processBlock(float *L, float *R, int n) {
  std::fill(L, L + n, 0.0f); std::fill(R, R + n, 0.0f);
  if (!hasParams) return;
  if (nPending) retryPending();
  const double dStep = n / (DAMP_RAMP * fs);
  const bool lock = P[p::pedalLock] != 0;
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    // the damper bar: on every tube not held by a key, unless the pedal is down
    const double want = v->released && !sustain && !lock ? 1 : 0;
    if (v->damp != want) v->damp = want > v->damp ? std::min(1.0, v->damp + dStep) : std::max(0.0, v->damp - dStep);
    if (v->damp != v->dampSet) v->coefs(*this);
    v->render(L, R, n, *this);
  }
  int j = 0;
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    if (v->dead) {
      if (byKey[v->key] == v) byKey[v->key] = nullptr;
      data.release(v->ref);
      v->inUse = false; // the voice keeps its fields (dead) until it is reused
    } else voices[j++] = v;
  }
  nVoices = j;
  if (focus && focus->dead) focus = nullptr;
  if (messages && ++blocks >= POST_BLOCKS) { blocks = 0; postFocus(); }
}

// Live data for the page's views: the struck tube's mode amplitudes, its energy, the mallet's contact.
void TubularEngine::postFocus() {
  Voice *v = focus;
  Message &m = view;
  float *a = m.values;
  if (!v) { m.key = 0; post(m); return; }
  const double k = 1 / fs;
  m.key = (int16_t)v->key;
  for (int i = 0; i < VIEW_MODES; i++) a[i] = 0;
  for (int i = 0; i < std::min(v->N, VIEW_MODES); i++) {
    if (v->cut[i]) continue;
    const double om = TAU * v->d->m[i].f, c = std::cos(om * k), qa = v->q[i], qb = v->q1[i];
    a[i] = (float)(std::sqrt(std::max(0.0, qa * qa - 2 * c * qa * qb + qb * qb)) / std::sin(om * k));
  }
  a[VIEW_MODES] = (float)v->E; a[VIEW_MODES + 1] = (float)v->lastContactMs; a[VIEW_MODES + 2] = (float)v->Fmax;
  a[VIEW_MODES + 3] = (float)v->damp; a[VIEW_MODES + 4] = (float)(v->malletOn ? 1 : 0);
  post(m);
}

} // namespace forte::tubular
