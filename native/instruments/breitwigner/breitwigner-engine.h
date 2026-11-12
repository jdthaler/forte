// breitwigner-engine.h — the real-time part, on the engine contract (forte/engine.h). Each key
// has one state: a complex number, turned once a sample at its mass and shrunk at half its
// width, exactly (breitwigner-model.h). What is heard is one of its two parts.
#pragma once

#include <array>

#include "forte/engine.h"
#include "forte/expression.h"
#include "forte/lift.h"
#include "forte/press.h"
#include "breitwigner-model.h"
#include "breitwigner-params.h"

namespace forte::breitwigner {

// Messages to the page: every state ringing now, about thirty times a second (kFrame), four
// numbers each (its key, |ψ|, and its frequency and full width in the lab, Hz), FRAME_STATES to a
// message; a message's key is how many more states the frame's later messages hold (0: this one
// ends it). One empty frame says that the last state has gone.
enum MessageType : uint16_t { kFrame = 0 };
constexpr int FRAME_STATES = 7;
constexpr double FRAME_T = 1.0 / 30;

class BreitWignerEngine : public Engine {
 public:
  static constexpr int KEYS = 128;
  explicit BreitWignerEngine(double fs) : Engine(fs) {}
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  void bend(double value) override { wheel = value; }
  void noteBend(double ratio, int key) override { expr.setBend(ratio, key); }
  void slide(double value, int key) override { expr.setSlide(value, key); }
  void pressure(double value, int key) override { presses.set(value, key); }
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

  struct State {              // a key's state, and what it turns and dies by
    bool on = false;          // it rings
    bool down = false;        // its key is held
    bool open = false;        // its key-up channel is open
    double zr = 0, zi = 0;    // ψ (written turning as e^(+iMt): what is heard is its imaginary part)
    double mass = 0;          // Hz, at rest
    double share = 0;         // its own Γ/M now (it glides to the Width control's, or to its slide's)
    double gamma = 1;         // its boost now
    double lift = 1;          // how wide its key-up channel opened, over the control's (Lift)
    Press press;              // how hard its key is pressed
    double f = 0, fwhm = 0;   // in the lab, this block (Hz)
    double rr = 1, ri = 0;    // its turn per sample, decay included
    double fc = -1, wc = -1;  // what that turn was made for
  };
  // read by the tests (through the WebAssembly's hooks)
  std::array<State, KEYS> states{};

 private:
  void frame();
  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  bool told = true; // the page knows that nothing rings
  double wheel = 0, toFrame = 0;
  NoteExpression expr{0, BOOST_SEMITONES}; // a boost only raises the energy: γ ≥ 1
  Presses presses;
};

} // namespace forte::breitwigner
