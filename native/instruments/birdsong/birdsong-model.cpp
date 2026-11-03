// birdsong-model.cpp — the syrinx's normal form and the vocal tract (birdsong-model.h).

#include "birdsong-model.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"
#include "forte/fdlibm.h"

namespace forte::birdsong {

void rk4(State &s, double a, double b, double h) {
  const double x = s.x, v = s.v;
  const double k1x = v, k1v = accel(a, b, x, v);
  const double k2x = v + 0.5 * h * k1v, k2v = accel(a, b, x + 0.5 * h * k1x, v + 0.5 * h * k1v);
  const double k3x = v + 0.5 * h * k2v, k3v = accel(a, b, x + 0.5 * h * k2x, v + 0.5 * h * k2v);
  const double k4x = v + h * k3v, k4v = accel(a, b, x + h * k3x, v + h * k3v);
  s.x = x + (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
  s.v = v + (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
}

double onset(double beta) {
  if (beta <= -0.25) return 0;
  const double x = (2 + std::sqrt(4 + 12 * beta)) / 6;
  return x * x - 2 * x * x * x;
}

// The roots of g(x) = α + βx + x² − x³, which falls from +∞ to −∞: bracketed on a grid wide
// enough for every α and β the instrument plays, then bisected to the last bit.
int fixedPoints(double alpha, double beta, double *out) {
  const auto g = [&](double x) { return alpha + beta * x + x * x - x * x * x; };
  int n = 0;
  const double lo = -4, hi = 4;
  const int N = 800;
  double xa = lo, ga = g(lo);
  for (int i = 1; i <= N && n < 3; i++) {
    const double xb = lo + (hi - lo) * i / N, gb = g(xb);
    if (ga == 0) out[n++] = xa;
    else if ((ga > 0) != (gb > 0) && gb != 0) {
      double a = xa, b = xb, fa = ga;
      for (int k = 0; k < 80; k++) {
        const double m = 0.5 * (a + b), fm = g(m);
        if ((fm > 0) == (fa > 0)) { a = m; fa = fm; } else b = m;
      }
      out[n++] = 0.5 * (a + b);
    }
    xa = xb; ga = gb;
  }
  return n;
}

double restX(double alpha, double beta) {
  double r[3];
  const int n = fixedPoints(alpha, beta, r);
  return n ? r[n - 1] : 0;
}

// Integrate from rest at (α, β), timing each upward zero of v (x at its minimum), until the period
// settles: two successive periods within 1e-9, or a geometric run of them whose Aitken limit is
// within 1e-8 (slow near the Hopf line, where the swing grows at a rate ∝ the distance past it).
// Leaves s at x's next minimum; returns the period in τ (0: the labia came to rest).
static double settle(double alpha, double beta, State &s) {
  constexpr double h = H_MAX;
  constexpr int MAX_STEPS = 150000;
  s = State{restX(ALPHA_REST, beta), 0};
  if (beta < -0.25 && alpha < 0) {
    // past the Hopf line the cycle is the only attractor: start on its first-order size, where the
    // swing's average damping x + x² vanishes, ⟨x + x²⟩ = x₀ + x₀² + A²/2 = 0, not from rest (near
    // the line the swing would take thousands of periods to grow)
    const double x0 = restX(alpha, beta);
    s = State{x0 + std::sqrt(std::max(0.0, -2 * (x0 + x0 * x0))), 0};
  }
  double t = 0, prev = s.v, last = -1, p0 = 0, p1 = 0, p2 = 0, period = 0;
  int periods = 0;
  for (int step = 0; step < MAX_STEPS; step++) {
    rk4(s, alpha, beta, h);
    t += h;
    if (prev < 0 && s.v >= 0) {
      const double tc = t - h * s.v / (s.v - prev);
      if (last >= 0) {
        p0 = p1; p1 = p2; p2 = tc - last; periods++;
        period = p2;
        if (periods >= 4) {
          const double d1 = p1 - p0, d2 = p2 - p1;
          if (std::fabs(d2) < 1e-9 * p2) break;
          const double den = d2 - d1;
          if (periods >= 8 && std::fabs(d2) < 1e-6 * p2 && std::fabs(d2) < 0.999 * std::fabs(d1) && den != 0 && std::fabs(d2 * d2 / den) < 1e-8 * p2) {
            period = p2 - d2 * d2 / den;
            break;
          }
        }
      }
      last = tc;
    }
    prev = s.v;
  }
  if (periods < 3 || !(period > 0) || std::fabs(s.v) + std::fabs(s.x - restX(alpha, beta)) < 1e-9) return 0;
  // on to the next minimum, where v turns upward, to the nearest bit of a step
  for (int step = 0; step < MAX_STEPS; step++) {
    State n = s;
    rk4(n, alpha, beta, h);
    if (s.v < 0 && n.v >= 0) { rk4(s, alpha, beta, h * (-s.v) / (n.v - s.v)); break; }
    s = n;
  }
  return period;
}

Cycle limitCycle(double alpha, double beta) {
  Cycle c;
  State s;
  const double period = settle(alpha, beta, s);
  if (!(period > 0)) return c;
  c.ok = true;
  c.omega = TAU / period;
  // one period from x's minimum in M equal steps: its extent and Fourier series
  constexpr int M = 256;
  const double hs = period / M;
  double re[HARMONICS] = {}, im[HARMONICS] = {}, cs[M], sn[M];
  for (int j = 0; j < M; j++) { cs[j] = fdlibm::cos(TAU * j / M); sn[j] = fdlibm::sin(TAU * j / M); }
  c.xmin = c.xmax = s.x; c.vmin = c.vmax = s.v;
  for (int j = 0; j < M; j++) {
    for (int k = 0; k < HARMONICS; k++) {
      const int ph = ((k + 1) * j) % M;
      re[k] += s.x * cs[ph]; im[k] -= s.x * sn[ph];
    }
    rk4(s, alpha, beta, hs);
    c.xmin = std::min(c.xmin, s.x); c.xmax = std::max(c.xmax, s.x);
    c.vmin = std::min(c.vmin, s.v); c.vmax = std::max(c.vmax, s.v);
  }
  for (int k = 0; k < HARMONICS; k++) c.c[k] = 2 * std::sqrt(re[k] * re[k] + im[k] * im[k]) / M;
  return c;
}

int cyclePoints(double alpha, double beta, double *xv, int n) {
  State s;
  const double period = n >= 2 ? settle(alpha, beta, s) : 0;
  if (!(period > 0)) return 0;
  const int sub = std::max(1, (int)std::ceil(period / n / H_MAX));
  const double hs = period / n / sub;
  for (int j = 0; j < n; j++) {
    xv[2 * j] = s.x; xv[2 * j + 1] = s.v;
    for (int k = 0; k < sub; k++) rk4(s, alpha, beta, hs);
  }
  return n;
}

// Pᵢ = A x − r Pᵢ(t − T), out = (1 − r) Pᵢ(t − T/2):  H = (1 − r) e^{−iωT/2} / (1 + r e^{−iωT})
double tracheaGain(double f, double L, double r) {
  const double wT = TAU * f * 2 * L / C_AIR;
  const double re = 1 + r * fdlibm::cos(wT), im = -r * fdlibm::sin(wT);
  return (1 - r) / std::sqrt(re * re + im * im);
}

// H(s) = (ω₀/Q) s / (s² + (ω₀/Q) s + ω₀²), 1 at ω₀
double oecGain(double f, double fo, double Q) {
  const double u = f / fo, re = 1 - u * u, im = u / Q;
  return (u / Q) / std::sqrt(re * re + im * im);
}

} // namespace forte::birdsong
