// nmr-model.h — the physics: a liquid's protons in an NMR magnet, as quantum mechanics has them.
//
// Each sample is a few groups of equivalent protons (a CH₃, a CH₂, an OH), each with its chemical
// shift δ (ppm) and the J couplings between groups (Hz), from Gottlieb, Kotlyar and Nudelman's
// table (J. Org. Chem. 62, 7512, 1997). In a magnet whose protons precess at f₀ = γB₀/2π, and
// seen against the 0 ppm reference (TMS) as a spectrometer mixes them down, the spins' Hamiltonian
// in that rotating frame is
//
//   H = Σ_g 2π δ_g f₀ F_zg + 2π Σ_{g<h} J_gh F_g·F_h        (rad/s; F_g the group's total spin)
//
// Equivalent protons share their couplings, so each group's total spin is conserved: a group of
// n protons is a sum of spins S (n/2, n/2 − 1, …) with known multiplicities, and H is diagonalised
// for each choice of S's (the composite-particle method), block by block of total F_z. That is
// exact for any field, so a low key (a weak magnet) shows second-order spectra: lines lean
// towards each other ("roofing") and new lines appear once J is not small against the shifts.
//
// A hard pulse tips the high-temperature equilibrium (ρ ∝ F_z) by θ about x; the receiver hears
// Tr(ρ F₊) (both quadrature channels), which after the pulse is sin θ times a sum over the
// single-quantum coherences ρ_ab (M_b = M_a + 1) of ρ_ab ⟨b|F₊|a⟩ e^{i(E_b − E_a) t}. A π pulse about
// y is the rotation R = ⊗ d^S(π) (|S, m⟩ → (−1)^{S−m} |S, −m⟩), which maps coherence order +1 to −1
// exactly: ρ' = R ρ Rᵀ. So the engine follows only the order −1 coherences and one phase for the
// field's inhomogeneity and offset (ΔB F_z, which commutes with H), negated by each π pulse: that
// is Hahn's echo, with the J couplings, which a π pulse does not refocus, modulating it.
#pragma once

#include <array>
#include <complex>
#include <cstdint>
#include <vector>

namespace forte::nmr {

constexpr double GAMMA_MHZ_T = 42.577478518; // the proton's γ/2π, MHz per tesla (CODATA 2018)
constexpr double STRONGEST_T = 28.2;         // the strongest NMR magnet built (1.2 GHz, 2020)
constexpr double COIL_M = 0.018;             // the probe coil's length, over which a gradient spreads the field
constexpr int MAX_GROUPS = 4, MAX_COUPLINGS = 6;
constexpr int MAX_DIM = 32;                  // the largest block of states a sample needs
constexpr int MAX_ELEMS = 400;               // single-quantum coherences a key follows
constexpr int MAX_LINES = 128;               // distinct lines

struct Group { int n; double ppm; };
struct Coupling { int a, b; double J; };
struct Sample {
  int groups, couplings;
  std::array<Group, MAX_GROUPS> g;
  std::array<Coupling, MAX_COUPLINGS> c;
  double D; // the molecules' self-diffusion coefficient in the solvent, m²/s (rounded)
};
constexpr int SAMPLES = 5;
const Sample &sample(int index); // in the order of the parameter's options

// The lowest shift of a sample's groups: the line the key puts on its note.
double anchorPpm(const Sample &s);

// One composite spin system (one choice of each group's total spin, in one cluster of coupled
// groups), in its energy eigenbasis.
struct Combo {
  int dim = 0, first = 0, count = 0; // its elements: first .. first + count − 1 of the key's
  std::array<double, MAX_DIM> E{};   // energies, rad/s
  std::array<int8_t, MAX_DIM> M2{};  // 2 M of each eigenstate
  std::array<double, MAX_DIM * MAX_DIM> R{}; // the π pulse about y, in the eigenbasis: R[c·dim + a]
};
// A single-quantum coherence |a⟩⟨b| (M_b = M_a + 1) of a combo.
struct Elem { int16_t combo, a, b, line; double w, fm, start; }; // w = E_b − E_a; fm = ⟨a|F₋|b⟩; start = ρ_ab after a 90° pulse, normalised
struct Line { double w, intensity; }; // rad/s; its share of the signal after a 90° pulse (they add to 1)

// A key's spins: its field and every combo, coherence and line.
struct KeySystem {
  double f0 = 0, B0 = 0, anchor = 0, fAnchor = 0; // Larmor frequency (Hz), field (T), anchor shift (ppm) and its line (Hz)
  int combos = 0, elems = 0, lines = 0;
  bool ok = true; // false if the sample outgrew the arrays (never, for the samples here)
  std::vector<Combo> combo;
  std::array<Elem, MAX_ELEMS> elem{};
  std::array<Line, MAX_LINES> line{};
};

// The spins of a sample in a magnet whose protons precess at f0 Hz.
void buildSystem(const Sample &s, double f0, KeySystem &k);
// The key's: its magnet puts the sample's lowest line on the note in the keyboard's tuning.
double keyLarmor(int key, const double *P);
void keySystem(int key, const double *P, KeySystem &k);

// The order −1 coherences after a π pulse about y, from those before it (each combo's in place):
// ρ'_cd = Σ_(a,b) R_cb conj(ρ_ab) R_da.
void piPulse(const KeySystem &k, const std::complex<double> *before, std::complex<double> *after);

// The field's spread across the sample: what remains of the signal after the spins have gathered a
// phase S (rad, per the line's full width at half height) from it: its characteristic function.
enum Profile : int { kLorentz = 0, kGauss = 1, kGradient = 2 };
double dephasing(int profile, double S);

} // namespace forte::nmr
