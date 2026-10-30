// trautonium-model.h — the physics, in closed form: what the engine plays and the page draws.
//
//   the lamp: a capacitor C charged through the wire's resistance R toward the supply S; the neon
//   lamp across it strikes at V_s and dumps it to V_e (Trautwein's glow-lamp sawtooth, the Hittorf
//   circuit), so its period is T = R C g with g = ln[(S − V_e)/(S − V_s)]
//   the wire: a resistance wire pressed onto a rail; R grows evenly along it, so f ∝ 1/R
//   the dividers (Sala's Mixtur-Trautonium): lamps of their own, ganged to run a little slower than
//   f/n; each discharge of the master lifts them by the sync pulse K, which fires one within K of
//   striking: the first master pulse whose kick reaches it captures it, every m-th one
//   the formants: resonant circuits (a coil and a rotary capacitor, quality Q), rung by each
//   discharge's step, equally hard whatever its Q; fixed in frequency, whatever note is played
#pragma once

namespace forte::trautonium {

constexpr double V_STRIKE = 90, V_EXT = 60; // the neon lamp: striking and extinction (V)
constexpr double CAP = 50e-9;                // the timing capacitor (F)
constexpr int DIVIDERS = 4, FORMANTS = 4;
constexpr double Q_REF = 8;                  // a circuit of this Q passes its peak at the mixture's level

// ln[(S − V_e)/(S − V_s)]: the period in time constants
double periods(double supply);
// the wire's resistance (Ω) that plays f with supply S
double wireR(double f, double supply);
// the capture window δ for a sync pulse (a fraction of the swing V_s − V_e): a lamp whose own
// firing was due within δ of its period fires with the pulse
double window(double sync, double supply);
// the master pulse a ÷n divider of slack s fires on, at window δ, when it starts in step: the
// m-th (m = n when it divides true, fewer when the window reaches back further), or 0 if it
// slips (no pulse catches it before it fires on its own)
int lockCount(int n, double slack, double delta);
// the circuits' response at f: |dry + Σ gᵢ (Qᵢ/Q_REF) Hᵢ(f)|, each Hᵢ a resonance of peak 1: a discharge
// rings a circuit equally hard whatever its Q, so a sharper one rings longer and louder (the parameters P)
double response(double f, const double *P);

} // namespace forte::trautonium
