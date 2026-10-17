// quantum-tests.cpp — the Quantum Keyboard's model and engine in C++: packets the JavaScript's to the
// last bit (quantum-model.js, for every well), the tempo lock's revival on the beat, a note that
// waits for its packet (built on the worker) and then plays what the model says sample for sample,
// sample-accurate revivals, the pedal, a knob change that rebuilds the packets while old notes ring
// on, the pair budget, and ten voices in the CPU budget. The physics tests are the JavaScript
// suite's, run on the WebAssembly (FORTE_ENGINE=wasm).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <thread>
#include <vector>

#include "check.h"
#include "quantum-engine.h"

using namespace forte;
using namespace forte::quantum;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
// the packets are built on a worker thread: wait for the key's, not for a number of samples
static void waitFor(QuantumEngine &e, int key) {
  for (int i = 0; i < 5000 && !e.ready(key); i++) std::this_thread::sleep_for(std::chrono::milliseconds(1));
  CHECK(e.ready(key));
}
static std::vector<double> render(QuantumEngine &e, int n, std::vector<double> *right = nullptr) {
  std::vector<double> L(n), R(n);
  for (int i = 0; i < n; i += 128) e.process(L.data() + i, R.data() + i, std::min(128, n - i));
  if (right) *right = R;
  return L;
}
static double peak(const std::vector<double> &x, int a, int b) {
  double m = 0;
  for (int i = a; i < b; i++) m = std::max(m, std::fabs(x[i]));
  return m;
}

// What quantum-model.js gives (makePacket with fMax 21600, autocorr, signalAt, and waveGrid on 40
// rows), printed to 17 digits by Node.
struct Ref {
  int key;
  PacketParams P;
  double nbar, pitch, scale;
  int pairs;
  double sumW, dc, Trev, Tsr;
  bool offBeat;
  double ac, acDeph, sig, sumPhi;
};
static const Ref REFS[] = {
  {57, {0, 0.5, true, 90, 2, 40, 2, 2}, 146.61211047137172, 219.99999999999989, 0.75000000000000000, 86, 11.175315952988875, 0.0000000000000000, 1.3333333333333333, INFINITY, false, 0.22477314998083286, 0.19272073792523658, 0.12801108471899839, -280.76036662045874},
  {60, {1, 0.5, true, 90, 2, 40, 2, 2}, 71.740349687177883, 261.62556530241380, 369.96597247880663, 92, 11.831145273518297, 0.0000000000000000, 1.3333333333333330, INFINITY, false, 0.20255062319049327, 0.16454448509837091, -0.15011544568772664, 151.44890267455540},
  {60, {2, 0.5, false, 90, 2, 44, 1.3, 0}, 44.000000000000000, 261.62556530059862, 22280548.626565751, 47, -4.7183774939771030, -0.64815232598338435, 0.11214852509005803, 3.7009013279719141, false, 0.24537587696345495, 0.27503540374864649, 0.17284926651227936, 0.51776964679682413},
  {72, {3, 0.5, true, 90, 2, 40, 2, 2}, 116.51973593465715, 523.25113120569051, 1362.8060212831208, 166, -0.79058976729780051, 0.0000000000000000, 1.3333333333333330, 348.80863213788444, false, 0.11436381766214909, 0.10866247725216523, 0.15587403127630564, 13.901428827577123},
  {48, {4, 0.5, true, 90, 2, 40, 2, 1}, 40.000000000000000, 130.81278265029931, 130.81278265029931, 14, -7.0970500654943676, 0.0000000000000000, INFINITY, INFINITY, false, 0.27850687686354625, 0.34740811744482897, -0.41983034974466377, 64.833568834115752},
  {96, {2, 0.5, true, 40, 8, 40, 2, 0}, 6000.0000000000000, 2093.0045224047890, 452088970560408.25, 93, -7.2760222245346995, -0.67204438085686047, 1.9111282430292160, 8600.0770936314730, true, 0.0083477667378653968, 0.045312023070833859, 0.42346116062908307, 0.014444303739386669},
  {36, {0, 0.5, true, 90, 2, 40, 0.6, 0}, 43.606555059955738, 65.406391325149656, 0.75000000000000000, 8, -1.5797789115881375, -0.51033022197726885, 1.3333333333333333, INFINITY, false, 0.91090558956079648, 0.80296281981555095, 0.57329438645781305, 8.8641062389537986},
  {84, {1, 0.95, true, 90, 2, 40, 4, 2}, 2421.7582336946930, 1046.5022611673337, 4679.8289062968697, 300, 24.375249256609923, 0.0000000000000000, 1.3333333333333330, INFINITY, false, 0.086685447467268931, 0.070441081330085795, 0.010550486450213043, -126.30014732359363},
};

TEST("quantum model: packets, autocorrelation, signal and eigenfunctions are the JavaScript's to the last bit, in every well") {
  for (const Ref &r : REFS) {
    const Packet pk = makePacket(r.key, r.P, 21600);
    double sw = 0;
    for (const Pair &q : pk.pairs) sw += q.w * (q.i + 1) + q.f * 1e-6;
    const WaveGrid G = waveGrid(pk.id, pk.ns, pk.E, pk.kap, pk.nbar, r.P.eta, 40);
    double sphi = 0;
    for (size_t i = 0; i < pk.ns.size(); i++) for (int j = 0; j < 40; j++) sphi += G.phi[i * 40 + j] * ((i + 1) * 0.37 + j * 0.011);
    CHECK(pk.nbar == r.nbar); CHECK(pk.pitch == r.pitch); CHECK(pk.scale == r.scale);
    CHECK((int)pk.pairs.size() == r.pairs); CHECK(sw == r.sumW); CHECK(pk.dc == r.dc);
    CHECK(pk.Trev == r.Trev); CHECK(pk.Tsr == r.Tsr); CHECK(pk.offBeat == r.offBeat);
    CHECK(autocorr(pk, 0.123) == r.ac); CHECK(autocorr(pk, 0.123, 0.5) == r.acDeph);
    CHECK(signalAt(pk, 0.0371, 2, 0.7) == r.sig);
    CHECK(sphi == r.sumPhi);
  }
}

TEST("quantum model: the textbook spectra (Airy zeros, Morse levels, the box's T_rev = 2n̄ periods) and a locked n̄ on the beat") {
  CHECK_NEAR(airyZeroC(11), 13.69148903521072, 1e-9); // A&S 10.4.94 against the tabulated a₁₁
  CHECK_NEAR(airyZeroC(10), 12.82877675286576, 1e-8);
  // the box: E′ = 2n, E″ = 2, so T_rev/T_cl = 2n̄ at a fixed n̄ (the pitch is the detector's mean
  // Bohr line, 2n + 1 near n̄, so to 1 %)
  PacketParams P;
  P.lock = false; P.nbar = 60;
  const Packet pk = makePacket(57, P);
  CHECK_NEAR(pk.Trev / pk.Tcl / 120, 1, 0.01);
  // the tempo lock: T_rev exactly beats × 60/bpm, the pitch the key's
  PacketParams L;
  for (int id : {box, morse, hydrogen, bouncer}) {
    L.potential = id;
    const Packet q = makePacket(60, L);
    CHECK(!q.offBeat);
    CHECK_NEAR(q.Trev, 2 * 60.0 / 90, 1e-12);
    CHECK_NEAR(1200 * std::log2(q.pitch / 261.6255653005986), 0, 1e-4);
  }
}

TEST("quantum: a note played before its packet is built waits for it, then plays the model sample for sample") {
  const double fs = 48000;
  auto P = defaults();
  P[p::T1] = 2; P[p::dephase] = 1 / 0.7;
  for (int det : {0, 1, 2}) {
    P[p::detector] = det;
    auto engine = std::make_unique<QuantumEngine>(fs);
    QuantumEngine &e = *engine;
    e.setParams(P.data());
    e.noteOn(60, 1); // at once: the packet is still being built on the worker (or, without threads, now)
    for (int i = 0; i < 5000 && !e.voiceCount(); i++) { render(e, 128); if (!e.voiceCount()) std::this_thread::sleep_for(std::chrono::milliseconds(1)); }
    CHECK(e.voiceCount() == 1);
    if (!e.voiceCount()) continue;
    const QuantumEngine::Voice &v = *e.voices[0];
    const int64_t c0 = v.count;
    const double gl = v.gl;
    const Packet pk = *v.pk;
    const auto L = render(e, (int)(1.4 * fs));
    for (double t : {0.003, 0.2, 0.5, 0.6667, 1.0, 1.3333}) {
      const int i = (int)jsRound(t * fs);
      const double m = 0.3 * gl * signalAt(pk, (c0 + i + 1) / fs, 2, 0.7);
      CHECK(std::fabs(L[i] - m) < 1e-9);
    }
  }
}

TEST("quantum: revivals are sample-accurate: the square well repeats its launch after T_rev = 1 s") {
  const double fs = 48000;
  auto P = defaults();
  P[p::bpm] = 120; P[p::beats] = 2; P[p::T1] = 1e9;
  auto engine = std::make_unique<QuantumEngine>(fs);
  QuantumEngine &e = *engine;
  e.setParams(P.data());
  waitFor(e, 57);
  e.noteOn(57, 1);
  const auto L = render(e, (int)(1.1 * fs));
  double err = 0, pk = 0;
  for (int i = 1000; i < 4800; i++) { err = std::max(err, std::fabs(L[i + 48000] - L[i])); pk = std::max(pk, std::fabs(L[i])); }
  CHECK(err < 1e-9 * pk + 1e-12);
}

TEST("quantum: the pedal holds released notes; lifting it quenches them, and a quenched note dies and is freed") {
  const double fs = 48000;
  auto P = defaults();
  auto engine = std::make_unique<QuantumEngine>(fs);
  QuantumEngine &e = *engine;
  e.setParams(P.data());
  waitFor(e, 60);
  e.setSustain(true);
  e.noteOn(60, 0.8);
  render(e, 4800);
  e.noteOff(60, -1);
  const auto held = render(e, 9600);
  CHECK(e.voiceCount() == 1 && !e.voices[0]->quench);
  e.setSustain(false);
  CHECK(e.voices[0]->quench);
  render(e, (int)(6 * fs)); // release 0.3 s: from 0.24 to 3e-6 in about 3.4 s
  CHECK(e.voiceCount() == 0);
  CHECK(peak(held, 4800, 9600) > 0.05);
}

TEST("quantum: a knob change rebuilds the packets; notes already sounding play on") {
  const double fs = 48000;
  auto P = defaults();
  auto engine = std::make_unique<QuantumEngine>(fs);
  QuantumEngine &e = *engine;
  e.setParams(P.data());
  waitFor(e, 64);
  e.noteOn(64, 0.8);
  render(e, 1280);
  const Packet *before = e.voices[0]->pk;
  const int n0 = (int)before->pairs.size();
  P[p::potential] = morse;
  e.setParams(P.data());
  waitFor(e, 64);
  e.noteOn(64, 0.8);
  render(e, 1280);
  CHECK(e.voiceCount() == 2);
  CHECK(e.voices[0]->pk == before && (int)e.voices[0]->pk->pairs.size() == n0); // held: not freed under it
  CHECK(e.voices[1]->pk->id == morse);
  PacketParams q;
  q.potential = morse;
  CHECK(e.voices[1]->pk->pitch == makePacket(64, q, fMaxAt(fs)).pitch);
}

TEST("quantum: all voices together sum at most 3000 pairs, the newest keeping its strongest") {
  const double fs = 48000;
  auto P = defaults();
  P[p::potential] = hydrogen; P[p::sigma] = 4; P[p::detector] = antenna; P[p::T1] = 30;
  auto engine = std::make_unique<QuantumEngine>(fs);
  QuantumEngine &e = *engine;
  e.setParams(P.data());
  e.setSustain(true);
  for (int i = 0; i < 24; i++) { waitFor(e, 48 + i); e.noteOn(48 + i, 0.8); render(e, 8 * 128); }
  int total = 0;
  for (int i = 0; i < e.voiceCount(); i++) total += e.voices[i]->active;
  CHECK(e.voiceCount() == 24 && total <= 3000 * 1.02);
  const auto &last = *e.voices[e.voiceCount() - 1], &first = *e.voices[0];
  double a = 0, s = 0;
  for (int g = 0; g < last.G; g++) for (int i = last.ga[g], q = last.gw[g]; i < last.gb[g]; i++, q++) a += last.w[q] * last.w[q];
  for (const Pair &q : last.pk->pairs) s += q.w * q.w;
  CHECK(a / s > 0.85 && last.active >= first.active);
}

TEST("CPU: ten voices at 48 kHz take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double fs = 48000;
  auto run = [&](std::vector<double> P) {
    auto engine = std::make_unique<QuantumEngine>(fs);
    QuantumEngine &e = *engine;
    e.setParams(P.data());
    for (int k : {36, 43, 48, 52, 55, 60, 64, 67, 72, 84}) { waitFor(e, k); e.noteOn(k, 0.8); }
    std::vector<float> L(128), R(128);
    for (int b = 0; b < 100; b++) e.process(L.data(), R.data(), 128);
    const auto t0 = std::chrono::steady_clock::now();
    const int blocks = (int)(4 * fs / 128);
    for (int b = 0; b < blocks; b++) e.process(L.data(), R.data(), 128);
    return std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 4;
  };
  auto P = defaults();
  P[p::T1] = 30;
  const double def = run(P);
  P[p::potential] = hydrogen; P[p::sigma] = 4; P[p::detector] = antenna;
  const double worst = run(P);
  std::printf("       10 voices: %.2f %% of a core (defaults), %.2f %% (hydrogen, σ = 4, antenna: 300 pairs each)\n", 100 * def, 100 * worst);
  CHECK(def < 0.3 && worst < 0.4); // the JavaScript suite's budget (the WebAssembly takes about twice the native time)
}

int main() { return check::run(); }
