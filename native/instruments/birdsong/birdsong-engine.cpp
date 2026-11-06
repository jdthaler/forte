// birdsong-engine.cpp — the Birdsong keyboard's engine (birdsong-engine.h).

#include "birdsong-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"
#include "forte/fdlibm.h"

namespace forte::birdsong {

using fdlibm::cos;
using fdlibm::exp;
using fdlibm::sin;

static constexpr double OUT = 0.32;      // the beak: a full breath's whistle peaks around 0.25
static constexpr int CHUNK = 16;         // output samples between retunings: bends, the OEC, the stealing
static constexpr double BEND_T = 0.02;   // s: bends and slides glide with this time constant
static constexpr double TRACK_T = 0.004; // s: how fast a tuned mouth follows the labia's frequency
static constexpr double STEAL_T = 0.006; // s: a stolen voice's breath goes this fast
static constexpr double END = 1e-4;      // a released voice ends when its breath and sound are down to this
static constexpr double EDGE = 0.2;      // the part of a syllable's sound its breath takes to rise, and to fall
static constexpr double AFTER = 0.5;     // aftertouch drives the labia up to this much harder
static constexpr double DC_CUT = 20;     // Hz: the output's DC block
static constexpr double GAIN_T = 0.01;   // s: a retuned voice's voicing glides with this time constant

// Kaiser window's I₀, by its series
static double besselI0(double x) {
  double s = 1, term = 1;
  for (int k = 1; k < 40; k++) { term *= (x / (2 * k)) * (x / (2 * k)); s += term; }
  return s;
}

BirdsongEngine::BirdsongEngine(double fs) : Engine(fs), fi(2 * fs) {
  // a half-band low-pass at fs/2 of the internal rate: 0.5 sinc(n/2), Kaiser β = 7 (≈ 70 dB)
  const int M = (TAPS - 1) / 2;
  double sum = 0;
  for (int i = 0; i < TAPS; i++) {
    const int n = i - M;
    const double s = n == 0 ? 0.5 : (n % 2 == 0 ? 0 : sin(0.25 * TAU * n) / (0.5 * TAU * n));
    const double u = (double)n / M;
    fir[i] = s * besselI0(7 * std::sqrt(std::max(0.0, 1 - u * u))) / besselI0(7);
    sum += fir[i];
  }
  for (double &c : fir) c /= sum;
  dcR = exp(-TAU * DC_CUT / fs);
  stateEvery = 128 * (int)std::ceil(fs / 128 / 30); // at most 30 times a second, in whole blocks
}

void BirdsongEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  syllable = (int)P[p::syllable];
  tension = P[p::tension]; drive = P[p::drive]; duty = P[p::duty]; sweep = P[p::sweep]; turb = P[p::noise];
  L = P[p::trachea] / 100; r = P[p::reflect]; foFixed = P[p::oec]; Q = P[p::q]; track = P[p::track] > 0.5;
  const forte::Tuning kb = tuningOf(P.data());
  if (!hasP || !(kb == keyboard)) {
    keyboard = kb;
    for (int k = 0; k < 128; k++) keyTarget[k] = keyFreq(k) * keyboard.ratio(k);
  }
  hasP = true;
  for (Voice &v : voices) if (v.alive) {
    v.stale = true; // retuned a voice a chunk (each may need its limit cycle found)
    v.aIn = 1 - exp(-1 / (fi * P[p::inhale] * (1.5 - v.vel)));
    v.aOut = 1 - exp(-1 / (fi * (v.stolen ? STEAL_T : P[p::exhale] * v.liftK)));
  }
}

// The limit cycle at (α, β), found once and kept: a chord's keys, struck alike, share one.
const Cycle &BirdsongEngine::cycleAt(double alpha, double beta) {
  for (const Cached &c : cache) if (c.used && c.a == alpha && c.b == beta) return c.c;
  Cached &c = cache[cacheNext];
  cacheNext = (cacheNext + 1) % (int)cache.size();
  c.used = true; c.a = alpha; c.b = beta; c.c = limitCycle(alpha, beta);
  return c.c;
}

// A voice's tuning at its breath: its drive from the velocity, the limit cycle there, γ for the
// note, and the voicing: the vocal tract's power gain on the cycle's harmonics, undone.
void BirdsongEngine::tune(Voice &v) {
  v.stale = false;
  const double beta = -tension;
  v.d = drive * (0.25 + 0.75 * v.vel);
  v.flow = std::sqrt(v.d / drive);
  const Cycle &c = cycleAt(onset(beta) - v.d, beta);
  v.fNote = keyTarget[v.key & 127];
  v.omega = c.ok ? c.omega : std::sqrt(std::max(0.01, tension));
  v.gamma = TAU * v.fNote / v.omega;
  double in = 0, out = 0;
  if (c.ok) for (int k = 0; k < HARMONICS; k++) {
    const double f = (k + 1) * v.fNote;
    if (f > 0.45 * fs) break;
    const double g = c.c[k] * tracheaGain(f, L, r) * oecGain(f, track ? v.fNote : foFixed, Q);
    in += c.c[k] * c.c[k]; out += g * g;
  }
  v.voicing = out > 0 ? std::min(100.0, std::sqrt(in / out)) : 1;
}

// The OEC's band-pass (unit gain at its peak), tuned to fo at the internal rate.
void BirdsongEngine::oec(Voice &v) {
  const double f = std::clamp(v.foTo, 20.0, 0.45 * fs);
  if (std::fabs(f - v.fo) <= 1e-4 * f) return;
  v.fo = f;
  const double w = TAU * f / fi, al = sin(w) / (2 * Q), a0 = 1 + al;
  v.b0 = al / a0; v.a1 = -2 * cos(w) / a0; v.a2 = (1 - al) / a0;
}

void BirdsongEngine::start(Voice &v, int key, double velocity) {
  v.alive = true; v.held = true; v.stolen = false;
  v.key = key; v.born = t;
  v.vel = std::clamp(velocity, 0.0, 1.0); v.after = 0;
  v.env = 0; v.phase = 0;
  v.rate = expr.slideOr(key, P[p::rate]);
  v.bend = expr.bendOf(key);
  v.hmax = pick(H_MAX, 0.2, 0.3); // Quality: longer steps
  v.s = State{restX(ALPHA_REST, -tension), 0};
  v.alpha = ALPHA_REST; v.beta = -tension; v.e = 0;
  for (double &x : v.line) x = 0;
  v.w = 0; v.z1 = v.z2 = 0; v.dcx = v.dcy = 0;
  v.sx = v.s.x; v.sy = 0;
  v.prevV = 0; v.sinceCross = -1; v.peak = 0;
  tune(v);
  v.gainNow = v.voicing * v.flow;
  v.fSung = v.fNote * bendNow * v.bend;
  v.foTo = track ? v.fSung : foFixed; v.fo = 0;
  oec(v);
  v.aIn = 1 - exp(-1 / (fi * P[p::inhale] * (1.5 - v.vel)));
  v.liftK = 1;
  v.aOut = 1 - exp(-1 / (fi * P[p::exhale]));
}

// Past the Quality's voices, the oldest released voice breathes out fast, else the oldest held one;
// never the voice just struck.
void BirdsongEngine::steal(const Voice *keep) {
  Voice *victim = nullptr;
  for (int pass = 0; pass < 2 && !victim; pass++)
    for (Voice &v : voices)
      if (v.alive && !v.stolen && &v != keep && (pass == 1 || !v.held) && (!victim || v.born < victim->born)) victim = &v;
  if (!victim) return;
  victim->stolen = true; victim->held = false;
  victim->aOut = 1 - exp(-1 / (fi * STEAL_T));
}

void BirdsongEngine::noteOn(int key, double velocity) {
  if (!hasP || key < 0 || key > 127) return;
  for (Voice &v : voices) if (v.alive && !v.stolen && v.key == key) { // sung again while it sounds
    v.held = true; v.vel = std::clamp(velocity, 0.0, 1.0); v.phase = 0;
    v.aIn = 1 - exp(-1 / (fi * P[p::inhale] * (1.5 - v.vel)));
    v.liftK = 1;
    v.aOut = 1 - exp(-1 / (fi * P[p::exhale]));
    tune(v);
    newest = &v;
    return;
  }
  Voice *v = nullptr;
  for (Voice &x : voices) if (!x.alive) { v = &x; break; }
  if (!v) { // every slot sounding: the quietest released one goes at once, else the oldest
    for (Voice &x : voices) if (!x.held && (!v || x.env < v->env)) v = &x;
    if (!v) for (Voice &x : voices) if (!v || x.born < v->born) v = &x;
  }
  start(*v, key, velocity);
  newest = v;
  int live = 0;
  for (const Voice &x : voices) live += x.alive && !x.stolen;
  if (live > pick(kMaxVoices, 12, 6)) steal(v); // Quality: fewer birds at once
}

// Lift: how fast the air sacs empty: a slow lift lets the song fall away (up to four times the
// usual), a fast one clips it (a quarter of it).
void BirdsongEngine::noteOff(int key, double velocity) {
  if (key < 0 || key > 127) return;
  const double s = liftScale(velocity);
  for (Voice &v : voices) if (v.alive && v.held && v.key == key) {
    v.held = false;
    if (s * s != v.liftK) { v.liftK = s * s; v.aOut = 1 - exp(-1 / (fi * P[p::exhale] * v.liftK)); }
  }
}

void BirdsongEngine::allNotesOff() {
  for (Voice &v : voices) v.held = false;
}

void BirdsongEngine::pressure(double value, int key) { // aftertouch: one key (poly) or every held key (channel, −1)
  for (Voice &v : voices) if (v.alive && v.held && (key < 0 || v.key == key)) v.after = std::clamp(value, 0.0, 1.0);
}

void BirdsongEngine::bend(double value) {
  bendTo = fdlibm::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12);
}

int BirdsongEngine::voiceCount() const {
  int n = 0;
  for (const Voice &v : voices) n += v.alive;
  return n;
}

// xorshift64*, then four uniforms summed: noise of unit variance, the same everywhere
double BirdsongEngine::noise() {
  double s = 0;
  for (int i = 0; i < 4; i++) {
    rng ^= rng >> 12; rng ^= rng << 25; rng ^= rng >> 27;
    s += (double)((rng * 0x2545F4914F6CDD1Dull) >> 11) * (1.0 / 9007199254740992.0);
  }
  return (s - 2) * 1.7320508075688772;
}

// The syllable's gesture at the voice's phase: the labial tension, and the breath's gate (1: on).
double BirdsongEngine::tensionAt(const Voice &v, double &gate) const {
  gate = 1;
  const double reach = sweep * std::max(std::fabs(tension), 0.25);
  if (syllable == syllable_::whistle) return tension;
  if (syllable == syllable_::warble) return tension + reach * sin(TAU * v.phase);
  const double u = v.phase / duty;
  if (u >= 1) { gate = 0; return syllable == syllable_::up ? tension + reach : syllable == syllable_::down ? tension - reach : tension; }
  const double edge = std::min({1.0, u / EDGE, (1 - u) / EDGE}), s = sin(0.25 * TAU * edge);
  gate = s * s;
  if (syllable == syllable_::up) return tension + reach * (2 * u - 1);
  if (syllable == syllable_::down) return tension - reach * (2 * u - 1);
  return tension;
}

// n internal samples of one voice, added into mix.
void BirdsongEngine::run(Voice &v, double *mix, int n) {
  const double T = 2 * L / C_AIR * fi, Th = 0.5 * T;
  const int Ti = (int)T, Thi = (int)Th;
  const double Tf = T - Ti, Thf = Th - Thi;
  const double dNow = v.d * (1 + AFTER * v.after);
  const double gain = OUT * v.gainNow;
  const bool isNewest = &v == newest;
  const double dPhase = v.rate / fi;
  double peak = 0;
  for (int i = 0; i < n; i++) {
    // the breath and the gesture
    v.env += ((v.held ? 1.0 : 0.0) - v.env) * (v.held ? v.aIn : v.aOut);
    double gate;
    const double tau = tensionAt(v, gate);
    v.phase += dPhase;
    if (v.phase >= 1) v.phase -= std::floor(v.phase);
    v.e = v.env * gate;
    v.beta = -tau;
    v.alpha = ALPHA_REST + (onset(v.beta) - dNow - ALPHA_REST) * v.e;
    const double a = v.alpha + (turb > 0 ? turb * v.e * noise() : 0);
    // the labia
    for (int k = 0; k < v.sub; k++) rk4(v.s, a, v.beta, v.h);
    if (!(std::fabs(v.s.x) < 10 && std::fabs(v.s.v) < 100)) v.s = State{restX(ALPHA_REST, v.beta), 0}; // never: kept finite
    // the frequency they sing: between v's upward zeros
    if (v.sinceCross >= 0) v.sinceCross += 1;
    if (v.prevV < 0 && v.s.v >= 0) {
      const double frac = v.s.v / (v.s.v - v.prevV); // how far back the zero was, in samples
      if (v.sinceCross > 0) {
        const double period = v.sinceCross - frac;
        if (period > 1) v.fSung = fi / period;
      }
      v.sinceCross = frac;
    }
    v.prevV = v.s.v;
    // the airflow into the trachea: Pᵢ = A x − r Pᵢ(t − T), out (1 − r) Pᵢ(t − T/2)
    const auto tap = [&](int d, double fr) {
      const double a0 = v.line[(v.w - d) & (LINE - 1)], a1 = v.line[(v.w - d - 1) & (LINE - 1)];
      return a0 + (a1 - a0) * fr;
    };
    // the flow's modulation: its slow part (the labia's mean opening, which moves with the breath and
    // the gesture) carries no sound out of the beak, so it goes, below an eighth of the note
    const double xs = v.s.x - v.sx + v.sR * v.sy;
    v.sx = v.s.x; v.sy = xs;
    const double src = v.e * xs;
    v.w = (v.w + 1) & (LINE - 1);
    v.line[v.w] = 0;
    const double pi = src - r * tap(Ti, Tf);
    v.line[v.w] = pi;
    const double pt = (1 - r) * tap(Thi, Thf);
    // the OEC's band-pass, then the DC block
    const double y = v.b0 * pt + v.z1;
    v.z1 = -v.a1 * y + v.z2;
    v.z2 = -v.b0 * pt - v.a2 * y;
    const double o = gain * y;
    const double dc = o - v.dcx + dcR * v.dcy;
    v.dcx = o; v.dcy = dc;
    mix[i] += dc;
    peak = std::max(peak, std::fabs(dc));
    if (isNewest) { ringW = (ringW + 1) & (RING - 1); ringX[ringW] = (float)v.s.x; ringV[ringW] = (float)v.s.v; }
  }
  v.peak = std::max(v.peak, peak);
}

void BirdsongEngine::process(float *L, float *R, int n) {
  if (!hasP) { for (int i = 0; i < n; i++) L[i] = R[i] = 0; return; }
  for (int at = 0; at < n; at += CHUNK) {
    const int m = std::min(CHUNK, n - at);
    const double dt = m / fs;
    bendNow = glideTo(bendNow, bendTo, dt, BEND_T);
    bool retuned = false;
    double mix[2 * CHUNK] = {};
    for (Voice &v : voices) {
      if (!v.alive) continue;
      if (v.stale && !retuned) { tune(v); retuned = true; }
      v.bend = glideTo(v.bend, expr.bendOf(v.key), dt, BEND_T);
      v.rate = glideTo(v.rate, expr.slideOr(v.key, P[p::rate]), dt, BEND_T);
      // RK4 steps for an internal sample: γ (with the bends) / fi in τ, in steps of at most hmax
      const double span = v.gamma * bendNow * v.bend / fi;
      v.sub = std::max(1, (int)std::ceil(span / v.hmax));
      v.h = span / v.sub;
      // a tuned mouth follows the frequency the labia sing (from the note's, with the bends)
      const double sung = v.e > 0.05 ? v.fSung : v.fNote * bendNow * v.bend;
      v.foTo = track ? glideTo(v.foTo, sung, dt, TRACK_T) : foFixed;
      oec(v);
      v.gainNow = glideTo(v.gainNow, v.voicing * v.flow, dt, GAIN_T);
      v.sR = exp(-TAU * std::max(5.0, v.fNote * bendNow * v.bend / 8) / fi);
      v.peak = 0;
      run(v, mix, 2 * m);
      if (!v.held && v.env < END && v.peak < END) v.alive = false;
    }
    // decimate: the half-band low-pass at the internal rate, every other sample
    for (int i = 0; i < m; i++) {
      for (int j = 0; j < 2; j++) {
        hw = (hw + 1) % TAPS;
        hist[hw] = hist[hw + TAPS] = mix[2 * i + j];
      }
      double y = 0;
      const double *hp = hist + hw + 1; // the oldest of the last TAPS samples
      for (int k = 0; k < TAPS; k++) y += fir[k] * hp[k];
      L[at + i] = R[at + i] = (float)y;
    }
    t += m;
  }
  if ((sinceState += n) >= stateEvery) {
    sinceState = 0;
    const Voice *v = newest && newest->alive ? newest : nullptr;
    if (v) {
      Message s;
      s.type = msg::state; s.key = (int16_t)v->key;
      s.values[0] = (float)v->alpha; s.values[1] = (float)-v->beta; s.values[2] = (float)v->e;
      s.values[3] = (float)v->fSung; s.values[4] = (float)(v->fNote * bendNow * v->bend);
      s.values[5] = (float)onset(-tension); s.values[6] = (float)(v->d * (1 + AFTER * v->after)); s.values[7] = (float)v->fo;
      // the last period's (x, v), TRAIL points from the newest back
      const double per = v->fSung > 0 ? std::min((double)RING - 1, fi / v->fSung) : 64;
      for (int j = 0; j < TRAIL; j++) {
        const int at = (ringW - (int)std::lround(per * j / TRAIL)) & (RING - 1);
        s.values[8 + 2 * j] = ringX[at]; s.values[9 + 2 * j] = ringV[at];
      }
      s.count = 8 + 2 * TRAIL;
      post(s);
    }
  }
}

} // namespace forte::birdsong
