// dunes-engine.cpp — the Singing Dunes' engine (dunes-engine.h).

#include "dunes-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/fdlibm.h"

namespace forte::dunes {

using fdlibm::cos;
using fdlibm::exp;
using fdlibm::pow;

static constexpr double OUT = 0.25;      // the hall's level: a forte avalanche peaks around 0.3
static constexpr double RISE_T = 0.12;   // s: an avalanche gets going this fast
static constexpr double PUSH_T = 0.1;    // s: pushing more sand changes its speed this fast
static constexpr double STEAL_T = 0.02;  // s: a voice Medium or Low lets go comes to rest this fast
static constexpr double BEND_T = 0.02;  // s: a note's own bend glides this fast
static constexpr double U_REF = 1;       // m/s: the speed whose song is at full level
static constexpr double U_END = 0.002;   // m/s: an avalanche this slow has stopped
static constexpr double LAYER_LEVEL = 0.5; // the rattle in the layer, against the song in step
static constexpr double HISS_LEVEL = 0.6;
static constexpr double NEAR = 0.75;     // a patch's share on its own side of the face

DunesEngine::DunesEngine(double fs) : Engine(fs) {
  tables.assign((size_t)MIPS * (TABLE + 1), 0.0f);
  for (Voice &v : voices) v.pop.size(MAX_GRAINS);
  for (Biquad *b : {hissL, hissR}) { b[0].set(Biquad::hp, 900, 0.707, fs); b[1].set(Biquad::lp, 6000, 0.707, fs); }
  cosTable();
}

// The collision pulse, band-limited: harmonics 1..H of exp(−θ²/2w²), H = 32, 16, … 1.
void DunesEngine::buildTables() {
  const float *cs = cosTable();
  double a[H_MAX + 1];
  for (int k = 0; k <= H_MAX; k++) a[k] = pulseHarmonic(k, contact);
  for (int m = 0; m < MIPS; m++) {
    const int H = H_MAX >> m;
    float *tab = &tables[(size_t)m * (TABLE + 1)];
    for (int i = 0; i < TABLE; i++) {
      double v = 0;
      for (int k = 1; k <= H; k++) v += a[k] * cs[(k * i) % TABLE];
      tab[i] = (float)v;
    }
    tab[TABLE] = tab[0];
  }
  tableContact = contact;
}

void DunesEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  keyboard = tuningOf(P.data());
  theory = std::clamp((int)P[p::theory], 0, 1);
  spread = freqSpread(std::max(0.0, P[p::sorting]));
  water = std::max(0.0, P[p::damp]);
  contact = std::clamp(P[p::contact], 0.05, 0.6);
  speed = std::max(0.01, P[p::speed]);
  push = std::clamp(P[p::push], 0.0, 1.0);
  stopT = std::max(0.02, P[p::stop]);
  hiss = std::max(0.0, P[p::hiss]);
  layerQ = std::max(1.0, P[p::layerQ]);
  kc = criticalCoupling(spread, NOISE);
  onset = onsetSpeed(std::max(0.0, P[p::sorting]), water);
  if (contact != tableContact) buildTables();
  // the sounding avalanches follow: their sand (its note and spread), and how hard they are pushed
  for (Voice &v : voices) if (v.on) {
    if (v.layer != theory) start(v);
    else retune(v);
    v.push = std::clamp(expr.slideOr(v.key, push), 0.0, 1.0);
    if (v.held) setTarget(v);
  }
  hasP = true;
}

void DunesEngine::setTarget(Voice &v) {
  const double vv = v.vel * v.vel;
  v.target = speed * (vv + (1 - vv) * std::max(v.push, v.after));
}

// The grains' frequencies for the key's sand, and the waveguide's modes for its layer; phases kept.
void DunesEngine::retune(Voice &v) {
  v.f0 = keyFreq(v.key) * keyboard.ratio(v.key) * v.bent;
  const double room = 0.45 * fs / (v.f0 * (1 + 2.5 * spread));
  v.mip = MIPS - 1;
  for (int m = 0; m < MIPS; m++) if ((H_MAX >> m) <= room) { v.mip = m; break; }
  if (v.layer == theory_::grains) {
    Population &pop = v.pop;
    for (int j = 0; j < pop.n; j++) pop.w[j] = v.f0 * (1 + spread * invNormal((j + 0.5) / pop.n)) / fs;
    pop.tune(v.f0, fs);
  } else {
    const double H = layerDepth(v.f0);
    double norm = 0;
    v.modes = 0;
    for (int k = 1; k <= layerModes(); k++) {
      const double f = layerMode(k, H);
      if (f > 0.45 * fs) break;
      norm += 1.0 / (k * k);
      v.modes = k;
    }
    for (int k = 1; k <= v.modes; k++) {
      Voice::Mode &m = v.mode[k - 1];
      const double f = layerMode(k, H), sigma = std::numbers::pi * f / layerQ;
      const ModeCoeffs c = modeCoeffs(f, sigma, fs);
      // y = a1 y1 − a2 y2 + g x: a white rattle x of unit variance gives y an RMS of
      // g / (sin(ω/fs) √(4σ/fs)); set to 1/k, the modes together to 1
      m.a1 = c.a1; m.a2 = c.a2;
      m.g = fdlibm::sin(TAU * f / fs) * std::sqrt(4 * sigma / fs) / (k * std::sqrt(norm));
    }
  }
}

void DunesEngine::start(Voice &v) {
  v.layer = theory;
  v.surge = v.surge0 = 0;
  v.seed = 0x2545f491u ^ (uint32_t)(v.key * 2654435761u) ^ (uint32_t)t;
  if (v.layer == theory_::grains) v.pop.init(patches(), keyFreq(v.key) * keyboard.ratio(v.key), spread, fs, v.seed);
  for (Voice::Mode &m : v.mode) m.y1 = m.y2 = 0;
  retune(v);
}

void DunesEngine::noteOn(int key, double velocity) {
  if (!hasP || key < 21 || key > 108) return;
  Voice &v = voices[key - 21];
  v.key = key;
  if (!v.on) { v.U = 0; v.after = 0; v.bent = expr.bendOf(key); start(v); }
  v.on = v.held = true; v.dying = false;
  v.vel = std::clamp(velocity, 0.0, 1.0);
  v.push = std::clamp(expr.slideOr(key, push), 0.0, 1.0);
  setTarget(v);
  v.born = t;
  focus = key;
  // Quality: past 24 avalanches at High, 12 at Medium and 6 at Low, the oldest comes to rest (released first)
  const int cap = maxVoices();
  for (;;) {
    int count = 0;
    Voice *old = nullptr;
    for (Voice &x : voices) {
      if (!x.on || x.dying) continue;
      count++;
      if (&x == &v) continue;
      if (!old || (old->held && !x.held) || (old->held == x.held && x.born < old->born)) old = &x;
    }
    if (count <= cap || !old) break;
    old->held = false; old->dying = true; old->target = 0; old->brake = std::max(old->U, 0.01) / STEAL_T;
  }
}

// Lift: how fast the flow drains when the push stops: a slow lift lets it run on, to rest in up to
// four times the stopping time, a fast one stops it in a quarter of it.
void DunesEngine::noteOff(int key, double velocity) {
  if (key < 21 || key > 108) return;
  Voice &v = voices[key - 21];
  if (!v.on || !v.held) return;
  const double s = liftScale(velocity);
  v.held = false; v.target = 0;
  v.brake = std::max(v.U, 0.01) / (stopT * s * s); // friction: a constant deceleration, to rest in the stopping time
}

void DunesEngine::allNotesOff() {
  for (Voice &v : voices) { v.on = v.held = false; v.U = 0; }
}

void DunesEngine::pressure(double value, int key) {
  const double a = std::clamp(value, 0.0, 1.0);
  for (Voice &v : voices) if (v.on && (key < 0 || v.key == key)) { v.after = a; if (v.held) setTarget(v); }
}

void DunesEngine::slide(double value, int key) {
  expr.setSlide(value, key);
  if (key >= 21 && key <= 108) {
    Voice &v = voices[key - 21];
    if (v.on) { v.push = std::clamp(expr.slideOr(key, push), 0.0, 1.0); if (v.held) setTarget(v); }
  }
}

int DunesEngine::voiceCount() const {
  int c = 0;
  for (const Voice &v : voices) c += v.on;
  return c;
}

static inline uint32_t xorshift(uint32_t &s) { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return s; }
static inline double white(uint32_t &s) { return ((int32_t)xorshift(s)) * (1.7320508075688772 / 2147483648.0); } // unit variance

void DunesEngine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasP) return;
  const double dt = n / fs, wet = exp(-water / WATER_E);
  double flow = 0; // Σ U^1.5 now, for the hiss
  double flow0 = 0;
  for (Voice &v : voices) {
    if (!v.on) continue;
    // the shear rate (a note's own bend): the grains' boom and the layer's modes follow it
    if (const double to = expr.bendOf(v.key); v.bent != to) { v.bent = glideTo(v.bent, to, dt, BEND_T); retune(v); }
    // the avalanche's speed over this block: running up, pushed, or braking to rest
    const double U0 = v.U;
    if (v.held) v.U = glideTo(v.U, v.target, dt, v.target > v.U && v.U < 0.5 * v.target ? RISE_T : PUSH_T);
    else v.U = std::max(0.0, v.U - v.brake * dt);
    flow0 += pow(U0, 1.5); flow += pow(v.U, 1.5);
    // the avalanche runs in surges: its speed wanders (an Ornstein–Uhlenbeck walk) about its mean
    const double ka = dt / SURGE_T;
    v.surge0 = v.surge;
    v.surge += -ka * v.surge + SURGE * std::sqrt(2 * ka) * white(v.seed);
    const double K = coupling(v.U * (1 + v.surge), water);
    v.drive = K / kc;
    const double a0 = OUT * U0 * (1 + v.surge0) / U_REF, a1 = OUT * v.U * (1 + v.surge) / U_REF, da = (a1 - a0) / n;
    if (v.layer == theory_::grains) {
      Population &pop = v.pop;
      const double kdt = K * v.f0 / fs, ndt = std::sqrt(2 * NOISE * TAU * v.f0 / fs) / TAU;
      const float *pulse = &tables[(size_t)v.mip * (TABLE + 1)];
      const double scale = 2.0 / pop.n;
      for (int i = 0; i < n; i++) {
        double a, b;
        pop.step(kdt, ndt, pulse, a, b);
        const double g = (a0 + da * (i + 1)) * scale;
        L[i] = (float)(L[i] + g * (NEAR * a + (1 - NEAR) * b));
        R[i] = (float)(R[i] + g * (NEAR * b + (1 - NEAR) * a));
      }
    } else {
      for (int i = 0; i < n; i++) {
        const double x = white(v.seed) * (a0 + da * (i + 1)) * LAYER_LEVEL;
        double s = 0;
        for (int k = 0; k < v.modes; k++) {
          Voice::Mode &m = v.mode[k];
          const double y = m.a1 * m.y1 - m.a2 * m.y2 + m.g * x;
          m.y2 = m.y1; m.y1 = y; s += y;
        }
        L[i] = (float)(L[i] + s); R[i] = (float)(R[i] + s);
      }
    }
    if (!v.held && v.U <= U_END) {
      bool quiet = true;
      for (int k = 0; k < v.modes && v.layer == theory_::layer; k++) quiet = quiet && std::fabs(v.mode[k].y1) < 1e-5;
      if (quiet) { v.on = v.dying = false; v.U = 0; }
    }
  }
  // the hiss of the sliding sand, from the whole face
  if (hiss > 0 && (flow > 0 || flow0 > 0)) {
    const double h0 = OUT * HISS_LEVEL * hiss * wet * flow0, h1 = OUT * HISS_LEVEL * hiss * wet * flow, dh = (h1 - h0) / n;
    for (int i = 0; i < n; i++) {
      const double g = h0 + dh * (i + 1);
      const double l = hissL[1].run(hissL[0].run(white(hissSeed))), r = hissR[1].run(hissR[0].run(white(hissSeed)));
      L[i] = (float)(L[i] + g * l); R[i] = (float)(R[i] + g * r);
    }
  }
  t += n;
  if (messages && ++tick >= 8) { tick = 0; report(); }
}

// The focused key's grains for the page's views (msg::state): R, K/K_c, U, the onset speed, the
// patches, then their phases.
void DunesEngine::report() {
  Message m;
  m.type = msg::state;
  m.key = (int16_t)focus;
  const Voice *v = voiceOf(focus);
  const int np = v && v->layer == theory_::grains ? std::min(v->pop.n, 25) : 0;
  m.values[0] = v ? (float)(v->layer == theory_::grains ? v->pop.R() : 0) : 0;
  m.values[1] = v ? (float)v->drive : 0;
  m.values[2] = v ? (float)v->U : 0;
  m.values[3] = (float)onset;
  m.values[4] = (float)np;
  for (int j = 0; j < np; j++) m.values[5 + j] = (float)v->pop.phase[j];
  m.count = (uint16_t)(5 + np);
  post(m);
}

} // namespace forte::dunes
