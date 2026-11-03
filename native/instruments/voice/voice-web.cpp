// voice-web.cpp — the model's functions the page's views call, and the tests' hooks
// (voice/src/voice-wasm.js).

#include "forte/web.h"
#include "voice-engine.h"
#include "voice-model.h"

using namespace forte::voice;

extern "C" {
// The tract's area function (m²) in N sections, for a vowel position, larynx tube (m²) and jaw opening.
FORTE_EXPORT void voice_areas(double v, double larynx, int N, double *out, double J) { areaFunction(v, larynx, N, out, J); }
FORTE_EXPORT double voice_jaw_for(double v, double larynx, double f, double length) { return jawFor(v, larynx, f, length); }
FORTE_EXPORT double voice_input_phase(const double *area, int N, double length, double f) { return inputPhase(area, N, length, f); }
FORTE_EXPORT double voice_input_reactance(const double *area, int N, double length, double f) { return inputReactance(area, N, length, f); }
// Its formants (Hz): how many, into out.
FORTE_EXPORT int voice_formants(const double *area, int N, double length, double *out, int count) { return formants(area, N, length, out, count); }
FORTE_EXPORT double voice_transfer(const double *area, int N, double length, double f) { return transfer(area, N, length, f); }
FORTE_EXPORT double voice_radiation_r(double A) { return radiationR(A); }
FORTE_EXPORT double voice_radiation_l(double A) { return radiationL(A); }
// The vowel table: COUNT, SECTIONS, LARYNX, the length; each vowel's targets and fitted formants
FORTE_EXPORT int voice_vowel_count() { return vowels::COUNT; }
FORTE_EXPORT void voice_vowel(int i, double *out) {
  const vowels::Vowel &v = vowels::kVowels[i];
  for (int k = 0; k < 3; k++) { out[k] = v.F[k]; out[3 + k] = v.fitted[k]; }
  for (int k = 0; k < vowels::SECTIONS; k++) out[6 + k] = v.area[k];
}
// The constants: RHO, C, NU, CMH2O, M1, M2, K1, K2, KC, D1, D2, LG, SECTIONS, LARYNX, LENGTH
FORTE_EXPORT void voice_constants(double *out) {
  const double c[] = {RHO, C, NU, CMH2O, M1, M2, K1, K2, KC, D1, D2, LG, (double)vowels::SECTIONS, (double)vowels::LARYNX, vowels::LENGTH};
  for (int i = 0; i < (int)(sizeof c / sizeof *c); i++) out[i] = c[i];
}
// The folds alone, driven by lungs at Ps into a tract of first section Z1 with nothing coming
// back (an endless tube): x1, x2, U each step, for `steps` steps of dt (at most 2500).
FORTE_EXPORT void voice_folds(double Q, double thick, double gap, double Ps, double Z1, double dt, int steps, double *out) {
  const FoldConstants c = foldConstants(Q, thick, gap);
  Folds f;
  for (int i = 0; i < steps; i++) {
    f.step(c, dt, Ps, 0, Z1);
    out[3 * i] = f.x1; out[3 * i + 1] = f.x2; out[3 * i + 2] = f.U;
  }
}

// The tests' hooks, on the engine of a handle (forte_engine).
FORTE_EXPORT int voice_pool() { return VoiceEngine::kPool; }
FORTE_EXPORT double voice_rate(VoiceEngine *e) { return e->fo; }
// slot i: alive, held, key, Q, fT, fMeas, Ps (Pa), N, vowel, stolen, jaw
FORTE_EXPORT void voice_voice(VoiceEngine *e, int i, double *out) {
  const Voice &v = e->voices[i];
  out[0] = v.alive; out[1] = v.held; out[2] = v.key; out[3] = v.Q; out[4] = v.fT; out[5] = v.fMeas; out[6] = v.Ps; out[7] = v.N; out[8] = v.vowel; out[9] = v.stolen; out[10] = v.jaw;
}
FORTE_EXPORT double voice_learned(VoiceEngine *e, int key) { return e->learned[key]; }
}
