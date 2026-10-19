// reeds-model.h — the physics of a Wurlitzer-style reed piano:
//
//   clamp ▐█▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀●═▓  ← reed tip in a slot of the comb
//         ▐█        ▲ felt hammer       solder   pickup (+V through R)
//
// Each key is a flat steel reed, clamped at one end, struck from below by a felt hammer and tuned
// by a solder blob at its tip, reduced to its bending modes by finite elements (reedFEM). Its tip
// swings through a slot in a comb held at a high DC voltage: the reed–comb capacitance C(y) comes
// from the Laplace solution tabulated in slot-table.h (generated from reeds/src/slot-table.js).
//
// A key's model (keyModel: the tip-mass root, then a few FEM solves) allocates and takes a
// millisecond or two: it is built off the audio thread (forte/background.h). The slot's C(y)
// (fillCap) and the rest are plain arithmetic, and do not allocate.
#pragma once

#include <array>
#include <cmath>
#include <cstdint>
#include <vector>

#include "forte/dsp.h"
#include "forte/tuning.h"
#include "slot-table.h"

namespace forte::reeds {

constexpr double PI = 3.141592653589793;
constexpr int KEY_LO = 33, KEY_HI = 96; // the 200A's 64 keys, A1–C7: the compass its reeds are graded on
constexpr int KEY_MIN = 21, KEY_MAX = 108; // what it plays with the full range open: the same reeds, continued
constexpr int MAX_MODES = 6;            // bending modes per reed
constexpr double EPS0 = 8.8541878128e-12;
// The slot every reed sits in (metres): reed tongue h × b, comb thickness t, comb teeth `tooth`
// wide, grounded frame ±H.
struct SlotGeom { double h, b, t, tooth, H; };
inline constexpr SlotGeom SLOT_GEOM = {0.5e-3, 2.4e-3, 0.8e-3, 10e-3, 6e-3};
struct Steel { double E, rho, eta; };
inline constexpr Steel STEEL = {2.0e11, 7850, 2e-4}; // spring steel; eta = internal loss factor
constexpr double SOLDER_RHO = 8400;                    // 60/40 tin–lead, kg/m³
struct Reed { double h, b; };
inline constexpr Reed REED = {SLOT_GEOM.h, SLOT_GEOM.b}; // tongue thickness and width (all keys)
// Pickup: the reed reaches ell into its slot; C0 = everything on the comb's node.
struct Pickup { double ell, C0; };
inline constexpr Pickup PICKUP = {3e-3, 200e-12};
constexpr double PREAMP_GAIN = 12; // first-stage voltage gain
// Losses (s⁻¹ per mode, unit modal mass): clamp mobilities Y_w, Y_θ and the damper felt.
struct Loss { double Yw, Ytheta, damper; };
inline constexpr Loss LOSS = {1.0e-3, 3.2, 30};
// The grounded frame is an end stop at |y| = H − h/2: a stiff, lossless contact.
struct Stop { double y, K; };
inline constexpr Stop STOP = {SLOT_GEOM.H - SLOT_GEOM.h / 2, 1e6};
// Bare cantilever overtone ratios.
inline constexpr double BARE_RATIOS[6] = {1, 6.2669, 17.5475, 34.3861, 56.8426, 84.9126};
constexpr double HAMMER_VMAX = 2;
inline double hammerSpeed(double vel) { return HAMMER_VMAX * std::max(0.02, std::min(1.0, vel)); }

// ---- the reed: Euler–Bernoulli cantilever by Hermite finite elements ---------------------------

struct ReedFEM {
  double L = 0, h = 0, b = 0, EI = 0, mu = 0, m = 0, M = 0, J = 0;
  int nel = 0, nModes = 0, N = 0; // elements, modes, free degrees of freedom
  std::vector<double> omega, Gamma, Theta;
  std::vector<double> X; // N × nModes, row-major: each mode's degrees of freedom (unit modal mass)
  bool ok = false;
  double shape(int n, double x) const; // mode shape at x ∈ [0, L]
};
ReedFEM reedFEM(double L, double h = REED.h, double b = REED.b, double M = 0, double J = 0, int nel = 20, int nModes = 6);
// The first n roots λ of 1 + cos λ cosh λ + μλ (cos λ sinh λ − sin λ cosh λ) = 0.
std::vector<double> tipMassRoots(double muRatio, int n = 4);

double solderRatio(int m, double scale = 1);
struct Blob { double a, J; };
Blob blob(double M, double h);
struct TunedReed : ReedFEM { double f0 = 0, ratio = 0; Blob blb{}; };
// pitch: the keyboard's tuning's ratio for the key (forte/tuning.h): the reed is cut to keyFreq(m)·pitch
TunedReed tuneReed(int m, double solderScale = 1, int nModes = 6, double pitch = 1);

struct Hammer { double mass, K, p, alpha; };
Hammer hammerDefaults(int m);

// ---- one key -----------------------------------------------------------------------------------

struct Mode { int n; double f, ratio, bare, sigma, sigSteel, sigClamp, w, pk, dampW, Gamma, Theta; };
struct Info { int key; double f0, L, h, b, mReed, M, J, blobSide, ratio, xh, xd, xp; Hammer hammer; double kPick; };
// What the engine's voice takes (keyModel(…).voice; the page's noteData). Fixed
// size: the audio thread copies it without allocating.
struct VoiceData {
  uint64_t version = 0;
  int key = 0, n = 0;
  std::array<double, MAX_MODES> freq{}, sigma{}, w{}, pk{}, dampW{};
  Hammer hammer{};
};
struct KeyModel {
  int key = 0;
  Info info{};
  TunedReed reed;
  std::vector<Mode> modes;
  VoiceData voice;
};
// Everything key m needs, for solder, strike and hardness as the knobs are, at the engine's rate fs,
// in the keyboard's tuning.
KeyModel keyModel(int m, double solder, double strike, double hardness, double fs = 48000, const Tuning &tuning = Tuning());
// The identity of the reeds for these knobs at that rate in that tuning: their values (and the
// tuning's ratios, unless all 1), hashed below 2⁵² (so it rides in a double).
uint64_t reedVersion(double solder, double strike, double hardness, double fs, const Tuning &tuning = Tuning());
// voice data packed into doubles (version, key, n, the hammer's mass, K, p, alpha, then freq,
// sigma, w, pk, dampW): what the page's WebAssembly model sends with a note
int packVoiceData(const VoiceData &d, double *out);
bool unpackVoiceData(const double *in, int n, VoiceData &d);

// ---- the pickup --------------------------------------------------------------------------------

// C(y) in farads on the table's y grid for a gap (mm), into c (SLOT_Y.n values).
void fillCap(double *c, double gapMM);
// C, dC/dy and d²C/dy² at height y (m) by Catmull–Rom on such a table.
struct CapAt { double C, dC, d2C; };
CapAt capAt(const double *c, double y);
// The comb's node: a first-order high-pass of the capacitance swing, τ = R C0.
struct Node { double R, tau, fc, gain; };
Node pickupNode(double rbias, double bias);
// The field's pull as a spring at the slot, k_E = −½V²C″(y₀), and the pitch shift it makes.
struct Shift { double kE, cents; };
Shift electrostaticShift(double kPick, double gap, double offset, double bias);

} // namespace forte::reeds
