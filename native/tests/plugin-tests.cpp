// plugin-tests.cpp — the shared CLAP plugin driven as a host drives it, on the smoke-test
// instrument: any sample rate and block size, notes and MIDI, presets, controllers, state, and MPE
// (from MIDI, and as CLAP's note expressions).

#include <algorithm>
#include <cmath>
#include <cstring>
#include <numbers>
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
  void note(uint32_t t, bool on, int channel, int key, double vel) {
    clap_event_note_t e{{sizeof e, t, CLAP_CORE_EVENT_SPACE_ID, (uint16_t)(on ? CLAP_EVENT_NOTE_ON : CLAP_EVENT_NOTE_OFF), 0}, -1, 0, (int16_t)channel, (int16_t)key, vel};
    add(e);
  }
  void expression(uint32_t t, int id, int channel, int key, double v) {
    clap_event_note_expression_t e{{sizeof e, t, CLAP_CORE_EVENT_SPACE_ID, CLAP_EVENT_NOTE_EXPRESSION, 0}, (clap_note_expression)id, -1, 0, (int16_t)channel, (int16_t)key, v};
    add(e);
  }
  // MPE's configuration message on a master (channel 0 or 15): `members` member channels
  void mcm(uint32_t t, int master, int members) {
    midi(t, 0xb0 | master, 101, 0); midi(t, 0xb0 | master, 100, 6); midi(t, 0xb0 | master, 6, members);
  }
  void bend(uint32_t t, int channel, double v) { // −1 … 1
    const int b = std::clamp((int)std::lround(v * 8191) + 8192, 0, 16383);
    midi(t, 0xe0 | channel, b & 127, b >> 7);
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

// the amplitude of the tone at f Hz in x[a … b)
double tone(const std::vector<float> &x, double f, double fs, int a, int b) {
  double c = 0, d = 0;
  for (int i = a; i < b; i++) { c += x[i] * std::cos(2 * std::numbers::pi * f * i / fs); d += x[i] * std::sin(2 * std::numbers::pi * f * i / fs); }
  return 2 * std::hypot(c, d) / (b - a);
}
// the loudest of the frequencies `fs` in x[a … b), as an index
int loudest(const std::vector<float> &x, std::initializer_list<double> fs, int a, int b) {
  int best = -1, k = 0;
  double m = 0;
  for (double f : fs) { const double t = tone(x, f, 48000, a, b); if (t > m) { m = t; best = k; } k++; }
  return best;
}

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
TEST("plugin: keys past a historical compass play once Full range opens it, in the window too") {
  auto level = [](int key, bool open) {
    Instance in(48000);
    Events ev;
    if (open) ev.param(0, in.id("Full range"), 1);
    ev.note(10, true, key, 0.8);
    return peak(in.run(4800, 128, ev));
  };
  CHECK(level(60, false) > 0.01 && level(36, false) > 0.01 && level(96, false) > 0.01); // the compass, 36–96
  CHECK(level(35, false) == 0 && level(21, false) == 0 && level(108, false) == 0);    // past it: silent
  CHECK(level(21, true) > 0.01 && level(108, true) > 0.01);                           // opened: every key
  Instance in(48000);
  auto bridge = (const forte::EditorBridge *)in.p->get_extension(in.p, forte::kEditorBridge);
  const std::string d = bridge->call(in.p, "[\"describe\"]");
  CHECK(d.find("\"keyLo\": 21") != std::string::npos && d.find("\"keyHi\": 108") != std::string::npos);
  CHECK(d.find("\"compass\": [36, 96, 2]") != std::string::npos); // the window's keys follow the toggle
}
TEST("plugin: the velocity curve bends MIDI velocity; the soft pedal strikes softer") {
  auto level = [](int curve, bool softPedal) {
    Instance in(48000);
    Events ev;
    ev.param(0, in.id("Velocity curve"), curve);
    if (softPedal) ev.midi(1, 0xb0, 67, 127);
    ev.midi(10, 0x90, 60, 64);
    return peak(in.run(4800, 128, ev));
  };
  const double normal = level(1, false), v = 64 / 127.0;
  CHECK(normal > 0.001);
  CHECK_NEAR(level(0, false) / normal, std::pow(v, 0.6) / v, 0.02);
  CHECK_NEAR(level(2, false) / normal, std::pow(v, 1.6) / v, 0.02);
  CHECK_NEAR(level(1, true) / normal, 0.6, 0.02);
  Instance in(48000);
  CHECK(std::fabs(in.value("Velocity curve") - 1) < 1e-12); // Normal by default
  char text[64];
  in.params->value_to_text(in.p, in.id("Velocity curve"), 2, text, sizeof text);
  CHECK(!std::strcmp(text, "Hard"));
}
TEST("plugin: Quality is the plugin's own (High by default, not automatable), reaches the engine, and is High when the host renders offline") {
  // two notes at once: the smoke engine plays one voice at Low
  auto level = [](double quality, bool offline) {
    Instance in(48000);
    if (offline) {
      auto render = (const clap_plugin_render_t *)in.p->get_extension(in.p, CLAP_EXT_RENDER);
      CHECK(render && !render->has_hard_realtime_requirement(in.p));
      in.p->stop_processing(in.p);
      CHECK(render->set(in.p, CLAP_RENDER_OFFLINE));
      in.p->start_processing(in.p);
    }
    Events ev;
    ev.param(0, in.id("Quality"), quality);
    ev.note(10, true, 60, 0.8); ev.note(10, true, 67, 0.8);
    return peak(in.run(9600, 128, ev));
  };
  const double high = level(0, false), low = level(2, false);
  CHECK(high > 0.25 && low > 0.1 && low < 0.2);         // two voices, then one
  CHECK(std::fabs(level(1, false) - high) < 1e-9);      // Medium: eight voices, both play
  CHECK(std::fabs(level(2, true) - high) < 1e-9);       // offline: High
  Instance in(48000);
  CHECK(in.value("Quality") == 0);
  char text[64];
  CHECK(in.params->value_to_text(in.p, in.id("Quality"), 2, text, sizeof text) && std::string(text) == "Low");
  clap_param_info_t info;
  for (uint32_t i = 0; i < in.params->count(in.p); i++) if (in.params->get_info(in.p, i, &info) && info.id == in.id("Quality")) break;
  CHECK(!(info.flags & CLAP_PARAM_IS_AUTOMATABLE) && std::string(info.module) == "CPU");
}
TEST("plugin: the sostenuto pedal holds the keys down as it goes down, and only those") {
  Instance in(48000);
  Events ev;
  ev.midi(0, 0x90, 60, 100);
  ev.midi(100, 0xb0, 66, 127);         // sostenuto down: 60 is caught
  ev.midi(200, 0x80, 60, 0);           // let go, but held
  ev.midi(300, 0x90, 72, 100);         // struck after: not caught
  ev.midi(4800, 0x80, 72, 0);
  ev.midi(24000, 0xb0, 66, 0);         // sostenuto up: 60 ends
  auto L = in.run(48000, 128, ev);
  // only 60 is left after 72's damping: its pitch alone from 0.15 s
  int crossings = 0;
  for (int i = 14400; i < 19200; i++) crossings += (L[i - 1] < 0) != (L[i] < 0);
  CHECK(std::abs(crossings / 2 / 0.1 - 261.6) < 15);
  CHECK(peak(L, 14400, 19200) > 0.001);
  CHECK(peak(L, 40000, 48000) < 1e-4);
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
TEST("plugin: a fader moves its parameter across the whole range, in log(value) for a log one; a toggle at 64") {
  Instance in(48000);
  auto fader = [&](int cc, int v) { Events ev; ev.midi(0, 0xb0, (uint8_t)cc, (uint8_t)v); in.run(128, 128, ev); };
  fader(107, 0);
  CHECK(std::fabs(in.value("Ring time") - 0.1) < 1e-9);
  fader(107, 127);
  CHECK(std::fabs(in.value("Ring time") - 10) < 1e-9);
  fader(107, 64);
  CHECK(std::fabs(in.value("Ring time") - 0.1 * std::pow(100.0, 64 / 127.0)) < 1e-9); // as shared/midi.js ccValue
  fader(109, 63);
  CHECK(in.value("Full range") == 0);
  fader(109, 64);
  CHECK(in.value("Full range") == 1);
}
TEST("plugin: state saved and loaded into a new instance, by parameter id") {
  std::string saved;
  {
    Instance a(48000);
    Events ev;
    ev.param(0, a.id("Ring time"), 3.5);
    ev.param(0, a.id("Volume"), 0.25);
    ev.param(0, a.id("Quality"), 1);
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
  CHECK(b.value("Quality") == 1); // the project keeps its Quality
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
  CHECK(d.find("\"Long ring\"") != std::string::npos && d.find("\"presets\": 3") != std::string::npos);
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
  CHECK(polled.find("[3, 1, \"Long ring\"]") != std::string::npos && polled.find("\"6.00 s\"") != std::string::npos);
  call("[\"note\", 69, 0]");
  call("[\"panic\"]");
  Events none;
  L = in.run(4800, 128, none);
  CHECK(call("[\"poll\"]").find("\"keys\": []") != std::string::npos);
  CHECK(call("[\"set\", 99, 1]") == "null" && call("[\"nonsense\"]") == "null" && call("not json") == "error");
}

const double kC4 = 261.6255653005986, kE4 = 329.6275569128699;
const double up(double f, double semitones) { return f * std::pow(2.0, semitones / 12); }

TEST("plugin: MPE on Auto: plain MIDI until the configuration message, then each member channel bends and slides its own note") {
  Instance in(48000);
  CHECK(in.value("MPE") == 0); // Auto
  Events ev;
  ev.midi(0, 0x91, 60, 100); ev.midi(0, 0x92, 64, 100); // C4 on channel 2, E4 on 3
  ev.bend(10, 1, 0.5);                                   // plain MIDI: the whole instrument, +1 semitone
  auto L = in.run(9600, 128, ev);
  CHECK(loudest(L, {up(kC4, 1), up(kC4, 24)}, 4800, 9600) == 0);
  CHECK(loudest(L, {up(kE4, 1), kE4}, 4800, 9600) == 0);

  Events mpe;
  mpe.bend(0, 1, 0); mpe.midi(0, 0xb1, 74, 0); // as a controller sends them before its note
  mpe.mcm(0, 0, 15);                          // the lower zone, 15 members
  mpe.midi(0, 0x81, 60, 0); mpe.midi(0, 0x82, 64, 0);
  mpe.bend(100, 1, 0.25);                     // ignored: no note on channel 2 yet
  mpe.midi(200, 0x91, 60, 100);               // C4 struck at channel 2's bend: +12 semitones
  mpe.midi(200, 0x92, 64, 100);
  mpe.bend(4800, 2, -1.0 / 48);               // E4 down a semitone, C4 left where it is
  L = in.run(14400, 128, mpe);
  CHECK(loudest(L, {kC4, up(kC4, 12)}, 1000, 4800) == 1);
  CHECK(loudest(L, {up(kC4, 12), kC4, up(kC4, 11)}, 9600, 14400) == 0);
  CHECK(loudest(L, {kE4, up(kE4, -1)}, 9600, 14400) == 1);
}

TEST("plugin: MPE On needs no configuration message; Off never decodes one; the choice is saved") {
  for (int mode : {1, 2}) {
    Instance in(48000);
    Events ev;
    ev.param(0, in.id("MPE"), mode);
    ev.mcm(0, 15, mode == 2 ? 15 : 0); // On: an upper zone of none leaves the lower zone as it was
    ev.midi(10, 0x93, 60, 100);
    ev.bend(10, 3, 0.25);               // +12 on MPE, +0.5 as plain MIDI
    auto L = in.run(9600, 128, ev);
    CHECK(loudest(L, {up(kC4, 12), up(kC4, 0.5)}, 4800, 9600) == (mode == 1 ? 0 : 1));
    std::string saved;
    clap_ostream_t os{&saved, [](const clap_ostream_t *s, const void *b, uint64_t n) -> int64_t { ((std::string *)s->ctx)->append((const char *)b, n); return (int64_t)n; }};
    CHECK(in.state->save(in.p, &os));
    CHECK(saved.find("\nmpe " + std::to_string(mode) + "\n") != std::string::npos);
  }
}

TEST("plugin: RPN 0 on a member sets the zone's bend range; a note struck plain after an MPE note on its key starts unbent") {
  Instance in(48000);
  Events ev;
  ev.mcm(0, 0, 7);
  ev.midi(0, 0xb2, 101, 0); ev.midi(0, 0xb2, 100, 0); ev.midi(0, 0xb2, 6, 12); // ±12 semitones
  ev.bend(0, 4, 0.5);
  ev.midi(10, 0x94, 60, 100);
  auto L = in.run(9600, 128, ev);
  CHECK(loudest(L, {up(kC4, 6), up(kC4, 24)}, 4800, 9600) == 0);
  Events plain;
  plain.midi(0, 0x84, 60, 0);
  plain.midi(4800, 0x90, 60, 100); // on the master: a plain note
  L = in.run(14400, 128, plain);
  CHECK(loudest(L, {kC4, up(kC4, 6)}, 9600, 14400) == 0);
}

TEST("plugin: CLAP's note expressions bend and slide one note; the AU wrapper's channel-wide bend and pressure are the channel's MIDI") {
  Instance in(48000);
  Events ev;
  ev.note(0, true, 0, 60, 0.8); ev.note(0, true, 0, 64, 0.8);
  ev.expression(10, CLAP_NOTE_EXPRESSION_TUNING, 0, 64, -2); // E4 down a tone (Bitwig, VST3's tuning)
  ev.expression(10, CLAP_NOTE_EXPRESSION_BRIGHTNESS, 0, 60, 0); // C4's own ring time: the wheel at rest, the default
  auto L = in.run(9600, 128, ev);
  CHECK(loudest(L, {kE4, up(kE4, -2)}, 4800, 9600) == 1);
  CHECK(loudest(L, {kC4, up(kC4, -2)}, 4800, 9600) == 0);
  Events au;
  au.expression(0, CLAP_NOTE_EXPRESSION_TUNING, 0, -1, 1); // the wheel half up, as the AU wrapper sends it: +1 semitone, every note
  L = in.run(9600, 128, au);
  CHECK(loudest(L, {kC4, up(kC4, 1)}, 4800, 9600) == 1);
  CHECK(loudest(L, {up(kE4, -2), up(kE4, -1)}, 4800, 9600) == 1);
  // a slide shortens one note's ring: fully up, the wheel's top (10 s) from the default 1 s
  Events slide;
  slide.note(0, true, 0, 72, 0.8);
  slide.expression(0, CLAP_NOTE_EXPRESSION_BRIGHTNESS, 0, 72, 1);
  slide.note(0, true, 0, 76, 0.8);
  L = in.run(48000, 128, slide);
  const double c5 = tone(L, up(kC4, 13), 48000, 36000, 48000), e5 = tone(L, up(kE4, 13), 48000, 36000, 48000);
  CHECK(c5 > 5 * e5);
}

int main() { return check::run(); }
