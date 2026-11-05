// cimbalom-model.h — the physics of a concert cimbalom and a hammered dulcimer. SI units throughout.
//
//   hammer ─▶ a light stick in the player's loose hand, thrown at a course of unison strings: a mass
//          on a nonlinear spring (its cotton, leather or wood face: F = K δᵖ(1 + α δ̇), Hunt and
//          Crossley), free while it touches them, thrown back by the strings, often by the wave
//          that comes back from the near bridge (Hall 1986: a hammer light beside the string)
//   strings ─▶ each string's partials, stiff (fₙ = n f₁ √((1 + Bn²)/(1 + B))) and lossy (air, the
//          wire's friction); a course's strings a few cents apart (the tuner's spread)
//   bridge ─▶ every string of a course meets the bridge at one point and drives it; its motion, set
//          by the soundboard's admittance there, drives every string on it back (Weinreich 1977):
//          in step the strings drain into the bridge fast, out of step slowly, so a note decays in
//          two stages and beats
//   the hammered dulcimer's treble bridge divides each string in 2 : 3, so its two sides sound a
//          fifth apart: strike one, the other rings along through the bridge they share, loudest
//          where their partials meet (the struck side's 2nd and the far side's 3rd)
//   dampers ─▶ the cimbalom's felt bar, on every string unless the pedal lifts it (or, if chosen, a held key)
//   other notes ─▶ every undamped course rings along with the bridge (forte/sympathetic.h)
//   soundboard ─▶ an orthotropic plate's modes, driven along the bridge, to two microphones
//
// Coordinates along a string: X from the bridge the hammer is nearer (X = 0) along its struck side
// (length L); the far side, where there is one, from the same bridge the other way (length L′).
#pragma once

#include <array>
#include <cmath>
#include <vector>

#include "cimbalom-params.h"

namespace forte::cimbalom {

constexpr int KEY_MIN = 21, KEY_MAX = 108; // all 88 keys
constexpr double TAU = 6.283185307179586;
constexpr int N_MAX = 48;   // struck-side partials per string at most
constexpr int N_FAR = 32;   // far-side partials per string at most
constexpr int STR_MAX = 4;  // strings per course at most
constexpr int SYM_MODES = 8; // each course's partials as a sympathetic string

// The compasses the scales are drawn on (past them the same scale carries on)
constexpr int CIMBALOM_LO = 33, CIMBALOM_HI = 93; // AA – a‴: the modern five-octave concert cimbalom
constexpr int DULCIMER_LO = 43, DULCIMER_HI = 86; // G2 – D6: a large hammered dulcimer
constexpr int DULCIMER_TREBLE = 62;               // D4: from here up the courses cross the treble bridge
constexpr int DULCIMER_LEFT = 74;                 // D5: from here up a key plays the left side (the fifth above)

// The model's parameters, in the page's units (its P).
struct Params {
  int build = build_::cimbalom, head = head_::cotton;
  double detune = 1, bridge = 1, loss = 1, mass = 3, stick = 800, strike = 0.12, roll = 0, sympathy = 0.5;
  int dampers = dampers_::keys;
  Tuning tuning;
};
Params paramsOf(const double *P); // from the native parameters (indexed as in cimbalom-params.h)

struct Wire { const char *name; double E, rho, eta; };
inline const Wire STEEL = {"steel", 2.0e11, 7850, 2e-4};
constexpr double WOUND_ETA = 9e-4; // a copper-wound string's internal friction (the winding rubs on the core)

double keyPitch(int key, const Params &P); // the key's pitch (Hz), in the keyboard's tuning

enum Side : int { whole = 0, right = 1, left = 2 }; // which side of the dulcimer's treble bridge the key plays

// One course: the strings a key strikes, as the builder made them and the tuner left them.
struct Course {
  int key = 0, strings = 2;
  bool wound = false;
  int side = whole;
  double L = 0, Lfar = 0; // the struck side's length; the far side's (0: none, the string is muted past the bridge)
  double f0 = 0, ffar = 0; // their fundamentals (the far side's from the bridge's division: pure, 3 : 2 or 2 : 3)
  double d = 0, mu = 0, T = 0, EI = 0, B = 0, Bfar = 0, Z = 0, stress = 0;
  double eta = 0;         // the wire's loss factor
  double place = 0;       // where the course meets the bridges along the board, 0 (bass) … 1 (treble)
};
Course courseOf(int key, const Params &P);
double speakingLength(int key, int build);  // the scale: the struck side's length
double wireDiameter(int key, int build);    // the core's diameter (the whole wire, if plain)
int stringsOf(int key, int build);
bool isWound(int key, int build);
double jitter(double m, double s = 0);      // a tuner's small errors, in [0, 1)
double detuneCents(int key, int string, int strings, const Params &P); // string's offset in its course

// The hammers: a face's contact law, and the speed a stroke throws the head at.
struct Face { double K, p, alpha; }; // F = K δᵖ (1 + α δ̇): N/mᵖ, and s/m
Face faceOf(int head);
double hammerSpeed(double vel); // velocity 0..1 → m/s

// A string's partials: frequency, wavenumber, its own damping (air, friction), the bridge's share
// of its damping (one string alone on the bridge), the hammer's weight ψ = √(2/μL)·sin(k x_h) and
// the force on the bridge per unit (mass-normalised) amplitude, β = √(2/μL)(T k + EI k³).
struct Partial { double f = 0, k = 0, sigma = 0, sigB = 0, psi = 0, beta = 0; };
// The struck side's (far = false) or the far side's partials of string `str` of a course, up to
// fmax or nmax; xh: the strike point (m from the bridge, struck side only).
int partials(const Course &C, int str, bool far, const Params &P, double xh, int nmax, double fmax, Partial *out);
double sigmaString(const Course &C, double f, double loss); // air (viscous, with a √f boundary layer) and the wire's friction
constexpr double SIGMA_DAMPER = 28; // s⁻¹: the felt bar on a string (T₆₀ ≈ 0.25 s)

// ---- the soundboard: an equivalent simply supported orthotropic plate, driven along the bridge
struct BoardSpec { double a, b, rhoh, aniso, G0, eta, mb; };
inline const BoardSpec BOARDS[2] = {
  {1.20, 0.60, 1.6, 12, 1.8e-3, 0.05, 0.030}, // the concert cimbalom's: big, braced, on a closed case
  {0.90, 0.42, 1.2, 10, 5.0e-3, 0.05, 0.020},  // the hammered dulcimer's: smaller and lighter, so the bridges move more
};
constexpr int BOARD_MODES = 48;
constexpr int NSEG = 3; // points along the bridges that drive the board: bass, middle, treble
struct BoardModel {
  int K = 0;
  BoardSpec spec{};
  std::vector<double> f, sigma, phi, mic; // phi[k·NSEG + s], mic[2k + j]
  std::vector<int> mm, nn;
  double Ginf = 0, fTop = 0, N0 = 0;
  double shape(int k, double x, double y) const;
};
const BoardModel &boardModel(int build);
std::array<double, 2> bridgePoint(double place, int build); // (x, y) on the board
std::array<double, NSEG> segmentWeights(double place);
inline constexpr double MICS[2][2] = {{0.3, 0.35}, {0.7, 0.6}}; // (x/a, y/b)
// Driving-point admittance (s/kg) at the course's bridge point: [Re, Im].
std::array<double, 2> boardAdmittance(int build, double place, double f);

} // namespace forte::cimbalom
