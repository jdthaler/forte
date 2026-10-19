// harpsichord-tests.cpp — the harpsichord's model and engine in C++: stiff strings and the
// temperaments, the cantilever against beam theory, the pluck against an ideal pluck, energy and
// the quasi-static release, then the engine: a key on pitch (its strings built on the worker
// thread), the plectra back under their strings after the key comes up, the plucks it reports, and
// ten keys in the CPU budget. The full physics suite is the JavaScript one, run on the WebAssembly
// (node test/harpsichord-tests.mjs).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <numbers>
#include <thread>
#include <vector>

#include "check.h"
#include "harpsichord-engine.h"

using namespace forte;
using namespace forte::harpsichord;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
// One row alone, as the JavaScript suite's solo(): the manual it is on, coupler off, no detune.
static std::vector<double> solo(int row) {
  auto P = defaults();
  P[p::manual] = ROW_UPPER[row] ? manual_::upper : manual_::lower;
  P[p::coupler] = 0; P[p::front8] = row == ROW_FRONT; P[p::back8] = row == ROW_BACK; P[p::four] = row == ROW_FOUR; P[p::lute] = row == ROW_LUTE;
  P[p::detune] = 0;
  return P;
}
static Params lossless(Params q) { q.loss = 1e-9; q.bridgeScale = 0; return q; }
static std::vector<float> render(HarpsichordEngine &e, int n, std::vector<float> *right = nullptr) {
  std::vector<float> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  if (right) *right = R;
  return L;
}
// the worker builds each key's strings in its own time: wait for the key's, so a test doesn't
// depend on the machine's load (in WebAssembly they are built at once)
static void waitFor(HarpsichordEngine &e, int key) {
  for (int i = 0; i < 5000 && !e.ready(key); i++) std::this_thread::sleep_for(std::chrono::milliseconds(1));
  CHECK(e.ready(key));
}
// |DTFT| of x[a, b) at f, Hann-windowed, and its strongest peak in [f0, f1]
static double tone(const std::vector<float> &x, double f, int a, int b, double fs) {
  const double w = 2 * std::numbers::pi * f / fs;
  double re = 0, im = 0;
  for (int i = a; i < b; i++) { const double h = 0.5 - 0.5 * std::cos(2 * std::numbers::pi * (i - a) / (b - a)); re += h * x[i] * std::cos(w * i); im += h * x[i] * std::sin(w * i); }
  return std::hypot(re, im);
}
static double peakFreq(const std::vector<float> &x, double f0, double f1, int a, int b, double fs) {
  double best = f0, bv = -1;
  const double step = (f1 - f0) / 24;
  for (double f = f0; f <= f1; f += step) { const double v = tone(x, f, a, b, fs); if (v > bv) { bv = v; best = f; } }
  double lo = best - step, hi = best + step;
  const double g = (std::sqrt(5.0) - 1) / 2;
  for (int it = 0; it < 32; it++) { const double m1 = hi - g * (hi - lo), m2 = lo + g * (hi - lo); if (tone(x, m1, a, b, fs) > tone(x, m2, a, b, fs)) hi = m2; else lo = m1; }
  return 0.5 * (lo + hi);
}
static double rms(const std::vector<float> &x, int a, int b) {
  double s = 0;
  for (int i = a; i < b; i++) s += (double)x[i] * x[i];
  return std::sqrt(s / (b - a));
}
// free-oscillation amplitude of partial i (exact for an undamped partial)
static double amp(const PluckedString &st, int i) {
  const double w = st.W[i], c = std::cos(w * st.h), a = st.q()[i], b = st.q1()[i];
  return std::sqrt(std::max(0.0, a * a - 2 * c * a * b + b * b)) / std::fabs(std::sin(w * st.h));
}

TEST("harpsichord: stiff strings fₙ = n f₁ √((1 + Bn²)/(1 + B)) on pitch; the scale's c² is 355 mm; ¼-comma meantone's thirds are pure") {
  const Params P = paramsOf(defaults().data());
  for (auto [m, ch] : {std::pair{29, (int)BACK}, {60, (int)BACK}, {89, (int)FOUR}}) {
    const StringDesign S = stringDesign(m, ch, P);
    CHECK_NEAR(S.B, (std::pow(std::numbers::pi, 3) * S.mat->E * std::pow(S.d, 4)) / (64 * S.T * S.L * S.L), 1e-12 * S.B);
    CHECK_NEAR(partialFreq(S, 1), S.f0, 1e-12 * S.f0);
    for (int n : {2, 5, 13}) CHECK_NEAR(partialFreq(S, n), n * S.f0 * std::sqrt((1 + S.B * n * n) / (1 + S.B)), 1e-12 * n * S.f0);
    CHECK(S.T > 19.5 && S.T < 63);
  }
  CHECK_NEAR(stringLength(C2, BACK), 0.355, 1e-12);
  CHECK(isBrass(45, BACK) && !isBrass(46, BACK) && isBrass(40, FOUR) && !isBrass(41, FOUR));
  const auto iv = [](int a, int b) { return std::fmod(std::fmod(temperamentCents(1, b) - temperamentCents(1, a), 1200) + 1200, 1200); };
  for (auto [a, b] : {std::pair{0, 4}, {5, 9}, {7, 11}, {2, 6}}) CHECK_NEAR(iv(a, b), 1200 * std::log2(5.0 / 4), 1e-9);
  CHECK_NEAR(iv(8, 3), 737.64, 0.01); // the wolf
  CHECK(temperamentOffset(1, 9) == 0);
}

TEST("harpsichord: the cantilever — a uniform plectrum has c(s) = s³/3EI and g(s) = s²/2EI within 0.5 %; the quill's compliance sits towards its tip") {
  PlectrumSpec sp;
  sp.taper = 0;
  const Plectrum u = makePlectrum(sp);
  for (double s : {0.5 * u.len, 0.8 * u.len, u.len}) {
    CHECK_NEAR(beamC(u, s), std::pow(s, 3) / (3 * u.EI0), 5e-3 * beamC(u, s));
    CHECK_NEAR(beamG(u, s), s * s / (2 * u.EI0), 5e-3 * beamG(u, s));
  }
  CHECK_NEAR(1 / beamC(u, u.len), 2500, 1e-9 * 2500);
  PlectrumSpec qs;
  qs.material = 1;
  const Plectrum q = makePlectrum(qs);
  CHECK_NEAR(1 / beamC(q, q.len), 2500, 1e-9 * 2500);
  CHECK(beamC(q, 0.6 * q.len) / beamC(q, q.len) < beamC(u, 0.6 * u.len) / beamC(u, u.len));
}

TEST("harpsichord: a slow frictionless pluck lets the string go from its static shape (partials ∝ sin(nπx/L)/(n²(1 + Bn²))); the string keeps the work done on it; the release is the quasi-static one") {
  {
    Params q = lossless(paramsOf(solo(ROW_BACK).data()));
    q.mu = 0; q.stiff = 4000;
    auto sim = std::make_unique<Simulated>();
    simulatePluck(*sim, 72, ROW_BACK, q, 0.01, 48000, 1.0, 1, 0.002);
    CHECK(sim->trace.released > 0);
    const PluckedString &st = sim->st;
    const double x = sim->trace.x, A1 = amp(st, 0);
    const auto pred = [&](int n) { return std::fabs(std::sin((n * std::numbers::pi * x) / st.S.L)) / (n * n * (1 + st.S.B * n * n)); };
    for (int i = 1; i < std::min(20, st.N); i++) CHECK(std::fabs(amp(st, i) / A1 - pred(i + 1) / pred(1)) < 3e-3);
  }
  {
    Params q = lossless(paramsOf(solo(ROW_FRONT).data()));
    q.mu = 0.3;
    auto sim = std::make_unique<Simulated>();
    simulatePluck(*sim, 60, ROW_FRONT, q, 0.02, 48000, 0.8, 1, 0.003);
    CHECK_NEAR(sim->trace.energy, sim->trace.work, 0.02 * sim->trace.work);
    CHECK_NEAR(sim->trace.energy, 0.5 * sim->trace.rel.F * sim->trace.rel.F * sim->trace.staticCompliance, 0.03 * sim->trace.energy);
  }
  {
    Params q = lossless(paramsOf(solo(ROW_FRONT).data()));
    q.material = 1;
    auto sim = std::make_unique<Simulated>();
    simulatePluck(*sim, 72, ROW_FRONT, q, 0.01, 48000, 1.5, 1, 0.001);
    const QuasiStatic qs = quasiStaticRelease(sim->trace.pl, sim->trace.staticCompliance, sim->trace.Kz);
    CHECK(qs.ok);
    CHECK_NEAR(sim->trace.rel.F, qs.F, 0.02 * qs.F);
    CHECK_NEAR(sim->trace.rel.s, sim->trace.pl.len, 0.01 * sim->trace.pl.len);
    // and the closed form, frictionless F = √(2 EI K_z o)/ℓ for a uniform plectrum
    PlectrumSpec sp;
    sp.taper = 0; sp.mu = 0; sp.foreshortening = false; sp.overlap = 0.3e-3;
    const Plectrum u = makePlectrum(sp);
    const QuasiStatic qu = quasiStaticRelease(u, sim->trace.staticCompliance, sim->trace.Kz);
    CHECK_NEAR(qu.F, releaseForceClosed(u.EI0, u.len, sim->trace.Kz, u.overlap), 0.01 * qu.F);
  }
}

TEST("harpsichord: the board drains each partial at σ_b = Re Y (T + EIk²)/L for the fundamental") {
  const Params P = paramsOf(solo(ROW_BACK).data());
  for (int m : {48, 60, 72}) {
    const StringDesign S = stringDesign(m, BACK, P);
    auto parts = std::make_unique<Partials>();
    stringPartials(S, P, 48000, *parts);
    const auto [bx, by] = bridgePoint(m, BACK);
    const double want = (boardAdmittance(bx, by, parts->f[0])[0] * (S.T + S.EI * std::pow(std::numbers::pi / S.L, 2))) / S.L;
    CHECK_NEAR(parts->sigB[0], want, 1e-9 * want);
    CHECK(parts->N > 10 && parts->N <= N_MAX);
  }
}

TEST("harpsichord: a key sounds on pitch (its strings built on the worker thread), reports its plucks, and its plectra come back under the strings when it is let up") {
  const double fs = 48000;
  auto P = solo(ROW_BACK);
  P[p::soundboard] = 0;
  P[p::kc] = 0; // the linear string's tuning (tension modulation starts a pluck sharp)
  SpscQueue<Message> q(1024);
  auto engine = std::make_unique<HarpsichordEngine>(fs); // big for a WebAssembly stack
  HarpsichordEngine &e = *engine;
  e.messages = &q;
  e.setParams(P.data());
  e.noteOn(69, 0.7); // at once: in the plugin the strings may not be built yet, and the note waits for them
  render(e, 128);
  waitFor(e, 69);
  auto L = render(e, (int)(0.8 * fs));
  CHECK(e.voiceCount() == 1);
  const double want = keyPitch(69, paramsOf(P.data())), f = peakFreq(L, want * 0.993, want * 1.007, (int)(0.15 * fs), (int)(0.8 * fs), fs);
  CHECK(std::fabs(1200 * std::log2(f / want)) < 2);
  Message m;
  int plucks = 0;
  while (q.pop(m)) if (m.type == msg::pluck) { plucks++; CHECK(m.key == 69 && m.values[0] == (float)BACK && m.values[1] == 0 && m.values[2] > 0); }
  CHECK(plucks == 1);
  e.noteOff(69, -1);
  render(e, (int)(0.2 * fs));
  HarpsichordEngine::Voice *v = e.byKey[69];
  CHECK(!v || v->strings[BACK].phase[0] == Phase::under);
  auto tail = render(e, (int)(1.5 * fs));
  CHECK(rms(tail, (int)(1.3 * fs), (int)(1.5 * fs)) < 1e-4);
}

TEST("harpsichord: a physics knob gives the next press new strings and fades the old; Panic silences") {
  const double fs = 48000;
  auto P = defaults();
  auto engine = std::make_unique<HarpsichordEngine>(fs);
  HarpsichordEngine &e = *engine;
  e.setParams(P.data());
  waitFor(e, 60);
  e.noteOn(60, 0.7);
  render(e, (int)(0.2 * fs));
  P[p::detune] = 5;
  e.setParams(P.data());
  waitFor(e, 60);
  e.noteOn(60, 0.7);
  render(e, 128);
  CHECK(e.voiceCount() == 2);
  e.allNotesOff();
  auto L = render(e, (int)(0.3 * fs));
  double pk = 0;
  for (int i = (int)(0.2 * fs); i < (int)(0.3 * fs); i++) pk = std::max(pk, (double)std::fabs(L[i]));
  CHECK(pk < 1e-3);
  CHECK(e.voiceCount() == 0);
}

TEST("CPU: ten keys of 8′ 8′ 4′ coupled (30 strings) at 48 kHz take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  auto P = defaults();
  P[p::four] = 1;
  auto engine = std::make_unique<HarpsichordEngine>(fs);
  HarpsichordEngine &e = *engine;
  e.setParams(P.data());
  const int keys[10] = {41, 45, 48, 52, 55, 60, 64, 67, 72, 76};
  for (int k : keys) waitFor(e, k);
  std::vector<float> L(128), R(128);
  const auto t0 = std::chrono::steady_clock::now();
  const int blocks = (int)(3 * fs / 128);
  for (int b = 0; b < blocks; b++) {
    for (int i = 0; i < 10; i++) if (b == (int)(0.005 * i * fs / 128)) e.noteOn(keys[i], 0.7);
    e.process(L.data(), R.data(), 128);
  }
  const double share = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 3;
  std::printf("       %d keys: %.2f %% of a core\n", e.voiceCount(), 100 * share);
  CHECK(e.voiceCount() == 10);
  CHECK(share < 0.3);
}

int main() { return check::run(); }
