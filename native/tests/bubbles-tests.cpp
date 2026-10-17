// bubbles-tests.cpp — the bubble organ's engine in C++: a ping rings at its bubble's frequency
// and starts at the kick's pressure, the views' messages come through, and ten brooks fit the
// CPU budget. The physics tests are the JavaScript suite's, run on the WebAssembly
// (FORTE_ENGINE=wasm).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <vector>

#include "bubbles-engine.h"
#include "check.h"
#include "forte/dsp.h"

using namespace forte;
using namespace forte::bubbles;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
static std::vector<float> render(BubbleEngine &e, int n, std::vector<float> *right = nullptr) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  if (right) *right = R;
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

TEST("bubbles: a ping rings at its bubble's frequency, starting at the kick's pressure 2εσ/r") {
  const double fs = 48000;
  auto P = defaults();
  P[p::snap] = 0.01;
  for (int key : {60, 72, 90}) {
    BubbleEngine e(fs);
    e.setParams(P.data());
    e.noteOn(key, 0.8);
    e.noteOff(key, -1);
    std::vector<float> R;
    auto L = render(e, (int)(0.05 * fs), &R);
    const Acoustics a = acoustics(keyRadius(key, P.data(), nozzleEnv(P.data())), nozzleEnv(P.data()));
    const double f = zeroCrossFreq(L, 48, 48 + (int)(0.02 * fs), fs);
    CHECK(std::fabs(1200 * std::log2(f / a.fd)) < 2); // it rises (and so glides up) a little
    CHECK(std::fabs(1200 * std::log2(a.fd / keyFreq(key))) < 0.01);
    double g[2], pk = 0;
    hydrophoneGains(key, g);
    for (size_t i = 0; i < L.size(); i++) pk = std::max({pk, std::fabs(L[i]) / g[0], std::fabs(R[i]) / g[1]});
    CHECK(std::fabs(20 * std::log10(pk / peakPressure(LIQUIDS[0], 0.8))) < 0.5);
  }
}

TEST("bubbles: the views' messages: each release, the brook's summary and the latest bubble's waveform") {
  const double fs = 48000;
  auto P = defaults();
  SpscQueue<Message> q(1024);
  BubbleEngine e(fs);
  e.messages = &q;
  e.setParams(P.data());
  e.noteOn(69, 0.7);
  render(e, 128);
  int releases = 0, summaries = 0, starts = 0, samples = 0, shows = 0;
  Message m;
  auto drain = [&] {
    while (q.pop(m)) {
      if (m.type == msg::release) { releases++; CHECK(m.key == 69 && m.values[0] == 0); }
      else if (m.type == msg::bubbles) { CHECK(m.values[2] == 128 && (summaries > 0 || m.values[3] == 1)); summaries++; }
      else if (m.type == msg::waveStart) starts++;
      else if (m.type == msg::waveData) { CHECK(m.values[0] == samples); samples += m.count - 1; }
      else if (m.type == msg::waveShow) { shows++; CHECK(m.values[0] == samples); }
    }
  };
  drain();
  CHECK(releases == 1 && summaries == 1);
  e.noteOff(69, -1);
  for (int b = 0; b < 400; b++) { render(e, 128); drain(); }
  CHECK(starts == 1 && shows >= 2 && samples == BubbleEngine::WAVE_N);
}

TEST("CPU: ten brooks at 48 kHz (40 bubbles a second each) take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  auto P = defaults();
  P[p::rate] = 40;
  BubbleEngine e(fs);
  e.setParams(P.data());
  for (int k = 0; k < 10; k++) e.noteOn(KEY_LO + 5 * k, 0.8);
  std::vector<float> L(128), R(128);
  for (int b = 0; b < (int)(2 * fs / 128); b++) e.process(L.data(), R.data(), 128); // let the brooks fill
  const auto t0 = std::chrono::steady_clock::now();
  const int blocks = (int)(4 * fs / 128);
  for (int b = 0; b < blocks; b++) e.process(L.data(), R.data(), 128);
  const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 4;
  std::printf("       %d bubbles ringing: %.2f %% of a core\n", e.voiceCount(), 100 * share);
  CHECK(share < 0.1);
}

int main() { return check::run(); }
