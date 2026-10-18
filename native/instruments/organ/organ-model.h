// organ-model.h — the Hammond B-3 tone generator as numbers: the gear ratios and wheels, which
// wheel each drawbar of a key taps (with the foldback at the top), the tables the engine plays
// from (buildGenerator), the analysis the page's table shows (keyAnalysis), and the Leslie
// cabinet's geometry. Powers and logarithms go through V8's fdlibm (forte/fdlibm.h), so every
// table is the same to the last bit everywhere.
#pragma once

#include <cstdint>

namespace forte::organ {

constexpr int NUM_WHEELS = 91;
constexpr int NW = NUM_WHEELS + 1; // wheel arrays are 1-based
constexpr double SHAFT_RPS = 20;   // main shaft, 60 Hz mains
constexpr int KEY_LO = 36, KEY_HI = 96; // the B-3's 61-key manual, C2–C7 at 8'
// What it plays: every key of an 88-key keyboard, A0–C8. The 91 wheels (C1–F♯8) reach them all,
// folding back an octave where a drawbar runs off either end, as the B-3 folds its top.
constexpr int KEY_MIN = 21, KEY_MAX = 108;
constexpr int NUM_KEYS = KEY_MAX - KEY_MIN + 1;

// [driving, driven] teeth for C, C♯, … B
extern const int GEAR[12][2];
// each drawbar's offset in semitones from 8' and the harmonic it stands for
struct Drawbar { int offset; double harmonic; };
extern const Drawbar DRAWBARS[9];

// the tone generator's tunings (the 'tuning' choice)
enum Tuning : int { gears, et, harmonic };

struct WheelSpec { int w, pc, octave, teeth, driving, driven, shaftPc; };
WheelSpec wheelSpec(int w);

double etFreq(int w);   // 440 · 2^((w − 46)/12): wheel 46 = A4
double gearFreq(int w); // 20 rev/s × driving/driven × teeth
double centsOff(int w); // the gears against equal temperament

// Wheel tapped by drawbar d of a key (MIDI note), with the B-3's foldback (at the top, and below
// C1 for the keys under the manual); and the percussion's (the second or third harmonic).
int keyWheel(int key, int d);
int percWheel(int key, bool third);
double drawbarGain(int n); // ~3 dB per step

// Everything the engine needs to know about the generator, from the 'gen' parameters and the
// sample rate (buildGenerator). Fixed size: rebuilding it allocates nothing.
struct Generator {
  double wheelHz[NW], level[NW], a2[NW], a3[NW], xtalk[NW], leak[NW];
  int16_t partner[NW];
  int16_t keyMap[NUM_KEYS * 9], perc2[NUM_KEYS], perc3[NUM_KEYS];
  double keyHz[NUM_KEYS];
  bool harmonic = false;
};
void buildGenerator(Generator &g, int tuning, double mains, double wheelHarm, double crosstalk, double leakage, double fs);

// For the analysis table: the nine tones a key actually sounds vs. the ideal harmonic series of
// its 8' pitch.
struct Analysis { int w; double actual, ideal, cents; bool folded; };
void keyAnalysis(int key, int tuning, double mains, Analysis out[9]);

// The Leslie cabinet: rotor axis to rear wall; it grows if the horn is made longer, and the mics
// stay at least MIC_CLEAR outside it.
constexpr double CABINET = 0.32, MIC_CLEAR = 0.08;
struct Geometry { double wall, micDist; };
Geometry leslieGeometry(double hornRadius, double micDist);

// The seeded generator (Mulberry32) for the wheels' phases and the contacts
struct Rng {
  uint32_t a;
  explicit Rng(uint32_t seed) : a(seed) {}
  double operator()() {
    a += 0x6d2b79f5u;
    uint32_t t = a;
    t = (t ^ (t >> 15)) * (t | 1u);
    t ^= t + (t ^ (t >> 7)) * (t | 61u);
    return (double)(t ^ (t >> 14)) / 4294967296.0;
  }
};

} // namespace forte::organ
