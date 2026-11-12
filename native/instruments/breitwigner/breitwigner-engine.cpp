// breitwigner-engine.cpp — the Breit-Wigner Keyboard's engine (breitwigner-engine.h).

#include "breitwigner-engine.h"

#include <cmath>

#include "forte/dsp.h"
#include "forte/fdlibm.h"

namespace forte::breitwigner {

namespace fd = forte::fdlibm;
constexpr double OUT = 0.3;     // a state made at full velocity, as it is heard
constexpr double FLOOR = 1e-5;  // |ψ| under which a state is gone (100 dB under a full one)
constexpr double GLIDE = 0.02;  // s: a width or a boost follows its control, wheel or finger this fast
constexpr double DEG = TAU / 360;

void BreitWignerEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
  for (int key = 0; key < KEYS; key++) if (states[key].on) states[key].mass = keyMass(key, P.data()); // the tuning may have moved
}

int BreitWignerEngine::voiceCount() const {
  int n = 0;
  for (const State &s : states) n += s.on;
  return n;
}

// The pedal keeps the key-up channel shut; let go, it opens for every key that is up.
void BreitWignerEngine::setSustain(bool on) {
  sustain = on;
  if (!on) for (State &s : states) if (s.on && !s.down) s.open = true;
}

void BreitWignerEngine::allNotesOff() {
  for (State &s : states) { s.on = false; s.down = false; s.open = false; s.zr = s.zi = 0; s.press = {}; }
  presses.clear();
}

// A key makes its state: an amplitude of the key's velocity, at the Phase at birth, added to what
// the key still holds (amplitudes add, so a second strike can raise or cancel the first). The key
// is down again, so its key-up channel shuts.
void BreitWignerEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < 0 || key >= KEYS) return;
  State &s = states[key];
  presses.reset(key);
  if (!s.on) {
    s = {};
    s.on = true;
    s.mass = keyMass(key, P.data());
    s.share = keyShare(key, expr.slideOr(key, P[p::width]), P[p::power]);
    const double w = wheel > 0 ? fd::pow(2.0, wheel * kBendSemitones / 12) : 1;
    s.gamma = w * expr.bendOf(key);
  }
  s.down = true; s.open = false; s.lift = 1;
  const double phase = P[p::phase] * DEG;
  s.zr += velocity * fd::cos(phase);
  s.zi += velocity * fd::sin(phase);
}

// Lift: how wide the key-up channel opens: half as wide for the slowest lift, twice for the fastest.
void BreitWignerEngine::noteOff(int key, double velocity) {
  if (key < 0 || key >= KEYS) return;
  State &s = states[key];
  if (!s.on || !s.down) return;
  s.down = false;
  s.lift = 1 / liftScale(velocity);
  if (!sustain) s.open = true;
}

void BreitWignerEngine::frame() {
  int left = voiceCount();
  if (left == 0 && told) return;
  told = left == 0;
  Message m;
  m.type = kFrame;
  int c = 0;
  for (int key = 0; key < KEYS; key++) {
    const State &s = states[key];
    if (!s.on) continue;
    const double vals[4] = {(double)key, std::sqrt(s.zr * s.zr + s.zi * s.zi), s.f, s.fwhm};
    for (int i = 0; i < 4; i++) m.values[4 * c + i] = (float)vals[i];
    left--;
    if (++c == FRAME_STATES) { m.count = (uint16_t)(4 * c); m.key = (int16_t)left; post(m); c = 0; }
  }
  if (c > 0 || told) { m.count = (uint16_t)(4 * c); m.key = 0; post(m); }
}

void BreitWignerEngine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = 0;
  if (hasParams) {
    const double dt = n / fs;
    // the wheel is a boost too: up only (no frame sees a state with less than its rest energy)
    const double wheelG = wheel > 0 ? fd::pow(2.0, wheel * kBendSemitones / 12) : 1;
    for (int key = 0; key < KEYS; key++) {
      State &s = states[key];
      if (!s.on) continue;
      s.share = glideTo(s.share, keyShare(key, expr.slideOr(key, P[p::width]), P[p::power]), dt, GLIDE);
      s.gamma = glideTo(s.gamma, wheelG * expr.bendOf(key), dt, GLIDE);
      s.press.follow(s.down ? presses.of(key) : 0, n, fs);
      // partial widths add: its own, the key-up channel's once it is open, the press's
      const double channels = (s.open ? P[p::release] * s.lift : 0) + P[p::press] * s.press.p;
      const Lab lab = boosted(s.mass, totalWidth(s.mass, s.share, channels), s.gamma);
      s.f = lab.f; s.fwhm = lab.fwhm;
      if (lab.f != s.fc || lab.fwhm != s.wc) { // e^((−πΓ + 2πif)/fs): exact for a state left alone
        const double r = fd::exp(-(TAU / 2) * lab.fwhm / fs), a = TAU * lab.f / fs;
        s.rr = r * fd::cos(a); s.ri = r * fd::sin(a);
        s.fc = lab.f; s.wc = lab.fwhm;
      }
      double zr = s.zr, zi = s.zi;
      const double rr = s.rr, ri = s.ri;
      if (lab.f < 0.49 * fs) {
        for (int i = 0; i < n; i++) {
          L[i] = (float)(L[i] + OUT * zi); // a Float32Array's +=
          const double t = zr * rr - zi * ri; zi = zr * ri + zi * rr; zr = t;
        }
      } else { // boosted past what the sample rate carries: it turns unheard
        for (int i = 0; i < n; i++) { const double t = zr * rr - zi * ri; zi = zr * ri + zi * rr; zr = t; }
      }
      s.zr = zr; s.zi = zi;
      if (!(zr * zr + zi * zi > FLOOR * FLOOR)) { s.on = false; s.down = false; s.open = false; s.zr = s.zi = 0; } // decayed (or not a number: gone)
    }
    toFrame -= dt;
    if (toFrame <= 0 && messages) { frame(); toFrame += FRAME_T; if (toFrame <= 0) toFrame = FRAME_T; }
  }
  for (int i = 0; i < n; i++) R[i] = L[i];
}

} // namespace forte::breitwigner
