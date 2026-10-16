// template-engine.cpp — the template's engine, as template-engine.js runs it.

#include "template-engine.h"

#include <cmath>

#include "forte/dsp.h"

namespace forte::template_ {

constexpr double OUT = 0.15;

// A strike is an impulse of force: one sample of size 1/k on every mode (the mallet's pulse
// shape is already in amp). The bar is linear, so a restrike simply adds to what still rings.
void TemplateEngine::Voice::strike(double velocity, double fs) {
  for (int i = 0; i < count; i++) {
    Resonator &m = modes[i];
    m.y1 = level * m.y1 + m.b * m.amp * velocity * fs;
    m.y2 *= level;
  }
  level = 1; released = false; damped = false;
}

double TemplateEngine::Voice::run() { // output ∝ surface velocity = ω × displacement
  double s = 0;
  for (int i = 0; i < count; i++) {
    Resonator &m = modes[i];
    const double y = m.a1 * m.y1 - m.a2 * m.y2;
    m.y2 = m.y1; m.y1 = y; s += m.w * y;
  }
  return s;
}

TemplateEngine::TemplateEngine(double fs) : Engine(fs) { voices.reserve(kMaxVoices + 1); }

void TemplateEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
}

void TemplateEngine::setSustain(bool on) {
  sustain = on;
  if (!on) for (Voice &v : voices) if (v.released) v.damped = true;
}

void TemplateEngine::noteOn(int key, double velocity) {
  if (!hasParams) return;
  Voice *v = nullptr;
  for (Voice &x : voices) if (x.key == key) { v = &x; break; }
  if (!v) {
    Voice nv;
    nv.key = key;
    const KeyModes km = keyModes(key, P.data());
    for (int i = 0; i < km.count; i++) {
      const ModeCoeffs c = modeCoeffs(km.m[i].f, km.m[i].sigma, fs);
      nv.modes[i] = {c.a1, c.a2, c.b, km.m[i].amp, TAU * km.m[i].f};
    }
    nv.count = km.count;
    std::tie(nv.gl, nv.gr) = keyPan(key);
    voices.push_back(nv);
    v = &voices.back();
  }
  v->strike(velocity, fs);
  if ((int)voices.size() > kMaxVoices) voices.erase(voices.begin()); // the oldest goes
}

void TemplateEngine::noteOff(int key, double) {
  for (Voice &v : voices) if (v.key == key && !v.released) { v.released = true; if (!sustain) v.damped = true; }
}

void TemplateEngine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  const double damp = std::exp(-1 / (fs * 0.08));
  for (Voice &v : voices) {
    for (int i = 0; i < n; i++) {
      if (v.damped) v.level *= damp;
      const double s = OUT * v.level * v.run();
      L[i] = (float)(L[i] + v.gl * s); // a Float32Array's +=
      R[i] = (float)(R[i] + v.gr * s);
    }
  }
  std::erase_if(voices, [](const Voice &v) { return !(v.level > 1e-4); }); // finished voices, in place
}

} // namespace forte::template_
