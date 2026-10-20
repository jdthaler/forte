// organ-web.cpp — the model's functions the page's views call (organ/src/organ-wasm.js), and the
// engine's test hooks (its rotors, percussion, keys and peak).

#include "forte/web.h"
#include "organ-engine.h"

using namespace forte::organ;

extern "C" {
// A wheel's frequency by the gears and in equal temperament, the difference in
// cents; a wheel's pitch class, octave, teeth and gear (pc, octave, teeth, driving, driven) in out
FORTE_EXPORT double organ_gear_freq(int w) { return gearFreq(w); }
FORTE_EXPORT double organ_et_freq(int w) { return etFreq(w); }
FORTE_EXPORT double organ_cents_off(int w) { return centsOff(w); }
FORTE_EXPORT void organ_wheel_spec(int w, double *out) {
  const WheelSpec s = wheelSpec(w);
  out[0] = s.pc; out[1] = s.octave; out[2] = s.teeth; out[3] = s.driving; out[4] = s.driven;
}
FORTE_EXPORT int organ_key_wheel(int key, int d) { return keyWheel(key, d); }
FORTE_EXPORT int organ_perc_wheel(int key, int third) { return percWheel(key, third != 0); }
FORTE_EXPORT double organ_drawbar_gain(int n) { return drawbarGain(n); }
// keyAnalysis(key, P) for tuning (0 gears, 1 et, 2 harmonic), levels (0 B-3, 1 flat), mains
// (Hz) and the keyboard's tuning (each pitch class's ratio, C first, in ratio[12]): per drawbar
// w, actual, ideal, cents, folded, db in out (54 numbers)
FORTE_EXPORT void organ_key_analysis(int key, int tuning, int levels, double mains, const double *ratio, double *out) {
  forte::Tuning keyboard;
  for (int i = 0; i < 12; i++) { keyboard.r[i] = ratio[i]; keyboard.equal = keyboard.equal && ratio[i] == 1; }
  Analysis a[9];
  keyAnalysis(key, tuning, levels, mains, keyboard, a);
  for (int d = 0; d < 9; d++) {
    double *o = out + 6 * d;
    o[0] = a[d].w; o[1] = a[d].actual; o[2] = a[d].ideal; o[3] = a[d].cents; o[4] = a[d].folded; o[5] = a[d].db;
  }
}
// The generator and wiring: a wheel's level (dB re wheel 37), a contact's wire (ohms), a filter's
// gain at ratio × its wheel's frequency, and the pickup's h2 and h3 (in out)
FORTE_EXPORT double organ_wheel_level_db(int w) { return wheelLevelDb(w); }
FORTE_EXPORT double organ_wire_ohms(int key, int d) { return wireOhms(key, d); }
FORTE_EXPORT double organ_filter_gain(int w, double ratio, double drift) { return filterGain(w, ratio, drift); }
FORTE_EXPORT void organ_pickup_harmonics(int w, double relief, double *out) { pickupHarmonics(w, relief, out[0], out[1]); }
// The Leslie cabinet's geometry (leslieGeometry): wall, micDist in out
FORTE_EXPORT void organ_leslie_geometry(double hornRadius, double micDist, double *out) {
  const Geometry g = leslieGeometry(hornRadius, micDist);
  out[0] = g.wall; out[1] = g.micDist;
}

// The tests' hooks, on the engine of a handle (forte_engine): hornHz, drumHz, percEnv, peak, the
// keys in its list, the keys it holds, speed, hornAng, drumAng, scanPos in out
FORTE_EXPORT void organ_state(OrganEngine *e, double *out) {
  out[0] = e->hornHz; out[1] = e->drumHz; out[2] = e->percEnv; out[3] = e->peak;
  out[4] = e->keyCount(); out[5] = e->liveCount(); out[6] = e->speed; out[7] = e->hornAng; out[8] = e->drumAng; out[9] = e->scanPos;
}
FORTE_EXPORT void organ_set_rotors(OrganEngine *e, double hornHz, double drumHz) { e->hornHz = hornHz; e->drumHz = drumHz; }
// a render in double precision, n ≤ 128 samples, into out (L then R)
FORTE_EXPORT void organ_process64(OrganEngine *e, int n, double *out) { e->processDouble(out, out + 128, n < 128 ? n : 128); }
}
