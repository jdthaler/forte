// windharp-tests.cpp — the wind harp in C++: the model gives the retired JavaScript's strings and lock-in
// analysis, a key locks onto its harmonic at the balance's swing at every sample rate, the pitch
// wheel and each key's own bend (MPE), the shutters and the pedal, aftertouch, voice stealing and a flood of keys, blocks of any length, the views'
// messages, and ten keys within the CPU budget. The physics tests are the JavaScript suite's, run
// on the WebAssembly (node test/windharp-tests.mjs).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <vector>

#include "check.h"
#include "windharp-engine.h"

using namespace forte;
using namespace forte::windharp;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
static DesignParams designParams(const std::vector<double> &P) {
  DesignParams d;
  d.n0 = P[p::n0]; d.tuning = (int)P[p::tuning]; d.unison = P[p::unison]; d.mass = P[p::mass]; d.q = P[p::q];
  return d;
}
static bool render(WindHarpEngine &e, double sec, int block = 128, double *peak = nullptr) {
  std::vector<float> L(block), R(block);
  bool finite = true;
  for (int s = 0; s < (int)(sec * e.fs); s += block) {
    e.process(L.data(), R.data(), block);
    for (int i = 0; i < block; i++) {
      finite = finite && std::isfinite(L[i]) && std::isfinite(R[i]);
      if (peak) *peak = std::max({*peak, (double)std::fabs(L[i]), (double)std::fabs(R[i])});
    }
  }
  return finite;
}
static const WindHarpEngine::Voice *voiceOf(const WindHarpEngine &e, int key) { return key >= 0 && key < 128 ? e.byKey[key] : nullptr; }
static double rel(double a, double b) { return std::fabs(a / b - 1); }

// What the JavaScript model gave (key, tuning, n0, mass, Q, the course's string; its D, L, T, f0,
// N, home harmonic, band, growth, locked range and swing at the band's middle)
struct Vector { int key, tuning; double n0, mass, q; int idx; double D, L, T, f0; int N, n; double lo, hi, growth, upTo, downTo, Y; };
static const Vector VECTORS[] = {
  {60, 0, 3, 1, 500, 0, 0.0036166325050421559, 0.85997184954317607, 259.72478653453146, 86.538926502383219, 8, 3, 3.8944495355332180, 4.0675377161037387, 17.905848817563474, 4.1386197754339200, 3.8323345554424648, 0.047215932098758004},
  {84, 0, 3, 1, 500, 1, 0.00075389466268517460, 0.42832184443507715, 45.493986584825748, 348.85064153464043, 8, 3, 3.8949824664158643, 4.0831383777405801, 87.023006328273837, 4.1953855320802171, 3.7975492627371272, 0.073361967855165564},
  {79, 1, 3, 1, 500, 1, 0.0010665307115640666, 0.57136387047396175, 51.167510560597954, 196.04439239432449, 10, 4, 3.9033882341814166, 4.0872447109199959, 61.411337929996023, 4.1913725969657429, 3.8130259563278419, 0.061428138253775327},
  {67, 0, 6, 6, 2000, 0, 0.0023304313203249077, 0.99081231172795947, 487.00362025609525, 65.192432363567534, 14, 6, 3.9439320530993109, 4.0157686328833799, 11.714162840240810, 4.1028829115115864, 3.8643441111359453, 0.036990279703598083},
};

TEST("windharp: the model's strings and lock-in analysis are the JavaScript's") {
  for (const Vector &v : VECTORS) {
    DesignParams d;
    d.tuning = v.tuning; d.n0 = v.n0; d.mass = v.mass; d.q = v.q;
    CourseOffset o[COURSE_MAX];
    courseOffsets(v.key, o);
    const StringDesign S = stringDesign(v.key, d, o[v.idx]);
    CHECK(S.D == v.D && S.L == v.L && S.T == v.T && S.f0 == v.f0 && S.N == v.N); // the engine's numbers: to the last bit
    CHECK(homeHarmonic(S) == v.n);
    Band b;
    LockedRange r;
    CHECK(lockBand(S, v.n, b) && lockedRange(S, v.n, r));
    CHECK(rel(b.lo, v.lo) < 1e-12 && rel(b.hi, v.hi) < 1e-12 && rel(b.growth, v.growth) < 1e-9);
    CHECK(rel(r.upTo, v.upTo) < 1e-9 && rel(r.downTo, v.downTo) < 1e-9);
    CHECK(rel(lockedAmplitude(S, v.n, b.mid), v.Y) < 1e-9);
  }
}

TEST("windharp: at the reference wind a key locks onto its 3rd harmonic with the balance's swing (less up to 12 % for the turbulence), at 44.1 to 192 kHz") {
  for (double fs : {44100.0, 48000.0, 96000.0, 192000.0}) for (int key : {60, 84}) {
    auto P = defaults();
    auto e = std::make_unique<WindHarpEngine>(fs);
    e->setParams(P.data());
    e->noteOn(key, 1);
    double pk = 0;
    CHECK(render(*e, key < 72 ? 4 : 1.5, 128, &pk));
    const auto *v = voiceOf(*e, key);
    CHECK(v != nullptr);
    if (!v) continue;
    const StringDesign &S = v->strings[0].S;
    const auto d = WindHarpEngine::dominant(v->strings[0]);
    const double Y = lockedAmplitude(S, 3, U_REF);
    CHECK(d.n == 3 && d.amp / S.D > 0.88 * Y && d.amp / S.D < 1.03 * Y); // the turbulence takes a little off
    CHECK(pk > 0.05 && pk < 1);
    CHECK(v->ns == courseSize(key));
  }
}

static double tone(const std::vector<float> &x, double f, double fs) {
  double re = 0, im = 0;
  const int n = (int)x.size();
  for (int i = 0; i < n; i++) { const double h = 0.5 - 0.5 * std::cos(2 * std::numbers::pi * i / n); re += h * x[i] * std::cos(2 * std::numbers::pi * f * i / fs); im += h * x[i] * std::sin(2 * std::numbers::pi * f * i / fs); }
  return std::hypot(re, im);
}
// (A string bent out of its lock-in band moves to the harmonic the wake picks: C4 bent up 2 semitones
// at the reference wind falls to its 2nd, as a real one would. These keys stay on their 3rd.)
TEST("windharp: pitch bend tightens or slackens the strings: a sounding key follows on its harmonic, two semitones at the wheel's ends") {
  const double fs = 48000;
  for (int key : {55, 72, 84}) for (double v : {1.0, -1.0}) {
    auto P = defaults();
    auto e = std::make_unique<WindHarpEngine>(fs);
    e->setParams(P.data());
    e->noteOn(key, 1);
    CHECK(render(*e, key < 72 ? 4 : 1.5));
    const auto *vo = voiceOf(*e, key);
    const double f0 = vo->strings[0].S.fNote;
    e->bend(v);
    CHECK(render(*e, 1.5));
    std::vector<float> L(48000), R(48000);
    for (int s = 0; s < 48000; s += 128) e->process(L.data() + s, R.data() + s, 128);
    const double want = f0 * std::pow(2.0, 2 * v / 12);
    double best = 0, bf = want;
    for (double c = -60; c <= 60; c += 0.5) { const double f = want * std::pow(2.0, c / 1200), g = tone(L, f, fs); if (g > best) { best = g; bf = f; } }
    const auto d = WindHarpEngine::dominant(vo->strings[0]);
    CHECK(d.n == 3);
    CHECK(std::fabs(1200 * std::log2(bf / want)) < 10); // the wake pulls the lock a few cents toward its own frequency
  }
}

// the strongest frequency within ±60 ¢ of f in the next second of the engine's left channel
static double peakNear(WindHarpEngine &e, double f) {
  const int n = (int)e.fs;
  std::vector<float> L(n), R(n);
  for (int s = 0; s < n; s += 128) e.process(L.data() + s, R.data() + s, std::min(128, n - s));
  double best = 0, bf = f;
  for (double c = -60; c <= 60; c += 0.5) { const double g = f * std::pow(2.0, c / 1200), t = tone(L, g, e.fs); if (t > best) { best = t; bf = g; } }
  return bf;
}
static double cents(double f, double g) { return 1200 * std::log2(f / g); }

TEST("windharp: a key's own bend (MPE) tightens its strings alone: C6 bent up and down two semitones follows on its harmonic, C5 held beside it stays; bent before the key, it starts there") {
  const double fs = 48000;
  for (double st : {2.0, -2.0}) {
    auto P = defaults();
    auto e = std::make_unique<WindHarpEngine>(fs);
    e->setParams(P.data());
    e->noteOn(72, 1); e->noteOn(84, 1);
    CHECK(render(*e, 1.5));
    const double f72 = voiceOf(*e, 72)->strings[0].S.fNote, f84 = voiceOf(*e, 84)->strings[0].S.fNote, r = std::pow(2.0, st / 12);
    e->noteBend(r, 84);
    CHECK(render(*e, 1.5));
    std::vector<float> L(48000), R(48000);
    for (int s = 0; s < 48000; s += 128) e->process(L.data() + s, R.data() + s, 128);
    double b84 = 0, f84b = 0, b72 = 0, f72b = 0;
    for (double c = -60; c <= 60; c += 0.5) {
      const double g = f84 * r * std::pow(2.0, c / 1200), t = tone(L, g, fs), h = f72 * std::pow(2.0, c / 1200), u = tone(L, h, fs);
      if (t > b84) { b84 = t; f84b = g; }
      if (u > b72) { b72 = u; f72b = h; }
    }
    CHECK(WindHarpEngine::dominant(voiceOf(*e, 84)->strings[0]).n == 3 && WindHarpEngine::dominant(voiceOf(*e, 72)->strings[0]).n == 3);
    CHECK(std::fabs(cents(f84b, f84 * r)) < 10); // the wake pulls the lock a few cents toward its own frequency, as for the wheel
    CHECK(std::fabs(cents(f72b, f72)) < 3);
    CHECK(voiceOf(*e, 72)->strings[0].bent == 1);
    // struck already bent
    auto e2 = std::make_unique<WindHarpEngine>(fs);
    e2->setParams(P.data());
    e2->noteBend(r, 84);
    e2->noteOn(84, 1);
    CHECK(voiceOf(*e2, 84)->strings[0].bent == r);
    CHECK(render(*e2, 1.5));
    CHECK(WindHarpEngine::dominant(voiceOf(*e2, 84)->strings[0]).n == 3);
    CHECK(std::fabs(cents(peakNear(*e2, f84 * r), f84 * r)) < 10);
  }
}

TEST("windharp: a lone key's own bend sounds as the wheel bent as far: the same note within 1 ¢ and the same swing within 2 %") {
  const double fs = 48000;
  for (int key : {55, 84}) for (double v : {1.0, -1.0}) {
    double f[2], amp[2];
    for (int which = 0; which < 2; which++) {
      auto P = defaults();
      auto e = std::make_unique<WindHarpEngine>(fs);
      e->setParams(P.data());
      e->noteOn(key, 1);
      CHECK(render(*e, key < 72 ? 4 : 1.5));
      if (which) e->noteBend(std::pow(2.0, 2 * v / 12), key); else e->bend(v);
      CHECK(render(*e, 1.5));
      const double want = voiceOf(*e, key)->strings[0].S.fNote * std::pow(2.0, 2 * v / 12);
      f[which] = peakNear(*e, want);
      amp[which] = WindHarpEngine::dominant(voiceOf(*e, key)->strings[0]).amp;
    }
    CHECK(std::fabs(cents(f[1], f[0])) < 1);
    CHECK(rel(amp[1], amp[0]) < 0.02);
  }
}

TEST("windharp: bends of 1 sent every block leave every sample as it was, the wheel moving and the wind gusting") {
  std::vector<float> out[2];
  for (int which = 0; which < 2; which++) {
    auto P = defaults();
    P[p::gust] = 0.2;
    auto e = std::make_unique<WindHarpEngine>(44100);
    e->setParams(P.data());
    if (which) e->noteBend(1, 60);
    e->noteOn(60, 0.8); e->noteOn(79, 0.8); e->noteOn(96, 0.8);
    std::vector<float> L(128), R(128);
    for (int blk = 0; blk < 700; blk++) {
      if (which) for (int key : {60, 79, 96, 97}) e->noteBend(1, key);
      if (blk == 300) e->bend(-0.7);
      e->process(L.data(), R.data(), 128);
      out[which].insert(out[which].end(), L.begin(), L.end());
      out[which].insert(out[which].end(), R.begin(), R.end());
    }
  }
  CHECK(out[0] == out[1]);
}

TEST("windharp: ±48 semitones of each key's own bend (held at ±12), swept every block on a chord from A0 to E7 (strings stepping at a quarter of the sample rate to several times a sample), stay finite and bounded at 44.1, 48 and 96 kHz") {
  for (double fs : {44100.0, 48000.0, 96000.0}) {
    auto P = defaults();
    P[p::gust] = 0.1;
    auto e = std::make_unique<WindHarpEngine>(fs);
    e->setParams(P.data());
    e->Uw = 6;
    P[p::wind] = 6;
    e->setParams(P.data());
    const int keys[] = {21, 43, 60, 79, 96, 100};
    for (int key : keys) e->noteOn(key, 1);
    std::vector<float> L(128), R(128);
    double pk = 0;
    bool finite = true;
    const int blocks = (int)(3 * fs / 128);
    for (int blk = 0; blk < blocks; blk++) {
      const double t = blk * 128 / fs;
      for (int i = 0; i < 6; i++) { // a sweep each, then held at an end
        const double s = t < 2 ? std::sin(windharp::TAU * (0.7 + 0.3 * i) * t) : (i & 1 ? 1 : -1);
        e->noteBend(std::pow(2.0, 48 * s / 12), keys[i]);
      }
      e->process(L.data(), R.data(), 128);
      for (int i = 0; i < 128; i++) { finite = finite && std::isfinite(L[i]) && std::isfinite(R[i]); pk = std::max({pk, (double)std::fabs(L[i]), (double)std::fabs(R[i])}); }
    }
    double q = 0;
    for (int key : keys) if (const auto *v = voiceOf(*e, key)) for (int i = 0; i < v->ns; i++) for (int j = 0; j < v->strings[i].J; j++) q = std::max(q, std::fabs(v->strings[i].q[j]));
    double held = 0; // and with the bends held at their ends
    CHECK(render(*e, 1, 128, &held));
    std::printf("       %.1f kHz: peak %.2f swept, %.2f held; wakes %.2f\n", fs / 1000, pk, held, q);
    CHECK(finite);
    // A string tightened far pulls harder on the bridge (tension × slope, the tension ×r²): G2 swept
    // through four octaves, locking on its way, peaks at 2–5 (alike from 44.1 to 192 kHz), 10–50
    // times its own level; held far off their notes, the strings unlock and the chord quietens.
    CHECK(pk < 12);
    CHECK(held < 2);
    CHECK(q < 6);
  }
}

TEST("windharp: a shut key rings down and retires; the pedal holds the shutter open; aftertouch blows harder; Panic fades every key") {
  const double fs = 48000;
  auto P = defaults();
  auto e = std::make_unique<WindHarpEngine>(fs);
  e->setParams(P.data());
  e->setSustain(true);
  e->noteOn(93, 1);
  render(*e, 0.3);
  e->noteOff(93, 0.5);
  render(*e, 0.3);
  CHECK(voiceOf(*e, 93) && voiceOf(*e, 93)->x == 1); // held by the pedal
  e->setSustain(false);
  render(*e, 0.2);
  CHECK(voiceOf(*e, 93) && voiceOf(*e, 93)->x == 0 && voiceOf(*e, 93)->target == 0);
  render(*e, 4);
  CHECK(e->voiceCount() == 0);
  // aftertouch, on the channel and on a key
  e->noteOn(76, 0.7);
  render(*e, 0.1);
  const double U0 = e->U;
  e->pressure(1, -1);
  render(*e, 0.5);
  CHECK(rel(e->U, 1.5 * U0) < 0.01);
  e->pressure(1, 76);
  render(*e, 0.5);
  CHECK(rel(voiceOf(*e, 76)->strings[0].Ucur, 2.25 * U0) < 0.01);
  e->allNotesOff();
  render(*e, 0.5);
  CHECK(e->voiceCount() == 0);
}

TEST("windharp: past 12 keys the quietest released one fades; a flood of re-struck keys stays within the pool") {
  const double fs = 48000;
  auto P = defaults();
  auto e = std::make_unique<WindHarpEngine>(fs);
  e->setParams(P.data());
  for (int i = 0; i < 12; i++) { e->noteOn(57 + 3 * i, 0.8); render(*e, 0.02); }
  for (int i = 0; i < 12; i++) e->noteOff(57 + 3 * i, -1);
  render(*e, 0.1);
  e->noteOn(94, 0.8);
  e->noteOn(95, 0.8);
  int live = 0;
  for (int i = 0; i < e->nv; i++) if (!e->voices[i]->fading && !e->voices[i]->dead) live++;
  CHECK(live <= WindHarpEngine::MAX_VOICES);
  // every key at once, struck again and again with a new tuning each time: every press makes new strings
  for (int r = 0; r < 6; r++) {
    P[p::n0] = 2 + r % 5;
    e->setParams(P.data());
    for (int k = KEY_LO; k <= KEY_HI; k++) e->noteOn(k, 0.9);
    CHECK(render(*e, 0.01));
    CHECK(e->nv <= WindHarpEngine::POOL);
  }
  e->allNotesOff();
  render(*e, 0.5);
  CHECK(e->voiceCount() == 0);
}

TEST("windharp: a block of any length plays as the JavaScript takes it (up to 512 samples whole), without NaN") {
  for (int block : {1, 7, 64, 128, 256, 512, 1000}) {
    auto P = defaults();
    P[p::gust] = 0.1;
    auto e = std::make_unique<WindHarpEngine>(48000);
    e->setParams(P.data());
    e->noteOn(67, 0.8);
    e->noteOn(88, 0.8);
    double pk = 0;
    CHECK(render(*e, 1.5, block, &pk));
    CHECK(pk > 0.05 && pk < 2);
  }
}

TEST("windharp: the top strings in a strong wind step several times a sample: C7 and E7 at A = 466 Hz, 8 m/s with 30 % gusts and full aftertouch (E7 at 18 m/s: Ω h 3 at 44.1 kHz, 6 at 22.05 kHz, beyond even 8 steps a sample), stay finite and bounded, their wakes under 3 × the van der Pol swing") {
  for (double fs : {22050.0, 44100.0, 48000.0}) for (int block : {7, 128}) {
    auto P = defaults();
    P[p::wind] = 8; P[p::gust] = 0.3; P[p::pitch] = 8; // A = 466 Hz
    auto e = std::make_unique<WindHarpEngine>(fs);
    e->setParams(P.data());
    e->Uw = 8;
    e->pressure(1, -1);
    e->noteOn(96, 0.7);
    e->noteOn(100, 0.7);
    e->pressure(1, 100); // E7 blows harder still: 18 m/s
    double pk = 0;
    CHECK(render(*e, 2, block, &pk));
    CHECK(pk < 4);
    double q = 0;
    for (int key : {96, 100}) if (const auto *v = voiceOf(*e, key)) for (int i = 0; i < v->ns; i++) for (int j = 0; j < v->strings[i].J; j++) q = std::max(q, std::fabs(v->strings[i].q[j]));
    CHECK(q > 1 && q < 6);
  }
}

TEST("windharp: the views' messages: the focused string's modes and wake, the sounding keys, the summary last") {
  const double fs = 48000;
  auto P = defaults();
  SpscQueue<Message> q(256);
  auto e = std::make_unique<WindHarpEngine>(fs);
  e->messages = &q;
  e->setParams(P.data());
  e->noteOn(60, 1);
  e->noteOn(84, 1);
  render(*e, 1.5);
  Message m;
  int arrays = 0, keys = 0, summaries = 0;
  Message last;
  while (q.pop(m)) {
    if (m.type == msg::array) { arrays++; CHECK(m.count > 0 && m.count <= N_MAX); }
    else if (m.type == msg::keys) { keys++; CHECK(m.values[0] == 0 && m.count == 7); }
    else if (m.type == msg::harp) {
      summaries++;
      CHECK(m.key == 84 && m.values[2] == 2 && m.values[15] == 2 && m.values[14] == 2);
      last = m;
    }
  }
  CHECK(last.values[8] == 3 && last.values[9] > 0.03); // locked on its 3rd harmonic
  CHECK(summaries > 10 && arrays == 6 * summaries && keys == summaries);
}

TEST("CPU: ten sounding keys across the compass (15 strings) at 48 kHz take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  auto P = defaults();
  auto e = std::make_unique<WindHarpEngine>(fs);
  e->setParams(P.data());
  for (int k : {55, 59, 62, 67, 71, 74, 79, 83, 86, 91}) e->noteOn(k, 0.8);
  render(*e, 0.5);
  const auto t0 = std::chrono::steady_clock::now();
  render(*e, 4);
  const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 4;
  int strings = 0;
  for (int i = 0; i < e->nv; i++) strings += e->voices[i]->ns;
  std::printf("       %d keys, %d strings: %.2f %% of a core\n", e->voiceCount(), strings, 100 * share);
  CHECK(share < 0.3);
}

int main() { return check::run(); }
