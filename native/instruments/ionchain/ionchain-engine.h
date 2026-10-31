// ionchain-engine.h — the Ion Chain on the engine contract (forte/engine.h).
//
//   each key: a trap whose axial frequency is the note, holding the crystal of ionchain-model.h;
//   each normal mode an exact damped oscillator, kept as a phasor c (displacement Re c), so a
//   change of the trap's frequency, its losses or its crystal keeps the motion where it is
//   a key's press: a laser pulse, a kick to each mode's velocity; a restrike adds to what rings
//   the sound: the image current each mode's velocity drives in the two electrodes, left and right
//   held, a mode loses energy only to the electrodes' resistor; a key let go turns on the cooling
//   laser (Space and CC64 keep it off)
//   the mod wheel's radial pull, moved while keys sound: the crystal is solved again, and each
//   voice's motion, as the ions' displacements and velocities, goes onto the new modes
//
// With V8's fdlibm for exp, sin and cos, so the WebAssembly and the plugins ring alike. A fixed
// pool of voices; the crystal's solve (an eigenproblem of up to 40 × 40) happens in setParams,
// when the ions or the radial pull change, never in process.
#pragma once

#include <array>
#include <cstdint>

#include "forte/engine.h"
#include "forte/expression.h"
#include "forte/tuning.h"
#include "ionchain-model.h"
#include "ionchain-params.h"

namespace forte::ionchain {

// What the engine posts (ionchain/src/ionchain-wasm.js): the newest voice's ions, in two parts.
namespace msg {
enum : uint16_t { axial = 1, radial = 2 };
}

struct Voice {
  bool alive = false, held = false, cooled = false, stolen = false;
  int key = 0, N = 0, M = 0;
  int64_t born = 0;
  double f0 = 0;   // the key's note: the trap's axial frequency, heard
  double bend = 1; // its own bend (MPE), gliding
  double lam[MAXM] = {}, wl[MAXM] = {}, wr[MAXM] = {}, sR[MAXM] = {}, sD[MAXM] = {};
  bool on[MAXM] = {}; // modes it plays (Quality)
  // per mode: the phasor, its step per sample, its output weights, and the σ and ω_d they were made for
  double cr[MAXM] = {}, ci[MAXM] = {}, rr[MAXM] = {}, ri[MAXM] = {};
  double lr[MAXM] = {}, li[MAXM] = {}, gr[MAXM] = {}, gi[MAXM] = {};
  double sig[MAXM] = {}, wd[MAXM] = {};
};

class IonChainEngine : public Engine {
 public:
  static constexpr int kPool = 40, kMaxVoices = 32;
  explicit IonChainEngine(double fs);
  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  void bend(double value) override;
  void noteBend(double ratio, int key) override { expr.setBend(ratio, key); }
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

  // read by the tests (ionchain-web.cpp)
  std::array<Voice, kPool> voices;
  Crystal crystal;
  Couplings cpl;
  Voice *newest = nullptr;

 private:
  void tune(Voice &v, bool keep = true);
  void motion(const Voice &v, double *q, double *qd) const;
  void place(Voice &v, const double *q, const double *qd);
  void take(Voice &v); // the current crystal's modes and couplings
  void cool(Voice &v);
  double energy(const Voice &v) const;

  std::array<double, p::count> P{};
  bool hasP = false, sustain = false;
  int64_t clock = 0;
  double bendNow = 1, bendTo = 1;
  double keyTarget[128] = {};
  forte::NoteExpression expr{12};
  int stateEvery = 0, sinceState = 0;
  Crystal before; // the crystal the voices played before a change (for the projection)
};

} // namespace forte::ionchain
