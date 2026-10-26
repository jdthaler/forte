// abracadabra-engine.cpp — the ABRACADABRA keyboard's engine (abracadabra-engine.h).

#include "abracadabra-engine.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/dsp.h"
#include "forte/fdlibm.h"

namespace forte::abracadabra {

constexpr double TAU = 2 * std::numbers::pi;
constexpr double OUT = 0.1;          // the louder of the axion and the channel's noise, rms, at full charge
constexpr double REL_T = 0.005;      // s: a discharged key's channel closes over this
constexpr double STEAL_T = 0.005;    // s: a stolen voice fades with this time constant
constexpr double GAIN_T = 0.02;      // s: the readout's gain follows the knobs with this time constant
constexpr double SILENT = 1e-4;      // a voice faded to this (−80 dB) is over
constexpr double FRAME_T = 1.0 / 30; // s: how often the page hears every voice's state
constexpr int CB = 32;               // samples per control step, at most

AbracadabraEngine::AbracadabraEngine(double fs) : Engine(fs), rng(0xab7acu) {
  // every key's universe, drawn once: the same field every time the engine starts
  for (int k = 0; k < KEYS; k++) {
    Rng r(0x5eed0u + 7919u * (uint32_t)k);
    fields[k].f.init(r);
    for (int i = 0; i < WAVES; i++) {
      const double ph = TAU * fields[k].f.w[i].phase;
      fields[k].pr[i] = fdlibm::cos(ph); fields[k].pi[i] = fdlibm::sin(ph);
    }
  }
  baseD = std::max(1, (int)std::lround(fs / BASE_RATE));
}

void AbracadabraEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
}

double AbracadabraEngine::faOf(int key) const { return SCALE * keyFreq(key) * tuningOf(P.data()).ratio(key); }

FieldShape AbracadabraEngine::shapeOf(const Voice &v) const {
  FieldShape s;
  s.halo = v.halo; s.stream = v.stream;
  s.v0 = std::clamp(expr.slideOr(v.key, P[p::halo]), 1.0, 30000.0);
  s.vs = P[p::streamSpeed]; s.share = std::clamp(P[p::stream], 0.0, 1.0);
  return s;
}

int AbracadabraEngine::voiceCount() const {
  int n = 0;
  for (const Voice &v : voices) n += v.active && !v.closing;
  return n;
}

void AbracadabraEngine::allNotesOff() {
  for (int k = 0; k < KEYS; k++) if (voices[k].active) { voices[k].active = false; fields[k].t = now; }
}

// Carry a key's waves on to time t, each at its speed now (the speeds can have changed while the
// key was up: the halo's knob, the tuning).
void AbracadabraEngine::advance(KeyField &k, double t, const FieldShape &s, double fa) {
  const double dt = t - k.t;
  if (dt != 0) {
    for (int i = 0; i < WAVES; i++) {
      const bool stream = i >= MAX_WAVES;
      double ph = offsetOf(fa, Field::speedOf(k.f.w[i], stream, s.v0, s.vlab, s.vs)) * dt;
      ph = TAU * (ph - std::floor(ph));
      const double c = fdlibm::cos(ph), sn = fdlibm::sin(ph), r = k.pr[i];
      k.pr[i] = r * c - k.pi[i] * sn; k.pi[i] = r * sn + k.pi[i] * c;
    }
  }
  k.t = t;
}

// The waves' rotations over one control step, for the speeds and frequency now; the step is as
// long as the fastest wave allows (a sixteenth of its period), up to CB samples.
void AbracadabraEngine::build(KeyField &k, const FieldShape &s, double fa) {
  double most = 0;
  std::array<double, WAVES> d{};
  for (int i = 0; i < s.halo + s.stream; i++) {
    const int w = i < s.halo ? i : MAX_WAVES + (i - s.halo);
    d[w] = offsetOf(fa, Field::speedOf(k.f.w[w], w >= MAX_WAVES, s.v0, s.vlab, s.vs));
    most = std::max(most, d[w]);
  }
  int b = CB;
  while (b > 1 && most * b * 16 > fs) b /= 2;
  for (int i = 0; i < s.halo + s.stream; i++) {
    const int w = i < s.halo ? i : MAX_WAVES + (i - s.halo);
    double ph = d[w] * b / fs;
    ph = TAU * (ph - std::floor(ph));
    k.rr[w] = fdlibm::cos(ph); k.ri[w] = fdlibm::sin(ph);
  }
  k.built = true; k.fa = fa; k.v0 = s.v0; k.vs = s.vs; k.b = b; k.halo = s.halo; k.stream = s.stream;
}

// The field at the next control point: every wave turned by one step, then summed.
void AbracadabraEngine::step(Voice &v, KeyField &k, const FieldShape &s, double fa) {
  if (!k.built || k.fa != fa || k.v0 != s.v0 || k.vs != s.vs || k.halo != s.halo || k.stream != s.stream) build(k, s, fa);
  v.b = k.b;
  const double gh = std::sqrt((1 - s.share) / s.halo), gs = s.stream > 0 ? std::sqrt(s.share / s.stream) : 0;
  const bool renorm = ++k.steps >= 4096;
  if (renorm) k.steps = 0;
  double zr = 0, zi = 0;
  for (int i = 0; i < s.halo + s.stream; i++) {
    const int w = i < s.halo ? i : MAX_WAVES + (i - s.halo);
    double r = k.pr[w] * k.rr[w] - k.pi[w] * k.ri[w], im = k.pr[w] * k.ri[w] + k.pi[w] * k.rr[w];
    if (renorm) { const double m = 1 / std::sqrt(r * r + im * im); r *= m; im *= m; }
    k.pr[w] = r; k.pi[w] = im;
    const Field::Wave &x = k.f.w[w];
    const double g = w < MAX_WAVES ? gh : gs;
    zr += g * (x.cr * r - x.ci * im);
    zi += g * (x.cr * im + x.ci * r);
  }
  // (the waves not played now keep still; they are carried on when the voice ends)
  v.z0r = v.z1r; v.z0i = v.z1i; v.z1r = zr; v.z1i = zi;
  k.t += k.b / fs;
}

void AbracadabraEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < FIRST || key >= FIRST + KEYS) return;
  Voice &v = voices[key - FIRST];
  KeyField &k = fields[key - FIRST];
  v.held = true; v.vel = std::clamp(velocity, 0.0, 1.0); v.order = ++order;
  if (v.active) { v.closing = false; return; } // the magnet charges again from where it is
  // past kMaxVoices (fewer at Medium and Low Quality), the let-go voice with the least field (or
  // else the oldest) fades out
  int live = 0;
  Voice *victim = nullptr;
  const auto before = [](const Voice &a, const Voice &b) { // a goes first
    if (a.held != b.held) return !a.held;
    return a.held ? a.order < b.order : a.frac < b.frac;
  };
  for (Voice &x : voices) {
    if (!x.active || x.closing) continue;
    live++;
    if (!victim || before(x, *victim)) victim = &x;
  }
  if (live >= pick(kMaxVoices, 16, 10) && victim) { victim->closing = true; victim->relT = STEAL_T; } // Quality: fewer keys at once
  v = Voice{};
  v.active = true; v.held = true; v.key = key; v.vel = std::clamp(velocity, 0.0, 1.0); v.order = order;
  v.halo = pick(MAX_WAVES, 32, 16); v.stream = pick(STREAM_WAVES, 8, 4); // Quality: fewer waves in the field
  v.rel = 1; v.relT = REL_T;
  std::tie(v.gl, v.gr) = keyPan(key);
  // the field, carried on from when the key was last heard to now, and its first control step
  const FieldShape s = shapeOf(v);
  const double fa = faOf(key);
  advance(k, now, s, fa);
  k.built = false;
  // z1 is the field now: step back one step's turn by building first, then sum without turning
  build(k, s, fa);
  {
    const double gh = std::sqrt((1 - s.share) / s.halo), gs = s.stream > 0 ? std::sqrt(s.share / s.stream) : 0;
    double zr = 0, zi = 0;
    for (int i = 0; i < s.halo + s.stream; i++) {
      const int w = i < s.halo ? i : MAX_WAVES + (i - s.halo);
      const Field::Wave &x = k.f.w[w];
      const double g = w < MAX_WAVES ? gh : gs;
      zr += g * (x.cr * k.pr[w] - x.ci * k.pi[w]);
      zi += g * (x.cr * k.pi[w] + x.ci * k.pr[w]);
    }
    v.z1r = zr; v.z1i = zi;
  }
  step(v, k, s, fa);
  v.pos = 0;
  // the carrier's phase: the axion's own, from the engine's start
  double ph = keyFreq(key) * tuningOf(P.data()).ratio(key) * now;
  ph = TAU * (ph - std::floor(ph));
  v.cr = fdlibm::cos(ph); v.ci = fdlibm::sin(ph);
  if (focus != key) { focus = key; baseN = 0; baseK = 0; baseR = baseI = 0; }
}

void AbracadabraEngine::noteOff(int key, double) {
  if (key < FIRST || key >= FIRST + KEYS) return;
  voices[key - FIRST].held = false;
}

void AbracadabraEngine::setSustain(bool on) { sustain = on; }

void AbracadabraEngine::play(Voice &v, float *L, float *R, int n) {
  KeyField &k = fields[v.key - FIRST];
  const FieldShape s = shapeOf(v);
  const double fa = faOf(v.key), f = fa / SCALE;
  // the readout: the axion's flux at full charge and the channel's noise, both in μΦ₀ rms; the
  // gain puts the louder of them at OUT
  const double sig = squidFlux(P[p::coupling], RHO_DM, P[p::field], P[p::size] / 100);
  const double noise = P[p::noise], nch = channelNoise(noise, f);
  const double want = OUT / std::max({sig, nch, 1e-30});
  v.gain = v.gain == 0 ? want : glideTo(v.gain, want, n / fs, GAIN_T);
  // the magnet: charging toward the key's velocity, or discharging once the key (and the pedal) let go
  const double target = (v.held || sustain) && !v.closing ? v.vel : 0;
  const double rate = 1 / (std::max(P[p::ramp], 1e-4) * fs);
  // the channel: a band-pass around the note, Q 8 (RBJ, 0 dB at its centre), fed white noise of
  // one-sided density noise² per Hz
  const double w0 = TAU * std::min(f, 0.45 * fs) / fs, al = fdlibm::sin(w0) / (2 * CHANNEL_Q), a0 = 1 + al;
  const double b0 = al / a0, na1 = -2 * fdlibm::cos(w0) / a0, na2 = (1 - al) / a0, sigma = noise * std::sqrt(fs / 2);
  const double w = TAU * f / fs, cw = fdlibm::cos(w), sw = fdlibm::sin(w);
  const double relK = 1 - fdlibm::exp(-1 / (v.relT * fs));
  const double amp = std::sqrt(2.0) * sig;
  const bool focused = v.key == focus;
  for (int i = 0; i < n; i++) {
    if (v.pos >= v.b) { step(v, k, s, fa); v.pos = 0; }
    const double u = (double)v.pos / v.b;
    const double zr = v.z0r + (v.z1r - v.z0r) * u, zi = v.z0i + (v.z1i - v.z0i) * u;
    v.pos++;
    // the magnet's field, linear in time (a superconducting magnet charges at a steady dI/dt)
    if (v.frac < target) v.frac = std::min(target, v.frac + rate);
    else if (v.frac > target) v.frac = std::max(target, v.frac - rate);
    // the flux: Re(z e^{iωt}) of the field, √2 so its rms is sig at full charge
    double y = amp * v.frac * (zr * v.cr - zi * v.ci);
    if (noise > 0) {
      const double x = sigma * rng.quick();
      const double yn = b0 * x - b0 * v.nx2 - na1 * v.ny1 - na2 * v.ny2;
      v.nx2 = v.nx1; v.nx1 = x; v.ny2 = v.ny1; v.ny1 = yn;
      y += yn;
    }
    if (focused) {
      baseR += y * v.cr; baseI -= y * v.ci;
      if (++baseK == baseD) {
        base[2 * baseN] = (float)(2 * baseR / baseD); base[2 * baseN + 1] = (float)(2 * baseI / baseD);
        baseR = baseI = 0; baseK = 0;
        if (++baseN == BASE_SAMPLES) {
          Message m;
          m.type = kBase; m.key = (int16_t)v.key; m.count = 2 * BASE_SAMPLES + 1;
          for (int j = 0; j < 2 * BASE_SAMPLES; j++) m.values[j] = base[j];
          m.values[2 * BASE_SAMPLES] = (float)(fs / baseD);
          post(m);
          baseN = 0;
        }
      }
    }
    const double out = y * v.gain * v.rel;
    L[i] = (float)(L[i] + v.gl * out);
    R[i] = (float)(R[i] + v.gr * out);
    const double t = v.cr * cw - v.ci * sw; v.ci = v.cr * sw + v.ci * cw; v.cr = t;
    // the channel closes once the magnet is empty, or when the voice is stolen
    if (v.frac <= 0 && target <= 0 && !v.closing) { v.closing = true; v.relT = REL_T; }
    v.rel += relK * ((v.closing ? 0 : 1) - v.rel);
  }
  const double m = 1 / std::sqrt(v.cr * v.cr + v.ci * v.ci);
  v.cr *= m; v.ci *= m;
  if (v.closing && v.rel < SILENT) {
    v.active = false;
    // the waves stay where the field is now (those a lower Quality left out stay where they were)
    const double back = (v.b - v.pos) / fs; // k.t runs to the end of the current step
    advance(k, k.t - back, s, fa);
    if (focus == v.key) focus = -1;
  }
}

void AbracadabraEngine::frame() {
  Message m;
  m.type = kFrame; m.count = 0;
  int c = 0;
  const double sig = squidFlux(P[p::coupling], RHO_DM, P[p::field], P[p::size] / 100);
  for (const Voice &v : voices) {
    if (!v.active || v.closing) continue;
    const double vals[5] = {(double)v.key, v.frac, std::sqrt(v.z1r * v.z1r + v.z1i * v.z1i), sig * v.frac, channelNoise(P[p::noise], faOf(v.key) / SCALE)};
    for (int i = 0; i < 5; i++) m.values[5 * c + i] = (float)vals[i];
    if (++c == FRAME_VOICES) { m.count = 5 * c; post(m); c = 0; }
  }
  if (c > 0 || m.count == 0) { m.count = 5 * c; post(m); }
}

void AbracadabraEngine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasParams) return;
  for (int i0 = 0; i0 < n; i0 += CB) {
    const int m = std::min(CB, n - i0);
    for (Voice &v : voices) if (v.active) play(v, L + i0, R + i0, m);
    now += m / fs;
  }
  toFrame -= n / fs;
  if (toFrame <= 0 && messages) { frame(); toFrame += FRAME_T; if (toFrame <= 0) toFrame = FRAME_T; }
}

} // namespace forte::abracadabra
