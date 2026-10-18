// harmonium-tests.cpp — the free-reed organ's model and engine in C++: the tongue's frequency
// equation, every reed cut to its natural frequency, the voicer's tuning table, the threshold;
// an A4 speaking in tune (its reeds designed on the worker thread), a note struck before its
// reeds are ready, the musette's beats, release and retirement, extreme settings, the views'
// messages, and ten keys in the CPU budget. The physics tests are the JavaScript suite's, run on
// the WebAssembly (node test/harmonium-tests.mjs).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <thread>
#include <vector>

#include "check.h"
#include "forte/dsp.h"
#include "harmonium-engine.h"

using namespace forte;
using namespace forte::harmonium;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
static std::vector<float> render(HarmoniumEngine &e, int n, std::vector<float> *right = nullptr) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  if (right) *right = R;
  return L;
}
// the worker designs reeds in its own time: wait for the key's, so a test doesn't depend on the
// machine's load (in WebAssembly they are designed at once)
static void waitFor(HarmoniumEngine &e, int key) {
  for (int i = 0; i < 5000 && !e.ready(key); i++) std::this_thread::sleep_for(std::chrono::milliseconds(1));
  CHECK(e.ready(key));
}
static double rms(const std::vector<float> &x, int a, int b) {
  double s = 0;
  for (int i = a; i < b; i++) s += (double)x[i] * x[i];
  return std::sqrt(s / (b - a));
}
static double cents(double a, double b) { return 1200 * std::log2(a / b); }

TEST("harmonium: the tongue's frequency equation gives 1.8751 and 4.6941 bare, 1.2479 with a weight equal to the tongue") {
  const auto r0 = tipMassRoots(0), r1 = tipMassRoots(1);
  CHECK_NEAR(r0[0], 1.87510, 1e-4);
  CHECK_NEAR(r0[1], 4.69409, 1e-4);
  CHECK_NEAR(r1[0], 1.24792, 1e-4);
  CHECK_NEAR(modeShape(r1[0], 1), 1, 1e-12);
}

TEST("harmonium: every reed is cut to its natural frequency, the tuning table read at its semitones, the C4 threshold near 38 Pa") {
  const Voicing v;
  auto R = std::make_unique<ReedModel>();
  for (int m = 24; m <= 108; m += 6) {
    reedDesign(keyFreq(m), v, *R);
    CHECK_NEAR(R->modes[0].f, keyFreq(m), 1e-9 * keyFreq(m));
  }
  for (int j = 0; j < TUNE_N; j++) CHECK_NEAR(tuneRatio(keyFreq(TUNE_LO + j)), TUNE[j], 1e-12);
  reedModel(keyFreq(60), v, *R);
  CHECK_NEAR(R->fSound / R->fNat, R->tune, 1e-12);
  const auto t = threshold(*R);
  CHECK(t && t->P > 30 && t->P < 46);
  // no air mass in the throat: no drive
  Voicing thin = v;
  thin.throat = 0.01;
  reedModel(keyFreq(60), thin, *R);
  const auto t2 = threshold(*R);
  CHECK(!t2 || t2->P > 380);
}

TEST("harmonium: an A4 speaks at 440 Hz (its reeds designed on the worker thread), and retires after release") {
  const double fs = 48000;
  auto P = defaults();
  auto engine = std::make_unique<HarmoniumEngine>(fs); // big for a WebAssembly stack
  HarmoniumEngine &e = *engine;
  e.configure(1, 440, true);
  e.setParams(P.data());
  waitFor(e, 69);
  e.noteOn(69, 0.7);
  CHECK(e.count == 1 && !e.voices[0]->pending);
  const auto L = render(e, (int)fs);
  CHECK(e.voiceCount() == 1);
  CHECK(rms(L, (int)(0.6 * fs), (int)fs) > 0.02);
  const double f = e.voices[0]->reeds[1].freq();
  CHECK(std::fabs(cents(f, 440)) < 3);
  std::printf("       A4 sounds at %.2f Hz (%.2f ¢)\n", f, cents(f, 440));
  e.noteOff(69, -1);
  render(e, (int)(3 * fs));
  CHECK(e.voiceCount() == 0 && e.count == 0);
}

TEST("harmonium: pitch bend stiffens or softens the tongues: a sounding note follows, two semitones at the wheel's ends") {
  const double fs = 48000;
  for (int key : {36, 57, 69, 84}) for (double v : {1.0, -1.0}) {
    auto P = defaults();
    auto engine = std::make_unique<HarmoniumEngine>(fs);
    HarmoniumEngine &e = *engine;
    e.configure(1, 440, true);
    e.setParams(P.data());
    waitFor(e, key);
    e.noteOn(key, 0.7);
    render(e, (int)(0.5 * fs));
    e.bend(v);
    render(e, (int)(0.6 * fs));
    const double want = 440 * std::pow(2.0, (key - 69 + 2 * v) / 12), f = e.voices[0]->reeds[1].freq();
    CHECK(std::fabs(cents(f, want)) < 3);
  }
}

TEST("harmonium: a key struck before its reeds are designed waits for them, then speaks") {
  const double fs = 48000;
  auto P = defaults();
  P[p::set] = 1.3; // a voicing no key has been designed for
  auto engine = std::make_unique<HarmoniumEngine>(fs);
  HarmoniumEngine &e = *engine;
  e.setParams(P.data());
  e.noteOn(50, 0.7);
  CHECK(e.count == 1);
  std::vector<float> L(128), R(128);
  for (int i = 0; i < 5000 && e.voices[0]->pending; i++) { e.process(L.data(), R.data(), 128); std::this_thread::sleep_for(std::chrono::milliseconds(1)); }
  CHECK(!e.voices[0]->pending);
  const auto out = render(e, (int)fs);
  CHECK(rms(out, (int)(0.5 * fs), (int)fs) > 0.02);
}

TEST("harmonium: the musette's three reeds sound 12 ¢ apart; the stops' mutes follow them") {
  const double fs = 48000;
  auto P = defaults();
  P[p::musette] = musette_::three;
  auto engine = std::make_unique<HarmoniumEngine>(fs);
  HarmoniumEngine &e = *engine;
  e.configure(1, 440, true);
  e.setParams(P.data());
  waitFor(e, 69);
  e.noteOn(69, 0.7);
  render(e, (int)(1.5 * fs));
  const auto &v = *e.voices[0];
  const Voicing vc = voicingOf(P.data());
  for (int r : {1, 2, 3}) CHECK(std::fabs(cents(v.reeds[r].freq(), rankFreq(69, r, vc))) < 0.5);
  CHECK(e.voiceCount() == 3);
  P[p::musette] = musette_::off;
  e.setParams(P.data());
  render(e, (int)(3 * fs)); // the muted reeds ring down at their own (high) Q, then sleep
  CHECK(e.voiceCount() == 1);
}

TEST("harmonium: extreme settings changed mid-note, with full aftertouch, stay finite and bounded") {
  for (double fs : {44100.0, 96000.0}) {
    auto P = defaults();
    P[p::pressure] = 2500; P[p::set] = 0.3; P[p::clearance] = 10; P[p::q] = 800; P[p::throat] = 3; P[p::cell] = 0.2;
    P[p::bourdon] = 1; P[p::piccolo] = 1; P[p::musette] = musette_::three; P[p::detune] = 40; P[p::percussion] = 1;
    auto engine = std::make_unique<HarmoniumEngine>(fs);
    HarmoniumEngine &e = *engine;
    e.setParams(P.data());
    for (int k : {36, 50, 61, 79, 96}) { waitFor(e, k); e.noteOn(k, 1); }
    render(e, (int)(0.4 * fs));
    P[p::cassotto] = 1; P[p::expression] = 1; P[p::pump] = 3; P[p::pressure] = 100;
    e.setParams(P.data());
    e.pressure(1, -1);
    std::vector<float> R;
    const auto L = render(e, (int)(0.6 * fs), &R);
    double pk = 0;
    bool finite = true;
    for (size_t i = 0; i < L.size(); i++) { finite = finite && std::isfinite(L[i]) && std::isfinite(R[i]); pk = std::max(pk, (double)std::fabs(L[i])); }
    CHECK(finite);
    CHECK(pk < 4);
  }
}

TEST("harmonium: the views' messages: the focused reed's traces, its envelope, then its header") {
  const double fs = 48000;
  auto P = defaults();
  auto engine = std::make_unique<HarmoniumEngine>(fs);
  HarmoniumEngine &e = *engine;
  SpscQueue<Message> q(4096);
  e.messages = &q;
  e.setParams(P.data());
  waitFor(e, 60);
  e.noteOn(60, 0.7);
  render(e, (int)(0.5 * fs));
  Message m;
  int traces = 0, envs = 0, heads = 0;
  bool good = false;
  while (q.pop(m)) {
    if (m.type == msg::trace) traces++;
    else if (m.type == msg::env) envs++;
    else if (m.type == msg::reed) {
      heads++;
      good = m.key == 60 && m.values[0] == 1 && std::fabs(m.values[5] - keyFreq(60)) < 1e-3 && m.values[8] == TRACE && std::fabs(m.values[20] - keyFreq(60)) < 3;
    }
  }
  CHECK(heads > 10 && envs == heads && traces == 36 * heads);
  CHECK(good);
}

TEST("CPU: ten held keys at 48 kHz, on the 8′ (10 reeds) and with the three-reed musette (30), take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  for (int musette : {(int)musette_::off, (int)musette_::three}) {
    auto P = defaults();
    P[p::musette] = musette;
    auto engine = std::make_unique<HarmoniumEngine>(fs);
    HarmoniumEngine &e = *engine;
    e.setParams(P.data());
    for (int k : {48, 52, 55, 60, 64, 67, 71, 72, 76, 79}) { waitFor(e, k); e.noteOn(k, 0.8); }
    std::vector<float> L(128), R(128);
    for (int b = 0; b < (int)(0.5 * fs / 128); b++) e.process(L.data(), R.data(), 128); // let them speak
    const auto t0 = std::chrono::steady_clock::now();
    const int blocks = (int)(4 * fs / 128);
    for (int b = 0; b < blocks; b++) e.process(L.data(), R.data(), 128);
    const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 4;
    std::printf("       %d reeds: %.2f %% of a core\n", e.voiceCount(), 100 * share);
    CHECK(share < 0.3);
  }
}

int main() { return check::run(); }
