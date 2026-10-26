// abracadabra-model.h — the physics of ABRACADABRA, a broadband search for axion dark matter
// (Kahn, Safdi & Thaler 2016; ABRACADABRA-10 cm, Ouellet et al. 2019). If dark matter is an axion
// field a(t) = (√2ρ / m) cos(m t), its coupling to photons, g a E·B, turns a magnet's static field
// into an effective current J = g √2ρ cos(m t) B. In a toroidal magnet that current circles the
// toroid's hole as the field does, and so threads an oscillating magnetic flux through a pickup
// loop in the hole, where there is no field of the magnet's own: a SQUID reads it.
//
// The axion is not one wave but a sum of many, one for every speed in the galaxy's halo: its
// frequency is m (1 + v²/2c²), so the line is a millionth of its frequency wide, and the field's
// amplitude wanders (Rayleigh-distributed) over a coherence time of about a million cycles.
//
// Every key is such an experiment in a universe whose axion has the key's mass: its frequency in
// kHz is the note's in Hz (SCALE). Only the frequency is moved; times and bandwidths in Hz are
// the real ones, so the field swells and fades, and the SQUID's noise hisses, as they would.
#pragma once

#include <array>
#include <cstdint>

namespace forte::abracadabra {

// Physics (CODATA 2018)
constexpr double C_KMS = 299792.458;               // c, km/s
constexpr double H_EV = 4.135667696e-15;           // Planck's constant, eV s
constexpr double HBARC_GEV_M = 1.973269804e-16;    // ħc, GeV m
constexpr double PHI0 = 2.067833848e-15;           // the flux quantum h/2e, Wb
// The dark matter (as ABRACADABRA-10 cm assumed it: the Standard Halo Model)
constexpr double RHO_DM = 0.4;                     // GeV/cm³
constexpr double V0 = 220;                         // km/s: the halo's speed parameter (√2 σ)
constexpr double V_LAB = 232;                      // km/s: the lab's speed through the halo
// A cold stream: O'Hare & Green 2017's benchmark (400 km/s in the Galaxy, 20 km/s across, 5 % of
// the density), whose speed through the lab is |v_str − v_☉| = 420 km/s.
constexpr double STREAM_V = 420;                   // km/s
constexpr double STREAM_SIGMA = 20;                // km/s, each direction
// ABRACADABRA-10 cm (Ouellet et al., PRL 122, 121802 and PRD 99, 052012, 2019)
constexpr double ABRA_R_IN = 0.03, ABRA_R_OUT = 0.06, ABRA_H = 0.12; // m: the toroid
constexpr double ABRA_V = 890e-6;                  // m³: its field's volume
constexpr double ABRA_G = 0.027;                   // 𝒢_V, the pickup's geometric coupling (COMSOL)
constexpr double ABRA_LOOP = 0.0201;               // m: the pickup loop's radius (Run 1)
constexpr double ABRA_B = 1;                       // T: the field at the toroid's inner radius
constexpr double M_IN = 2.52e-9;                   // H: the SQUID's input coupling
constexpr double L_T = 3.3e-6;                     // H: the pickup circuit's measured inductance
constexpr double SQUID_NOISE = 1;                  // μΦ₀/√Hz: the SQUID's flux noise floor
// The keyboard
constexpr double SCALE = 1000;                     // the axion's frequency over the note's
constexpr double CHANNEL_Q = 8;                    // each key's listening channel: f / 8 wide

// An axion of mass m (eV) oscillates at m c² / h (Hz): 241.8 kHz for 1 neV.
double axionFrequency(double massEv);
double axionMass(double f);
// g √ρ in 1/m, for g in GeV⁻¹ and ρ in GeV/cm³ (natural units, ħ = c = 1, then ÷ ħc).
double couplingPerMeter(double g, double rho);
// The axion's flux through ABRACADABRA's pickup, rms (Wb): g √ρ 𝒢 V B_max (Ouellet et al. 2019),
// for a toroid `size` m across (ABRACADABRA-10 cm's 12 cm, scaled alike: 𝒢 V ∝ size³).
double pickupFlux(double g, double rho, double B, double size);
// The same at the SQUID, M_in / L_T of it, in μΦ₀ rms.
double squidFlux(double g, double rho, double B, double size);
// The SQUID's noise in a key's listening channel (μΦ₀ rms): noise × √(π f / 2Q), the channel's
// noise bandwidth around frequency f (the note's, which is its real bandwidth in Hz too).
double channelNoise(double noise, double f);

// The geometric factor 𝒢 = V_B / V of a pickup loop of radius a in the mid-plane of a toroid of
// rectangular cross section (inner radius R, outer Ro, height h), field B_max R / r: the flux of
// the effective current's field through the loop, ∫∫ M(a; r, z) (R / r) dr dz over the toroid
// (M the mutual inductance of two coaxial circles, Maxwell's, by elliptic integrals), over V.
double geometryFactor(double a, double R, double Ro, double h);
// The complete elliptic integrals K(k) and E(k), k the modulus (by the arithmetic-geometric mean).
double ellipK(double k);
double ellipE(double k);

// The Standard Halo Model's speed distribution in the lab (a Maxwellian of speed parameter v0
// seen from a lab moving at vlab through it; O'Hare & Green 2017, eq. 25), per km/s.
double labSpeedPdf(double v, double v0, double vlab);
// The axion's line: its power per Hz at δ Hz above m c²/h, for an axion at fa Hz.
double linePdf(double delta, double fa, double v0, double vlab);
// The line's mean offset, fa ⟨v²⟩ / 2c², with ⟨v²⟩ = vlab² + 3/2 v0².
double lineMean(double fa, double v0, double vlab);
// The line's spread: the standard deviation of the offsets, fa √(2 vlab² v0² + 3/2 v0⁴) / 2c²
// (v² = |v_lab + u|², u Gaussian, v0²/2 each way), and the coherence time it gives, the time the
// field's autocorrelation takes to fall to 1/e were the line Gaussian: 1 / (√2 π σ).
double lineSpread(double fa, double v0, double vlab);
double coherenceTime(double fa, double v0, double vlab);

// A small fast random generator (Mulberry32), so a sequence of notes is the same every time.
struct Rng {
  uint32_t s;
  explicit Rng(uint32_t seed = 0x9e3779b9u) : s(seed) {}
  double uniform(); // [0, 1)
  double gauss();   // standard normal (Box–Muller)
  double quick();   // roughly normal (four uniforms), unit variance: the SQUID's noise, every sample
};

// One key's axion field: N waves, each a speed from the halo (or the stream) and a complex
// amplitude drawn from a Gaussian, so their sum is a Gaussian field whatever N. The field lives
// on while the key is up: its waves' phases are carried on to the time it is played again.
constexpr int MAX_WAVES = 64;     // halo waves at High Quality
constexpr int STREAM_WAVES = 16;  // stream waves at High Quality
struct Field {
  struct Wave { float n[3]; double cr, ci; double phase = 0; }; // the speed's normal deviates, amplitude, phase (cycles)
  std::array<Wave, MAX_WAVES + STREAM_WAVES> w;
  void init(Rng &rng);
  // the wave's speed (km/s): halo waves first, then the stream's
  static double speedOf(const Wave &x, bool stream, double v0, double vlab, double vs);
};
// How a field sounds now: the halo's and the stream's waves to use, their shares and speeds.
struct FieldShape {
  int halo = MAX_WAVES, stream = STREAM_WAVES;
  double v0 = V0, vlab = V_LAB, vs = STREAM_V, share = 0; // share: the stream's of the density
};
// The wave's offset above the axion's frequency fa (Hz): fa v² / 2c².
inline double offsetOf(double fa, double v) { return fa * v * v / (2 * C_KMS * C_KMS); }
// The field at t s after its waves' phases (normalised so ⟨|z|²⟩ = 1), into re, im.
void fieldAt(const Field &f, const FieldShape &s, double fa, double t, double &re, double &im);

} // namespace forte::abracadabra
