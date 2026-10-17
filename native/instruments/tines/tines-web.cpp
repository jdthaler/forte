// tines-web.cpp — the model's functions the page's views call (tines/src/tines-wasm.js): a key's
// modes, its tine's shapes and its voice data, packed for the engine; and the engine's hooks for
// the tests and the slow-motion view (its voices, as the JavaScript engine's voices, byKey and
// noteOn's result show them).

#include <algorithm>
#include <array>
#include <memory>

#include "forte/web.h"
#include "tines-engine.h"

using namespace forte::tines;

extern "C" void *forte_scratch();

namespace {
// each key's latest model, and its voice data packed
struct Key {
  uint64_t version = 0;
  KeyModel model;
  std::array<double, PACK_MAX> packed{};
  int count = 0;
};
std::array<std::unique_ptr<Key>, 128> keys;
int clampKey(int key) { return std::min(KEY_HI, std::max(KEY_LO, key)); }
const double *params() { return (const double *)forte_scratch(); }
} // namespace

extern "C" {
// Key m's model and voice data for the parameters in the scratch area (p::count numbers, as
// shared/wasm.js writes them) at sample rate fs; tines_model, tines_shape and tines_packed then
// read them. Returns 0 where the model failed (JavaScript throws).
FORTE_EXPORT int tines_key(int key, double fs) {
  key = clampKey(key);
  const uint64_t v = modelVersion(params(), fs);
  std::unique_ptr<Key> &c = keys[key];
  if (c && c->version == v) return c->model.ok;
  if (!c) c = std::make_unique<Key>();
  c->version = v;
  c->model = computeKey(key, params(), fs);
  c->count = 0;
  if (!c->model.ok) return 0;
  c->model.voice.version = v;
  c->count = packVoiceData(c->model.voice, c->packed.data());
  return 1;
}

// Key m's model into out, returning how many numbers: ok, key, the version; info (f0, L, d, mt,
// ms, s, xh, f1tine, Mb, M0, fBar); nq, n, iu, ip, the number of kept modes; tineRatios (nq); per
// kept mode col, f, sigma, w, pk, dampW, tineFrac, barFrac, blockFrac; the coupled shapes X (n × n).
FORTE_EXPORT int tines_model(int key, double *out) {
  const Key *c = keys[clampKey(key)].get();
  if (!c) return 0;
  const KeyModel &m = c->model;
  const Info &i = m.info;
  int n = 0;
  for (double v : {(double)m.ok, (double)m.key, (double)c->version, i.f0, i.L, i.d, i.mt, i.ms, i.s, i.xh, i.f1tine, i.Mb, i.M0, i.fBar,
                   (double)m.nq, (double)m.n, (double)m.iu, (double)m.ip, (double)m.modes.size()}) out[n++] = v;
  for (double r : i.tineRatios) out[n++] = r;
  for (const Mode &md : m.modes) for (double v : {(double)md.col, md.f, md.sigma, md.w, md.pk, md.dampW, md.tineFrac, md.barFrac, md.blockFrac}) out[n++] = v;
  for (double x : m.X) out[n++] = x;
  return n;
}
// The tine's mode j at x (m from the clamp), for key m's latest model.
FORTE_EXPORT double tines_shape(int key, int j, double x) {
  const Key *c = keys[clampKey(key)].get();
  return c && c->model.ok ? c->model.tine.shape(j, x) : 0;
}
// The key's voice data, packed (packVoiceData): what the page sends with a note.
FORTE_EXPORT const double *tines_packed(int key) { const Key *c = keys[clampKey(key)].get(); return c ? c->packed.data() : nullptr; }
FORTE_EXPORT int tines_packed_count(int key) { const Key *c = keys[clampKey(key)].get(); return c ? c->count : 0; }
// pickupFor(key, P) with P in the scratch area, into out: gap, wid, yoff, gain.
FORTE_EXPORT void tines_pickup(int key, double *out) {
  const Pickup pu = pickupFor(key, params());
  out[0] = pu.gap; out[1] = pu.wid; out[2] = pu.yoff; out[3] = pu.gain;
}
FORTE_EXPORT double tines_flux(double Y, double w) { return flux(Y, w); }

// The engine (forte_engine of a handle): a key's voice data from the page, written at
// tines_offer_buffer (PACK_MAX numbers), for that key's notes.
FORTE_EXPORT double *tines_offer_buffer(TinesEngine *e) { return e->offerBuffer(); }
FORTE_EXPORT int tines_offer(TinesEngine *e, int n) { return n <= PACK_MAX && e->offer(e->offerBuffer(), n); }

FORTE_EXPORT int tines_max_voices() { return TinesEngine::MAX_VOICES; }

// Its voices: the one the latest noteOn struck (null if none), and each in order.
FORTE_EXPORT TinesEngine::Voice *tines_last(TinesEngine *e) { return e->last; }
FORTE_EXPORT int tines_voices(TinesEngine *e) { return e->nVoices; }
FORTE_EXPORT TinesEngine::Voice *tines_voice_at(TinesEngine *e, int i) { return e->voices[i]; }
// A voice's key, N, hammerOn, contactSamples, Fmax, killing, dead, eta, etaPrev, keyDown, damped,
// peak, age, whether it is its key's (byKey), wid, yoff, gain, yMin, yMax.
FORTE_EXPORT void tines_voice(TinesEngine *e, TinesEngine::Voice *v, double *out) {
  const double x[19] = {(double)v->key, (double)v->N, (double)v->hammerOn, (double)v->contactSamples, v->Fmax, (double)v->killing,
                        (double)(v->dead || !v->inUse), v->eta, v->etaPrev, (double)v->keyDown, (double)v->damped, v->peak, v->age,
                        (double)(e->byKey[v->key] == v), v->wid, v->yoff, v->gain, v->yMin, v->yMax};
  std::copy_n(x, 19, out);
}
// Its modal state q[n] (N numbers, in the voice data's order).
FORTE_EXPORT double *tines_voice_q(TinesEngine::Voice *v) { return v->q.data(); }
}
