// clavier-model.h — the physics of a tangent-struck, magnetically sensed string, after the Hohner
// Clavinet D6.
//
// Each key has one steel string running from the tailpiece (x = 0) to its tuning pin. The key's
// rubber tangent pins the string onto a metal anvil at x = L: the speaking length [0, L] rings
// between anvil and tailpiece, and the nonspeaking length [L, L + Ln] is wound with yarn. Two
// magnetic pickups sit under and over the speaking length near the tailpiece.
//
// The string is reduced to modes by component-mode synthesis, with the height s of the string at
// the anvil as the shared coordinate:
//   speaking part  u(x) = s·x/L + Σ q_n sin(nπx/L)   (Craig–Bampton: pinned modes on top of the
//                  static shape, coupled to s through mass)
//   yarn part      quarter-wave modes free at the anvil and pinned at the tuning pin, s = Σ r_m;
//                  the yarn is a uniform viscous drag
// The tangent (a mass on a Hertzian rubber tip) and the anvil (a stiff Hertzian stud) act on s;
// the engine solves both contacts implicitly.
//
// A key's model is closed-form (no eigen-solve): a bisection for the wound strings' cores and a
// few hundred exponentials and sines, so the engine builds it when a key is struck. Only
// releasedFreqs, for the views and the tests, solves an eigenproblem.
// P is indexed as in clavier-params.h. Units: SI unless a name says otherwise.
#pragma once

#include <cmath>
#include <numbers>
#include <utility>

#include "clavier-params.h"

namespace forte::clavier {

constexpr double PI = std::numbers::pi;
constexpr int LO = 29, HI = 88;                // F1 … E6, the D6's 60 keys: the compass its scale is drawn on
constexpr int KEY_MIN = 21, KEY_MAX = 108;     // what it plays with the full range open: the scale, continued
struct Steel { double E, rho, strength; };
inline constexpr Steel STEEL = {2.0e11, 7850, 2.6e9};
constexpr double WIND_RHO = 8900;              // copper-alloy winding
inline const double NONSPEAK = std::pow(2.0, 3.0 / 12) - 1; // Ln / L: the pitch falls 3 semitones on release
constexpr double TUNE_FORCE = 4;               // N: the keyboard is tuned with the keys held at this force
constexpr double RETURN_FORCE = 1.5;           // N: key return spring, lifting the tangent on release
constexpr double PRESS_MAX = 12;               // N: extra key force at full aftertouch (or pitch wheel)
constexpr double MUTE_K = 400, MUTE_R = 1.2;   // N/m, N·s/m: the mute felt at full pressure
constexpr double REST_GAP = 1.5e-3;            // m: tangent tip above the string at rest
constexpr double ANVIL_K = 2e9;                // N/m^1.5: steel string on a steel stud (Hertz)
constexpr double ANVIL_LOSS = 0.3;             // s/m: Hunt–Crossley damping of the stud contact
constexpr double KEY_DAMPING = 15;             // N·s/m: the finger on a held key, resisting its rebound
constexpr double PICKUP_R = 1e4;               // Ω: source resistance of the pickup coils (assumed)
constexpr double POLE_WIDTH = 8e-3;            // m: magnetic aperture of a pickup along the string
constexpr double F_MAX = 9000;                 // Hz: highest mode kept
constexpr int N_MAX = 96, M_MAX = 8;           // speaking modes, yarn modes
constexpr double GAP_REF = 0.5e-3;             // m: the gap at which levels are set (see the engine)
// The frame under the anvils: the anvil rail and the case it is screwed to, as three modes driven
// by the force on the stud. The pickups sit on it, so its motion under every string (all 60 of
// them lie in the field) is heard as if the strings had moved the other way. Estimates: the D6's
// frame is not measured.
constexpr int FRAME_MODES = 3;
inline constexpr double FRAME_F[FRAME_MODES] = {520, 1400, 3300}; // Hz
constexpr double FRAME_Q = 12, FRAME_MASS = 3;                     // each mode's Q and modal mass (kg)

inline double keyFreq(double k) { return 440 * std::pow(2.0, (k - 69) / 12); }

// The scale: the speaking length falls by about one key width per semitone, 86 cm for F1 to
// 17 cm for E6 (95 cm for A0 below). Above E6 it halves every octave, as a plain wire must to keep
// its stress (4ρ(Lf)²) at E6's. The first 23 strings (F1–D♯3) are wound, and those below F1.
inline double speakingLength(int key) { return key <= HI ? 0.17 + (88 - key) * 0.0117 : 0.17 * std::pow(2.0, (88 - key) / 12.0); }
inline bool isWound(int key) { return key <= 51; }

struct Gauge { bool wound; double d, D, mu; };
// Plain wire, or a wound string whose overall diameter follows a replacement set and whose core
// is chosen to give the measured inharmonicity.
Gauge gauge(int key);

// Quasi-static depth of the rubber tip under force F (Hertz, F = K δ^1.5), and the extra string
// length the wrap round the stud's edge takes, ΔL = δ²/2a.
double tipK(const double *P);
double tipDepth(double F, const double *P);
double wrapLength(double F, const double *P);

// Everything about one key's string that does not depend on the sample rate.
struct StringDesign {
  int key;
  double f0, L, Ln;
  bool wound;
  double d, D, mu, A, EA, EI, T, T0, dTnom, dLnom, gap, B;
  double stress, c, mag, pull, fRelease;
};
StringDesign stringDesign(int key, const double *P);

// Partial n of the held string and its decay rate.
double speakingFreq(int n, const StringDesign &S);
double sigma1(double f0, const double *P);
double modeSigma(double f, double f0, const double *P);
// Pitch change (cents) for a tension change dT, and for a key force F.
double tensionCents(const StringDesign &S, double dT);
double pressureTension(const StringDesign &S, double F, const double *P);
double pressureCents(int key, double F, const double *P);
// Kirchhoff–Carrier for one mode of amplitude A: Δω/ω = 3 EA k² A² / 32 T.
double duffingShift(const StringDesign &S, int n, double A);

// The pickups: where each key sees them, their signs in the mix (by the selector's index), the
// field's flux (e^x − 1 near rest, then along its tangent), and what a pickup hears of mode n.
struct PickupX { double lower, upper; };
PickupX pickupX(int key, const double *P);
std::pair<double, double> pickupMix(int sel);
inline double fieldFlux(double x) { return x <= 1 ? std::expm1(x) : std::numbers::e - 1 + std::numbers::e * (x - 1); }
double pickupWeight(int n, double x, double L);

// The tone tabs: one second-order section H(s) = s / (a2 s² + a1 s + a0) for any combination.
struct ToneAnalog { bool any; double a2, a1, a0; };
ToneAnalog toneAnalog(const double *P);
double toneResponse(double f, const double *P);
struct ToneBiquad { double b0, b1, b2, a1, a2; };
ToneBiquad toneBiquad(const double *P, double fs);

// One damped mode q'' + 2σq' + ω0²q = f, discretised impulse-invariantly (also overdamped).
struct Osc { double a1, a2, b; };
Osc osc(double f, double sigma, double fs);

// The modal model of one key for the engine (and the views).
struct Mode { int n; double f, sigma, a1, a2, b, kn; };
struct YarnMode { int m; double km, f, sigma, a1, a2, b; };
struct KeyModel {
  StringDesign S;
  Mode modes[N_MAX];
  int nModes = 0;
  YarnMode yarn[M_MAX];
  int nYarn = 0;
  PickupX X;
};
void keyModel(int key, const double *P, double fs, KeyModel &out);

// Frequencies of the released string (the undamped coupled system with the anvil open), lowest
// first: how many it wrote (none if the eigenproblem fails). Views and tests only: it allocates.
int releasedFreqs(int key, const double *P, int count, double *out);

} // namespace forte::clavier
