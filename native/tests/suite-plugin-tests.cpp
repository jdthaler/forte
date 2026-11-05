// suite-plugin-tests.cpp — the Forte app's plugin (net.jthaler.forte.suite, plugin.cpp's Suite),
// with every instrument linked in as forte_add_suite() links them: its Instrument menu, a switch
// while the audio runs, and state that remembers the instrument. And every instrument's saved
// states from earlier releases (states/, tools/contract.mjs), loaded into today's plugins, and
// your own presets: the files the site writes (presets/, shared/presets.js) open in the window,
// and the window writes the same.

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include <clap/clap.h>

#include "check.h"
#include "choc/text/choc_JSON.h"
#include "choc/memory/choc_Base64.h"
#include "forte/tuning.h"
#include "plugin.h"

// the app's entry (generated suite-entry.cpp)
bool forte_entry_init(const char *path);
const void *forte_entry_get_factory(const char *id);

namespace {

const clap_host_t host{CLAP_VERSION, nullptr, "tests", "Forte", "", "1", [](const clap_host_t *, const char *) -> const void * { return nullptr; },
                       [](const clap_host_t *) {}, [](const clap_host_t *) {}, [](const clap_host_t *) {}};

struct App {
  const clap_plugin_t *p;
  const clap_plugin_params_t *params;
  const clap_plugin_state_t *state;
  const forte::EditorBridge *bridge;
  bool processing = false;
  explicit App(bool process = true) {
    forte_entry_init("");
    auto f = (const clap_plugin_factory_t *)forte_entry_get_factory(CLAP_PLUGIN_FACTORY_ID);
    p = f->create_plugin(f, &host, "net.jthaler.forte.suite");
    p->init(p);
    params = (const clap_plugin_params_t *)p->get_extension(p, CLAP_EXT_PARAMS);
    state = (const clap_plugin_state_t *)p->get_extension(p, CLAP_EXT_STATE);
    bridge = (const forte::EditorBridge *)p->get_extension(p, forte::kEditorBridge);
    if (process) { p->activate(p, 48000, 1, 4096); p->start_processing(p); processing = true; }
  }
  ~App() { if (processing) { p->stop_processing(p); p->deactivate(p); } p->destroy(p); }
  std::string call(const std::string &json) { return bridge->call(p, json.c_str()); }
  std::string slug() { const std::string d = call("[\"describe\"]"); size_t a = d.find("\"slug\": \"") + 9; return d.substr(a, d.find('"', a) - a); }
  int number(const std::string &d, const char *key) { size_t a = d.find(std::string("\"") + key + "\": "); return a == std::string::npos ? -1 : std::atoi(d.c_str() + a + std::strlen(key) + 4); }
  // n frames of audio, with a note-on of key at the start if key >= 0
  double run(int n, int key = -1) {
    std::vector<uint8_t> ev;
    clap_event_note_t e{{sizeof e, 0, CLAP_CORE_EVENT_SPACE_ID, CLAP_EVENT_NOTE_ON, 0}, -1, 0, 0, (int16_t)key, 0.8};
    clap_input_events_t in{&e, [](const clap_input_events_t *l) { return ((clap_event_note_t *)l->ctx)->key >= 0 ? 1u : 0u; },
                           [](const clap_input_events_t *l, uint32_t) { return (const clap_event_header_t *)l->ctx; }};
    clap_output_events_t out{nullptr, [](const clap_output_events_t *, const clap_event_header_t *) { return true; }};
    double peak = 0;
    for (int at = 0; at < n; at += 512) {
      float L[512], R[512];
      float *ch[2] = {L, R};
      clap_audio_buffer_t buf{ch, nullptr, 2, 0, 0};
      clap_input_events_t none{nullptr, [](const clap_input_events_t *) { return 0u; }, [](const clap_input_events_t *, uint32_t) -> const clap_event_header_t * { return nullptr; }};
      clap_process_t proc{-1, 512, nullptr, nullptr, &buf, 0, 1, at == 0 ? &in : &none, &out};
      p->process(p, &proc);
      for (float x : L) peak = std::isfinite(x) ? std::max(peak, (double)std::fabs(x)) : INFINITY;
    }
    return peak;
  }
  // one block of 512 frames with these events at its start: a note on (key, true) or off (false),
  // or a MIDI message; and its peak
  struct Ev { int key; bool on; uint8_t midi[3] = {0, 0, 0}; };
  double play(const std::vector<Ev> &list) {
    std::vector<clap_event_note_t> notes;
    std::vector<clap_event_midi_t> midis;
    std::vector<const clap_event_header_t *> all;
    notes.reserve(list.size()); midis.reserve(list.size());
    for (const Ev &e : list) {
      if (e.key >= 0) {
        notes.push_back({{sizeof(clap_event_note_t), 0, CLAP_CORE_EVENT_SPACE_ID, (uint16_t)(e.on ? CLAP_EVENT_NOTE_ON : CLAP_EVENT_NOTE_OFF), 0}, -1, 0, 0, (int16_t)e.key, 0.8});
        all.push_back(&notes.back().header);
      } else {
        midis.push_back({{sizeof(clap_event_midi_t), 0, CLAP_CORE_EVENT_SPACE_ID, CLAP_EVENT_MIDI, 0}, 0, {e.midi[0], e.midi[1], e.midi[2]}});
        all.push_back(&midis.back().header);
      }
    }
    clap_input_events_t in{&all, [](const clap_input_events_t *l) { return (uint32_t)((std::vector<const clap_event_header_t *> *)l->ctx)->size(); },
                           [](const clap_input_events_t *l, uint32_t i) { return (*(std::vector<const clap_event_header_t *> *)l->ctx)[i]; }};
    clap_output_events_t out{nullptr, [](const clap_output_events_t *, const clap_event_header_t *) { return true; }};
    float L[512], R[512];
    float *ch[2] = {L, R};
    clap_audio_buffer_t buf{ch, nullptr, 2, 0, 0};
    clap_process_t proc{-1, 512, nullptr, nullptr, &buf, 0, 1, &in, &out};
    p->process(p, &proc);
    double peak = 0;
    for (int i = 0; i < 512; i++) peak = std::isfinite(L[i]) && std::isfinite(R[i]) ? std::max(peak, (double)std::max(std::fabs(L[i]), std::fabs(R[i]))) : INFINITY;
    return peak;
  }
  // the keys a part sounds, as the window's poll gives them: "keys" the part it shows, "other" the other's
  std::vector<int> keys(const char *which = "keys") {
    const auto r = choc::json::parse(call("[\"poll\"]"));
    std::vector<int> k;
    if (r.hasObjectMember(which)) for (uint32_t i = 0; i < r[which].size(); i++) k.push_back(r[which][i].get<int>());
    return k;
  }
  choc::value::Value describe() { return choc::json::parse(call("[\"describe\"]")); }
  std::string saveState() {
    std::string t;
    clap_ostream_t os{&t, [](const clap_ostream_t *s, const void *b, uint64_t n) -> int64_t { ((std::string *)s->ctx)->append((const char *)b, n); return (int64_t)n; }};
    state->save(p, &os);
    return t;
  }
  bool load(const std::string &text) {
    struct Reader { std::string s; size_t at = 0; } r{text};
    clap_istream_t is{&r, [](const clap_istream_t *s, void *b, uint64_t n) -> int64_t {
                        auto r = (Reader *)s->ctx; size_t k = std::min((size_t)n, r->s.size() - r->at);
                        std::memcpy(b, r->s.data() + r->at, k); r->at += k; return (int64_t)k; }};
    return state->load(p, &is);
  }
};
bool holds(const std::vector<int> &v, int k) { return std::find(v.begin(), v.end(), k) != v.end(); }
int paramAt(const choc::value::ValueView &d, const std::string &id) {
  for (uint32_t i = 0; i < d["params"].size(); i++) if (d["params"][i]["id"].getString() == id) return (int)i;
  return -1;
}

} // namespace

TEST("suite: one plugin, the Forte app, with every instrument but the template in its menu, by name") {
  forte_entry_init("");
  auto f = (const clap_plugin_factory_t *)forte_entry_get_factory(CLAP_PLUGIN_FACTORY_ID);
  CHECK(f->get_plugin_count(f) == 1);
  CHECK(!std::strcmp(f->get_plugin_descriptor(f, 0)->id, "net.jthaler.forte.suite"));
  CHECK(!std::strcmp(f->get_plugin_descriptor(f, 0)->name, "Forte"));
  App app;
  const std::string d = app.call("[\"describe\"]");
  std::vector<std::string> names;
  for (size_t at = d.find("\"instruments\""), stop = d.find("\"parts\""); (at = d.find("\"name\": \"", at)) < stop;) {
    at += 9;
    names.push_back(d.substr(at, d.find('"', at) - at));
  }
  CHECK(names.size() >= 24);
  for (size_t i = 1; i < names.size(); i++) CHECK(names[i - 1] < names[i]);
  CHECK(d.find("\"slug\": \"organ\"") != std::string::npos && d.find("\"slug\": \"glass\"") != std::string::npos);
  CHECK(d.find("\"slug\": \"template\"") == std::string::npos);
  // it starts on the first, and plays it
  CHECK(d.find(std::string("\"name\": \"") + names[0] + "\"") < d.find("\"instruments\""));
  CHECK(app.call("[\"choose\", \"nonsense\"]") == "false");
}

TEST("suite: switches instrument while the audio runs: its parameters, its keys, its sound") {
  App app;
  const int before = (int)app.params->count(app.p);
  CHECK(app.call("[\"choose\", \"organ\"]") == "true");
  CHECK(app.slug() == "organ");
  CHECK((int)app.params->count(app.p) != before); // the host sees the organ's at once
  CHECK(app.call("[\"choose\", \"glass\"]") == "true"); // before the audio has taken the organ: the glass replaces it
  CHECK(app.slug() == "glass");
  CHECK(app.call("[\"choose\", \"organ\"]") == "true");
  app.run(512);
  app.call("[\"poll\"]"); // (the window's calls let the ones before go)
  const std::string d = app.call("[\"describe\"]");
  CHECK(d.find("\"name\": \"Tonewheel Organ\"") != std::string::npos && d.find("\"Drawbar") != std::string::npos);
  CHECK(d.find("\"page\": \"organ/index.html\"") != std::string::npos); // the window's views show the organ's page
  const int lo = app.number(d, "keyLo"), hi = app.number(d, "keyHi");
  CHECK(app.run(24000, (lo + hi) / 2) > 0.001);
  // and on to another, which plays too
  CHECK(app.call("[\"choose\", \"vibraphone\"]") == "true");
  app.run(512);
  const std::string v = app.call("[\"describe\"]");
  CHECK(v.find("\"name\": \"Vibraphone\"") != std::string::npos);
  CHECK(v.find("\"page\": \"vibraphone/index.html\"") != std::string::npos);
  CHECK(app.run(24000, (app.number(v, "keyLo") + app.number(v, "keyHi")) / 2) > 0.001);
}

TEST("suite: the views get what their pages read from the engine's memory: Huygens's lamp firings, the springs' echo") {
  App app;
  for (const char *slug : {"huygens", "springs", "gongs"}) {
    CHECK(app.call(std::string("[\"choose\", \"") + slug + "\"]") == "true");
    app.run(512);
    app.call("[\"poll\"]");
    CHECK(app.call("[\"views\", 1]").find("\"fs\": 48000") != std::string::npos);
    app.call("[\"poll\"]");
    app.run(48000, 57); // a second of A3
    const auto r = choc::json::parse(app.call("[\"poll\"]"));
    const bool own = std::string(slug) != "gongs"; // (the gongs' messages carry all they say)
    CHECK(r["m"].size() > 0);
    CHECK(r.hasObjectMember("md") == own);
    if (own) {
      const auto md = r["md"];
      CHECK(md.size() > 0);
      for (uint32_t i = 0; i < md.size(); i++) {
        const int at = md[i][0].getWithDefault<int>(-1);
        CHECK(at >= 0 && at < (int)r["m"].size() && r["m"][at][0].getWithDefault<int>(0) == 1); // with msg::state, msg::echo
        std::vector<char> bytes;
        CHECK(choc::base64::decode(md[i][1].getString(), [&](uint8_t b) { bytes.push_back((char)b); }));
        const size_t n = bytes.size() / sizeof(double);
        std::vector<double> d(n);
        std::memcpy(d.data(), bytes.data(), n * sizeof(double));
        if (std::string(slug) == "huygens") { // [firings, oscillators, t, hold, …]
          CHECK(n >= 4 && n == (size_t)(4 + d[0] + d[1]));
          CHECK(d[2] > 0 && d[2] <= 48000 + 512 * 2);
        } else { // the echo's samples, as many as the message says
          CHECK(n > 0 && (double)n == r["m"][at][2].getWithDefault<double>(-1));
          double peak = 0;
          for (double y : d) peak = std::max(peak, std::fabs(y));
          CHECK(peak > 1e-6);
        }
      }
      // and Huygens's lamps fired: the firings since the last came along
      if (std::string(slug) == "huygens") {
        double fired = 0;
        for (uint32_t i = 0; i < md.size(); i++) {
          std::vector<char> bytes;
          choc::base64::decode(md[i][1].getString(), [&](uint8_t b) { bytes.push_back((char)b); });
          double nf;
          std::memcpy(&nf, bytes.data(), sizeof nf);
          fired += nf;
        }
        CHECK(fired > 0);
      }
    }
    app.call("[\"views\", 0]");
  }
}

TEST("suite: Quality belongs to the computer and MPE, Transpose and Octave to the controller: a new instrument keeps them") {
  App app;
  const uint32_t octave = app.params->count(app.p) - 1, transpose = octave - 1, mpe = octave - 2, last = octave - 3; // Quality, after the velocity curve, then MPE, Transpose, Octave
  clap_param_info_t info, mpeInfo, tInfo, oInfo;
  CHECK(app.params->get_info(app.p, last, &info) && !std::strcmp(info.name, "Quality"));
  CHECK(app.params->get_info(app.p, mpe, &mpeInfo) && !std::strcmp(mpeInfo.name, "MPE"));
  CHECK(app.params->get_info(app.p, transpose, &tInfo) && !std::strcmp(tInfo.name, "Transpose"));
  CHECK(app.params->get_info(app.p, octave, &oInfo) && !std::strcmp(oInfo.name, "Octave"));
  app.call("[\"set\", " + std::to_string(last) + ", 2]"); // Low
  app.call("[\"set\", " + std::to_string(mpe) + ", 1]");  // On
  app.call("[\"set\", " + std::to_string(transpose) + ", 15]"); // +3
  app.call("[\"set\", " + std::to_string(octave) + ", 3]");     // −1
  app.run(512);
  CHECK(app.call("[\"choose\", \"celesta\"]") == "true");
  app.run(512);
  double v = -1, m = -1, t = -1, o = -1;
  CHECK(app.params->get_value(app.p, info.id, &v) && v == 2);
  CHECK(app.params->get_value(app.p, mpeInfo.id, &m) && m == 1);
  CHECK(app.params->get_value(app.p, tInfo.id, &t) && t == 15);
  CHECK(app.params->get_value(app.p, oInfo.id, &o) && o == 3);
  CHECK(app.run(24000, 72) > 0.001);
}

TEST("suite: switches before the host activates it, and its state remembers the instrument") {
  std::string saved, x;
  {
    App app(false);
    CHECK(app.call("[\"choose\", \"glass\"]") == "true");
    CHECK(app.call("[\"choose\", \"carillon\"]") == "true"); // nothing in flight while inactive
    app.p->activate(app.p, 48000, 1, 4096); app.p->start_processing(app.p); app.processing = true;
    const std::string r = app.call("[\"set\", 2, 0.5]"); // the wall's mass, half way along
    x = r.substr(r.find("\"x\": ") + 5, r.find(',') - r.find("\"x\": ") - 5);
    CHECK(x.size() > 0 && x != "0.06666666666666667");
    app.run(512);
    clap_ostream_t os{&saved, [](const clap_ostream_t *s, const void *b, uint64_t n) -> int64_t { ((std::string *)s->ctx)->append((const char *)b, n); return (int64_t)n; }};
    CHECK(app.state->save(app.p, &os));
  }
  CHECK(saved.rfind("forte-suite carillon\nforte carillon ", 0) == 0);
  struct Reader { std::string s; size_t at = 0; };
  auto load = [](App &app, const std::string &text) {
    Reader r{text};
    clap_istream_t is{&r, [](const clap_istream_t *s, void *b, uint64_t n) -> int64_t {
                        auto r = (Reader *)s->ctx; size_t k = std::min((size_t)n, r->s.size() - r->at);
                        std::memcpy(b, r->s.data() + r->at, k); r->at += k; return (int64_t)k; }};
    return app.state->load(app.p, &is);
  };
  App b;
  CHECK(load(b, saved));
  CHECK(b.slug() == "carillon");
  b.run(512);
  CHECK(b.call("[\"poll\"]").find("[2, " + x + ",") != std::string::npos);
  // an instrument's own plugin's state opens that instrument
  App c;
  CHECK(load(c, saved.substr(saved.find('\n') + 1)));
  CHECK(c.slug() == "carillon");
  CHECK(!load(c, "forte-suite nonsense\n"));
}

// ---- two instruments at once: layered or split -------------------------------------------------------
TEST("layer: a second instrument plays every key with the first; the window shows its controls, the host the first's") {
  App app;
  CHECK(app.call("[\"choose\", \"vibraphone\"]") == "true");
  const uint32_t count = app.params->count(app.p);
  CHECK(app.call("[\"second\", \"nonsense\"]") == "false");
  CHECK(app.call("[\"second\", \"organ\"]") == "true");
  app.run(512);
  auto d = app.describe();
  CHECK(d["parts"].size() == 2 && d["parts"][0]["slug"].getString() == "vibraphone" && d["parts"][1]["slug"].getString() == "organ");
  CHECK(d["focus"].get<int>() == 1 && d["mode"].getString() == "layer" && d["slug"].getString() == "organ");
  CHECK(app.params->count(app.p) == count); // the host still sees the vibraphone's
  CHECK(app.play({{60, true}}) >= 0);
  app.run(4096);
  CHECK(holds(app.keys(), 60) && holds(app.keys("other"), 60));
  CHECK(app.run(12000) > 0.001);
  app.play({{60, false}});
  CHECK(!holds(app.keys(), 60));
  // the window's keys play both too
  app.call("[\"note\", 64, 0.8]");
  app.run(512);
  CHECK(holds(app.keys(), 64) && holds(app.keys("other"), 64));
  app.call("[\"note\", 64, 0]");
  app.run(512);
  CHECK(!holds(app.keys(), 64) && !holds(app.keys("other"), 64));
  // the Instrument menu changes the part the window shows: the second, which the host doesn't see
  CHECK(app.call("[\"choose\", \"celesta\"]") == "true");
  app.run(512);
  d = app.describe();
  CHECK(d["parts"][0]["slug"].getString() == "vibraphone" && d["parts"][1]["slug"].getString() == "celesta" && app.slug() == "celesta");
  CHECK(app.params->count(app.p) == count);
  // and the window can show the first's controls again
  CHECK(app.call("[\"focus\", 0]") == "true" && app.slug() == "vibraphone");
  CHECK(app.call("[\"focus\", 2]") == "false");
  // dropping the first leaves the second alone, as the first
  CHECK(app.call("[\"drop\", 0]") == "true");
  app.run(512);
  d = app.describe();
  CHECK(d["parts"].size() == 1 && app.slug() == "celesta" && d["focus"].get<int>() == 0);
  CHECK(app.call("[\"drop\", 0]") == "false");
  CHECK(app.call("[\"second\", \"organ\"]") == "true");
  // without the second, the first plays alone
  CHECK(app.call("[\"second\", \"\"]") == "true");
  app.run(512);
  d = app.describe();
  CHECK(d["parts"].size() == 1 && d["focus"].get<int>() == 0 && app.slug() == "celesta");
  CHECK(app.call("[\"focus\", 1]") == "false");
}

TEST("split: the second plays below the split point, the first from it up; a held note ends where it began") {
  App app;
  app.call("[\"choose\", \"grand\"]");
  app.call("[\"second\", \"tines\"]");
  CHECK(app.call("[\"arrange\", \"split\", 66]") == "true");
  app.run(512);
  CHECK(app.describe()["mode"].getString() == "split" && app.describe()["split"].get<int>() == 66);
  // the window shows the second (the tine piano): "keys" are its, "other" the Electric Grand's
  app.play({{72, true}, {65, true}});
  CHECK(holds(app.keys("other"), 72) && !holds(app.keys(), 72));
  CHECK(holds(app.keys(), 65) && !holds(app.keys("other"), 65));
  // the split moves while 65 is held: its note-off still reaches the tine piano
  app.call("[\"arrange\", \"split\", 60]");
  app.play({{65, false}, {72, false}});
  app.run(512);
  CHECK(!holds(app.keys(), 65) && !holds(app.keys("other"), 65) && !holds(app.keys("other"), 72));
  app.play({{62, true}});
  CHECK(holds(app.keys("other"), 62) && !holds(app.keys(), 62));
  app.play({{62, false}});
  // the window's keys too
  app.call("[\"note\", 55, 0.8]");
  app.run(512);
  CHECK(holds(app.keys(), 55) && !holds(app.keys("other"), 55));
  app.call("[\"note\", 55, 0]");
  app.run(512);
  CHECK(!holds(app.keys(), 55));
  // swapped, the Electric Grand is below: the window still shows the tine piano, now the first
  CHECK(app.call("[\"swap\"]") == "true");
  app.run(512);
  auto d = app.describe();
  CHECK(d["parts"][0]["slug"].getString() == "tines" && d["focus"].get<int>() == 0 && app.slug() == "tines");
  app.play({{50, true}, {70, true}});
  CHECK(holds(app.keys("other"), 50) && holds(app.keys(), 70) && !holds(app.keys(), 50));
  app.play({{50, false}, {70, false}});
  // both sound
  CHECK(app.play({{50, true}, {70, true}}) >= 0);
  CHECK(app.run(12000) > 0.001);
}

TEST("two parts: a note held through a swap ends; Panic, the pedal and Quality reach both; a program change the part the window shows") {
  App app;
  app.call("[\"choose\", \"grand\"]");
  app.call("[\"second\", \"tines\"]");
  app.call("[\"arrange\", \"split\", 60]");
  app.run(512);
  app.play({{48, true}});
  app.call("[\"swap\"]");
  app.play({{48, false}});
  app.run(512);
  CHECK(!holds(app.keys(), 48) && !holds(app.keys("other"), 48));
  app.call("[\"swap\"]");
  app.run(512);
  // the window's pedal is both parts'
  app.call("[\"pedal\", 1]");
  app.run(512);
  CHECK(app.call("[\"poll\"]").find("\"pedal\": true") != std::string::npos);
  app.call("[\"focus\", 0]");
  CHECK(app.call("[\"poll\"]").find("\"pedal\": true") != std::string::npos);
  app.call("[\"focus\", 1]");
  app.call("[\"pedal\", 0]");
  // Panic lets go of both parts' notes
  app.play({{48, true}, {72, true}});
  CHECK(holds(app.keys(), 48) && holds(app.keys("other"), 72));
  app.call("[\"panic\"]");
  app.run(512);
  CHECK(app.keys().empty() && app.keys("other").empty());
  // Quality and Octave set where the window shows the second are the first's too (the host's)
  const uint32_t quality = app.params->count(app.p) - 4, octave = quality + 3; // then MPE, Transpose, Octave
  clap_param_info_t info, oInfo;
  app.params->get_info(app.p, quality, &info);
  CHECK(app.params->get_info(app.p, octave, &oInfo) && !std::strcmp(oInfo.name, "Octave"));
  auto d = app.describe();
  app.call("[\"set\", " + std::to_string(paramAt(d, "quality")) + ", 2]");
  app.call("[\"set\", " + std::to_string(paramAt(d, "midiOctave")) + ", 5]"); // and Octave +1, the controller's
  app.run(512);
  double v = -1, o = -1;
  CHECK(app.params->get_value(app.p, info.id, &v) && v == 2);
  CHECK(app.params->get_value(app.p, oInfo.id, &o) && o == 5);
  app.call("[\"set\", " + std::to_string(paramAt(d, "midiOctave")) + ", 4]");
  // a program change plays the shown part's preset: the tine piano's first
  const int presets = d["presets"].get<int>();
  App::Ev pc{-1, false};
  pc.midi[0] = 0xc0; pc.midi[1] = 0;
  app.play({pc});
  app.run(512);
  bool moved = false;
  const auto p = choc::json::parse(app.call("[\"poll\"]"))["p"];
  for (uint32_t i = 0; i < p.size(); i++) if (p[i][0].get<int>() == presets) moved = p[i][1].get<double>() == 1;
  CHECK(moved);
  double first = -1;
  CHECK(app.params->get_value(app.p, 0x7ffffffe, &first) && first == 0); // the Electric Grand's stays
}

TEST("two parts: the state keeps both instruments, how they share the keys, the part shown and the second's values") {
  std::string saved, x;
  {
    App app;
    app.call("[\"choose\", \"carillon\"]");
    app.call("[\"second\", \"glass\"]");
    app.call("[\"arrange\", \"split\", 57]");
    app.run(512);
    const auto d = app.describe();
    const auto r = choc::json::parse(app.call("[\"set\", " + std::to_string(paramAt(d, "volume")) + ", 0.25]"));
    x = choc::json::toString(r["x"]);
    app.run(512);
    saved = app.saveState();
  }
  CHECK(saved.rfind("forte-suite carillon\nforte carillon ", 0) == 0);
  CHECK(saved.find("\nforte-layer glass split 57 1\nforte glass ") != std::string::npos);
  App b;
  CHECK(b.load(saved));
  b.run(512);
  const auto d = b.describe();
  CHECK(d["parts"].size() == 2 && d["parts"][0]["slug"].getString() == "carillon" && d["parts"][1]["slug"].getString() == "glass");
  CHECK(d["mode"].getString() == "split" && d["split"].get<int>() == 57 && d["focus"].get<int>() == 1);
  CHECK(b.call("[\"poll\"]").find("[" + std::to_string(paramAt(d, "volume")) + ", " + x + ",") != std::string::npos);
  // the first's values are the first's alone: the glass's volume is not the carillon's
  b.call("[\"focus\", 0]");
  const auto c = b.describe();
  CHECK(b.call("[\"poll\"]").find("[" + std::to_string(paramAt(c, "volume")) + ", " + x + ",") == std::string::npos);
  // a state with one instrument puts the app back to one
  App one;
  one.call("[\"choose\", \"carillon\"]");
  one.run(512);
  const std::string single = one.saveState();
  CHECK(b.load(single));
  CHECK(b.describe()["parts"].size() == 1);
  // a second this app doesn't have: the first alone
  std::string other = saved;
  other.replace(other.find("forte-layer glass"), 17, "forte-layer nonsense");
  CHECK(b.load(other));
  CHECK(b.describe()["parts"].size() == 1 && b.slug() == "carillon");
}

// A song saved with an earlier release opens as it was saved: the instrument, and every value
// (tools/contract.mjs says which changes break this; from 1.0 on they need a major version).
TEST("suite: every saved state in tests/states loads into today's plugin with its values") {
  int files = 0;
  for (const auto &entry : std::filesystem::directory_iterator(FORTE_STATES_DIR)) {
    if (entry.path().extension() != ".state") continue;
    files++;
    std::ifstream in(entry.path(), std::ios::binary);
    std::stringstream ss;
    ss << in.rdbuf();
    const std::string text = ss.str(), name = entry.path().filename().string();
    std::istringstream lines(text);
    std::string header, word, slug;
    std::getline(lines, header);
    std::istringstream(header) >> word >> slug;
    App app(false);
    struct Reader { std::string s; size_t at = 0; } r{text};
    clap_istream_t is{&r, [](const clap_istream_t *s, void *b, uint64_t n) -> int64_t {
                        auto r = (Reader *)s->ctx; size_t k = std::min((size_t)n, r->s.size() - r->at);
                        std::memcpy(b, r->s.data() + r->at, k); r->at += k; return (int64_t)k; }};
    const bool loaded = app.state->load(app.p, &is);
    if (!loaded || app.slug() != slug) { std::printf("       %s: does not open %s\n", name.c_str(), slug.c_str()); CHECK(loaded && app.slug() == slug); continue; }
    for (std::string line; std::getline(lines, line);) {
      const size_t sp = line.find(' ');
      if (sp == std::string::npos) continue;
      const std::string id = line.substr(0, sp);
      const double want = std::strtod(line.c_str() + sp + 1, nullptr);
      const clap_id hash = id == "preset" ? 0x7ffffffe : forte::paramHash(id.c_str());
      double got = NAN;
      if (!app.params->get_value(app.p, hash, &got)) std::printf("       %s: no parameter %s any more\n", name.c_str(), id.c_str());
      else if (got != want) std::printf("       %s: %s is %.17g, saved as %.17g\n", name.c_str(), id.c_str(), got, want);
      CHECK(got == want);
    }
  }
  CHECK(files >= 24);
}

// ---- your own presets (plugin/presets.h) --------------------------------------------------------
namespace {
// a path from UTF-8, as the plugin makes them: a narrow string is the ANSI code page on Windows
std::filesystem::path u8(const std::string &s) { return std::filesystem::path(std::u8string(s.begin(), s.end())); }
std::string readFile(const std::filesystem::path &f) { std::ifstream in(f, std::ios::binary); std::stringstream ss; ss << in.rdbuf(); return ss.str(); }
// a folder of their own for the tests' presets (FORTE_PRESETS_DIR), empty
std::filesystem::path presetsHome() {
  const auto dir = std::filesystem::temp_directory_path() / "forte-preset-tests";
  std::filesystem::remove_all(dir);
  std::filesystem::create_directories(dir);
#ifdef _WIN32
  _putenv_s("FORTE_PRESETS_DIR", dir.string().c_str());
#else
  setenv("FORTE_PRESETS_DIR", dir.string().c_str(), 1);
#endif
  return dir;
}
// every value the host sees but the Preset choice and the velocity curve
std::vector<double> values(App &app) {
  std::vector<double> v;
  for (uint32_t i = 0; i < app.params->count(app.p); i++) {
    clap_param_info_t info{};
    app.params->get_info(app.p, i, &info);
    if (info.id == 0x7ffffffe || info.id == 0x7ffffffd) continue;
    double x = NAN;
    app.params->get_value(app.p, info.id, &x);
    v.push_back(x);
  }
  return v;
}
std::string jsonString(const std::string &s) { return choc::json::getEscapedQuotedString(s); }
std::string nameIn(const std::string &file) { return std::string(choc::json::parse(file)["presets"][0]["name"].getString()); }
// your presets as the window lists them: "name|file|index"
std::vector<std::string> listed(App &app) {
  std::vector<std::string> out;
  const auto r = choc::json::parse(app.call("[\"presets\"]"));
  for (uint32_t k = 0; k < r["list"].size(); k++)
    out.push_back(std::string(r["list"][k][0].getString()) + "|" + std::string(r["list"][k][1].getString()) + "|" + std::to_string(r["list"][k][2].get<int>()));
  return out;
}
bool has(const std::vector<std::string> &v, const std::string &x) { return std::find(v.begin(), v.end(), x) != v.end(); }
} // namespace

TEST("your presets: a preset file from the site plays in the window as the factory preset it was made from") {
  const auto home = presetsHome();
  int files = 0;
  for (const auto &entry : std::filesystem::directory_iterator(FORTE_PRESETS_TEST_DIR)) {
    if (entry.path().extension() != ".json") continue;
    files++;
    const std::string slug = entry.path().stem().string(), text = readFile(entry.path()), name = nameIn(text);
    std::filesystem::create_directories(home / slug);
    std::filesystem::copy_file(entry.path(), home / slug / "from the site.json");
    App app;
    CHECK(app.call("[\"choose\", \"" + slug + "\"]") == "true");
    app.run(512);
    // the factory preset of that name
    double k = -1;
    CHECK(app.params->text_to_value(app.p, 0x7ffffffe, name.c_str(), &k) && k > 0);
    app.call("[\"set\", " + std::to_string(app.number(app.call("[\"describe\"]"), "presets")) + ", " + std::to_string((int)k) + "]");
    app.run(512);
    const std::vector<double> want = values(app);
    // back to the defaults, then the site's file
    app.call("[\"set\", " + std::to_string(app.number(app.call("[\"describe\"]"), "presets")) + ", 0]");
    app.run(512);
    CHECK(has(listed(app), name + "|from the site.json|0"));
    CHECK(app.call("[\"loadPreset\", \"from the site.json\", 0]").find("\"ok\": true") != std::string::npos);
    app.run(512);
    const std::vector<double> got = values(app);
    CHECK(got.size() == want.size());
    for (size_t i = 0; i < got.size() && i < want.size(); i++)
      if (got[i] != want[i]) { std::printf("       %s: parameter %zu is %.17g, the preset's is %.17g\n", slug.c_str(), i, got[i], want[i]); CHECK(got[i] == want[i]); }
  }
  CHECK(files >= 4);
  std::filesystem::remove_all(home);
}

TEST("your presets: the window saves the same file the site writes, lists it by name and plays it back") {
  const auto home = presetsHome();
  for (const auto &entry : std::filesystem::directory_iterator(FORTE_PRESETS_TEST_DIR)) {
    if (entry.path().extension() != ".json") continue;
    const std::string slug = entry.path().stem().string(), site = readFile(entry.path()), name = nameIn(site);
    App app;
    app.call("[\"choose\", \"" + slug + "\"]");
    app.run(512);
    double k = -1;
    app.params->text_to_value(app.p, 0x7ffffffe, name.c_str(), &k);
    const int at = app.number(app.call("[\"describe\"]"), "presets");
    app.call("[\"set\", " + std::to_string(at) + ", " + std::to_string((int)k) + "]");
    app.run(512);
    app.call("[\"poll\"]");
    const std::vector<double> want = values(app);
    const auto r = choc::json::parse(app.call("[\"savePreset\", " + jsonString(name) + "]"));
    CHECK(r["ok"].getBool());
    const std::string file(r["file"].getString());
    CHECK(file == name + ".json" || name.find_first_of("/:?") != std::string::npos);
    if (!std::filesystem::exists(home / slug / u8(file))) { CHECK(std::filesystem::exists(home / slug / u8(file))); continue; }
    // byte for byte the site's, but for the version that saved it
    std::string mine = readFile(home / slug / u8(file)), theirs = site;
    auto unversion = [](std::string &t) { const size_t a = t.find("\"instrumentVersion\": \""), b = t.find('"', a + 22); t.erase(a + 22, b - a - 22); };
    unversion(mine); unversion(theirs);
    if (mine != theirs) std::printf("       %s: the window wrote\n%s\n       the site writes\n%s\n", slug.c_str(), mine.c_str(), theirs.c_str());
    CHECK(mine == theirs);
    CHECK(has(listed(app), name + "|" + file + "|0"));
    app.call("[\"set\", " + std::to_string(at) + ", 0]");
    app.run(512);
    CHECK(app.call("[\"loadPreset\", " + jsonString(file) + ", 0]").find("\"ok\": true") != std::string::npos);
    app.run(512);
    CHECK(values(app) == want);
  }
  std::filesystem::remove_all(home);
}

TEST("your presets: another instrument's file, a damaged one and a path out of the folder are not presets") {
  const auto home = presetsHome();
  std::filesystem::create_directories(home / "gongs");
  std::filesystem::copy_file(std::filesystem::path(FORTE_PRESETS_TEST_DIR) / "organ.json", home / "gongs" / "organ.json");
  { std::ofstream(home / "gongs" / "broken.json") << "{\"forte\": \"presets\", \"pres"; }
  { std::ofstream(home / "gongs" / "notes.txt") << "not a preset"; }
  { std::ofstream(home / "secret.json") << readFile(std::filesystem::path(FORTE_PRESETS_TEST_DIR) / "gongs.json"); }
  App app;
  app.call("[\"choose\", \"gongs\"]");
  app.run(512);
  CHECK(listed(app).empty());
  CHECK(app.call("[\"presets\"]").find("forte-preset-tests") != std::string::npos);
  CHECK(app.call("[\"loadPreset\", \"organ.json\", 0]").find("another instrument") != std::string::npos);
  CHECK(app.call("[\"loadPreset\", \"broken.json\", 0]").find("\"ok\": false") != std::string::npos);
  CHECK(app.call("[\"loadPreset\", \"../secret.json\", 0]").find("\"ok\": false") != std::string::npos);
  // a name a file system won't take still saves, under a name it will
  CHECK(app.call("[\"savePreset\", \"Bells: 1/2 \\\"open\\\"?\"]").find("\"file\": \"Bells- 1-2 -open--.json\"") != std::string::npos);
  CHECK(has(listed(app), "Bells: 1/2 \"open\"?|Bells- 1-2 -open--.json|0"));
  std::filesystem::remove_all(home);
}

// ---- Scala files for the custom temperament (plugin/presets.h, forte/tuning.h) ----------------------
TEST("tunings: Scala files in the Tunings folder are listed, and one sets the custom temperament to its scale; a file Forte can't play, or a path out of the folder, does not") {
  const auto home = presetsHome();
  std::filesystem::create_directories(home / "Tunings");
  for (const char *f : {"werckmeister3.scl", "19-edo.scl"}) std::filesystem::copy_file(std::filesystem::path(FORTE_TUNING_TEST_DIR) / f, home / "Tunings" / f);
  { std::ofstream(home / "Tunings" / "notes.txt") << "not a scale"; }
  { std::ofstream(home / "outside.scl") << readFile(std::filesystem::path(FORTE_TUNING_TEST_DIR) / "meantone.scl"); }
  App app;
  app.call("[\"choose\", \"harpsichord\"]");
  app.run(512);
  const auto r = choc::json::parse(app.call("[\"scalas\"]"));
  CHECK(std::string(r["folder"].getString()).find("Tunings") != std::string::npos);
  CHECK(r["list"].size() == 2 && std::string(r["list"][0].getString()) == "19-edo.scl" && std::string(r["list"][1].getString()) == "werckmeister3.scl");
  // the parameters' places, from the window's description
  const auto d = choc::json::parse(app.call("[\"describe\"]"));
  auto at = [&](const std::string &id) { for (uint32_t i = 0; i < d["params"].size(); i++) if (d["params"][i]["id"].getString() == id) return (int)i; return -1; };
  const int temper = at("temperament"), c1 = at("cents1"), c4 = at("cents4");
  CHECK(temper >= 0 && c1 >= 0 && c4 >= 0);
  const auto ok = choc::json::parse(app.call("[\"loadScala\", \"werckmeister3.scl\"]"));
  CHECK(ok["ok"].getBool() && std::string(ok["name"].getString()) == "Werckmeister III (1691)");
  app.run(512);
  const std::vector<double> v = values(app);
  double t[12];
  forte::temperamentCents(forte::temperament::werckmeister, t);
  CHECK(v[temper] == forte::temperament::custom);
  CHECK_NEAR(v[c1], t[1] - 100, 0.0051);  // C♯ 90.22 ¢: −9.78
  CHECK_NEAR(v[c4], t[4] - 400, 0.0051);  // E 390.22 ¢: −9.78
  CHECK(app.call("[\"loadScala\", \"19-edo.scl\"]").find("19 notes") != std::string::npos);
  CHECK(app.call("[\"loadScala\", \"notes.txt\"]").find("\"ok\": false") != std::string::npos);
  CHECK(app.call("[\"loadScala\", \"../outside.scl\"]").find("\"ok\": false") != std::string::npos);
  std::filesystem::remove_all(home);
}

int main() { return check::run(); }
