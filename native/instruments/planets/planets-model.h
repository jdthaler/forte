// planets-model.h — the physics: a planet's free oscillations after a quake, as a station on its
// surface records them (planets/README.md).
//
// The planet's multiplets come from the normal-mode solver (tools/planets-modes.mjs), tabulated in
// planets-table.h: each nSl or nTl with its frequency, Q, spin splitting χ and radial eigenfunctions.
// A quake is a moment tensor M at a depth; it rings singlet m of a multiplet by M : ε_m*, the
// singlet's strain at the source, and a station hears it through the singlet's motion (or gravity)
// where it stands (Gilbert 1971). The spin splits the 2l + 1 singlets to ω + mχΩ, so a multiplet
// heard at the station is
//   a(t) = Re Σ_m c_m e^{i(ω + mχΩ)t} e^{−ωt/2Q},     c_m = s_m(station) · [M : ε_m(source)]*
// for a step in moment (acceleration; the ground's velocity is a/iω). The quake's rupture, a
// triangle of half-duration h, filters each multiplet by sinc²(ωh/2).
#pragma once

#include <vector>

#include "planets-table.h"

namespace forte::planets {

constexpr double MW_REF = 9;   // the quake the planets are levelled at
constexpr double MW_SPAN = 1;  // a key's velocity spans this many magnitudes below the top

const TablePlanet &planetOf(const double *P);
// The note's time-lapse: the planet's ₀S₂ lands on the key's frequency in the keyboard's tuning.
double speedup(int key, const double *P);
// The magnitude a key's velocity (0..1) plays
double magnitude(double velocity, const double *P);
// The rupture's half-duration (s): the Global CMT catalogue's scaling, h = 1.05e-8 M0^⅓ (M0 in
// dyne cm; Ekström et al. 2012), times the Rupture knob
double halfDuration(double mw, const double *P);
// A triangle's spectrum: sinc²(ωh/2)
double sourceSpectrum(double w, double h);

// The moment tensor of a unit quake (M0 = 1) for the knobs: (rr, θθ, φφ, rθ, rφ, θφ), with θ
// south and φ east at the source (the Global CMT convention).
void momentTensor(const double *P, double M[6]);
// The station's colatitude and longitude (rad) for a quake at longitude 0
void stationAt(const double *P, double &theta, double &phi);

// Every multiplet's response at the station to a unit quake, for the knobs as they are: the
// physical angular frequency ω, decay ω/2Q (× Attenuation), spin rate χΩ (rad/s at the planet's own
// spin), degree, and its 2l + 1 coefficients c_m (complex: re, im), for the left and right
// channels (the same unless the sensor is the horizontal pair). Levelled so that the reference
// quake (Mw 9 megathrust 30 km down, 60° away) has an rms of 1 at the first moment; the rupture's
// filter and the moment are the voice's to apply.
struct Multiplet { double w, decay, spinRate; int type, n, l, off; double bound, Ur; }; // Ur: U at the surface
struct Response {
  int planet = -1;
  bool stereo = false;
  std::vector<Multiplet> m;
  std::vector<double> cL, cR; // 2(2l+1) numbers per multiplet, from m = −l
  std::vector<double> src;    // and [M : ε_m]*, the quake's own share of each singlet (levelled alike)
  Response();
};
void respond(const double *P, Response &out);

// The ground's radial displacement (relative units) at colatitude θ, longitude φ, t seconds (the
// planet's time) after a quake of magnitude mw, from the spheroidal multiplets of degree ≤ lmax:
// for the page's picture of the planet's shape.
double radialAt(const Response &r, const double *P, double mw, int lmax, double theta, double phi, double t);

// Fully normalised associated Legendre functions with the Condon–Shortley phase, P̄_l^m(cos θ),
// and their θ-derivatives, for 0 ≤ m ≤ l ≤ L, at [l(l+1)/2 + m]
void legendre(int L, double theta, double *P, double *dP);

} // namespace forte::planets
