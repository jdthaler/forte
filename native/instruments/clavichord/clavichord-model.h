// clavichord-model.h — the physics of a German clavichord of the 18th century. SI units throughout.
//
//   key ─▶ its brass tangent rises and strikes a pair of strings, and stays there: it is the nut
//          that sets the note's speaking length (tangent to bridge) and the hammer that sets the
//          string going, for as long as the finger holds the key down
//   the string beyond the tangent (to the hitchpin) runs through the listing, a strip of cloth
//          woven between the strings, which damps it; when the key lets go, the tangent drops and
//          the listing silences the whole string
//   pressure: the tangent lifts the string a millimetre or two above its rest line and so
//          stretches it; pressing harder raises the tension and the pitch (Bebung, the finger's vibrato)
//   fretting: on a fretted clavichord two neighbouring keys share a pair of strings, their tangents
//          a semitone apart along it; the key nearer the bridge wins
//   soundboard: a small, thin board on the right, under the bridge, as an orthotropic plate
//
// Coordinates along a string: X from the bridge (X = 0) to the hitchpin (X = l); the sounding
// tangent stands at X = L, its afterlength a = l − L. A string held by a tangent at height z is
//   y = z X/L + Σ qₙ sin(kₙX)                 on [0, L], kₙ = nπ/L     (the speaking length)
//   y = z (1 − s/a) + Σ pₘ sin(κₘ s), s = X − L   on [L, l], κₘ = mπ/a (the afterlength)
// and once the tangent has left it, y = Σ rⱼ sin(βⱼX), βⱼ = jπ/l (the open string).
#pragma once

#include <array>
#include <cmath>
#include <vector>

#include "clavichord-params.h"

namespace forte::clavichord {

constexpr int KEY_LO = 29, KEY_HI = 89;      // FF – f³, 61 keys: the compass the scale is drawn on
constexpr int KEY_MIN = 21, KEY_MAX = 108;   // with the full range open: the same scale carried on
constexpr int C2 = 72;                       // c² (Helmholtz) = C5, the scaling reference
constexpr double TAU = 6.283185307179586;
constexpr int N_MAX = 96;   // speaking partials per string at most
constexpr int M_AFTER = 8;  // afterlength partials per string
constexpr int J_OPEN = 32;  // open-string partials once the tangent has dropped
constexpr int CHOIRS = 3;   // two unison 8′ strings, and the 4′ in the bass
constexpr int OCTAVE_TOP = 52; // e (E3): the highest key with a 4′ string, when there are 4′s

// The model's parameters, in the page's units (its P).
struct Params {
  bool fretted = false, octave = false, board = true;
  double press = 0.5, bebung = 0, rate = 5, mass = 12, detune = 1.5, listing = 1, loss = 1, fmax = 10;
  Tuning tuning; // the keyboard's (forte/tuning.h): pitch standard and temperament
};
Params paramsOf(const double *P); // from the native parameters (indexed as in clavichord-params.h)

// ---- fretting: which keys share a pair of strings
// Double fretting with D and A free, as on most fretted clavichords of the 18th century: C–C♯,
// E♭–E, F–F♯, G–G♯ and B♭–B share their strings, D and A have their own. Unfretted: every key
// its own pair.
int courseOf(int key, bool fretted);              // the lowest key on the key's strings
int courseKeys(int course, bool fretted, int out[2]); // the keys on a course, low to high

// ---- the scale
struct Wire { const char *name; double E, rho, eta; };
inline const Wire IRON = {"iron", 2.0e11, 7850, 2.5e-4};
inline const Wire BRASS = {"brass", 1.0e11, 8500, 6e-4};
double keyPitch(int m, const Params &P);  // the key's pitch (Hz), in the keyboard's tuning
double scaleLength(int m);                 // the speaking length the scale gives key m
double afterLength(int m);                 // from that tangent to the hitchpin
bool isBrass(int m, int choir);
double wireDiameter(int m, int choir);
double jitter(double m, double s = 0);     // a tuner's small errors, in [0, 1)
double detuneCents(int m, int choir, const Params &P);
int choirsOf(int course, const Params &P); // 2, or 3 where there is a 4′ string
double tangentPoint(int key, const Params &P); // L: where the key's tangent meets its strings

// The pressing: the tangent comes to rest where the finger's force F balances the strings' pull,
// F = Σ T(z)·z·(1/L + 1/a), each string stretched by Δl = z²(1/L + 1/a)/2, so T(z) = T₀ + EA·Δl/l.
constexpr double PRESS_NOM = 0.8; // N: the touch the strings were tuned at (the slider's default)
constexpr double MASS_NOM = 0.012; // kg: and the key and finger they were tuned with (the default)

// One string of a course, as the tuner left it: in tune at its course's lowest key, at the
// nominal touch.
struct StringDesign {
  int course = 0, choir = 0;
  const Wire *mat = nullptr;
  double Lf = 1; // its speaking length over the 8′'s: the 4′ runs to a bridge of its own, half as far
  double l = 0, L = 0, a = 0, d = 0, A = 0, mu = 0, EI = 0, EA = 0;
  double T0 = 0;   // the tension with no key down
  double Tnom = 0; // at the nominal touch on the course's own key
  double hnom = 0; // the tangent's height then
  double f0 = 0, stress = 0, B = 0, c = 0, Z = 0;
};
StringDesign stringDesign(int course, int choir, const Params &P);
void designCourse(int course, const Params &P, StringDesign *out, int n); // all n of a course's strings
// The tangent's give: string c's partial n sounds this many times its rigid-nut frequency, with a
// key and finger of mass M and damping R on the tangent (the strings at their nominal tension).
double tangentShift(const StringDesign *S, int nStr, int c, double L, double M, double R, const Params &P, int n);
double stretchOf(double z, double L, double a); // Δl
double tensionAt(const StringDesign &S, double z, double L); // L: the 8′'s speaking length (the string's is Lf·L)
// The tangent's height at rest under force F on a course's strings (n of them) at L.
double restHeight(const StringDesign *S, int n, double L, double F);
// The frequency of partial n of a string at tension T over length L (stiff string).
inline double partialFreq(const StringDesign &S, double L, double T, int n) {
  const double k = n * 3.141592653589793 / L;
  return std::sqrt((T * k * k + S.EI * k * k * k * k) / S.mu) / TAU;
}
// Air (viscous drag with a boundary layer ∝ √f) and the wire's internal friction (s⁻¹).
double sigmaString(const StringDesign &S, double f, double loss);
// The listing's damping of a partial of wavenumber β on a stretch of string whose last w lies in
// the cloth (s⁻¹): σ∞·(1 − sin(2βw)/(2βw)), the share of the partial's energy in the cloth.
constexpr double SIG_LIST = 400;     // s⁻¹ at × 1, for partials short beside the cloth
double listingWidth(double after);   // how much of an afterlength the cloth covers
double listingSigma(double beta, double w, double listing);

// A set of partials: frequency, wavenumber, damping, and the bridge's share of the damping.
struct Modes {
  int N = 0;
  double len = 0, T = 0; // the stretch of string and the tension they were made at
  std::array<double, N_MAX> f{}, k{}, sigma{}, sigB{};
};
// The speaking length L at tension T: string losses plus the bridge's (from the board's
// admittance at the bridge), up to fmax or nmax.
void speakingModes(const StringDesign &S, double L, double T, const Params &P, double fs, int nmax, Modes &out);
// The afterlength l − L: string losses plus the listing's.
void afterModes(const StringDesign &S, double L, double T, const Params &P, int mmax, Modes &out);
// The open string, bridge to hitchpin: string, listing and bridge.
void openModes(const StringDesign &S, double T, const Params &P, double fs, int jmax, Modes &out);

// ---- the soundboard: a thin spruce plate, simply supported, driven along the bridge
namespace BOARD {
constexpr double a = 0.50, b = 0.26, rhoh = 1.0, aniso = 12, G0 = 0.012, eta = 0.03, mb = 0.003;
constexpr int maxModes = 48;
} // namespace BOARD
constexpr int NSEG = 3; // points along the bridge that drive the board: bass end, middle, treble end
inline double keyT(double m) { return std::min(1.0, std::max(0.0, (m - KEY_LO) / double(KEY_HI - KEY_LO))); }
std::array<double, 2> bridgePoint(double m);
std::array<double, NSEG> segmentWeights(int m);
inline constexpr double MICS[2][2] = {{0.3, 0.3}, {0.7, 0.7}}; // (x/a, y/b)
struct BoardModel {
  int K = 0;
  std::vector<double> f, sigma, phi, mic; // phi[k·NSEG + s], mic[2k + j]
  std::vector<int> mm, nn;
  double Dx = 0, Dy = 0, Ginf = 0, fTop = 0, N0 = 0;
  double shape(int k, double x, double y) const;
};
const BoardModel &boardModel();
// Driving-point admittance (s/kg) at (x, y): [Re, Im]; the modes' shapes there may be given.
std::array<double, 2> boardAdmittance(double x, double y, double f, const double *shapes = nullptr);

// ---- the action
namespace ACTION {
constexpr double damping = 1.5;   // N·s/m: the finger and the key's cloth, at the tangent
constexpr double bed = 4.5e-3;    // m: the key reaches its bed with the tangent this far up
constexpr double bedK = 3e4, bedR = 20; // the bed's cloth
constexpr double after = 1.5;     // full aftertouch presses this much harder (× the touch)
constexpr double bebung = 0.6;    // full Bebung swings the pressure by ± this share
constexpr double liftIn = 0.003;  // s: how soon the key rises at that speed
} // namespace ACTION
double tangentSpeed(double vel); // velocity 0..1 → the tangent's speed onto the strings (m/s)
double liftSpeed(double r);      // release velocity 0..1 → the speed the finger lets the key rise at (m/s)
constexpr double DEFAULT_RELEASE = 0.5;

// ---- moving a shape from one set of partials to another (a tangent arriving or leaving)
// ∫ sin(aX + φ) sin(bX + ψ) dX over [x0, x1], and ∫ (pX + r) sin(bX + ψ) dX.
double sinSin(double a, double phi, double b, double psi, double x0, double x1);
double linSin(double p, double r, double b, double psi, double x0, double x1);

} // namespace forte::clavichord
