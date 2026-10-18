// template-tests.cpp — the template's engine in C++: on pitch, decaying as its T60 says, within
// the CPU budget (docs/INSTRUMENT_GUIDE.md: 10 voices at 48 kHz well inside a core). The
// physics tests are the JavaScript suite's, run on the WebAssembly (node test/template-tests.mjs).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <vector>

#include "check.h"
#include "forte/dsp.h"
#include "template-engine.h"

using namespace forte;
using namespace forte::template_;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
static std::vector<float> render(TemplateEngine &e, int n) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  return L;
}
static double tone(const std::vector<float> &x, double f, int a, int b, double fs) { // Hann-windowed Goertzel
  double re = 0, im = 0;
  for (int i = a; i < b; i++) { const double h = 0.5 - 0.5 * std::cos(TAU * (i - a) / (b - a)); re += h * x[i] * std::cos(TAU * f * i / fs); im += h * x[i] * std::sin(TAU * f * i / fs); }
  return std::hypot(re, im);
}

TEST("template: the C++ engine sounds the key's fundamental and decays at its T60") {
  const double fs = 48000;
  auto P = defaults();
  P[p::t60] = 2;
  TemplateEngine e(fs);
  e.setParams(P.data());
  e.noteOn(57, 0.7);
  auto x = render(e, (int)(2.2 * fs));
  const double f = keyFreq(57);
  CHECK(tone(x, f, 4800, 4800 + 16384, fs) > 20 * tone(x, f * 1.06, 4800, 4800 + 16384, fs));
  const double db = 20 * std::log10(tone(x, f, 4800 + 48000, 4800 + 48000 + 8192, fs) / tone(x, f, 4800, 4800 + 8192, fs));
  CHECK_NEAR(db, -30, 0.5); // T60 = 2 s: −30 dB in a second
}

TEST("CPU: 10 voices at 48 kHz take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  auto P = defaults();
  P[p::t60] = 20; P[p::mallet] = 0.05; // long and bright: every mode, no voice ending
  TemplateEngine e(fs);
  e.setParams(P.data());
  for (int k = 0; k < 10; k++) e.noteOn(48 + 3 * k, 0.8);
  std::vector<float> L(128), R(128);
  const auto t0 = std::chrono::steady_clock::now();
  const int blocks = (int)(10 * fs / 128);
  for (int b = 0; b < blocks; b++) e.process(L.data(), R.data(), 128);
  const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 10;
  std::printf("       10 voices: %.2f %% of a core\n", 100 * share);
  CHECK(e.voiceCount() == 10);
  CHECK(share < 0.05);
}

int main() { return check::run(); }
