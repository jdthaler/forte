// springs-engine.cpp — the spring keyboard's engine (springs-engine.h).

#include "springs-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/fdlibm.h"

namespace forte::springs {

namespace fd = forte::fdlibm;

static constexpr double OUT = 0.05;      // output per mode at full velocity, before the voicing
static constexpr double FADE = 0.03;     // s: a stolen voice fades out over this
static constexpr double YOUNG = 0.05;    // s: a voice this young is never stolen
static constexpr double GLIDE = 0.03;    // s: damping and output gains glide over this
static constexpr double PRUNE = 3e-5;    // a mode below this × the voice's loudest is skipped (−90 dB)
static constexpr double PULSE_MAX = 0.012; // s: the longest mallet pulse
static const double PANS[3][3] = {{0, 0, 0}, {-0.3, 0.3, 0}, {0, 0.35, -0.35}}; // each spring's pickup, left/right of the key's place

// Equal-power pan of a position p ∈ [−1, 1].
static void panOf(double p, double &l, double &r) {
  const double a = ((std::max(-1.0, std::min(1.0, p)) + 1) * PI) / 4;
  l = fd::cos(a); r = fd::sin(a);
}
static double keyPos(int key) { return 0.6 * ((2.0 * (key - KEY_LO)) / (KEY_HI - KEY_LO) - 1); }
// The pickups' voicing: +3 dB an octave up the keyboard
static double voicing(int key) { return fd::pow(2, (key - 60) / 24.0); }

// ---- one spring: a bank of modes ------------------------------------------------------------------

void SpringEngine::Bank::reserve(int n) {
  for (auto *v : {&W, &SIG0, &C, &WD, &A1, &A2, &BC, &G, &GT, &Y1, &Y2, &AMP, &KA}) if ((int)v->size() < n) v->resize(n);
  if ((int)act.size() < n) act.resize(n);
  if ((int)idx.size() < n) idx.resize(n);
}

void SpringEngine::Bank::start(SpringEngine &eng, const SpringData *s, int n, double pl, double pr, double share) {
  sp = s; N = n;
  reserve(N); // (the plugin reserved MAX_MODES: nothing is allocated there)
  const double h = 1 / eng.fs;
  for (int i = 0; i < N; i++) {
    W[i] = s->rel[i] * share;
    const double w = TAU * s->f[i];
    WD[i] = w; C[i] = fd::cos(w * h);
    act[i] = 1;
    G[i] = 0; GT[i] = 0; Y1[i] = 0; Y2[i] = 0; AMP[i] = 0;
  }
  gl = pl; gr = pr;
  sigma(eng, 0, true);
  gains(eng, true);
}

// σ per mode (the fixed part: drag, steel, mounts) and, with the live extra, the recursion's coefficients.
void SpringEngine::Bank::sigma(const SpringEngine &eng, double extra, bool fixed) {
  const double h = 1 / eng.fs, L = sp->L;
  for (int i = 0; i < N; i++) {
    if (fixed || eng.lossMoved) SIG0[i] = modeSigma(sp->f[i], sp->cg[i], L, eng.S[kEndLoss], eng.S[kEta], eng.S[kOil]);
    const double sg = SIG0[i] + extra, r = fd::exp(-sg * h), w = WD[i];
    A1[i] = 2 * r * C[i]; A2[i] = r * r; BC[i] = (h * r * fd::sin(w * h)) / w;
  }
}

// Output gains: velocity of the far bead, each bead's inertia passing less of the higher modes.
void SpringEngine::Bank::gains(const SpringEngine &eng, bool now) {
  const double h = 1 / eng.fs, fb = sp->f0 / (PI * std::max(1e-4, eng.S[kBead] / 100)), out = OUT * voicing(sp->key) * sp->gain * eng.fs;
  for (int i = 0; i < N; i++) {
    const double w = WD[i], corr = (0.5 * w * h) / fd::sin(0.5 * w * h), x = sp->f[i] / fb;
    GT[i] = (out * corr * W[i]) / (1 + x * x);
    if (now) G[i] = GT[i];
    KA[i] = (std::fabs(GT[i]) * 2 * fd::sin(0.5 * w * h)) / fd::sin(w * h);
  }
}

void SpringEngine::Bank::compact() {
  int k = 0;
  for (int r = 0; r < N; r++) if (act[r]) idx[k++] = r;
  nAct = k;
}

// ---- the hot loops ------------------------------------------------------------------------------------

// Free ringing: four modes at a time, each output gain ramping to its target over the block.
static void ringBlock(const double *A1, const double *A2, double *Y1, double *Y2, double *G, const double *GT, const int *idx, int na, double *buf, int n, double glide) {
  const double inv = 1.0 / n;
  int q = 0;
  for (; q + 4 <= na; q += 4) {
    const int r0 = idx[q], r1 = idx[q + 1], r2 = idx[q + 2], r3 = idx[q + 3];
    const double a10 = A1[r0], a20 = A2[r0], a11 = A1[r1], a21 = A2[r1], a12 = A1[r2], a22 = A2[r2], a13 = A1[r3], a23 = A2[r3];
    double y10 = Y1[r0], y20 = Y2[r0], y11 = Y1[r1], y21 = Y2[r1], y12 = Y1[r2], y22 = Y2[r2], y13 = Y1[r3], y23 = Y2[r3];
    double g0 = G[r0], g1 = G[r1], g2 = G[r2], g3 = G[r3];
    const double d0 = glide * (GT[r0] - g0) * inv, d1 = glide * (GT[r1] - g1) * inv, d2 = glide * (GT[r2] - g2) * inv, d3 = glide * (GT[r3] - g3) * inv;
    for (int s = 0; s < n; s++) {
      const double x0 = a10 * y10 - a20 * y20, x1 = a11 * y11 - a21 * y21, x2 = a12 * y12 - a22 * y22, x3 = a13 * y13 - a23 * y23;
      buf[s] += g0 * (x0 - y10) + g1 * (x1 - y11) + g2 * (x2 - y12) + g3 * (x3 - y13);
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
    for (int s = 0; s < n; s++) { const double y = a1 * y1 - a2 * y2; buf[s] += g * (y - y1); y2 = y1; y1 = y; g += dg; }
    Y1[r] = y1; Y2[r] = y2; G[r] = g;
  }
}
// The mallet is on: every mode takes its share of the force, sample by sample, two at a time.
static void pushBlock(const double *A1, const double *A2, const double *BC, double *Y1, double *Y2, double *G, const double *GT, const int *idx, int na, double *buf, const double *force, int n, double glide) {
  const double inv = 1.0 / n;
  int q = 0;
  for (; q + 2 <= na; q += 2) {
    const int r0 = idx[q], r1 = idx[q + 1];
    const double a10 = A1[r0], a20 = A2[r0], b0 = BC[r0], a11 = A1[r1], a21 = A2[r1], b1 = BC[r1];
    double y10 = Y1[r0], y20 = Y2[r0], y11 = Y1[r1], y21 = Y2[r1], g0 = G[r0], g1 = G[r1];
    const double d0 = glide * (GT[r0] - g0) * inv, d1 = glide * (GT[r1] - g1) * inv;
    for (int s = 0; s < n; s++) {
      const double f = force[s], x0 = a10 * y10 - a20 * y20 + b0 * f, x1 = a11 * y11 - a21 * y21 + b1 * f;
      buf[s] += g0 * (x0 - y10) + g1 * (x1 - y11);
      y20 = y10; y10 = x0; y21 = y11; y11 = x1; g0 += d0; g1 += d1;
    }
    Y1[r0] = y10; Y2[r0] = y20; Y1[r1] = y11; Y2[r1] = y21; G[r0] = g0; G[r1] = g1;
  }
  for (; q < na; q++) {
    const int r = idx[q];
    const double a1 = A1[r], a2 = A2[r], bc = BC[r];
    double y1 = Y1[r], y2 = Y2[r], g = G[r];
    const double dg = glide * (GT[r] - g) * inv;
    for (int s = 0; s < n; s++) { const double y = a1 * y1 - a2 * y2 + bc * force[s]; buf[s] += g * (y - y1); y2 = y1; y1 = y; g += dg; }
    Y1[r] = y1; Y2[r] = y2; G[r] = g;
  }
}
// Each active mode's amplitude as heard, from two successive states: √(a² − 2ca·b + b²)·KA.
// Returns the power, Σ amp².
static double amplitudes(const double *Y1, const double *Y2, const double *C, const double *KA, double *AMP, const int *idx, int na) {
  double sum = 0;
  for (int q = 0; q < na; q++) {
    const int r = idx[q];
    const double c = C[r], a = Y1[r], b = Y2[r];
    const double amp = std::sqrt(std::max(0.0, a * a - 2 * c * a * b + b * b)) * KA[r];
    AMP[r] = amp; sum += amp * amp;
  }
  return sum;
}

// ---- a voice ------------------------------------------------------------------------------------------

void SpringEngine::Voice::start(SpringEngine &eng, int k, Data::Ref r, uint64_t version) {
  key = k; id = version; ref = r; inUse = true;
  eng.data.acquire(r);
  const KeySprings &d = *r.data;
  nBanks = (int)d.springs.size();
  for (int s = 0; s < nBanks; s++) {
    const SpringData &sd = d.springs[s];
    int N = (int)sd.f.size();
#if FORTE_THREADS
    N = std::min(N, MAX_MODES); // (never so many: see MAX_MODES)
#endif
    double pl, pr;
    panOf(keyPos(key) + PANS[nBanks - 1][s], pl, pr);
    banks[s].start(eng, &sd, N, pl, pr, 1.0 / nBanks);
  }
  sp = &d.springs[0];
  if ((int)pulse.size() < eng.pulseMax) pulse.resize(eng.pulseMax);
  pulseN = 0; pulseAt = 0; tau = 0;
  age = 0; fade = 1; fading = false; dead = false; peak = 0; level = 0;
  released = false; dampGlide = GLIDE;
  extra = eng.S[kHand];
  for (int s = 0; s < nBanks; s++) banks[s].sigma(eng, extra); // a hand already on the spring
}

// The mallet: a half-sine pulse of force whose impulse is the velocity, laid onto the beads.
void SpringEngine::Voice::strike(SpringEngine &eng, double velocity) {
  tau = std::min(PULSE_MAX, pulseLength(eng.P[p::mallet], velocity));
  const int n = std::max(1, (int)jsRound(tau * eng.fs));
  const double amp = (velocity * PI * eng.fs) / (2 * n); // Σ F·h = velocity
  for (int i = 0; i < n; i++) pulse[i] = amp * fd::sin((PI * (i + 0.5)) / n);
  pulseN = n; pulseAt = 0;
  for (int s = 0; s < nBanks; s++) { Bank &b = banks[s]; std::fill(b.act.begin(), b.act.begin() + b.N, 1); b.compact(); }
  fading = false; fade = 1; dead = false; age = 0;
  released = false;
}

void SpringEngine::Voice::render(float *L, float *R, int n, SpringEngine &eng) {
  double *buf = eng.buf.data(), *force = eng.force.data();
  const double glide = 1 - fd::exp(-n / (GLIDE * eng.fs));
  // the force in this block (zero once the pulse is over)
  bool pushing = false;
  for (int s = 0; s < n; s++) {
    if (pulseAt < pulseN) { force[s] = pulse[pulseAt++]; pushing = true; } else force[s] = 0;
  }
  // the hand and the damper (once the key is up, unless the pedal holds it off): extra damping, gliding in
  const double target = eng.S[kHand] + (released && !eng.sustain ? eng.dampSigma : 0);
  if (target != extra || eng.lossMoved) {
    const double tg = target > extra && released ? dampGlide : GLIDE;
    extra += (1 - fd::exp(-n / (tg * eng.fs))) * (target - extra);
    if (std::fabs(target - extra) < 1e-3 * (1 + target)) extra = target;
    for (int s = 0; s < nBanks; s++) banks[s].sigma(eng, extra);
  }
  double sum = 0;
  for (int bi = 0; bi < nBanks; bi++) {
    Bank &b = banks[bi];
    std::fill(buf, buf + n, 0.0);
    const int na = b.nAct;
    if (pushing) pushBlock(b.A1.data(), b.A2.data(), b.BC.data(), b.Y1.data(), b.Y2.data(), b.G.data(), b.GT.data(), b.idx.data(), b.nAct, buf, force, n, glide);
    else ringBlock(b.A1.data(), b.A2.data(), b.Y1.data(), b.Y2.data(), b.G.data(), b.GT.data(), b.idx.data(), b.nAct, buf, n, glide);
    if (na < b.N) for (int r = 0; r < b.N; r++) if (!b.act[r]) b.G[r] += glide * (b.GT[r] - b.G[r]);
    const double gl = b.gl, gr = b.gr, fadeStep = fading ? 1 / (FADE * eng.fs) : 0;
    double fd_ = fade;
    const bool cap = eng.capturing == this;
    for (int s = 0; s < n; s++) {
      const double y = buf[s] * fd_;
      if (fadeStep != 0) { fd_ -= fadeStep; if (fd_ < 0) fd_ = 0; }
      L[s] += gl * y; R[s] += gr * y;
      if (cap) eng.capture[eng.capN + s] += y * 0.7071;
    }
    sum += prune(b, pushing);
  }
  if (fading) { fade -= n / (FADE * eng.fs); if (fade <= 0) { fade = 0; dead = true; } }
  if (eng.capturing == this) { eng.capN += n; if (eng.capN + BLOCK_MAX > eng.capLen) eng.finishCapture(); }
  level = std::sqrt(sum);
  if (level > peak) peak = level;
  age += n / eng.fs;
  if (!pushing && age > YOUNG && !anyActive()) dead = true;
  if (!(sum < 1e6)) {
    dead = true;
    Message m;
    m.type = msg::error; m.key = (int16_t)key;
    eng.post(m);
  }
}

bool SpringEngine::Voice::anyActive() const {
  for (int s = 0; s < nBanks; s++) if (banks[s].nAct) return true;
  return false;
}

// Each mode's amplitude as heard; skip those far below the voice's loudest. Returns the bank's power.
double SpringEngine::Voice::prune(Bank &b, bool pushing) {
  const double sum = amplitudes(b.Y1.data(), b.Y2.data(), b.C.data(), b.KA.data(), b.AMP.data(), b.idx.data(), b.nAct);
  if (pushing || age < YOUNG) return sum;
  const double floor = std::max(PRUNE * peak, 1e-9);
  bool changed = false;
  // (a skipped mode is let go entirely, so a later strike starts it afresh)
  for (int q = 0; q < b.nAct; q++) {
    const int r = b.idx[q];
    if (b.AMP[r] < floor) { b.act[r] = 0; b.AMP[r] = 0; b.Y1[r] = 0; b.Y2[r] = 0; changed = true; }
  }
  if (changed) b.compact();
  return sum;
}

// ---- the engine ---------------------------------------------------------------------------------------

SpringEngine::SpringEngine(double fs)
    : Engine(fs), data([this](int key, uint64_t version) -> std::unique_ptr<KeySprings> {
        if (key < KEY_LO || key > KEY_HI) return nullptr;
#if !FORTE_THREADS
        if (offered && offered->key == key && offered->id == version && offered->fs == this->fs) return std::move(offered);
#endif
        Params g;
        if (!snapshot(version, g)) return nullptr; // knobs moved on since: a newer version is wanted
        return std::make_unique<KeySprings>(keySprings(key, g, this->fs));
      }),
      capture(CAPTURE, 0.0f), buf(BLOCK_MAX, 0.0), force(BLOCK_MAX, 0.0), pulseMax((int)std::ceil(PULSE_MAX * fs) + 2) {
#if FORTE_THREADS
  for (Voice &v : pool) { for (Bank &b : v.banks) b.reserve(MAX_MODES); v.pulse.resize(pulseMax); }
#endif
}

bool SpringEngine::offer(const double *packed, int n) {
#if FORTE_THREADS
  (void)packed; (void)n;
  return false;
#else
  auto d = std::make_unique<KeySprings>();
  if (!unpackKeySprings(packed, n, *d) || d->key < KEY_LO || d->key > KEY_HI) return false;
  offered = std::move(d);
  return true;
#endif
}

void SpringEngine::setParams(const double *p) {
  const bool first = !hasParams;
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
  // live: losses, hand, bead (they glide); the rest applies at the next strike
  T = {P[p::endLoss], P[p::eta], P[p::oil], 60 * P[p::hand] * P[p::hand], P[p::bead]};
  if (first) S = T;
  dampSigma = fd::log(1000) / P[p::damper];
  // the keys' springs are built for the geometry the knobs are at, nearest the last key played first
  const Params g = paramsOf(P.data());
  const uint64_t v = geometryId(g);
  if (first || v != version) {
    version = v;
    publish(g, v);
    data.prepare(version, KEY_LO, KEY_HI, lastKey);
  }
}

static void toArray(const Params &g, double *a) {
  const double v[12] = {g.slinky ? 1.0 : 0.0, g.axial ? 1.0 : 0.0, g.coil, g.wire, g.helix, g.springs, g.spread, g.mallet, g.bead, g.endLoss, g.eta, g.oil};
  for (int i = 0; i < 12; i++) a[i] = v[i];
}
static Params fromArray(const double *a) {
  Params g;
  g.slinky = a[0] != 0; g.axial = a[1] != 0; g.coil = a[2]; g.wire = a[3]; g.helix = a[4]; g.springs = a[5]; g.spread = a[6];
  g.mallet = a[7]; g.bead = a[8]; g.endLoss = a[9]; g.eta = a[10]; g.oil = a[11];
  return g;
}
void SpringEngine::publish(const Params &g, uint64_t v) {
  Snapshot &s = snaps[snapAt];
  snapAt = (snapAt + 1) % (int)snaps.size();
  double a[12];
  toArray(g, a);
  s.seq.fetch_add(1, std::memory_order_acq_rel); // odd: being written
  s.version.store(v, std::memory_order_relaxed);
  for (int i = 0; i < 12; i++) s.v[i].store(a[i], std::memory_order_relaxed);
  s.seq.fetch_add(1, std::memory_order_release);
}
bool SpringEngine::snapshot(uint64_t v, Params &g) const {
  for (const Snapshot &s : snaps) {
    const uint32_t q = s.seq.load(std::memory_order_acquire);
    if (q & 1 || s.version.load(std::memory_order_relaxed) != v) continue;
    double a[12];
    for (int i = 0; i < 12; i++) a[i] = s.v[i].load(std::memory_order_relaxed);
    std::atomic_thread_fence(std::memory_order_acquire);
    if (s.seq.load(std::memory_order_relaxed) != q) continue;
    g = fromArray(a);
    return true;
  }
  return false;
}

void SpringEngine::noteOn(int key, double velocity) {
  if (!hasParams || !(key >= KEY_LO && key <= KEY_HI) || !(velocity > 0)) return;
  lastKey = key;
  const Voice *v = byKey[key];
  if (v && !v->dead && !v->fading && v->id == version) { strikeKey(key, velocity, {}); return; } // the springs ringing there: struck again
  const Data::Ref r = data.get(key, version);
  if (r) { strikeKey(key, velocity, r); return; }
  // the springs are being built (a few ms): the note waits for them
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) { pending[i] = {key, velocity, false, -1}; return; }
  if (nPending < (int)pending.size()) pending[nPending++] = {key, velocity, false, -1};
}

void SpringEngine::retryPending() {
  int j = 0;
  for (int i = 0; i < nPending; i++) {
    const Pending pd = pending[i];
    const Data::Ref r = data.get(pd.key, version);
    if (!r) { pending[j++] = pd; continue; }
    strikeKey(pd.key, pd.velocity, r);
    if (pd.off) noteOff(pd.key, pd.offVelocity);
  }
  nPending = j;
}

void SpringEngine::strikeKey(int key, double velocity, Data::Ref r) {
  Voice *v = byKey[key];
  if (!v || v->dead || v->fading || v->id != version) {
    if (v && !v->dead) v->fading = true; // a different spring now hangs there: the old one fades out
    Voice *free = nullptr;
    for (Voice &u : pool) if (!u.inUse) { free = &u; break; }
    if (!free) return; // every voice busy (beyond anything the stealing below lets happen)
    v = free;
    v->start(*this, key, r, version);
    voices[nVoices++] = v; byKey[key] = v;
  }
  v->strike(*this, velocity);
  // the page's echo view: this strike's first moments
  std::fill(capture.begin(), capture.end(), 0.0f);
  capN = 0; capturing = v; capKey = key; capVel = velocity;
  capLen = std::min(CAPTURE, std::max(2048, (int)jsRound(std::min(10 * v->sp->TD + 0.004, 0.65) * fs)));
  int live = 0;
  for (int i = 0; i < nVoices; i++) if (!voices[i]->fading) live++;
  if (live > MAX_VOICES) {
    Voice *victim = nullptr;
    double score = INFINITY;
    for (int i = 0; i < nVoices; i++) {
      Voice *u = voices[i];
      if (u == v || u->fading || u->pulseAt < u->pulseN || u->age < YOUNG) continue;
      if (u->level < score) { score = u->level; victim = u; }
    }
    if (victim) victim->fading = true;
  }
}

void SpringEngine::noteOff(int key, double velocity) {
  if (key < 0 || key > 127) return;
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) { pending[i].off = true; pending[i].offVelocity = velocity; }
  Voice *v = byKey[key];
  if (!v) return;
  // the damper falls onto the springs: its grip glides in over 25–100 ms, faster for a faster release
  v->released = true; v->dampGlide = 0.04 / (0.4 + (velocity < 0 ? 0.5 : velocity));
}

void SpringEngine::allNotesOff() {
  nPending = 0;
  for (int i = 0; i < nVoices; i++) voices[i]->fading = true;
}

void SpringEngine::finishCapture() {
  if (capturing) {
    Message m;
    m.type = msg::echo; m.key = (int16_t)capKey; m.count = 2;
    m.values[0] = (float)capN; m.values[1] = (float)capVel;
    post(m);
  }
  capturing = nullptr;
}

void SpringEngine::process(float *L, float *R, int n) {
  for (int at = 0; at < n; at += BLOCK_MAX) processBlock(L + at, R + at, std::min(BLOCK_MAX, n - at));
  data.audioCycle();
}

void SpringEngine::processBlock(float *L, float *R, int n) {
  std::fill(L, L + n, 0.0f); std::fill(R, R + n, 0.0f);
  if (!hasParams) return;
  if (nPending) retryPending();
  const double a = 1 - fd::exp(-n / (GLIDE * fs));
  bool loss = false, beadMoved = false;
  for (int id = 0; id < kCount; id++) {
    if (S[id] == T[id]) continue;
    S[id] += a * (T[id] - S[id]);
    if (std::fabs(T[id] - S[id]) < 1e-6 * (std::fabs(T[id]) + 1e-6)) S[id] = T[id];
    if (id == kBead) beadMoved = true; else if (id != kHand) loss = true;
  }
  lossMoved = loss;
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    if (beadMoved) for (int s = 0; s < v->nBanks; s++) v->banks[s].gains(*this);
    v->render(L, R, n, *this);
  }
  lossMoved = false;
  int j = 0;
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    if (v->dead) {
      if (byKey[v->key] == v) byKey[v->key] = nullptr;
      if (capturing == v) finishCapture();
      data.release(v->ref);
      v->ref = {}; v->inUse = false; // the voice keeps its fields (dead) until it is reused
    } else voices[j++] = v;
  }
  nVoices = j;
}

} // namespace forte::springs
