// blackhole-engine.cpp — the ringdown engine (blackhole-engine.h).

#include "blackhole-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/fdlibm.h"

namespace forte::blackhole {

namespace fd = forte::fdlibm;
static constexpr double PI = 3.141592653589793, TAU = 2 * PI;
static constexpr double BEND_T = 0.02;           // s: a note's own bend glides this fast
static constexpr double STEAL_TAU = 0.0015;      // a stolen voice fades out with this time constant (gone in ~10 ms)
static constexpr double INFALL_T = 0.15;         // s between the clumps a pressed key drops in (Press)
static constexpr int VOICES_EVERY = 48 * 128;    // samples between voice counts for the page

void Voice::start(const RingdownEngine &eng, int key_, const KeyVoice &d, double vel_) {
  key = key_; vel = vel_; keyDown = true;
  const double k = eng.k;
  n = d.count;
  for (int i = 0; i < n; i++) {
    const Mode &md = d.modes[i];
    mf[i] = md.f; mg[i] = md.gamma;
    cpr[i] = md.cpr; cpi[i] = md.cpi; cxr[i] = md.cxr; cxi[i] = md.cxi;
  }
  bent = eng.bendOf(key); f0 = d.info.f0;
  ring = false;
  fade = 1;
  stolen = false;
  level = INFINITY; // output level estimate, for choosing a voice to steal
  // the strain rises through the merger peak rather than jumping: a raised-cosine rise over half
  // a (2,2,0) cycle removes the onset click
  rise = d.hasChirp ? 1 : 0;
  dead = false;
  hasChirp = d.hasChirp;
  if (hasChirp) {
    c = d.chirp;
    t = 0; phi = 0; f = c.fStart; stage = 1; A = 0; xfade = 1;
    if (std::isnan(c.tc)) c.tc = (5.0 / 256) * fd::pow(c.Mc, -5.0 / 3) * fd::pow(PI * c.fStart, -8.0 / 3);
  }
  retune(eng);
  if (!hasChirp) startRing(0);
}

void Voice::retune(const RingdownEngine &eng) {
  const double k = eng.k * bent;
  for (int i = 0; i < n; i++) {
    const double r = fd::exp(-mg[i] * k), th = -TAU * mf[i] * k;
    rr[i] = r * fd::cos(th); ri[i] = r * fd::sin(th);
  }
  riseStep = 2 * f0 * k;
  if (hasChirp) bridge = fd::exp(-k / c.tauB);
}

void Voice::startRing(double phase) {
  for (int i = 0; i < n; i++) { zr[i] = fd::cos(phase); zi[i] = -fd::sin(phase); }
  ring = true;
}

void Voice::render(float *L, float *R, int ns, const RingdownEngine &eng) {
  // the remnant's recoil (a note's own bend): the whole wave Doppler-shifted, its time too
  if (const double to = eng.bendOf(key); bent != to) { bent = glideTo(bent, to, ns * eng.k, BEND_T); retune(eng); }
  const double k = eng.k * bent, g = eng.master * 0.35 * vel;
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
  m.tuning = tuningOf(P);
  if (!(m == model)) { model = m; std::fill(std::begin(cached), std::end(cached), false); }
}

// A key's voice at the current model parameters, built once per key until they change.
const KeyVoice &RingdownEngine::voiceFor(int key) {
  if (key < KEY_LO || key > KEY_HI) { keyVoice(key, model, fs, other, &angular); return other; }
  const int i = key - KEY_LO;
  if (!cached[i]) { keyVoice(key, model, fs, cache[i], &angular); cached[i] = true; }
  return cache[i];
}

void RingdownEngine::offer(const KeyVoice &v) { offer_ = v; hasOffer = true; }

Voice *RingdownEngine::slot() { return nfree ? free_[--nfree] : nullptr; }

// A clump falling in sets the hole's modes ringing again, as the merger did, in proportion to its
// mass: up to a third of the merger's, the harder the press. A hole whose ringing has died away
// (its key still held) rings anew; one still spiralling in takes it with the merger.
void RingdownEngine::clump(int key, double x) {
  Voice *v = nullptr;
  for (int i = 0; i < nv; i++) if (voices[i]->key == key && voices[i]->keyDown && !voices[i]->stolen) v = voices[i];
  if (!v) { if (key >= 0 && key < 128 && struck[key] > 0) strike(key, struck[key] * x / 3, true); return; }
  if (!v->ring) return;
  for (int m = 0; m < v->n; m++) v->zr[m] += x / 3;
}

void RingdownEngine::noteOn(int key, double velocity) {
  if (key >= 0 && key < 128) { down[key] = true; infall[key] = 0; }
  press.reset(key);
  strike(key, velocity, false);
}

// ringOnly: a clump's ringing, with no inspiral, leaving the key's own velocity alone
void RingdownEngine::strike(int key, double velocity, bool ringOnly) {
  // a key with a slide of its own: its black hole at that spin, built here (the page's voice is
  // the knob's)
  const double u = expr.slideOr(key, NAN);
  if (u == u) { ModelParams m = model; m.spinU = std::max(0.0, u); keyVoice(key, m, fs, spun, &spunAngular); }
  const KeyVoice &d = u == u ? spun : hasOffer ? offer_ : voiceFor(key);
  if (key >= 0 && key < 128 && !ringOnly) struck[key] = velocity;
  hasOffer = false;
  // over the limit: fade out the quietest voice that is not already going
  int live = 0;
  Voice *quiet = nullptr;
  for (int i = 0; i < nv; i++) {
    Voice *v = voices[i];
    if (!v->stolen) { live++; if (!quiet || v->level < quiet->level) quiet = v; }
  }
  // (Quality: at most 24 voices at Medium and 12 at Low, or fewer if the page asks)
  if (live >= std::min(maxVoices, pick(MAX_VOICES, 24, 12)) && quiet) quiet->stolen = true;
  Voice *v = slot();
  if (!v) return; // never: the hard limit below keeps a slot free
  v->start(*this, key, d, velocity);
  if (ringOnly && v->hasChirp) { v->hasChirp = false; v->rise = 0; v->startRing(0); }
  voices[nv++] = v;
  if (nv > 2 * maxVoices) { // hard limit, never reached in practice: the oldest goes
    free_[nfree++] = voices[0];
    for (int i = 1; i < nv; i++) voices[i - 1] = voices[i];
    nv--;
  }
}

// Lift: a fast lift sets off a second, smaller merger: a black hole of half the mass rings down an
// octave up, up to half as hard as the key's last.
void RingdownEngine::noteOff(int key, double velocity) {
  for (int i = 0; i < nv; i++) if (voices[i]->key == key) voices[i]->keyDown = false;
  if (key < 0 || key > 127) return;
  down[key] = false;
  if (const double t = liftPast(velocity), vel = struck[key]; t > 0 && vel > 0) {
    struck[key] = 0;
    const int n = nv;
    strike(std::min(key + 12, KEY_HI), 0.5 * t * vel, false);
    struck[std::min(key + 12, KEY_HI)] = 0;
    if (nv > n) voices[nv - 1]->keyDown = false; // nothing holds it
  }
}

void RingdownEngine::allNotesOff() {
  for (int i = 0; i < nv; i++) free_[nfree++] = voices[i];
  nv = 0;
  for (bool &d : down) d = false;
}

void RingdownEngine::process(float *L, float *R, int n) {
  std::fill(L, L + n, 0.0f);
  std::fill(R, R + n, 0.0f);
  // Press: matter falling in. A firm press into a held key drops a clump into its black hole at
  // once, and another every INFALL_T while it stays pressed
  for (int key = 0; key < 128; key++) {
    if (!down[key]) continue;
    const double x = press.of(key);
    if (x <= 0) { infall[key] = 0; continue; }
    if (infall[key] <= 0) { clump(key, x); infall[key] += INFALL_T; if (infall[key] <= 0) infall[key] = INFALL_T; }
    infall[key] -= n * k;
  }
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
