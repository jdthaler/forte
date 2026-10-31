// hurdygurdy-model.h — the physics of the hurdy-gurdy (a French vielle à roue in G/C).
//
// A rosined wheel, 15 cm across, turned by a crank, bows six gut strings at a distance d_w from
// the bridge: two chanterelles in unison (G4), which the keys' tangents stop, and four drones,
// switched on and off: the trompette (D4 or C4), the mouche (G3), the petit bourdon (C3) and the
// gros bourdon (G2). Each string is a lossy waveguide of wave impedance Z₀ = μc, gripped by the
// wheel through the Viola Organista's friction (bowed-model.h: the hyperbolic curve
//   μ(Δv) = μd + (μs − μd) v₀ / (v₀ + |Δv|)
// with rosin's short thermal lag), the force it takes set by the string's height over the wheel.
// A tangent stops a chanterelle at L_k = L·f_open/f_k from the bridge, so the wheel, d_w from
// the bridge, sits at β = d_w/L_k: further along the string the higher the note.
//
// The trompette crosses the chien, a loose bridge whose foot rests on the soundboard: an impacting
// oscillator. The wheel's drag pulls the string, and the string pulls the chien's top along with
// the wheel against the tirant, a cord that presses the foot down with force F_t:
//   m ÿ = F_s(t) − F_t + F_c(y, ẏ),   F_c = k(−y) + c(−ẏ) for y < 0 (≥ 0), else 0
// (y > 0: the foot lifted). In Helmholtz motion F_s is a sawtooth of peak-to-peak 2Z₀v_B/β about
// the mean drag, so the chien lifts once a period when the wheel turns fast enough, and falls back
// onto the board: the buzz. The board hears F_c.
//
// The soundboard is a simply supported orthotropic spruce plate (32 × 24 cm), its modes heard by
// two microphones through baffled-plate radiation (Wallace 1972), driven at the bridge and at the
// chien's foot; its average point admittance Y∞ = 1/(8√(ρh)(D_x D_y)^¼) (Cremer & Heckl) is the
// bridge's resistance.
//
// Units: SI throughout.
#pragma once

#include <array>
#include <cstdint>
#include <cmath>
#include <numbers>
#include <vector>

#include "bowed-model.h" // the Viola Organista's friction, loss filters and plate (forte::bowed)
#include "forte/fdlibm.h"
#include "forte/tuning.h"

namespace forte::hurdygurdy {

using bowed::keyFreq; // V8's pow (fdlibm.h)
constexpr double PI = std::numbers::pi;

constexpr int KEY_OPEN = 67, KEY_TOP = 91;  // G4, the open chanterelles; G6, the 24th tangent
constexpr double WHEEL_D = 0.15;            // m: the wheel's diameter
inline double wheelSpeed(double turns) { return PI * WHEEL_D * turns; } // surface speed, m/s

// ---- the strings ------------------------------------------------------------------------------
enum StringId : int { CH1 = 0, CH2, TROMP, MOUCHE, PETIT, GROS, NSTR };
constexpr const char *STRING_NAMES[NSTR] = {"chanterelle", "chanterelle", "trompette", "mouche", "petit bourdon", "gros bourdon"};
// Each string's note (the trompette's at D4; C4 when retuned), its length from the bridge to the
// nut (the chanterelles' open; the drones run on past the keybox), its mass per length (plain gut
// for the chanterelles and trompette, gut wound with metal for the others) and whether wound.
struct StringSpec { int key; double L, mu; bool wound; };
constexpr StringSpec SPEC[NSTR] = {
  {67, 0.33, 5.0e-4, false},  // chanterelle, gut ≈ 0.70 mm
  {67, 0.33, 5.0e-4, false},
  {62, 0.33, 1.13e-3, false}, // trompette, gut ≈ 1.05 mm
  {55, 0.36, 2.6e-3, true},   // mouche
  {48, 0.36, 5.5e-3, true},   // petit bourdon
  {43, 0.36, 9.5e-3, true},   // gros bourdon
};
constexpr double GUT_RHO = 1300; // kg/m³

// The parameters the model depends on (the descriptor's, by id).
struct Params {
  double crank = 1.2, coup = 0.6, uneven = 0.03, start = 0.15;
  int coups = 0;
  bool keep = false, on[NSTR] = {true, true, true, true, false, true};
  bool tromC = false;
  double unison = 1.5, pressure = 1, wheelPos = 0.028;
  double tirant = 2.7, chienMass = 0.0012, bounce = 0.35;
  double mus = 0.8, mud = 0.3, v0 = 0.1, memory = 0.02, grain = 0.008, losses = 1;
  double mobility = 1, boardEta = 0.025;
  forte::Tuning tuning;
};
Params paramsOf(const double *P);
const Params &defaults();
constexpr int COUPS[7] = {0, 1, 2, 3, 4, 6, 8}; // the select's choices, coups a turn

// A string as built: its note (tuned), the tension Mersenne's law gives it at that length and
// mass, its wave speed and impedance.
struct StringDesign { int id, key; double f, L, mu, T, c, Z0; bool wound; };
StringDesign stringDesign(int id, const Params &P);
inline int stringKey(int id, const Params &P) { return id == TROMP && P.tromC ? 60 : SPEC[id].key; }

// The string's own losses as a decay rate (s⁻¹) rising with frequency: gut's internal friction
// (the wound strings lossier) and the cotton wound on each string where it meets the wheel, which
// players add until the tone is clean. Without the cotton (× 0.2) the corner that runs round the
// string stays sharp, and the drones fall into slipping twice a period once the wheel is fast.
inline double stringSigma(double f, const Params &P, bool wound) {
  return P.losses * (3 + 12 * (wound ? 1.6 : 1) * fdlibm::pow(f / 1000, 2));
}

// Where a tangent stops a chanterelle for key k (its tuned frequency over the open string's):
// L_k = L_open f_open / f_k, each tangent turned a little (hurdygurdy-tuning.h) so that the bowed
// note, which runs flat of the free string, is in tune. Key ≤ KEY_OPEN: the open string.
double stopLength(int key, const Params &P);
// The tuning corrections (cents) the engine plays: the tangents (the open string, then each key)
// and the drones' pegs (the trompette in D4 and in C4, the mouche, the petit and the gros bourdon),
// from hurdygurdy-tuning.h; tools/hurdygurdy-tuning.mjs sets them while it measures.
extern double TANGENT_TUNE[KEY_TOP - KEY_OPEN + 1], DRONE_TUNE[5];

// ---- the soundboard -----------------------------------------------------------------------------
constexpr bowed::Board BOARD = {0.32, 0.24, 420 * 0.003, 60, 8};
// Where the board is driven, as fractions of a and b: the chanterelles' bridge in the middle, the
// chien's foot, and the drones' bridges out at the sides (the mouche and gros bourdon on the bass
// side, the petit bourdon on the treble side), where the low modes move little.
constexpr int NDRIVE = 4;
constexpr double DRIVE_XY[NDRIVE][2] = {{0.6, 0.5}, {0.70, 0.18}, {0.6, 0.95}, {0.6, 0.06}};
inline int driveOf(int id) { return id <= CH2 ? 0 : id == TROMP ? 1 : id == PETIT ? 3 : 2; }
double plateYinf();
inline double bridgeG(const Params &P) { return P.mobility * plateYinf(); }
// Each string's bridge: the chanterelles share the middle one, each drone has its own at the side
// (−1: the trompette, on the chien). Σ Z₀ of the strings on string id's bridge.
inline int bridgeOf(int id) { return id == TROMP ? -1 : id <= CH2 ? 0 : id - 2; }
constexpr int NBRIDGE = 4;
double zBridge(int id, const Params &P);
struct Mode { int m, n; double f, M, sigma, drive[NDRIVE], w[2][2]; }; // drive at DRIVE_XY; the mics' radiation
std::vector<Mode> boardModes(double fMax, double eta);

// ---- bowing -------------------------------------------------------------------------------------
bowed::Friction friction(const Params &P);
// The loop of one string at length Ls (stopped or open), its sample rate fs: the round trips on
// either side of the wheel and their loss filters, as the Viola Organista's (bowed-model.h).
struct Loop { double f0, Ls, beta, N0, Db, Dn, gb, pb, gn, pn, sigma1; };
Loop loopDesign(const StringDesign &s, double Ls, const Params &P, double fs);
// Schelleng (1973), as bowed::schelleng: the force between F_min and F_max bows Helmholtz motion.
struct Schelleng { double Fmax, Fmin; };
Schelleng schelleng(const StringDesign &s, const Loop &L, const Params &P, double vB);
// The force each string bears on the wheel: × pressure, half of Schelleng's maximum at the
// default speed for its highest note (for the chanterelles, G6, whose β is largest), and 0.4 of it
// for the three bass drones, so that they still speak cleanly as the crank slows.
double voiced(int id);
inline double wheelForce(int id, const Params &P) { return voiced(id) * P.pressure; }

// Each string's waveguide runs at os × the output rate: enough steps to resolve a slip at its
// highest note (bowed::oversample).
int oversample(int id, double fs);

// ---- the chien ----------------------------------------------------------------------------------
// Its foot on the board: a stiff contact (k), damped for the restitution e. The board only pushes,
// so the foot leaves it when the spring–dashpot's force k·x + c·ẋ falls to zero, before x does: the
// damping ratio ζ that gives e solves that (not the free oscillator's e = exp(−ζπ/√(1 − ζ²))).
constexpr double CHIEN_K = 1.5e6; // N/m
double contactZeta(double e);
// The crank speed at which the sawtooth's peak beats the tirant: Z₀v_B/β = F_t, with the mean drag
// (≈ the sliding friction's share on the bridge side) helping it.
double buzzThreshold(const Params &P); // turns/s
// One step of the chien (dt): its top driven by F − Z·ẏ (the string's force on it, 2Z·a − Z·ẏ for the
// wave a arriving from the wheel, the impedance taken implicitly), the tirant's F_t and the board.
// Sets the string's force Fs and the contact force on the board Fc (≥ 0); counts landings.
struct Chien { double y = 0, v = 0, Fs = 0, Fc = 0; int64_t hits = 0; bool up = false; };
void chienStep(Chien &c, double F, double Z, double Ft, double m, double zeta, double dt);

// ---- the crank ----------------------------------------------------------------------------------
// A coup's surge over a turn's fraction u of its slot (coups a turn N, at turns/s r): a sin² bump
// lasting 70 ms (at most 80 % of the slot).
double coupShape(double u, int N, double r);

} // namespace forte::hurdygurdy
