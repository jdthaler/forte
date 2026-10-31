// cuore-model.h — the physics: one CUORE bolometer, a TeO₂ crystal at about 10 mK read by a
// neutron-transmutation-doped (NTD) germanium thermistor, as the CUORE collaboration models it
// (Pozzi et al. 2022, arXiv:2205.04549): four nodes, a circuit and three thermal links.
//
//   C_p dV/dt   = (V_b − V)/R_L − V/R(T_e)                         the bias circuit
//   C_e dT_e/dt = V²/R(T_e) − g (T_e⁵ − T_c⁵)                      the thermistor's electrons
//   C_c dT_c/dt = g (T_e⁵ − T_c⁵) − G_ct (T_c − T_t)               the crystal
//   C_t dT_t/dt = G_ct (T_c − T_t) − G_ts (T_t − T_s)              the PTFE holders, to the sink
//
// with R(T) = R₀ exp(√(T₀/T)), C_e = γ_e T, C_c = Debye's T³ for the crystal's mass, C_t ∝ T. A
// heater pulse (or a particle) of energy E warms the crystal at once, by its T³ heat capacity.
// The state is stepped by a second-order, L-stable Rosenbrock (W-)method, ROS2, whose Jacobian is
// tridiagonal (each node touches only its neighbours); a step that leaves the physical range is
// taken again in halves.
#pragma once

#include <algorithm>
#include <array>
#include <cmath>

namespace forte::cuore {

constexpr double MEV = 1.602176634e-13;   // J
constexpr double KB = 1.380649e-23;       // J/K
constexpr double NA = 6.02214076e23;
constexpr double R0 = 1.1;                // Ω: the NTD's R₀ (Carrettoni & Vignati 2011)
constexpr double RL = 60e9;               // Ω: the load resistors (Pozzi et al. 2022)
constexpr double GAMMA_E = 8.6e-9;        // J/K²: the electrons' C_e = γ_e T (8.6e-11 J/K at 10 mK)
// The electron–phonon coupling P = g (T_e⁵ − T_c⁵): Pozzi et al. (2022, Table 5) fit NTD batch 39C
// with g = 0.026 W/K^a, a = 5.05 ± 0.07; with a = 5 (within it), g gives the same conductance
// 5 g T⁴ at 10 mK (and T⁵ costs no pow).
constexpr double A_EP = 5;
constexpr double G_EP = 0.026 * (5.05 / 5) * 0.7943282347242815; // 0.01^0.05: 0.02086 W/K⁵
constexpr double C_PTFE = 2.1e-6;         // J/K²: the holders' C_t = c_t T
constexpr double THETA_D = 232;           // K: TeO₂'s Debye temperature (Barucci et al. 2001)
constexpr double RHO = 6.02;              // g/cm³: TeO₂
constexpr double MOLAR = 159.6;           // g/mol: TeO₂, three atoms
constexpr double ADC_FULL = 10.5;         // V: the digitiser's full scale
constexpr double Q_BB = 2.527518;         // MeV: ¹³⁰Te's double beta decay Q-value
constexpr double H_MAX = 0.015;           // s of the crystal's time: the longest ROS2 step a sample takes

// The crystal's mass (g) and its heat capacity at T (J/K): Debye's (12π⁴/5) N k_B (T/Θ)³.
double crystalMass(double side);
double crystalCapacity(double side, double T);
// The thermistor's resistance at T (Ω).
double resistance(double t0, double T);

// One bolometer's constants, from the parameters.
struct Bolometer {
  double Vb = 5, Cp = 500e-12, T0 = 3.4, Ts = 0.01, Gct = 1e-8, Gts = 1e-8, cc = 2.2e-3; // C_c = cc T³
  double iCp = 2e9; // 1/C_p
  using State = std::array<double, 4>; // V, T_e, T_c, T_t

  void set(const double *P);
  // dy/dt, and the tridiagonal Jacobian when asked (sub, dia, sup: ∂f_i/∂y_{i−1}, ∂y_i, ∂y_{i+1})
  State deriv(const State &y, double *sub = nullptr, double *dia = nullptr, double *sup = nullptr) const;
  // One ROS2 step of h seconds.
  void step(State &y, double h) const;
  // A step of h seconds for each of n crystals (four at a time: the same as safeStep() on each).
  void stepMany(State *const *ys, int n, double h) const;
  // n ROS2 steps over h seconds.
  void steps(State &y, double h, int n) const { for (int i = 0; i < n; i++) safeStep(y, h / n, 6); }
  // A step, split in halves (up to depth times) where it would leave the physical range.
  void safeStep(State &y, double h, int depth) const;
  bool sane(const State &from, const State &y) const;
  // A heater pulse (or particle) of E joules into the crystal: its energy ∫C_c dT = cc T⁴/4 grows by E.
  void kick(State &y, double E) const;
  // The h seconds after a pulse, in n steps or in steps of at most H_MAX (up to 64), whichever
  // are more: the crystal is furthest from where the steps' linearisation holds just after one.
  void afterKick(State &y, double h, int n) const { steps(y, h, std::clamp((int)std::ceil(h / H_MAX), n, std::max(n, 64))); }
  // The steady state with no pulses (every node passes on the thermistor's Joule heat to the sink).
  State equilibrium() const;
  double joule(const State &y) const { return y[0] * y[0] / resistance(T0, y[1]); }
};

} // namespace forte::cuore
