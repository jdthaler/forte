// voice-model.h — the physics of a singing voice: the lungs push air up through the vocal folds,
// two masses on springs each side (Ishizaka and Flanagan 1972), which the air sets flapping; the
// pulses of air they let through drive the vocal tract, a tube of varying width from the folds to
// the lips, whose shape is the vowel; the lips radiate.
//
//   folds     m ẍᵢ + rᵢ ẋᵢ + kᵢ xᵢ (1 + η xᵢ²) + k_c (xᵢ − xⱼ) = Pᵢ l_g dᵢ  (+ contact springs when shut)
//             the glottis's two areas aᵢ = a₀ + 2 l_g xᵢ; tension Q stretches them (m/Q, kQ)
//   flow      Bernoulli from the lungs to the narrowest area, into the tract's first section:
//             P_s − p₁ = ρ U² / (2 a_min²),  p₁ = 2p⁻ + Z₁ U   (Z₁ = ρc/A₁; p⁻ the wave coming back)
//   tract     Kelly and Lochbaum (1962): sections of length c T, a wave scattered at each change of
//             area by r = (Aᵢ − Aᵢ₊₁)/(Aᵢ + Aᵢ₊₁); lips into the radiation impedance of a piston in a
//             baffle (a resistance and an inductance in parallel: Flanagan 1972); sound ∝ dU_lips/dt
//   vowels    voice-vowels.h: area functions fitted to Peterson and Barney's formants (1952)
#pragma once

#include "voice-vowels.h"

namespace forte::voice {

constexpr double RHO = 1.14;         // kg/m³, air at body temperature, saturated
constexpr double C = 350;            // m/s
constexpr double NU = 1.6e-5;        // m²/s, its kinematic viscosity
constexpr double CMH2O = 98.0665;    // Pa per cm of water

// Ishizaka and Flanagan (1972), their table I, in SI units: the folds at tension Q = 1.
constexpr double M1 = 0.125e-3, M2 = 0.025e-3;   // kg
constexpr double K1 = 80, K2 = 8, KC = 25;       // N/m (80 000, 8 000 and 25 000 dyn/cm)
constexpr double D1 = 2.5e-3, D2 = 0.5e-3;       // m, the masses' thickness along the flow
constexpr double LG = 1.4e-2;                    // m, the folds' length
constexpr double ETA_K = 1e6, ETA_H = 5e6;       // 1/m², the springs' and the contact's stiffening (100 and 500 cm⁻²)
constexpr double H_RATIO = 3;                    // the contact springs: 3 k
constexpr double ZETA1 = 0.1, ZETA2 = 0.6;       // damping ratios, open
constexpr double ZETA1C = 1.1, ZETA2C = 1.9;     // and shut (+1: the tissue squeezed)
// Turbulence at the glottis: a noise pressure ∝ Re² − Re_c² above the critical Reynolds number
// (Flanagan 1972; Re = U/(ν l_g)), and its size.
constexpr double RE_C = 1800, NOISE = 6e-6;     // Pa per Re²

// The folds' constants at a tension Q, for a thickness (1: Ishizaka and Flanagan's) and a rest area.
struct FoldConstants {
  double m1, m2, k1, k2, kc, h1, h2, r1, r2, r1c, r2c, d1, d2, a0;
};
FoldConstants foldConstants(double Q, double thick, double restArea);

// The two masses' state: displacements (m, positive apart) and velocities.
struct Folds {
  double x1 = 0, v1 = 0, x2 = 0, v2 = 0;
  double a1 = 0, a2 = 0, U = 0;  // the last step's areas (m²) and flow (m³/s)
  // One step of dt: the flow U through the glottis into a tract whose wave coming back is pm (Pa)
  // and whose first section has impedance Z1, from lungs at Ps (Pa); returns U.
  double step(const FoldConstants &c, double dt, double Ps, double pm, double Z1);
};

// The tract's area function (m²) in N sections, for a vowel position v (0 to COUNT − 1: between two
// vowels their log-areas mix), with the larynx tube at `larynx` m², and the jaw opened by J (0 to
// 1): the log-areas mixed by J toward a horn, narrow in the throat and opening evenly (in log-area)
// to wide lips, the shape whose F1 is highest (a soprano's formant tuning: Joliveau, Smith and
// Wolfe 2004).
constexpr double OPEN_THROAT = 1.0, OPEN_LIPS = 9.0; // cm²: the horn's ends
void areaFunction(double v, double larynx, int N, double *out, double J = 0);
// The phase of the tract's input impedance seen from the glottis at f (radians, lossless walls,
// the lips into their radiation impedance): above 0 the air in the tract is inertive there, which
// helps the folds along; below, compliant, which hinders them (Titze 2008). Just below a formant
// it is nearly +π/2, just above it nearly −π/2.
double inputPhase(const double *area, int N, double length, double f);
// Its reactance there, over the first section's ρc/A.
double inputReactance(const double *area, int N, double length, double f);
// The jaw opening (0 to JAW_MAX) a singer would use for vowel v at a note f (Hz) in a tract `length`
// m long: none while the note is well under F1 (UNDER_F1), nor while the tract's reactance at the note is inertive enough (INERTIVE × the first
// section's ρc/A), else the least that makes it so, or the one that comes nearest. A note just
// above F1 gets F1 tuned a little above it.
constexpr double JAW_MAX = 1, INERTIVE = 1, UNDER_F1 = 0.75;
double jawFor(double v, double larynx, double f, double length);

// The tube's resonances (Hz), lossless, the glottis shut and the lips loaded by the radiation's
// inductance: the formants. Up to `count` below fMax; returns how many.
int formants(const double *area, int N, double length, double *out, int count, double fMax = 5000);
// The tube's transfer |U_lips/U_glottis| at f, with the radiation's resistance and inductance
// at the lips (lossless walls).
double transfer(const double *area, int N, double length, double f);
// The radiation impedance at the lips: R and L (Flanagan 1972) for a lip area A (m²).
double radiationR(double A);
double radiationL(double A);

} // namespace forte::voice
