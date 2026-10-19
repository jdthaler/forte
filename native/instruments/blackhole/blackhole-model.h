// blackhole-model.h — from a key press to the gravitational waves of a ringing black hole.
//
// Each key is a Kerr black hole whose (2,2,0) quasinormal mode sounds the key's pitch; its other
// modes fall where general relativity puts them, read from the Leaver table (qnm-table.h,
// converted from blackhole/data/qnm-table.json) by the same cubic Hermite interpolation. A binary
// merger of mass ratio q excites them (Kamaretsos et al.'s fits), seen at an inclination ι
// through the spin-weighted spherical harmonics; an optional inspiral chirps into the merger.
// With V8's fdlibm for exp, log, pow, sin, cos and atan2, and V8's log10 and Math.hypot, so a
// key's voice is the same to the last bit in the WebAssembly and the plugins.
#pragma once

#include "forte/tuning.h"

namespace forte::blackhole {

constexpr double MSUN_S = 4.925490947e-6; // G M☉ / c³ in seconds
constexpr double MSUN_KM = 1.476625;      // G M☉ / c² in km
constexpr double TC_MAX = 2;              // longest inspiral (s)
constexpr int KEY_LO = 21, KEY_HI = 108;  // A0–C8: the keys it plays (and caches)
constexpr int MAX_MODES = 16;             // a voice's modes (keyVoice makes at most 12)

// Math.log10 and Math.hypot (two arguments) as V8 computes them
double log10(double x);
double hypot2(double a, double b);

double keyFreq(double m);
double spinFromU(double u);
double uFromSpin(double a);

// ---- the QNM table, interpolated ----
struct Omega { double re, im; };
// Mω of (l, m, n) at spin a (M = 1); false if the table has no such mode
bool omega(int l, int m, int n, double a, Omega &out);
// the table as the views draw it: its spins (u) and each mode's Re Mω and log(−Im Mω) per spin
int tableSize();                 // spins
int tableModes();                // modes
const double *tableU();
void tableMode(int i, int &l, int &m, int &n, const double *&re, const double *&lim);

// ₛY_lm(θ, φ = 0), real
double swsh(int s, int l, int m, double theta);

// ---- a key's voice: everything the engine needs for one key at the current settings ----
// The model's parameters (the descriptor's kind: 'model').
struct ModelParams {
  double spinU = 0, massRatio = 1.2, inclination = 30, t0 = 5, overtones = 1, retrograde = 0;
  bool inspiral = false;
  double inspiralOct = 1.5;
  forte::Tuning tuning; // the keyboard's (forte/tuning.h): the (2,2,0) mode sounds keyFreq × its ratio
  bool operator==(const ModelParams &) const = default;
};

struct Mode {
  int l = 0, m = 0, n = 0;
  double f = 0, gamma = 0, tau = 0, Q = 0, amp = 0;
  double cpr = 0, cpi = 0, cxr = 0, cxi = 0; // h₊ = Re(C₊ζ), h× = −Im(C×ζ)
};
// the leading-order (quadrupole) chirp into the merger
struct Chirp {
  double Mc = 0, fStart = 0, fIsco = 0, f220 = 0, tc = 0, cp = 0, cx = 0;
  double amp = 0, psi = 0, fPk = 0, tauB = 0, fadeT = 0;
};
struct Info { double key = 0, f0 = 0, a = 0, M = 0, Msun = 0, nu = 0, rPlusKm = 0, OmegaH = 0, hawkingK = 0; };
struct KeyVoice {
  int key = 0;
  int count = 0;
  Mode modes[MAX_MODES];
  bool hasChirp = false;
  Chirp chirp;
  Info info;
};

void keyVoice(int key, const ModelParams &P, double fs, KeyVoice &v);

// ---- the chirp's schedule in closed form (chirpSchedule, chirpAt, chirpAmp) ----
struct Schedule { double f1, t1, t2; };
Schedule chirpSchedule(const Chirp &ch);
struct ChirpPoint { double f, phi; };
ChirpPoint chirpAt(const Chirp &ch, const Schedule &s, double t);
double chirpAmp(const Chirp &ch, double f, double t);

// The note's strain, h₊ and h×, at n evenly spaced times (the page's plot); returns its duration.
double strainCurve(const KeyVoice &v, int n, float *hp, float *hx);

} // namespace forte::blackhole
