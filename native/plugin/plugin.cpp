// plugin.cpp — one CLAP plugin for any Forte instrument (an InstrumentInfo): notes and MIDI as
// the pages take them (shared/shell.js, shared/midi.js), the parameters with a Preset choice,
// state, a stereo output through the pages' output chain (forte/chain.h), and a window with the
// instrument's controls and a keyboard (editor.h, editor.html). clap-wrapper builds the VST3,
// AU v2 and standalone from it.

#include "plugin.h"

#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <memory>
#include <string>
#include <thread>
#include <vector>

#include <clap/clap.h>
#include <clapwrapper/auv2.h>
#include <clapwrapper/vst3.h>

#include "choc/containers/choc_Value.h"
#include "choc/text/choc_JSON.h"
#include "forte/chain.h"
#include "forte/denormals.h"
#include "forte/guard.h"
#include "forte/queue.h"
#ifdef FORTE_EDITOR
#include "editor.h"
#endif

namespace forte {
namespace {

constexpr int kBlock = 128; // the engines run in blocks of at most 128 samples, as in the browser
constexpr uint32_t kPresetId = 0x7ffffffe;
constexpr uint32_t kEditorWidth = 920, kEditorHeight = 640, kEditorMinWidth = 600, kEditorMinHeight = 420; // points

// what the editor asks of the audio thread
struct UiEvent {
  enum Type : uint8_t { param, begin, end, on, off, pedal, pressure, panic } type;
  int16_t i; // a parameter or a key
  double v;
};

struct Plugin {
  clap_plugin_t clap{};
  const clap_host_t *host;
  const InstrumentInfo &I;
  const std::string accent;  // the window's colour
  const int nParams;        // the instrument's parameters, then Preset if it has presets
  const bool hasPresets;
  std::vector<uint32_t> ids; // hashed parameter ids, by index

  std::unique_ptr<Engine> engine;
  OutputChain chain;
  std::vector<double> P;               // the audio thread's values
  std::unique_ptr<std::atomic<double>[]> shown; // what the host reads (main thread)
  std::vector<double> pending;         // values from a state load, for the audio thread
  std::atomic<bool> loadPending{false};
  std::atomic<bool> processing{false};
  bool dirty = true;                   // the engine needs setParams

  // notes as the shell counts them: how many channels hold each key, and the keys latched by Hold
  uint8_t held[16][128]{};
  uint8_t sounding[128]{};
  bool latched[128]{};
  bool sustain = false;

  // the editor: its events for the audio thread, what it shows, the keys sounding for it
  const clap_host_params_t *hostParams = nullptr;
  const clap_host_timer_support_t *hostTimer = nullptr;
  SpscQueue<UiEvent> fromUi{1024};
  std::vector<double> sent;          // each value as the editor last saw it (NaN: never)
  std::atomic<uint64_t> keysDown[2]{};
  std::atomic<bool> pedalDown{false};
#ifdef FORTE_EDITOR
  std::unique_ptr<Editor> editor;
#endif
  uint32_t width = kEditorWidth, height = kEditorHeight; // points
  double scale = 1;                  // pixels per point, where the host works in pixels
  clap_id timer = CLAP_INVALID_ID;

  Plugin(const clap_host_t *h, const InstrumentInfo &info, const clap_plugin_descriptor_t *desc, const std::string &colour)
      : host(h), I(info), accent(colour.empty() ? "#f0b35a" : colour), nParams(info.paramCount + (info.presetCount > 0 ? 1 : 0)), hasPresets(info.presetCount > 0) {
    clap.desc = desc;
    clap.plugin_data = this;
    for (int i = 0; i < I.paramCount; i++) ids.push_back(paramHash(I.params[i].id));
    if (hasPresets) ids.push_back(kPresetId);
    P.resize(nParams);
    pending.resize(nParams);
    shown.reset(new std::atomic<double>[nParams]);
    for (int i = 0; i < I.paramCount; i++) P[i] = I.params[i].def;
    if (hasPresets) P[I.paramCount] = 0;
    for (int i = 0; i < nParams; i++) shown[i] = P[i];
    sent.assign(nParams, NAN);
  }

  int indexOf(clap_id id) const {
    for (int i = 0; i < nParams; i++) if (ids[i] == id) return i;
    return -1;
  }

  // ---- parameters ---------------------------------------------------------------------------
  // Set parameter i (audio thread, or main thread while not processing). A change of Preset
  // applies it: the defaults, then the kept parameters, then the preset's values (shell.js).
  void set(int i, double v, const clap_output_events_t *out) {
    if (hasPresets && i == I.paramCount) {
      int k = (int)std::lround(v);
      k = k < 0 ? 0 : k > I.presetCount ? I.presetCount : k;
      std::vector<double> next(I.paramCount);
      for (int j = 0; j < I.paramCount; j++) next[j] = I.params[j].def;
      for (int j = 0; j < I.keepCount; j++) next[I.keep[j]] = P[I.keep[j]];
      if (k > 0) for (int j = 0; j < I.presets[k - 1].count; j++) {
        const PresetValue &pv = I.presets[k - 1].values[j];
        next[pv.param] = constrain(I.params[pv.param], pv.value);
      }
      for (int j = 0; j < I.paramCount; j++) if (next[j] != P[j]) { P[j] = next[j]; shown[j] = P[j]; tell(j, out); }
      P[i] = k; shown[i] = k;
      dirty = true;
      return;
    }
    v = constrain(I.params[i], v);
    if (v == P[i]) return;
    P[i] = v; shown[i] = v;
    dirty = true;
  }
  // tell the host that the plugin moved parameter i itself
  void tell(int i, const clap_output_events_t *out) {
    if (!out) return;
    clap_event_param_value_t e{};
    e.header = {sizeof e, 0, CLAP_CORE_EVENT_SPACE_ID, CLAP_EVENT_PARAM_VALUE, 0};
    e.param_id = ids[i]; e.note_id = -1; e.port_index = -1; e.channel = -1; e.key = -1; e.value = P[i];
    out->try_push(out, &e.header);
  }

  // ---- notes -----------------------------------------------------------------------------------
  void noteOn(int ch, int key, double vel) {
    if (key < I.keyLo || key > I.keyHi || ch < 0 || ch > 15) return;
    if (held[ch][key]) noteOff(ch, key, -1); // struck again before its note-off: let it go first
    held[ch][key] = 1; sounding[key]++; latched[key] = false;
    if (engine) engine->noteOn(key, I.midiVelocity ? I.midiVelocity(vel) : vel);
  }
  void noteOff(int ch, int key, double vel) {
    if (key < 0 || key > 127 || ch < 0 || ch > 15 || !held[ch][key]) return; // not down on this channel
    held[ch][key] = 0;
    if (--sounding[key] > 0) return;
    if (I.space == Space::hold && sustain) { latched[key] = true; return; }
    if (engine) engine->noteOff(key, vel);
  }
  void pedal(bool on) {
    if (on == sustain) return;
    sustain = on;
    if (I.space == Space::sustain && engine) engine->setSustain(on);
    if (I.space == Space::hold && !on)
      for (int k = 0; k < 128; k++) if (latched[k]) { latched[k] = false; if (engine) engine->noteOff(k, -1); }
  }
  void panic() {
    std::memset(held, 0, sizeof held); std::memset(sounding, 0, sizeof sounding); std::memset(latched, 0, sizeof latched);
    if (sustain) pedal(false);
    if (engine) engine->allNotesOff();
  }
  // the mod wheel, 0..127: at rest the parameter's default, fully up its maximum (shared/midi.js)
  void modWheel(int cc, const clap_output_events_t *out) {
    if (I.modWheel < 0) return;
    const ParamInfo &p = I.params[I.modWheel];
    double top = I.modWheelMax, v;
    if (cc <= 0) v = p.def;
    else {
      double u = cc / 127.0;
      v = p.log ? p.def * std::pow(top / p.def, u) : p.def + (top - p.def) * u;
    }
    int i = I.modWheel;
    double before = P[i];
    set(i, v, out);
    if (P[i] != before) tell(i, out);
  }
  // another controller the descriptor maps to a parameter: a toggle is on at 64 and above,
  // any other parameter moves across its range
  void controller(int cc, int v, const clap_output_events_t *out) {
    for (int i = 0; i < I.controllerCount; i++) if (I.controllers[i].cc == cc) {
      const int k = I.controllers[i].param;
      const ParamInfo &p = I.params[k];
      const double before = P[k];
      set(k, p.kind == ParamKind::toggle ? (v >= 64 ? 1 : 0) : p.min + (p.max - p.min) * v / 127.0, out);
      if (P[k] != before) tell(k, out);
    }
  }
  void midi(const uint8_t *d, const clap_output_events_t *out) {
    int cmd = d[0] & 0xf0, ch = d[0] & 0x0f;
    if (cmd == 0x90 && d[2] > 0) noteOn(ch, d[1], d[2] / 127.0);
    else if (cmd == 0x80 || cmd == 0x90) noteOff(ch, d[1], cmd == 0x80 ? d[2] / 127.0 : -1);
    else if (cmd == 0xb0) {
      if (d[1] == 64 && I.space != Space::none) pedal(d[2] >= 64);
      else if (d[1] == 1) modWheel(d[2], out);
      else if (d[1] == 120 || d[1] == 123) panic();
      else controller(d[1], d[2], out);
    } else if (cmd == 0xd0) { if (engine) engine->pressure(d[1] / 127.0, -1); }
    else if (cmd == 0xa0) { if (engine) engine->pressure(d[2] / 127.0, d[1]); }
    else if (cmd == 0xe0) {
      double b = ((d[2] << 7) + d[1] - 8192) / 8191.0;
      if (engine) engine->bend(b < -1 ? -1 : b);
    }
  }
  void event(const clap_event_header_t *h, const clap_output_events_t *out) {
    if (h->space_id != CLAP_CORE_EVENT_SPACE_ID) return;
    switch (h->type) {
      case CLAP_EVENT_NOTE_ON: { auto e = (const clap_event_note_t *)h; noteOn(e->channel < 0 ? 0 : e->channel, e->key, e->velocity); break; }
      case CLAP_EVENT_NOTE_OFF: { auto e = (const clap_event_note_t *)h; noteOff(e->channel < 0 ? 0 : e->channel, e->key, e->velocity); break; }
      case CLAP_EVENT_NOTE_CHOKE: { auto e = (const clap_event_note_t *)h; noteOff(e->channel < 0 ? 0 : e->channel, e->key, -1); break; }
      case CLAP_EVENT_NOTE_EXPRESSION: {
        auto e = (const clap_event_note_expression_t *)h;
        if (e->expression_id == CLAP_NOTE_EXPRESSION_PRESSURE && engine) engine->pressure(e->value, e->key);
        break;
      }
      case CLAP_EVENT_PARAM_VALUE: {
        auto e = (const clap_event_param_value_t *)h;
        int i = indexOf(e->param_id);
        if (i >= 0) set(i, e->value, out);
        break;
      }
      case CLAP_EVENT_MIDI: midi(((const clap_event_midi_t *)h)->data, out); break;
      default: break;
    }
  }

  // ---- audio -----------------------------------------------------------------------------------
  void takePending() {
    if (!loadPending.load(std::memory_order_acquire)) return;
    for (int i = 0; i < nParams; i++) { P[i] = pending[i]; shown[i] = P[i]; }
    dirty = true;
    loadPending.store(false, std::memory_order_release);
  }
  clap_process_status process(const clap_process_t *proc) {
    NoDenormals ftz;
    takePending();
    takeUi(proc->out_events);
    const uint32_t n = proc->frames_count;
    float *L = nullptr, *R = nullptr;
    if (proc->audio_outputs_count > 0 && proc->audio_outputs[0].data32) {
      L = proc->audio_outputs[0].data32[0];
      R = proc->audio_outputs[0].channel_count > 1 ? proc->audio_outputs[0].data32[1] : nullptr;
    }
    const clap_input_events_t *in = proc->in_events;
    const uint32_t count = in ? in->size(in) : 0;
    uint32_t next = 0, pos = 0;
    float spare[kBlock];
    while (pos < n) {
      while (next < count) {
        const clap_event_header_t *h = in->get(in, next);
        if (h->time > pos) break;
        event(h, proc->out_events); next++;
      }
      uint32_t end = pos + kBlock < n ? pos + kBlock : n;
      if (next < count) { uint32_t t = in->get(in, next)->time; if (t < end) end = t; }
      if (dirty && engine) { engine->setParams(P.data()); chain.setParams(P.data()); dirty = false; }
      if (L) render(L + pos, R ? R + pos : spare, end - pos);
      pos = end;
    }
    while (next < count) event(in->get(in, next++), proc->out_events);
    publishKeys();
    return CLAP_PROCESS_CONTINUE;
  }
  // the engine, a guard (a NaN stops the notes rather than the instrument, shared/guard.js), the chain
  void render(float *L, float *R, uint32_t n) {
    if (!engine) { std::memset(L, 0, n * sizeof *L); std::memset(R, 0, n * sizeof *R); return; }
    engine->process(L, R, (int)n);
    if (!guardBlock(L, R, (int)n)) engine->allNotesOff();
    chain.process(L, R, (int)n);
  }

  // ---- the editor (editor.html) ---------------------------------------------------------------
  // On the audio thread (or in a flush): what the editor did since the last block.
  void takeUi(const clap_output_events_t *out) {
    for (UiEvent e; fromUi.pop(e);) switch (e.type) {
      case UiEvent::param: set(e.i, e.v, out); tell(e.i, out); break;
      case UiEvent::begin: case UiEvent::end: gesture(e.i, e.type == UiEvent::begin, out); break;
      case UiEvent::on: noteOn(0, e.i, e.v); break;
      case UiEvent::off: noteOff(0, e.i, -1); break;
      case UiEvent::pedal: if (I.space != Space::none) pedal(e.v > 0); break;
      case UiEvent::pressure: if (engine) engine->pressure(e.v, e.i); break;
      case UiEvent::panic: panic(); break;
    }
  }
  void gesture(int i, bool begin, const clap_output_events_t *out) {
    if (!out) return;
    clap_event_param_gesture_t g{};
    g.header = {sizeof g, 0, CLAP_CORE_EVENT_SPACE_ID, (uint16_t)(begin ? CLAP_EVENT_PARAM_GESTURE_BEGIN : CLAP_EVENT_PARAM_GESTURE_END), 0};
    g.param_id = ids[i];
    out->try_push(out, &g.header);
  }
  void publishKeys() {
    uint64_t k[2] = {0, 0};
    for (int key = 0; key < 128; key++) if (sounding[key] || latched[key]) k[key >> 6] |= 1ull << (key & 63);
    keysDown[0].store(k[0], std::memory_order_relaxed);
    keysDown[1].store(k[1], std::memory_order_relaxed);
    pedalDown.store(sustain, std::memory_order_relaxed);
  }
  void toAudio(UiEvent e) {
    fromUi.push(e);
    // a host that isn't processing takes them in a flush
    if (!processing.load() && hostParams) hostParams->request_flush(host);
  }

  // The editor's calls, window.forte(method, …args), on the main thread:
  //   describe()          the instrument: name, keys, pedal, parameters (and Preset), presets
  //   poll()              { p: [[index, x, text]…] the values changed since, keys: [down…], pedal }
  //   set(i, x)           a parameter: x along a slider (0..1), a choice's index, a toggle's 0/1
  //   gesture(i, on)      a slider grabbed or let go (the host records automation between)
  //   note(key, vel)      a key: vel 0..1 as MIDI velocity / 127, 0 to let go
  //   pressure(key, v)  pedal(on)  panic()
  ParamInfo infoOf(int i) const { return i < I.paramCount ? I.params[i] : presetParam(); }
  double along(int i, double v) const { const ParamInfo p = infoOf(i); return p.kind == ParamKind::continuous ? toNormalized(p, v) : v; }
  std::string text(int i, double v) const {
    if (i == I.paramCount) { int k = (int)std::lround(v); return k <= 0 ? "Default settings" : k <= I.presetCount ? I.presets[k - 1].name : "?"; }
    char buf[96];
    formatValue(I.params[i], v, buf, sizeof buf);
    return buf;
  }
  choc::value::Value describe() {
    using namespace choc::value;
    Value params = createEmptyArray();
    for (int i = 0; i < nParams; i++) {
      const ParamInfo p = infoOf(i);
      Value q = createObject("");
      q.addMember("id", std::string(p.id));
      q.addMember("label", std::string(p.label));
      q.addMember("group", std::string(p.group));
      q.addMember("kind", std::string(p.kind == ParamKind::continuous ? "continuous" : p.kind == ParamKind::choice ? "choice" : "toggle"));
      q.addMember("perform", p.perform);
      q.addMember("def", along(i, constrain(p, p.def)));
      Value choices = createEmptyArray();
      if (i == I.paramCount) {
        choices.addArrayElement(std::string("Default settings"));
        for (int k = 0; k < I.presetCount; k++) choices.addArrayElement(std::string(I.presets[k].name));
      } else for (int k = 0; k < p.choiceCount; k++) choices.addArrayElement(std::string(p.choices[k]));
      q.addMember("choices", choices);
      params.addArrayElement(q);
    }
    Value d = createObject("");
    d.addMember("slug", std::string(I.slug));
    d.addMember("name", std::string(I.name));
    d.addMember("version", std::string(I.version));
    d.addMember("accent", accent);
    d.addMember("keyLo", I.keyLo);
    d.addMember("keyHi", I.keyHi);
    d.addMember("space", std::string(I.space == Space::sustain ? "sustain" : I.space == Space::hold ? "hold" : ""));
    d.addMember("presets", hasPresets ? I.paramCount : -1); // the Preset parameter's index
    d.addMember("params", params);
    sent.assign(nParams, NAN); // the next poll sends every value
    return d;
  }
  choc::value::Value poll() {
    using namespace choc::value;
    Value changed = createEmptyArray();
    for (int i = 0; i < nParams; i++) {
      const double v = shown[i].load();
      if (v == sent[i]) continue;
      sent[i] = v;
      Value c = createEmptyArray();
      c.addArrayElement(i); c.addArrayElement(along(i, v)); c.addArrayElement(text(i, v));
      changed.addArrayElement(c);
    }
    Value keys = createEmptyArray();
    for (int k = 0; k < 128; k++) if (keysDown[k >> 6].load(std::memory_order_relaxed) >> (k & 63) & 1) keys.addArrayElement(k);
    Value r = createObject("");
    r.addMember("p", changed);
    r.addMember("keys", keys);
    r.addMember("pedal", pedalDown.load(std::memory_order_relaxed));
    return r;
  }
  choc::value::Value call(const choc::value::ValueView &args) {
    using namespace choc::value;
    if (!args.isArray() || args.size() == 0 || !args[0].isString()) return {};
    const std::string m(args[0].getString());
    auto num = [&](uint32_t k) { return args.size() > k && (args[k].isFloat() || args[k].isInt()) ? args[k].get<double>() : 0.0; };
    auto index = [&](uint32_t k) { const int i = (int)num(k); return i >= 0 && i < nParams ? i : -1; };
    if (m == "describe") return describe();
    if (m == "poll") return poll();
    if (m == "set") {
      const int i = index(1);
      if (i < 0) return {};
      const ParamInfo p = infoOf(i);
      const double v = constrain(p, p.kind == ParamKind::continuous ? fromNormalized(p, num(2)) : num(2));
      shown[i] = v; sent[i] = v; // shown at once, without waiting for the audio thread
      toAudio({UiEvent::param, (int16_t)i, v});
      Value r = createObject("");
      r.addMember("x", along(i, v));
      r.addMember("text", text(i, v));
      return r;
    }
    if (m == "gesture") { const int i = index(1); if (i >= 0 && i < I.paramCount) toAudio({num(2) > 0 ? UiEvent::begin : UiEvent::end, (int16_t)i, 0}); return {}; }
    if (m == "note") {
      const int key = (int)num(1);
      const double vel = num(2);
      if (key >= 0 && key < 128) toAudio({vel > 0 ? UiEvent::on : UiEvent::off, (int16_t)key, vel > 1 ? 1 : vel});
      return {};
    }
    if (m == "pressure") { const int key = (int)num(1); if (key >= 0 && key < 128) toAudio({UiEvent::pressure, (int16_t)key, num(2)}); return {}; }
    if (m == "pedal") { toAudio({UiEvent::pedal, 0, num(1)}); return {}; }
    if (m == "panic") { toAudio({UiEvent::panic, 0, 0}); return {}; }
    return {};
  }

  // ---- state: "forte <slug> <version>" then "<id> <value>" per line ----------------------------
  bool save(const clap_ostream_t *s) {
    std::string t = std::string("forte ") + I.slug + " " + I.version + "\n";
    char buf[64];
    for (int i = 0; i < nParams; i++) {
      std::snprintf(buf, sizeof buf, " %.17g\n", shown[i].load());
      t += (i < I.paramCount ? I.params[i].id : "preset") + std::string(buf);
    }
    const char *p = t.data();
    size_t left = t.size();
    while (left) {
      int64_t w = s->write(s, p, left);
      if (w <= 0) return false;
      p += w; left -= (size_t)w;
    }
    return true;
  }
  bool load(const clap_istream_t *s) {
    std::string t;
    char buf[4096];
    for (int64_t r; (r = s->read(s, buf, sizeof buf)) > 0;) t.append(buf, (size_t)r);
    if (t.compare(0, 6, "forte ") != 0) return false;
    std::vector<double> v(nParams);
    for (int i = 0; i < I.paramCount; i++) v[i] = I.params[i].def; // missing parameters (an older version): defaults
    if (hasPresets) v[I.paramCount] = 0;
    size_t at = t.find('\n');
    while (at != std::string::npos && at + 1 < t.size()) {
      size_t eol = t.find('\n', at + 1);
      std::string line = t.substr(at + 1, eol == std::string::npos ? std::string::npos : eol - at - 1);
      size_t sp = line.find(' ');
      if (sp != std::string::npos) {
        std::string id = line.substr(0, sp);
        double x = std::strtod(line.c_str() + sp + 1, nullptr);
        if (id == "preset" && hasPresets) v[I.paramCount] = constrain(presetParam(), x);
        else for (int i = 0; i < I.paramCount; i++) if (id == I.params[i].id) { v[i] = constrain(I.params[i], x); break; }
      }
      at = eol;
    }
    if (!processing.load()) {
      for (int i = 0; i < nParams; i++) { P[i] = v[i]; shown[i] = v[i]; }
      dirty = true;
      rescan();
      return true;
    }
    // the audio thread takes them at its next block
    for (int tries = 0; loadPending.load(std::memory_order_acquire) && tries < 500; tries++) std::this_thread::sleep_for(std::chrono::milliseconds(1));
    pending = v;
    for (int i = 0; i < nParams; i++) shown[i] = v[i];
    loadPending.store(true, std::memory_order_release);
    rescan();
    return true;
  }
  // the host must reread every value (after a state load)
  void rescan() {
    auto hp = (const clap_host_params_t *)host->get_extension(host, CLAP_EXT_PARAMS);
    if (hp) hp->rescan(host, CLAP_PARAM_RESCAN_VALUES);
  }
  ParamInfo presetParam() const {
    return ParamInfo{"preset", "Preset", "", ParamKind::choice, 0, (double)I.presetCount, 0, 1, false, false, nullptr, I.presetCount + 1, {}};
  }
};

Plugin *self(const clap_plugin_t *p) { return (Plugin *)p->plugin_data; }

// ---- the CLAP vtables --------------------------------------------------------------------------

uint32_t audioPortsCount(const clap_plugin_t *, bool isInput) { return isInput ? 0 : 1; }
bool audioPortsGet(const clap_plugin_t *, uint32_t index, bool isInput, clap_audio_port_info_t *info) {
  if (isInput || index != 0) return false;
  info->id = 0;
  std::snprintf(info->name, sizeof info->name, "%s", "Output");
  info->flags = CLAP_AUDIO_PORT_IS_MAIN;
  info->channel_count = 2;
  info->port_type = CLAP_PORT_STEREO;
  info->in_place_pair = CLAP_INVALID_ID;
  return true;
}
const clap_plugin_audio_ports_t audioPorts{audioPortsCount, audioPortsGet};

uint32_t notePortsCount(const clap_plugin_t *, bool isInput) { return isInput ? 1 : 0; }
bool notePortsGet(const clap_plugin_t *, uint32_t index, bool isInput, clap_note_port_info_t *info) {
  if (!isInput || index != 0) return false;
  info->id = 0;
  info->supported_dialects = CLAP_NOTE_DIALECT_CLAP | CLAP_NOTE_DIALECT_MIDI;
  info->preferred_dialect = CLAP_NOTE_DIALECT_CLAP;
  std::snprintf(info->name, sizeof info->name, "%s", "Notes");
  return true;
}
const clap_plugin_note_ports_t notePorts{notePortsCount, notePortsGet};

ParamInfo infoAt(const Plugin *s, int i) { return i < s->I.paramCount ? s->I.params[i] : s->presetParam(); }

uint32_t paramsCount(const clap_plugin_t *p) { return (uint32_t)self(p)->nParams; }
bool paramsGetInfo(const clap_plugin_t *p, uint32_t index, clap_param_info_t *info) {
  Plugin *s = self(p);
  if ((int)index >= s->nParams) return false;
  std::memset(info, 0, sizeof *info);
  ParamInfo q = infoAt(s, (int)index);
  info->id = s->ids[index];
  // CLAP's "stepped" means whole numbers (AU: indexed): only choices and toggles. A continuous
  // parameter's own step (0.01, 0.5) is applied when it is set.
  if (q.kind == ParamKind::continuous) info->flags = CLAP_PARAM_IS_AUTOMATABLE;
  else info->flags = CLAP_PARAM_IS_STEPPED | (q.kind == ParamKind::choice ? CLAP_PARAM_IS_ENUM : 0) | ((int)index < s->I.paramCount ? CLAP_PARAM_IS_AUTOMATABLE : 0);
  std::snprintf(info->name, sizeof info->name, "%s", q.label);
  std::snprintf(info->module, sizeof info->module, "%s", q.group);
  info->min_value = q.min; info->max_value = q.max; info->default_value = q.def;
  return true;
}
bool paramsGetValue(const clap_plugin_t *p, clap_id id, double *v) {
  Plugin *s = self(p);
  int i = s->indexOf(id);
  if (i < 0) return false;
  *v = s->shown[i].load();
  return true;
}
bool paramsValueToText(const clap_plugin_t *p, clap_id id, double v, char *out, uint32_t size) {
  Plugin *s = self(p);
  int i = s->indexOf(id);
  if (i < 0) return false;
  if (i == s->I.paramCount) { // Preset
    int k = (int)std::lround(v);
    std::snprintf(out, size, "%s", k <= 0 ? "Default settings" : k <= s->I.presetCount ? s->I.presets[k - 1].name : "?");
    return true;
  }
  formatValue(s->I.params[i], v, out, size);
  return true;
}
bool paramsTextToValue(const clap_plugin_t *p, clap_id id, const char *text, double *v) {
  Plugin *s = self(p);
  int i = s->indexOf(id);
  if (i < 0) return false;
  if (i == s->I.paramCount) {
    if (!std::strcmp(text, "Default settings")) { *v = 0; return true; }
    for (int k = 0; k < s->I.presetCount; k++) if (!std::strcmp(text, s->I.presets[k].name)) { *v = k + 1; return true; }
    return false;
  }
  return parseValue(s->I.params[i], text, *v);
}
void paramsFlush(const clap_plugin_t *p, const clap_input_events_t *in, const clap_output_events_t *out) {
  Plugin *s = self(p);
  if (!s->processing.load()) s->takePending();
  for (uint32_t k = 0, n = in ? in->size(in) : 0; k < n; k++) {
    const clap_event_header_t *h = in->get(in, k);
    if (h->space_id == CLAP_CORE_EVENT_SPACE_ID && h->type == CLAP_EVENT_PARAM_VALUE) s->event(h, out);
  }
  s->takeUi(out);
  s->publishKeys();
}
const clap_plugin_params_t params{paramsCount, paramsGetInfo, paramsGetValue, paramsValueToText, paramsTextToValue, paramsFlush};

bool stateSave(const clap_plugin_t *p, const clap_ostream_t *s) { return self(p)->save(s); }
bool stateLoad(const clap_plugin_t *p, const clap_istream_t *s) { return self(p)->load(s); }
const clap_plugin_state_t state{stateSave, stateLoad};

uint32_t latencyGet(const clap_plugin_t *) { return 0; }
const clap_plugin_latency_t latency{latencyGet};

// AU hosts order parameters by id unless told otherwise: keep the descriptor's order
bool auParamOrder(const clap_plugin_t *, size_t *order, size_t count) {
  for (size_t i = 0; i < count; i++) order[i] = i;
  return true;
}
const clap_plugin_auv2_param_ordering_t auOrdering{auParamOrder};

// ---- the window (editor.h): sizes in points, times the host's scale where it works in pixels ----

#ifdef FORTE_EDITOR
bool guiIsApiSupported(const clap_plugin_t *, const char *api, bool floating) { return !floating && !std::strcmp(api, Editor::api()); }
bool guiGetPreferredApi(const clap_plugin_t *, const char **api, bool *floating) { *api = Editor::api(); *floating = false; return true; }
bool guiCreate(const clap_plugin_t *p, const char *api, bool floating) {
  Plugin *s = self(p);
  if (floating || std::strcmp(api, Editor::api()) || s->editor) return false;
  s->editor = Editor::create([s](const choc::value::ValueView &args) { return s->call(args); });
  if (!s->editor) return false;
  if (s->hostTimer && s->timer == CLAP_INVALID_ID) s->hostTimer->register_timer(s->host, 16, &s->timer);
  return true;
}
void guiDestroy(const clap_plugin_t *p) {
  Plugin *s = self(p);
  if (s->hostTimer && s->timer != CLAP_INVALID_ID) s->hostTimer->unregister_timer(s->host, s->timer);
  s->timer = CLAP_INVALID_ID;
  s->editor.reset();
}
bool guiSetScale(const clap_plugin_t *p, double scale) {
#ifdef __APPLE__
  (void)p; (void)scale;
  return false; // macOS works in points
#else
  self(p)->scale = scale > 0 ? scale : 1;
  return true;
#endif
}
uint32_t px(const Plugin *s, uint32_t points) { return (uint32_t)std::lround(points * s->scale); }
bool guiGetSize(const clap_plugin_t *p, uint32_t *w, uint32_t *h) { Plugin *s = self(p); *w = px(s, s->width); *h = px(s, s->height); return true; }
bool guiCanResize(const clap_plugin_t *) { return true; }
bool guiGetResizeHints(const clap_plugin_t *, clap_gui_resize_hints_t *hints) {
  hints->can_resize_horizontally = hints->can_resize_vertically = true;
  hints->preserve_aspect_ratio = false;
  hints->aspect_ratio_width = hints->aspect_ratio_height = 0;
  return true;
}
bool guiAdjustSize(const clap_plugin_t *p, uint32_t *w, uint32_t *h) {
  Plugin *s = self(p);
  if (*w < px(s, kEditorMinWidth)) *w = px(s, kEditorMinWidth);
  if (*h < px(s, kEditorMinHeight)) *h = px(s, kEditorMinHeight);
  return true;
}
bool guiSetSize(const clap_plugin_t *p, uint32_t w, uint32_t h) {
  Plugin *s = self(p);
  guiAdjustSize(p, &w, &h);
  s->width = (uint32_t)std::lround(w / s->scale); s->height = (uint32_t)std::lround(h / s->scale);
  if (s->editor) s->editor->setSize(w, h);
  return true;
}
bool guiSetParent(const clap_plugin_t *p, const clap_window_t *window) {
  Plugin *s = self(p);
  if (!s->editor) return false;
  s->editor->setSize(px(s, s->width), px(s, s->height));
  return s->editor->setParent(window);
}
bool guiSetTransient(const clap_plugin_t *, const clap_window_t *) { return false; }
void guiSuggestTitle(const clap_plugin_t *, const char *) {}
bool guiShow(const clap_plugin_t *p) { Plugin *s = self(p); if (s->editor) s->editor->show(true); return s->editor != nullptr; }
bool guiHide(const clap_plugin_t *p) { Plugin *s = self(p); if (s->editor) s->editor->show(false); return s->editor != nullptr; }
const clap_plugin_gui_t gui{guiIsApiSupported, guiGetPreferredApi, guiCreate, guiDestroy, guiSetScale, guiGetSize, guiCanResize,
                            guiGetResizeHints, guiAdjustSize, guiSetSize, guiSetParent, guiSetTransient, guiSuggestTitle, guiShow, guiHide};

void onTimer(const clap_plugin_t *p, clap_id) { Plugin *s = self(p); if (s->editor) s->editor->idle(); }
const clap_plugin_timer_support_t timerSupport{onTimer};
#endif

// the editor's calls without a window (plugin.h, tests/plugin-tests.cpp)
std::string bridgeCall(const clap_plugin_t *p, const char *json) {
  try { return choc::json::toString(self(p)->call(choc::json::parse(json))); } catch (...) { return "error"; }
}
const EditorBridge editorBridge{bridgeCall};

bool pluginInit(const clap_plugin_t *p) {
  Plugin *s = self(p);
  s->hostParams = (const clap_host_params_t *)s->host->get_extension(s->host, CLAP_EXT_PARAMS);
  s->hostTimer = (const clap_host_timer_support_t *)s->host->get_extension(s->host, CLAP_EXT_TIMER_SUPPORT);
  return true;
}
void pluginDestroy(const clap_plugin_t *p) {
#ifdef FORTE_EDITOR
  guiDestroy(p);
#endif
  delete self(p);
}
bool pluginActivate(const clap_plugin_t *p, double fs, uint32_t, uint32_t) {
  Plugin *s = self(p);
  // a new engine at the host's rate (any, 44.1–192 kHz), and the chain's impulse responses for it
  s->engine.reset(s->I.create(fs));
  s->chain.configure(s->I.chain, fs);
  s->panic();
  if (s->I.space == Space::sustain) s->engine->setSustain(false);
  s->dirty = true;
  return true;
}
void pluginDeactivate(const clap_plugin_t *p) { self(p)->engine.reset(); }
bool pluginStartProcessing(const clap_plugin_t *p) { self(p)->processing = true; return true; }
void pluginStopProcessing(const clap_plugin_t *p) { self(p)->processing = false; }
void pluginReset(const clap_plugin_t *p) { self(p)->panic(); self(p)->chain.reset(); }
clap_process_status pluginProcess(const clap_plugin_t *p, const clap_process_t *proc) { return self(p)->process(proc); }
const void *pluginGetExtension(const clap_plugin_t *, const char *id) {
  if (!std::strcmp(id, CLAP_EXT_AUDIO_PORTS)) return &audioPorts;
  if (!std::strcmp(id, CLAP_EXT_NOTE_PORTS)) return &notePorts;
  if (!std::strcmp(id, CLAP_EXT_PARAMS)) return &params;
  if (!std::strcmp(id, CLAP_EXT_STATE)) return &state;
  if (!std::strcmp(id, CLAP_EXT_LATENCY)) return &latency;
  if (!std::strcmp(id, CLAP_PLUGIN_AUV2_PARAM_ORDERING)) return &auOrdering;
#ifdef FORTE_EDITOR
  if (!std::strcmp(id, CLAP_EXT_GUI)) return &gui;
  if (!std::strcmp(id, CLAP_EXT_TIMER_SUPPORT)) return &timerSupport;
#endif
  if (!std::strcmp(id, kEditorBridge)) return &editorBridge;
  return nullptr;
}
void pluginOnMainThread(const clap_plugin_t *) {}

// ---- the factory: one plugin per binary ----------------------------------------------------------

struct Factory {
  const InstrumentInfo *I = nullptr;
  std::string id, version, accent;
  const char *features[4] = {CLAP_PLUGIN_FEATURE_INSTRUMENT, CLAP_PLUGIN_FEATURE_SYNTHESIZER, CLAP_PLUGIN_FEATURE_STEREO, nullptr};
  clap_plugin_descriptor_t desc{};
  clap_plugin_info_as_vst3_t vst3{};
  void init(const InstrumentInfo &info, const char *colour) {
    I = &info;
    accent = colour ? colour : "";
    id = std::string("net.jthaler.forte.") + info.slug;
    version = info.version;
    desc = {CLAP_VERSION, id.c_str(), info.name, "Forte", "https://forte.jthaler.net",
            "https://forte.jthaler.net", "https://github.com/jdthaler/forte", version.c_str(), info.description, features};
    vst3 = {"Forte", &info.vst3Id, nullptr};
  }
} factory;

uint32_t factoryCount(const clap_plugin_factory_t *) { return 1; }
const clap_plugin_descriptor_t *factoryDescriptor(const clap_plugin_factory_t *, uint32_t i) { return i == 0 ? &factory.desc : nullptr; }
const clap_plugin_t *factoryCreate(const clap_plugin_factory_t *, const clap_host_t *host, const char *id) {
  if (!factory.I || std::strcmp(id, factory.desc.id)) return nullptr;
  Plugin *s = new Plugin(host, *factory.I, &factory.desc, factory.accent);
  s->clap.init = pluginInit; s->clap.destroy = pluginDestroy;
  s->clap.activate = pluginActivate; s->clap.deactivate = pluginDeactivate;
  s->clap.start_processing = pluginStartProcessing; s->clap.stop_processing = pluginStopProcessing;
  s->clap.reset = pluginReset; s->clap.process = pluginProcess;
  s->clap.get_extension = pluginGetExtension; s->clap.on_main_thread = pluginOnMainThread;
  return &s->clap;
}
const clap_plugin_factory_t pluginFactory{factoryCount, factoryDescriptor, factoryCreate};

const clap_plugin_info_as_vst3_t *vst3Info(const clap_plugin_factory_as_vst3 *, uint32_t i) { return i == 0 ? &factory.vst3 : nullptr; }
const clap_plugin_factory_as_vst3_t vst3Factory{"Forte", "https://forte.jthaler.net", "", vst3Info, nullptr};

} // namespace

bool entryInit(const InstrumentInfo &info, const char *accent) { factory.init(info, accent); return true; }

const void *entryFactory(const char *id) {
  if (!std::strcmp(id, CLAP_PLUGIN_FACTORY_ID)) return &pluginFactory;
  if (!std::strcmp(id, CLAP_PLUGIN_FACTORY_INFO_VST3)) return &vst3Factory;
  return nullptr;
}

} // namespace forte
