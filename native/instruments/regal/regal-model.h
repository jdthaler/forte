// regal-model.h — the physics of a regal: a beating reed (a curved brass tongue rolling onto the
// flat face of its shallot), the tube it sounds into (the shallot and a short resonator), and the
// wind. The engine (regal-engine.h) integrates them; this file designs each key's reed and tube.
//
//   bellows ─▶ trunk (tremulant) ─▶ chest P_w ─▶ key's pallet ─▶ boot P_b ─▶ gap A(q) ─▶ shallot + resonator ─▶ air
//                                                                          ▲
//                                                     tongue q: m q̈ = −k q − c q̇ + S (P_b − p_d) − F_contact(q)
#pragma once

#include <array>
#include <complex>

#include "forte/tuning.h"

namespace forte::regal {

struct Air { static constexpr double rho = 1.2, c = 343; };
constexpr double PI = 3.141592653589793;
constexpr double BRASS_E = 100e9, BRASS_RHO = 8500;
constexpr double CD = 0.61;          // the jet's vena contracta through the gap
constexpr double PSI_AREA = 0.375;   // ∫ψ over the tongue, ψ(u) = u²(3 − u)/2 (the tip moves 1)
constexpr double PSI_MASS = 33.0 / 140; // ∫ψ²: the tongue's modal mass over its own mass

enum Shape : int { REGAL, FUNNEL, APPLE, NONE, NSHAPES };
constexpr int NRANKS = 3;            // 16′, 8′, 4′
constexpr double RANK_OCT[NRANKS] = {-1, 0, 1}; // (the 4′ breaks back an octave past C8: rankFreq)

// The tongue's voicing (the knobs in Tongues and Resonators).
struct Voicing {
  double curve = 0.6;     // mm: the tip's rest height above the shallot at C4
  double thick = 1;       // × the design thickness
  double q = 120;         // the tongue's mechanical Q
  bool leather = false;   // the shallot's face leathered
  int shape = REGAL;
  double resLen = 1;      // × the resonator's design length
  bool operator==(const Voicing &) const = default;
};

// A tube as a chain of cylinders from the reed outward (a cone is a staircase of them). The last
// one radiates from its open end.
constexpr int MAX_SEG = 12;
struct Tube {
  int n = 0;
  double len[MAX_SEG] = {}, area[MAX_SEG] = {};
  double total() const { double s = 0; for (int i = 0; i < n; i++) s += len[i]; return s; }
  void add(double l, double a) { if (n < MAX_SEG && l > 0) { len[n] = l; area[n] = a; n++; } }
};

// One reed, designed for the frequency it should sound.
struct Reed {
  double f0 = 0;          // the note it sounds (Hz)
  double fNat = 0;        // the tongue's own frequency, cut so that it sounds f0 in its tube
  double L = 0, b = 0, h = 0, M = 0; // tongue: length, width, thickness (m), tip weight (kg)
  double m = 0, k = 0, S = 0;        // modal mass, stiffness, pressure area (the tip as coordinate)
  double c = 0;           // mechanical damping (N s/m)
  double h0 = 0;          // the tip's rest height above the shallot (the curve)
  double bs = 0, Ls = 0;  // the shallot's opening under the tongue: width and length
  double Ks = 0, zc = 0;  // contact: the penalty stiffness along the tongue (N/m), its damping ratio
  double Vb = 0;          // the boot's volume (m³)
  double ds = 0;          // the shallot's bore (m)
  double gain = 1;        // the voicer's regulation: its sound's level, so that the treble speaks out
  Tube tube;              // shallot + resonator
};

// The reeds' design, from the note they sound.
double tongueThickness(double f0, double thick);
double tongueWidth(double f0);
// The exact first frequency of a clamped–free brass tongue of length L, thickness h and width b
// with a tip mass M (Euler–Bernoulli with the tip mass's inertia), for the tests.
double cantileverFreq(double L, double h, double b, double M);
// Design a reed to sound f0 (the tuning table's correction already in tune: fNat = f0 / tune).
// Its resonator is cut so that its first impedance peak sits `off` harmonics from one of the note's
// (−0.25 by default; the tuning table chooses it per note).
void design(double f0, double tune, const Voicing &v, Reed &out, double off = -0.25);
// The tuning table: how far below its natural frequency a reed of shape s sounds at f0
// (regal-tuning.h, made by tools/regal-tuning.mjs).
double tuneRatio(double f0, int shape);
// The voicer's retuning (regal-voicing.h): how many cents a reed of voicing v sounding f0, blown with
// the bellows weighted to P0, sounds from its note; the engine runs it that much slower.
double voicingCents(double f0, const Voicing &v, double P0);
double tuneOffset(double f0, int shape);
// Design for a key and rank, tuned: the key's frequency in the keyboard's tuning.
void designKey(int key, int rank, const Voicing &v, const Tuning &tuning, Reed &out);
double rankFreq(int key, int rank, const Tuning &tuning);

// The contact: the generalised force (per unit penalty stiffness) of the tongue pressed into the
// shallot at tip displacement q (toward the shallot) with rest height h0, and its slope.
// The tongue's gap along it, g(u) = u²(h0 − q(3 − u)/2), closes from the root outward as q grows.
void contact(double q, double h0, double &I, double &dI);
// The open area of the gap at q: the tip's width bs × g(1) and both sides along Ls.
double gapArea(double q, double h0, double bs, double Ls);
// The tube's input impedance at the reed (Pa s/m³), with wall losses and the open end's radiation;
// lossless = true leaves both out.
std::complex<double> inputImpedance(const Tube &t, double f, bool lossless = false);
// The tube's first impedance peak (Hz) above fLo, from its lossless transfer matrix.
double firstPeak(const Tube &t, double fLo, double fHi);
// The radiating end's correction (m), 0.61 × its radius.
double endCorrection(const Tube &t);

// The wind.
constexpr double V_BELLOWS = 0.020;  // m³: each of the two wedge bellows, full
constexpr double THETA_MAX = 0.25;   // rad: a full bellows' opening angle (14°)
constexpr double A_BOARD = 0.15;     // m²: a bellows' top board (its weight W = P0 × A_BOARD)
constexpr double BELLOWS_Z = 0.7;    // the board's motion on the wind's air: its damping ratio
constexpr double RAISE_T = 1.2;      // s: the calcant raises an empty bellows in this
constexpr double V_CHEST = 0.002;    // m³: the windchest
constexpr double G_TRUNK = 3e-4;     // m³/s per Pa: the trunk between bellows and chest
constexpr double G_TREM = 0.12 * G_TRUNK; // the tremulant's vent, wide open
constexpr double G = 9.81;
// A wedge bellows' wind: the weight's moment falls with the board's angle, so P ∝ cos θ, with
// the fill f ∈ [0, 1] (V ∝ sin θ) and P0 the pressure full (3 % more when it is down).
double bellowsPressure(double P0, double fill);

} // namespace forte::regal
