// quantum-engine.h — the real-time Quantum Keyboard, on the engine contract (forte/engine.h).
//
// Each voice is one wavepacket, |ψ(t)⟩ = Σ cₙ e^(−iEₙt/ħ)|n⟩, summed exactly:
//   * one unit phasor aₙ = e^(−iθₙ·count) per state, its phase recomputed from the integer sample
//     count at the start of every block and rotated sample by sample inside it, so phases never
//     drift and a revival 10⁵ periods later is still sample-accurate;
//   * the detector signal is Σ w_mn·Re(a_m* aₙ) (or Im for the coil), pairs grouped by Δn = k:
//     pure dephasing multiplies group k by e^(−k²t/T_φ), population decay everything by e^(−t/T₁);
//   * the pump pulse builds the packet over τ = 1/(√2 σ ω): the coherences grow as g(t)²,
//     g = ½(1 + erf(t/√2τ));
//   * all voices together sum at most BUDGET pairs; past it the weakest pairs of all are dropped;
//   * with Coherent restrike on (Ramsey fringes), a restruck key's pulse adds its amplitudes to the
//     packet still ringing there: the voice that takes over holds, per state, the amplitude Rₙ the
//     first pulse left (seen from the second's centre), so aₙ = (Rₙ + g(t))·e^(−iθₙ·count).
//
// Each key's packet (makePacket, about a millisecond: the page's noteData) is built off the audio
// thread by forte/background.h for the knobs it depends on; a note whose packet is not built yet
// waits for it (a few ms). Without threads (WebAssembly) it is built in place, unless the page
// offers it with the note (offer()). Voices come from a fixed pool: nothing is allocated in
// process().
#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <memory>

#include "forte/background.h"
#include "forte/engine.h"
#include "quantum-model.h"
#include "quantum-params.h"

namespace forte::quantum {

class QuantumEngine : public Engine {
 public:
  static constexpr int MAX_VOICES = 24; // sounding at once; older ones are stolen (quenched in 5 ms)
  static constexpr int POOL = 64;       // voices, sounding or being stolen
  static constexpr int BUDGET = 3000;   // pairs summed per sample, over all voices
  static constexpr int MAX_W = MAX_STATES * (MAX_STATES - 1) / 2; // a voice's grouped weights
  static constexpr int BUF = (MAX_VOICES + 2) * MAX_PAIRS;        // the buffer of pair amplitudes
  explicit QuantumEngine(double fs);

  void setParams(const double *P) override;
  void noteOn(int key, double velocity) override;
  void noteOff(int key, double velocity) override;
  void setSustain(bool on) override;
  void allNotesOff() override;
  int voiceCount() const override { return nVoices; }
  void process(float *L, float *R, int n) override;
  // the same in double precision (the WebAssembly's hook for the tests, which render into
  // Float64Arrays)
  void process(double *L, double *R, int n);
  // A packet the page built (packPacket), for the next note on its key. Only without threads
  // (WebAssembly): with them, the worker builds them.
  bool offer(const double *packed, int n);
  // the key's packet for the knobs as they are is built (the tests wait for it)
  bool ready(int key) { return (bool)data.get(key, version); }

  using Data = KeyData<Packet>;
  struct Voice {
    int key = 0;
    const Packet *pk = nullptr;
    Data::Ref ref;
    std::unique_ptr<Packet> own; // an offered packet
    bool inUse = false;
    int S = 0, G = 0, s0 = 0, s1 = 0, active = 0;
    std::array<double, MAX_STATES> th{}, cr{}, ci{}, re{}, im{};
    std::array<double, MAX_W> w{};
    std::array<int, MAX_STATES> gk{}, ga{}, gb{}, gw{};
    std::array<double, MAX_STATES> gD{}, gR{};
    bool useIm = false;
    double dc = 0, rampK = 0, env = 0, gl = 0, gr = 0, r1 = 1;
    int64_t count = 0, rampEnd = 0, dcEnd = 0;
    bool released = false, quench = false, stolen = false, dead = false;
    int first = 0;       // the packet's first state this voice uses (state s is the packet's first + s)
    double gdt = 0, lam = 0; // Γ_φ/fs now, and ∫Γ_φ dt since the pulse's centre
    // A coherent restrike (cohere): Rₙ = Rr + i·Ri, and |Rₙ + 1|, the state's amplitude once the
    // pump is done (folded into the phasors from then on); xr, xi the amplitudes while it builds;
    // dcB and dcC, the electrode's offset terms in g and 1;
    // gain, the strongest pair's |w·βᵢβⱼ| over the strongest |w| (1 for a fresh packet)
    bool coh = false, folded = false;
    std::array<double, MAX_STATES> Rr{}, Ri{}, mag{}, xr{}, xi{};
    double dcB = 0, dcC = 0, gain = 1;

    bool start(const QuantumEngine &eng, int key, double vel, const Packet &p);
    bool cohere(const QuantumEngine &eng, Voice &old);
    double amp(int s) const { return coh ? mag[s] : 1; } // |βₛ| once the pump is done
    double offset(int64_t c) const;
    int strengths(double *buf, int m) const;
    void trim(double tau);
    void rates(const QuantumEngine &eng);
    void sync();
    template <class T> void render(T *L, T *R, int n);
    template <class T> void renderCoherent(T *L, T *R, int n);
  };

  // read by the tests (through the WebAssembly's hooks), in the order they started
  std::array<Voice *, POOL> voices{};
  int nVoices = 0;

 private:
  void startNote(int key, double velocity, Data::Ref r, std::unique_ptr<Packet> own);
  void retryPending();
  void budget();
  void drop(Voice *v);
  template <class T> void render(T *L, T *R, int n);
  PacketParams packetParams() const;
  std::unique_ptr<Packet> build(int key, uint64_t version);

  std::array<double, p::count> P{};
  bool hasParams = false, sustain = false;
  const double fMax;
  std::array<Voice, POOL> pool{};
  std::array<double, BUF> buf{};
  std::unique_ptr<Packet> offered;
  // notes whose packet is still being built (only with threads)
  struct Pending { int key; double velocity; bool off; };
  std::array<Pending, 128> pending{};
  int nPending = 0;
  // the packets' version (one per setting of the knobs they depend on, the tuning among them), and those knobs for each
  // version, for the worker (a ring: it builds the latest)
  uint64_t version = 0;
  PacketParams pp{};
  std::array<std::array<std::atomic<double>, 20>, 8> snapshots{}; // the 8 knobs, then the tuning's 12 ratios
  Data data; // last: its worker uses the members above, and stops before they go
};

// A packet as doubles, for offer() and the page: key, d, dc, sigma, pitch, scale, the number of
// states and of pairs, E, c, then i, j, k, f and w per pair.
int packPacket(const Packet &pk, double *out, int max);
bool unpackPacket(const double *a, int n, Packet &pk);

} // namespace forte::quantum
