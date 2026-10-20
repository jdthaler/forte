// universe-engine.h — the real-time part, on the engine contract (forte/engine.h). A voice is one
// key's universe: its harmonics are the waves of the acoustic peaks, each a sine at m times the
// note whose amplitude follows that wave from the beginning to recombination (the model's table,
// on a clock the player sets), then holds the pattern the sky shows, or streams away.
#pragma once

#include <array>
#include <atomic>
#include <memory>
#include <vector>

#include "forte/background.h"
#include "forte/engine.h"
#include "universe-model.h"
#include "universe-params.h"

namespace forte::universe {

// Messages to the page: the struck key's universe as it plays.
enum MessageType : uint16_t { kState = 0 };
// What the page packs for the engine (universe_offer): the table as floats, the sky's, the
// Doppler's and the plasma's, each harmonic's NT values in turn.
constexpr int OFFER_SIZE = 3 * MAX_HARMONICS * NT;

class EarlyUniverseEngine : public Engine {
 public:
  explicit EarlyUniverseEngine(double fs);
  ~EarlyUniverseEngine() override;
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  int voiceCount() const override { return (int)voices.size(); }
  void process(float *L, float *R, int n) override;
  // A universe the page built with its own WebAssembly model (no threads there), its table in
  // offerBuffer: the next note takes it instead of building it on the audio thread. cos: ω_b, ω_c,
  // N_eff, Y_p, then τ*, r_s* and k₁. False if it is not for the parameters set.
  bool offer(const double *cos);
  static float offerBuffer[OFFER_SIZE];

 private:
  static constexpr int kMaxVoices = 32;
  using Data = KeyData<Universe>;
  struct Voice {
    int key = 0;
    Data::Ref uni;          // its universe
    double f = 0;           // the fundamental (Hz)
    double gl = 1, gr = 1;  // its place across the keyboard
    double velocity = 0;
    int count = 0;          // harmonics played
    std::array<double, MAX_HARMONICS> c{}, s{}, rc{}, rs{}; // each harmonic's phasor, and its turn a sample
    std::array<double, MAX_HARMONICS> e{}, q{};            // the amplitudes now: cos and sin parts
    std::array<double, MAX_HARMONICS> s0{}, v0{}, p0{};    // the values the light streams from
    double u = 0;           // conformal time over recombination's
    double x1 = 0;          // the fundamental's free-streaming phase, k₁ Δτ
    double attack = 0;      // samples into the note (its first 2 ms are a ramp)
    double fade = 1;        // a stolen voice fades out
    bool held = true, released = false, streaming = false, stolen = false, done = false;
  };
  void startStreaming(Voice &v);
  void amplitudes(Voice &v, double *e, double *q) const;
  void report(const Voice &v);
  uint64_t versionOf(const double *P) const;

  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  int focus = -1, sinceReport = 0;
  uint64_t version = 0;
  // the cosmology of the version the worker builds (it checks the version before and after)
  struct Snapshot { std::atomic<uint64_t> version{0}; std::atomic<double> ob{0}, oc{0}, neff{0}, yp{0}; } snap;
  std::unique_ptr<Universe> offered; // the page's, for offeredVersion
  uint64_t offeredVersion = 0;
  Data data;
  Data::Ref latest;         // the last universe ready: a note before the next one is built plays it
  std::vector<Voice> voices; // reserved: never reallocates
};

} // namespace forte::universe
