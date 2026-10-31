// bubbles-model.cpp — the bubble's physics (bubbles-model.h).

#include "bubbles-model.h"

#include <algorithm>

#include "bubbles-params.h"
#include "forte/dsp.h"

namespace forte::bubbles {

double nozzleX(int key) { return NOZZLE_PITCH * (std::min(KEY_HI, std::max(KEY_LO, key)) - KEY_LO); }
static double rHydro(double x, int i) { return std::hypot(x - HYDRO_X[i], HYDRO_BACK); }
const double R_REF = rHydro(ROW / 2, 0);
void hydrophoneGains(int key, double out[2]) {
  const double x = nozzleX(key);
  out[0] = R_REF / rHydro(x, 0); out[1] = R_REF / rHydro(x, 1);
}

// Φ = 3γ / (1 − 3(γ−1) iχ [√(i/χ) coth √(i/χ) − 1]) (e^{iωt} convention), with X = √(2/χ):
// √(i/χ) = (1 + i)X/2 and coth((1+i)X/2) = (sinh X − i sin X)/(cosh X − cos X).
Complex phi(double chi, double gamma) {
  const double X = std::sqrt(2 / chi);
  double zr, zi; // z·coth z − 1 with z = (1 + i)X/2
  if (X > 40) { zr = X / 2 - 1; zi = X / 2; } // coth → 1
  else {
    const double sh = std::sinh(X), sn = std::sin(X), C = std::cosh(X) - std::cos(X);
    zr = (X * (sh + sn)) / (2 * C) - 1; zi = (X * (sh - sn)) / (2 * C);
  }
  const double g3 = 3 * (gamma - 1) * chi, dr = 1 + g3 * zi, di = -g3 * zr, m2 = dr * dr + di * di;
  return {(3 * gamma * dr) / m2, (-3 * gamma * di) / m2};
}

double riseSpeed(double R, const Liquid &liq) {
  const double uh = (liq.rho * G * R * R) / (3 * liq.mu), um = std::sqrt(liq.sigma / (liq.rho * R) + G * R);
  return 1 / std::sqrt(1 / (uh * uh) + 1 / (um * um));
}
// dv/dt = 2g(1 − v²/U²) from rest:  z = (U²/2g) ln cosh(2gt/U).
double riseDistance(double t, double U) {
  const double a = (2 * G * t) / U;
  const double lc = a > 20 ? a - std::numbers::ln2 : std::log(std::cosh(a));
  return ((U * U) / (2 * G)) * lc;
}

Acoustics acoustics(double R, const Env &env) {
  const Liquid &liq = *env.liq;
  const Gas &gas = *env.gas;
  const double rho = liq.rho, sig = liq.sigma;
  // the gas's share of the pressure inside (below p_v the liquid would boil: kept a tenth)
  const double pb = env.p0 + (2 * sig) / R, pg = env.pv > 0 ? std::max(pb - env.pv, 0.1 * pb) : pb, D = diffusivity(gas, pg);
  const double d = std::max(env.d, R), s = 2 * d, rs = std::min(IMAGE_MAX, R / s);
  // iterate ω: Φ depends on χ = D/(ωR²), and the image term on k = ω/c
  double w = std::sqrt((3 * gas.gamma * pg) / rho) / R, m = 1, re = 3 * gas.gamma, im = 0;
  for (int it = 0; it < 8; it++) {
    if (env.phiFixed) { re = env.phiKept.re; im = env.phiKept.im; }
    else { const Complex ph = phi(D / (w * R * R), gas.gamma); re = ph.re; im = ph.im; }
    m = 1 - rs * std::cos((w / liq.c) * s);
    const double w2 = (pg * re - (2 * sig) / R) / (rho * R * R * m);
    const double wn = std::sqrt(std::max(w2, 1e-6));
    if (std::fabs(wn - w) < 1e-12 * w) { w = wn; break; }
    w = wn;
  }
  const double ks = (w / liq.c) * s, radFactor = 1 - std::sin(ks) / ks;
  const double bVis = (2 * liq.mu) / (rho * R * R * m);
  const double bTh = (pg * im) / (2 * rho * w * R * R * m);
  const double bRad = ((w * w * R) / (2 * liq.c)) * (radFactor / m);
  const double b = std::min(bVis + bTh + bRad, 0.95 * w); // never overdamped
  Acoustics a;
  a.omega0 = w; a.b = b; a.omegaD = std::sqrt(w * w - b * b);
  a.f0 = w / TAU; a.fd = a.omegaD / TAU;
  a.delta = (2 * b) / w; a.dvis = (2 * bVis) / w; a.dth = (2 * bTh) / w; a.drad = (2 * bRad) / w;
  a.kappa = re / 3; a.phiRe = re; a.phiIm = im; a.chi = D / (w * R * R); a.D = D;
  a.pb = pb; a.pg = pg; a.m = m; a.radFactor = radFactor; a.R = R;
  return a;
}

Env nozzleEnv(const double *P) {
  Env env;
  env.liq = &LIQUIDS[std::clamp((int)P[p::liquid], 0, (int)LIQUIDS.size() - 1)];
  env.gas = &GASES[std::clamp((int)P[p::gas], 0, (int)GASES.size() - 1)];
  env.d = P[p::depth];
  env.p0 = P[p::pressure] * P_ATM + env.liq->rho * G * P[p::depth]; // the air above the tank plus the water column
  env.pv = P[p::vapour] ? env.liq->pv : 0;
  return env;
}

// Secant iteration on ln f against ln R.
double tuneRadius(double f, const Env &env) {
  const double lf = std::log(f);
  double lr0 = std::log(3.3 / f), lf0 = std::log(acoustics(std::exp(lr0), env).fd); // f·R ≈ 3.3 m/s
  double lr1 = lr0 + (lf0 - lf), lf1 = std::log(acoustics(std::exp(lr1), env).fd);
  for (int it = 0; it < 30 && std::fabs(lf1 - lf) > 1e-10; it++) {
    const double slope = std::fabs(lf1 - lf0) > 1e-14 ? (lf1 - lf0) / (lr1 - lr0) : -1;
    const double lr2 = lr1 - (lf1 - lf) / slope;
    lr0 = lr1; lf0 = lf1; lr1 = std::min(std::log(0.2), std::max(std::log(2e-5), lr2));
    lf1 = std::log(acoustics(std::exp(lr1), env).fd);
  }
  return std::exp(lr1);
}

Env defaultEnv() {
  double P[p::count] = {};
  P[p::depth] = 0.3; P[p::pressure] = 1; P[p::gas] = gas_::air; P[p::liquid] = liquid_::water;
  return nozzleEnv(P);
}

double keyRadius(int key, const double *P, const Env &env) {
  const double f = keyFreq(key) * tuningOf(P).ratio(key); // the key's note in the keyboard's tuning
  return P[p::keepInTune] ? tuneRadius(f, env) : tuneRadius(f, defaultEnv());
}

double peakPressure(const Liquid &liq, double velocity) { return (2 * KICK * velocity * liq.sigma) / R_REF; }

double snapGain(double f, double tau) {
  const double u = 2 * f * tau;
  return std::fabs(u - 1) < 1e-6 ? std::numbers::pi / 4 : std::fabs(std::cos((std::numbers::pi * u) / 2) / (1 - u * u));
}

double slowExponent(double R, const Gas &gas, double pb) { return phi(diffusivity(gas, pb) / (OMEGA_SLOW * R * R), gas.gamma).re / 3; }

Acoustics glideRing(double R0, double pg0, double nSlow, Complex phiKept, const Liquid &liq, const Gas &gas, double d, double pT, double pv, double &R) {
  Env env;
  env.liq = &liq; env.gas = &gas; env.d = d; env.p0 = pT + liq.rho * G * d; env.pv = pv;
  const double pb = env.p0 + (2 * liq.sigma) / R0, pg = pv > 0 ? std::max(pb - pv, 0.1 * pb) : pb;
  R = R0 * std::pow(pg0 / pg, 1 / (3 * nSlow)); // it swells as the pressure falls
  env.phiFixed = true; env.phiKept = phiKept;
  return acoustics(R, env);
}

} // namespace forte::bubbles
