// regal-engine.h — the real-time regal, on the engine contract (forte/engine.h).
//
//   two wedge bellows ─▶ trunk (tremulant's vent) ─▶ chest P_w ─▶ pallet ─▶ boot P_b ─▶ gap A(q) ─▶ shallot ─▶ resonator ─▶ air
//                                                                                      ▲            │ (waves both ways)
//                                                       tongue q ◀─ S (P_b − p_d) ─────┴────────────┘
//
// Each reed runs at its own rate: from F_OS up at twice the sample rate (the sum brought down by a
// 63-tap half-band FIR), below it at the sample rate. Per step the tongue moves under the pressure
// across it, its stiffness, its losses and its contact with the shallot (symplectic Euler); the
// flow through the gap then follows from Bernoulli and the wave arriving from the tube, in closed
// form; the boot's pressure is stepped implicitly through its pallet; and the tube's waves cross
// its junctions (Kelly–Lochbaum) to the open end, which radiates.
//
// One voice per key, holding a reed for each rank (16′, 8′, 4′); the stops open and close the
// ranks' mutes over 20 ms. Beyond 16 keys the quietest released key fades out over 30 ms. Voices
// come from a fixed pool, each reed with its own delay memory; nothing is allocated in process().
#pragma once

#include <array>
#include <cstdint>

#include "forte/engine.h"
#include "forte/expression.h"
#include "regal-model.h"
#include "regal-params.h"

namespace forte::regal {

constexpr int TRACE = 128;      // points in the live trace of the focused reed
constexpr double SIM_FS = 48000; // Hz: every reed steps at this rate (twice it from fOS up), read at the host's
constexpr int POOL = 40;        // voices: 16 keys sounding, and those fading out
constexpr int DL = 4096;        // floats of delay memory per reed (both directions, every segment)
constexpr double MPE_BEND = 7;  // semitones a key's own bend reaches (its tuning wires)

// What the engine posts for the page (regal/src/regal-wasm.js turns them into its messages).
namespace msg {
enum : uint16_t {
  trace = 1,  // key: which trace (0 q, 1 U, 2 p_d, 3 P_b); the first index, then up to 29 points
  reed = 2,   // key (0: none focused); rank, f0, fNat, L, b, h, h0, Ls, bs, dtTrace, n, qAmp, fSound
  wind = 3,   // P0, P_bellows, P_chest, fill 0, fill 1, active, draw (L/s), hand, trem
};
}

class RegalEngine : public Engine {
 public:
  explicit RegalEngine(double fs, uint32_t seed = 1);
  // the tests: the seed and the frequency from which reeds run at 2× (0: all; infinity: none)
  void configure(uint32_t seed, double fOS);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void allNotesOff() override;
  void bend(double value) override;
  void noteBend(double ratio, int key) override { expr.setBend(ratio, key); }
  void pressure(double value, int key) override;
  int voiceCount() const override;
  void process(float *L, float *R, int n) override;

  // One reed in its tube, at its own rate.
  struct Sim {
    const Reed *R = nullptr;
    int os = 1;
    double h = 0, m = 1, k = 1, c = 0, S = 0, h0 = 0, bs = 0, Ls = 0, Ks = 0, zc = 0;
    double Ch = 0, Kp = 0, Z0 = 0, Zend = 0, beta = 0, eta = 0, noiseAmp = 0;
    int nseg = 0, lenR[MAX_SEG] = {}, lenL[MAX_SEG] = {}, offR[MAX_SEG] = {}, offL[MAX_SEG] = {}, posR[MAX_SEG] = {}, posL[MAX_SEG] = {};
    double rj[MAX_SEG] = {}, gl[MAX_SEG] = {};
    bool ap = false;
    // state
    double q = 0, v = 0, Pb = 0, pd = 0, U = 0, Uin = 0, lp = 0, Um = 0, out = 0, apx = 0, apy = 0;
    double env = 0, energy = 0, envK = 0.9999, Gl = 0, shutT = 0;
    uint32_t rng = 1;
    bool asleep = true;
    float buf[DL];
    void init(const Reed &model, double fs, double fOS, double kr, uint32_t seed);
    // a bend of r: the whole reed, tongue, shallot and resonator, runs r times faster (as if each
    // were cut r times smaller in time), stepped r times a sample and read between its last two steps
    double rate = 1, ph = 0, prev = 0, y = 0, uIn = 0;
    // its pitch, as it sounds in its own time with the pallet open (past its first 0.25 s): the
    // tongue's crossings of half its curve, counted in steps
    double nStep = 0, yc = 0, tFirst = -1, tLast = -1;
    int nCross = 0;
    double pitch() const { return nCross >= 8 && (tLast - tFirst) * h > 0.15 ? nCross / ((tLast - tFirst) * h) : 0; }
    // one tick of its own rate: as many steps as are due, y its sound and uIn its draw on the chest
    void tick(double Pw, double open);
    void reset();
    // one step with the chest at Pw and the pallet open by `open` (0..1)
    void step(double Pw, double open);
    double noise();
  };
  struct Voice {
    int key = 0;
    Voicing voicing{};
    std::array<Reed, NRANKS> model{};
    std::array<Sim, NRANKS> sim;
    double mute[NRANKS] = {};
    double open = 0, openTo = 0, openRate = 0, fade = 1, env = 0, age = 0, gl = 0, gr = 0, nb = 1;
    double learn[NRANKS] = {}; // the voicer's ear: what the key's reeds sounded off their retuning last time
    bool down = false, fading = false, dead = false, used = false;
  };
  double rateOf(const Voice &v, int r) const; // a reed's rate: its bends and the voicer's retuning
  // The voicer's ear: the table's retuning is measured one knob at a time, and knobs moved together
  // can leave a reed off its note; each reed's pitch is heard while its key is held, and the next time
  // the key is pressed (with the same voicing) the reed is run that much faster or slower.
  double learned[NRANKS][128] = {};
  Voicing learnedFor{};
  void listen(Voice &v);

  // read by the tests: the voices in the order they started, the wind
  std::array<Voice *, POOL> voices{};
  int count = 0;
  double Pbel = 0, Pw = 0, Pws = 0, fill[2] = {1, 1}, draw = 0;
  int active = 0;

 private:
  void start(Voice &v, double velocity);
  void stepWind(double Uin);
  void decimate(float *L, float *R, int n);
  void record(const Sim &s, int sub);
  void postView();
  void updateAfter();

  std::array<double, p::count> P{};
  bool hasParams = false, started = false;
  double fOS = 250;
  uint32_t seed = 1, seq = 0;
  Voicing voicing{};
  Tuning tuning;
  double bendTo = 1, bendNow = 1;
  NoteExpression expr{MPE_BEND};
  std::array<double, 128> press{};
  double after = 0, afterS = 0, P0 = 600, P0s = 600;
  bool on[NRANKS] = {};
  // the wind: the active bellows' board (its volume flow u) on its air, the chest, the tremulant
  double ub = 0, tTrem = 0, trem = 0;
  bool hand = true;
  // output
  std::array<double, 63> fir{};
  std::array<double, 126> histL{}, histR{};
  int hpos = 0;
  std::array<double, 256> hiL{}, hiR{};
  // the views
  Voice *focus = nullptr;
  int blocks = 0;
  struct Trace { std::array<double, TRACE> q{}, U{}, pd{}, Pb{}; int w = 0, dec = 1, cnt = 0, n = 0; double dt = 0, qAmp = 0; } trace;
  double lastQ = 0, lastCross = 0, period = 0, tSim = 0;
  std::array<Voice *, 128> byKey{};
  std::array<Voice, POOL> pool;
};

// The pitch a reed sounds alone in the engine at the default wind (Hz), measured over [t0, t1] s
// of a held note at sample rate fs: the tuning tool's and the tests' measure.
double measureReed(const Reed &R, double fs, double P0, double t0, double t1, uint32_t seed = 12345);

} // namespace forte::regal
