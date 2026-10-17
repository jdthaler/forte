// huygens-tests.cpp — the Huygens keyboard's engine in C++: a lamp plays its design pitch, two
// lamps lock where the exact map says, the log2 of V8, the tuning, the page's state, a flood of
// notes, and ten keys fit the CPU budget. The physics tests are the JavaScript suite's, run on the
// WebAssembly (FORTE_ENGINE=wasm).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <vector>

#include "check.h"
#include "huygens-engine.h"

using namespace forte;
using namespace forte::huygens;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
static void run(NeonEngine &e, double seconds, int block = 128) {
  std::vector<float> L(block), R(block);
  for (int s = 0; s < seconds * e.fs; s += block) e.process(L.data(), R.data(), block);
}
static double cents(double r) { return 1200 * std::log2(r); }

TEST("huygens: an uncoupled lamp plays its design pitch (firing times found exactly)") {
  auto P = defaults();
  P[p::kick] = 0; P[p::pitchHold] = 0;
  for (int key : {36, 60, 96}) {
    auto e = std::make_unique<NeonEngine>(48000);
    e->setParams(P.data());
    e->noteOn(key, 1);
    run(*e, 2.5);
    NeonEngine::Report r[4];
    CHECK(e->report(1.0, r, 4) == 1);
    CHECK(std::fabs(cents(r[0].f / keyFreq(key))) < 0.01);
  }
}

TEST("huygens: two lamps that fired together lock onto the exact map's p:q") {
  auto P = defaults();
  P[p::pitchHold] = 0;
  const double f0 = 261.6256, d = deltaOf(P[p::kick], P[p::vNom], P[p::vStrike], P[p::vExt]);
  for (double c : {100.0, 386.0, 400.0, 700.0, 1000.0, 1100.0}) {
    auto e = std::make_unique<NeonEngine>(24000);
    e->setParams(P.data());
    e->offer(f0, 0, true); e->noteOn(60, 1);
    Osc *a = e->last;
    e->offer(f0 * std::pow(2, c / 1200), 0, true); e->noteOn(61, 1);
    Osc *b = e->last;
    run(*e, 0.8, 64);
    // the shared firings among the last 256 of each, and the counts between the last two
    std::vector<int64_t> sa, sb;
    for (int64_t i = std::max<int64_t>(0, a->nf - 256), j = std::max<int64_t>(0, b->nf - 256); i < a->nf && j < b->nf;) {
      const double x = a->fires[i & 255], y = b->fires[j & 255];
      if (x == y) { sa.push_back(i++); sb.push_back(j++); } else if (x < y) i++; else j++;
    }
    const size_t s = sa.size();
    const int64_t na = s >= 2 ? sa[s - 1] - sa[s - 2] : 0, nb = s >= 2 ? sb[s - 1] - sb[s - 2] : 0;
    Lock l;
    CHECK(lockRatio(std::pow(2, c / 1200), d, l));
    CHECK(na > 0 && nb * l.q == na * l.p);
  }
}

TEST("huygens: log2 is V8's, and the tuning is tuning.js's") {
  CHECK(huygens::log2(8) == 3 && huygens::log2(1) == 0 && std::isinf(huygens::log2(0)));
  CHECK_NEAR(huygens::log2(1.25), std::log2(1.25), 1e-15);
  CHECK(keyFreq(69) == 440 && keyFreq(81) == 880);
  CHECK_NEAR(tunedFreq(64, 1, 0, 0) / tunedFreq(60, 1, 0, 0), 1.25, 1e-15); // just: C–E is 5:4
  CHECK(std::fabs(cents(tunedFreq(60, 0, 0, 25) / keyFreq(60))) <= 25);
  for (int m = 0; m < 128; m++) CHECK(keyNoise(m) >= -1 && keyNoise(m) < 1);
}

TEST("huygens: the lamp voltages stay in order, and a new tuning retunes the keys held") {
  auto P = defaults();
  auto e = std::make_unique<NeonEngine>(48000);
  P[p::vNom] = 100; P[p::vStrike] = 110; P[p::vExt] = 85;
  e->setParams(P.data());
  CHECK(e->p.vStrike == 95 && e->p.vExt == 85); // V_ext ≤ the knob's V_s − 5, as engineParams
  P = defaults();
  e->setParams(P.data());
  e->noteOn(64, 1);
  Osc *held = e->last;
  e->noteOn(67, 1);
  Osc *released = e->last;
  e->noteOff(67, -1);
  P[p::tuning] = 1;
  e->setParams(P.data());
  CHECK(held->fTarget == tunedFreq(64, 1, 0, 0) && released->fTarget == keyFreq(67));
}

TEST("huygens: the page's state: posted at most 30 times a second, with every firing once") {
  auto e = std::make_unique<NeonEngine>(48000);
  SpscQueue<Message> q(64);
  e->messages = &q;
  e->listening = true;
  for (int k : {48, 52, 55, 60, 64, 67, 70, 72}) e->noteOn(k, 1);
  std::vector<float> L(128), R(128);
  int states = 0;
  int64_t delivered = 0;
  Message m;
  for (int b = 0; b < (int)(2 * 48000 / 128); b++) {
    e->process(L.data(), R.data(), 128);
    while (q.pop(m)) {
      CHECK(m.type == msg::state && e->stateT == e->t);
      states++;
      for (int i = 0; i < e->stateFires; i += 2 + (int)e->fireBuf[i + 1]) delivered += (int64_t)e->fireBuf[i + 1];
      CHECK(e->stateOsc == 8 * 3);
    }
  }
  int64_t fired = 0;
  for (int i = 0; i < e->nos; i++) fired += e->osc[i]->nf;
  CHECK(states <= 61 && states >= 55);
  CHECK(fired >= delivered && fired - delivered < fired / 20);
}

TEST("huygens: a flood of notes between two blocks fits the pool") {
  auto e = std::make_unique<NeonEngine>(48000);
  auto P = defaults();
  e->setParams(P.data());
  std::vector<float> L(128), R(128);
  for (int round = 0; round < 4; round++) {
    for (int k = 0; k < 128; k++) e->noteOn(k, 1);
    for (int k = 0; k < 128; k += 2) { e->noteOff(k, -1); e->noteOn(k, 1); }
    e->process(L.data(), R.data(), 128);
    CHECK(e->nos <= NeonEngine::kPool);
  }
  e->allNotesOff();
  run(*e, 1);
  CHECK(e->voiceCount() == 0);
  for (int i = 0; i < 128; i++) CHECK(std::isfinite(L[i]));
}

TEST("CPU: ten keys at 48 kHz, coupled, take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  auto P = defaults();
  P[p::drift] = 5;
  auto e = std::make_unique<NeonEngine>(fs);
  e->setParams(P.data());
  for (int k = 0; k < 10; k++) e->noteOn(48 + 3 * k, 1);
  std::vector<float> L(128), R(128);
  for (int b = 0; b < (int)(fs / 128); b++) e->process(L.data(), R.data(), 128);
  const auto t0 = std::chrono::steady_clock::now();
  const int blocks = (int)(4 * fs / 128);
  for (int b = 0; b < blocks; b++) e->process(L.data(), R.data(), 128);
  const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 4;
  std::printf("       %d lamps: %.2f %% of a core\n", e->voiceCount(), 100 * share);
  CHECK(share < 0.1);
}

int main() { return check::run(); }
