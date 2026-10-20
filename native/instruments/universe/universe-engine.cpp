// universe-engine.cpp — the Early Universe's engine (universe-engine.h).

#include "universe-engine.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <numbers>

#include "forte/dsp.h"

namespace forte::universe {

constexpr double OUT = 0.05;        // the output's gain: a forte note peaks about 0.3
constexpr double ATTACK_S = 0.002;  // s: the first instant's ramp (the beginning is a step, which would click)
constexpr double STEAL_T = 0.005;   // s: a stolen voice fades with this time constant
constexpr double REPORT_HZ = 30;    // state messages to the page a second
constexpr int BLOCK = 32;           // samples between the amplitudes' updates (they glide between)
constexpr double PI = std::numbers::pi;
constexpr double FADE_FROM = 4 * PI, FADE_TO = 6 * PI; // the streaming fundamental's phase over which a note ends

float EarlyUniverseEngine::offerBuffer[OFFER_SIZE];

EarlyUniverseEngine::EarlyUniverseEngine(double fs)
    : Engine(fs), data([this](int, uint64_t v) -> std::unique_ptr<Universe> {
        // the page's universe, if it gave one for this version (only without threads: no race)
        if (offered && offeredVersion == v) { offeredVersion = 0; return std::move(offered); }
        if (snap.version.load(std::memory_order_acquire) != v) return nullptr;
        const Cosmology c{snap.ob.load(std::memory_order_relaxed), snap.oc.load(std::memory_order_relaxed),
                          snap.neff.load(std::memory_order_relaxed), snap.yp.load(std::memory_order_relaxed)};
        auto u = buildUniverse(c);
        return snap.version.load(std::memory_order_acquire) == v ? std::move(u) : nullptr;
      }) {
  voices.reserve(2 * kMaxVoices);
}

EarlyUniverseEngine::~EarlyUniverseEngine() {
  for (Voice &v : voices) data.release(v.uni);
  data.release(latest);
}

uint64_t EarlyUniverseEngine::versionOf(const double *p) const {
  uint64_t h = 1469598103934665603ull;
  for (const int i : {p::baryons, p::darkMatter, p::neutrinos, p::helium}) {
    uint64_t b;
    std::memcpy(&b, &p[i], sizeof b);
    h = (h ^ b) * 1099511628211ull;
  }
  return h | 1; // never 0, which means none
}

void EarlyUniverseEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  const uint64_t v = versionOf(P.data());
  if (!hasParams || v != version) {
    version = v;
    snap.version.store(0, std::memory_order_release);
    snap.ob.store(P[p::baryons], std::memory_order_relaxed);
    snap.oc.store(P[p::darkMatter], std::memory_order_relaxed);
    snap.neff.store(P[p::neutrinos], std::memory_order_relaxed);
    snap.yp.store(P[p::helium], std::memory_order_relaxed);
    snap.version.store(version, std::memory_order_release);
#if FORTE_THREADS
    data.prepare(version, 0, 0, 0); // built on the worker, ahead of the next note
#endif
  }
  hasParams = true;
}

bool EarlyUniverseEngine::offer(const double *cos) {
  std::array<double, p::count> q = P;
  q[p::baryons] = cos[0]; q[p::darkMatter] = cos[1]; q[p::neutrinos] = cos[2]; q[p::helium] = cos[3];
  if (!hasParams || versionOf(q.data()) != version) return false;
  auto u = std::make_unique<Universe>();
  u->c = {cos[0], cos[1], cos[2], cos[3]};
  u->tauStar = cos[4]; u->rsStar = cos[5]; u->k1 = cos[6];
  const float *t = offerBuffer;
  for (int m = 0; m < MAX_HARMONICS; m++) for (int j = 0; j < NT; j++) {
    u->sky[m][j] = t[(0 * MAX_HARMONICS + m) * NT + j];
    u->doppler[m][j] = t[(1 * MAX_HARMONICS + m) * NT + j];
    u->plasma[m][j] = t[(2 * MAX_HARMONICS + m) * NT + j];
  }
  offered = std::move(u);
  offeredVersion = version;
  return true;
}

void EarlyUniverseEngine::setSustain(bool on) {
  sustain = on;
  if (!on) for (Voice &v : voices) if (!v.held && !v.released) { v.released = true; if (!v.streaming) startStreaming(v); }
}

void EarlyUniverseEngine::allNotesOff() {
  for (Voice &v : voices) data.release(v.uni);
  voices.clear();
}

// The light goes free: from now on what is left where we listen fades as the waves stream away.
void EarlyUniverseEngine::startStreaming(Voice &v) {
  for (int m = 0; m < v.count; m++) {
    const double j = std::min(v.u, 1.0) * (NT - 1);
    const int i = std::min((int)j, NT - 2);
    const double w = j - i;
    const Universe &U = *v.uni.data;
    v.s0[m] = U.sky[m][i] + w * (U.sky[m][i + 1] - U.sky[m][i]);
    v.v0[m] = U.doppler[m][i] + w * (U.doppler[m][i + 1] - U.doppler[m][i]);
    v.p0[m] = U.plasma[m][i] + w * (U.plasma[m][i + 1] - U.plasma[m][i]);
  }
  v.streaming = true;
  v.x1 = 0;
}

// Each harmonic's amplitudes now, the cosine's (the temperature) and the sine's (the Doppler
// shift, a quarter cycle on), without the tilt and velocity.
void EarlyUniverseEngine::amplitudes(Voice &v, double *e, double *q) const {
  const Universe &U = *v.uni.data;
  const bool plasma = (int)P[p::listener] == listener_::plasma, dop = !plasma && P[p::doppler] > 0.5;
  if (!v.streaming) {
    const double j = std::min(v.u, 1.0) * (NT - 1);
    const int i = std::min((int)j, NT - 2);
    const double w = j - i;
    for (int m = 0; m < v.count; m++) {
      const auto &T = plasma ? U.plasma[m] : U.sky[m];
      e[m] = T[i] + w * (T[i + 1] - T[i]);
      q[m] = dop ? U.doppler[m][i] + w * (U.doppler[m][i + 1] - U.doppler[m][i]) : 0;
    }
    return;
  }
  // free streaming: the monopole of light that left with Θ₀ and the fluid's velocity θ is
  // Θ₀ j₀(kΔτ) − (θ/k) j₁(kΔτ); what reaches us from the sky (and its Doppler part) fades as j₀
  const double fade = v.x1 <= FADE_FROM ? 1 : v.x1 >= FADE_TO ? 0 : 0.5 + 0.5 * std::cos(PI * (v.x1 - FADE_FROM) / (FADE_TO - FADE_FROM));
  for (int m = 0; m < v.count; m++) {
    const double x = (m + 1) * v.x1, a = j0(x);
    if (plasma) { e[m] = fade * (v.p0[m] * a - std::sqrt(3.0) * v.v0[m] * j1(x)); q[m] = 0; }
    else { e[m] = fade * v.s0[m] * a; q[m] = dop ? fade * v.v0[m] * a : 0; }
  }
}

void EarlyUniverseEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < 0 || key > 127) return;
  Data::Ref r = data.get(0, version);
  if (r) {
    if (r.entry != latest.entry) { data.acquire(r); data.release(latest); latest = r; }
  } else r = latest; // still being built: the last one ready plays
  if (!r) return;
  // the same key again: the sounding note lets its light go
  for (Voice &x : voices) if (x.key == key && x.held) { x.held = false; x.released = true; if (!x.streaming) startStreaming(x); }
  // past the voice limit (fewer at Medium and Low Quality), the oldest released voice, or else
  // the oldest, fades out
  int live = 0;
  Voice *victim = nullptr;
  for (Voice &x : voices) {
    if (x.stolen) continue;
    live++;
    if (!victim || (x.released && !victim->released)) victim = &x;
  }
  if (live >= pick(kMaxVoices, 20, 12) && victim) victim->stolen = true;
  if ((int)voices.size() >= 2 * kMaxVoices) {
    auto it = std::find_if(voices.begin(), voices.end(), [](const Voice &x) { return x.stolen; });
    if (it == voices.end()) it = voices.begin();
    data.release(it->uni);
    voices.erase(it);
  }
  voices.emplace_back();
  Voice &v = voices.back();
  v.key = key;
  v.uni = r;
  data.acquire(r);
  v.velocity = velocity;
  v.f = keyFreq(key) * tuningOf(P.data()).ratio(key);
  const double top = std::min(0.45 * fs, 20000.0);
  v.count = std::clamp((int)std::floor(top / v.f), 0, pick(MAX_HARMONICS, 16, 10));
  const auto [l, rr] = keyPan(key);
  v.gl = l; v.gr = rr;
  // each wave's place along where we listen: a phase of its own, the same for a key every time
  uint32_t seed = 0x9e3779b9u ^ (uint32_t)(key * 2654435761u);
  for (int m = 0; m < v.count; m++) {
    seed = seed * 1664525u + 1013904223u;
    const double ph = TAU * (seed / 4294967296.0), w = (TAU * (m + 1) * v.f) / fs;
    v.c[m] = std::cos(ph); v.s[m] = std::sin(ph);
    v.rc[m] = std::cos(w); v.rs[m] = std::sin(w);
  }
  amplitudes(v, v.e.data(), v.q.data());
  focus = key;
  sinceReport = (int)(fs / REPORT_HZ);
}

void EarlyUniverseEngine::noteOff(int key, double) {
  for (Voice &v : voices) if (v.key == key && v.held) {
    v.held = false;
    if (!sustain) { v.released = true; if (!v.streaming) startStreaming(v); }
  }
}

void EarlyUniverseEngine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasParams) { data.audioCycle(); return; }
  const double cosmic = 1 / (std::max(0.01, P[p::recombination]) * fs); // the table's time a sample
  const double free = PI / (std::max(0.01, P[p::release]) * fs);        // the fundamental's streaming phase a sample, released
  const double tilt = 0.5 * (P[p::tilt] - 2);                           // each harmonic's share: m^((n_s − 2)/2)
  const bool plasma = (int)P[p::listener] == listener_::plasma;
  const double steal = std::exp(-1 / (STEAL_T * fs)), attackN = ATTACK_S * fs;
  std::array<double, MAX_HARMONICS> e1, q1, w;
  for (Voice &v : voices) {
    const Universe &U = *v.uni.data;
    for (int m = 0; m < v.count; m++) w[m] = OUT * v.velocity * std::pow(m + 1.0, tilt);
    for (int i0 = 0; i0 < n; i0 += BLOCK) {
      const int len = std::min(BLOCK, n - i0);
      // the clock: conformal time up to recombination, then (inside the plasma, or once let go)
      // the light streaming away
      if (!v.streaming) {
        v.u += len * cosmic;
        if (v.u >= 1) { v.u = 1; if (plasma) startStreaming(v); }
      } else {
        // k₁ Δτ: by the cosmic clock while the key is held, by the release's once it is let go
        v.x1 += len * (v.released ? free : U.k1 * U.tauStar * cosmic);
        if (v.x1 >= FADE_TO) v.done = true;
      }
      amplitudes(v, e1.data(), q1.data());
      const double gl = v.gl, gr = v.gr, inv = 1.0 / len;
      for (int m = 0; m < v.count; m++) {
        double c = v.c[m], s = v.s[m], e = v.e[m], q = v.q[m];
        const double de = (e1[m] - e) * inv, dq = (q1[m] - q) * inv, rc = v.rc[m], rs = v.rs[m], g = w[m];
        double a = v.attack, f = v.fade;
        for (int i = i0; i < i0 + len; i++) {
          e += de; q += dq;
          const double env = (a < attackN ? 0.5 - 0.5 * std::cos(PI * a / attackN) : 1) * f;
          const double y = g * env * (e * c + q * s);
          L[i] = (float)(L[i] + gl * y); // a Float32Array's +=
          R[i] = (float)(R[i] + gr * y);
          const double t = c * rc - s * rs;
          s = s * rc + c * rs; c = t;
          a += 1;
          if (v.stolen) f *= steal;
        }
        // keep the phasor on the unit circle
        const double k = 1.5 - 0.5 * (c * c + s * s);
        v.c[m] = c * k; v.s[m] = s * k; v.e[m] = e1[m]; v.q[m] = q1[m];
      }
      v.attack += len;
      if (v.stolen) { v.fade *= std::pow(steal, len); if (v.fade < 1e-4) v.done = true; }
    }
  }
  if (focus >= 0 && (sinceReport += n) >= fs / REPORT_HZ) {
    sinceReport = 0;
    for (const Voice &v : voices) if (v.key == focus && !v.stolen) { report(v); break; }
  }
  std::erase_if(voices, [this](Voice &v) { if (v.done) data.release(v.uni); return v.done; });
  data.audioCycle();
}

// What the page draws: where the struck key's universe is in its history, and its light.
void EarlyUniverseEngine::report(const Voice &v) {
  Message m;
  m.type = kState; m.key = (int16_t)v.key; m.count = 6;
  m.values[0] = (float)v.u;
  m.values[1] = (float)v.x1;
  m.values[2] = v.streaming ? 1 : 0;
  m.values[3] = v.released ? 1 : 0;
  m.values[4] = v.held ? 1 : 0;
  m.values[5] = (float)v.velocity;
  post(m);
}

} // namespace forte::universe
