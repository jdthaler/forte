// steelpan-engine.cpp — the steel pan's engine (steelpan-engine.h).

#include "steelpan-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"

namespace forte::steelpan {

constexpr double OUT = 0.6;
constexpr double QUIET = 2e-6;    // a note below this (in thicknesses) and done ringing goes to sleep
constexpr int GRACE = 2048;       // samples a note stays alive after it wakes, to be driven
constexpr int POST = 512;         // samples between the views' messages
constexpr size_t MAX_COUPLINGS = NKEYS * 8 * kTuned * kTuned;

SteelPanEngine::SteelPanEngine(double fs) : Engine(fs), notes(NKEYS) {
  for (int k = 0; k < NKEYS; k++) {
    notes[k].key = KEY_MIN + k;
    std::tie(notes[k].gl, notes[k].gr) = keyPan(KEY_MIN + k);
  }
  live.reserve(NKEYS);
  couplings.reserve(MAX_COUPLINGS);
}

void SteelPanEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
  version++;
  g = kRise * P[p::rise];
  for (int i : live) retune(notes[i]); // the notes sounding keep their motion, on the new modes
  couplingsDirty = true;
}

// The note's modes and their resonators, with the hand's damping if it is on the note.
void SteelPanEngine::retune(Note &v) {
  v.nm = noteModes(v.key, P.data(), std::min(18000.0, 0.45 * fs));
  const double w1 = TAU * v.nm.m[0].f, mute = v.damped ? sigmaFromT60(P[p::mute]) : 0;
  for (int i = 0; i < kModes; i++) {
    if (i >= v.nm.count) { v.a1[i] = v.a2[i] = v.b[i] = v.out[i] = 0; v.w[i] = 1; continue; }
    const Mode &m = v.nm.m[i];
    const ModeCoeffs c = modeCoeffs(m.f, m.sigma + mute, fs);
    v.a1[i] = c.a1; v.a2[i] = c.a2; v.b[i] = c.b;
    v.w[i] = TAU * m.f;
    v.out[i] = OUT * m.rad * fs / w1; // radiated ∝ surface velocity: the mode's ẏ, in units of ω₁
  }
  v.version = version;
}

void SteelPanEngine::activate(Note &v) {
  if (v.active) return;
  v.y1.fill(0); v.y2.fill(0); v.F.fill(0);
  v.active = true; v.struck = false; v.damped = false; v.released = false; v.age = 0;
  v.run = kTuned;
  retune(v);
  live.push_back(int(&v - notes.data()));
  couplingsDirty = true;
}

// A stroke: an impulse of force on every mode, shaped by the contact (a half-sine pulse) and by
// where it lands. The note keeps what it was doing: the strike adds to it.
void SteelPanEngine::strike(Note &v, double velocity) {
  if (v.version != version) retune(v);
  v.run = v.nm.count;
  const double f1 = v.nm.m[0].f, tau = contactTime(P[p::contact], f1, velocity);
  for (int i = 0; i < v.nm.count; i++) v.y1[i] += v.b[i] * strikeGain(v.nm.m[i], f1, tau) * velocity * fs;
  v.struck = true; v.age = 0;
}

void SteelPanEngine::damp(Note &v, bool on) {
  if (v.damped == on) return;
  v.damped = on;
  retune(v);
}

// A hand laid on a note also stills the notes beside it that were only ringing along.
void SteelPanEngine::mute(Note &v) {
  damp(v, true);
  Neighbour nb[8];
  for (int i = 0, n = neighbours(v.key, (int)P[p::layout], nb); i < n; i++) {
    Note &u = notes[nb[i].key - KEY_MIN];
    if (u.active && !u.struck && !u.held) damp(u, true);
  }
}

void SteelPanEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < KEY_MIN || key > KEY_MAX) return;
  Note &v = notes[key - KEY_MIN];
  activate(v);
  Neighbour nb[8];
  for (int i = 0, n = neighbours(key, (int)P[p::layout], nb); i < n; i++) {
    Note &u = notes[nb[i].key - KEY_MIN];
    activate(u);
    if (!u.struck) damp(u, false); // free to ring along again
  }
  damp(v, false);
  v.held = true; v.released = false; v.vel = velocity; v.press = 0; v.hand = false;
  v.rollIn = fs / P[p::rollRate];
  strike(v, velocity);
  focus = key;
}

void SteelPanEngine::noteOff(int key, double) {
  if (key < KEY_MIN || key > KEY_MAX) return;
  Note &v = notes[key - KEY_MIN];
  v.held = false; v.press = 0;
  if (!v.active || P[p::letRing] > 0.5) return;
  v.released = true;
  if (!sustain) mute(v);
}

void SteelPanEngine::setSustain(bool on) {
  sustain = on;
  if (!on) for (int i : live) if (notes[i].released && !notes[i].damped) mute(notes[i]);
}

void SteelPanEngine::allNotesOff() {
  for (int i : live) { notes[i].active = false; notes[i].held = false; }
  live.clear();
  couplings.clear();
  focus = -1;
}

void SteelPanEngine::pressure(double value, int key) {
  if (key < 0) channelPress = value;
  else if (key >= KEY_MIN && key <= KEY_MAX && notes[key - KEY_MIN].held) notes[key - KEY_MIN].press = value;
}

int SteelPanEngine::voiceCount() const {
  int n = 0;
  for (int i : live) n += notes[i].struck;
  return n;
}

// The steel between neighbouring notes: a spring between each pair of their tuned modes that
// are nearly in tune with each other (the others hardly exchange energy), V = k·xₐ·x_b with
// k = coupling·weight·ωₐω_b.
void SteelPanEngine::rebuildCouplings() {
  couplings.clear();
  couplingsDirty = false;
  if (!(P[p::coupling] > 0)) return;
  Neighbour nb[8];
  for (int ia : live) {
    const Note &a = notes[ia];
    for (int t = 0, n = neighbours(a.key, (int)P[p::layout], nb); t < n; t++) {
      if (nb[t].key < a.key) continue; // each pair once
      const int ib = nb[t].key - KEY_MIN;
      const Note &b = notes[ib];
      if (!b.active) continue;
      for (int p = 0; p < kTuned; p++) for (int q = 0; q < kTuned; q++) {
        const double fa = a.nm.m[p].f, fb = b.nm.m[q].f;
        if (std::fabs(fa - fb) < kWindow * std::max(fa, fb) && couplings.size() < MAX_COUPLINGS)
          couplings.push_back({ia, p, ib, q, P[p::coupling] * nb[t].weight * a.w[p] * b.w[q]});
      }
    }
  }
}

double SteelPanEngine::amplitude(const Note &v, int p) const {
  const double th = v.w[p] / fs, s = std::sin(th);
  const double a2 = v.y1[p] * v.y1[p] + v.y2[p] * v.y2[p] - 2 * v.y1[p] * v.y2[p] * std::cos(th);
  return s > 1e-9 ? std::sqrt(std::max(0.0, a2)) / s : std::fabs(v.y1[p]);
}

void SteelPanEngine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (couplingsDirty) rebuildCouplings();
  const double rollAmt0 = std::max(P[p::roll], channelPress);
  for (int s = 0; s < n; s++) {
    for (const Coupling &c : couplings) {
      Note &a = notes[c.a], &b = notes[c.b];
      a.F[c.p] -= c.k * b.y1[c.q];
      b.F[c.q] -= c.k * a.y1[c.p];
    }
    double l = 0, r = 0;
    for (int i : live) {
      Note &v = notes[i];
      double Fn[kTuned]; // the dome's forces among the tuned modes
      tunedForces(v.y1.data(), v.w.data(), g * v.w[0] * v.w[0], Fn);
      for (int p = 0; p < kTuned; p++) v.F[p] += Fn[p];
      double out = 0;
      for (int p = 0; p < v.run; p++) {
        const double y = v.a1[p] * v.y1[p] - v.a2[p] * v.y2[p] + v.b[p] * v.F[p];
        out += v.out[p] * (y - v.y1[p]); // its velocity: no sound from the dome's slow sag
        v.y2[p] = v.y1[p]; v.y1[p] = y; v.F[p] = 0;
      }
      l += v.gl * out; r += v.gr * out;
      if (v.held) { // a roll: the sticks strike again while the key is down
        const double amt = std::max(rollAmt0, v.press);
        if (amt > 0.005 && --v.rollIn <= 0) {
          rng = rng * 1664525u + 1013904223u;
          strike(v, v.vel * amt * (v.hand ? 0.85 : 1));
          v.hand = !v.hand;
          v.rollIn = (fs / P[p::rollRate]) * (1 + 0.06 * ((rng >> 8) / 16777216.0 - 0.5));
        }
      }
    }
    L[s] = (float)l; R[s] = (float)r;
  }
  // asleep: notes that have rung out and are no longer driven
  bool changed = false;
  for (size_t k = 0; k < live.size();) {
    Note &v = notes[live[k]];
    v.age += n;
    double e = 0;
    for (int p = 0; p < v.run; p++) e = std::max(e, std::fabs(v.y1[p]) + std::fabs(v.y2[p]));
    const bool rolling = v.held && std::max(rollAmt0, v.press) > 0.005;
    if (!std::isfinite(e)) e = 0; // a numerical failure: let it go
    if (e < QUIET && v.age > GRACE && !rolling) {
      v.active = false; v.struck = false;
      live[k] = live.back(); live.pop_back();
      changed = true;
    } else k++;
  }
  if (changed) couplingsDirty = true;
  if ((sincePost += n) >= POST) { sincePost = 0; postViews(); }
}

void SteelPanEngine::postViews() {
  if (!messages) return;
  if (focus >= 0 && notes[focus - KEY_MIN].active) {
    const Note &v = notes[focus - KEY_MIN];
    Message m;
    m.type = msgNote; m.key = (int16_t)focus; m.count = kTuned + 1;
    for (int p = 0; p < kTuned; p++) m.values[p] = (float)amplitude(v, p);
    m.values[kTuned] = (float)(v.age / fs);
    post(m);
  }
  Message m;
  m.type = msgPan;
  int k = 0;
  for (int i : live) {
    const Note &v = notes[i];
    double a = 0;
    for (int p = 0; p < kTuned; p++) a += amplitude(v, p);
    if (a < 1e-4) continue;
    if (k < 15) { m.values[2 * k] = (float)v.key; m.values[2 * k + 1] = (float)a; k++; }
    else { // keep the loudest fifteen
      int lo = 0;
      for (int j = 1; j < 15; j++) if (m.values[2 * j + 1] < m.values[2 * lo + 1]) lo = j;
      if (a > m.values[2 * lo + 1]) { m.values[2 * lo] = (float)v.key; m.values[2 * lo + 1] = (float)a; }
    }
  }
  m.key = (int16_t)k; m.count = (uint16_t)(2 * k);
  post(m);
}

} // namespace forte::steelpan
