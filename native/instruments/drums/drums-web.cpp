// drums-web.cpp — the model's functions the page's views call (drums/src/drums-wasm.js), the
// page's drums packed for the engine (its noteData), and the engine's test hooks.

#include <algorithm>
#include <memory>

#include "drums-engine.h"
#include "forte/web.h"

using namespace forte::drums;

extern "C" {
// A key's drum for the parameters P, packed (drums-engine.h packDrum) into out: how many numbers.
FORTE_EXPORT int drums_key_drum(int key, const double *P, double *out) {
  const KeyDrum k = keyDrum(std::clamp(key, KEY_MIN, KEY_MAX), P);
  return packDrum(k, P, out);
}
// A drum of radius a (m) and tension T (N/m) as the parameters build it, but untuned: packed.
FORTE_EXPORT int drums_drum_at(int drum, double a, double T, const double *P, double *out) {
  return packDrum(drumAt(drum, a, T, P), P, out);
}
// A composite head (drums-model.h compositeHead): packed.
FORTE_EXPORT int drums_composite(double ratio, double K, double a, double T, const double *P, double *out) {
  return packDrum(compositeHead(ratio, K, a, T, P), P, out);
}
// The page's drum for a key, offered to the engine with its note.
FORTE_EXPORT int drums_offer(forte::Engine *e, const double *packed, int n) { return static_cast<DrumEngine *>(e)->offer(packed, n); }
// Whether parameter i (drums-params.h order) shapes the drums (the others leave them as they are).
FORTE_EXPORT int drums_shapes(int i) { return shapesDrum(i); }
FORTE_EXPORT double drums_bessel_zero(int m, int i) { return besselZero(m, i); }
FORTE_EXPORT double drums_bare_ratio(int m, int n) { return bareRatio(m, n); }
FORTE_EXPORT double drums_patch_density(int drum, double load, double rho) { return patchDensity(DRUMS[std::clamp(drum, 0, NDRUMS - 1)], load, rho); }
FORTE_EXPORT double drums_drum_constant(int drum, int what) { // radius, key, depth, patch radius, excess, power
  const Drum &d = DRUMS[std::clamp(drum, 0, NDRUMS - 1)];
  const double v[] = {d.radius, d.key, d.depth, d.patchK, d.patchExcess, d.patchPower, (double)d.pm, (double)d.pn, (double)d.pmult};
  return what >= 0 && what < (int)(sizeof v / sizeof *v) ? v[what] : 0;
}
// The test hooks: the sounding drums, and one's state (key, modes, tension, the beater's last and
// largest force, touched, energy, peak, hand, press).
FORTE_EXPORT int drums_voices(forte::Engine *e) { return static_cast<DrumEngine *>(e)->count; }
FORTE_EXPORT void drums_voice(forte::Engine *e, int i, double *out) {
  const DrumEngine::Voice &v = *static_cast<DrumEngine *>(e)->voices[i];
  const double x[] = {(double)v.key, (double)v.M, v.tension, v.F, v.Fmax, v.touched ? 1.0 : 0.0, v.energy, v.peak, v.hand ? 1.0 : 0.0, v.press, v.mallet ? 1.0 : 0.0};
  std::copy(std::begin(x), std::end(x), out);
}
}
