// bubbles-tank.js — what the page draws and names: the keyboard, the tank's layout, the gases and
// the liquids. The physics (bubble acoustics, tuning, rise, glide, kick) is in C++
// (native/instruments/bubbles/bubbles-model.cpp), built as WebAssembly: bubbles-wasm.js. The gas and
// liquid tables here are the same as its (bubbles-model.h), in the same order: the WebAssembly takes
// them by index.

export const G = 9.81;              // m/s²
export const P_ATM = 101325;        // Pa

// Gases at 20 °C: heat capacity ratio γ, molar mass M (kg/mol), thermal conductivity K (W/m·K),
// specific heat c_p (J/kg·K). SF₆'s K and c_p are approximate.
export const GASES = {
  air: { name: 'air', gamma: 1.4, M: 0.02897, K: 0.0257, cp: 1005 },
  helium: { name: 'helium', gamma: 5 / 3, M: 0.0040026, K: 0.151, cp: 5193 },
  argon: { name: 'argon', gamma: 5 / 3, M: 0.039948, K: 0.0177, cp: 520.3 },
  sf6: { name: 'SF₆', gamma: 1.10, M: 0.14606, K: 0.0130, cp: 665 },
};

// Liquids at 20 °C: density ρ (kg/m³), dynamic viscosity μ (Pa·s), surface tension σ (N/m), sound
// speed c (m/s), vapour pressure p_v (Pa). Glycerol–water viscosities and densities are the standard
// tables (by mass); the mixture's σ and c are interpolated by mass fraction between water and
// glycerol, and its p_v is Raoult's law (estimates).
export const LIQUIDS = {
  water: { name: 'water', rho: 998.2, mu: 1.002e-3, sigma: 0.0728, c: 1482, pv: 2339 },
  gly90: { name: '90 % glycerol', rho: 1234.7, mu: 0.219, sigma: 0.0643, c: 1876, pv: 840 },
  glycerol: { name: 'glycerol', rho: 1261, mu: 1.41, sigma: 0.0634, c: 1920, pv: 0 },
};

export const gasOf = (P) => GASES[P.gas] || GASES.air;
export const liquidOf = (P) => LIQUIDS[P.liquid] || LIQUIDS.water;

// The keyboard: A3–C8. At the defaults that is bubbles from 15 mm down to 0.8 mm in radius.
export const KEY_LO = 57, KEY_HI = 108;
export const keyFreq = (k) => 440 * 2 ** ((k - 69) / 12);

// The tank: nozzles in a row along the bottom, 2 cm apart, low notes on the left; two
// hydrophones at nozzle depth, set back from the row, near either end.
export const NOZZLE_PITCH = 0.02;                                      // m between nozzles
export const ROW = NOZZLE_PITCH * (KEY_HI - KEY_LO);                  // 1.02 m
export const HYDRO = { x: [0.2 * ROW, 0.8 * ROW], back: 0.35 };        // m
export const nozzleX = (key) => NOZZLE_PITCH * (Math.min(KEY_HI, Math.max(KEY_LO, key)) - KEY_LO);
