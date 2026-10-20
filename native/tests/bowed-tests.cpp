// bowed-tests.cpp — the viola organista's model and engine in C++: V8's math (fdlibm), the scale
// and the loop filters, a held note in Helmholtz motion at its pitch at every sample rate, the pitch
// wheel and a key's own bend (MPE), the key action and aftertouch, the dampers, a string gone
// non-finite stopped alone, the views' messages, and ten strings in the CPU budget. The physics tests are the JavaScript suite's, run on the
// WebAssembly (node test/bowed-tests.mjs).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <limits>
#include <memory>
#include <vector>

#include "bowed-engine.h"
#include "check.h"
#include "forte/fdlibm.h"

using namespace forte;
using namespace forte::bowed;

static std::vector<double> defaultParams() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
static std::vector<float> render(OrganistaEngine &e, int n, std::vector<float> *right = nullptr) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  if (right) *right = R;
  return L;
}
// frequency from the autocorrelation peak near one period (parabolic interpolation), over [a, b)
static double pitch(const std::vector<float> &x, int a, int b, double f0, double fs) {
  const double N0 = fs / f0;
  auto ac = [&](int lag) { double s = 0; for (int i = a; i < b - lag; i++) s += (double)x[i] * x[i + lag]; return s; };
  int best = (int)N0;
  double bv = -1e300;
  for (int lag = (int)(0.8 * N0); lag <= (int)(1.2 * N0); lag++) { const double v = ac(lag); if (v > bv) { bv = v; best = lag; } }
  const double y0 = ac(best - 1), y1 = ac(best), y2 = ac(best + 1);
  return fs / (best + (0.5 * (y0 - y2)) / (y0 - 2 * y1 + y2));
}
static double rms(const std::vector<float> &x, int a, int b) {
  double s = 0;
  for (int i = a; i < b; i++) s += (double)x[i] * x[i];
  return std::sqrt(s / (b - a));
}
static double cents(double f, double g) { return 1200 * std::log2(f / g); }
// a bowed string's own pitch, from its last 32 slips (one a period in Helmholtz motion)
static double slipFreq(const BowedString &s) {
  const int64_t n = s.nSlip - 1;
  return s.fs * 32 / (s.slipT[n % SLIPS] - s.slipT[(n - 32) % SLIPS]);
}

TEST("bowed: V8's sin, cos, exp, log, atan2 and pow (fdlibm) on exact cases and against the C library") {
  CHECK(fdlibm::sin(0) == 0 && fdlibm::cos(0) == 1 && fdlibm::exp(0) == 1 && fdlibm::log(1) == 0);
  CHECK(fdlibm::pow(2, 10) == 1024 && fdlibm::pow(3, 2) == 9 && fdlibm::pow(16, 0.5) == 4 && fdlibm::atan2(1, 1) == std::atan2(1.0, 1.0));
  double worst = 0;
  for (int i = 1; i < 2000; i++) {
    const double x = i * 0.0031415, y = (i % 37) * 0.17 - 3;
    const double e[6] = {fdlibm::sin(x) - std::sin(x), fdlibm::cos(x) - std::cos(x), fdlibm::exp(-x) / std::exp(-x) - 1,
                         fdlibm::log(x) - std::log(x), fdlibm::atan2(y, x) - std::atan2(y, x), fdlibm::pow(x, y) / std::pow(x, y) - 1};
    for (double d : e) worst = std::max(worst, std::fabs(d));
  }
  CHECK(worst < 1e-15); // the same functions, to the last bit or two
}

TEST("bowed: the scale is Mersenne's, the loop filters passive on every key at 44.1, 48 and 96 kHz, the touch voiced") {
  for (int k = KEY_LO; k <= KEY_HI; k++) {
    const StringDesign s = stringDesign(k);
    CHECK_NEAR(s.c / (2 * s.L), s.f0, 1e-9 * s.f0);
    CHECK(s.f0 > s.fKey && cents(s.f0, s.fKey) < 20); // tuned a few cents sharp
    for (double fs : {44100.0, 48000.0, 96000.0}) {
      const Loop L = loopDesign(k, defaults(), fs * oversample(k, fs));
      CHECK(L.gb > 0 && L.gb <= 1 && L.pb >= 0 && L.pb < 1 && L.Db >= 1);
      CHECK(L.gn > 0 && L.gn <= 1 && L.pn >= 0 && L.pn < 1 && L.Dn >= 1);
    }
    CHECK(voiced(k) > 0 && std::fabs(voiced(k) - 0.5 * schelleng(loopDesign(k, defaults(), 48000), defaults()).Fmax) < 1e-12);
  }
  CHECK(oversample(36, 48000) == 1 && oversample(84, 48000) == 4 && oversample(84, 96000) == 2 && oversample(84, 192000) == 1);
  CHECK(boardModes(2400, 0.03).size() == 77);
}

TEST("bowed: a held C4 sounds in Helmholtz motion at its pitch at 44.1, 48, 96 and 192 kHz, and leaves the loop after release") {
  for (double fs : {44100.0, 48000.0, 96000.0, 192000.0}) {
    auto P = defaultParams();
    P[p::treadle] = 0;
    auto engine = std::make_unique<OrganistaEngine>(fs); // big for a WebAssembly stack
    OrganistaEngine &e = *engine;
    e.setParams(P.data());
    e.noteOn(60, 0.7);
    CHECK(e.voiceCount() == 1);
    auto L = render(e, (int)(1.3 * fs));
    CHECK(e.string(60)->motion(16).kind == Kind::helmholtz);
    const double f = pitch(L, (int)(0.8 * fs), (int)(1.3 * fs), bowed::keyFreq(60), fs);
    CHECK(std::fabs(cents(f, bowed::keyFreq(60))) < (fs > 50000 ? 6 : 2)); // TUNE is the 48 kHz plan's (44.1 shares it)
    CHECK(rms(L, (int)(0.8 * fs), (int)(1.3 * fs)) > 0.01);
    e.noteOff(60, -1);
    render(e, (int)(1.5 * fs));
    CHECK(e.voiceCount() == 0 && e.nAct == 0);
  }
}

TEST("bowed: pitch bend slides the bridges: a bowed note follows, two semitones at the wheel's ends, still in Helmholtz motion") {
  const double fs = 48000;
  for (int key : {36, 48, 60, 72, 84}) for (double v : {1.0, -1.0}) {
    auto P = defaultParams();
    P[p::treadle] = 0;
    auto engine = std::make_unique<OrganistaEngine>(fs);
    OrganistaEngine &e = *engine;
    e.setParams(P.data());
    e.noteOn(key, 0.7);
    render(e, (int)(0.4 * fs));
    e.bend(v);
    auto L = render(e, (int)(1.0 * fs));
    const double want = bowed::keyFreq(key) * std::pow(2.0, 2 * v / 12), f = pitch(L, (int)(0.5 * fs), (int)(1.0 * fs), want, fs);
    CHECK(e.string(key)->motion(16).kind == Kind::helmholtz);
    CHECK(std::fabs(cents(f, want)) < 3);
  }
}

TEST("bowed: a key's own bend (MPE) slides its bridge alone: a bowed note follows an octave either way, still in Helmholtz motion, sounds as the wheel bent as far, and a key bowed beside it stays") {
  const double fs = 48000;
  for (int key : {36, 48, 60, 72, 84}) for (double st : {12.0, -12.0}) {
    double f = 0, g[2];
    bool helmholtz = false;
    std::vector<float> L;
    for (int bent = 0; bent < 2; bent++) { // a lone note; then the key bowed beside it, against the same without the bend
      auto P = defaultParams();
      P[p::treadle] = 0;
      auto engine = std::make_unique<OrganistaEngine>(fs);
      OrganistaEngine &e = *engine;
      e.setParams(P.data());
      e.noteOn(key, 0.7);
      if (bent) e.noteOn(key + 4, 0.7);
      render(e, (int)(0.4 * fs));
      e.noteBend(std::pow(2.0, st / 12), key);
      L = render(e, (int)(1.0 * fs));
      if (!bent) { f = pitch(L, (int)(0.5 * fs), (int)(1.0 * fs), bowed::keyFreq(key) * std::pow(2.0, st / 12), fs); helmholtz = e.string(key)->motion(16).kind == Kind::helmholtz; }
      else g[1] = slipFreq(*e.string(key + 4));
    }
    {
      auto P = defaultParams();
      P[p::treadle] = 0;
      auto engine = std::make_unique<OrganistaEngine>(fs);
      OrganistaEngine &e = *engine;
      e.setParams(P.data());
      e.noteOn(key, 0.7); e.noteOn(key + 4, 0.7);
      render(e, (int)(1.4 * fs));
      g[0] = slipFreq(*e.string(key + 4));
    }
    const double want = bowed::keyFreq(key) * std::pow(2.0, st / 12);
    std::printf("       %d %+.0f: %.1f ¢ (the other key %.3f ¢)\n", key, st, cents(f, want), cents(g[1], g[0]));
    CHECK(helmholtz);
    CHECK(std::fabs(cents(f, want)) < 16); // the voicer made up for the bow's flattening at the string's own pitch, not the bent one
    CHECK(std::fabs(cents(g[1], g[0])) < 0.5);
  }
  for (int key : {48, 72}) for (double v : {1.0, -1.0}) { // the wheel's end and the key's own bend as far
    double f[2], level[2];
    for (int own = 0; own < 2; own++) {
      auto P = defaultParams();
      P[p::treadle] = 0;
      auto engine = std::make_unique<OrganistaEngine>(fs);
      OrganistaEngine &e = *engine;
      e.setParams(P.data());
      e.noteOn(key, 0.7);
      render(e, (int)(0.4 * fs));
      if (own) e.noteBend(std::pow(2.0, 2 * v / 12), key); else e.bend(v);
      const auto L = render(e, (int)(1.0 * fs));
      f[own] = pitch(L, (int)(0.5 * fs), (int)(1.0 * fs), bowed::keyFreq(key) * std::pow(2.0, 2 * v / 12), fs); level[own] = rms(L, (int)(0.5 * fs), (int)(1.0 * fs));
    }
    CHECK(std::fabs(cents(f[1], f[0])) < 0.2);
    CHECK(std::fabs(level[1] / level[0] - 1) < 0.01);
  }
}

TEST("bowed: a key's bend of 1 (MPE's reset) and a slide leave the sound bit-identical, the wheel moving too, the dampers down or lifted") {
  for (double fs : {44100.0, 48000.0}) for (int lifted : {0, 1}) {
    std::vector<float> out[2];
    for (int mpe = 0; mpe < 2; mpe++) {
      auto P = defaultParams();
      P[p::lifted] = lifted;
      auto engine = std::make_unique<OrganistaEngine>(fs);
      OrganistaEngine &e = *engine;
      const int keys[3] = {43, 60, 79};
      if (mpe) for (int k : keys) { e.noteBend(1, k); e.slide(NAN, k); }
      e.setParams(P.data());
      for (int k : keys) e.noteOn(k, 0.8);
      std::vector<float> R1, R2;
      auto L1 = render(e, (int)(0.4 * fs), &R1);
      e.bend(0.8);
      if (mpe) for (int k : keys) { e.noteBend(1, k); e.slide(NAN, k); }
      auto L2 = render(e, (int)(0.4 * fs), &R2);
      for (auto *x : {&L1, &R1, &L2, &R2}) out[mpe].insert(out[mpe].end(), x->begin(), x->end());
    }
    CHECK(out[0] == out[1]);
  }
}

TEST("bowed: every key's own bend swept across its octave each way (and past it) every block, with the wheel and the dampers lifted, at 44.1, 48 and 96 kHz, stays finite and bounded, every string playing on") {
  for (double fs : {44100.0, 48000.0, 96000.0}) {
    auto P = defaultParams();
    P[p::lifted] = 1;
    auto engine = std::make_unique<OrganistaEngine>(fs);
    OrganistaEngine &e = *engine;
    e.setParams(P.data());
    const int keys[6] = {KEY_MIN, KEY_LO, 55, 67, KEY_HI, KEY_MAX};
    for (int k : keys) e.noteOn(k, 1);
    std::vector<float> L(128), R(128);
    double pk = 0;
    bool finite = true, playing = true;
    const int blocks = (int)(1.2 * fs / 128);
    for (int b = 0; b < blocks; b++) {
      const double t = b * 128 / fs;
      for (int j = 0; j < 6; j++) e.noteBend(std::pow(2.0, 14 * std::sin(TAU * (1.5 + 0.4 * j) * t + j) / 12), keys[j]);
      if (b % 16 == 0) e.bend(std::sin(TAU * 0.7 * t));
      if (b == blocks / 2) for (int k : keys) playing = playing && e.string(k)->down; // no string stopped as unstable
      if (b == blocks / 2) for (int k : keys) e.noteOff(k, -1);
      e.process(L.data(), R.data(), 128);
      for (int i = 0; i < 128; i++) { finite = finite && std::isfinite(L[i]) && std::isfinite(R[i]); pk = std::max(pk, (double)std::fabs(L[i])); }
    }
    std::printf("       %.1f kHz: peak %.2f\n", fs / 1000, pk);
    CHECK(finite && playing);
    CHECK(pk < 4);
  }
}

TEST("bowed: the key action ramps the force in its travel time; aftertouch presses one key (poly) or all (channel)") {
  const double fs = 48000;
  auto P = defaultParams();
  auto engine = std::make_unique<OrganistaEngine>(fs);
  OrganistaEngine &e = *engine;
  e.setParams(P.data());
  e.noteOn(48, 0.7); e.noteOn(55, 0.7);
  const double FT = keyForce(48, 0.7, 1), rise = riseTime(0.7, P[p::attack]);
  render(e, (int)(0.5 * rise * fs) / 128 * 128);
  CHECK(e.string(48)->FN > 0.3 * FT && e.string(48)->FN < 0.7 * FT);
  render(e, (int)(0.3 * fs));
  CHECK(e.string(48)->FN == FT);
  const double g0 = e.string(55)->FN;
  e.pressure(1, 48);
  render(e, (int)(0.2 * fs));
  CHECK_NEAR(e.string(48)->FN / FT, 2.5, 1e-9);
  CHECK(e.string(55)->FN == g0);
  e.pressure(0.5, -1);
  render(e, (int)(0.2 * fs));
  CHECK_NEAR(e.string(48)->FN / FT, 1.75, 1e-9);
  CHECK_NEAR(e.string(55)->FN / g0, 1.75, 1e-9);
}

TEST("bowed: with the dampers lifted the 49 strings of C2–C6 are in the loop and a released note rings on; one past them joins when played; Panic stops it") {
  const double fs = 48000;
  const int N49 = KEY_HI - KEY_LO + 1;
  auto P = defaultParams();
  P[p::lifted] = 1;
  auto engine = std::make_unique<OrganistaEngine>(fs);
  OrganistaEngine &e = *engine;
  e.setParams(P.data());
  CHECK(e.nAct == N49);
  e.noteOn(60, 0.8);
  render(e, (int)(0.8 * fs));
  e.noteOff(60, -1);
  auto L = render(e, (int)(1.0 * fs));
  CHECK(e.voiceCount() == 0 && e.nAct == N49);
  CHECK(rms(L, (int)(0.8 * fs), (int)(1.0 * fs)) > 0.1 * rms(L, 0, (int)(0.1 * fs)));
  e.noteOn(KEY_MAX, 0.8);
  CHECK(e.nAct == N49 + 1);
  render(e, (int)(0.5 * fs));
  e.noteOff(KEY_MAX, -1);
  render(e, (int)(0.2 * fs));
  CHECK(e.nAct == N49 + 1); // it rings on, undamped
  P[p::lifted] = 0;
  e.setParams(P.data());
  e.allNotesOff();
  CHECK(e.nAct == 0);
  auto Z = render(e, 1280);
  CHECK(rms(Z, 0, 1280) == 0);
}

TEST("bowed: a string gone non-finite is stopped alone, and the page is told; the other note plays on") {
  const double fs = 48000;
  auto P = defaultParams();
  SpscQueue<Message> q(4096);
  auto engine = std::make_unique<OrganistaEngine>(fs);
  OrganistaEngine &e = *engine;
  e.messages = &q;
  e.setParams(P.data());
  e.noteOn(48, 0.7); e.noteOn(60, 0.7);
  render(e, (int)(0.6 * fs));
  for (double &x : e.string(60)->fb) x = std::numeric_limits<double>::quiet_NaN();
  auto L = render(e, (int)(0.6 * fs));
  bool finite = true;
  for (float x : L) finite = finite && std::isfinite(x);
  CHECK(finite);
  CHECK(!e.string(60)->down && e.string(48)->down && e.string(48)->motion(16).kind == Kind::helmholtz);
  Message m;
  int errors = 0;
  while (q.pop(m)) errors += m.type == msg::error;
  CHECK(errors == 1);
}

TEST("bowed: the views' messages: the focused string's shape and bow-point trace, then its state") {
  const double fs = 48000;
  auto P = defaultParams();
  SpscQueue<Message> q(8192);
  auto engine = std::make_unique<OrganistaEngine>(fs);
  OrganistaEngine &e = *engine;
  e.messages = &q;
  e.setParams(P.data());
  e.noteOn(55, 0.7);
  render(e, (int)(1.2 * fs));
  Message m;
  int states = 0, shape = 0, trace = 0, helm = 0;
  float span = 0;
  while (q.pop(m)) {
    if (m.type == msg::shape) { CHECK(m.values[0] == shape % SHAPE_N); shape += m.count - 1; for (int i = 1; i < m.count; i++) span = std::max(span, std::fabs(m.values[i])); }
    else if (m.type == msg::trace) { CHECK(m.values[0] == trace % TRACE); trace += m.count - 1; }
    else if (m.type == msg::state) {
      states++;
      CHECK(m.key == 55 && shape == states * SHAPE_N && trace == states * TRACE);
      CHECK(m.values[4] == 1 && m.values[5] == 1 && (states == 1 || std::fabs(m.values[0] - keyForce(55, 0.7, 1)) < 1e-5)); // the first while the key goes down
      if (m.values[6] == (float)Kind::helmholtz) { helm++; CHECK(std::fabs(m.values[9] / bowed::keyFreq(55) - 1) < 0.01); }
    }
  }
  CHECK(states >= 12 && states <= 30); // every POST_EVERY samples or so, on a stroboscopic snapshot
  CHECK(helm >= states - 5); // after the attack
  CHECK(span > 1e-5); // the string's displacement (m) is drawn
}

TEST("CPU: ten strings bowed at once at 48 kHz take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  auto P = defaultParams();
  auto engine = std::make_unique<OrganistaEngine>(fs);
  OrganistaEngine &e = *engine;
  e.setParams(P.data());
  for (int k : {36, 43, 48, 55, 60, 64, 67, 72, 79, 84}) e.noteOn(k, 0.8);
  std::vector<float> L(128), R(128);
  for (int b = 0; b < (int)(0.5 * fs / 128); b++) e.process(L.data(), R.data(), 128);
  const auto t0 = std::chrono::steady_clock::now();
  const int blocks = (int)(4 * fs / 128);
  for (int b = 0; b < blocks; b++) e.process(L.data(), R.data(), 128);
  const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 4;
  std::printf("       %d strings: %.2f %% of a core\n", e.voiceCount(), 100 * share);
  CHECK(share < 0.3);
}

int main() { return check::run(); }
