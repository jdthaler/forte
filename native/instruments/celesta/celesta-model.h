// celesta-model.h — the physics of a celesta: plain rectangular steel bars (Timoshenko beams,
// solved exactly), each resting on two blocks at its fundamental's nodes on top of a wooden
// resonator box, a felt hammer that strikes it from above, and a felt damper.
//
//                 ▼ felt hammer
//   ┌───────────────────────────────────┐  steel bar (2–2.5 mm thick, 20–30 mm wide)
//   ■ block at a node      gap g      block ■
//   ┌─┴───────────────────────────────┴─┐  the box's mouth spans the blocks
//   │  wooden box, closed at the bottom │  a stopped pipe tuned to the bar's fundamental
//   └───────────────────────────────────┘
//
// Everything here is plain arithmetic on fixed-size arrays (no allocation): a key's bar takes some
// tens of microseconds, so the engine builds it where it is first played.
#pragma once

#include <array>
#include <cmath>

#include "forte/dsp.h"

namespace forte::celesta {

constexpr int KEY_LO = 60, KEY_HI = 108;   // C4–C8, the four-octave Mustel compass: the bars are graded across it
constexpr int KEY_MIN = 21, KEY_MAX = 108; // A0–C8, with the full range open: the C4 bar's blank, cut longer

// Steel (a plain carbon tool steel).
struct Material { double E, rho, nu; };
inline constexpr Material STEEL = {205e9, 7850, 0.29};
inline constexpr double G_STEEL = STEEL.E / (2 * (1 + STEEL.nu));
inline constexpr double KAPPA = (10 * (1 + STEEL.nu)) / (12 + 11 * STEEL.nu); // Cowper's shear coefficient, rectangle
// Thermoelastic damping (Zener): expansion, heat capacity, conductivity, temperature.
struct Thermo { double alpha, cp, k, T; };
inline constexpr Thermo THERMO = {11.5e-6, 470, 46, 293.15};
inline constexpr double ZENER_DELTA = (STEEL.E * THERMO.alpha * THERMO.alpha * THERMO.T) / (STEEL.rho * THERMO.cp);
double zener(double h, double f);

// Air at 20 °C.
inline constexpr double C_AIR = 343.2, RHO_AIR = 1.204;

// Free–free Euler–Bernoulli beam: cos βL cosh βL = 1 (the ratios 1 : 2.756 : 5.404 : 8.933 : 13.34).
inline constexpr double BETA_L[5] = {4.730040745, 7.853204624, 10.99560784, 14.13716549, 17.27875966};
constexpr int N_BEND = 5, N_TORS = 2, N_MODES = N_BEND + N_TORS;
constexpr int NX = 65; // points along the bar for the mode shapes

// What a bar is cut from: width b and thickness h (m), graded across the compass: b from 30 mm
// (C4) to 20 mm (C8); h from `thick` (mm, at C4) to 0.8 × `thick` (C8). Keys below C4 use C4's blank.
struct Blank { double b, h; };
Blank barBlank(int k, double thick);

// A uniform free–free Timoshenko beam (length L, width b, thickness h): det(ω) = 0 gives its
// bending frequencies. timoshenkoDet is that determinant (scaled, finite for every ω > 0; zero at
// each bending frequency), exposed for the tests.
double timoshenkoDet(double omega, double L, double b, double h);
// Its first n (≤ N_BEND) bending frequencies (Hz), found by scanning the determinant.
int timoshenkoFreqs(double L, double b, double h, int n, double *f);
// Euler–Bernoulli's: (βₙL)² √(EI/ρA) / (2π L²).
double eulerFreq(double L, double b, double h, int n);
// Saint-Venant torsion of a b × h rectangle: the torsion constant (Roark) and frequency n.
double torsionJ(double b, double h);
double torsionFreq(double L, double b, double h, int n);

// The bar for key k: cut to the length that puts its first bending mode on the key's pitch.
struct Geometry { int key; double L, b, h, mass; };
Geometry barGeometry(int k, double thick);

// Everything about one bar that does not change while it rings: its modes (bending 1–5, then
// torsion 1–2), each with its frequency, shape along the bar (unit modal mass: displacement per
// √kg; a torsion mode's is its rotation, × the distance off the centre line), its fixed losses
// (thermoelastic, the blocks, radiation) and the sound it radiates by itself (out: pressure-like
// units per unit modal acceleration), and the box under it.
struct Box {
  double w, l, S;       // the mouth: across the bar, along it (between the blocks), area
  double Sb;            // the volume bar mode 1 sweeps over the mouth, per unit modal displacement (m³/√kg)
  double Rb;            // how far the air in the gap escapes sideways
  double delta0, perim; // the open end's correction; the box's inner perimeter
};
struct Bar {
  Geometry geom;
  int count;            // modes kept (those under 20 kHz)
  std::array<double, N_MODES> f{}, ratio{}, sigTE{}, sigSup{}, sigRad{}, out{}, dampW{};
  std::array<bool, N_MODES> tors{};
  std::array<std::array<double, NX>, N_MODES> w{}; // shapes at x = L·i/(NX − 1)
  std::array<double, 2> nodes{};                  // mode 1's nodes (m from the end): where the blocks sit
  Box box;
  std::array<double, 2> pan;
};
void buildBar(int k, double thick, Bar &out);
// A shape at a fraction u of the length (linear between the points).
double shapeAt(const Bar &bar, int mode, double u);

// The blocks: a dashpot r (N·s/m) under each, of half-width halfWidth (m).
struct Support { double r, halfWidth; };
inline constexpr Support SUPPORT = {0.4, 0.003};
inline constexpr double DAMPER_X = 0.07, DAMPER_W = 0.08; // the felt damper: a pad this far (× L) from the bar's end (its centre), this long

// The box's air: a stopped pipe, closed at the bottom, whose first mode is the resonator.
// Bar mode 1 and the box share the air in the gap between them (as the vibraphone's tubes do):
// kinetic energy ½ M₁₁ q̇² + M₁₂ q̇ Ẋ + ½ M₂₂ Ẋ² for bar mode 1 (q) and the box's volume
// displacement (X), with the gap's inertance m_g.
struct BoxState {
  double depth, le, ma, Ka, mg, Rrad, Rwall, R, M11, M12, M22;
};
inline double gapInertance(double g, double Rb) { return (RHO_AIR * std::log(1 + Rb / g)) / (TAU * g); }
BoxState boxState(const Box &box, double f1, double gap, double detune);
// The pair's undamped frequencies (two oscillators coupled through their masses).
std::array<double, 2> twoOscillator(double fb, double ft, double kappa);

// The hammer: felt, F = K δ^p with a little hysteresis α; graded up the compass, lighter
// (× 0.5 at C8) and harder (× 4) than at C4.
inline constexpr double FELT_P = 2.5, FELT_ALPHA = 2e-5;
struct Hammer { double m, K, p, alpha; };
Hammer hammerOf(int k, double hardness, double massGrams);

} // namespace forte::celesta
