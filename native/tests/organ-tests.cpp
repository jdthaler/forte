// organ-tests.cpp — the tonewheel organ's engine in C++: the gears, the foldback and V8's tanh and
// hypot; two renders the JavaScript engine's to the last bit (sums of its samples from
// organ-engine.js, written here by hand); a key plays its wheel; the console's parameters; the
// state for the page; and ten keys fit the CPU budget. The physics tests are the JavaScript
// suite's, run on the WebAssembly (FORTE_ENGINE=wasm). The plugin's switches (CC1, CC64, Space)
// are in organ-plugin-tests.cpp.

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <vector>

#include "check.h"
#include "forte/fdlibm.h"
#include "organ-engine.h"

using namespace forte;
using namespace forte::organ;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
struct Render { double sum = 0; float lastL = 0, lastR = 0; };
// n samples in blocks of 128, as the JavaScript renders, with `changes` before each block
template <class F> static Render render(OrganEngine &e, int n, F changes) {
  Render r;
  std::vector<float> L(128), R(128);
  for (int s = 0; s < n; s += 128) {
    changes(s);
    e.process(L.data(), R.data(), 128);
    for (int i = 0; i < 128; i++) r.sum += (double)L[i] * L[i] + (double)R[i] * R[i];
    r.lastL = L[127]; r.lastR = R[127];
  }
  return r;
}

TEST("organ: the gears put A4 at 440 Hz and every wheel within 0.71 ¢ (2.1 ¢ on 192 teeth); the foldback") {
  CHECK(gearFreq(46) == 440);
  for (int w = 1; w <= 84; w++) CHECK(std::fabs(centsOff(w)) < 0.71);
  for (int w = 85; w <= NUM_WHEELS; w++) CHECK(wheelSpec(w).teeth == 192 && std::fabs(centsOff(w)) < 2.1);
  CHECK(keyWheel(36, 2) == 13 && keyWheel(36, 0) == 1 && keyWheel(96, 8) == 85);
  Analysis a[9];
  keyAnalysis(60, gears, 60, a);
  CHECK(std::fabs(a[6].cents - 13.7) < 1 && std::fabs(a[4].cents + 1.96) < 1);
}

TEST("organ: tanh and hypot are V8's (Math.tanh, Math.hypot)") {
  CHECK(fdlibm::tanh(0.3) == 0.29131261245159090);
  CHECK(fdlibm::tanh(-1.7) == -0.93540907060309897);
  CHECK(fdlibm::hypot(0.3, -1.1) == 1.1401754250991381);
  CHECK(fdlibm::tanh(30) == 1 && fdlibm::hypot(0, 0) == 0 && std::isinf(fdlibm::hypot(INFINITY, NAN)));
}

TEST("organ: plays what the JavaScript plays, to the last bit (a chord; harmonic tuning, changes)") {
  {
    auto e = std::make_unique<OrganEngine>(48000);
    auto P = defaults();
    e->setParams(P.data());
    for (int k : {48, 55, 64}) e->noteOn(k, 0.8);
    const Render r = render(*e, 9600, [](int) {});
    CHECK(r.sum == 91.403127946339694 && r.lastL == 0.00607270654f && r.lastR == 0.0798079371f && e->peak == 0.079807937622808425);
  }
  {
    auto e = std::make_unique<OrganEngine>(44100);
    auto P = defaults();
    P[p::tuning] = harmonic; P[p::percOn] = 1; P[p::vib] = vib_::V2; P[p::leslie] = leslie_::fast; P[p::drive] = 0.6;
    const int bars[9] = {8, 6, 8, 4, 3, 0, 2, 1, 5};
    for (int d = 0; d < 9; d++) P[p::drawbar1 + d] = bars[d];
    e->setParams(P.data());
    for (int k : {36, 60, 61, 96}) e->noteOn(k, 0.8);
    const Render r = render(*e, 12800, [&](int s) {
      if (s == 3200) { e->noteOff(60, -1); P[p::mains] = 50; P[p::expression] = 0.5; e->setParams(P.data()); }
      if (s == 6400) { P[p::motor] = 0; P[p::crossover] = 1200; e->setParams(P.data()); }
    });
    CHECK(r.sum == 59.960468741371010 && r.lastL == 0.00854628813f && r.lastR == 0.0208018459f && e->peak == 0.020801846486066259);
  }
}

TEST("organ: one key, 8' only, plays its wheel; the keys retire when let go") {
  auto e = std::make_unique<OrganEngine>(48000);
  auto P = defaults();
  P[p::vib] = vib_::off; P[p::leslie] = leslie_::bypass; P[p::drive] = 0; P[p::leakage] = -90; P[p::crosstalk] = -80;
  P[p::wheelHarm] = 0; P[p::spread] = 0; P[p::bounce] = 0;
  for (int d = 0; d < 9; d++) P[p::drawbar1 + d] = d == 2 ? 8 : 0;
  e->setParams(P.data());
  e->noteOn(69, 100 / 127.0);
  std::vector<double> L(24000), R(24000);
  for (int s = 0; s < 24000; s += 128) e->processDouble(L.data() + s, R.data() + s, std::min(128, 24000 - s));
  std::vector<double> t;
  for (int i = 4801; i < 24000; i++) if (L[i - 1] < 0 && L[i] >= 0) t.push_back(i - 1 + L[i - 1] / (L[i - 1] - L[i]));
  CHECK(std::fabs((t.size() - 1) * 48000 / (t.back() - t.front()) - 440) < 0.05);
  CHECK(e->voiceCount() == 1);
  e->noteOff(69, -1);
  for (int s = 0; s < 4800; s += 128) e->processDouble(L.data(), R.data(), 128);
  CHECK(e->voiceCount() == 0 && e->keyCount() == 0);
}

TEST("organ: the console's parameters: drawbars, percussion, vibrato, the Leslie switch and the motor") {
  auto e = std::make_unique<OrganEngine>(48000);
  auto P = defaults();
  e->setParams(P.data());
  CHECK(e->p.leslieOn && e->p.leslie == Params::slow && e->p.vib == vib_::C3 && e->p.motor && e->p.drawbars[2] == 8 && e->p.drawbars[3] == 0);
  P[p::leslie] = leslie_::fast; P[p::drawbar4] = 5; P[p::percOn] = 1; P[p::motor] = 0;
  e->setParams(P.data());
  CHECK(e->p.leslie == Params::fast && e->p.drawbars[3] == 5 && e->p.percOn && !e->p.motor);
  P[p::leslie] = leslie_::bypass; // bypassed: the rotors keep the speed they were set to
  e->setParams(P.data());
  CHECK(!e->p.leslieOn && e->p.leslie == Params::fast);
  P[p::leslie] = leslie_::stop;
  e->setParams(P.data());
  CHECK(e->p.leslieOn && e->p.leslie == Params::stop);
  // a preset sets the whole console (gen-native-params: the defaults, then the preset's)
  for (const Preset &pr : kPresets) {
    int console = 0;
    for (int j = 0; j < pr.count; j++) if (pr.values[j].param >= p::drawbar1) console++;
    CHECK(console == p::count - p::drawbar1);
  }
}

TEST("organ: the generator is rebuilt in place for a new mains frequency, and the motor coasts") {
  auto e = std::make_unique<OrganEngine>(48000);
  auto P = defaults();
  e->setParams(P.data());
  e->noteOn(60, 0.8);
  std::vector<float> L(128), R(128);
  for (int b = 0; b < 40; b++) e->process(L.data(), R.data(), 128);
  P[p::mains] = 50;
  const auto t0 = std::chrono::steady_clock::now();
  e->setParams(P.data());
  const double ms = 1000 * std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
  std::printf("       rebuilt in %.3f ms\n", ms);
  CHECK(ms < 5);
  P[p::motor] = 0;
  e->setParams(P.data());
  for (int b = 0; b < 375; b++) e->process(L.data(), R.data(), 128);
  CHECK(e->speed < 0.95 && e->speed > 0.6);
}

TEST("organ: the page's state, every 768 samples") {
  auto e = std::make_unique<OrganEngine>(48000);
  SpscQueue<Message> q(64);
  e->messages = &q;
  auto P = defaults();
  e->setParams(P.data());
  std::vector<float> L(128), R(128);
  int states = 0;
  Message m;
  for (int b = 0; b < 60; b++) {
    e->process(L.data(), R.data(), 128);
    while (q.pop(m)) { CHECK(m.type == msg::state && m.count == 8 && m.values[0] == (float)e->speed && m.values[6] == 18); states++; }
  }
  CHECK(states == 10);
}

TEST("CPU: ten keys at 48 kHz, full drawbars, chorus, drive and the Leslie, take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  auto P = defaults();
  for (int d = 0; d < 9; d++) P[p::drawbar1 + d] = 8;
  P[p::leslie] = leslie_::fast; P[p::drive] = 0.5; P[p::percOn] = 1;
  auto e = std::make_unique<OrganEngine>(fs);
  e->setParams(P.data());
  for (int k : {36, 43, 48, 52, 55, 60, 64, 67, 72, 76}) e->noteOn(k, 100 / 127.0);
  std::vector<float> L(128), R(128);
  for (int b = 0; b < 100; b++) e->process(L.data(), R.data(), 128);
  const auto t0 = std::chrono::steady_clock::now();
  const int blocks = (int)(4 * fs / 128);
  for (int b = 0; b < blocks; b++) e->process(L.data(), R.data(), 128);
  const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 4;
  std::printf("       %d keys: %.2f %% of a core\n", e->voiceCount(), 100 * share);
  CHECK(share < 0.3);
}

int main() { return check::run(); }
