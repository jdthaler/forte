// reeds-engine.cpp — the reed piano's engine (reeds-engine.h).

#include "reeds-engine.h"

#include <algorithm>
#include <cmath>

namespace forte::reeds {

constexpr double OUT = 0.5;          // volts at the preamp → output units
constexpr double DIRECT = 0.6;       // direct out, trimmed 4.4 dB below the speakers' passband
constexpr double HAMMER_MAX = 0.03;  // s: longest the hammer may stay in flight
constexpr double KILL = 300;         // s⁻¹: voice stealing / panic / a re-strike with new reed parameters
constexpr double GLIDE = 0.02;       // s: the gap and the rest height follow their knobs with this time constant
constexpr double XFADE = 0.02;       // s: switching between speakers and direct out crossfades over this
constexpr double XMAX = SLOT_Y.n - 3 - 1e-9; // last table position the cubic interpolation can use

static int jsRound(double x) { return (int)std::floor(x + 0.5); } // Math.round

// ---- a voice: one reed -------------------------------------------------------------------------

void ReedEngine::Voice::start(const ReedEngine &eng, int key_, const VoiceData &d) {
  *this = Voice{};
  inUse = true;
  key = key_; N = d.n; k = 1 / eng.fs2; version = d.version;
  for (int i = 0; i < N; i++) {
    om0[i] = TAU * d.freq[i]; sig[i] = d.sigma[i]; dw[i] = d.dampW[i];
    w[i] = d.w[i]; pk[i] = d.pk[i];
  }
  tune(eng.bendNow);
  hits = 0;
  hammer = d.hammer;
  setDamper(eng.damperSigma);
}

void ReedEngine::Voice::tune(double r) {
  double cmp = 0, cpk = 0;
  for (int i = 0; i < N; i++) {
    const double o = om0[i] * r, s = sig[i];
    om[i] = o;
    const double rr = std::exp(-s * k), od = std::sqrt(std::max(o * o - s * s, 1e-6));
    a1[i] = 2 * rr * std::cos(od * k); a2[i] = rr * rr;
    const double b = (k * rr * std::sin(od * k)) / od; // response to a unit force impulse (unit modal mass)
    bw[i] = b * w[i]; cmp += b * w[i] * w[i];
    bp[i] = b * pk[i]; cpk += b * pk[i] * pk[i];
  }
  comp = cmp; // strike-point compliance over one step: Σ b w²
  cStop = cpk; stopDen = 1 / (1 + STOP.K * cpk); // the same at the slot, for the frame stop
  bend = r;
}

void ReedEngine::Voice::setDamper(double sd) {
  for (int i = 0; i < N; i++) {
    const double s = sig[i] + (killing ? KILL : sd * dw[i]), o = om[i];
    const double r = std::exp(-s * k), od = std::sqrt(std::max(o * o - s * s, 1e-6));
    a1d[i] = 2 * r * std::cos(od * k); a2d[i] = r * r;
  }
}

void ReedEngine::Voice::kill(const ReedEngine &eng) {
  if (killing) return;
  killing = true; setDamper(eng.damperSigma); damped = true;
}

// Launch the hammer from just below the reed's current position at speed v.
void ReedEngine::Voice::strike(double v) {
  double uu = 0;
  for (int i = 0; i < N; i++) uu += w[i] * q[i];
  eta = uu - 1.5 * v * k; etaPrev = eta - v * k;
  dPrev = -1; dPrev2 = -1; hammerOn = true; hammerSamples = 0; contact = false;
  contactSamples = 0; Fmax = 0;
  kOverM = (k * k) / hammer.mass;
  halfAlpha = hammer.alpha / (2 * k); // centred difference for d(δ^p)/dt
  yMin = 0; yMax = 0;
}

// Felt force F = K δ^p + K α d(δ^p)/dt, solved implicitly with the reed's and the hammer's
// response in the same step; the elastic part is the discrete gradient of V = K δ^(p+1)/(p+1),
// so the strike conserves energy exactly (Chatziioannou & van Walstijn 2015).
double ReedEngine::Voice::contactForce(double dFree) {
  const double C = comp + kOverM, d0 = dPrev2;
  fd0 = d0; fV0 = d0 > 0 ? (hammer.K * std::pow(d0, hammer.p + 1)) / (hammer.p + 1) : 0; fP0 = d0 > 0 ? std::pow(d0, hammer.p) : 0;
  dPrev2 = dPrev;
  if (dFree <= 0 && d0 <= 0) { dPrev = dFree; return 0; }
  // g(D) = D + C F(D) − dFree is increasing; the root lies in [dFree − C F(dFree), dFree]
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

// the felt's force for a compression D at the next step (previous-but-one step in fd0, fV0, fP0)
double ReedEngine::Voice::felt(double D) const {
  const double K = hammer.K, p = hammer.p, Dp = D > 0 ? std::pow(D, p) : 0, dd = D - fd0;
  const double el = std::fabs(dd) > 1e-15 ? ((D > 0 ? (K * Dp * D) / (p + 1) : 0) - fV0) / dd : K * Dp;
  const double f = el + K * halfAlpha * (Dp - fP0);
  return f > 0 ? f : 0;
}

// Adds this reed's capacitance change δC(t) = C(y₀ + y) − C(y₀) (farads) to buf. While a knob
// glides, the slot (table, y₀ and the rest values) moves linearly across the block from the
// engine's current state to its next (…N) one.
void ReedEngine::Voice::render(double *buf, int n, const ReedEngine &eng) {
  double *Q = q.data(), *Q1 = q1.data();
  const double *PK = pk.data(), *BP = bp.data();
  const double *A1 = damped ? a1d.data() : a1.data(), *A2 = damped ? a2d.data() : a2.data();
  const double *c = eng.capA, *cB = eng.capB, ty0 = SLOT_Y.min, idy = 1 / SLOT_Y.step, xmax = XMAX;
  const bool bl = eng.blend, two = eng.twoTables;
  const double inv = 1.0 / n, kF = eng.kF, yS = STOP.y, kS = STOP.K, sDen = stopDen, cS = cStop;
  const double y0a = eng.y0, cRa = eng.cRest, dRa = eng.dRest, dy0 = eng.y0N - y0a, dcR = eng.cRestN - cRa, ddR = eng.dRestN - dRa;
  double y0 = y0a, cRest = cRa, dRest = dRa, t = 0;
  double pkMax = 0, ymn = yMin, ymx = yMax;
  for (int s = 0; s < n; s++) {
    double y = 0;
    if (!hammerOn) {
      for (int i = 0; i < N; i++) {
        const double q0 = Q[i], qn = A1[i] * q0 - A2[i] * Q1[i];
        Q1[i] = q0; Q[i] = qn; y += PK[i] * qn;
      }
    } else {
      const double *W = w.data(), *BW = bw.data();
      double uf = 0;
      for (int i = 0; i < N; i++) {
        const double q0 = Q[i], qn = A1[i] * q0 - A2[i] * Q1[i];
        Q1[i] = q0; Q[i] = qn; uf += W[i] * qn;
      }
      const double etaF = 2 * eta - etaPrev;
      const double F = contactForce(etaF - uf);
      etaPrev = eta; eta = etaF - kOverM * F;
      if (F > 0) {
        for (int i = 0; i < N; i++) Q[i] += BW[i] * F;
        contact = true; contactSamples++;
        if (F > Fmax) Fmax = F;
      }
      for (int i = 0; i < N; i++) y += PK[i] * Q[i];
      if (++hammerSamples > eng.hammerMax || (contact && F == 0 && dPrev < -2e-4)) hammerOn = false;
    }
    if (bl) { t = (s + 1) * inv; y0 = y0a + t * dy0; cRest = cRa + t * dcR; dRest = dRa + t * ddR; }
    // the frame: a stiff elastic stop at |y₀ + y| = H − h/2, solved implicitly
    const double ya = y0 + y;
    if (ya > yS || ya < -yS) {
      const double Fs = kS * ((ya > 0 ? yS : -yS) - ya) * sDen;
      for (int i = 0; i < N; i++) Q[i] += BP[i] * Fs;
      y += cS * Fs; hits++;
    }
    if (y < ymn) ymn = y; else if (y > ymx) ymx = y;
    // the slot: C(y₀ + y) and dC/dy by Catmull–Rom on the Laplace table
    double x = (y0 + y - ty0) * idy;
    if (x < 1) x = 1; else if (x > xmax) x = xmax;
    const int j = (int)x;
    const double f = x - j;
    double p0 = c[j - 1], p1 = c[j], p2 = c[j + 1], p3 = c[j + 2];
    double b1 = 0.5 * (p2 - p0), b2 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3, b3 = 0.5 * (p3 - p0) + 1.5 * (p1 - p2);
    double C = ((b3 * f + b2) * f + b1) * f + p1, dCdx = (3 * b3 * f + 2 * b2) * f + b1;
    if (two) { // the gap is gliding: blend toward the next block's table
      p0 = cB[j - 1]; p1 = cB[j]; p2 = cB[j + 1]; p3 = cB[j + 2];
      b1 = 0.5 * (p2 - p0); b2 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3; b3 = 0.5 * (p3 - p0) + 1.5 * (p1 - p2);
      C += t * (((b3 * f + b2) * f + b1) * f + p1 - C); dCdx += t * ((3 * b3 * f + 2 * b2) * f + b1 - dCdx);
    }
    buf[s] += C - cRest;
    // the field pulls the reed toward higher C: F = ½V² dC/dy (static part balanced at rest)
    const double Fe = kF * (dCdx * idy - dRest);
    for (int i = 0; i < N; i++) Q[i] += BP[i] * Fe;
    const double a = y < 0 ? -y : y;
    if (a > pkMax) pkMax = a;
  }
  yMin = ymn; yMax = ymx; peak = pkMax;
  if (!(pkMax < 0.05)) { dead = true; return; } // 5 cm: numerically blown up
  if (!hammerOn) {
    quiet = pkMax < (damped ? 3e-8 : 3e-9) ? quiet + 1 : 0;
    if (quiet > 40) dead = true;
  }
}

// ---- the engine --------------------------------------------------------------------------------

ReedEngine::ReedEngine(double fs)
    : Engine(fs), fs2(OS * fs), hammerMax(jsRound(HAMMER_MAX * (OS * fs))), capA(capTables[0].data()), capB(capTables[1].data()),
      dc(12, fs), mixStep(1 / (XFADE * fs)),
      data([this](int key, uint64_t v) -> std::unique_ptr<VoiceData> {
        if (key < KEY_MIN || key > KEY_MAX) return nullptr;
        // the knobs of that version (a snapshot the audio thread may be rewriting: check)
        for (Snapshot &s : snapshots) {
          if (s.version.load(std::memory_order_acquire) != v) continue;
          const double solder = s.solder.load(std::memory_order_relaxed), strike = s.strike.load(std::memory_order_relaxed),
                       hardness = s.hardness.load(std::memory_order_relaxed);
          std::atomic_thread_fence(std::memory_order_acquire);
          if (s.version.load(std::memory_order_relaxed) != v) return nullptr;
          KeyModel m = keyModel(key, solder, strike, hardness, fs2);
          if (!m.reed.ok) return nullptr;
          return std::make_unique<VoiceData>(m.voice);
        }
        return nullptr;
      }) {
  // decimator: Blackman-windowed sinc, cutoff at the output Nyquist
  double sum = 0;
  for (int i = 0; i < T; i++) {
    const double m = i - (T - 1) / 2.0, x = TAU * 0.23 * m;
    fir[i] = (m == 0 ? 1 : std::sin(x) / x) * (0.42 - 0.5 * std::cos((TAU * i) / (T - 1)) + 0.08 * std::cos((2 * TAU * i) / (T - 1)));
    sum += fir[i];
  }
  for (int i = 0; i < T; i++) fir[i] /= sum;
}

void ReedEngine::restAt(const double *c, double y, double &C, double &D) const {
  const double x = std::min(std::max((y - SLOT_Y.min) / SLOT_Y.step, 1.0), XMAX);
  const int j = (int)x;
  const double f = x - j;
  const double p0 = c[j - 1], p1 = c[j], p2 = c[j + 1], p3 = c[j + 2];
  const double b1 = 0.5 * (p2 - p0), b2 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3, b3 = 0.5 * (p3 - p0) + 1.5 * (p1 - p2);
  C = ((b3 * f + b2) * f + b1) * f + p1;
  D = ((3 * b3 * f + 2 * b2) * f + b1) / SLOT_Y.step;
}

void ReedEngine::setParams(const double *np) {
  const bool first = !hasParams;
  for (int i = 0; i < p::count; i++) P[i] = np[i];
  hasParams = true;
  const double k = 1 / fs2;
  // the slot glides to the new gap and rest height in process()
  gapT = P[p::gap]; y0T = P[p::offset] * 1e-3;
  if (first) {
    gap = P[p::gap]; y0 = y0T; fillCap(capA, P[p::gap]);
    restAt(capA, y0, cRest, dRest);
    mix = (int)P[p::output] == output_::speaker ? 1 : 0;
  }
  kF = 0.5 * P[p::bias] * P[p::bias];
  // comb node: exact update for δC linear within a step
  const Node node = pickupNode(P[p::rbias], P[p::bias]);
  const double A = std::exp(-k / node.tau);
  nodeA = A; nodeB = -node.gain * (node.tau / k) * (1 - A);
  // preamp: gain, then a stage that clips softly and asymmetrically
  drive = 0.25 * std::pow(16.0, P[p::drive]);
  tremInc = P[p::tremRate] / fs2;
  // photocell: fast to light up, slow to go dark (CdS)
  ldrOn = 1 - std::exp(-k / 0.004); ldrOff = 1 - std::exp(-k / 0.035);
  // speaker: two 4"×8" ovals on the open-backed lid
  spk[0].set(Biquad::hp, 130, 0.9, fs);          // cone resonance (suspension + moving mass)
  spk[1].set(Biquad::peak, 2600, 2.2, fs, 6);     // cone break-up
  spk[2].set(Biquad::lp, 6000, 0.8, fs);          // voice-coil inductance, cone mass
  spk[3].set(Biquad::peak, 900, 1.0, fs, -2.5);   // dip between the lid's baffle step and break-up
  hpA = std::exp((-TAU * 280) / fs);              // open back: front–rear cancellation below ~c/2d
  // a new version of every key's reed: built off the audio thread, nearest the last key first
  const uint64_t v = reedVersion(P[p::solder], P[p::strike], P[p::hardness], fs2);
  if (first || v != version) {
    if (v != version) {
      version = v;
      snapAt = (snapAt + 1) % (int)snapshots.size();
      Snapshot &s = snapshots[snapAt];
      s.version.store(0, std::memory_order_relaxed);
      std::atomic_thread_fence(std::memory_order_release);
      s.solder.store(P[p::solder], std::memory_order_relaxed);
      s.strike.store(P[p::strike], std::memory_order_relaxed);
      s.hardness.store(P[p::hardness], std::memory_order_relaxed);
      s.version.store(version, std::memory_order_release);
    }
#if FORTE_THREADS
    data.prepare(version, KEY_MIN, KEY_MAX, focus);
#endif
  }
}

bool ReedEngine::offer(const double *packed, int n) {
#if FORTE_THREADS
  (void)packed; (void)n;
  return false;
#else
  auto d = std::make_unique<VoiceData>();
  if (!unpackVoiceData(packed, n, *d) || d->key < 0 || d->key > 127) return false;
  offered = std::move(d);
  return true;
#endif
}

void ReedEngine::setSustain(bool on) {
  sustain = on;
  for (int i = 0; i < nVoices; i++) voices[i]->updateDamping(*this);
}

void ReedEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < 0 || key > 127) return;
  focus = key;
#if !FORTE_THREADS
  // the reed the page sent with this note, whatever its version
  if (offered && offered->key == key) {
    const std::unique_ptr<VoiceData> d = std::move(offered);
    strikeKey(key, velocity, *d);
    return;
  }
#endif
  if (key < KEY_MIN || key > KEY_MAX) return;
  if (const Data::Ref r = data.get(key, version)) { strikeKey(key, velocity, *r.data); return; }
  // the reed is being built (a few ms): the note waits for it
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) { pending[i] = {key, velocity, false}; return; }
  if (nPending < (int)pending.size()) pending[nPending++] = {key, velocity, false};
}

void ReedEngine::retryPending() {
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

// A free voice; with every one busy, the quietest that is already fading out.
ReedEngine::Voice *ReedEngine::allocate() {
  for (int i = 0; i < POOL; i++) {
    Voice &u = pool[(nextSlot + i) % POOL];
    if (!u.inUse) { nextSlot = (nextSlot + i + 1) % POOL; return &u; }
  }
  int best = -1;
  for (int i = 0; i < nVoices; i++) if (voices[i]->killing && (best < 0 || voices[i]->peak < voices[best]->peak)) best = i;
  if (best < 0) return nullptr;
  Voice *v = voices[best];
  if (byKey[v->key] == v) byKey[v->key] = nullptr;
  for (int i = best; i + 1 < nVoices; i++) voices[i] = voices[i + 1];
  nVoices--;
  return v;
}

void ReedEngine::strikeKey(int key, double velocity, const VoiceData &d) {
  Voice *v = byKey[key];
  if (!v || v->dead || v->killing || v->version != d.version) {
    if (v && !v->dead) v->kill(*this); // struck again with new reed parameters: the old reed fades out quickly
    Voice *slot = allocate();
    if (!slot) return;
    slot->start(*this, key, d);
    v = slot;
    voices[nVoices++] = v;
    byKey[key] = v;
  }
  v->keyDown = true; v->updateDamping(*this);
  v->strike(hammerSpeed(velocity));
  if (nVoices > maxVoices) {
    Voice *victim = nullptr;
    double score = INFINITY;
    for (int i = 0; i < nVoices; i++) { Voice *u = voices[i]; if (u != v && !u->killing && u->peak < score) { score = u->peak; victim = u; } }
    if (victim) victim->kill(*this);
  }
}

void ReedEngine::noteOff(int key, double) {
  if (key < 0 || key > 127) return;
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) pending[i].off = true;
  if (Voice *v = byKey[key]) { v->keyDown = false; v->updateDamping(*this); }
}

void ReedEngine::allNotesOff() {
  nPending = 0;
  for (int i = 0; i < nVoices; i++) voices[i]->kill(*this);
}

void ReedEngine::bend(double value) {
  bendTo = std::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12);
}

void ReedEngine::process(float *L, float *R, int n) {
  if (nPending) retryPending();
  for (int at = 0; at < n; at += BLOCK) processBlock(L + at, R + at, std::min(BLOCK, n - at));
  data.audioCycle();
}

void ReedEngine::processBlock(float *L, float *R, int n) {
  const int n2 = n * OS;
  std::fill(mono.begin(), mono.begin() + n2, 0.0);
  // glide the slot toward the knobs: this block runs from the current state to the next
  const bool gl = gap != gapT, yl = y0 != y0T;
  blend = gl || yl; twoTables = gl;
  if (blend) {
    const double a = 1 - std::exp(-n / (GLIDE * fs));
    double gN = gap + a * (gapT - gap), yN = y0 + a * (y0T - y0);
    if (std::fabs(gapT - gN) < 1e-6 * gapT) gN = gapT;
    if (std::fabs(y0T - yN) < 1e-9) yN = y0T;
    if (gl) fillCap(capB, gN);
    restAt(gl ? capB : capA, yN, cRestN, dRestN);
    gapN = gN; y0N = yN;
  } else { y0N = y0; cRestN = cRest; dRestN = dRest; }
  // pitch bend glides as the slot does; the sounding reeds are retuned each block
  if (bendNow != bendTo) {
    bendNow += (1 - std::exp(-n / (GLIDE * fs))) * (bendTo - bendNow);
    if (std::fabs(bendNow - bendTo) < 1e-9) bendNow = bendTo;
  }
  for (int i = 0; i < nVoices; i++) if (voices[i]->bend != bendNow) { voices[i]->tune(bendNow); voices[i]->setDamper(damperSigma); }
  if (hasParams) for (int i = 0; i < nVoices; i++) voices[i]->render(mono.data(), n2, *this);
  if (hasExtra) { for (int s = 0; s < n2; s++) mono[s] += extra[s]; hasExtra = false; }
  if (blend) {
    if (gl) std::swap(capA, capB);
    gap = gapN; y0 = y0N; cRest = cRestN; dRest = dRestN;
    blend = twoTables = false;
  }
  int j = 0;
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    if (v->dead) { if (byKey[v->key] == v) byKey[v->key] = nullptr; v->inUse = false; } else voices[j++] = v;
  }
  nVoices = j;
  if (!hasParams) { std::fill(L, L + n, 0.0f); std::fill(R, R + n, 0.0f); return; }

  const int Th = (T - 1) >> 1;
  const double A = nodeA, B = nodeB, gain = PREAMP_GAIN, D = drive, iD = 1 / D, depth = P[p::tremDepth], inc = tremInc;
  const double mixT = (int)P[p::output] == output_::speaker ? 1 : 0, mStep = mixStep;
  double uu = u, xp = xPrev, lr = ldr, ph = tremPhase, mx = mix;
  int h = hi;
  for (int s = 0; s < n2; s++) {
    // comb node voltage (AC part), v′ = −v/τ − (V_b/C0) δC′
    const double x = mono[s];
    uu = A * uu + B * (x - xp); xp = x;
    // tremolo: the oscillator lights an LED on its positive half-cycles; the photocell beside it
    // shunts the preamp's signal as it lights up
    ph += inc; if (ph >= 1) ph -= 1;
    const double led = depth * std::max(0.0, std::sin(TAU * ph));
    lr += (led > lr ? ldrOn : ldrOff) * (led - lr);
    double v = (gain * uu) / (1 + 3 * lr);
    // preamp stage: transistor runs out of swing sooner on one side
    v *= D;
    v = v > 0 ? 1.6 * std::tanh(v / 1.6) : 1.1 * std::tanh(v / 1.1);
    v *= iD;
    h = (h + 1) & 63; hist[h] = hist[h + 64] = v;
    if (s & 1) {
      const int b = h + 64, e = b - T + 1;
      double a = fir[Th] * hist[b - Th];
      for (int t = 0; t < Th; t++) a += fir[t] * (hist[b - t] + hist[e + t]);
      const double o = dc.run(a);
      // the speakers always run, so switching outputs is a crossfade, not a jump
      const double yh = hpA * (hpY1 + o - hpX1); hpX1 = o; hpY1 = yh;
      const double sp = spk[3].run(spk[2].run(spk[1].run(spk[0].run(yh))));
      L[s >> 1] = (float)(OUT * (DIRECT * o + mx * (sp - DIRECT * o)));
      if (mx != mixT) mx = mixT > mx ? std::min(mixT, mx + mStep) : std::max(mixT, mx - mStep);
    }
  }
  u = uu; xPrev = xp; ldr = lr; tremPhase = ph; hi = h; mix = mx;
  for (int i = 0; i < n; i++) R[i] = L[i];
}

} // namespace forte::reeds
