// gongs-tests.cpp — the gong keyboard's engine in C++: the tables (a flat plate's modes are the
// plate's own), tuning, energy conserved through a fortissimo strike, the tables built off the audio
// thread while notes wait for them, any block size, the views' messages, and ten gongs within the
// CPU budget. The physics tests are the JavaScript suite's, run on the WebAssembly
// (FORTE_ENGINE=wasm).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <thread>
#include <vector>

#include "check.h"
#include "forte/dsp.h"
#include "gongs-engine.h"

using namespace forte;
using namespace forte::gongs;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
// n samples in blocks of `block` (the last one shorter)
static std::vector<float> render(GongEngine &e, int n, int block = 128, std::vector<float> *right = nullptr) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += block) e.process(L.data() + i, R.data() + i, std::min(block, n - i));
  if (right) *right = R;
  return L;
}
// Hann-windowed amplitude at f over x[a, b), and the strongest peak near f
static double tone(const std::vector<float> &x, double f, int a, int b, double fs) {
  double re = 0, im = 0;
  const double w = TAU * f / fs;
  for (int i = a; i < b; i++) { const double h = 0.5 - 0.5 * std::cos(TAU * (i - a) / (b - a)); re += h * x[i] * std::cos(w * i); im += h * x[i] * std::sin(w * i); }
  return std::hypot(re, im);
}
static double peakNear(const std::vector<float> &x, double f, int a, int b, double fs, double span = 0.02) {
  double lo = f * (1 - span), hi = f * (1 + span), best = lo, bv = -1;
  for (int i = 0; i <= 60; i++) { const double u = lo + (hi - lo) * i / 60, v = tone(x, u, a, b, fs); if (v > bv) { bv = v; best = u; } }
  const double d = (hi - lo) / 60;
  lo = best - d; hi = best + d;
  for (int it = 0; it < 40; it++) { const double m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618; if (tone(x, m1, a, b, fs) > tone(x, m2, a, b, fs)) hi = m2; else lo = m1; }
  return 0.5 * (lo + hi);
}
// wait (a few ms) for the worker to build the parameters' tables
static void settle(GongEngine &e) { for (int i = 0; i < 2000 && !e.ready(); i++) std::this_thread::sleep_for(std::chrono::milliseconds(1)); }

TEST("gongs: the tables — a flat plate's shell modes are its plate modes, a dome's are stiffer; the kept terms") {
  for (int bc : {0, 1}) {
    auto flat = buildShell({bc, 0, 600}), dome = buildShell({bc, 1.5, 600});
    const table::Table &T = *table::kTables[bc];
    CHECK(flat->N == T.N && flat->NS == T.NS && flat->m[flat->tuned] == 0);
    for (int i = 0; i < flat->N; i++) CHECK(flat->Om[i] == flat->plateOm[i]);
    CHECK((int)flat->H.size() == 600 && flat->E.empty() && (int)dome->H.size() == 600 && !dome->E.empty());
    CHECK(dome->Om[dome->tuned] > flat->Om[flat->tuned]);
    CHECK((int)flat->lite.p1i.size() == LITE && (int)flat->full.p1i.size() == 600);
  }
}

TEST("gongs: tuning — every C (C2–C6) has its strike tone within ±3 ¢ (soft centre strike)") {
  const double fs = 48000;
  auto P = defaults();
  P[p::strike] = 0; P[p::speed] = 0.5; P[p::eta] = 1e-4;
  for (int key = 36; key <= 84; key += 12) {
    auto engine = std::make_unique<GongEngine>(fs); GongEngine &e = *engine; // (on the heap: its voice pool is large)
    e.setParams(P.data());
    settle(e);
    e.noteOn(key, 0.2);
    auto L = render(e, (int)(0.75 * fs));
    const double f = keyFreq(key), f1 = peakNear(L, f, (int)(0.05 * fs), (int)L.size(), fs);
    CHECK(std::fabs(1200 * std::log2(f1 / f)) < 3);
  }
}

TEST("gongs: energy is conserved to round-off through a fortissimo strike (damping off)") {
  const double fs = 48000;
  auto P = defaults();
  P[p::rise] = 1.2; P[p::strike] = 0.35;
  auto engine = std::make_unique<GongEngine>(fs); GongEngine &e = *engine; // (on the heap: its voice pool is large)
  e.setParams(P.data());
  settle(e);
  e.noteOn(55, 1);
  Voice *v[GongEngine::POOL];
  CHECK(e.voices(v) == 1);
  Voice &u = *v[0];
  u.g.sigma.fill(0); u.setDamping();
  // the scheme's energy, with the mallet's after it has left the plate (it flies off with it)
  auto total = [&] {
    double E = u.energyD();
    if (!u.hit.on) { const double w = (u.hit.xm - u.hit.xm1) / u.h; E += 0.5 * w * w / u.hit.Mi; }
    return E;
  };
  const double E0 = total();
  double worst = 0, Vmax = 0;
  for (int s = 0; s < (int)(0.3 * fs / u.R); s++) { u.step(); worst = std::max(worst, std::fabs(total() / E0 - 1)); Vmax = std::max(Vmax, std::fabs(u.V)); }
  std::printf("       relative energy error %.2e, V_nl up to %.1f %% of the energy\n", worst, 100 * Vmax / E0);
  CHECK(u.hit.steps > 5 && u.hit.Fmax > 0);
  CHECK(worst < 1e-9 && u.guards == 0);
  CHECK(Vmax > 0.02 * E0);
}

TEST("gongs: the tables are built off the audio thread; a note waits for them, then plays") {
  const double fs = 48000;
  auto P = defaults();
  auto engine = std::make_unique<GongEngine>(fs); GongEngine &e = *engine; // (on the heap: its voice pool is large)
  e.setParams(P.data());
  settle(e);
  e.noteOn(57, 0.7);
  render(e, 128);
  CHECK(e.voiceCount() == 1);
  P[p::rise] = 2.35; P[p::terms] = 1250; // new tables: asked for here, built on the worker
  e.setParams(P.data());
  e.noteOn(60, 0.7);
  int blocks = 0;
  for (; blocks < 4000 && e.voiceCount() < 2; blocks++) { render(e, 128); std::this_thread::sleep_for(std::chrono::microseconds(200)); }
  CHECK(e.voiceCount() == 2);
  std::printf("       the note waited %d blocks\n", blocks);
  auto L = render(e, (int)(0.5 * fs));
  double pk = 0;
  for (float s : L) pk = std::max(pk, (double)std::fabs(s));
  CHECK(pk > 0.01 && pk < 1);
}

TEST("gongs: any block size — split blocks play the same note, bounded, in tune") {
  const double fs = 44100;
  auto P = defaults();
  P[p::strike] = 0; P[p::speed] = 0.5;
  double ref = 0;
  for (int block : {128, 1, 37, 100}) {
    auto engine = std::make_unique<GongEngine>(fs); GongEngine &e = *engine; // (on the heap: its voice pool is large)
    e.setParams(P.data());
    settle(e);
    e.noteOn(60, 0.3);
    auto L = render(e, (int)(0.6 * fs), block);
    double pk = 0;
    for (float s : L) { CHECK(std::isfinite(s)); pk = std::max(pk, (double)std::fabs(s)); }
    const double f = keyFreq(60), f1 = peakNear(L, f, (int)(0.05 * fs), (int)L.size(), fs);
    std::printf("       blocks of %d: peak %.4f, %.2f cents\n", block, pk, 1200 * std::log2(f1 / f));
    if (block == 128) ref = pk;
    CHECK(pk > 1e-4 && std::fabs(pk / ref - 1) < 0.01);
    CHECK(std::fabs(1200 * std::log2(f1 / f)) < 3);
  }
}

TEST("gongs: the views' messages — the focus gong's modes, bands and pitch, in three pieces") {
  const double fs = 48000;
  auto P = defaults();
  SpscQueue<Message> q(256);
  auto engine = std::make_unique<GongEngine>(fs); GongEngine &e = *engine; // (on the heap: its voice pool is large)
  e.messages = &q;
  e.setParams(P.data());
  settle(e);
  e.noteOn(57, 0.8);
  render(e, 12 * 128);
  Message m;
  int got = 0;
  while (q.pop(m)) {
    CHECK(m.key == 57 && m.type == got + 1);
    if (m.type == msg::gong) { CHECK(m.count == 18 && m.values[10] > 0 && m.values[13] == 1 && m.values[17] > 10); }
    got++;
  }
  CHECK(got == 3);
}

TEST("CPU: gongs struck fff at 48 kHz take a small part of a core (as the JavaScript suite measures them)") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  // the share of real time for 0.25 s after ten blocks, keys struck at once (best of three runs)
  auto load = [&](std::vector<int> keys, int nlvoices) {
    double best = 1e9;
    for (int run = 0; run < 3; run++) {
      auto P = defaults();
      P[p::nlvoices] = nlvoices;
      auto engine = std::make_unique<GongEngine>(fs); GongEngine &e = *engine; // (on the heap: its voice pool is large)
      e.setParams(P.data());
      settle(e);
      for (int k : keys) e.noteOn(k, 1);
      std::vector<float> L(128), R(128);
      for (int b = 0; b < 10; b++) e.process(L.data(), R.data(), 128);
      const int blocks = (int)std::lround(0.25 * fs / 128);
      const auto t0 = std::chrono::steady_clock::now();
      for (int b = 0; b < blocks; b++) e.process(L.data(), R.data(), 128);
      best = std::min(best, std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / (blocks * 128 / fs));
    }
    return best;
  };
  const std::vector<int> ten = {48, 52, 55, 57, 60, 62, 64, 65, 67, 69};
  const double four = load({55, 60, 62, 65}, 4), tenCap = load(ten, 4), tenAll = load(ten, 16);
  std::printf("       4 voices %.1f %%; 10 voices %.1f %% (4 nonlinear, the default cap), %.1f %% with all 10 nonlinear\n", 100 * four, 100 * tenCap, 100 * tenAll);
  CHECK(four < 0.3 && tenCap < 0.3);
}

int main() { return check::run(); }
