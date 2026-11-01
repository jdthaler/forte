// cellulophone-engine.cpp — the Cellulophone's engine (cellulophone-engine.h).

#include "cellulophone-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/fdlibm.h"

namespace forte::cellulophone {

using fdlibm::atan2;
using fdlibm::cos;
using fdlibm::exp;
using fdlibm::pow;
using fdlibm::sin;
using fdlibm::tanh;

static constexpr double OUT = 8;            // the hall's level: a forte note peaks around 0.3
static constexpr double GLIDE_T = 0.02;     // s: a key's depth and push glide this fast
static constexpr double FLYWHEEL = 0.25;    // s: the discs follow the motor's speed this slowly
static constexpr double HUNT_HZ = 0.8;      // the motor's hunting, about once a second
static constexpr double STEAL_T = 0.005;    // s: a voice Medium or Low lets go fades this fast
static constexpr double COUPLING_HZ = 5;    // the coupling capacitor's corner
static constexpr double SEL_REF = 0.15;     // the light where the selenium cell's L^γ meets L (one note's mean)
static constexpr double FULL = 1.0;         // the amplifier's soft limit, in cell current (about ten notes)

CellulophoneEngine::CellulophoneEngine(double fs) : Engine(fs), coupling(COUPLING_HZ, fs) {
  tables.assign((size_t)SCREENS * 2 * MIPS * (TABLE + 1), 0.0f);
  kFast = 1 - exp(-1 / (fs * SELENIUM_FAST));
  kSlow = 1 - exp(-1 / (fs * SELENIUM_SLOW));
}

void CellulophoneEngine::setQuality(Quality q) { quality = q; }

// Every screen's light, plain and with the slit, through a slot of width a: harmonic n of the screen
// times a·sinc(n a), each table holding the first 32, 16, 8, 4, 2 or 1 harmonics (and the mean).
void CellulophoneEngine::buildTables() {
  static double cs[TABLE], sn[TABLE];
  static bool trig = false;
  if (!trig) { for (int i = 0; i < TABLE; i++) { cs[i] = cos(TAU * i / TABLE); sn[i] = sin(TAU * i / TABLE); } trig = true; }
  double g[H_MAX + 1];
  for (int n = 0; n <= H_MAX; n++) g[n] = slotGain(n, slotW);
  for (int s = 0; s < SCREENS; s++)
    for (int b = 0; b < 2; b++) {
      const Spectrum S = screenSpectrum(s, b == 1);
      for (int m = 0; m < MIPS; m++) {
        const int H = H_MAX >> m;
        float *tab = &tables[(size_t)(((s * 2 + b) * MIPS) + m) * (TABLE + 1)];
        for (int i = 0; i < TABLE; i++) {
          double v = g[0] * S.re[0];
          for (int n = 1; n <= H; n++) {
            const int k = (n * i) % TABLE;
            v += g[n] * (S.re[n] * cs[k] - S.im[n] * sn[k]);
          }
          tab[i] = (float)v;
        }
        tab[TABLE] = tab[0];
      }
    }
  tableSlot = slotW;
}

void CellulophoneEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  const forte::Tuning kb = tuningOf(P.data());
  const int disc = std::clamp((int)P[p::disc], 0, 2);
  const bool retune = !hasP || !(kb == keyboard) || DISC_C[disc] != c0;
  keyboard = kb;
  c0 = DISC_C[disc];
  if (retune) {
    for (int k = 0; k < 128; k++) keyTarget[k] = keyFreq(k) * keyboard.ratio(k);
    turns4 = keyNote(69, c0, keyTarget).turns / pow(2.0, octaveOf(69) - 4);
  }
  slotW = std::clamp(P[p::slot], 0.01, 0.99);
  if (slotW != tableSlot) buildTables();
  wear = std::max(0.0, P[p::wear]);
  hunt = std::max(0.0, P[p::hunt]);
  screen = std::clamp((int)P[p::screen], 0, SCREENS);
  push = std::clamp(P[p::push], 0.0, 1.0);
  tremolo = std::clamp(P[p::tremolo], 0.0, 1.0);
  tremRate = P[p::tremRate];
  touch = std::clamp(P[p::keyTouch], 0.0, 1.0);
  mirrorT = std::max(0.0005, P[p::mirror] / 1000);
  damping = std::max(0.0, P[p::damping]);
  const int lamp = (int)P[p::lamp];
  mainsHz = lamp == 1 ? 50 : lamp == 2 ? 60 : 0; // battery, 50 Hz or 60 Hz mains
  flick = flicker((int)mainsHz);
  cell = (int)P[p::cell];
  drive = std::clamp(P[p::drive], 0.0, 1.0);
  const int spkNow = (int)P[p::speaker];
  if (!hasP || spkNow != speaker) {
    speaker = spkNow;
    for (Biquad &b : spk) b.reset();
    if (speaker == speaker_::cone) {
      spk[0].set(Biquad::hp, 90, 0.9, fs);    // the cone's resonance in its baffle: below it, 12 dB an octave down
      spk[1].set(Biquad::lp, 4500, 0.707, fs); // above, the paper no longer moves as one
      spkCount = 2;
    } else if (speaker == speaker_::horn) {
      spk[0].set(Biquad::hp, 180, 0.9, fs);    // the horn's flare: nothing passes below its cut-off
      spk[1].set(Biquad::peak, 2200, 2, fs, 5); // the driver's diaphragm rings
      spk[2].set(Biquad::lp, 5000, 0.707, fs);
      spkCount = 3;
    } else spkCount = 0;
  }
  // the sounding keys follow: their slots (a new disc or tuning), their screen and their tables
  for (Voice &v : voices) if (v.on) {
    const Note nt = keyNote(v.key, c0, keyTarget);
    v.slots = nt.slots;
    if (v.slot >= v.slots) v.slot = -1;
    v.screen = screen == screen_::octaves ? OCTAVE_SCREEN[v.octave] : screen;
    v.push = expr.slideOr(v.key, push);
    v.depth = 1 - touch + touch * v.vel; v.depth += (1 - v.depth) * v.after;
  }
  hasP = true;
}

// The fraction of the round beam spot past the mirror's edge, when the edge has crossed m of its
// diameter: a circular segment, (θ − sin θ)/2π with θ = 2 arccos(1 − 2m).
double CellulophoneEngine::mirrorLight(double m) const {
  if (m <= 0) return 0;
  if (m >= 1) return 1;
  const double z = 1 - 2 * m, th = 2 * atan2(std::sqrt(1 - z * z), z);
  return (th - sin(th)) / TAU;
}

void CellulophoneEngine::start(Voice &v) {
  const Note nt = keyNote(v.key, c0, keyTarget);
  v.octave = nt.octave; v.pc = nt.pc; v.slots = nt.slots;
  // the most harmonics that stay under Nyquist with the wheel bent up
  const double room = 0.45 * fs / (nt.f * 1.13);
  v.mip = MIPS - 1;
  for (int m = 0; m < MIPS; m++) if ((H_MAX >> m) <= room) { v.mip = m; break; }
  v.screen = screen == screen_::octaves ? OCTAVE_SCREEN[v.octave] : screen;
  v.offset = ringPhase(v.octave, v.pc) * v.slots;
  v.slot = -1; v.mirror = 0; v.arc = 1; v.after = 0;
  v.on = true;
}

void CellulophoneEngine::noteOn(int key, double velocity) {
  if (!hasP || key < 21 || key > 108) return;
  Voice &v = voices[key - 21];
  const bool fresh = !v.on;
  v.key = key;
  if (fresh) start(v);
  v.held = true; v.dying = false;
  v.vel = std::clamp(velocity, 0.0, 1.0);
  v.depth = 1 - touch + touch * v.vel; v.depth += (1 - v.depth) * v.after;
  v.push = expr.slideOr(key, push);
  if (fresh) { v.depthNow = v.depth; v.pushNow = v.push; }
  v.rise = 1 / (mirrorT * (1.25 - 0.75 * v.vel) * fs); // a quick key tilts its mirror faster
  v.fall = 1 / (mirrorT * fs);
  v.arc = 1; v.arcStep = damping > 0 ? 1 / (damping * fs) : 0;
  v.born = t;
  // Quality: past 24 keys sounding at Medium and 12 at Low, the oldest lets go (released ones first)
  const int cap = maxVoices();
  const double steal = 1 / (STEAL_T * fs);
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
    old->held = false; old->fall = steal; old->dying = true;
  }
}

void CellulophoneEngine::noteOff(int key, double) {
  if (key < 21 || key > 108) return;
  Voice &v = voices[key - 21];
  if (v.on) v.held = false;
}

void CellulophoneEngine::allNotesOff() {
  for (Voice &v : voices) v.on = v.held = false;
  for (int o = 0; o < OCTAVES; o++) selFast[o] = selSlow[o] = 0;
}

void CellulophoneEngine::pressure(double value, int key) { // aftertouch: one key (poly) or every held key (channel, −1)
  const double a = std::clamp(value, 0.0, 1.0);
  for (Voice &v : voices) if (v.on && (key < 0 || v.key == key)) {
    v.after = a;
    v.depth = 1 - touch + touch * v.vel; v.depth += (1 - v.depth) * a;
  }
}

void CellulophoneEngine::bend(double value) { bendCents = std::clamp(value, -1.0, 1.0) * kBendSemitones * 100; }

void CellulophoneEngine::slide(double value, int key) {
  expr.setSlide(value, key);
  if (key >= 21 && key <= 108 && voices[key - 21].on) voices[key - 21].push = std::clamp(expr.slideOr(key, push), 0.0, 1.0);
}

int CellulophoneEngine::voiceCount() const {
  int c = 0;
  for (const Voice &v : voices) c += v.on;
  return c;
}

void CellulophoneEngine::process(float *L, float *R, int n) {
  if (!hasP) { for (int i = 0; i < n; i++) L[i] = R[i] = 0; return; }
  // the motor, once a block: the discs follow the wheel through their inertia, and hunt about it
  bendNow = glideTo(bendNow, bendCents, n / fs, FLYWHEEL);
  huntPhase += HUNT_HZ * n / fs; huntPhase -= std::floor(huntPhase);
  cents = bendNow + hunt * sin(TAU * huntPhase);
  const double speed = pow(2.0, cents / 1200);
  double dTheta[OCTAVES];
  for (int o = 0; o < OCTAVES; o++) dTheta[o] = turns4 * speed * pow(2.0, o - 4) / fs;
  const double glide = 1 - exp(-1 / (GLIDE_T * fs));
  const bool errors = wear > 0 && quality != Quality::low; // Low: every slot cut true
  const double g = 1 + 12 * drive * drive;
  for (int i = 0; i < n; i++) {
    for (int o = 0; o < OCTAVES; o++) { theta[o] += dTheta[o]; theta[o] -= std::floor(theta[o]); }
    double cellL[OCTAVES] = {};
    bool any = false;
    for (Voice &v : voices) {
      if (!v.on) continue;
      any = true;
      v.depthNow += glide * (v.depth - v.depthNow);
      v.pushNow += glide * (v.push - v.pushNow);
      if (v.held) v.mirror = std::min(1.0, v.mirror + v.rise);
      else v.mirror = std::max(0.0, v.mirror - v.fall);
      if (v.arcStep > 0) v.arc = std::max(0.0, v.arc - v.arcStep);
      const double pos = v.slots * theta[v.octave] + v.offset, fl = std::floor(pos);
      const int j = (int)((int64_t)fl % v.slots);
      if (j != v.slot) {
        v.slot = j;
        if (errors) { v.eps = wear * slotNoise(v.octave, v.pc, j, 0); v.shift = wear * slotNoise(v.octave, v.pc, j, 1); }
        else v.eps = v.shift = 0;
      }
      double x = pos - fl - v.shift;
      x -= std::floor(x);
      const double at = x * TABLE;
      const int i0 = std::min(TABLE - 1, (int)at);
      const double fr = at - i0;
      const float *a = &tables[(size_t)(((v.screen * 2) * MIPS) + v.mip) * (TABLE + 1)];
      double lv = a[i0] + fr * (a[i0 + 1] - a[i0]);
      if (v.pushNow > 1e-6) {
        const float *b = a + (size_t)MIPS * (TABLE + 1);
        lv += v.pushNow * (b[i0] + fr * (b[i0 + 1] - b[i0]) - lv);
      }
      cellL[v.octave] += (1 + v.eps) * lv * mirrorLight(v.mirror) * v.depthNow * v.arc;
      if ((!v.held && v.mirror <= 0) || (v.arcStep > 0 && v.arc <= 0)) { v.on = v.held = v.dying = false; }
    }
    // the light on it all: the tremolo screen and the lamps' flicker
    double common = 1;
    if (tremolo > 0) { tremPhase += tremRate / fs; tremPhase -= std::floor(tremPhase); common *= 1 - tremolo * (0.5 - 0.5 * cos(TAU * tremPhase)); }
    if (flick > 0) { mainsPhase += 2 * mainsHz / fs; mainsPhase -= std::floor(mainsPhase); common *= 1 + flick * cos(TAU * mainsPhase); }
    double current = 0;
    if (cell == cell_::selenium) {
      for (int o = 0; o < OCTAVES; o++) {
        const double l = cellL[o] * common;
        if (l <= 0 && selFast[o] == 0 && selSlow[o] == 0) continue;
        const double y = l > 0 ? SEL_REF * pow(l / SEL_REF, SELENIUM_GAMMA) : 0;
        selFast[o] += kFast * (y - selFast[o]);
        selSlow[o] += kSlow * (y - selSlow[o]);
        if (std::fabs(selFast[o]) + std::fabs(selSlow[o]) < 1e-12) selFast[o] = selSlow[o] = 0;
        current += (1 - SELENIUM_SLOW_SHARE) * selFast[o] + SELENIUM_SLOW_SHARE * selSlow[o];
      }
    } else if (any) for (int o = 0; o < OCTAVES; o++) current += cellL[o] * common;
    double y = coupling.run(current);
    y = FULL * tanh(g * y / FULL) / g;
    for (int k = 0; k < spkCount; k++) y = spk[k].run(y);
    const double out = tap == 1 ? current : OUT * y;
    L[i] = R[i] = (float)out;
    t++;
  }
}

} // namespace forte::cellulophone
