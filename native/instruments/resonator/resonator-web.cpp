// resonator-web.cpp — the model's functions the page's views and the tests call
// (resonator/src/resonator-wasm.js), and the engine's test hooks (its voices and their loops).

#include "forte/web.h"
#include "resonator-engine.h"

using namespace forte::resonator;

static constexpr int HEAD = 14, PER = 8;
// a key's strings, flat: key, nu, n, f1, L, T, mu, d, B, xa, xh, sigmaBridge, damper, G, then
// for each partial f (the first string's), sigma, psiA, psiH, beta, cents of the 2nd and 3rd strings' f, 0
static void putStrings(const Strings &s, double *out) {
  const double h[HEAD] = {(double)s.key, (double)s.nu, (double)s.n, s.f1, s.L, s.T, s.mu, s.d, s.B, s.xa, s.xh, s.sigmaBridge, s.damper ? 1.0 : 0.0, s.G};
  for (int i = 0; i < HEAD; i++) out[i] = h[i];
  for (int j = 0; j < s.n; j++) {
    const Partial &p = s.p[j];
    const double v[PER] = {p.f[0], p.sigma, p.psiA, p.psiH, p.beta, s.nu > 1 ? p.f[1] : p.f[0], s.nu > 2 ? p.f[2] : p.f[0], 0};
    for (int i = 0; i < PER; i++) out[HEAD + PER * j + i] = v[i];
  }
}

extern "C" {
// strings(key, P, fs, most, fmax), flat (putStrings), in out; P indexed as in resonator-params.h
FORTE_EXPORT void resonator_strings(int key, const double *P, double fs, int most, double fmax, double *out) { putStrings(strings(key, P, fs, most, fmax), out); }
FORTE_EXPORT double resonator_coil_place(int key) { return coilPlace(key); }
FORTE_EXPORT double resonator_gap_scale(int key) { return gapScale(key); }
FORTE_EXPORT double resonator_voicing(int key) { return voicing(key); }
FORTE_EXPORT double resonator_coil_weight(int n, double x, double w) { return coilWeight(n, x, w); }
FORTE_EXPORT int resonator_unisons(int key) { return unisonsOf(key); }
// the drive's harmonics (DRIVE_HARMONICS of them) for a waveform and brightness, in out
FORTE_EXPORT void resonator_drive_harmonics(int wave, double bright, double *out) { driveHarmonics(wave, bright, out); }
// the constants: MAX_PARTIALS, COIL_W, GAP_REF, F_REF, BRIDGE_G, CHANNELS, DRIVE_HARMONICS, HAMMER_AT
FORTE_EXPORT void resonator_constants(double *out) {
  const double v[8] = {MAX_PARTIALS, COIL_W, GAP_REF, F_REF, BRIDGE_G, CHANNELS, DRIVE_HARMONICS, HAMMER_AT};
  for (int i = 0; i < 8; i++) out[i] = v[i];
}

// The tests' hooks, on the engine of a handle (forte_engine): the voices, in order.
FORTE_EXPORT int resonator_voice_count(ResonatorEngine *e) { return e->count; }
// key, keyDown, driven, env, current (A), lock offset (¢), the first loop's band-pass amplitude,
// the string's swing under the coil (m), hammer on, loops, the first loop's partial, gain, peak, N
FORTE_EXPORT void resonator_voice_state(ResonatorEngine *e, int i, double *out) {
  const ResonatorEngine::Voice &v = *e->voices[i];
  const ResonatorEngine::Loop &l = v.loops[0];
  const double s[14] = {(double)v.key, (double)v.keyDown, (double)v.driven, v.env, v.current, e->offsetCents(v), std::sqrt(2 * l.pw),
                        v.ua, (double)v.hammerOn, (double)v.nLoops, (double)l.h, l.gain, v.peak, (double)v.N};
  for (int j = 0; j < 14; j++) out[j] = s[j];
}
}
