// suite-plugin-tests.cpp — the Forte app's plugin (net.jthaler.forte.suite, plugin.cpp's Suite),
// with every instrument linked in as forte_add_suite() links them: its Instrument menu, a switch
// while the audio runs, and state that remembers the instrument. And every instrument's saved
// states from earlier releases (states/, tools/contract.mjs), loaded into today's plugins.

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
};

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
  for (size_t at = d.find("\"instruments\""); (at = d.find("\"name\": \"", at)) != std::string::npos;) {
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
  CHECK(app.call("[\"choose\", \"glass\"]") == "false"); // not until the audio has taken the organ
  app.run(512);
  app.call("[\"poll\"]"); // (the window's calls let the one before go)
  const std::string d = app.call("[\"describe\"]");
  CHECK(d.find("\"name\": \"Tonewheel Organ\"") != std::string::npos && d.find("\"Drawbar") != std::string::npos);
  const int lo = app.number(d, "keyLo"), hi = app.number(d, "keyHi");
  CHECK(app.run(24000, (lo + hi) / 2) > 0.001);
  // and on to another, which plays too
  CHECK(app.call("[\"choose\", \"vibraphone\"]") == "true");
  app.run(512);
  const std::string v = app.call("[\"describe\"]");
  CHECK(v.find("\"name\": \"Vibraphone\"") != std::string::npos);
  CHECK(app.run(24000, (app.number(v, "keyLo") + app.number(v, "keyHi")) / 2) > 0.001);
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

int main() { return check::run(); }
