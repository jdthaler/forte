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
#include "forte/sympathetic.h"
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
TEST("impulses: each venue as shared/impulses.js builds it, and its gain") {
  using Make = void (*)(double, double, std::vector<float> (&)[2]);
  auto venue = [](int k) -> Make {
    switch (k) {
      case 0: return [](double fs, double, std::vector<float> (&o)[2]) { venueIR(fs, 0, 2.0, o); };
      case 2: return [](double fs, double, std::vector<float> (&o)[2]) { venueIR(fs, 2, 2.0, o); };
      case 3: return [](double fs, double, std::vector<float> (&o)[2]) { venueIR(fs, 3, 2.0, o); };
      default: return [](double fs, double, std::vector<float> (&o)[2]) { venueIR(fs, 4, 2.0, o); };
    }
  };
  CHECK(kVenueCount == 5 && std::string(kVenues[kDefaultVenue].id) == "room");
#define VENUE(index, Name, fs) \
  checkIR(venue(index), fs, 0, js::k##Name##At, LEN(js::k##Name##At), js::k##Name, js::k##Name##Sum, js::k##Name##Length[0], js::k##Name##Scale[0]); \
  CHECK_NEAR(venueGain(index, js::k##Name##Length[0], fs), js::k##Name##Gain[0], 1e-12);
  VENUE(0, VenueStudio48, 48000)
  VENUE(2, VenueRecital48, 48000)
  VENUE(3, VenueHall48, 48000)
  VENUE(4, VenueCathedral48, 48000)
  VENUE(3, VenueHall44, 44100)
#undef VENUE
  std::vector<float> a[2], b[2];
  venueIR(48000, kDefaultVenue, 1.8, a);
  roomIR(48000, 1.8, b);
  CHECK(a[0] == b[0] && a[1] == b[1] && venueGain(kDefaultVenue, a[0].size(), 48000) == 1); // 'room' is the room
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

TEST("chain: in the concert hall as the pages' chain gives it") {
  Chain c;
  c.volume = 0; c.room = 1; c.roomSeconds = 1.2; c.tone = 2; c.body = 3; c.bodySeconds = 0.3; c.bodyDry = 0.7; c.bodyWet = 1.2;
  c.venue = 4;
  c.limiterThreshold = 100;
  const double P[] = {0.8, 0.4, 3000, 0.5, 3}; // venue 3: the concert hall
  OutputChain ch;
  ch.configure(c, 48000, P);
  ch.setParams(P);
  const int n = 24000;
  std::vector<float> L(n), R(n);
  for (int s = 0; s < 2; s++) {
    Mulberry32 r(7 + s);
    for (int i = 0; i < n; i++) (s ? R : L)[i] = (float)((r() * 2 - 1) * std::exp(-i / 4800.0) * 0.3);
  }
  ch.process(L.data(), R.data(), n);
  for (int i = 0; i < LEN(js::kChainAt); i++) {
    CHECK_NEAR(L[js::kChainAt[i]], js::kChainHallOut[i], 2e-5);
    CHECK_NEAR(R[js::kChainAt[i]], js::kChainHallOut[LEN(js::kChainAt) + i], 2e-5);
  }
  double eL = 0, eR = 0;
  for (int i = 0; i < n; i++) { eL += (double)L[i] * L[i]; eR += (double)R[i] * R[i]; }
  CHECK_NEAR(10 * std::log10(eL / js::kChainHallEnergy[0]), 0, 0.001);
  CHECK_NEAR(10 * std::log10(eR / js::kChainHallEnergy[1]), 0, 0.001);
}

// Wet only: an impulse through the room, the samples after `from` that are heard
static double tailEnergy(OutputChain &ch, double fs, double from, double to, bool impulse) {
  const int n = (int)(to * fs);
  double e = 0;
  float L[128], R[128];
  for (int s = 0; s < n; s += 128) {
    for (int i = 0; i < 128; i++) L[i] = R[i] = (impulse && s + i == 0) ? 1.0f : 0.0f;
    ch.process(L, R, 128);
    if (s >= from * fs) for (int i = 0; i < 128; i++) e += (double)L[i] * L[i];
  }
  return e;
}

TEST("chain: a new venue is built on the side, and the room it replaces rings out") {
  Chain c;
  c.room = 0; c.venue = 1; c.roomSeconds = 2.0; c.roomGain = 1;
  c.limiterThreshold = 100;
  double P[] = {1, 1}; // venue 1: room
  OutputChain ch;
  ch.configure(c, 48000, P);
  ch.setParams(P);
  // the cathedral: until it is built the room plays on; then an impulse rings for seconds
  P[1] = 4;
  ch.setParams(P);
  for (int tries = 0; tries < 150; tries++) {
    tailEnergy(ch, 48000, 1, 0.01, false);
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }
  tailEnergy(ch, 48000, 1, 7, false); // anything left rings away
  CHECK(tailEnergy(ch, 48000, 3, 5, true) > 0);
  // back to the room (built): a burst, then the studio (built on the side first), whose own tail is
  // 0.7 s: the room's 2 s tail still rings after it
  P[1] = 0; ch.setParams(P);
  for (int tries = 0; tries < 100; tries++) { tailEnergy(ch, 48000, 1, 0.01, false); std::this_thread::sleep_for(std::chrono::milliseconds(10)); }
  P[1] = 1; ch.setParams(P);
  tailEnergy(ch, 48000, 1, 7, false);
  float L[128], R[128];
  for (int i = 0; i < 128; i++) L[i] = R[i] = i == 0 ? 1.0f : 0.0f;
  ch.process(L, R, 128);
  P[1] = 0; ch.setParams(P);
  CHECK(tailEnergy(ch, 48000, 1.0, 1.5, false) > 0);  // the room's tail, after the studio's ended
  CHECK(tailEnergy(ch, 48000, 0.6, 0.8, false) == 0); // and then nothing: the room's 2 s are over
}

TEST("chain: a tone at or above Nyquist passes the sound unchanged, as Web Audio's (a low sample rate)") {
  WebAudioLowpass f;
  f.set(14000, 8000);
  for (int i = 0; i < 1000; i++) { const double x = std::sin(i * 2.9); CHECK(f.run(x) == x); }
  f.set(0, 8000);
  CHECK(f.run(1) == 0);
  f.set(3000, 8000); // below: an ordinary, stable low-pass
  double y = 0;
  for (int i = 0; i < 8000; i++) y = f.run(1);
  CHECK_NEAR(y, 1, 1e-9);
}

TEST("sympathetic: strings tuned alike trade their energy through the bridge and make none; a group never feels its own voice") {
  const double fs = 48000, w = 2 * std::numbers::pi * 220, c = 2; // each loses c²/2 = 2 s⁻¹ into the bridge
  for (const double kappa : {0.25, 1.0}) {
    Sympathetic sym(2, 1, 128, fs, true);
    SympatheticMode m;
    m.omega = w; m.cV = c; m.sigma = 0.5 * c * c; m.damped = m.sigma + 50; m.oV = 1; m.loud = 1e9; // (never still, here)
    sym.set(0, &m, 1); sym.set(1, &m, 1);
    sym.damp(0, false); sym.damp(1, false);
    const Sympathetic::Tap t0{0, 1, 0}, t1{1, 1, 0};
    sym.route(0, &t0, 1); sym.route(1, &t1, 1);
    std::vector<double> v(128), z(128, 0.0), b0(128), b1(128);
    double *bus[2] = {b0.data(), b1.data()};
    // a tenth of a second of a voice on group 1's own string: it drives group 0 alone
    int n = 0;
    for (int b = 0; b < 38; b++) {
      for (int i = 0; i < 128; i++, n++) v[i] = 0.01 * std::sin(w * n / fs);
      sym.own(1, v.data(), nullptr);
      sym.run(kappa, v.data(), z.data(), true, 128, bus);
    }
    CHECK(sym.energy(0) > 0);
    // a string alone with its own voice feels nothing
    Sympathetic one(1, 1, 128, fs, true);
    one.set(0, &m, 1); one.damp(0, false); one.route(0, &t0, 1);
    for (int b = 0; b < 38; b++) { one.own(0, v.data(), nullptr); one.run(kappa, v.data(), z.data(), true, 128, bus); }
    CHECK(one.energy(0) == 0);
    // then the two alone: the bridge drains each at c²/2 and the coupling moves energy between
    // them, so group 1 takes a share of it from group 0 and their energy only falls. At κ = 1 they
    // meet the bridge at one point: their antiphase motion leaves it still and keeps its energy,
    // and the coupling's step behind lets the sum wobble by a little within a period.
    double e = sym.energy(0) + sym.energy(1), grew = 0, most1 = 0;
    const double e0 = e;
    for (int b = 0; b < 750; b++) {
      sym.run(kappa, z.data(), z.data(), false, 128, bus);
      const double en = sym.energy(0) + sym.energy(1);
      grew = std::max(grew, en / e - 1);
      most1 = std::max(most1, sym.energy(1) / en);
      e = en;
    }
    CHECK(grew < (kappa < 1 ? 1e-9 : 5e-3));
    CHECK(e < (kappa < 1 ? 0.01 : 1) * e0); // 2 s at 2 s⁻¹ or more
    CHECK(most1 > 0.2);
    std::printf("       (κ = %.2f: the most the two gained in a block, %.1e of their energy; group 1's largest share %.2f)\n", kappa, grew, most1);
  }
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
