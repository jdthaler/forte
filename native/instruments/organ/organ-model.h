// organ-model.h — the Hammond B-3 tone generator as numbers: the gear ratios and wheels, which
// wheel each drawbar of a key taps (with the foldbacks), the wheels' measured levels and the
// resistance wires that taper each key, the generator's filters, the pickup's waveform, the tables
// the engine plays from (buildGenerator), the analysis the page's table shows (keyAnalysis), and
// the Leslie cabinet's geometry. Powers and logarithms go through V8's fdlibm (forte/fdlibm.h), so every
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

// Wheel tapped by drawbar d of a key (MIDI note), with the B-3's foldbacks: the top drawbars fold
// back an octave once they run out of wheels, and the 16' plays the bottom octave of the manual an
// octave up, because wheels 1–12 belong to the pedals. Below the manual the same rule carries on:
// the 16' folds up for every key under C2, and every drawbar for the keys under C1. And the
// percussion's (the second or third harmonic).
int keyWheel(int key, int d);
int percWheel(int key, bool third);
double drawbarGain(int n); // ~3 dB per step

// The generator and its wiring (the 'levels' choice): the B-3's, as measured, or every wheel and
// contact alike.
enum Levels : int { b3, flat };

// A wheel's output in dB, through its filter, a busbar and the preamp, relative to wheel 37 (C4):
// measured key by key on a C-3 (the B-3's works), through each key's resistance wire.
double wheelLevelDb(int w);
// The resistance wire from contact d of a key to its busbar, in ohms: one of six gauges, as two
// C-3s' key-tapering charts give them (keys outside C2–C7 take the nearest key's). A busbar's
// voltage goes as 1/R; the levels are measured through WIRE_REF.
double wireOhms(int key, int d);
constexpr double WIRE_REF = 23.8;

// The generator's filters: wheels 1–43 are shunted by a resistance wire (no filter), 44–48 feed
// through a reactor (a first-order roll-off, corner REACTOR_CORNER × the wheel's frequency), and
// 49–91 through a capacitor and a transformer tuned to the wheel (a series resonance of Q FILTER_Q).
// drift is how far the capacitor has crept up (0.2 = +20 %), which tunes the resonance down.
// filterGain is |H| at ratio × the wheel's frequency, relative to the filter as built, at the
// wheel's own frequency.
constexpr double REACTOR_CORNER = 1.5, FILTER_Q = 3;
double filterGain(int w, double ratio, double drift);

// The pickup: a magnet ground to an edge, GAP from a wheel of diameter WHEEL_D whose rim rises and
// falls by relief × GAP once per tooth. The flux goes as 1/gap, and the field of a rim whose teeth
// are close together fades across the gap (as e^(−2π·GAP/λ), λ the tooth pitch), so the EMF, the
// flux's rate of change, is sin φ + h2 sin 2φ + h3 sin 3φ. pickupHarmonics gives h2 and h3.
constexpr double WHEEL_D = 0.0508, GAP = 0.25e-3;
void pickupHarmonics(int w, double relief, double &h2, double &h3);

// Everything the engine needs to know about the generator, from the 'gen' parameters and the
// sample rate (buildGenerator). Fixed size: rebuilding it allocates nothing.
// taper: each contact's conductance relative to WIRE_REF's (and the percussion's, which takes its
// tone through the 4' or 2⅔' wires).
struct Generator {
  double wheelHz[NW], level[NW], a2[NW], a3[NW], xtalk[NW], leak[NW];
  int16_t partner[NW];
  int16_t keyMap[NUM_KEYS * 9], perc2[NUM_KEYS], perc3[NUM_KEYS];
  double taper[NUM_KEYS * 9], perc2t[NUM_KEYS], perc3t[NUM_KEYS];
  double keyHz[NUM_KEYS];
  bool harmonic = false;
};
struct GenParams { int tuning = gears, levels = b3; double mains = 60, relief = 0.06, drift = 0, crosstalk = -48, leakage = -70; };
void buildGenerator(Generator &g, const GenParams &q, double fs);

// For the analysis table: the nine tones a key actually sounds vs. the ideal harmonic series of
// its 8' pitch, and each tone's level in dB (its wheel's, through its wire; 0 dB is wheel 37
// through WIRE_REF).
struct Analysis { int w; double actual, ideal, cents; bool folded; double db; };
void keyAnalysis(int key, int tuning, int levels, double mains, Analysis out[9]);

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
