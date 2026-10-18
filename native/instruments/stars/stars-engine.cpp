// stars-engine.cpp — the Star Keyboard's engine (stars-engine.h; stars/README.md, "Driving,
// damping and the sound" and "The engine", gives the physics). With V8's math (forte/fdlibm.h)
// and seeded generators, it plays the same samples to the last bit everywhere.

#include "stars-engine.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <numbers>

#include "forte/fdlibm.h"

namespace forte::stars {

namespace fd = forte::fdlibm;
using std::numbers::pi;

constexpr double OUT = 0.088;   // output scale: a star's rms is OUT·√½·drive
constexpr int MAX_VOICES = 14;  // stars sounding at once; the quietest older one fades beyond this
constexpr double FADE = 0.05;   // s: a stolen voice fades over this
constexpr double YOUNG = 0.05;  // s: a voice this young is never stolen
constexpr double GLIDE = 0.03;  // s: live knobs glide over this
constexpr double PRUNE = 1e-7;  // after release, a mode below this × the voice's peak power is let go (−70 dB)
constexpr double POST_EVERY = 0.06; // s: the focus star's mode amplitudes, for the page's views
constexpr uint64_t WARM_TRACK = 1, WARM_DSCUTI = 2; // the warm-up stars' ids (a version is ≥ 2⁵²)
constexpr double FACT[] = {1, 1, 2, 6, 24, 120, 720};
static const double DEAD = fd::pow(10, -6.5); // and the voice when its whole power is below this × its peak (−65 dB)

static double voicing(int key) { return fd::pow(2, (60 - key) / 48.0); }

// the stars' version: the kind, mass and speed-up that build them
static uint64_t versionOf(const double *P) {
  uint64_t h = 1469598103934665603ull;
  for (double v : {P[p::family], P[p::mass], P[p::speedup]}) {
    v += 0.0;
    uint64_t b;
    std::memcpy(&b, &v, 8);
    for (int k = 0; k < 8; k++) { h ^= (b >> (8 * k)) & 0xff; h *= 1099511628211ull; }
  }
  return (h & ((1ull << 52) - 1)) | (1ull << 52);
}

// ---- a voice: one star ---------------------------------------------------------------------------

void StarEngine::Voice::start(StarEngine &eng, int key_, const Star &d, uint64_t id_) {
  key = key_; id = id_; dscuti = d.dscuti; N = d.N; K = d.K;
  for (int i = 0; i < N; i++) {
    F0[i] = d.f[i]; L[i] = d.l[i]; M[i] = d.m[i]; WE[i] = d.wEnv[i]; WC[i] = d.wCore[i]; Pw[i] = d.p[i]; GAM[i] = d.gamma[i]; Z[i] = d.zeta[i]; AS[i] = d.asat[i];
    W[i] = C[i] = S[i] = RHO[i] = A1[i] = A2[i] = Y1[i] = Y2[i] = G[i] = GT[i] = AMP[i] = ETA[i] = 0;
    act[i] = 1;
  }
  const double pp = 0.6 * (2.0 * (key - KEY_LO) / (KEY_HI - KEY_LO) - 1), a = ((pp + 1) * pi) / 4;
  gl = fd::cos(a); gr = fd::sin(a);
  vel = 0.7; pressure = 1; held = false; age = 0; fade = 1; fading = false; dead = false;
  peak = 1e-12; level = 0; seed = Rng(key * 104729 + (int)(eng.presses++ & 0xffff));
  compact();
  freqs(eng); coeffs(eng); gains(eng, true);
  if (dscuti) { // a tiny seed in every mode, random phase: a self-excited mode grows from noise
    for (int i = 0; i < N; i++) {
      const double u = 1e-3 * AS[i] * fd::cos(2 * pi * seed());
      const double v = 1e-3 * AS[i] * fd::sin(2 * pi * seed());
      addC(i, u, v);
    }
  }
  inUse = true;
}

void StarEngine::Voice::compact() { int k = 0; for (int r = 0; r < N; r++) if (act[r]) idx[k++] = r; nAct = k; }

// frequencies with rotational splitting: δν = m (w_env Ω_env + w_core Ω_core)/2π, sped up K times
void StarEngine::Voice::freqs(const StarEngine &eng) {
  const double Kc = K * 1e-6, env = eng.S[kSpin] * SUN.rot, core = env * (dscuti ? 1 : eng.S[kCore]), fs = eng.fs;
  for (int i = 0; i < N; i++) {
    const double f = jsMin(0.45 * fs, jsMax(1, F0[i] + M[i] * Kc * (WE[i] * env + WC[i] * core)));
    const double w = (2 * pi * f) / fs;
    W[i] = w; C[i] = fd::cos(w); S[i] = fd::sin(w);
  }
}

// damping per sample from the linewidth: amplitude rate η = πΓ (× the damping knob)
void StarEngine::Voice::coeffs(const StarEngine &eng) {
  if (dscuti) return; // set per block in render
  for (int i = 0; i < N; i++) {
    const double eta = pi * GAM[i] * eng.S[kDamping], r = fd::exp(-eta / eng.fs);
    ETA[i] = eta; RHO[i] = r; A1[i] = 2 * r * C[i]; A2[i] = r * r;
  }
}

// what the observer sees of each m component: √(V_l² E_lm(i)), and the voicing
void StarEngine::Voice::gains(const StarEngine &eng, bool now) {
  const double g = OUT * voicing(key);
  for (int i = 0; i < N; i++) { GT[i] = g * eng.gtab[L[i] * 7 + M[i] + 3]; if (now) G[i] = GT[i]; }
}

// add δC to mode i's complex amplitude C (y1 = Re C, y2 = Re(C e^(−iω))/ρ)
void StarEngine::Voice::addC(int i, double u, double v) {
  const double r = RHO[i] != 0 && RHO[i] == RHO[i] ? RHO[i] : 1;
  Y1[i] += u; Y2[i] += (u * C[i] + v * S[i]) / r;
}
// |C|² of mode i from its two states
double StarEngine::Voice::amp2(int i) const {
  const double r = RHO[i] != 0 && RHO[i] == RHO[i] ? RHO[i] : 1;
  const double y1 = Y1[i], v = (Y2[i] * r - y1 * C[i]) / S[i];
  return y1 * y1 + v * v;
}

// Key-down: the convection drives the star, and a flare kicks every mode at once (a point on the
// star, random and seeded; each mode pushed by its spherical harmonic there, in sine phase).
void StarEngine::Voice::press(const StarEngine &eng, double velocity) {
  vel = velocity; held = true; fading = false; fade = 1; dead = false; age = 0;
  if (nAct < N) { for (int i = 0; i < N; i++) act[i] = 1; compact(); }
  const double F = eng.S[kFlare] * velocity * (dscuti ? 0.3 : 1);
  if (!(F > 0)) return;
  const double x = 2 * seed() - 1, s = std::sqrt(1 - x * x);
  const double phi0 = 2 * pi * seed();
  for (int i = 0; i < N; i++) {
    const int l = L[i], m = M[i], a = m < 0 ? -m : m;
    const double Pl = l == 0 ? 1 : l == 1 ? (a ? s : x) : l == 2 ? (a == 0 ? 0.5 * (3 * x * x - 1) : a == 1 ? 3 * x * s : 3 * s * s)
      : (a == 0 ? 0.5 * x * (5 * x * x - 3) : a == 1 ? 1.5 * (5 * x * x - 1) * s : a == 2 ? 15 * x * s * s : 15 * s * s * s);
    const double ang = m > 0 ? std::numbers::sqrt2 * fd::cos(m * phi0) : m < 0 ? std::numbers::sqrt2 * fd::sin(a * phi0) : 1;
    const double norm = std::sqrt((2 * l + 1) * FACT[l - a] / FACT[l + a]);
    const double size = dscuti ? F * AS[i] : F * std::sqrt(Pw[i] * (1 - Z[i]));
    addC(i, 0, -size * norm * Pl * ang);
  }
}

// ---- the hot loop: free ringing with output gains ramping over the block, four modes at a time ----
static void ring(const double *A1, const double *A2, double *Y1, double *Y2, double *G, const double *GT, const int *idx, int na, double *buf, int n,
                 double glide) {
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
      buf[s] += g0 * x0 + g1 * x1 + g2 * x2 + g3 * x3;
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
    for (int s = 0; s < n; s++) { const double y = a1 * y1 - a2 * y2; buf[s] += g * y; y2 = y1; y1 = y; g += dg; }
    Y1[r] = y1; Y2[r] = y2; G[r] = g;
  }
}

void StarEngine::Voice::render(float *Lo, float *Ro, int n, StarEngine &eng) {
  double *buf = eng.buf.data();
  const double glide = 1 - fd::exp(-n / (GLIDE * eng.fs));
  const bool driving = held || eng.sustain;
  if (eng.freqMoved) { freqs(eng); coeffs(eng); }
  else if (eng.dampMoved) coeffs(eng);
  if (eng.inclMoved) gains(eng, false);
  if (dscuti) landau(eng, n, driving);
  else if (driving) {
    // the convection: one random push per mode per block, a force impulse of variance p·D²·(1 − ρ^2n)
    const double D = eng.S[kDriving] * vel * pressure;
    const double *tab = eng.gauss.data();
    uint32_t st = eng.rs;
    for (int q = 0; q < nAct; q++) {
      const int i = idx[q];
      const double sd = D * std::sqrt(Pw[i] * (1 - fd::exp(-2 * ETA[i] * n / eng.fs)));
      st ^= st << 13; st ^= st >> 17; st ^= st << 5;
      Y2[i] += (sd * tab[st & (GN - 1)] * S[i]) / RHO[i];
    }
    eng.rs = st;
  }
  std::fill(buf, buf + n, 0.0);
  ring(A1.data(), A2.data(), Y1.data(), Y2.data(), G.data(), GT.data(), idx.data(), nAct, buf, n, glide);
  if (nAct < N) for (int i = 0; i < N; i++) if (!act[i]) G[i] += glide * (GT[i] - G[i]);
  const double fadeStep = fading ? 1 / (FADE * eng.fs) : 0;
  double f = fade;
  for (int s = 0; s < n; s++) {
    const double y = buf[s] * f;
    if (fadeStep) { f -= fadeStep; if (f < 0) f = 0; }
    Lo[s] += gl * y; Ro[s] += gr * y;
  }
  fade = f;
  if (fading && f <= 0) dead = true;
  age += n / eng.fs;
  // every block: the power of each mode (for the views, pruning and the voice's level)
  double sum = 0;
  for (int q = 0; q < nAct; q++) {
    const int i = idx[q];
    const double a2 = amp2(i), t = eng.gtab[L[i] * 7 + M[i] + 3], g2 = t * t;
    AMP[i] = a2; sum += g2 * a2;
  }
  level = 0.5 * sum;
  if (level > peak) peak = level;
  if (!driving && !dscuti && age > YOUNG) {
    bool changed = false;
    const double floor = PRUNE * peak;
    for (int q = 0; q < nAct; q++) {
      const int i = idx[q];
      if (VIS[L[i]] * AMP[i] < floor) { act[i] = 0; AMP[i] = 0; Y1[i] = 0; Y2[i] = 0; changed = true; }
    }
    if (changed) compact();
    if (!nAct || level < DEAD * peak) dead = true;
  }
  if (dscuti && !driving && level < DEAD * peak && age > YOUNG) dead = true;
  if (!(sum < 1e9)) {
    dead = true;
    Message m;
    m.type = msg::error; m.key = (int16_t)key;
    eng.post(m);
  }
}

// δ Scuti: dA/dt = (γ − βA²)A while the key is down; on release the modes damp at the release rate.
// One step per block on the recursion's own decay.
void StarEngine::Voice::landau(const StarEngine &eng, int n, bool driving) {
  (void)n;
  const double gam = 1 / eng.S[kGrowth], rel = 2 * eng.S[kDamping], fs = eng.fs;
  for (int q = 0; q < nAct; q++) {
    const int i = idx[q];
    const double as = AS[i];
    double lam;
    if (driving) { const double at = as * vel * pressure * eng.S[kDriving], a2 = amp2(i); lam = gam * (1 - a2 / (at * at + 1e-30)); }
    else lam = -rel;
    lam = jsMax(-200, jsMin(200, lam));
    const double r = fd::exp(lam / fs), old = RHO[i] != 0 && RHO[i] == RHO[i] ? RHO[i] : 1;
    Y2[i] *= old / r; // keep C unchanged under the new ρ: y2 holds Re(C e^(−iω))/ρ
    RHO[i] = r; A1[i] = 2 * r * C[i]; A2[i] = r * r;
  }
}

// ---- the engine ------------------------------------------------------------------------------------

StarEngine::StarEngine(double fs)
    : Engine(fs), data([this](int key, uint64_t v) -> std::unique_ptr<Star> {
        if (key < KEY_LO || key > KEY_HI) return nullptr;
        // the knobs of that version (a snapshot the audio thread may be rewriting: check)
        for (Snapshot &s : snapshots) {
          if (s.version.load(std::memory_order_acquire) != v) continue;
          StarParams sp;
          sp.family = (int)s.family.load(std::memory_order_relaxed);
          sp.mass = s.mass.load(std::memory_order_relaxed);
          sp.speedup = s.speedup.load(std::memory_order_relaxed);
          std::atomic_thread_fence(std::memory_order_acquire);
          if (s.version.load(std::memory_order_relaxed) != v) return nullptr;
          return std::make_unique<Star>(keyStar(key, sp));
        }
        return nullptr;
      }) {
  // Gaussian numbers (Box–Muller from a seeded generator), unit variance exactly
  Rng r(20240611);
  for (int i = 0; i < GN; i += 2) {
    const double a = std::sqrt(-2 * fd::log(1 - r()));
    const double b = 2 * pi * r();
    gauss[i] = a * fd::cos(b); gauss[i + 1] = a * fd::sin(b);
  }
  double m = 0;
  for (double g : gauss) m += g * g;
  m = std::sqrt(m / GN);
  for (double &g : gauss) g /= m;
  // the warm-up's made-up stars
  for (int k = 0; k < 2; k++) {
    auto d = std::make_unique<Star>();
    d->resize(24);
    d->key = 60; d->K = 5e5; d->dscuti = k == 1;
    for (int i = 0; i < 24; i++) { d->f[i] = 300 + 13 * i; d->l[i] = (int8_t)(i % 2); d->p[i] = 1.0 / 24; d->gamma[i] = 0.5; d->wEnv[i] = 1; d->asat[i] = 0.2; }
    warm[k] = std::move(d);
  }
  offered.resize(MAX_MODES); offered.N = 0;
}

bool StarEngine::offer(const double *a, int n) {
#if FORTE_THREADS
  (void)a; (void)n;
  return false;
#else
  if (n < 4) return false;
  const int key = (int)a[0], N = (int)a[3];
  if (key < KEY_LO || key > KEY_HI || N < 1 || N > MAX_MODES || n < 4 + 10 * N) return false;
  Star &d = offered;
  d.key = key; d.K = a[1]; d.dscuti = a[2] != 0; d.N = N;
  const double *x = a + 4;
  for (int i = 0; i < N; i++) {
    d.f[i] = x[i]; d.l[i] = (int8_t)x[N + i]; d.m[i] = (int8_t)x[2 * N + i]; d.zeta[i] = x[3 * N + i]; d.p[i] = x[4 * N + i];
    d.gamma[i] = x[5 * N + i]; d.wEnv[i] = x[6 * N + i]; d.wCore[i] = x[7 * N + i]; d.asat[i] = x[8 * N + i]; d.mult[i] = (int)x[9 * N + i];
  }
  hasOffer = true;
  return true;
#endif
}

void StarEngine::setParams(const double *np) {
  const bool first = !hasParams;
  for (int i = 0; i < p::count; i++) P[i] = np[i];
  hasParams = true;
  T = {P[p::spin], P[p::coreRatio], P[p::incl], P[p::damping], P[p::driving], P[p::flare], P[p::growth]};
  // a new version of every key's star: built off the audio thread, nearest the last key first
  const uint64_t v = versionOf(P.data());
  if (first || v != version) {
    if (v != version) {
      if (!first) generation++;
      version = v;
      snapAt = (snapAt + 1) % (int)snapshots.size();
      Snapshot &s = snapshots[snapAt];
      s.version.store(0, std::memory_order_relaxed);
      std::atomic_thread_fence(std::memory_order_release);
      s.family.store(P[p::family], std::memory_order_relaxed);
      s.mass.store(P[p::mass], std::memory_order_relaxed);
      s.speedup.store(P[p::speedup], std::memory_order_relaxed);
      s.version.store(version, std::memory_order_release);
    }
    data.prepare(version, KEY_LO, KEY_HI, focus ? focus->key : 60);
  }
  if (first) { S = T; table(); warmUp(); }
}

void StarEngine::table() {
  const double inc = (S[kIncl] * pi) / 180;
  for (int l = 0; l <= 3; l++) for (int m = -l; m <= l; m++) gtab[l * 7 + m + 3] = std::sqrt(VIS[l] * Elm(l, m, inc));
}

// Before the first note: a small made-up star through every path (driving, the flare, release, the
// pedal, gliding knobs, pruning, fading). The JavaScript engine did this to warm its JIT; it is
// kept because it advances the seeded generators, and so fixes the random numbers the stars draw.
void StarEngine::warmUp() {
  float bL[128], bR[128];
  SpscQueue<Message> *q = messages;
  messages = nullptr;
  const auto keep = T;
  for (int i = 0; i < 300; i++) {
    if (i == 0) startNote(60, 0.8, *warm[0], WARM_TRACK);
    if (i == 20) startNote(62, 0.8, *warm[1], WARM_DSCUTI);
    if (i == 60) { noteOff(60, -1); noteOff(62, -1); }
    if (i == 70) setSustain(true);
    if (i == 80) {
      setSustain(false);
      T[kSpin] = keep[kSpin] + 1; T[kDamping] = keep[kDamping] * 1.5; T[kIncl] = std::fmod(keep[kIncl] + 30, 90); T[kDriving] = keep[kDriving] + 0.1;
    }
    if (i == 120) T = keep;
    if (i == 200) allNotesOff();
    process(bL, bR, 128);
  }
  for (Voice &v : pool) v.inUse = false;
  nVoices = 0; byKey.fill(nullptr); focus = nullptr; sustain = false;
  S = keep; T = keep; table(); messages = q; presses = 0;
}

void StarEngine::noteOn(int key, double velocity) {
  if (!hasParams || !(key >= KEY_LO && key <= KEY_HI) || !(velocity > 0)) return;
#if !FORTE_THREADS
  if (hasOffer) {
    hasOffer = false;
    if (offered.key == key) { startNote(key, velocity, offered, version); return; }
  }
#endif
  if (const Data::Ref r = data.get(key, version)) { startNote(key, velocity, *r.data, version); return; }
  // the star is being built (a few ms): the note waits for it
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) { pending[i] = {key, velocity, false}; return; }
  if (nPending < (int)pending.size()) pending[nPending++] = {key, velocity, false};
}

void StarEngine::retryPending() {
  int j = 0;
  for (int i = 0; i < nPending; i++) {
    const Pending pd = pending[i];
    const Data::Ref r = data.get(pd.key, version);
    if (!r) { pending[j++] = pd; continue; }
    startNote(pd.key, pd.velocity, *r.data, version);
    if (pd.off) noteOff(pd.key, -1);
  }
  nPending = j;
}

void StarEngine::startNote(int key, double velocity, const Star &d, uint64_t id) {
  Voice *v = byKey[key];
  if (!v || v->dead || v->fading || v->id != id) {
    if (v && !v->dead) v->fading = true; // another star now sits on this key: the old one fades
    if (d.N > MAX_MODES || nVoices >= POOL) return;
    Voice *free = nullptr;
    for (Voice &u : pool) if (!u.inUse) { free = &u; break; }
    if (!free) return; // every voice busy (beyond anything the stealing below lets happen)
    v = free;
    v->start(*this, key, d, id);
    v->gen = generation;
    voices[nVoices++] = v; byKey[key] = v;
  }
  v->press(*this, velocity);
  focus = v; postT = POST_EVERY; // post its amplitudes soon
  int live = 0;
  for (int i = 0; i < nVoices; i++) if (!voices[i]->fading) live++;
  if (live > MAX_VOICES) {
    Voice *victim = nullptr;
    double score = INFINITY;
    for (int i = 0; i < nVoices; i++) {
      Voice *u = voices[i];
      if (u == v || u->fading || u->age < YOUNG) continue;
      const double s = u->level * (u->held ? 4 : 1); // released stars go first
      if (s < score) { score = s; victim = u; }
    }
    if (victim) victim->fading = true;
  }
}

void StarEngine::noteOff(int key, double) {
  if (key < 0 || key > 127) return;
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) pending[i].off = true;
  if (Voice *v = byKey[key]) v->held = false;
}

void StarEngine::allNotesOff() {
  nPending = 0;
  for (int i = 0; i < nVoices; i++) { voices[i]->fading = true; voices[i]->held = false; }
}

// aftertouch: the convection drives harder, up to twice the amplitude
void StarEngine::pressure(double value, int key) {
  const double pr = 1 + jsMax(0, jsMin(1, value));
  for (int i = 0; i < nVoices; i++) if (key < 0 || voices[i]->key == key) voices[i]->pressure = pr;
}

void StarEngine::process(float *L, float *R, int n) {
  for (int at = 0; at < n; at += BLOCK_MAX) processBlock(L + at, R + at, std::min(BLOCK_MAX, n - at));
  data.audioCycle();
}

void StarEngine::processBlock(float *L, float *R, int n) {
  std::fill(L, L + n, 0.0f); std::fill(R, R + n, 0.0f);
  if (!hasParams) return;
  if (nPending) retryPending();
  const double a = 1 - fd::exp(-n / (GLIDE * fs));
  bool freq = false, damp = false, incl = false;
  for (int id = 0; id < kCount; id++) {
    if (S[id] == T[id]) continue;
    S[id] += a * (T[id] - S[id]);
    if (std::fabs(T[id] - S[id]) < 1e-6 * (std::fabs(T[id]) + 1e-6)) S[id] = T[id];
    if (id == kSpin || id == kCore) freq = true; else if (id == kDamping) damp = true; else if (id == kIncl) incl = true;
  }
  if (incl) table();
  freqMoved = freq; dampMoved = damp; inclMoved = incl;
  for (int i = 0; i < nVoices; i++) voices[i]->render(L, R, n, *this);
  freqMoved = dampMoved = inclMoved = false;
  int j = 0;
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    if (v->dead) {
      if (byKey[v->key] == v) byKey[v->key] = nullptr;
      if (focus == v) focus = nullptr;
      v->inUse = false; // the voice keeps its fields (dead) until it is reused
    } else voices[j++] = v;
  }
  nVoices = j;
  postT += n / fs;
  if (messages && focus && postT >= POST_EVERY) { postT = 0; postFocus(); }
}

// the focus star's mode amplitudes, observed (√(V_l² E_lm)·|C|), for the échelle, spectrum and sphere:
// in parts of 30, then the summary
void StarEngine::postFocus() {
  const Voice &v = *focus;
  for (int i = 0; i < v.N; i++) ampOut[i] = v.act[i] ? (float)(gtab[v.L[i] * 7 + v.M[i] + 3] * std::sqrt(v.AMP[i])) : 0.0f;
  Message m;
  m.type = msg::ampsPart;
  for (int at = 0; at < v.N; at += 30) {
    m.key = (int16_t)at; m.count = (uint16_t)std::min(30, v.N - at);
    for (int k = 0; k < m.count; k++) m.values[k] = ampOut[at + k];
    post(m);
  }
  m.type = msg::amps; m.key = (int16_t)v.key; m.count = 4;
  m.values[0] = (float)v.N; m.values[1] = (float)(S[kDriving] * v.vel * v.pressure); m.values[2] = v.held || sustain ? 1.0f : 0.0f;
  m.values[3] = (float)(v.gen & 0xffffff);
  post(m);
}

} // namespace forte::stars
