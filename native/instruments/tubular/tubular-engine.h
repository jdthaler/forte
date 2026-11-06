// tubular-engine.h — the real-time tubular bells, on the engine contract (forte/engine.h).
//
//   mallet (Hertz contact, implicit) ─▶ every bending mode of the struck tube (exact two-pole recursions)
//   damper bar ─▶ extra loss on every mode of a tube whose key is up, unless the pedal is down
//   output = each mode's pressure at two microphones in front of the frame (its gain and phase,
//   from the line of dipoles the tube is: tubular-model.h)
//
// One voice per tube: striking a ringing tube hits it where it is. Each tube's modes (a few ms to
// find and to radiate) are built off the audio thread by forte/background.h, for the tubes the
// knobs make and the keyboard's tuning (each tube cut to its key's pitch); in the WebAssembly the
// page builds them with its own model and sends each note its tube (the page's noteData). A note
// whose tube is not built yet waits for it. Voices come from a fixed pool: nothing is allocated in
// process().
#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <memory>

#include "forte/background.h"
#include "forte/engine.h"
#include "forte/lift.h"
#include "forte/expression.h"
#include "tubular-model.h"
#include "tubular-params.h"

namespace forte::tubular {

// What the engine posts for the page (tubular/src/tubular-wasm.js turns them into its 'tube' and
// 'error' messages).
namespace msg {
enum : uint16_t {
  tube = 1,  // the focus key (0: none); amp[16] (each mode's amplitude), E, contactMs, Fmax, damp, malletOn
  error = 2, // key: a tube's numerical failure
};
}
inline constexpr int VIEW_MODES = 16;

class TubularEngine : public Engine {
 public:
  static constexpr int POOL = 48;      // voices, sounding or fading (at most 24 sound at once)
  static constexpr int BLOCK_MAX = 1024;
  explicit TubularEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override { sustain = on; }
  void slide(double value, int key) override { expr.setSlide(value, key); } // the key's mallet face, at its next strike
  void allNotesOff() override;
  int voiceCount() const override { return nVoices; }
  void process(float *L, float *R, int n) override;
  // A tube its page's model built already (packTube; the page's noteData), for the next note on
  // that key, so the audio thread needn't build it. Only without threads (WebAssembly): with
  // them, the worker builds every tube ahead.
  bool offer(const double *packed, int n);

  using Data = KeyData<Tube>;
  struct Voice {
    int key = 0, N = 0;
    const Tube *d = nullptr;
    Data::Ref ref;
    uint64_t version = 0;
    bool inUse = false;
    std::array<double, MAX_MODES> q{}, q1{}, a1{}, a2{}, bc{}, ws{}, bws{}, sig{};
    std::array<double, MAX_MODES> l0{}, l1{}, r0{}, r1{}; // each microphone's y = c₀q[n] + c₁q[n−1]
    // the farther microphone hears the tube later: its channel waits `lag` samples in a ring (the
    // fraction of a sample, and every path's own difference, are in the modes' phases)
    static constexpr int RING = 512;
    std::array<float, RING> ring{};
    int lag = 0, late = 0, at = 0; // samples; which channel (0 left, 1 right); the ring's place
    std::array<bool, MAX_MODES> cut{}; // modes at or above 0.45 fs (or Quality's top): left out
    double compModes = 0;
    bool malletOn = false, contact = false;
    double eta = 0, etaPrev = 0, dPrev = -1, dPrev2 = -1;
    int inFlight = 0, contactSamples = 0;
    double Fmax = 0, lastContactMs = 0;
    bool released = false;
    double damp = 0, dampSet = -1;
    double liftK = 1; // how many times longer than usual its damper takes to stop it (forte/lift.h)
    double fade = 1;
    bool fading = false, dead = false;
    double age = 0;
    double E = 0, Emax = 0;
    double top = 0, floor = 0; // Quality's, when the tube was struck: its highest mode (Hz), and where it is let go (× its most energy)
    Mallet mal{};
    double kOverM = 0, halfAlpha = 0;
    double fd0 = 0, fV0 = 0, fP0 = 0; // the contact's step: compression, potential and δ^p two steps back

    void start(TubularEngine &eng, Data::Ref r, uint64_t ver);
    void coefs(const TubularEngine &eng);
    void strike(const TubularEngine &eng, double velocity);
    double face(double D) const;
    double contactForce(double dFree, double C);
    void render(float *L, float *R, int n, TubularEngine &eng);
  };

  // read by the tests (through the WebAssembly's hooks), in the order they started
  std::array<Voice *, POOL> voices{};
  int nVoices = 0;
  std::array<Voice *, 128> byKey{};
  Voice *focus = nullptr;

 private:
  void strikeKey(int key, double velocity, Data::Ref r);
  void retryPending();
  void processBlock(float *L, float *R, int n);
  void postFocus();

  std::array<double, p::count> P{};
  bool hasParams = false;
  bool sustain = false;
  NoteExpression expr{0}; // each key's own mallet face (no bend: a tube is cut to its pitch)
  // the tubes' version: a new one when what cuts them changes (the metal, the section, the cap, the
  // microphones' distance, the tuning); its snapshot (a ring, read by the builder) holds those
  uint64_t version = 0;
  struct Build { double material = 0, diameter = 0, wall = 0, cap = 0, distance = 0; forte::Tuning tuning; bool operator==(const Build &) const; };
  Build built;
  struct Snapshot {
    std::atomic<double> material{0}, diameter{38.1}, wall{1.6}, cap{120}, distance{3};
    std::atomic<double> ratio[12] = {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1};
  };
  std::array<Snapshot, 8> snapshots;
  Data data;
  std::unique_ptr<Tube> offered;
  std::array<Voice, POOL> pool{};
  // notes whose tube is still being built (only with threads)
  struct Pending { int key; double velocity; bool off; };
  std::array<Pending, 64> pending{};
  int nPending = 0;
  int blocks = 0;
  int malletMax;
  Message view; // kept between posts
};

} // namespace forte::tubular
