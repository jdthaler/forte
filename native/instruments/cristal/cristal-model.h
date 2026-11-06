// cristal-model.h — the physics: the cristal Baschet (Bernard and François Baschet, 1952), glass
// rods stroked by wet fingers, each clamped on a steel stem whose bending is the note.
//
// Each key is a resonator after Couineaux, Ablitzer and Gautier (2023, 2025): a threaded steel
// stem Ø 3.76 mm, held at both ends (its foot bolted to the collector, the heavy bar that carries
// the vibration to the radiators, its top to the frame), carrying the glass rod (243 × Ø 7.8 mm) and a tuning weight
// at a height h of its length. The finger slides along the rod, so friction pulls the rod along
// its axis, which bends the stem. The stem is Euler–Bernoulli beam elements; its modes come from
// the generalised eigenproblem K x = ω² M x, and its length is cut so that the mode the finger
// drives most is the note. The friction is Couineaux's fit to a wet finger on glass:
//   μ(Δv) = μd + (μs − μd)/(1 + |Δv|/V0),  μs = 2, μd = 0.3, V0 = 2 cm/s,
// and a mode starts to oscillate where the friction's fall outruns its damping:
//   F_N > 2 ζ ω m V0 (1 + u_f/V0)² / (μs − μd),
// with m the mode's mass at the rod and u_f the finger's speed. SI units. Nothing here allocates
// but stem(), which the engine runs off the audio thread.
#pragma once

#include <array>
#include <cmath>
#include <numbers>

namespace forte::cristal {

constexpr int KEY_LO = 36, KEY_HI = 84;  // C2–C6, the cristal's four octaves (Couineaux 2023: C1–C5, French names)
constexpr int KEY_MIN = 21, KEY_MAX = 108, NK = KEY_MAX - KEY_MIN + 1; // A0–C8, with the full range open
constexpr int MODES = 6;                 // modes kept a key (below 16 kHz, driven by the finger)

// The parts (Couineaux, Ablitzer and Gautier 2025, Table 1 and Fig. 2)
constexpr double E_STEEL = 2.2e11, RHO_STEEL = 7900;
constexpr double E_GLASS = 5.0e10, RHO_GLASS = 2400;
constexpr double STEM_D = 3.76e-3;               // the vibrating threaded stem
constexpr double ROD_L = 0.243, ROD_D = 7.8e-3;  // the glass rod
constexpr double ROD_M = RHO_GLASS * std::numbers::pi * ROD_D * ROD_D / 4 * ROD_L; // 27.9 g
constexpr double ROD_J = ROD_M * ROD_L * ROD_L / 12; // about its clamp, at its middle
constexpr double STROKE = 0.20;                  // m of the rod the finger travels in a stroke
// The collector every stem is bolted to: a heavy bar's mass on its mounts' spring (our estimate)
constexpr double COLLECTOR_M = 2, COLLECTOR_F = 20, COLLECTOR_ZETA = 0.02;
constexpr int ELEMENTS = 16;                     // beam elements along the stem

// The tuning weight on each stem's rod clamp: 40 g at C2, halving every octave up.
double tuningWeight(int key);

struct Mode {
  double f, zeta;  // Hz; damping ratio
  double tip;      // the mode's shape at the rod, along its axis (mass-normalised: 1/tip² is its mass there)
  double col;      // its pull on the collector: the force at the stem's foot per unit of the mode (N/(m·√kg))
};

// The modes of a stem of length len (m), the rod at height h (0..1) with the weight w (kg), and
// loss ζ; out, ascending, up to max; the count.
int stemModes(double len, double h, double w, double zeta, Mode *out, int max);

// The parameters a stem depends on (P.height, P.loss) and its key's tuning: the ratio of its pitch
// to equal temperament's at A = 440 Hz (forte/tuning.h), which its stem is cut to.
struct StemParams { double height = 0.5, loss = 9e-4, ratio = 1; };
// Everything the engine and the views need for one key.
struct Stem {
  int key = 0;
  double f0 = 0, len = 0, weight = 0, height = 0;
  int count = 0, main = 0; // modes kept; which is the note
  std::array<Mode, MODES> modes{};
};
Stem stem(int key, const StemParams &P);

// Friction of a wet finger on glass (Couineaux 2023, after Derler's measurements): the static and
// sliding coefficients, V0, and the fingerprint ridges' random part.
struct Friction { double mus, mud, v0, noise; };
Friction friction(double wet);
inline double mu(double u, const Friction &f) { return f.mud + (f.mus - f.mud) / (1 + std::fabs(u) / f.v0); }

// The normal force (N) at which steady sliding at speed uf destabilises mode m: the friction's
// negative damping N (μs − μd) / (V0 (1 + uf/V0)²) equal to the mode's own, 2 ζ ω m.
double threshold(const Mode &m, double uf, const Friction &f);
// The lowest over a stem's modes (infinity if none can go).
double speakingThreshold(const Stem &s, double uf, const Friction &f);
// Key regulation: each key's threshold for a wet finger at the reference speed and the default
// build, which the finger's force is a multiple of (scaled by (1 + u/V0)² to its speed).
constexpr double U_REF = 0.1;
double regulation(int key);

// The upper bound of the stick–slip regime for one mode (Gautier et al. 2010, after Schelleng):
// F_max = π u √(k m) / (2 (μs − μd)), k = m ω².
double maxForce(const Mode &m, double uf, const Friction &f);

// The whiskers: steel wires Ø 1 mm clamped at one end in the collector, 0.6–1.5 m.
constexpr int WHISKERS = 24;
constexpr double WHISKER_D = 1e-3, WHISKER_ETA = 1e-3;
double whiskerLength(int i);
inline double cSteel() { return std::sqrt(E_STEEL / RHO_STEEL); }
// clamped–free: its n-th stretching mode (n = 1, 2, …), (2n − 1) c / 4L, and its first bending mode
inline double whiskerStretch(int i, int n) { return (2 * n - 1) * cSteel() / (4 * whiskerLength(i)); }
double whiskerSway(int i);

} // namespace forte::cristal
