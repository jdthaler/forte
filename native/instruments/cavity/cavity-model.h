// cavity-model.h — the physics: a superconducting multi-cell RF cavity rung by a passing bunch.
// Each key is a cavity of N coupled pillbox cells whose accelerating mode (TM010, π) is the note.
// Each of the cell's modes (TM010, TM011, TM110, …: Bessel zeros and the cell's length) becomes a
// passband of N modes through the irises' coupling; the bunch rings each mode by the voltage it
// sees crossing the cells (the transit-time integral), the couplers and the niobium's surface
// resistance damp them, and the field's radiation pressure detunes them (Lorentz force).
#pragma once

#include <array>
#include <complex>

namespace forte::cavity {

constexpr int MAX_CELLS = 12;
constexpr int BANDS = 7;
constexpr int MAX_MODES = BANDS * MAX_CELLS;
constexpr double F_REF = 1.3e9;      // Hz: every key's cavity stands for TESLA's, its accelerating mode at 1.3 GHz
constexpr double QSCALE = 6e-7;      // a physical Q in the scaled cavity: Q_ext 10⁹ rings C4 for 5 s
constexpr double G_FACTOR = 270;     // Ω: the geometry factor, Q0 = G/Rs (TESLA's cell)
constexpr double R_RES = 10e-9;      // Ω: residual surface resistance
constexpr double TC = 9.25;          // K: niobium's critical temperature
constexpr double BCS_A = 3.24e-4;    // Ω·K at 1.5 GHz: R_BCS = A (f/1.5 GHz)² / T · exp(−Δ/kT), through
constexpr double BCS_GAP = 18.0;     // K: Δ/k     TESLA's 15 nΩ at 2 K and 800 nΩ at 4.2 K (Aune et al. 2000)
constexpr double R_NORMAL = 1.5e-3;  // Ω at 1.3 GHz: normal niobium near Tc (RRR 300), ∝ √f
constexpr double TRAIN = 0.05;       // a train's bunch carries this share of the key's charge at full current
constexpr double Q_MECH = 3;         // the walls' mechanical mode's Q

// The pillbox cell's modes that make the passbands: azimuthal order m (0 a monopole, 1 a dipole),
// j the radial zero of J_m, p the longitudinal half-waves.
struct Band { const char *name; int m; double j; int p; };
extern const std::array<Band, BANDS> BAND;

double besselJ(int n, double x);
// x_n of the passband's mode `mode` (1..N) in cell n (1..N), unit norm. The accelerating
// passband's end cells are tuned so its π mode is flat (TESLA's end cells); the others are not.
double modeShape(bool tunedEnds, int N, int mode, int n);
// The phase advance per cell of a passband's mode.
double phaseAdvance(bool tunedEnds, int N, int mode);
// ∫₀¹ cos(pπu) e^{iθu} du: the voltage a charge sees crossing a cell (per unit field and length),
// θ its transit phase.
std::complex<double> transit(int p, double theta);
// The niobium's surface resistance (Ω) and the cavity's wall Q, Q0 = G/Rs, at f (Hz) and T (K).
double surfaceResistance(double f, double T);
inline double wallQ(double f, double T) { return G_FACTOR / surfaceResistance(f, T); }
// The physical frequency of a mode at f (Hz) in the cavity whose π mode is at fpi.
inline double physicalFrequency(double f, double fpi) { return (F_REF * f) / fpi; }

struct Mode {
  int band, mode;     // passband and its mode number (1..N)
  double f;           // Hz, untuned (no bend, no detuning)
  double phase;       // phase advance per cell
  std::complex<double> kick; // the amplitude a unit-charge bunch leaves (√energy, the π mode's field units)
  double x1, xN;      // the mode in the end cells (the probes)
  double invQ0;       // 1/Q0 of the walls, superconducting at the bath temperature
  double invQn;       // 1/Q0 normal-conducting (quenched)
  double wIn, wHom;   // the input and HOM couplers' share of the mode: 1/Qext = w/Q (the π mode's wIn is 1)
};
struct Cavity {
  int cells = 0, count = 0;
  double fpi = 0;     // the accelerating (π) mode, the note
  std::array<Mode, MAX_MODES> modes;
  std::array<double, MAX_CELLS * MAX_CELLS> x; // the accelerating passband's modes in each cell, x[mode·N + n]
};
// One key's cavity under the parameters P (indexed as in cavity-params.h): its π mode at the key's
// equal-tempered pitch times the keyboard's tuning (tuningOf(P).ratio(key)).
Cavity cavityOf(int key, const double *P);
// The single cell's band frequency over its TM010's, for the cell design speed βg and coupling k.
double bandRatio(int band, double betag, double k);
// A mode's amplitude decay rate (1/s) in the scaled cavity, the couplers at Q_in and Q_hom, and
// the input coupler's antenna pushed in to Q_rel once a key is let go (0: it is not).
double decayRate(const Mode &m, double Qin, double Qhom, double Qrel, bool quenched);

} // namespace forte::cavity
