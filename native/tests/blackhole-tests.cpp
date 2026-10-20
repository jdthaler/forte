// blackhole-tests.cpp — the Black-Hole Keyboard in C++: V8's log10, the table read as the
// JavaScript read it, each key tuned on its (2,2,0) mode, a key's voice and the samples to the
// last bit of the WebAssembly's (the JavaScript suite checks the same numbers), the inspiral
// handing over to the ringdown, the voice cache, voice stealing, a flood of notes, and ten voices
// within the CPU budget. The physics tests are the JavaScript suite's, run on the WebAssembly
// (node test/blackhole-tests.mjs).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <vector>

#include "blackhole-engine.h"
#include "check.h"
#include "forte/denormals.h"

using namespace forte;
using namespace forte::blackhole;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
static ModelParams model(const std::vector<double> &P) {
  ModelParams m;
  m.spinU = P[p::spinU]; m.massRatio = P[p::massRatio]; m.inclination = P[p::inclination]; m.t0 = P[p::t0];
  m.overtones = P[p::overtones]; m.retrograde = P[p::retrograde]; m.inspiral = P[p::inspiral] > 0.5; m.inspiralOct = P[p::inspiralOct];
  return m;
}
static const Mode *find(const KeyVoice &v, int l, int m, int n) {
  for (int i = 0; i < v.count; i++) if (v.modes[i].l == l && v.modes[i].m == m && v.modes[i].n == n) return &v.modes[i];
  return nullptr;
}

TEST("blackhole: log10 and hypot are V8's") {
  // Math.log10 in Node, to the last bit
  CHECK(blackhole::log10(2) == 0.30102999566398120);
  CHECK(blackhole::log10(0.31) == -0.50863830616572736);
  CHECK(blackhole::log10(1e-6) == -6);
  CHECK(blackhole::log10(123.456) == 2.0915122016277716);
  CHECK(blackhole::log10(0.9999) == -0.000043431619807505604);
  CHECK(blackhole::log10(1) == 0 && std::isinf(blackhole::log10(0)));
  CHECK(hypot2(3, 4) == 5 && hypot2(0, 0) == 0);
}

TEST("blackhole: the table, interpolated, gives the published modes and the JavaScript's numbers") {
  Omega w;
  CHECK(omega(2, 2, 0, 0.9, w));
  CHECK_NEAR(w.re, 0.671613, 2e-6); // Berti, Cardoso & Will (2006)
  CHECK_NEAR(w.im, -0.064869, 2e-6);
  CHECK(omega(3, -2, 1, 0.97, w));
  CHECK(w.re == 0.49431300658944560 && w.im == -0.27227568105778899); // the JavaScript model's
  CHECK(!omega(5, 2, 0, 0.5, w) && !omega(2, 3, 0, 0.5, w));
  // near extremality the l = m modes become a harmonic series 2 : 3 : 4
  Omega w2, w3, w4;
  const double a = 1 - 1e-6;
  omega(2, 2, 0, a, w2); omega(3, 3, 0, a, w3); omega(4, 4, 0, a, w4);
  CHECK(std::fabs(w3.re / w2.re - 1.5) < 1e-3 && std::fabs(w4.re / w2.re - 2) < 1e-3);
  CHECK(tableSize() == 117 && tableModes() == 63);
}

TEST("blackhole: each key is tuned on its (2,2,0) mode; equal masses switch off the odd modes") {
  auto P = defaults();
  P[p::massRatio] = 1;
  for (int key = KEY_LO; key <= KEY_HI; key += 5) {
    KeyVoice v;
    keyVoice(key, model(P), 48000, v);
    const Mode *m220 = find(v, 2, 2, 0);
    CHECK(m220 && std::fabs(m220->f / keyFreq(key) - 1) < 1e-9);
    CHECK(!find(v, 2, 1, 0) && !find(v, 3, 3, 0));
    for (int i = 0; i < v.count; i++) CHECK(v.modes[i].f > 20 && v.modes[i].f < 0.45 * 48000);
  }
}

TEST("blackhole: a key's voice is the WebAssembly's to the last bit") {
  KeyVoice v;
  keyVoice(60, model(defaults()), 48000, v); // keyVoice(60, DEFAULTS, 48000) in test/blackhole-tests.mjs
  CHECK(v.count == 6);
  const Mode *m = find(v, 2, 2, 0);
  CHECK(m && m->f == 261.62556530059862 && m->gamma == 252.57988761231820 && m->cpr == 0.90693882927838598 && m->cxi == -0.0068618432905640523);
  m = find(v, 2, 2, 1);
  CHECK(m && m->f == 255.81115964040737 && m->gamma == 763.72947854791903 && m->cpr == -0.79666121488030150 && m->cxi == 0.018259029459329400);
  m = find(v, 3, 3, 0);
  CHECK(m && m->f == 414.66495736563309 && m->cpr == -0.035546247599022869);
  m = find(v, 4, 4, 0);
  CHECK(m && m->f == 561.62583587703864 && m->gamma == 263.55857986269314 && m->cpr == 0.019876843144860760);
  auto P = defaults();
  P[p::inspiral] = 1; P[p::retrograde] = 0.5; P[p::massRatio] = 3; P[p::inclination] = 70;
  keyVoice(57, model(P), 48000, v);
  CHECK(v.count == 12 && v.hasChirp);
  CHECK(v.chirp.amp == 0.97542036346744299 && v.chirp.psi == 0.0010077670543947976 && v.chirp.tc == 0.84830873035114396 && v.chirp.fStart == 19.497461561909621);
}

TEST("blackhole: the engine plays the WebAssembly's samples, inspiral included") {
  auto P = defaults();
  P[p::inspiral] = 1; P[p::retrograde] = 0.5; P[p::massRatio] = 3; P[p::inclination] = 70;
  auto e = std::make_unique<RingdownEngine>(48000);
  e->setParams(P.data());
  e->noteOn(57, 0.8);
  // the WebAssembly engine's L[17] and R[99] of blocks 0, 50, 100 and 150 (test/blackhole-tests.mjs)
  const float want[8] = {0.000022784630345995538f, 0.00011925467697437853f, -0.025424161925911903f, -0.041929814964532852f,
                         -0.066186957061290741f, -0.027878062799572945f, -0.019828218966722488f, -0.047693472355604172f};
  float L[128], R[128];
  int j = 0;
  for (int b = 0; b < 200; b++) {
    e->process(L, R, 128);
    if (b % 50 == 0) { CHECK(L[17] == want[j]); CHECK(R[99] == want[j + 1]); j += 2; }
  }
}

TEST("blackhole: the inspiral chirps up and hands over to the ringdown; a note rings at its pitch and decays") {
  auto P = defaults();
  P[p::inspiral] = 1; P[p::inspiralOct] = 2;
  auto e = std::make_unique<RingdownEngine>(48000);
  e->setParams(P.data());
  e->noteOn(57, 1);
  float L[128], R[128];
  double fPrev = 0;
  bool mono = true;
  int ringAt = -1;
  for (int s = 0; s < 48000 * 3 && ringAt < 0; s += 128) {
    e->process(L, R, 128);
    const Voice *v = e->voices[0];
    if (v->stage < 3) { if (v->f < fPrev - 1e-9) mono = false; fPrev = v->f; }
    if (v->ring) ringAt = s;
  }
  CHECK(mono && ringAt > 0);
  // without the inspiral, the (2,2,0) mode alone: zero crossings at f, decay at γ
  P = defaults();
  P[p::spinU] = uFromSpin(0.999); P[p::overtones] = 0; P[p::massRatio] = 1; P[p::inclination] = 0;
  KeyVoice v;
  keyVoice(57, model(P), 48000, v);
  const Mode m220 = *find(v, 2, 2, 0);
  v.modes[0] = m220; v.count = 1;
  e = std::make_unique<RingdownEngine>(48000);
  e->setParams(P.data());
  e->offer(v);
  e->noteOn(57, 1);
  std::vector<float> out(14400);
  for (int s = 0; s < 14400; s += 128) { e->process(L, R, 128); for (int i = 0; i < 128 && s + i < 14400; i++) out[s + i] = L[i]; }
  std::vector<double> zc;
  for (int i = 1; i < 14400; i++) if (out[i - 1] < 0 && out[i] >= 0) zc.push_back(i - 1 + out[i - 1] / (out[i - 1] - out[i]));
  const double f = 48000 * (zc.size() - 1) / (zc.back() - zc.front());
  CHECK(std::fabs(f / m220.f - 1) < 1e-4);
  const auto rms = [&](int a, int b) { double s = 0; for (int i = a; i < b; i++) s += out[i] * out[i]; return std::sqrt(s / (b - a)); };
  CHECK(std::fabs(std::log(rms(2400, 4800) / rms(9600, 12000)) / 0.15 / m220.gamma - 1) < 0.02);
}

TEST("blackhole: a new spin changes the next notes; the same settings play the same note") {
  auto P = defaults();
  const auto render = [&](const std::vector<double> &Q) {
    auto e = std::make_unique<RingdownEngine>(48000);
    e->setParams(P.data());
    e->noteOn(60, 1); // built at the old settings, and cached
    e->allNotesOff();
    e->setParams(Q.data());
    e->noteOn(60, 1);
    std::vector<float> out;
    float L[128], R[128];
    for (int b = 0; b < 40; b++) { e->process(L, R, 128); out.insert(out.end(), L, L + 128); }
    return out;
  };
  auto Q = P;
  Q[p::spinU] = 4;
  const auto a = render(P), b = render(Q);
  KeyVoice v;
  keyVoice(60, model(Q), 48000, v);
  auto e = std::make_unique<RingdownEngine>(48000);
  e->setParams(P.data());
  e->offer(v);
  e->noteOn(60, 1);
  std::vector<float> c;
  float L[128], R[128];
  for (int k = 0; k < 40; k++) { e->process(L, R, 128); c.insert(c.end(), L, L + 128); }
  CHECK(a != b);
  CHECK(b == c);
}

TEST("blackhole: over the limit the quietest voice fades; a flood of notes stays in the pool") {
  auto P = defaults();
  P[p::spinU] = 6; P[p::t0] = 10; P[p::overtones] = 0.4; P[p::massRatio] = 1; P[p::inclination] = 0;
  auto e = std::make_unique<RingdownEngine>(48000);
  e->setParams(P.data());
  e->setMaxVoices(2);
  float L[128], R[128];
  e->noteOn(36, 1);
  for (int i = 0; i < 20; i++) e->process(L, R, 128);
  e->noteOn(36, 0.05);
  for (int i = 0; i < 20; i++) e->process(L, R, 128);
  e->noteOn(36, 1);
  CHECK(e->voices[1]->stolen && !e->voices[0]->stolen);
  for (int i = 0; i < 40; i++) e->process(L, R, 128);
  CHECK(e->voiceCount() == 2 && e->voices[0]->vel == 1 && e->voices[1]->vel == 1);
  e = std::make_unique<RingdownEngine>(44100);
  e->setParams(P.data());
  for (int i = 0; i < 400; i++) {
    e->noteOn(KEY_LO + (i * 7) % 61, 1);
    e->process(L, R, 16);
    CHECK(e->voiceCount() <= 2 * MAX_VOICES);
  }
  for (int i = 0; i < 128; i++) CHECK(std::isfinite(L[i]) && std::fabs(L[i]) < 50);
  e->allNotesOff();
  CHECK(e->voiceCount() == 0);
}

TEST("blackhole: the strain plot is what the engine plays") {
  auto P = defaults();
  P[p::spinU] = 4; P[p::massRatio] = 4; P[p::inclination] = 70; P[p::retrograde] = 0.5;
  KeyVoice v;
  keyVoice(60, model(P), 48000, v);
  const int n = 1200;
  std::vector<float> hp(n), hx(n);
  const double dur = strainCurve(v, n, hp.data(), hx.data());
  const int total = (int)std::round(dur * 48000) + 1;
  auto e = std::make_unique<RingdownEngine>(48000);
  e->setParams(P.data());
  e->noteOn(60, 1);
  std::vector<float> L(total + 128), R(total + 128);
  for (int s = 0; s < total; s += 128) e->process(L.data() + s, R.data() + s, 128);
  double err = 0, mx = 0;
  for (int i = 0; i < n; i++) {
    const double t = dur * i * 48000 / (n - 1), u = t - std::floor(t);
    const int s = (int)std::floor(t);
    const double b = L[s] + u * (L[s + 1] - L[s]), y = R[s] + u * (R[s + 1] - R[s]);
    err = std::max({err, std::fabs(0.35 * hp[i] - b), std::fabs(0.35 * hx[i] - y)});
    mx = std::max({mx, std::fabs(b), std::fabs(y)});
  }
  CHECK(err < 2e-3 * mx);
}

TEST("CPU: ten voices at 48 kHz take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  auto P = defaults();
  P[p::spinU] = 6; P[p::retrograde] = 1; P[p::massRatio] = 3; // twelve modes each, ringing for seconds
  auto e = std::make_unique<RingdownEngine>(fs);
  e->setParams(P.data());
  for (int k = 0; k < 10; k++) e->noteOn(48 + 3 * k, 1);
  float L[128], R[128];
  for (int b = 0; b < (int)(fs / 128 / 4); b++) e->process(L, R, 128);
  NoDenormals guard; // as the plugin runs it
  const auto t0 = std::chrono::steady_clock::now();
  const int blocks = (int)(fs / 128);
  for (int b = 0; b < blocks; b++) e->process(L, R, 128);
  const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
  std::printf("       %d voices: %.2f %% of a core\n", e->voiceCount(), 100 * share);
  CHECK(e->voiceCount() == 10);
  CHECK(share < 0.1);
  // building a key's voice from the table, as a note does when its key isn't cached
  KeyVoice v;
  const auto t1 = std::chrono::steady_clock::now();
  for (int i = 0; i < 1000; i++) keyVoice(KEY_LO + i % 61, model(P), fs, v);
  const double us = std::chrono::duration<double>(std::chrono::steady_clock::now() - t1).count() * 1000;
  std::printf("       a key's voice: %.1f µs\n", us);
  CHECK(us < 100);
}

int main() { return check::run(); }
