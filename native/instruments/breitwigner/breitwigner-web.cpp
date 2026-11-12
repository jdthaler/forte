// breitwigner-web.cpp — the model's functions the page's views and the tests call
// (breitwigner/src/breitwigner-wasm.js).

#include "forte/web.h"
#include "breitwigner-model.h"
#include "breitwigner-params.h"

using namespace forte::breitwigner;

extern "C" {
// A key's state at rest for parameters P: its mass (Hz), its own Γ/M, its own full width (Hz), its
// lifetime (s), and its width and lifetime once the key-up channel is open.
FORTE_EXPORT void breitwigner_key(int key, const double *P, double *out) {
  const double mass = keyMass(key, P), share = keyShare(key, P[p::width], P[p::power]);
  const double own = totalWidth(mass, share, 0), up = totalWidth(mass, share, P[p::release]);
  out[0] = mass; out[1] = share; out[2] = own; out[3] = lifetime(own); out[4] = up; out[5] = lifetime(up);
}
FORTE_EXPORT double breitwigner_key_share(int key, double width, double power) { return keyShare(key, width, power); }
FORTE_EXPORT double breitwigner_total_width(double mass, double share, double channels) { return totalWidth(mass, share, channels); }
FORTE_EXPORT double breitwigner_lifetime(double fwhm) { return lifetime(fwhm); }
// A state boosted by γ, in the lab: its frequency, its width, and the boost's speed over c.
FORTE_EXPORT void breitwigner_boosted(double mass, double fwhm, double gamma, double *out) {
  const Lab lab = boosted(mass, fwhm, gamma);
  out[0] = lab.f; out[1] = lab.fwhm; out[2] = speed(gamma);
}
FORTE_EXPORT double breitwigner_line(double f, double f0, double fwhm) { return line(f, f0, fwhm); }
FORTE_EXPORT double breitwigner_heard(double f, double f0, double fwhm, double phase) { return heard(f, f0, fwhm, phase); }
// REF_KEY, SHARE_MAX, BOOST_SEMITONES
FORTE_EXPORT double breitwigner_constant(int i) {
  static constexpr double c[] = {REF_KEY, SHARE_MAX, BOOST_SEMITONES};
  return i >= 0 && i < 3 ? c[i] : 0;
}
}
