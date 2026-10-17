// springs-tests.cpp — the Spring Keyboard in C++: the helical rod against the ring's rigid-body
// motion, the tuning on the note, the packed springs a page sends, the engine on pitch, a note that
// waits for its springs to be built (forte/background.h) and a re-cut spring fading out, the
// damper and the pedal, the echo view's capture, and ten keys within the CPU budget.
// The physics tests are the JavaScript suite's, run on the WebAssembly (FORTE_ENGINE=wasm).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <thread>
#include <vector>

#include "check.h"
#include "springs-engine.h"

using namespace forte;
using namespace forte::springs;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
static std::vector<float> render(SpringEngine &e, int n, std::vector<float> *right = nullptr) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  if (right) *right = R;
  return L;
}
// render blocks, giving the worker time, until n voices sound (a note waits for its springs)
static bool until(SpringEngine &e, int n) {
  std::vector<float> L(128), R(128);
  for (int i = 0; i < 4000 && e.voiceCount() < n; i++) { e.process(L.data(), R.data(), 128); std::this_thread::sleep_for(std::chrono::milliseconds(1)); }
  return e.voiceCount() >= n;
}
// |DTFT| of x[a, b) at f, Hann-windowed
static double tone(const std::vector<float> &x, double f, int a, int b, double fs) {
  double re = 0, im = 0;
  for (int i = a; i < b; i++) { const double h = 0.5 - 0.5 * std::cos(TAU * (i - a) / (b - a)); re += h * x[i] * std::cos(TAU * f * i / fs); im += h * x[i] * std::sin(TAU * f * i / fs); }
  return std::hypot(re, im);
}
// the strongest partial within ±10 ¢ of f (a scan, then ternary search)
static double peakNear(const std::vector<float> &x, double f, int a, int b, double fs) {
  double best = f, bv = -1;
  for (double c = -10; c <= 10; c += 0.25) { const double fr = f * std::pow(2.0, c / 1200), v = tone(x, fr, a, b, fs); if (v > bv) { bv = v; best = fr; } }
  double lo = best * std::pow(2.0, -0.25 / 1200), hi = best * std::pow(2.0, 0.25 / 1200);
  for (int it = 0; it < 30; it++) { const double m1 = (2 * lo + hi) / 3, m2 = (lo + 2 * hi) / 3; if (tone(x, m1, a, b, fs) > tone(x, m2, a, b, fs)) hi = m2; else lo = m1; }
  return 0.5 * (lo + hi);
}

TEST("rod: at k → 0 the lowest sheets are rigid-body motion (ω → 0); the drive's sheet carries the bead's rotation; F_C of the C4 spring lies a few kHz up") {
  const Params P;
  const Spring sp = tuneSpring(60, P);
  RodSolver &s = *sp.solver;
  s.solve(1e-6);
  CHECK(s.w[0] < 1e-5 && s.w[1] < 1e-5);
  for (int j = 0; j < 5; j++) CHECK(s.w[j] <= s.w[j + 1]);
  CHECK(sp.onBranch && sp.Fc > 2000 && sp.Fc < 8000);
  // axially driven springs are cut about √(1+ν) shorter for the same note
  Params ax;
  ax.axial = true;
  CHECK(std::fabs(sp.L / tuneSpring(60, ax).L - std::sqrt(1 + STEEL_NU)) < 0.01);
}

TEST("tuning: every fifth key's springs as played have their virtual pitch on the note (within 0.5 ¢); the packed springs a page sends come back the same") {
  const Params P;
  double worst = 0;
  for (int k = KEY_LO; k <= KEY_HI; k += 5) {
    const KeySprings d = keySprings(k, P, 48000);
    worst = std::max(worst, std::fabs(cents(d.pitch, keyFreq(k))));
    CHECK(d.springs.size() == 2 && d.rho > 0.95 && d.rho < 1.05);
  }
  std::printf("       worst %.3f ¢\n", worst);
  CHECK(worst < 0.5);
  Params q;
  q.springs = 3;
  const KeySprings d = keySprings(43, q, 44100);
  const std::vector<double> a = packKeySprings(d);
  KeySprings b;
  CHECK(unpackKeySprings(a.data(), (int)a.size(), b));
  CHECK(b.id == d.id && b.id == geometryId(q) && b.fs == 44100 && b.key == 43 && b.springs.size() == 3);
  for (int s = 0; s < 3; s++) CHECK(b.springs[s].f == d.springs[s].f && b.springs[s].rel == d.springs[s].rel && b.springs[s].n == d.springs[s].n && b.springs[s].L == d.springs[s].L);
  CHECK(!unpackKeySprings(a.data(), (int)a.size() - 1, b));
}

TEST("engine: one spring rings at its lowest mode, ρ·f₀ (within 1 ¢), once its springs are built; the voice is dropped when every mode has died") {
  const double fs = 48000;
  auto P = defaults();
  P[p::springs] = 1; P[p::endLoss] = 0.005; P[p::eta] = 1e-5;
  auto ep = std::make_unique<SpringEngine>(fs);
  SpringEngine &e = *ep;
  e.setParams(P.data());
  e.noteOn(55, 0.8);
  CHECK(until(e, 1));
  const std::vector<float> x = render(e, (int)(0.8 * fs));
  const double f = keyFreq(55) * keySprings(55, paramsOf(P.data()), fs).rho;
  const double fm = peakNear(x, f, 960, (int)x.size(), fs);
  CHECK(std::fabs(cents(fm, f)) < 1);
  // a damped treble note is gone within 1.5 s
  auto P2 = defaults();
  P2[p::damper] = 0.05;
  auto e2 = std::make_unique<SpringEngine>(fs);
  e2->setParams(P2.data());
  e2->noteOn(84, 0.5);
  CHECK(until(*e2, 1));
  render(*e2, (int)(0.05 * fs));
  e2->noteOff(84, -1);
  render(*e2, (int)(1.5 * fs));
  CHECK(e2->voiceCount() == 0);
}

TEST("engine: a key re-cut while it rings (the coil moved) fades the old springs out under the new ones, which hold their data until they let go") {
  const double fs = 48000;
  auto P = defaults();
  auto ep = std::make_unique<SpringEngine>(fs);
  SpringEngine &e = *ep;
  e.setParams(P.data());
  e.noteOn(60, 0.7);
  CHECK(until(e, 1));
  render(e, 4800);
  const KeySprings *first = e.voices[0]->ref.data;
  P[p::coil] = 1.4;
  e.setParams(P.data());
  e.noteOn(60, 0.7);
  CHECK(until(e, 2));
  CHECK(e.voiceCount() == 2 && e.voices[0]->fading && e.voices[0]->ref.data == first && e.voices[1]->ref.data != first);
  CHECK(e.voices[1]->ref.data->id == geometryId(paramsOf(P.data())));
  render(e, 4800); // the old spring has faded and let go of its data
  CHECK(e.voiceCount() == 1 && !e.voices[0]->fading);
}

TEST("engine: the damper falls when the key comes up; the pedal holds it off, to the sample") {
  const double fs = 48000;
  auto P = defaults();
  P[p::springs] = 1; P[p::endLoss] = 0.005; P[p::eta] = 1e-5; P[p::damper] = 0.4;
  auto run = [&](bool pedal, bool off) {
    auto ep = std::make_unique<SpringEngine>(fs);
    ep->setParams(P.data());
    ep->setSustain(pedal);
    ep->noteOn(55, 0.8);
    until(*ep, 1);
    std::vector<float> a = render(*ep, (int)(0.3 * fs));
    if (off) ep->noteOff(55, -1);
    std::vector<float> b = render(*ep, (int)(0.6 * fs));
    a.insert(a.end(), b.begin(), b.end());
    return a;
  };
  const auto held = run(false, false), rel = run(false, true), ped = run(true, true);
  bool same = held.size() == ped.size();
  for (size_t i = 0; same && i < held.size(); i++) same = held[i] == ped[i];
  CHECK(same);
  const double f = keyFreq(55) * keySprings(55, paramsOf(P.data()), fs).rho;
  const int a = (int)(0.6 * fs), b = (int)(0.7 * fs);
  CHECK(tone(rel, f, a, b, fs) < 0.01 * tone(held, f, a, b, fs));
}

TEST("engine: a strike's first moments are captured for the page's echo view, and posted once filled") {
  const double fs = 48000;
  auto P = defaults();
  SpscQueue<Message> q(256);
  auto ep = std::make_unique<SpringEngine>(fs);
  SpringEngine &e = *ep;
  e.messages = &q;
  e.setParams(P.data());
  e.noteOn(48, 0.7);
  CHECK(until(e, 1));
  Message m;
  bool got = false;
  for (int i = 0; i < 400 && !got; i++) { render(e, 128); while (q.pop(m)) if (m.type == msg::echo) got = true; }
  CHECK(got && m.key == 48 && m.values[0] >= 2048 && m.values[0] <= SpringEngine::CAPTURE && std::fabs(m.values[1] - 0.7) < 1e-6);
  double pk = 0;
  for (int i = 0; i < (int)m.values[0]; i++) pk = std::max(pk, (double)std::fabs(e.capture[i]));
  CHECK(pk > 0.01);
}

TEST("CPU: ten keys across the compass, two springs each, struck in turn and ringing, at 48 kHz take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  const int keys[10] = {36, 41, 46, 51, 56, 61, 66, 71, 76, 81};
  auto P = defaults();
  auto ep = std::make_unique<SpringEngine>(fs);
  SpringEngine &e = *ep;
  e.setParams(P.data());
  // build the keys' springs first (the worker's job), then let them go
  for (int k : keys) e.noteOn(k, 0.01);
  CHECK(until(e, 10));
  e.allNotesOff();
  render(e, 4800);
  std::vector<float> L(128), R(128);
  const auto t0 = std::chrono::steady_clock::now();
  const int blocks = (int)(2 * fs / 128);
  int k = 0;
  for (int b = 0; b < blocks; b++) { if (k < 10 && b % 8 == 0) e.noteOn(keys[k++], 0.8); e.process(L.data(), R.data(), 128); }
  const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 2;
  std::printf("       %.2f %% of a core; %d voices still sounding after 2 s\n", 100 * share, e.voiceCount());
  CHECK(share < 0.3); // the JavaScript suite's budget
  // all ten struck at once, their first half second (every mode still sounding)
  e.allNotesOff();
  render(e, 4800);
  for (int key : keys) e.noteOn(key, 0.8);
  const auto t2 = std::chrono::steady_clock::now();
  for (int b = 0; b < (int)(0.5 * fs / 128); b++) e.process(L.data(), R.data(), 128);
  const double all = std::chrono::duration<double>(std::chrono::steady_clock::now() - t2).count() / 0.5;
  std::printf("       all ten at once, their first 0.5 s: %.2f %% of a core\n", 100 * all);
  CHECK(e.voiceCount() == 10 && all < 0.3);
  // and a key's springs, built off the audio thread
  const auto t1 = std::chrono::steady_clock::now();
  for (int key = KEY_LO; key <= KEY_HI; key += 4) keySprings(key, paramsOf(P.data()), fs);
  std::printf("       a key's springs: %.1f ms to build\n", 1000 * std::chrono::duration<double>(std::chrono::steady_clock::now() - t1).count() / 13);
}

int main() { return check::run(); }
