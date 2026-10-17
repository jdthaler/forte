// pianet-web.cpp — the model's functions the page's views call (pianet/src/pianet-wasm.js): a key's
// reed and its mode shapes, the slow-motion re-run of a pluck, the release curve, and the small
// formulas the readouts use.

#include <memory>
#include <vector>

#include "forte/web.h"
#include "pianet-model.h"

using namespace forte::pianet;

// The views ask for the same reed again and again (its modes, then its shapes): keep the last one.
static const KeyReed &cachedReed(int m, double tipMass, double loss, double fs) {
  static std::unique_ptr<KeyReed> kr;
  static double last[4] = {};
  if (!kr || last[0] != m || last[1] != tipMass || last[2] != loss || last[3] != fs) {
    kr = std::make_unique<KeyReed>(keyReed(m, tipMass, loss, fs));
    last[0] = m; last[1] = tipMass; last[2] = loss; last[3] = fs;
  }
  return *kr;
}

static std::vector<double> result; // what pianet_simulate returns (more than the scratch area holds)

extern "C" {
// keyReed into out, returning how many numbers it wrote: key, f0, L, b, h, mu, EI, r, Msolder, xc,
// kc, tipGain, N, then per mode f, sigma, T60, ratio, phiC, phiT, release.
FORTE_EXPORT int pianet_reed(int m, double tipMass, double loss, double fs, double *out) {
  const KeyReed &kr = cachedReed(m, tipMass, loss, fs);
  int n = 0;
  for (double v : {(double)kr.key, kr.f0, kr.L, kr.b, kr.h, kr.mu, kr.EI, kr.r, kr.Msolder, kr.xc, kr.kc, kr.tipGain, (double)kr.N}) out[n++] = v;
  for (int i = 0; i < kr.N; i++) {
    const ReedMode &md = kr.modes[i];
    for (double v : {md.f, md.sigma, md.T60, md.ratio, md.phiC, md.phiT, md.release}) out[n++] = v;
  }
  return n;
}
// That reed's dimensional mode shape n at x (m from the clamp).
FORTE_EXPORT double pianet_reed_shape(int m, double tipMass, double loss, double fs, int n, double x) {
  const KeyReed &kr = cachedReed(m, tipMass, loss, fs);
  return n >= 0 && n < kr.N ? kr.shape(n, x) : 0;
}

// simulatePluck. in = tack, rate, padK, padC, tipMass, loss. Returns the numbers (pianet_result_size
// of them): released, rel y, F, v, t, V, tEnd, N, frames, then each of t, h, face, yc, y, F, a
// (frames each) and q (frames × N).
FORTE_EXPORT const double *pianet_simulate(int m, const double *in, double vel, double fs, double periods, int frames, double maxT) {
  const Simulation s = simulatePluck(m, in[4], in[5], {in[0], in[1], in[2], in[3]}, vel, fs, periods, frames, maxT);
  const int nf = (int)s.t.size();
  result.clear();
  for (double v : {s.released ? 1.0 : 0.0, s.rel.y, s.rel.F, s.rel.v, s.rel.t, s.rel.V, s.tEnd, (double)s.N, (double)nf}) result.push_back(v);
  for (const std::vector<double> *a : {&s.t, &s.h, &s.face, &s.yc, &s.y, &s.F, &s.a, &s.q}) result.insert(result.end(), a->begin(), a->end());
  return result.data();
}
FORTE_EXPORT int pianet_result_size() { return (int)result.size(); }

// releaseCurve: in as pianet_simulate's; for each of the n velocities, out gets vel, V, y, F, v, t, stuck.
FORTE_EXPORT void pianet_release_curve(int m, const double *in, const double *vels, int n, double fs, double *out) {
  const KeyReed &kr = cachedReed(m, in[4], in[5], fs);
  const PadParams P = {in[0], in[1], in[2], in[3]};
  for (int i = 0; i < n; i++) {
    const ReleasePoint r = releasePoint(kr, P, vels[i], fs);
    const double v[7] = {r.vel, r.V, r.y, r.F, r.v, r.t, r.stuck ? 1.0 : 0.0};
    for (int k = 0; k < 7; k++) out[7 * i + k] = v[k];
  }
}

FORTE_EXPORT double pianet_key_speed(double vel) { return keySpeed(vel); }
FORTE_EXPORT double pianet_work_of_adhesion(double F0) { return workOfAdhesion(F0); }
FORTE_EXPORT double pianet_voicing(int m) { return voicing(m); }
FORTE_EXPORT double pianet_voicing_t(int m) { return voicingT(m); }
// PAD: a0, Estar, v0, aMin, heal, preload, travel, vRet
FORTE_EXPORT void pianet_pad(double *out) {
  const double v[8] = {PAD.a0, PAD.Estar, PAD.v0, PAD.aMin, PAD.heal, PAD.preload, PAD.travel, PAD.vRet};
  for (int k = 0; k < 8; k++) out[k] = v[k];
}
}
