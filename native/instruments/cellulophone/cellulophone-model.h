// cellulophone-model.h — the physics of Pierre Toulon's Cellulophone (US patent 1,948,996, filed
// 1928): a lamp's beam chopped by a turning disc of slots and shaped by a screen, read by a photocell.
//
//   the discs: one an octave, all geared to one motor at exact 2 : 1 steps. Each carries twelve
//   concentric rings of equidistant slots, one a semitone, the ring for C with N₀ slots and the
//   others in proportion, rounded to whole slots: f = N · Ω, so each note is off by the rounding.
//   the window: in front of each ring, a fixed window one slot pitch wide holding a screen whose
//   transparency across the window is one period of the wave, T(x), 0 ≤ T ≤ 1. A slot of width a
//   (a fraction of the slot pitch) crossing it lets through ∫ T over the slot: the light is
//   a · (T ⊛ box_a)(x), every harmonic n of T weighted by sinc(n a) = sin(π n a) / (π n a).
//   the key: pushing it back slides a second screen into the window, a narrowing slit s(x) centred
//   on T's clearest point; stacked screens multiply, T · (1 − p (1 − s)).
#pragma once

#include <array>
#include <cstdint>

namespace forte::cellulophone {

constexpr int RINGS = 12;                 // one disc: the twelve semitones of an octave
constexpr int OCTAVES = 9;                // discs for A0–B0 (octave 0) up to C8 (octave 8)
constexpr int SCREENS = 7;                // the window screens (below); 'octaves' maps octaves onto them
constexpr int SCREEN_HARMONICS = 16;      // the recipes' harmonics
constexpr int H_MAX = 32;                 // the most harmonics a table holds (the recipe times the slit)
constexpr int TABLE = 1024;               // samples a period
constexpr int MIPS = 6;                   // tables of 32, 16, 8, 4, 2, 1 harmonics
constexpr double SLIT_POWER = 8;          // the push screen's slit: ((1 + cos 2πx) / 2)⁸
constexpr int DISC_C[3] = {54, 216, 864}; // slots on the C ring: Toulon's (54), and two finer discs

// The screens: harmonic amplitudes of each recipe, drawn at full contrast on the window with Schroeder's
// phases, the window as much taller as the drawing is weaker than the sine's (so the stops match).
enum Screen : int { sine, flute, clarinet, oboe, horn, violin, voix };
extern const double RECIPES[SCREENS][SCREEN_HARMONICS];
// With 'A screen for each octave' (Rhea): the screen octave o's disc carries.
extern const int OCTAVE_SCREEN[OCTAVES];

// Whole slots on the ring of pitch class pc: N₀ times its ratio to C in the tuning, rounded.
// ratio[12]: each pitch class's frequency over C's, within the octave (1 for C).
int ringSlots(int pc, int c0, const double *ratio);
// The note of a key, from the tuned targets of its octave (keyTarget[128], Hz) and the C ring's slots:
//   the motor turns the octave-4 disc so that A4's ring sounds A4's target exactly;
//   octave o's disc turns 2^(o−4) as fast; the key sounds slots × turns a second.
struct Note { int slots = 0, octave = 0, pc = 0; double turns = 0, f = 0, ideal = 0, cents = 0; };
Note keyNote(int key, int c0, const double *keyTarget);
// A key's disc: its octave, 0 for A0–B0 up to 8 for C8.
inline int octaveOf(int key) { return key / 12 - 1; }

// The window screen T(x) over one slot pitch, as Fourier coefficients c[n] = (re, im), n = 0..H_MAX:
// T(x) = Re Σ c_n e^{2πinx}, with c₀ the mean transmission (times the window's height). withSlit: T
// times the push screen's slit.
struct Spectrum { double re[H_MAX + 1] = {}, im[H_MAX + 1] = {}; };
Spectrum screenSpectrum(int screen, bool withSlit);
// The slot's sinc: harmonic n of the light is a · sinc(n a) times the screen's (a: slot width / pitch).
double slotGain(int n, double a);
// The light through the window at x (a fraction of the slot pitch) for push p and slot width a.
double light(int screen, double p, double a, double x);

// The selenium cell's steady response, L^γ (Toulon ruled selenium out: it is slow, and not in proportion).
constexpr double SELENIUM_GAMMA = 0.6;
constexpr double SELENIUM_FAST = 0.0008, SELENIUM_SLOW = 0.03, SELENIUM_SLOW_SHARE = 0.4; // s, s, of the response
// The lamp's flicker on AC mains: the filament's light ripples at twice the mains frequency, by this
// fraction of its mean (its heat capacity smooths it, so 60 Hz flickers a little less).
double flicker(int mainsHz);

// A slot's cutting error: unit Gaussian numbers, fixed for each disc (octave), ring and slot.
double slotNoise(int octave, int ring, int slot, int which);
// Where each ring's first slot sits on its disc (turns), fixed when the disc was cut.
double ringPhase(int octave, int ring);

} // namespace forte::cellulophone
