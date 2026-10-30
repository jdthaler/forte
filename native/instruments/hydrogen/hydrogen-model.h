// hydrogen-model.h — the physics: a hydrogen atom's levels nl up to n = NMAX, the lines between
// them, and how a gas of such atoms glows. Everything is exact non-relativistic hydrogen except
// where noted (fine structure by Dirac's formula, Stark widths by the Holtsmark field):
//
//  * the lines: the Rydberg formula with the reduced mass, every n → m;
//  * their strengths: Einstein A coefficients for every nl → mk (k = l ± 1) from the exact radial
//    integrals ⟨mk|r|nl⟩ (the radial functions are polynomials times e^(−r/n), so Gauss–Laguerre
//    quadrature of the right order integrates them exactly);
//  * the cascade: the populations Nₙₗ obey dN/dt = p + Σ A N(above) − Γ N, which only feeds
//    downward, so it is solved from the top level down;
//  * the excitation p: electron impact from 1s into the np levels (van Regemorter's rate with the
//    exact oscillator strengths), recombination into every nl (hydrogen-recombination.h, made by
//    tools/hydrogen-native-table.mjs from numerical Coulomb functions), or a laser into one np.
#pragma once

#include <array>
#include <cmath>
#include <cstdint>
#include <vector>

namespace forte::hydrogen {

constexpr int NMAX = 50;                          // the levels kept: n = 1 … NMAX, every l
constexpr int STATES = NMAX * (NMAX + 1) / 2;
constexpr int LINES = NMAX * (NMAX - 1) / 2;      // every n → m < n
constexpr int stateOf(int n, int l) { return n * (n - 1) / 2 + l; }
constexpr int lineOf(int n, int m) { return (n - 1) * (n - 2) / 2 + (m - 1); }
struct Level { int n, l; };
Level levelOf(int state);
struct Pair { int n, m; };
Pair lineLevels(int line);

// CODATA 2018, and the few numbers of atomic physics the model takes as given
constexpr double ALPHA = 7.2973525693e-3;            // the fine-structure constant
constexpr double MU = 1 / (1 + 1 / 1836.15267343);   // the reduced mass, in electron masses
constexpr double RYDBERG_HZ = 3.2898419602508e15;    // R∞ c
constexpr double C_LIGHT = 299792458;                // m/s
constexpr double AU_TIME = 2.4188843265857e-17;      // s
constexpr double A0_CM = 0.529177210903e-8;          // the Bohr radius, cm
constexpr double KB_HARTREE = 3.166811563e-6;        // Boltzmann's constant, hartree/K
constexpr double MH_C2 = 938.783e6 / 27.211386245988; // the hydrogen atom's rest energy, hartree
constexpr double A_2S = 8.2291;                      // 2s → 1s by two photons, s⁻¹ (Drake 1986)
constexpr double HALPHA = 5.0 / 36;                  // Hα in Rydbergs: the key's note
constexpr double STARK = 4.25;                       // Stark FWHM / (F₀ e a₀ [n(n−1) + m(m−1)]): see starkWidth

// The line n → m: its frequency (Hz), vacuum wavelength (nm), and frequency over Hα's.
double lineHz(int n, int m);
double wavelengthNm(int n, int m);
inline double ratio(int n, int m) { return (1.0 / (m * m) - 1.0 / (n * n)) / HALPHA; }

// ⟨mk|r|nl⟩ (Bohr radii, infinite nuclear mass), Einstein's A for nl → mk (s⁻¹), and the
// absorption oscillator strength f(1s → np).
double radial(int n, int l, int m, int k);
double einsteinA(int n, int l, int m, int k);
double oscillator1s(int n);
// The recombination coefficient into nl at electron temperature T (cm³ s⁻¹; T from 10³ to 10⁵ K).
double recombination(int n, int l, double T);
// Wigner's 6-j symbol, its arguments doubled ({j1 j2 j3; j4 j5 j6} with 2j each).
double sixj(int a, int b, int c, int d, int e, int f);
// The level n, j by Dirac's formula with α × alphaScale, over the Bohr level (hartree × reduced mass).
double diracShift(int n, double j, double alphaScale);
// A line's Stark width (FWHM) in a plasma of ion density N (cm⁻³), as a share of its frequency.
double starkWidth(int n, int m, double N);
// The thermal Doppler width (FWHM) at temperature T, as a share of a line's frequency.
double dopplerWidth(double T);

// The atom: every allowed nl → mk with its A and its line's energy (Rydbergs), grouped by the
// level it feeds, and each level's total decay rate, with every line (Case A) and without the
// Lyman lines (Case B).
struct Transition { uint16_t from, to, line; uint8_t n, l, m, k; double A, e; };
struct Atom {
  std::vector<Transition> tr;           // grouped by `to`, highest first
  std::vector<int> into;                // tr[into[i] … into[i+1]) feed state i
  std::vector<int> byLine, lineStart;   // the transitions of line k: byLine[lineStart[k] … lineStart[k+1])
  std::array<double, STATES> gamma{}, gammaB{};
};
const Atom &atom();

// How the gas glows (from the parameters, hydrogen-params.h).
enum class Excitation : int { discharge = 0, recombination = 1, laser = 2 };
struct Lamp {
  Excitation excitation = Excitation::discharge;
  double T = 2e4;     // K
  int laserN = 5;
  bool caseB = false;
  double glow = 6e-8; // s: every level drains at least at 1/glow
  bool operator==(const Lamp &) const = default;
};
Lamp lampOf(const double *P);
// Its excitation into each state (any units: the sound is normalised), and every state's total
// rate out (s⁻¹).
void pump(const Lamp &lamp, double *p);
void drain(const Lamp &lamp, double *gamma);
// The steady glow: the populations while the key is held long, and each line's power from them
// (energy a second, in Rydbergs × s⁻¹ per unit pump; Case B's Lyman lines are 0).
void steady(const Lamp &lamp, double *N);
void linePowers(const Lamp &lamp, const double *N, double *L);
// A line's fine-structure components nlj → mkj′, grouped by (j, j′) since Dirac's levels depend on
// n and j alone: their share of the line's power from the populations N (each nl shared among its
// j by statistical weight, each nlj's rate to mkj′ by the 6-j symbol) and their frequency over the
// Bohr Hα's at α × alphaScale. Returns the count (at most 3m).
struct Component { int tj, tk; double ratio, weight; }; // 2j, 2j′
int components(int line, const double *N, double alphaScale, Component *out);
constexpr int MAX_COMPONENTS = 3 * NMAX;

// The glow's step response: the line powers a unit pump makes, switched on at t = 0, on a time
// grid that is fine where the fast levels fill and coarse where only the slow ones change
// (t_k = τ_s (e^(hk) − 1)), filled in as far as it is asked for. The engine's voices are this
// response, switched on and off: the cascade is linear, so one response serves every key.
class Glow {
 public:
  static constexpr int ROWS = 400;
  Glow();
  void build(const Lamp &lamp);           // the rates, the steady state and the kept lines; no rows yet
  void reset() { built = false; }
  bool ready() const { return built; }
  // rows up to time t (s, the atom's time), at most maxRows more of them; returns whether done
  bool ensure(double t, int maxRows = ROWS);
  bool complete() const { return computed == ROWS; }
  double powerAt(int kept, double t) const;
  // the same in two steps, for many lines at one time: the grid's (fractional) row at t, then a
  // line's power there
  double rowAt(double t) const { return t > 0 ? std::log1p(t / tauS) / h : -1; }
  double powerAtRow(int kept, double row) const;
  double popAt(int display, double t) const; // a state with n ≤ DISPLAY_N, for the page's diagram
  static constexpr int DISPLAY_N = 8;
  static constexpr int DISPLAY = DISPLAY_N * (DISPLAY_N + 1) / 2;
  int rows() const { return computed; }
  double timeOf(int row) const;
  double end() const { return timeOf(ROWS - 1); }
  Lamp lamp;
  std::vector<int> kept;                  // the lines kept (their power ≥ 10⁻¹⁰ of the strongest)
  std::vector<double> steadyPower;        // per kept line
  std::vector<double> width;              // natural FWHM per kept line (Hz, atom's time)
  std::array<double, STATES> Nss{};       // the steady populations
  double total = 0;                       // Σ steady line power
  // each kept line's fine-structure components (components()): comps[compStart[j] … compStart[j+1])
  void tune(double alphaScale);           // their frequencies for this α
  double alphaScale = -1;
  std::vector<Component> comps;
  std::vector<int> compStart;
 private:
  void step(double dt);
  void record(int row);
  bool built = false;
  int computed = 0;
  double tauS = 0, h = 0, t = 0;
  std::array<double, STATES> p{}, G{}, N{}, Nold{};
  std::vector<float> table;               // ROWS × kept
  std::vector<float> pops;                // ROWS × DISPLAY
  std::vector<int> keptOf;                // line → its kept index, or −1
  std::vector<double> acc;
};

// A small fast random generator (Mulberry32), so a line's noise is the same every time.
struct Rng {
  uint32_t s;
  explicit Rng(uint32_t seed = 0x9e3779b9u) : s(seed) {}
  double uniform(); // [0, 1)
  double gauss();   // zero mean, unit variance (two uniforms: what the random walks it drives sum is normal)
};

} // namespace forte::hydrogen
