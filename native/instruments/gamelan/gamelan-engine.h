// gamelan-engine.h — the real-time part, on the engine contract (forte/engine.h). Every struck
// key is a voice: one instrument's bar or gong, or a pair of them a few hertz apart (the ombak),
// each mode an exact two-pole resonator. A gangsa's bar drives the air in its tube, and the tube
// the bar (two oscillators coupled through the air between them); a gong's note drives its second
// round mode through the face's curvature (a quadratic force). The damping hand stops notes as the
// player's would. A note's own slide (MPE) is its own pair's beat.
#pragma once

#include <array>
#include <vector>

#include "forte/engine.h"
#include "forte/expression.h"
#include "gamelan-model.h"
#include "gamelan-params.h"

namespace forte::gamelan {

class GamelanEngine : public Engine {
 public:
  explicit GamelanEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override { voices.clear(); }
  void slide(double value, int key) override { expr.setSlide(value, key); } // the key's own beat
  int voiceCount() const override { return (int)voices.size(); }
  void process(float *L, float *R, int n) override;

  // What the page's views are sent (Engine::post): type 1, the last struck key's pair (its beat
  // in Hz, its age in s, its family, the two partners' notes in Hz); type 2, the sounding keys'
  // (key, level) pairs, loudest first, with their number as the key.
  enum Msg : uint16_t { msgFocus = 1, msgVoices = 2 };

  static constexpr int kMaxVoices = 48;
  struct Res { double a1 = 0, a2 = 0, b = 0, w = 0, out = 0, y1 = 0, y2 = 0; };
  struct Sub {                        // one instrument: a bar (and its tube) or a gong
    std::array<Res, kModes> m{};
    Res tube{};
    double gl = 0, gr = 0, f1 = 0;
  };
  struct Voice {
    int key = 0, band = 0, family = 0;
    KeyDesign d;
    std::array<Sub, 2> sub{};
    int subs = 1, count = 0;          // partners sounding; modes each
    double beat = 0, vel = 0;         // the pair's beat now (Hz)
    bool held = false, released = false, damped = false;
    int age = 0;                      // samples since its last stroke
  };
  const Voice *voice(int key) const { for (const Voice &v : voices) if (v.key == key) return &v; return nullptr; }
  // A voice's level: its notes' modal velocity amplitudes, summed over the partners.
  double level(const Voice &v) const;

 private:
  void build(Voice &v);
  void tune(Voice &v, double beat); // the partners' coefficients for this beat (splitting a single one)
  void damp(Voice &v);
  void stroke(Voice &v, double velocity);
  double beatOf(int key) const;
  void postViews();

  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  int focus = -1, sincePost = 0;
  NoteExpression expr{0};
  std::vector<Voice> voices; // reserved: never reallocates
};

} // namespace forte::gamelan
