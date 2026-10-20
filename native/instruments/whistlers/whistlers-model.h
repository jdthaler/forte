// whistlers-model.h — the physics: lightning's radio crack, dispersed along the Earth's magnetic
// field into a falling tone. A stroke radiates a broadband pulse of very low frequency (VLF) radio;
// some of it leaks up through the ionosphere and is guided along a field line, in a duct, to the
// other hemisphere, as a whistler-mode wave. Its group velocity depends on frequency (the cold
// plasma's dispersion), so the pulse arrives spread out: the frequency that travels fastest, the
// nose, first, then the lower ones ever later (Eckersley's t ∝ 1/√f), and a short branch above the
// nose that rises toward half the gyrofrequency, where the duct lets go of it. Every key is the
// field line (its L, the distance it crosses the equator at, in Earth radii) whose nose is the note.
#pragma once

#include <array>
#include <cstdint>

namespace forte::whistlers {

// The Earth's field as a dipole: IGRF-13's g₁⁰ for 2020, the equatorial field at the surface
constexpr double B0_NT = 29404.8;
constexpr double GYRO_HZ_PER_NT = 27.99249;  // the electron gyrofrequency e B / 2π mₑ, per nT
constexpr double F_CE1 = B0_NT * GYRO_HZ_PER_NT; // Hz: on the equator at L = 1 (falls as 1/L³)
constexpr double FPE_K = 8978.66;            // Hz: the plasma frequency is FPE_K √n (n per cm³)
constexpr double C_KM = 299792.458;          // km/s
constexpr double RE_KM = 6371.2;             // the Earth's radius
constexpr double TOP_KM = 1000;              // where the line leaves the ionosphere (below it is left out)
// The equatorial electron density (Carpenter & Anderson 1992, JGR 97, 1097), after midnight
// (MLT 02): the saturated plasmasphere's reference term, log₁₀ n = −0.3145 L + 3.9043; across the
// plasmapause n falls tenfold every ΔL = 0.1; the trough, (5800 + 300 t) L^−4.5 + (1 − e^−(L−2)/10)
constexpr double CA_A = -0.3145, CA_B = 3.9043, CA_DL = 0.1, CA_TROUGH = 5800 + 300 * 2.0;
// Along the line, n = n_eq (L R_E / r)^α (Denton et al. 2006: α ≈ 1 in the plasmasphere, 2.5 in the
// trough), α passing from one to the other with the density across the plasmapause
constexpr double ALPHA_PS = 1, ALPHA_TROUGH = 2.5;
constexpr double DUCT_CUTOFF = 0.5;          // ducts hold the whistler only below half the equatorial gyrofrequency
constexpr double DUCT_EDGE = 0.03;           // the cutoff's width, in the same units
// The lightning's radiated field, the derivative of a double-exponential stroke current
// e^(−t/τ₁) − e^(−t/τ₂) (Bruce & Golde's form), τ₁ = 50 µs and τ₂ = 5 µs: |S(f)| rises as f
// up to 3.2 kHz, is flat to 32 kHz (peaking near 10 kHz), and falls beyond
constexpr double STROKE_T1 = 50e-6, STROKE_T2 = 5e-6;
constexpr double BOUNCE_R = 0.98;            // the night ionosphere's reflection for a tweek, per bounce
constexpr double SFERIC_AZ = 0.7;            // rad: the stroke's bearing from the receiver's loops

constexpr int NGL = 48;                      // Gauss–Legendre nodes along half a field line
constexpr int NLO = 96, NUP = 24, NT = NLO + NUP; // a track: the lower branch's frequencies, then the upper's
constexpr double LOW_SPAN = 32;              // the lower branch is kept down to the nose / 32 (five octaves)
constexpr int MAX_DUCTS = 5;

// A field line and what lies along it.
struct Line {
  double L = 4;       // Earth radii, on the equator
  double fce = 0;     // Hz: the electron gyrofrequency on the equator
  double neq = 0;     // per cm³: the electron density on the equator
  double alpha = 1;   // n ∝ (L R_E / r)^α along it
  double lam0 = 0;    // rad: the latitude it leaves the ionosphere at
  // along it, at the Gauss–Legendre nodes of half the line (equator to foot): f_pe², f_ce (gyro), and
  // the node's weight × ds / c (s per unit group index), so a delay is a sum
  std::array<double, NGL> fpe2{}, gyro{}, ds{};
};
// The equatorial density at L, for the plasmapause at lpp, × scale; its α.
double eqDensity(double L, double lpp, double scale = 1);
double alphaOf(double L, double lpp);
Line lineAt(double L, double lpp, double scale);
double fceAt(double L);
// The whistler's group delay along the whole line (one hop, foot to foot), at f Hz: s.
double delay(const Line &ln, double f);
// The delay from the southern foot to latitude lam (rad, −lam0 … lam0).
double delayTo(const Line &ln, double f, double lam);
// The group refractive index for whistlers along the field (cold plasma, electrons): exact.
double groupIndex(double fpe, double fce, double f);
double groupIndex2(double fpe2, double fce, double f); // the same, from f_pe²

struct Nose {
  double f = 0;       // Hz: the frequency that arrives first
  double tau = 0;     // s: its delay
  double tau2 = 0;    // s/Hz²: the delay's curvature there, d²τ/df²
};
Nose noseOf(const Line &ln);
// The field line whose nose is f (Hz), for the plasmapause and density scale.
double lineFor(double f, double lpp, double scale);
// The stroke's spectrum |S(f)|, as a share of its peak.
double stroke(double f);

// One duct's whistler for the engine: the delay and amplitude at NT frequencies, the lower
// branch's (falling from the nose, i = 0 … NLO−1, nose at NLO−1) then the upper's (rising, NLO …).
// amp is one hop's stationary-phase amplitude, S(f) / √|dτ/df|, with the stroke's spectrum
// relative to the nose's and the duct's cutoff; cap is its limit at the nose (the Airy peak's,
// shared by the two branches), ta the Airy time (τ''/2)^⅓ in ω.
struct Track {
  Line line;
  Nose nose;
  std::array<double, NT> f{}, tau{}, amp{};
  double cap = 0, ta = 0;
};
void trackOf(Track &t, double L, double lpp, double scale);

// A tweek: waveguide mode m between the ground and the ionosphere h km up, from a stroke d km away
// (time t s after the stroke): its frequency, and its stationary-phase amplitude relative to its
// value at 1.5 times its cutoff (capped at 1). Before it arrives, 0.
double tweekCutoff(int m, double h);
double tweekFreq(int m, double h, double d, double t);
double tweekStart(int m, double h, double d, double ftop);
double tweekAmp(int m, double h, double d, double f);

// A small fast random generator (Mulberry32), so a sequence of notes is the same every time.
struct Rng {
  uint32_t s;
  explicit Rng(uint32_t seed = 0x9e3779b9u) : s(seed) {}
  double uniform(); // [0, 1)
  double exponential(double mean);
};

} // namespace forte::whistlers
