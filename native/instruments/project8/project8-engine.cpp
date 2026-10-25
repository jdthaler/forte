// project8-engine.cpp — the Project 8 keyboard's engine (project8-engine.h).

#include "project8-engine.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/dsp.h"
#include "forte/fdlibm.h"

namespace forte::project8 {

constexpr double OUT = 0.25;        // the reference electron's carrier at full velocity
constexpr double NOISE = 0.06;      // the receiver's noise at 100 %, rms in its channel
constexpr double NOISE_Q = 4;       // the channel's width: a quarter of its frequency
constexpr double ESC_T = 0.002;     // s: an escaping electron's signal ends over this (the receiver's response)
constexpr double REL_T = 0.005;     // s: a trap opened (the key let go) empties over this
constexpr double STEAL_T = 0.005;   // s: a stolen voice fades with this time constant
constexpr double BEND_T = 0.01;     // s: the field follows the pitch wheel with this time constant
constexpr double SILENT = 1e-4;     // a voice faded to this (−80 dB) is over
constexpr double FRAME_T = 1.0 / 30; // s: how often the page hears every voice's state
constexpr int FIRST = 21, LAST = 108;
constexpr int CB = 32;              // samples per control step

Project8Engine::Project8Engine(double fs) : Engine(fs), rng(0x8c4e5u) { voices.reserve(2 * kMaxVoices); }

void Project8Engine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
}

void Project8Engine::bend(double value) { wheelTarget = fdlibm::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12); }

int Project8Engine::voiceCount() const {
  int n = 0;
  for (const Voice &v : voices) n += !v.stolen && !v.done;
  return n;
}

// The reference electron, whose start is the key's note: the source's own energy, or the
// endpoint for tritium (each tritium electron is sharp of it by what its neutrino took).
static double referenceEnergy(const double *P) {
  switch ((int)P[p::source]) {
    case source_::tritium: return T2_ENDPOINT;
    case source_::energy: return P[p::energy] * 1000;
    default: return KR_K;
  }
}

// The receiver's amplitudes for the electron now: the waveguide's carrier, ∝ √P ∝ u⊥; the antennas'
// harmonics n β⊥ J′ₙ(nβ⊥) × ω (Schott, seen side-on), those under 0.45 fs at angular step w a
// sample. Both relative to the reference electron's fundamental at 90°.
void Project8Engine::amplitudes(const Voice &v, std::array<double, MAX_HARMONICS> &a, int &nh, double w) const {
  const Electron &e = v.e;
  if ((int)P[p::receiver] == receiver_::guide) {
    a[0] = e.uPerp() * v.aRef;
    nh = 1;
    return;
  }
  const double b = e.betaPerp(), g = e.gamma();
  const int most = pick(MAX_HARMONICS, 6, 3); // Quality: fewer harmonics
  nh = 0;
  for (int n = 1; n <= most; n++) {
    if (n * w >= 0.45 * TAU) break;
    a[n - 1] = sideOn(n, b) / g * v.aRef;
    nh = n;
    if (a[n - 1] < 1e-4 * a[0]) break;
  }
  if (nh == 0) { a[0] = 0; nh = 1; }
}

void Project8Engine::start(Voice &v, int key, double velocity) {
  v = Voice{};
  v.key = key; v.vel = velocity;
  std::tie(v.gl, v.gr) = keyPan(key);
  // the electron: its energy from the source, its pitch angle at random over the directions the
  // trap holds (isotropic, so cos θ uniform up to the widest held)
  v.Kref = referenceEnergy(P.data());
  const double K = (int)P[p::source] == source_::tritium ? drawTritium(rng) : v.Kref;
  v.trap.B = P[p::field];
  v.trap.delta = P[p::depth] * 1e-3 / P[p::field];
  v.trap.L = P[p::length] * 0.01;
  const double cosMax = std::sqrt(v.trap.cos2Max()), cos0 = cosMax * rng.uniform();
  v.e = Electron::of(K, cos0);
  // the key's scale: the reference electron's cyclotron frequency in this field onto the note
  v.fRef = cyclotron(v.trap.B, v.Kref);
  v.scale = keyFreq(key) * tuningOf(P.data()).ratio(key) / v.fRef;
  const double gr = 1 + v.Kref / ME_EV, ur = std::sqrt(gr * gr - 1), br = ur / gr;
  // (the antennas' harmonics add up to a pulse at most Σ aₙ high: that at full velocity is OUT)
  double sum = 0;
  for (int k = 1; k <= MAX_HARMONICS; k++) sum += sideOn(k, br);
  v.aRef = (int)P[p::receiver] == receiver_::guide ? 1 / ur : gr / sum;
  v.bendNow = wheel * expr.bendOf(key);
  v.optical = rng.exponential(1);
  v.psi = TAU * rng.uniform();
  v.dop = 0;
  if ((int)P[p::receiver] == receiver_::guide) v.dop = guideIndex(cyclotron(v.trap.B * v.bendNow, K), v.trap.L, std::sqrt(v.e.cot2())) * std::sin(v.psi);
  const double w = TAU * v.scale * cyclotron(v.trap.B * v.bendNow, K) / fs;
  amplitudes(v, v.amp, v.nh, w);
  Message m;
  m.type = kBirth; m.key = (int16_t)key; m.count = 9;
  const double fa = axialFrequency(v.trap, v.e);
  const double vals[9] = {K, cos0, cyclotron(v.trap.B, K) * 1e-9, std::sqrt(v.trap.delta), fa * v.scale, fa,
                          guideIndex(cyclotron(v.trap.B, K), v.trap.L, std::sqrt(v.e.cot2())), v.Kref, velocity};
  for (int i = 0; i < 9; i++) m.values[i] = (float)vals[i];
  post(m);
}

void Project8Engine::end(Voice &v, int reason, double at) {
  if (!v.trapped) return;
  v.trapped = false;
  Message m;
  m.type = kEnd; m.key = (int16_t)v.key; m.count = 4;
  const double vals[4] = {(double)reason, at >= 0 ? at : v.age, v.e.kinetic(), v.e.cosTheta()};
  for (int i = 0; i < 4; i++) m.values[i] = (float)vals[i];
  post(m);
}

void Project8Engine::noteOn(int key, double velocity) {
  if (!hasParams || key < FIRST || key > LAST) return;
  // a key struck again opens its trap: the electron in it leaves, a new one comes
  for (Voice &x : voices) if (x.key == key && !x.stolen) { x.stolen = true; end(x, kStolen); }
  // past kMaxVoices (fewer at Medium and Low Quality), the quietest let-go voice (or else the
  // oldest) fades out
  int live = 0;
  Voice *victim = nullptr;
  for (Voice &x : voices) {
    if (x.stolen) continue;
    live++;
    const double level = x.env * x.amp[0];
    if (!x.held && (!victim || level < victim->env * victim->amp[0])) victim = &x;
  }
  if (live >= pick(kMaxVoices, 16, 10)) { // Quality: fewer electrons heard at once
    if (!victim) for (Voice &x : voices) if (!x.stolen) { victim = &x; break; }
    if (victim) { victim->stolen = true; end(*victim, kStolen); }
  }
  if ((int)voices.size() >= 2 * kMaxVoices) {
    for (auto it = voices.begin(); it != voices.end(); ++it) if (it->stolen) { voices.erase(it); break; }
  }
  voices.emplace_back();
  start(voices.back(), key, velocity);
}

void Project8Engine::noteOff(int key, double) {
  for (Voice &v : voices) {
    if (v.key != key || !v.held || v.stolen) continue;
    v.held = false;
    if (!sustain) end(v, kReleased); // the trap opens
  }
}

void Project8Engine::setSustain(bool on) {
  sustain = on;
  if (!on) for (Voice &v : voices) if (!v.held && !v.stolen) end(v, kReleased);
}

void Project8Engine::play(Voice &v, float *L, float *R, int n) {
  const double dt = n / fs;
  const bool guide = (int)P[p::receiver] == receiver_::guide;
  // the field: the knob, the pitch wheel and the note's own bend
  v.bendNow = glideTo(v.bendNow, wheel * expr.bendOf(v.key), dt, BEND_T);
  const double B = v.trap.B * v.bendNow, tau = coolingTime(B);
  // the electron: radiation, then the gas, then whether the trap still holds it
  v.age += dt; // (to the end of this step, where its collisions and escape are counted)
  if (v.trapped) {
    v.e.cool(dt, tau);
    // the gas: the step's optical depth, each collision where the depth to the next runs out
    const double depth = collisionRate(expr.slideOr(v.key, P[p::gas]), v.e.kinetic()) * dt, t0 = v.age - dt;
    double used = 0;
    while (v.trapped && v.optical <= depth - used) {
      used += v.optical;
      const double at = t0 + dt * used / depth;
      double c = v.e.cosTheta();
      const double K = v.e.kinetic();
      const Collision col = collide(rng, K, c);
      const double K1 = std::max(1.0, K - col.loss);
      v.e = Electron::of(K1, c);
      const bool out = c * c >= v.trap.cos2Max();
      Message m;
      m.type = kCollision; m.key = (int16_t)v.key; m.count = 7;
      const double vals[7] = {col.elastic ? 1.0 : 0.0, col.loss, col.angle, c, out ? 1.0 : 0.0, K1, at};
      for (int i = 0; i < 7; i++) m.values[i] = (float)vals[i];
      post(m);
      if (out) end(v, kKnockedOut, at);
      v.optical = rng.exponential(1);
    }
    if (v.trapped) v.optical -= depth - used;
    if (v.trapped && v.e.cot2() >= v.trap.delta) end(v, kRadiatedOut);
  }
  // the phase over this step: the carrier in the trap's field, f (1 + cot²θ sin²ψ), integrated
  // exactly over the bounce, and the Doppler shift h sin ψ along the waveguide
  const double cot2 = std::min(v.trap.delta, v.e.cot2()), fr = gyro() * B / v.e.gamma();
  const double wa = TAU * v.scale * axialFrequency(v.trap, v.e); // ω_a, in the note's scale (v⊥ / L: the field leaves it alone)
  const double psi1 = v.psi + wa * dt;
  const double sin2int = wa > 0 ? dt / 2 - (std::sin(2 * psi1) - std::sin(2 * v.psi)) / (4 * wa) : dt / 2;
  const double dphi = TAU * v.scale * fr * (dt + cot2 * sin2int);
  const double dop1 = guide ? guideIndex(fr * (1 + cot2 / 2), v.trap.L, std::sqrt(cot2)) * std::sin(psi1) : 0;
  const double w = (dphi + (dop1 - v.dop)) / n; // radians a sample
  v.psi = std::fmod(psi1, TAU); v.dop = guide ? dop1 : 0;
  // the receiver: the amplitudes now, faded as the electron leaves, the trap opens or the voice is stolen
  std::array<double, MAX_HARMONICS> a1{};
  int nh = 1;
  if (v.trapped || v.env > SILENT) amplitudes(v, a1, nh, std::fabs(w));
  if (!v.trapped) v.env *= std::exp(-dt / ESC_T);
  if (v.stolen) v.rel *= std::exp(-dt / STEAL_T);
  else if (!v.held && !sustain) v.rel *= std::exp(-dt / REL_T);
  const double g0 = OUT * v.vel;
  std::array<double, MAX_HARMONICS> a0 = v.amp, da{};
  const int nmax = std::max(nh, v.nh);
  for (int k = 0; k < nmax; k++) { if (k >= nh) a1[k] = 0; if (k >= v.nh) a0[k] = 0; da[k] = (a1[k] - a0[k]) / n; }
  // the noise channel: a band-pass around the carrier, its width a quarter of it
  const double noise = P[p::noise] * NOISE;
  double b0 = 0, na1 = 0, na2 = 0, ngain = 0;
  if (noise > 0) {
    const double f = std::min(0.45 * fs, std::fabs(w) * fs / TAU), w0 = TAU * f / fs, al = std::sin(w0) / (2 * NOISE_Q), a0n = 1 + al;
    b0 = al / a0n; na1 = -2 * std::cos(w0) / a0n; na2 = (1 - al) / a0n;
    ngain = noise * std::sqrt(NOISE_Q * fs / (std::numbers::pi * std::max(f, 1.0))); // the channel's rms is `noise` (its noise bandwidth π f / 2Q), whatever its width
  }
  const double cw = std::cos(w), sw = std::sin(w);
  double zr = v.zr, zi = v.zi, env = v.env, rel = v.rel;
  std::array<double, MAX_HARMONICS> a = a0;
  for (int i = 0; i < n; i++) {
    // sin nΦ by the Chebyshev recurrence from sin Φ and cos Φ
    double s = 0, sPrev = 0, sCur = zi;
    const double c2 = 2 * zr;
    for (int k = 0; k < nmax; k++) {
      s += a[k] * sCur;
      const double sNext = c2 * sCur - sPrev;
      sPrev = sCur; sCur = sNext;
      a[k] += da[k];
    }
    double y = g0 * env * s;
    if (noise > 0) {
      const double x = ngain * rng.gauss();
      const double yn = b0 * x - b0 * v.nx2 - na1 * v.ny1 - na2 * v.ny2;
      v.nx2 = v.nx1; v.nx1 = x; v.ny2 = v.ny1; v.ny1 = yn;
      y += yn;
    }
    y *= rel;
    L[i] = (float)(L[i] + v.gl * y);
    R[i] = (float)(R[i] + v.gr * y);
    const double t = zr * cw - zi * sw; zi = zr * sw + zi * cw; zr = t;
  }
  const double m = 1 / std::hypot(zr, zi);
  v.zr = zr * m; v.zi = zi * m;
  v.amp = a1; v.nh = nh;
  // over: faded out, or the electron gone with no noise to hear
  if (rel < SILENT || (!v.trapped && env < SILENT && noise <= 0)) v.done = true;
}

void Project8Engine::frame() {
  Message m;
  m.type = kFrame; m.count = 0;
  int k = 0;
  for (const Voice &v : voices) {
    if (v.stolen || v.done || !v.trapped) continue;
    const double B = v.trap.B * v.bendNow, cot2 = std::min(v.trap.delta, v.e.cot2());
    const double fr = gyro() * B / v.e.gamma() * (1 + cot2 / 2);
    const double vals[6] = {(double)v.key, (fr - v.fRef) * 1e-6, v.amp[0] * v.vel, std::sqrt(cot2 / v.trap.delta), v.psi, v.scale * axialFrequency(v.trap, v.e)};
    for (int i = 0; i < 6; i++) m.values[6 * k + i] = (float)vals[i];
    if (++k == FRAME_VOICES) { m.count = 6 * k; post(m); k = 0; }
  }
  if (k > 0 || m.count == 0) { m.count = 6 * k; post(m); }
}

void Project8Engine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasParams) return;
  for (int i0 = 0; i0 < n; i0 += CB) {
    const int m = std::min(CB, n - i0);
    wheel = glideTo(wheel, wheelTarget, m / fs, BEND_T);
    for (Voice &v : voices) if (!v.done) play(v, L + i0, R + i0, m);
  }
  std::erase_if(voices, [](const Voice &v) { return v.done; }); // finished voices, in place
  toFrame -= n / fs;
  if (toFrame <= 0 && messages) { frame(); toFrame += FRAME_T; if (toFrame <= 0) toFrame = FRAME_T; }
}

} // namespace forte::project8
