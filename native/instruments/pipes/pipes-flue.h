// pipes-flue.h — one sounding flue pipe in real time: the jet, the labium and the pipe's modes
// (pipes-model.h's physics, stepped sample by sample), and the half-band filter that brings the
// oversampled pipes down. The Pipe Organ's engine plays six of them a key; the Hydraulis plays its
// ancient ranks on the same jets.
//
//   foot p ─▶ jet U_j = √(2p/ρ) ─▶ Q_in = bHU_j(1 + tanh((η − y₀)/b)) ─▶ Δp = (ρδ_d/S_m) dQ_in/dt − ½ρ(v/α)²sgn v
//                                         ▲                                        │
//      η = (hA/U_j)·v(t − τ) + turbulence ┘◀── low-pass ◀── delay τ = W/c_pU_j ◀── mouth flow v ◀── modes
//
// Per step, the pipe reads the flow through its mouth a jet transit earlier from a delay line
// (Catmull–Rom), passes it through the jet's low-pass, splits the jet on the labium (tanh), and
// drives its modes with the time derivative of the flow it puts into the pipe plus the
// vortex-shedding loss. Nothing here allocates: the delay line's memory is the caller's.
#pragma once

#include <array>
#include <cstdint>

#include "pipes-model.h"

namespace forte::pipes {

constexpr double U_BUF = 2;     // m/s: delay lines hold a slower jet's transit than this only up to their length
constexpr int FLUE_NOISE_N = 16384; // the length of the seeded table of jet turbulence a pipe reads

// What a pipe takes from the engine that plays it.
struct FlueSetup {
  double fs = 48000;            // the engine's output rate
  int os = 1;                   // the pipe's oversampling (it steps at fs·os)
  int maxModes = MODES_OPEN;    // Quality: at most this many of its modes (but never fewer than 3)
  double maxF = INFINITY;       // and none above this (Hz)
  const double *noise = nullptr; // the turbulence table (FLUE_NOISE_N values in −½…½)
  double draw = 0;              // a random draw in −½…½: where in the table it starts
  bool track = false;           // follow its pitch (the tests')
};

struct FluePipe {
  const PipeModel *R = nullptr;
  int rank = 0, os = 1, n = 0;
  bool stopped = false;
  double fsI = 0, h = 0, fsS = 0, rt = 1; // fsS: steps per second of its own time (fsI/rt); rt: pitch bend's ratio
  std::array<double, 6 * MODES_OPEN> c{};
  std::array<double, MODES_OPEN> x{}, v{}, om{};
  double cv = 0, W = 0, b = 0, H = 0, y0 = 0, ib = 0, bH = 0, hA = 0, Ks = 0, Kl = 0, iSm = 0, tauK = 0, kxc = 0, flue = 0;
  double *buf = nullptr;
  int N = 0, mask = 0, maxD = 0, w = 0, ni = 0;
  const double *noise = nullptr;
  // state
  double lp = 0, qin = 0, vm = 0, Q = 0, dp = 0, eta = 0, out = 0, foot = 0, Uj = 0;
  bool asleep = true;
  // the live pitch: upward zero crossings of the mouth flow's running integral through its mean
  bool track = false;
  double dsp = 0, mean = 0, prev = 0, t = 0, last = -1, per = 0, kMean = 0;
  int nx = 0;

  static int lineLength(double tauK); // the delay line's length for a jet transit of tauK/U_j
  void init(const FlueSetup &s, const PipeModel *R, int rank, double *buf, double r); // r: the bend it starts at
  void retime(double r);
  double freq() const { return per > 0 ? fsI / per : 0; }
  void reset();
  double energy() const;
  // One step at this pipe's own rate with jet speed Uj (m/s), 1/Uj, and noise scaled by nz. Leaves
  // the radiated d/dt(mouth flow) in out.
  void step(double Uj, double iU, double nz);
};

// Half-band low-pass for a 2× decimation (Kaiser-windowed sinc, cut-off at the output Nyquist).
template <size_t N> void halfband(std::array<double, N> &h, double beta = 8) {
  constexpr double PI = std::numbers::pi;
  const double M = (N - 1) / 2.0;
  const auto I0 = [](double x) { double s = 1, t = 1; for (int k = 1; k < 40; k++) { t *= std::pow(x / (2 * k), 2); s += t; } return s; };
  double sum = 0;
  for (size_t i = 0; i < N; i++) {
    const double n = i - M, sinc = n == 0 ? 0.5 : std::sin((PI * n) / 2) / (PI * n);
    h[i] = sinc * (I0(beta * std::sqrt(1 - std::pow(n / M, 2))) / I0(beta)); sum += h[i];
  }
  for (size_t i = 0; i < N; i++) h[i] /= sum;
}

} // namespace forte::pipes
