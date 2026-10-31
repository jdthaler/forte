// resonator-model.h — the physics of the Magnetic Resonator Piano (Andrew McPherson, 2009–):
// a grand piano whose strings are kept ringing by an electromagnet over each note, driven from a
// single piezo pickup on the soundboard through a band-pass filter and a phase-locked loop.
//
// The strings: a concert grand's scale (the Ribbon Piano's design: lengths, gauges, copper
// winding, felt hammers), each key one, two or three steel strings, each string its stiff-string
// partials, mass-normalised,
//
//   ψ_n(x) = √(2/μL) sin(nπx/L),   f_n = n f₁ √((1 + B n²)/(1 + B)),   B = π³ E d⁴ / (64 T L²),
//
// tuned so that the first partial is the key's note. Each string ends on a bridge of mobility G (a
// resistance): the strings of a key share it, so its unisons couple and the sound is the bridge's
// velocity. The coil sits over the strings at x_a (from the front, the hammers' end) and pulls the
// string toward it, F = κ i² / g²: attraction only, so the amplifier adds a bias to the signal and
// never lets the current go negative. Units: SI.
#pragma once

#include <array>
#include <cmath>
#include <numbers>

namespace forte::resonator {

constexpr double PI = std::numbers::pi;
constexpr int KEY_LO = 21, KEY_HI = 108, NK = KEY_HI - KEY_LO + 1;
constexpr int MAX_PARTIALS = 32, MAX_UNI = 3;
constexpr double E_STEEL = 2.0e11, RHO_STEEL = 7850;
constexpr double BRIDGE_G = 3e-4;   // s/kg: the bridge's mobility (a resistance), the strings' main loss, from C4 up
constexpr double COIL_W = 0.021;    // m: the second MRP's coil, 0.82 in across (McPherson 2012)
constexpr double GAP_REF = 1.6e-3;  // m: the MRP's gap in the treble, 1/16 in (McPherson 2010)
constexpr double F_REF = 0.05;      // N: one coil's pull on its strings at 1 A across GAP_REF
constexpr double HAMMER_AT = 1.0 / 8; // the hammers strike an eighth of the way along

// The scale, as the Ribbon Piano's (piano-model.cpp): speaking length, core diameter and the copper
// winding's mass per length of key m.
double scaleLength(double m);
double scaleDiameter(double m);
double windingMass(double m);
int unisonsOf(int key); // 1 below G♯1, 2 below D3, 3 above

struct Hammer { double mass, K, p; };
Hammer pianoHammer(double m); // Chaigne & Askenfelt's, as the Ribbon Piano's

// Where the MRP's coil sits on key m's strings, as a fraction of the length from the front: about
// a fifth in the bass, a quarter at middle C, a third from C5 up (McPherson 2010).
double coilPlace(int key);
// The coil's gap on key m's strings, over the treble's: a bass string swings further, so its coil
// sits further off ("1/16 in the upper registers to 3/16 or more in the bass", McPherson 2010).
double gapScale(int key);
// The bridge's mobility under key m, over BRIDGE_G: half as much at the bass bridge (C2 and down),
// whose low notes see a stiffer, heavier soundboard.
double bridgeScale(int key);

// Partial n (1-based) at x (fraction of the length) under a coil of width w (fraction): sin(nπx)
// averaged over the coil, sin(nπx)·sinc(nπw/2).
double coilWeight(int n, double x, double w);

struct Partial {
  double f[MAX_UNI]; // Hz, each unison string's
  double sigma;      // 1/s: the losses of the string alone (the bridge's come from its coupling)
  double psiA, psiH; // the mass-normalised shape under the coil (averaged over it) and at the hammer
  double beta;       // the bridge's coupling: √G T ψ′(L) / ω (a mode's push on the bridge, per unit velocity)
};
struct Strings {
  int key = 0, nu = 1, n = 0, nuFull = 1; // unisons played (the Quality may drop one) and built
  double f1 = 0, L = 0, T = 0, mu = 0, d = 0, B = 0; // note (Hz), length, tension, mass per length, core, inharmonicity
  double xa = 0, xh = HAMMER_AT;                    // the coil's and the hammer's place (fractions)
  double gap = 1;                                   // the coil's gap, over the treble's
  double cents[MAX_UNI] = {0, 0, 0};               // each string's detune
  double G = BRIDGE_G;                              // the bridge's mobility under this key (s/kg)
  double sigmaBridge = 0;                           // the bridge's loss rate, G T / L (1/s)
  bool damper = true;                               // the top keys have none
  double reg = 1;                                   // the note's drive voicing: its signal current over middle C's (see regulation)
  Hammer hammer{};
  std::array<Partial, MAX_PARTIALS> p{};
  // partial h's frequency, the strings' mean (Hz)
  double partial(int h) const { return f1 * h * std::sqrt((1 + B * h * h) / (1 + B)); }
};
// The strings of one key for the parameters P (indexed as in resonator-params.h), their first
// partial on the key's note in the keyboard's tuning; up to `most` partials under fmax (and 0.45 fs).
Strings strings(int key, const double *P, double fs = 48000, int most = MAX_PARTIALS, double fmax = 8000, int maxUni = MAX_UNI);

// The drive's voicing: key m's signal current over middle C's. A light treble string swings
// further for the same pull than a heavy bass one, so the MRP's notes would be far from even; as a
// technician voices a piano's hammers, each note's current is set (by measurement, at the defaults:
// the pull goes as the current squared, so half the level's difference in dB) so the notes sound alike.
double voicing(int key);

// Which partials the loops drive for the Harmonic choice (its index): up to three.
struct Loops { int n = 1; int h[3] = {1, 0, 0}; };
Loops loopsOf(int choice);

// The drive's waveform: its harmonics' amplitudes, normalised to the power of a sine of unit peak, for brightness b: a falling 1/n^(2 − 1.6b), every harmonic or the odd ones.
constexpr int DRIVE_HARMONICS = 8;
void driveHarmonics(int wave, double bright, double *g); // wave as in resonator-params.h (sine, rich, odd, noise)

} // namespace forte::resonator
