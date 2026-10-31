// ondes-engine.cpp — the ondes Martenot's engine (ondes-engine.h).

#include "ondes-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/fdlibm.h"

namespace forte::ondes {

using fdlibm::atan2;
using fdlibm::cos;
using fdlibm::exp;
using fdlibm::log;
using fdlibm::pow;
using fdlibm::sin;

static constexpr double OUT = 0.32;       // a note at velocity 0.7 peaks around 0.15
static constexpr int CHUNK = 16;          // samples between retunings: the slides, bends, vibrato and gains
static constexpr double BEND_T = 0.02;    // s: bends and the vibrato's depth glide with this time constant
static constexpr double STEAL_T = 0.004;  // s: a stolen voice's key comes up this fast
static constexpr double DRIFT_T = 4;      // s: how long the oscillators' drift takes to wander
static constexpr double LN1000 = 6.907755278982137;
static constexpr double TOP = 0.3;        // a note plays at most 0.3 fs

// polyBLEP and polyBLAMP: what a unit step (or a unit change of slope, per sample) at t = 0 leaves
// at a sample t from it, |t| < 1, once band-limited.
static inline double blep(double t) { return t < 0 ? t + t * t / 2 + 0.5 : t - t * t / 2 - 0.5; }
static inline double blamp(double t) {
  return t < 0 ? t * t * t / 6 + t * t / 2 + t / 2 + 1.0 / 6 : -t * t * t / 6 + t * t / 2 - t / 2 + 1.0 / 6;
}

template <int N>
void Bank<N>::add(double f, double sigma, double gain, double fs) {
  if (n >= N) return;
  const double r = exp(-sigma / fs), w = 2 * PI * f / fs;
  pr[n] = r * cos(w); pi[n] = r * sin(w); g[n] = gain;
  n++;
}
template <int N>
void Bank<N>::normalise() {
  double power = 0; // Re z of z ← p z + x, x white of unit power: ½ Σ g²/(1 − |p|²)
  for (int k = 0; k < n; k++) power += 0.5 * g[k] * g[k] / (1 - (pr[k] * pr[k] + pi[k] * pi[k]));
  norm = power > 0 ? 1 / std::sqrt(power) : 0;
}

OndesEngine::OndesEngine(double fs) : Engine(fs) {
  plateModes(); // solved now, not on the audio thread
  stateEvery = 128 * (int)std::ceil(fs / 128 / 30);
  for (int i = 0; i < kPool; i++) voices[i].seed = 0x2545F491u * (uint32_t)(i + 1);
}

double OndesEngine::random() {
  rng = rng * 1664525u + 1013904223u;
  return (double)(rng >> 8) / 8388608.0 - 1;
}

// The detector: the envelope of the two oscillators' sum, |1 + a e^{iφ}|, as a wave of unit
// fundamental around its mean.
void OndesEngine::detector() {
  const int n = 512;
  double s0 = 0, s1 = 0;
  for (int i = 0; i < n; i++) {
    const double th = 2 * PI * (i + 0.5) / n, e = std::sqrt(1 + a * a + 2 * a * cos(th));
    s0 += e; s1 += e * cos(th);
  }
  m0 = s0 / n; c1 = 2 * s1 / n;
}

void OndesEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  const bool r = (int)P[p::mode] == mode_::ribbon;
  if (hasP && r != ribbon) { for (Voice &v : voices) v.held = false; held = 0; } // a change of playing lifts the fingers
  ribbon = r;
  K = P[p::pull];
  if (!hasP || P[p::balance] != a) { a = P[p::balance]; detector(); }
  // the drawer: each timbre switched on, sharing the level
  const bool on[5] = {P[p::tO] > 0.5, P[p::tC] > 0.5, P[p::tg] > 0.5, P[p::tG] > 0.5, P[p::tN] > 0.5};
  const int count = on[0] + on[1] + on[2] + on[3] + on[4];
  const double share = count ? 1 / std::sqrt((double)count) : 0;
  wO = on[0] * share; wC = on[1] * share; wg = on[2] * share; wG = on[3] * share; wN = on[4] * share;
  width = P[p::width]; octave = P[p::octave]; souffle = P[p::souffle];
  sN = PI / 2; // the pulse swings as far as the gamba's square
  cN = cos(PI * width);
  // where φ crosses a step or a corner of the timbres, and by how much (per radian of φ for a corner)
  nEdges = 0;
  const double sq = PI / 4, oc = 3 * PI / 4 * octave;
  if (wG > 0 || wC > 0 || oc > 0) {
    edges[nEdges++] = {0, -1, 2 * sq * wG, 2 * wC + 2 * oc};  // φ = −π/2
    edges[nEdges++] = {0, 1, -2 * sq * wG, 2 * wC + 2 * oc};  // φ = +π/2
  }
  if (wg > 0) {
    edges[nEdges++] = {1, 0, 0, -PI / 2 * wg};  // φ = 0: the triangle's top
    edges[nEdges++] = {-1, 0, 0, PI / 2 * wg};  // φ = π: its bottom
  }
  if (wN > 0) {
    const double sw = sin(PI * width);
    edges[nEdges++] = {cN, -sw, sN * wN, 0};  // φ = −πw: the pulse on
    edges[nEdges++] = {cN, sw, -sN * wN, 0};  // φ = +πw: off
  }
  const forte::Tuning kb = tuningOf(P.data());
  const bool retune = !hasP || !(kb == keyboard);
  if (retune) {
    keyboard = kb;
    for (int k = 0; k < 128; k++) keyTarget[k] = keyFreq(k) * keyboard.ratio(k);
  }
  dP = P[p::dP]; dR = P[p::dR]; dM = P[p::dM]; dPalme = P[p::dPalme];
  hasP = true;
  buildDiffuseurs();
  for (Voice &v : voices) if (v.alive) {
    if (!ribbon && retune) v.u = v.uTo = std::log2(keyTarget[v.key]);
    v.aPress = 1 - exp(-1 / (fs * P[p::press]));
    v.aLift = 1 - exp(-1 / (fs * (v.stolen ? STEAL_T : P[p::lift])));
  }
}

// The diffuseurs' filters, modes and strings, rebuilt when what they depend on changes.
void OndesEngine::buildDiffuseurs() {
  const double fmax = std::min(pick(6000.0, 3000.0, 1500.0), 0.45 * fs);
  hpP.set(Biquad::hp, 55, 0.7, fs);
  lpP.set(Biquad::lp, 7000, 0.7, fs);
  hpR.set(Biquad::hp, 55, 0.7, fs);
  const double key[8] = {P[p::springT60], P[p::gongD], P[p::gongT60], P[p::palmeT60], (double)quality, keyTarget[57], keyTarget[69], keyTarget[80]};
  bool same = true;
  for (int i = 0; i < 8; i++) same = same && key[i] == builtFor[i];
  if (same) return;
  for (int i = 0; i < 8; i++) builtFor[i] = key[i];
  builtQuality = quality;
  // the springs: pinned at both ends, modes at k = nπ/L on the dispersion relation, driven and
  // heard through the end on the voice coil (∝ k), a constant loss factor (T60 ∝ 1/f, at most 3×)
  springs.n = 0;
  const double eps = 1 / SPRING_R, t60s = P[p::springT60];
  for (int j = 0; j < pick(SPRINGS, 4, 2); j++) { // Quality: fewer springs
    for (int nn = 1; nn < 400; nn++) {
      const double k = nn * PI / SPRING_L[j], f = springOmega(k) / (2 * PI);
      if (k > eps && f > fmax) break;
      if (f < 30 || f > fmax) continue;
      const double t60 = std::min(3 * t60s, t60s * 500 / f);
      springs.add(f, LN1000 / t60, (k / eps) * (k / eps) * 2 / SPRING_L[j], fs);
    }
  }
  springs.normalise();
  springs.clear();
  // the tam-tam: the free plate's modes in the band, driven and heard at the voice coil
  gong.n = 0;
  const double hz = plateHzPerLam2(P[p::gongD] / 100), t60g = P[p::gongT60];
  for (const PlateMode &m : plateModes()) {
    const double f = hz * m.lam * m.lam;
    if (f > fmax) break;
    if (f < 40 || m.w * m.w < 1e-4) continue;
    const double t60 = std::min(3 * t60g, t60g * 1000 / f);
    gong.add(f, LN1000 / t60, m.w * m.w, fs);
  }
  gong.normalise();
  gong.clear();
  // the palme's strings: each loop's delay, fraction and loss for its note in the keyboard's tuning
  const double t60p = P[p::palmeT60];
  for (int i = 0; i < PALME; i++) {
    PalmeString &s = palme[i];
    const double f = keyTarget[palmeKey(i)], D = fs / f, w = 2 * PI * f / fs;
    const double tlp = atan2(s.c * sin(w), 1 - s.c * cos(w)) / w; // the loss filter's phase delay
    s.N = std::clamp((int)std::floor(D - tlp - 0.5), 2, PalmeString::SIZE - 2);
    const double d = D - tlp - s.N;
    s.a = (1 - d) / (1 + d);
    const double hl = (1 - s.c) / std::sqrt(1 - 2 * s.c * cos(w) + s.c * s.c);
    s.g = pow(10.0, -3 / (t60p * f)) / hl;
    s.weight = 1 - s.g * hl; // a sine on its note rings it to about its own level
    for (double &b : s.buf) b = 0;
    s.x1 = s.y1 = s.l1 = 0;
  }
}

// A key comes down: the beat starts from φ = 0, as the variable oscillator is switched to its
// capacitor, and the intensity key starts to press.
void OndesEngine::start(Voice &v, int key, double velocity) {
  v.alive = true; v.held = true; v.stolen = false;
  v.key = key; v.born = t;
  v.vel = std::clamp(velocity, 0.0, 1.0); v.after = 0; v.F = 0; v.g0 = v.g1 = 0;
  v.u = v.uTo = std::log2(keyTarget[key]); v.uRate = 0;
  v.bend = expr.bendOf(key);
  v.vib = expr.slideOr(key, P[p::vibrato]);
  v.zr = 1; v.zi = 0; v.prev = 0;
  v.b0 = v.b1 = v.b2 = 0;
  v.aPress = 1 - exp(-1 / (fs * P[p::press]));
  v.aLift = 1 - exp(-1 / (fs * P[p::lift]));
  update(v, 0, 0);
}

// Past the Quality's voices, the oldest lifted voice lets go fast, else the oldest held one.
void OndesEngine::steal(const Voice *keep) {
  Voice *victim = nullptr;
  for (int pass = 0; pass < 2 && !victim; pass++)
    for (Voice &v : voices)
      if (v.alive && !v.stolen && &v != keep && (pass == 1 || !v.held) && (!victim || v.born < victim->born)) victim = &v;
  if (!victim) return;
  victim->stolen = true; victim->held = false;
  victim->aLift = 1 - exp(-1 / (fs * STEAL_T));
}

void OndesEngine::noteOn(int key, double velocity) {
  if (!hasP || key < 0 || key > 127) return;
  if (ribbon) {
    int j = 0;
    for (int i = 0; i < held; i++) if (stack[i] != key) stack[j++] = stack[i];
    held = j; stack[held++] = key;
    Voice *w = nullptr;
    for (Voice &v : voices) if (v.alive && !v.stolen) { w = &v; break; }
    if (w && w->held) { // the ring slides along the ribbon to the new key
      w->key = key; w->uTo = std::log2(keyTarget[key]);
      w->uRate = std::fabs(w->uTo - w->u) / P[p::glide];
      newest = w;
      return;
    }
    if (w) { // still dying away: the ring lands on the new key and the intensity key presses again
      w->held = true; w->key = key; w->u = w->uTo = std::log2(keyTarget[key]); w->uRate = 0;
      w->vel = std::clamp(velocity, 0.0, 1.0);
      w->bend = expr.bendOf(key);
      w->aPress = 1 - exp(-1 / (fs * P[p::press]));
      newest = w;
      return;
    }
  } else {
    for (Voice &v : voices) if (v.alive && !v.stolen && v.key == key) { // pressed again while it sounds
      v.held = true; v.vel = std::clamp(velocity, 0.0, 1.0);
      newest = &v;
      return;
    }
  }
  Voice *v = nullptr;
  for (Voice &x : voices) if (!x.alive) { v = &x; break; }
  if (!v) {
    for (Voice &x : voices) if (!x.held && (!v || x.F < v->F)) v = &x;
    if (!v) for (Voice &x : voices) if (!v || x.born < v->born) v = &x;
  }
  start(*v, key, velocity);
  newest = v;
  int live = 0;
  for (const Voice &x : voices) live += x.alive && !x.stolen;
  if (live > pick(kMaxVoices, 12, 6)) steal(v); // Quality: fewer voices at once
}

void OndesEngine::noteOff(int key, double) {
  if (key < 0 || key > 127) return;
  if (ribbon) {
    int j = 0;
    for (int i = 0; i < held; i++) if (stack[i] != key) stack[j++] = stack[i];
    held = j;
    for (Voice &v : voices) if (v.alive && v.held && v.key == key) {
      if (held > 0) { // back to the key still down
        v.key = stack[held - 1]; v.uTo = std::log2(keyTarget[v.key]);
        v.uRate = std::fabs(v.uTo - v.u) / P[p::glide];
      } else v.held = false;
    }
    return;
  }
  for (Voice &v : voices) if (v.alive && v.held && v.key == key) v.held = false;
}

void OndesEngine::allNotesOff() {
  for (Voice &v : voices) v.held = false;
  held = 0;
}

void OndesEngine::pressure(double value, int key) {
  for (Voice &v : voices) if (v.alive && v.held && (key < 0 || v.key == key)) v.after = std::clamp(value, 0.0, 1.0);
}

void OndesEngine::bend(double value) {
  bendTo = pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12);
}

int OndesEngine::voiceCount() const {
  int n = 0;
  for (const Voice &v : voices) n += v.alive;
  return n;
}

// A chunk of m samples: the ring's slide, the bends, the vibrato, the drift, and Adler's step for
// the difference they give; the intensity key's force at the chunk's end, and its gain.
void OndesEngine::update(Voice &v, double dt, int m) {
  if (v.u != v.uTo) {
    const double s = v.uRate * dt;
    v.u = std::fabs(v.uTo - v.u) <= s ? v.uTo : v.u + (v.uTo > v.u ? s : -s);
  }
  v.bend = glideTo(v.bend, expr.bendOf(v.key), dt, BEND_T);
  v.vib = glideTo(v.vib, expr.slideOr(v.key, P[p::vibrato]), dt, BEND_T);
  double f = pow(2.0, v.u) * bendNow * v.bend;
  if (v.vib > 0) f *= pow(2.0, v.vib * sin(vibPhase) / 1200);
  f = std::clamp(f, 1.0, TOP * fs);
  v.f = f;
  v.delta = std::max(1.0, trimFor(f, K) + driftHz);
  v.step = adlerStep(2 * PI * v.delta, 2 * PI * K, 1 / fs);
  const double target = v.held ? keyForce(v.vel, v.after) : 0;
  v.F = target + (v.F - target) * pow(1 - (v.held ? v.aPress : v.aLift), (double)m);
  v.g0 = v.g1;
  v.g1 = keyGain(v.F);
}

// One sample of a voice, before its gain: the beat steps on, and the timbres are read from φ.
inline double OndesEngine::voiceSample(Voice &v) {
  const Mobius &q = v.step;
  const double xr = v.zr, xi = v.zi;
  const double nr = q.ar * xr - q.ai * xi + q.b, ni = q.ar * xi + q.ai * xr;
  const double dr = q.c * xr + q.dr, di = q.c * xi + q.di, dd = dr * dr + di * di;
  const double zr = (nr * dr + ni * di) / dd, zi = (ni * dr - nr * di) / dd;
  v.zr = zr; v.zi = zi;
  // the timbres as they are now
  double cur = 0;
  if (wO > 0) cur += wO * (std::sqrt(1 + a * a + 2 * a * zr) - m0) / c1;
  if (wC > 0) cur += wC * (2 * std::max(zr, 0.0) - 2 / PI);
  if (wg > 0) cur += wg * (PI / 4) * atan2(zr, std::fabs(zi));
  if (wG > 0) cur += wG * (PI / 4) * (zr >= 0 ? 1 : -1);
  if (wN > 0) cur += wN * sN * ((zr > cN ? 1 : 0) - width);
  if (octave > 0) cur += octave * (3 * PI / 4) * (std::fabs(zr) - 2 / PI);
  // the steps and corners φ crossed during the sample, band-limited
  for (int e = 0; e < nEdges; e++) {
    const Edge &E = edges[e];
    const double oi = xi * E.c - xr * E.s, ni2 = zi * E.c - zr * E.s;
    if (!(oi < 0 && ni2 >= 0)) continue;
    const double orr = xr * E.c + xi * E.s, nrr = zr * E.c + zi * E.s;
    if (nrr <= 0) continue;
    const double a0 = atan2(oi, orr), a1 = atan2(ni2, nrr), dphi = a1 - a0;
    if (dphi <= 0) continue;
    const double x = -a0 / dphi, slope = E.slope * dphi;
    v.prev += E.step * blep(-x) + slope * blamp(-x);
    cur += E.step * blep(1 - x) + slope * blamp(1 - x);
  }
  double out = v.prev;
  v.prev = cur;
  if (souffle > 0) { // pink noise (Kellet's filter)
    v.seed = v.seed * 1664525u + 1013904223u;
    const double w = (double)(v.seed >> 8) / 8388608.0 - 1;
    v.b0 = 0.99765 * v.b0 + w * 0.0990460;
    v.b1 = 0.96300 * v.b1 + w * 0.2965164;
    v.b2 = 0.57000 * v.b2 + w * 1.0526913;
    out += souffle * 0.35 * (v.b0 + v.b1 + v.b2 + w * 0.1848);
  }
  return out;
}

void OndesEngine::process(float *L, float *R, int n) {
  if (!hasP) { for (int i = 0; i < n; i++) L[i] = R[i] = 0; return; }
  if (quality != builtQuality) buildDiffuseurs();
  // the diffuseurs' places across the stereo field: principal in the middle, the Résonance left,
  // the Métallique right, the Palme a little left (equal power)
  static const double PAN[4] = {0, -0.5, 0.5, -0.25};
  double gl[4], gr[4];
  for (int i = 0; i < 4; i++) { const double th = (PAN[i] + 1) * PI / 4; gl[i] = cos(th) * std::sqrt(2.0); gr[i] = sin(th) * std::sqrt(2.0); }
  const double lev[4] = {dP, dR, dM, dPalme};
  if (dR <= 0 && springs.live) springs.clear();
  if (dM <= 0 && gong.live) gong.clear();
  for (int at = 0; at < n; at += CHUNK) {
    const int m = std::min(CHUNK, n - at);
    const double dt = m / fs;
    bendNow = glideTo(bendNow, bendTo, dt, BEND_T);
    vibPhase += 2 * PI * P[p::vibRate] * dt;
    if (vibPhase > 2 * PI) vibPhase -= 2 * PI;
    if (P[p::drift] > 0) { // Ornstein–Uhlenbeck: rms P[drift], wandering over DRIFT_T
      const double g = random() + random() + random(); // nearly normal, variance 1
      driftHz += -driftHz * dt / DRIFT_T + P[p::drift] * std::sqrt(2 * dt / DRIFT_T) * g;
    } else driftHz = 0;
    double buf[CHUNK] = {};
    for (Voice &v : voices) {
      if (!v.alive) continue;
      update(v, dt, m);
      for (int i = 0; i < m; i++) {
        const double gain = v.g0 + (v.g1 - v.g0) * (i + 1) / m;
        buf[i] += gain * voiceSample(v);
      }
      if (!v.held && v.F < F_OPEN) v.alive = false;
    }
    for (int i = 0; i < m; i++) {
      const double s = OUT * buf[i];
      double d[4] = {0, 0, 0, 0};
      const double sp = lpP.run(hpP.run(s));
      if (dP > 0) d[0] = sp;
      if (dR > 0) { springs.live = true; const double h = hpR.run(s); d[1] = 0.5 * h + 0.7 * springs.run(h); }
      if (dM > 0) { gong.live = true; d[2] = gong.run(s); }
      if (dPalme > 0) {
        double st = 0;
        for (PalmeString &ps : palme) st += ps.run(s);
        d[3] = 0.5 * sp + 0.6 * st;
      }
      double l = 0, r = 0;
      for (int k = 0; k < 4; k++) if (lev[k] > 0) { l += lev[k] * gl[k] * d[k]; r += lev[k] * gr[k] * d[k]; }
      L[at + i] = (float)l; R[at + i] = (float)r;
    }
    t += m;
  }
  if ((sinceState += n) >= stateEvery) {
    sinceState = 0;
    const Voice *v = newest && newest->alive ? newest : nullptr;
    if (v) {
      Message s;
      s.type = msg::state; s.key = (int16_t)v->key;
      s.values[0] = (float)v->f; s.values[1] = (float)v->delta; s.values[2] = (float)K;
      s.values[3] = (float)v->F; s.values[4] = (float)v->g1; s.values[5] = (float)driftHz;
      s.count = 6;
      post(s);
    }
  }
}

} // namespace forte::ondes
