// piano-engine.cpp — the Ribbon Piano's engine (piano-engine.h).

#include "piano-engine.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace forte::piano {

constexpr double TWO_PI = 2 * PI;
constexpr double OUT_SCALE = 24;  // bridge velocity → full-scale audio
constexpr double SMOOTH_T = 0.01; // s: one-pole glide of live gains and pan (no zipper noise)
constexpr double KILL_SIGMA = 250;

// ---- a voice: one key's strings --------------------------------------------------------------

void PianoEngine::Voice::start(PianoEngine &eng, int key_, const VoiceData &d, int at_) {
  *this = Voice{};
  inUse = true;
  k = eng.k; key = key_; version = d.version; N = d.n; at = at_;
  const int nu = d.unisons > 0 ? d.unisons : 1;
  const double una = nu > 1 ? (double)nu / (nu - 1) : 1;
  double *base = eng.arena.data() + (size_t)at * ARRAYS;
  double **arrays[ARRAYS] = {&q, &q1, &a1, &a2, &a1d, &a2d, &wN, &bwN, &wU, &bwU, &fbv, &fbh, &cvk, &chk, &ctk, &om, &sig, &perm, &gw, &eps, &us};
  for (int a = 0; a < ARRAYS; a++) { *arrays[a] = base + (size_t)a * N; std::fill(*arrays[a], *arrays[a] + N, 0.0); }

  // order modes by segment, and within one by string; perm[i] = index in the incoming data
  auto seg = [&](int j) { return d.ct[j] != 0 ? 3 : d.cv[j] != 0 && d.ch[j] != 0 ? 2 : d.ch[j] != 0 ? 1 : 0; };
  int ends[4] = {0, 0, 0, 0}, at2 = 0;
  for (int s = 0; s < 4; s++) {
    for (int u = 0; u < nu; u++) {
      run[s][u] = at2;
      for (int j = 0; j < N; j++) if (seg(j) == s && d.uni[j] == u) perm[at2++] = j;
    }
    run[s][nu] = at2;
    ends[s] = at2;
  }
  e0 = ends[0]; e1 = ends[1]; e2 = ends[2];

  double cmp = 0, cmpU = 0;
  for (int i = 0; i < N; i++) {
    const int j = (int)perm[i];
    const double w0 = TWO_PI * d.freq[j];
    // The bridge feeds back the previous sample's bridge velocity through the impulse-invariant
    // gain b, which damps each mode by only r·sinc(ωk)·c²/2. The shortfall goes into the mode's
    // own, exactly discretised decay, so its bridge loss is c²/2 at every frequency.
    const double c2 = d.cv[j] * d.cv[j] + d.ch[j] * d.ch[j];
    const double r0 = std::exp(-d.sigma[j] * k), th = std::sqrt(std::max(w0 * w0 - std::pow(d.sigma[j], 2), 1e-6)) * k;
    const double sg = d.sigma[j] + 0.5 * c2 * (1 - (r0 * std::sin(th)) / th);
    om[i] = w0; sig[i] = sg;
    const double r = std::exp(-sg * k);
    const double od = std::sqrt(std::max(w0 * w0 - sg * sg, 1e-6));
    a1[i] = 2 * r * std::cos(od * k);
    a2[i] = r * r;
    const double b = (k * r * std::sin(od * k)) / od; // impulse-invariant input gain
    wN[i] = d.w[j];
    bwN[i] = b * d.w[j];
    cmp += b * d.w[j] * d.w[j];
    // una corda: the last string of the unison is missed, the others share the blow
    const double wu = nu > 1 && d.uni[j] == nu - 1 ? 0 : d.w[j] * una;
    wU[i] = wu;
    bwU[i] = b * wu;
    cmpU += b * wu * wu;
    fbv[i] = b * d.cv[j];
    fbh[i] = b * d.ch[j];
    cvk[i] = d.cv[j] / k;
    chk[i] = d.ch[j] / k;
    ctk[i] = d.ct[j] / k;
    // a tension change δT adds g·δT to ω²: to first order a1 falls by b·g·δT
    gw[i] = d.g[j]; eps[i] = b * d.g[j]; us[i] = d.uni[j];
  }
  kcGain = d.kc; Tt = d.T; this->nu = nu;
  compN = cmp; compU = cmpU;
  hammer = {d.hammer.mass, d.hammer.K, d.hammer.p, d.hammer.alpha};
  // the felt touches one string fewer, so its contact stiffness drops by (ν−1)/ν
  KU = d.hammer.K / una;
  w = wN; bw = bwN; comp = cmp; hK = d.hammer.K;
  outV = d.outV * OUT_SCALE;
  outH = d.outH * OUT_SCALE;
  hasDamper = d.hasDamper;
  damperSigma = eng.P[p::damper];
  computeDamped();
  setPan(eng, true);
}

void PianoEngine::Voice::computeDamped() {
  const double extra = killing ? KILL_SIGMA : damperSigma;
  for (int i = 0; i < N; i++) {
    const double s = sig[i] + extra, o = om[i];
    const double r = std::exp(-s * k);
    const double od = std::sqrt(std::max(o * o - s * s, 1e-6));
    a1d[i] = 2 * r * std::cos(od * k);
    a2d[i] = r * r;
  }
}

// A new voice starts at its pan; a width change glides there (see render).
void PianoEngine::Voice::setPan(const PianoEngine &eng, bool snap) {
  const double x = std::max(-1.0, std::min(1.0, ((key - 64.5) / 43.5) * eng.P[p::width]));
  const double ang = ((x + 1) * PI) / 4;
  tPanL = std::cos(ang) * std::numbers::sqrt2;
  tPanR = std::sin(ang) * std::numbers::sqrt2;
  if (snap) { panL = tPanL; panR = tPanR; }
  panMoving = panL != tPanL || panR != tPanR;
}

void PianoEngine::Voice::updateDamping(const PianoEngine &eng) {
  damped = killing || (!keyDown && !eng.sustain && hasDamper);
}

void PianoEngine::Voice::kill() {
  if (killing) return;
  killing = true;
  computeDamped();
  damped = true;
}

// Launch the hammer at the string's current position (works for re-strikes). unaCorda: the
// shifted action strikes one string fewer.
void PianoEngine::Voice::strike(double v, bool unaCorda) {
  const bool una = unaCorda && KU != hammer.K;
  w = una ? wU : wN;
  bw = una ? bwU : bwN;
  comp = una ? compU : compN;
  hK = una ? KU : hammer.K;
  double u = 0;
  for (int i = 0; i < N; i++) u += w[i] * q[i];
  eta = u - 1.5 * v * k;
  etaPrev = eta - v * k;
  dPrev = -1;
  hammerOn = true;
  stretched = true;
  hammerSamples = 0;
  contact = false;
  contactSamples = 0;
  Fmax = 0;
  kOverM = (k * k) / hammer.mass;
  alphaK = hammer.alpha / k;
}

// Solve D + C·F(D) = dFree for the felt compression D one step ahead.
double PianoEngine::Voice::contactForce(double dFree) {
  const double pe = hammer.p, K = hK, a = alphaK;
  const double C = comp + kOverM;
  const double dp = dPrev > 0 ? std::pow(dPrev, pe) : 0;
  if (dFree <= 0) { dPrev = dFree; return 0; }
  double lo = 0, hi = dFree, D = dFree;
  for (int it = 0; it < 50; it++) {
    const double Dp = std::pow(D, pe);
    const double fr = (1 + a) * Dp - a * dp;
    const double g = D + C * (fr > 0 ? K * fr : 0) - dFree;
    if (std::fabs(g) <= 1e-12 * dFree) break;
    if (g > 0) hi = D; else lo = D;
    const double dg = 1 + (fr > 0 && D > 0 ? (C * K * (1 + a) * pe * Dp) / D : 0);
    double Dn = D - g / dg;
    if (!(Dn > lo && Dn < hi)) Dn = 0.5 * (lo + hi);
    D = Dn;
  }
  const double fr = (1 + a) * std::pow(D, pe) - a * dp;
  dPrev = D;
  return fr > 0 ? K * fr : 0;
}

// Add n samples to L, R. eng.gV/gH/gT hold the (smoothed) output gains for these samples.
void PianoEngine::Voice::render(float *L, float *R, int n, PianoEngine &eng) {
  // qa holds q[n], qb q[n−1]; each step writes q[n+1] over q[n−1], then they swap
  double *qa = q, *qb = q1;
  const double *A1 = damped ? a1d : a1, *A2 = damped ? a2d : a2;
  const double *FBV = fbv, *FBH = fbh, *CV = cvk, *CH = chk, *CT = ctk;
  const double *GV = eng.gV.data(), *GH = eng.gH.data(), *GT = eng.gT.data();
  const double oV = outV, oH = outH;
  double pl = panL, pr = panR;
  const bool moving = panMoving;
  const double tl = tPanL, tr = tPanR, aS = eng.aSm;
  double svl = sv, shl = sh, pk = 0;
  // once the stretch has decayed below a hundredth of a cent (δT/T < 1e-5) it only shrinks, so
  // the voice runs linear until it is struck again
  const bool kc = eng.P[p::kc] != 0 && kcGain > 0 && stretched;
  const double *G = gw, *EPS = eps, *US = us;
  // δT is held below T/10: the first-order a₁ (slope θ sin θ, θ = ωk) then stays stable up to 0.45 fs
  const double kcG = kcGain, dTmax = 0.1 * Tt, dTmin = 1e-5 * Tt;
  if (!kc) dT[0] = dT[1] = dT[2] = 0;
  for (int s = 0; s < n; s++) {
    double nsv = 0, nsh = 0, nst = 0;
    if (!hammerOn && kc) {
      // tension modulation (Kirchhoff–Carrier): each string's tension follows its stretch,
      // δT = kc·Σ g q² over its bending modes, and moves every one of their frequencies. Each run
      // of one string's modes steps with that string's δT and sums its next stretch.
      double Q[3] = {0, 0, 0};
      for (int u = 0; u < nu; u++) {
        const double t = dT[u];
        double Qu = 0;
        for (int i = run[0][u]; i < run[0][u + 1]; i++) {
          const double q0 = qa[i], qn = (A1[i] - EPS[i] * t) * q0 - A2[i] * qb[i] - FBV[i] * svl;
          qb[i] = qn;
          nsv += CV[i] * (qn - q0); Qu += G[i] * qn * qn;
        }
        for (int i = run[1][u]; i < run[1][u + 1]; i++) {
          const double q0 = qa[i], qn = (A1[i] - EPS[i] * t) * q0 - A2[i] * qb[i] - FBH[i] * shl;
          qb[i] = qn;
          nsh += CH[i] * (qn - q0); Qu += G[i] * qn * qn;
        }
        for (int i = run[2][u]; i < run[2][u + 1]; i++) {
          const double q0 = qa[i], qn = (A1[i] - EPS[i] * t) * q0 - A2[i] * qb[i] - FBV[i] * svl - FBH[i] * shl;
          qb[i] = qn;
          const double dq = qn - q0;
          nsv += CV[i] * dq; nsh += CH[i] * dq; Qu += G[i] * qn * qn;
        }
        Q[u] = Qu;
      }
      double most = 0;
      for (int u = 0; u < nu; u++) { dT[u] = std::min(kcG * Q[u], dTmax); most = std::max(most, dT[u]); }
      if (most < dTmin) stretched = false; // from the next block
      for (int i = e2; i < N; i++) {
        const double q0 = qa[i], qn = A1[i] * q0 - A2[i] * qb[i];
        qb[i] = qn;
        nst += CT[i] * (qn - q0);
      }
    } else if (!hammerOn) {
      for (int i = 0; i < e0; i++) {
        const double q0 = qa[i], qn = A1[i] * q0 - A2[i] * qb[i] - FBV[i] * svl;
        qb[i] = qn;
        nsv += CV[i] * (qn - q0);
      }
      for (int i = e0; i < e1; i++) {
        const double q0 = qa[i], qn = A1[i] * q0 - A2[i] * qb[i] - FBH[i] * shl;
        qb[i] = qn;
        nsh += CH[i] * (qn - q0);
      }
      for (int i = e1; i < e2; i++) {
        const double q0 = qa[i], qn = A1[i] * q0 - A2[i] * qb[i] - FBV[i] * svl - FBH[i] * shl;
        qb[i] = qn;
        const double dq = qn - q0;
        nsv += CV[i] * dq; nsh += CH[i] * dq;
      }
      for (int i = e2; i < N; i++) {
        const double q0 = qa[i], qn = A1[i] * q0 - A2[i] * qb[i];
        qb[i] = qn;
        nst += CT[i] * (qn - q0);
      }
    } else {
      const double *W = w, *BW = bw;
      double uf = 0;
      for (int i = 0; i < N; i++) {
        const double a1 = kc ? A1[i] - EPS[i] * dT[(int)US[i]] : A1[i];
        const double qn = a1 * qa[i] - A2[i] * qb[i] - FBV[i] * svl - FBH[i] * shl;
        qb[i] = qn;
        uf += W[i] * qn;
      }
      const double etaF = 2 * eta - etaPrev;
      const double F = contactForce(etaF - uf);
      etaPrev = eta;
      eta = etaF - kOverM * F;
      if (F > 0) {
        for (int i = 0; i < N; i++) qb[i] += BW[i] * F;
        contact = true;
        contactSamples++;
        if (F > Fmax) Fmax = F;
      }
      for (int i = 0; i < N; i++) {
        const double dq = qb[i] - qa[i];
        nsv += CV[i] * dq; nsh += CH[i] * dq; nst += CT[i] * dq;
      }
      if (kc) {
        double Q[3] = {0, 0, 0};
        for (int i = 0; i < e2; i++) Q[(int)US[i]] += G[i] * qb[i] * qb[i];
        for (int u = 0; u < nu; u++) dT[u] = std::min(kcG * Q[u], dTmax);
      }
      hammerSamples++;
      if (hammerSamples > eng.hammerMaxSamples || (contact && F == 0 && dPrev < -2e-3)) {
        hammerOn = false;
        Message m;
        m.type = msg::hammer; m.key = (int16_t)key; m.count = 2;
        m.values[0] = (float)((contactSamples / eng.fs) * 1000); m.values[1] = (float)Fmax;
        eng.post(m);
      }
    }
    double *t = qa; qa = qb; qb = t;
    svl = nsv; shl = nsh;
    const double y = oV * (GV[s] * nsv + GT[s] * nst) + oH * GH[s] * nsh;
    if (moving) { pl += (tl - pl) * aS; pr += (tr - pr) * aS; }
    L[s] += pl * y;
    R[s] += pr * y;
    const double ay = y < 0 ? -y : y;
    if (ay > pk) pk = ay;
  }
  q = qa; q1 = qb;
  sv = svl; sh = shl;
  if (moving) {
    if (std::fabs(tl - pl) + std::fabs(tr - pr) < 1e-7) { pl = tl; pr = tr; panMoving = false; }
    panL = pl; panR = pr;
  }
  peak = pk;
  age += n;
  if (!(pk < 1e3)) { // NaN or blow-up: silence this voice
    dead = true;
    Message m;
    m.type = msg::error; m.key = (int16_t)key;
    eng.post(m);
    return;
  }
  if (!hammerOn) {
    const double thr = damped ? 1e-4 : 1e-5;
    quiet = pk < thr ? quiet + 1 : 0;
    if (quiet > 30) dead = true;
  }
}

// Audible amplitude of every mode (incoming data order), for spectra.
void PianoEngine::Voice::modeAmplitudes(const PianoEngine &eng, double *out) const {
  const double gv = eng.P[p::gainV] * outV, gh = eng.P[p::gainH] * outH, gt = eng.P[p::gainT] * outV;
  for (int i = 0; i < N; i++) {
    const double vel = (q[i] - q1[i]) / k;
    const double a = std::hypot(vel, om[i] * q[i]);
    const double c = std::fabs(gv * cvk[i] * k) + std::fabs(gh * chk[i] * k) + std::fabs(gt * ctk[i] * k);
    out[(int)perm[i]] = a * c;
  }
}

// ---- the engine ------------------------------------------------------------------------------

PianoEngine::PianoEngine(double fs)
    : Engine(fs), k(1 / fs), hammerMaxSamples((int)std::round(0.08 * fs)), aSm(1 - std::exp(-1 / (SMOOTH_T * fs))),
      data([this](int key, uint64_t v) -> std::unique_ptr<VoiceData> {
        if (key < KEY_LO || key > KEY_HI) return nullptr;
        // the parameters of that version (a snapshot the audio thread may be rewriting: check)
        for (Snapshot &s : snapshots) {
          if (s.version.load(std::memory_order_acquire) != v) continue;
          std::array<double, p::count> Q;
          for (int i = 0; i < p::count; i++) Q[i] = s.P[i].load(std::memory_order_relaxed);
          std::atomic_thread_fence(std::memory_order_acquire);
          if (s.version.load(std::memory_order_relaxed) != v) return nullptr;
          const KeyModel m = computeKeyModel(key, Q.data(), this->fs);
          if (!m.ok) return nullptr;
          return std::make_unique<VoiceData>(buildVoiceData(m, Q.data(), v));
        }
        return nullptr;
      }),
      arena((size_t)ARENA * ARRAYS, 0.0) {
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def; // the defaults until told otherwise
  snapGains();
  version = modelVersion(P.data(), fs);
  Snapshot &s = snapshots[snapAt];
  for (int i = 0; i < p::count; i++) s.P[i].store(P[i], std::memory_order_relaxed);
  s.version.store(version, std::memory_order_release);
}

void PianoEngine::snapGains() { sV = P[p::gainV]; sH = P[p::gainH]; sT = P[p::gainT]; }

void PianoEngine::setParams(const double *np) {
  const bool first = !hasParams;
  const double oldDamper = P[p::damper];
  for (int i = 0; i < p::count; i++) P[i] = np[i];
  hasParams = true;
  if (P[p::damper] != oldDamper) for (int i = 0; i < nVoices; i++) voices[i]->setDamperSigma(P[p::damper]);
  for (int i = 0; i < nVoices; i++) voices[i]->setPan(*this);
  if (!nVoices) snapGains(); // nothing sounds: no need to glide
  // a new version of every key's strings: built off the audio thread, nearest the last key first
  const uint64_t v = modelVersion(P.data(), fs);
  if (first || v != version) {
    if (v != version) {
      version = v;
      snapAt = (snapAt + 1) % (int)snapshots.size();
      Snapshot &s = snapshots[snapAt];
      s.version.store(0, std::memory_order_relaxed);
      std::atomic_thread_fence(std::memory_order_release);
      for (int i = 0; i < p::count; i++) s.P[i].store(P[i], std::memory_order_relaxed);
      s.version.store(version, std::memory_order_release);
    }
    data.prepare(version, KEY_LO, KEY_HI, focus);
  }
}

bool PianoEngine::offer(const double *packed, int n) {
#if FORTE_THREADS
  (void)packed; (void)n;
  return false;
#else
  auto d = std::make_unique<VoiceData>();
  if (!unpackVoiceData(packed, n, *d) || d->key < 0 || d->key > 127) return false;
  const int key = d->key;
  sent[key] = std::move(d);
  return true;
#endif
}

double *PianoEngine::offerBuffer(int n) {
#if FORTE_THREADS
  (void)n;
  return nullptr;
#else
  if ((int)offered.size() < n) offered.resize(n);
  return offered.data();
#endif
}

// velocity: hammer speed in m/s (not 0..1). A sounding voice is struck again, unless the key's
// data has a new version (the model changed): then a new voice starts.
void PianoEngine::noteOn(int key, double velocity) {
  last = nullptr;
  if (key < 0 || key > 127) return;
  focus = key;
#if !FORTE_THREADS
  if (sent[key]) { strikeKey(key, velocity, *sent[key]); return; }
#endif
  if (const Data::Ref r = data.get(key, version)) { strikeKey(key, velocity, *r.data); return; }
  if (key < KEY_LO || key > KEY_HI) return;
  // the key is being built (a few ms): the note waits for it
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) { pending[i] = {key, velocity, false}; return; }
  if (nPending < (int)pending.size()) pending[nPending++] = {key, velocity, false};
}

void PianoEngine::retryPending() {
  int j = 0;
  for (int i = 0; i < nPending; i++) {
    const Pending pd = pending[i];
    const Data::Ref r = data.get(pd.key, version);
    if (!r) { pending[j++] = pd; continue; }
    strikeKey(pd.key, pd.velocity, *r.data);
    if (pd.off) noteOff(pd.key, -1);
  }
  nPending = j;
}

// A free block of n modes in the arena (first fit between the live voices' blocks), or −1.
int PianoEngine::allocate(int n) {
  std::array<std::pair<int, int>, POOL> used;
  int m = 0;
  for (const Voice &v : pool) if (v.inUse) used[m++] = {v.at, v.N};
  std::sort(used.begin(), used.begin() + m);
  int at = 0;
  for (int i = 0; i < m; i++) {
    if (used[i].first - at >= n) return at;
    at = std::max(at, used[i].first + used[i].second);
  }
  return ARENA - at >= n ? at : -1;
}

void PianoEngine::strikeKey(int key, double velocity, const VoiceData &d) {
  Voice *v = byKey[key];
  if (!v || v->dead || v->killing || v->version != d.version) {
    if (v && !v->dead) { v->keyDown = false; v->updateDamping(*this); }
    if (d.n > MAX_N || nVoices >= POOL) return;
    Voice *slot = nullptr;
    for (int i = 0; i < POOL && !slot; i++) { Voice &u = pool[(nextSlot + i) % POOL]; if (!u.inUse) { slot = &u; nextSlot = (nextSlot + i + 1) % POOL; } }
    const int at = slot ? allocate(d.n) : -1;
    if (at < 0) return; // every voice or the whole arena busy (beyond anything the budget lets happen)
    v = slot;
    v->start(*this, key, d, at);
    voices[nVoices++] = v;
    byKey[key] = v;
  }
  v->keyDown = true;
  v->updateDamping(*this);
  v->strike(velocity, P[p::unaCorda] != 0);
  enforceBudget(v);
  last = v;
}

void PianoEngine::noteOff(int key, double) {
  if (key < 0 || key > 127) return;
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) pending[i].off = true;
  if (Voice *v = byKey[key]) { v->keyDown = false; v->updateDamping(*this); }
}

void PianoEngine::setSustain(bool on) {
  sustain = on;
  for (int i = 0; i < nVoices; i++) voices[i]->updateDamping(*this);
}

void PianoEngine::allNotesOff() {
  nPending = 0;
  for (int i = 0; i < nVoices; i++) voices[i]->kill();
}

int PianoEngine::modeCount() const {
  int n = 0;
  for (int i = 0; i < nVoices; i++) n += voices[i]->N;
  return n;
}

// Over the oscillator budget: release the quietest voices. A voice whose hammer is still in flight
// has not been heard yet (its peak is 0), so it is never a victim; if only those remain, try again
// once they have sounded.
void PianoEngine::enforceBudget(const Voice *keep) {
  double total = 0;
  for (int i = 0; i < nVoices; i++) if (!voices[i]->killing) total += voices[i]->N;
  overBudget = false;
  while (total > maxModes) {
    Voice *victim = nullptr;
    double score = INFINITY;
    for (int i = 0; i < nVoices; i++) {
      Voice *v = voices[i];
      if (v == keep || v->killing || v->hammerOn || v->age == 0) continue;
      const double s = (v->peak * (v->damped ? 0.1 : 1)) / (1 + v->age * k);
      if (s < score) { score = s; victim = v; }
    }
    if (!victim) { overBudget = true; break; }
    victim->kill();
    total -= victim->N;
  }
}

void PianoEngine::process(float *L, float *R, int n) {
  std::fill(L, L + n, 0.0f);
  std::fill(R, R + n, 0.0f);
  if (nPending) retryPending();
  const double a = aSm;
  const double tV = P[p::gainV], tH = P[p::gainH], tT = P[p::gainT];
  for (int off = 0; off < n; off += MAXB) {
    const int m = std::min(MAXB, n - off);
    double gv = sV, gh = sH, gt = sT;
    for (int s = 0; s < m; s++) {
      gv += (tV - gv) * a; gh += (tH - gh) * a; gt += (tT - gt) * a;
      gV[s] = gv; gH[s] = gh; gT[s] = gt;
    }
    if (std::fabs(tV - gv) + std::fabs(tH - gh) + std::fabs(tT - gt) < 1e-9) { gv = tV; gh = tH; gt = tT; }
    sV = gv; sH = gh; sT = gt;
    for (int i = 0; i < nVoices; i++) if (!voices[i]->dead) voices[i]->render(L + off, R + off, m, *this);
  }
  if (overBudget) enforceBudget(nullptr);
  int j = 0;
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    if (v->dead) {
      if (byKey[v->key] == v) byKey[v->key] = nullptr;
      if (last == v) last = nullptr;
      v->inUse = false; // the voice keeps its fields (dead) until it is reused
    } else voices[j++] = v;
  }
  nVoices = j;
  data.audioCycle();
}

} // namespace forte::piano
