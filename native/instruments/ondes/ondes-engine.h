// ondes-engine.h — the ondes Martenot on the engine contract (forte/engine.h).
//
//   each voice: the beat of two radio-frequency oscillators, its phase φ stepped exactly each
//   sample through Adler's equation (ondes-model.h), the free-running difference Δ trimmed so
//   that the pulled beat lands on the key's note; the drawer's timbres shaped from φ (onde,
//   creux, petit gambe, gambe, nasillard, octaviant), their steps and corners band-limited with
//   polyBLEP and polyBLAMP where φ crosses them, and the souffle's pink noise
//   the intensity key: the force of the finger (velocity, aftertouch) rises and falls with the
//   press and the release, and sets the level along Quartier et al.'s measured curve
//   Keys: a voice for every key; Ribbon: one voice whose ring slides, evenly in semitones, to each
//   key pressed while another is held
//   the keyboard's vibrato (the mod wheel) and the oscillators' thermal drift move Δ
//   the diffuseurs, on the sum of the voices: the principal loudspeaker; the Résonance's speaker
//   and its seven springs (their modes, from the curved-rod dispersion relation); the Métallique's
//   tam-tam (the free plate's modes, driven at the voice coil); the Palme's 24 strings
//   (Karplus–Strong loops through their shared bridge), each placed across the stereo field
//
// With V8's fdlibm, so the WebAssembly and the plugins play alike. A fixed pool of voices and fixed
// banks; nothing is allocated after construction.
#pragma once

#include <array>
#include <cstdint>

#include "forte/dsp.h"
#include "forte/engine.h"
#include "forte/expression.h"
#include "forte/tuning.h"
#include "ondes-model.h"
#include "ondes-params.h"

namespace forte::ondes {

// What the engine posts (ondes/src/ondes-wasm.js): the newest voice's state.
namespace msg {
enum : uint16_t { state = 1 };
}

struct Voice {
  bool alive = false, held = false, stolen = false;
  int key = 0;
  int64_t born = 0;
  double vel = 0, after = 0, F = 0, aPress = 0, aLift = 0; // the intensity key's force (N), and how fast it follows
  double g0 = 0, g1 = 0;            // its gain at the chunk's start and end
  double u = 0, uTo = 0, uRate = 0; // log₂ of the note's frequency: the ribbon slides it to uTo at uRate per second
  double bend = 1, vib = 0;         // its own bend and vibrato depth (MPE), gliding
  double f = 0, delta = 0;          // the note now (Hz) and the oscillators' free-running difference (Hz)
  double zr = 1, zi = 0;            // z = e^{iφ}
  Mobius step{1, 0, 0, 0, 1, 0};    // Adler's step over one sample, for this chunk
  double prev = 0;                  // the timbres, one sample late, for the band-limiting
  uint32_t seed = 1;                // the souffle's noise
  double b0 = 0, b1 = 0, b2 = 0;    // its pink filter
};

// A bank of modes driven by one signal: each z ← p z + x, out = norm Σ g Re z.
template <int N>
struct Bank {
  int n = 0;
  double pr[N] = {}, pi[N] = {}, g[N] = {}, zr[N] = {}, zi[N] = {};
  double norm = 0;
  bool live = false;
  double run(double x) {
    double y = 0;
    for (int k = 0; k < n; k++) {
      const double r = zr[k];
      zr[k] = pr[k] * r - pi[k] * zi[k] + x;
      zi[k] = pr[k] * zi[k] + pi[k] * r;
      y += g[k] * zr[k];
    }
    return norm * y;
  }
  void clear() { for (int k = 0; k < N; k++) zr[k] = zi[k] = 0; live = false; }
  void add(double f, double sigma, double gain, double fs);
  void normalise(); // white noise in, the same power out
};

// One of the palme's strings: a delay loop with a first-order Thiran allpass for the fraction and a
// one-pole loss filter, driven where it crosses the bridge.
struct PalmeString {
  static constexpr int SIZE = 2048;
  double buf[SIZE] = {};
  int w = 0, N = 100;
  double a = 0, g = 0, c = 0.2, x1 = 0, y1 = 0, l1 = 0, weight = 0;
  double run(double in) {
    const double yN = buf[(w - N + SIZE) & (SIZE - 1)];
    const double ap = a * yN + x1 - a * y1;
    x1 = yN; y1 = ap;
    l1 = (1 - c) * ap + c * l1;
    const double loop = g * l1;
    buf[w] = loop + in;
    w = (w + 1) & (SIZE - 1);
    return weight * loop;
  }
};

class OndesEngine : public Engine {
 public:
  static constexpr int kPool = 40, kMaxVoices = 32;
  static constexpr int kGong = 480, kSprings = 7 * 80;
  explicit OndesEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  void pressure(double value, int key) override;
  void bend(double value) override;
  void noteBend(double ratio, int key) override { expr.setBend(ratio, key); }
  void slide(double value, int key) override { expr.setSlide(value, key); }
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

  // read by the tests (ondes-web.cpp)
  std::array<Voice, kPool> voices;
  Bank<kGong> gong;
  Bank<kSprings> springs;
  std::array<PalmeString, PALME> palme;
  int64_t t = 0;
  Voice *newest = nullptr;
  double driftHz = 0;

 private:
  void update(Voice &v, double dt, int m);
  void start(Voice &v, int key, double velocity);
  void steal(const Voice *keep);
  void detector();
  void buildDiffuseurs();
  double voiceSample(Voice &v);
  double random(); // uniform in [−1, 1), the engine's own generator (the drift)

  std::array<double, p::count> P{};
  bool hasP = false, ribbon = false;
  double K = 0;                         // the pull, Hz
  double a = 0.3, m0 = 0, c1 = 1;       // the detector's balance, its mean and fundamental
  double wO = 0, wC = 0, wg = 0, wG = 0, wN = 0, width = 0.15, sN = 1, cN = 0, octave = 0, souffle = 0;
  struct Edge { double c, s, step, slope; };
  Edge edges[6] = {};
  int nEdges = 0;
  double bendNow = 1, bendTo = 1, vibPhase = 0;
  double keyTarget[128] = {};
  forte::Tuning keyboard;
  forte::NoteExpression expr{48};
  int stack[128] = {}, held = 0; // Ribbon: the keys down, oldest first
  uint32_t rng = 0x9E3779B9u;
  // the diffuseurs
  Biquad hpP, lpP, hpR;
  double dP = 1, dR = 0, dM = 0, dPalme = 0;
  double builtFor[8] = {-1};
  Quality builtQuality = Quality::high;
  int stateEvery = 0, sinceState = 0;
};

} // namespace forte::ondes
