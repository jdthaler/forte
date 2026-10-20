// pianet-tests.cpp — the sticky-pad piano in C++: the reed's finite elements against the exact
// cantilever, every key cut to pitch, Kendall's pull-off, the engine on pitch with a note that
// waits for its reed (forte/background.h), the release message, a re-cut reed while a note
// sounds, voice stealing and Panic, every sample rate, and ten voices within the CPU budget.
// The physics tests are the JavaScript suite's, run on the WebAssembly (node test/pianet-tests.mjs).

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <thread>
#include <vector>

#include "check.h"
#include "pianet-engine.h"

using namespace forte;
using namespace forte::pianet;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
static std::vector<float> render(PianetEngine &e, int n) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  return L;
}
static void waitFor(PianetEngine &e, int key) {
  for (int i = 0; i < 5000 && !e.ready(key); i++) std::this_thread::sleep_for(std::chrono::milliseconds(1));
  CHECK(e.ready(key));
}
static double cents(double a, double b) { return 1200 * std::log2(a / b); }
static double tone(const std::vector<float> &x, double f, int a, int b, double fs) {
  double re = 0, im = 0;
  for (int i = a; i < b; i++) { const double h = 0.5 - 0.5 * std::cos(TAU * (i - a) / (b - a)); re += h * x[i] * std::cos(TAU * f * i / fs); im += h * x[i] * std::sin(TAU * f * i / fs); }
  return std::hypot(re, im);
}
static double peak(const std::vector<float> &x, int a = 0, int b = -1) {
  double p = 0;
  for (int i = a; i < (b < 0 ? (int)x.size() : b); i++) p = std::max(p, (double)std::fabs(x[i]));
  return p;
}

TEST("reed: the finite elements match the exact cantilever with a tip mass (Blevins), and the bare strip's ratios") {
  for (double R : {0.0, 0.5, 2.0}) {
    const auto roots = tipMassRoots(R, 3);
    const UnitReed u = unitReed(R, 1, 0, 3);
    CHECK(roots.size() == 3);
    for (int n = 0; n < 3; n++) CHECK(std::fabs(u.Lam[n] / (roots[n] * roots[n]) - 1) < 1e-4);
  }
  const UnitReed bare = unitReed(0, 1, 0, 4);
  const double r[3] = {6.2669, 17.5475, 34.3861};
  for (int i = 0; i < 3; i++) CHECK(std::fabs(bare.Lam[i + 1] / bare.Lam[0] - r[i]) < 2e-3 * r[i]);
  CHECK(bare.shape(0, 1) > 0 && std::fabs(bare.shape(0, 0)) < 1e-15); // positive at the tip, clamped
}

TEST("reed: every key is cut to its pitch; its kept modes carry the static compliance x³/3EI at the pad") {
  for (int m = KEY_LO; m <= KEY_HI; m++) {
    const KeyReed kr = keyReed(m, 1, 1.2e-3, 96000);
    CHECK(std::fabs(cents(kr.modes[0].f, pianet::keyFreq(m))) < 0.01);
    const double exact = kr.xc * kr.xc * kr.xc / (3 * kr.EI), c = 1 / kr.kc / exact;
    CHECK(c > 0.99 && c <= 1);
  }
}

TEST("bond: slow loading pulls off at Kendall's F₀; fast loading follows the closed form") {
  const double F0 = 0.25, n = 0.6;
  CHECK(std::fabs(std::sqrt(8 * PI * std::pow(PAD.a0, 3) * PAD.Estar * workOfAdhesion(F0)) / F0 - 1) < 1e-12);
  CHECK(pullOff(1e-4, F0, n, 1) / F0 < 1.005);
  const double R = 1e4;
  CHECK(std::fabs(pullOff(R, F0, n, 2e-9) / pullOffFast(R, F0, n) - 1) < 0.04);
}

TEST("engine: a note waits for its reed, then sounds on pitch and posts where the pad let go") {
  const double fs = 48000;
  auto P = defaults();
  P[p::tone] = 20000;
  auto e = std::make_unique<PianetEngine>(fs);
  SpscQueue<Message> q(256);
  e->messages = &q;
  e->setParams(P.data());
  waitFor(*e, 60);
  e->noteOn(60, 0.6);
  const auto x = render(*e, (int)(0.65 * fs));
  CHECK(e->voiceCount() == 1);
  // the strongest partial near C4, by a scan of ±8 ¢
  const double f0 = pianet::keyFreq(60);
  double best = 0, bf = f0;
  for (double c = -8; c <= 8; c += 0.25) { const double f = f0 * std::pow(2.0, c / 1200), g = tone(x, f, (int)(0.12 * fs), (int)x.size(), fs); if (g > best) { best = g; bf = f; } }
  CHECK(std::fabs(cents(bf, f0)) < 3);
  const double pk = peak(x);
  CHECK(pk > 0.1 && pk < 0.5);
  Message m;
  bool got = false;
  while (q.pop(m)) if (m.type == msg::release && m.key == 60) { got = true; CHECK(m.values[1] > 0.1 && m.values[1] < 2); CHECK(m.values[3] > 0 && m.values[3] < 0.2); }
  CHECK(got);
}

TEST("engine: pitch bend stiffens or softens the reeds: a note struck before it and one after both follow") {
  const double fs = 48000;
  auto P = defaults();
  P[p::tone] = 20000;
  for (double v : {1.0, -1.0}) {
    auto e = std::make_unique<PianetEngine>(fs);
    e->setParams(P.data());
    waitFor(*e, 60);
    if (v < 0) e->bend(v); // the reed is bent at rest, under its pad
    render(*e, 2048);
    e->noteOn(60, 0.6);
    render(*e, (int)(0.05 * fs));
    if (v > 0) e->bend(v); // the reed rings
    const auto x = render(*e, (int)(0.65 * fs));
    const double f0 = pianet::keyFreq(60) * std::pow(2.0, 2 * v / 12);
    double best = 0, bf = f0;
    for (double c = -10; c <= 10; c += 0.25) { const double f = f0 * std::pow(2.0, c / 1200), g = tone(x, f, (int)(0.1 * fs), (int)x.size(), fs); if (g > best) { best = g; bf = f; } }
    CHECK(std::fabs(cents(bf, f0)) < 3);
    CHECK(peak(x) < 0.5);
  }
}

// the strongest frequency within ±10 ¢ of want in x[a, end)
static double near(const std::vector<float> &x, double want, int a, double fs) {
  double best = 0, bf = want;
  for (double c = -10; c <= 10; c += 0.25) { const double f = want * std::pow(2.0, c / 1200), g = tone(x, f, a, (int)x.size(), fs); if (g > best) { best = g; bf = f; } }
  return bf;
}

TEST("engine: one note's own bend (MPE) stiffens its reed alone: it lands on the ratio, on top of the wheel's; a held note stays") {
  const double fs = 48000;
  auto P = defaults();
  P[p::tone] = 20000;
  for (double v : {0.0, 1.0}) {
    auto e = std::make_unique<PianetEngine>(fs);
    e->setParams(P.data());
    waitFor(*e, 48); waitFor(*e, 60);
    e->noteOn(48, 0.6); e->noteOn(60, 0.6);
    render(*e, (int)(0.05 * fs));
    e->noteBend(std::pow(2.0, 5.0 / 12), 60);
    e->bend(v);
    const auto x = render(*e, (int)(0.65 * fs));
    const double w = 2 * v, a = pianet::keyFreq(48) * std::pow(2.0, w / 12), b = pianet::keyFreq(60) * std::pow(2.0, (w + 5) / 12);
    CHECK(std::fabs(cents(near(x, a, (int)(0.1 * fs), fs), a)) < 3);
    CHECK(std::fabs(cents(near(x, b, (int)(0.1 * fs), fs), b)) < 3);
  }
  // to the ends, an octave (and no further), each bent at rest under its pad before it is played
  for (auto [key, semis] : {std::pair{36, 12.0}, std::pair{84, -12.0}, std::pair{60, 24.0}}) {
    auto e = std::make_unique<PianetEngine>(fs);
    e->setParams(P.data());
    waitFor(*e, key);
    e->noteBend(std::pow(2.0, semis / 12), key);
    e->noteOn(key, 0.6);
    const auto x = render(*e, (int)(0.65 * fs));
    const double f = pianet::keyFreq(key) * std::pow(2.0, std::clamp(semis, -PianetEngine::NOTE_BEND, PianetEngine::NOTE_BEND) / 12);
    CHECK(std::fabs(cents(near(x, f, (int)(0.1 * fs), fs), f)) < 3);
  }
}

TEST("engine: a lone note's own bend sounds as the wheel bent as far; a bend of 1 leaves the sound bit-identical") {
  const double fs = 48000;
  const int keys[] = {48, 55, 60};
  auto play = [&](int how) { // 0: the wheel, 1: each note's own, 2: own bends of 1 every block, 3: nothing
    auto e = std::make_unique<PianetEngine>(fs);
    e->setParams(defaults().data());
    for (int k : keys) waitFor(*e, k);
    if (how == 2) { e->noteBend(1.3, 55); e->noteBend(1, 55); } // set and reset before the note
    for (int k : keys) e->noteOn(k, 0.7);
    std::vector<float> out, L(128), R(128);
    for (int b = 0; b < (int)(0.8 * fs / 128); b++) {
      if (b == 40 && how == 0) e->bend(1);
      if (b == 40 && how == 1) for (int k : keys) e->noteBend(forte::fdlibm::pow(2.0, 2.0 / 12), k);
      if (how == 2) for (int k : keys) e->noteBend(1, k);
      if (b == 100) e->noteOff(55, -1); // its pad lands back on the bent reed
      e->process(L.data(), R.data(), 128);
      out.insert(out.end(), L.begin(), L.end());
    }
    return out;
  };
  const auto wheel = play(0), own = play(1), ones = play(2), none = play(3);
  double d = 0;
  for (size_t i = 0; i < wheel.size(); i++) d = std::max(d, (double)std::fabs(wheel[i] - own[i]));
  CHECK(d < 1e-5 * peak(wheel));
  CHECK(ones == none);
}

TEST("engine: own bends swept over their octave each way on a chord, every block, both pickups, stay finite and bounded at 44.1, 48 and 96 kHz") {
  for (double fs : {44100.0, 48000.0, 96000.0}) {
    for (int pickup : {0, 1}) {
      auto P = defaults();
      P[p::pickup] = pickup;
      auto e = std::make_unique<PianetEngine>(fs);
      SpscQueue<Message> q(1024);
      e->messages = &q;
      e->setParams(P.data());
      e->setSustain(true);
      const int keys[] = {36, 48, 57, 69, 81, 96};
      for (int k : keys) { waitFor(*e, k); e->noteOn(k, 1); }
      std::vector<float> L(128), R(128);
      bool finite = true;
      double pk = 0;
      for (int b = 0; b < (int)(2 * fs / 128); b++) {
        const double t = b * 128 / fs;
        for (int i = 0; i < 6; i++) {
          // half the keys sweep smoothly, half jump between the ends
          const double s = PianetEngine::NOTE_BEND * (i % 2 ? std::sin(TAU * (0.7 + 0.3 * i) * t) : std::fmod(t * (3 + i), 1) < 0.5 ? 1 : -1);
          e->noteBend(std::pow(2.0, s / 12), keys[i]);
        }
        if (b == (int)(0.5 * fs / 128)) e->bend(1);
        if (b == (int)(1.5 * fs / 128)) for (int k : keys) e->noteOn(k, 1); // pressed again: the pads drop on the swinging reeds
        e->process(L.data(), R.data(), 128);
        for (int j = 0; j < 128; j++) { finite &= std::isfinite(L[j]) && std::isfinite(R[j]); pk = std::max(pk, (double)std::fabs(L[j])); }
      }
      int errors = 0;
      for (Message m; q.pop(m);) errors += m.type == msg::error;
      std::printf("       %.1f kHz, %s: peak %.2f\n", fs / 1000, pickup ? "electrostatic" : "magnetic", pk);
      CHECK(finite && pk < 2 && errors == 0);
    }
  }
}

TEST("engine: a new tip mass leaves the sounding reed alone; its key's next note waits for the new reed and the old one fades") {
  const double fs = 48000;
  auto P = defaults();
  auto e = std::make_unique<PianetEngine>(fs);
  e->setParams(P.data());
  waitFor(*e, 48);
  e->noteOn(48, 0.7);
  render(*e, 4800);
  P[p::tipMass] = 3;
  e->setParams(P.data());
  const auto ringing = render(*e, 2400);
  CHECK(peak(ringing) > 0.02); // still sounding, on its old reed
  waitFor(*e, 48);
  e->noteOn(48, 0.7);
  render(*e, 1200);
  CHECK(e->voiceCount() == 1); // the old voice has faded out (5 ms) and gone
  e->noteOff(48, -1);
  render(*e, (int)(0.6 * fs));
  CHECK(e->voiceCount() == 0);
}

TEST("engine: beyond 40 voices the quietest released one goes; Panic silences and frees every voice") {
  const double fs = 48000;
  auto P = defaults();
  P[p::padC] = 0.02; P[p::padK] = 0.2; // limp foam: released notes ring on
  auto e = std::make_unique<PianetEngine>(fs);
  e->setParams(P.data());
  int most = 0;
  for (int k = 36; k < 86; k++) { waitFor(*e, k); e->noteOn(k, 0.7); render(*e, 256); e->noteOff(k, -1); most = std::max(most, e->voiceCount()); }
  CHECK(most > 30 && most <= 41); // (the 41st fades out over 5 ms)
  render(*e, 1024);
  CHECK(e->voiceCount() <= 40);
  // held by the pedal, then Panic: every voice fades and goes, sleeping ones too
  e->setSustain(true);
  for (int k : {48, 52, 55}) { e->noteOn(k, 0.7); render(*e, 128); e->noteOff(k, -1); }
  render(*e, (int)(2 * fs));
  e->allNotesOff();
  const auto x = render(*e, 4800);
  CHECK(e->voiceCount() == 0);
  CHECK(peak(x, 2400) < 1e-4);
}

TEST("engine: every sample rate 44.1–192 kHz, both pickups and the combo: finite, a forte note at its level") {
  for (double fs : {44100.0, 48000.0, 96000.0, 192000.0}) {
    for (int pickup : {0, 1}) {
      auto P = defaults();
      P[p::pickup] = pickup;
      if (fs == 96000) P[p::amp] = amp_::combo;
      auto e = std::make_unique<PianetEngine>(fs);
      e->setParams(P.data());
      waitFor(*e, 72);
      e->noteOn(72, 1);
      const auto x = render(*e, (int)(0.4 * fs));
      bool finite = true;
      for (float v : x) finite = finite && std::isfinite(v);
      CHECK(finite);
      const double pk = peak(x);
      CHECK(pk > 0.05 && pk < 0.8);
    }
  }
}

TEST("CPU: ten voices at 48 kHz take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  auto P = defaults();
  auto e = std::make_unique<PianetEngine>(fs);
  e->setParams(P.data());
  const int keys[] = {48, 52, 55, 59, 60, 64, 67, 71, 72, 76};
  for (int k : keys) waitFor(*e, k);
  for (int k : keys) e->noteOn(k, 0.8);
  std::vector<float> L(128), R(128);
  e->process(L.data(), R.data(), 128);
  const auto t0 = std::chrono::steady_clock::now();
  const int blocks = (int)(3 * fs / 128);
  for (int b = 0; b < blocks; b++) e->process(L.data(), R.data(), 128);
  const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 3;
  std::printf("       %d voices: %.2f %% of a core\n", e->voiceCount(), 100 * share);
  CHECK(e->voiceCount() == 10);
  CHECK(share < 0.2);
}

int main() { return check::run(); }
