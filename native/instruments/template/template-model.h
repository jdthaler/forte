// template-model.h — the physics: a free–free bar (Euler–Bernoulli beam) struck by a mallet. Each
// key is a bar tuned so that its first bending mode is the note; the mallet is a half-sine force
// pulse whose length sets which modes it reaches.
#pragma once

#include <array>

namespace forte::template_ {

// Free–free beam: cos(βL)·cosh(βL) = 1.
constexpr std::array<double, 6> BETA_L = {4.730041, 7.853205, 10.995608, 14.137165, 17.278760, 20.420352};

// Mode n's shape at x in [0, 1], normalised so that the free end is ±2.
double modeShape(int n, double x);
// Force spectrum magnitude of a half-sine pulse of length tau, relative to DC.
double pulseSpectrum(double f, double tau);

struct Mode { double f, sigma, amp; };   // amp: modal velocity per unit strike
struct KeyModes { std::array<Mode, BETA_L.size()> m; int count = 0; };
// The modes of one key, from the parameters (indexed as in template-params.h).
KeyModes keyModes(int key, const double *P);

} // namespace forte::template_
