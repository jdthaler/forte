// pianet-engine.cpp — the sticky-pad piano's engine (pianet-engine.h).

#include "pianet-engine.h"

#include <algorithm>
#include <cmath>
#include <memory>

namespace forte::pianet {

// Pickup → output units (a forte note peaks ≈ 0.3). The T's e = −N dΦ/dt is the flux step per
// sample × the sample rate, so GAIN_EM is quoted per sample at EM_RATE (the 2× rate of a 48 kHz
// page) and rescaled for other rates.
constexpr double GAIN_EM = 84, GAIN_ES = 6.5, EM_RATE = 96000;
constexpr int MAX_VOICES = 40;
constexpr double FADE = 1.0 / 480; // per-sample fade for retired voices (5 ms at 96 kHz)
constexpr double GLIDE = 0.015;    // s: the pickup follows its knobs through two such lags (critically damped)
constexpr double XFADE = 0.02;     // s: switching the valve combo in or out crossfades over this
constexpr double DUCK = 0.01;      // s: a pickup switch fades out over this, then back in
constexpr double RETACK = 0.95;    // a re-pressed key fires once its dropped pad has re-tacked this much of its disc …
constexpr double RETACK_MAX = 0.15; // s … or after this long at most

// ---- a voice: one key's mechanism and its pickup -------------------------------------------

void PianetEngine::Voice::start(PianetEngine &eng, int k, Data::Ref r) {
  *this = Voice{};
  inUse = true;
  key = k; version = eng.version; ref = r;
  eng.data.acquire(r);
  p = Pluck(*r.data, eng.pad(), eng.fs2);
  pol = key % 2 ? -1 : 1;
  setPickup(eng, true);
  phiPrev = emFlux(p.y, g);
  dC = 0;
}

// Pickup position for the knobs, voiced for this key. The pickup is set relative to the free
// reed (y = 0); at rest the pad holds the tip at yRest, so that is the zero of the rail's ΔC.
void PianetEngine::Voice::setPickup(const PianetEngine &eng, bool now) {
  const double *P = eng.P.data(), v = voicing(key);
  gT = ((int)P[p::pickup] == pickup_::es ? P[p::plateGap] * v : P[p::gap] * voicingT(key)) * 1e-3;
  yeT = P[p::offset] * 1e-3 * v;
  if (now) { g = g1 = gT; ye = ye1 = yeT; }
  c0 = esCap(p.yRest, g, ye);
}

// ---- the engine ------------------------------------------------------------------------------

PianetEngine::PianetEngine(double fs)
    : Engine(fs), fs2(OS * fs),
      data([this](int key, uint64_t v) {
        const Snapshot &s = snapshots[v % snapshots.size()];
        return std::make_unique<KeyReed>(keyReed(key, s.tipMass.load(std::memory_order_relaxed), s.loss.load(std::memory_order_relaxed), fs2));
      }),
      rail(fs2), glideA(1 - std::exp(-1 / (GLIDE * fs2))), mixStep(1 / (XFADE * fs)), duckStep(1 / (DUCK * fs)),
      waitMax((int)std::round(RETACK_MAX * fs2)), toneLP(6000, fs) {
  // decimation FIR: Blackman-windowed sinc, cutoff just below the output Nyquist
  const double c = 0.23;
  double sum = 0;
  for (int i = 0; i < T; i++) {
    const double m = i - (T - 1) / 2.0, x = 2 * PI * c * m;
    fir[i] = (m == 0 ? 1 : std::sin(x) / x) * (0.42 - 0.5 * std::cos((2 * PI * i) / (T - 1)) + 0.08 * std::cos((4 * PI * i) / (T - 1)));
    sum += fir[i];
  }
  for (int i = 0; i < T; i++) fir[i] /= sum;
  coil.set(Biquad::lp, 7000, 1.2, fs2);
}

void PianetEngine::setParams(const double *in) {
  const bool first = !hasParams, rebuild = first || in[p::tipMass] != P[p::tipMass] || in[p::loss] != P[p::loss];
  for (int i = 0; i < p::count; i++) P[i] = in[i];
  hasParams = true;
  if (rebuild) { // a new version of every reed: sounding notes keep theirs, new ones get it
    version++;
    Snapshot &s = snapshots[version % snapshots.size()];
    s.tipMass.store(P[p::tipMass], std::memory_order_relaxed); s.loss.store(P[p::loss], std::memory_order_relaxed);
    data.prepare(version, KEY_LO, KEY_HI, lastKey);
  }
  const PadParams pd = pad();
  for (int i = 0; i < nVoices; i++) { voices[i]->p.setPad(pd); voices[i]->setPickup(*this); }
  if (!nVoices) { pick = (int)P[p::pickup]; duck = 1; } // nothing sounding: switch now
  if (first) mix = (int)P[p::amp] == amp_::combo ? 1 : 0;
  toneLP.set(P[p::tone], fs);
  spk[0].set(Biquad::hp, 80, 0.7, fs);
  spk[1].set(Biquad::peak, 110, 1.2, fs, 3);
  spk[2].set(Biquad::peak, 2400, 1.5, fs, 4);
  spk[3].set(Biquad::lp, 5000, 0.8, fs);
  driveK = 1 + 12 * P[p::drive] * P[p::drive]; driveN = (1 + 0.5 * P[p::drive]) / driveK;
}

void PianetEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < 0 || key > 127) return;
  lastKey = key;
  Voice *v = byKey[key];
  if (v && v->version == version) { startNote(key, velocity, v); return; }
  const Data::Ref r = data.get(key, version);
  if (!r) { // the reed is being built (a millisecond or so): the note waits for it
    for (int i = 0; i < nPending; i++) if (pending[i].key == key) { pending[i] = {key, velocity, false}; return; }
    if (nPending < (int)pending.size()) pending[nPending++] = {key, velocity, false};
    return;
  }
  if (v) v->retire(); // its reed was re-cut: the old one fades out
  Voice *fresh = nullptr;
  for (Voice &u : pool) if (!u.inUse) { fresh = &u; break; }
  if (!fresh) { byKey[key] = nullptr; return; } // every voice busy (beyond anything the stealing below lets happen)
  fresh->start(*this, key, r);
  voices[nVoices++] = fresh; byKey[key] = fresh;
  if (nVoices > MAX_VOICES) {
    Voice *victim = nullptr;
    double e = INFINITY;
    for (int i = 0; i < nVoices; i++) {
      Voice *u = voices[i];
      if (u != fresh && !u->dying && !u->p.down && u->p.energy() < e) { e = u->p.energy(); victim = u; }
    }
    if (victim) { victim->retire(); byKey[victim->key] = nullptr; }
  }
  startNote(key, velocity, fresh);
}

void PianetEngine::startNote(int, double velocity, Voice *v) {
  v->held = false; v->posted = false; v->sleep = false; v->quiet = 0;
  Pluck &p = v->p;
  if (p.down || v->pending) {
    // The pad is up (latched by the sustain catch, or a repeated note-on), so there is nothing to
    // drag. Drop it, and press again once it has landed, choked the reed and re-tacked.
    if (p.down) { p.lift(); v->wait = 0; }
    v->pending = true; v->pressVel = velocity;
  } else p.press(velocity);
}

void PianetEngine::retryPending() {
  const auto waiting = pending;
  const int n = nPending;
  nPending = 0;
  for (int i = 0; i < n; i++) {
    const Pending pd = waiting[i];
    if (!data.get(pd.key, version)) { if (nPending < (int)pending.size()) pending[nPending++] = pd; continue; }
    noteOn(pd.key, pd.velocity);
    if (pd.off) noteOff(pd.key, -1);
  }
}

void PianetEngine::noteOff(int key, double) {
  if (key < 0 || key > 127) return;
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) pending[i].off = true;
  Voice *v = byKey[key];
  if (!v) return;
  if (sustain) v->held = true;
  else { v->pending = false; v->p.lift(); v->sleep = false; }
}

void PianetEngine::setSustain(bool on) {
  sustain = on;
  if (!on) for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    if (v->held) { v->held = false; v->pending = false; v->p.lift(); v->sleep = false; }
  }
}

void PianetEngine::allNotesOff() {
  nPending = 0;
  for (int i = 0; i < nVoices; i++) voices[i]->retire();
  byKey.fill(nullptr);
}

// One block of a voice whose pickup is moving: the same as in processBlock(), with the pickup
// following its knobs smoothly (no zipper, no click).
void PianetEngine::glide(Voice &v, int n2, bool es) {
  Pluck &p = v.p;
  const double ga = glideA, gT = v.gT, yeT = v.yeT, yRest = p.yRest, pol = v.pol;
  double g = v.g, g1 = v.g1, ye = v.ye, ye1 = v.ye1, c0 = v.c0, phiPrev = v.phiPrev, fade = v.fade, dC = 0;
  p.stop = es ? INFINITY : g;
  for (int s = 0; s < n2; s++) {
    g1 += ga * (gT - g1); g += ga * (g1 - g); ye1 += ga * (yeT - ye1); ye += ga * (ye1 - ye);
    if (es) c0 = esCap(yRest, g, ye); else p.stop = g;
    const double y = p.step();
    if (v.dying) { fade -= FADE; if (fade < 0) fade = 0; }
    if (es) { dC = fade * (esCap(y, g, ye) - c0); dCs[s] += dC; }
    else { const double phi = emFlux(y, g); mono[s] += fade * pol * (phiPrev - phi); phiPrev = phi; }
  }
  if (std::fabs(gT - g) + std::fabs(gT - g1) + std::fabs(yeT - ye) + std::fabs(yeT - ye1) < 1e-9) { g = g1 = gT; ye = ye1 = yeT; c0 = esCap(yRest, g, ye); }
  v.g = g; v.g1 = g1; v.ye = ye; v.ye1 = ye1; v.c0 = c0;
  v.phiPrev = es ? emFlux(p.y, g) : phiPrev; v.fade = fade; v.dC = dC;
}

void PianetEngine::process(float *L, float *R, int n) {
  for (int at = 0; at < n; at += BLOCK_MAX) processBlock(L + at, R + at, std::min(BLOCK_MAX, n - at));
  data.audioCycle();
}

void PianetEngine::processBlock(float *L, float *R, int n) {
  const int n2 = n * OS;
  std::fill(mono.begin(), mono.begin() + n2, 0.0);
  if (!hasParams) { std::fill(L, L + n, 0.0f); std::fill(R, R + n, 0.0f); return; }
  if (nPending) retryPending();
  if (P[p::pickup] != pick && duck <= 0) pick = (int)P[p::pickup];
  const bool es = pick == pickup_::es;
  if (es) std::fill(dCs.begin(), dCs.begin() + n2, 0.0);
  for (int i = 0; i < nVoices; i++) {
    Voice &v = *voices[i];
    Pluck &p = v.p;
    if (v.pending && ((p.hv == 0 && p.F <= 0 && p.a >= RETACK * PAD.a0) || (v.wait += n2) > waitMax)) {
      v.pending = false; p.press(v.pressVel); v.sleep = false; v.quiet = 0;
    }
    const bool gliding = v.g != v.gT || v.g1 != v.gT || v.ye != v.yeT || v.ye1 != v.yeT;
    if (v.sleep && !gliding) { if (es) for (int s = 0; s < n2; s++) dCs[s] += v.dC; continue; }
    if (gliding) glide(v, n2, es);
    else {
      const double g = v.g, ye = v.ye, c0 = v.c0, pol = v.pol;
      double phiPrev = v.phiPrev, fade = v.fade, dC = 0;
      p.stop = es ? INFINITY : g; // the T's pole piece sits in the reed's path
      for (int s = 0; s < n2; s++) {
        const double y = p.step();
        if (v.dying) { fade -= FADE; if (fade < 0) fade = 0; }
        if (es) { dC = fade * (esCap(y, g, ye) - c0); dCs[s] += dC; }
        else { const double phi = emFlux(y, g); mono[s] += fade * pol * (phiPrev - phi); phiPrev = phi; }
      }
      v.phiPrev = es ? emFlux(p.y, g) : phiPrev; v.fade = fade; v.dC = dC;
    }
    if (p.released && !v.posted) {
      v.posted = true;
      Message m;
      m.type = msg::release; m.key = (int16_t)v.key; m.count = 5;
      const double r[5] = {p.rel.y, p.rel.F, p.rel.v, p.rel.t, p.rel.V};
      for (int k = 0; k < 5; k++) m.values[k] = (float)r[k];
      post(m);
    }
    // bookkeeping: retire faded voices; sleep or free reeds that have stopped
    if (v.dying && v.fade <= 0) v.dead = true;
    else if (!(std::fabs(p.y) < 1)) {
      v.dead = true;
      Message m;
      m.type = msg::error; m.key = (int16_t)v.key;
      post(m);
    } else if (p.hv == 0 && !v.pending && !(p.F > 0 && p.a > 0) && p.energy() < 1e-13) { // (a bond under tension may still be creeping)
      if (++v.quiet > 20) { if (p.down || v.held) v.sleep = true; else if (p.a > PAD.aMin * PAD.a0) v.dead = true; }
    } else v.quiet = 0;
  }
  int j = 0;
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    if (v->dead) {
      if (byKey[v->key] == v) byKey[v->key] = nullptr;
      data.release(v->ref);
      v->ref = {}; v->inUse = false;
    } else voices[j++] = v;
  }
  nVoices = j;

  // pickup rail → output, at 2×
  if (es) for (int s = 0; s < n2; s++) mono[s] = GAIN_ES * rail.step(dCs[s]);
  else {
    const double gk = (GAIN_EM * fs2) / EM_RATE; // ΔΦ per sample × fs = dΦ/dt
    for (int s = 0; s < n2; s++) mono[s] = gk * coil.run(mono[s]);
  }

  // valve drive (at 2×), decimate, tone RC, speaker, level. The combo is crossfaded in and out
  // over XFADE (its speaker filters start from rest when it comes in; the fade covers their
  // settling).
  constexpr int Th = (T - 1) >> 1;
  const double dk = driveK, dn = driveN, mixT = (int)P[p::amp] == amp_::combo ? 1 : 0;
  const bool switching = P[p::pickup] != pick, fading = mix != mixT, combo = mixT == 1 && !fading;
  if (fading && mix == 0) for (Biquad &b : spk) b.reset();
  if (combo) for (int s = 0; s < n2; s++) mono[s] = (std::tanh(dk * mono[s] + 0.2) - 0.19738) * dn;
  for (int s = 0; s < n2; s++) {
    double x2 = mono[s];
    if (fading) x2 += mix * ((std::tanh(dk * x2 + 0.2) - 0.19738) * dn - x2);
    hi = (hi + 1) & 127;
    hist[hi] = hist[hi + 128] = x2;
    if (s & 1) {
      const int b = hi + 128, e = b - T + 1;
      double a = fir[Th] * hist[b - Th];
      for (int t = 0; t < Th; t++) a += fir[t] * (hist[b - t] + hist[e + t]);
      double x = toneLP.run(a);
      if (combo) x = spk[3].run(spk[2].run(spk[1].run(spk[0].run(x))));
      else if (fading) {
        x += mix * (spk[3].run(spk[2].run(spk[1].run(spk[0].run(x)))) - x);
        mix = mixT > mix ? std::min(mixT, mix + mixStep) : std::max(mixT, mix - mixStep);
      }
      // switching pickups: duck to zero, switch, come back (no click)
      if (switching) duck = std::max(0.0, duck - duckStep);
      else if (duck < 1) duck = std::min(1.0, duck + duckStep);
      L[s >> 1] = R[s >> 1] = (float)(x * duck);
    }
  }
}

} // namespace forte::pianet
