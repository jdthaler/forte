// engine-api.cpp — an instrument's engine for JavaScript, as C functions on a handle: the engine
// contract (forte/engine.h) for the WebAssembly build. shared/wasm.js wraps them in a class with
// the contract's methods, which shared/worklet.js and the Node tests call.

#include <cstring>
#include <memory>

#include "forte/denormals.h"
#include "forte/instrument.h"
#include "forte/tuning.h"
#include "forte/web.h"

const forte::InstrumentInfo &forte_instrument();

namespace {
struct Handle {
  std::unique_ptr<forte::Engine> engine;
  std::unique_ptr<double[]> P;
  float L[128], R[128];
  forte::SpscQueue<forte::Message> messages{256};
  forte::Message message;
};
alignas(16) unsigned char scratch[1 << 16]; // for the model functions' arguments and results
} // namespace

extern "C" {
FORTE_EXPORT int forte_param_count() { return forte_instrument().paramCount; }
FORTE_EXPORT const char *forte_param_id(int i) { return forte_instrument().params[i].id; }
FORTE_EXPORT void *forte_scratch() { return scratch; }
FORTE_EXPORT int forte_scratch_size() { return (int)sizeof scratch; }

FORTE_EXPORT Handle *forte_create(double fs) {
  const forte::InstrumentInfo &I = forte_instrument();
  Handle *h = new Handle;
  h->engine.reset(I.create(fs));
  h->engine->messages = &h->messages;
  h->P.reset(new double[I.paramCount]);
  for (int i = 0; i < I.paramCount; i++) h->P[i] = I.params[i].def;
  return h;
}
FORTE_EXPORT void forte_destroy(Handle *h) { delete h; }
// the engine itself, for an instrument's own exports (its tests' hooks)
FORTE_EXPORT forte::Engine *forte_engine(Handle *h) { return h->engine.get(); }
FORTE_EXPORT double *forte_params(Handle *h) { return h->P.get(); }
FORTE_EXPORT void forte_set_params(Handle *h) { h->engine->setParams(h->P.get()); }
FORTE_EXPORT void forte_note_on(Handle *h, int key, double velocity) { h->engine->noteOn(key, velocity); }
FORTE_EXPORT void forte_note_off(Handle *h, int key, double velocity) { h->engine->noteOff(key, velocity); }
FORTE_EXPORT void forte_set_sustain(Handle *h, int on) { h->engine->setSustain(on != 0); }
FORTE_EXPORT void forte_all_notes_off(Handle *h) { h->engine->allNotesOff(); }
FORTE_EXPORT void forte_pressure(Handle *h, double value, int key) { h->engine->pressure(value, key); }
FORTE_EXPORT void forte_bend(Handle *h, double value) { h->engine->bend(value); }
FORTE_EXPORT void forte_note_bend(Handle *h, double ratio, int key) { h->engine->noteBend(ratio, key); }
FORTE_EXPORT void forte_slide(Handle *h, double value, int key) { h->engine->slide(value, key); }
FORTE_EXPORT int forte_voice_count(Handle *h) { return h->engine->voiceCount(); }
FORTE_EXPORT float *forte_left(Handle *h) { return h->L; }
FORTE_EXPORT float *forte_right(Handle *h) { return h->R; }
FORTE_EXPORT void forte_process(Handle *h, int n) { h->engine->process(h->L, h->R, n < 128 ? n : 128); }
// The keyboard's tuning the handle's parameters give (forte/tuning.h): each pitch class's cents from
// equal temperament at A = 440 Hz, into out[0 … 11]; 0 if the instrument has no tuning parameters.
FORTE_EXPORT int forte_tuning_cents(Handle *h, double *out) {
  const forte::InstrumentInfo &I = forte_instrument();
  auto at = [&](const char *id) { for (int i = 0; i < I.paramCount; i++) if (!std::strcmp(I.params[i].id, id)) return i; return -1; };
  const int pitch = at("pitch"), temper = at("temperament"), root = at("tuningRoot");
  double custom[forte::kCustomCents];
  for (int k = 0; k < forte::kCustomCents; k++) {
    const char ids[11][8] = {"cents1", "cents2", "cents3", "cents4", "cents5", "cents6", "cents7", "cents8", "cents9", "cents10", "cents11"};
    const int i = at(ids[k]);
    if (i < 0) return 0;
    custom[k] = h->P[i];
  }
  if (pitch < 0 || temper < 0 || root < 0) return 0;
  const forte::Tuning T = forte::makeTuning(h->P[pitch], h->P[temper], h->P[root], custom);
  for (int i = 0; i < 12; i++) out[i] = T.cents[i];
  return 1;
}
// the next message the engine posted, or null
FORTE_EXPORT forte::Message *forte_message(Handle *h) { return h->messages.pop(h->message) ? &h->message : nullptr; }
}
