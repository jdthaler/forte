// ionchain-model.h — the physics: a Coulomb crystal of N identical ions in a linear Paul trap,
// kicked by a laser and heard through the image current it drives in the trap's electrodes.
//
// In units of the trap's axial frequency ω_z and its length ℓ = (q² / 4πε₀ m ω_z²)^⅓ (James
// 1998), the ions' potential energy in the plane of the trap's weak radial axis x and its axis z is
//
//   U = Σ_j ½ (α² x_j² + z_j²) + Σ_{i<j} 1 / |r_i − r_j|,   α = ω_x / ω_z,
//
// the trap's harmonic pull (the radial one the RF pseudopotential's) against the ions' Coulomb
// push. Its minimum is a line of ions along the axis while the radial pull is strong enough, and
// a zigzag once α falls below α_c(N) (the linear chain's highest axial mode going soft
// radially: α_c² = (μ_N − 1) / 2). The Hessian of U there gives the normal modes: frequencies
// ω_z √λ_m and shapes B (unit mass for every ion, so B is orthonormal). The axial modes of the
// line are 1, √3, √(29/5) (three ions) … of ω_z, whatever N: the centre of mass and the
// breathing mode exactly, the rest nearly. The third direction, y, is taken stiffer than x, so
// the crystal stays in the x–z plane and its y modes, which neither the kick nor the pickup
// reaches there, are left out.
//
// Everything is heard SLOW times slower than the trap runs: A4 is a trap at 440 kHz.
#pragma once

namespace forte::ionchain {

constexpr int MAXN = 20, MAXM = 2 * MAXN;
constexpr double SLOW = 1000;          // the trap's time over the heard time
constexpr double ION_U = 40;           // ⁴⁰Ca⁺, for the lengths the page shows (ℓ)

// ℓ in metres for a trap whose axial frequency is fz (Hz, the trap's own).
double lengthScale(double fz);
// The force spectrum of a half-sine laser pulse of length tau at frequency f, over its DC value.
double pulseSpectrum(double f, double tau);

struct Crystal {
  int N = 0, M = 0;
  double alpha = 0;
  bool zigzag = false;
  double x[MAXN] = {}, z[MAXN] = {}; // the equilibrium, in ℓ (ions ordered along z)
  double lam[MAXM] = {};             // (ω_m / ω_z)², ascending
  double B[MAXM][MAXM] = {};         // B[d][m]: coordinate d of mode m (d = 2j: x_j, 2j + 1: z_j)
  double reach = 1;                  // the farthest ion from the centre (at least ℓ)
  double spacing = 1;                // the ions' mean spacing along the axis (ℓ for one ion)
};

// The linear chain's axial equilibrium for N ions (z ascending, ℓ), by Newton's method.
void linearChain(int N, double *z);
// The crystal for N ions at α: the line, or the planar zigzag past the transition. A previous
// crystal of the same N (warm) starts the search where it was, so the zigzag keeps its side.
void solveCrystal(Crystal &c, int N, double alpha, const Crystal *warm = nullptr);
// α_c(N): below it the line buckles into a zigzag (0 for one ion).
double zigzagAlpha(int N);

// How the laser, the electrodes and the cooling reach each mode of a crystal, for the parameters
// P (ionchain-params.h):
//   kick[m]       the mode's velocity from a laser pulse of unit momentum (before its spectrum)
//   wl[m], wr[m]  its velocity's image current in the two electrodes (each normalised to an
//                 electrode's RMS field over the ions; the second's amplifier inverted, so the
//                 two agree on the centre of mass)
//   sR[m]         its amplitude's decay rate (1/s, heard) through the electrodes' resistor
//   sD[m]         and from the cooling laser, once a key lets go
struct Couplings {
  double kick[MAXM] = {}, wl[MAXM] = {}, wr[MAXM] = {}, sR[MAXM] = {}, sD[MAXM] = {};
};
void couple(const Crystal &c, const double *P, Couplings &out);

} // namespace forte::ionchain
