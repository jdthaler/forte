// tines-engine.cpp — the tine piano's engine (tines-engine.h).

#include "tines-engine.h"

#include <algorithm>
#include <cmath>

namespace forte::tines {

constexpr double TAU = 2 * PI;
constexpr double OUT_SCALE = 3.6e-4;
constexpr double SMOOTH_T = 0.01; // s: glide of the output-stage controls
// A pickup being moved glides through two one-poles of this time constant, so it starts and stops
// moving smoothly: the flux change through the coil is heard as a soft thump, not a click.
constexpr double PICKUP_T = 0.01;
constexpr double BEND_T = 0.02; // s: the pitch wheel's glide

void TinesEngine::Biquad::set(bool lowpass, double f, double Q, double fs) {
  const double w = (TAU * std::min(f, 0.45 * fs)) / fs, c = std::cos(w), al = std::sin(w) / (2 * Q), a0 = 1 + al;
  if (lowpass) { b0 = (1 - c) / 2 / a0; b1 = (1 - c) / a0; b2 = b0; }
  else { b0 = (1 + c) / 2 / a0; b1 = -(1 + c) / a0; b2 = b0; }
  a1 = (-2 * c) / a0; a2 = (1 - al) / a0;
}

// harp: ~1 H of pickup coils against the cable capacitance → resonant low-pass
static double harpHz(double cablePF) { return 1 / (TAU * std::sqrt(1.0 * cablePF * 1e-12)); }

// ---- a voice: one key's fork -----------------------------------------------------------------

void TinesEngine::Voice::start(TinesEngine &eng, int key_, const VoiceData &d) {
  *this = Voice{};
  inUse = true;
  N = std::min(d.n, MAX_MODES);
  k = 1 / eng.fs2; key = key_; version = d.version;
  for (int i = 0; i < N; i++) {
    om0[i] = TAU * d.freq[i]; sig[i] = d.sigma[i]; dw[i] = d.dampW[i];
    w[i] = d.w[i]; pk[i] = d.pk[i];
  }
  tune(eng.bendNow);
  hammer = d.hammer;
  // the engine's own pickup settings win over the (possibly cached) voice data
  const Pickup pu = pickupFor(key, eng.P.data());
  wid = wid1 = tWid = pu.wid; yoff = yoff1 = tYoff = pu.yoff; gain = gain1 = tGain = pu.gain;
  pickupMoving = false;
  phiPrev = flux(yoff);
  hasDamper = d.hasDamper;
  keyDown = true; damped = false; killing = false; dead = false;
  hammerOn = false; contactSamples = 0; Fmax = 0; peak = 0; quiet = 0; age = 0;
  yMin = 0; yMax = 0;
  setDamper(eng.P[p::damper]);
}

void TinesEngine::Voice::tune(double r) {
  double cmp = 0;
  for (int i = 0; i < N; i++) {
    const double o = om0[i] * r, s = sig[i];
    om[i] = o;
    const double rr = std::exp(-s * k), od = std::sqrt(std::max(o * o - s * s, 1e-6));
    a1[i] = 2 * rr * std::cos(od * k); a2[i] = rr * rr;
    const double b = (k * rr * std::sin(od * k)) / od;
    bw[i] = b * w[i]; cmp += b * w[i] * w[i];
  }
  comp = cmp; bend = r;
}

// move the pickup (gap / voicing / pole) under a sounding note: glide there
void TinesEngine::Voice::retargetPickup(const Pickup &pu) {
  tWid = pu.wid; tYoff = pu.yoff; tGain = pu.gain;
  pickupMoving = tWid != wid || tYoff != yoff || tGain != gain;
}

void TinesEngine::Voice::setDamper(double sd) {
  for (int i = 0; i < N; i++) {
    const double s = sig[i] + (killing ? 300 : sd * dw[i]), o = om[i];
    const double r = std::exp(-s * k), od = std::sqrt(std::max(o * o - s * s, 1e-6));
    a1d[i] = 2 * r * std::cos(od * k); a2d[i] = r * r;
  }
  damperSigma = sd;
}

void TinesEngine::Voice::strike(double v) {
  double u = 0;
  for (int i = 0; i < N; i++) u += w[i] * q[i];
  eta = u - 1.5 * v * k; etaPrev = eta - v * k;
  dPrev = -1; hammerOn = true; hammerSamples = 0; contact = false;
  contactSamples = 0; Fmax = 0;
  kOverM = (k * k) / hammer.mass;
  alphaK = hammer.alpha / k;
  yMin = INFINITY; yMax = -INFINITY;
}

// Solve D + C·F(D) = dFree for the tip's compression D one step ahead.
double TinesEngine::Voice::contactForce(double dFree) {
  const double pe = hammer.p, K = hammer.K, a = alphaK, C = comp + kOverM;
  const double dp = dPrev > 0 ? std::pow(dPrev, pe) : 0;
  if (dFree <= 0) { dPrev = dFree; return 0; }
  double lo = 0, hi = dFree, D = dFree;
  for (int it = 0; it < 50; it++) {
    const double Dp = std::pow(D, pe), fr = (1 + a) * Dp - a * dp;
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

void TinesEngine::Voice::render(double *buf, int n, TinesEngine &eng) {
  const double *A1 = damped ? a1d.data() : a1.data(), *A2 = damped ? a2d.data() : a2.data();
  const double gs = OUT_SCALE * eng.fs2, aP = eng.aPick;
  const bool moving = pickupMoving;
  double wid_ = wid, yoff_ = yoff, gain_ = gain, wid1_ = wid1, yoff1_ = yoff1, gain1_ = gain1;
  double g = gain_ * gs, iw2 = 1 / (wid_ * wid_);
  double phiP = phiPrev, pkMax = 0, yLo = yMin, yHi = yMax;
  for (int s = 0; s < n; s++) {
    double y = 0;
    if (!hammerOn) {
      for (int i = 0; i < N; i++) {
        const double q0 = q[i], qn = A1[i] * q0 - A2[i] * q1[i];
        q1[i] = q0; q[i] = qn; y += pk[i] * qn;
      }
    } else {
      double uf = 0;
      for (int i = 0; i < N; i++) {
        const double q0 = q[i], qn = A1[i] * q0 - A2[i] * q1[i];
        q1[i] = q0; q[i] = qn; uf += w[i] * qn;
      }
      const double etaF = 2 * eta - etaPrev;
      const double F = contactForce(etaF - uf);
      etaPrev = eta; eta = etaF - kOverM * F;
      if (F > 0) {
        for (int i = 0; i < N; i++) q[i] += bw[i] * F;
        contact = true; contactSamples++;
        if (F > Fmax) Fmax = F;
      }
      for (int i = 0; i < N; i++) y += pk[i] * q[i];
      hammerSamples++;
      if (hammerSamples > eng.hammerMax || (contact && F == 0 && dPrev < -2e-3)) {
        hammerOn = false;
        Message m;
        m.type = msg::hammer; m.key = (int16_t)key; m.count = 2;
        m.values[0] = (float)((contactSamples / eng.fs2) * 1000); m.values[1] = (float)Fmax;
        eng.post(m);
      }
    }
    if (y < yLo) yLo = y;
    if (y > yHi) yHi = y;
    if (moving) {
      wid1_ += (tWid - wid1_) * aP; yoff1_ += (tYoff - yoff1_) * aP; gain1_ += (tGain - gain1_) * aP;
      wid_ += (wid1_ - wid_) * aP; yoff_ += (yoff1_ - yoff_) * aP; gain_ += (gain1_ - gain_) * aP;
      g = gain_ * gs; iw2 = 1 / (wid_ * wid_);
    }
    // pickup: emf ∝ −dΦ/dt of the tip position relative to the pole
    const double z = 1 + (y + yoff_) * (y + yoff_) * iw2;
    const double phi = 1 / (z * std::sqrt(z));
    const double out = g * (phiP - phi);
    phiP = phi;
    buf[s] += out;
    const double a = out < 0 ? -out : out;
    if (a > pkMax) pkMax = a;
  }
  if (moving) {
    if (std::fabs(tWid - wid_) + std::fabs(tWid - wid1_) < 1e-9 * tWid && std::fabs(tYoff - yoff_) + std::fabs(tYoff - yoff1_) < 1e-9 * tWid
        && std::fabs(tGain - gain_) + std::fabs(tGain - gain1_) < 1e-9 * tGain) {
      wid_ = wid1_ = tWid; yoff_ = yoff1_ = tYoff; gain_ = gain1_ = tGain; pickupMoving = false;
    }
    wid = wid_; yoff = yoff_; gain = gain_; wid1 = wid1_; yoff1 = yoff1_; gain1 = gain1_;
  }
  phiPrev = phiP; yMin = yLo; yMax = yHi;
  peak = pkMax; age += n;
  if (!(pkMax < 1e3)) {
    dead = true;
    Message m;
    m.type = msg::error; m.key = (int16_t)key;
    eng.post(m);
    return;
  }
  if (!hammerOn) {
    quiet = pkMax < (damped ? 2e-5 : 2e-6) ? quiet + 1 : 0;
    if (quiet > 60) dead = true;
  }
}

// ---- the engine ------------------------------------------------------------------------------

TinesEngine::TinesEngine(double fs)
    : Engine(fs), fs2(OS * fs), hammerMax((int)std::round(0.05 * fs2)), aSm(1 - std::exp(-1 / (SMOOTH_T * fs2))),
      aPick(1 - std::exp(-1 / (PICKUP_T * fs2))), mono((size_t)OS * MAXN, 0.0),
      data([this](int key, uint64_t v) -> std::unique_ptr<VoiceData> {
        if (key < KEY_LO || key > KEY_HI) return nullptr;
        // the parameters of that version (a snapshot the audio thread may be rewriting: check)
        for (Snapshot &s : snapshots) {
          if (s.version.load(std::memory_order_acquire) != v) continue;
          std::array<double, p::count> Q;
          for (int i = 0; i < p::count; i++) Q[i] = s.P[i].load(std::memory_order_relaxed);
          std::atomic_thread_fence(std::memory_order_acquire);
          if (s.version.load(std::memory_order_relaxed) != v) return nullptr;
          KeyModel m = computeKey(key, Q.data(), this->fs);
          if (!m.ok) return nullptr;
          m.voice.version = v;
          return std::make_unique<VoiceData>(m.voice);
        }
        return nullptr;
      }) {
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def; // the defaults until told otherwise
  version = modelVersion(P.data(), fs);
  Snapshot &s = snapshots[snapAt];
  for (int i = 0; i < p::count; i++) s.P[i].store(P[i], std::memory_order_relaxed);
  s.version.store(version, std::memory_order_release);
  // decimation FIR: Blackman-windowed sinc, cutoff at the output Nyquist. That is a half-band
  // filter: every tap an even distance from the centre (other than the centre) is exactly zero,
  // and block() skips them.
  const double c = 0.25;
  double sum = 0;
  for (int i = 0; i < T; i++) {
    const int m = i - (T - 1) / 2;
    const double x = 2 * PI * c * m;
    const double sinc = m == 0 ? 1 : m % 2 == 0 ? 0 : std::sin(x) / x;
    const double win = 0.42 - 0.5 * std::cos((2 * PI * i) / (T - 1)) + 0.08 * std::cos((4 * PI * i) / (T - 1));
    fir[i] = sinc * win; sum += fir[i];
  }
  for (int i = 0; i < T; i++) fir[i] /= sum;
  hpL.set(false, 70, 0.7, fs); hpR.set(false, 70, 0.7, fs);
  snapLive();
}

// Jump the output stage straight to the current settings (nothing sounding).
void TinesEngine::snapLive() {
  sCable = P[p::cable]; sResQ = P[p::resQ]; sTone = P[p::tone];
  sDrive = P[p::drive]; sDepth = P[p::tremDepth]; sMaster = 1;
  harp.set(true, harpHz(sCable), sResQ, fs2);
  lpL.set(true, sTone, 0.7, fs); lpR.set(true, sTone, 0.7, fs);
  gliding = false;
}

void TinesEngine::setParams(const double *np) {
  const bool first = !hasParams;
  const std::array<double, p::count> old = P;
  for (int i = 0; i < p::count; i++) P[i] = np[i];
  hasParams = true;
  if (P[p::damper] != old[p::damper]) for (int i = 0; i < nVoices; i++) voices[i]->setDamper(P[p::damper]);
  if (P[p::gap] != old[p::gap] || P[p::offset] != old[p::offset] || P[p::poleRadius] != old[p::poleRadius] || P[p::voicing] != old[p::voicing]) {
    for (int i = 0; i < nVoices; i++) voices[i]->retargetPickup(pickupFor(voices[i]->key, P.data()));
  }
  if (nVoices) gliding = true; else snapLive();
  // a new version of every key's modes: built off the audio thread, nearest the last key first
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

bool TinesEngine::offer(const double *packed, int n) {
#if FORTE_THREADS
  (void)packed; (void)n;
  return false;
#else
  VoiceData d;
  if (!unpackVoiceData(packed, n, d) || d.key < 0 || d.key > 127) return false;
  sent[d.key] = d; hasSent[d.key] = true;
  return true;
#endif
}

// velocity: the hammer's speed in m/s (not 0..1). A sounding voice is struck again, unless the
// key's data has a new version (the model changed): then a new voice starts.
void TinesEngine::noteOn(int key, double velocity) {
  last = nullptr;
  if (key < 0 || key > 127) return;
  focus = key;
#if !FORTE_THREADS
  if (hasSent[key]) { strikeKey(key, velocity, sent[key]); return; }
#endif
  if (const Data::Ref r = data.get(key, version)) { strikeKey(key, velocity, *r.data); return; }
  if (key < KEY_LO || key > KEY_HI) return;
  // the key is being built (a few ms): the note waits for it
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) { pending[i] = {key, velocity, false}; return; }
  if (nPending < (int)pending.size()) pending[nPending++] = {key, velocity, false};
}

void TinesEngine::retryPending() {
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

void TinesEngine::strikeKey(int key, double velocity, const VoiceData &d) {
  Voice *v = byKey[key];
  if (!v || v->dead || v->killing || v->version != d.version) {
    if (v && !v->dead) { v->keyDown = false; v->updateDamping(*this); }
    Voice *slot = nullptr;
    for (int i = 0; i < POOL && !slot; i++) { Voice &u = pool[(nextSlot + i) % POOL]; if (!u.inUse) { slot = &u; nextSlot = (nextSlot + i + 1) % POOL; } }
    if (!slot || nVoices >= POOL) return; // every voice busy (beyond anything the limit lets happen)
    v = slot;
    v->start(*this, key, d);
    voices[nVoices++] = v; byKey[key] = v;
  }
  v->keyDown = true; v->updateDamping(*this); v->strike(velocity);
  trimVoices(v);
  last = v;
}

// Over the voice limit: release the quietest. A voice whose hammer is still in flight has not been
// heard yet (peak 0), so it is never the victim; if only those are left, try again once they have
// sounded.
void TinesEngine::trimVoices(const Voice *keep) {
  int live = 0;
  for (int i = 0; i < nVoices; i++) if (!voices[i]->killing) live++;
  overLimit = false;
  while (live > MAX_VOICES) {
    Voice *victim = nullptr;
    double score = INFINITY;
    for (int i = 0; i < nVoices; i++) {
      Voice *u = voices[i];
      if (u != keep && !u->killing && !u->hammerOn && u->age > 0 && u->peak < score) { score = u->peak; victim = u; }
    }
    if (!victim) { overLimit = true; break; }
    victim->kill(); live--;
  }
}

void TinesEngine::noteOff(int key, double) {
  if (key < 0 || key > 127) return;
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) pending[i].off = true;
  if (Voice *v = byKey[key]) { v->keyDown = false; v->updateDamping(*this); }
}

void TinesEngine::setSustain(bool on) {
  sustain = on;
  for (int i = 0; i < nVoices; i++) voices[i]->updateDamping(*this);
}

void TinesEngine::bend(double value) {
  bendTo = std::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12);
}

void TinesEngine::allNotesOff() {
  nPending = 0;
  for (int i = 0; i < nVoices; i++) voices[i]->kill();
}

void TinesEngine::process(float *L, float *R, int n) {
  if (nPending) retryPending();
  for (int off = 0, m; off < n; off += m) {
    // pitch bend glides in steps of at most 128 samples, the voices retuned at each
    m = std::min(bendNow != bendTo ? 128 : MAXN, n - off);
    if (bendNow != bendTo) {
      bendNow += (bendTo - bendNow) * (1 - std::exp(-m / (BEND_T * fs)));
      if (std::fabs(bendNow - bendTo) < 1e-9) bendNow = bendTo;
    }
    for (int i = 0; i < nVoices; i++) if (voices[i]->bend != bendNow) { voices[i]->tune(bendNow); voices[i]->setDamper(voices[i]->damperSigma); }
    block(L, R, off, m);
  }
  data.audioCycle();
}

void TinesEngine::block(float *L, float *R, int off, int n) {
  const int n2 = n * OS;
  double *m = mono.data();
  std::fill(m, m + n2, 0.0);
  for (int i = 0; i < nVoices; i++) voices[i]->render(m, n2, *this);
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
  if (overLimit) trimVoices(nullptr);

  double *hL = histL.data(), *hR = histR.data();
  constexpr int TC = (T - 1) >> 1; // the centre tap
  const double tremInc = P[p::tremRate] / fs2;
  const bool glide = gliding;
  const double a = aSm;
  const double tCable = P[p::cable], tResQ = P[p::resQ], tTone = P[p::tone], tDrive = P[p::drive], tDepth = P[p::tremDepth], tMaster = 1;
  double depth = sDepth, master = sMaster, drive = sDrive;
  // power-amp saturation: unity small-signal gain, a little make-up when pushed; below drive 0.02
  // it fades into a straight wire
  double dk = 1 + 10 * drive * drive, dn = (1 + 0.6 * drive) / dk, dmix = std::min(1.0, drive / 0.02);
  for (int s = 0; s < n2; s++) {
    if (glide) {
      depth += (tDepth - depth) * a; master += (tMaster - master) * a;
      if (drive != tDrive) {
        drive += (tDrive - drive) * a;
        if (std::fabs(tDrive - drive) < 1e-6) drive = tDrive;
        dk = 1 + 10 * drive * drive; dn = (1 + 0.6 * drive) / dk; dmix = std::min(1.0, drive / 0.02);
      }
      if (sCable != tCable || sResQ != tResQ) {
        sCable += (tCable - sCable) * a; sResQ += (tResQ - sResQ) * a;
        if (std::fabs(tCable - sCable) < 1e-3 && std::fabs(tResQ - sResQ) < 1e-6) { sCable = tCable; sResQ = tResQ; }
        harp.set(true, harpHz(sCable), sResQ, fs2);
      }
      if (sTone != tTone) {
        sTone += (tTone - sTone) * a;
        if (std::fabs(tTone - sTone) < 0.01) sTone = tTone;
        if (s & 1) { lpL.set(true, sTone, 0.7, fs); lpR.set(true, sTone, 0.7, fs); }
      }
    }
    const double x = harp.run(m[s]);
    // suitcase "vibrato": an opto-coupled stereo auto-pan
    tremPhase += tremInc;
    if (tremPhase >= 1) tremPhase -= 1;
    double l = x, r = x;
    if (depth != 0) {
      const double lfo = std::sin(TAU * tremPhase);
      l = x * (1 - depth * 0.5 * (1 + lfo)); r = x * (1 - depth * 0.5 * (1 - lfo));
    }
    if (drive > 0) { l += dmix * (std::tanh(dk * l) * dn - l); r += dmix * (std::tanh(dk * r) * dn - r); }
    hi = (hi + 1) & 127;
    hL[hi] = l; hR[hi] = r;
    if (s & 1) {
      const int hc = (hi - TC) & 127;
      double al = fir[TC] * hL[hc], ar = fir[TC] * hR[hc];
      for (int t = 0; t < T; t += 2) { const int idx = (hi - t) & 127; al += fir[t] * hL[idx]; ar += fir[t] * hR[idx]; }
      const int o = off + (s >> 1);
      L[o] = (float)(lpL.run(hpL.run(al)) * master);
      R[o] = (float)(lpR.run(hpR.run(ar)) * master);
    }
  }
  if (glide) {
    if (std::fabs(tDepth - depth) < 1e-7 && std::fabs(tMaster - master) < 1e-7 * (1 + tMaster)
        && drive == tDrive && sCable == tCable && sResQ == tResQ && sTone == tTone) {
      depth = tDepth; master = tMaster; gliding = false;
    }
    sDepth = depth; sMaster = master; sDrive = drive;
  }
}

} // namespace forte::tines
