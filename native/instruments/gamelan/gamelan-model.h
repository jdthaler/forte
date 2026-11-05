// gamelan-model.h — the physics of a gamelan: bronze bars (thick, free–free Timoshenko beams that
// bend and twist), some over bamboo tubes, and bossed gongs (the measured modes of a small kettle
// gong and of a Balinese gong ageng, with the quadratic nonlinearity of a curved face), struck by
// mallets, in pélog and sléndro, and in Bali tuned in pairs a few hertz apart so that every note
// beats (ombak).
//
//   gangsa / slenthem          saron / demung / peking        bonang, kempul, gong ageng
//   ▬▬▬▬▬▬  bar on cords       ▬▬▬▬▬▬  bar on pegs              ╭──●──╮  boss on a curved face,
//   ║    ║  bamboo tube,       ╚════╝  wooden trough            │     │  deep rim
//   ╚════╝  closed below
//
// Everything here is arithmetic on fixed-size arrays: a key's design takes some microseconds, so
// the engine builds it where the key is struck.
#pragma once

#include <array>

namespace forte::gamelan {

constexpr int KEY_MIN = 21, KEY_MAX = 108, NKEYS = KEY_MAX - KEY_MIN + 1;

// The instruments a key can be (the Instrument choice, its first four options).
enum Family { gangsa = 0, saron = 1, bonang = 2, gong = 3 };
// What a key is: its family, which player's (the ensemble gives each octave its own: one player
// damps only their own instrument's notes), and the instrument's name.
struct Register { int family; int band; const char *name; };
Register registerOf(int key, int instrument);

// The laras (tuning). Pélog on the white keys as a subset of 9-tone equal temperament (steps of
// 1 1 2 1 1 1 2 ninths of an octave, the large ones after 3 and after 7); sléndro on the black
// keys as five equal steps of 240 ¢, with sléndro 6 on pélog 6. A key's cents from equal
// temperament (0 for laras = keyboard), and the gamelan's degree on it (1–7 pélog, 1–6 sléndro;
// negative for sléndro).
double larasCents(int key, int laras);
int larasDegree(int key, int laras);
// The note a key plays (Hz): equal temperament + the laras, times the keyboard's tuning.
double noteFreq(int key, const double *P);

// High-tin bronze (about 20 % tin, the gamelan smiths' alloy), approximately.
constexpr double kE = 105e9, kRho = 8600, kNu = 0.34;
constexpr double kG = kE / (2 * (1 + kNu));
constexpr double kKappa = (10 * (1 + kNu)) / (12 + 11 * kNu); // Cowper's shear coefficient, rectangle
constexpr double kCAir = 343.2;

// ---- bars ---------------------------------------------------------------------------------
constexpr int kBend = 6, kTors = 3;
// Huang's (1961) frequency determinant of a free–free Timoshenko beam, in his dimensionless
// b² = ρAω²L⁴/EI with r² = I/AL² (rotary inertia) and s² = EI/κAGL² (shear):
//   2 − 2 cosh(bα) cos(bβ) + b [b²r²(r² − s²)² + 3r² − s²] sinh(bα) sin(bβ) / √(1 − b²r²s²) = 0.
// Its roots are the bending frequencies; r = s = 0 gives Euler–Bernoulli's cos βL cosh βL = 1.
double huangDet(double b, double r, double s);
// The first n roots b (ω = b √(EI/ρA) / L²) for a rectangular bronze bar of thickness/length hL.
int timoshenkoRoots(double hL, int n, double *b);
// Euler–Bernoulli's free–free βₙL (cos βL cosh βL = 1) and mode n's shape at u in [0, 1]
// (±2 at the ends).
double betaL(int n);
double bendShape(int n, double u);
// Saint-Venant torsion of a w × h rectangle (w ≥ h): the torsion constant (Roark) and the polar
// moment of the section; torsion mode n's frequency on a bar L long.
double torsionK(double w, double h);
double torsionFreq(double L, double w, double h, int n);

// A bar: its thickness from the family (a gangsa's 7 mm, a saron's 12 mm, × thick), its length cut
// so its first bending mode is the note, its width grown with the length as the measured bars of a
// Balinese gamelan's (6.4 cm at 17 cm, 9.3 cm at 40 cm: Jones, Gee and Grimshaw 2010).
struct Bar { double L, w, h; };
Bar barFor(int family, double f1, double thick);

// The tube under a gangsa's bar: a bamboo pipe closed at the bottom, a quarter wave at fT, of radius
// a (from the bar's width); its losses are radiation from the open end, f (ka)², and the viscous
// and thermal boundary layer along its wall.
struct Tube { double f, sigma, a; };
Tube tubeFor(const Bar &bar, double fT);

// ---- gongs --------------------------------------------------------------------------------
// The measured modes, as ratios to the note's (the round mode the boss moves): order m (nodal
// diameters, 0 = round) and kind.
enum ModeKind { bend = 0, torsion = 1, round = 2, diameters = 3, rim = 4, air = 5 };
struct GongMode { double ratio; int m; int kind; };
// A small kettle gong's (Perrin et al. 2014, a 20.7 cm gong: (0,1) at 458 Hz, ESPI): the rim modes
// (2,0) and (3,0), the split pairs (1,1)–(6,1), and (0,2). Index 0 is the note.
constexpr int kBonangModes = 16;
extern const GongMode BONANG[kBonangModes];
constexpr int kBonangRound2 = 7; // (0,2), 2.80
// A Balinese gong ageng wadon's (Krueger, Gee and Grimshaw 2010: 61.75, 92.0, 101.75, 121.25,
// 150.25, 153.25, 160.0, 162.5, 236.0 Hz). The second round mode (121.25) is set by gongBeat.
constexpr int kGongModes = 9;
extern const GongMode GONG[kGongModes];
constexpr int kGongRound2 = 3;
constexpr double kGongF1 = 61.75;

// The face's quadratic nonlinearity (a curved shell pushes back harder one way): with u = ω₁·y,
//   V = G u₁² u₂ (+ Γ u₁⁴, so V stays bounded), forces −ω₁(2G u₁u₂ + Γu₁³) on the note and −ω₁G u₁²
// on the second round mode. G = kCurve × curvature.
constexpr double kCurve = 0.07, kHarden = 0.01;

// ---- a key ---------------------------------------------------------------------------------
constexpr int kModes = 16;
struct Mode {
  double f, sigma; // Hz, 1/s
  double amp;      // modal velocity per unit stroke (at velocity 1)
  double out;      // how well it radiates
  int kind, order; // ModeKind; its number (bending/torsion n, or m)
};
struct KeyDesign {
  Register reg;
  double f1;       // the note (Hz)
  std::array<Mode, kModes> m{};
  int count = 0;
  bool hasTube = false; Tube tube{}; double tubeK = 0, tubeOut = 0; // the tube and its coupling (rad/s)
  int round2 = -1; double G = 0, Gamma = 0; // the gongs' nonlinear pair: m[0] and m[round2]
  Bar bar{};
  double tau = 0;  // the mallet's contact (s)
  bool pairs = false; // a family tuned in pairs (bars and the bonang)
};
// The mallet's contact time (s) at the note f and velocity v: the family's at C4 × softness, ∝ v^(−1/5)
// (Hertz) and ∝ f^(−1/2) (a bar's or a kettle's stiffness), or ∝ 1/f for the hanging gongs (each size
// of gong with a beater to match).
double contactTime(int family, double softness, double f, double v);
// Force spectrum magnitude of a half-sine pulse of length tau, relative to DC.
double pulseSpectrum(double f, double tau);
// The note's ring time (s) for a family at f, from t60 at C4: ∝ 1/√f.
double ringTime(int family, double t60C4, double f);
// A key's design for the parameters P (as in gamelan-params.h), struck at velocity v, around f1
// (the note, or a pair's partner).
KeyDesign keyDesign(int key, const double *P, double v, double f1);
inline KeyDesign keyDesign(int key, const double *P, double v = 0.7) { return keyDesign(key, P, v, noteFreq(key, P)); }

} // namespace forte::gamelan
