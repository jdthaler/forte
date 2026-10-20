// pyrophone-tests.cpp — the pyrophone's model and engine in C++: the published eigenvalues and the
// default tube's thresholds, a note that waits for its tube's tuning (built on the worker) and then
// sings in tune, a tube change that keeps the old table until the new one is in, the key-up power
// deciding whether a tube remembers its note, aftertouch, the views' messages, and ten tubes in the
// CPU budget. The physics tests are the JavaScript suite's, run on the WebAssembly
// (node test/pyrophone-tests.mjs).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <thread>
#include <vector>

#include "check.h"
#include "forte/dsp.h"
#include "pyrophone-engine.h"

using namespace forte;
using namespace forte::pyrophone;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
// the tuning is built on a worker thread: wait for it, not for a number of samples
static void waitFor(PyrophoneEngine &e) {
  for (int i = 0; i < 5000 && !e.ready(); i++) std::this_thread::sleep_for(std::chrono::milliseconds(1));
  CHECK(e.ready());
}
static std::vector<float> render(PyrophoneEngine &e, int n) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  return L;
}
// frequency from interpolated upward zero crossings over [a, b)
static double zeroCrossFreq(const std::vector<float> &x, int a, int b, double fs) {
  double first = -1, last = -1;
  int n = 0;
  for (int i = a + 1; i < b; i++) if (x[i - 1] <= 0 && x[i] > 0) {
    const double t = i - 1 + x[i - 1] / (x[i - 1] - x[i]);
    if (first < 0) first = t; else { n++; last = t; }
  }
  return n * fs / (last - first);
}
static double peak(const std::vector<float> &x, int a, int b) {
  double m = 0;
  for (int i = a; i < b; i++) m = std::max(m, (double)std::fabs(x[i]));
  return m;
}

TEST("pyrophone model: Magri & Juniper's eigenvalues, and the default tube's Hopf point and fold") {
  const Tube sys = tubeC(0.01, 0.004, 0.25, 0.01);
  const Cx a = root(sys, 0, 0.1, true), b = root(sys, 0, 0.5, true);
  CHECK(std::fabs(a.re + 0.0056) < 5e-5 && std::fabs(a.im - 3.1848) < 5e-5);
  CHECK(std::fabs(b.re - 0.00023) < 5e-6 && std::fabs(b.im - 3.3570) < 5e-5);
  const pyrophone::Tuning t = tuning(TubeParams{});
  CHECK(t.mode == 1);
  CHECK_NEAR(t.betaH, 0.0884, 5e-4);
  CHECK_NEAR(t.fold, 0.0768, 5e-4);
  CHECK(t.betaMax / t.betaH > 6 && t.betaMax / t.betaH < 6.3); // the scream's ceiling: 6.1 × threshold
  // the flame's reactance raises the pitch above π: 12.7 ¢ at the Hopf point
  CHECK_NEAR(1200 * std::log2(t.W(t.betaH) / std::numbers::pi), 12.7, 0.5);
}

TEST("pyrophone: a note played before its tube's tuning is built waits for it, then sings in tune") {
  const double fs = 48000;
  auto P = defaults();
  P[p::drift] = 0;
  auto engine = std::make_unique<PyrophoneEngine>(fs); // big for a WebAssembly stack
  PyrophoneEngine &e = *engine;
  e.setParams(P.data());
  e.noteOn(69, 0.7); // at once: the table is still being built on the worker (or, without threads, now)
  for (int i = 0; i < 5000 && !e.voiceCount(); i++) { render(e, 128); if (!e.voiceCount()) std::this_thread::sleep_for(std::chrono::milliseconds(1)); }
  CHECK(e.voiceCount() == 1);
  const auto L = render(e, (int)(1.6 * fs));
  const double f = zeroCrossFreq(L, (int)(1.1 * fs), (int)(1.6 * fs), fs);
  CHECK(std::fabs(1200 * std::log2(f / 440)) < 3);
  const double pk = peak(L, 0, (int)L.size());
  CHECK(pk > 0.05 && pk < 0.5);
}

TEST("pyrophone: pitch bend heats the gas: every tube follows, two semitones at the wheel's ends") {
  const double fs = 48000;
  auto P = defaults();
  P[p::drift] = 0;
  auto engine = std::make_unique<PyrophoneEngine>(fs);
  PyrophoneEngine &e = *engine;
  e.setParams(P.data());
  waitFor(e);
  e.noteOn(69, 0.7);
  render(e, (int)(1.1 * fs));
  for (double v : {1.0, -1.0}) {
    e.bend(v);
    const auto L = render(e, (int)(0.8 * fs));
    const double f = zeroCrossFreq(L, (int)(0.3 * fs), (int)(0.8 * fs), fs);
    CHECK(std::fabs(1200 * std::log2(f / 440) - 200 * v) < 5);
  }
}

TEST("pyrophone: a new tube keeps playing from the last table until its own is in") {
  const double fs = 48000;
  auto P = defaults();
  auto engine = std::make_unique<PyrophoneEngine>(fs);
  PyrophoneEngine &e = *engine;
  e.setParams(P.data());
  waitFor(e);
  e.noteOn(60, 0.7);
  render(e, 4800);
  const pyrophone::Tuning *before = e.tune;
  P[p::bore] = 0.05;
  e.setParams(P.data());
  e.noteOn(64, 0.7); // no wait: the old table cuts it
  CHECK(e.voiceCount() == 2 && e.tune != nullptr);
  waitFor(e);
  render(e, 128);
  CHECK(e.tune != before && e.tune->P.bore == 0.05);
  const auto L = render(e, (int)(0.5 * fs));
  for (float x : L) CHECK(std::isfinite(x));
}

TEST("pyrophone: released at the default key-up power a tube dies and is freed; in the bistable band it sings on") {
  const double fs = 48000;
  for (double keyup : {0.2, 0.93}) {
    auto P = defaults();
    P[p::keyup] = keyup;
    auto engine = std::make_unique<PyrophoneEngine>(fs);
    PyrophoneEngine &e = *engine;
    e.setParams(P.data());
    waitFor(e);
    e.noteOn(72, 0.8);
    render(e, (int)(1.0 * fs));
    e.noteOff(72, -1);
    const auto L = render(e, (int)(2.0 * fs));
    const double late = peak(L, (int)(1.5 * fs), (int)(2.0 * fs));
    if (keyup < 0.5) CHECK(e.voiceCount() == 0 && late == 0);
    else CHECK(e.voiceCount() == 1 && late > 0.05);
  }
}

TEST("pyrophone: aftertouch parts a held tube's flames further, below the scream") {
  const double fs = 48000;
  auto P = defaults();
  auto engine = std::make_unique<PyrophoneEngine>(fs);
  PyrophoneEngine &e = *engine;
  e.setParams(P.data());
  waitFor(e);
  e.noteOn(60, 0.5);
  const double b0 = e.voices[0]->betaT;
  e.pressure(1, 60);
  const double b1 = e.voices[0]->betaT;
  CHECK_NEAR(b1 / b0, 1.25, 1e-12);
  e.noteOn(62, 1);
  e.pressure(1, 62);
  CHECK(e.voices[1]->betaT <= e.tune->betaMax);
}

TEST("pyrophone: the views' messages (every tube, the focused one's trail and snapshot) come through") {
  const double fs = 48000;
  auto P = defaults();
  auto engine = std::make_unique<PyrophoneEngine>(fs);
  PyrophoneEngine &e = *engine;
  SpscQueue<Message> q(512);
  e.messages = &q;
  e.setParams(P.data());
  waitFor(e);
  e.noteOn(60, 0.8);
  e.noteOn(67, 0.8);
  int tubes = 0, trail = 0, focus = 0, ends = 0, snaps = 0;
  std::vector<float> L(128), R(128);
  for (int b = 0; b < (int)(0.5 * fs / 128); b++) {
    e.process(L.data(), R.data(), 128);
    for (Message m; q.pop(m);) {
      if (m.type == msg::tube) tubes++;
      if (m.type == msg::trail) trail++;
      if (m.type == msg::focus) { focus++; CHECK(m.key == 67); if (m.values[8] > 0) snaps++; }
      if (m.type == msg::end) { ends++; CHECK(m.values[0] == 2); }
    }
  }
  CHECK(ends > 20 && tubes == 2 * ends && focus == ends && trail >= ends && snaps > 5);
}

// MPE (forte/expression.h): one key's own bend heats its tube's gas alone, its slide is its flames' power
static const PyrophoneEngine::Voice *voiceOf(const PyrophoneEngine &e, int key) {
  for (int i = 0; i < e.nVoices; i++) if (e.voices[i]->key == key && !e.voices[i]->fade) return e.voices[i];
  return nullptr;
}
static std::unique_ptr<PyrophoneEngine> ready(double fs, const std::vector<double> &P) {
  auto e = std::make_unique<PyrophoneEngine>(fs);
  e->setParams(P.data());
  waitFor(*e);
  return e;
}

TEST("pyrophone: MPE: a key's own bend heats its tube's gas: it sings at the ratio from the strike, as the wheel bent as far") {
  const double fs = 48000;
  auto P = defaults();
  P[p::drift] = 0;
  for (double st : {-24.0, -7.0, 5.0, 12.0}) {
    auto e = ready(fs, P);
    e->noteBend(std::pow(2.0, st / 12), 69);
    e->noteOn(69, 0.7);
    const auto L = render(*e, (int)(1.6 * fs));
    const double f = zeroCrossFreq(L, (int)(1.1 * fs), (int)(1.6 * fs), fs);
    CHECK(std::fabs(1200 * std::log2(f / 440) - 100 * st) < 3);
  }
  // the wheel at its end and the key bent as far: once the wheel's glide lands, the same tube
  auto w = ready(fs, P), k = ready(fs, P);
  w->bend(1);
  k->noteBend(fdlibm::pow(2.0, kBendSemitones / 12), 69);
  w->noteOn(69, 0.7);
  k->noteOn(69, 0.7);
  const auto A = render(*w, (int)(1.6 * fs)), B = render(*k, (int)(1.6 * fs));
  CHECK(voiceOf(*w, 69)->h == voiceOf(*k, 69)->h);
  const double fa = zeroCrossFreq(A, (int)(1.1 * fs), (int)(1.6 * fs), fs), fb = zeroCrossFreq(B, (int)(1.1 * fs), (int)(1.6 * fs), fs);
  CHECK(std::fabs(1200 * std::log2(fb / fa)) < 0.5);
}

TEST("pyrophone: MPE: one key bends, its held neighbour stays where it was") {
  const double fs = 48000;
  auto P = defaults();
  auto a = ready(fs, P), b = ready(fs, P);
  for (auto *e : {a.get(), b.get()}) { e->noteOn(64, 0.7); e->noteOn(69, 0.7); render(*e, (int)(0.5 * fs)); }
  const double r = std::pow(2.0, 5.0 / 12);
  b->noteBend(r, 69);
  render(*a, (int)(0.5 * fs));
  render(*b, (int)(0.5 * fs));
  CHECK(voiceOf(*a, 64)->h == voiceOf(*b, 64)->h);
  CHECK_NEAR(voiceOf(*b, 69)->h / voiceOf(*a, 69)->h, r, 1e-12);
}

TEST("pyrophone: MPE: bent far up a tube keeps only the modes a sample holds, and sings again in tune when it comes back") {
  const double fs = 44100;
  auto P = defaults();
  P[p::drift] = 0;
  auto e = ready(fs, P);
  e->noteOn(96, 0.8);
  render(*e, (int)(0.5 * fs));
  const int N = voiceOf(*e, 96)->N;
  e->noteBend(std::pow(2.0, 24.0 / 12), 96);
  const auto up = render(*e, (int)(0.5 * fs));
  const int M = voiceOf(*e, 96)->M;
  CHECK(M >= 1 && M < N);
  for (float x : up) CHECK(std::isfinite(x) && std::fabs(x) < 2);
  e->noteBend(1, 96);
  const auto back = render(*e, (int)(1.5 * fs));
  CHECK(voiceOf(*e, 96)->M == N);
  const double f = zeroCrossFreq(back, (int)(1.0 * fs), (int)(1.5 * fs), fs), want = 440 * std::pow(2.0, (96 - 69) / 12.0);
  CHECK(std::fabs(1200 * std::log2(f / want)) < 3);
}

TEST("pyrophone: MPE: a key's slide is its own flames' power: the note is the one played at that power, struck with it or slid while it sings") {
  const double fs = 48000;
  for (double x : {1.5, 5.0}) {
    auto P = defaults(), Px = P;
    Px[p::flame] = x;
    // struck with it
    auto a = ready(fs, Px), b = ready(fs, P);
    b->slide(x, 60);
    a->noteOn(60, 0.7);
    b->noteOn(60, 0.7);
    const auto A = render(*a, (int)(0.8 * fs)), B = render(*b, (int)(0.8 * fs));
    CHECK(A == B);
    // slid while it sings, beside a neighbour that keeps the panel's power
    auto c = ready(fs, P), d = ready(fs, P), n = ready(fs, P);
    for (auto *e : {c.get(), d.get()}) { e->noteOn(60, 0.7); render(*e, (int)(0.4 * fs)); }
    c->setParams(Px.data());
    d->slide(x, 60);
    CHECK(render(*c, (int)(0.6 * fs)) == render(*d, (int)(0.6 * fs)));
    d->noteOn(67, 0.7);
    n->noteOn(67, 0.7);
    CHECK(voiceOf(*d, 67)->betaT == voiceOf(*n, 67)->betaT);
  }
}

TEST("pyrophone: MPE: noteBend(1) and slide(NaN), before and during the notes, leave the sound bit-identical") {
  const double fs = 48000;
  auto P = defaults();
  auto a = ready(fs, P), b = ready(fs, P);
  const int keys[] = {48, 60, 67};
  for (int k : keys) { b->noteBend(1, k); b->slide(NAN, k); }
  for (auto *e : {a.get(), b.get()}) for (int k : keys) e->noteOn(k, 0.7);
  std::vector<float> A, B;
  for (int blk = 0; blk < (int)(1.0 * fs / 128); blk++) {
    if (blk % 7 == 0) for (int k : keys) { b->noteBend(1, k); b->slide(NAN, k); }
    if (blk == 200) for (auto *e : {a.get(), b.get()}) for (int k : keys) e->noteOff(k, -1);
    const auto x = render(*a, 128), y = render(*b, 128);
    A.insert(A.end(), x.begin(), x.end());
    B.insert(B.end(), y.begin(), y.end());
  }
  CHECK(A == B);
}

TEST("pyrophone: MPE: ±48 semitones and the whole slide on a chord, sent every block: finite and bounded at 44.1, 48 and 96 kHz") {
  for (double fs : {44100.0, 48000.0, 96000.0}) for (int set = 0; set < 2; set++) {
    auto P = defaults();
    if (set) { P[p::lag] = 1.5; P[p::drift] = 60; } // the longest flame lag, cold: the delay line's limit going down
    auto e = ready(fs, P);
    const int keys[] = {21, 45, 69, 93, 108};
    for (int k : keys) e->noteOn(k, 1);
    double pk = 0;
    bool finite = true, fits = true;
    for (int blk = 0; blk < (int)(1.5 * fs / 128); blk++) {
      for (int i = 0; i < 5; i++) {
        const double t = blk * 128 / fs + 0.13 * i;
        e->noteBend(std::pow(2.0, 60 * std::sin(TAU * 1.3 * t) / 12), keys[i]); // past ±48: clamped
        e->slide(3.25 + 2.75 * std::sin(TAU * 2.1 * t), keys[i]);               // the flame power's range, 0.5 to 6
      }
      if (blk == (int)(fs / 128)) for (int k : keys) e->noteOff(k, -1);
      const auto L = render(*e, 128);
      for (float x : L) { finite = finite && std::isfinite(x); pk = std::max(pk, (double)std::fabs(x)); }
      for (int i = 0; i < e->nVoices; i++) fits = fits && e->voices[i]->d < PyrophoneEngine::HIST - 4; // the bend stops short of the line's end
    }
    CHECK(finite && fits);
    CHECK(pk < 2);
  }
}

TEST("CPU: ten tubes singing at once at 48 kHz take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  auto P = defaults();
  auto engine = std::make_unique<PyrophoneEngine>(fs);
  PyrophoneEngine &e = *engine;
  e.setParams(P.data());
  waitFor(e);
  for (int k : {48, 52, 55, 60, 64, 67, 71, 72, 76, 79}) e.noteOn(k, 0.8);
  std::vector<float> L(128), R(128);
  for (int b = 0; b < (int)(1 * fs / 128); b++) e.process(L.data(), R.data(), 128); // let them speak
  const auto t0 = std::chrono::steady_clock::now();
  const int blocks = (int)(4 * fs / 128);
  for (int b = 0; b < blocks; b++) e.process(L.data(), R.data(), 128);
  const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 4;
  std::printf("       %d tubes: %.2f %% of a core\n", e.voiceCount(), 100 * share);
  CHECK(share < 0.1);
}

int main() { return check::run(); }
