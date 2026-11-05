// tubular-model.h — the physics of tubular bells (orchestral chimes): a row of brass tubes hung
// from a frame by their tops, each capped at the top by a brass plug where the mallet strikes it,
// and a felt damper bar that presses on all of them near the top unless the pedal is down.
//
//    ═════════════════════════  frame rail (the tubes hang by cords at their tops)
//      ▄▄▄    ▄▄▄    ▄▄▄        the cap: a brass plug and striking ring (mass m_c, inertia J_c)
//      ▓ ▓ ◀──── mallet (rawhide, Hertzian contact) strikes the cap's edge
//    ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬  felt damper bar, 7 cm below the tops
//      │ │    │ │    │ │
//      │ │    │ │    └─┘        each tube a free–free Timoshenko beam, cut so that an octave
//      │ │    └─┘               below its 4th bending mode is the key's note (the strike note)
//      └─┘
//
// The tube bends as a Timoshenko beam (shear and rotary inertia), free at the bottom, with the cap
// a point mass and rotary inertia at the top: its frequencies are the roots of a 4 × 4
// determinant, its mode shapes the null vectors, written in a basis (e^{−αx}, e^{α(x−L)},
// cos βx, sin βx) that stays well conditioned for any length. Each mode radiates as a line of
// transverse dipoles (a thin cylinder; 2πa² of volume per unit length, × the exact 2-D factor for
// a fat one), which sets its radiation loss and what two microphones in front of the frame hear.
#pragma once

#include <array>
#include <cmath>
#include <complex>

#include "forte/dsp.h"

namespace forte::tubular {

constexpr int KEY_LO = 60, KEY_HI = 77;    // C4–F5: the orchestral set of 18 tubes
constexpr int KEY_MIN = 21, KEY_MAX = 108; // A0–C8, with the full range open: the same tube, cut on
constexpr int MAX_MODES = 48;              // bending modes kept per tube (those under 20 kHz)
constexpr int STRIKE_MODE = 3;             // mode 4 (from 0): the strike note is an octave below it

struct Material { double E, rho, nu; };
// cartridge brass (C26000), aluminium 6061-T6, a carbon steel
inline constexpr Material MATERIALS[3] = {{110e9, 8530, 0.375}, {69e9, 2700, 0.33}, {205e9, 7850, 0.29}};

// Air at 20 °C.
inline constexpr double C_AIR = 343.2, RHO_AIR = 1.204;

// Free–free Euler–Bernoulli beam: cos βL cosh βL = 1.
inline constexpr double BETA_L[6] = {4.730040745, 7.853204624, 10.99560784, 14.13716549, 17.27875966, 20.42035225};

// Cowper's (1966) shear coefficient for a hollow circular section, m = inner/outer diameter.
double cowperKappa(double nu, double m);

// One tube's cross-section and its cap: everything the beam equations need.
struct Section {
  double E, rho, G, kappa; // the metal, and the section's shear coefficient
  double a, ai;            // outer and inner radius (m)
  double A, I;             // area, second moment
  double mc, Jc;           // the cap: mass (kg) and rotary inertia about the tube's end (kg m²)
};
inline constexpr double CAP_DEPTH = 0.025; // m: how far the plug goes into the tube
Section sectionOf(int material, double diameterMm, double wallMm, double capGrams);

// Euler–Bernoulli's free–free frequency n (from 0) for a tube of length L, without its cap.
double eulerFreq(const Section &s, double L, int n);
// The second spectrum's cutoff, √(κGA/ρI)/2π: the model stops short of it (Hz).
double cutoffFreq(const Section &s);

// The Timoshenko beam at ω: w ∝ e^{λx} with λ = ±α, ±iβ, ψ = (λ + c/λ) w, c = ρω²/κG.
struct Roots { double alpha, beta, ka, kb; };
Roots roots(const Section &s, double omega);
// The boundary conditions at ω on (e^{−αx}, e^{α(x−L)}, cos βx, sin βx): shear and moment free at
// the bottom (x = 0); at the top (x = L) the shear drives the cap's mass and the moment its
// inertia. Scaled rows, so the determinant is finite, continuous and zero at each mode.
using Mat4 = std::array<std::array<double, 4>, 4>;
Mat4 boundary(const Section &s, double L, double omega, const Roots &r);
double tubeDet(const Section &s, double L, double omega);
// The bending frequencies of a tube of length L between fLo and fHi (at most n), in order.
int tubeFreqs(const Section &s, double L, double fLo, double fHi, int n, double *f);

// One mode: its frequency, the roots and the coefficients of its shape (unit modal mass,
// counting the cap; the top moving +), its radiation loss, the damper's share, and the complex
// pressure it gives each microphone per unit modal acceleration.
struct Mode {
  double f;
  Roots r;
  std::array<double, 4> c;
  double sigRad; // 1/s: the amplitude's decay rate by radiation
  double J;      // ∫(1 − μ²)|I(kμ)|² dμ, the far field's share (m²/kg)
  double dampW;  // the damper felt's grip on it, relative to the strike note's modes (4–6)
  std::array<std::complex<double>, 2> gain; // Pa per (m/s² · √kg) at the left and right microphones
};

// w(x) and ψ(x) of a mode, x from the bottom (0) to the top (L).
double modeW(const Mode &m, double L, double x);
double modePsi(const Mode &m, double L, double x);
// ∫₀ᴸ w(x) e^{iκx} dx, in closed form.
std::complex<double> modeTransform(const Mode &m, double L, double kappa);

// The 2-D exact factor on a cylinder's dipole radiation, 4/(π²(ka)⁴|H₁′(ka)|²): 1 for a thin
// one, less as ka grows past 1. Bessel functions by their power series (asymptotic forms past 20).
double besselJ0(double x);
double besselJ1(double x);
double besselY0(double x);
double besselY1(double x);
double fatCylinder(double ka);

// Where the frame hangs each tube and where the microphones stand: the naturals in a front row,
// 7.5 cm apart, the sharps in a row 12 cm behind between them, the compass centred; two
// microphones 70 cm apart, `distance` in front of the front row, 60 cm below the caps.
inline constexpr double SPACING = 0.075, ROW = 0.12, MIC_HALF = 0.35, MIC_DROP = 0.6, DAMPER_Z = 0.07, DAMPER_W = 0.03;
struct Place { double x, y; };
Place placeOf(int key);

// A tube: its section, length and modes. Cut so that mode 4 sits an octave above the key's
// strike note: its equal-tempered pitch × ratio (the keyboard's tuning, forte/tuning.h).
struct Tube {
  int key = 0;
  int material = 0;
  double diameterMm = 0, wallMm = 0, capGrams = 0, ratio = 1; // what it was built for (with distance)
  Section s{};
  double L = 0, mass = 0, f4 = 0, distance = 0;
  Place place{};
  int count = 0;
  std::array<Mode, MAX_MODES> m{};
};
double cutLength(const Section &s, double strikeNote);
// Build a tube for the key; the microphones at `distance` (m). P: the parameters, as in tubular-params.h.
void buildTube(int key, int material, double diameterMm, double wallMm, double capGrams, double ratio, double distance, Tube &out);
// The far field's share and the gains for the microphones at `distance` (buildTube does this too).
void radiate(Tube &t, double distance);

// A tube sent with a note (the page's noteData), as doubles: it is plain data, and the page's model
// and the engine are the same WebAssembly. packTube returns how many it wrote (at most PACKED).
inline constexpr int PACKED = (int)((sizeof(Tube) + 7) / 8) + 1;
int packTube(const Tube &t, double *out);
bool unpackTube(const double *in, int n, Tube &t);

// The mallet: F = Kδ^1.5 with a little hysteresis.
inline constexpr double MALLET_P = 1.5, MALLET_ALPHA = 2e-5;
struct Mallet { double m, K, p, alpha; };
Mallet malletOf(double hardness, double massGrams);

} // namespace forte::tubular
