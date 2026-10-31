// tines-tests.cpp — the Tine Piano in C++: the tine against Euler–Bernoulli, every key's fork on
// pitch, the tone bar's sustain, the voice data packed and back, the engine on pitch with its keys
// built off the audio thread (forte/background.h), the pickup's octave trick and its live moves, a
// new voice when the model changes, the dampers and the pedal, the voice limit, the hammer's
// messages, and ten notes within the CPU budget. The physics tests are the JavaScript suite's, run
// on the WebAssembly (node test/tines-tests.mjs).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <thread>
#include <vector>

#include "check.h"
#include "tines-engine.h"

const forte::InstrumentInfo &forte_instrument();

using namespace forte;
using namespace forte::tines;

constexpr double FS = 48000;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
static std::vector<float> render(TinesEngine &e, int n, std::vector<float> *right = nullptr) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  if (right) *right = R;
  return L;
}
// render blocks, giving the worker time, until n voices sound (a note waits for its key to be built)
static bool until(TinesEngine &e, int n) {
  std::vector<float> L(128), R(128);
  for (int i = 0; i < 5000 && e.voiceCount() < n; i++) { e.process(L.data(), R.data(), 128); std::this_thread::sleep_for(std::chrono::milliseconds(1)); }
  return e.voiceCount() >= n;
}
static double cents(double a, double b) { return 1200 * std::log2(a / b); }
static double tone(const std::vector<float> &x, double f, int a, int b) {
  double re = 0, im = 0;
  for (int i = a; i < b; i++) { const double h = 0.5 - 0.5 * std::cos(2 * PI * (i - a) / (b - a)); re += h * x[i] * std::cos(2 * PI * f * i / FS); im += h * x[i] * std::sin(2 * PI * f * i / FS); }
  return std::hypot(re, im);
}
static double rms(const std::vector<float> &x, int a, int b) {
  double e = 0;
  for (int i = a; i < b; i++) e += (double)x[i] * x[i];
  return std::sqrt(e / (b - a));
}
// the dry signal: no amp drive, no cable resonance, no speaker roll-off, no vibrato
static std::vector<double> dry(std::vector<double> P) {
  P[p::drive] = 0; P[p::cable] = 100; P[p::tone] = 14000; P[p::tremDepth] = 0;
  return P;
}
static std::unique_ptr<TinesEngine> engine(const std::vector<double> &P) {
  auto e = std::make_unique<TinesEngine>(FS);
  e->setParams(P.data());
  return e;
}

TEST("model: the finite-element cantilever's f₁ and overtone ratios are Euler–Bernoulli's") {
  const Cantilever c = cantilever(0.05, 1.9e-3, 0, 0, 24, 4);
  const double exact = ((1.8751 * 1.8751) / (2 * PI)) * std::sqrt(c.EI / c.mu) / (0.05 * 0.05);
  CHECK(std::fabs(c.omega[0] / (2 * PI) / exact - 1) < 1e-4);
  const double r[3] = {6.2669, 17.5475, 34.3861};
  for (int i = 0; i < 3; i++) CHECK(std::fabs(c.omega[i + 1] / c.omega[0] - r[i]) < 2e-3 * r[i]);
  CHECK(std::fabs(c.Gamma[0] * c.Gamma[0] / c.mt - 0.6131) < 1e-3);
  CHECK(c.shape(0, 0.05) > 0 && std::fabs(c.shape(0, 0)) < 1e-12);
}

TEST("model: every key's sustaining fork mode sits on pitch; a matched tone bar sustains, no bar dies fast") {
  const auto P = defaults();
  for (int m = KEY_MIN; m <= KEY_MAX; m++) { // every key of the 88
    const KeyModel k = computeKey(m, P.data(), FS);
    CHECK(k.ok);
    const Mode *best = nullptr;
    for (const Mode &md : k.modes) if (std::fabs(cents(md.f, keyFreq(m))) < 100 && (!best || md.sigma < best->sigma)) best = &md;
    CHECK(best && std::fabs(cents(best->f, keyFreq(m))) < 0.5);
  }
  auto t60 = [&](int id, double v) {
    auto Q = defaults();
    if (id >= 0) Q[id] = v;
    const KeyModel k = computeKey(69, Q.data(), FS);
    const Mode *md = nullptr;
    for (const Mode &x : k.modes) if (std::fabs(cents(x.f, 440)) < 30 && (!md || x.tineFrac > md->tineFrac)) md = &x;
    return 6.91 / md->sigma;
  };
  const double withBar = t60(-1, 0), noBar = t60(p::barMass, 0.01), detuned = t60(p::barTune, 40);
  std::printf("       A4 sustain T60: matched bar %.1f s, bar +40 ¢ %.1f s, no bar %.2f s\n", withBar, detuned, noBar);
  CHECK(noBar < 0.2 * withBar && detuned < withBar);
}

TEST("model: the voice data packs and unpacks; its version follows the model parameters and the sample rate only") {
  const auto P = defaults();
  KeyModel k = computeKey(60, P.data(), FS);
  k.voice.version = modelVersion(P.data(), FS);
  std::vector<double> buf(PACK_MAX);
  const int n = packVoiceData(k.voice, buf.data());
  VoiceData d;
  CHECK(unpackVoiceData(buf.data(), n, d));
  CHECK(d.version == k.voice.version && d.key == 60 && d.n == k.voice.n && d.hasDamper);
  for (int i = 0; i < d.n; i++) CHECK(d.freq[i] == k.voice.freq[i] && d.w[i] == k.voice.w[i] && d.pk[i] == k.voice.pk[i]);
  CHECK(d.hammer.K == k.voice.hammer.K && d.pickup.wid == k.voice.pickup.wid);
  CHECK(!unpackVoiceData(buf.data(), n - 1, d));
  auto Q = P;
  Q[p::gap] = 2; Q[p::drive] = 0.9; Q[p::volume] = 1.5;
  CHECK(modelVersion(Q.data(), FS) == modelVersion(P.data(), FS));
  Q[p::strike] = 9;
  CHECK(modelVersion(Q.data(), FS) != modelVersion(P.data(), FS));
  CHECK(modelVersion(P.data(), 44100) != modelVersion(P.data(), FS));
}

TEST("engine: A4 plays 440 Hz once its key is built off the audio thread, and stays finite") {
  auto ep = engine(dry(defaults()));
  TinesEngine &e = *ep;
  e.noteOn(69, 1.8);
  CHECK(until(e, 1));
  const auto L = render(e, (int)(1.2 * FS));
  double best = 0, bf = 0;
  for (double f = 437; f <= 443; f += 0.05) { const double g = tone(L, f, (int)(0.2 * FS), (int)(1.2 * FS)); if (g > best) { best = g; bf = f; } }
  CHECK(std::fabs(cents(bf, 440)) < 2);
  bool finite = true;
  for (float s : L) finite &= std::isfinite(s);
  CHECK(finite);
}

TEST("engine: pitch bend slides the tuning springs: a ringing note follows, two semitones at the wheel's ends") {
  for (double v : {1.0, -1.0}) {
    auto ep = engine(dry(defaults()));
    TinesEngine &e = *ep;
    e.noteOn(69, 1.8);
    CHECK(until(e, 1));
    render(e, (int)(0.1 * FS));
    e.bend(v);
    const auto L = render(e, (int)(1.2 * FS));
    const double want = 440 * std::pow(2.0, 2 * v / 12);
    double best = 0, bf = 0;
    for (double c = -10; c <= 10; c += 0.25) { const double f = want * std::pow(2.0, c / 1200), g = tone(L, f, (int)(0.2 * FS), (int)(1.2 * FS)); if (g > best) { best = g; bf = f; } }
    CHECK(std::fabs(cents(bf, want)) < 2);
  }
}

// wait for key's modes to be built (so a note struck now sounds in this block)
static void waitFor(TinesEngine &e, int key) {
  for (int i = 0; i < 5000 && !e.ready(key); i++) std::this_thread::sleep_for(std::chrono::milliseconds(1));
  CHECK(e.ready(key));
}
// the strongest frequency within ±10 ¢ of want in x[a, b)
static double near(const std::vector<float> &x, double want, int a, int b) {
  double best = 0, bf = 0;
  for (double c = -10; c <= 10; c += 0.25) { const double f = want * std::pow(2.0, c / 1200), g = tone(x, f, a, b); if (g > best) { best = g; bf = f; } }
  return bf;
}

TEST("engine: one note's own bend (MPE) slides its fork's spring alone: it lands on the ratio, on top of the wheel's; a held note stays") {
  for (double v : {0.0, 1.0}) {
    auto ep = engine(dry(defaults()));
    TinesEngine &e = *ep;
    e.noteOn(57, 1.8); e.noteOn(69, 1.8);
    CHECK(until(e, 2));
    render(e, (int)(0.1 * FS));
    e.noteBend(std::pow(2.0, 5.0 / 12), 69);
    e.bend(v);
    const auto L = render(e, (int)(1.2 * FS));
    const double w = 2 * v, a = 220 * std::pow(2.0, w / 12), b = 440 * std::pow(2.0, (w + 5) / 12);
    CHECK(std::fabs(cents(near(L, a, (int)(0.2 * FS), (int)(1.2 * FS)), a)) < 2);
    CHECK(std::fabs(cents(near(L, b, (int)(0.2 * FS), (int)(1.2 * FS)), b)) < 2);
  }
  // to the ends: A2 four octaves up, A5 two down, each bent before it is struck
  for (auto [key, semis] : {std::pair{45, 48.0}, std::pair{81, -24.0}}) {
    auto ep = engine(dry(defaults()));
    TinesEngine &e = *ep;
    e.noteBend(std::pow(2.0, semis / 12), key);
    e.noteOn(key, 1.8);
    CHECK(until(e, 1));
    const auto L = render(e, (int)(1.2 * FS));
    const double want = keyFreq(key) * std::pow(2.0, semis / 12);
    CHECK(std::fabs(cents(near(L, want, (int)(0.2 * FS), (int)(1.2 * FS)), want)) < 2);
  }
}

TEST("engine: a lone note's own bend sounds as the wheel bent as far; a bend of 1 leaves the sound bit-identical") {
  auto play = [&](int how) {
    auto ep = engine(defaults());
    TinesEngine &e = *ep;
    for (int k : {57, 64, 69}) waitFor(e, k);
    if (how == 2) { e.noteBend(1.3, 64); e.noteBend(1, 64); } // set and reset before the note
    for (int k : {57, 64, 69}) e.noteOn(k, 1.8);
    std::vector<float> out, L(128), R(128);
    for (int b = 0; b < (int)(0.8 * FS / 128); b++) {
      if (b == 40 && how == 0) e.bend(1);
      if (b == 40 && how == 1) for (int k : {57, 64, 69}) e.noteBend(std::pow(2.0, 2.0 / 12), k);
      if (how == 2) for (int k : {57, 64, 69}) e.noteBend(1, k);
      e.process(L.data(), R.data(), 128);
      out.insert(out.end(), L.begin(), L.end());
    }
    return out;
  };
  auto plain = [&]() {
    auto ep = engine(defaults());
    TinesEngine &e = *ep;
    for (int k : {57, 64, 69}) waitFor(e, k);
    for (int k : {57, 64, 69}) e.noteOn(k, 1.8);
    return render(e, (int)(0.8 * FS) / 128 * 128);
  };
  const auto wheel = play(0), own = play(1), ones = play(2), none = plain();
  double d = 0, pk = 0;
  for (size_t i = 0; i < wheel.size(); i++) { d = std::max(d, (double)std::fabs(wheel[i] - own[i])); pk = std::max(pk, (double)std::fabs(wheel[i])); }
  CHECK(d < 1e-5 * pk);
  CHECK(ones == none);
}

TEST("engine: own bends swept over ±48 semitones on a chord, every block, stay finite and bounded at 44.1, 48 and 96 kHz") {
  for (double fs : {44100.0, 48000.0, 96000.0}) {
    auto ep = std::make_unique<TinesEngine>(fs);
    TinesEngine &e = *ep;
    e.setParams(defaults().data());
    e.setSustain(true);
    const int keys[] = {36, 48, 57, 69, 81, 96};
    for (int k : keys) e.noteOn(k, 3);
    until(e, 6);
    std::vector<float> L(128), R(128);
    bool finite = true;
    double pk = 0;
    for (int b = 0; b < (int)(2 * fs / 128); b++) {
      const double t = b * 128 / fs;
      for (int i = 0; i < 6; i++) {
        // half the keys sweep smoothly, half jump between the ends
        const double s = i % 2 ? 48 * std::sin(2 * PI * (0.7 + 0.3 * i) * t) : (std::fmod(t * (3 + i), 1) < 0.5 ? 48 : -48);
        e.noteBend(std::pow(2.0, s / 12), keys[i]);
      }
      if (b == (int)(0.5 * fs / 128)) e.bend(1);
      e.process(L.data(), R.data(), 128);
      for (int j = 0; j < 128; j++) { finite &= std::isfinite(L[j]) && std::isfinite(R[j]); pk = std::max(pk, (double)std::fabs(L[j])); }
    }
    std::printf("       %.1f kHz: peak %.2f\n", fs / 1000, pk);
    CHECK(finite && pk < 2);
    CHECK(e.voiceCount() == 6); // none silenced as unstable
  }
}

TEST("engine: harder strikes swing further into the pickup's nonlinearity; a centred tine outputs the octave") {
  auto h2 = [&](double vel, double offset) {
    auto P = dry(defaults());
    P[p::offset] = offset;
    auto ep = engine(P);
    TinesEngine &e = *ep;
    e.noteOn(57, vel);
    until(e, 1);
    const auto L = render(e, (int)(0.8 * FS));
    return tone(L, 440, (int)(0.2 * FS), (int)(0.7 * FS)) / tone(L, 220, (int)(0.2 * FS), (int)(0.7 * FS));
  };
  const double soft = 20 * std::log10(h2(0.4, 0.4)), hard = 20 * std::log10(h2(4, 0.4)), centred = h2(1.8, 0);
  std::printf("       A3 2nd harmonic re fundamental: soft %.1f dB, hard %.1f dB; centred: octave %.0f× the fundamental\n", soft, hard, centred);
  CHECK(hard > soft + 15);
  CHECK(centred > 30);
}

TEST("engine: a pickup moved under a ringing note glides there; the model changed starts a new voice, unchanged re-strikes") {
  auto P = defaults();
  auto ep = engine(P);
  TinesEngine &e = *ep;
  e.noteOn(60, 1.8);
  CHECK(until(e, 1));
  TinesEngine::Voice *v = e.byKey[60];
  P[p::gap] = 0.6;
  e.setParams(P.data());
  render(e, 128 * 100);
  CHECK(std::fabs(v->wid / pickupFor(60, P.data()).wid - 1) < 1e-6);
  e.noteOn(60, 1.8); // same model: the same voice, struck again
  CHECK(e.voiceCount() == 1 && e.byKey[60] == v);
  P[p::strike] = 12;
  e.setParams(P.data());
  e.noteOn(60, 1.8); // a new model: a new voice, once the key is built
  CHECK(until(e, 2));
  CHECK(e.byKey[60] != v && !v->keyDown);
}

TEST("engine: dampers stop a released note; the sustain pedal keeps it; all notes off silences") {
  auto level = [&](bool pedal) {
    auto ep = engine(defaults());
    TinesEngine &e = *ep;
    e.setSustain(pedal);
    e.noteOn(60, 2);
    until(e, 1);
    render(e, (int)(0.3 * FS));
    e.noteOff(60, -1);
    render(e, (int)(0.5 * FS));
    return rms(render(e, (int)(0.1 * FS)), 0, (int)(0.1 * FS));
  };
  const double damped = level(false), held = level(true);
  CHECK(held > 30 * damped);
  auto ep = engine(defaults());
  TinesEngine &e = *ep;
  for (int k : {48, 52, 55}) e.noteOn(k, 2);
  until(e, 3);
  render(e, 4800);
  e.allNotesOff();
  for (int i = 0; i < 2000 && e.voiceCount(); i++) render(e, 128);
  CHECK(e.voiceCount() == 0);
}

TEST("engine: over 40 voices the quietest go, never a chord just struck; messages report each hammer") {
  auto ep = engine(defaults());
  TinesEngine &e = *ep;
  SpscQueue<Message> q(1024);
  e.messages = &q;
  e.setSustain(true);
  int n = 0;
  for (int k = KEY_LO; k < KEY_LO + 40; k++) { e.noteOn(k, 1.8); until(e, ++n); render(e, 512); }
  for (int k : {72, 76, 79, 84}) e.noteOn(k, 1.8);
  for (int i = 0; i < 5000; i++) {
    bool all = true;
    for (int k : {72, 76, 79, 84}) all &= e.byKey[k] != nullptr;
    if (all) break;
    render(e, 128);
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }
  bool chordAlive = true;
  for (int k : {72, 76, 79, 84}) chordAlive &= e.byKey[k] && !e.byKey[k]->killing;
  CHECK(chordAlive);
  render(e, 4800);
  int live = 0;
  for (int i = 0; i < e.nVoices; i++) if (!e.voices[i]->killing) live++;
  CHECK(live <= TinesEngine::MAX_VOICES);
  int hammers = 0;
  for (Message m; q.pop(m);) if (m.type == msg::hammer) { hammers++; CHECK(m.values[0] > 0 && m.values[1] > 0); }
  CHECK(hammers >= 44);
}

TEST("plugin: MIDI velocity is the hammer's speed, 0.25 … 5 m/s; CC64 the damper pedal; the other controllers are the faders") {
  const InstrumentInfo &I = forte_instrument();
  CHECK(I.midiVelocity && std::fabs(I.midiVelocity(0) - 0.25) < 1e-12 && std::fabs(I.midiVelocity(1) - 5) < 1e-12);
  CHECK(I.space == Space::sustain && I.controllerCount == 5 && I.controllers[0].cc == 107 && I.modWheel < 0);
  CHECK(I.keyLo == KEY_MIN && I.keyHi == KEY_MAX && I.chain.tone < 0);
}

TEST("CPU: ten notes at 48 kHz take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  auto P = defaults();
  auto ep = engine(P);
  TinesEngine &e = *ep;
  e.setSustain(true);
  for (int k : {36, 43, 48, 52, 55, 60, 64, 67, 72, 76}) e.noteOn(k, 2);
  CHECK(until(e, 10));
  std::vector<float> L(128), R(128);
  for (int b = 0; b < 200; b++) e.process(L.data(), R.data(), 128); // warm up, hammers done
  const auto t0 = std::chrono::steady_clock::now();
  const int blocks = (int)(4 * FS / 128);
  for (int b = 0; b < blocks; b++) e.process(L.data(), R.data(), 128);
  const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 4;
  std::printf("       %d notes: %.2f %% of a core\n", e.voiceCount(), 100 * share);
  CHECK(e.voiceCount() == 10);
  CHECK(share < 0.25);
  // and a key's modes, built off the audio thread
  const auto t1 = std::chrono::steady_clock::now();
  for (int k = KEY_LO; k <= KEY_HI; k++) computeKey(k, P.data(), FS);
  std::printf("       a key's modes: %.3f ms\n", 1000 * std::chrono::duration<double>(std::chrono::steady_clock::now() - t1).count() / (KEY_HI - KEY_LO + 1));
}

int main() { return check::run(); }
