// arc-model.h — the physics of Duddell's singing arc, with V8's exp, sin, cos and pow
// (forte/fdlibm.h) so that it gives the same numbers in the WebAssembly and the plugins.
//
// The arc: Ayrton's falling characteristic V(I) = A + B/I (A = a + b·l, B = c + d·l) as the static
// limit of a Mayr column, written in the "thermal current" X (g = X²/(A·X + B)):
//   dX/dt = (w(X)/τ) (i² − X²)/X,   w(X) = (A·X + B)/(A·X + 2B),
// with a floor X_m (the white-hot carbons) set by the re-strike voltage U_r = A + B/X_m.
// The circuit (Duddell's): supply E, rheostat R_b, choke L_b, the arc, and across it a coil L (R)
// in series with the capacitors the keys switch in. Its linear analysis (a quartic in s), and the
// steady note a capacitor sounds, integrated with the engine's scheme: each key's capacitor is cut
// for its sounding note (capFor), the table the engine plays from.
#pragma once

#include <array>
#include <cstdint>
#include <numbers>

#include "forte/tuning.h"

namespace forte::arc {

constexpr double TAU = 2 * std::numbers::pi;
constexpr int KEY_LO = 21, KEY_HI = 108, NK = KEY_HI - KEY_LO + 1; // A0–C8
double keyFreq(double m); // 440·2^((m − 69)/12), with V8's pow

// Ayrton's constants for solid carbons, V = a + b·l + (c + d·l)/I.
struct Ayrton { double a, b, c, d; };
constexpr Ayrton AYRTON = {38.88, 2.074, 11.66, 10.54};
// The supply: 220 V DC through a rheostat and a large choke.
struct Supply { double E, Lb; };
constexpr Supply SUPPLY = {220, 0.5};
// Air at 20 °C, for the thermophone.
struct Air { double gamma, c, T, cp, rho; };
constexpr Air AIR = {1.4, 343, 293.15, 1005, 1.204};
// Talking arc: the microphone transformer's secondary and its blocking condenser.
struct Talk { double L, R, C; };
constexpr Talk TALK = {0.5e-3, 6, 100e-6};
// Hissing current: grows with the gap.
struct Hiss { double I0, perMm, width; };
constexpr Hiss HISS = {2.5, 1.5, 0.25};
constexpr double FLOOR_SHARP = 0.05; // smooth-max corner of the floor, × X_m

// The parameters the physics reads (the descriptor's, by name).
struct ArcParams {
  double current = 3, gap = 3, tau = 26, restrike = 1.25, coil = 20, coilR = 0.3;
  int tune = 0; // 0: the sounding note, 1: Kelvin's formula
  bool talk = false;
  forte::Tuning tuning; // the keyboard's (forte/tuning.h): each key's capacitor is cut for its tuned note
};
ArcParams arcParams(const double *P); // from the parameters, indexed as in arc-params.h

// ---- the arc ----------------------------------------------------------------------------------

struct Op {
  double I0, l, A, B, tau, V0, Ur, Xm, delta;
  double G0, u0, R0, w, K, Rd, kappa, Larc, Rb;
};
Op arcOp(const ArcParams &P);
double xEff(double X, const Op &op);
double cond(double X, const Op &op);
double dlnG(double X, const Op &op);
double wOf(double X, const Op &op);
double flow(double X, double i, const Op &op);
double flowDX(double X, double i, const Op &op);
double flowDi(double X, double i, const Op &op);
double staticV(double I, const Op &op);
struct Cx { double re, im; };
Cx zArc(double omega, const Op &op); // small-signal impedance, analytic
double negLimit(const Op &op);       // where Re Z(jω) = 0 (rad/s)

// ---- the circuit: linear analysis ---------------------------------------------------------------

// Complex roots of a real polynomial of degree n ≤ 8 (coefficients low → high), Durand–Kerner, in z.
void polyRoots(const double *c, int n, Cx *z);

struct Circuit { Op op; double C, L, R, Lb, Rb; };
Circuit circuit(const ArcParams &P, double C, const Op &op);
inline Circuit circuit(const ArcParams &P, double C) { return circuit(P, C, arcOp(P)); }
// The characteristic equation's roots (rad/s) and the musical one: σ (1/s), f (Hz), the LC frequency.
struct Linear { Cx s; double sigma, f, fLC; std::array<Cx, 4> roots; };
Linear linearAnalysis(const Circuit &ckt);
inline double kelvinC(double f, double L);
double thresholdR(const ArcParams &P, double C);       // coil resistance at which the note is on the edge
double thresholdCurrent(const ArcParams &P, double C); // arc current above which it no longer starts
double upperLimit(const ArcParams &P);                 // the highest note the arc can start on this coil

// ---- the steady note and the keyboard's capacitors ---------------------------------------------

struct SteadyOptions { int M = 256; double kick = -1; double settle = 0.06; int measure = 16; }; // kick < 0: 0.7 × the current
struct Steady { double f, iaMin, iaMax, uMax, Iac; };
Steady steadyNote(const ArcParams &P, double C, const SteadyOptions &o, const Op &op);
inline Steady steadyNote(const ArcParams &P, double C, const SteadyOptions &o = {}) { return steadyNote(P, C, o, arcOp(P)); }
inline double keyTarget(int key, const ArcParams &P) { return keyFreq(key) * P.tuning.ratio(key); } // the key's tuned note
double startCap(int key, const ArcParams &P, const Op &op); // the capacitance whose note starts on the key
double capFor(int key, const ArcParams &P, const Op &op);   // the one whose steady note sounds it
inline double capFor(int key, const ArcParams &P) { return capFor(key, P, arcOp(P)); }
// The bank's identity (arc-model.js's tuneKey): the parameters it depends on, hashed; never 0.
uint64_t tuneVersion(const ArcParams &P);

// ---- hiss and sound -----------------------------------------------------------------------------

inline double hissCurrent(double l) { return HISS.I0 + HISS.perMm * l; }
double hissFactor(double I, double l);
inline double pressureGain(double r) { return (AIR.gamma - 1) / (4 * std::numbers::pi * AIR.c * AIR.c * r); }

inline double kelvinC(double f, double L) { const double x = TAU * f; return 1 / ((x * x) * L); } // V8's pow(x, 2) is x·x

} // namespace forte::arc
