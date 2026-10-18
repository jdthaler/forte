// partials.js — the bell's named partials: their names, their designations (m, nodal circles) and
// their ideal ratios to the prime. Labels for the page, and the order of the C++'s Partial enum
// (bell-table.h) for carillon-wasm.js and tools/carillon-native-table.mjs.
export const PARTIAL_NAMES = {
  hum: 'hum', prime: 'prime', tierce: 'tierce', quint: 'quint', nominal: 'nominal',
  deciem: 'deciem', superquint: 'superquint', octnom: 'octave nominal',
};
export const IDEAL = { hum: 0.5, prime: 1, tierce: 1.2, quint: 1.5, nominal: 2, deciem: 2.5, superquint: 3, octnom: 4 };
export const DESIGNATION = { hum: '(2,0)', prime: '(2,1#)', tierce: '(3,1)', quint: '(3,1#)', nominal: '(4,1)', deciem: '(4,1#)', superquint: '(5,1)', octnom: '(6,1)' };
export const idealRatio = (id, profile) => (id === 'tierce' && profile === 'major' ? 1.25 : IDEAL[id]);
