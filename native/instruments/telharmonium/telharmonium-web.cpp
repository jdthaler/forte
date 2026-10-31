// telharmonium-web.cpp — the model's functions the page's views call, and the tests' hooks
// (telharmonium/src/telharmonium-wasm.js).

#include "forte/web.h"
#include "telharmonium-engine.h"
#include "telharmonium-model.h"

using namespace forte::telharmonium;

static const LineKind &kindOf(int k) { return k == 1 ? OPEN : CABLE; }

extern "C" {
// constants: harmonics, manuals, TAP_HZ, the plate's λ², the two diaphragms' resonances, the
// diaphragm's radius and thickness, C_AIR, MOUTH, HORN_THROAT, LINE_DELAY, LOAD_REF
FORTE_EXPORT void telharmonium_constants(double *out) {
  out[0] = HARMONICS; out[1] = MANUALS; out[2] = TAP_HZ; out[3] = PLATE_L2;
  out[4] = receiverF0(0); out[5] = receiverF0(1); out[6] = DIAPHRAGM_A; out[7] = DIAPHRAGM_H;
  out[8] = C_AIR; out[9] = MOUTH; out[10] = HORN_THROAT; out[11] = LINE_DELAY; out[12] = LOAD_REF;
}
// the alternator a key plays (its own shaft with root −1): shaft and teeth, in the engine's count
// (4·2^octave) — the 1906 machine's are a sixteenth of these (C3: 4 teeth)
FORTE_EXPORT void telharmonium_assign(int key, int root, double *out) {
  const Assign a = assign(key, root);
  out[0] = a.shaft; out[1] = a.teeth;
}
FORTE_EXPORT int telharmonium_built(int pc) { return built(pc); }
FORTE_EXPORT double telharmonium_c_shaft_435(int teeth) { return cShaft435(teeth); }
FORTE_EXPORT double telharmonium_stop_level(double k) { return stopLevel(k); }
FORTE_EXPORT double telharmonium_bus_gain(int N, double level, double rho) { return busGain(N, level, rho); }
FORTE_EXPORT double telharmonium_plate_f01(double a, double h) { return plateF01(a, h); }
FORTE_EXPORT double telharmonium_voicing(double f, double v) { return voicing(f, v); }
// complex responses as (re, im) in out
FORTE_EXPORT void telharmonium_circuit(double f, double tau, double *out) { const cplx c = circuit(f, tau); out[0] = c.real(); out[1] = c.imag(); }
FORTE_EXPORT void telharmonium_line_exact(double f, int kind, double km, double *out) { const cplx c = lineExact(f, kindOf(kind), km); out[0] = c.real(); out[1] = c.imag(); }
FORTE_EXPORT void telharmonium_receiver(double f, int receiver, double *out) { const cplx c = receiverResponse(f, receiverF0(receiver)); out[0] = c.real(); out[1] = c.imag(); }
FORTE_EXPORT void telharmonium_horn(double f, double L, double *out) { const cplx c = hornResponse(f, L); out[0] = c.real(); out[1] = c.imag(); }

// The tests' hooks, on the engine of a handle (forte_engine).
FORTE_EXPORT void telharmonium_set_tap(TelharmoniumEngine *e, int tap) { e->tap = tap; }
FORTE_EXPORT double telharmonium_cents(TelharmoniumEngine *e) { return e->cents; }
FORTE_EXPORT double telharmonium_load(TelharmoniumEngine *e) { return e->load; }
FORTE_EXPORT int telharmonium_bus_count(TelharmoniumEngine *e, int b) { return e->busCount[b]; }
FORTE_EXPORT int telharmonium_line_taps(TelharmoniumEngine *e) { return e->lineTapCount(); }
// each sounding key: key, shaft, teeth, manual, root, harmonics connected
FORTE_EXPORT int telharmonium_keys(TelharmoniumEngine *e, double *out) {
  int n = 0;
  for (const Key &k : e->keys) if (k.on) {
    double *o = out + 6 * n++;
    o[0] = k.key; o[1] = k.shaft; o[2] = k.teeth; o[3] = k.manual; o[4] = k.root; o[5] = k.count;
  }
  return n;
}
}
