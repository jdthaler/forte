// reeds-tests.cpp — the reed piano in C++: the reed's finite elements against beam theory and the
// exact tip-mass equation, every key cut to pitch, the slot's C(y), the engine on pitch and its
// dampers, a note that waits for its reed to be built (forte/background.h), a reed knob that makes
// a new reed, and ten voices within the CPU budget. The physics tests are the JavaScript suite's,
// run on the WebAssembly (node test/reeds-tests.mjs).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <thread>
#include <vector>

#include "check.h"
#include "forte/dsp.h"
#include "reeds-engine.h"

using namespace forte;
using namespace forte::reeds;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
static std::vector<double> dry() { // direct out, no drive, no tremolo
  std::vector<double> P = defaults();
  P[p::output] = output_::direct; P[p::drive] = 0; P[p::tremDepth] = 0;
  return P;
}
// render blocks, giving the worker time, until n voices sound (a note waits for its reed)
static bool until(ReedEngine &e, int n) {
  std::vector<float> L(128), R(128);
  for (int i = 0; i < 2000 && e.voiceCount() < n; i++) { e.process(L.data(), R.data(), 128); std::this_thread::sleep_for(std::chrono::milliseconds(1)); }
  return e.voiceCount() >= n;
}
static std::vector<float> render(ReedEngine &e, int n) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  return L;
}
static double cents(double a, double b) { return 1200 * std::log2(a / b); }
// complex amplitude of f in x[a, a + W), Hann-windowed
static void dft(const std::vector<float> &x, double f, int a, int W, double fs, double &re, double &im) {
  const double w = TAU * f / fs;
  re = 0; im = 0;
  for (int i = 0; i < W; i++) { const double h = 0.5 - 0.5 * std::cos(TAU * i / W), v = h * x[a + i]; re += v * std::cos(w * (a + i)); im -= v * std::sin(w * (a + i)); }
}
static double amp(const std::vector<float> &x, double f, int a, int W, double fs) { double re, im; dft(x, f, a, W, fs, re, im); return std::hypot(re, im); }
// frequency near f from the phase advance between two windows D samples apart
static double freqNear(const std::vector<float> &x, double f, int a, int W, int D, double fs) {
  double r1, i1, r2, i2;
  dft(x, f, a, W, fs, r1, i1); dft(x, f, a + D, W, fs, r2, i2);
  double d = std::atan2(i2, r2) - std::atan2(i1, r1);
  d -= TAU * std::round(d / TAU);
  return f + d * fs / (TAU * D);
}

TEST("reed: a bare cantilever's overtones sit at 6.267, 17.55, 34.39 × f₁; f₁ = (1.8751²/2π)·√(EI/ρA)/L²") {
  const double L = 0.04;
  const ReedFEM r = reedFEM(L, REED.h, REED.b, 0, 0, 20, 4);
  CHECK(r.ok);
  const double c = std::sqrt(r.EI / r.mu), f1 = (std::pow(1.875104, 2) / TAU) * c / (L * L);
  CHECK(std::fabs(r.omega[0] / TAU / f1 - 1) < 1e-5);
  const double ratios[] = {6.2669, 17.5475, 34.3861};
  for (int i = 0; i < 3; i++) CHECK(std::fabs(r.omega[i + 1] / r.omega[0] / ratios[i] - 1) < 1e-3);
  CHECK(std::fabs(r.Gamma[0] * r.Gamma[0] / r.m - 0.6131) < 2e-3); // mode 1's effective mass
}

TEST("reed: with a tip mass the FEM solves the exact frequency equation") {
  for (double mu : {0.1, 0.5, 2.0, 8.0}) {
    const double L = 0.03, m = STEEL.rho * REED.h * REED.b * L;
    const ReedFEM r = reedFEM(L, REED.h, REED.b, mu * m, 0, 20, 3);
    const std::vector<double> lam = tipMassRoots(mu, 3);
    const double c = std::sqrt(r.EI / r.mu);
    CHECK(lam.size() == 3);
    for (size_t i = 0; i < lam.size(); i++) CHECK(std::fabs(r.omega[i] / (lam[i] * lam[i] * c / (L * L)) - 1) < 2e-4);
  }
}

TEST("reed: every key A1–C7 is cut to length so that its first mode is the note (< 0.01 ¢)") {
  double worst = 0;
  for (int m = KEY_LO; m <= KEY_HI; m++) {
    const TunedReed r = tuneReed(m, 1, 1);
    worst = std::max(worst, std::fabs(cents(r.omega[0] / TAU, keyFreq(m))));
  }
  CHECK(worst < 0.01);
  // the solder knob re-cuts the reed: same pitch, heavier blob → shorter reed, higher mode 2
  const KeyModel light = keyModel(57, 0.2, 0.4, 1, 96000), heavy = keyModel(57, 3, 0.4, 1, 96000);
  CHECK(std::fabs(cents(light.modes[0].f, keyFreq(57))) < 0.01 && std::fabs(cents(heavy.modes[0].f, keyFreq(57))) < 0.01);
  CHECK(light.info.L > heavy.info.L && light.modes[1].ratio < heavy.modes[1].ratio);
}

TEST("slot: C(y) from the table is even, largest level with the comb, and falls as the reed leaves") {
  double c[SLOT_Y.n];
  fillCap(c, 0.3);
  for (double y : {0.3e-3, 1.1e-3, 2.5e-3}) CHECK(std::fabs(capAt(c, y).C / capAt(c, -y).C - 1) < 1e-6);
  for (double y = 0.05e-3; y < 4e-3; y += 0.05e-3) CHECK(capAt(c, y).dC < 0);
  // C(0) ≈ 0.211 pF at 0.3 mm (README), and a narrower gap is larger
  CHECK(std::fabs(capAt(c, 0).C * 1e12 - 0.211) < 0.002);
  double n[SLOT_Y.n];
  fillCap(n, 0.15);
  CHECK(capAt(n, 0).C > 1.5 * capAt(c, 0).C);
}

TEST("engine: a note waits for its reed, then sounds on pitch; the dampers stop it on release") {
  const double fs = 48000;
  auto e = std::make_unique<ReedEngine>(fs);
  e->setParams(dry().data());
  e->noteOn(57, 0.5);
  CHECK(until(*e, 1));
  const std::vector<float> L = render(*e, (int)(0.8 * fs));
  const double f = keyFreq(57), fm = freqNear(L, f, (int)(0.08 * fs), (int)(0.3 * fs), (int)(0.3 * fs), fs);
  CHECK(std::fabs(cents(fm, f)) < 3);
  e->noteOff(57, -1);
  render(*e, (int)(2.5 * fs));
  CHECK(e->voiceCount() == 0);
}

TEST("engine: pitch bend stiffens or softens the reed: a sounding note follows, two semitones at the wheel's ends") {
  const double fs = 48000;
  for (double v : {1.0, -1.0}) {
    auto e = std::make_unique<ReedEngine>(fs);
    e->setParams(dry().data());
    e->noteOn(57, 0.5);
    CHECK(until(*e, 1));
    render(*e, (int)(0.05 * fs));
    e->bend(v);
    const std::vector<float> L = render(*e, (int)(0.8 * fs));
    const double f = keyFreq(57) * std::pow(2.0, 2 * v / 12), fm = freqNear(L, f, (int)(0.15 * fs), (int)(0.25 * fs), (int)(0.3 * fs), fs);
    CHECK(std::fabs(cents(fm, f)) < 3);
  }
}

// wait for key's reed to be built (so a note struck now sounds in this block)
static void waitFor(ReedEngine &e, int key) {
  for (int i = 0; i < 5000 && !e.ready(key); i++) std::this_thread::sleep_for(std::chrono::milliseconds(1));
  CHECK(e.ready(key));
}

TEST("engine: one note's own bend (MPE) stiffens its reed alone: it lands on the ratio, on top of the wheel's; a held note stays") {
  const double fs = 48000;
  for (double v : {0.0, 1.0}) {
    auto e = std::make_unique<ReedEngine>(fs);
    e->setParams(dry().data());
    e->noteOn(45, 0.5); e->noteOn(57, 0.5);
    CHECK(until(*e, 2));
    render(*e, (int)(0.05 * fs));
    e->noteBend(std::pow(2.0, 5.0 / 12), 57);
    e->bend(v);
    const std::vector<float> L = render(*e, (int)(0.8 * fs));
    const double w = 2 * v, a = keyFreq(45) * std::pow(2.0, w / 12), b = keyFreq(57) * std::pow(2.0, (w + 5) / 12);
    CHECK(std::fabs(cents(freqNear(L, a, (int)(0.15 * fs), (int)(0.25 * fs), (int)(0.3 * fs), fs), a)) < 3);
    CHECK(std::fabs(cents(freqNear(L, b, (int)(0.15 * fs), (int)(0.25 * fs), (int)(0.3 * fs), fs), b)) < 3);
  }
  // to the ends: A2 four octaves up, A5 two down, each bent before it is struck
  for (auto [key, semis] : {std::pair{45, 48.0}, std::pair{81, -24.0}}) {
    auto e = std::make_unique<ReedEngine>(fs);
    e->setParams(dry().data());
    e->noteBend(std::pow(2.0, semis / 12), key);
    e->noteOn(key, 0.5);
    CHECK(until(*e, 1));
    const std::vector<float> L = render(*e, (int)(0.8 * fs));
    const double f = keyFreq(key) * std::pow(2.0, semis / 12);
    CHECK(std::fabs(cents(freqNear(L, f, (int)(0.15 * fs), (int)(0.25 * fs), (int)(0.3 * fs), fs), f)) < 3);
  }
}

TEST("engine: a lone note's own bend sounds as the wheel bent as far; a bend of 1 leaves the sound bit-identical") {
  const double fs = 48000;
  const int keys[] = {57, 64, 69};
  auto play = [&](int how) { // 0: the wheel, 1: each note's own, 2: own bends of 1 every block, 3: nothing
    auto e = std::make_unique<ReedEngine>(fs);
    e->setParams(defaults().data());
    for (int k : keys) waitFor(*e, k);
    if (how == 2) { e->noteBend(1.3, 64); e->noteBend(1, 64); } // set and reset before the note
    for (int k : keys) e->noteOn(k, 0.6);
    std::vector<float> out, L(128), R(128);
    for (int b = 0; b < (int)(0.8 * fs / 128); b++) {
      if (b == 40 && how == 0) e->bend(1);
      if (b == 40 && how == 1) for (int k : keys) e->noteBend(std::pow(2.0, 2.0 / 12), k);
      if (how == 2) for (int k : keys) e->noteBend(1, k);
      e->process(L.data(), R.data(), 128);
      out.insert(out.end(), L.begin(), L.end());
    }
    return out;
  };
  const auto wheel = play(0), own = play(1), ones = play(2), none = play(3);
  double d = 0, pk = 0;
  for (size_t i = 0; i < wheel.size(); i++) { d = std::max(d, (double)std::fabs(wheel[i] - own[i])); pk = std::max(pk, (double)std::fabs(wheel[i])); }
  CHECK(d < 1e-5 * pk);
  CHECK(ones == none);
}

TEST("engine: own bends swept over ±48 semitones on a chord, every block, stay finite and bounded at 44.1, 48 and 96 kHz") {
  for (double fs : {44100.0, 48000.0, 96000.0}) {
    auto e = std::make_unique<ReedEngine>(fs);
    e->setParams(defaults().data());
    e->setSustain(true);
    const int keys[] = {33, 45, 57, 64, 72, 84};
    for (int k : keys) e->noteOn(k, 1);
    CHECK(until(*e, 6));
    std::vector<float> L(128), R(128);
    bool finite = true;
    double pk = 0;
    for (int b = 0; b < (int)(2 * fs / 128); b++) {
      const double t = b * 128 / fs;
      for (int i = 0; i < 6; i++) {
        // half the keys sweep smoothly, half jump between the ends
        const double s = i % 2 ? 48 * std::sin(TAU * (0.7 + 0.3 * i) * t) : (std::fmod(t * (3 + i), 1) < 0.5 ? 48 : -48);
        e->noteBend(std::pow(2.0, s / 12), keys[i]);
      }
      if (b == (int)(0.5 * fs / 128)) e->bend(1);
      e->process(L.data(), R.data(), 128);
      for (int j = 0; j < 128; j++) { finite &= std::isfinite(L[j]) && std::isfinite(R[j]); pk = std::max(pk, (double)std::fabs(L[j])); }
    }
    std::printf("       %.1f kHz: peak %.2f\n", fs / 1000, pk);
    CHECK(finite && pk < 2);
    CHECK(e->voiceCount() == 6); // none blown up
  }
}

TEST("engine: the bark: a harder strike raises the 2nd harmonic") {
  const double fs = 48000, f = keyFreq(57);
  auto h2 = [&](double vel) {
    auto e = std::make_unique<ReedEngine>(fs);
    e->setParams(dry().data());
    e->noteOn(57, vel);
    until(*e, 1);
    const std::vector<float> L = render(*e, (int)(0.6 * fs));
    const int a = (int)(0.1 * fs), W = (int)(0.4 * fs);
    return 20 * std::log10(amp(L, 2 * f, a, W, fs) / amp(L, f, a, W, fs));
  };
  CHECK(h2(1) > h2(0.1) + 15);
}

TEST("engine: a key struck again after a reed knob moved gets a new reed; the old one fades out") {
  const double fs = 48000;
  auto e = std::make_unique<ReedEngine>(fs);
  std::vector<double> P = defaults();
  e->setParams(P.data());
  e->setSustain(true);
  e->noteOn(57, 0.7);
  CHECK(until(*e, 1));
  render(*e, 4800);
  P[p::hardness] = 1.02;
  e->setParams(P.data());
  e->noteOn(57, 0.7);
  CHECK(until(*e, 2));
  render(*e, (int)(0.3 * fs));
  CHECK(e->voiceCount() == 1 && e->byKey[57] && !e->byKey[57]->killing);
  // the same knobs again: the same reed, struck again
  e->noteOn(57, 0.7);
  render(*e, 256);
  CHECK(e->voiceCount() == 1);
}

TEST("engine: finite and under 2 at every knob's extremes, at 44.1 to 96 kHz") {
  for (double fs : {44100.0, 48000.0, 96000.0}) {
    for (int c = 0; c < 2; c++) {
      std::vector<double> P(p::count);
      for (int i = 0; i < p::count; i++) P[i] = c ? kParams[i].max : kParams[i].min;
      auto e = std::make_unique<ReedEngine>(fs);
      e->setParams(P.data());
      for (int k : {KEY_LO, 64, KEY_HI}) e->noteOn(k, 1);
      CHECK(until(*e, 3));
      const std::vector<float> L = render(*e, (int)(0.25 * fs));
      double pk = 0;
      bool finite = true;
      for (float v : L) { finite = finite && std::isfinite(v); pk = std::max(pk, (double)std::fabs(v)); }
      CHECK(finite && pk < 2);
    }
  }
}

TEST("CPU: 10 sounding voices at 48 kHz") {
  const double fs = 48000;
  auto e = std::make_unique<ReedEngine>(fs);
  e->setParams(defaults().data());
  for (int i = 0; i < 10; i++) e->noteOn(36 + 5 * i, 0.8);
  CHECK(until(*e, 10));
  std::vector<float> L(128), R(128);
  const int blocks = 1500;
  double sec = 0;
  int minVoices = 99;
  for (int b = 0; b < blocks; b++) {
    if (b % 300 == 0) for (int i = 0; i < 10; i++) e->noteOn(36 + 5 * i, 0.8); // re-strike so all ten keep sounding
    const auto t0 = std::chrono::steady_clock::now();
    e->process(L.data(), R.data(), 128);
    sec += std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    minVoices = std::min(minVoices, e->voiceCount());
  }
  const double load = sec / (blocks * 128 / fs);
  std::printf("        10 voices: %.1f %% of a core\n", 100 * load);
  CHECK(minVoices == 10);
  if (!std::getenv("CI")) CHECK(load < 0.3);
}

int main() { return check::run(); }
