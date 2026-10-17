// plugin-tests.cpp — the shared CLAP plugin driven as a host drives it, on the smoke-test
// instrument: any sample rate and block size, notes and MIDI, presets, controllers, state.

#include <cmath>
#include <cstring>
#include <string>
#include <vector>

#include <clap/clap.h>

#include "check.h"
#include "plugin.h"

const forte::InstrumentInfo &forte_instrument();

namespace {

struct Events { // a host's event lists
  std::vector<std::vector<uint8_t>> in;
  std::vector<clap_event_param_value_t> out;
  clap_input_events_t inList{this, [](const clap_input_events_t *l) { return (uint32_t)((Events *)l->ctx)->in.size(); },
                             [](const clap_input_events_t *l, uint32_t i) { return (const clap_event_header_t *)((Events *)l->ctx)->in[i].data(); }};
  clap_output_events_t outList{this, [](const clap_output_events_t *l, const clap_event_header_t *h) {
                                 if (h->type == CLAP_EVENT_PARAM_VALUE) ((Events *)l->ctx)->out.push_back(*(const clap_event_param_value_t *)h);
                                 return true; }};
  template <class E> void add(const E &e) { in.emplace_back((const uint8_t *)&e, (const uint8_t *)&e + sizeof e); }
  void note(uint32_t t, bool on, int key, double vel) {
    clap_event_note_t e{{sizeof e, t, CLAP_CORE_EVENT_SPACE_ID, (uint16_t)(on ? CLAP_EVENT_NOTE_ON : CLAP_EVENT_NOTE_OFF), 0}, -1, 0, 0, (int16_t)key, vel};
    add(e);
  }
  void midi(uint32_t t, uint8_t a, uint8_t b, uint8_t c) {
    clap_event_midi_t e{{sizeof e, t, CLAP_CORE_EVENT_SPACE_ID, CLAP_EVENT_MIDI, 0}, 0, {a, b, c}};
    add(e);
  }
  void param(uint32_t t, clap_id id, double v) {
    clap_event_param_value_t e{{sizeof e, t, CLAP_CORE_EVENT_SPACE_ID, CLAP_EVENT_PARAM_VALUE, 0}, id, nullptr, -1, -1, -1, -1, v};
    add(e);
  }
};

const clap_host_t host{CLAP_VERSION, nullptr, "tests", "Forte", "", "1", [](const clap_host_t *, const char *) -> const void * { return nullptr; },
                       [](const clap_host_t *) {}, [](const clap_host_t *) {}, [](const clap_host_t *) {}};

struct Instance {
  const clap_plugin_t *p;
  const clap_plugin_params_t *params;
  const clap_plugin_state_t *state;
  explicit Instance(double fs) {
    forte::entryInit(forte_instrument());
    auto f = (const clap_plugin_factory_t *)forte::entryFactory(CLAP_PLUGIN_FACTORY_ID);
    p = f->create_plugin(f, &host, f->get_plugin_descriptor(f, 0)->id);
    p->init(p);
    params = (const clap_plugin_params_t *)p->get_extension(p, CLAP_EXT_PARAMS);
    state = (const clap_plugin_state_t *)p->get_extension(p, CLAP_EXT_STATE);
    p->activate(p, fs, 1, 4096);
    p->start_processing(p);
  }
  ~Instance() { p->stop_processing(p); p->deactivate(p); p->destroy(p); }
  clap_id id(const char *name) {
    for (uint32_t i = 0; i < params->count(p); i++) { clap_param_info_t info; params->get_info(p, i, &info); if (!std::strcmp(info.name, name)) return info.id; }
    return CLAP_INVALID_ID;
  }
  double value(const char *name) { double v = 0; params->get_value(p, id(name), &v); return v; }
  // run n frames in blocks of `block`, events (sorted, absolute times) delivered in their block
  std::vector<float> run(int n, int block, Events &ev) {
    std::vector<float> L(n), R(n);
    size_t next = 0;
    for (int at = 0; at < n; at += block) {
      const int m = std::min(block, n - at);
      Events e;
      while (next < ev.in.size()) {
        auto *h = (clap_event_header_t *)ev.in[next].data();
        if ((int)h->time >= at + m) break;
        std::vector<uint8_t> copy = ev.in[next++];
        ((clap_event_header_t *)copy.data())->time -= at;
        e.in.push_back(copy);
      }
      float *ch[2] = {L.data() + at, R.data() + at};
      clap_audio_buffer_t out{ch, nullptr, 2, 0, 0};
      clap_process_t proc{-1, (uint32_t)m, nullptr, nullptr, &out, 0, 1, &e.inList, &e.outList};
      p->process(p, &proc);
      ev.out.insert(ev.out.end(), e.out.begin(), e.out.end());
    }
    return L;
  }
};

double peak(const std::vector<float> &x, int a = 0, int b = -1) {
  double m = 0;
  for (int i = a; i < (b < 0 ? (int)x.size() : b); i++) { if (!std::isfinite(x[i])) return INFINITY; m = std::max(m, (double)std::fabs(x[i])); }
  return m;
}

} // namespace

TEST("plugin: plays at 44.1, 48, 96 and 192 kHz, with any block size, the same sound") {
  for (double fs : {44100.0, 48000.0, 96000.0, 192000.0}) {
    std::vector<float> first;
    for (int block : {1, 37, 128, 512, 4096}) {
      Instance in(fs);
      Events ev;
      ev.note(100, true, 60, 0.8); ev.note((uint32_t)(0.3 * fs), false, 60, 0);
      auto L = in.run((int)(0.5 * fs), block, ev);
      CHECK(peak(L) > 0.01 && peak(L) < 1);
      if (first.empty()) first = L;
      else { double d = 0; for (size_t i = 0; i < L.size(); i++) d = std::max(d, (double)std::fabs(L[i] - first[i])); CHECK(d < 2e-5); } // (a faded voice is dropped at a block's end)
      CHECK(peak(L, 0, 100) == 0); // nothing before the note, to the sample
    }
  }
}
TEST("plugin: MIDI notes, the pedal, All Notes Off") {
  Instance in(48000);
  Events ev;
  ev.midi(0, 0xb0, 64, 127);           // pedal down
  ev.midi(10, 0x90, 64, 100);
  ev.midi(4800, 0x80, 64, 0);          // released, but the pedal holds it
  ev.midi(24000, 0xb0, 123, 0);        // All Notes Off
  auto L = in.run(48000, 128, ev);
  CHECK(peak(L, 9600, 12000) > 0.01);  // still sounding under the pedal
  CHECK(peak(L, 24200, 48000) == 0);   // silenced
}
TEST("plugin: the Preset parameter applies a preset, keeping the kept parameters, and tells the host") {
  Instance in(48000);
  Events ev;
  ev.param(0, in.id("Volume"), 1.5);
  ev.param(10, in.id("Preset"), 1);    // "Long ring": decay 6
  in.run(256, 128, ev);
  CHECK(std::fabs(in.value("Ring time") - 6) < 1e-12);
  CHECK(std::fabs(in.value("Volume") - 1.5) < 1e-12); // kept
  bool told = false;
  for (auto &e : ev.out) told |= e.param_id == in.id("Ring time") && e.value == 6;
  CHECK(told);
}
TEST("plugin: the mod wheel moves its parameter from the default (at rest) to the maximum") {
  Instance in(48000);
  Events ev;
  ev.midi(0, 0xb0, 1, 127);
  in.run(128, 128, ev);
  CHECK(std::fabs(in.value("Ring time") - 10) < 1e-9);
  Events back;
  back.midi(0, 0xb0, 1, 0);
  in.run(128, 128, back);
  CHECK(std::fabs(in.value("Ring time") - 1) < 1e-9);
}
TEST("plugin: state saved and loaded into a new instance, by parameter id") {
  std::string saved;
  {
    Instance a(48000);
    Events ev;
    ev.param(0, a.id("Ring time"), 3.5);
    ev.param(0, a.id("Volume"), 0.25);
    a.run(128, 128, ev);
    clap_ostream_t os{&saved, [](const clap_ostream_t *s, const void *b, uint64_t n) -> int64_t { ((std::string *)s->ctx)->append((const char *)b, n); return (int64_t)n; }};
    CHECK(a.state->save(a.p, &os));
  }
  CHECK(saved.rfind("forte smoke 0.0.1\n", 0) == 0);
  Instance b(48000);
  struct Reader { std::string s; size_t at = 0; } r{saved + "unknown 7\n"}; // an id from a later version: ignored
  clap_istream_t is{&r, [](const clap_istream_t *s, void *b, uint64_t n) -> int64_t {
    auto *r = (Reader *)s->ctx; const size_t k = std::min<size_t>(n, std::min<size_t>(3, r->s.size() - r->at)); // a few bytes at a time
    std::memcpy(b, r->s.data() + r->at, k); r->at += k; return (int64_t)k; }};
  CHECK(b.state->load(b.p, &is));
  Events none;
  b.run(128, 128, none);
  CHECK(std::fabs(b.value("Ring time") - 3.5) < 1e-12);
  CHECK(std::fabs(b.value("Volume") - 0.25) < 1e-12);
}
TEST("plugin: values read as the page shows them, and typed values are understood") {
  Instance in(48000);
  char text[64];
  CHECK(in.params->value_to_text(in.p, in.id("Ring time"), 2.5, text, sizeof text) && std::string(text) == "2.50 s");
  double v = 0;
  CHECK(in.params->text_to_value(in.p, in.id("Ring time"), "4 s", &v) && std::fabs(v - 4) < 1e-12);
  CHECK(in.params->value_to_text(in.p, in.id("Preset"), 1, text, sizeof text) && std::string(text) == "Long ring");
}

TEST("plugin: the editor's calls set parameters, play notes and show what the host changed") {
  Instance in(48000);
  auto bridge = (const forte::EditorBridge *)in.p->get_extension(in.p, forte::kEditorBridge);
  CHECK(bridge != nullptr);
  auto call = [&](const char *json) { return bridge->call(in.p, json); };
  const std::string d = call("[\"describe\"]");
  CHECK(d.find("\"name\": \"Forte Smoke Test\"") != std::string::npos);
  CHECK(d.find("\"Long ring\"") != std::string::npos && d.find("\"presets\": 2") != std::string::npos);
  CHECK(d.find("\"space\": \"sustain\"") != std::string::npos);
  CHECK(call("[\"poll\"]").find("[1, 0.4, \"-1.9 dB\"]") != std::string::npos); // every value once
  CHECK(call("[\"poll\"]").find("\"p\": []") != std::string::npos);            // then only changes

  // a slider half way along: Ring time is a log parameter, 0.1 … 10 s
  CHECK(call("[\"gesture\", 0, 1]") == "null");
  CHECK(call("[\"set\", 0, 0.5]").find("\"text\": \"1.00 s\"") != std::string::npos);
  CHECK(std::fabs(in.value("Ring time") - 1) < 1e-9); // the host reads it at once
  call("[\"set\", 1, 0.75]");
  CHECK(call("[\"poll\"]").find("\"p\": []") != std::string::npos); // the editor's own changes don't come back
  call("[\"gesture\", 0, 0]");
  Events ev;
  in.run(128, 128, ev);
  CHECK(std::fabs(in.value("Volume") - 1.5) < 1e-12);
  bool told = false;
  for (auto &e : ev.out) told |= e.param_id == in.id("Volume") && std::fabs(e.value - 1.5) < 1e-12;
  CHECK(told); // the host records it

  // a key from the editor sounds, and shows as down; the host's preset comes back to the editor
  call("[\"note\", 69, 0.8]");
  Events preset;
  preset.param(0, in.id("Preset"), 1);
  auto L = in.run(4800, 128, preset);
  CHECK(peak(L) > 0.01);
  const std::string polled = call("[\"poll\"]");
  CHECK(polled.find("\"keys\": [69]") != std::string::npos);
  CHECK(polled.find("[2, 1, \"Long ring\"]") != std::string::npos && polled.find("\"6.00 s\"") != std::string::npos);
  call("[\"note\", 69, 0]");
  call("[\"panic\"]");
  Events none;
  L = in.run(4800, 128, none);
  CHECK(call("[\"poll\"]").find("\"keys\": []") != std::string::npos);
  CHECK(call("[\"set\", 99, 1]") == "null" && call("[\"nonsense\"]") == "null" && call("not json") == "error");
}

int main() { return check::run(); }
