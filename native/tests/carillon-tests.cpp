// carillon-tests.cpp — the carillon's engine in C++: the table is the FEM's, a struck bell sounds
// its nominal an octave above its key, the clapper stays on the bell about a millisecond, the views'
// messages come through, the voice pool holds whatever is played, and ten bells fit the CPU budget.
// The physics tests are the JavaScript suite's, run on the WebAssembly (node test/carillon-tests.mjs).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <string>
#include <vector>

#include "carillon-engine.h"
#include "check.h"

using namespace forte;
using namespace forte::carillon;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
static std::vector<float> render(CarillonEngine &e, int n) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  return L;
}
// |DTFT| of x[a, b) at f, Hann-windowed
static double tone(const std::vector<float> &x, double f, int a, int b, double fs) {
  const double w = TAU * f / fs;
  double re = 0, im = 0;
  for (int i = a; i < b; i++) { const double h = 0.5 - 0.5 * std::cos(TAU * (i - a) / (b - a)); re += h * x[i] * std::cos(w * i); im += h * x[i] * std::sin(w * i); }
  return std::hypot(re, im) / ((b - a) / 4.0);
}

TEST("carillon: the table has every rib's named partials at their places, and fits the engine's arrays") {
  for (const Rib &r : RIBS) {
    CHECK(r.modeCount <= MODES_MAX);
    int named = 0, res = 0;
    for (int j = 0; j < r.modeCount; j++) {
      if (r.modes[j].name != none) named++;
      if (!isMounting(r.modes[j])) res += r.modes[j].m > 0 ? 2 : 1;
      if (r.modes[j].name == prime) CHECK(r.modes[j].r == 1);
    }
    CHECK(named == 8 && res <= RES_MAX);
  }
  Bell b;
  bellOf(60, minorThird, 0, b);
  CHECK(std::string(b.rib->registerName) == "middle");
  // the nominal an octave above the key: the bell's own tuning
  for (int j = 0; j < b.rib->modeCount; j++) if (b.rib->modes[j].name == nominal) CHECK_NEAR(b.f[j], 2 * keyFreq(60), 1e-9);
}

TEST("carillon: a struck bell sounds its nominal an octave above its key; key-up changes nothing") {
  const double fs = 48000;
  auto P = defaults();
  P[p::asym] = 0;
  for (int key : {48, 60, 75, 96}) {
    CarillonEngine e(fs), f(fs);
    e.setParams(P.data()); f.setParams(P.data());
    e.noteOn(key, 0.7); f.noteOn(key, 0.7);
    f.noteOff(key, -1);
    const auto x = render(e, (int)(0.9 * fs)), y = render(f, (int)(0.9 * fs));
    const double fn = 2 * keyFreq(key);
    const int a = (int)(0.15 * fs), b = (int)x.size();
    CHECK(tone(x, fn, a, b, fs) > 20 * tone(x, fn * 1.012, a, b, fs));
    CHECK(x == y);
  }
}

TEST("carillon: the clapper stays on C4's bell about a millisecond, half as long on C5's") {
  const double fs = 48000;
  auto P = defaults();
  double ms[2];
  for (int i = 0; i < 2; i++) {
    CarillonEngine e(fs);
    e.setParams(P.data());
    e.noteOn(60 + 12 * i, 0.7);
    render(e, (int)(0.05 * fs));
    ms[i] = e.voice(0).cl.ms;
  }
  std::printf("       contact C4 %.3f ms, C5 %.3f ms\n", ms[0], ms[1]);
  CHECK(ms[0] > 0.7 && ms[0] < 1.5 && ms[1] / ms[0] > 0.35 && ms[1] / ms[0] < 0.65);
}

TEST("carillon: the views' messages: the struck bell, its partials as heard, then done") {
  const double fs = 48000;
  auto P = defaults();
  SpscQueue<Message> q(256);
  CarillonEngine e(fs);
  e.messages = &q;
  e.setParams(P.data());
  e.noteOn(67, 0.7);
  render(e, 4 * 128);
  Message m;
  int bells = 0, amps = 0, done = 0, n = 0;
  while (q.pop(m)) {
    if (m.type == msg::bell) { bells++; CHECK(m.key == 67); n = (int)m.values[0]; }
    else if (m.type == msg::amp) { CHECK(m.values[0] == amps); amps += m.count - 1; }
    else if (m.type == msg::done) { done++; CHECK(m.values[0] == n); }
  }
  CHECK(bells == 1 && done == 1 && amps == n && n == e.voice(0).N);
}

TEST("carillon: the voice pool holds anything played: every key struck again and again with the bells changed between, no more voices than the pool") {
  const double fs = 44100;
  auto P = defaults();
  CarillonEngine e(fs);
  for (int round = 0; round < 6; round++) {
    P[p::profile] = round % 2; P[p::historic] = 0.1 * round;
    e.setParams(P.data());
    for (int k = KEY_LO; k <= KEY_HI; k++) e.noteOn(k, 1);
    const auto x = render(e, 256);
    for (float v : x) CHECK(std::isfinite(v));
    CHECK(e.voiceCount() <= CarillonEngine::POOL);
  }
  render(e, (int)(0.2 * fs));
  CHECK(e.voiceCount() <= KEY_HI - KEY_LO + 1);
}

TEST("CPU: ten bells ringing at 48 kHz take a small part of a core; striking ten at once fits in a block") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  auto P = defaults();
  CarillonEngine e(fs);
  e.setParams(P.data());
  std::vector<float> L(128), R(128);
  const auto s0 = std::chrono::steady_clock::now();
  for (int k = 0; k < 10; k++) e.noteOn(KEY_LO + 4 * k, 0.8);
  const double strike = std::chrono::duration<double>(std::chrono::steady_clock::now() - s0).count();
  for (int b = 0; b < (int)(0.1 * fs / 128); b++) e.process(L.data(), R.data(), 128); // past the clappers' contact
  const auto t0 = std::chrono::steady_clock::now();
  const int blocks = (int)(4 * fs / 128);
  for (int b = 0; b < blocks; b++) e.process(L.data(), R.data(), 128);
  const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 4;
  std::printf("       %d bells ringing: %.2f %% of a core; striking ten bells took %.3f ms (a block is %.2f ms)\n", e.voiceCount(), 100 * share, 1000 * strike, 128000 / fs);
  CHECK(e.voiceCount() == 10 && share < 0.1 && strike < 0.5 * 128 / fs);
}

int main() { return check::run(); }
