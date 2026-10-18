// grand-model.h — the physics: an electric grand after the Yamaha CP-70, real piano strings and
// hammers on a cast frame, no soundboard, and a piezo under the bridge that senses the force the
// strings exert on it. SI units throughout.
//
// Each key is 1 to 3 stiff strings pinned at the agraffe and the bridge, each with two transverse
// polarisations, V (along the piezo's axis) and H. Partial n of a stiff string:
//   ωₙ² = (T kₙ² + EI kₙ⁴)/μ,   fₙ = n f₀ √(1 + B n²)/√(1 + B),   B = π² EI/(T L²)
// pushing on the bridge with F = Σ bₙ qₙ, bₙ = ±√(2/μL)(T kₙ + EI kₙ³). The bridge moves with
// velocity G·F: a rank-one damping shared by every mode of a polarisation (Weinreich's double
// decay). The acoustic alternative is a soundboard: a simply supported plate whose modes give the
// bridge its admittance Y(ω) and radiate to two far-field microphones (Rayleigh integral).
//
// The models allocate (vectors): they are built off the audio thread (forte/background.h), or in
// place without threads (WebAssembly).
#pragma once

#include <array>
#include <cmath>
#include <cstdint>
#include <numbers>
#include <vector>

namespace forte::grand {

constexpr int KEY_LO = 28, KEY_HI = 100; // the CP-70's 73 keys, E1–E7, which its scale and pan are drawn on
constexpr int KEY_MIN = 21, KEY_MAX = 108; // what it plays: the CP-80's 88, A0–C8, the scale carried on
struct Steel { double E, rho, strength; };
constexpr Steel STEEL = {2.0e11, 7850, 2.2e9};

// Per-note piezo sensitivity trim: up to +4.5 dB in the top octave and a half.
inline double pickupTrim(double m) { return std::pow(10.0, std::min(4.5, 0.3 * std::max(0.0, m - 76)) / 20); }
// Key velocity 0..1 → hammer speed, 0.25 … 6 m/s.
inline double hammerSpeed(double vel) { return 0.25 * std::pow(24.0, std::min(1.0, std::max(0.0, vel))); }

// The parameters the models depend on (the descriptor's, as the engine has them: a choice is its
// index). Defaults as in grand-params.js.
struct ModelParams {
  int scale = 0;      // 0 cp70, 1 concert
  int stringing = 0;  // 0 cp70, 1 grand, 2 single
  bool stretch = true;
  int mount = 0;      // 0 frame, 1 board
  double stiffness = 1, detune = 1.2, loss = 1, gFrame = 5e-5, boardH = 9, tilt = 6, hRatio = 0.2, kH = 1e7;
  double hardness = 1, strike = 0.12, maxFreq = 10000, hammerMass = 1;
};
ModelParams modelParams(const double *P); // from the engine's parameters (grand-params.h order)

// ---- scale design ------------------------------------------------------------------------------
double cpLength(double m);
double cpCore(double m);
constexpr double CP_WOUND_T = 500;
int stringCount(int m, int stringing);
double jitter(double m, double s = 0);

// The Grand Piano's scale and hammers (piano-model.cpp's), which the concert scale borrows.
double scaleLength(double m);
double scaleDiameter(double m);
double windingMass(double m);
struct HammerDefaults { double mass, K, p, width; };
HammerDefaults hammerDefaults(double m);

struct Scale {
  int key = 0;
  double f0 = 0, cents = 0, L = 0, d = 0, dOut = 0, mu = 0, muCore = 0;
  bool wound = false;
  double T = 0, EI = 0, B = 0, stress = 0, cT = 0;
};
Scale stringScale(int m, const ModelParams &P);
double stretchCents(int m, const ModelParams &P);
inline double octaveStretch(double B) { return 1200 * std::log2(std::sqrt(1 + 4 * B) / std::sqrt(1 + B)); }
double partialFreq(const Scale &S, int n);

// ---- the soundboard ------------------------------------------------------------------------------
struct BoardConst { double a, b, D, rhoh, eta, mb, fmax; int maxModes; double c, theta, ell; };
constexpr BoardConst BOARD = {1.3, 0.77, 1040, 6.7, 0.03, 0.05, 6000, 360, 343, 35, 0.5};
constexpr double MIC_TRIM = 0.75;
constexpr int SEGMENTS = 3;
inline int keySegment(int m) { return m < 52 ? 0 : m < 76 ? 1 : 2; }
std::array<double, 2> bridgePoint(int s);
std::array<double, 2> sinFT(double q, double kap, double a);

constexpr int RES_BANDS = 6, RES_PTS = 24;
constexpr double RES_STEP = 1.25;
extern const double RES_Q;
double bandPass(double f, double fc);
double highPass4(double f, double fc);

struct BoardModel {
  double boardH = 9, D = 0, rhoh = 0, fmax = BOARD.fmax;
  int K = 0;
  std::vector<double> omega, sigma, phi, RL, RR; // phi: K × SEGMENTS
  std::vector<int> m, n;
  double fRes = 0;
  std::array<double, RES_BANDS> resF{};
  std::array<double, RES_BANDS * 2 * SEGMENTS> res{};
  double Ginf = 0, mb = 0, fBridge = 0, f11 = 0, density = 0, fc = 0, micGain = 0;
};
// fmax and maxModes bound the modal band (the tests widen it to check the residual path against
// every mode).
BoardModel boardModel(double boardH, double fmax = BOARD.fmax, int maxModes = BOARD.maxModes);
std::array<double, 2> boardMobility(const BoardModel &B, int seg, double f);
double boardResponse(const BoardModel &B, int seg, double f, int mic);

// ---- one key -----------------------------------------------------------------------------------
struct Loss { double b1, b3; };
constexpr Loss LOSS = {0.35, 2.0e-9};

struct Partial {
  int n = 0;
  double k = 0, f = 0, w = 0, b = 0, sigInt = 0, GV = 0, GH = 0, bridgeV = 0, bridgeH = 0, fH = 0, phiH = 0, damp = 0, stretch = 0;
};
struct Hammer { double mass = 0, K = 0, p = 0, alpha = 0; };

// Strings × polarisations × partials, flattened: all V modes, then all H modes; within each,
// partial by partial (the unison strings of a partial side by side, lowest partial first).
struct KeyModel {
  int key = 0;
  Scale S;
  int ns = 1;
  std::array<double, 3> det{};
  std::vector<Partial> partials;
  int seg = 0;
  double beta = 0, xh = 0, wH = 0, xd = 0;
  Hammer hammer;
  bool hasDamper = false;
  int n = 0, nV = 0;
  std::vector<double> freq, sigma, w, c, bf, damp;
  std::vector<uint8_t> str;
  std::vector<uint16_t> idx;
};
KeyModel keyModel(int m, const ModelParams &P, const BoardModel *board = nullptr, double fs = 48000);

struct DecayRates { double prompt, after; };
DecayRates decayRates(const Partial &p, int ns);

} // namespace forte::grand
