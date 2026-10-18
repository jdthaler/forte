// pyrophone-tests.cpp — the pyrophone's model and engine in C++: the published eigenvalues and the
// default tube's thresholds, a note that waits for its tube's tuning (built on the worker) and then
// sings in tune, a tube change that keeps the old table until the new one is in, the key-up power
// deciding whether a tube remembers its note, aftertouch, the views' messages, and ten tubes in the
// CPU budget. The physics tests are the JavaScript suite's, run on the WebAssembly
// (node test/pyrophone-tests.mjs).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <thread>
#include <vector>

#include "check.h"
#include "forte/dsp.h"
#include "pyrophone-engine.h"

using namespace forte;
using namespace forte::pyrophone;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
// the tuning is built on a worker thread: wait for it, not for a number of samples
static void waitFor(PyrophoneEngine &e) {
  for (int i = 0; i < 5000 && !e.ready(); i++) std::this_thread::sleep_for(std::chrono::milliseconds(1));
  CHECK(e.ready());
}
static std::vector<float> render(PyrophoneEngine &e, int n) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  return L;
}
// frequency from interpolated upward zero crossings over [a, b)
static double zeroCrossFreq(const std::vector<float> &x, int a, int b, double fs) {
  double first = -1, last = -1;
  int n = 0;
  for (int i = a + 1; i < b; i++) if (x[i - 1] <= 0 && x[i] > 0) {
    const double t = i - 1 + x[i - 1] / (x[i - 1] - x[i]);
    if (first < 0) first = t; else { n++; last = t; }
  }
  return n * fs / (last - first);
}
static double peak(const std::vector<float> &x, int a, int b) {
  double m = 0;
  for (int i = a; i < b; i++) m = std::max(m, (double)std::fabs(x[i]));
  return m;
}

TEST("pyrophone model: Magri & Juniper's eigenvalues, and the default tube's Hopf point and fold") {
  const Tube sys = tubeC(0.01, 0.004, 0.25, 0.01);
  const Cx a = root(sys, 0, 0.1, true), b = root(sys, 0, 0.5, true);
  CHECK(std::fabs(a.re + 0.0056) < 5e-5 && std::fabs(a.im - 3.1848) < 5e-5);
  CHECK(std::fabs(b.re - 0.00023) < 5e-6 && std::fabs(b.im - 3.3570) < 5e-5);
  const Tuning t = tuning(TubeParams{});
  CHECK(t.mode == 1);
  CHECK_NEAR(t.betaH, 0.0884, 5e-4);
  CHECK_NEAR(t.fold, 0.0768, 5e-4);
  CHECK(t.betaMax / t.betaH > 6 && t.betaMax / t.betaH < 6.3); // the scream's ceiling: 6.1 × threshold
  // the flame's reactance raises the pitch above π: 12.7 ¢ at the Hopf point
  CHECK_NEAR(1200 * std::log2(t.W(t.betaH) / std::numbers::pi), 12.7, 0.5);
}

TEST("pyrophone: a note played before its tube's tuning is built waits for it, then sings in tune") {
  const double fs = 48000;
  auto P = defaults();
  P[p::drift] = 0;
  auto engine = std::make_unique<PyrophoneEngine>(fs); // big for a WebAssembly stack
  PyrophoneEngine &e = *engine;
  e.setParams(P.data());
  e.noteOn(69, 0.7); // at once: the table is still being built on the worker (or, without threads, now)
  for (int i = 0; i < 5000 && !e.voiceCount(); i++) { render(e, 128); if (!e.voiceCount()) std::this_thread::sleep_for(std::chrono::milliseconds(1)); }
  CHECK(e.voiceCount() == 1);
  const auto L = render(e, (int)(1.6 * fs));
  const double f = zeroCrossFreq(L, (int)(1.1 * fs), (int)(1.6 * fs), fs);
  CHECK(std::fabs(1200 * std::log2(f / 440)) < 3);
  const double pk = peak(L, 0, (int)L.size());
  CHECK(pk > 0.05 && pk < 0.5);
}

TEST("pyrophone: a new tube keeps playing from the last table until its own is in") {
  const double fs = 48000;
  auto P = defaults();
  auto engine = std::make_unique<PyrophoneEngine>(fs);
  PyrophoneEngine &e = *engine;
  e.setParams(P.data());
  waitFor(e);
  e.noteOn(60, 0.7);
  render(e, 4800);
  const Tuning *before = e.tune;
  P[p::bore] = 0.05;
  e.setParams(P.data());
  e.noteOn(64, 0.7); // no wait: the old table cuts it
  CHECK(e.voiceCount() == 2 && e.tune != nullptr);
  waitFor(e);
  render(e, 128);
  CHECK(e.tune != before && e.tune->P.bore == 0.05);
  const auto L = render(e, (int)(0.5 * fs));
  for (float x : L) CHECK(std::isfinite(x));
}

TEST("pyrophone: released at the default key-up power a tube dies and is freed; in the bistable band it sings on") {
  const double fs = 48000;
  for (double keyup : {0.2, 0.93}) {
    auto P = defaults();
    P[p::keyup] = keyup;
    auto engine = std::make_unique<PyrophoneEngine>(fs);
    PyrophoneEngine &e = *engine;
    e.setParams(P.data());
    waitFor(e);
    e.noteOn(72, 0.8);
    render(e, (int)(1.0 * fs));
    e.noteOff(72, -1);
    const auto L = render(e, (int)(2.0 * fs));
    const double late = peak(L, (int)(1.5 * fs), (int)(2.0 * fs));
    if (keyup < 0.5) CHECK(e.voiceCount() == 0 && late == 0);
    else CHECK(e.voiceCount() == 1 && late > 0.05);
  }
}

TEST("pyrophone: aftertouch parts a held tube's flames further, below the scream") {
  const double fs = 48000;
  auto P = defaults();
  auto engine = std::make_unique<PyrophoneEngine>(fs);
  PyrophoneEngine &e = *engine;
  e.setParams(P.data());
  waitFor(e);
  e.noteOn(60, 0.5);
  const double b0 = e.voices[0]->betaT;
  e.pressure(1, 60);
  const double b1 = e.voices[0]->betaT;
  CHECK_NEAR(b1 / b0, 1.25, 1e-12);
  e.noteOn(62, 1);
  e.pressure(1, 62);
  CHECK(e.voices[1]->betaT <= e.tune->betaMax);
}

TEST("pyrophone: the views' messages (every tube, the focused one's trail and snapshot) come through") {
  const double fs = 48000;
  auto P = defaults();
  auto engine = std::make_unique<PyrophoneEngine>(fs);
  PyrophoneEngine &e = *engine;
  SpscQueue<Message> q(512);
  e.messages = &q;
  e.setParams(P.data());
  waitFor(e);
  e.noteOn(60, 0.8);
  e.noteOn(67, 0.8);
  int tubes = 0, trail = 0, focus = 0, ends = 0, snaps = 0;
  std::vector<float> L(128), R(128);
  for (int b = 0; b < (int)(0.5 * fs / 128); b++) {
    e.process(L.data(), R.data(), 128);
    for (Message m; q.pop(m);) {
      if (m.type == msg::tube) tubes++;
      if (m.type == msg::trail) trail++;
      if (m.type == msg::focus) { focus++; CHECK(m.key == 67); if (m.values[8] > 0) snaps++; }
      if (m.type == msg::end) { ends++; CHECK(m.values[0] == 2); }
    }
  }
  CHECK(ends > 20 && tubes == 2 * ends && focus == ends && trail >= ends && snaps > 5);
}

TEST("CPU: ten tubes singing at once at 48 kHz take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  auto P = defaults();
  auto engine = std::make_unique<PyrophoneEngine>(fs);
  PyrophoneEngine &e = *engine;
  e.setParams(P.data());
  waitFor(e);
  for (int k : {48, 52, 55, 60, 64, 67, 71, 72, 76, 79}) e.noteOn(k, 0.8);
  std::vector<float> L(128), R(128);
  for (int b = 0; b < (int)(1 * fs / 128); b++) e.process(L.data(), R.data(), 128); // let them speak
  const auto t0 = std::chrono::steady_clock::now();
  const int blocks = (int)(4 * fs / 128);
  for (int b = 0; b < blocks; b++) e.process(L.data(), R.data(), 128);
  const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 4;
  std::printf("       %d tubes: %.2f %% of a core\n", e.voiceCount(), 100 * share);
  CHECK(share < 0.1);
}

int main() { return check::run(); }
