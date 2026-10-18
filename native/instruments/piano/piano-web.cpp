// piano-web.cpp — the model's functions the page's views call (piano/src/piano-wasm.js): a key's
// string model and its voice data, packed for the engine; and the engine's hooks for the tests and
// the slow-motion view (its voices, in order and by key, and what noteOn did).

#include <algorithm>
#include <memory>
#include <vector>

#include "forte/web.h"
#include "piano-engine.h"

using namespace forte::piano;

extern "C" void *forte_scratch();

namespace {
// the latest key asked for: its model, and its voice data packed
struct Key {
  int key = -1;
  uint64_t version = 0;
  KeyModel model;
  std::vector<double> packed;
  int count = 0;
};
Key &cached() { static Key k; return k; }
} // namespace

extern "C" {
// Key m's model and voice data for the parameters in the scratch area (p::count numbers, as
// shared/wasm.js writes them) at sample rate fs; then piano_model, piano_family and
// piano_packed read them. Returns 0 where the model failed.
FORTE_EXPORT int piano_key(int key, double fs) {
  double P[p::count];
  std::copy_n((const double *)forte_scratch(), p::count, P);
  key = std::min(KEY_HI, std::max(KEY_LO, key));
  Key &c = cached();
  const uint64_t v = modelVersion(P, fs);
  if (c.key == key && c.version == v) return c.model.ok;
  c.key = key; c.version = v;
  c.model = computeKeyModel(key, P, fs);
  c.count = 0;
  if (!c.model.ok) return 0;
  const VoiceData d = buildVoiceData(c.model, P, v);
  c.packed.resize(PACK_HEAD + 9 * (size_t)d.n);
  c.count = packVoiceData(d, c.packed.data());
  return 1;
}

// The model's numbers into out (55): ok, key, L, T, xh, wH; sec (A, I1, I2, J, Ip, half, lever,
// w, t); shape, A0, aspect, tau, uniform; info (f0, tuned, stress, strengthRatio, mu, dMu, A, B1,
// B2, f1, f1hard, f1torsion, tuneAxis, torsionRatio, cT, cTheta, beta, taper); the hammer (mass,
// K, p, width); material; per family n, ritz, nb, B.
FORTE_EXPORT int piano_model(double *out) {
  const KeyModel &m = cached().model;
  const Section &s = m.sec;
  const Info &i = m.info;
  int n = 0;
  for (double v : {(double)m.ok, (double)m.key, m.L, m.T, m.xh, m.wH, s.A, s.I1, s.I2, s.J, s.Ip, s.half, s.lever, s.w, s.t,
                   (double)m.shape, m.A0, m.aspect, m.tau, (double)m.uniform,
                   i.f0, (double)i.tuned, i.stress, i.strengthRatio, i.mu, i.dMu, i.A, i.B1, i.B2, i.f1, i.f1hard, i.f1torsion,
                   (double)i.tuneAxis, i.torsionRatio, i.cT, i.cTheta, i.beta, i.taper,
                   i.hammer.mass, i.hammer.K, i.hammer.p, i.hammer.width, (double)m.material}) out[n++] = v;
  for (const Family &f : m.families) for (double v : {(double)f.n, (double)f.ritz, (double)f.nb, f.B}) out[n++] = v;
  return n;
}
// Family f's array: 0 omega, 1 phiH, 2 bridge (n each), 3 norm (n, sine shapes), 4 coef (n × nb,
// Ritz shapes).
FORTE_EXPORT const double *piano_family(int f, int which) {
  const Family &F = cached().model.families[std::min(2, std::max(0, f))];
  const std::vector<double> *a[] = {&F.omega, &F.phiH, &F.bridge, &F.norm, &F.coef};
  return a[std::min(4, std::max(0, which))]->data();
}
// The key's voice data, packed (packVoiceData): what the page sends with a note.
FORTE_EXPORT const double *piano_packed() { return cached().packed.data(); }
FORTE_EXPORT int piano_packed_count() { return cached().count; }

// sectionProps(shape, A, aspect, s) into out: A, I1, I2, J, Ip, half, lever, w, t.
FORTE_EXPORT void piano_section(int shape, double A, double aspect, double s, double *out) {
  const Section x = sectionProps(shape, A, aspect, s);
  const double v[9] = {x.A, x.I1, x.I2, x.J, x.Ip, x.half, x.lever, x.w, x.t};
  std::copy_n(v, 9, out);
}

// The engine (forte_engine of a handle): a key's voice data from the page, written at
// piano_offer_buffer, for that key's notes.
FORTE_EXPORT double *piano_offer_buffer(PianoEngine *e, int n) { return e->offerBuffer(n); }
FORTE_EXPORT int piano_offer(PianoEngine *e, int n) { return e->offer(e->offerBuffer(n), n); }
FORTE_EXPORT void piano_set_max_modes(PianoEngine *e, double n) { e->maxModes = n; }
FORTE_EXPORT int piano_mode_count(PianoEngine *e) { return e->modeCount(); }

// Its voices: the one the latest noteOn struck (null if none), and each in order.
FORTE_EXPORT PianoEngine::Voice *piano_last(PianoEngine *e) { return e->last; }
FORTE_EXPORT int piano_voices(PianoEngine *e) { return e->nVoices; }
FORTE_EXPORT PianoEngine::Voice *piano_voice_at(PianoEngine *e, int i) { return e->voices[i]; }
// A voice's key, N, hammerOn, contactSamples, Fmax, killing, dead, eta, etaPrev, keyDown,
// damped, peak, age, whether it is its key's (byKey).
FORTE_EXPORT void piano_voice(PianoEngine *e, PianoEngine::Voice *v, double *out) {
  const double x[14] = {(double)v->key, (double)v->N, (double)v->hammerOn, (double)v->contactSamples, v->Fmax, (double)v->killing,
                        (double)(v->dead || !v->inUse), v->eta, v->etaPrev, (double)v->keyDown, (double)v->damped, v->peak, v->age,
                        (double)(e->byKey[v->key] == v)};
  std::copy_n(x, 14, out);
}
// Its state q[n], q[n−1] and the order of its modes (perm[i]: index in the voice data), N each.
FORTE_EXPORT double *piano_voice_q(PianoEngine::Voice *v, int which) { return which == 0 ? v->q : which == 1 ? v->q1 : v->perm; }
// The audible amplitude of each mode, in the voice data's order (modeAmplitudes).
FORTE_EXPORT void piano_voice_amplitudes(PianoEngine *e, PianoEngine::Voice *v, double *out) { v->modeAmplitudes(*e, out); }
}
