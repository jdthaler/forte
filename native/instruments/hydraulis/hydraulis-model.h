// hydraulis-model.h — the physics of Ctesibius's water organ: its wind, its slides and its pipes.
//
//   pumpers ─▶ pistons ─▶ valve ─▶ the pnigeus: an inverted bowl standing in the cistern's water
//                                    │  air pushes the water down inside and up outside: the head
//                                    │  between them, ρg·Δh, is the wind; past the rim, air bubbles out
//                                    ▼
//                                  wind chest p ─▶ stopcock (a rank's channel) ─▶ key's slide ─▶ pipe foot
//                                                                                              │
//                    the Pipe Organ's flue pipes (pipes-flue.h), on ancient scalings ◀─────────┘
//
// Sources: Hero of Alexandria, Pneumatica I.42 (one pump, the pnigeus, slides with horn springs);
// Vitruvius, De architectura X.8 (two pumps worked in turn, the bronze bowl in its water chest,
// stopcocks for 4, 6 or 8 ranks, slides with iron springs); the Aquincum organ (AD 228: four
// ranks of thirteen pipes, one open and three stopped, as Walcker-Mayer reconstructed it); the
// Dion organ (1st century BC, found in 1992: bronze pipes, 24 of them about 18 mm across).
// Units: SI. Nothing here allocates.
#pragma once

#include <cmath>
#include <numbers>

#include "forte/dsp.h"
#include "pipes-model.h"

namespace forte::hydraulis {

using pipes::AIR;
using pipes::PipeModel;
using pipes::Voicing;

constexpr int KEY_LO = 55, KEY_HI = 79;   // G3–G5: two octaves, about the compass of the surviving organs
constexpr int KEY_MIN = 21, KEY_MAX = 108; // A0–C8, with the full range open: the same scales, carried on
constexpr double RHO_W = 1000, G = 9.81;   // water, gravity
constexpr double P0 = 101325;              // the atmosphere (Pa)

// ---- the ranks ------------------------------------------------------------------------------------
// Four ranks, as at Aquincum: one open, three stopped. Which pitches the stopped ranks sounded is
// not known; here one at the unison, one an octave below (as long as the open pipes, breaking back
// to the unison below A1 so that no pipe sounds under 27.5 Hz) and one an octave above.
constexpr int RANKS = 4;
struct Rank { bool stopped; double harm; };
constexpr Rank RANK[RANKS] = {{false, 1}, {true, 1}, {true, 0.5}, {true, 2}};
constexpr int LOW_BREAK = 33; // A1: below it the octave-below rank sounds the unison
inline double rankHarm(int key, int r) { return r == 2 && key < LOW_BREAK ? 1 : RANK[r].harm; }
// The pipe's pitch in the keyboard's tuning (forte/tuning.h `ratio`).
inline double pipeFreq(int key, int r, double ratio = 1) { return keyFreq(key) * ratio * rankHarm(key, r); }

// ---- the bore: an ancient scaling -----------------------------------------------------------------
// Ancient pipes were cut from tubing of nearly one bore (Dion's are all about 18 mm across), where
// Töpfer's normal scale (the Pipe Organ's) narrows as f^−0.75. Here the compass narrows slowly,
// D ∝ f^−0.21 (by a quarter over its two octaves); `bore` is the exponent. Pipes this narrow keep
// their upper modes' Q (their walls take more of the fundamental, their mouths radiate less of the
// upper modes), and in this model at Dion's width they overblow to the fourth or fifth mode at any
// cut-up; wider (34 mm at G3) they speak their note, with
// half the Pipe Organ’s jet gain (loop gain 3) and a higher cut-up for the open pipes (U_j/fW 11.5,
// and 13 stopped), in the middle of the range of cut-ups at which every key speaks its note.
// Pipes longer than G3's (the octave-below rank's, and the bass past the compass) widen, open ones
// as f^−1.5 and stopped ones as f^−1, until they are as wide as Töpfer's, so that they speak too; shorter than G5's (the octave-above
// rank's, and the treble past the compass) they narrow as Töpfer's scale does, f^−0.75, so that a
// treble pipe stays longer than it is wide.
constexpr double D_REF = 0.034, BORE_BASS_OPEN = 1.5, BORE_BASS_STOPPED = 1, BORE_TREBLE = 0.75;
inline const double F_REF = keyFreq(KEY_LO), F_TOP = keyFreq(KEY_HI);
inline double boreD(double f, double bore, bool stopped) {
  if (f < F_REF) return std::min(pipes::toepferD(f), D_REF * std::pow(f / F_REF, stopped ? -BORE_BASS_STOPPED : -BORE_BASS_OPEN));
  return D_REF * std::pow(std::min(f, F_TOP) / F_REF, -bore) * std::pow(std::max(f, F_TOP) / F_TOP, -BORE_TREBLE);
}
constexpr double THETA_OPEN = 11.5, THETA_STOPPED = 13, GAIN = 0.5;
inline double cutW(double f, bool stopped) { return pipes::U_NOM / ((stopped ? THETA_STOPPED : THETA_OPEN) * f); }
// The pipe, voiced by the Pipe Organ's model (pipes-model.h) for the default wind, 700 Pa, with
// the diameter, cut-up and gain above and the measured tuning correction (hydraulis-tuning.h).
PipeModel pipeModel(double f, bool stopped, double bore, const Voicing &v, double tune = 0);
double tuning(double f, bool stopped); // the engine's measured correction (tools/hydraulis-tuning.mjs)

// ---- the slides ---------------------------------------------------------------------------------
// Each key pushes a slide (Vitruvius's pinna, Hero's πῶμα) under its pipes; a hole in it slides over
// the hole under each pipe's foot. Each hole is cut HOLE_FLUE times the area of its pipe's flue
// (about 8 mm across under the open rank's G4), so that wide open the foot has nearly all the wind
// (the hole and the flue in series: p_foot = p·a²/(a² + a_flue²), 96 % of it); at rest the holes
// are MARGIN of their width past meeting, and all open together. The opening is the overlap of two
// circles: a lens. x is how far in the slide is, as a share of its travel (1: the holes line up).
constexpr double HOLE_FLUE = 8, CD_HOLE = 0.61, MARGIN = 0.2;
double lensArea(double r, double d);        // the overlap of two circles of radius r, centres d apart
double slideOpen(double x);                 // the open share of a hole with the slide in by x (0 … 1)
double pushTime(double velocity, double push); // s: `push` (ms) at velocity 0.7, ×2 per −0.3
// The spring's angular frequency (on x) for a return in `ms`, preloaded by one travel: the slide
// shuts once cos ωt = ½, at ωt = π/3.
inline double springOmega(double ms) { return std::numbers::pi / (3 * ms / 1000); }

// ---- the wind -----------------------------------------------------------------------------------
// The pnigeus: an inverted bowl of area A_in standing on its feet in a cistern whose water around
// it has area A_out. Air that pushes ΔV of water out from under the bowl lowers the water inside by
// ΔV/A_in and raises it outside by ΔV/A_out: the wind is the head between them,
//   p = ρ_w g ΔV (1/A_in + 1/A_out),
// up to the rim, where the water inside has fallen by x_rim and air escapes:
//   p_rim = ρ_w g x_rim (1 + A_in/A_out).
// The water flowing under the rim has inertance M_w (columns inside and outside, and the gap under
// the rim). Held between its own head (compliance C_h = ΔV/p) and the air shut in the bowl and the
// chest (C_a = V_air/γP₀, nearly twenty times stiffer), it bounces at f_b = 1/2π√((1/C_h + 1/C_a)/M_w),
// a few hertz: a key opening or a stroke starting sets it going, and it rings down. zeta is its
// damping ratio from the water's losses alone; a pump's valve damps it more while it delivers. The
// slower swell is the head itself, rising with each stroke and falling as the pipes draw.
struct WindConst { double Ain, Aout, Lin, Lout, Lgap, gap, Vair, zeta; };
constexpr WindConst WIND = {0.283, 0.50, 0.35, 0.35, 0.10, 0.03, 0.15, 0.15}; // bowl Ø 60 cm, cistern Ø 1 m
struct Cistern {
  double Ain, Aout, Mw, Ch, Ca, Rw; // areas (m²), inertance (kg/m⁴), compliances (m³/Pa), linear loss (Pa·s/m³)
  double xRim, Vrim, pRim;          // the rim: the depth the water inside may fall, the air it holds then, the wind
  double fb;                        // the water's bounce (Hz)
};
Cistern cistern(double size, double pRim); // size scales the areas; pRim: the wind with the bowl full

// The pumps: bronze cylinders Ø 12.5 cm with a 16 cm stroke, 2 litres of air a stroke. A pumper
// leans on the lever with a push worth pushPressure at the piston, and the air goes through the
// valve into the bowl at (p_push − p)/R_VALVE, no faster than the pumper's pace moves the piston
// (PACE times the stroke over its share of the cycle), until the piston is down: a pump gives more
// as the wind sags, and its valve damps the water's bounce while it delivers. A cycle takes
// strokeTime(effort), 4 s at no effort and 0.4 s at full, DELIVER of it pushing down and the rest
// coming back up, drawing air in. One pump (Hero) or two in turn (Vitruvius).
constexpr double PISTON_D = 0.125, STROKE = 0.16, DELIVER = 0.45; // DELIVER: the share of a cycle spent pushing
constexpr double R_VALVE = 2e5, PUSH_IN = 0.2, PACE = 1.5;     // Pa·s/m³; s: the push builds over this
inline const double PISTON_A = std::numbers::pi * PISTON_D * PISTON_D / 4, STROKE_V = PISTON_A * STROKE;
inline double strokeTime(double effort) { return 4 * std::pow(0.1, std::clamp(effort, 0.0, 1.0)); }
inline double pushPressure(double effort, double pRim) { const double e = std::clamp(effort, 0.0, 1.0); return pRim * (1.2 + 0.6 * e + 0.7 * e * e); }
// The flow from a piston pushed with pPush against the wind p, t s into a stroke whose cycle takes
// T, with `share` of it delivered: the push builds over PUSH_IN, and the pumper eases off over the
// last 30 % of the travel.
inline double pistonFlow(double pPush, double p, double t, double share, double T) {
  if (pPush <= p || share >= 1) return 0;
  const double in = t < PUSH_IN ? 0.5 * (1 - std::cos(std::numbers::pi * std::max(0.0, t) / PUSH_IN)) : 1;
  const double q = std::min((pPush - p) / R_VALVE, (PACE * STROKE_V) / (DELIVER * T));
  return q * std::min(in, std::clamp((1 - share) / 0.3, 0.25, 1.0));
}

// A bubble breaking away under the rim rings at Minnaert's frequency, f = (1/2πR)√(3γP/ρ_w).
inline double minnaert(double R, double depth = 0.05) { return std::sqrt(3 * AIR.gamma * (P0 + RHO_W * G * depth) / RHO_W) / (2 * std::numbers::pi * R); }

// Stereo: the pipes stand in a row, the longest at the left (−1 … 1).
double rowPan(int key);

} // namespace forte::hydraulis
