// organ-plugin-tests.cpp — the tonewheel organ's plugin driven as a host drives it: the console's
// parameters set by the presets, the Leslie switched by the mod wheel (CC1) and flipped by each
// press of a sustain pedal (CC64) or the window's Space bar, and left alone while bypassed; the
// host told each time.

#include <cmath>
#include <cstring>
#include <string>
#include <vector>

#include <clap/clap.h>

#include "check.h"
#include "organ-params.h"
#include "plugin.h"

const forte::InstrumentInfo &forte_instrument();

namespace {

using namespace forte::organ;

struct Events { // a host's event lists
  std::vector<std::vector<uint8_t>> in;
  std::vector<clap_event_param_value_t> out;
  clap_input_events_t inList{this, [](const clap_input_events_t *l) { return (uint32_t)((Events *)l->ctx)->in.size(); },
                             [](const clap_input_events_t *l, uint32_t i) { return (const clap_event_header_t *)((Events *)l->ctx)->in[i].data(); }};
  clap_output_events_t outList{this, [](const clap_output_events_t *l, const clap_event_header_t *h) {
                                 if (h->type == CLAP_EVENT_PARAM_VALUE) ((Events *)l->ctx)->out.push_back(*(const clap_event_param_value_t *)h);
                                 return true; }};
  template <class E> void add(const E &e) { in.emplace_back((const uint8_t *)&e, (const uint8_t *)&e + sizeof e); }
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
  explicit Instance(double fs) {
    forte::entryInit(forte_instrument());
    auto f = (const clap_plugin_factory_t *)forte::entryFactory(CLAP_PLUGIN_FACTORY_ID);
    p = f->create_plugin(f, &host, f->get_plugin_descriptor(f, 0)->id);
    p->init(p);
    params = (const clap_plugin_params_t *)p->get_extension(p, CLAP_EXT_PARAMS);
    p->activate(p, fs, 1, 4096);
    p->start_processing(p);
  }
  ~Instance() { p->stop_processing(p); p->deactivate(p); p->destroy(p); }
  clap_id id(const char *pid) { return forte::paramHash(pid); }
  double value(const char *pid) { double v = 0; params->get_value(p, id(pid), &v); return v; }
  std::vector<float> run(int n, Events &ev) {
    std::vector<float> L(n), R(n);
    float *ch[2] = {L.data(), R.data()};
    clap_audio_buffer_t out{ch, nullptr, 2, 0, 0};
    clap_process_t proc{-1, (uint32_t)n, nullptr, nullptr, &out, 0, 1, &ev.inList, &ev.outList};
    p->process(p, &proc);
    return L;
  }
  int iv(const char *pid) { return (int)std::lround(value(pid)); }
  int cc(int n, int v) { Events ev; ev.midi(0, 0xb0, (uint8_t)n, (uint8_t)v); run(128, ev); return iv("leslie"); }
};

bool told(const Events &ev, clap_id id, double v) {
  for (auto &e : ev.out) if (e.param_id == id && e.value == v) return true;
  return false;
}

} // namespace

TEST("organ plugin: the console is parameters, and a preset sets all of it") {
  Instance in(48000);
  CHECK(in.iv("leslie") == leslie_::slow && in.iv("vib") == vib_::C3 && in.value("drawbar3") == 8 && in.value("motor") == 1);
  Events ev;
  ev.param(0, forte::paramHash("drawbar5"), 6); ev.param(0, forte::paramHash("percOn"), 1);
  ev.param(0, 0x7ffffffe, 7); // the Preset: "Single wheel — 00 8000 000, dry"
  in.run(256, ev);
  CHECK(in.iv("leslie") == leslie_::bypass && in.iv("vib") == vib_::off && in.value("drive") == 0);
  for (int d = 1; d <= 9; d++) CHECK(in.value(("drawbar" + std::to_string(d)).c_str()) == (d == 3 ? 8 : 0));
  CHECK(in.value("percOn") == 0 && told(ev, in.id("drawbar5"), 0) && told(ev, in.id("leslie"), leslie_::bypass));
}

TEST("organ plugin: the mod wheel switches the Leslie, a sustain pedal's press flips it, bypassed it stays") {
  Instance in(48000);
  CHECK(in.cc(1, 127) == leslie_::fast);
  CHECK(in.cc(1, 20) == leslie_::slow);
  CHECK(in.cc(64, 127) == leslie_::fast); // a press
  CHECK(in.cc(64, 127) == leslie_::fast); // still down
  CHECK(in.cc(64, 0) == leslie_::fast);   // let go
  CHECK(in.cc(64, 100) == leslie_::slow); // pressed again
  Events tell;
  tell.midi(0, 0xb0, 1, 127);
  in.run(128, tell);
  CHECK(told(tell, in.id("leslie"), leslie_::fast)); // the host sees it
  Events bypass;
  bypass.param(0, in.id("leslie"), leslie_::bypass);
  in.run(128, bypass);
  CHECK(in.cc(1, 0) == leslie_::bypass && in.cc(64, 0) == leslie_::bypass && in.cc(64, 127) == leslie_::bypass);
  CHECK(in.cc(11, 0) == leslie_::bypass && in.value("expression") == 0); // CC11: the expression pedal
}

TEST("organ plugin: the window's Space bar flips the Leslie") {
  Instance in(48000);
  auto bridge = (const forte::EditorBridge *)in.p->get_extension(in.p, forte::kEditorBridge);
  CHECK(bridge != nullptr);
  auto call = [&](const char *json) { return bridge->call(in.p, json); };
  const std::string d = call("[\"describe\"]");
  CHECK(d.find("\"space\": \"switch\"") != std::string::npos && d.find("\"switch\": [\"Leslie\", \"Slow\", \"Fast\"]") != std::string::npos);
  call("[\"pedal\", 1]");
  call("[\"pedal\", 0]");
  Events ev;
  in.run(128, ev);
  CHECK(in.iv("leslie") == leslie_::fast);
  call("[\"pedal\", 1]");
  call("[\"pedal\", 0]");
  in.run(128, ev);
  CHECK(in.iv("leslie") == leslie_::slow);
}

int main() { return check::run(); }
