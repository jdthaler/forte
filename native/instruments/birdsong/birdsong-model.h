// birdsong-model.h — the physics of a songbird's syrinx and vocal tract, after Gabriel Mindlin's
// group (Gardner et al. 2001, Sitt et al. 2008 and 2010, Amador et al. 2013).
//
//   the labia: the normal form of their flow-driven oscillation, in time τ = γt (γ: the labia's
//   natural rate, which the key sets)
//     dx/dτ = v,   dv/dτ = α + βx + x² − x³ − xv − x²v
//   α stands for the air sac pressure (sound for α below the onset), β for minus the labial
//   tension. Two ways to start: through a Hopf bifurcation (tension above 1/4: a pure tone grows
//   from nothing) or a saddle-node (below 1/4: on the limit cycle near zero tension and under, a
//   note born at zero frequency, pulse-like and rich in harmonics)
//   the sound: the airflow through the labia, modulated by their opening x, into the trachea
//     Pᵢ(t) = A x(t) − r Pᵢ(t − T),  T = 2L/c;   transmitted (1 − r) Pᵢ(t − T/2)
//   and through the oropharyngeal–oesophageal cavity (OEC), a Helmholtz resonator radiating from
//   the beak (a band-pass resonance, tuned to the note or fixed)
#pragma once

#include <array>

namespace forte::birdsong {

constexpr double ALPHA_REST = 0.1; // α with no breath: below every onset, so the labia rest
constexpr double C_AIR = 343;      // m/s, at 20 °C (a bird's warm trachea is a little faster)
constexpr double H_MAX = 0.1;      // the longest step in τ (RK4: ~60 steps a cycle; errors ~1e-6)
constexpr int HARMONICS = 96;      // the limit cycle's Fourier series (of 256 points a period), for the voicing and the views

// dv/dτ
inline double accel(double a, double b, double x, double v) { return a + b * x + x * x - x * x * x - x * v - x * x * v; }

struct State { double x = 0, v = 0; };
// One classical Runge–Kutta step of length h (in τ) at α = a, β = b.
void rk4(State &s, double a, double b, double h);

// The α below which a breath from rest starts the labia, for β: 0 (the Hopf line) for β ≤ −1/4,
// else where the right-hand node meets the saddle, (x² − 2x³) at x = (2 + √(4 + 12β))/6.
double onset(double beta);
// The labia at rest at α (the right-hand fixed point, a stable node or focus), for β.
double restX(double alpha, double beta);
// The fixed points of the normal form at (α, β), ascending, in out[0..n−1]: the roots of
// α + βx + x² − x³. Returns n (1 or 3).
int fixedPoints(double alpha, double beta, double *out);

// The limit cycle the labia settle on at (α, β), reached from rest: its angular frequency in τ
// (the note is γΩ/2π), the extent of x and v, and the amplitudes |cₖ| of x's harmonics.
struct Cycle {
  bool ok = false;
  double omega = 0, xmin = 0, xmax = 0, vmin = 0, vmax = 0;
  std::array<double, HARMONICS> c{};
};
Cycle limitCycle(double alpha, double beta);
// n points (x, v) around one period of that cycle, from x's minimum; returns how many it wrote.
int cyclePoints(double alpha, double beta, double *xv, int n);

// The vocal tract's response at f (Hz), as a magnitude: the trachea (length L in m, reflection r)
// then the OEC's resonance at fo (Hz), quality Q, unit gain at its peak.
double tracheaGain(double f, double L, double r);
double oecGain(double f, double fo, double Q);

} // namespace forte::birdsong
