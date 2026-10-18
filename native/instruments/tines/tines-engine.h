// tines-engine.h — the real-time tine piano, on the engine contract (forte/engine.h): coupled
// tine/tone-bar modes, a neoprene hammer, the nonlinear electromagnetic pickup, the harp's wiring,
// the suitcase vibrato, the amp's drive and the speaker.
//
//   hammer (implicit, hysteretic) ─▶ coupled modes (exact two-pole recursions), 2× oversampled
//   tip position ─▶ pickup Φ(Y) = (1 + ((Y + yoff)/w)²)^(-3/2), emf ∝ −dΦ/dt ─▶ Σ voices
//   ─▶ harp resonance ─▶ stereo vibrato ─▶ amp drive ─▶ half-band decimation ─▶ speaker
//
// Each key's modes (tines-model.h, the page's noteData) are built off the audio thread by
// forte/background.h for the 'model' parameters as they stand; a note whose key is not built yet
// waits for it (a few ms). The WebAssembly has no threads: the page builds the data with its own
// WebAssembly model and offers it with the note (offer), and the engine keeps the last data sent
// per key. The pickups move live from the parameters. Voices come from a fixed pool:
// nothing is allocated in process().
#pragma once

#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <vector>

#include "forte/background.h"
#include "forte/engine.h"
#include "tines-model.h"
#include "tines-params.h"

namespace forte::tines {

// What the engine posts for the page (tines/src/tines-wasm.js turns them into its 'hammer' and
// 'error' messages).
namespace msg {
enum : uint16_t {
  hammer = 1, // key: the hammer left the tine; contactMs, Fmax
  error = 2,  // key: numerical instability, the voice is silenced
};
}

class TinesEngine : public Engine {
 public:
  static constexpr int OS = 2;          // the voices run 2× oversampled
  static constexpr int MAXN = 2048;     // output samples per internal block
  static constexpr int POOL = 160;      // voices, sounding or dying
  static constexpr int MAX_VOICES = 40; // sounding at once: beyond this the quietest is released
  static constexpr int T = 63;          // decimation FIR taps
  explicit TinesEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override; // velocity: the hammer's speed in m/s
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  void bend(double value) override; // the tuning springs slide: every fork's stiffness ×r², its notes ×r
  int voiceCount() const override { return nVoices; }
  void process(float *L, float *R, int n) override;
  // A key's voice data from the page (packVoiceData), kept for that key's notes until the next
  // is sent. Only without threads (WebAssembly).
  bool offer(const double *packed, int n);
  double *offerBuffer() { return offered.data(); } // where the page writes it (PACK_MAX numbers)

  struct Biquad {
    double b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, z1 = 0, z2 = 0;
    void set(bool lowpass, double f, double Q, double fs);
    double run(double x) {
      const double y = b0 * x + z1;
      z1 = b1 * x - a1 * y + z2;
      z2 = b2 * x - a2 * y;
      return y;
    }
  };

  struct Voice {
    int key = 0, N = 0;
    uint64_t version = 0;
    bool inUse = false;
    double k = 0;
    std::array<double, MAX_MODES> q{}, q1{}, a1{}, a2{}, a1d{}, a2d{}, w{}, bw{}, pk{}, om{}, sig{}, dw{}, om0{};
    double comp = 0, bend = 1; // om0: the modes unbent; bend: the ratio om is tuned to
    Hammer hammer{};
    double wid = 0, wid1 = 0, tWid = 0, yoff = 0, yoff1 = 0, tYoff = 0, gain = 0, gain1 = 0, tGain = 0;
    bool pickupMoving = false;
    double phiPrev = 0;
    bool hasDamper = true;
    bool keyDown = true, damped = false, killing = false, dead = false, hammerOn = false, contact = false;
    int contactSamples = 0, hammerSamples = 0, quiet = 0;
    double Fmax = 0, peak = 0, age = 0, yMin = 0, yMax = 0, damperSigma = 0;
    double eta = 0, etaPrev = 0, dPrev = -1, kOverM = 0, alphaK = 0;

    void start(TinesEngine &eng, int key, const VoiceData &d);
    double flux(double Y) const { const double z = 1 + std::pow(Y / wid, 2); return 1 / (z * std::sqrt(z)); }
    void retargetPickup(const Pickup &pu);
    void setDamper(double sd);
    void tune(double r); // the modes at r × om0: a1, a2, bw, comp (then setDamper for a1d, a2d)
    void updateDamping(const TinesEngine &eng) { damped = killing || (!keyDown && !eng.sustain && hasDamper); }
    void kill() { killing = true; setDamper(damperSigma); damped = true; }
    void strike(double v);
    double contactForce(double dFree);
    void render(double *buf, int n, TinesEngine &eng);
  };

  // read by the tests and the slow-motion view (through the WebAssembly's hooks), in the order
  // they started
  std::array<Voice *, POOL> voices{};
  int nVoices = 0;
  std::array<Voice *, 128> byKey{};
  Voice *last = nullptr; // the voice the latest noteOn struck

 private:
  using Data = KeyData<VoiceData>;
  void strikeKey(int key, double velocity, const VoiceData &d);
  void retryPending();
  void trimVoices(const Voice *keep);
  void snapLive();
  void block(float *L, float *R, int off, int n);

  std::array<double, p::count> P{};
  bool hasParams = false;
  bool sustain = false;
  const double fs2;
  const int hammerMax;
  const double aSm, aPick;
  bool overLimit = false;
  // the output stage: harp resonance, vibrato, drive, decimation, speaker
  std::array<double, T> fir{};
  std::array<double, 128> histL{}, histR{};
  int hi = 0;
  Biquad harp, hpL, hpR, lpL, lpR;
  double tremPhase = 0;
  double bendTo = 1, bendNow = 1; // pitch bend: the ratio, and where the glide is
  double sCable = 0, sResQ = 0, sTone = 0, sDrive = 0, sDepth = 0, sMaster = 1;
  bool gliding = false;
  std::vector<double> mono;

  // the voice data, built off the audio thread for each version of the model parameters
  struct Snapshot { std::atomic<uint64_t> version{0}; std::array<std::atomic<double>, p::count> P{}; };
  std::array<Snapshot, 8> snapshots;
  int snapAt = 0;
  uint64_t version = 0;
  int focus = 60;
  Data data;
#if !FORTE_THREADS
  std::array<VoiceData, 128> sent{};
  std::array<bool, 128> hasSent{};
#endif
  std::array<double, PACK_MAX> offered{};
  std::array<Voice, POOL> pool{};
  int nextSlot = 0;
  // notes whose key is still being built (only with threads)
  struct Pending { int key; double velocity; bool off; };
  std::array<Pending, 64> pending{};
  int nPending = 0;

  friend struct Voice;
};

} // namespace forte::tines
