// quantum-model.h — the physics of the Quantum Keyboard (quantum/src/quantum-model.js in C++),
// operation for operation, free of audio: energy spectra and exact dipole matrix elements of five
// potential wells, the wavepacket each key launches, its revival times, and the observable the
// engine sums. The engine, the plugins' worker thread and the page (through the WebAssembly) share
// it.
//
// The state is exact, a finite sum over eigenstates:
//   |ψ(t)⟩ = Σₙ cₙ e^(−iEₙt/ħ) |n⟩,   cₙ ∝ exp(−(n − n̄)²/4σ²)
// and what you hear is a detector reading of the dipole,
//   ⟨x⟩(t) − x̄ = Σ_{m<n} 2 c_m cₙ x_mn cos(ω_mn t),   ω_mn = (Eₙ − E_m)/ħ,
// or its first or second time derivative (current, radiated field).
//
// Natural units, ħ = 1, per well:
//   box       Eₙ = n²                   morse     E_v = (v+½) − (v+½)²/κ
//   hydrogen  Eₙ = −1/2n² (l = 1)       bouncer   Eₙ = |aₙ| (zeros of Ai)
//   harmonic  Eₙ = n + ½
//
// sin, cos, exp, log and pow are V8's (forte/fdlibm.h), so a packet is the JavaScript's to the
// last bit.
#pragma once

#include <cmath>
#include <vector>

namespace forte::quantum {

constexpr double DC_FADE = 0.06; // s: the electrode's AC coupling, a raised-cosine fade of the Franck–Condon reference
constexpr int HYDROGEN_L = 1;    // one-photon excitation from s states makes p-wave packets
constexpr int MAX_PAIRS = 300;   // per packet (makePacket's default limit)
constexpr int MAX_STATES = 64;   // a packet spans at most 12σ + 1 = 49 states (σ ≤ 4)

enum Well : int { box, morse, hydrogen, bouncer, harmonic }; // the potential's choice index
enum Detector : int { electrode, coil, antenna };            // x, v, a: the detector's choice index

double jsRound(double x); // Math.round
double keyFreq(double m); // shared/dsp.js keyFreq, with V8's pow

// |aₙ|, zeros of Ai: Abramowitz & Stegun's table for n ≤ 10, the asymptotic series above.
double airyZeroC(double nu);
double airyZero(int n);
// Bessel J'_k(x), k ≥ 1, by the midpoint rule on its integral.
double besselJp(int k, double x);
double morseKappa(double nbar, double eta);
double morseX(int m, int n, double kap);
double kepler(double nc, int l = HYDROGEN_L);

// The knobs a packet depends on (the descriptor's P: potential, eta, lock, bpm, beats, nbar,
// sigma, detector).
struct PacketParams {
  int potential = box;
  double eta = 0.5;
  bool lock = true;
  double bpm = 90, beats = 2, nbar = 40, sigma = 2;
  int detector = antenna;
  bool operator==(const PacketParams &) const = default;
};

// One well at a given packet centre: discrete energies, a smooth E(ν), the range of n, and x_mn.
struct WellModel {
  int id = box;
  double kap = NAN;                // Morse only
  double nMin = 0, nMax = INFINITY;
  double e = 0;                    // hydrogen: the Langer eccentricity at n̄
  mutable std::vector<double> jps; // hydrogen: J'_k(ke), filled as asked
  double E(int n) const;
  double Ec(double nu) const;
  double x(int m, int n) const;
};
WellModel well(int id, const PacketParams &P, double nbar);
struct Derivs { double d1, d2, d3; };
Derivs derivs(const WellModel &W, double nu);

struct States { std::vector<int> ns; std::vector<double> c, E; };
States packetStates(const WellModel &W, bool outer, double nbar, double sigma);

// n̄ for a key: the knob, or (tempo lock) the n̄ whose revival time is `beats` beats at `bpm`.
double solveNbar(int key, const PacketParams &P, bool *locked = nullptr);

struct Pair { int i, j, k; double f, w; };
// Everything the engine and the views need for one key (makePacket). Frequencies in Hz, times in s.
struct Packet {
  int key = 0, id = box, d = antenna;
  double f0 = 0, pitch = 0, nbar = 0, sigma = 0, scale = 0;
  std::vector<int> ns;
  std::vector<double> c, E;
  std::vector<Pair> pairs; // sorted by k, then i
  bool offBeat = false;
  double Tcl = 0, Trev = 0, Tsr = 0, tColl = 0, kap = NAN, dc = 0;
};
Packet makePacket(int key, const PacketParams &P, double fMax = 20000, int maxPairs = MAX_PAIRS, double rel = 1e-3);
inline double fMaxAt(double fs) { return std::fmin(20000, 0.45 * fs); } // the descriptor's fMax(fs)

// |⟨ψ(0)|ψ(t)⟩|², or with pure dephasing Tr ρ(0)ρ(t). t in seconds.
double autocorr(const Packet &pk, double t, double Tphi = INFINITY);
// The detector signal straight from the model (tests and views).
double signalAt(const Packet &pk, double t, double T1 = INFINITY, double Tphi = INFINITY, double dcFade = DC_FADE);

// The views' eigenfunctions (quantum/src/quantum-waves.js, waveGrid): every state's φₙ at `rows`
// display points, phi[i * rows + r] for ns[i]; ys the points. A packet's id, ns, E, kap and nbar,
// and the knob eta (for a Morse packet without its κ).
struct WaveGrid { std::vector<double> ys, phi; };
WaveGrid waveGrid(int id, const std::vector<int> &ns, const std::vector<double> &E, double kap, double nbar, double eta, int rows);

} // namespace forte::quantum
