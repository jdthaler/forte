// pianet-model.h — the physics of a sticky-pad reed piano: the reed of each key, the pad and its
// bond, the pickups.
//
//            key down ⇒ the holder rises at speed V
//                ▲
//            ┌───┴───┐  holder h(t)
//            │ foam  │  spring k_p ∥ dashpot c_p (Kelvin–Voigt)
//            └▀▀▀▀▀▀▀┘  tacky face, bonded to the reed over a disc of radius a
//   ▓▓══════════════════▆▆  reed: steel strip + solder (modes q_n)
//   clamp           x_c  ▔▔  pickup at the tip: magnet pole (T) or plate (N)
//
// A key's reed (keyReed: a finite-element solve, the length cut to pitch) is built once per key
// and (tip mass, loss), off the audio thread in the plugins (forte/background.h); the rest is
// plain arithmetic. Powers, exponentials and trigonometry go through V8's fdlibm (fdlibm.h), so
// the reeds and the bond's peel give the same numbers to the last bit everywhere.
#pragma once

#include <array>
#include <cmath>
#include <numbers>
#include <vector>

#include "forte/dsp.h"

namespace forte::pianet {

constexpr int KEY_LO = 36, KEY_HI = 96;   // the Pianet's 61 keys, C2–C7: the compass its reeds are graded on
constexpr int KEY_MIN = 21, KEY_MAX = 108; // what it plays with the full range open: the same reeds, continued
constexpr double PI = std::numbers::pi;

// ---- the reed ----------------------------------------------------------------------------------
struct Steel { double E, rho; };
inline constexpr Steel STEEL = {2.0e11, 7850};

// Unit clamped–free strip (L = EI = μ = 1) with a tip mass r at ŝ and rotary inertia ĵ, Hermite
// finite elements. Λ_n = ω_n (L² √(μ/EI)) and φ̂_n(ξ), normalised to unit modal mass and positive
// at the tip. It holds up to every mode of the mesh (UNIT_MODES; a key's reed keeps MAX_MODES).
constexpr int NEL = 16, NDOF = 2 * (NEL + 1), MAX_MODES = 8, UNIT_MODES = NDOF - 2;
struct UnitReed {
  int nModes = 0;
  std::array<double, UNIT_MODES> Lam{};
  std::array<double, NDOF * UNIT_MODES> dof{}; // dof[g · UNIT_MODES + n], the clamped node's two zero
  double shape(int n, double x) const;
};
UnitReed unitReed(double r = 0, double s = 1, double j = 0, int nModes = 6);
// Cantilever with a tip point mass, exact: the roots β_n of the frequency equation (Blevins).
std::vector<double> tipMassRoots(double R, int count = 4);

// ---- the model ---------------------------------------------------------------------------------
// Reed family: graded thickness and solder ratio, width fixed. r = M_solder / (reed mass).
struct ReedFamily { double b, hBass, hTreble, rBass, rTreble, blob, xPad; int nModes; };
inline constexpr ReedFamily REED = {3.0e-3, 0.75e-3, 0.45e-3, 1.6, 0.3, 0.12, 0.8, 8};
double tedDelta();               // thermoelastic relaxation strength of steel (Zener)
constexpr double TED_DTH = 1.2e-5;
constexpr double AIR_SIGMA = 0.4; // s⁻¹, air drag + radiation, lumped

// Pad and bond. The face is a 3 × 3 mm patch: equal-area disc radius a₀.
struct Pad { double a0, Estar, v0, aMin, heal, preload, travel, vRet; };
inline const Pad PAD = {std::sqrt(9e-6 / PI), 1.0e6, 0.01, 0.03, 0.005, 0.02, 5e-3, 0.25};

double keyFreq(double m);  // 12-TET A440, with V8's pow
double keySpeed(double vel); // key speed at the pad for velocity 0..1: 3 cm/s … 40 cm/s
double pullOffStatic(double a, double F0);
double workOfAdhesion(double F0);
double crackSpeed(double F, double a, double F0, double n);
double pullOff(double R, double F0, double n, double dt = 1e-6);
double pullOffFast(double R, double F0, double n);
double reedSigma(double f, double h, double eta);

// The reed of one key, for a tip mass and loss, at rate fs.
struct ReedMode { double f, sigma, T60, ratio, phiC, phiT, release; };
struct KeyReed {
  int key = 0, N = 0;
  double f0 = 0, L = 0, b = 0, h = 0, mu = 0, EI = 0, r = 0, Msolder = 0, xc = 0, kc = 0, tipGain = 0;
  std::array<ReedMode, MAX_MODES> modes{};
  double nrm = 0;
  UnitReed unit;
  double shape(int n, double x) const { return nrm * unit.shape(n, x / L); } // dimensional, x in metres
};
KeyReed keyReed(int m, double tipMass, double loss, double fs = 96000);

// ---- pickups -----------------------------------------------------------------------------------
inline double voicing(int m) { return std::sqrt(261.63 / keyFreq(m)); }
double voicingT(int m);
constexpr double EM_ELL = 1.5e-3, EM_GREF = 1e-3;
inline double emFlux(double y, double g) { const double d = g + y; return (EM_ELL + EM_GREF) / (EM_ELL + (d > 0 ? d : 0)); }
double emH2(double Y, double g);
struct Es { double C1, Cbus, R, Vb; };
inline constexpr Es ES = {(8.854e-12 * 3e-3 * 1e-3) / 1e-3, 150e-12, 10e6, 300};
inline double esCap(double y, double g, double ye) { return ES.C1 * (1e-3 / g) * (0.5 + std::atan((y - ye) / g) / PI); }
// The plate rail: charge Q through R from V_b, rail capacitance C = C_bus + ΔC(t).
class PlateRail {
 public:
  explicit PlateRail(double fs);
  double step(double dC) {
    const double C = ES.Cbus + dC, CV = C * ES.Vb;
    Q = CV + (Q - CV) * d;
    return Q / C - ES.Vb;
  }
  double d, Q;
};

// ---- the mechanism of one key ------------------------------------------------------------------
// Runs at rate fs (the engine uses 2× the audio rate). step() advances one sample and returns the
// tip displacement. No allocation.
struct PadParams { double tack, rate, padK, padC; };
struct Release { double y = 0, F = 0, v = 0, t = 0, V = 0; };
class Pluck {
 public:
  Pluck() = default;
  Pluck(const KeyReed &kr, const PadParams &P, double fs, double bend = 1);
  void retune(double bend, bool resting); // pitch bend: the modes × bend; resting: rescale the state too
  void setPad(const PadParams &P);
  double tip() const;
  void press(double vel);
  void lift();
  double step();
  double energy() const;

  const KeyReed *kr = nullptr;
  int N = 0;
  double k = 0, fs = 0;
  std::array<double, MAX_MODES> q{}, q1{}, A1{}, A2{}, B{}, BT{}, PC{}, PT{}, S{}, W2{};
  double C = 0, cStatic = 0;
  double stop = INFINITY, Ks = 3e5, stopDen = 1, Ct = 0;
  int hits = 0;
  double bend = 1; // the ratio the modes are tuned to
  double F0 = 0, n = 0, kp = 0, cp = 0, Bk = 0, Ck = 0, den = 0, relax = 0;
  double yc = 0, ycRest = 0, e = 0, hRest = 0, h = 0, hv = 0, hT = 0;
  double a = 0, F = 0, v = 0, yRest = 0, y = 0, V = 0, t = 0;
  bool down = false, released = false;
  Release rel; // at the last snap (valid when `released`)

 private:
  void coeffs(double bend);
};

// ---- offline runs for the views and the tests --------------------------------------------------
// Press, ring, and record `frames` snapshots: holder, pad face, reed at the pad and at the tip,
// pad force, bond radius (/ a₀) and the modal states (N per frame).
struct Simulation {
  bool released = false;
  Release rel;
  double tEnd = 0;
  int N = 0;
  std::vector<double> t, h, face, yc, y, F, a, q;
};
Simulation simulatePluck(int m, double tipMass, double loss, const PadParams &P, double vel, double fs = 96000, double periods = 6, int frames = 480,
                         double maxT = 0.4);
// Where the pad lets go for one key velocity (stuck: it didn't, and y, F, t are where it stands).
struct ReleasePoint { double vel, V, y, F, v, t; bool stuck; };
ReleasePoint releasePoint(const KeyReed &kr, const PadParams &P, double vel, double fs);

} // namespace forte::pianet
