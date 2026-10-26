// project8-model.h — the physics of Cyclotron Radiation Emission Spectroscopy (CRES), as in
// Project 8: an electron in a magnetic bottle circles the field at the cyclotron frequency
// eB / 2πγm, radiates, and so loses energy, which raises that frequency (its relativistic mass
// falls); it bounces along the field in the bottle; and it collides with the gas left in the trap,
// losing energy or being knocked off course, often out of the trap.
//
// Every key is such a cell. The frequencies are moved down to the key's note, every one by the same
// factor (the carrier, its harmonics, the axial bounce's sidebands); times are not touched: the
// electron cools, bounces, collides and escapes as fast as it would in the real trap.
#pragma once

#include <cstdint>

namespace forte::project8 {

// CODATA 2018 and the electron
constexpr double C = 299792458;               // m/s
constexpr double QE = 1.602176634e-19;        // C
constexpr double ME_KG = 9.1093837015e-31;    // kg
constexpr double ME_EV = 510998.95;           // m c², eV
constexpr double EPS0 = 8.8541878128e-12;     // F/m
constexpr double KB = 1.380649e-23;           // J/K
constexpr double HBARC_EV_NM = 197.3269804;   // ħc, eV nm
constexpr double A0_NM = 0.0529177210903;     // the Bohr radius, nm
constexpr double ALPHA = 7.2973525693e-3;     // the fine-structure constant
// the sources
constexpr double KR_K = 17824.23;             // eV: ⁸³ᵐKr's K conversion line (as Project 8 2024 uses it)
constexpr double T2_ENDPOINT = 18573.7;       // eV: molecular tritium's endpoint E₀ (KATRIN, Aker et al. 2019)
constexpr double T_Z = 2;                     // the daughter's charge (³He⁺), for the Fermi function
// the gas: hydrogen at the Phase II cell's temperature
constexpr double SIGMA_INEL = 3.40e-22;       // m²: inelastic cross section of T₂ at 18.6 keV (Aseev et al. 2000)
constexpr double SIGMA_REF_EV = 18600;        // eV: where it was measured
constexpr double ELASTIC_SHARE = 0.1;         // elastic / inelastic: "an order of magnitude smaller" (Project 8 2023)
constexpr double GAS_T = 85;                  // K: the Phase II cell (Project 8 2023)
constexpr double NO_GAS = 1e-11;               // mbar: the gas's lowest setting, which is a perfect vacuum
constexpr double LOSS_EXC = 12.6;             // eV: the peak of hydrogen's energy-loss spectrum (excitation)
constexpr double LOSS_ION = 15.43;            // eV: H₂'s ionisation energy
constexpr double INEL_ANGLE = 0.5 * 3.141592653589793 / 180; // rad: the mean inelastic scattering angle (KATRIN, Hannen et al. 2017)
constexpr double TF_SCREEN = 0.885;           // Thomas–Fermi screening radius, in Bohr radii (Z = 1)
// Phase II's waveguide: a circular copper guide 10.03 mm across, its TE₁₁ mode
constexpr double GUIDE_A = 5.015e-3;          // m
constexpr double TE11 = 1.8411837813406593;   // the first zero of J₁′

// The electron's cyclotron frequency at rest in 1 T, e / 2πm: 27.99 GHz.
double gyro();
// Cyclotron frequency (Hz) of an electron of kinetic energy K (eV) in B (T).
double cyclotron(double B, double K);
// Radiation's cooling time in B (T): τ = 3πε₀ m³ c³ / e⁴ B², 2.58 s in 1 T. The power radiated is
// P = (m c² / 2τ) (γβ⊥)².
double coolingTime(double B);
// Relativistic Larmor power (eV/s) of an electron of kinetic energy K (eV) at pitch angle θ (cos θ).
double power(double B, double K, double cosTheta);

// The electron as the radiation reaction moves it in a uniform field (Landau–Lifshitz): in the frame
// that moves along the field with it, it circles and spirals in; there γ′ falls as
// dγ′/dt′ = −(γ′² − 1) / 2τ, γ′ = coth(t′/2τ + c), and its velocity along the field never changes.
struct Electron {
  double gpar = 1, bpar = 0;  // γ∥ and β∥ (the guiding centre's motion along the field)
  double w = 0;               // γ′ − 1 in the guiding centre's frame
  static Electron of(double K, double cosTheta);
  void cool(double dt, double tau);     // dt in the lab, τ for the field there
  double gamma() const { return gpar * (1 + w); }
  double kinetic() const { return (gamma() - 1) * ME_EV; }
  double uPerp() const;                 // p⊥ / mc
  double uPar() const { return gamma() * bpar; }
  double cosTheta() const;              // the pitch angle at the trap's centre
  double cot2() const;                  // cot²θ
  double beta() const;
  double betaPerp() const { return uPerp() / gamma(); }
};

// The trap: B = B₀ (1 + z²/L²) up to the walls at B₀ + depth. An electron is held if
// cot²θ < Δ = depth / B₀; it bounces with z = L cot θ sin ψ at ω_a = v⊥ / L (exactly harmonic: the
// mirror force −μ ∂B/∂z is linear in z), and its cyclotron frequency is f (1 + cot²θ sin²ψ).
struct Trap {
  double B = 1, delta = 0, L = 0.1;
  double cos2Max() const { return delta / (1 + delta); } // the widest pitch angle held, cos²θ
};
// The axial (bounce) frequency (Hz) of electron e in trap t.
double axialFrequency(const Trap &t, const Electron &e);
// The waveguide's TE₁₁ cutoff (Hz), and the Doppler modulation index of the bounce at carrier f:
// h = k_g z_max = (2π f / v_φ) L cot θ, which is Project 8's h = βc f cos θ / v_φ f_a.
double guideCutoff();
double guideIndex(double f, double L, double cot);

// Bessel functions of the first kind and their derivatives, by their power series (x up to ~20).
double besselJ(int n, double x);
double besselJd(int n, double x);
// The free-space radiation of harmonic n of a circling electron at speed β (Schott):
// side-on (in the orbit's plane) its field's amplitude n β J′ₙ(nβ), and its power over all
// directions, ∫ n² [cot²ϑ Jₙ²(nβ sin ϑ) + β² J′ₙ²(nβ sin ϑ)] dΩ / 4π.
double sideOn(int n, double beta);
double harmonicPower(int n, double beta);

// Tritium's β spectrum: F(Z, E) p E (E₀ − K)² (a massless neutrino), normalised to 1 over K in eV.
double betaSpectrum(double K);
double betaMean(); // eV

// Collisions with the gas: the rate (per second) at pressure p (mbar) for an electron of energy K.
double collisionRate(double pMbar, double K);
// The elastic scattering's screening angle ħ / p a for an electron of energy K (rad).
double screeningAngle(double K);

// A small fast random generator (Mulberry32), so a sequence of notes is the same every time.
struct Rng {
  uint32_t s;
  explicit Rng(uint32_t seed = 0x9e3779b9u) : s(seed) {}
  double uniform(); // [0, 1)
  double exponential(double mean);
  double gauss();   // roughly normal (four uniforms), unit variance
};
// A tritium electron's energy, drawn from betaSpectrum.
double drawTritium(Rng &rng);

// What one collision did.
struct Collision { bool elastic = false; double loss = 0, angle = 0; };
// Draw a collision for an electron of energy K, and apply it to the pitch angle (cos θ in, out).
Collision collide(Rng &rng, double K, double &cosTheta);

} // namespace forte::project8
