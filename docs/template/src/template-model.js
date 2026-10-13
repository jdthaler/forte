// template-model.js — the physics, kept free of audio and DOM so that the
// page, the engine, the tests and the render tool can all use it.
//
// Example instrument: a free–free bar (Euler–Bernoulli beam) struck by a
// mallet. Each key is a bar tuned so that its first bending mode is the
// note; the mallet is a half-sine force pulse whose length sets which modes
// it can reach.

import { keyFreq, sigmaFromT60 } from '../../../shared/dsp.js';

// Free–free beam: cos(βL)·cosh(βL) = 1.
export const BETA_L = [4.730041, 7.853205, 10.995608, 14.137165, 17.278760, 20.420352];

export function modeShape(n, x) { // x in [0, 1], normalised so that the free end is ±2
  const b = BETA_L[n], s = (Math.cosh(b) - Math.cos(b)) / (Math.sinh(b) - Math.sin(b));
  return Math.cosh(b * x) + Math.cos(b * x) - s * (Math.sinh(b * x) + Math.sin(b * x));
}

// Force spectrum magnitude of a half-sine pulse of length tau, relative to DC.
export function pulseSpectrum(f, tau) {
  const u = 2 * f * tau;
  return Math.abs(u - 1) < 1e-6 ? Math.PI / 4 : Math.abs(Math.cos((Math.PI * u) / 2) / (1 - u * u));
}

// The modes of one key: [{ f, sigma, amp }]; amp = modal velocity per unit strike.
export function keyModes(key, P) {
  const f1 = keyFreq(key), modes = [];
  for (let n = 0; n < BETA_L.length; n++) {
    const ratio = (BETA_L[n] / BETA_L[0]) ** 2 * (1 + P.stretch * n);
    const f = f1 * ratio;
    if (f > 18000) break;
    const sigma = sigmaFromT60(P.t60) * (f / f1) ** P.damping;
    const amp = modeShape(n, P.strike) * pulseSpectrum(f, P.mallet / 1000);
    modes.push({ f, sigma, amp });
  }
  return modes;
}
