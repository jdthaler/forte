// ring-model.h — the physics: a storage ring heard through a beam
// pickup. Each key is a ring with one bunch; injection kicks it off orbit, and its betatron
// oscillation dephases through the chromaticity (recohering every synchrotron period) and the
// amplitude detuning (for good), as Meller et al. (SSC-N-360, 1987) work out for a Gaussian beam.
#pragma once

namespace forte::ring {

constexpr double PRESS_GAIN = 3;       // full key pressure: the RF voltage × (1 + 3)
constexpr double PICKUP_SIGMA = 20e-6; // s: the pickup's cable and amplifier, a Gaussian of this rms width
constexpr double OCTUPOLE_UNIT = 1e-4; // the amplitude-detuning parameter is in units of 10⁻⁴
constexpr int REF_KEY = 60;            // the lattice parameters are given for the C4 ring

// One key's ring under the parameters P (indexed as in ring-params.h), with key pressure 0..1.
struct Ring { double frev, fsyn, Qs, sigma, sigmaDelta, chroma, D, mu; };
Ring ringOf(int key, const double *P, double pressure = 0);

// The amplitude-detuning factor after θ = 4πμN: the centroid's amplitude (relative to the kick)
// and the phase it has slipped.
struct Detuning { double amp, phase; };
Detuning detuning(double theta, double Z);
// The chromatic factor, φs the synchrotron phase since injection.
double chromatic(double D, double phiS);
// The centroid (in beam sizes) N turns after a kick of Z σ, with constant parameters.
struct Centroid { double env, x; };
Centroid centroid(double N, const Ring &r, double Z, double q, double tauX);
// The Gaussian bunch's form factor at harmonic n, σ its rms length as a share of the ring.
double formFactor(double n, double sigma);

} // namespace forte::ring
