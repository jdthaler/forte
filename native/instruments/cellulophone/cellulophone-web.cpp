// cellulophone-web.cpp — the model's functions the page's views call, and the tests' hooks
// (cellulophone/src/cellulophone-wasm.js).

#include "forte/web.h"
#include "cellulophone-engine.h"
#include "cellulophone-model.h"

using namespace forte::cellulophone;

extern "C" {
// constants: rings, octaves, screens, the most harmonics, the slit's power, the three discs' C rings,
// the selenium cell's γ, its fast and slow times and the slow part's share
FORTE_EXPORT void cellulophone_constants(double *out) {
  out[0] = RINGS; out[1] = OCTAVES; out[2] = SCREENS; out[3] = H_MAX; out[4] = SLIT_POWER;
  out[5] = DISC_C[0]; out[6] = DISC_C[1]; out[7] = DISC_C[2];
  out[8] = SELENIUM_GAMMA; out[9] = SELENIUM_FAST; out[10] = SELENIUM_SLOW; out[11] = SELENIUM_SLOW_SHARE;
}
// A key's note on a disc whose C ring has c0 slots, in the tuning of P (indexed as cellulophone-params.h):
// slots, octave, pitch class, the disc's turns a second, f, the tuning's target and the cents between.
FORTE_EXPORT void cellulophone_key_note(int key, int c0, const double *P, double *out) {
  const forte::Tuning tu = tuningOf(P);
  double target[128];
  for (int k = 0; k < 128; k++) target[k] = forte::keyFreq(k) * tu.ratio(k);
  const Note n = keyNote(key, c0, target);
  out[0] = n.slots; out[1] = n.octave; out[2] = n.pc; out[3] = n.turns; out[4] = n.f; out[5] = n.ideal; out[6] = n.cents;
}
// A screen's recipe (16 harmonic amplitudes), and the screen octave o carries with a screen each.
FORTE_EXPORT void cellulophone_recipe(int screen, double *out) { for (int n = 0; n < SCREEN_HARMONICS; n++) out[n] = RECIPES[screen][n]; }
FORTE_EXPORT int cellulophone_octave_screen(int o) { return OCTAVE_SCREEN[o]; }
// A screen's transmission T(x) as Fourier coefficients (re, then im, n = 0..H_MAX), plain or with the slit.
FORTE_EXPORT void cellulophone_screen_spectrum(int screen, int slit, double *out) {
  const Spectrum s = screenSpectrum(screen, slit != 0);
  for (int n = 0; n <= H_MAX; n++) { out[n] = s.re[n]; out[H_MAX + 1 + n] = s.im[n]; }
}
FORTE_EXPORT double cellulophone_slot_gain(int n, double a) { return slotGain(n, a); }
FORTE_EXPORT double cellulophone_light(int screen, double p, double a, double x) { return light(screen, p, a, x); }
// n samples of one period of the light (push p, slot width a) into out
FORTE_EXPORT void cellulophone_light_period(int screen, double p, double a, int n, double *out) {
  const Spectrum A = screenSpectrum(screen, false), B = screenSpectrum(screen, true);
  for (int i = 0; i < n; i++) {
    const double x = (double)i / n;
    double v = 0;
    for (int k = 0; k <= H_MAX; k++) {
      const double re = (1 - p) * A.re[k] + p * B.re[k], im = (1 - p) * A.im[k] + p * B.im[k];
      v += slotGain(k, a) * (re * forte::fdlibm::cos(forte::TAU * k * x) - im * forte::fdlibm::sin(forte::TAU * k * x));
    }
    out[i] = v;
  }
}
FORTE_EXPORT double cellulophone_flicker(int hz) { return flicker(hz); }
FORTE_EXPORT double cellulophone_slot_noise(int octave, int ring, int slot, int which) { return slotNoise(octave, ring, slot, which); }

// The tests' hooks, on the engine of a handle (forte_engine).
FORTE_EXPORT void cellulophone_set_tap(CellulophoneEngine *e, int tap) { e->tap = tap; }
FORTE_EXPORT double cellulophone_cents(CellulophoneEngine *e) { return e->cents; }
// the engine's note for a key: slots, octave, pitch class, turns a second, f, target, cents
FORTE_EXPORT void cellulophone_engine_note(CellulophoneEngine *e, int key, double *out) {
  const Note n = e->noteOf(key);
  out[0] = n.slots; out[1] = n.octave; out[2] = n.pc; out[3] = n.turns; out[4] = n.f; out[5] = n.ideal; out[6] = n.cents;
}
}
