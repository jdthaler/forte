// bubbles-tests.cpp — the bubble organ's engine in C++: a ping rings at its bubble's frequency
// and starts at the kick's pressure, the pitch wheel, each key's own bend and rate (MPE), the
// views' messages come through, and ten brooks fit the
// CPU budget. The physics tests are the JavaScript suite's, run on the WebAssembly
// (node test/bubbles-tests.mjs).

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

TEST("bubbles: pitch bend pumps the air above the water: a bubble released after it sounds two semitones off at the wheel's ends") {
  const double fs = 48000;
  auto P = defaults();
  P[p::snap] = 0.01;
  for (int key : {60, 72, 90}) for (double v : {1.0, -1.0}) {
    BubbleEngine e(fs);
    e.setParams(P.data());
    e.bend(v);
    render(e, (int)(0.3 * fs)); // the pump reaches its pressure
    e.noteOn(key, 0.8);
    e.noteOff(key, -1);
    auto L = render(e, (int)(0.05 * fs));
    const double want = keyFreq(key) * std::pow(2.0, 2 * v / 12), f = zeroCrossFreq(L, 48, 48 + (int)(0.02 * fs), fs);
    CHECK(std::fabs(1200 * std::log2(f / want)) < 5); // surface tension stiffens the smallest a little beyond Minnaert
  }
}

static double peakOf(const std::vector<float> &x) { double p = 0; for (float v : x) p = std::max(p, (double)std::fabs(v)); return p; }

TEST("bubbles: a key's own bend (MPE) sizes its nozzle's bubbles to ring ×r, up to two octaves either way, starting at the same kick's pressure") {
  const double fs = 48000;
  auto P = defaults();
  P[p::snap] = 0.01;
  for (int key : {60, 72, 90}) for (double st : {-24.0, -12.0, -2.0, 2.0, 12.0, 24.0}) {
    BubbleEngine e(fs);
    e.setParams(P.data());
    e.noteBend(std::pow(2.0, st / 12), key); // before the key: its first bubble already bent
    e.noteOn(key, 0.8);
    e.noteOff(key, -1);
    auto L = render(e, (int)(0.1 * fs));
    const double want = keyFreq(key) * std::pow(2.0, st / 12), f = zeroCrossFreq(L, 48, 48 + (int)(std::max(0.02, 4 / want) * fs), fs);
    double g[2];
    hydrophoneGains(key, g);
    CHECK(std::fabs(1200 * std::log2(f / want)) < 3); // it rises (and so glides up) a little: C2's 5 cm bubble, the quickest, 2 ¢
    CHECK(std::fabs(20 * std::log10(peakOf(L) / g[0] / peakPressure(LIQUIDS[0], 0.8))) < (std::fabs(st) > 12 ? 1.5 : 0.5));
  }
}

TEST("bubbles: a lone key's own bend sounds as the wheel bent as far, two semitones up and down; another key's bubbles beside it keep their size") {
  const double fs = 48000;
  auto P = defaults();
  P[p::snap] = 0.01;
  for (int key : {60, 72, 90}) for (double v : {1.0, -1.0}) {
    double f[2], pk[2];
    for (int which = 0; which < 2; which++) {
      BubbleEngine e(fs);
      e.setParams(P.data());
      if (which) e.noteBend(std::pow(2.0, 2 * v / 12), key); else e.bend(v);
      render(e, (int)(0.3 * fs));
      e.noteOn(key, 0.8);
      e.noteOff(key, -1);
      auto L = render(e, (int)(0.05 * fs));
      f[which] = zeroCrossFreq(L, 48, 48 + (int)(0.02 * fs), fs);
      pk[which] = peakOf(L);
    }
    CHECK(std::fabs(1200 * std::log2(f[1] / f[0])) < 5); // the pump's bubbles: surface tension stiffens the smallest a little beyond Minnaert
    CHECK(std::fabs(1200 * std::log2(f[1] / (keyFreq(key) * std::pow(2.0, 2 * v / 12)))) < 2);
    CHECK(std::fabs(20 * std::log10(pk[1] / pk[0])) < 0.5);
  }
  // held beside a bent key, a key's bubbles are the ones it releases alone (the same seeded gaps and sizes)
  std::vector<BubbleEngine::LogEntry> logs[2];
  for (int which = 0; which < 2; which++) {
    BubbleEngine e(fs);
    e.logging = true;
    e.setParams(defaults().data());
    e.noteOn(60, 0.8); e.noteOn(72, 0.8);
    render(e, (int)(0.5 * fs));
    if (which) e.noteBend(std::pow(2.0, 7.0 / 12), 72);
    render(e, (int)(1.5 * fs));
    for (const auto &l : e.log) if (l.key == 60) logs[which].push_back(l);
  }
  CHECK(logs[0].size() > 5 && logs[0].size() == logs[1].size());
  for (size_t i = 0; i < logs[0].size() && i < logs[1].size(); i++) CHECK(logs[0][i].R == logs[1][i].R && logs[0][i].frame == logs[1][i].frame);
}

TEST("bubbles: a key's own slide (MPE) is its nozzle's own bubble rate: a lone key slid to 20 /s plays every sample as the rate set to 20, and a key held beside it keeps the set rate") {
  const double fs = 48000;
  std::vector<float> out[2];
  for (int which = 0; which < 2; which++) {
    auto P = defaults();
    if (!which) P[p::rate] = 20;
    BubbleEngine e(fs);
    e.setParams(P.data());
    if (which) e.slide(20, 69); // before the key: its first gap already at that rate
    e.noteOn(69, 0.8);
    out[which] = render(e, (int)(1 * fs));
    if (which) e.slide(35, 69); else { P[p::rate] = 35; e.setParams(P.data()); } // and moved while it plays
    auto more = render(e, (int)(1 * fs));
    out[which].insert(out[which].end(), more.begin(), more.end());
  }
  CHECK(out[0] == out[1]);
  BubbleEngine e(fs);
  e.setParams(defaults().data());
  e.slide(30, 60);
  e.noteOn(60, 0.8); e.noteOn(72, 0.8);
  render(e, (int)(4 * fs));
  const int n60 = e.nozzles[60 - KEY_LO].released, n72 = e.nozzles[72 - KEY_LO].released;
  CHECK(n60 > 90 && n60 < 150); // 30 /s
  CHECK(n72 > 12 && n72 < 30);  // 5 /s
}

TEST("bubbles: bends of 1 and slides of NaN, sent every block, leave every sample as it was, the wheel moving") {
  const double fs = 44100;
  std::vector<float> out[2];
  for (int which = 0; which < 2; which++) {
    BubbleEngine e(fs);
    e.setParams(defaults().data());
    if (which) { e.noteBend(1, 69); e.slide(NAN, 69); }
    for (int key : {60, 69, 81}) e.noteOn(key, 0.8);
    std::vector<float> L(128), R(128);
    for (int blk = 0; blk < 700; blk++) {
      if (which) for (int key : {60, 69, 81, 90}) { e.noteBend(1, key); e.slide(NAN, key); }
      if (blk == 300) e.bend(0.6);
      e.process(L.data(), R.data(), 128);
      out[which].insert(out[which].end(), L.begin(), L.end());
      out[which].insert(out[which].end(), R.begin(), R.end());
    }
  }
  CHECK(out[0] == out[1]);
}

TEST("bubbles: ±24 semitones of each key's own bend and its slide over the wheel's range, swept every block on a chord from A3 to C8, stay finite and bounded at 44.1, 48 and 96 kHz") {
  for (double fs : {44100.0, 48000.0, 96000.0}) {
    double peak[2];
    for (int swept = 0; swept < 2; swept++) {
      auto P = defaults();
      if (!swept) P[p::rate] = 40; // the same chord at the top rate, unbent
      BubbleEngine e(fs);
      e.setParams(P.data());
      const int keys[] = {57, 64, 72, 84, 96, 108};
      for (int key : keys) e.noteOn(key, 1);
      std::vector<float> L(128), R(128);
      double pk = 0;
      bool finite = true;
      const int blocks = (int)(3 * fs / 128);
      for (int blk = 0; blk < blocks; blk++) {
        const double t = blk * 128 / fs;
        if (swept) for (int i = 0; i < 6; i++) { // a sweep each, then held at an end
          const double s = t < 2 ? std::sin(TAU * (0.7 + 0.3 * i) * t) : (i & 1 ? 1 : -1);
          e.noteBend(std::pow(2.0, 24 * s / 12), keys[i]);
          e.slide(5 + 35 * (0.5 + 0.5 * std::sin(TAU * (1.1 + 0.2 * i) * t)), keys[i]);
        }
        e.process(L.data(), R.data(), 128);
        for (int i = 0; i < 128; i++) { finite = finite && std::isfinite(L[i]) && std::isfinite(R[i]); pk = std::max({pk, (double)std::fabs(L[i]), (double)std::fabs(R[i])}); }
      }
      CHECK(finite);
      CHECK(e.voiceCount() <= BubbleEngine::kPool);
      peak[swept] = pk;
    }
    std::printf("       %.1f kHz: peak %.2f swept, %.2f unbent at 40 /s\n", fs / 1000, peak[1], peak[0]);
    CHECK(peak[1] < 2 * peak[0]);
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
