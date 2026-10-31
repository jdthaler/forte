// pipes-flue.cpp — one flue pipe in real time (pipes-flue.h).

#include "pipes-flue.h"

#include <algorithm>
#include <cmath>

namespace forte::pipes {

namespace {
constexpr double PI = std::numbers::pi;
}

int FluePipe::lineLength(double tauK) {
  int N = 64;
  while (N < std::min(8192.0, tauK / U_BUF + 8)) N <<= 1;
  return N;
}

// Its constants and state. Modes: per mode 6 constants (exact transition over one step for
// x'' + 2σx' + ω²x = F/M, F held) and 2 states (volume displacement x, volume flow v).
void FluePipe::init(const FlueSetup &s, const PipeModel *model, int r, double *line, double bent) {
  R = model; rank = r; stopped = model->stopped;
  os = s.os;
  fsI = s.fs * os; h = 1 / fsI; n = model->nModes;
  // Quality: the engine may leave out the pipe's highest modes, the weakest of its sound
  while (n > 3 && (n > s.maxModes || model->modes[n - 1].om > TAU * s.maxF)) n--;
  const Geometry &g = model->geo;
  retime(1);
  // the jet
  W = g.W; b = g.b; H = g.H; y0 = g.y0; ib = 1 / g.b;
  bH = g.b * g.H;                             // jet flow into the pipe = bHU_j(1 + tanh)
  hA = g.h * model->A;                        // η = (hA/U_j)·v
  Ks = (AIR.rho * g.dd) / g.Sm;               // Δp_src = Ks dQ_in/dt
  Kl = AIR.rho / (2 * ALPHA_VC * ALPHA_VC);   // Δp_los = −Kl v|v|
  iSm = 1 / g.Sm;
  flue = g.h * g.H;                           // the flue's area: the wind it draws is hH·U_j
  N = lineLength((g.W / CP) * fsI);
  buf = line; mask = N - 1; maxD = N - 4; w = 0;
  std::fill(buf, buf + N, 0.0);
  noise = s.noise; ni = (int)std::floor(FLUE_NOISE_N * (0.5 + s.draw)) % FLUE_NOISE_N;
  for (int k = 0; k < n; k++) x[k] = v[k] = 0;
  lp = qin = vm = Q = dp = eta = out = 0; asleep = true; foot = Uj = 0;
  track = s.track; dsp = mean = prev = t = 0; last = -1; per = 0; nx = 0;
  kMean = 1 - std::exp(-h * 2 * PI * std::min(20.0, model->f / 8));
  if (bent != 1) retime(bent);
}

// The constants of one step of this pipe's own time, r/fsI: pitch bend, the organ's air warmer
// (r > 1) or colder, so that sound and the jet both cross the pipe r× faster. The radiated
// derivative stays in real time.
void FluePipe::retime(double r) {
  const double hs = r == 1 ? h : r / fsI;
  for (int k = 0; k < n; k++) {
    const double w = R->modes[k].om, sg = R->modes[k].sigma, z = sg / w;
    const double wd = w * std::sqrt(std::max(1e-12, 1 - z * z)), e = std::exp(-sg * hs);
    const double co = std::cos(wd * hs), si = std::sin(wd * hs);
    const double p11 = e * (co + ((z * w) / wd) * si), p12 = (e * si) / wd, p21 = (-e * w * w * si) / wd, p22 = e * (co - ((z * w) / wd) * si);
    const double kk = R->M * w * w;
    c[6 * k] = p11; c[6 * k + 1] = p12; c[6 * k + 2] = p21; c[6 * k + 3] = p22; c[6 * k + 4] = (1 - p11) / kk; c[6 * k + 5] = -p21 / kk;
    om[k] = w;
  }
  const Geometry &g = R->geo;
  double cvs = 0;
  for (int k = 0; k < n; k++) cvs += c[6 * k + 5];
  cv = cvs / g.Sm;                            // the mouth speed one step of a held pressure adds, per pascal
  fsS = r == 1 ? fsI : fsI / r;               // steps per second of the pipe's own time
  tauK = (g.W / CP) * fsS;                    // τ in samples = tauK / U_j
  kxc = PHI_C / tauK;                         // the jet low-pass's ω_c·h = φ_c/τ = kxc·U_j
  rt = r;
}

void FluePipe::reset() {
  for (int k = 0; k < n; k++) x[k] = v[k] = 0;
  std::fill(buf, buf + N, 0.0);
  lp = qin = vm = Q = dp = eta = out = 0;
}

double FluePipe::energy() const { // a measure of the modes' motion (volume flow², m⁶/s²)
  double e = 0;
  for (int k = 0; k < n; k++) e += v[k] * v[k] + std::pow(om[k] * x[k], 2);
  return e;
}

// One step at this pipe's own rate with jet speed Uj (m/s), 1/Uj, and noise scaled by nz. Leaves
// the radiated d/dt(mouth flow) in out.
void FluePipe::step(double uj, double iU, double nz) {
  double qn = 0, et = 0, l = lp;
  if (uj > 0) { // as the wind dies the jet's flow goes smoothly to nothing (bHU_j → 0)
    const double tau = tauK * iU;
    double d = tau - 1; // one sample of the loop is in the held force and the backward difference
    if (d < 1) d = 1; else if (d > maxD) d = maxD;
    const int i = (int)d;
    const double f = d - i;
    const int p = w - 1 - i;
    const double x0 = buf[(p + 1) & mask], x1 = buf[p & mask], x2 = buf[(p - 1) & mask], x3 = buf[(p - 2) & mask];
    const double vd = (((0.5 * (x3 - x0) + 1.5 * (x1 - x2)) * f + (x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3)) * f + 0.5 * (x2 - x0)) * f + x1;
    const int k = ni;
    ni = k + 1 == FLUE_NOISE_N ? 0 : k + 1;
    const double xc = kxc * uj; // the jet's low-pass, corner ω_c τ = φ_c (backward Euler), turbulence included
    l += (xc / (1 + xc)) * (vd + nz * uj * noise[k] - l);
    et = hA * iU * l;
    double u = (et - y0) * ib;
    u = u > 3 ? 1 : u < -3 ? -1 : (u * (27 + u * u)) / (27 + 9 * u * u); // tanh, Padé (C¹ at ±3)
    qn = bH * uj * (1 + u);
  } else l *= 0.99;
  lp = l; eta = et;
  // the modes' free motion over the step, then the pressure: the jet's drive Ks·dQ_in/dt, and the
  // vortex-shedding loss −Kl·v|v| at the new mouth speed v = v_free + cv·F (implicit: a quadratic)
  double vf = 0;
  for (int k = 0, j = 0; k < n; k++, j += 6) {
    const double xk = x[k], vk = v[k];
    x[k] = c[j] * xk + c[j + 1] * vk;
    const double nv = c[j + 2] * xk + c[j + 3] * vk;
    v[k] = nv; vf += nv;
  }
  const double Fs = Ks * (qn - qin) * fsS, r = (vf * iSm) + cv * Fs, ar = r < 0 ? -r : r;
  const double kc = cv * Kl, vn = ar > 0 ? (2 * ar) / (1 + std::sqrt(1 + 4 * kc * ar)) : 0, v2 = r < 0 ? -vn : vn;
  const double F = Fs - Kl * v2 * vn;
  qin = qn; dp = F;
  double q = 0;
  for (int k = 0, j = 0; k < n; k++, j += 6) { x[k] += c[j + 4] * F; const double nv = v[k] + c[j + 5] * F; v[k] = nv; q += nv; }
  vm = v2;
  buf[w] = v2; w = (w + 1) & mask;
  out = (q - Q) * fsI; Q = q;
  if (track) { // on the flow's running integral (the air's displacement), which the upper modes disturb less
    dsp = dsp * (1 - kMean) + v2;
    mean += kMean * (dsp - mean);
    const double y = dsp - mean, py = prev;
    const double tt = ++t;
    if (py < 0 && y >= 0) {
      const double tc = tt - 1 + py / (py - y);
      if (last >= 0) { const double T1 = tc - last; per = per > 0 ? per + 0.3 * (T1 - per) : T1; }
      last = tc; nx++;
    }
    prev = y;
  }
}

} // namespace forte::pipes
