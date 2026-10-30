// piano-tests.cpp — the Ribbon Piano in C++: the string model against closed forms (tuning,
// inharmonicity, torsion, Ritz against the uniform solution), the voice data packed and back, the
// engine on pitch with its keys built off the audio thread (forte/background.h), a new voice when
// the strings change and a re-strike when they come back, the dampers and the soft pedal, the
// oscillator budget, the hammer's messages, and ten notes within the CPU budget. The physics tests
// are the JavaScript suite's, run on the WebAssembly (node test/piano-tests.mjs).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <thread>
#include <vector>

#include "check.h"
#include "piano-engine.h"

const forte::InstrumentInfo &forte_instrument();

using namespace forte;
using namespace forte::piano;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
static std::vector<float> render(PianoEngine &e, int n, std::vector<float> *right = nullptr) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  if (right) *right = R;
  return L;
}
// render blocks, giving the worker time, until n voices sound (a note waits for its key to be built)
static bool until(PianoEngine &e, int n) {
  std::vector<float> L(128), R(128);
  for (int i = 0; i < 5000 && e.voiceCount() < n; i++) { e.process(L.data(), R.data(), 128); std::this_thread::sleep_for(std::chrono::milliseconds(1)); }
  return e.voiceCount() >= n;
}
static double cents(double a, double b) { return 1200 * std::log2(a / b); }
static double tone(const std::vector<float> &x, double f, int a, int b, double fs) {
  double re = 0, im = 0;
  for (int i = a; i < b; i++) { const double h = 0.5 - 0.5 * std::cos(2 * PI * (i - a) / (b - a)); re += h * x[i] * std::cos(2 * PI * f * i / fs); im += h * x[i] * std::sin(2 * PI * f * i / fs); }
  return std::hypot(re, im);
}
static double peakNear(const std::vector<float> &x, double f, int a, int b, double fs) {
  double best = f, bv = -1;
  for (double c = -20; c <= 20; c += 0.5) { const double fr = f * std::pow(2.0, c / 1200), v = tone(x, fr, a, b, fs); if (v > bv) { bv = v; best = fr; } }
  double lo = best * std::pow(2.0, -0.5 / 1200), hi = best * std::pow(2.0, 0.5 / 1200);
  for (int it = 0; it < 30; it++) { const double m1 = (2 * lo + hi) / 3, m2 = (lo + 2 * hi) / 3; if (tone(x, m1, a, b, fs) > tone(x, m2, a, b, fs)) hi = m2; else lo = m1; }
  return 0.5 * (lo + hi);
}
static double rms(const std::vector<float> &x, int a, int b) {
  double e = 0;
  for (int i = a; i < b; i++) e += (double)x[i] * x[i];
  return std::sqrt(e / (b - a));
}

TEST("model: C4 steel wire is tuned, B ≈ 4e-4, tension ≈ 700 N; equal areas bend as 4π/12 (square) and 2π/(3√3) (triangle)") {
  const auto P = defaults();
  const KeyModel m = computeKeyModel(60, P.data(), 48000);
  CHECK(m.ok && m.info.tuned);
  CHECK(std::fabs(m.info.f1 / keyFreq(60) - 1) < 1e-9);
  CHECK(m.info.B1 > 3e-4 && m.info.B1 < 6e-4);
  CHECK(m.T > 600 && m.T < 800);
  const double c = sectionProps(shape_::round, 1e-6).I1;
  CHECK(std::fabs(sectionProps(shape_::square, 1e-6).I1 / c / (4 * PI / 12) - 1) < 1e-9);
  CHECK(std::fabs(sectionProps(shape_::triangle, 1e-6).I1 / c / (2 * PI / (3 * std::sqrt(3.0))) - 1) < 1e-9);
  const Section r = sectionProps(shape_::ribbon, 1e-6, 12);
  CHECK(r.I2 / r.I1 > 140 && r.I2 / r.I1 < 150);
}

TEST("model: torsion's wave speed is √(GJ/(ρIp) + c_T²); a ribbon's Ritz solution (taper → 0) is the closed form") {
  auto P = defaults();
  P[p::shape] = shape_::ribbon; P[p::aspect] = 10; P[p::offset] = 0.5; P[p::roll] = 30;
  const KeyModel a = computeKeyModel(48, P.data(), 48000);
  const Material &st = MATERIALS[material_::steel];
  const double cT2 = a.T / (st.rho * a.sec.A);
  CHECK(std::fabs(a.info.cTheta / std::sqrt(cT2) / std::sqrt(1 + (st.G * a.sec.J) / (st.rho * a.sec.Ip) / cT2) - 1) < 1e-9);
  P[p::taper] = 2e-4;
  const KeyModel b = computeKeyModel(48, P.data(), 48000);
  CHECK(!b.uniform && b.families[0].ritz && b.ok);
  for (int f = 0; f < 3; f++) {
    const Family &fa = a.families[f], &fb = b.families[f];
    const int nn = std::min({30, fa.n, fb.n});
    double scale = 0;
    for (int n = 0; n < nn; n++) scale = std::max(scale, std::fabs(fa.phiH[n]));
    for (int n = 0; n < nn; n++) {
      CHECK(std::fabs(fb.omega[n] / fa.omega[n] - 1) < 2e-4);
      CHECK(std::fabs(std::fabs(fb.phiH[n]) - std::fabs(fa.phiH[n])) < 2e-3 * scale);
    }
  }
  // a tapered ("triangular") ribbon stays in tune
  P[p::taper] = 0.9; P[p::aspect] = 12;
  for (int key : {33, 60, 90}) {
    const KeyModel t = computeKeyModel(key, P.data(), 48000);
    CHECK(t.info.tuned && std::fabs(t.info.f1 / keyFreq(key) - 1) < 1e-6);
  }
}

TEST("voice data: an edge-on ribbon drops the family the hammer cannot reach; packed and back, it is the same") {
  auto P = defaults();
  P[p::shape] = shape_::ribbon; P[p::roll] = 90; P[p::unisons] = 3;
  const VoiceData d = buildVoiceData(computeKeyModel(60, P.data(), 48000), P.data(), 7);
  bool easy = false;
  for (int i = 0; i < d.n; i++) easy |= d.famId[i] == 0;
  CHECK(!easy && d.n > 0 && d.unisons == 3);
  std::vector<double> buf(PACK_HEAD + PACK_ARRAYS * (size_t)d.n);
  CHECK(packVoiceData(d, buf.data()) == (int)buf.size());
  VoiceData u;
  CHECK(unpackVoiceData(buf.data(), (int)buf.size(), u));
  CHECK(u.version == 7 && u.key == 60 && u.n == d.n && u.freq == d.freq && u.w == d.w && u.ct == d.ct && u.idx == d.idx && u.uni == d.uni);
  CHECK(u.hammer.K == d.hammer.K && u.outV == d.outV && u.hasDamper == d.hasDamper);
  CHECK(!unpackVoiceData(buf.data(), (int)buf.size() - 1, u));
  // the version is the parameters' values: the same strings are the same version
  auto Q = P;
  CHECK(modelVersion(P.data(), 48000) == modelVersion(Q.data(), 48000));
  Q[p::volume] = 0.1; Q[p::damper] = 70; // not the strings
  CHECK(modelVersion(P.data(), 48000) == modelVersion(Q.data(), 48000));
  Q[p::gauge] = 1.1;
  CHECK(modelVersion(P.data(), 48000) != modelVersion(Q.data(), 48000));
  CHECK(modelVersion(P.data(), 48000) != modelVersion(P.data(), 44100));
}

TEST("engine: C4 waits for its strings, then sounds in tune with a plausible hammer contact") {
  const double fs = 48000;
  auto P = defaults();
  P[p::unisons] = 1;
  P[p::kc] = 0; // the linear string's tuning (tension modulation starts a blow sharp)
  auto ep = std::make_unique<PianoEngine>(fs);
  PianoEngine &e = *ep;
  e.setParams(P.data());
  e.noteOn(60, 2.5);
  CHECK(until(e, 1));
  const PianoEngine::Voice *v = e.byKey[60];
  CHECK(v && v->hammerOn);
  const auto L = render(e, (int)(1.2 * fs));
  CHECK(!v->hammerOn);
  const double ms = 1000.0 * v->contactSamples / fs;
  CHECK(ms > 0.5 && ms < 6);
  float pk = 0;
  for (float s : L) { CHECK(std::isfinite(s)); pk = std::max(pk, std::fabs(s)); }
  CHECK(pk > 1e-3 && pk < 5);
  const double c = cents(peakNear(L, keyFreq(60), 4800, 4800 + 32768, fs), keyFreq(60));
  std::printf("       C4: contact %.2f ms, Fmax %.1f N, %d modes, %.3f ¢\n", ms, v->Fmax, v->N, c);
  CHECK(std::fabs(c) < 0.05);
}

TEST("engine: new strings start a new voice while the old one rings on; the soft pedal, not the strings, re-strikes the same voice") {
  const double fs = 48000;
  auto P = defaults();
  auto ep = std::make_unique<PianoEngine>(fs);
  PianoEngine &e = *ep;
  e.setParams(P.data());
  e.noteOn(48, 2);
  CHECK(until(e, 1));
  render(e, 4800);
  const PianoEngine::Voice *first = e.byKey[48];
  P[p::shape] = shape_::square; // a model parameter: every key is built again
  e.setParams(P.data());
  e.noteOn(48, 2);
  CHECK(until(e, 2));
  const PianoEngine::Voice *second = e.byKey[48];
  CHECK(second != first && !first->keyDown && !first->dead && second->hammerOn);
  render(e, 4800);
  P[p::unaCorda] = 1; P[p::damper] = 40; // not the strings: the same voice is struck again, at once
  e.setParams(P.data());
  e.noteOn(48, 3);
  CHECK(e.byKey[48] == second && second->hammerOn && e.voiceCount() == 2);
}

TEST("engine: the damper stops a released string, the pedal keeps it ringing; panic kills every voice") {
  const double fs = 48000;
  const auto P = defaults();
  auto level = [&](bool pedal) {
    auto ep = std::make_unique<PianoEngine>(fs);
    PianoEngine &e = *ep;
    e.setParams(P.data());
    e.setSustain(pedal);
    e.noteOn(55, 2.5);
    until(e, 1);
    render(e, 9600);
    e.noteOff(55, -1);
    const auto L = render(e, 48000);
    return 20 * std::log10(rms(L, 38400, 48000) / rms(L, 0, 4800));
  };
  const double damped = level(false), held = level(true);
  std::printf("       0.8 s after release: %.1f dB damped, %.1f dB with the pedal\n", damped, held);
  CHECK(held > damped + 20);
  auto ep = std::make_unique<PianoEngine>(fs);
  PianoEngine &e = *ep;
  e.setParams(P.data());
  for (int k : {48, 52, 55}) e.noteOn(k, 2);
  until(e, 3);
  render(e, 4800);
  e.allNotesOff();
  for (int i = 0; i < 400 && e.voiceCount(); i++) render(e, 128);
  CHECK(e.voiceCount() == 0);
}

TEST("engine: una corda misses one string of three, which the bridge drives; softer, with a longer aftersound") {
  const double fs = 48000;
  auto run = [&](bool una, double &missed, double &hit) {
    auto P = defaults();
    P[p::unisons] = 3; P[p::unisonDetune] = 1; P[p::maxFreq] = 1500; P[p::unaCorda] = una;
    auto ep = std::make_unique<PianoEngine>(fs);
    PianoEngine &e = *ep;
    e.setParams(P.data());
    e.noteOn(48, 2.5);
    until(e, 1);
    const PianoEngine::Voice *v = e.byKey[48];
    const VoiceData d = buildVoiceData(computeKeyModel(48, P.data(), fs), P.data());
    std::vector<float> R;
    auto L = render(e, 128 * 20, &R);
    missed = hit = 0;
    for (int i = 0; i < v->N; i++) {
      const int u = d.uni[(int)v->perm[i]];
      if (u == 2) missed = std::max(missed, std::fabs(v->q[i])); else if (u == 0) hit = std::max(hit, std::fabs(v->q[i]));
    }
    auto L2 = render(e, 4 * (int)fs, &R);
    L.insert(L.end(), L2.begin(), L2.end());
    return std::pair{20 * std::log10(rms(L, 2400, 14400)), 20 * std::log10(rms(L, 3 * (int)fs, 4 * (int)fs))};
  };
  double m0, h0, m1, h1;
  const auto [early0, late0] = run(false, m0, h0);
  const auto [early1, late1] = run(true, m1, h1);
  CHECK(m1 > 0 && m1 < 0.2 * h1 && m0 > 0.5 * h0);
  CHECK(early1 < early0);
  CHECK(late1 - early1 > late0 - early0 + 2);
}

TEST("engine: over the oscillator budget the quietest voices go, never a chord just struck; messages report each hammer") {
  const double fs = 48000;
  const auto P = defaults();
  auto ep = std::make_unique<PianoEngine>(fs);
  PianoEngine &e = *ep;
  SpscQueue<Message> q(1024);
  e.messages = &q;
  e.maxModes = 1500;
  e.setParams(P.data());
  e.setSustain(true);
  int n = 0;
  for (int k = 60; k <= 100 && e.modeCount() + 60 < 1500; k++) { e.noteOn(k, 2.5); until(e, ++n); render(e, 1280); }
  for (int k : {48, 52, 55, 59}) e.noteOn(k, 2.5);
  until(e, n + 4);
  int live = 0;
  bool chordAlive = true;
  for (int i = 0; i < e.nVoices; i++) if (!e.voices[i]->killing) live += e.voices[i]->N;
  for (int k : {48, 52, 55, 59}) chordAlive &= e.byKey[k] && !e.byKey[k]->killing;
  CHECK(chordAlive);
  CHECK(live <= 1500);
  render(e, 4800);
  int hammers = 0;
  for (Message m; q.pop(m);) if (m.type == msg::hammer) { hammers++; CHECK(m.values[0] > 0 && m.values[1] > 0); }
  CHECK(hammers >= n);
}

TEST("plugin: MIDI velocity is the hammer's speed, 0.25 … 6 m/s; CC67 is the soft pedal, then the faders; no latency") {
  const InstrumentInfo &I = forte_instrument();
  CHECK(I.midiVelocity && std::fabs(I.midiVelocity(0) - 0.25) < 1e-12 && std::fabs(I.midiVelocity(1) - 6) < 1e-12);
  CHECK(I.controllerCount == 6 && I.controllers[0].cc == 67 && I.controllers[0].param == p::unaCorda && I.controllers[1].cc == 107);
  CHECK(I.space == Space::sustain && I.chain.body == p::soundboard);
}

TEST("CPU: ten notes at 48 kHz take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  auto P = defaults();
  auto ep = std::make_unique<PianoEngine>(fs);
  PianoEngine &e = *ep;
  e.setParams(P.data());
  e.setSustain(true);
  for (int k : {36, 43, 48, 52, 55, 60, 64, 67, 72, 76}) e.noteOn(k, 2.5);
  CHECK(until(e, 10));
  std::vector<float> L(128), R(128);
  for (int b = 0; b < 200; b++) e.process(L.data(), R.data(), 128); // warm up, hammers done
  const auto t0 = std::chrono::steady_clock::now();
  const int blocks = (int)(4 * fs / 128);
  for (int b = 0; b < blocks; b++) e.process(L.data(), R.data(), 128);
  const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 4;
  std::printf("       %d notes, %d oscillators: %.2f %% of a core\n", e.voiceCount(), e.modeCount(), 100 * share);
  CHECK(e.voiceCount() == 10);
  CHECK(share < 0.25);
  // and a key's strings, built off the audio thread
  const auto t1 = std::chrono::steady_clock::now();
  for (int k = KEY_LO; k <= KEY_HI; k++) buildVoiceData(computeKeyModel(k, P.data(), fs), P.data());
  const double uniform = std::chrono::duration<double>(std::chrono::steady_clock::now() - t1).count() / (KEY_HI - KEY_LO + 1);
  P[p::shape] = shape_::ribbon; P[p::taper] = 0.8; P[p::offset] = 0.5;
  const auto t2 = std::chrono::steady_clock::now();
  for (int k : {21, 33, 45, 60, 84}) buildVoiceData(computeKeyModel(k, P.data(), fs), P.data());
  const double tapered = std::chrono::duration<double>(std::chrono::steady_clock::now() - t2).count() / 5;
  std::printf("       a key's strings: %.3f ms uniform, %.1f ms tapered (Ritz)\n", 1000 * uniform, 1000 * tapered);
}

int main() { return check::run(); }
