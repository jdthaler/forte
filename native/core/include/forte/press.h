// press.h — Press (aftertouch, MPE pressure: engine.h pressure, a Seaboard's Press) as the struck
// and plucked engines take it: pressing a held key harder makes its note more, never less. The
// strings, tines, reeds, springs and the celesta's and kalimba's steel have a sustainer on them (an
// EBow over a string, a driver coil by a pickup: Sustainer), the vibraphone a bow on its bars (the
// same, with a bow's friction for the amplifier), and the mallet instruments roll (Roll), as a
// player keeps a mallet note sounding.
//
// Only a firm press counts: pressure below PRESS_FROM does nothing (a Seaboard sends some from any
// finger at rest on a held key, which would set every note going), and the press goes in over the
// rest, as the drums' heel does. Presses keeps each key's pressure and the channel's (key −1), so
// rescaled; a voice's Press glides toward the larger once a block, over 10 ms, so a press never
// clicks. With nothing pressed a voice's p stays exactly 0, and the engine plays bit for bit as
// before.
#pragma once

#include <array>
#include <cmath>
#include <cstdint>
#include <numbers>

#include "forte/fdlibm.h"

namespace forte {

constexpr double PRESS_FROM = 0.5;

struct Presses {
  std::array<double, 128> key{};
  double channel = 0;
  void set(double value, int k) {
    const double u = (value - PRESS_FROM) / (1 - PRESS_FROM);
    const double v = u > 0 ? (u < 1 ? u : 1) : 0; // (NaN: none)
    if (k < 0) channel = v;
    else if (k < 128) key[k] = v;
  }
  // how hard key k is pressed: its own pressure or the channel's, whichever is the more
  double of(int k) const { const double v = k >= 0 && k < 128 ? key[k] : 0; return v > channel ? v : channel; }
  void reset(int k) { if (k >= 0 && k < 128) key[k] = 0; } // a new note's own pressure starts at none
  void clear() { key.fill(0); channel = 0; }
};

// The note's own pressure as it comes (no threshold), for the engines whose Press shapes a held
// note from the first touch (a louder beam, a stronger field): each key's and the channel's
// (key −1), the larger counting. With nothing pressed of() is exactly 0.
struct Pressures {
  std::array<double, 128> key{};
  double channel = 0;
  void set(double value, int k) {
    const double v = value > 0 ? (value < 1 ? value : 1) : 0; // (NaN: none)
    if (k < 0) channel = v;
    else if (k < 128) key[k] = v;
  }
  double of(int k) const { const double v = k >= 0 && k < 128 ? key[k] : 0; return v > channel ? v : channel; }
  void reset(int k) { if (k >= 0 && k < 128) key[k] = 0; } // a new note's own pressure starts at none
  void clear() { key.fill(0); channel = 0; }
};

constexpr double PRESS_GLIDE = 0.01; // s: a voice's press follows its key's this fast

struct Press {
  double p = 0; // 0 … 1
  bool on() const { return p > 0; }
  // Follow `target` for a block of n samples at fs; true when p moved (the engine recomputes what
  // depends on it).
  bool follow(double target, int n, double fs) {
    if (p == target) return false;
    p += (target - p) * (1 - fdlibm::exp(-n / (PRESS_GLIDE * fs)));
    if (std::fabs(p - target) < 1e-4) p = target;
    return true;
  }
};

// A two-pole recursion's amplitude (y[n] = a1·y[n−1] − a2·y[n−2], a1 = 2r·cos θ, a2 = r²) from its
// last two samples y0 and y1: B² = (y0² − a1·y0·y1 + a2·y1²) / sin²θ.
inline double twoPoleAmplitude(double y0, double y1, double a1, double a2) {
  const double s2 = 1 - (a1 * a1) / (4 * a2), e = y0 * y0 - a1 * y0 * y1 + a2 * y1 * y1;
  return s2 > 1e-12 && e > 0 ? std::sqrt(e / s2) : std::fabs(y0);
}

// A sustainer: a driver held at one point of what rings (an EBow over a string, a coil beside a
// tine's or a reed's pickup, a bow on a bar). It senses the velocity there, through a band-pass on
// the note (Q of SUSTAIN_Q: its amplifier's band, so it feeds the fundamental and not a quieter
// overtone, which a saturating loop would otherwise lock onto), and pushes there in step with it,
// through an amplifier that saturates at p·F, p how hard the key is pressed. A force in step with a mode's velocity feeds it; a mode of decay rate σ (1/s), weight
// w at the point (mass-normalised, so 1/w² is the mass the point feels) and frequency ω, driven by
// a square wave of F (the amplifier saturated: its fundamental 4F/π), takes in ½·(4F/π)·V and loses
// σ·V²/w² once the velocity at the point swings ±V, so it holds where V = (2/π)·F·w²/σ: from a
// struck note's level it swells or decays toward that over its own decay time 1/σ and stays.
// tune() sets F on the note's fundamental as its strike leaves it, so a full press holds it at
// `hold` times the velocity its strike gave the point. Below saturation (v0, a tenth of that) the
// amplifier is linear, a negative damping of p·F·w²/(2·v0), 2.5π·σ·p: past the lightest press it
// outgrows the note's losses, so every press holds the note, at a level as hard as it is pressed.
// Unpressed nothing calls it, and the engine plays as before.
constexpr double SUSTAIN_Q = 2;

struct Sustainer {
  double F = 0;   // N at full press (0: not tuned yet: it waits for the strike to end)
  double v0 = 1;  // m/s: where its amplifier saturates
  double b0 = 0, c1 = 0, c2 = 0; // its band-pass (a resonator with unit gain at the note: b0·(1 − z⁻²) over 1 + c1·z⁻¹ + c2·z⁻²)
  double vH = 0, w2 = 1; // the velocity it holds at full press (m/s), and w² at its point
  double u1 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  bool live = false;
  // On the fundamental as the strike leaves it: its decay rate sigma (1/s), weight w at the point,
  // frequency f0 (Hz), and the point's velocity amplitude from it, vStruck (m/s)
  void tune(double sigma, double w, double f0, double vStruck, double hold, double fs) {
    vH = hold * vStruck; w2 = w * w;
    if (!(vH > 0) || !(w2 > 0)) { F = 0; return; }
    v0 = 0.1 * vH;
    const double w0 = std::min(2 * std::numbers::pi * f0 / fs, 3.0), al = std::sin(w0) / (2 * SUSTAIN_Q), a0 = 1 + al;
    b0 = al / a0; c1 = -2 * std::cos(w0) / a0; c2 = (1 - al) / a0;
    decay(sigma);
  }
  // The fundamental's decay rate as it is now (an engine whose fundamental shares its energy with a
  // box or a tube measures it as it goes): F to hold the same velocity
  void decay(double sigma) { F = vH > 0 && sigma > 0 ? (std::numbers::pi / 2) * sigma * vH / w2 : 0; }
  bool ready() const { return F > 0; }
  // The force (N) this sample, from u, the displacement at its point; p how hard the key is pressed.
  // Its first sample only listens (it has no velocity yet).
  double force(double u, double p, double fs) {
    if (!live) { live = true; u1 = u; x1 = x2 = y1 = y2 = 0; return 0; }
    const double v = (u - u1) * fs, y = b0 * (v - x2) - c1 * y1 - c2 * y2, x = y / v0;
    u1 = u; x2 = x1; x1 = v; y2 = y1; y1 = y;
    return p * F * x / std::sqrt(1 + x * x);
  }
  void rest() { live = false; } // let go: it listens afresh when pressed again
};

// A roll: a mallet note kept sounding by striking it again and again, the mallets in turn, while
// its key is pressed past rest: `rate` strokes a second, a little uneven (±3 % in time, as a
// player's), each as hard as the key is pressed (ROLL_FULL of the hardest stroke at full press). The
// first comes a stroke's time after the press begins.
constexpr double ROLL_FULL = 0.8;

struct Roll {
  double in = -1;   // samples to the next stroke (−1: not rolling)
  bool hand = false; // which mallet strikes next
  // n samples on, pressed p: the velocity of the stroke due in this block, or 0
  double step(double p, double rate, int n, double fs, uint32_t &rng) {
    if (!(p > 0)) { in = -1; return 0; }
    if (in < 0) { in = fs / rate; return 0; }
    if ((in -= n) > 0) return 0;
    rng = rng * 1664525u + 1013904223u;
    hand = !hand;
    in += (fs / rate) * (1 + 0.06 * ((rng >> 8) / 16777216.0 - 0.5));
    return ROLL_FULL * p;
  }
};

} // namespace forte
