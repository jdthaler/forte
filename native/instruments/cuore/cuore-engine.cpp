// cuore-engine.cpp — CUORE's engine (cuore-engine.h).

#include "cuore-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/fdlibm.h"

namespace forte::cuore {

constexpr double BEND_T = 0.01;    // s: the pitch wheel's glide
constexpr double QUIET = 1e-5;     // a let-go crystal is silent once it is this close to rest
constexpr int FRAME = 1600;        // samples between the page's frames (30 a second)

CuoreEngine::CuoreEngine(double fs) : Engine(fs), dcL(5, fs), dcR(5, fs) { voices.resize(kMaxVoices); }

void CuoreEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
  bolo.set(P.data());
  rest = bolo.equilibrium();
  speedup = P[p::periodA4] * 440;
  dtReal = speedup / fs;
}

int CuoreEngine::voiceCount() const {
  int n = 0;
  for (const Voice &v : voices) n += v.active;
  return n;
}

void CuoreEngine::bend(double value) { wheelTarget = fdlibm::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12); }

void CuoreEngine::pressure(double value, int key) {
  value = std::clamp(value, 0.0, 1.0);
  if (key < 0) { chanPress = value; return; }
  for (Voice &v : voices) if (v.active && v.key == key) v.press = value;
}

void CuoreEngine::setSustain(bool on) {
  sustain = on;
  if (!on) for (Voice &v : voices) if (v.active && !v.held && v.sinceEnd < 0) v.sinceEnd = 0;
}

void CuoreEngine::noteOn(int key, double velocity) {
  if (!hasParams) return;
  Voice *slot = nullptr;
  for (Voice &v : voices) if (v.active && v.key == key) { slot = &v; break; } // its crystal, perhaps still warm
  if (!slot) {
    // Quality: past 24 crystals at Medium and 12 at Low (48 at High), the oldest's heater stops
    int live = 0;
    Voice *oldest = nullptr;
    for (Voice &v : voices) {
      if (!v.active) { if (!slot) slot = &v; continue; }
      if (v.sinceEnd < 0) { live++; if (!oldest || v.age < oldest->age) oldest = &v; }
    }
    if (oldest && live >= maxVoices()) { oldest->held = false; oldest->sinceEnd = 0; }
    if (!slot) for (Voice &v : voices) if (!slot || v.age < slot->age) slot = &v; // every crystal in use: the oldest goes
    slot->y = rest;
    slot->press = 0;
    slot->bendNow = wheel * expr.bendOf(key);
    std::tie(slot->gl, slot->gr) = keyPan(key);
  }
  Voice &v = *slot;
  v.active = true; v.held = true; v.key = key; v.vel = velocity; v.age = clock++; v.quiet = 0;
  v.sinceEnd = -1; // the heater fires
  v.phase = 1;     // at once: the first pulse is the attack
}

void CuoreEngine::noteOff(int key, double) {
  for (Voice &v : voices) {
    if (v.active && v.key == key && v.held) { v.held = false; if (!sustain) v.sinceEnd = 0; }
  }
}

void CuoreEngine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasParams) return;
  wheel = glideTo(wheel, wheelTarget, n / fs, BEND_T);
  // substeps a sample: steps of at most 15 ms of the crystal's time (at most 8 at High, 2 at Medium, 1 at Low)
  sub = std::clamp((int)std::ceil(dtReal / H_MAX), 1, pick(8, 2, 1));
  scale = P[p::gain] / ADC_FULL;
  // the sounding voices, sample by sample
  Voice *on[kMaxVoices];
  int count = 0;
  const auto tuning = tuningOf(P.data());
  for (Voice &v : voices) {
    if (!v.active) continue;
    v.bendNow = glideTo(v.bendNow, wheel * expr.bendOf(v.key), n / fs, BEND_T);
    v.inc = keyFreq(v.key) * tuning.ratio(v.key) * v.bendNow / fs;
    v.E = P[p::energy] * MEV * v.vel * (1 + std::max(v.press, chanPress));
    v.firing = v.sinceEnd < 0; // the heater fires while the key or the pedal holds it
    on[count++] = &v;
  }
  for (int i = 0; i < n; i++) {
    // the crystals whose heaters fire this sample step on their own, split where the pulse lands;
    // the rest together
    Bolometer::State *plain[kMaxVoices];
    int k = 0;
    for (int j = 0; j < count; j++) {
      Voice &v = *on[j];
      if (!v.active) continue;
      if (v.firing && v.phase + v.inc >= 1) {
        const double at = std::clamp((1 - v.phase) / v.inc, 0.0, 1.0); // where in the sample it lands
        if (at > 0) bolo.steps(v.y, at * dtReal, std::max(1, (int)std::ceil(at * sub)));
        bolo.kick(v.y, v.E);
        if (at < 1) bolo.afterKick(v.y, (1 - at) * dtReal, std::max(1, (int)std::ceil((1 - at) * sub)));
        v.phase += v.inc - 1;
      } else {
        plain[k++] = &v.y;
        if (v.firing) v.phase += v.inc;
      }
    }
    for (int s = 0; s < sub; s++) bolo.stepMany(plain, k, dtReal / sub);
    for (int j = 0; j < count; j++) {
      Voice &v = *on[j];
      if (!v.active) continue;
      // the thermistor's voltage falls as it warms: the pulse, amplified, on the digitiser's scale
      const double y = std::clamp(scale * (rest[0] - v.y[0]), -1.0, 1.0);
      L[i] += (float)(v.gl * y);
      R[i] += (float)(v.gr * y);
      if (!v.firing) {
        v.sinceEnd += 1 / fs;
        v.quiet = std::fabs(y) < QUIET ? v.quiet + 1 : 0;
        if (v.quiet > 512 || v.sinceEnd > 10) v.active = false;
      }
    }
  }
  for (int i = 0; i < n; i++) { L[i] = (float)dcL.run(L[i]); R[i] = (float)dcR.run(R[i]); }
  // the page's frame: each sounding crystal's state (6 a message)
  if ((frame += n) >= FRAME) {
    frame = 0;
    Message m;
    m.type = 0;
    int k = 0;
    for (const Voice &v : voices) {
      if (!v.active || k == 6) continue;
      const float s[] = {(float)v.key, (float)v.y[0], (float)v.y[1], (float)v.y[2], (float)v.y[3]};
      for (int j = 0; j < 5; j++) m.values[5 * k + j] = s[j];
      k++;
    }
    m.count = 5 * k;
    post(m);
  }
}

} // namespace forte::cuore
