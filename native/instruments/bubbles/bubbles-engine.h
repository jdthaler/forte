// bubbles-engine.h — the real-time bubble organ, on the engine contract (forte/engine.h).
//
//   key held ─▶ its nozzle releases bubbles (the first at once, then at the set rate, seeded random gaps;
//   with MPE, the key's own bend sizes its next bubbles to ring ×r, and its slide sets its own rate)
//   each bubble: the neck snaps (a pressure kick, ramped over the snap time) ─▶ a damped oscillator for
//   its wall, run as a rotating phasor (exact for constant ω₀ and b)
//   while it rises, its depth, size and the surface's image change ω₀ and b: recomputed every block,
//   swept smoothly sample by sample
//   output = the volume acceleration ρR²ẍ/r heard by two hydrophones; with the surface's echo,
//   each also hears the bubble's inverted image above the surface, later and fainter (scattered into
//   a delay line, one per hydrophone, at each bubble's own delay)
//
// One nozzle per key. Bubbles live in a fixed pool; beyond `soft` ringing bubbles the quietest old
// one fades out. Nothing is allocated in process() (but for the tests' log).
#pragma once

#include <array>
#include <cstdint>
#include <vector>

#include "bubbles-model.h"
#include "bubbles-params.h"
#include "forte/engine.h"
#include "forte/expression.h"
#include "forte/impulses.h"

namespace forte::bubbles {

// What the engine posts for the page (bubbles/src/bubbles-wasm.js turns them into its 'bubbles'
// and 'wave' messages).
namespace msg {
enum : uint16_t {
  release = 1, // key; offset in the block, R, fd, b, U, d0, vel
  bubbles = 2, // frame at the block's end (÷2²⁴, mod 2²⁴), the block's length, bubbles ringing
  waveStart = 3, // key; dt, R, fd, b, delta, dth, drad, dvis, kappa, d0, frame (÷2²⁴, mod 2²⁴), p0, chi, m, vel, U
  waveData = 4,  // the first sample's index, then up to 29 samples (Pa at r_ref)
  waveShow = 5,  // count, done
};
}

class BubbleEngine : public Engine {
 public:
  static constexpr int kPool = 192, kSoft = 160;
  static constexpr int WAVE_N = 1024; // points of the latest bubble's recorded waveform
  explicit BubbleEngine(double fs, uint32_t seed = 0x5eed, int pool = kPool, int soft = kSoft);
  // the tests' hooks: the seed, the pool's size and the soft limit. Allocates; call before
  // playing.
  void configure(uint32_t seed, int pool, int soft);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  void pressure(double value, int key) override; // aftertouch: more gas through the nozzle
  void bend(double value) override;              // the pump: the pressure at the nozzles ×r², the notes ×r
  void noteBend(double ratio, int key) override; // one nozzle's next bubbles sized to ring ×r
  void slide(double value, int key) override;    // one nozzle's own bubble rate
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

  struct Bubble {
    bool on = false;
    int key = 0, start = 0;
    double age = 0;
    double ur = 0, ui = 0, mr = 1, mi = 0, sr = 0, si = 0, cr = 0, ci = 0;
    double gl = 0, gr = 0, fade = 1, fadeStep = 0;
    int rampLeft = 0, rampN = 1, rampK = 0;
    double rampA = 0, rampV = 0, rampAl = 0, rampBe = 0;
    double env = 0, peak = 0;
    // the bubble at release, for its glide
    double R0 = 0, R = 0, d0 = 0, d = 0, U = 0, pg0 = 0, pv = 0, phiRe = 0, phiIm = 0, nSlow = 1;
    double eg[2] = {0, 0}, et[2] = {0, 0}; // the surface's echo at each hydrophone: gain, delay (samples)
    const Liquid *liq = &LIQUIDS[0];
    const Gas *gas = &GASES[0];
    double b = 0, wd = 0, w0 = 0, fd0 = 0, vel = 0;
  };
  struct Nozzle { int key = 0; bool held = false, owed = false, first = true; double vel = 0, due = 0, press = 0; int released = 0; };
  struct LogEntry { int key; int64_t frame; double R, vel; bool first; };

  // read by the tests (through the WebAssembly's hooks)
  std::vector<Bubble> pool;
  std::array<Nozzle, NK> nozzles;
  bool logging = false;
  std::vector<LogEntry> log;

 private:
  double gauss();
  double interval(const Nozzle &z);
  double radius(int i);
  void startFade(Bubble &b, double sec);
  bool release(Nozzle &z, int offset);
  void setRing(Bubble &b, const Acoustics &a);
  void startRecording(Bubble &b, const Acoustics &a);
  bool glide(Bubble &b, int n);
  void render(Bubble &b, float *L, float *R, int n);
  void echoTargets(const Bubble &b, double gl[2], double eg[2], double et[2]) const;
  void postViews(int n);

  std::array<double, p::count> P{};
  bool hasParams = false;
  Mulberry32 rand;
  double spare;
  int soft;
  std::array<double, NK> Rnom{}, Rtune{}, gainL{}, gainR{};
  std::vector<float> echo[2]; // the surface's echo, scattered ahead of the hydrophones' read point
  int echoMask = 0, echoPos = 0;
  std::array<int, NK> tuneVer{}, nomVer{};
  int ver = 0, nomV = 0; // the conditions' version (Rtune), and the keyboard tuning's (Rnom)
  forte::Tuning tuning;  // the keyboard's (forte/tuning.h): each nozzle is cut for its key's tuned note
  Env def;               // the default conditions, which the nozzles are cut for without "keep in tune"
  Env env;       // conditions at the nozzles (targets)
  Acoustics ac{}; // scratch: a rising bubble's acoustics
  double pT = P_ATM, pTarget = P_ATM, pB = P_ATM; // pB: the air above the water with pitch bend's push
  double bendTo = 1, bendNow = 1;                 // pitch bend: the ratio, and where the glide is
  NoteExpression expr{24};                        // each nozzle's own bend and rate (MPE)
  int64_t frame = 0;
  int blocks = 0, nev = 0;
  // the latest bubble's waveform, for the page
  Bubble *rec = nullptr;
  int recStride = 1, recPhase = 0, recPost = 0;
  std::array<float, WAVE_N> wave{};
  int waveCount = 0, waveSent = 0, waveKey = 0;
  bool waveDone = false, waveNew = false;
  float waveMeta[17] = {};
};

} // namespace forte::bubbles
