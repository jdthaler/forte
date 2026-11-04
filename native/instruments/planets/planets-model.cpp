// planets-model.cpp — the Ringing Planets' physics (planets-model.h).

#include "planets-model.h"

#include <algorithm>
#include <cmath>
#include <complex>

#include "forte/dsp.h"
#include "forte/fdlibm.h"
#include "planets-params.h"

namespace forte::planets {

using cd = std::complex<double>;
namespace fd = forte::fdlibm;
constexpr double PI = std::numbers::pi;
constexpr int LMAX = 64;
constexpr int NLEG = (LMAX + 1) * (LMAX + 2) / 2;

const TablePlanet &planetOf(const double *P) {
  const int i = std::clamp((int)P[p::planet], 0, (int)(sizeof kPlanets / sizeof kPlanets[0]) - 1);
  return kPlanets[i];
}

double speedup(int key, const double *P) {
  return keyFreq(key) * tuningOf(P).ratio(key) / planetOf(P).f0S2;
}

double magnitude(double velocity, const double *P) {
  return P[p::mwTop] - MW_SPAN * (1 - std::clamp(velocity, 0.0, 1.0));
}

double halfDuration(double mw, const double *P) {
  const double m0 = fd::pow(10.0, 1.5 * mw + 9.1) * 1e7; // dyne cm
  return 1.05e-8 * fd::pow(m0, 1.0 / 3) * P[p::rupture];
}

double sourceSpectrum(double w, double h) {
  const double x = 0.5 * w * h;
  if (x < 1e-6) return 1;
  const double s = fd::sin(x) / x;
  return s * s;
}

void momentTensor(const double *P, double M[6]) {
  const int mech = (int)P[p::mech];
  if (mech == mech_::explosion) { M[0] = M[1] = M[2] = 1 / std::sqrt(3.0); M[3] = M[4] = M[5] = 0; return; }
  const double dip = (mech == mech_::thrust ? 10 : mech == mech_::strikeslip ? 90 : 45) * PI / 180;
  const double rake = (mech == mech_::thrust ? 90 : mech == mech_::strikeslip ? 0 : -90) * PI / 180;
  const double phi = P[p::strike] * PI / 180;
  const double sd = fd::sin(dip), cd_ = fd::cos(dip), s2d = fd::sin(2 * dip), c2d = fd::cos(2 * dip);
  const double sr = fd::sin(rake), cr = fd::cos(rake), sp = fd::sin(phi), cp = fd::cos(phi), s2p = fd::sin(2 * phi), c2p = fd::cos(2 * phi);
  // Aki & Richards (2002), box 4.4, in x north, y east, z down
  const double xx = -(sd * cr * s2p + s2d * sr * sp * sp);
  const double xy = sd * cr * c2p + 0.5 * s2d * sr * s2p;
  const double xz = -(cd_ * cr * cp + c2d * sr * sp);
  const double yy = sd * cr * s2p - s2d * sr * cp * cp;
  const double yz = -(cd_ * cr * sp - c2d * sr * cp);
  const double zz = s2d * sr;
  // r up, θ south, φ east
  M[0] = zz; M[1] = xx; M[2] = yy; M[3] = xz; M[4] = -yz; M[5] = -xy;
}

void stationAt(const double *P, double &theta, double &phi) {
  const double la = P[p::lat] * PI / 180, d = P[p::distance] * PI / 180, az = P[p::azimuth] * PI / 180;
  const double sl = std::clamp(fd::sin(la) * fd::cos(d) + fd::cos(la) * fd::sin(d) * fd::cos(az), -1.0, 1.0);
  const double lr = std::asin(sl);
  theta = PI / 2 - lr;
  phi = fd::atan2(fd::sin(az) * fd::sin(d) * fd::cos(la), fd::cos(d) - fd::sin(la) * sl);
}

void legendre(int L, double theta, double *P, double *dP) {
  const double x = fd::cos(theta), s = fd::sin(theta);
  auto at = [](int l, int m) { return l * (l + 1) / 2 + m; };
  P[0] = 1 / std::sqrt(4 * PI);
  for (int m = 1; m <= L; m++) P[at(m, m)] = -std::sqrt((2.0 * m + 1) / (2.0 * m)) * s * P[at(m - 1, m - 1)];
  for (int m = 0; m < L; m++) P[at(m + 1, m)] = std::sqrt(2.0 * m + 3) * x * P[at(m, m)];
  for (int m = 0; m <= L; m++)
    for (int l = m + 2; l <= L; l++) {
      const double a = std::sqrt((4.0 * l * l - 1) / ((double)l * l - (double)m * m));
      const double b = std::sqrt(((l - 1.0) * (l - 1) - (double)m * m) / (4.0 * (l - 1) * (l - 1) - 1));
      P[at(l, m)] = a * (x * P[at(l - 1, m)] - b * P[at(l - 2, m)]);
    }
  // 2 ∂θ P̄_l^m = √((l−m)(l+m+1)) P̄_l^{m+1} − √((l+m)(l−m+1)) P̄_l^{m−1}, with P̄_l^{−1} = −P̄_l^1
  for (int l = 0; l <= L; l++)
    for (int m = 0; m <= l; m++) {
      const double up = m < l ? std::sqrt((double)(l - m) * (l + m + 1)) * P[at(l, m + 1)] : 0;
      const double dn = m > 0 ? std::sqrt((double)(l + m) * (l - m + 1)) * P[at(l, m - 1)] : (l > 0 ? -std::sqrt((double)l * (l + 1)) * P[at(l, 1)] : 0);
      dP[at(l, m)] = 0.5 * (up - dn);
    }
}

namespace {

// Y_lm's value and derivatives at colatitude θ, longitude φ (signed m, Y_l,−m = (−1)^m Y_lm*):
// Y, ∂θY, ∂²θY, and the Hessian's θφ and φφ parts divided as the strain needs them
struct Harm { cd Y, dt, d2t, Hpp, Htp, dpS; }; // dpS = ∂φY / sin θ
Harm harm(const double *P, const double *dP, int l, int m, double th, double ph) {
  const int am = std::abs(m), i = l * (l + 1) / 2 + am;
  const double sgn = m < 0 && (am & 1) ? -1 : 1;
  const double s = std::max(fd::sin(th), 1e-6), ct = fd::cos(th) / s, k2 = l * (l + 1.0);
  const double p = sgn * P[i], dp = sgn * dP[i];
  const double d2p = -ct * dp - (k2 - (double)m * m / (s * s)) * p; // Legendre's equation
  const cd e(fd::cos(m * ph), fd::sin(m * ph)), im(0, m);
  Harm h;
  h.Y = p * e; h.dt = dp * e; h.d2t = d2p * e;
  h.Hpp = (-(double)m * m * p / (s * s) + ct * dp) * e;
  h.Htp = im * (dp - ct * p) / s * e;
  h.dpS = im * p / s * e;
  return h;
}

// the reference quake's rms, per planet and sensor (computed once)
double refRms[3][4] = {};

void rawRespond(const double *P, Response &out) {
  const int pi = std::clamp((int)P[p::planet], 0, 2);
  const TablePlanet &T = kPlanets[pi];
  const int sensor = (int)P[p::sensor];
  out.planet = pi;
  out.stereo = sensor == sensor_::horizontal;
  out.m.clear(); out.cL.clear(); out.cR.clear(); out.src.clear();
  // the source: its depth within the table, its colatitude; the station
  const double depth = std::clamp(P[p::depth], 0.0, T.depth[kDepths - 1]);
  int j = 0;
  while (j < kDepths - 2 && T.depth[j + 1] < depth) j++;
  const double t = (depth - T.depth[j]) / (T.depth[j + 1] - T.depth[j]);
  const double rs = T.R - std::max(depth, 1e-3);
  const double ths = std::clamp(PI / 2 - P[p::lat] * PI / 180, 1e-3, PI - 1e-3);
  double thr, phr;
  stationAt(P, thr, phr);
  thr = std::clamp(thr, 1e-3, PI - 1e-3);
  double M[6];
  momentTensor(P, M);
  static double Ps[NLEG], dPs[NLEG], Pr[NLEG], dPr[NLEG];
  int lmax = 0;
  for (int i = 0; i < T.count; i++) lmax = std::max(lmax, T.modes[i].l);
  lmax = std::min(lmax, LMAX);
  legendre(lmax, ths, Ps, dPs);
  legendre(lmax, thr, Pr, dPr);
  const double Omega = 2 * PI / T.day, atten = P[p::atten];
  for (int i = 0; i < T.count; i++) {
    const TableMode &md = T.modes[i];
    if (md.l > lmax) continue;
    const bool S = md.type == 0;
    if (!S && sensor != sensor_::horizontal) continue; // a toroidal mode never moves the ground up and down
    const int l = md.l;
    const double k = std::sqrt(l * (l + 1.0)), w = 2 * PI * md.f;
    const auto lerp = [&](int c) { return (1 - t) * md.src[j][c] + t * md.src[j + 1][c]; };
    const double U = lerp(0), dU = lerp(1), V = lerp(2), dV = lerp(3);
    // the station: its sensor's response to this multiplet's motion
    double Ur = md.U;
    if (sensor == sensor_::gravimeter) Ur = md.U * (1 + 2 * T.g / (T.R * w * w)) + (l + 1) * md.P / (T.R * w * w);
    Multiplet mu{w, w / (2 * md.Q) * atten, md.chi * Omega, md.type, md.n, l, (int)out.cL.size(), 0, md.U};
    for (int m = -l; m <= l; m++) {
      const Harm hs = harm(Ps, dPs, l, m, ths, 0), hr = harm(Pr, dPr, l, m, thr, phr);
      cd err, ett, epp, ert, erp, etp;
      if (S) {
        const double a = k > 0 ? V / (k * rs) : 0, b = k > 0 ? (dV - V / rs + k * U / rs) / (2 * k) : 0;
        err = dU * hs.Y;
        ett = U / rs * hs.Y + a * hs.d2t;
        epp = U / rs * hs.Y + a * hs.Hpp;
        etp = a * hs.Htp;
        ert = b * hs.dt;
        erp = b * hs.dpS;
      } else {
        const double W = U, a = W / (k * rs), b = (dU - W / rs) / (2 * k);
        err = 0;
        ett = -a * hs.Htp;
        epp = a * hs.Htp;
        etp = 0.5 * a * (hs.d2t - hs.Hpp);
        ert = -b * hs.dpS;
        erp = b * hs.dt;
      }
      const cd src = M[0] * err + M[1] * ett + M[2] * epp + 2.0 * (M[3] * ert + M[4] * erp + M[5] * etp);
      cd rl, rr;
      if (sensor != sensor_::horizontal) rl = rr = Ur * hr.Y;
      else if (S) { const double v = k > 0 ? md.V / k : 0; rl = -v * hr.dt; rr = v * hr.dpS; } // north = −s_θ, east = s_φ
      else { rl = (md.U / k) * hr.dpS; rr = (md.U / k) * hr.dt; }
      cd cl = rl * std::conj(src), cr = rr * std::conj(src);
      if (sensor == sensor_::vertical) { cl *= cd(0, -1 / w); cr *= cd(0, -1 / w); }        // velocity: a / iω
      else if (sensor != sensor_::gravimeter) { cl *= -1 / (w * w); cr *= -1 / (w * w); } // displacement: −a / ω²
      out.cL.push_back(cl.real()); out.cL.push_back(cl.imag());
      out.cR.push_back(cr.real()); out.cR.push_back(cr.imag());
      out.src.push_back(src.real()); out.src.push_back(-src.imag());
      mu.bound += std::sqrt(std::norm(cl)) + std::sqrt(std::norm(cr));
    }
    out.m.push_back(mu);
  }
}

} // namespace

Response::Response() {
  size_t nm = 0, nc = 0;
  for (const TablePlanet &T : kPlanets) {
    size_t c = 0;
    for (int i = 0; i < T.count; i++) c += 2 * (2 * T.modes[i].l + 1);
    nm = std::max(nm, (size_t)T.count); nc = std::max(nc, c);
  }
  m.reserve(nm); cL.reserve(nc); cR.reserve(nc); src.reserve(nc);
}

void respond(const double *P, Response &out) {
  const int pi = std::clamp((int)P[p::planet], 0, 2), sensor = std::clamp((int)P[p::sensor], 0, 3);
  if (!(refRms[pi][sensor] > 0)) {
    double Q[p::count];
    std::copy(P, P + p::count, Q);
    Q[p::mech] = mech_::thrust; Q[p::strike] = 0; Q[p::depth] = 30; Q[p::distance] = 60; Q[p::azimuth] = 45;
    Q[p::lat] = 0; Q[p::atten] = 1; Q[p::rupture] = 1;
    rawRespond(Q, out);
    const double h = halfDuration(MW_REF, Q);
    double e = 0;
    for (const Multiplet &mu : out.m) {
      cd sl = 0, sr = 0;
      for (int i = 0; i < 2 * mu.l + 1; i++) { sl += cd(out.cL[mu.off + 2 * i], out.cL[mu.off + 2 * i + 1]); sr += cd(out.cR[mu.off + 2 * i], out.cR[mu.off + 2 * i + 1]); }
      const double F = sourceSpectrum(mu.w, h);
      e += 0.25 * F * F * (std::norm(sl) + std::norm(sr));
    }
    refRms[pi][sensor] = std::sqrt(e);
  }
  rawRespond(P, out);
  const double g = 1 / refRms[pi][sensor];
  for (double &v : out.cL) v *= g;
  for (double &v : out.cR) v *= g;
  for (double &v : out.src) v *= g;
  for (Multiplet &mu : out.m) mu.bound *= g;
}

double radialAt(const Response &r, const double *P, double mw, int lmax, double theta, double phi, double t) {
  static double Pl[NLEG], dPl[NLEG];
  lmax = std::min(lmax, LMAX);
  theta = std::clamp(theta, 1e-3, PI - 1e-3);
  legendre(lmax, theta, Pl, dPl);
  const double h = halfDuration(mw, P), scale = fd::pow(10.0, 1.5 * (mw - MW_REF)), spin = P[p::spin];
  double u = 0;
  for (const Multiplet &mu : r.m) {
    if (mu.type != 0 || mu.l > lmax) continue;
    const double a = scale * sourceSpectrum(mu.w, h) * mu.Ur / (mu.w * mu.w) * fd::exp(-mu.decay * t);
    for (int m = -mu.l; m <= mu.l; m++) {
      const int i = mu.off + 2 * (m + mu.l);
      const Harm hy = harm(Pl, dPl, mu.l, m, theta, phi);
      const double ph = (mu.w + m * mu.spinRate * spin) * t;
      u -= a * (cd(r.src[i], r.src[i + 1]) * hy.Y * cd(fd::cos(ph), fd::sin(ph))).real();
    }
  }
  return u;
}

} // namespace forte::planets
