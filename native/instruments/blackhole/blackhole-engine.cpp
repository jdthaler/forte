// blackhole-engine.cpp — the ringdown engine (blackhole-engine.h).

#include "blackhole-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/fdlibm.h"

namespace forte::blackhole {

namespace fd = forte::fdlibm;
static constexpr double PI = 3.141592653589793, TAU = 2 * PI;
static constexpr double STEAL_TAU = 0.0015;      // a stolen voice fades out with this time constant (gone in ~10 ms)
static constexpr int VOICES_EVERY = 48 * 128;    // samples between voice counts for the page

void Voice::start(const RingdownEngine &eng, int key_, const KeyVoice &d, double vel_) {
  key = key_; vel = vel_; keyDown = true;
  const double k = eng.k;
  n = d.count;
  for (int i = 0; i < n; i++) {
    const Mode &md = d.modes[i];
    const double r = fd::exp(-md.gamma * k), th = -TAU * md.f * k;
    rr[i] = r * fd::cos(th); ri[i] = r * fd::sin(th);
    cpr[i] = md.cpr; cpi[i] = md.cpi; cxr[i] = md.cxr; cxi[i] = md.cxi;
  }
  ring = false;
  fade = 1;
  stolen = false;
  level = INFINITY; // output level estimate, for choosing a voice to steal
  // the strain rises through the merger peak rather than jumping: a raised-cosine rise over half
  // a (2,2,0) cycle removes the onset click
  rise = d.hasChirp ? 1 : 0;
  riseStep = 2 * d.info.f0 * k;
  dead = false;
  hasChirp = d.hasChirp;
  if (hasChirp) {
    c = d.chirp;
    t = 0; phi = 0; f = c.fStart; stage = 1; A = 0; xfade = 1;
    if (std::isnan(c.tc)) c.tc = (5.0 / 256) * fd::pow(c.Mc, -5.0 / 3) * fd::pow(PI * c.fStart, -8.0 / 3);
    bridge = fd::exp(-k / c.tauB);
  } else startRing(0);
}

void Voice::startRing(double phase) {
  for (int i = 0; i < n; i++) { zr[i] = fd::cos(phase); zi[i] = -fd::sin(phase); }
  ring = true;
}

void Voice::render(float *L, float *R, int ns, const RingdownEngine &eng) {
  const double k = eng.k, g = eng.master * 0.35 * vel;
  const bool mono = !eng.stereo;
  const double fadeStep = stolen ? eng.stealStep : !keyDown && eng.releaseMute ? eng.muteStep : 1;
  double peak = 0;
  for (int s = 0; s < ns; s++) {
    double hp = 0, hx = 0;
    if (hasChirp && stage < 3) {
      // inspiral: Newtonian chirp; then a short bridge to the ringdown pitch
      if (stage == 1) {
        f = c.fStart * fd::pow(std::max(1e-9, 1 - t / c.tc), -3.0 / 8);
        if (f >= c.fIsco || t >= c.tc) stage = 2;
      } else {
        f = c.f220 - (c.f220 - f) * bridge;
        // hand over: the ringdown starts with the chirp's phase (and, by construction, its
        // amplitude), so the strain is continuous
        if (f >= 0.97 * c.f220) { stage = 3; startRing(phi + c.psi); rise = 0; }
      }
      if (stage < 3) {
        phi += TAU * f * k;
        // h ∝ f^(2/3), faded in at the start (the inspiral was already under way)
        A = c.amp * std::min(1.0, fd::pow(f / c.fPk, 2.0 / 3)) * (t < c.fadeT ? 0.5 - 0.5 * fd::cos((PI * t) / c.fadeT) : 1);
        hp = A * c.cp * fd::cos(phi);
        hx = A * c.cx * fd::sin(phi);
        t += k;
      }
    }
    if (hasChirp && stage == 3 && xfade > 0) {
      // crossfade to the ringdown across half a cycle (weights sum to one)
      xfade = rise < 1 ? 0.5 + 0.5 * fd::cos(PI * rise) : 0;
      hp = xfade * A * c.cp * fd::cos(phi);
      hx = xfade * A * c.cx * fd::sin(phi);
      phi += TAU * c.f220 * k;
    }
    if (ring) {
      double rp = 0, rx = 0;
      for (int i = 0; i < n; i++) {
        const double a = zr[i], b = zi[i];
        rp += cpr[i] * a - cpi[i] * b;
        rx -= cxr[i] * b + cxi[i] * a;
        zr[i] = a * rr[i] - b * ri[i];
        zi[i] = a * ri[i] + b * rr[i];
      }
      double env = 1;
      if (rise < 1) { env = 0.5 - 0.5 * fd::cos(PI * rise); rise = std::min(1.0, rise + riseStep); }
      hp += env * rp; hx += env * rx;
    }
    fade *= fadeStep;
    hp *= g * fade; hx *= g * fade;
    if (mono) { L[s] += hp; R[s] += hp; } else { L[s] += hp; R[s] += hx; }
    const double m = std::fabs(hp) + std::fabs(hx);
    if (m > peak) peak = m;
  }
  if (ring) {
    // a mode that has died away goes to zero rather than into denormals (the WebAssembly has no
    // flush-to-zero)
    for (int i = 0; i < n; i++) if (std::fabs(zr[i]) + std::fabs(zi[i]) < 1e-100) { zr[i] = 0; zi[i] = 0; }
  }
  if (ring && (!hasChirp || stage == 3)) {
    double env = 0;
    for (int i = 0; i < n; i++) env += hypot2(zr[i], zi[i]) * (hypot2(cpr[i], cpi[i]) + hypot2(cxr[i], cxi[i]));
    level = env * g * fade;
    if (level < 1e-5 || !(peak < 1e3)) dead = true;
  } else level = hasChirp ? c.amp * g * fade : peak;
  if (stolen && fade < 1e-4) dead = true;
}

RingdownEngine::RingdownEngine(double fs) : Engine(fs), k(1 / fs) {
  stealStep = fd::exp(-k / STEAL_TAU);
  muteStep = fd::exp(-k / 0.04);
  for (int i = kPool - 1; i >= 0; i--) free_[nfree++] = &pool[i];
}

void RingdownEngine::setParams(const double *P) {
  stereo = P[p::stereo] > 0.5;
  releaseMute = P[p::releaseMute] > 0.5;
  ModelParams m;
  m.spinU = P[p::spinU]; m.massRatio = P[p::massRatio]; m.inclination = P[p::inclination]; m.t0 = P[p::t0];
  m.overtones = P[p::overtones]; m.retrograde = P[p::retrograde]; m.inspiral = P[p::inspiral] > 0.5; m.inspiralOct = P[p::inspiralOct];
  if (!(m == model)) { model = m; std::fill(std::begin(cached), std::end(cached), false); }
}

// A key's voice at the current model parameters, built once per key until they change.
const KeyVoice &RingdownEngine::voiceFor(int key) {
  if (key < KEY_LO || key > KEY_HI) { keyVoice(key, model, fs, other); return other; }
  const int i = key - KEY_LO;
  if (!cached[i]) { keyVoice(key, model, fs, cache[i]); cached[i] = true; }
  return cache[i];
}

void RingdownEngine::offer(const KeyVoice &v) { offer_ = v; hasOffer = true; }

Voice *RingdownEngine::slot() { return nfree ? free_[--nfree] : nullptr; }

void RingdownEngine::noteOn(int key, double velocity) {
  const KeyVoice &d = hasOffer ? offer_ : voiceFor(key);
  hasOffer = false;
  // over the limit: fade out the quietest voice that is not already going
  int live = 0;
  Voice *quiet = nullptr;
  for (int i = 0; i < nv; i++) {
    Voice *v = voices[i];
    if (!v->stolen) { live++; if (!quiet || v->level < quiet->level) quiet = v; }
  }
  if (live >= maxVoices && quiet) quiet->stolen = true;
  Voice *v = slot();
  if (!v) return; // never: the hard limit below keeps a slot free
  v->start(*this, key, d, velocity);
  voices[nv++] = v;
  if (nv > 2 * maxVoices) { // hard limit, never reached in practice: the oldest goes
    free_[nfree++] = voices[0];
    for (int i = 1; i < nv; i++) voices[i - 1] = voices[i];
    nv--;
  }
}

void RingdownEngine::noteOff(int key, double) {
  for (int i = 0; i < nv; i++) if (voices[i]->key == key) voices[i]->keyDown = false;
}

void RingdownEngine::allNotesOff() {
  for (int i = 0; i < nv; i++) free_[nfree++] = voices[i];
  nv = 0;
}

void RingdownEngine::process(float *L, float *R, int n) {
  std::fill(L, L + n, 0.0f);
  std::fill(R, R + n, 0.0f);
  int j = 0;
  for (int i = 0; i < nv; i++) {
    Voice *v = voices[i];
    v->render(L, R, n, *this);
    if (!v->dead) voices[j++] = v;
    else free_[nfree++] = v;
  }
  nv = j;
  if (messages && (sinceVoices += n) >= VOICES_EVERY) {
    sinceVoices = 0;
    Message m;
    m.type = msg::voices;
    m.count = 1;
    m.values[0] = (float)nv;
    post(m);
  }
}

} // namespace forte::blackhole
