// plugin.cpp — one CLAP plugin for any Forte instrument (an InstrumentInfo): notes and MIDI as
// the pages take them (shared/shell.js, shared/midi.js), the parameters with a Preset choice,
// state, a stereo output through the pages' output chain (forte/chain.h), and a window with the
// instrument's controls and a keyboard (editor.h, editor.html). clap-wrapper builds the VST3,
// AU v2 and standalone from it.

#include "plugin.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <memory>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#include <clap/clap.h>
#include <clapwrapper/auv2.h>
#include <clapwrapper/vst3.h>

#include "choc/containers/choc_Value.h"
#include "choc/memory/choc_Base64.h"
#include "choc/text/choc_JSON.h"
#include "forte/chain.h"
#include "forte/denormals.h"
#include "forte/guard.h"
#include "forte/limiter.h"
#include "forte/mpe.h"
#include "forte/queue.h"
#include "forte/tuning.h"
#include "presets.h"
#ifdef FORTE_EDITOR
#include "editor.h"
#endif

namespace forte {
namespace {

constexpr int kBlock = 128; // the engines run in blocks of at most 128 samples, as in the browser
constexpr uint32_t kPresetId = 0x7ffffffe;
// The velocity curve (touch): MIDI velocity v (0..1) becomes v^γ before the instrument's own
// mapping. Soft makes a light touch louder, Hard asks for a firmer one. Every plugin has it.
constexpr uint32_t kTouchId = 0x7ffffffd;
const char *const kTouchChoices[] = {"Soft", "Normal", "Hard"};
constexpr double kTouchGamma[] = {0.6, 1, 1.6};
// Quality (forte/engine.h): how much of the physics the engine plays, for a slow computer. Every
// plugin has it; the project keeps it, presets don't. A host that renders offline (a bounce, a
// freeze) gets High whatever it is set to.
constexpr uint32_t kQualityId = 0x7ffffffc;
const char *const kQualityChoices[] = {"High", "Medium", "Low"};
// MPE (forte/mpe.h): Auto (from the controller's configuration message), On or Off. Every plugin has it.
constexpr uint32_t kMpeId = 0x7ffffffb;
// Octave (±4) and Transpose (±12 semitones) move the MIDI keys, as the pages' menus do
// (shared/midi.js keyShift): a note-off, a note's pressure and its expressions go where its
// note-on went (moveOn, moved), so a note held while they change ends as it began. The window's
// own keys play what they show. Every plugin has them, saved as midiTranspose and midiOctave (the
// pipe organ's and the clavichord's own octave is a stop); the Forte app keeps them, as the controller's.
constexpr uint32_t kTransposeId = 0x7ffffffa, kOctaveId = 0x7ffffff9;
constexpr int kSemitones = 12, kOctaves = 4; // each choice's index is the shift + this
#define FORTE_MINUS "\xe2\x88\x92" // U+2212, as UTF-8 bytes (MSVC turns \u escapes into CP1252)
const char *const kTransposeChoices[] = {FORTE_MINUS "12", FORTE_MINUS "11", FORTE_MINUS "10", FORTE_MINUS "9", FORTE_MINUS "8", FORTE_MINUS "7", FORTE_MINUS "6",
                                         FORTE_MINUS "5", FORTE_MINUS "4", FORTE_MINUS "3", FORTE_MINUS "2", FORTE_MINUS "1", "0", "+1", "+2", "+3",
                                         "+4", "+5", "+6", "+7", "+8", "+9", "+10", "+11", "+12"};
const char *const kOctaveChoices[] = {FORTE_MINUS "4", FORTE_MINUS "3", FORTE_MINUS "2", FORTE_MINUS "1", "0", "+1", "+2", "+3", "+4"};
#undef FORTE_MINUS
static_assert(sizeof kTransposeChoices / sizeof *kTransposeChoices == 2 * kSemitones + 1 && sizeof kOctaveChoices / sizeof *kOctaveChoices == 2 * kOctaves + 1);
// Morph (shared/morph.js): Morph from and Morph to name two presets (0 the defaults, k the k-th),
// and Morph (0..1) is how far the sound is from one to the other, each parameter part way
// (morph(), as shared/presets.js morph). A song can automate Morph. Every plugin with presets has them.
constexpr uint32_t kMorphFromId = 0x7ffffff8, kMorphToId = 0x7ffffff7, kMorphId = 0x7ffffff6;
const FormatSegment kMorphFormat[] = {{INFINITY, "", " %", 100, 0, 0, false, false, false, false}};
// The soft pedal (CC67): a key struck while it is down is struck this much slower, so it sounds
// softer and, where the instrument's hammer or mallet is nonlinear, darker too.
constexpr double kSoftPedal = 0.6;
// A foot controller's switches (General Purpose 5–7) are the sustain, sostenuto and soft pedals: a
// Roland FC-300 sends them from CTL 1, CTL 2 and EXP 1's toe switch (shared/midi.js SWITCHES).
int footSwitch(int cc) { return cc == 80 ? 64 : cc == 81 ? 66 : cc == 82 ? 67 : cc; }
constexpr uint32_t kEditorWidth = 1000, kEditorHeight = 760, kEditorMinWidth = 600, kEditorMinHeight = 420; // points

// what the editor asks of the audio thread
struct UiEvent {
  enum Type : uint8_t { param, begin, end, on, off, pedal, pressure, panic, swap } type; // swap: a preset's values follow (fade across them)
  int16_t i; // a parameter or a key
  double v;
};

// What the window works with: an instrument's Plugin, or the Forte app's Suite of them. Its
// sizes are in points, times the host's scale where the host works in pixels.
struct Instance {
  clap_plugin_t clap{};
  const clap_host_t *host;
  const clap_host_timer_support_t *hostTimer = nullptr;
#ifdef FORTE_EDITOR
  std::unique_ptr<Editor> editor;
#endif
  uint32_t width = kEditorWidth, height = kEditorHeight; // points
  double scale = 1;                  // pixels per point, where the host works in pixels
  clap_id timer = CLAP_INVALID_ID;

  Instance(const clap_host_t *h, const clap_plugin_descriptor_t *desc) : host(h) { clap.desc = desc; clap.plugin_data = this; }
  virtual ~Instance() = default;
  // the editor's calls, window.forte(method, …args) (Plugin::call says what they are)
  virtual choc::value::Value call(const choc::value::ValueView &args) = 0;
  virtual void idle() {} // on the main thread, every 16 ms while the window is open
  virtual const Site *page() const = 0; // the instrument's page now, for the window's views (site.h)
  virtual void closed() {}              // the window is gone: nobody watches the views
};

Instance *instance(const clap_plugin_t *p) { return (Instance *)p->plugin_data; }

struct Plugin : Instance, MpeDecoder::Sink {
  const InstrumentInfo &I;
  const Site *const site;    // its page, for the window's views (or null)
  const Views *const views;  // what they read beyond the engine's messages (or null)
  const std::string accent;  // the window's colour
  const bool hasPresets;
  const int nParams;        // the instrument's parameters, then Preset if it has presets, the velocity curve, Quality, MPE,
                            // Transpose and Octave, then Morph from, Morph to and Morph if it has presets
  const int presetAt, touchAt, qualityAt, mpeAt, transposeAt, octaveAt, fromAt, toAt, morphAt; // their indices (−1: none, without presets)
  std::vector<const char *> presetNames; // "Default settings", then the presets' names: Morph from's and Morph to's choices
  std::vector<double> morphA, morphB;  // the two presets' values while morphing (audio thread)
  std::vector<uint32_t> ids; // hashed parameter ids, by index

  std::unique_ptr<Engine> engine;
  OutputChain chain;
  std::vector<double> P;               // the audio thread's values
  std::unique_ptr<std::atomic<double>[]> shown; // what the host reads (main thread)
  std::vector<double> pending;         // values from a state load, for the audio thread
  std::atomic<bool> loadPending{false};
  std::atomic<bool> processing{false};
  bool dirty = true;                   // the engine needs setParams
  bool offline = false;                // the host renders offline (CLAP's render extension): High

  // notes as the shell counts them: how many channels hold each key, and the keys latched by Hold
  uint8_t held[16][128]{};
  int8_t moved[16][128];  // the key each channel's MIDI key plays, as Octave and Transpose moved its note-on (−1: none)
  std::atomic<int> partShift{0}; // in the Forte app, how far its part's octave moves the MIDI keys (Suite::Zone; the Suite moves the window's)
  uint8_t sounding[128]{};
  bool latched[128]{};
  bool sustain = false;
  bool sostenuto = false, soft = false;
  bool caught[128]{};   // the keys sounding when the sostenuto pedal went down: they keep sounding
  bool sostHeld[128]{}; // let go while caught: the sostenuto holds them
  uint8_t ccLast[128]{}; // each controller's last value (a toggle flips on a press)
  // the volume (CC7) and expression (CC11) pedals: one gain after the chain, (v/127)² each
  // (shared/midi.js levelGain), full until a pedal moves; `level` follows it in 10 ms
  int volumePedal = 127, expressionPedal = 127;
  double level = 1, levelCoef = 0;
  // a preset's change, faded across so it doesn't click (shared/worklet.js): the engine's sound fades
  // out in 6 ms while its new parameters wait (dirty), takes them at the bottom, and fades back in
  // in 12 ms, a raised cosine each way. state: 0 none, 1 out, 2 in; at: 0..1 of the fade
  struct { int state = 0; double at = 0; } swap;
  static constexpr double kSwapOut = 0.006, kSwapIn = 0.012;
  // MPE, and the per-note expression a host sends: the keys the engine was given their own bend or
  // slide, so a note struck there without them starts plain
  MpeDecoder mpe;
  Tuning tuning;         // the parameters' (a note's bend follows it)
  int tuningAt[3 + kCustomCents];
  bool expressed[128]{};
  // The Expression switches (shared/expression.js): the instrument's parameters strikeOn, glideOn,
  // slideOn, pressOn and liftOn (−1: it has none). Off, a note is struck at the window keys'
  // velocity, its own bend and slide are held back, pressure is, and a release is at the
  // instrument's own speed; a switch turned off lets go of what it held (switches()).
  enum { kStrike, kGlide, kSlide, kPress, kLift, kSwitches };
  int switchAt[kSwitches];
  bool switchOn[kSwitches] = {true, true, true, true, true}; // as the engine last had them
  bool pressed[129]{}; // the keys (and, at 128, the channel) the engine was given pressure for
  static constexpr double kKeysVelocity = 0.75; // the window's keys, with no velocity parameter (editor.html)
  bool on(int k) const { return switchAt[k] < 0 || P[switchAt[k]] >= 0.5; }
  std::array<double, 128> landed = [] { std::array<double, 128> a; a.fill(NAN); return a; }(); // a host's per-note brightness where the note began (NaN: not yet): its slide is from there

  // the editor: its events for the audio thread, what it shows, the keys sounding for it
  const clap_host_params_t *hostParams = nullptr;
  SpscQueue<UiEvent> fromUi{1024};
  std::vector<double> sent;          // each value as the editor last saw it (NaN: never)
  std::atomic<uint64_t> keysDown[2]{};
  std::atomic<bool> pedalDown{false};
  std::atomic<float> struck[128]{}; // each key's last velocity, as the engine got it (the descriptor's midiVelocity's units)
  // the notes struck outside the keys that play (past keyLo…keyHi, or a closed compass), the last
  // one, and whether it came from MIDI (Octave and Transpose moved it): the window says so
  std::atomic<uint32_t> misses{0};
  std::atomic<int> missed{-1};
  std::atomic<bool> missedMidi{false};
  // the views (the instrument's page in the window, editor.html): while they show, the engine's
  // messages (Engine::post), each with the data its views read from the engine (site.h, Views),
  // and its sound before the chain, as the page's analyser hears it. The engine posts into fresh
  // on the audio thread, which hands each message on with its data at the end of the block.
  struct Posted { Message m; int n = 0; }; // n: how many of attached are its
  static constexpr size_t kPosted = 4096, kAttached = 1 << 17;
  std::atomic<bool> viewsOn{false};
  SpscQueue<Message> fresh{1024};
  SpscQueue<Posted> messages{kPosted};
  SpscQueue<double> attached{kAttached};
  std::atomic<size_t> postedIn{0}, postedOut{0}, attachedIn{0}, attachedOut{0};
  std::vector<double> attaching = std::vector<double>(kAttached / 2);
  SpscQueue<float> heard{1 << 16};
  double fs = 48000;

  Plugin(const clap_host_t *h, const InstrumentInfo &info, const clap_plugin_descriptor_t *desc, const std::string &colour, const Site *page = nullptr, const Views *watch = nullptr)
      : Instance(h, desc), I(info), site(page), views(watch), accent(colour.size() < 2 ? "#f0b35a" : colour), hasPresets(info.presetCount > 0),
        nParams(info.paramCount + (hasPresets ? 9 : 5)), presetAt(hasPresets ? info.paramCount : -1), touchAt(info.paramCount + (hasPresets ? 1 : 0)),
        qualityAt(touchAt + 1), mpeAt(touchAt + 2), transposeAt(touchAt + 3), octaveAt(touchAt + 4),
        fromAt(hasPresets ? touchAt + 5 : -1), toAt(hasPresets ? touchAt + 6 : -1), morphAt(hasPresets ? touchAt + 7 : -1) {
    std::memset(moved, -1, sizeof moved);
    for (int i = 0; i < I.paramCount; i++) ids.push_back(paramHash(I.params[i].id));
    if (hasPresets) ids.push_back(kPresetId);
    ids.push_back(kTouchId);
    ids.push_back(kQualityId);
    ids.push_back(kMpeId);
    ids.push_back(kTransposeId);
    ids.push_back(kOctaveId);
    if (hasPresets) { ids.push_back(kMorphFromId); ids.push_back(kMorphToId); ids.push_back(kMorphId); }
    presetNames.push_back("Default settings");
    for (int k = 0; k < I.presetCount; k++) presetNames.push_back(I.presets[k].name);
    morphA.resize(I.paramCount);
    morphB.resize(I.paramCount);
    const char *tuningIds[3] = {"pitch", "temperament", "tuningRoot"};
    for (int k = 0; k < 3 + kCustomCents; k++) tuningAt[k] = paramIndex(k < 3 ? tuningIds[k] : ("cents" + std::to_string(k - 2)).c_str());
    const char *switchIds[kSwitches] = {"strikeOn", "glideOn", "slideOn", "pressOn", "liftOn"};
    for (int k = 0; k < kSwitches; k++) switchAt[k] = paramIndex(switchIds[k]);
    P.resize(nParams);
    pending.resize(nParams);
    shown.reset(new std::atomic<double>[nParams]);
    for (int i = 0; i < I.paramCount; i++) P[i] = I.params[i].def;
    if (hasPresets) P[presetAt] = 0;
    P[touchAt] = 1;
    P[qualityAt] = 0;
    P[mpeAt] = mpe::autoDetect;
    P[transposeAt] = kSemitones;
    P[octaveAt] = kOctaves;
    if (hasPresets) { P[fromAt] = 0; P[toAt] = 1; P[morphAt] = 0; }
    for (int i = 0; i < nParams; i++) shown[i] = P[i];
    sent.assign(nParams, NAN);
  }

  int indexOf(clap_id id) const {
    for (int i = 0; i < nParams; i++) if (ids[i] == id) return i;
    return -1;
  }

  // ---- parameters ---------------------------------------------------------------------------
  // Set parameter i (audio thread, or main thread while not processing). A change of Preset
  // applies it: the defaults, then the kept parameters, then the preset's values (shell.js); and
  // it is where Morph starts now, unless it is where Morph ends (shared/morph.js). A change of
  // Morph, Morph from or Morph to applies the morph.
  void set(int i, double v, const clap_output_events_t *out) {
    if (i == touchAt) { P[i] = constrain(touchParam(), v); shown[i] = P[i]; return; }
    if (i == mpeAt) { P[i] = constrain(mpeParam(), v); shown[i] = P[i]; mpeMode(); return; }
    if (i == qualityAt) { P[i] = constrain(qualityParam(), v); shown[i] = P[i]; dirty = true; return; }
    if (i == transposeAt || i == octaveAt) { P[i] = constrain(infoOf(i), v); shown[i] = P[i]; return; }
    if (i == presetAt) {
      int k = (int)std::lround(v);
      k = k < 0 ? 0 : k > I.presetCount ? I.presetCount : k;
      presetValues(k, morphA);
      swapIn();
      for (int j = 0; j < I.paramCount; j++) if (morphA[j] != P[j]) { P[j] = morphA[j]; shown[j] = P[j]; tell(j, out); }
      P[i] = k; shown[i] = k;
      if (k == (int)P[toAt] && k != (int)P[fromAt]) put(morphAt, 1, out);
      else { put(fromAt, k, out); put(morphAt, 0, out); }
      dirty = true;
      return;
    }
    if (i == fromAt || i == toAt || i == morphAt) {
      v = constrain(infoOf(i), v);
      if (v == P[i]) return;
      P[i] = v; shown[i] = v;
      morph(out);
      return;
    }
    v = constrain(I.params[i], v);
    if (v == P[i]) return;
    P[i] = v; shown[i] = v;
    dirty = true;
  }
  // preset k's values (0: the defaults), the kept parameters as they are
  void presetValues(int k, std::vector<double> &next) const {
    for (int j = 0; j < I.paramCount; j++) next[j] = I.params[j].def;
    for (int j = 0; j < I.keepCount; j++) next[I.keep[j]] = P[I.keep[j]];
    if (k > 0) for (int j = 0; j < I.presets[k - 1].count; j++) {
      const PresetValue &pv = I.presets[k - 1].values[j];
      next[pv.param] = constrain(I.params[pv.param], pv.value);
    }
  }
  // Morph: every parameter part way from Morph from's preset to Morph to's (shared/presets.js
  // morph): a number in a straight line, or by equal ratios where its control is logarithmic, on
  // its step; a choice or a toggle halfway. At either end the Preset menu names that preset.
  void morph(const clap_output_events_t *out) {
    const double t = P[morphAt];
    const int a = (int)P[fromAt], b = (int)P[toAt];
    presetValues(a, morphA);
    presetValues(b, morphB);
    for (int j = 0; j < I.paramCount; j++) {
      const ParamInfo &p = I.params[j];
      const double x = morphA[j], y = morphB[j];
      double v = t <= 0 || x == y ? x : t >= 1 ? y : p.kind != ParamKind::continuous ? (t < 0.5 ? x : y)
               : constrain(p, p.log && x > 0 && y > 0 ? x * std::pow(y / x, t) : x + (y - x) * t);
      if (v != P[j]) { P[j] = v; shown[j] = v; tell(j, out); }
    }
    if (t <= 0 || t >= 1) put(presetAt, t <= 0 ? a : b, out);
    dirty = true;
  }
  // parameter i set by the plugin itself, as it is, and the host told
  void put(int i, double v, const clap_output_events_t *out) {
    if (i < 0 || P[i] == v) return;
    P[i] = v; shown[i] = v;
    tell(i, out);
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
  // vel: MIDI velocity / 127; fromMidi: through the velocity curve and the soft pedal (the
  // window's keys are not, as the pages' computer and screen keys are not)
  void noteOn(int ch, int key, double vel, bool fromMidi = true) {
    if (ch < 0 || ch > 15) return;
    if (key < I.keyLo || key > I.keyHi || (I.compass >= 0 && P[I.compass] < 0.5 && (key < I.compassLo || key > I.compassHi))) { // outside the keys that play
      missed.store(key, std::memory_order_relaxed); missedMidi.store(fromMidi, std::memory_order_relaxed);
      misses.fetch_add(1, std::memory_order_release);
      return;
    }
    if (fromMidi) vel = std::pow(vel, kTouchGamma[(int)P[touchAt]]) * (soft ? kSoftPedal : 1);
    if (!on(kStrike)) vel = kKeysVelocity; // Strike off: every note as hard as the window's keys
    if (held[ch][key]) noteOff(ch, key, -1); // struck again before its note-off: let it go first
    held[ch][key] = 1; sounding[key]++; latched[key] = false; sostHeld[key] = false;
    if (!mpe.isMember(ch)) plain(key); // an MPE member's note came with its own (MpeDecoder::midi)
    if (I.midiVelocity) vel = I.midiVelocity(vel);
    struck[key].store((float)vel, std::memory_order_relaxed);
    if (engine) engine->noteOn(key, vel);
  }
  void noteOff(int ch, int key, double vel) {
    if (key < 0 || key > 127 || ch < 0 || ch > 15 || !held[ch][key]) return; // not down on this channel
    if (!on(kLift)) vel = -1; // Lift off: released at the instrument's own speed
    held[ch][key] = 0;
    if (--sounding[key] > 0) return;
    if (sostenuto && caught[key]) { sostHeld[key] = true; return; }
    release(key, vel);
  }
  // a key no hand or sostenuto holds: Hold latches it, else its note ends
  void release(int key, double vel) {
    if (I.space == Space::hold && sustain) { latched[key] = true; return; }
    if (engine) engine->noteOff(key, vel);
  }
  // The sostenuto pedal (CC66) holds the keys sounding as it goes down, and only those, until it
  // comes up: a piano's middle pedal. On an instrument whose Space latches keys, the same.
  void sostenutoPedal(bool on) {
    if (on == sostenuto) return;
    sostenuto = on;
    if (on) { for (int k = 0; k < 128; k++) caught[k] = sounding[k] > 0 || latched[k]; return; }
    for (int k = 0; k < 128; k++) {
      caught[k] = false;
      if (sostHeld[k]) { sostHeld[k] = false; if (!sounding[k]) release(k, -1); }
    }
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
    std::memset(caught, 0, sizeof caught); std::memset(sostHeld, 0, sizeof sostHeld);
    std::memset(moved, -1, sizeof moved);
    std::memset(pressed, 0, sizeof pressed);
    sostenuto = false; soft = false;
    if (sustain) pedal(false);
    if (engine) engine->allNotesOff();
  }
  double levelTarget() const { const double a = volumePedal / 127.0, b = expressionPedal / 127.0; return a * a * b * b; }
  void levels(int cc, int v) {
    v = std::clamp(v, 0, 127);
    if (cc == 7) volumePedal = v; else if (cc == 11) expressionPedal = v;
  }
  // a program change n plays preset n + 1 (a foot controller's pedal 1 is the first preset; the
  // Preset parameter's 0 is the defaults); one past the presets does nothing
  void programChange(int n, const clap_output_events_t *out) {
    if (!hasPresets || n < 0 || n >= I.presetCount) return;
    set(presetAt, n + 1, out);
    tell(presetAt, out);
  }
  // the mod wheel's parameter at u (0..1): at rest its default, fully up its maximum (shared/midi.js);
  // or a slide's (its parameter's at either end of the key: slideMax)
  double wheelValue(double u, int at = -1, double max = NAN) const {
    const ParamInfo &p = I.params[at < 0 ? I.modWheel : at];
    const double top = at < 0 ? I.modWheelMax : max;
    if (u <= 0) return p.def;
    return constrain(p, p.log ? p.def * std::pow(top / p.def, u) : p.def + (top - p.def) * u);
  }
  void modWheel(int cc, const clap_output_events_t *out) {
    if (I.modWheel < 0) return;
    const double v = wheelValue(cc / 127.0);
    int i = I.modWheel;
    double before = P[i];
    set(i, v, out);
    if (P[i] != before) tell(i, out);
  }
  // a controller (0..127) across a parameter's whole range, as its slider moves it (shared/midi.js
  // ccValue): in log(value) for a log one, a toggle on at 64 and above, a choice's options in turn
  static double ccValue(const ParamInfo &p, int v) {
    const double u = v <= 0 ? 0 : v >= 127 ? 1 : v / 127.0;
    if (p.kind == ParamKind::toggle) return v >= 64 ? 1 : 0;
    if (p.log && p.min > 0) return p.min * std::pow(p.max / p.min, u);
    return p.min + (p.max - p.min) * u;
  }
  // another controller the descriptor maps to a parameter (its controllers, the faders and the
  // pad among them) across its range (ccValue); or a choice switched between two values
  // (instrument.h, Controller)
  void controller(int cc, int v, const clap_output_events_t *out) {
    const bool press = v >= 64 && ccLast[cc & 127] < 64;
    ccLast[cc & 127] = (uint8_t)v;
    for (int i = 0; i < I.controllerCount; i++) if (I.controllers[i].cc == cc) {
      const Controller &c = I.controllers[i];
      const int k = c.param;
      const ParamInfo &p = I.params[k];
      const double before = P[k];
      if (c.mode != Controller::range) {
        if (before != c.a && before != c.b) continue;
        if (c.mode == Controller::values) set(k, v >= 64 ? c.b : c.a, out);
        else if (press) set(k, before == c.a ? c.b : c.a, out);
      } else set(k, ccValue(p, v), out);
      if (P[k] != before) tell(k, out);
    }
  }
  // whether the descriptor gives controller cc a parameter (the piano's CC67 is its una corda,
  // in place of the shared soft pedal)
  bool mapped(int cc) const {
    for (int i = 0; i < I.controllerCount; i++) if (I.controllers[i].cc == cc) return true;
    return false;
  }
  // the controller on 64 that switches a choice, when Space and CC64 are not a pedal (the
  // organ's Leslie): the window's Space bar plays it
  const Controller *spaceSwitch() const {
    if (I.space != Space::none) return nullptr;
    for (int i = 0; i < I.controllerCount; i++) if (I.controllers[i].cc == 64 && I.controllers[i].mode == Controller::toggle) return &I.controllers[i];
    return nullptr;
  }
  // ---- one note's own expression: MPE (forte/mpe.h), or the host's per-note expressions ----------
  // its bend in semitones, along the tuning
  void noteBend(int key, double semitones) override {
    if (key < 0 || key > 127 || !engine || !on(kGlide)) return;
    expressed[key] = true;
    engine->noteBend(bendRatio(tuning, key, semitones), key);
  }
  // its slide 0..1 (NaN: none) sets its own value of the slide's parameter (the mod wheel's, or
  // the one its descriptor names: shared/expression.js slideOf)
  void noteSlide(int key, double value) override {
    if (key < 0 || key > 127 || !engine || I.slide < 0 || (!on(kSlide) && value == value)) return;
    expressed[key] = true;
    engine->slide(value == value ? wheelValue(value, I.slide, I.slideMax) : NAN, key);
  }
  void notePressure(int key, double value) override { pressure(value, key); }
  // aftertouch (key −1: the channel's), unless Press is off
  void pressure(double value, int key) {
    if (!engine || !on(kPress) || key < -1 || key > 127) return;
    pressed[key < 0 ? 128 : key] = value > 0;
    engine->pressure(value, key);
  }
  // a switch turned off since the engine last had them: what it let through lets go (as the
  // worklet's gate does, shared/expression.js)
  void switches() {
    bool now[kSwitches];
    for (int k = 0; k < kSwitches; k++) now[k] = on(k);
    if (engine && switchOn[kGlide] && !now[kGlide]) for (int k = 0; k < 128; k++) if (expressed[k]) engine->noteBend(1, k);
    if (engine && switchOn[kSlide] && !now[kSlide]) for (int k = 0; k < 128; k++) if (expressed[k]) engine->slide(NAN, k);
    if (engine && switchOn[kPress] && !now[kPress])
      for (int k = 0; k <= 128; k++) if (pressed[k]) { pressed[k] = false; engine->pressure(0, k == 128 ? -1 : k); }
    for (int k = 0; k < kSwitches; k++) switchOn[k] = now[k];
  }
  // a note struck without its own: the key starts plain again
  void plain(int key) {
    if (!expressed[key] || !engine) return;
    expressed[key] = false;
    engine->noteBend(1, key);
    engine->slide(NAN, key);
  }
  void mpeMode() { mpe.setMode((int)P[mpeAt]); }
  void retune() {
    double custom[kCustomCents] = {};
    for (int k = 0; k < kCustomCents; k++) if (tuningAt[3 + k] >= 0) custom[k] = P[tuningAt[3 + k]];
    tuning = tuningAt[0] >= 0 && tuningAt[1] >= 0 && tuningAt[2] >= 0 ? makeTuning(P[tuningAt[0]], P[tuningAt[1]], P[tuningAt[2]], custom) : Tuning{};
  }

  // ---- Octave and Transpose: where a MIDI key plays ------------------------------------------------
  int keyShift() const { return 12 * ((int)P[octaveAt] - kOctaves) + (int)P[transposeAt] - kSemitones + partShift.load(std::memory_order_relaxed); }
  // a note-on for MIDI key `key` on channel ch: the key it plays (−1: moved past MIDI's 0…127),
  // remembered for its note-off; one still sounding there from before lets go first
  int moveOn(int ch, int key) {
    if (key < 0 || key > 127) return -1;
    if (moved[ch][key] >= 0) noteOff(ch, moved[ch][key], -1);
    const int k = key + keyShift();
    return moved[ch][key] = (int8_t)(k >= 0 && k <= 127 ? k : -1);
  }
  // its note-off: where its note-on went, and then nowhere
  int moveOff(int ch, int key) {
    if (key < 0 || key > 127) return -1;
    const int k = moved[ch][key];
    moved[ch][key] = -1;
    return k;
  }
  // its pressure and expressions: where its note-on went (one not down: where one would go now)
  int at(int ch, int key) const {
    if (key < 0 || key > 127) return -1;
    if (moved[ch][key] >= 0) return moved[ch][key];
    const int k = key + keyShift();
    return k >= 0 && k <= 127 ? k : -1;
  }

  void midi(const uint8_t *m, const clap_output_events_t *out) {
    int cmd = m[0] & 0xf0, ch = m[0] & 0x0f;
    uint8_t d[3] = {m[0], m[1], m[2]};
    if (cmd == 0x90 && d[2] > 0) { const int k = moveOn(ch, d[1]); if (k < 0) return; d[1] = (uint8_t)k; }
    else if (cmd == 0x80 || cmd == 0x90) { const int k = moveOff(ch, d[1]); if (k < 0) return; d[1] = (uint8_t)k; }
    else if (cmd == 0xa0) { const int k = at(ch, d[1]); if (k < 0) return; d[1] = (uint8_t)k; }
    if (mpe.midi(d, *this)) return; // a member channel's bend, pressure or slide: its note's
    if (cmd == 0x90 && d[2] > 0) noteOn(ch, d[1], d[2] / 127.0);
    else if (cmd == 0x80 || cmd == 0x90) noteOff(ch, d[1], cmd == 0x80 ? d[2] / 127.0 : -1);
    else if (cmd == 0xb0) {
      const int cc = mapped(d[1]) ? d[1] : footSwitch(d[1]);
      if (cc == 64 && I.space != Space::none) pedal(d[2] >= 64);
      else if (cc == 66 && !mapped(66)) sostenutoPedal(d[2] >= 64);
      else if (cc == 67 && !mapped(67)) soft = d[2] >= 64;
      else if (cc == 1 && I.modWheel >= 0) modWheel(d[2], out);
      else if ((cc == 7 || cc == 11) && !mapped(cc)) levels(cc, d[2]);
      else if (cc == 120 || cc == 123) panic();
      else {
        if (cc == 121) { if (!mapped(7)) levels(7, 127); if (!mapped(11)) levels(11, 127); } // Reset All Controllers
        controller(cc, d[2], out);
      }
    } else if (cmd == 0xc0) programChange(d[1], out); else if (cmd == 0xd0) pressure(d[1] / 127.0, -1);
    else if (cmd == 0xa0) pressure(d[2] / 127.0, d[1]);
    else if (cmd == 0xe0) {
      double b = ((d[2] << 7) + d[1] - 8192) / 8191.0;
      if (engine) engine->bend(b < -1 ? -1 : b);
    }
  }
  void event(const clap_event_header_t *h, const clap_output_events_t *out) {
    if (h->space_id != CLAP_CORE_EVENT_SPACE_ID) return;
    switch (h->type) {
      case CLAP_EVENT_NOTE_ON: {
        auto e = (const clap_event_note_t *)h;
        const int ch = e->channel < 0 ? 0 : e->channel & 15, key = moveOn(ch, e->key);
        if (key < 0) break;
        const uint8_t d[3] = {(uint8_t)(0x90 | ch), (uint8_t)key, 127};
        mpe.midi(d, *this); // an MPE member's: its bend and slide
        landed[key] = NAN;
        noteOn(ch, key, e->velocity);
        break;
      }
      case CLAP_EVENT_NOTE_OFF: case CLAP_EVENT_NOTE_CHOKE: {
        auto e = (const clap_event_note_t *)h;
        const int ch = e->channel < 0 ? 0 : e->channel & 15;
        noteOff(ch, moveOff(ch, e->key), h->type == CLAP_EVENT_NOTE_OFF ? e->velocity : -1);
        break;
      }
      case CLAP_EVENT_NOTE_EXPRESSION: {
        // One note's (Bitwig, and VST3 hosts' note expressions), or a channel's (key −1: the AU
        // wrapper's pitch bend, ±2 semitones, and channel pressure), which go on as that MIDI.
        auto e = (const clap_event_note_expression_t *)h;
        const int ch = e->channel < 0 ? 0 : e->channel & 15;
        if (e->key < 0) {
          if (e->expression_id == CLAP_NOTE_EXPRESSION_TUNING) {
            const int b = std::clamp((int)std::lround(e->value / 2 * 8192) + 8192, 0, 16383);
            const uint8_t d[3] = {(uint8_t)(0xe0 | ch), (uint8_t)(b & 127), (uint8_t)(b >> 7)};
            midi(d, out);
          } else if (e->expression_id == CLAP_NOTE_EXPRESSION_PRESSURE) {
            const uint8_t d[3] = {(uint8_t)(0xd0 | ch), (uint8_t)std::clamp((int)std::lround(e->value * 127), 0, 127), 0};
            midi(d, out);
          }
        } else if (const int key = at(ch, e->key); key < 0) break;
        else if (e->expression_id == CLAP_NOTE_EXPRESSION_PRESSURE) notePressure(key, e->value);
        else if (e->expression_id == CLAP_NOTE_EXPRESSION_TUNING) noteBend(key, e->value);
        else if (e->expression_id == CLAP_NOTE_EXPRESSION_BRIGHTNESS) { // as MPE's CC74: from where the note began
          const double u = std::clamp(e->value, 0.0, 1.0);
          if (!(landed[key] == landed[key])) landed[key] = u;
          noteSlide(key, slideFrom(landed[key], u));
        }
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
    mpeMode();
    loadPending.store(false, std::memory_order_release);
  }
  clap_process_status process(const clap_process_t *proc) {
    NoDenormals ftz;
    takePending();
    takeUi(proc->out_events);
    const uint32_t n = proc->frames_count;
    const bool watched = viewsOn.load(std::memory_order_relaxed);
    if (engine) { // posting costs nothing unwatched
      engine->messages = watched ? &fresh : nullptr;
      if (views && views->listen) views->listen(*engine, watched);
    }
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
      if (dirty && engine && swap.state != 1) { switches(); engine->setQuality(quality()); engine->setParams(P.data()); chain.setParams(P.data()); retune(); dirty = false; }
      if (L) render(L + pos, R ? R + pos : spare, end - pos);
      pos = end;
    }
    while (next < count) event(in->get(in, next++), proc->out_events);
    publishKeys();
    return CLAP_PROCESS_CONTINUE;
  }
  // audio thread: the engine's messages of this block to the window, each with its data while the
  // engine's buffers are still as the message left them (a message is dropped when the window
  // falls behind, its data when there's no room for it)
  void handOn() {
    for (Message m; fresh.pop(m);) {
      // (counted, so that a message and its data go together or not at all)
      if (postedIn.load(std::memory_order_relaxed) - postedOut.load(std::memory_order_acquire) >= kPosted) continue; // the window's behind
      Posted x{m, 0};
      if (views && views->attach) {
        const size_t room = kAttached - (attachedIn.load(std::memory_order_relaxed) - attachedOut.load(std::memory_order_acquire));
        const int k = views->attach(*engine, m, attaching.data(), (int)std::min(room, attaching.size()));
        if (k > 0 && (size_t)k <= room) {
          for (int i = 0; i < k; i++) attached.push(attaching[i]);
          attachedIn.fetch_add((size_t)k, std::memory_order_release);
          x.n = k;
        }
      }
      messages.push(x);
      postedIn.fetch_add(1, std::memory_order_release);
    }
  }
  // a preset's change: fade out (from where a fade in has got to), and the parameters wait for the bottom
  void swapIn() { if (swap.state == 1) return; swap.at = swap.state == 2 ? 1 - swap.at : 0; swap.state = 1; }
  void fadeSwap(float *L, float *R, uint32_t n) {
    const bool down = swap.state == 1;
    const double step = 1 / ((down ? kSwapOut : kSwapIn) * fs);
    for (uint32_t i = 0; i < n; i++) {
      const double g = swap.at >= 1 ? (down ? 0 : 1) : 0.5 - 0.5 * std::cos(3.14159265358979323846 * (down ? 1 - swap.at : swap.at));
      L[i] = (float)(L[i] * g); R[i] = (float)(R[i] * g);
      swap.at = std::min(1.0, swap.at + step);
    }
    if (swap.at < 1) return;
    if (down) { swap.state = 2; swap.at = 0; } // at the bottom: the next block takes the parameters (dirty), then up
    else swap.state = 0;
  }
  // the engine, a guard (a NaN stops the notes rather than the instrument, shared/guard.js), the chain
  void render(float *L, float *R, uint32_t n) {
    if (!engine) { std::memset(L, 0, n * sizeof *L); std::memset(R, 0, n * sizeof *R); return; }
    engine->process(L, R, (int)n);
    if (!guardBlock(L, R, (int)n)) engine->allNotesOff();
    if (swap.state) fadeSwap(L, R, n);
    if (viewsOn.load(std::memory_order_relaxed)) {
      for (uint32_t i = 0; i < n; i++) heard.push(0.5f * (L[i] + R[i]));
      handOn();
    }
    chain.process(L, R, (int)n);
    const double to = levelTarget();
    if (level == to) { if (to != 1) for (uint32_t i = 0; i < n; i++) { L[i] = (float)(L[i] * to); R[i] = (float)(R[i] * to); } return; }
    for (uint32_t i = 0; i < n; i++) {
      level += (to - level) * levelCoef;
      if (std::fabs(to - level) < 1e-6) level = to;
      L[i] = (float)(L[i] * level); R[i] = (float)(R[i] * level);
    }
  }

  // ---- the editor (editor.html) ---------------------------------------------------------------
  // On the audio thread (or in a flush): what the editor did since the last block.
  void takeUi(const clap_output_events_t *out) {
    for (UiEvent e; fromUi.pop(e);) switch (e.type) {
      case UiEvent::param: set(e.i, e.v, out); tell(e.i, out); break;
      case UiEvent::begin: case UiEvent::end: gesture(e.i, e.type == UiEvent::begin, out); break;
      case UiEvent::on: noteOn(0, e.i, e.v, false); break;
      case UiEvent::off: noteOff(0, e.i, -1); break;
      case UiEvent::pedal:
        if (I.space != Space::none) pedal(e.v > 0);
        else if (spaceSwitch()) controller(64, e.v > 0 ? 127 : 0, out);
        break;
      case UiEvent::pressure: pressure(e.v, e.i); break;
      case UiEvent::panic: panic(); break;
      case UiEvent::swap: swapIn(); break;
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
    for (int key = 0; key < 128; key++) if (sounding[key] || latched[key] || sostHeld[key]) k[key >> 6] |= 1ull << (key & 63);
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
  //   describe()          the instrument: name, keys, pedal, parameters (and Preset), presets, and
  //                       page: its page's path for the views ("gongs/index.html"), if it has one
  //   poll()              { p: [[index, x, text, value]…] the values changed since (value: as the
  //                       engine has it, a choice's index, a toggle's 0 or 1), keys: [down…],
  //                       vel: [each one's velocity…], pedal }, and while the views show,
  //                       m: [[type, key, values…]…] the engine's messages since, md: [[i, data]…]
  //                       the data of m[i] (site.h, Views: base64 of float64s), and s: its sound
  //                       since (mono, before the chain: base64 of float32s)
  //   views(on)           the views shown or not; { fs }, the sample rate
  //   set(i, x)           a parameter: x along a slider (0..1), a choice's index, a toggle's 0/1
  //   gesture(i, on)      a slider grabbed or let go (the host records automation between)
  //   note(key, vel)      a key: vel 0..1 as MIDI velocity / 127, 0 to let go
  //   pressure(key, v)  pedal(on)  panic()
  //                       (pedal: Space; with space "switch", CC64's switch, as describe's switch says)
  //   presets()           your own presets (presets.h): { folder, list: [[name, file, index]…] }
  //   loadPreset(file, index)   plays one: every parameter (not Preset); { ok, error }
  //   savePreset(name)    saves the parameters as one: { ok, file, error }
  //   showPresets()       opens their folder
  //   scalas()            the Scala files in the Tunings folder (presets.h): { folder, list: [file…] }
  //   loadScala(file)     one of them sets the custom temperament: { ok, name, error }
  //   showScalas()        opens that folder
  int paramIndex(const char *id) const { for (int i = 0; i < I.paramCount; i++) if (!std::strcmp(I.params[i].id, id)) return i; return -1; }
  ParamInfo infoOf(int i) const {
    return i < I.paramCount ? I.params[i] : i == presetAt ? presetParam() : i == touchAt ? touchParam() : i == qualityAt ? qualityParam() : i == mpeAt ? mpeParam()
         : i == transposeAt ? transposeParam() : i == octaveAt ? octaveParam() : morphParam(i);
  }
  double along(int i, double v) const { const ParamInfo p = infoOf(i); return p.kind == ParamKind::continuous ? toNormalized(p, v) : v; }
  std::string text(int i, double v) const {
    if (i == presetAt) { int k = (int)std::lround(v); return k <= 0 ? "Default settings" : k <= I.presetCount ? I.presets[k - 1].name : "?"; }
    char buf[96];
    formatValue(infoOf(i), v, buf, sizeof buf);
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
      if (i == presetAt) {
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
    if (I.compass >= 0) { // the keys that play until the toggle opens keyLo…keyHi
      Value c = createEmptyArray();
      c.addArrayElement(I.compassLo); c.addArrayElement(I.compassHi); c.addArrayElement(I.compass);
      d.addMember("compass", c);
    }
    const Controller *sw = spaceSwitch();
    d.addMember("space", std::string(I.space == Space::sustain ? "sustain" : I.space == Space::hold ? "hold" : sw ? "switch" : ""));
    if (sw) { // what Space switches: "Leslie", "Slow", "Fast"
      const ParamInfo &p = I.params[sw->param];
      Value s = createEmptyArray();
      s.addArrayElement(std::string(p.label));
      s.addArrayElement(std::string(p.choices[sw->a]));
      s.addArrayElement(std::string(p.choices[sw->b]));
      d.addMember("switch", s);
    }
    d.addMember("presets", presetAt); // the Preset parameter's index
    d.addMember("params", params);
    if (site) d.addMember("page", std::string(I.slug) + "/index.html");
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
      c.addArrayElement(i); c.addArrayElement(along(i, v)); c.addArrayElement(text(i, v)); c.addArrayElement(v);
      changed.addArrayElement(c);
    }
    Value vel = createEmptyArray(); // each key's velocity, in keys' order
    for (int k = 0; k < 128; k++) if (keysDown[k >> 6].load(std::memory_order_relaxed) >> (k & 63) & 1) vel.addArrayElement((double)struck[k].load(std::memory_order_relaxed));
    Value r = createObject("");
    r.addMember("p", changed);
    r.addMember("keys", keysValue());
    r.addMember("vel", vel);
    r.addMember("pedal", pedalDown.load(std::memory_order_relaxed));
    r.addMember("miss", missValue());
    if (viewsOn.load()) {
      Value ms = createEmptyArray(), md = createEmptyArray();
      std::vector<double> data;
      for (Posted x; take(x, data);) {
        const Message &m = x.m;
        Value a = createEmptyArray();
        a.addArrayElement((int)m.type); a.addArrayElement((int)m.key);
        for (int k = 0; k < m.count && k < 30; k++) a.addArrayElement((double)m.values[k]);
        if (x.n) {
          Value d = createEmptyArray();
          d.addArrayElement((int)ms.size());
          d.addArrayElement(choc::base64::encodeToString(data.data(), data.size() * sizeof(double)));
          md.addArrayElement(d);
        }
        ms.addArrayElement(a);
      }
      r.addMember("m", ms);
      if (md.size()) r.addMember("md", md);
      std::vector<float> x;
      for (float y; heard.pop(y);) x.push_back(y);
      r.addMember("s", choc::base64::encodeToString(x.data(), x.size() * sizeof(float)));
    }
    return r;
  }
  // main thread: the next message for the window, with its data
  bool take(Posted &x, std::vector<double> &data) {
    if (!messages.pop(x)) return false;
    postedOut.fetch_add(1, std::memory_order_release);
    data.resize((size_t)x.n);
    for (int i = 0; i < x.n; i++) attached.pop(data[(size_t)i]);
    attachedOut.fetch_add((size_t)x.n, std::memory_order_release);
    return true;
  }
  const Site *page() const override { return site; }
  void closed() override { viewsOn = false; }
  // every instrument parameter at once, as a preset of yours plays (loadPreset; a combination of yours in the Forte app)
  void play(const std::vector<double> &v) {
    toAudio({UiEvent::swap, 0, 0});
    for (int i = 0; i < I.paramCount && i < (int)v.size(); i++) { shown[i] = v[i]; sent[i] = NAN; toAudio({UiEvent::param, (int16_t)i, v[i]}); }
  }
  // the notes struck outside the keys that play, as poll() gives them: [how many so far, the last
  // one, the lowest and highest keys that play, whether the compass's toggle would play it, and
  // the Octave and Transpose that moved it (0 and 0 for the window's own keys)]
  choc::value::Value missValue() const {
    const uint32_t n = misses.load(std::memory_order_acquire);
    const int key = missed.load(std::memory_order_relaxed);
    const bool closed = I.compass >= 0 && shown[I.compass].load() < 0.5, fromMidi = missedMidi.load(std::memory_order_relaxed);
    choc::value::Value a = choc::value::createEmptyArray();
    a.addArrayElement((int64_t)n); a.addArrayElement(key);
    a.addArrayElement(closed ? I.compassLo : I.keyLo); a.addArrayElement(closed ? I.compassHi : I.keyHi);
    a.addArrayElement(closed && key >= I.keyLo && key <= I.keyHi);
    a.addArrayElement(fromMidi ? (int)shown[octaveAt].load() - kOctaves : 0);
    a.addArrayElement(fromMidi ? (int)shown[transposeAt].load() - kSemitones : 0);
    return a;
  }
  // the keys sounding, as poll() gives them
  choc::value::Value keysValue() const {
    choc::value::Value keys = choc::value::createEmptyArray();
    for (int k = 0; k < 128; k++) if (keysDown[k >> 6].load(std::memory_order_relaxed) >> (k & 63) & 1) keys.addArrayElement(k);
    return keys;
  }
  choc::value::Value call(const choc::value::ValueView &args) override {
    using namespace choc::value;
    if (!args.isArray() || args.size() == 0 || !args[0].isString()) return {};
    const std::string m(args[0].getString());
    auto num = [&](uint32_t k) { return args.size() > k && (args[k].isFloat() || args[k].isInt()) ? args[k].get<double>() : 0.0; };
    auto index = [&](uint32_t k) { const int i = (int)num(k); return i >= 0 && i < nParams ? i : -1; };
    if (m == "describe") return describe();
    if (m == "poll") return poll();
    if (m == "views") {
      const bool on = num(1) > 0;
      if (on && !viewsOn.load()) { Posted x; std::vector<double> d; float y; while (take(x, d)) {} while (heard.pop(y)) {} } // nothing stale
      viewsOn = on;
      Value r = createObject("");
      r.addMember("fs", fs);
      return r;
    }
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
    if (m == "gesture") { const int i = index(1); if (i >= 0 && (i < I.paramCount || i == morphAt)) toAudio({num(2) > 0 ? UiEvent::begin : UiEvent::end, (int16_t)i, 0}); return {}; }
    if (m == "note") {
      const int key = (int)num(1);
      const double vel = num(2);
      if (key >= 0 && key < 128) toAudio({vel > 0 ? UiEvent::on : UiEvent::off, (int16_t)key, vel > 1 ? 1 : vel});
      return {};
    }
    if (m == "pressure") { const int key = (int)num(1); if (key >= 0 && key < 128) toAudio({UiEvent::pressure, (int16_t)key, num(2)}); return {}; }
    if (m == "pedal") { toAudio({UiEvent::pedal, 0, num(1)}); return {}; }
    if (m == "panic") { toAudio({UiEvent::panic, 0, 0}); return {}; }
    auto text = [&](uint32_t k) { return args.size() > k && args[k].isString() ? std::string(args[k].getString()) : std::string(); };
    if (m == "presets") {
      Value list = createEmptyArray();
      for (const UserPreset &u : listPresets(I)) {
        Value e = createEmptyArray();
        e.addArrayElement(u.name); e.addArrayElement(u.file); e.addArrayElement(u.index);
        list.addArrayElement(e);
      }
      Value r = createObject("");
      r.addMember("folder", presetsFolder(I));
      r.addMember("list", list);
      return r;
    }
    if (m == "loadPreset") {
      std::vector<double> v;
      std::string error;
      const bool ok = readPreset(I, text(1), (int)num(2), v, error);
      if (ok) play(v);
      Value r = createObject("");
      r.addMember("ok", ok);
      r.addMember("error", error);
      return r;
    }
    if (m == "savePreset") {
      std::vector<double> v(I.paramCount);
      for (int i = 0; i < I.paramCount; i++) v[i] = shown[i].load();
      std::string error;
      const std::string file = writePreset(I, text(1), v.data(), error);
      Value r = createObject("");
      r.addMember("ok", !file.empty());
      r.addMember("file", file);
      r.addMember("error", error);
      return r;
    }
    if (m == "showPresets") return createBool(showFolder(presetsFolder(I)));
    if (m == "scalas") { // the Scala files in the Tunings folder (presets.h)
      Value list = createEmptyArray();
      for (const std::string &f : listScalas()) list.addArrayElement(f);
      Value r = createObject("");
      r.addMember("folder", tuningsFolder());
      r.addMember("list", list);
      return r;
    }
    if (m == "loadScala") { // one of them: the custom temperament becomes its scale (forte/tuning.h)
      double cents[kCustomCents];
      std::string name, error;
      const int temper = paramIndex("temperament");
      bool ok = temper >= 0 && readScalaFile(text(1), cents, name, error);
      if (temper < 0) error = "This instrument has no temperament.";
      if (ok) {
        const ParamInfo &t = I.params[temper];
        int custom = -1;
        for (int k = 0; k < t.choiceCount; k++) if (t.keys && std::string(t.keys[k]) == "custom") custom = k;
        auto put = [&](int i, double v) { shown[i] = v; sent[i] = NAN; toAudio({UiEvent::param, (int16_t)i, v}); };
        if (custom < 0) { ok = false; error = "This instrument has no custom temperament."; }
        else {
          put(temper, custom);
          for (int k = 0; k < kCustomCents; k++) {
            const int i = paramIndex(("cents" + std::to_string(k + 1)).c_str());
            if (i >= 0) put(i, constrain(I.params[i], cents[k]));
          }
        }
      }
      Value r = createObject("");
      r.addMember("ok", ok);
      r.addMember("name", name);
      r.addMember("error", error);
      return r;
    }
    if (m == "showScalas") return createBool(showFolder(tuningsFolder()));
    return {};
  }

  // ---- state: "forte <slug> <version>" then "<id> <value>" per line ----------------------------
  bool save(const clap_ostream_t *s) {
    std::string t = std::string("forte ") + I.slug + " " + I.version + "\n";
    char buf[64];
    for (int i = 0; i < nParams; i++) {
      std::snprintf(buf, sizeof buf, " %.17g\n", shown[i].load());
      t += (i < I.paramCount ? I.params[i].id : infoOf(i).id) + std::string(buf);
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
    if (hasPresets) v[presetAt] = 0;
    v[touchAt] = 1;
    v[qualityAt] = 0;
    v[mpeAt] = mpe::autoDetect;
    v[transposeAt] = kSemitones;
    v[octaveAt] = kOctaves;
    if (hasPresets) { v[fromAt] = 0; v[toAt] = 1; v[morphAt] = 0; }
    size_t at = t.find('\n');
    while (at != std::string::npos && at + 1 < t.size()) {
      size_t eol = t.find('\n', at + 1);
      std::string line = t.substr(at + 1, eol == std::string::npos ? std::string::npos : eol - at - 1);
      size_t sp = line.find(' ');
      if (sp != std::string::npos) {
        std::string id = line.substr(0, sp);
        double x = std::strtod(line.c_str() + sp + 1, nullptr);
        if (id == "preset" && hasPresets) v[presetAt] = constrain(presetParam(), x);
        else if (id == "touch") v[touchAt] = constrain(touchParam(), x);
        else if (id == "quality") v[qualityAt] = constrain(qualityParam(), x);
        else if (id == "mpe") v[mpeAt] = constrain(mpeParam(), x);
        else if (id == "midiTranspose") v[transposeAt] = constrain(transposeParam(), x);
        else if (id == "midiOctave") v[octaveAt] = constrain(octaveParam(), x);
        else if (hasPresets && (id == "morphFrom" || id == "morphTo" || id == "morph")) { const int i = id == "morph" ? morphAt : id == "morphTo" ? toAt : fromAt; v[i] = constrain(infoOf(i), x); }
        else for (int i = 0; i < I.paramCount; i++) if (id == I.params[i].id) { v[i] = constrain(I.params[i], x); break; }
      }
      at = eol;
    }
    if (!processing.load()) {
      for (int i = 0; i < nParams; i++) { P[i] = v[i]; shown[i] = v[i]; }
      dirty = true;
      mpeMode();
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
  ParamInfo touchParam() const {
    return ParamInfo{"touch", "Velocity curve", "MIDI", ParamKind::choice, 0, 2, 1, 1, false, false, kTouchChoices, 3, {}};
  }
  ParamInfo mpeParam() const {
    return ParamInfo{"mpe", "MPE", "MIDI", ParamKind::choice, 0, mpe::kModes - 1, mpe::autoDetect, 1, false, false, mpe::kModeNames, mpe::kModes, {}};
  }
  ParamInfo transposeParam() const {
    return ParamInfo{"midiTranspose", "Transpose", "MIDI", ParamKind::choice, 0, 2 * kSemitones, kSemitones, 1, false, false, kTransposeChoices, 2 * kSemitones + 1, {}};
  }
  ParamInfo octaveParam() const {
    return ParamInfo{"midiOctave", "Octave", "MIDI", ParamKind::choice, 0, 2 * kOctaves, kOctaves, 1, false, false, kOctaveChoices, 2 * kOctaves + 1, {}};
  }
  ParamInfo qualityParam() const {
    return ParamInfo{"quality", "Quality", "CPU", ParamKind::choice, 0, 2, 0, 1, false, false, kQualityChoices, 3, {}};
  }
  // what the engine plays: the Quality parameter, or High when the host renders offline
  Quality quality() const { return offline ? Quality::high : (Quality)(int)P[qualityAt]; }
  ParamInfo presetParam() const {
    return ParamInfo{"preset", "Preset", "", ParamKind::choice, 0, (double)I.presetCount, 0, 1, false, false, nullptr, I.presetCount + 1, {}};
  }
  ParamInfo morphParam(int i) const {
    if (i == morphAt) return ParamInfo{"morph", "Morph", "Morph", ParamKind::continuous, 0, 1, 0, 0, false, false, nullptr, 0, kMorphFormat, 1};
    const bool from = i == fromAt;
    return ParamInfo{from ? "morphFrom" : "morphTo", from ? "Morph from" : "Morph to", "Morph", ParamKind::choice, 0, (double)I.presetCount, from ? 0.0 : 1.0, 1, false, false,
                     presetNames.data(), (int)presetNames.size(), nullptr, 0};
  }
};

Plugin *self(const clap_plugin_t *p) { return static_cast<Plugin *>(instance(p)); }

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
  info->supported_dialects = CLAP_NOTE_DIALECT_CLAP | CLAP_NOTE_DIALECT_MIDI | CLAP_NOTE_DIALECT_MIDI_MPE;
  info->preferred_dialect = CLAP_NOTE_DIALECT_CLAP;
  std::snprintf(info->name, sizeof info->name, "%s", "Notes");
  return true;
}
const clap_plugin_note_ports_t notePorts{notePortsCount, notePortsGet};

ParamInfo infoAt(const Plugin *s, int i) { return s->infoOf(i); }

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
  if (i == s->presetAt) {
    int k = (int)std::lround(v);
    std::snprintf(out, size, "%s", k <= 0 ? "Default settings" : k <= s->I.presetCount ? s->I.presets[k - 1].name : "?");
    return true;
  }
  formatValue(infoAt(s, i), v, out, size);
  return true;
}
bool paramsTextToValue(const clap_plugin_t *p, clap_id id, const char *text, double *v) {
  Plugin *s = self(p);
  int i = s->indexOf(id);
  if (i < 0) return false;
  if (i == s->presetAt) {
    if (!std::strcmp(text, "Default settings")) { *v = 0; return true; }
    for (int k = 0; k < s->I.presetCount; k++) if (!std::strcmp(text, s->I.presets[k].name)) { *v = k + 1; return true; }
    return false;
  }
  return parseValue(infoAt(s, i), text, *v);
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

// Offline rendering (a bounce, a freeze) plays at High whatever Quality says: time is no object there.
bool renderHardRealtime(const clap_plugin_t *) { return false; }
bool renderSet(const clap_plugin_t *p, clap_plugin_render_mode mode) {
  Plugin *s = self(p);
  s->offline = mode == CLAP_RENDER_OFFLINE;
  s->dirty = true;
  return true;
}
const clap_plugin_render_t render{renderHardRealtime, renderSet};

// AU hosts order parameters by id unless told otherwise: keep the descriptor's order
bool auParamOrder(const clap_plugin_t *, size_t *order, size_t count) {
  for (size_t i = 0; i < count; i++) order[i] = i;
  return true;
}
const clap_plugin_auv2_param_ordering_t auOrdering{auParamOrder};

// VST3: every MIDI channel (MPE's members), and the note expressions a note can have of its own:
// its tuning (a bend), brightness (its slide) and pressure
uint32_t vst3MidiChannels(const clap_plugin_t *, uint32_t) { return 16; }
uint32_t vst3NoteExpressions(const clap_plugin_t *) {
  return AS_VST3_NOTE_EXPRESSION_TUNING | AS_VST3_NOTE_EXPRESSION_BRIGHTNESS | AS_VST3_NOTE_EXPRESSION_PRESSURE;
}
const clap_plugin_as_vst3_t asVst3{vst3MidiChannels, vst3NoteExpressions};

// ---- the window (editor.h): sizes in points, times the host's scale where it works in pixels ----

#ifdef FORTE_EDITOR
bool guiIsApiSupported(const clap_plugin_t *, const char *api, bool floating) { return !floating && !std::strcmp(api, Editor::api()); }
bool guiGetPreferredApi(const clap_plugin_t *, const char **api, bool *floating) { *api = Editor::api(); *floating = false; return true; }
bool guiCreate(const clap_plugin_t *p, const char *api, bool floating) {
  Instance *s = instance(p);
  if (floating || std::strcmp(api, Editor::api()) || s->editor) return false;
  s->editor = Editor::create([s](const choc::value::ValueView &args) { return s->call(args); }, [s] { return s->page(); });
  if (!s->editor) return false;
  if (s->hostTimer && s->timer == CLAP_INVALID_ID) s->hostTimer->register_timer(s->host, 16, &s->timer);
  return true;
}
void guiDestroy(const clap_plugin_t *p) {
  Instance *s = instance(p);
  if (s->hostTimer && s->timer != CLAP_INVALID_ID) s->hostTimer->unregister_timer(s->host, s->timer);
  s->timer = CLAP_INVALID_ID;
  s->editor.reset();
  s->closed();
}
bool guiSetScale(const clap_plugin_t *p, double scale) {
#ifdef __APPLE__
  (void)p; (void)scale;
  return false; // macOS works in points
#else
  instance(p)->scale = scale > 0 ? scale : 1;
  return true;
#endif
}
uint32_t px(const Instance *s, uint32_t points) { return (uint32_t)std::lround(points * s->scale); }
bool guiGetSize(const clap_plugin_t *p, uint32_t *w, uint32_t *h) { Instance *s = instance(p); *w = px(s, s->width); *h = px(s, s->height); return true; }
bool guiCanResize(const clap_plugin_t *) { return true; }
bool guiGetResizeHints(const clap_plugin_t *, clap_gui_resize_hints_t *hints) {
  hints->can_resize_horizontally = hints->can_resize_vertically = true;
  hints->preserve_aspect_ratio = false;
  hints->aspect_ratio_width = hints->aspect_ratio_height = 0;
  return true;
}
bool guiAdjustSize(const clap_plugin_t *p, uint32_t *w, uint32_t *h) {
  Instance *s = instance(p);
  if (*w < px(s, kEditorMinWidth)) *w = px(s, kEditorMinWidth);
  if (*h < px(s, kEditorMinHeight)) *h = px(s, kEditorMinHeight);
  return true;
}
bool guiSetSize(const clap_plugin_t *p, uint32_t w, uint32_t h) {
  Instance *s = instance(p);
  guiAdjustSize(p, &w, &h);
  s->width = (uint32_t)std::lround(w / s->scale); s->height = (uint32_t)std::lround(h / s->scale);
  if (s->editor) s->editor->setSize(w, h);
  return true;
}
bool guiSetParent(const clap_plugin_t *p, const clap_window_t *window) {
  Instance *s = instance(p);
  if (!s->editor) return false;
  s->editor->setSize(px(s, s->width), px(s, s->height));
  return s->editor->setParent(window);
}
bool guiSetTransient(const clap_plugin_t *, const clap_window_t *) { return false; }
void guiSuggestTitle(const clap_plugin_t *, const char *) {}
bool guiShow(const clap_plugin_t *p) { Instance *s = instance(p); if (s->editor) s->editor->show(true); return s->editor != nullptr; }
bool guiHide(const clap_plugin_t *p) { Instance *s = instance(p); if (s->editor) s->editor->show(false); return s->editor != nullptr; }
const clap_plugin_gui_t gui{guiIsApiSupported, guiGetPreferredApi, guiCreate, guiDestroy, guiSetScale, guiGetSize, guiCanResize,
                            guiGetResizeHints, guiAdjustSize, guiSetSize, guiSetParent, guiSetTransient, guiSuggestTitle, guiShow, guiHide};

void onTimer(const clap_plugin_t *p, clap_id) { Instance *s = instance(p); if (s->editor) s->editor->idle(); }
const clap_plugin_timer_support_t timerSupport{onTimer};
#endif

// the editor's calls without a window (plugin.h, tests/plugin-tests.cpp)
std::string bridgeCall(const clap_plugin_t *p, const char *json) {
  try { return choc::json::toString(instance(p)->call(choc::json::parse(json))); } catch (...) { return "error"; }
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
  delete instance(p);
}
bool pluginActivate(const clap_plugin_t *p, double fs, uint32_t, uint32_t) {
  Plugin *s = self(p);
  s->fs = fs;
  // a new engine at the host's rate (any, 44.1–192 kHz), and the chain's impulse responses for it
  s->engine.reset(s->I.create(fs));
  s->engine->setQuality(s->quality());
  s->chain.configure(s->I.chain, fs, s->P.data());
  s->levelCoef = 1 - std::exp(-1 / (0.01 * fs)); // the pedals' gain follows in 10 ms
  s->level = s->levelTarget();
  s->swap = {};
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
  if (!std::strcmp(id, CLAP_EXT_RENDER)) return &render;
  if (!std::strcmp(id, CLAP_PLUGIN_AUV2_PARAM_ORDERING)) return &auOrdering;
  if (!std::strcmp(id, CLAP_PLUGIN_AS_VST3)) return &asVst3;
#ifdef FORTE_EDITOR
  if (!std::strcmp(id, CLAP_EXT_GUI)) return &gui;
  if (!std::strcmp(id, CLAP_EXT_TIMER_SUPPORT)) return &timerSupport;
#endif
  if (!std::strcmp(id, kEditorBridge)) return &editorBridge;
  return nullptr;
}
void pluginOnMainThread(const clap_plugin_t *) {}

// ---- the Forte app: every instrument in one plugin, up to four at a time -------------------------
//
// A Suite plays one instrument's Plugin, or up to four at once, as the site's Combinations page
// does (combine/): each part plays the keys from lo to hi (parts on the same keys are layered,
// parts on keys apart split the keyboard), moved by its octave, at its level, and only while it is
// on. It passes the host's calls on: the host sees the first's parameters, and the window shows
// one part's controls at a time, its focus, with a card for each part under the header
// (describe's "instruments" and "parts"; choose, add, drop, focus, zone and lead). A new
// instrument is made and activated on the main thread, which then publishes the parts and their
// keys as a Rig; the audio thread takes the latest Rig at the start of its next block, and the
// main thread deletes what it let go of once it has.

struct Suite : Instance {
  static constexpr int kParts = 4;   // as the Combinations page's MAX_PARTS
  static constexpr int kOctaves = 2; // a part's octave: −2…+2 (its OCTAVES)
  static constexpr double kLevelLo = -30, kLevelHi = 6; // a part's level, dB (its LEVEL)
  // the keys a part plays (MIDI's numbers, as they are pressed), where they sound, how loud, and
  // whether it plays at all; a part alone plays every key as pressed
  struct Zone {
    int lo = 0, hi = 127, oct = 0;
    double level = 0;
    bool on = true;
  };
  struct Rig { Plugin *part[kParts]; Zone zone[kParts]; float gain[kParts]; int n; uint64_t gen; };

  const SuiteEntry *list;
  const int count;
  std::vector<int> order;                 // the instruments by name, as the menus list them
  std::unique_ptr<Plugin> part[kParts];   // the parts in order, the first always there (main thread)
  Zone zone[kParts];                      // each one's keys
  int focus = 0;                          // the part whose controls the window shows
  std::string combination;                // the combination of yours playing, by name, until something changes (main thread)
  std::atomic<int> focused{0};            // the same, for the audio thread: a program change plays its preset
  // the hand-off: every change publishes a Rig and the audio thread takes the latest (audio());
  // a part let go of is deleted on the main thread once the audio thread has taken a Rig without it
  std::vector<std::unique_ptr<Rig>> rigs;
  std::vector<std::pair<uint64_t, std::unique_ptr<Plugin>>> retired; // a part, and the first Rig without it
  std::atomic<Rig *> next{nullptr};
  std::atomic<uint64_t> taken{0};         // the Rig the audio thread plays
  uint64_t gen = 0;
  Rig *live = nullptr;                    // the audio thread's
  bool active = false;
  double fs = 48000;
  uint32_t minFrames = 1, maxFrames = 4096;
  std::atomic<bool> processing{false};
  // the audio thread's: which parts each held note went to (bit k: part k), the events each part
  // gets, a part's sound before it joins the first's, and a limiter on them all together
  uint8_t routed[16][128]{};
  std::vector<const clap_event_header_t *> events[kParts];
  std::vector<float> spareL, spareR;
  Limiter sum;
  int8_t uiKey[kParts][128];              // the window's keys: where each held one plays in each part (−1: not there; main thread)

  Suite(const clap_host_t *h, const clap_plugin_descriptor_t *desc, const SuiteEntry *entries, int n) : Instance(h, desc), list(entries), count(n) {
    for (int k = 0; k < count; k++) order.push_back(k);
    std::sort(order.begin(), order.end(), [&](int a, int b) { return std::strcmp(list[a].info().name, list[b].info().name) < 0; });
    for (auto &e : events) e.reserve(2048);
    std::memset(uiKey, -1, sizeof uiKey);
  }
  int find(const std::string &slug) const {
    for (int k = 0; k < count; k++) if (slug == list[k].info().slug) return k;
    return -1;
  }
  int parts() const { int k = 0; while (k < kParts && part[k]) k++; return k; }
  // the parts key `key` strikes (bit j: part j)
  static uint8_t strikes(const Zone *z, int n, int key) {
    uint8_t m = 0;
    for (int j = 0; j < n; j++) if (z[j].on && key >= z[j].lo && key <= z[j].hi) m |= (uint8_t)(1 << j);
    return m;
  }
  static Zone whole(Zone z) {
    z.lo = std::clamp(z.lo, 0, 127); z.hi = std::clamp(z.hi, 0, 127);
    if (z.lo > z.hi) std::swap(z.lo, z.hi);
    z.oct = std::clamp(z.oct, -kOctaves, kOctaves);
    z.level = std::isfinite(z.level) ? std::clamp(z.level, kLevelLo, kLevelHi) : 0;
    return z;
  }

  // ---- the parts (main thread) ----------------------------------------------------------------------
  // instrument k, ready to play: Quality is the computer's and MPE, Transpose and Octave the
  // controller's (MPE's mode and the zones it announced), so it takes them from the first
  std::unique_ptr<Plugin> make(int k) {
    std::unique_ptr<Plugin> p(new Plugin(host, list[k].info(), clap.desc, list[k].accent, list[k].site, list[k].views));
    if (const Plugin *c = part[0].get()) {
      p->P[p->qualityAt] = c->shown[c->qualityAt].load(); p->shown[p->qualityAt] = p->P[p->qualityAt]; p->offline = c->offline;
      p->P[p->mpeAt] = c->shown[c->mpeAt].load(); p->shown[p->mpeAt] = p->P[p->mpeAt];
      p->mpeMode(); p->mpe.adoptZones(c->mpe);
      p->P[p->transposeAt] = c->shown[c->transposeAt].load(); p->shown[p->transposeAt] = p->P[p->transposeAt]; // and how far it moves the keys
      p->P[p->octaveAt] = c->shown[c->octaveAt].load(); p->shown[p->octaveAt] = p->P[p->octaveAt];
    }
    p->hostParams = (const clap_host_params_t *)host->get_extension(host, CLAP_EXT_PARAMS);
    if (active) { pluginActivate(&p->clap, fs, minFrames, maxFrames); p->processing = processing.load(); }
    return p;
  }
  void retire(std::unique_ptr<Plugin> p) { if (p) retired.emplace_back(gen + 1, std::move(p)); } // before publish()
  void publish() {
    const int n = parts();
    if (n < 2) zone[0] = Zone{}; // alone, every key as pressed
    auto r = std::make_unique<Rig>();
    for (int j = 0; j < kParts; j++) {
      r->part[j] = part[j].get();
      r->zone[j] = zone[j];
      r->gain[j] = (float)std::pow(10.0, zone[j].level / 20);
      if (part[j]) part[j]->partShift.store(12 * zone[j].oct, std::memory_order_relaxed);
    }
    r->n = n;
    r->gen = ++gen;
    if (!active) { next.store(nullptr); live = r.get(); taken.store(gen); }
    else next.store(r.get(), std::memory_order_release);
    rigs.push_back(std::move(r));
    collect();
  }
  // what the audio thread has let go of
  void collect() {
    const uint64_t t = taken.load(std::memory_order_acquire);
    std::erase_if(retired, [&](const auto &e) { return e.first <= t; });
    std::erase_if(rigs, [&](const auto &r) { return r->gen < t; });
  }
  void idle() override { collect(); }
  // the host must reread the first's parameters: every one is another
  void rescanHost() {
    if (auto hp = (const clap_host_params_t *)host->get_extension(host, CLAP_EXT_PARAMS))
      hp->rescan(host, active ? CLAP_PARAM_RESCAN_VALUES | CLAP_PARAM_RESCAN_TEXT | CLAP_PARAM_RESCAN_INFO : CLAP_PARAM_RESCAN_ALL);
  }
  // the part the window shows becomes instrument k, on the same keys
  bool choose(int k) {
    collect();
    if (k < 0 || k >= count) return false;
    if (part[focus] && &part[focus]->I == &list[k].info()) return true;
    std::unique_ptr<Plugin> p = make(k);
    retire(std::move(part[focus]));
    part[focus] = std::move(p);
    publish();
    if (focus == 0) rescanHost();
    return true;
  }
  // one more part, instrument k, on every key (layered with the rest); the window then shows it
  bool add(int k) {
    collect();
    const int n = parts();
    if (k < 0 || k >= count || n >= kParts) return false;
    part[n] = make(k);
    zone[n] = Zone{};
    std::memset(uiKey[n], -1, sizeof uiKey[n]);
    focus = n; focused = n;
    publish();
    return true;
  }
  // part k goes, and the rest play on (one left alone: on every key, as pressed)
  bool drop(int k) {
    collect();
    const int n = parts();
    if (n < 2 || k < 0 || k >= n) return false;
    retire(std::move(part[k]));
    for (int j = k; j + 1 < n; j++) {
      part[j] = std::move(part[j + 1]);
      zone[j] = zone[j + 1];
      std::memcpy(uiKey[j], uiKey[j + 1], sizeof uiKey[j]);
    }
    zone[n - 1] = Zone{};
    std::memset(uiKey[n - 1], -1, sizeof uiKey[n - 1]);
    focus = focus == k ? 0 : focus > k ? focus - 1 : focus; focused = focus;
    publish();
    if (k == 0) rescanHost();
    return true;
  }
  // part k becomes the first, whose parameters the host sees and automates; the rest keep their order
  bool lead(int k) {
    collect();
    const int n = parts();
    if (k < 0 || k >= n) return false;
    if (k == 0) return true;
    std::rotate(part, part + k, part + k + 1);
    std::rotate(zone, zone + k, zone + k + 1);
    int8_t row[128];
    std::memcpy(row, uiKey[k], sizeof row);
    for (int j = k; j > 0; j--) std::memcpy(uiKey[j], uiKey[j - 1], sizeof row);
    std::memcpy(uiKey[0], row, sizeof row);
    focus = focus == k ? 0 : focus < k ? focus + 1 : focus; focused = focus;
    publish();
    rescanHost();
    return true;
  }
  // part k's keys, octave, level and on/off (with two parts or more)
  bool setZone(int k, const Zone &z) {
    if (k < 0 || k >= parts() || parts() < 2) return false;
    zone[k] = whole(z);
    publish();
    return true;
  }
  // ---- your combinations (presets.h): files in the site's format, in the Combinations folder ------------
  // a combination's keys as a Zone: the site's A0 and C8 are every key below and above
  static Zone zoneOf(const CombinationPart &c) {
    Zone z;
    z.lo = c.lo <= 21 ? 0 : c.lo; z.hi = c.hi >= 108 ? 127 : c.hi; z.oct = c.oct; z.level = c.level; z.on = c.on;
    return whole(z);
  }
  static const InstrumentInfo *instrumentOf(const std::string &slug, const void *ctx) {
    const Suite *s = (const Suite *)ctx;
    const int k = s->find(slug);
    return k < 0 ? nullptr : &s->list[k].info();
  }
  // the parts become the combination's, each with its keys and settings; the window shows the first
  bool playCombination(const std::vector<CombinationPart> &c) {
    if (c.empty()) return false;
    collect();
    alone();
    choose(find(c[0].I->slug));
    part[0]->play(c[0].values);
    zone[0] = zoneOf(c[0]);
    for (size_t j = 1; j < c.size() && j < (size_t)kParts; j++) {
      part[j] = make(find(c[j].I->slug));
      zone[j] = zoneOf(c[j]);
      part[j]->play(c[j].values);
    }
    publish();
    rescanHost();
    return true;
  }
  // the parts as a combination: each one's keys, and its parameters as the window shows them
  std::vector<CombinationPart> parted() const {
    std::vector<CombinationPart> out;
    for (int j = 0; j < kParts && part[j]; j++) {
      const Plugin &p = *part[j];
      CombinationPart c;
      c.I = &p.I; c.lo = zone[j].lo; c.hi = zone[j].hi; c.oct = zone[j].oct; c.level = zone[j].level; c.on = zone[j].on;
      for (int i = 0; i < p.I.paramCount; i++) c.values.push_back(p.shown[i].load());
      out.push_back(std::move(c));
    }
    return out;
  }

  // back to one part, the first, on every key (main thread; publish() after)
  void alone() {
    for (int j = 1; j < kParts; j++) retire(std::move(part[j]));
    for (Zone &z : zone) z = Zone{};
    std::memset(uiKey, -1, sizeof uiKey);
    focus = 0; focused = 0;
  }

  // ---- audio --------------------------------------------------------------------------------------
  // the audio thread (or the main thread while not processing): the parts to play, the latest Rig;
  // a held note stays with the instrument it went to, wherever that is now
  Rig *audio() {
    if (Rig *n = next.exchange(nullptr, std::memory_order_acq_rel)) {
      if (Rig *was = live)
        for (auto &row : routed) for (uint8_t &m : row) {
          if (!m) continue;
          uint8_t to = 0;
          for (int b = 0; b < kParts; b++) if (m >> b & 1 && was->part[b]) for (int j = 0; j < kParts; j++) if (n->part[j] == was->part[b]) to |= (uint8_t)(1 << j);
          m = to;
        }
      live = n;
      for (Plugin *p : n->part) if (p) p->processing = processing.load();
      if (n->n < 2) sum.reset();
      taken.store(n->gen, std::memory_order_release);
      host->request_callback(host); // to delete what it let go of (collect)
    }
    return live;
  }
  const Site *page() const override { return part[focus] ? part[focus]->site : nullptr; } // the window shows the focused part
  void closed() override { for (auto &p : part) if (p) p->closed(); }
  // which parts an event goes to: a note to the parts its key strikes (its end where it began), a
  // program change to the part the window shows, the host's parameters to the first, the rest to all
  uint8_t partsOf(const Rig *r, const clap_event_header_t *h) {
    const uint8_t all = (uint8_t)((1 << r->n) - 1);
    if (h->space_id != CLAP_CORE_EVENT_SPACE_ID) return 0;
    int ch = 0, key = -1, on = -1;
    switch (h->type) {
      case CLAP_EVENT_NOTE_ON: case CLAP_EVENT_NOTE_OFF: case CLAP_EVENT_NOTE_CHOKE: {
        auto e = (const clap_event_note_t *)h;
        ch = e->channel < 0 ? 0 : e->channel & 15; key = e->key; on = h->type == CLAP_EVENT_NOTE_ON;
        break;
      }
      case CLAP_EVENT_MIDI: {
        const uint8_t *d = ((const clap_event_midi_t *)h)->data;
        const int cmd = d[0] & 0xf0;
        ch = d[0] & 0x0f;
        if (cmd == 0x90 || cmd == 0x80) { key = d[1]; on = cmd == 0x90 && d[2] > 0; }
        else if (cmd == 0xc0) { const int f = focused.load(std::memory_order_relaxed); return (uint8_t)(1 << (f < r->n ? f : 0)); }
        break;
      }
      case CLAP_EVENT_PARAM_VALUE: case CLAP_EVENT_PARAM_MOD: case CLAP_EVENT_PARAM_GESTURE_BEGIN: case CLAP_EVENT_PARAM_GESTURE_END: return 1;
      default: break;
    }
    if (on < 0 || key < 0 || key > 127) return all;
    if (on) return routed[ch][key] = strikes(r->zone, r->n, key);
    const uint8_t m = routed[ch][key] ? routed[ch][key] : all;
    routed[ch][key] = 0;
    return m;
  }
  clap_process_status process(const clap_process_t *proc) {
    Rig *r = audio();
    if (r->n < 2) return r->part[0]->process(proc);
    for (auto &e : events) e.clear();
    const clap_input_events_t *in = proc->in_events;
    for (uint32_t k = 0, n = in ? in->size(in) : 0; k < n; k++) {
      const clap_event_header_t *h = in->get(in, k);
      const uint8_t to = partsOf(r, h);
      for (int j = 0; j < r->n; j++) if (to >> j & 1 && events[j].size() < events[j].capacity()) events[j].push_back(h);
    }
    auto size = [](const clap_input_events_t *l) { return (uint32_t)((const std::vector<const clap_event_header_t *> *)l->ctx)->size(); };
    auto get = [](const clap_input_events_t *l, uint32_t i) { return (*(const std::vector<const clap_event_header_t *> *)l->ctx)[i]; };
    clap_input_events_t ins[kParts];
    for (int j = 0; j < kParts; j++) ins[j] = {&events[j], size, get};
    const uint32_t n = proc->frames_count;
    if (n > spareL.size()) { spareL.resize(n); spareR.resize(n); } // only for a host that sends more than it said
    clap_process_t pa = *proc;
    pa.in_events = &ins[0];
    r->part[0]->process(&pa);
    const bool out = proc->audio_outputs_count > 0 && proc->audio_outputs[0].data32;
    float *L = out ? proc->audio_outputs[0].data32[0] : nullptr, *R = out && proc->audio_outputs[0].channel_count > 1 ? proc->audio_outputs[0].data32[1] : nullptr;
    if (L && r->gain[0] != 1) for (uint32_t i = 0; i < n; i++) { L[i] *= r->gain[0]; if (R) R[i] *= r->gain[0]; }
    float *ch[2] = {spareL.data(), spareR.data()};
    clap_audio_buffer_t buf{ch, nullptr, 2, 0, 0};
    for (int j = 1; j < r->n; j++) {
      clap_process_t pb = *proc;
      pb.in_events = &ins[j]; pb.out_events = nullptr; // the host knows only the first's parameters
      pb.audio_outputs = &buf; pb.audio_outputs_count = 1;
      r->part[j]->process(&pb);
      const float g = r->gain[j];
      if (R) for (uint32_t i = 0; i < n; i++) { L[i] += g * spareL[i]; R[i] += g * spareR[i]; }
      else if (L) for (uint32_t i = 0; i < n; i++) L[i] += 0.5f * g * (spareL[i] + spareR[i]);
    }
    if (L) {
      if (!R) std::copy(L, L + n, spareR.begin());
      sum.process(L, R ? R : spareR.data(), (int)n);
    }
    return CLAP_PROCESS_CONTINUE;
  }

  // ---- the window: the menus, the parts' cards, and the part it shows -------------------------------
  //   choose(slug)                         the instrument of the part the window shows
  //   add(slug)                            one more part (up to four), on every key; the window then shows it
  //   drop(k)                              part k goes, the rest play on
  //   focus(k)                             the part whose controls, presets and views the window shows
  //   zone(k, lo, hi, octave, level, on)   part k's keys (MIDI's numbers), octave (±2), level (dB) and on/off
  //   lead(k)                              part k becomes the first: the host sees and automates its controls
  //   combinations()                       your combinations: { folder, list: [[name, file, index]…] }
  //   loadCombination(file, index)         one of them in place of the parts: { ok, error, skipped }
  //   saveCombination(name)                the parts as one of yours: { ok, file, error }
  //   showCombinations()                   their folder, in the Finder, Explorer or the file manager
  // The window starts again after each but zone, and after loadCombination. describe() also adds
  // "combination", the name of yours playing until something changes since ("" none). describe() adds "instruments" (every one, {slug,
  // name} by name), "parts" ({slug, name, accent, keyLo, keyHi, lo, hi, oct, level, on} each),
  // "focus" and "most" (four); with two parts or more, poll() adds "parts", the keys each part
  // sounds, where they are pressed. The window's keys go to the parts their key strikes, moved by
  // each part's octave; the pedal and Panic reach every part.
  choc::value::Value call(const choc::value::ValueView &args) override {
    using namespace choc::value;
    collect();
    if (!args.isArray() || args.size() == 0 || !args[0].isString()) return {};
    const std::string m(args[0].getString());
    auto text = [&](uint32_t k) { return args.size() > k && args[k].isString() ? std::string(args[k].getString()) : std::string(); };
    auto num = [&](uint32_t k) { return args.size() > k && (args[k].isFloat() || args[k].isInt()) ? args[k].get<double>() : 0.0; };
    auto flag = [&](uint32_t k) { return args.size() > k && args[k].isBool() ? args[k].getBool() : num(k) > 0; };
    const int n = parts();
    if (m == "combinations") {
      Value list = createEmptyArray();
      for (const UserCombination &u : listCombinations()) {
        Value e = createEmptyArray();
        e.addArrayElement(u.name); e.addArrayElement(u.file); e.addArrayElement(u.index);
        list.addArrayElement(e);
      }
      Value r = createObject("");
      r.addMember("folder", combinationsFolder());
      r.addMember("list", list);
      return r;
    }
    if (m == "loadCombination") {
      std::vector<CombinationPart> c;
      std::string name, skipped, error;
      const bool ok = readCombination(text(1), (int)num(2), instrumentOf, this, name, c, skipped, error) && playCombination(c);
      if (ok) combination = name;
      Value r = createObject("");
      r.addMember("ok", ok);
      r.addMember("name", name);
      r.addMember("skipped", skipped);
      r.addMember("error", error);
      return r;
    }
    if (m == "saveCombination") {
      std::string error;
      const std::string name = text(1);
      const std::string file = writeCombination(name, parted(), clap.desc && clap.desc->version ? clap.desc->version : "", error);
      if (!file.empty()) combination = name;
      Value r = createObject("");
      r.addMember("ok", !file.empty());
      r.addMember("file", file);
      r.addMember("error", error);
      return r;
    }
    if (m == "showCombinations") return createBool(showFolder(combinationsFolder()));
    // anything but the window's looking, the keys and the controller's settings changes the combination
    if (m == "choose" || m == "add" || m == "drop" || m == "lead" || m == "zone" || m == "loadPreset" || m == "loadScala") combination.clear();
    if (m == "set") { const Plugin *f = part[focus].get(); const int i = (int)num(1); if (i != f->qualityAt && i != f->mpeAt && i != f->transposeAt && i != f->octaveAt && i != f->touchAt) combination.clear(); }
    if (m == "choose") return createBool(choose(find(text(1))));
    if (m == "add") return createBool(add(find(text(1))));
    if (m == "drop") return createBool(drop((int)num(1)));
    if (m == "lead") return createBool(lead((int)num(1)));
    if (m == "focus") { const int k = (int)num(1); if (k < 0 || k >= n) return createBool(false); focus = k; focused = k; return createBool(true); }
    if (m == "zone") {
      if (args.size() < 7) return createBool(false);
      Zone z;
      z.lo = (int)std::lround(num(2)); z.hi = (int)std::lround(num(3)); z.oct = (int)std::lround(num(4)); z.level = num(5); z.on = flag(6);
      return createBool(setZone((int)num(1), z));
    }
    if (m == "note" || m == "pressure") {
      const int key = (int)num(1);
      if (key < 0 || key > 127) return {};
      const bool on = m == "note" && num(2) > 0;
      for (int j = 0; j < n; j++) {
        int k = uiKey[j][key];
        if (on) {
          if (k >= 0) { Value o = createEmptyArray(); o.addArrayElement(std::string("note")); o.addArrayElement(k); o.addArrayElement(0.0); part[j]->call(o); }
          const Zone &z = zone[j];
          k = strikes(&z, 1, key) ? key + 12 * z.oct : -1;
          if (k > 127) k = -1;
          uiKey[j][key] = (int8_t)k;
        } else if (m == "note") uiKey[j][key] = -1;
        if (k < 0) continue;
        Value a = createEmptyArray();
        a.addArrayElement(m); a.addArrayElement(k); a.addArrayElement(num(2));
        part[j]->call(a);
      }
      return {};
    }
    if (m == "pedal" || m == "panic") {
      if (m == "panic") std::memset(uiKey, -1, sizeof uiKey);
      for (auto &p : part) if (p) p->call(args);
      return {};
    }
    Plugin *f = part[focus].get();
    if (m == "views") for (int j = 0; j < n; j++) if (j != focus) part[j]->closed(); // the views are the focused part's
    Value r = f->call(args);
    if (m == "set") { // Quality, and MPE, Transpose and Octave, belong to the computer and the controller: every part's
      const int i = (int)num(1);
      for (int j = 0; j < n; j++) {
        Plugin *o = part[j].get();
        if (o == f) continue;
        const int at = i == f->qualityAt ? o->qualityAt : i == f->mpeAt ? o->mpeAt : i == f->transposeAt ? o->transposeAt : i == f->octaveAt ? o->octaveAt : -1;
        if (at >= 0) { Value s = createEmptyArray(); s.addArrayElement(std::string("set")); s.addArrayElement(at); s.addArrayElement(num(2)); o->call(s); }
      }
    }
    if (m == "poll" && n > 1 && r.isObject()) {
      Value all = createEmptyArray(), misses = createEmptyArray(); // and each part's notes it doesn't play
      for (int j = 0; j < n; j++) {
        Value keys = createEmptyArray();
        const Value sounding = part[j]->keysValue();
        for (uint32_t i = 0; i < sounding.size(); i++) {
          const int k = sounding[i].get<int>() - 12 * zone[j].oct;
          if (k >= 0 && k <= 127) keys.addArrayElement(k);
        }
        all.addArrayElement(keys);
        misses.addArrayElement(part[j]->missValue());
      }
      r.addMember("parts", all);
      r.addMember("misses", misses);
    }
    if (m == "describe") {
      Value all = createEmptyArray();
      for (int k : order) {
        Value e = createObject("");
        e.addMember("slug", std::string(list[k].info().slug));
        e.addMember("name", std::string(list[k].info().name));
        all.addArrayElement(e);
      }
      r.addMember("instruments", all);
      Value ps = createEmptyArray();
      for (int j = 0; j < n; j++) {
        const Plugin &p = *part[j];
        Value e = createObject("");
        e.addMember("slug", std::string(p.I.slug));
        e.addMember("name", std::string(p.I.name));
        e.addMember("accent", p.accent);
        e.addMember("keyLo", p.I.keyLo);
        e.addMember("keyHi", p.I.keyHi);
        e.addMember("lo", zone[j].lo);
        e.addMember("hi", zone[j].hi);
        e.addMember("oct", zone[j].oct);
        e.addMember("level", zone[j].level);
        e.addMember("on", zone[j].on);
        ps.addArrayElement(e);
      }
      r.addMember("parts", ps);
      r.addMember("focus", focus);
      r.addMember("most", kParts);
      r.addMember("combination", combination);
    }
    return r;
  }

  // ---- state: "forte-suite <slug>" then the first's own; with more parts, "forte-first <lo> <hi>
  // <octave> <level> <on> <part shown>", the first's keys, then for each other part "forte-part
  // <slug> <lo> <hi> <octave> <level> <on>" and its own -------------------------------------------
  static bool write(const clap_ostream_t *s, const std::string &t) {
    for (const char *p = t.data(), *end = p + t.size(); p < end;) {
      int64_t w = s->write(s, p, (uint64_t)(end - p));
      if (w <= 0) return false;
      p += w;
    }
    return true;
  }
  static std::string saved(Plugin &p) {
    std::string t;
    clap_ostream_t os{&t, [](const clap_ostream_t *s, const void *b, uint64_t n) -> int64_t { ((std::string *)s->ctx)->append((const char *)b, (size_t)n); return (int64_t)n; }};
    p.save(&os);
    return t;
  }
  static bool loadText(Plugin &p, const std::string &t) {
    struct Reader { clap_istream_t s; const std::string *t; size_t at; } r{{}, &t, 0};
    r.s.ctx = &r;
    r.s.read = [](const clap_istream_t *is, void *out, uint64_t n) -> int64_t {
      auto rd = (Reader *)is->ctx;
      const size_t k = std::min((size_t)n, rd->t->size() - rd->at);
      std::memcpy(out, rd->t->data() + rd->at, k);
      rd->at += k;
      return (int64_t)k;
    };
    return p.load(&r.s);
  }
  static std::string zoneText(const Zone &z) {
    char b[96];
    std::snprintf(b, sizeof b, "%d %d %d %.6g %d", z.lo, z.hi, z.oct, z.level, z.on ? 1 : 0);
    return b;
  }
  static Zone zoneFrom(std::istringstream &line) {
    Zone z;
    int on = 1;
    std::string level;
    line >> z.lo >> z.hi >> z.oct >> level >> on;
    if (line.fail()) return Zone{};
    z.level = std::strtod(level.c_str(), nullptr); // as the parts' own values are read (Plugin::load)
    z.on = on != 0;
    return whole(z);
  }
  bool save(const clap_ostream_t *s) {
    auto line = [](std::string &t) { if (!t.empty() && t.back() != '\n') t += '\n'; };
    std::string t = std::string("forte-suite ") + part[0]->I.slug + "\n" + saved(*part[0]);
    const int n = parts();
    if (n > 1) {
      line(t);
      t += "forte-first " + zoneText(zone[0]) + " " + std::to_string(focus) + "\n";
      for (int j = 1; j < n; j++) {
        line(t);
        t += std::string("forte-part ") + part[j]->I.slug + " " + zoneText(zone[j]) + "\n" + saved(*part[j]);
      }
    }
    return write(s, t);
  }
  // where the next part's line starts in t, from `from` (npos: none)
  static size_t nextPart(const std::string &t, size_t from) {
    size_t at = std::string::npos;
    for (const char *h : {"\nforte-first ", "\nforte-part "}) at = std::min(at, t.find(h, from));
    return at;
  }
  bool load(const clap_istream_t *s) {
    std::string t;
    char buf[4096];
    for (int64_t r; (r = s->read(s, buf, sizeof buf)) > 0;) t.append(buf, (size_t)r);
    std::string slug, rest;
    if (t.compare(0, 12, "forte-suite ") == 0) {
      const size_t eol = t.find('\n');
      if (eol == std::string::npos) return false;
      slug = t.substr(12, eol - 12);
      t.erase(0, eol + 1);
      const size_t at = nextPart(t, 0);
      if (at != std::string::npos) { rest = t.substr(at + 1); t.erase(at + 1); }
    } else if (t.compare(0, 6, "forte ") == 0) { // an instrument's own plugin's state
      const size_t sp = t.find_first_of(" \n", 6);
      slug = t.substr(6, sp == std::string::npos ? std::string::npos : sp - 6);
    } else return false;
    const int first = find(slug);
    if (first < 0) return false;
    combination.clear();
    alone();
    choose(first);
    bool ok = loadText(*part[0], t);
    int shown = 0;
    // the other parts, each a line and then its state up to the next one's
    for (size_t at = 0; ok && at < rest.size();) {
      const size_t eol = rest.find('\n', at), end = nextPart(rest, at);
      const std::string head = rest.substr(at, (eol == std::string::npos ? rest.size() : eol) - at);
      const std::string body = eol == std::string::npos || eol >= end ? std::string() : rest.substr(eol + 1, (end == std::string::npos ? rest.size() : end + 1) - eol - 1);
      at = end == std::string::npos ? rest.size() : end + 1;
      std::istringstream line(head);
      std::string what;
      line >> what;
      if (what == "forte-first") {
        zone[0] = zoneFrom(line);
        line >> shown;
        continue;
      }
      std::string other;
      line >> other;
      const int k = find(other);
      const int j = parts();
      if (k < 0 || j >= kParts) continue; // an instrument this app doesn't have: the rest without it
      part[j] = make(k);
      zone[j] = zoneFrom(line);
      if (!body.empty()) ok = loadText(*part[j], body);
    }
    focus = std::clamp(shown, 0, parts() - 1); focused = focus;
    publish();
    return ok;
  }
};

Suite *suite(const clap_plugin_t *p) { return static_cast<Suite *>(instance(p)); }
const clap_plugin_t *inner(const clap_plugin_t *p) { return &suite(p)->part[0]->clap; }

bool suiteInit(const clap_plugin_t *p) {
  Suite *s = suite(p);
  s->hostTimer = (const clap_host_timer_support_t *)s->host->get_extension(s->host, CLAP_EXT_TIMER_SUPPORT);
  return s->choose(0 < s->count ? s->order[0] : -1);
}
bool suiteActivate(const clap_plugin_t *p, double fs, uint32_t minFrames, uint32_t maxFrames) {
  Suite *s = suite(p);
  s->fs = fs; s->minFrames = minFrames; s->maxFrames = maxFrames;
  s->spareL.assign(maxFrames, 0); s->spareR.assign(maxFrames, 0);
  // the parts together: each has its limiter, so this only catches what they add up to
  s->sum.set(-1, 0, 20, 0.001, 0.1, fs);
  s->sum.makeup = 1;
  std::memset(s->routed, 0, sizeof s->routed);
  s->active = pluginActivate(inner(p), fs, minFrames, maxFrames);
  if (s->active) for (int j = 1; j < Suite::kParts; j++) if (s->part[j]) pluginActivate(&s->part[j]->clap, fs, minFrames, maxFrames);
  return s->active;
}
void suiteDeactivate(const clap_plugin_t *p) {
  Suite *s = suite(p);
  s->audio();
  s->collect();
  for (auto &q : s->part) if (q) pluginDeactivate(&q->clap);
  s->active = false;
}
void suiteProcessing(const clap_plugin_t *p, bool on) {
  Suite *s = suite(p);
  s->processing = on;
  for (Plugin *q : s->audio()->part) if (q) q->processing = on;
}
bool suiteStartProcessing(const clap_plugin_t *p) { suiteProcessing(p, true); return true; }
void suiteStopProcessing(const clap_plugin_t *p) { suiteProcessing(p, false); }
void suiteReset(const clap_plugin_t *p) {
  Suite *s = suite(p);
  for (Plugin *q : s->audio()->part) if (q) pluginReset(&q->clap);
  std::memset(s->routed, 0, sizeof s->routed);
  s->sum.reset();
}
clap_process_status suiteProcess(const clap_plugin_t *p, const clap_process_t *proc) { return suite(p)->process(proc); }
void suiteOnMainThread(const clap_plugin_t *p) { suite(p)->collect(); }

const clap_plugin_params_t suiteParams{
    [](const clap_plugin_t *p) { return paramsCount(inner(p)); },
    [](const clap_plugin_t *p, uint32_t i, clap_param_info_t *info) { return paramsGetInfo(inner(p), i, info); },
    [](const clap_plugin_t *p, clap_id id, double *v) { return paramsGetValue(inner(p), id, v); },
    [](const clap_plugin_t *p, clap_id id, double v, char *out, uint32_t size) { return paramsValueToText(inner(p), id, v, out, size); },
    [](const clap_plugin_t *p, clap_id id, const char *text, double *v) { return paramsTextToValue(inner(p), id, text, v); },
    [](const clap_plugin_t *p, const clap_input_events_t *in, const clap_output_events_t *out) {
      Suite::Rig *r = suite(p)->audio();
      paramsFlush(&r->part[0]->clap, in, out);
      for (int j = 1; j < r->n; j++) { // the window's changes to the others, which the host doesn't see
        Plugin *b = r->part[j];
        if (!b->processing.load()) b->takePending();
        b->takeUi(nullptr);
        b->publishKeys();
      }
    }};
const clap_plugin_state_t suiteState{
    [](const clap_plugin_t *p, const clap_ostream_t *s) { return suite(p)->save(s); },
    [](const clap_plugin_t *p, const clap_istream_t *s) { return suite(p)->load(s); }};

const clap_plugin_render_t suiteRender{renderHardRealtime, [](const clap_plugin_t *p, clap_plugin_render_mode mode) {
  for (auto &q : suite(p)->part) if (q) renderSet(&q->clap, mode);
  return true;
}};

const void *suiteGetExtension(const clap_plugin_t *p, const char *id) {
  if (!std::strcmp(id, CLAP_EXT_PARAMS)) return &suiteParams;
  if (!std::strcmp(id, CLAP_EXT_RENDER)) return &suiteRender;
  if (!std::strcmp(id, CLAP_EXT_STATE)) return &suiteState;
  if (!std::strcmp(id, CLAP_PLUGIN_AUV2_PARAM_ORDERING)) return nullptr;
  return pluginGetExtension(p, id);
}

// ---- the factory: one plugin per binary ----------------------------------------------------------

struct Factory {
  const InstrumentInfo *I = nullptr;
  const SuiteEntry *suite = nullptr; // the Forte app's instruments, instead of I
  int suiteCount = 0;
  std::string id, version, accent;
  const Site *site = nullptr;
  const Views *views = nullptr;
  const char *features[4] = {CLAP_PLUGIN_FEATURE_INSTRUMENT, CLAP_PLUGIN_FEATURE_SYNTHESIZER, CLAP_PLUGIN_FEATURE_STEREO, nullptr};
  clap_plugin_descriptor_t desc{};
  clap_plugin_info_as_vst3_t vst3{};
  void init(const InstrumentInfo &info, const char *colour, const Site *page, const Views *watch) {
    I = &info;
    site = page; views = watch;
    accent = colour ? colour : "";
    id = std::string("net.jthaler.forte.") + info.slug;
    version = info.version;
    desc = {CLAP_VERSION, id.c_str(), info.name, "Forte", "https://forte.jthaler.net",
            "https://forte.jthaler.net", "https://github.com/jdthaler/forte", version.c_str(), info.description, features};
    vst3 = {"Forte", &info.vst3Id, nullptr};
  }
  void initSuite(const SuiteEntry *instruments, int n, const char *v) {
    suite = instruments; suiteCount = n;
    id = "net.jthaler.forte.suite";
    version = v ? v : "";
    desc = {CLAP_VERSION, id.c_str(), "Forte", "Forte", "https://forte.jthaler.net", "https://forte.jthaler.net",
            "https://github.com/jdthaler/forte", version.c_str(), "Every Forte instrument in one window", features};
  }
} factory;

uint32_t factoryCount(const clap_plugin_factory_t *) { return 1; }
const clap_plugin_descriptor_t *factoryDescriptor(const clap_plugin_factory_t *, uint32_t i) { return i == 0 ? &factory.desc : nullptr; }
const clap_plugin_t *factoryCreate(const clap_plugin_factory_t *, const clap_host_t *host, const char *id) {
  if (!factory.desc.id || std::strcmp(id, factory.desc.id)) return nullptr;
  if (factory.suite) {
    Suite *s = new Suite(host, &factory.desc, factory.suite, factory.suiteCount);
    s->clap.init = suiteInit; s->clap.destroy = pluginDestroy;
    s->clap.activate = suiteActivate; s->clap.deactivate = suiteDeactivate;
    s->clap.start_processing = suiteStartProcessing; s->clap.stop_processing = suiteStopProcessing;
    s->clap.reset = suiteReset; s->clap.process = suiteProcess;
    s->clap.get_extension = suiteGetExtension; s->clap.on_main_thread = suiteOnMainThread;
    return &s->clap;
  }
  if (!factory.I) return nullptr;
  Plugin *s = new Plugin(host, *factory.I, &factory.desc, factory.accent, factory.site, factory.views);
  s->clap.init = pluginInit; s->clap.destroy = pluginDestroy;
  s->clap.activate = pluginActivate; s->clap.deactivate = pluginDeactivate;
  s->clap.start_processing = pluginStartProcessing; s->clap.stop_processing = pluginStopProcessing;
  s->clap.reset = pluginReset; s->clap.process = pluginProcess;
  s->clap.get_extension = pluginGetExtension; s->clap.on_main_thread = pluginOnMainThread;
  return &s->clap;
}
const clap_plugin_factory_t pluginFactory{factoryCount, factoryDescriptor, factoryCreate};

const clap_plugin_info_as_vst3_t *vst3Info(const clap_plugin_factory_as_vst3 *, uint32_t i) { return i == 0 && factory.I ? &factory.vst3 : nullptr; }
const clap_plugin_factory_as_vst3_t vst3Factory{"Forte", "https://forte.jthaler.net", "", vst3Info, nullptr};

} // namespace

bool entryInit(const InstrumentInfo &info, const char *accent, const Site *site, const Views *views) { factory.init(info, accent, site, views); return true; }
bool entrySuite(const SuiteEntry *instruments, int count, const char *version) { factory.initSuite(instruments, count, version); return count > 0; }

const void *entryFactory(const char *id) {
  if (!std::strcmp(id, CLAP_PLUGIN_FACTORY_ID)) return &pluginFactory;
  if (!std::strcmp(id, CLAP_PLUGIN_FACTORY_INFO_VST3)) return &vst3Factory;
  return nullptr;
}

} // namespace forte
