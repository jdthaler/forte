// arc-tests.cpp — the singing arc in C++: the model gives the numbers the JavaScript model gave, the plugin's
// engine cuts each key's capacitor off the audio thread and sings it in tune, a note on a key not
// yet cut still sounds, the views' messages come through, the talking arc speaks, every sample
// rate stays finite, and six lamps fit the CPU budget. The physics tests are the JavaScript
// suite's, run on the WebAssembly (node test/arc-tests.mjs).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <thread>
#include <vector>

#include "arc-engine.h"
#include "check.h"

using namespace forte;
using namespace forte::arc;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
static std::vector<float> render(ArcEngine &e, int n, std::vector<float> *right = nullptr) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  if (right) *right = R;
  return L;
}
static double rms(const std::vector<float> &x, int a, int b) {
  double s = 0;
  for (int i = a; i < b; i++) s += (double)x[i] * x[i];
  return std::sqrt(s / (b - a));
}
// the phase of frequency f over [a, a + m) (Hann window)
static double phaseAt(const std::vector<float> &x, double f, int a, int m, double fs) {
  const double w = TAU * f / fs;
  double re = 0, im = 0;
  for (int i = a; i < a + m; i++) { const double h = 0.5 - 0.5 * std::cos(TAU * (i - a) / m); re += h * x[i] * std::cos(w * i); im -= h * x[i] * std::sin(w * i); }
  return std::atan2(im, re);
}
// the sounding frequency near f over [a, b): the demodulated signal's phase advance
static double freqAt(const std::vector<float> &x, double f, int a, int b, double fs) {
  const int m = 4096;
  auto wrap = [](double d) { return d - TAU * std::round(d / TAU); };
  const double f1 = f + wrap(phaseAt(x, f, a + 512, m, fs) - phaseAt(x, f, a, m, fs)) * fs / (TAU * 512);
  return f1 + wrap(phaseAt(x, f1, b - m, m, fs) - phaseAt(x, f1, a, m, fs)) * fs / (TAU * (b - m - a));
}
// the worker builds the key's capacitor: wait for it rather than for a number of samples
static void waitFor(ArcEngine &e, int key) {
  for (int i = 0; i < 5000 && !e.ready(key); i++) std::this_thread::sleep_for(std::chrono::milliseconds(1));
  CHECK(e.ready(key));
}

TEST("arc: the model gives the JavaScript's numbers (operating point, linear analysis, limits, capacitors)") {
  const auto P = defaults();
  const ArcParams a = arcParams(P.data());
  const Op op = arcOp(a);
  const auto rel = [](double x, double y) { return std::fabs(x / y - 1); };
  // what the JavaScript model gave at the defaults, before it was retired
  CHECK(rel(op.u0, 59.506631958630386) < 1e-14);
  CHECK(rel(op.Rd, -4.7842383887784443) < 1e-12);
  CHECK(rel(op.Larc, 0.00039762245793802310) < 1e-12);
  CHECK(rel(op.Rb, 53.497789347123209) < 1e-14);
  const double C64 = kelvinC(keyFreq(64), 0.02);
  const Linear la = linearAnalysis(circuit(a, C64));
  CHECK(rel(la.sigma, 109.11401897748850) < 1e-10);
  CHECK(rel(la.f, 325.86684884517871) < 1e-12);
  CHECK(rel(thresholdR(a, C64), 4.7507518500310955) < 1e-10);
  CHECK(rel(upperLimit(a), 4687.8302103465321) < 1e-10);
  ArcParams slow = a;
  slow.tau = 150;
  CHECK(rel(upperLimit(slow), 842.56589118140994) < 1e-10);
  CHECK(rel(startCap(72, a, op), 0.0000045304621437269411) < 1e-12);
  CHECK(rel(capFor(60, a), 0.000017710730714515597) < 1e-9);
  CHECK(rel(capFor(84, a), 0.0000011322416998426804) < 1e-9);
  CHECK(rel(capFor(48, slow), 0.000061739639650113800) < 1e-9);
  // the small-signal impedance: −B/I² at low frequency, and zero at the negative limit
  CHECK(rel(zArc(1e-3, op).re, op.Rd) < 1e-9);
  CHECK(std::fabs(zArc(negLimit(op), op).re) < 1e-9 * op.R0);
}

TEST("arc: the plugin's engine cuts each key's capacitor off the audio thread, and the key sounds its note") {
  const double fs = 48000;
  auto P = defaults();
  for (int key : {48, 67, 84}) {
    auto e = std::make_unique<ArcEngine>(fs);
    e->setParams(P.data());
    waitFor(*e, key);
    e->noteOn(key, 0.8);
    const auto L = render(*e, (int)(0.75 * fs));
    const double f = freqAt(L, keyFreq(key), 14400, 36000, fs);
    CHECK(std::fabs(1200 * std::log2(f / keyFreq(key))) < 1);
    CHECK(rms(L, 14400, 36000) > 0.01);
    e->noteOff(key, -1);
    const auto T = render(*e, (int)(0.1 * fs));
    CHECK(rms(T, 2400, 4800) < 0.01 * rms(L, 14400, 36000)); // the contact opens: the note dies
  }
}

TEST("arc: pitch bend slides the coil's core: the note follows, two semitones at the wheel's ends") {
  const double fs = 48000;
  auto P = defaults();
  const int key = 67;
  for (double v : {1.0, -1.0}) {
    auto e = std::make_unique<ArcEngine>(fs);
    e->setParams(P.data());
    waitFor(*e, key);
    e->noteOn(key, 0.8);
    e->bend(v);
    const auto L = render(*e, (int)(0.75 * fs));
    const double want = keyFreq(key) * std::pow(2.0, 2 * v / 12), f = freqAt(L, want, 14400, 36000, fs);
    CHECK(std::fabs(1200 * std::log2(f / want)) < 10);
  }
}

// MPE (forte/expression.h): a key's own bend slides the core of the arc that sings it
static std::unique_ptr<ArcEngine> arcWith(double fs, const std::vector<double> &P, std::initializer_list<int> keys) {
  auto e = std::make_unique<ArcEngine>(fs);
  e->setParams(P.data());
  for (int k : keys) waitFor(*e, k);
  return e;
}
static double centsOf(double f, double g) { return 1200 * std::log2(f / g); }

TEST("arc: MPE: a key's own bend slides its arc's core: the note follows (the arc's lag pulls it, as the wheel's), and is the wheel's bent as far") {
  const double fs = 48000;
  auto P = defaults();
  const int key = 67;
  for (double st : {-12.0, -7.0, -3.0, 3.0, 7.0, 12.0}) {
    auto e = arcWith(fs, P, {key});
    e->noteBend(std::pow(2.0, st / 12), key);
    e->noteOn(key, 0.8);
    const auto L = render(*e, (int)(0.75 * fs));
    const double want = keyFreq(key) * std::pow(2.0, st / 12), f = freqAt(L, want, 14400, 36000, fs);
    CHECK(std::fabs(centsOf(f, want)) < 10 * std::fabs(st)); // within a tenth of the bend
    CHECK(rms(L, 14400, 36000) > 0.01);
  }
  for (double v : {1.0, -1.0}) {
    auto w = arcWith(fs, P, {key}), k = arcWith(fs, P, {key});
    k->noteBend(std::pow(2.0, 2 * v / 12), key);
    w->noteOn(key, 0.8);
    k->noteOn(key, 0.8);
    w->bend(v);
    const double want = keyFreq(key) * std::pow(2.0, 2 * v / 12);
    const double fw = freqAt(render(*w, (int)(0.75 * fs)), want, 14400, 36000, fs), fk = freqAt(render(*k, (int)(0.75 * fs)), want, 14400, 36000, fs);
    CHECK(std::fabs(centsOf(fk, want)) < 10);
    CHECK(std::fabs(centsOf(fk, fw)) < 0.2);
  }
}

TEST("arc: MPE: several arcs: one key bends its own lamp, its neighbour stays where it was") {
  const double fs = 48000;
  auto P = defaults();
  P[p::mode] = mode_::poly;
  const double r = std::pow(2.0, 2.0 / 12);
  auto a = arcWith(fs, P, {60, 67}), b = arcWith(fs, P, {60, 67});
  b->noteBend(r, 67);
  for (auto *e : {a.get(), b.get()}) { e->noteOn(60, 0.8); e->noteOn(67, 0.8); }
  const auto A = render(*a, (int)(0.75 * fs)), B = render(*b, (int)(0.75 * fs));
  CHECK(std::fabs(centsOf(freqAt(B, keyFreq(60), 14400, 36000, fs), freqAt(A, keyFreq(60), 14400, 36000, fs))) < 0.2);
  CHECK(std::fabs(centsOf(freqAt(B, keyFreq(67) * r, 14400, 36000, fs), keyFreq(67) * r)) < 10);
}

TEST("arc: MPE: one arc sings the newest key's bend; let go, it glides back to the key still held") {
  const double fs = 48000;
  auto P = defaults();
  const double r = std::pow(2.0, 2.0 / 12);
  auto bent = arcWith(fs, P, {60, 64}), plain = arcWith(fs, P, {60, 64}), lone = arcWith(fs, P, {60});
  bent->noteBend(r, 60);
  lone->noteBend(r, 60);
  for (auto *e : {bent.get(), plain.get()}) { e->noteOn(60, 0.8); e->noteOn(64, 0.8); }
  lone->noteOn(60, 0.8);
  const auto A = render(*bent, (int)(0.75 * fs)), B = render(*plain, (int)(0.75 * fs));
  const double both = freqAt(B, keyFreq(60) * keyFreq(64) / std::hypot(keyFreq(60), keyFreq(64)), 14400, 36000, fs);
  CHECK(std::fabs(centsOf(freqAt(A, both, 14400, 36000, fs), both)) < 0.2); // E4's (unbent), the capacitors in parallel
  bent->noteOff(64, -1);
  const auto C = render(*bent, (int)(0.75 * fs)), D = render(*lone, (int)(1.5 * fs));
  const double f = freqAt(D, keyFreq(60) * r, 50400, 72000, fs);
  CHECK(std::fabs(centsOf(freqAt(C, f, 14400, 36000, fs), f)) < 0.5);         // C4's, bent
}

TEST("arc: MPE: the talking arc's singer takes its key's own bend, as the wheel's") {
  const double fs = 48000;
  auto P = defaults();
  P[p::mode] = mode_::talk;
  auto w = arcWith(fs, P, {}), k = arcWith(fs, P, {});
  w->bend(1);
  k->noteBend(fdlibm::pow(2.0, kBendSemitones / 12), 55);
  w->noteOn(55, 0.8);
  k->noteOn(55, 0.8);
  CHECK(render(*w, (int)(0.5 * fs)) == render(*k, (int)(0.5 * fs)));
}

TEST("arc: MPE: noteBend(1), before and during the notes, leaves the sound bit-identical (one arc, several, talking)") {
  const double fs = 48000;
  for (int mode : {mode_::mono, mode_::poly, mode_::talk}) {
    auto P = defaults();
    P[p::mode] = mode;
    auto a = arcWith(fs, P, {48, 60, 67}), b = arcWith(fs, P, {48, 60, 67});
    const int keys[] = {48, 60, 67};
    for (int k : keys) { b->noteBend(1, k); b->slide(NAN, k); }
    for (auto *e : {a.get(), b.get()}) for (int k : keys) e->noteOn(k, 0.8);
    std::vector<float> A, B;
    for (int blk = 0; blk < (int)(0.6 * fs / 128); blk++) {
      if (blk % 5 == 0) for (int k : keys) { b->noteBend(1, k); b->slide(NAN, k); }
      if (blk == 120) for (auto *e : {a.get(), b.get()}) e->noteOff(60, -1);
      const auto x = render(*a, 128), y = render(*b, 128);
      A.insert(A.end(), x.begin(), x.end());
      B.insert(B.end(), y.begin(), y.end());
    }
    CHECK(A == B);
  }
}

TEST("arc: MPE: ±48 semitones (clamped to ±12) on chords, sent every block: finite and bounded at 44.1, 48 and 96 kHz") {
  for (double fs : {44100.0, 48000.0, 96000.0}) for (int mode : {mode_::mono, mode_::poly, mode_::talk}) {
    auto P = defaults();
    P[p::mode] = mode;
    P[p::arcs] = 4;
    auto e = arcWith(fs, P, {48, 60, 67, 84});
    const int keys[] = {48, 60, 67, 84};
    for (int k : keys) e->noteOn(k, 0.8);
    double pk = 0;
    bool finite = true;
    for (int blk = 0; blk < (int)(1.0 * fs / 128); blk++) {
      for (int i = 0; i < 4; i++) e->noteBend(std::pow(2.0, 60 * std::sin(TAU * 1.3 * (blk * 128 / fs + 0.13 * i)) / 12), keys[i]);
      if (blk == (int)(0.7 * fs / 128)) for (int k : keys) e->noteOff(k, -1);
      const auto L = render(*e, 128);
      for (float x : L) { finite = finite && std::isfinite(x); pk = std::max(pk, (double)std::fabs(x)); }
    }
    CHECK(finite);
    CHECK(pk < 2);
  }
}

TEST("arc: a key not cut yet still sounds (Kelvin's capacitor), and the bank follows the parameters") {
  const double fs = 48000;
  auto P = defaults();
  auto e = std::make_unique<ArcEngine>(fs);
  e->setParams(P.data());
  e->noteOn(72, 0.8); // at once: its capacitor may not be cut yet
  const auto L = render(*e, (int)(0.5 * fs));
  CHECK(rms(L, 12000, 24000) > 0.01);
  e->noteOff(72, -1);
  render(*e, (int)(0.1 * fs)); // (pressed again while its contact opens, a key keeps its old capacitor)
  P[p::coil] = 40; // a new bank
  e->setParams(P.data());
  waitFor(*e, 72);
  e->noteOn(72, 0.8);
  const auto M = render(*e, (int)(0.75 * fs));
  CHECK(std::fabs(1200 * std::log2(freqAt(M, keyFreq(72), 14400, 36000, fs) / keyFreq(72))) < 1);
}

TEST("arc: the views' messages: each arc, the focused arc's state and its (i, u) trail") {
  const double fs = 48000;
  auto P = defaults();
  P[p::mode] = mode_::poly;
  P[p::arcs] = 3;
  SpscQueue<Message> q(1024);
  auto e = std::make_unique<ArcEngine>(fs);
  e->messages = &q;
  e->setParams(P.data());
  e->noteOn(60, 0.8);
  e->noteOn(67, 0.8);
  int arcs = 0, heads = 0, trail = 0, shows = 0, keys = 0;
  Message m;
  for (int b = 0; b < (int)(0.3 * fs / 128); b++) {
    render(*e, 128);
    while (q.pop(m)) {
      if (m.type == msg::arc) { arcs++; CHECK(m.key >= 0 && m.key < 3); keys += (int)m.values[6]; }
      else if (m.type == msg::head) { heads++; CHECK(m.values[2] == 3 && m.values[1] == mode_::poly && m.values[11] == -1); }
      else if (m.type == msg::trail) { CHECK(m.values[0] == trail % (2 * TRAIL)); trail += m.count - 1; }
      else if (m.type == msg::show) { shows++; CHECK(arcs == 3 * shows && trail == 2 * TRAIL * shows); }
    }
  }
  CHECK(shows >= 10 && heads == shows && keys == 2 * shows);
}

TEST("arc: the talking arc speaks while a key is held, and falls quiet after") {
  const double fs = 48000;
  auto P = defaults();
  P[p::mode] = mode_::talk;
  auto e = std::make_unique<ArcEngine>(fs);
  e->setParams(P.data());
  e->noteOn(55, 0.8);
  const auto L = render(*e, (int)(1.0 * fs));
  CHECK(e->voiceCount() == 1);
  e->noteOff(55, -1);
  const auto T = render(*e, (int)(0.6 * fs));
  CHECK(rms(L, 24000, 48000) > 0.01 && rms(T, 19200, 28800) < 0.05 * rms(L, 24000, 48000));
}

TEST("arc: 44.1 to 192 kHz, odd blocks and extreme settings stay finite") {
  for (double fs : {44100.0, 96000.0, 192000.0}) {
    auto P = defaults();
    P[p::current] = 1.5; P[p::gap] = 8; P[p::tau] = 5; P[p::restrike] = 2.5; P[p::coil] = 3; P[p::coilR] = 0.02; P[p::hiss] = 2;
    P[p::mode] = mode_::poly; P[p::arcs] = 6;
    auto e = std::make_unique<ArcEngine>(fs);
    e->setParams(P.data());
    for (int k : {48, 60, 72, 84}) e->noteOn(k, 0.8);
    std::vector<float> L(4096), R(4096);
    bool ok = true;
    for (int n : {1, 7, 128, 1000, 4096, 33}) {
      e->process(L.data(), R.data(), n);
      for (int i = 0; i < n; i++) ok = ok && std::isfinite(L[i]) && std::fabs(L[i]) < 4;
    }
    P[p::mode] = mode_::talk; P[p::voice] = 6;
    e->setParams(P.data());
    e->noteOn(60, 0.8);
    for (int b = 0; b < 100; b++) { e->process(L.data(), R.data(), 128); for (int i = 0; i < 128; i++) ok = ok && std::isfinite(L[i]); }
    CHECK(ok);
  }
}

TEST("CPU: six arc lamps singing at 48 kHz take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  auto P = defaults();
  P[p::mode] = mode_::poly;
  P[p::arcs] = 6;
  auto e = std::make_unique<ArcEngine>(fs);
  e->setParams(P.data());
  for (int k : {55, 60, 64, 67, 72, 79}) { waitFor(*e, k); e->noteOn(k, 0.8); }
  std::vector<float> L(128), R(128);
  for (int b = 0; b < (int)(0.5 * fs / 128); b++) e->process(L.data(), R.data(), 128);
  CHECK(e->voiceCount() == 6);
  const auto t0 = std::chrono::steady_clock::now();
  const int blocks = (int)(4 * fs / 128);
  for (int b = 0; b < blocks; b++) e->process(L.data(), R.data(), 128);
  const double sec = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count(), load = sec / (blocks * 128 / fs);
  std::printf("       (six lamps: %.1f %% of a core)\n", 100 * load);
  CHECK(load < 0.3);
}

int main() { return check::run(); }
