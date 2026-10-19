// kalimba-model.h — the physics of a kalimba: steel tines and a wooden box.
//
// The tine (Chapman 2012): a steel strip clamped under a bar, resting on a bridge and free at
// the tip, an Euler–Bernoulli beam that is clamped–supported–free. Its back segment (clamp to
// bridge) is `back` times its front one (bridge to tip): that ratio, not a fixed constant, sets
// how far its overtones sit above the fundamental. Each key's tine is cut to the front length
// that puts its first mode on the note. The thumb pushes the tine down at the pluck point and
// lets go: the tine starts from its static deflection, and how long the release takes filters
// the modes it reaches. What reaches the box is the net force the tine puts on its supports.
//
// The box (Christensen & Vistisen 1980): the top plate's first mode and the air in the sound
// hole, coupled through the air in the cavity, a two-oscillator system; above them, the plate's
// higher odd–odd modes (the ones with a net volume velocity). What radiates is the box's
// volume acceleration. Bottle caps on the plate (Holmes 1982's bouncing ball) leave it whenever
// its downward acceleration beats gravity and rattle as they land.
#pragma once
#include <array>
namespace forte::kalimba {

// Materials: spring steel tines, a hardwood plywood top, air.
constexpr double E_STEEL = 200e9, RHO_STEEL = 7850;
constexpr double TINE_WIDTH = 0.005;   // m
// The thumb at velocity 1 pushes the tine down by DEPTH, or as far as THUMB_FORCE takes it on a
// tine too stiff for that (velocity scales both).
constexpr double DEPTH = 0.003, THUMB_FORCE = 8; // m, N
constexpr double E_WOOD = 9e9, RHO_WOOD = 650, NU_WOOD = 0.3;
constexpr double RHO_AIR = 1.2, C_AIR = 343;
constexpr double G = 9.81;
// The box at 0.88 litres (Box size scales it, keeping its shape): the top's width (across the
// tines) and length, the cavity's depth, the top's thickness. The bridge crosses the top at
// BRIDGE_Y of its length.
constexpr double BOX_A = 0.17, BOX_B = 0.13, BOX_D = 0.04, BOX_H = 0.004, BRIDGE_Y = 0.3;
// The top's modes are damped by the wood, the walls and the hands holding the box; the hole's
// air by radiation and friction in its neck.
constexpr double PLATE_Q = 3, HOLE_Q = 15;
constexpr int MAX_MODES = 10;          // a tine's modes (those above F_MAX are not played)
constexpr double F_MAX = 18000;
constexpr double F_REF = 261.6255653005986; // C4: the Ring time is the fundamental's here

// The tine's shape for back/front ratio r, in units of the front length: βL of each mode (L the
// front length) and its shape over ξ in [−r, 1] (−r the clamp, 0 the bridge, 1 the tip),
// normalised so that ∫φ² dξ = 1, with the tip moving up.
struct TineShape {
  double r = -1;
  int count = 0;
  std::array<double, MAX_MODES> beta{};
  std::array<std::array<double, 8>, MAX_MODES> c{}; // back segment A..D, front segment E..H
  std::array<double, MAX_MODES> S{};                // ∫φ dξ: the mode's net force on the supports
};
const TineShape &tineShape(double r); // cached for the last r
double modeShape(const TineShape &t, int n, double xi);

// One key's tine.
struct Tine {
  double f1, L, a, t, mu, EI; // fundamental (Hz), front and back length (m), thickness (m), mass/length, EI
  double force;               // the thumb's force (N) at velocity 1
  double depth;               // how far it pushes the pluck point down (m) at velocity 1
};
Tine tineOf(int key, const double *P);

struct Mode {
  double f, sigma;
  double amp; // the mode's force on the supports (N) at release, at velocity 1
  double q;   // its displacement: the tine's shape at release is Σ q φ(ξ), in metres
};
struct KeyModes { std::array<Mode, MAX_MODES> m; int count = 0; Tine tine; };
// The modes of one key, from the parameters (indexed as in kalimba-params.h).
KeyModes keyModes(int key, const double *P);
// The tine's static deflection (m) at ξ, pushed down at the pluck point at velocity 1, from
// its modes (a check on them: the tests compare it with beam theory).
double staticDeflection(int key, const double *P, double xi);
// Residual vibration of a mode after a force released smoothly over tau (a raised cosine):
// the spectrum of a half-sine pulse, 1 at low f, 0 at f = 1.5/tau.
double releaseSpectrum(double f, double tau);
// Where key's tine crosses the bridge, as a fraction of the top's width: the lowest tine of a
// kalimba (C4) in the middle and the rest alternating outward.
double bridgeX(int key);

// The box.
constexpr int PLATE_MODES = 8;         // (1,1), coupled to the air, and seven more odd–odd modes
struct PlateMode { int m, n; double f, M, S; };
struct Box {
  double V, a, b, d, h;          // volume (m³), top's width and length, depth, top thickness (m)
  std::array<PlateMode, PLATE_MODES> plate{};
  double kappa;                  // the cavity's stiffness ρc²/V (Pa/m³)
  double Ih, Rh;                 // the hole's inertance and resistance (open area; ∞ when shut)
  double Rp;                     // the (1,1) mode's resistance
  double fH, fp, fpSealed;       // the hole on rigid walls, the top in vacuo, the top on the sealed cavity
  double fLo, fHi;               // the coupled pair (0 when the hole is shut: then fHi = fpSealed)
  bool open;
};
Box boxOf(const double *P, double cover);
double plateShape(const PlateMode &pm, double x, double y);
// |volume acceleration| (m³/s²) per newton at key's place on the bridge, at frequency f.
double boxResponse(const Box &box, int key, double f);

// The buzzers: bottle caps on the top, each where it sits and how it rings.
constexpr int MAX_CAPS = 8;
struct Cap { double x, y, f1, f2; };
extern const std::array<Cap, MAX_CAPS> CAPS;
constexpr double CAP_RESTITUTION = 0.5, CAP_T60 = 0.02;

} // namespace forte::kalimba
