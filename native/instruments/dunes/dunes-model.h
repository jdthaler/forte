// dunes-model.h — the physics of a singing dune: an avalanche of dry sand down a slip face. How
// dunes sing is still argued over, so the model has both of the leading accounts.
//
//   the grains (Douady et al. 2006, Andreotti 2004; Bagnold 1966): the sheared grains in the
//   flowing layer pass over one another at the shear rate, f = 0.4 √(g/d), and each pass is a push
//   on the layer below. The flowing layer's own vibration nudges every patch of grains toward its
//   phase, so the patches are oscillators with a spread of natural frequencies (the spread of grain
//   sizes) coupled through a mean field: Kuramoto's model. Below a critical coupling they push at
//   random (a rumble); above it they fall into step and the dune sings. The coupling grows with the
//   avalanche's speed, so there is a speed below which a dune only hisses (Douady: 0.23 m/s).
//   each key is a sand whose grains' shear rate is the note: d = g (0.4 / f)².
//
//   the layer (Vriend et al. 2007, Hunt and Vriend 2010): the avalanche's grains rattle at random,
//   and a dry, loose surface layer of depth H, slower to carry sound (c₁) than the firmer sand
//   under it (c₂), is a waveguide whose modes are f_n = n c₁ / (2 H √(1 − c₁²/c₂²)). Each key is a
//   layer whose first mode is the note.
#pragma once

#include <cstdint>
#include <vector>

namespace forte::dunes {

constexpr double G = 9.81;              // m/s²
constexpr double SHEAR = 0.4;           // Douady et al. 2006: f = 0.4 √(g/d)
constexpr double U_ONSET = 0.23;        // m/s: their field threshold (Tarfaya), for the default sand
constexpr double SORTING_REF = 0.3;     // φ: the default sand's sorting, which starts at U_ONSET
constexpr double NOISE = 0.01;          // the patches' phase diffusion D, over ω₀ (collisions are not clocks)
constexpr double SURGE = 0.08, SURGE_T = 0.3; // the avalanche's surges: its speed wanders by 8 %, over 0.3 s
constexpr double CAVITY_Q = 2;          // the flowing layer as a resonance (broad: it barely pulls the pitch)
constexpr double WATER_E = 0.15;        // % water by weight that cuts the coupling by e (our scale)
constexpr double C1 = 180, C2 = 300;    // m/s: Dumont Dunes' dry layer and the sand below (Vriend 2007, Aug. 2006)
constexpr int MAX_GRAINS = 24;          // patches of grains a voice follows at High
constexpr int LAYER_MODES = 8;          // the waveguide's modes at High
constexpr int TABLE = 1024;             // samples of a cycle in the tables
constexpr int MIPS = 6;                 // pulse tables of 32, 16, 8, 4, 2, 1 harmonics
constexpr int H_MAX = 32;

// The grain diameter (m) whose shear rate is f (Hz), and back.
double grainDiameter(double f);
double shearFreq(double d);
// Wentworth's size class of a grain of diameter d (m): 0 silt, 1 very fine sand … 5 very coarse
// sand, 6 granules; WENTWORTH[i] is class i's upper edge (m).
constexpr double WENTWORTH[7] = {62.5e-6, 125e-6, 250e-6, 500e-6, 1e-3, 2e-3, 4e-3};
int wentworth(double d);
// The waveguide: the dry layer's depth (m) whose first mode is f, and mode n of a layer H deep.
double layerDepth(double f);
double layerMode(int n, double H);

// The grains' own frequencies spread as their sizes: f ∝ d^(−1/2), and Folk–Ward sorting σφ is the
// spread of log₂ d, so σ_f / f = σφ ln 2 / 2.
double freqSpread(double sortingPhi);
// Kuramoto's critical coupling, over ω₀, for natural frequencies spread as a Gaussian of relative
// width s, each line widened by phase noise D (over ω₀): K_c = 2 / ∫ g(ν) D / (D² + ν²) dν
// (Strogatz and Mirollo 1991), which is √(8/π)·s (Kuramoto) as D → 0 and 2D as s → 0.
double criticalCoupling(double s, double D);
// The coupling over ω₀ that an avalanche at speed U (m/s) with this much water brings: pinned so
// that the default sand starts to sing at U_ONSET.
double coupling(double U, double water);
// The speed (m/s) at which a sand of this sorting and water starts to sing.
double onsetSpeed(double sortingPhi, double water);

// A collision push, as a pulse train in phase: harmonic n of exp(−θ²/2w²), w from the contact's
// share c of the cycle (its full width at half height), the whole train (H_MAX harmonics) of RMS 1.
double pulseHarmonic(int n, double contact);

double invNormal(double p); // the standard normal quantile

// Patches of grains: phase oscillators (in turns), natural frequencies at the Gaussian quantiles of
// their spread (so their mean is the note), driven by the flowing layer's vibration, a resonator
// at the note fed by their own mean field e^{iθ}. One sample: θ_j += ω_j + κ Im(Z̃ e^{−iθ_j}) + noise.
struct Population {
  int n = 0;
  std::vector<double> phase, w;     // turns, turns a sample
  std::vector<double> cs, sn;       // this sample's cos and sin of each phase
  double zr = 0, zi = 0;            // the layer's field Z̃ (its vibration, as an order parameter)
  double rr = 0, ri = 0;            // its rotation and decay a sample: r e^{iω₀/fs}
  double mr = 0, mi = 0;            // the patches' mean field e^{iθ} last sample
  uint32_t seed = 1;
  void size(int count) { phase.resize(count); w.resize(count); cs.resize(count); sn.resize(count); } // before playing: init never allocates up to this
  void init(int count, double f0, double spread, double fs, uint32_t seed);
  // One sample at coupling kdt (turns per unit field) and noise ndt (turns, for a unit-variance kick);
  // with a pulse table, the patches' pushes are summed into a (even patches) and b (odd ones).
  void step(double kdt, double ndt, const float *pulse, double &a, double &b);
  double R() const;   // |mean field|
  double psi() const; // its phase (turns)
};
// The cos and sin of a turn, TABLE + 1 samples each.
const float *cosTable();
const float *sinTable();

// For the tests: the time-averaged |mean field| of n patches at coupling K (over ω₀), spread s and
// noise D (over ω₀), after settling, over `seconds` of a note at f0 Hz.
double simulateR(int n, double s, double K, double D, double f0, double seconds, double fs, uint32_t seed);

} // namespace forte::dunes
