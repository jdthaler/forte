// windharp-model.h — the physics of the Wind Harp: the wake and its shedding, each key's string,
// the linear analysis of lock-in (de Langre 2006) and the harmonic balance of the locked state,
// the shutters and the soundbox. The functions the engine uses give the same numbers to the last
// bit everywhere (V8's fdlibm for powers and trigonometry).
#pragma once

#include <numbers>

namespace forte::windharp {

constexpr double TAU = 2 * std::numbers::pi;
constexpr int KEY_LO = 55, KEY_HI = 96; // G3–C7, the 42 keys the soundbox's taper is drawn on
// What it plays, A0–E7. Below G3 the strings are ropes (A0: 38 mm thick, 3.4 m long). Above E7 a
// string thin enough to shed at its note (St·U₀/D) has Re = U₀D/ν below RE_C at the reference wind:
// E7 sheds at Re 50, F7 would need 45, and no diameter reaches a note above ~2.7 kHz.
constexpr int KEY_MIN = 21, KEY_MAX = 100;
double keyFreq(double m);               // 440 · 2^((m − 69)/12), as V8 computes it

// ---- air and the wake ----------------------------------------------------------------------------
struct Air { double rho, nu, c; };
inline constexpr Air AIR{1.204, 1.516e-5, 343}; // 20 °C, sea level
struct Wake { double eps, A, CL0, gamma; };
inline constexpr Wake WAKE{0.3, 12, 0.3, 0.8};  // Facchinetti, de Langre & Biolley (2004a)
constexpr double RE_C = 47;                     // no shedding below this
constexpr double RE_FULL = 60;                  // the shedding's full strength from here (the model's ramp)
constexpr double U_REF = 4.0;                   // m/s: the wind every string is cut for
constexpr double U_MAX = 8;                     // m/s: the wind slider's top (2 U_REF)
constexpr double CORR = 5;                      // spanwise correlation length of a fixed cylinder's lift, in diameters

double strouhal(double Re); // Williamson & Brown (1998): St = 0.2698 − 1.0271/√Re
double onset(double Re);    // the onset factor r(Re)
double vdpKappa(double e);  // the van der Pol limit cycle's frequency over its linear one

struct Shedding { double Re, St, r, fs, Om; bool sheds; };
Shedding shedding(double U, double D); // a fixed cylinder of diameter D in wind U

// ---- the strings ---------------------------------------------------------------------------------
struct Nylon { double rho, E; };
inline constexpr Nylon NYLON{1140, 4e9};
constexpr double L_REF = 0.8; // m: the scale, L = L_REF (f₀/100 Hz)^−½
constexpr int N_MAX = 16;     // modes (and wake stations) per string at most

double diameterFor(double f, double U = U_REF);

// The parameters a string's design reads (windharp-params.js): n0, tuning (0 keys, 1 unison),
// unison (MIDI key), mass (winding ×), q (Q).
struct DesignParams { double n0 = 3; int tuning = 0; double unison = 55, mass = 1, q = 500; };
struct CourseOffset { int idx = 0, course = 1; double cents = 0, gauge = 1; };

struct StringDesign {
  int key = 0;
  double D = 0, L = 0, T = 0, m = 0, ms = 0, mf = 0, mu = 0, B = 0, f0 = 0;
  double f[N_MAX] = {};
  int N = 0, n0 = 1;
  double zeta = 0, Re0 = 0, stress = 0;
  bool unison = false;
  double St0 = 0, fNote = 0, target = 0, lc = 0, cents = 0, gauge = 1;
  int idx = 0, course = 1;
};
StringDesign stringDesign(int key, const DesignParams &P, const CourseOffset &o = {});

// Unison courses: one string to a key from G3 to B4, two from C5 (three from COURSE.three, beyond the compass).
struct Course { int two, three; double cents, gauge, jitter; };
inline constexpr Course COURSE{72, 97, 1.2, 0.005, 0.25};
constexpr int COURSE_MAX = 3;
int courseSize(int key);
int courseOffsets(int key, CourseOffset *out); // returns how many
int homeHarmonic(const StringDesign &S);

// ---- the linear analysis (de Langre 2006) --------------------------------------------------------
struct Harmonic { Shedding sh; double delta, lam, M, AM, wn; };
Harmonic harmonicParams(const StringDesign &S, int n, double U);
struct Root { double re, im; };
void coupledRoots(double delta, double lam, double AM, double eps, Root out[4]);
Root flutterGrowth(double delta, double lam, double AM, double eps = 0);
struct Band { int n; double lo, hi, mid, growth, AM; bool sheds; };
bool lockBand(const StringDesign &S, int n, Band &out);

// ---- the locked state: harmonic balance ----------------------------------------------------------
struct BalanceState { double w, Q, Y, P; };
constexpr int BALANCE_MAX = 8;
int balance(double delta, double lam, double AM, double M, double eps, double r, BalanceState *out); // returns how many (at most BALANCE_MAX)
bool lockedState(double delta, double lam, double AM, double M, double eps, double r, BalanceState &out);
double stationResponse(double F, double w, double r, double eps = WAKE.eps);
void modeShapeAt(int n, int J, double *out);
struct Locked { double w, Y; };
bool lockedDist(const Harmonic &h, const double *shape, int J, Locked guess, Locked &out, double eps = WAKE.eps);
double lockedAmplitude(const StringDesign &S, int n, double U);
struct LockedRange { Band band; double upTo, downTo, Ymid, Yup, Ydown; };
bool lockedRange(const StringDesign &S, int n, LockedRange &out);
inline double massDamping(const StringDesign &S) { return S.mu * S.zeta; }

// ---- shutters ------------------------------------------------------------------------------------
double shutterOpen(double v);  // s: a shutter opens in this (velocity 0 … 1)
double shutterClose(double v); // s: and shuts in this (v < 0: no release velocity)

// ---- gusts ---------------------------------------------------------------------------------------
struct Gust { double ratio, w2; };
inline constexpr Gust GUST{6, 0.38};

// ---- the soundbox --------------------------------------------------------------------------------
struct BoxMode { double f, Q, G; int sign[2]; };
struct Box { double r, mBass, mTreble, shelfF1, shelfF2; BoxMode modes[5]; };
inline constexpr Box BOX{1, 4, 0.5, 500, 4000, {
  {140, 6, 1.8, {1, 1}}, // the air in the box
  {235, 8, 1.7, {1, -1}},
  {370, 9, 1.6, {1, 1}},
  {580, 10, 1.5, {1, -1}},
  {900, 10, 1.4, {1, 1}},
}};
double topMass(int key);
double boxGain(int key);

} // namespace forte::windharp
