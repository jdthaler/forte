// glass-tests.cpp — the armonica's model and engine in C++: Rayleigh's ratios and Bryan's factor,
// the bowls on pitch, a rubbed bowl speaking at its note (its bowl built on the worker thread),
// the pitch wheel and each note's own bend (MPE), water poured into a ringing bowl, the views' messages, and ten bowls in the CPU budget. The
// physics tests are the JavaScript suite's, run on the WebAssembly (node test/glass-tests.mjs).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <thread>
#include <vector>

#include "check.h"
#include "forte/dsp.h"
#include "glass-engine.h"

using namespace forte;
using namespace forte::glass;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
static std::vector<float> render(ArmonicaEngine &e, int n, std::vector<float> *right = nullptr) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  if (right) *right = R;
  return L;
}
// frequency from interpolated upward zero crossings over [a, b)
// the worker builds bowls in its own time: wait for the key's, so a test doesn't depend on the
// machine's load (in WebAssembly it is built at once)
static void waitFor(ArmonicaEngine &e, int key) {
  for (int i = 0; i < 5000 && !e.ready(key); i++) std::this_thread::sleep_for(std::chrono::milliseconds(1));
  CHECK(e.ready(key));
}

static double zeroCrossFreq(const std::vector<float> &x, int a, int b, double fs) {
  double first = -1, last = -1;
  int n = 0;
  for (int i = a + 1; i < b; i++) if (x[i - 1] <= 0 && x[i] > 0) {
    const double t = i - 1 + x[i - 1] / (x[i - 1] - x[i]);
    if (first < 0) first = t; else { n++; last = t; }
  }
  return n * fs / (last - first);
}
static double rms(const std::vector<float> &x, int a, int b) {
  double s = 0;
  for (int i = a; i < b; i++) s += (double)x[i] * x[i];
  return std::sqrt(s / (b - a));
}

TEST("glass: Rayleigh's hemisphere ratios 1 : 2.810 : 5.432 : 8.839, Bryan's factor 0.277, every bowl on pitch") {
  const double r2 = rayleigh(2).lambda;
  CHECK_NEAR(rayleigh(3).lambda / r2, 2.8102, 5e-4);
  CHECK_NEAR(rayleigh(4).lambda / r2, 5.4316, 5e-4);
  CHECK_NEAR(rayleigh(5).lambda / r2, 8.8387, 5e-4);
  CHECK_NEAR(rayleigh(2).bryan, 0.277, 5e-4);
  double sum = 0;
  for (int k = KEY_LO; k <= KEY_HI; k++) {
    const Bowl b = bowl(k, BowlParams{});
    CHECK_NEAR(b.modes[0].f, keyFreq(k), 1e-9 * keyFreq(k));
    CHECK(b.count >= 4 && b.count <= 5);
    sum += b.h;
  }
  CHECK_NEAR(sum / (KEY_HI - KEY_LO + 1), 2.54e-3, 2.54e-4); // Franklin's "tenth of an inch"
  CHECK(regulation(55) > regulation(69) && regulation(69) > regulation(91) && regulation(91) > 0.2);
  for (int k = KEY_MIN; k <= KEY_MAX; k++) { // and the bowls past the compass, with the full range open
    const Bowl b = bowl(k, BowlParams{});
    CHECK_NEAR(b.modes[0].f, keyFreq(k), 1e-9 * keyFreq(k));
    CHECK(b.h > 0.8e-3 && b.h < 2.9e-3 && std::isfinite(regulation(k)));
  }
}

TEST("glass: a rubbed A4 speaks at 440 Hz, its bowl built on the worker thread, and retires after release") {
  const double fs = 48000;
  auto P = defaults();
  P[p::split] = 0; P[p::treadle] = 0;
  auto engine = std::make_unique<ArmonicaEngine>(fs); // big for a WebAssembly stack
  ArmonicaEngine &e = *engine;
  e.setParams(P.data());
  e.noteOn(69, 0.6); // at once: in the plugin the bowl may not be built yet, and the voice waits for it
  CHECK(e.voiceCount() == 1);
  render(e, 128);
  waitFor(e, 69); // the voice picks its bowl up at the next block
  auto L = render(e, (int)(1.6 * fs));
  const double f = zeroCrossFreq(L, (int)(1.0 * fs), (int)(1.6 * fs), fs);
  CHECK(std::fabs(1200 * std::log2(f / 440)) < 3);
  CHECK(rms(L, (int)(1.2 * fs), (int)(1.6 * fs)) > 0.01);
  e.noteOff(69, -1);
  P[p::loss] = 3e-3;
  e.setParams(P.data());
  render(e, (int)(6 * fs));
  CHECK(e.voiceCount() == 0);
}

TEST("glass: pitch bend moves every bowl's modes: a rubbed note follows, two semitones at the wheel's ends") {
  const double fs = 48000;
  for (double v : {1.0, -1.0}) {
    auto P = defaults();
    P[p::split] = 0; P[p::treadle] = 0;
    auto engine = std::make_unique<ArmonicaEngine>(fs);
    ArmonicaEngine &e = *engine;
    e.setParams(P.data());
    waitFor(e, 69);
    e.noteOn(69, 0.6);
    render(e, (int)(0.8 * fs));
    e.bend(v);
    auto L = render(e, (int)(1.0 * fs));
    const double want = 440 * std::pow(2.0, 2 * v / 12), f = zeroCrossFreq(L, (int)(0.4 * fs), (int)(1.0 * fs), fs);
    CHECK(std::fabs(1200 * std::log2(f / want)) < 3);
    CHECK(rms(L, (int)(0.4 * fs), (int)(1.0 * fs)) > 0.01);
  }
}

// the strongest frequency within ±60 ¢ of f (Hann window, ½ ¢ steps)
static double peakNear(const std::vector<float> &x, int a, int b, double f, double fs) {
  double best = 0, bf = f;
  for (double c = -60; c <= 60; c += 0.5) {
    const double g = f * std::pow(2.0, c / 1200);
    double re = 0, im = 0;
    for (int i = a; i < b; i++) {
      const double h = 0.5 - 0.5 * std::cos(TAU * (i - a) / (b - a)), w = (TAU * g * i) / fs;
      re += h * x[i] * std::cos(w); im += h * x[i] * std::sin(w);
    }
    if (std::hypot(re, im) > best) { best = std::hypot(re, im); bf = g; }
  }
  return bf;
}

TEST("glass: a note's own bend (MPE) retunes its bowl alone: A4 lands a fourth down, A3 held beside it stays") {
  const double fs = 48000;
  auto P = defaults();
  P[p::split] = 0; P[p::treadle] = 0;
  auto engine = std::make_unique<ArmonicaEngine>(fs);
  ArmonicaEngine &e = *engine;
  e.setParams(P.data());
  waitFor(e, 57); waitFor(e, 69);
  e.noteOn(57, 0.6); e.noteOn(69, 0.6);
  render(e, (int)(0.8 * fs));
  const double r = std::pow(2.0, -5.0 / 12);
  e.noteBend(r, 69);
  auto L = render(e, (int)(1.2 * fs));
  const int a = (int)(0.4 * fs), b = (int)(1.2 * fs);
  CHECK(std::fabs(1200 * std::log2(peakNear(L, a, b, 440 * r, fs) / (440 * r))) < 3);
  CHECK(std::fabs(1200 * std::log2(peakNear(L, a, b, 220, fs) / 220)) < 3);
}

TEST("glass: a lone note's own bend sounds as the wheel bent as far: two semitones up and down") {
  const double fs = 48000;
  for (double v : {1.0, -1.0}) {
    std::vector<float> out[2];
    for (int which = 0; which < 2; which++) {
      auto P = defaults();
      P[p::split] = 0; P[p::treadle] = 0;
      auto engine = std::make_unique<ArmonicaEngine>(fs);
      ArmonicaEngine &e = *engine;
      e.setParams(P.data());
      waitFor(e, 69);
      e.noteOn(69, 0.6);
      render(e, (int)(0.8 * fs));
      if (which) e.noteBend(std::pow(2.0, 2 * v / 12), 69); else e.bend(v);
      out[which] = render(e, (int)(1.0 * fs));
    }
    const int a = (int)(0.4 * fs), b = (int)(1.0 * fs);
    const double fw = zeroCrossFreq(out[0], a, b, fs), fn = zeroCrossFreq(out[1], a, b, fs);
    CHECK(std::fabs(1200 * std::log2(fn / fw)) < 1);
    CHECK(std::fabs(1200 * std::log2(fn / (440 * std::pow(2.0, 2 * v / 12)))) < 3);
    CHECK(std::fabs(20 * std::log10(rms(out[1], a, b) / rms(out[0], a, b))) < 0.5);
  }
}

TEST("glass: a bend sent before the key starts its bowl there; bends of 1 leave every sample as it was") {
  const double fs = 48000;
  auto P = defaults();
  P[p::split] = 0; P[p::treadle] = 0;
  { // struck already bent: on pitch from the first rub, no glide up to it
    auto engine = std::make_unique<ArmonicaEngine>(fs);
    ArmonicaEngine &e = *engine;
    e.setParams(P.data());
    waitFor(e, 69);
    const double r = std::pow(2.0, 7.0 / 12);
    e.noteBend(r, 69);
    e.noteOn(69, 0.6);
    auto L = render(e, (int)(1.4 * fs));
    CHECK(std::fabs(1200 * std::log2(peakNear(L, (int)(0.8 * fs), (int)(1.4 * fs), 440 * r, fs) / (440 * r))) < 3);
    CHECK(rms(L, (int)(0.8 * fs), (int)(1.4 * fs)) > 0.01);
  }
  std::vector<float> out[2];
  for (int which = 0; which < 2; which++) {
    auto engine = std::make_unique<ArmonicaEngine>(fs);
    ArmonicaEngine &e = *engine;
    e.setParams(defaults().data());
    waitFor(e, 60); waitFor(e, 69);
    if (which) e.noteBend(1, 69);
    e.noteOn(60, 0.6); e.noteOn(69, 0.6);
    std::vector<float> L(128), R(128);
    for (int blk = 0; blk < (int)(fs / 128); blk++) {
      if (which) { e.noteBend(1, 60); e.noteBend(1, 69); e.noteBend(1, 72); }
      if (blk == 200) e.bend(0.5);
      e.process(L.data(), R.data(), 128);
      out[which].insert(out[which].end(), L.begin(), L.end());
      out[which].insert(out[which].end(), R.begin(), R.end());
    }
  }
  CHECK(out[0] == out[1]);
}

TEST("glass: ±48 semitones of each note's own bend, swept every block on a chord across the full range, stay finite and bounded at 44.1, 48 and 96 kHz") {
  for (double fs : {44100.0, 48000.0, 96000.0}) {
    auto P = defaults();
    P[p::fullRange] = 1; P[p::press] = 12;
    auto engine = std::make_unique<ArmonicaEngine>(fs);
    ArmonicaEngine &e = *engine;
    e.setParams(P.data());
    const int keys[] = {21, 45, 60, 69, 84, 108};
    for (int key : keys) { waitFor(e, key); e.noteOn(key, 0.8); }
    std::vector<float> L(128), R(128);
    double pk = 0;
    bool finite = true;
    const int blocks = (int)(3 * fs / 128);
    for (int blk = 0; blk < blocks; blk++) {
      const double t = blk * 128 / fs;
      for (int i = 0; i < 6; i++) { // a sweep each, then held at an end
        const double s = t < 2 ? std::sin(TAU * (0.7 + 0.3 * i) * t) : (i & 1 ? 1 : -1);
        e.noteBend(std::pow(2.0, 48 * s / 12), keys[i]);
      }
      e.process(L.data(), R.data(), 128);
      for (int i = 0; i < 128; i++) { finite = finite && std::isfinite(L[i]) && std::isfinite(R[i]); pk = std::max({pk, (double)std::fabs(L[i]), (double)std::fabs(R[i])}); }
    }
    std::printf("       %.1f kHz: peak %.2f\n", fs / 1000, pk);
    CHECK(finite);
    CHECK(pk < 30); // unbent, the chord peaks at 1.5–2.6; a bowl bent two octaves down, pressed this hard, speaks up to 7× louder
  }
}

TEST("glass: water poured into a ringing bowl lowers it (the voices pick up the rebuilt bowl)") {
  const double fs = 48000;
  auto P = defaults();
  P[p::split] = 0; P[p::treadle] = 0;
  auto engine = std::make_unique<ArmonicaEngine>(fs); // big for a WebAssembly stack
  ArmonicaEngine &e = *engine;
  e.setParams(P.data());
  waitFor(e, 64);
  e.noteOn(64, 0.6);
  render(e, (int)(1.5 * fs));
  P[p::water] = 0.6;
  e.setParams(P.data());
  waitFor(e, 64);
  BowlParams bp;
  bp.water = 0.6;
  const double want = bowl(64, bp).modes[0].f;
  auto L = render(e, (int)(1.5 * fs));
  const double f = zeroCrossFreq(L, (int)(0.8 * fs), (int)(1.5 * fs), fs);
  CHECK(want < 0.99 * keyFreq(64));
  CHECK(std::fabs(1200 * std::log2(f / want)) < 5);
}

TEST("glass: the views' messages: the focused bowl's modes, its contact trace, then the state") {
  const double fs = 48000;
  auto P = defaults();
  SpscQueue<Message> q(4096);
  auto engine = std::make_unique<ArmonicaEngine>(fs); // big for a WebAssembly stack
  ArmonicaEngine &e = *engine;
  e.messages = &q;
  e.setParams(P.data());
  waitFor(e, 69);
  e.noteOn(69, 0.7);
  render(e, (int)(0.8 * fs));
  Message m;
  int states = 0, modes = 0, traceS = 0, traceF = 0, sticks = 0, built = 0;
  while (q.pop(m)) {
    if (m.type == msg::q) { modes++; CHECK(m.count == 4 * 5 || m.count == 0); } // none while its bowl is being built
    else if (m.type == msg::traceS) { CHECK(m.values[0] == traceS % TRACE); traceS += m.count - 1; for (int i = 1; i < m.count; i++) sticks += m.values[i] == 0; }
    else if (m.type == msg::traceF) { CHECK(m.values[0] == traceF % TRACE); traceF += m.count - 1; }
    else if (m.type == msg::state) {
      states++;
      CHECK(m.key == 69 && traceS == states * TRACE && traceF == states * TRACE && modes == states);
      CHECK(m.values[4] == 1 && std::fabs(m.values[1] - P[p::speed]) < 1e-6);
      built += m.values[5] == 5;
    }
  }
  CHECK(states == (int)(0.8 * fs) / 128 / 12);
  CHECK(built >= states - 2);
  CHECK(sticks > 0); // speaking: the skin sticks once per cycle
}

TEST("CPU: ten bowls rubbed at once at 48 kHz take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  auto P = defaults();
  auto engine = std::make_unique<ArmonicaEngine>(fs); // big for a WebAssembly stack
  ArmonicaEngine &e = *engine;
  e.setParams(P.data());
  for (int k : {55, 59, 62, 65, 69, 72, 76, 79, 84, 88}) e.noteOn(k, 0.7);
  std::vector<float> L(128), R(128);
  for (int b = 0; b < (int)(1 * fs / 128); b++) e.process(L.data(), R.data(), 128); // let them speak
  const auto t0 = std::chrono::steady_clock::now();
  const int blocks = (int)(4 * fs / 128);
  for (int b = 0; b < blocks; b++) e.process(L.data(), R.data(), 128);
  const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 4;
  std::printf("       %d bowls: %.2f %% of a core\n", e.voiceCount(), 100 * share);
  CHECK(share < 0.2);
}

int main() { return check::run(); }
