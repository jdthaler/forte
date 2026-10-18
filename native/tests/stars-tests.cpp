// stars-tests.cpp — the Star Keyboard in C++: V8's tan, log1p, log2 and log10, every key's star
// and the engine's sound against the retired JavaScript's to the last bit, a note that waits for its star
// to be built (forte/background.h), the views' messages, a flood of notes, any block length, and
// ten stars within the CPU budget. The physics tests are the JavaScript suite's, run on the
// WebAssembly (node test/stars-tests.mjs).

#include <chrono>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <thread>
#include <vector>

#include "check.h"
#include "forte/fdlibm.h"
#include "forte/queue.h"
#include "stars-engine.h"

using namespace forte;
using namespace forte::stars;

static std::vector<double> defaults() {
  std::vector<double> P(p::count);
  for (int i = 0; i < p::count; i++) P[i] = kParams[i].def;
  return P;
}
// wait (giving the worker time) until a key's star is built
static bool waitFor(StarEngine &e, int key) {
  for (int i = 0; i < 4000 && !e.ready(key); i++) std::this_thread::sleep_for(std::chrono::milliseconds(1));
  return e.ready(key);
}
static bool render(StarEngine &e, double sec, int block = 128, double *peak = nullptr) {
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

// What V8 gives (Node 22): x, Math.tan(x), Math.log1p(|x|), Math.log2(|x|), Math.log10(|x|)
static const double MATH[][5] = {
  {0.29999999999999999, 0.30933624960962325, 0.26236426446749106, -1.7369655941662063, -0.52287874528033762},
  {1.1000000000000001, 1.9647596572486523, 0.74193734472937733, 0.13750352374993502, 0.041392685158225070},
  {2.7000000000000002, -0.47272762910303728, 1.3083328196501789, 1.4329594072761063, 0.43136376415898736},
  {-4.2000000000000002, -1.7777797745088417, 1.6486586255873816, 2.0703893278913981, 0.62324929039790045},
  {13.369999999999999, 1.0371437355220769, 2.6651427000909336, 3.7409275603186281, 1.1261314072619844},
  {61.500000000000000, -4.1051415023203797, 4.1351665567423561, 5.9425145053392399, 1.7888751157754168},
  {0.000010000000000000001, 0.000010000000000333334, 0.0000099999500003333319, -16.609640474436812, -5},
  {0.78500000000000003, 0.99920399010504268, 0.57941841523160242, -0.34923544088309766, -0.10513034325474745},
  {1000, 1.4703241557027185, 6.9087547793152204, 9.9657842846620870, 3},
};
TEST("stars: V8's tan, log1p, log2 and log10 (fdlibm), to the last bit") {
  for (const auto &v : MATH) {
    const double a = std::fabs(v[0]);
    CHECK(fdlibm::tan(v[0]) == v[1] && fdlibm::log1p(a) == v[2] && fdlibm::log2(a) == v[3] && fdlibm::log10(a) == v[4]);
  }
  CHECK(fdlibm::log10(100) == 2 && fdlibm::log2(0.25) == -2 && fdlibm::log1p(0) == 0 && fdlibm::tan(0) == 0);
}

// What the JavaScript model gave: family, mass, speed-up, key; N, f[0], f[N−1], Σ p·f, the heard
// pitch, T_eff and R of the star
struct StarVector { int family; double mass, speedup; int key, N; double f0, fN, pf, pitch, T, R; };
static const StarVector STARS[] = {
  {0, 1, 510800, 36, 340, 37.154634828658999, 97.501219622811917, 334.26998915835344, 65.406394551810138, 4810.6640360663132, 5.1067894026182348},
  {0, 1, 510800, 60, 230, 144.01235278034667, 382.55166686873514, 1335.1905233708403, 261.62691097437107, 4954.9885867515368, 2.5393945071583484},
  {0, 1, 510800, 91, 225, 1005.3113245333097, 2141.0824971651241, 7945.0814619129978, 1567.9816478884445, 5776.9899630324371, 0.99998589174609487},
  {0, 1.4500000000000000, 777000, 50, 340, 72.266883531658237, 218.92318306136551, 752.42559346854966, 146.83238572007073, 5070.6976458495028, 4.9985288969212638},
  {0, 0.90000000000000002, 350000, 96, 260, 1379.1403685998530, 2822.6683815451888, 10627.048584554004, 2093.0044715115810, 4239.7947063618030, 0.64358741032536781},
  {1, 1, 510800, 57, 17, 220, 305.89702483247964, 329.89667773640497, 220, 7500, 1.0607780355066510},
};
TEST("stars: every key's star (the track's tuning, mixed modes, δ Scuti) is stars-model.js's, to the last bit") {
  for (const StarVector &v : STARS) {
    const Star d = keyStar(v.key, {v.family, v.mass, v.speedup});
    double pf = 0;
    for (int i = 0; i < d.N; i++) pf += d.p[i] * d.f[i];
    CHECK(d.N == v.N && d.f[0] == v.f0 && d.f[d.N - 1] == v.fN && pf == v.pf && d.pitch == v.pitch && d.star.T == v.T && d.star.R == v.R);
  }
}

// What the JavaScript engine played (48 kHz, 128-sample blocks): C3 at 0.8 and G4 at 0.6; the pedal at block
// 60, C3 up at 80; rotation × 12 and damping × 2 at 100; aftertouch 0.5 on G4 at 150; pedal and G4
// up at 200. Every 997th sample of L and R, and Σ|L| + |R| over 375 blocks.
static const double SUM = 2069.8530032111507;
static const double SAMPLES[] = {
  0.0031807452905923128, 0.0035840515047311783, 0.0034213524777442217, 0.0041182199493050575, -0.013686468824744225, -0.011303255334496498, -0.0080794403329491615, -0.0041916999034583569, 0.018340695649385452, 0.022037591785192490, 0.0044040880165994167, 0.0081406841054558754, -0.0034119298215955496, 0.0029840965289622545, -0.024281041696667671, -0.030058629810810089, -0.018621716648340225, -0.018884858116507530, 0.016107281669974327, 0.018808607012033463, -0.090154193341732025, -0.059084992855787277, -0.016965536400675774, -0.012444079853594303, -0.042858738452196121, -0.039794608950614929, 0.014503122307360172, 0.016046959906816483, -0.049288481473922729, -0.037262499332427979, 0.071078702807426453, 0.052350629121065140, -0.055672619491815567, -0.058796182274818420, -0.0011405751574784517, -0.0052031348459422588, 0.0058651850558817387, -0.0069451490417122841, -0.062952637672424316, -0.038536116480827332, -0.022654671221971512, -0.017638670280575752, 0.015386695042252541, 0.025643365457653999, -0.010444011539220810, -0.019568802788853645, 0.019860049709677696, 0.0043563605286180973, -0.013424147851765156, -0.017596751451492310, 0.0010759106371551752, -0.0034599825739860535, -0.035738874226808548, -0.035350762307643890, 0.029649121686816216, 0.029128408059477806, 0.020710937678813934, 0.013565073721110821, 0.084960386157035828, 0.049408458173274994, 0.022050954401493073, 0.0030665055382996798, 0.030639894306659698, 0.022107908502221107, -0.062485728412866592, -0.028229806572198868, 0.0089167058467864990, -0.0034582419320940971, 0.058024432510137558, 0.047206826508045197, 0.028982935473322868, 0.018182063475251198, -0.026240134611725807, -0.018496360629796982, -0.0017432721797376871, 0.017097568139433861, 0.082609213888645172, 0.065660461783409119, 0.091752067208290100, 0.071278035640716553, 0.037220574915409088, 0.031145570799708366, -0.011014892719686031, 0.0048506767489016056, -0.00025435810675844550, -0.0022257117088884115, -0.0019144023535773158, 0.00094122282462194562, 0.058568965643644333, 0.034948382526636124, 0.029006406664848328, 0.018314884975552559, -0.051270734518766403, -0.040686313062906265, 0.0036611994728446007, 0.015557013452053070, -0.049181871116161346, -0.021982062608003616,
};
TEST("stars: the engine plays what stars-engine.js plays, sample for sample (its seeded convection, flare and warm-up)") {
  auto e = std::make_unique<StarEngine>(48000);
  auto P = defaults();
  e->setParams(P.data());
  CHECK(waitFor(*e, 48) && waitFor(*e, 67)); // the JavaScript built a star at once; here the worker does
  std::vector<float> L(128), R(128);
  std::vector<double> got;
  double sum = 0;
  for (int b = 0; b < 375; b++) {
    if (b == 0) { e->noteOn(48, 0.8); e->noteOn(67, 0.6); }
    if (b == 60) e->setSustain(true);
    if (b == 80) e->noteOff(48, -1);
    if (b == 100) { auto Q = P; Q[p::spin] = 12; Q[p::damping] = 2; e->setParams(Q.data()); }
    if (b == 150) e->pressure(0.5, 67);
    if (b == 200) { e->setSustain(false); e->noteOff(67, -1); }
    e->process(L.data(), R.data(), 128);
    for (int i = 0; i < 128; i++) { sum += std::fabs((double)L[i]) + std::fabs((double)R[i]); if ((b * 128 + i) % 997 == 0) { got.push_back(L[i]); got.push_back(R[i]); } }
  }
  CHECK(got.size() == std::size(SAMPLES));
  int same = 0;
  for (size_t i = 0; i < got.size() && i < std::size(SAMPLES); i++) same += got[i] == SAMPLES[i];
  CHECK(same == (int)std::size(SAMPLES));
  CHECK(sum == SUM);
}

TEST("stars: a note waits for its star to be built; a new mass builds every key again, and a key pressed again plays the new star while the old one fades") {
  auto e = std::make_unique<StarEngine>(48000);
  auto P = defaults();
  e->setParams(P.data());
  e->noteOn(40, 0.8); // a red giant: some milliseconds
  for (int i = 0; i < 4000 && e->voiceCount() < 1; i++) { render(*e, 128 / 48000.0); std::this_thread::sleep_for(std::chrono::milliseconds(1)); }
  CHECK(e->voiceCount() == 1 && e->byKey[40] && e->byKey[40]->held);
  P[p::mass] = 1.5;
  e->setParams(P.data());
  CHECK(waitFor(*e, 40));
  const StarEngine::Voice *old = e->byKey[40];
  const int N = old->N;
  e->noteOn(40, 0.8);
  CHECK(e->voiceCount() == 2 && old->fading && e->byKey[40] != old && e->byKey[40]->N != N);
  render(*e, 0.2);
  CHECK(e->voiceCount() == 1);
}

TEST("stars: the views' messages: every 0.06 s the focus star's amplitudes in parts of 30, its summary last") {
  auto e = std::make_unique<StarEngine>(48000);
  SpscQueue<Message> q(1024);
  e->messages = &q;
  auto P = defaults();
  e->setParams(P.data());
  CHECK(waitFor(*e, 60));
  e->noteOn(60, 0.7);
  render(*e, 0.5);
  Message m;
  int parts = 0, sums = 0, N = 0, next = 0;
  bool ordered = true;
  while (q.pop(m)) {
    if (m.type == msg::ampsPart) { ordered = ordered && m.key == next; next += m.count; parts++; }
    else if (m.type == msg::amps) {
      N = (int)m.values[0];
      ordered = ordered && next == N && m.key == 60 && m.values[1] > 0 && m.values[2] == 1 && m.values[3] == 0;
      next = 0; sums++;
    }
  }
  CHECK(N == e->byKey[60]->N && ordered);
  CHECK(sums >= 7 && sums <= 9 && parts == sums * ((N + 29) / 30));
}

TEST("stars: a flood of notes stays within the pool; then each note fades the quietest older star until 14 sound; aftertouch drives harder; Panic fades every star") {
  auto e = std::make_unique<StarEngine>(48000);
  auto P = defaults();
  P[p::damping] = 10;
  e->setParams(P.data());
  for (int k = KEY_LO; k <= KEY_HI; k++) CHECK(waitFor(*e, k));
  for (int round = 0; round < 3; round++)
    for (int k = KEY_LO; k <= KEY_HI; k++) { e->noteOn(k, 0.6); if (k % 4 == 0) render(*e, 128 / 48000.0); }
  CHECK(e->voiceCount() <= StarEngine::POOL);
  CHECK(render(*e, 0.3));
  const auto live = [&] { int n = 0; for (int i = 0; i < e->voiceCount(); i++) n += !e->voices[i]->fading; return n; };
  CHECK(live() > 14); // all pressed within 50 ms of each other: none could be stolen
  for (int i = 0, k = KEY_LO; i < 200 && live() > 14; i++, k = k == KEY_HI ? KEY_LO : k + 1)
    if (e->byKey[k] && !e->byKey[k]->fading) { e->noteOn(k, 0.6); render(*e, 0.06); } // (a star just pressed is not stolen)
  CHECK(live() == 14);
  e->pressure(1, -1);
  for (int i = 0; i < e->voiceCount(); i++) CHECK(e->voices[i]->pressure == 2);
  e->allNotesOff();
  render(*e, 0.1);
  CHECK(e->voiceCount() == 0);
}

TEST("stars: any block length (1 to 4096 samples) at 44.1 to 192 kHz plays without NaN, at a level near the 128-sample one") {
  for (double fs : {44100.0, 96000.0, 192000.0}) {
    double ref = 0;
    for (int block : {128, 1, 37, 1024, 4096}) {
      auto e = std::make_unique<StarEngine>(fs);
      auto P = defaults();
      e->setParams(P.data());
      CHECK(waitFor(*e, 72));
      e->noteOn(72, 1);
      double peak = 0;
      CHECK(render(*e, 0.4, block, &peak));
      if (block == 128) ref = peak;
      CHECK(peak > 0.5 * ref && peak < 2 * ref);
    }
  }
}

static double cpu(const std::vector<int> &keys) {
  const double fs = 48000;
  auto e = std::make_unique<StarEngine>(fs);
  auto P = defaults();
  e->setParams(P.data());
  for (int k : keys) waitFor(*e, k);
  for (int k : keys) e->noteOn(k, 0.8);
  std::vector<float> L(128), R(128);
  for (int b = 0; b < 40; b++) e->process(L.data(), R.data(), 128);
  const auto t0 = std::chrono::steady_clock::now();
  const int blocks = (int)(4 * fs / 128);
  for (int b = 0; b < blocks; b++) e->process(L.data(), R.data(), 128);
  return std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() / 4;
}
TEST("CPU: ten stars across the keyboard, and ten red giants (the most modes), held and driven at 48 kHz, take a small part of a core") {
  if (std::getenv("CI")) { std::printf("       (timing; skipped on CI)\n"); return; }
  const double a = cpu({36, 42, 48, 54, 60, 66, 72, 78, 84, 90}), b = cpu({36, 37, 38, 39, 40, 41, 42, 43, 44, 45});
  std::printf("       across the keyboard %.1f %% of a core; red giants %.1f %%\n", 100 * a, 100 * b);
  CHECK(a < 0.2 && b < 0.25);
}

int main() { return check::run(); }
