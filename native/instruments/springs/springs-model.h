// springs-model.h — the physics of a struck helical spring: Wittrick's helical rod (a 6 × 6
// symmetric eigenproblem per wavenumber,
// by the same cyclic Jacobi), the drive's sheet and its transition F_C, the tuning (the lowest mode
// on the note, then the virtual pitch of what is heard), a spring's modes, the losses and the
// mallet. sin, cos, exp, log and pow are V8's (forte/fdlibm.h) and log2 is computed as V8 computes
// it, so a key's springs come out the same to the last bit everywhere.
//
// The rod solvers are kept in a cache (per thread) keyed by the shape printed to nine decimals,
// so that neighbouring keys (whose r/R differs in the last bit) share the first one's solver, and
// the same calls give the same numbers.
#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

#include "forte/tuning.h"

namespace forte::springs {

inline constexpr double PI = 3.14159265358979323846;
inline constexpr double TAU = 2 * PI;
inline constexpr int KEY_LO = 36, KEY_HI = 84;  // C2–C6, the keys the pan is drawn on
// What it plays, A0–C7: every key's spring is the C4 one scaled, so F_C rises an octave with each
// octave (4.2 kHz at C4) and leaves the modes' 18 kHz ceiling past C6; above C7 the band holds
// fewer than 31 modes, all well below F_C, and the chirp is gone (5 modes at C8, nearly harmonic).
inline constexpr int KEY_MIN = 21, KEY_MAX = 96;

// Math.log2 and Math.round as V8 computes them
double log2(double x);
double jsRound(double x);

double keyFreq(double m);
double cents(double f, double g);

// Spring steel
inline constexpr double STEEL_E = 200e9, STEEL_RHO = 7850, STEEL_NU = 0.29;
extern const double cE; // √(E/ρ)
double shearK(double nu);

// The C4 spring (every key's is it scaled) and the Slinky
inline constexpr double REF_KEY = 60, REF_R = 2.7e-3, REF_r = 0.225e-3;
inline constexpr double SLINKY_KEY = 60, SLINKY_R = 35e-3, SLINKY_r = 0.35e-3, SLINKY_L = 3.5, SLINKY_FMAX = 3000, SLINKY_GAIN = 0.03;

// What a key's springs depend on (the descriptor's parameters that geometryId names).
struct Params {
  bool slinky = false;
  bool axial = false; // drive: along the axis, or in rotation
  double coil = 1, wire = 1, helix = 3, springs = 2, spread = 1.5, mallet = 0.35, bead = 1, endLoss = 0.06, eta = 2e-4, oil = 0;
  forte::Tuning tuning; // the keyboard's (forte/tuning.h): each key's spring is cut for its tuned note
};
// From the native parameter array (springs-params.h's order).
Params paramsOf(const double *P);
// geometryId: the same parameters, as a number (a hash of their values)
uint64_t geometryId(const Params &P);

struct Geometry { double R, r, alpha, nu, E, rho; bool slinky; };
Geometry geometry(int key, const Params &P);
struct Shape { double rr, alpha, nu; };
inline Shape shapeOf(const Geometry &g) { return {g.r / g.R, g.alpha, g.nu}; }

struct RodConstants {
  double kap, tau;
  double C[6], M[6];
  double A, I, J, G;
};
RodConstants rodConstants(const Shape &s);

// One shape's solver: solve(k) fills w (6 ascending ω), Y (6 × 6, column j the M-orthonormal
// eigenvector of ω_j, row-major) and dw (dω/dk).
struct Transition { int j; double k, w, c0; };
class RodSolver {
 public:
  explicit RodSolver(const Shape &shape);
  void solve(double k);
  Shape shape;
  RodConstants rc;
  double w[6], Y[36], dw[6];
  std::string id;
  bool tuned[2] = {false, false}; // the transition for each drive (its cache, 'tune|<drive>')
  Transition tune[2]{};

 private:
  double B0[36], B1[36], bk[36], sM[6], Am[36], V[36], lam[6];
  int ord[6];
};
void jacobi6(double *A, double *V, double *d);
double beadShare(const double *Y, int j, double alpha, bool axial);
int driveSheet(RodSolver &solver, bool axial);
Transition transition(RodSolver &solver, bool axial);
std::shared_ptr<RodSolver> solverFor(const Shape &shape);

// A key's spring, tuned (tuneSpring)
struct Spring {
  double R, r, alpha, nu, E, rho;
  bool slinky;
  int key;
  double f0, L, turns, height, mass, c0, TD, Fc, kc;
  int sheet;
  bool onBranch, axial;
  double fMax;
  std::shared_ptr<RodSolver> solver;
};
Spring tuneSpring(int key, const Params &P);

struct Mode { int n, j; double k, f, cg, share, rel; };
std::vector<Mode> springModes(const Spring &sp, double fMax = 18000, double fMin = 20, double wMin = 1e-3);

// σ of a mode (1/s): oil + steel + the mounts
double modeSigma(double f, double cg, double L, double endLoss, double eta, double oil);
double pulseLength(double mallet, double velocity);
double pulseSpectrum(double f, double tau);

// The virtual pitch (subharmonic summation) of partials (f, a), the strongest candidate within
// halfCents of center.
struct Partial { double f, a; };
struct Pitch { double f, strength, global; bool edge; };
Pitch virtualPitch(const std::vector<Partial> &partials, double center, double halfCents = 600);

inline constexpr double HEAR = 0.4, MF = 0.7;

// One spring of a key as the engine plays it: its length, note and modes
struct SpringData {
  double L, f0, TD, Fc, gain;
  int key;
  std::vector<double> f, cg, rel;
  std::vector<int> n;
};
std::vector<Partial> heardPartials(const std::vector<const SpringData *> &springs, const Params &P, double rho = 1);

// A key's springs, tuned (keySprings): what the page sends with a note, and the engine plays.
struct KeySprings {
  uint64_t id = 0;
  double fs = 0;
  int key = 0;
  double rho = 1, pitchBefore = 0, pitch = 0, global = 0;
  std::vector<SpringData> springs;
};
KeySprings keySprings(int key, const Params &P, double fs, double wMin = 3e-3);

// Packed as numbers for the page and back (the page's noteData for the WebAssembly engine): the
// id (two 32-bit halves), fs, key, rho, pitchBefore, pitch, global, the number of springs; then
// per spring L, f0, TD, Fc, gain, N and f, cg, rel, n (N each).
std::vector<double> packKeySprings(const KeySprings &d);
bool unpackKeySprings(const double *a, int n, KeySprings &d);

// The dispersion of a spring's two acoustic sheets (dispersionCurve, for the views): n points of
// each, k (1/m), f, c_g and the bead share, up to fTop.
struct CurvePoint { double k, f, cg, share; };
void dispersionCurve(const Spring &sp, double R, double fTop, int n, std::vector<CurvePoint> pts[2]);
double kAbove(const Spring &sp, double R, double f);

} // namespace forte::springs
