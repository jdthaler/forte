// showers-engine.cpp — the Collider Showers' engine (showers-engine.h).

#include "showers-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"

namespace forte::showers {

constexpr double OUT_PIEZO = 0.11, OUT_ACCEL = 0.2; // the sensors' gains, to sound about as loud
constexpr double PRESS_T = 0.02;    // s: a key's pressure is followed with this time constant
constexpr double REPORT_HZ = 30;    // mode messages to the page a second
constexpr double HIT_HZ = 40;       // at most this many pile-up hits a second to the page
constexpr double SILENT = 1e-11;    // a voice whose reading's energy falls below this has finished (−110 dB)
constexpr double MODE_SILENT = 1e-16;
constexpr double STEAL_T = 0.004;   // s: a stolen voice's amplitudes fade with this time constant
constexpr double MIN_SHARE = 2e-4;  // a neighbour holding less of the shower than this is left alone
constexpr int FIRST = 21, LAST = 108; // the keys there are crystals for
constexpr double PREAMP_HZ = 20;    // the piezo preamp's high-pass, through which the static strain fades

ColliderShowersEngine::ColliderShowersEngine(double fs) : Engine(fs), rng(0x5eed1e55u) { voices.reserve(2 * kMaxVoices); }

void ColliderShowersEngine::build(Voice &v) {
  const int count = v.c.count;
  Crystal c = crystalOf(v.key, P.data(), 0.45 * fs);
  // the modes keep their amplitudes where they are the same mode (a new depth or width moves them)
  std::array<double, MAX_MODES> ar{}, ai{};
  for (int j = 0; j < c.count; j++) for (int i = 0; i < count; i++)
    if (v.c.modes[i].flex == c.modes[j].flex && v.c.modes[i].n == c.modes[j].n) { ar[j] = v.ar[i]; ai[j] = v.ai[i]; break; }
  v.c = c;
  v.ar = ar; v.ai = ai;
  for (int j = 0; j < c.count; j++) { v.w[j] = (TAU * c.modes[j].f) / fs; v.on[j] = ar[j] != 0 || ai[j] != 0; }
  const auto [l, r] = keyPan(v.key);
  v.gl = l; v.gr = r;
}

void ColliderShowersEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
  for (Voice &v : voices) build(v);
}

void ColliderShowersEngine::setSustain(bool on) {
  sustain = on;
  for (Voice &v : voices) v.damped = !v.held && !sustain;
}

ColliderShowersEngine::Voice *ColliderShowersEngine::voiceFor(int key) {
  for (Voice &x : voices) if (x.key == key && !x.stolen) return &x;
  // past kMaxVoices, the quietest voice whose key is up (or else the oldest) fades out
  int live = 0;
  Voice *victim = nullptr;
  for (Voice &x : voices) {
    if (x.stolen) continue;
    live++;
    if (!x.held && (!victim || x.level < victim->level)) victim = &x;
  }
  if (live >= kMaxVoices) {
    if (!victim) for (Voice &x : voices) if (!x.stolen) { victim = &x; break; }
    if (victim) victim->stolen = true;
  }
  if ((int)voices.size() >= 2 * kMaxVoices) { // keys faster than the fades: the oldest fading voice goes at once
    for (auto it = voices.begin(); it != voices.end(); ++it) if (it->stolen) { voices.erase(it); break; }
  }
  voices.emplace_back();
  Voice &v = voices.back();
  v.key = key;
  v.damped = !sustain;
  build(v);
  return &v;
}

// A deposit's kicks on one crystal: its share `scale` of the particle's energy (in the particle
// energy at full velocity), the heat's centroid xbar crystal widths off the axis, landing frac of a
// sample before the sample the amplitudes stand at.
void ColliderShowersEngine::kick(Voice &v, const Kicks &k, double scale, double xbar, double frac) {
  for (int j = 0; j < v.c.count; j++) {
    const Mode &m = v.c.modes[j];
    const double a = scale * (m.flex ? xbar * k.b[m.n - 1] : k.a[m.n - 1]);
    if (a == 0) continue;
    const double psi = v.w[j] * frac;
    v.ar[j] += a * std::cos(psi);
    v.ai[j] += a * std::sin(psi);
    v.on[j] = true;
    // the strain the heat leaves standing: it and the modes start the sensor's reading from zero
    v.stat -= a * m.hear;
  }
  v.done = false;
}

// A particle of `energy` GeV at `velocity` landing on key's crystal: it and its neighbours take
// their shares.
void ColliderShowersEngine::deposit(int key, const Deposit &d, double energy, double velocity, Particle kind) {
  const double slender = slenderness(P[p::depth], P[p::width]);
  const Kicks k = kicksOf(d, slender);
  for (int j = -2; j <= 2; j++) {
    const int kk = key + j;
    if (kk < FIRST || kk > LAST) continue;
    const Share s = crystalShare(P[p::offset], P[p::width], j);
    if (j != 0 && s.e < MIN_SHARE) continue;
    Voice *v = nullptr;
    for (Voice &x : voices) if (x.key == kk && !x.stolen) { v = &x; break; }
    if (!v) v = voiceFor(kk);
    kick(*v, k, velocity * s.e, s.xbar, 0);
    // what the page draws: the deposit along this crystal, per X0, as a share of the energy
    Message m;
    m.type = kShower; m.key = (int16_t)kk; m.count = 30;
    const double T = P[p::depth];
    for (int b = 0; b < PROFILE_BINS; b++) {
      double sum = 0; int n = 0;
      for (int i = (b * NZ) / PROFILE_BINS; i < ((b + 1) * NZ) / PROFILE_BINS; i++) { sum += d.q[i]; n++; }
      m.values[b] = (float)((s.e * sum) / std::max(1, n) / T);
    }
    m.values[24] = (float)(velocity * s.e * d.total());
    m.values[25] = (float)s.xbar; m.values[26] = (float)T; m.values[27] = (float)d.start;
    m.values[28] = (float)kind; m.values[29] = (float)energy;
    post(m);
  }
}

void ColliderShowersEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < FIRST || key > LAST) return;
  Voice *v = voiceFor(key);
  v->held = true; v->damped = false;
  v->toNext = 0;
  focus = key;
  const Particle kind = (Particle)(int)P[p::particle];
  const double E = velocity * P[p::energy];
  Deposit d;
  shower(d, kind, E, P[p::depth], rng);
  deposit(key, d, E, velocity, kind);
}

void ColliderShowersEngine::noteOff(int key, double) {
  for (Voice &v : voices) if (v.key == key && v.held) { v.held = false; v.damped = !sustain; }
}

void ColliderShowersEngine::pressure(double value, int key) {
  for (Voice &v : voices) if (key < 0 || key == v.key) v.pressTarget = value;
}

void ColliderShowersEngine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasParams) return;
  const double dt = n / fs, Qd = P[p::damper];
  const bool piezo = (int)P[p::sensor] == sensor_::piezo;
  const double out = piezo ? OUT_PIEZO : OUT_ACCEL, rdc = std::exp((-TAU * PREAMP_HZ) / fs);
  for (Voice &v : voices) {
    const Crystal &c = v.c;
    v.press += (v.pressTarget - v.press) * (1 - std::exp(-dt / PRESS_T));
    // each mode's turn and decay this block
    double level = 0;
    for (int j = 0; j < c.count; j++) {
      const Mode &m = c.modes[j];
      const double sig = m.sigma + (v.damped ? (std::numbers::pi * m.f) / Qd : 0) + (v.stolen ? 1 / STEAL_T : 0);
      const double g = std::exp(-sig / fs);
      v.rr[j] = g * std::cos(v.w[j]);
      v.ri[j] = g * std::sin(v.w[j]);
      const double e = v.ar[j] * v.ar[j] + v.ai[j] * v.ai[j];
      level += e * m.hear * m.hear;
      if (e * m.hear * m.hear < MODE_SILENT && e < MODE_SILENT) { v.ar[j] = v.ai[j] = 0; v.on[j] = false; }
    }
    v.level = level;
    // pile-up: while the key is held, soft photons land at random, a Poisson stream
    const double rate = v.held && !v.stolen ? P[p::pileup] + PRESSURE_RATE * v.press : 0;
    const double mean = rate > 0 ? fs / rate : 0;
    if (rate > 0 && v.toNext <= 0) v.toNext = rng.exponential(mean);
    int i0 = 0;
    while (i0 < n) {
      const bool hit = rate > 0 && v.toNext < n - i0; // one lands before the block ends
      const int i1 = hit ? i0 + (int)std::floor(v.toNext) + 1 : n;
      const double frac = hit ? i1 - i0 - v.toNext : 0;
      const double gl = out * v.gl, gr = out * v.gr;
      for (int j = 0; j < c.count; j++) {
        if (!v.on[j]) continue;
        double a = v.ar[j], b = v.ai[j];
        const double cr = v.rr[j], ci = v.ri[j], h = c.modes[j].hear, hl = gl * h, hr = gr * h;
        for (int i = i0; i < i1; i++) {
          L[i] = (float)(L[i] + hl * a); // a Float32Array's +=
          R[i] = (float)(R[i] + hr * a);
          const double t = a * cr - b * ci;
          b = a * ci + b * cr; a = t;
        }
        v.ar[j] = a; v.ai[j] = b;
      }
      if (piezo && v.stat != 0) {
        double st = v.stat;
        for (int i = i0; i < i1; i++) { L[i] = (float)(L[i] + gl * st); R[i] = (float)(R[i] + gr * st); st *= rdc; }
        v.stat = std::fabs(st) < 1e-12 ? 0 : st;
      }
      if (hit) {
        const double r = rng.uniform(), u = 1 / (1 / PILEUP_LO - r * (1 / PILEUP_LO - 1 / PILEUP_HI));
        const double x = rng.uniform() - 0.5; // anywhere on the crystal's face
        Deposit d;
        shower(d, photon, u * P[p::energy], P[p::depth], rng);
        const Share s = crystalShare(x, P[p::width], 0);
        kick(v, kicksOf(d, c.slender), u * s.e, s.xbar, frac);
        if (v.key == focus && sinceHit >= fs / HIT_HZ) {
          sinceHit = 0;
          Message m;
          m.type = kHit; m.key = (int16_t)v.key; m.count = 4;
          m.values[0] = (float)x; m.values[1] = (float)(u * s.e * d.total()); m.values[2] = (float)d.start;
          m.values[3] = (float)P[p::depth];
          post(m);
        }
        v.toNext += rng.exponential(mean);
      }
      v.toNext -= i1 - i0;
      i0 = i1;
    }
    if (!piezo) v.stat = 0;
    if (rate <= 0 && level < SILENT && std::fabs(v.stat) < 1e-6) v.done = true; // finished
  }
  sinceHit += n;
  if (focus >= 0 && (sinceReport += n) >= fs / REPORT_HZ) {
    sinceReport = 0;
    for (const Voice &v : voices) if (std::abs(v.key - focus) <= 3 && !v.stolen) report(v);
  }
  std::erase_if(voices, [](const Voice &v) { return v.done && !v.held; }); // finished voices, in place
}

// What the page draws: each mode's amplitude (its displacement over the length).
void ColliderShowersEngine::report(const Voice &v) {
  Message m;
  m.type = kModes; m.key = (int16_t)v.key; m.count = 26;
  int nl = 0, nf = 0;
  for (int j = 0; j < v.c.count; j++) {
    const Mode &md = v.c.modes[j];
    if (!md.flex && md.n <= VIEW_LONG) { m.values[md.n - 1] = (float)std::hypot(v.ar[j], v.ai[j]); nl = std::max(nl, md.n); }
    else if (md.flex) { m.values[VIEW_LONG + md.n - 1] = (float)std::hypot(v.ar[j], v.ai[j]); nf = std::max(nf, md.n); }
  }
  m.values[22] = (float)nl; m.values[23] = (float)nf;
  m.values[24] = v.held ? 1 : 0; m.values[25] = v.damped ? 1 : 0;
  post(m);
}

} // namespace forte::showers
