// bronze.js — the material and the air, shared by the FEM side (bell-profile.js) and the
// instrument (carillon-model.js).
export const BRONZE = { E: 105e9, rho: 8700, nu: 0.33 }; // bell bronze, about 78 % copper and 22 % tin
export const cBronze = Math.sqrt(BRONZE.E / BRONZE.rho);   // m/s: f = √λ/(2π) · cBronze / D for the FEM's λ
export const AIR = { rho: 1.2, c: 343 };                    // 20 °C at sea level
