// sympathetic.h — sympathetic strings: the undamped strings of an instrument ringing along with the
// strings that sound, through the bridge they share.
//
// In the instruments' voices each partial of a string meets the bridge through a coupling c: the
// bridge signal is S = Σ c q̇ (per channel: vertical and horizontal), and it pushes back on each
// partial with a force −c S, so that a partial drains into the bridge at c²/2. Another string on the
// bridge feels the same signal, scaled by κ (the share of the bridge's motion one string feels from
// another's: 1 if they all met it at one point). Every string's motion splits, by superposition,
// into what its own hammer or plectrum started (the voice, as before: no coupling) and what the
// other strings drive (a group here), which feels every other string, voice and group:
//
//   q̈ₙ + 2σₙ q̇ₙ + ωₙ² qₙ = −κ (c_V,ₙ S_V + c_H,ₙ S_H),   S = Σ over other strings' voices and groups
//
// so the sympathetic strings also drive one another and give back what a sounding string loses to
// them (a string's voice and group sum to its motion). σₙ carries the string's own bridge loss, so
// a group needs no feedback of its own. A group is one string (or one key's unison, as its in-phase
// mode: c√ν for ν strings, draining at ν c²/2): its lowest partials. Each partial steps exactly
// between samples (impulse-invariant), the others' signal held over the step: the voices' as the
// engine aligns it, the groups' of the step before (explicit, as the voices' own bridge).
//
// Fixed arrays, sized at construction: nothing is allocated after it.
#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <vector>

namespace forte {

// One partial of a sympathetic string, as an engine describes it.
struct SympatheticMode {
  double omega = 0;      // rad/s
  double sigma = 0;      // s⁻¹: its whole decay with the damper up, the bridge's share included
  double damped = 0;     // s⁻¹: with the damper down
  double cV = 0, cH = 0; // its couplings to the bridge signals (S = Σ c q̇, force −c S)
  double oV = 0, oH = 0; // its output weights on q (unless the outputs are the bridge signals)
  double loud = 0;       // its output per unit q, for the quiet test
};

class Sympathetic {
 public:
  static constexpr int TAPS = 4; // outputs per group
  // groups × perGroup partials, run in blocks of at most maxBlock samples; outputs: Σ o q per
  // channel, or (velocity) the group's own bridge signals S_V, S_H.
  Sympathetic(int groups, int perGroup, int maxBlock, double fs, bool velocity)
      : G(groups), M(perGroup), B(maxBlock), k(1 / fs), vel(velocity), n_(groups, 0), e0(groups, 0), e1(groups, 0), damped_(groups, 1),
        silent_(groups, 1), par(groups, 0), nt(groups, 0), taps(groups), bV(groups, 0), bH(groups, 0), ownV(groups, nullptr),
        ownH(groups, nullptr), live(groups), zero(maxBlock, 0.0), out((size_t)2 * groups * maxBlock), a1((size_t)groups * perGroup),
        a2(a1.size()), a1d(a1.size()), a2d(a1.size()), iV(a1.size()), iH(a1.size()), sV(a1.size()), sH(a1.size()), oV(a1.size()),
        oH(a1.size()), ld(a1.size()), qa(a1.size()), qb(a1.size()) {}

  int groups() const { return G; }
  int size(int g) const { return n_[g]; }
  int running = 0;     // the partials that ran in the last call (the CPU pill, the tests)
  double quiet = 1e-7; // below this (in the output's units) a group is still

  // Group g's partials (at most perGroup; the audio thread: no allocation). Its state is kept when
  // the partials are the same in number and kind (a retune moves them a little), cleared otherwise.
  // They are kept in three runs: those that meet only the vertical channel, only the horizontal,
  // and both.
  void set(int g, const SympatheticMode *m, int n) {
    n = std::min(n, M);
    int kind[3] = {0, 0, 0};
    for (int i = 0; i < n; i++) kind[chan(m[i])]++;
    if (n != n_[g] || kind[0] != e0[g] || kind[0] + kind[1] != e1[g]) clear(g);
    const size_t at = (size_t)g * M;
    int to[3] = {0, kind[0], kind[0] + kind[1]};
    for (int i = 0; i < n; i++) {
      const SympatheticMode &d = m[i];
      const size_t j = at + to[chan(d)]++;
      coef(d.omega, d.sigma, a1[j], a2[j]);
      coef(d.omega, d.damped, a1d[j], a2d[j]);
      const double r = std::exp(-d.sigma * k), wd = std::sqrt(std::max(d.omega * d.omega - d.sigma * d.sigma, 1e-6));
      const double b = (k * r * std::sin(wd * k)) / wd; // impulse-invariant input gain
      iV[j] = b * d.cV; iH[j] = b * d.cH;
      sV[j] = d.cV / k; sH[j] = d.cH / k; // S from the step's change in q
      oV[j] = d.oV; oH[j] = d.oH; ld[j] = d.loud;
    }
    n_[g] = n; e0[g] = kind[0]; e1[g] = kind[0] + kind[1];
  }
  void clear(int g) {
    const size_t at = (size_t)g * M;
    std::fill(qa.begin() + at, qa.begin() + at + M, 0.0);
    std::fill(qb.begin() + at, qb.begin() + at + M, 0.0);
    silent_[g] = 1; bV[g] = bH[g] = 0;
  }
  void remove(int g) { clear(g); n_[g] = 0; }
  void damp(int g, bool on) { damped_[g] = on; }
  bool damped(int g) const { return damped_[g]; }
  // still: its state is (as good as) zero
  bool silent(int g) const { return silent_[g]; }
  // Its outputs: up to TAPS of (bus, weight on the V output, weight on the H output).
  struct Tap { int bus = -1; double wV = 0, wH = 0; };
  void route(int g, const Tap *t, int n) {
    nt[g] = std::min(n, TAPS);
    for (int i = 0; i < TAPS; i++) taps[g][i] = i < n ? t[i] : Tap{};
  }
  // whether group g has partials that meet the horizontal channel
  bool horizontal(int g) const { return e0[g] < n_[g]; }
  // The bridge signals of the voices whose motion is group g's own string's (the engine aligns
  // them with the steps, as vV and vH below); null: none. Set before each run, cleared by it.
  void own(int g, const double *v, const double *h) { ownV[g] = v; ownH[g] = h; }

  // n samples of every group that has partials and is undamped or still rings, in lockstep:
  // driven by κ times the voices' bridge signals vV[s], vH[s] (all of them: a group's own voices'
  // are taken out) and the groups' of the step before (its own taken out). Adds each group's
  // outputs into bus[tap.bus][s]. driven: whether any voice sounds (if not, a still group sleeps).
  void run(double kappa, const double *vV, const double *vH, bool driven, int n, double *const *bus) {
    n = std::min(n, B);
    int L = 0;
    running = 0;
    for (int g = 0; g < G && !driven; g++) if (n_[g] && !silent_[g]) driven = true; // a ringing group drives the rest
    double BV = 0, BH = 0;
    for (int g = 0; g < G; g++) {
      if (!n_[g] || (silent_[g] && (damped_[g] || !driven))) { ownV[g] = ownH[g] = nullptr; bV[g] = bH[g] = 0; continue; }
      const size_t at = (size_t)g * M;
      // every running group's q and q1 swap roles on the same samples: line up a group that sat out
      if (par[g] != flip) { std::swap_ranges(qa.begin() + at, qa.begin() + at + n_[g], qb.begin() + at); par[g] = flip; }
      const bool dm = damped_[g];
      Live &v = live[L++];
      v.g = g; v.n = n_[g]; v.a = e0[g]; v.b = e1[g];
      v.r = Run{(dm ? a1d.data() : a1.data()) + at, (dm ? a2d.data() : a2.data()) + at, iV.data() + at, iH.data() + at, sV.data() + at,
                sH.data() + at, oV.data() + at, oH.data() + at, (flip ? qb.data() : qa.data()) + at, (flip ? qa.data() : qb.data()) + at};
      v.ownV = ownV[g] ? ownV[g] : zero.data(); v.ownH = ownH[g] ? ownH[g] : zero.data();
      v.bv = bV[g]; v.bh = bH[g];
      v.outV = out.data() + (size_t)(2 * (L - 1)) * B; v.outH = v.outV + B;
      BV += bV[g]; BH += bH[g]; running += n_[g];
    }
    for (int s = 0; s < n; s++) {
      const double dv0 = kappa * (vV[s] + BV), dh0 = kappa * (vH[s] + BH);
      double nV = 0, nH = 0;
      for (int i = 0; i < L; i++) {
        Live &v = live[i];
        const double dv = dv0 - kappa * (v.ownV[s] + v.bv), dh = dh0 - kappa * (v.ownH[s] + v.bh);
        double S[4] = {0, 0, 0, 0}; // the group's S_V, S_H, and its outputs V, H
        if (vel) {
          if (v.a == v.n) step<0, false>(v.r, 0, v.n, dv, dh, S);
          else { step<0, false>(v.r, 0, v.a, dv, dh, S); step<1, false>(v.r, v.a, v.b, dv, dh, S); step<2, false>(v.r, v.b, v.n, dv, dh, S); }
          v.outV[s] = S[0]; v.outH[s] = S[1];
        } else {
          if (v.a == v.n) step<0, true>(v.r, 0, v.n, dv, dh, S);
          else { step<0, true>(v.r, 0, v.a, dv, dh, S); step<1, true>(v.r, v.a, v.b, dv, dh, S); step<2, true>(v.r, v.b, v.n, dv, dh, S); }
          v.outV[s] = S[2]; v.outH[s] = S[3];
        }
        v.bv = S[0]; v.bh = S[1]; nV += S[0]; nH += S[1];
        std::swap(v.r.q, v.r.q1);
      }
      BV = nV; BH = nH;
    }
    if (n & 1) flip ^= 1;
    for (int i = 0; i < L; i++) {
      const Live &v = live[i];
      const int g = v.g;
      bV[g] = v.bv; bH[g] = v.bh;
      // the outputs, by tap
      for (int t = 0; t < nt[g]; t++) {
        double *o = bus[taps[g][t].bus];
        const double wv = taps[g][t].wV, wh = taps[g][t].wH;
        if (wh == 0) for (int s = 0; s < n; s++) o[s] += wv * v.outV[s];
        else for (int s = 0; s < n; s++) o[s] += wv * v.outV[s] + wh * v.outH[s];
      }
      // still once every partial's output is below the threshold; a damped still group is cleared,
      // and a partial a hundredth of it, so that none decays on into subnormal numbers (slow)
      const size_t at = (size_t)g * M;
      double most = 0;
      for (int j = 0; j < n_[g]; j++) {
        const double x = ld[at + j] * (std::fabs(qa[at + j]) + std::fabs(qb[at + j]));
        if (x < 0.01 * quiet) qa[at + j] = qb[at + j] = 0;
        most = std::max(most, x);
      }
      par[g] = flip;
      silent_[g] = most < quiet;
      if (silent_[g] && damped_[g]) clear(g);
      ownV[g] = ownH[g] = nullptr;
    }
  }

  // Group g's energy per unit mass, Σ (ω² q² + q̇²)/2 over its partials (the tests): from the
  // recursion's invariant, so that it does not ripple within a period. With a₁ = 2r cos θ, a₂ = r²
  // (θ = ω_d k), a free partial A cos(ω_d t) keeps q² − 2 cos θ q (r q₁) + (r q₁)² = A² sin²θ.
  double energy(int g) const {
    const size_t at = (size_t)g * M;
    const double *q = (par[g] ? qb : qa).data() + at, *q1 = (par[g] ? qa : qb).data() + at;
    double e = 0;
    for (int i = 0; i < n_[g]; i++) {
      const size_t j = at + i;
      const double r = std::sqrt(a2[j]), c = std::clamp(a1[j] / (2 * r), -1.0, 1.0), s2 = std::max(1 - c * c, 1e-30), wd = std::acos(c) / k;
      const double x = q[i], y = r * q1[i];
      e += (0.5 * wd * wd * (x * x - 2 * c * x * y + y * y)) / s2;
    }
    return e;
  }

 private:
  static int chan(const SympatheticMode &d) { return d.cH == 0 ? 0 : d.cV == 0 ? 1 : 2; }
  void coef(double w, double sg, double &A1, double &A2) const {
    const double r = std::exp(-sg * k), wd = std::sqrt(std::max(w * w - sg * sg, 1e-6));
    A1 = 2 * r * std::cos(wd * k); A2 = r * r;
  }
  struct Run { const double *A1, *A2, *IV, *IH, *SV, *SH, *OV, *OH; double *q, *q1; };
  // a group running this block
  struct Live {
    int g = 0, n = 0, a = 0, b = 0;
    Run r{};
    const double *ownV = nullptr, *ownH = nullptr;
    double bv = 0, bh = 0;
    double *outV = nullptr, *outH = nullptr;
  };
  // One step of partials [i0, i1) of one kind (C: 0 vertical, 1 horizontal, 2 both): q1 (q[n−1])
  // takes q[n+1]. Adds to S: the bridge signals S_V, S_H and (O) the outputs. Two sums each, so
  // the additions need not wait on one another.
  template <int C, bool O>
  static void step(const Run &r, int i0, int i1, double dv, double dh, double *S) {
    double v0 = 0, v1 = 0, h0 = 0, h1 = 0, o0 = 0, o1 = 0, p0 = 0, p1 = 0;
    int i = i0;
    for (; i + 1 < i1; i += 2) {
      const double x0 = r.q[i], y0 = r.q[i + 1];
      double f0 = 0, f1 = 0;
      if (C != 1) { f0 += r.IV[i] * dv; f1 += r.IV[i + 1] * dv; }
      if (C != 0) { f0 += r.IH[i] * dh; f1 += r.IH[i + 1] * dh; }
      const double x = r.A1[i] * x0 - r.A2[i] * r.q1[i] - f0, y = r.A1[i + 1] * y0 - r.A2[i + 1] * r.q1[i + 1] - f1;
      r.q1[i] = x; r.q1[i + 1] = y;
      if (C != 1) { v0 += r.SV[i] * (x - x0); v1 += r.SV[i + 1] * (y - y0); }
      if (C != 0) { h0 += r.SH[i] * (x - x0); h1 += r.SH[i + 1] * (y - y0); }
      if (O) {
        if (C != 1) { o0 += r.OV[i] * x; o1 += r.OV[i + 1] * y; }
        if (C != 0) { p0 += r.OH[i] * x; p1 += r.OH[i + 1] * y; }
      }
    }
    if (i < i1) {
      const double x0 = r.q[i];
      double f0 = 0;
      if (C != 1) f0 += r.IV[i] * dv;
      if (C != 0) f0 += r.IH[i] * dh;
      const double x = r.A1[i] * x0 - r.A2[i] * r.q1[i] - f0;
      r.q1[i] = x;
      if (C != 1) v0 += r.SV[i] * (x - x0);
      if (C != 0) h0 += r.SH[i] * (x - x0);
      if (O) { if (C != 1) o0 += r.OV[i] * x; if (C != 0) p0 += r.OH[i] * x; }
    }
    S[0] += v0 + v1; S[1] += h0 + h1;
    if (O) { S[2] += o0 + o1; S[3] += p0 + p1; }
  }

  int G, M, B;
  double k;
  bool vel;
  uint8_t flip = 0; // q and q1 have swapped an odd number of times
  std::vector<int> n_, e0, e1; // each group's partials: [0, e0) vertical, [e0, e1) horizontal, [e1, n) both
  std::vector<uint8_t> damped_, silent_, par;
  std::vector<int> nt;
  std::vector<std::array<Tap, TAPS>> taps;
  std::vector<double> bV, bH; // each group's bridge signals of the last step
  std::vector<const double *> ownV, ownH;
  std::vector<Live> live;
  std::vector<double> zero, out; // a block of nothing (no own voices); each running group's outputs
  std::vector<double> a1, a2, a1d, a2d, iV, iH, sV, sH, oV, oH, ld, qa, qb;
};

} // namespace forte
