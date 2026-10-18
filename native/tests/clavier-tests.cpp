// clavier-tests.cpp — the tangent clavier's engine in C++: the scale's inharmonicity is a D6's, the
// released string falls a minor third, a held key sounds its note, the mute bar kills the twang,
// the yarn stops a released string, the voice pool holds whatever is played at any sample rate,
// and ten bass voices fit the CPU budget. The physics tests are the JavaScript suite's, run on the
// WebAssembly (node test/clavier-tests.mjs).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <vector>

#include "clavier-engine.h"
#include "check.h"

using namespace forte;
using namespace forte::clavier;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
static std::vector<float> render(ClavierEngine &e, int n) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  return L;
}
// |DTFT| of x[a, b) at f, Hann-windowed
static double tone(const std::vector<float> &x, double f, int a, int b, double fs) {
  const double w = 2 * PI * f / fs;
  double re = 0, im = 0;
  for (int i = a; i < b; i++) { const double h = 0.5 - 0.5 * std::cos(2 * PI * (i - a) / (b - a)); re += h * x[i] * std::cos(w * i); im += h * x[i] * std::sin(w * i); }
  return std::hypot(re, im) / ((b - a) / 4.0);
}
// the strongest frequency within ±span cents of f (golden-section on the Goertzel magnitude)
static double peakFreq(const std::vector<float> &x, double f, int a, int b, double fs, double span = 40) {
  double lo = f * std::pow(2.0, -span / 1200), hi = f * std::pow(2.0, span / 1200), best = f, bv = -1;
  for (int i = 0; i <= 48; i++) { const double g = lo * std::pow(hi / lo, i / 48.0), v = tone(x, g, a, b, fs); if (v > bv) { bv = v; best = g; } }
  lo = best * std::pow(2.0, -span / 24 / 1200); hi = best * std::pow(2.0, span / 24 / 1200);
  for (int i = 0; i < 30; i++) { const double m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (tone(x, m1, a, b, fs) < tone(x, m2, a, b, fs)) lo = m1; else hi = m2; }
  return (lo + hi) / 2;
}
static double cents(double a, double b) { return 1200 * std::log2(a / b); }

TEST("clavier: the scale's inharmonicity is within ×2 of a measured D6, no string above 65 % of its breaking stress") {
  const auto P = defaults();
  const double measured[][2] = {{29, 5e-4}, {34, 2e-4}, {50, 9e-5}, {51, 1e-4}, {78, 9e-5}, {88, 8e-5}};
  for (const auto &m : measured) { const StringDesign S = stringDesign((int)m[0], P.data()); CHECK(S.B / m[1] > 0.5 && S.B / m[1] < 2); }
  for (int k = LO; k <= HI; k++) {
    const StringDesign S = stringDesign(k, P.data());
    CHECK(S.stress < 0.65 * STEEL.strength && S.T > 0);
    CHECK(S.wound == (k <= 51));
  }
}

TEST("clavier: the released string's component modes give the full-length pitch, 307–322 cents below the held note") {
  const auto P = defaults();
  for (int k : {29, 46, 64, 88}) {
    double f[2];
    CHECK(releasedFreqs(k, P.data(), 2, f) == 2);
    const double c = cents(f[0], keyFreq(k));
    std::printf("       key %d: released %.1f cents\n", k, c);
    CHECK(c < -305 && c > -322);
  }
}

TEST("clavier: a held key sounds its note within 3 cents, at 44.1 and 48 kHz") {
  auto P = defaults();
  for (double fs : {44100.0, 48000.0})
    for (int key : {29, 45, 60, 84}) {
      auto e = std::make_unique<ClavierEngine>(fs);
      e->setParams(P.data());
      e->noteOn(key, 0.3);
      const auto x = render(*e, (int)(1.6 * fs));
      const double f = peakFreq(x, keyFreq(key), (int)(0.9 * fs), (int)(1.6 * fs), fs);
      CHECK(std::fabs(cents(f, keyFreq(key))) < 3);
    }
}

TEST("clavier: the mute bar (Space, CC64) kills the twang: the 5th partial 30 dB down within 0.3 s") {
  const double fs = 48000;
  auto P = defaults();
  const int key = 57;
  const StringDesign S = stringDesign(key, P.data());
  double ratio[2];
  for (int muted = 0; muted < 2; muted++) {
    P[p::mute] = 1;
    auto e = std::make_unique<ClavierEngine>(fs);
    e->setParams(P.data());
    e->setSustain(muted);
    e->noteOn(key, 0.7);
    const auto x = render(*e, (int)(0.4 * fs));
    const int a = (int)(0.25 * fs), b = (int)(0.4 * fs);
    ratio[muted] = tone(x, speakingFreq(5, S), a, b, fs) / tone(x, S.f0, a, b, fs);
  }
  std::printf("       5th partial muted: %.1f dB\n", 20 * std::log10(ratio[1] / ratio[0]));
  CHECK(20 * std::log10(ratio[1] / ratio[0]) < -30);
}

TEST("clavier: the yarn stops a released string within 0.2 s, and the voice goes") {
  const double fs = 48000;
  auto P = defaults();
  auto e = std::make_unique<ClavierEngine>(fs);
  e->setParams(P.data());
  e->noteOn(46, 0.7);
  const auto x = render(*e, (int)(0.5 * fs));
  CHECK(e->voiceCount() == 1);
  e->noteOff(46, -1);
  const auto y = render(*e, (int)(0.4 * fs));
  float pre = 0, post = 0;
  for (int i = (int)(0.4 * fs); i < (int)(0.5 * fs); i++) pre = std::max(pre, std::fabs(x[i]));
  for (int i = (int)(0.2 * fs); i < (int)(0.4 * fs); i++) post = std::max(post, std::fabs(y[i]));
  CHECK(20 * std::log10(post / pre) < -40);
  CHECK(e->voiceCount() == 0);
}

TEST("clavier: the voice pool holds anything played: every key struck again and again, with the strings and pressure changed between, at 44.1 to 192 kHz") {
  for (double fs : {44100.0, 96000.0, 192000.0}) {
    auto P = defaults();
    auto e = std::make_unique<ClavierEngine>(fs);
    for (int round = 0; round < 6; round++) {
      P[p::gap] = 0.3 + 0.2 * round; P[p::muteOn] = round % 2; P[p::pickup] = round % 4;
      e->setParams(P.data());
      e->pressure(0.2 * round, -1);
      e->bend(round % 3 - 1);
      for (int k = LO; k <= HI; k++) e->noteOn(k, round % 2 ? 1 : 0.2);
      if (round % 3 == 2) for (int k = LO; k <= HI; k += 2) e->noteOff(k, -1);
      const auto x = render(*e, 777);
      for (float v : x) CHECK(std::isfinite(v) && std::fabs(v) < 4);
      CHECK(e->voiceCount() <= ClavierEngine::POOL);
    }
    e->allNotesOff();
    render(*e, (int)(0.1 * fs));
    CHECK(e->voiceCount() == 0);
  }
}

TEST("CPU: ten bass voices (the most modes) at 48 kHz take a small part of a core; striking ten keys at once fits in a block") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  auto P = defaults();
  auto e = std::make_unique<ClavierEngine>(fs);
  e->setParams(P.data());
  std::vector<float> L(128), R(128);
  const int keys[] = {29, 31, 33, 34, 36, 38, 40, 41, 43, 45};
  const auto s0 = std::chrono::steady_clock::now();
  for (int k : keys) e->noteOn(k, 0.8);
  const double strike = std::chrono::duration<double>(std::chrono::steady_clock::now() - s0).count();
  const auto t0 = std::chrono::steady_clock::now();
  const int blocks = (int)(4 * fs / 128);
  for (int b = 0; b < blocks; b++) e->process(L.data(), R.data(), 128);
  const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 4;
  std::printf("       %d voices: %.2f %% of a core; striking ten keys took %.3f ms (a block is %.2f ms)\n", e->voiceCount(), 100 * share, 1000 * strike, 128000 / fs);
  CHECK(e->voiceCount() == 10 && share < 0.3 && strike < 0.5 * 128 / fs);
}

int main() { return check::run(); }
