// longitudinal.h — a string's longitudinal modes, driven by its transverse partials: the phantom
// partials of a struck string (Conklin 1999; Bank & Sujbert 2005).
//
// A string of stiffness EA and mass μ per length, swinging transversely as u = Σ qₙ φₙ, stretches
// unevenly along its length; the stretch travels as longitudinal waves,
//
//   μ ξ_tt = EA ξ_xx + (EA/2)(u_x²)_x,      modes at k·f_L, f_L = √(EA/μ)/2L,
//
// and mode k is driven by G_k = (1/L)∫u_x² cos(kπx/L) dx. For sine modes (φₙ′ ∝ cos nπx/L) only
// pairs of partials k apart reach it: G_k = Σ √(gₙ gₙ₊ₖ) qₙ qₙ₊ₖ / L, gₙ = ∫φₙ′² (a mode's stretch
// weight, as in tension modulation), at the sums and differences of their frequencies. With H_k the
// mode's response to G_k (unit gain below k·f_L), the tension at the bridge beyond tension
// modulation's uniform ΔT is
//
//   ΔF = EA Σₖ (−1)ᵏ (G_k − H_k) = 2kc Σₖ (−1)ᵏ (Ĝ_k − Ĥ_k),      Ĝ = L·G, kc = EA/2L
//
// nothing far below a mode (the stretch is uniform there: that is tension modulation), a peak at
// it, and the local pull of u_x(L)² above it. This runs the modes below fMax from each family's
// lowest partials, summed over a unison (whose strings move nearly together: ν strings give 1/ν of
// the summed amplitudes' pairs), and leaves out pairs that sum below `below` × a mode's frequency
// (24 dB down and more at ¼). It is heard, not fed back into the strings.
//
// Fixed arrays: nothing is allocated.
#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <numbers>

namespace forte {

struct Longitudinal {
  static constexpr int MODES = 8, PARTIALS = 24, FAMILIES = 2;
  static constexpr int SLOTS = FAMILIES * PARTIALS, PAIRS = FAMILIES * MODES * PARTIALS;

  int nSlot = 0, nMode = 0, nu = 1;
  std::array<std::array<int16_t, 3>, SLOTS> slotAt{}; // a slot's mode in each unison string
  std::array<double, SLOTS> slotQ{};
  std::array<uint8_t, PAIRS> pairA{}, pairB{};
  std::array<double, PAIRS> pairC{};
  std::array<int, MODES + 1> pairsOf{}; // mode m's pairs: pairsOf[m] … pairsOf[m + 1]
  struct Mode { double a1, a2, b, sign, h0, h1; };
  std::array<Mode, MODES> mode{};
  double gain = 0;      // the output per unit of 2kc·Σ(…): set by the engine
  bool ringing = false; // a strike sets it; the decay clears it

  int pairs() const { return pairsOf[nMode]; }

  // Build from a voice's modes. at(f, n, u): the index of family f's partial n (from 0) in unison
  // string u, or −1; omega(i), g(i): a mode's frequency (rad/s) and stretch weight. M partials a
  // family (≤ PARTIALS), K modes (≤ MODES), each with quality factor Q; fL in Hz; fs the sample rate.
  template <class At, class Omega, class G>
  void build(int M, int K, double fL, double fs, int strings, double fMax, double below, double Q, At at, Omega omega, G g) {
    nSlot = nMode = 0; ringing = false; nu = std::clamp(strings, 1, 3);
    pairsOf[0] = 0;
    M = std::min(M, PARTIALS); K = std::min(K, MODES);
    if (M <= 0 || K <= 0 || !(fL > 0)) return;
    fMax = std::min(fMax, 0.45 * fs);
    std::array<int, SLOTS> slotOf;
    slotOf.fill(-1);
    const auto complete = [&](int f, int n) { for (int u = 0; u < nu; u++) if (at(f, n, u) < 0) return false; return true; };
    const auto slot = [&](int f, int n) {
      const int s = f * PARTIALS + n;
      if (slotOf[s] < 0) {
        slotOf[s] = nSlot;
        for (int u = 0; u < 3; u++) slotAt[nSlot][u] = (int16_t)(u < nu ? at(f, n, u) : -1);
        nSlot++;
      }
      return slotOf[s];
    };
    const double k = 1 / fs, TWO_PI = 2 * std::numbers::pi;
    int np = 0;
    for (int kk = 1; kk <= K; kk++) {
      const double fk = kk * fL;
      if (fk > fMax) break;
      pairsOf[nMode] = np;
      for (int f = 0; f < FAMILIES; f++)
        for (int n = 0; n + kk < M; n++) {
          if (!complete(f, n) || !complete(f, n + kk)) continue;
          const int ia = at(f, n, 0), ib = at(f, n + kk, 0);
          const double sum = (omega(ia) + omega(ib)) / TWO_PI;
          if (sum < below * fk || sum > fMax) continue;
          pairA[np] = (uint8_t)slot(f, n); pairB[np] = (uint8_t)slot(f, n + kk);
          pairC[np] = std::sqrt(g(ia) * g(ib));
          np++;
        }
      const double w0 = TWO_PI * fk, sg = w0 / (2 * Q), r = std::exp(-sg * k), wd = std::sqrt(std::max(w0 * w0 - sg * sg, 1e-6));
      Mode &m = mode[nMode];
      m.a1 = 2 * r * std::cos(wd * k); m.a2 = r * r;
      m.b = 1 - m.a1 + m.a2; // unit gain far below the mode
      m.sign = kk % 2 ? -1 : 1;
      m.h0 = m.h1 = 0;
      nMode++;
    }
    pairsOf[nMode] = np;
    if (np == 0) nSlot = nMode = 0;
  }

  // One sample from the newest amplitudes q: gain × Σ (−1)ᵏ (Ĝ_k − Ĥ_k) (the engine puts 2kc/ν in gain).
  double step(const double *q) {
    for (int s = 0; s < nSlot; s++) {
      double x = 0;
      for (int u = 0; u < nu; u++) x += q[slotAt[s][u]];
      slotQ[s] = x;
    }
    double F = 0;
    for (int m = 0; m < nMode; m++) {
      double G = 0;
      for (int i = pairsOf[m]; i < pairsOf[m + 1]; i++) G += pairC[i] * slotQ[pairA[i]] * slotQ[pairB[i]];
      Mode &l = mode[m];
      const double h = l.a1 * l.h0 - l.a2 * l.h1 + l.b * G;
      F += l.sign * (G - l.h0);
      l.h1 = l.h0; l.h0 = h;
    }
    return gain * F;
  }

  void quiet() { ringing = false; for (int m = 0; m < nMode; m++) mode[m].h0 = mode[m].h1 = 0; }
};

} // namespace forte
