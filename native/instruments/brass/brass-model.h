// brass-model.h — the physics of a brass instrument: the player's lips (a valve blown open,
// outward), the mouthpiece's cup, and the horn's bore, a chain of tubes from the mouthpiece's
// throat to the bell, in which a loud wave steepens towards a shock (Hirschberg et al. 1996).
// The engine (brass-engine.h) integrates them; this file designs each key's horn and the
// digital bore the engine runs, and computes that bore's input impedance, exactly as the
// engine plays it (the same delays, interpolation, losses and radiation), to tune it.
//
//   mouth p_m ─▶ lips h(y) ─▶ cup p_c ─▶ throat, backbore, leadpipe ─▶ slide or valves (cylinder) ─▶ bell taper ─▶ flare ─▶ air
//                 m ÿ = −k (y − H0) − r ẏ + S (p_m − p_c)          waves both ways: c + β u (the shock)
#pragma once

#include <algorithm>
#include <complex>
#include <cstdint>

#include "forte/tuning.h"

namespace forte::brass {

constexpr double PI = 3.141592653589793;
struct Air {
  static constexpr double rho = 1.2, c = 343;
  static constexpr double rhoc2 = 1.4 * 101325; // ρc² = γ P_atm
  static constexpr double beta = 1.2;           // (γ + 1) / 2: air's coefficient of nonlinearity
};
// Viscous and thermal losses at the walls: α = LOSS √f / a nepers per metre (Benade).
constexpr double LOSS = 3e-5;

enum Horn : int { TROMBONE, TRUMPET, FLUGEL, NHORNS };

// A horn as built (lengths in m, radii in m), at its own size.
struct HornDesign {
  double cupV;              // the mouthpiece's cup (m³)
  double throatR, throatL;  // its throat
  double bbL, bbR;          // backbore: a cone from the throat to bbR
  double leadL;             // leadpipe: a cone from bbR to the cylinder's radius
  double cylR, cylL;        // the cylinder (slide or valve section) with the slide in (valves up), before tuning
  double coneL, coneR;      // the bell section's taper: a cone from cylR to coneR
  double flareL, mouthR, gamma; // the flare: a Bessel horn r ∝ (x0 + L − x)^−γ out to the mouth
  double fTune; int nTune;  // cut so that partial nTune with the slide in sounds fTune (B♭)
  int pLo, pHi;             // the partials it plays on
  double extMax;            // how far the slide or the valves lengthen it, × its length (six semitones)
  int keyLo, keyHi;         // its compass: beyond it, the same horn bigger or smaller by octaves
  double lipMass, lipArea, lipWidth; // the lips at fTune: moving mass (kg), area the mouth pushes on (m²), width (m)
  double habit;             // cents the player sets the slide (or the valves' slides) long by: lips play above the bore's peak
  double lipCents;          // the lips' tuning against the trombone's (LIP_CENTS): where this horn's notes speak cleanest
};
const HornDesign &hornDesign(int horn);

// A bore: a chain of cylinders (cones and the flare as staircases of them) from the throat to the
// mouth. Segments [cyl0, cyl1) are the cylinder the slide or valves lengthen.
constexpr int MAX_SEG = 72;
struct Bore {
  int n = 0, cyl0 = 0, cyl1 = 0;
  double len[MAX_SEG] = {}, rad[MAX_SEG] = {};
  bool hot[MAX_SEG] = {};   // long enough to run at a fractional delay, with losses and the nonlinear speed
  double cupV = 0, mouthR = 0, scale = 1;
  double total() const { double s = 0; for (int i = 0; i < n; i++) s += len[i]; return s; }
};
// The horn at size `scale` (every length × scale), cut into segments for sample rate fs, its
// cylinder dCyl longer than designed (at size 1: the maker's cut, cutHorn).
void buildBore(int horn, double scale, double bellSize, double fs, Bore &out, double dCyl = 0);
// The radius along the horn (m) at x from the throat, with the slide in, at size 1.
double profile(int horn, double bellSize, double x);
double hornLength(int horn);

// The bore as the engine runs it, at sample rate fs with the slide out by `ext` metres.
struct Digital {
  int n = 0, cyl0 = 0, cyl1 = 0;
  double D[MAX_SEG] = {};   // delay, samples (whole for the short segments)
  double Y[MAX_SEG] = {};   // admittance A/ρc
  double lg[MAX_SEG] = {}, lp[MAX_SEG] = {}; // wall losses over the segment, one way: g (1 − p) / (1 − p z⁻¹)
  bool hot[MAX_SEG] = {};
  bool nl[MAX_SEG] = {};    // narrow enough for its waves to steepen audibly: the nonlinear speed is run here
  double cupC = 0;          // the cup's compliance V/ρc²
  double tauR = 0;          // the open end's radiation: R = −1 / (1 + s τ)
};
void realize(const Bore &b, double fs, double ext, double plunger, Digital &out);
// One segment's wall-loss filter, fitted to e^(−LOSS √f Λ) (Λ = Σ l / a) at two frequencies, for a
// horn at size `scale`.
void lossFilter(double lambda, double fs, double scale, double &g, double &p);
// The fractional delay's taps (third-order Lagrange): out = Σ h[k] x[n − base − k].
void lagrange(double D, int &base, double h[4]);
// The plunger mute: the open fraction of the bell's mouth.
double plungerOpen(double plunger);

// The input impedance at the lips (Pa s/m³): the cup and the bore behind it, exactly as the
// engine plays them at fs (linear: small waves).
std::complex<double> inputImpedance(const Digital &d, double f, double fs);
// The impedance peak nearest fGuess within ± `span` (a ratio), from the digital bore.
double peakNear(const Digital &d, double fs, double fGuess, double span = 0.06);

// What a player does for a key: which horn size, which partial, and how far the slide is out.
struct Plan {
  int horn = 0, octave = 0;   // the horn at size 2^octave
  int partial = 2;
  double f = 0;               // the note (Hz), in the keyboard's tuning
  double scale = 1;
  double ext = 0;             // the slide (or valves' loops), m beyond first position
  double Le = 0;              // the horn's equivalent length for this partial (m): n c / 2 f
  double position = 1;        // the trombone's slide position (1–7), or the valve semitones + 1
  int valves = 0;             // bits: 1 = first valve, 2 = second, 4 = third (trumpet, flugelhorn)
  double fPeak = 0;           // the bore's impedance peak it is tuned to
};
// A horn as its maker cut it for fs: the cylinder trimmed so that its partial nTune, slide in, is
// its B♭, and its partials' peaks there (size 1) with their equivalent lengths n c / 2 f.
struct HornCut {
  int horn = 0;
  double bellSize = 1, fs = 48000, dCyl = 0;
  double fn[16] = {}, Le[16] = {};
};
HornCut cutHorn(int horn, double bellSize, double fs);
// Choose and tune: the partial and position a player would pick for the note f, with the slide
// (or the valves and their trim) set so that the bore's peak is on the note.
Plan planKey(const HornCut &c, double f, double fs, bool tune = true);
// The output's regulation for a key of a horn: the gain that brings its mezzo-forte to the same
// loudness as every other key's (a voicer's regulation, not physics; measured, brass-levels.h).
double regulation(int horn, int key);

// The lips for a note at f on partial n of the horn at size `scale`, `cents` tighter than usual,
// with Q q: moving mass (kg), stiffness (N/m), the area the pressure pushes (m²), width (m) and
// opening at rest (m), and r their damping (N s/m).
struct Lips { double m, k, S, w, H0; };
Lips lipsFor(int horn, double f, double scale, int partial, double cents, double q, double &r);

// Blowing pressure (Pa) for a velocity 0..1 at frequency f, × breath.
double mouthPressure(double velocity, double f, double breath);

// The nonlinear delay: the sample leaving a delay line of D samples (written up to t − 1) at time
// t, read where its own pressure carried it: D (1 − k p) samples ago, k = β/ρc² (the speed c + β u,
// u = p/ρc), solved from the guess by `iters` fixed-point steps on third-order Lagrange taps.
inline double nlRead(const float *buf, int mask, uint32_t t, double D, double k, double guess, int iters) {
  double y = guess;
  for (int it = 0; it < iters; it++) {
    const double s = std::clamp(k * y, -0.25, 0.25);
    const double Dn = D * (1 - s); // L / (c + β u), to first order in u / c
    const int base = (int)Dn - 1;
    const double x = Dn - base;
    const double h0 = -(x - 1) * (x - 2) * (x - 3) * (1.0 / 6), h1 = x * (x - 2) * (x - 3) * 0.5;
    const double h2 = -x * (x - 1) * (x - 3) * 0.5, h3 = x * (x - 1) * (x - 2) * (1.0 / 6);
    const uint32_t j = t - base;
    y = h0 * buf[j & mask] + h1 * buf[(j - 1) & mask] + h2 * buf[(j - 2) & mask] + h3 * buf[(j - 3) & mask];
  }
  return y;
}

// A plane wave of amplitude p and frequency f sent down a straight, lossless tube of length L in
// `pieces` such delays at fs (the engine's own reads, iters steps each): the amplitudes of its
// first `nh` harmonics after it (out), as Fubini's solution gives them before the shock.
void propagate(double L, int pieces, double p, double f, double fs, int iters, int nh, double *out);

// The distance (m) over which a plane wave of amplitude p (Pa) and frequency f steepens into a
// shock in free air (the lossless simple wave): x_s = ρc³ / (β ω p).
double shockDistance(double p, double f);

} // namespace forte::brass
