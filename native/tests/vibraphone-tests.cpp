// vibraphone-tests.cpp — the vibraphone in C++: the bar's finite elements against beam theory and
// the tuned table, the engine on pitch, a note that waits for its bar to be built (forte/background.h)
// and holds it while the depth changes, the views' messages, and ten bars within the CPU budget.
// The physics tests are the JavaScript suite's, run on the WebAssembly (FORTE_ENGINE=wasm).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <thread>
#include <vector>

#include "bar-table.h"
#include "check.h"
#include "forte/dsp.h"
#include "vibraphone-engine.h"

using namespace forte;
using namespace forte::vibraphone;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
static std::vector<float> render(VibraphoneEngine &e, int n, std::vector<float> *right = nullptr) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  if (right) *right = R;
  return L;
}
// render blocks, giving the worker time, until n voices sound (a note waits for its bar to be built)
static bool until(VibraphoneEngine &e, int n) {
  std::vector<float> L(128), R(128);
  for (int i = 0; i < 2000 && e.voiceCount() < n; i++) { e.process(L.data(), R.data(), 128); std::this_thread::sleep_for(std::chrono::milliseconds(1)); }
  return e.voiceCount() >= n;
}
static double cents(double a, double b) { return 1200 * std::log2(a / b); }
// |DTFT| of x[a, b) at f, Hann-windowed
static double tone(const std::vector<float> &x, double f, int a, int b, double fs) {
  double re = 0, im = 0;
  for (int i = a; i < b; i++) { const double h = 0.5 - 0.5 * std::cos(TAU * (i - a) / (b - a)); re += h * x[i] * std::cos(TAU * f * i / fs); im += h * x[i] * std::sin(TAU * f * i / fs); }
  return std::hypot(re, im);
}
// the strongest partial within ±20 ¢ of f (a scan, then ternary search)
static double peakNear(const std::vector<float> &x, double f, int a, int b, double fs) {
  double best = f, bv = -1;
  for (double c = -20; c <= 20; c += 0.5) { const double fr = f * std::pow(2.0, c / 1200), v = tone(x, fr, a, b, fs); if (v > bv) { bv = v; best = fr; } }
  double lo = best * std::pow(2.0, -0.5 / 1200), hi = best * std::pow(2.0, 0.5 / 1200);
  for (int it = 0; it < 30; it++) { const double m1 = (2 * lo + hi) / 3, m2 = (lo + 2 * hi) / 3; if (tone(x, m1, a, b, fs) > tone(x, m2, a, b, fs)) hi = m2; else lo = m1; }
  return 0.5 * (lo + hi);
}

TEST("bar: a thin plain bar is the free–free beam (1 : 2.756 : 5.404 : 8.933 : 13.34), a uniform one twists at n·c_T/2L") {
  const BarModes thin = barModes({0.002, 0, 0, 0}, 1, 0.05);
  const double f1 = (BETA_L[0] * BETA_L[0] / TAU) * 0.002 * std::sqrt(AL.E / (12 * AL.rho));
  CHECK(std::fabs(thin.bend[0].f / f1 - 1) < 1e-4);
  for (int n = 0; n < 5; n++) CHECK(std::fabs(thin.bend[n].f / thin.bend[0].f / ebRatio(n) - 1) < 2e-4);
  const double b = 0.05, h = 0.0127, J = torsionJ(b, h), Ip = (b * h * h * h + h * b * b * b) / 12, cT = std::sqrt((G_AL * J) / (AL.rho * Ip));
  const BarModes u = barModes({h, 0, 0, 0}, 0.3, b);
  for (int i = 0; i < 2; i++) CHECK(std::fabs(u.tors[i].f / (((i + 1) * cT) / 0.6) - 1) < 1e-3);
}

TEST("bar: every tuned bar F3–F6 sits at 1 : 4 : 10 within 1 ¢, its fundamental within 0.1 ¢ of its key") {
  double worst = 0;
  for (int k = KEY_LO; k <= KEY_HI; k++) {
    const Geometry g = barGeometry(k);
    const auto f = bendingFreqs3(g.cut, g.L, g.b);
    CHECK(std::fabs(cents(f[0], keyFreq(k))) < 0.1);
    worst = std::max({worst, std::fabs(cents(f[1] / f[0], 4)), std::fabs(cents(f[2] / f[0], 10))});
  }
  CHECK(worst < 1);
  // a plain bar is cut half as long again to sound the same note
  const BarModel plain = barModel(71, 0), tuned = barModel(71, 1);
  CHECK(std::fabs(cents(plain.modes[0].f, keyFreq(71))) < 0.05 && plain.geom.L > 1.4 * tuned.geom.L);
}

TEST("bar: the optimiser, started off the table, finds its row again (A4)") {
  const int k = 69;
  const Blank bl = barBlank(k);
  const BarRow &row = BAR_TABLE[k - KEY_LO];
  const Tuned r = tuneUndercut(keyFreq(k), bl.b, bl.h0, bl.cf, {row.A * 1.06, row.D * 0.94, row.L * 1.05});
  CHECK(std::fabs(r.L / row.L - 1) < 1e-5 && std::fabs(r.A - row.A) < 1e-4 && std::fabs(r.D - row.D) < 1e-4);
  for (double c : r.residualCents) CHECK(std::fabs(c) < 0.01);
}

TEST("resonator: the damped pair reduces to the two-oscillator formula when tuned") {
  const auto two = twoOscillator(200, 200, 0.03);
  CHECK(std::fabs(two[0] - 200 / std::sqrt(1.03)) < 1e-9 && std::fabs(two[1] - 200 / std::sqrt(0.97)) < 1e-9);
  const double w = TAU * 200;
  const auto m = coupledModes(1, -0.03, 1, 0, 0, w * w, w * w);
  CHECK(m.size() == 2 && std::fabs(m[0].f - two[0]) < 1e-6 && std::fabs(m[1].f - two[1]) < 1e-6);
}

TEST("engine: a note sounds its key (motor off, tubes on), at 44.1 and 48 kHz") {
  for (double fs : {44100.0, 48000.0}) for (int key : {KEY_LO, 69, KEY_HI}) {
    auto P = defaults();
    P[p::motor] = motor_::open;
    auto ep = std::make_unique<VibraphoneEngine>(fs); // on the heap: it is too big for a WebAssembly stack
    VibraphoneEngine &e = *ep;
    e.setParams(P.data());
    // with threads the bar may not be built yet: the note waits for it
    e.noteOn(key, 0.6);
    CHECK(until(e, 1));
    auto L = render(e, (int)(1.2 * fs));
    const double f = peakNear(L, keyFreq(key), (int)(0.4 * fs), (int)(1.2 * fs), fs);
    CHECK(std::fabs(cents(f, keyFreq(key))) < 3);
    double pk = 0;
    for (float v : L) pk = std::max(pk, (double)std::fabs(v));
    CHECK(pk > 0.02 && pk < 0.5);
  }
}

TEST("engine: a bar keeps its modes while the depth changes under it; the next strike is the re-cut bar") {
  const double fs = 48000;
  auto P = defaults();
  auto ep = std::make_unique<VibraphoneEngine>(fs);
  VibraphoneEngine &e = *ep;
  e.setSustain(true);
  e.setParams(P.data());
  e.noteOn(60, 0.6);
  if (!until(e, 1)) { CHECK(false); return; }
  const VoiceData *first = e.voices[0]->d;
  P[p::depth] = 0.5;
  e.setParams(P.data());
  for (int i = 0; i < 20; i++) { render(e, 128); std::this_thread::sleep_for(std::chrono::milliseconds(2)); }
  CHECK(e.voiceCount() == 1 && e.voices[0]->d == first && first->depth == 1 && first->w.size() == (size_t)(first->N * first->nx));
  e.noteOn(60, 0.6);
  until(e, 2);
  CHECK(e.voiceCount() == 2 && e.voices[0]->fading && e.voices[1]->d->depth == 0.5);
  render(e, 4800); // the old bar has faded and let go of its data
  CHECK(e.voiceCount() == 1 && e.voices[0]->d->depth == 0.5);
}

TEST("engine: the views' message: the struck bar's modes, its tube and disc, the shaft") {
  const double fs = 48000;
  auto P = defaults();
  SpscQueue<Message> q(256);
  auto ep = std::make_unique<VibraphoneEngine>(fs);
  VibraphoneEngine &e = *ep;
  e.messages = &q;
  e.setParams(P.data());
  e.noteOn(65, 0.7);
  until(e, 1);
  render(e, (int)(0.3 * fs));
  Message m, last;
  int n = 0;
  while (q.pop(m)) { CHECK(m.type == msg::vibe && m.count == 19); last = m; n++; }
  CHECK(n > 20 && last.key == 65);
  CHECK(last.values[0] > 0 && last.values[8] > 0 && last.values[9] > 0); // mode 1, bar and tube energy
  CHECK(last.values[11] > 0 && last.values[11] <= 1 && last.values[12] > 0); // mouth open, κ
  CHECK(last.values[14] > 0.1 && last.values[14] < 5 && last.values[15] > 1); // mallet contact (ms), peak force (N)
  CHECK(last.values[17] > 0.3 && last.values[17] < P[p::speed]); // the shaft spinning up
}

TEST("CPU: ten bars at 48 kHz, motor running, take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  auto P = defaults();
  auto ep = std::make_unique<VibraphoneEngine>(fs);
  VibraphoneEngine &e = *ep;
  e.setParams(P.data());
  e.setSustain(true);
  for (int i = 0; i < 10; i++) e.noteOn(KEY_LO + 3 * i, 0.8);
  until(e, 10);
  std::vector<float> L(128), R(128);
  for (int b = 0; b < 100; b++) e.process(L.data(), R.data(), 128); // warm up
  const auto t0 = std::chrono::steady_clock::now();
  const int blocks = (int)(4 * fs / 128);
  for (int b = 0; b < blocks; b++) e.process(L.data(), R.data(), 128);
  const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 4;
  std::printf("       %d bars: %.2f %% of a core\n", e.voiceCount(), 100 * share);
  CHECK(e.voiceCount() == 10);
  CHECK(share < 0.1);
  // and a bar's modes, built off the audio thread
  const auto t1 = std::chrono::steady_clock::now();
  for (int k = KEY_LO; k <= KEY_HI; k++) voiceData(k, 0.5);
  std::printf("       a bar's modes: %.2f ms to build\n", 1000 * std::chrono::duration<double>(std::chrono::steady_clock::now() - t1).count() / (KEY_HI - KEY_LO + 1));
}

int main() { return check::run(); }
