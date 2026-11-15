// breitwigner-model.cpp — the Breit-Wigner Keyboard's physics (breitwigner-model.h).

#include "breitwigner-model.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"
#include "forte/fdlibm.h"
#include "breitwigner-params.h"

namespace forte::breitwigner {

namespace fd = forte::fdlibm;

double keyMass(int key, const double *P) {
  // the note: equal temperament × the keyboard's tuning (forte/tuning.h; exactly 1 at its defaults)
  return keyFreq(key) * tuningOf(P).ratio(key);
}

double keyShare(int key, double width, double power) {
  // Γ ∝ M^n is Γ/M ∝ M^(n − 1); a semitone is 2^(1/12) in mass
  const double s = power == 1 ? width : width * fd::pow(2.0, (key - REF_KEY) * (power - 1) / 12);
  return std::min(SHARE_MAX, s);
}

double totalWidth(double mass, double share, double channels) {
  return std::min(SHARE_MAX * mass, share * mass + std::max(0.0, channels));
}

double lifetime(double fwhm) { return 1 / (TAU * fwhm); }

Lab boosted(double mass, double fwhm, double gamma) {
  const double g = std::max(1.0, gamma);
  return {g * mass, fwhm / g};
}

double speed(double gamma) { return gamma > 1 ? std::sqrt(1 - 1 / (gamma * gamma)) : 0; }

double line(double f, double f0, double fwhm) {
  const double h = fwhm / 2, d = f - f0;
  return h * h / (d * d + h * h);
}

double formed(double t, double fwhm) {
  const double a = TAU / 2 * fwhm;
  return a * t > 1e-9 ? -fd::expm1(-a * t) / a : t; // (to first order in at below)
}

namespace {
struct C { double re, im; };
C div(C x, C y) { const double d = y.re * y.re + y.im * y.im; return {(x.re * y.re + x.im * y.im) / d, (x.im * y.re - x.re * y.im) / d}; }
} // namespace

// The amplitude ψ(t) = ∫ source · propagator turning at w = 2π·f0, with a = π·fwhm, has the
// transform Ψ(Ω) = S(Ω − w) / (a + i(Ω − w)): S = 1 for a state made at once, and for a source of
// strength s running from 0 to T, s(1 − e^(−iδT))/(iδ) = sT·e^(−iδT/2)·sinc(δT/2). What is heard
// is Im ψ = (ψ − ψ̄)/2i, whose transform is (Ψ(Ω) − conj Ψ(−Ω))/2i; times 2a, its size is 1 at a
// narrow line's peak.
double heard(double f, double f0, double fwhm, double formation) {
  const double a = TAU / 2 * fwhm, w = TAU * f0, o = TAU * f, T = std::max(0.0, formation);
  const double sT = T > 0 ? T / formed(T, fwhm) : 1; // the source's strength times its length
  const auto psi = [&](double d) {
    C S{1, 0};
    if (T > 0) {
      const double x = d * T / 2, sinc = std::abs(x) < 1e-4 ? 1 - x * x / 6 : fd::sin(x) / x;
      S = {sT * sinc * fd::cos(x), -sT * sinc * fd::sin(x)};
    }
    return div(S, C{a, d});
  };
  const C p = psi(o - w), q = psi(-o - w);
  const double re = p.re - q.re, im = p.im + q.im; // Ψ(Ω) − conj Ψ(−Ω)
  return a * a * (re * re + im * im);
}

} // namespace forte::breitwigner
