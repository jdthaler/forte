// voice-engine.cpp — the Singing Voice's engine (voice-engine.h).

#include "voice-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"
#include "forte/fdlibm.h"

namespace forte::voice {

using fdlibm::cos;
using fdlibm::exp;
using fdlibm::log;
using fdlibm::pow;
using fdlibm::sin;

static constexpr double PI = 3.141592653589793;
static constexpr double OUT = 0.45;         // the radiated pressure (Pa at 1 m) to the output
static constexpr double RAD = RHO / (4 * PI); // p(1 m) = ρ/(4π r) dU/dt: the lips as a small source
static constexpr double F_LEVEL = 261.6, LEVEL_SLOPE = 1.3;
static constexpr double F_REF = 115;        // Hz: what the folds sing at tension 1 at the defaults

static constexpr double LOSS = 0.55;        // 1/m: the walls' loss along a section of 3 cm²
static constexpr double A_LOSS = 3e-4;      // m²
static constexpr double VOWEL_T = 0.05;     // s: the tongue, jaw and lips move to a new vowel this fast
static constexpr double BEND_T = 0.02;      // s: bends glide with this time constant
static constexpr double STEAL_T = 0.01;     // s: a stolen voice's breath stops this fast
static constexpr double FLUTTER_HZ = 3;     // the flutter's wandering, below this
static constexpr double NOISE_HZ = 6000;    // the turbulence's noise, below this
static constexpr double GAIN = 0.5;         // the ear's correction, of each cycle's error (in log f)
static constexpr double STEP = 0.1;         // and at most this much a cycle
static constexpr double RETRY = 0.08;      // s (and three cycles) without a note before the singer tries again
static constexpr double JAW_TRY = 0.25;    // by opening the jaw this much further (and round again)
static constexpr double SWING = 0.5e-6;     // m: a cycle the ear times swings x₁ at least this far

// The lungs push harder as the folds stretch (the threshold pressure rises with the pitch): Ps ∝ √Q
// below tension 1 and ∝ Q above.
static double lungs(double Q) { return Q < 1 ? std::sqrt(Q) : Q; }

VoiceEngine::VoiceEngine(double fs) : Engine(fs), os(fs < 80000 ? 2 : 1), fo(fs * (fs < 80000 ? 2 : 1)) {
  for (double &x : learned) x = 1;
  // the half-band filter: a windowed sinc (Blackman), cut at 0.21 fo, from twice the rate to once
  double sum = 0;
  for (int k = 0; k < TAPS; k++) {
    const double x = k - (TAPS - 1) / 2.0, fc = 0.21;
    const double s = x == 0 ? 2 * fc : sin(2 * PI * fc * x) / (PI * x);
    const double w = 0.42 - 0.5 * cos((2 * PI * k) / (TAPS - 1)) + 0.08 * cos((4 * PI * k) / (TAPS - 1));
    h[k] = s * w; sum += h[k];
  }
  for (double &x : h) x /= sum;
}

void VoiceEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  keyboard = tuningOf(P.data());
  hasP = true;
}

double VoiceEngine::nominalQ(double f) const { return (f / F_REF) * std::sqrt(P[p::thick]); }

// Formant tuning: the jaw opening that keeps F1 a little above the note (the key's, without the
// vibrato's wavering), or none.
// (worked out again only when the vowel, the note or the larynx tube moves)
double VoiceEngine::jawTarget(Voice &v, double vowel) const {
  if (P[p::tuning] < 0.5) return 0;
  const double f = keyFreq(v.key) * keyboard.ratio(v.key) * bendNow * v.bend, lar = P[p::larynx];
  if (std::fabs(vowel - v.jawVowel) > 0.005 || std::fabs(f / v.jawF - 1) > 0.002 || lar != v.jawLarynx) {
    v.jawVowel = vowel; v.jawF = f; v.jawLarynx = lar;
    v.jawTo = jawFor(vowel, lar * 1e-4, f, v.N * C / fo);
  }
  return v.jawTry > 0 ? v.jawTry : v.jawTo;
}

void VoiceEngine::shape(Voice &v, double vowel, double jaw) {
  v.vowel = vowel; v.jaw = jaw; v.larynx = P[p::larynx];
  const int N = v.N;
  areaFunction(vowel, v.larynx * 1e-4, N, v.area, jaw);
  const double dx = C / fo, losses = P[p::losses];
  double loss = 0;
  for (int j = 0; j < N; j++) {
    v.r[j] = j + 1 < N ? (v.area[j] - v.area[j + 1]) / (v.area[j] + v.area[j + 1]) : 0;
    loss += LOSS * dx * std::sqrt(A_LOSS / v.area[j]) * losses;
  }
  v.mu = exp(-loss); // the walls' loss on the way up the tract (or down), taken at its end
  // the lips: the reflection of the radiation impedance (R ∥ L) seen from the last section, by
  // the bilinear transform
  const double A = v.area[N - 1], Z = (RHO * C) / A, R = radiationR(A), L = radiationL(A), K = 2 * fo;
  const double b0 = (R * L - Z * L) * K - Z * R, b1 = -(R * L - Z * L) * K - Z * R;
  const double a0 = (R * L + Z * L) * K + Z * R, a1 = -(R * L + Z * L) * K + Z * R;
  v.lb0 = b0 / a0; v.lb1 = b1 / a0; v.la1 = a1 / a0; v.ZN = Z;
}

void VoiceEngine::start(Voice &v, int key, double velocity) {
  v.alive = true; v.held = true; v.stolen = false;
  v.key = key; v.born = t; v.vel = std::clamp(velocity, 0.0, 1.0); v.after = 0; v.liftK = 1;
  v.folds = Folds{};
  v.N = std::clamp((int)std::lround((P[p::length] / 100) * fo / C), 8, MAXN);
  for (int j = 0; j < MAXN; j++) v.F[0][j] = v.B[0][j] = v.F[1][j] = v.B[1][j] = 0;
  v.cur = 0;
  v.lx1 = v.ly1 = v.uL = 0;
  v.bend = expr.bendOf(key);
  v.jawVowel = -1;
  const double vw = expr.slideOr(key, P[p::vowel]);
  shape(v, vw, jawTarget(v, vw));
  v.fT = keyFreq(key) * keyboard.ratio(key) * bendNow * v.bend;
  qMax = 1 / ((1 / fo) * std::sqrt((H_RATIO * K1 + K1 + KC) / (M1 * P[p::thick])) * 1.3); // the stiffest step stays stable
  v.Q = std::min(nominalQ(v.fT) * learned[key], qMax);
  v.fc = foldConstants(v.Q, P[p::thick], P[p::gap] * 1e-6);
  v.jawTry = 0; v.lastValid = 0;
  v.mean = v.sPrev = v.lo = v.hi = v.amp = 0; v.armed = false; v.lastCross = -1; v.fMeas = 0; v.n = 0;
  v.env = 0; v.Ps = 0;
  v.seed = 0x9E3779B9u ^ (uint32_t)(key * 2654435761u) ^ (uint32_t)(t * 40503u);
  if (!v.seed) v.seed = 1;
  v.age = 0; v.j1 = v.j2 = 0; v.noise = 0;
  v.vibPhase = 2 * PI * ((v.seed >> 8) & 0xffff) / 65536.0; // each singer's vibrato its own
  // the level: each singer heard from a distance that grows with their note, (f / 262 Hz)^1.3 m, so the
  // choir balances (the radiated pressure, ∝ dU/dt, otherwise climbs about 10 dB an octave)
  v.gain = pow(keyFreq(key) / F_LEVEL, -LEVEL_SLOPE);
  v.level = 1;
}

void VoiceEngine::steal(const Voice *keep) {
  Voice *victim = nullptr;
  for (int pass = 0; pass < 2 && !victim; pass++)
    for (Voice &v : voices)
      if (v.alive && !v.stolen && &v != keep && (pass == 1 || !v.held) && (!victim || v.born < victim->born)) victim = &v;
  if (victim) { victim->stolen = true; victim->held = false; }
}

void VoiceEngine::noteOn(int key, double velocity) {
  if (!hasP || key < 0 || key > 127) return;
  for (Voice &v : voices) if (v.alive && !v.stolen && v.key == key) { // sung again while it still sounds
    v.held = true; v.vel = std::clamp(velocity, 0.0, 1.0);
    newest = &v;
    return;
  }
  Voice *v = nullptr;
  for (Voice &x : voices) if (!x.alive) { v = &x; break; }
  if (!v) for (Voice &x : voices) if (!v || x.born < v->born) v = &x;
  start(*v, key, velocity);
  newest = v;
  recN = 0;
  int live = 0;
  for (const Voice &x : voices) live += x.alive && !x.stolen;
  if (live > pick(kMaxVoices, 8, 6)) steal(v); // Quality: fewer singers at once
}

// Lift: how fast the breath falls: a slow lift is a sighing release (up to four times the usual),
// a fast one a clean stop (a quarter of it).
void VoiceEngine::noteOff(int key, double velocity) {
  for (Voice &v : voices) if (v.alive && v.held && v.key == key) {
    const double s = liftScale(velocity);
    v.held = false; v.liftK = s * s;
    // the singer remembers the tension that sang this note (relative to the nominal one)
    if (v.fMeas > 0) learned[key] = std::clamp(v.Q / nominalQ(v.fT), 0.25, 4.0);
  }
}

void VoiceEngine::allNotesOff() { for (Voice &v : voices) v.held = false; }

void VoiceEngine::pressure(double value, int key) {
  for (Voice &v : voices) if (v.alive && v.held && (key < 0 || v.key == key)) v.after = std::clamp(value, 0.0, 1.0);
}

void VoiceEngine::bend(double value) { bendTo = pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12); }

int VoiceEngine::voiceCount() const {
  int n = 0;
  for (const Voice &v : voices) n += v.alive;
  return n;
}

// One voice for m samples at fo, added into out.
void VoiceEngine::run(Voice &v, double *out, int m) {
  const double dtb = m / fo, dt = 1 / fo;
  // the vowel, gliding as the articulators move
  v.bend = glideTo(v.bend, expr.bendOf(v.key), dtb, BEND_T);
  const double vw = glideTo(v.vowel, expr.slideOr(v.key, P[p::vowel]), dtb, VOWEL_T);
  const double jw = glideTo(v.jaw, jawTarget(v, vw), dtb, VOWEL_T);
  if (vw != v.vowel || jw != v.jaw || v.larynx != P[p::larynx]) shape(v, vw, jw);
  // the pitch the singer aims for: the key, the bends, the vibrato (setting in after a moment) and
  // the flutter (white noise through two one-poles, scaled to unit rms)
  v.age += dtb;
  const double in = std::clamp((v.age - 0.2) / 0.4, 0.0, 1.0), depth = P[p::vibrato] * in * in * (3 - 2 * in);
  v.vibPhase += 2 * PI * P[p::vibRate] * dtb;
  if (v.vibPhase > 2 * PI) v.vibPhase -= 2 * PI;
  double flutter = 0;
  if (P[p::jitter] > 0) {
    const double a = 1 - exp(-2 * PI * FLUTTER_HZ * dtb), b = 1 - a;
    v.seed = v.seed * 1664525u + 1013904223u;
    const double g = ((v.seed >> 8) * (1.0 / 16777216.0) - 0.5) * 3.4641016151377544; // uniform, unit variance
    v.j1 += a * (g - v.j1); v.j2 += a * (v.j1 - v.j2);
    const double var = a * a * a * a * (1 + b * b) / ((1 - b * b) * (1 - b * b) * (1 - b * b));
    flutter = P[p::jitter] * v.j2 / std::sqrt(var);
  }
  v.fT = std::clamp(keyFreq(v.key) * keyboard.ratio(v.key) * bendNow * v.bend * pow(2.0, (depth * sin(v.vibPhase) + flutter) / 1200), 10.0, 0.2 * fo);
  // the lungs
  const double tau = v.stolen ? STEAL_T : v.held ? P[p::onset] : P[p::release] * v.liftK;
  const double gEnv = 1 - exp(-dt / tau), target = v.held ? 1 : 0;
  const double Pfull = P[p::pressure] * CMH2O * (0.35 + 0.95 * v.vel) * (1 + 0.8 * v.after) * lungs(v.Q);
  const double gMean = 1 - exp(-2 * PI * (v.fT / 6) * dt), gNoise = 1 - exp(-2 * PI * NOISE_HZ * dt);
  const bool rec = &v == newest;
  const int N = v.N;
  int cur = v.cur;
  double *F = v.F[cur], *B = v.B[cur];
  const double Z1 = (RHO * C) / v.area[0];
  for (int i = 0; i < m; i++) {
    v.env += gEnv * (target - v.env);
    v.Ps = v.env * Pfull;
    const double pm = B[0];
    const double U = v.folds.step(v.fc, dt, v.Ps, pm, Z1);
    // turbulence past the critical Reynolds number
    double pn = 0;
    const double Re = std::fabs(U) / (NU * LG);
    v.seed = v.seed * 1664525u + 1013904223u;
    v.noise += gNoise * (((v.seed >> 8) * (1.0 / 16777216.0) - 0.5) - v.noise);
    if (Re > RE_C) pn = NOISE * (Re * Re - RE_C * RE_C) * v.noise;
    const double up = pm + Z1 * U + pn;
    // the lips: the wave arriving is partly sent back, and the flow through them radiates
    const double pin = F[N - 1];
    const double back = v.lb0 * pin + v.lb1 * v.lx1 - v.la1 * v.ly1;
    v.lx1 = pin; v.ly1 = back;
    const double uL = (pin - back) / v.ZN;
    const double o = RAD * (uL - v.uL) * fo;
    v.uL = uL;
    out[i] += v.gain * o;
    // the junctions, each wave one section on (into the other buffer)
    double *Fn = v.F[cur ^ 1], *Bn = v.B[cur ^ 1];
    const double *r = v.r;
    for (int j = 0; j + 1 < N; j++) {
      const double w = r[j] * (F[j] - B[j + 1]);
      Fn[j + 1] = F[j] + w;
      Bn[j] = B[j + 1] + w;
    }
    Fn[0] = up * v.mu;
    Bn[N - 1] = back * v.mu;
    cur ^= 1; F = Fn; B = Bn;
    // the singer's ear: time each cycle of the folds, at the upward crossing of x₁'s mean
    const double x1 = v.folds.x1, s = x1 - v.mean;
    v.mean += gMean * (x1 - v.mean);
    if (rec && recN < REC) { rec_[0][recN] = x1; rec_[1][recN] = v.folds.x2; rec_[2][recN] = U; recN++; }
    v.lo = std::min(v.lo, s); v.hi = std::max(v.hi, s);
    if (s < -0.3 * v.amp) v.armed = true; // a Schmitt trigger: down past a third of the last swing, then up through the mean
    if (v.armed && v.sPrev < 0 && s >= 0) {
      v.armed = false;
      const double tc = (double)v.n - 1 + v.sPrev / (v.sPrev - s);
      if (v.lastCross >= 0 && v.hi - v.lo > SWING) { // a cycle of the folds, not a wobble of the mean
        const double f = fo / (tc - v.lastCross);
        if (f > 0.5 * v.fT && f < 2 * v.fT) {
          v.fMeas = f; v.lastValid = v.n;
          const double q0 = nominalQ(v.fT);
          v.Q = std::clamp(v.Q * exp(std::clamp(GAIN * log(v.fT / f), -STEP, STEP)), q0 / 2, std::min(2 * q0, qMax));
          v.fc = foldConstants(v.Q, P[p::thick], P[p::gap] * 1e-6);
        }
      }
      v.lastCross = tc; v.amp = (v.hi - v.lo) / 2; v.lo = v.hi = 0;
      if (rec) cycleDone();
    }
    v.sPrev = s;
    v.n++;
    v.level += 0.002 * (o * o - v.level);
  }
  v.cur = cur;
  // no note from the folds for a while, the breath up: the singer tries the jaw elsewhere, as one
  // feels for a note that will not come, and starts again from the nominal tension
  if (v.held && v.env > 0.5 && P[p::tuning] >= 0.5 && v.n - v.lastValid > fo * (RETRY + 3 / v.fT)) {
    v.jawTry = v.jawTry + JAW_TRY > JAW_MAX + 1e-9 ? 0 : v.jawTry + JAW_TRY;
    v.lastValid = v.n;
    v.Q = std::min(nominalQ(v.fT) * learned[v.key], qMax);
    v.fc = foldConstants(v.Q, P[p::thick], P[p::gap] * 1e-6);
  }
  if (!v.held && v.env < 1e-4 && v.level < 1e-12) v.alive = false;
}

// The newest voice finished a cycle: post it, ten samples of each, now and then.
void VoiceEngine::cycleDone() {
  const int n = recN;
  recN = 0;
  if (sinceCycle < (int)(fs / 30) || n < 10) return;
  sinceCycle = 0;
  Message m;
  m.type = msg::cycle; m.key = (int16_t)newest->key; m.count = 30;
  for (int k = 0; k < 10; k++) {
    const int i = (k * (n - 1)) / 9;
    m.values[k] = (float)(rec_[0][i] * 1e3);
    m.values[10 + k] = (float)(rec_[1][i] * 1e3);
    m.values[20 + k] = (float)(rec_[2][i] * 1e6);
  }
  post(m);
}

void VoiceEngine::process(float *L, float *R, int n) {
  for (int off = 0; off < n; off += 128) {
    const int k = std::min(128, n - off), m = k * os;
    for (int i = 0; i < m; i++) mix[i] = 0;
    if (hasP) {
      bendNow = glideTo(bendNow, bendTo, k / fs, BEND_T);
      for (Voice &v : voices) if (v.alive) run(v, mix, m);
    }
    for (int i = 0; i < k; i++) {
      double y;
      if (os == 1) y = mix[i];
      else {
        for (int q = 0; q < os; q++) { hist[hw] = hist[hw + TAPS] = mix[i * os + q]; hw = hw + 1 == TAPS ? 0 : hw + 1; }
        y = 0;
        for (int j = 0; j < TAPS; j++) y += h[j] * hist[hw + j];
      }
      const float s = (float)(OUT * y);
      L[off + i] = s; R[off + i] = s;
    }
    t += k; sinceCycle += k; sinceState += k;
    if (newest && !newest->alive) newest = nullptr;
    if (newest && sinceState >= (int)(fs / 60)) {
      sinceState = 0;
      const Voice &v = *newest;
      Message m;
      m.type = msg::state; m.key = (int16_t)v.key; m.count = 10;
      const double vals[10] = {v.fMeas, v.fT, v.Q, v.Ps / CMH2O, v.folds.a1 * 1e6, v.folds.a2 * 1e6, v.folds.U * 1e6, v.vowel, (double)voiceCount(), v.jaw};
      for (int i = 0; i < 10; i++) m.values[i] = (float)vals[i];
      post(m);
    }
  }
}

} // namespace forte::voice
