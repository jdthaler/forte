// grand-tests.cpp — the electric grand's model and engine in C++: the scale, the stretch tuning and a
// key's modes as the JavaScript computed them, the soundboard's modes and residual path, a struck C4
// on its stretched pitch (its key built on the worker thread), the dampers and the pedal, the
// soundboard's microphones, the page's oscillator budget, and ten voices in the CPU budget. The
// physics tests are the JavaScript suite's, run on the WebAssembly (node test/grand-tests.mjs).

#include <chrono>
#include <cmath>
#include <cstdio>
#include <memory>
#include <thread>
#include <vector>

#include "check.h"
#include "forte/dsp.h"
#include "grand-engine.h"

using namespace forte;
using namespace forte::grand;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
static std::vector<float> render(GrandEngine &e, int n, std::vector<float> *right = nullptr) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  if (right) *right = R;
  return L;
}
static double rms(const std::vector<float> &x, int a, int b) {
  double s = 0;
  for (int i = a; i < b; i++) s += (double)x[i] * x[i];
  return std::sqrt(s / (b - a)) + 1e-12;
}
// amplitude of frequency f in x[a, b) (Hann-windowed DTFT)
static double tone(const std::vector<float> &x, double f, int a, int b, double fs) {
  const double w = TAU * f / fs;
  double re = 0, im = 0;
  for (int i = a; i < b; i++) { const double h = 0.5 - 0.5 * std::cos(TAU * (i - a) / (b - a)); re += h * x[i] * std::cos(w * i); im += h * x[i] * std::sin(w * i); }
  return 4 * std::hypot(re, im) / (b - a);
}
// the strongest frequency within ±c cents of f
static double peakFreq(const std::vector<float> &x, double f, int a, int b, double fs, double c = 20) {
  double best = f, bv = -1;
  for (int i = 0; i <= 400; i++) { const double g = f * std::pow(2.0, (-c + 2 * c * i / 400) / 1200), v = tone(x, g, a, b, fs); if (v > bv) { bv = v; best = g; } }
  return best;
}
// the worker builds keys and boards in its own time: wait for them, so a test doesn't depend on
// the machine's load (in WebAssembly they are built at once)
static void waitFor(GrandEngine &e, int key) {
  for (int i = 0; i < 5000 && !e.ready(key); i++) std::this_thread::sleep_for(std::chrono::milliseconds(1));
  CHECK(e.ready(key));
}
static void waitForBoard(GrandEngine &e) {
  float L[128], R[128];
  for (int i = 0; i < 5000 && !e.boardReady(); i++) { e.process(L, R, 1); std::this_thread::sleep_for(std::chrono::milliseconds(1)); }
  CHECK(e.boardReady());
}
static double rel(double a, double b) { return std::fabs(a / b - 1); }

TEST("grand: the CP-70 scale, its stretch tuning and C4's modes, as the JavaScript computes them") {
  const ModelParams P;
  CHECK(std::fabs(cpLength(28) - 0.679) < 0.005);
  int mono = 0;
  for (int m = KEY_MIN; m <= KEY_MAX; m++) { // every key the CP-80 has; the CP-70's 15 single strings
    mono += m >= KEY_LO && m <= KEY_HI && stringCount(m, P.stringing) == 1;
    const Scale S = stringScale(m, P);
    CHECK(S.stress < 0.5 * STEEL.strength);
    CHECK(std::fabs(1200 * std::log2(partialFreq(S, 1) / S.f0)) < 1e-6); // the fundamental on its target
  }
  CHECK(mono == 15);
  // the retired JavaScript model's numbers (to the last few bits: exp, sin and pow may round differently)
  CHECK(rel(stretchCents(28, P), -11.651176652997698) < 1e-10);
  CHECK(rel(stretchCents(100, P), 24.559949050142599) < 1e-10);
  ModelParams C; C.scale = scale_::concert;
  CHECK(rel(stretchCents(96, C), 9.8548796245384462) < 1e-10);
  CHECK(stretchCents(69, P) == 0);
  const Scale S = stringScale(28, P);
  CHECK(rel(S.T, 492.29491498747797) < 1e-11 && rel(S.B, 0.0020723180147968565) < 1e-11 && rel(S.L, 0.67998127761325744) < 1e-12);
  const KeyModel d = keyModel(60, P);
  CHECK(d.n == 116 && d.nV == 58);
  CHECK(rel(d.freq[0], 261.33055619077220) < 1e-12 && rel(d.freq[d.nV], 261.30421463458038) < 1e-12);
  CHECK(rel(d.c[5], -0.31860466072107191) < 1e-11 && rel(d.w[3], 7.9218196776550887) < 1e-11);
}

TEST("grand: the soundboard's modes, admittance and residual path, as the JavaScript computes them") {
  const BoardModel B = boardModel(9);
  CHECK(B.K == 225 && B.fRes == 6000);
  CHECK(rel(B.Ginf, 0.0014974624536961256) < 1e-12 && rel(B.micGain, 2.1214521440838561) < 1e-10);
  CHECK(rel(B.res[7], 0.058180686191436515) < 1e-9 && rel(B.RL[10], 0.070966134817104343) < 1e-10);
  CHECK(rel(boardResponse(B, 1, 440, 0), 0.30752778008010090) < 1e-10);
  const BoardModel B14 = boardModel(14);
  CHECK(B14.K == 140 && rel(B14.res[3], 0.073383144168217590) < 1e-9 && B14.micGain == B.micGain);
  ModelParams P; P.mount = mount_::board; P.stringing = stringing_::grand;
  const KeyModel d = keyModel(45, P, &B);
  CHECK(d.n == 294 && rel(d.partials[2].GV, 0.0011132908165256824) < 1e-10 && rel(d.c[7], -1.2846933434931493) < 1e-10);
  // the mean conductance over 300–1500 Hz is the infinite plate's, 1/(8√(Dρh)), without the bridge's mass
  BoardModel nb = B;
  nb.mb = 1e-12;
  for (int seg = 0; seg < SEGMENTS; seg++) {
    double s = 0; int n = 0;
    for (double f = 300; f < 1500; f += 0.5) { s += boardMobility(nb, seg, f)[0]; n++; }
    CHECK(std::fabs(s / n / B.Ginf - 1) < 0.08);
  }
}

TEST("grand: a struck C4 sounds on its stretched pitch, its key built on the worker thread; release damps it") {
  const double fs = 48000;
  auto e = std::make_unique<GrandEngine>(fs);
  auto P = defaults();
  e->setParams(P.data());
  waitFor(*e, 60);
  e->noteOn(60, 0.7);
  CHECK(e->voiceCount() == 1);
  auto L = render(*e, (int)(1.3 * fs));
  const double want = stringScale(60, modelParams(P.data())).f0;
  const double f = peakFreq(L, want, (int)(0.1 * fs), (int)L.size(), fs);
  CHECK(std::fabs(1200 * std::log2(f / want)) < 1);
  CHECK(rms(L, (int)(0.1 * fs), (int)(0.3 * fs)) > 0.005);
  e->noteOff(60, -1);
  auto D = render(*e, (int)(0.6 * fs));
  CHECK(20 * std::log10(rms(L, (int)(1.0 * fs), (int)(1.05 * fs)) / rms(D, (int)(0.5 * fs), (int)(0.55 * fs))) > 40);
  render(*e, (int)(2 * fs));
  CHECK(e->voiceCount() == 0);
  // with the pedal down, the note goes on
  e->setSustain(true);
  e->noteOn(60, 0.7);
  render(*e, (int)(0.3 * fs));
  e->noteOff(60, -1);
  auto H = render(*e, (int)(0.6 * fs));
  CHECK(20 * std::log10(rms(H, 0, (int)(0.05 * fs)) / rms(H, (int)(0.5 * fs), (int)(0.55 * fs))) < 6);
}

TEST("grand: on a soundboard, the microphones (built on the worker) hear the strings, in phase at the two mics") {
  const double fs = 48000;
  auto e = std::make_unique<GrandEngine>(fs);
  auto P = defaults();
  P[p::mount] = mount_::board; P[p::listen] = 1;
  e->setParams(P.data());
  waitForBoard(*e);
  waitFor(*e, 52);
  e->noteOn(52, 0.8);
  std::vector<float> R;
  auto L = render(*e, (int)(0.5 * fs), &R);
  double lr = 0, ll = 0, rr = 0, pk = 0;
  for (size_t i = 0; i < L.size(); i++) { lr += L[i] * R[i]; ll += L[i] * L[i]; rr += R[i] * R[i]; pk = std::max(pk, (double)std::fabs(L[i])); }
  CHECK(pk > 0.02 && pk < 0.6);
  CHECK(lr / std::sqrt(ll * rr) > 0.3);
  // another thickness: a new board, the old one kept
  P[p::boardH] = 12;
  e->setParams(P.data());
  waitForBoard(*e);
  CHECK(e->boardReady());
}

TEST("grand: the page's oscillator budget fades the quietest voices; a re-struck key after a physics change does not double") {
  const double fs = 48000;
  auto e = std::make_unique<GrandEngine>(fs);
  auto P = defaults();
  e->setParams(P.data());
  e->setSustain(true);
  for (int k = 36; k <= 84; k += 3) { waitFor(*e, k); e->noteOn(k, 0.8); }
  render(*e, 1280);
  e->budget(1000);
  int total = 0;
  for (int i = 0; i < e->nVoices; i++) if (!e->voices[i]->killing) total += e->voices[i]->active();
  CHECK(total <= 1000);
  render(*e, (int)(0.5 * fs));
  e->allNotesOff();
  render(*e, (int)(0.5 * fs));
  CHECK(e->voiceCount() == 0);
  e->budget(1e9);
  waitFor(*e, 60);
  e->noteOn(60, 0.7);
  render(*e, (int)(0.2 * fs));
  P[p::detune] = 1.3;
  e->setParams(P.data());
  waitFor(*e, 60);
  e->noteOn(60, 0.7);
  render(*e, 128);
  int live = 0;
  for (int i = 0; i < e->nVoices; i++) live += e->voices[i]->key == 60 && !e->voices[i]->killing;
  CHECK(live == 1);
}

TEST("CPU: ten voices at 48 kHz take a small part of a core") {
  const double fs = 48000;
  auto e = std::make_unique<GrandEngine>(fs);
  auto P = defaults();
  e->setParams(P.data());
  const int keys[] = {28, 33, 40, 43, 48, 52, 55, 60, 64, 67};
  for (int k : keys) { waitFor(*e, k); e->noteOn(k, 0.8); }
  const int n = (int)(4 * fs);
  const auto t0 = std::chrono::steady_clock::now();
  render(*e, n);
  const double load = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 4;
  std::printf("        (ten bass-heavy voices: %.1f %% of a core)\n", 100 * load);
  CHECK(e->voiceCount() == 10);
  CHECK(load < 0.3);
}

int main() { return check::run(); }
