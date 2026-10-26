// project8-engine.h — the real-time part, on the engine contract (forte/engine.h). A voice is one
// electron in its key's trap, followed as it radiates (the Landau–Lifshitz cooling, in closed form),
// bounces along the field and collides with the gas, and heard through the receiver: the
// waveguide's carrier with the bounce's Doppler shift, or the antennas' harmonics; and the
// receiver's noise in the key's channel.
#pragma once

#include <array>
#include <vector>

#include "forte/engine.h"
#include "forte/expression.h"
#include "project8-model.h"
#include "project8-params.h"

namespace forte::project8 {

// Messages to the page: an electron born; every voice's state, a few times a second (kFrame); a
// collision; an electron's end.
enum MessageType : uint16_t { kBirth = 0, kFrame = 1, kCollision = 2, kEnd = 3 };
// Why an electron's note ended.
enum EndReason : int { kRadiatedOut = 0, kKnockedOut = 1, kReleased = 2, kStolen = 3 };
constexpr int MAX_HARMONICS = 12;
constexpr int FRAME_VOICES = 5; // voices a frame message carries (six numbers each)

class Project8Engine : public Engine {
 public:
  explicit Project8Engine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override { voices.clear(); }
  void bend(double value) override;
  void noteBend(double ratio, int key) override { expr.setBend(ratio, key); }
  void slide(double value, int key) override { expr.setSlide(value, key); }
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

 private:
  static constexpr int kMaxVoices = 48;
  struct Voice {
    int key = 0, nh = 1;
    double vel = 0, gl = 0, gr = 0;
    Electron e;
    Trap trap;
    bool trapped = true, held = true, stolen = false, done = false;
    double Kref = 0, scale = 1, fRef = 0, aRef = 1, age = 0, optical = 0, bendNow = 1;
    double psi = 0, dop = 0, zr = 1, zi = 0;
    std::array<double, MAX_HARMONICS> amp{};
    double env = 1, rel = 1;
    double nx1 = 0, nx2 = 0, ny1 = 0, ny2 = 0; // the noise channel's band-pass
  };
  void start(Voice &v, int key, double velocity);
  void end(Voice &v, int reason, double at = -1); // at: when, if not the voice's age
  void amplitudes(const Voice &v, std::array<double, MAX_HARMONICS> &a, int &nh, double w) const;
  void play(Voice &v, float *L, float *R, int n);
  void frame();
  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  double wheel = 1, wheelTarget = 1, toFrame = 0;
  Rng rng;
  NoteExpression expr{24};
  std::vector<Voice> voices; // reserved (twice kMaxVoices, for the stolen ones fading out): never reallocates
};

} // namespace forte::project8
