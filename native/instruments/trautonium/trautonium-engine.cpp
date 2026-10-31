// trautonium-engine.cpp — the Trautonium's engine (trautonium-engine.h).

#include "trautonium-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"
#include "forte/fdlibm.h"

namespace forte::trautonium {

using fdlibm::cos;
using fdlibm::exp;
using fdlibm::log;
using fdlibm::sin;

static constexpr double OUT = 1.0;       // the amplifier: a note at full pressure peaks around 0.2
static constexpr int CHUNK = 16;         // samples between retunings: the slides, bends and swell
static constexpr double BEND_T = 0.02;   // s: bends, the wheel's circuit and the pedal glide with this time constant
static constexpr double STEAL_T = 0.005; // s: a stolen voice's pressure lets go this fast
static constexpr double END = 1e-4;      // a lifted voice ends when its pressure is down to this
static constexpr double DC_CUT = 15;     // Hz: the output's coupling capacitor
static constexpr double TOP = 0.25;      // a master plays at most fs/4: the polyBLEP corrects one reset at a time

TrautoniumEngine::TrautoniumEngine(double fs) : Engine(fs) {
  dcRho = exp(-TAU * DC_CUT / fs);
  stateEvery = 128 * (int)std::ceil(fs / 128 / 30); // at most 30 times a second, in whole blocks
}

void TrautoniumEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  const bool w = (int)P[p::mode] == mode_::wire;
  if (hasP && w != wire) { for (Voice &v : voices) v.held = false; held = 0; } // a change of playing lifts the fingers
  wire = w;
  S = P[p::supply]; g = periods(S);
  K = P[p::sync] * swing; slack = P[p::slack];
  const int di[DIVIDERS] = {p::div1, p::div2, p::div3, p::div4}, li[DIVIDERS] = {p::sub1, p::sub2, p::sub3, p::sub4};
  level[0] = P[p::master];
  for (int i = 0; i < DIVIDERS; i++) { div[i] = std::clamp((int)std::lround(P[di[i]]), 1, 24); level[1 + i] = P[li[i]]; }
  const int fi[FORMANTS] = {p::f1, p::f2, p::f3, p::f4}, gi[FORMANTS] = {p::g1, p::g2, p::g3, p::g4};
  for (int i = 0; i < FORMANTS; i++) { fq[i] = P[fi[i]]; fg[i] = P[gi[i]]; }
  dry = P[p::dry]; swell = P[p::swell];
  if (!hasP) swellNow = swell;
  const forte::Tuning kb = tuningOf(P.data());
  if (!hasP || !(kb == keyboard)) {
    keyboard = kb;
    for (int k = 0; k < 128; k++) keyTarget[k] = keyFreq(k) * keyboard.ratio(k);
  }
  hasP = true;
  for (Voice &v : voices) if (v.alive) {
    if (!wire) v.u = v.uTo = 1 / baseFreq(v.key); // retuned at once (One wire's finger stays where it is)
    tune(v); circuits(v);
    v.aPress = 1 - exp(-1 / (fs * P[p::press] * (1.5 - v.vel)));
    v.aLift = 1 - exp(-1 / (fs * (v.stolen ? STEAL_T : P[p::lift])));
  }
}

// The lamps' time constants for the master's frequency now: the master's wire, and each divider's
// resistor ganged to it, n(1 + slack) times as large.
void TrautoniumEngine::tune(Voice &v) {
  const double f = std::clamp((bendNow * v.bend) / v.u, 1.0, TOP * fs);
  v.f = f;
  const double tm = 1 / (f * g);
  v.lamp[0].tau = tm;
  for (int i = 0; i < DIVIDERS; i++) v.lamp[1 + i].tau = tm * div[i] * (1 + slack);
  for (Lamp &l : v.lamp) l.a = exp(-1 / (fs * l.tau));
}

// Each circuit's damped sinusoid: ω₀ = 2πf, σ = ω₀/2Q, ω = √(ω₀² − σ²). The step response of a
// resonance of peak 1 is (ω₀/Qω) e^{−σt} sin ωt; a discharge rings the circuit equally hard
// whatever its Q (its charge into the capacitor), so with Q_REF in place of Q.
void TrautoniumEngine::circuits(Voice &v) {
  for (int i = 0; i < FORMANTS; i++) {
    const double f = std::min(i == 0 ? v.f1 : fq[i], 0.45 * fs), Q = std::max(1.0, P[p::q1 + 3 * i]);
    if (f == v.ff[i] && Q == v.fq[i]) continue;
    v.ff[i] = f; v.fq[i] = Q;
    const double w0 = TAU * f, s = w0 / (2 * Q), wd = std::sqrt(w0 * w0 - s * s), r = exp(-s / fs);
    v.sg[i] = s; v.wd[i] = wd; v.A[i] = w0 / (Q_REF * wd);
    v.pr[i] = r * cos(wd / fs); v.pi[i] = r * sin(wd / fs);
  }
}

// A finger lands on the wire: every lamp of the manual starts at its extinction voltage, as though
// they had just fired together, so the dividers start in step.
void TrautoniumEngine::start(Voice &v, int key, double velocity) {
  v.alive = true; v.held = true; v.stolen = false;
  v.key = key; v.born = t;
  v.vel = std::clamp(velocity, 0.0, 1.0); v.after = 0; v.p = 0;
  v.u = v.uTo = 1 / baseFreq(key); v.uRate = 0;
  v.bend = expr.bendOf(key);
  v.f1 = expr.slideOr(key, P[p::f1]);
  double x0 = 0;
  for (int i = 0; i <= DIVIDERS; i++) {
    Lamp &l = v.lamp[i];
    l = Lamp{};
    l.prevOut = (V_EXT - mid) / swing;
    x0 += level[i] * l.prevOut;
  }
  for (int i = 0; i < FORMANTS; i++) { v.zr[i] = v.zi[i] = 0; v.ff[i] = v.fq[i] = -1; }
  v.hx = x0; v.hy = 0; v.fPrev = 0; // the coupling capacitor starts charged to the mixture's rest: no thump
  tune(v); circuits(v);
  v.aPress = 1 - exp(-1 / (fs * P[p::press] * (1.5 - v.vel)));
  v.aLift = 1 - exp(-1 / (fs * P[p::lift]));
}

// Past the Quality's voices, the oldest lifted voice lets go fast, else the oldest held one; never
// the voice just struck.
void TrautoniumEngine::steal(const Voice *keep) {
  Voice *victim = nullptr;
  for (int pass = 0; pass < 2 && !victim; pass++)
    for (Voice &v : voices)
      if (v.alive && !v.stolen && &v != keep && (pass == 1 || !v.held) && (!victim || v.born < victim->born)) victim = &v;
  if (!victim) return;
  victim->stolen = true; victim->held = false;
  victim->aLift = 1 - exp(-1 / (fs * STEAL_T));
}

void TrautoniumEngine::noteOn(int key, double velocity) {
  if (!hasP || key < 0 || key > 127) return;
  if (wire) {
    int j = 0;
    for (int i = 0; i < held; i++) if (stack[i] != key) stack[j++] = stack[i];
    held = j; stack[held++] = key;
    Voice *w = nullptr;
    for (Voice &v : voices) if (v.alive && !v.stolen) { w = &v; break; }
    if (w && w->held) { // the finger slides along the wire to the new place
      w->key = key; w->uTo = 1 / baseFreq(key);
      w->uRate = std::fabs(w->uTo - w->u) / P[p::glide];
      newest = w;
      return;
    }
    if (w) { // still letting go: it lands on the new place and presses again
      w->held = true; w->key = key; w->u = w->uTo = 1 / baseFreq(key); w->uRate = 0;
      w->vel = std::clamp(velocity, 0.0, 1.0);
      w->bend = expr.bendOf(key);
      w->aPress = 1 - exp(-1 / (fs * P[p::press] * (1.5 - w->vel)));
      tune(*w);
      newest = w;
      return;
    }
  } else {
    for (Voice &v : voices) if (v.alive && !v.stolen && v.key == key) { // pressed again while it sounds
      v.held = true; v.vel = std::clamp(velocity, 0.0, 1.0);
      v.aPress = 1 - exp(-1 / (fs * P[p::press] * (1.5 - v.vel)));
      newest = &v;
      return;
    }
  }
  Voice *v = nullptr;
  for (Voice &x : voices) if (!x.alive) { v = &x; break; }
  if (!v) { // every slot sounding: the quietest stolen or lifted one goes at once
    for (Voice &x : voices) if (!x.held && (!v || x.p < v->p)) v = &x;
    if (!v) for (Voice &x : voices) if (!v || x.born < v->born) v = &x;
  }
  start(*v, key, velocity);
  newest = v;
  int live = 0;
  for (const Voice &x : voices) live += x.alive && !x.stolen;
  if (live > pick(kMaxVoices, 12, 6)) steal(v); // Quality: fewer manuals sounding at once
}

void TrautoniumEngine::noteOff(int key, double) {
  if (key < 0 || key > 127) return;
  if (wire) {
    int j = 0;
    for (int i = 0; i < held; i++) if (stack[i] != key) stack[j++] = stack[i];
    held = j;
    for (Voice &v : voices) if (v.alive && v.held && v.key == key) {
      if (held > 0) { // back to the key still down
        v.key = stack[held - 1]; v.uTo = 1 / baseFreq(v.key);
        v.uRate = std::fabs(v.uTo - v.u) / P[p::glide];
      } else lift(v);
    }
    return;
  }
  for (Voice &v : voices) if (v.alive && v.held && v.key == key) lift(v);
}

void TrautoniumEngine::allNotesOff() {
  for (Voice &v : voices) v.held = false;
  held = 0;
}

void TrautoniumEngine::pressure(double value, int key) { // aftertouch: one key (poly) or every held key (channel, −1)
  for (Voice &v : voices) if (v.alive && v.held && (key < 0 || v.key == key)) v.after = std::clamp(value, 0.0, 1.0);
}

void TrautoniumEngine::bend(double value) {
  bendTo = fdlibm::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12);
}

int TrautoniumEngine::voiceCount() const {
  int n = 0;
  for (const Voice &v : voices) n += v.alive;
  return n;
}

// A chunk's slides: the finger along the wire (One wire), the note's own bend and the wheel's,
// the first circuit's tuning.
void TrautoniumEngine::update(Voice &v, double dt) {
  if (v.u != v.uTo) {
    const double step = v.uRate * dt;
    v.u = std::fabs(v.uTo - v.u) <= step ? v.uTo : v.u + (v.uTo > v.u ? step : -step);
  }
  v.bend = glideTo(v.bend, expr.bendOf(v.key), dt, BEND_T);
  const double f = std::clamp((bendNow * v.bend) / v.u, 1.0, TOP * fs);
  if (f != v.f) tune(v);
  const double f1 = glideTo(v.f1, expr.slideOr(v.key, P[p::f1]), dt, BEND_T);
  if (f1 != v.f1) { v.f1 = f1; circuits(v); }
}

// One sample of a voice: its pressure, its lamps, its circuits.
inline void TrautoniumEngine::sample(Voice &v, double &out) {
  const double target = v.held ? v.vel + (1 - v.vel) * v.after : 0;
  v.p += (target - v.p) * (v.held ? v.aPress : v.aLift);
  // where in this sample each lamp would strike on its own
  for (Lamp &l : v.lamp) {
    l.fireAt = -1; l.caught = false;
    if (S + (l.V - S) * l.a >= V_STRIKE) l.fireAt = l.V >= V_STRIKE ? 0 : std::min(1.0, l.tau * fs * log((S - l.V) / (S - V_STRIKE)));
  }
  // the master's discharge lifts every divider by K: one within K of striking fires with it
  Lamp &m = v.lamp[0];
  const double xm = m.fireAt;
  if (xm >= 0) {
    m.pulses++;
    for (int i = 1; i <= DIVIDERS; i++) {
      Lamp &d = v.lamp[i];
      d.pulses++;
      if (d.fireAt >= 0 && d.fireAt <= xm) continue;
      if (S + (d.V - S) * exp(-xm / (fs * d.tau)) + K >= V_STRIKE) { d.fireAt = xm; d.caught = true; }
    }
  }
  // the discharges: each sawtooth's reset, band-limited, and its step into the circuits
  for (int i = 0; i < FORMANTS; i++) if (fg[i] > 0) {
    const double zr = v.zr[i];
    v.zr[i] = zr * v.pr[i] - v.zi[i] * v.pi[i];
    v.zi[i] = zr * v.pi[i] + v.zi[i] * v.pr[i];
  }
  double mix = 0;
  for (int i = 0; i <= DIVIDERS; i++) {
    Lamp &l = v.lamp[i];
    double Vn, cur;
    if (l.fireAt >= 0) {
      const double x = l.fireAt, d = 1 - x, tf = l.tau * fs;
      const double before = S + (l.V - S) * exp(-x / tf), jump = before - V_EXT;
      Vn = S + (V_EXT - S) * exp(-d / tf);
      const double h = -jump / swing;                // the downward step, in swings
      cur = (Vn - mid) / swing - (h * (1 - d) * (1 - d)) / 2; // polyBLEP, the sample after
      l.prevOut += (h * d * d) / 2;                  // and the sample before
      const double amp = level[i] * h;
      if (amp != 0) for (int j = 0; j < FORMANTS; j++) if (fg[j] > 0) { // rung from the instant of the discharge
        const double e = amp * exp(-v.sg[j] * d / fs), ph = v.wd[j] * d / fs;
        v.zr[j] += e * cos(ph); v.zi[j] += e * sin(ph);
      }
      l.nf++;
      const double at = (double)now + x;
      if (l.lastT >= 0) l.interval = at - l.lastT;
      l.lastT = at;
      if (i > 0) { l.count = l.caught ? l.pulses : 0; l.pulses = !l.caught && xm > x ? 1 : 0; }
      else l.pulses = 0;
    } else {
      Vn = S + (l.V - S) * l.a;
      cur = (Vn - mid) / swing;
    }
    l.V = Vn;
    mix += level[i] * l.prevOut;
    l.prevOut = cur;
  }
  // round the circuits: the coupling capacitor, y[n] = x[n] − x[n−1] + ρ y[n−1]
  const double y = mix - v.hx + dcRho * v.hy;
  v.hx = mix; v.hy = y;
  double fo = 0;
  for (int i = 0; i < FORMANTS; i++) if (fg[i] > 0) fo += fg[i] * v.A[i] * v.zi[i];
  out += v.p * (dry * y + v.fPrev);
  v.fPrev = fo;
}

void TrautoniumEngine::run(float *L, float *R, int n) {
  double buf[CHUNK] = {};
  for (Voice &v : voices) {
    if (!v.alive) continue;
    for (int i = 0; i < n; i++) { now = t + i; sample(v, buf[i]); }
    if (!v.held && v.p < END) v.alive = false;
  }
  for (int i = 0; i < n; i++) L[i] = R[i] = (float)(OUT * swellNow * buf[i]);
}

void TrautoniumEngine::process(float *L, float *R, int n) {
  if (!hasP) { for (int i = 0; i < n; i++) L[i] = R[i] = 0; return; }
  for (int at = 0; at < n; at += CHUNK) {
    const int m = std::min(CHUNK, n - at);
    const double dt = m / fs;
    bendNow = glideTo(bendNow, bendTo, dt, BEND_T);
    swellNow = glideTo(swellNow, swell, dt, BEND_T);
    for (Voice &v : voices) if (v.alive) update(v, dt);
    run(L + at, R + at, m);
    t += m;
  }
  if ((sinceState += n) >= stateEvery) {
    sinceState = 0;
    const Voice *v = newest && newest->alive ? newest : nullptr;
    if (v) {
      Message s;
      s.type = msg::state; s.key = (int16_t)v->key;
      s.values[0] = (float)v->f; s.values[1] = (float)v->p; s.values[2] = (float)v->f1;
      const Lamp &m = v->lamp[0];
      s.values[3] = m.interval > 0 ? (float)(fs / m.interval) : 0;
      for (int i = 0; i < DIVIDERS; i++) {
        const Lamp &d = v->lamp[1 + i];
        s.values[4 + i] = (float)d.count;
        s.values[8 + i] = d.interval > 0 ? (float)(fs / d.interval) : 0;
      }
      s.count = 12;
      post(s);
    }
  }
}

} // namespace forte::trautonium
