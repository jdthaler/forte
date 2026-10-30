// clavicylinder-model.h — the physics of Chladni's clavicylinder (1800), as he built it and
// described it in his Beyträge zur praktischen Akustik (1821): a straight iron bar for every key,
// free at both ends and tied down with thread on cork at the two nodes of its lowest bending
// mode; the key lifts it against a turning glass cylinder, wet from a sponge, and the friction of
// a few strips of broadcloth on the glass keeps it ringing. Below E4 the cloth is tied over a
// short iron post riveted into the bar; above, over the bar's bent-up back end.
//
// Each bar is an Euler–Bernoulli beam, its modes the free–free beam's; the rubbed point moves
// along a line (the post's tip swings with the bar's slope as well as its height), and the
// friction acts along the one direction Chladni set it, the lowest mode's (his rule: every point
// of a sounding body swings round its nearest node, and must be rubbed that way).
#pragma once

#include <array>
#include <cmath>

namespace forte::clavicylinder {

// Free–free beam: cos(βL)·cosh(βL) = 1.
constexpr int MODES = 8;
constexpr std::array<double, MODES> BETA_L = {4.730041, 7.853205, 10.995608, 14.137165, 17.278760, 20.420352, 23.561945, 26.703538};
constexpr double NODE = 0.2241575; // the lowest mode's nodes, from either end (fraction of the length)

constexpr double E_IRON = 200e9;  // Pa: wrought iron
constexpr double RHO_IRON = 7700; // kg/m³
constexpr double WIDTH = 0.0098;  // m: ⅜ Rhenish inch (§13)
constexpr double CYL_R = 0.034;   // m: the glass cylinder's radius ("a little over 2½ Rhenish inches" across, §21)
constexpr double POST = 0.0262;   // m: the riveted post, about a Rhenish inch long (§64)
constexpr double POST_AT = 5.0 / 8; // the post's place, from the front end: ⅜ of the length from the back end (§65)
constexpr double ARM = 0.15;      // the treble bars' bent-up back end, as a fraction of the length (reconstruction)
constexpr int SPLIT = 64;         // E4: posts below, bent ends from here up (Chladni's border lay between b♭ and e′, §66)
constexpr double CORD_DAMP = 5.0; // N·s/m: each cord's thread on cork, as a dashpot on the bar
constexpr double TWIST = 0.006;   // m: the lever over which a cord passes the bar's twist to the key
constexpr double CORK = 0.15;     // the share of the bar's swing at a cord that the cork passes on

// Mode n's shape at x in [0, 1], normalised so that the free end is ±2 (mean square 1), and its
// slope dφ/dx (per unit x).
double modeShape(int n, double x);
double modeSlope(int n, double x);

struct BarMode {
  double f, sigma; // Hz, 1/s
  double c;        // the rubbed point's motion along the friction, per unit modal amplitude
  double cn;       // and across it, toward the glass (the knock of a struck key)
  double e;        // how much the mode moves the cords (and so the soundboard), per unit amplitude
};
struct Bar {
  int key = 0;
  double f1 = 0;            // the note (Hz)
  double fbar = 0;          // the free bar's lowest mode: a little sharp, for the cloth it carries (Hz)
  double L = 0, h = 0, m = 0; // length, thickness (m), mass (kg): every mode's modal mass
  bool post = false;        // rubbed on a post (else on the bent end)
  double xc = 0, arm = 0;   // where it is rubbed (fraction of the length) and the lever above the bar (m)
  double flever = 0;        // the lever's own lowest resonance, as a cantilever (Hz)
  double tx = 0, ty = 0;    // the friction's direction in the bar's plane (along, up)
  double xs = NODE;         // the front cord (the back one at 1 − xs)
  double meff = 0;          // the lowest mode's mass as the rubbed point feels it (kg)
  double reg = 1;           // the key's regulation: its force on the glass for a given touch, over middle C's
  double balance = 1;       // its sound's share on the bridge (bent ends more than posts, to sound alike)
  int count = 0;
  std::array<BarMode, MODES> modes{};
};
// The bar of one key, from the parameters (indexed as in clavicylinder-params.h): its length set
// so that its lowest mode is the key's note in the keyboard's tuning; modes up to 16 kHz (and
// under 0.45 fs).
Bar bar(int key, const double *P, double fs = 48000);

constexpr double H0 = 0.0023; // m: the bars' standard thickness, "about a line, or a little more"
// A bar's lowest mode as its rubbed point feels it, m/c₁², for thickness h (m).
double rubbedMass(int key, int build, double h);

// Broadcloth on wet glass: μ(u) = μd + Δμ/(1 + (u/v0)²) + βu, with μs = μd + Δμ.
struct Friction { double mud, dmu, v0, beta, noise; };
Friction friction(double wet, double grip, double L); // L: the bar's length (the size of its cloth)

// The cloth over the rubbed point: a pad of mass m on a shear spring k and damper (damping ratio
// ζ), between the glass and the bar.
struct Pad {
  double m, k, zeta;
  double c() const { return 2 * zeta * std::sqrt(k * m); }
};
Pad pad(double wet, int layers, double L);
int layersOf(const double *P, bool post); // the strips on a post, or on a bent end (one fewer)

} // namespace forte::clavicylinder
