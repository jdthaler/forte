// pipes-tests.cpp — the pipe organ in C++: the pipe against tube acoustics and the retired JavaScript
// model's numbers, the packed form the page sends, the engine on pitch, a key that waits for its
// pipes to be voiced (forte/background.h) and keeps them while the voicing changes, the views'
// messages, and ten keys within the CPU budget. The physics tests are the JavaScript suite's, run
// on the WebAssembly (node test/pipes-tests.mjs).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <thread>
#include <vector>

#include "check.h"
#include "forte/dsp.h"
#include "pipes-engine.h"
#include "tuning-table.h"

using namespace forte;
using namespace forte::pipes;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
static const Voicing VOICED = {1, 1, 0.4};
static std::vector<float> render(PipeEngine &e, int n, std::vector<float> *right = nullptr) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  if (right) *right = R;
  return L;
}
// render blocks, giving the worker time, until n voices sound (a note waits for its key's pipes)
static bool until(PipeEngine &e, int n) {
  std::vector<float> L(128), R(128);
  for (int i = 0; i < 4000 && e.nVoices < n; i++) { e.process(L.data(), R.data(), 128); std::this_thread::sleep_for(std::chrono::milliseconds(1)); }
  return e.nVoices >= n;
}
static double cents(double a, double b) { return 1200 * std::log2(a / b); }
static double rel(double a, double b) { return std::fabs(a / b - 1); }
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

TEST("pipe: open modes 1 : 2 : 3 of c/2(L + ΔL_mouth + 0.6133a), stopped 1 : 3 : 5 of c/4(L + ΔL_mouth); Rayleigh's conductivity 2r for a circle") {
  for (double f : {65.41, 261.6, 1046.5}) {
    const PipeModel o = pipeModel(f, false, VOICED), s = pipeModel(f, true, VOICED);
    for (int i = 0; i < o.nModes; i++) CHECK(rel(o.modes[i].f / o.modes[0].f, i + 1) < 1e-12);
    for (int i = 0; i < s.nModes; i++) CHECK(rel(s.modes[i].f / s.modes[0].f, 2 * i + 1) < 1e-12);
    CHECK(rel(o.modes[0].f, AIR.c / (2 * (o.L + o.geo.dLm + LS_END * o.geo.a))) < 1e-12);
    CHECK(rel(s.modes[0].f, AIR.c / (4 * (s.L + s.geo.dLm))) < 1e-12);
    CHECK(s.L / o.L > 0.4 && s.L / o.L < 0.6);
  }
  CHECK(rel(ellipseConductivity(0.01, 0.01), 0.02) < 1e-12);
  CHECK(rel(toepferD(keyFreq(36)), 0.1555) < 1e-12 && rel(toepferD(keyFreq(52)), 0.1555 / 2) < 1e-12);
}

TEST("pipe: the JavaScript model's numbers (pipeModel and linearRoot, c¹ Principal, c Gedackt, a Mixture pipe re-voiced) within 1e-12") {
  struct Row { int key, rank; Voicing v; double tune, L, A, fRes, Q1, W, re, im; int n; };
  const Row rows[] = {
    {60, 0, VOICED, 1.0032613337575829, 0.5476885287830929, 22.134881768925435, 261.51388611393355, 78.16861040222679, 0.009325350829412047, 49.80585441883968, 1648.9419740835356, 10},
    {48, 2, VOICED, 0.9871796474424915, 0.5498123222916309, 52.83265827332441, 131.48870721196752, 99.7331591870809, 0.02611098232235373, 22.997623830986846, 812.04796174197, 6},
    {72, 4, {1.3, 0.7, 0.9}, 1.0082308692887532, 0.07721762153619231, 16.1559469689183, 1604.7129931542636, 39.37386318536929, 0.0020204926797059435, 350.2221173460125, 9916.48521920423, 9},
  };
  for (const Row &r : rows) {
    const double f = pipeFreq(r.key, r.rank);
    const bool stopped = RANK[r.rank].stopped;
    CHECK(rel(tuning(f, stopped), r.tune) < 1e-14);
    ModelOptions o;
    o.tune = tuning(f, stopped);
    PipeModel R = pipeModel(f, stopped, r.v, o);
    CHECK(rel(R.L, r.L) < 1e-12 && rel(R.A, r.A) < 1e-12 && rel(R.fRes, r.fRes) < 1e-12 && rel(R.Q1, r.Q1) < 1e-12 && rel(R.geo.W, r.W) < 1e-12 && R.nModes == r.n);
    const auto s = linearRoot(R, P_NOM, 0);
    CHECK(s && rel(s->re, r.re) < 1e-10 && rel(s->im, r.im) < 1e-12);
  }
}

TEST("pipe: every pipe of every rank speaks (its fundamental's root has Re s > 0) at the default wind; the tuning table is the JavaScript's") {
  for (int k = KEY_LO; k <= KEY_HI; k++) {
    const KeyModels km = keyModels(k, VOICED);
    for (int r = 0; r < RANKS; r++) {
      PipeModel R = km.pipes[r];
      const auto s = linearRoot(R, P_NOM, 0);
      CHECK(s && s->re > 0);
    }
  }
  CHECK(TUNING_OPEN[0].x == 5.906891 && TUNING_OPEN[0].tune == 1.0035962 && TUNING_STOPPED[0].tune == 0.9841592);
  CHECK(tuning(10, false) == TUNING_OPEN[0].tune && tuning(1e5, true) == TUNING_STOPPED[std::size(TUNING_STOPPED) - 1].tune);
}

TEST("packed: a key's pipes round-trip through the page's packed form (all the engine reads of them)") {
  const KeyModels a = keyModels(53, {0.8, 1.4, 0.2});
  std::vector<double> buf(PACKED_MAX);
  const int n = packKeyModels(a, buf.data());
  CHECK(n <= PACKED_MAX);
  KeyModels b;
  CHECK(unpackKeyModels(buf.data(), n, b));
  CHECK(b.key == 53 && b.design == a.design);
  for (int r = 0; r < RANKS; r++) {
    const PipeModel &x = a.pipes[r], &y = b.pipes[r];
    CHECK(x.f == y.f && x.stopped == y.stopped && x.M == y.M && x.A == y.A && x.nModes == y.nModes);
    CHECK(x.geo.W == y.geo.W && x.geo.b == y.geo.b && x.geo.H == y.geo.H && x.geo.y0 == y.geo.y0 && x.geo.h == y.geo.h && x.geo.dd == y.geo.dd && x.geo.Sm == y.geo.Sm);
    for (int m = 0; m < x.nModes; m++) CHECK(x.modes[m].om == y.modes[m].om && x.modes[m].sigma == y.modes[m].sigma);
  }
  CHECK(!unpackKeyModels(buf.data(), n - 1, b));
}

TEST("engine: a key sounds its note on the Principal, Octave and Gedackt (±3 ¢), at 44.1 and 48 kHz") {
  for (double fs : {44100.0, 48000.0}) for (int r : {0, 1, 2}) for (int key : {KEY_LO, 60, KEY_HI}) {
    auto P = defaults();
    P[p::noise] = 0;
    P[p::principal] = r == 0; P[p::octave] = r == 1; P[p::gedackt] = r == 2;
    auto ep = std::make_unique<PipeEngine>(fs); // on the heap: it is too big for a WebAssembly stack
    PipeEngine &e = *ep;
    e.setParams(P.data());
    e.noteOn(key, 0.7); // with threads the key's pipes may not be voiced yet: the note waits for them
    CHECK(until(e, 1));
    const double sec = r == 2 || key < 48 ? 1.4 : 1.0;
    const auto L = render(e, (int)(sec * fs));
    const double f0 = pipeFreq(key, r), f = peakNear(L, f0, (int)((sec - 0.4) * fs), (int)(sec * fs), fs);
    CHECK(std::fabs(cents(f, f0)) < 3);
    double pk = 0;
    for (float v : L) pk = std::max(pk, (double)std::fabs(v));
    CHECK(pk > 0.01 && pk < 0.5);
  }
}

TEST("engine: pitch bend warms or cools the organ's air: a sounding pipe follows, two semitones at the wheel's ends") {
  const double fs = 48000;
  for (int r : {0, 2}) for (int key : {KEY_LO, 60, KEY_HI}) for (double v : {1.0, -1.0}) {
    auto P = defaults();
    P[p::noise] = 0;
    P[p::principal] = r == 0; P[p::octave] = 0; P[p::gedackt] = r == 2;
    auto ep = std::make_unique<PipeEngine>(fs);
    PipeEngine &e = *ep;
    e.setParams(P.data());
    e.noteOn(key, 0.7);
    CHECK(until(e, 1));
    render(e, (int)(0.6 * fs));
    e.bend(v);
    const double sec = r == 2 || key < 48 ? 1.2 : 0.8;
    const auto L = render(e, (int)(sec * fs));
    const double f0 = pipeFreq(key, r) * std::pow(2.0, 2 * v / 12), f = peakNear(L, f0, (int)((sec - 0.4) * fs), (int)(sec * fs), fs);
    CHECK(std::fabs(cents(f, f0)) < 3);
  }
}

TEST("engine: a held key keeps its pipes while the voicing changes; pressed again it is re-voiced, the old pipes fading") {
  const double fs = 48000;
  auto P = defaults();
  auto ep = std::make_unique<PipeEngine>(fs);
  PipeEngine &e = *ep;
  e.setParams(P.data());
  e.noteOn(60, 0.7);
  if (!until(e, 1)) { CHECK(false); return; }
  const KeyModels *first = e.voices[0]->models;
  P[p::cutup] = 1.4;
  e.setParams(P.data());
  for (int i = 0; i < 20; i++) { render(e, 128); std::this_thread::sleep_for(std::chrono::milliseconds(2)); }
  CHECK(e.nVoices == 1 && e.voices[0]->models == first && first->design.cutup == 1);
  e.noteOn(60, 0.7);
  until(e, 2);
  CHECK(e.nVoices == 2 && e.voices[0]->fading && e.voices[1]->models->design.cutup == 1.4 && e.byKey[60] == e.voices[1]);
  render(e, (int)(0.4 * fs)); // the old voice has faded and let go of its pipes
  CHECK(e.nVoices == 1 && e.voices[0]->models->design.cutup == 1.4);
  e.noteOff(60, -1);
  render(e, (int)(2.5 * fs));
  CHECK(e.nVoices == 0 && e.voiceCount() == 0);
}

TEST("engine: the views' messages: the focused pipe's traces in pieces, then the wind and the pipe") {
  const double fs = 48000;
  auto P = defaults();
  SpscQueue<Message> q(8192);
  auto ep = std::make_unique<PipeEngine>(fs);
  PipeEngine &e = *ep;
  e.messages = &q;
  e.setParams(P.data());
  e.noteOn(64, 0.7);
  until(e, 1);
  render(e, (int)(0.3 * fs));
  Message m;
  int states = 0, pieces = 0, last = 0;
  bool good = true;
  while (q.pop(m)) {
    if (m.type == msg::state) { states++; good = good && m.key == 64 && m.count == 21 && last == 36; last = 0; }
    else { pieces++; last++; good = good && m.type >= msg::v && m.type <= msg::qin && m.key == 64; }
  }
  CHECK(good && states > 3 && pieces == 36 * states);
  // the last state: chest pressure near the bellows', one pipe, the Principal at e¹'s pitch
  CHECK(std::fabs(m.values[0] - 700) < 50 && m.values[2] > 690 && m.values[4] == 1 && m.values[6] == 0);
  CHECK(std::fabs(m.values[7] - keyFreq(64)) < 0.01 && m.values[15] > 20 && m.values[19] == PipeEngine::TRACE);
}

TEST("CPU: ten keys at 48 kHz (Principal 8′; then with Octave 4′ and Gedackt 8′, 30 pipes) take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  for (int stops = 1; stops <= 3; stops += 2) {
    auto P = defaults();
    P[p::octave] = stops == 3; P[p::gedackt] = stops == 3;
    auto ep = std::make_unique<PipeEngine>(fs);
    PipeEngine &e = *ep;
    e.setParams(P.data());
    for (int k : {48, 52, 55, 60, 64, 67, 71, 72, 76, 79}) e.noteOn(k, 0.8);
    until(e, 10);
    std::vector<float> L(128), R(128);
    for (int b = 0; b < (int)(0.5 * fs / 128); b++) e.process(L.data(), R.data(), 128); // the pipes speak
    const auto t0 = std::chrono::steady_clock::now();
    const int blocks = (int)(4 * fs / 128);
    for (int b = 0; b < blocks; b++) e.process(L.data(), R.data(), 128);
    const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 4;
    std::printf("       10 keys, %d pipes: %.2f %% of a core\n", e.voiceCount(), 100 * share);
    CHECK(e.voiceCount() == 10 * stops);
    CHECK(share < (stops == 1 ? 0.15 : 0.3));
  }
  // and a key's six pipes, voiced off the audio thread
  const auto t1 = std::chrono::steady_clock::now();
  for (int k = KEY_LO; k <= KEY_HI; k++) keyModels(k, {1.3, 1, 0.4});
  std::printf("       a key's pipes: %.2f ms to voice\n", 1000 * std::chrono::duration<double>(std::chrono::steady_clock::now() - t1).count() / (KEY_HI - KEY_LO + 1));
}

int main() { return check::run(); }
