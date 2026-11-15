// breitwigner-engine.cpp — the Breit-Wigner Keyboard's engine (breitwigner-engine.h).

#include "breitwigner-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"
#include "forte/fdlibm.h"

namespace forte::breitwigner {

namespace fd = forte::fdlibm;
constexpr double OUT = 0.3;     // a state made at full velocity, as it is heard
constexpr double FLOOR = 1e-5;  // |ψ| under which a state is gone (100 dB under a full one)
constexpr double GLIDE = 0.02;  // s: a width or a boost follows its control, wheel or finger this fast

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
  for (State &s : states) { s.on = false; s.down = false; s.open = false; s.zr = s.zi = 0; s.form = 0; s.dr = s.di = 0; s.press = {}; }
  presses.clear();
}

// A key makes its state, added to what the key still holds (amplitudes add, so a second strike
// can raise or cancel the first). With no Formation time it is made at once: an amplitude of the
// key's velocity on the real axis, so the note starts from nothing, as a sine. Otherwise the key
// starts a source, turning with the state, that runs while the key is held, for that time at
// most: as strong as makes the velocity's amplitude in the whole time, at the width the state has
// now (formed(), breitwigner-model.h). A source still running from the last strike stops. What the
// key made (|ψ| now, or the velocity a source will make) is what a press keeps making. The key is
// down again, so its key-up channel shuts.
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
  const int n = (int)std::lround(P[p::formation] * fs);
  if (n < 1) { s.form = 0; s.dr = s.di = 0; s.zr += velocity; s.made = std::sqrt(s.zr * s.zr + s.zi * s.zi); return; }
  const Lab lab = boosted(s.mass, totalWidth(s.mass, s.share, 0), s.gamma); // its key-up channel shut
  s.form = n; s.dr = velocity / formed(n / fs, lab.fwhm); s.di = 0; s.made = velocity;
}

// The key's source stops. Lift: how wide the key-up channel opens: half as wide for the slowest
// lift, twice for the fastest.
void BreitWignerEngine::noteOff(int key, double velocity) {
  if (key < 0 || key >= KEYS) return;
  State &s = states[key];
  if (!s.on || !s.down) return;
  s.down = false; s.form = 0; s.dr = s.di = 0;
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
      // partial widths add: its own and the key-up channel's once it is open
      const double channels = s.open ? P[p::release] * s.lift : 0;
      const Lab lab = boosted(s.mass, totalWidth(s.mass, s.share, channels), s.gamma);
      s.f = lab.f; s.fwhm = lab.fwhm;
      if (lab.f != s.fc || lab.fwhm != s.wc) { // e^((−πΓ + 2πif)/fs): exact for a state left alone
        const double r = fd::exp(-(TAU / 2) * lab.fwhm / fs), a = TAU * lab.f / fs;
        s.ur = fd::cos(a); s.ui = fd::sin(a);
        s.rr = r * s.ur; s.ri = r * s.ui; s.r = r;
        s.k = formed(1 / fs, lab.fwhm);
        s.fc = lab.f; s.wc = lab.fwhm;
      }
      double zr = s.zr, zi = s.zi, dr = s.dr, di = s.di;
      double rr = s.rr, ri = s.ri;
      const double ur = s.ur, ui = s.ui, k = s.k;
      // Press: production, a beam at the state's own energy making it as it decays, in step with it.
      // Each sample adds (1 − r)·T to |ψ| as it loses (1 − r)·|ψ|, so |ψ| goes to T = Press × p × made
      // at the line's own rate, T + (|ψ| − T)·rⁿ over the block: the turn's radius over the block
      // makes it so. While the key's own source runs (the Formation time), that source makes it.
      if (s.form == 0 && s.press.on() && s.made > 0) {
        const double m0 = std::sqrt(zr * zr + zi * zi), T = P[p::press] * s.press.p * s.made;
        if (m0 > 0) {
          const double g = fd::pow((T + (m0 - T) * fd::pow(s.r, n)) / m0, 1.0 / n) / s.r;
          rr *= g; ri *= g;
        }
      }
      const bool heard = lab.f < 0.49 * fs; // boosted past what the sample rate carries, it turns unheard
      const int fed = std::min(n, s.form);
      int i = 0;
      // fed by its source: z ← r·z + k·d, with d turned first, exact for a source that turns with
      // the state (the integral over the sample of the source, decaying from where it entered)
      for (; i < fed; i++) {
        if (heard) L[i] = (float)(L[i] + OUT * zi);
        double t = zr * rr - zi * ri; zi = zr * ri + zi * rr; zr = t;
        t = dr * ur - di * ui; di = dr * ui + di * ur; dr = t;
        zr += k * dr; zi += k * di;
      }
      if (heard) {
        for (; i < n; i++) {
          L[i] = (float)(L[i] + OUT * zi); // a Float32Array's +=
          const double t = zr * rr - zi * ri; zi = zr * ri + zi * rr; zr = t;
        }
      } else {
        for (; i < n; i++) { const double t = zr * rr - zi * ri; zi = zr * ri + zi * rr; zr = t; }
      }
      s.form -= fed;
      if (s.form == 0) dr = di = 0;
      s.zr = zr; s.zi = zi; s.dr = dr; s.di = di;
      const double e = zr * zr + zi * zi;
      if (s.form > 0 ? !std::isfinite(e) : !(e > FLOOR * FLOOR)) { // decayed (or not a number: gone)
        s.on = false; s.down = false; s.open = false; s.zr = s.zi = 0; s.form = 0; s.dr = s.di = 0;
      }
    }
    toFrame -= dt;
    if (toFrame <= 0 && messages) { frame(); toFrame += FRAME_T; if (toFrame <= 0) toFrame = FRAME_T; }
  }
  for (int i = 0; i < n; i++) R[i] = L[i];
}

} // namespace forte::breitwigner
