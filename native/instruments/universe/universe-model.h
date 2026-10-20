// universe-model.h — the physics: the sound of the early universe. For its first 380,000 years
// the universe was a plasma, photons tied to electrons and nuclei by Thomson scattering, and the
// ripples inflation left in it rang as sound waves in that photon–baryon fluid: gravity pulled the
// fluid into the dark matter's wells, the photons' pressure pushed it back out. When the plasma
// recombined into neutral hydrogen, the light went free, and the cosmic microwave background still
// shows each wave caught where it stood, as the acoustic peaks of its spectrum.
//
// Every key is a universe whose sound horizon at recombination (the distance sound travelled
// until then) is scaled so the waves that fit it a whole number of half times, the acoustic
// peaks, are the note's harmonics: harmonic m is the wave with k = mπ / r_s*, the m-th peak. Each
// is evolved from inflation to recombination by the equations of Ma & Bertschinger (1995) in the
// conformal Newtonian gauge: the dark matter, the photon–baryon fluid (tightly coupled, with
// Silk's diffusion damping), the free-streaming neutrinos (their hierarchy to ℓ = 8), and the
// potentials from Einstein's equations. The free electrons that hold the fluid together come from
// Saha's equation for helium and Peebles's three-level atom for hydrogen.
#pragma once

#include <array>
#include <memory>
#include <vector>

namespace forte::universe {

// The universe's ingredients: ω = Ω h², what sets each one's density whatever the Hubble constant.
struct Cosmology {
  double ob = 0.02237;   // baryons (Planck 2018, TT,TE,EE+lowE+lensing)
  double oc = 0.1200;    // cold dark matter
  double neff = 3.044;   // the effective number of neutrino species
  double yp = 0.245;     // the helium share of the baryons' mass
};

// Physical constants (CODATA 2018) and the radiation today.
constexpr double C_H = 2997.92458;         // Mpc: c / (100 km/s/Mpc), the Hubble distance for h = 1
constexpr double T_CMB = 2.7255;           // K (Fixsen 2009)
constexpr double OMEGA_G = 2.47297e-5;     // Ω_γ h² for T_CMB: a T⁴ / ρ_crit c² (a = 7.56573e-16 J m⁻³ K⁻⁴)
constexpr double NU_SHARE = 0.22710731766; // ρ_ν / ρ_γ for one species: (7/8)(4/11)^(4/3)
constexpr double SIGMA_T = 6.6524587321e-29; // m²: Thomson
constexpr double M_H = 1.6735575e-27, M_HE = 6.6464764e-27; // kg: the hydrogen and helium-4 atoms
constexpr double RHO_CRIT = 1.87834e-26;   // kg m⁻³: the critical density for h = 1
constexpr double MPC = 3.0856775814913673e22; // m
constexpr double C_LIGHT = 299792458;      // m/s
constexpr double H100 = 1e5 / MPC;         // s⁻¹: 100 km/s/Mpc
constexpr double K_B_EV = 8.617333262e-5;  // eV/K
constexpr double YEAR = 3.15576e7;         // s (Julian)
// Hydrogen and helium (NIST)
constexpr double B_H = 13.605693, B_HE1 = 24.587387, B_HE2 = 54.417760; // eV: ionisation
constexpr double SAHA = 2.4146830e21;      // m⁻³ K^(−3/2): (2π m_e k / h²)^(3/2)
constexpr double LAMBDA_2S = 8.2245809;    // s⁻¹: the 2s → 1s two-photon rate
constexpr double LYMAN_ALPHA = 121.5670e-9; // m
// Peebles's case-B recombination coefficient: Péquignot, Petitjean & Boisson (1991), with
// RECFAST's fudge factor 1.14 (Seager, Sasselov & Scott 1999), which makes the three-level atom
// recombine as the multilevel one does
constexpr double FUDGE = 1.14;

// Damping: the photons' viscosity and heat conduction with polarisation (Kaiser 1983), whose
// diffusion takes exp(−k²/k_D²) off a wave's oscillation:
//   d(k_D⁻²)/dτ = [R²/(1 + R) + 16/15] / [6 (1 + R) n_e σ_T a]
constexpr double SHEAR = 16.0 / 15.0;
constexpr int NU_L = 8;                 // the neutrinos' hierarchy stops at this ℓ
constexpr int MAX_HARMONICS = 24;       // waves, the acoustic peaks: the note's harmonics
constexpr int NT = 192;                 // the table's points from the beginning to recombination
constexpr double DEAD = 20;             // a wave damped by e^(−20) (−174 dB) is not followed further

// The background: the expansion (matter and radiation; Λ and curvature do nothing before
// recombination), the free electrons, the visibility, the sound horizon and the damping.
class Background {
 public:
  explicit Background(const Cosmology &c);
  Cosmology c;
  double og, onu, orad, om; // ω: photons, neutrinos, radiation, matter
  double A, B;              // a(τ) = A τ² + B τ (τ in Mpc)
  double nH0, fHe;          // hydrogen atoms a m³ today; helium atoms per hydrogen atom
  double tauEq, zEq;        // matter–radiation equality
  double tauStar, zStar;    // recombination: where the visibility peaks
  double rsStar;            // the sound horizon then (Mpc)
  double kdStar;            // the damping wavenumber then (Mpc⁻¹)
  double ageStar;           // the universe's age then (years)
  double a(double tau) const { return (A * tau + B) * tau; }
  double tauOf(double a) const;
  double hubble(double tau) const; // ℋ = a'/a, conformal (Mpc⁻¹)
  double R(double tau) const;      // 3ρ_b / 4ρ_γ, the baryons' loading of the fluid
  double xe(double tau) const;     // free electrons per hydrogen atom
  double opacity(double tau) const; // κ' = n_e σ_T a (Mpc⁻¹)
  double visibility(double tau) const; // g = κ' e^(−κ)
  double rs(double tau) const;     // the sound horizon, ∫ c_s dτ
  double damping(double tau) const; // k_D⁻² (Mpc²)
  double dampingRate(double tau) const; // d(k_D⁻²)/dτ
  double cs(double tau) const;     // the fluid's sound speed, 1/√(3(1 + R))
  double xeOfZ(double z) const;    // free electrons at redshift z (the table's)
 private:
  double dtau, tauEnd;
  std::vector<double> X, K, RS, D, DD; // on τ_j = j·dtau: x_e, κ, r_s, k_D⁻², its rate
  double at(const std::vector<double> &v, double tau) const;
};

// A wave's state as it evolves.
struct ModeOut {
  double sky = 0;     // Θ₀ + ψ: the temperature its light would have when it reaches us
  double doppler = 0; // the fluid's velocity, θ/(√3 k): the Doppler shift of its light
  double plasma = 0;  // Θ₀ = δ_γ/4: the temperature in the plasma
  double phi = 0, psi = 0, dg = 0, theta = 0, dc = 0; // the potentials and the fluids (for the tests)
};
// Evolve the wave k (Mpc⁻¹) from the beginning, writing its state at each of the n times t
// (increasing, in Mpc of conformal time). damp = false leaves out the diffusion (for the tests).
void evolve(const Background &bg, double k, const double *t, int n, ModeOut *out, bool damp = true);

// The universe as the engine plays it: every harmonic's sky, Doppler and plasma values at NT
// times evenly spaced in conformal time from the beginning to recombination.
struct Universe {
  Cosmology c;
  double tauStar = 0, rsStar = 0, k1 = 0; // k1 = π / r_s*, the first harmonic's wave
  std::array<std::array<float, NT>, MAX_HARMONICS> sky{}, doppler{}, plasma{};
};
Cosmology cosmologyOf(const double *P);
std::unique_ptr<Universe> buildUniverse(const Cosmology &c);

// The free-streaming spherical Bessel functions: j₀(x) = sin x / x, j₁(x) = sin x / x² − cos x / x.
double j0(double x);
double j1(double x);

} // namespace forte::universe
