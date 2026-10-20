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

TEST("suite: Quality belongs to the computer: a new instrument keeps it") {
  App app;
  const uint32_t last = app.params->count(app.p) - 1; // Quality, after the velocity curve
  clap_param_info_t info;
  CHECK(app.params->get_info(app.p, last, &info) && !std::strcmp(info.name, "Quality"));
  app.call("[\"set\", " + std::to_string(last) + ", 2]"); // Low
  app.run(512);
  CHECK(app.call("[\"choose\", \"celesta\"]") == "true");
  app.run(512);
  double v = -1;
  CHECK(app.params->get_value(app.p, info.id, &v) && v == 2);
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
