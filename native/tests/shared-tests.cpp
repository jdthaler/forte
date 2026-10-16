// shared-tests.cpp — the C++ ports of the shared JavaScript (dsp, impulses, linalg, the output
// chain) against what the JavaScript computes (js-vectors.h), and the real-time plumbing.

#include <atomic>
#include <chrono>
#include <cstring>
#include <string>
#include <thread>
#include <vector>

#include "check.h"
#include "forte/background.h"
#include "forte/chain.h"
#include "forte/convolver.h"
#include "forte/denormals.h"
#include "forte/dsp.h"
#include "forte/guard.h"
#include "forte/impulses.h"
#include "forte/limiter.h"
#include "forte/linalg.h"
#include "js-vectors.h"

using namespace forte;

#define LEN(a) (int)(sizeof(a) / sizeof((a)[0]))

TEST("dsp: the random generator draws the JavaScript's sequence, bit for bit") {
  struct { uint32_t seed; const double *v; } cases[] = {{11, js::kRng11}, {18, js::kRng18}, {101, js::kRng101}, {102, js::kRng102}};
  for (auto &c : cases) { Mulberry32 r(c.seed); for (int i = 0; i < 64; i++) CHECK(r() == c.v[i]); }
}
TEST("dsp: modeCoeffs, Biquad, OnePole, DCBlock, Delay and keyPan as in shared/dsp.js") {
  for (int i = 0; i < LEN(js::kModeIn) / 3; i++) {
    const ModeCoeffs c = modeCoeffs(js::kModeIn[3 * i], js::kModeIn[3 * i + 1], js::kModeIn[3 * i + 2]);
    CHECK_NEAR(c.a1, js::kModeOut[3 * i], 1e-15); CHECK_NEAR(c.a2, js::kModeOut[3 * i + 1], 1e-15);
    CHECK_NEAR(c.b / js::kModeOut[3 * i + 2], 1, 1e-13);
  }
  for (int i = 0; i < LEN(js::kBiquadType); i++) {
    const std::string t = js::kBiquadType[i];
    const Biquad::Type type = t == "lp" ? Biquad::lp : t == "hp" ? Biquad::hp : t == "bp" ? Biquad::bp : t == "peak" ? Biquad::peak : Biquad::notch;
    Biquad b;
    b.set(type, js::kBiquadIn[4 * i], js::kBiquadIn[4 * i + 1], js::kBiquadIn[4 * i + 2], js::kBiquadIn[4 * i + 3]);
    for (int k = 0; k < 24; k++) CHECK_NEAR(b.run(k == 0 ? 1 : 0), js::kBiquadImpulse[24 * i + k], 1e-13);
  }
  OnePole p(500, 48000); DCBlock d(10, 48000);
  for (int k = 0; k < 16; k++) { CHECK_NEAR(p.run(1), js::kOnePoleStep[k], 1e-15); CHECK_NEAR(d.run(1), js::kDCBlockStep[k], 1e-15); }
  Delay line(100);
  int j = 0;
  for (int i = 0; i < 64; i++) {
    line.write(std::sin(i * 0.37) + 0.1 * i);
    if (i >= 20) for (double at : {1.0, 3.25, 17.9}) CHECK_NEAR(line.read(at), js::kDelayReads[j++], 1e-13);
  }
  const int keys[] = {21, 36, 60, 72, 96, 108};
  for (int i = 0; i < 6; i++) { auto [l, r] = keyPan(keys[i]); CHECK_NEAR(l, js::kKeyPan[2 * i], 1e-15); CHECK_NEAR(r, js::kKeyPan[2 * i + 1], 1e-15); }
}

static void checkIR(void (*make)(double, double, std::vector<float> (&)[2]), double fs, double sec, const int *at, int nAt,
                    const float *v, const double *sum, int length, double scale) {
  std::vector<float> ir[2];
  make(fs, sec, ir);
  CHECK((int)ir[0].size() == length);
  int same = 0;
  for (int c = 0; c < 2; c++) {
    double s = 0, peak = 0;
    for (float x : ir[c]) { s += x; peak = std::max(peak, (double)std::fabs(x)); }
    CHECK_NEAR(s, sum[c], 1e-6 * length * peak);
    for (int i = 0; i < nAt; i++) {
      CHECK_NEAR(ir[c][at[i]], v[c * nAt + i], 1e-6 * peak);
      same += ir[c][at[i]] == v[c * nAt + i];
    }
  }
  CHECK(same >= 2 * nAt - 2); // the same float but for a last-bit rounding of exp, sin or cos
  CHECK_NEAR(webAudioScale(ir, fs), scale, 1e-9 * scale);
}
TEST("impulses: the soundboard and the room as shared/impulses.js builds them") {
  checkIR(soundboardIR, 48000, 0.4, js::kSoundboard48At, LEN(js::kSoundboard48At), js::kSoundboard48, js::kSoundboard48Sum, js::kSoundboard48Length[0], js::kSoundboard48Scale[0]);
  checkIR(soundboardIR, 44100, 0.3, js::kSoundboard44At, LEN(js::kSoundboard44At), js::kSoundboard44, js::kSoundboard44Sum, js::kSoundboard44Length[0], js::kSoundboard44Scale[0]);
  checkIR(roomIR, 48000, 2.0, js::kRoom48At, LEN(js::kRoom48At), js::kRoom48, js::kRoom48Sum, js::kRoom48Length[0], js::kRoom48Scale[0]);
  checkIR(roomIR, 44100, 1.8, js::kRoom44At, LEN(js::kRoom44At), js::kRoom44, js::kRoom44Sum, js::kRoom44Length[0], js::kRoom44Scale[0]);
}
TEST("linalg: Eigen's eigenvalues are shared/linalg.js's, and genEig's vectors are M-orthonormal") {
  const int n = 6;
  Matrix K(n, n), M(n, n);
  for (int i = 0; i < n * n; i++) { K(i / n, i % n) = js::kSymK[i]; M(i / n, i % n) = js::kGenM[i]; }
  auto s = symEig(K);
  for (int i = 0; i < n; i++) CHECK_NEAR(s.lambda[i], js::kSymLambda[i], 1e-12);
  auto g = *genEig(K, M);
  for (int i = 0; i < n; i++) CHECK_NEAR(g.lambda[i], js::kGenLambda[i], 1e-12);
  CHECK(((g.X.transpose() * M * g.X) - Matrix::Identity(n, n)).cwiseAbs().maxCoeff() < 1e-12);
  CHECK(((K * g.X) - (M * g.X * g.lambda.asDiagonal())).cwiseAbs().maxCoeff() < 1e-12);
  CHECK(!genEig(K, -M) && !cholesky(-M)); // not positive definite
  CHECK(cholesky(M).has_value());
}

TEST("convolver: the same as direct convolution, with no latency, at any block size") {
  Mulberry32 r(3);
  std::vector<float> ir(20000), x(30000);
  for (auto &v : ir) v = (float)((r() * 2 - 1) * 0.1);
  for (auto &v : x) v = (float)(r() * 2 - 1);
  std::vector<double> ref(x.size(), 0.0);
  for (size_t i = 0; i < x.size(); i++) for (size_t k = 0; k < ir.size() && k <= i; k++) ref[i] += 0.5 * ir[k] * x[i - k];
  for (int block : {1, 7, 64, 128, 1000}) {
    Convolver c;
    c.setIR(ir.data(), ir.size(), 0.5);
    std::vector<float> y(x.size(), 0.0f);
    for (size_t i = 0; i < x.size(); i += block) c.process(x.data() + i, y.data() + i, (int)std::min<size_t>(block, x.size() - i));
    double err = 0;
    for (size_t i = 0; i < x.size(); i++) err = std::max(err, std::fabs(y[i] - ref[i]));
    CHECK(err < 2e-5);
  }
}

TEST("limiter: Web Audio's curve and makeup gain; below the threshold, a constant gain") {
  Limiter l;
  l.set(-3, 3, 12, 0.002, 0.15, 48000);
  CHECK_NEAR(l.curve(0.5), 0.5, 1e-15);                         // below the threshold: unchanged
  const double x1 = 2, x2 = 4;                                  // above the knee: 12 dB in, 1 dB out
  CHECK_NEAR(20 * std::log10(l.curve(x2) / l.curve(x1)), 20 * std::log10(2.0) / 12, 1e-9);
  CHECK(l.makeup > 1.1 && l.makeup < 1.3);                     // Web Audio's automatic makeup, ≈ +1.4 dB here
  std::vector<float> L(4800), R(4800);
  for (int i = 0; i < 4800; i++) L[i] = R[i] = (float)(0.3 * std::sin(i * 0.05));
  l.process(L.data(), R.data(), 4800);
  CHECK_NEAR(L[4000] / (0.3 * std::sin(4000 * 0.05)), l.makeup, 1e-6);
  for (int i = 0; i < 48000 / 8; i++) { float a = 3, b = 3; l.process(&a, &b, 1); if (i > 2000) CHECK(a < 1.05 * l.makeup); } // a loud input settles under 0 dB (× makeup)
}

TEST("chain: tone, body, room and volume as the pages' chain gives them (no limiter)") {
  Chain c;
  c.volume = 0; c.room = 1; c.roomSeconds = 1.2; c.tone = 2; c.body = 3; c.bodySeconds = 0.3; c.bodyDry = 0.7; c.bodyWet = 1.2;
  c.limiterThreshold = 100; // out of the way: makeup 1
  const double P[] = {0.8, 0.4, 3000, 0.5};
  OutputChain ch;
  ch.configure(c, 48000);
  ch.setParams(P);
  const int n = 24000;
  std::vector<float> L(n), R(n);
  for (int s = 0; s < 2; s++) {
    Mulberry32 r(7 + s);
    for (int i = 0; i < n; i++) (s ? R : L)[i] = (float)((r() * 2 - 1) * std::exp(-i / 4800.0) * 0.3);
  }
  ch.process(L.data(), R.data(), n);
  for (int i = 0; i < LEN(js::kChainAt); i++) {
    CHECK_NEAR(L[js::kChainAt[i]], js::kChainOut[i], 2e-5);
    CHECK_NEAR(R[js::kChainAt[i]], js::kChainOut[LEN(js::kChainAt) + i], 2e-5);
  }
  double eL = 0, eR = 0;
  for (int i = 0; i < n; i++) { eL += (double)L[i] * L[i]; eR += (double)R[i] * R[i]; }
  CHECK_NEAR(10 * std::log10(eL / js::kChainEnergy[0]), 0, 0.001);
  CHECK_NEAR(10 * std::log10(eR / js::kChainEnergy[1]), 0, 0.001);
}

TEST("guard: a NaN zeroes the block") {
  float L[4] = {1, 2, NAN, 4}, R[4] = {1, 2, 3, 4};
  CHECK(!guardBlock(L, R, 4));
  CHECK(L[0] == 0 && R[3] == 0);
  float A[2] = {1, 2}, B[2] = {3, 4};
  CHECK(guardBlock(A, B, 2) && A[1] == 2);
}

TEST("denormals: flushed to zero while the audio thread runs") {
  volatile double tiny = 1e-310;
  bool flushed;
  { NoDenormals guard; volatile double y = tiny * 0.5; flushed = y == 0 || tiny == 0; }
#if FORTE_FTZ_SSE || defined(__aarch64__)
  CHECK(flushed);
#else
  (void)flushed;
#endif
  volatile double after = tiny * 0.5;
  CHECK(after != 0); // restored
}

#if FORTE_THREADS
TEST("queue: one producer and one consumer, without locks") {
  SpscQueue<int> q(1000);
  std::atomic<bool> done{false};
  long long sum = 0;
  std::thread consumer([&] { int v; while (!done || !q.empty()) while (q.pop(v)) sum += v; });
  for (int i = 1; i <= 100000; i++) while (!q.push(i)) {}
  done = true;
  consumer.join();
  CHECK(sum == 100000LL * 100001 / 2);
}

TEST("background: a key's data is built off the audio thread, handed over, and freed when no voice holds it") {
  struct Data { int key; uint64_t version; std::vector<double> modes; };
  static std::atomic<int> alive{0};
  struct Tracked { Data d; Tracked(Data x) : d(std::move(x)) { alive++; } Tracked(Tracked &&o) : d(std::move(o.d)) { alive++; } ~Tracked() { alive--; } };
  {
    KeyData<Tracked> data([](int key, uint64_t v) { return std::make_unique<Tracked>(Data{key, v, std::vector<double>(100, key)}); });
    auto waitFor = [&](int key, uint64_t v) {
      for (int i = 0; i < 2000; i++) { auto r = data.get(key, v); data.audioCycle(); if (r) return r; std::this_thread::sleep_for(std::chrono::milliseconds(1)); }
      return decltype(data.get(0, 0)){};
    };
    auto a = waitFor(60, 1);
    CHECK(a && a.data->d.key == 60 && a.data->d.version == 1);
    data.acquire(a);                       // a voice keeps it
    data.prepare(2, 55, 65);               // new parameters
    auto b = waitFor(60, 2);
    CHECK(b && b.data->d.version == 2);
    for (int i = 0; i < 20; i++) { data.audioCycle(); std::this_thread::sleep_for(std::chrono::milliseconds(3)); }
    CHECK(a.data->d.key == 60);            // still alive: held
    const int held = alive.load();
    data.release(a);
    for (int i = 0; i < 20; i++) { data.audioCycle(); std::this_thread::sleep_for(std::chrono::milliseconds(3)); }
    CHECK(alive.load() < held);            // freed once let go
    for (int k = 55; k <= 65; k++) CHECK(waitFor(k, 2));
  }
  CHECK(alive.load() == 0);
}
#endif
