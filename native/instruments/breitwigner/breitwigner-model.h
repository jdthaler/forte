// breitwigner-model.h — the physics: one unstable state, the plainest resonance there is. A key's
// state has a mass M (its note: a frequency, E = hf) and a width Γ. Made at t = 0, its amplitude
// turns at its mass and dies at half its width, ψ(t) = e^(−iMt) e^(−Γt/2), so its probability
// falls as e^(−t/τ) with τ = ħ/Γ, and its spectrum is the Breit–Wigner line of full width Γ.
// Frequencies and widths are in Hz here (h = 1): a full width at half maximum of Γ Hz is a
// lifetime of 1/(2πΓ) s.
#pragma once

namespace forte::breitwigner {

constexpr int REF_KEY = 69;            // A4: the key whose Γ/M the Width control gives as it stands
constexpr double SHARE_MAX = 2;        // Γ/M at most: the pole as far below the real axis as its mass is along it
constexpr double BOOST_SEMITONES = 24; // a note's own bend: a boost of up to γ = 4 (0.968 c)

// A key's mass, as the frequency its state turns at: its note in the keyboard's tuning (Hz).
double keyMass(int key, const double *P);
// A key's own width over its mass: `width` at A4, and Γ ∝ M^power from key to key, counted along
// the equal-tempered keyboard (so retuning a key leaves its Γ/M alone); SHARE_MAX at most.
double keyShare(int key, double width, double power);
// The whole width of a state at rest (Hz): its own share of its mass and what the open channels
// add (partial widths add), SHARE_MAX of its mass at most.
double totalWidth(double mass, double share, double channels);
// The lifetime (s): |ψ|² falls as e^(−t/τ), τ = 1/(2π·fwhm), which is Γτ = ħ.
double lifetime(double fwhm);
// What a boost γ ≥ 1 makes of a state in the lab: its energy γM, its width Γ/γ (its life, dilated).
struct Lab { double f, fwhm; };
Lab boosted(double mass, double fwhm, double gamma);
// That boost's speed over c: √(1 − 1/γ²).
double speed(double gamma);
// The Breit–Wigner line of full width fwhm centred on f0: (Γ/2)² / ((f − f0)² + (Γ/2)²), 1 at its peak.
double line(double f, double f0, double fwhm);
// Formation: a source s that turns with the state, dψ/dt = (2πi·f0 − π·fwhm)ψ + s·e^(2πi·f0·t),
// makes from nothing in a time t the amplitude s·formed(t, fwhm), formed = (1 − e^(−π·fwhm·t)) /
// (π·fwhm): t for a short time, 1/(π·fwhm) for a long one, where formation balances decay.
double formed(double t, double fwhm);
// The power spectrum of the part that is heard, in the line's units (so 1 at a narrow line's
// peak). Made at once (formation 0): e^(−π·fwhm·t) sin(2π·f0·t) from t = 0, the line and its
// mirror image at −f0, which interfere far from the peak. Formed by a source that runs for a time
// T and then stops (as strong as makes an amplitude of 1, formed(T, fwhm)): the line times the
// source's own spectrum, T·sinc(π(f − f0)T), which a source longer than the lifetime makes
// narrower than the line.
double heard(double f, double f0, double fwhm, double formation);

} // namespace forte::breitwigner
