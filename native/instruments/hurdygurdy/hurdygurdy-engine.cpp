// hurdygurdy-engine.cpp — the hurdy-gurdy's engine (hurdygurdy-engine.h).

#include "hurdygurdy-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/fdlibm.h"

namespace forte::hurdygurdy {

constexpr double OUT = 13;
constexpr double G_DIRECT = 0.0057; // the bridge force radiated straight, above the modelled modes
constexpr double F_BODY = 4000;     // plate modes are modelled up to here
constexpr int POST_EVERY = 2048;    // samples between view updates (≈ 23 per second)
constexpr double WHEEL_LAG = 0.015; // s: the wheel's inertia against the hand
constexpr double SHOT = 0.09;       // s: the coup a hard key gives
constexpr double LIFT_TIME = 0.03;  // s: a string hooked onto or off the wheel
constexpr double BEND_T = 0.02;     // s: the pitch wheel's glide
// Low bows one chanterelle and hears it as the pair: two strings a cent or two apart half lock on
// their bridge, and add at about 0.8 of in phase.
constexpr double LOW_PAIR = 1.6;
constexpr double COTTON = 12;       // s⁻¹: the cotton's damping of a string resting on the stopped wheel (T60 ≈ 0.6 s)
// Strings that have left the wheel leave the loop once this quiet (mean v² at the wheel, m²/s²):
// High waits until about 130 dB below a bowed note, Medium and Low 80 and 70.
constexpr double QUIET[3] = {1e-14, 1e-9, 1e-8};

static int qualityOs(int id, double fs, Quality q) {
  const int os = oversample(id, fs);
  if (q == Quality::high) return os;
  if (id <= CH2) return std::max(1, q == Quality::medium ? os / 2 : os / 4);
  if (id == TROMP) return std::max(1, std::min(os, 2));
  return 1;
}

HurdyGurdyEngine::HurdyGurdyEngine(double fs) : Engine(fs), flyK(1 - fdlibm::exp(-1 / (WHEEL_LAG * fs))) {
  for (int i = 0; i < NSTR; i++) {
    const int key = i == TROMP ? 60 : SPEC[i].key; // (the trompette as low as it is tuned: C4)
    S[i] = std::make_unique<Str>(i, fs, oversample(i, fs), keyFreq(key) / 2);
  }
  const auto all = boardModes(F_BODY, 0);
  M = std::min((int)all.size(), MAX_MODES);
  for (int i = 0; i < M; i++) modes[i] = all[i];
  bowed::setFilter(mass, 4000, fs); // the bridge's mass rolls off the top
  voiced(CH1);                       // the voicing table, now rather than at the first note
}

void HurdyGurdyEngine::applyQuality() {
  applied = quality;
  for (auto &s : S) {
    const int os = qualityOs(s->id, fs, applied);
    if (os != s->os) { s->setOversample(os); s->clear(); s->active = false; }
    if (hasParams) redesign(*s);
  }
  if (hasParams) setParams(nullptr);
}

void HurdyGurdyEngine::redesign(Str &s) {
  const StringDesign d = stringDesign(s.id, Pm);
  const double Ls = s.id <= CH2 ? stopLength(melody, Pm) / bendR : d.L;
  s.design(d, loopDesign(d, Ls, Pm, s.fs));
}

void HurdyGurdyEngine::restop() {
  for (int i = CH1; i <= CH2; i++) redesign(*S[i]);
}

// (P null: only what follows from Pm again, after the Quality changed)
void HurdyGurdyEngine::setParams(const double *P) {
  if (P) {
    if (quality != applied) applyQuality();
    Pm = paramsOf(P);
    hasParams = true;
    for (auto &s : S) redesign(*s);
  }
  Fr = friction(Pm);
  zeta = contactZeta(Pm.bounce);
  const double G = bridgeG(Pm);
  for (auto &s : S) if (s->id != TROMP) kB[bridgeOf(s->id)] = (2 * G) / (1 + G * zBridge(s->id, Pm));
  for (auto &s : S) {
    kself[s->id] = s->id == TROMP ? 0 : kB[bridgeOf(s->id)] * s->Z;
    const bool on = Pm.on[s->id] && !(s->id == CH2 && applied == Quality::low); // Low: one chanterelle
    s->FT = on ? wheelForce(s->id, Pm) : 0;
  }
  if (Pm.boardEta != etaBody) buildBody(Pm.boardEta);
}

void HurdyGurdyEngine::buildBody(double eta) {
  etaBody = eta;
  for (int i = 0; i < M; i++) {
    Mode &m = modes[i];
    m.sigma = PI * m.f * eta;
    const ModeCoeffs c = bowed::modeCoeffs(m.f, m.sigma, fs);
    const double om = TAU * m.f;
    a1[i] = c.a1; a2[i] = c.a2; b0[i] = c.b;
    // mic j hears Re[w_j V]: w_r·v − w_i·(ω q) for a mode ringing at ω, as the Viola Organista's
    cLr[i] = (m.w[0][0] * fs) / 2; cLi[i] = (m.w[0][1] * fs * fs) / om;
    cRr[i] = (m.w[1][0] * fs) / 2; cRi[i] = (m.w[1][1] * fs * fs) / om;
  }
  bowed::setFilter(hp[0], Biquad::hp, F_BODY, 0.5412, fs); bowed::setFilter(hp[1], Biquad::hp, F_BODY, 1.3066, fs);
}

int HurdyGurdyEngine::topKey() const {
  for (int k = KEY_TOP; k > KEY_OPEN; k--) if (held[k]) return k;
  return KEY_OPEN;
}

void HurdyGurdyEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < KEY_OPEN || key > KEY_TOP) return;
  if (!held[key]) { held.set(key); nHeld++; }
  const int top = topKey();
  if (top != melody) { melody = top; restop(); }
  // a key struck hard: the wrist gives the crank a coup as the tangent lands
  if (velocity > 0.55) { shotA = std::min(1.0, (velocity - 0.55) / 0.45); shotAt = t; }
}

void HurdyGurdyEngine::noteOff(int key, double) {
  if (key < 0 || key > 127 || !held[key]) return;
  held.reset(key); nHeld--;
  // the next highest tangent, or open; with none held and the crank stopping, the last stays down
  // until the wheel has stopped (run)
  if (nHeld > 0 || Pm.keep || pedal) {
    const int top = topKey();
    if (top != melody) { melody = top; restop(); }
  }
}

void HurdyGurdyEngine::allNotesOff() { // Panic: the crank, every string and the board to rest
  held.reset(); nHeld = 0; pedal = false; after = 0; shotAt = -1;
  rate = 0; drive = 0; vB = 0; surge = 0;
  for (auto &s : S) { s->clear(); s->active = false; s->FN = 0; s->idle = 0; }
  chien = Chien{};
  q1.fill(0); q2.fill(0); bodyE = 0;
  hp[0].reset(); hp[1].reset(); mass.y = 0; dl.fill(0);
  if (melody != KEY_OPEN && hasParams) { melody = KEY_OPEN; restop(); }
}

void HurdyGurdyEngine::pressure(double value, int) { after = std::clamp(value, 0.0, 1.0); }

void HurdyGurdyEngine::bend(double value) { bendTo = fdlibm::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12); }

int HurdyGurdyEngine::voiceCount() const { int n = 0; for (auto &s : S) if (s->active && s->FN > 0) n++; return n; }

void HurdyGurdyEngine::process(float *L, float *R, int n) {
  if (quality != applied) applyQuality();
  for (int at = 0; at < n; at += 128) {
    const int m = std::min(128, n - at);
    if (hasParams && bendR != bendTo) { // the pitch wheel glides; the chanterelles are restopped each block
      bendR += (bendTo - bendR) * (1 - fdlibm::exp(-m / (BEND_T * fs)));
      if (std::fabs(bendR - bendTo) < 1e-9) bendR = bendTo;
      restop();
    }
    run(L + at, R + at, m);
  }
}

void HurdyGurdyEngine::run(float *Lo, float *Ro, int n) {
  if (!hasParams) { for (int i = 0; i < n; i++) Lo[i] = Ro[i] = 0; t += n; return; }
  running = nHeld > 0 || Pm.keep || pedal;
  // the hand has stopped the wheel: the last tangent lets go
  if (!running && drive == 0 && rate < 0.01 && melody != KEY_OPEN) { melody = KEY_OPEN; restop(); }
  // the strings the wheel is bowing join the loop (and those it has left, once quiet, go: retire)
  const double slow = std::clamp(1 - rate / (0.1 * Pm.crank), 0.0, 1.0); // 1: the wheel has (nearly) stopped
  for (auto &s : S) {
    const bool wants = (s->FT > 0 || s->FN > 0) && (running || rate > 1e-4);
    if (wants && !s->active) { s->clear(); s->active = true; s->idle = 0; }
    s->setDamper(s->FN > 0 ? COTTON * slow : 0);
  }
  if (!running && drive == 0 && rate < 1e-6 && bodyE < 1e-18) {
    bool any = false;
    for (auto &s : S) any |= s->active;
    if (!any) { for (int i = 0; i < n; i++) Lo[i] = Ro[i] = 0; t += n; rate = 0; vB = 0; return; }
  }
  const double up = running ? 1 / (Pm.start * fs) : 0, down = running ? 0 : 3 / (Pm.start * fs);
  const int N = Pm.coups;
  Str &tr = *S[TROMP];
  double dF[NSTR];
  for (auto &s : S) dF[s->id] = wheelForce(s->id, Pm) / (LIFT_TIME * fs);
  const bool lowOne = applied == Quality::low; // one chanterelle, heard as two
  for (int i = 0; i < n; i++) {
    // the crank
    drive = running ? std::min(1.0, drive + up) : std::max(0.0, drive - down);
    double sg = pedal ? 1 : after;
    if (N > 0 && running) { const double u = phase * N; sg = std::max(sg, coupShape(u - std::floor(u), N, Pm.crank)); }
    if (shotAt >= 0) {
      const double ts = (double)(t + i - shotAt) / fs;
      if (ts >= SHOT) shotAt = -1;
      else { const double s = fdlibm::sin(PI * ts / SHOT); sg = std::max(sg, shotA * s * s); }
    }
    surge = sg;
    const double target = drive * Pm.crank * (1 + Pm.uneven * fdlibm::sin(TAU * phase)) * (1 + Pm.coup * sg);
    rate += (target - rate) * flyK;
    if (target == 0 && rate < 1e-9) rate = 0; // (no denormals as it comes to rest)
    phase += rate / fs; if (phase >= 1) phase -= 1;
    vB = wheelSpeed(rate);
    // the bridges, each from the strings on it
    double Vt[NBRIDGE] = {};
    for (auto &s : S) if (s->active && s->id != TROMP) Vt[bridgeOf(s->id)] += s->Z * s->ob;
    for (int b = 0; b < NBRIDGE; b++) Vt[b] *= kB[b];
    double fd[NDRIVE] = {};
    for (auto &sp : S) {
      Str &s = *sp;
      if (!s.active) continue;
      if (s.FN != s.FT) s.FN = s.FN < s.FT ? std::min(s.FT, s.FN + dF[s.id]) : std::max(s.FT, s.FN - dF[s.id]);
      if (s.id == TROMP) fd[1] = s.tickChien(chien, Pm.tirant, Pm.chienMass, zeta, vB, s.FN, Fr);
      else {
        const double f = s.tick(Vt[bridgeOf(s.id)] - kself[s.id] * s.ob, kself[s.id], vB, s.FN, Fr);
        fd[driveOf(s.id)] += lowOne && s.id == CH1 ? LOW_PAIR * f : f;
      }
    }
    if (!tr.active) { chien.y = -Pm.tirant / CHIEN_K; chien.v = 0; chien.Fs = 0; chien.Fc = Pm.tirant; }
    // the soundboard, driven at the bridge and at the chien's foot
    double l = 0, r = 0;
    for (int m = 0; m < M; m++) {
      const double *dr = modes[m].drive;
      const double d = b0[m] * (dr[0] * fd[0] + dr[1] * fd[1] + dr[2] * fd[2] + dr[3] * fd[3]);
      const double Q1 = q1[m], Q2 = q2[m], q = a1[m] * Q1 - a2[m] * Q2 + d;
      const double dv = q - Q2, da = q - 2 * Q1 + Q2;
      q2[m] = Q1; q1[m] = q;
      l += cLr[m] * dv + cLi[m] * da;
      r += cRr[m] * dv + cRi[m] * da;
    }
    const double hf = G_DIRECT * mass.run(hp[1].run(hp[0].run(fd[0] + fd[1] + fd[2] + fd[3])));
    dl[dw] = hf; dw = (dw + 1) & 63;
    Lo[i] = (float)(OUT * (l + hf));
    Ro[i] = (float)(OUT * (r + dl[(dw - 23) & 63]));
    lift[tw] = (float)chien.y; pull[tw] = (float)chien.Fs; tw = (tw + 1) % TRACE;
    liftMax = std::max(liftMax, chien.y);
  }
  t += n;
  double e = 0;
  for (int m = 0; m < M; m++) e += q1[m] * q1[m];
  bodyE = e;
  retire();
  if (messages && t - lastPost >= POST_EVERY) report();
}

// Strings off the wheel (hooked away, or the wheel stopped) leave the loop once quiet; one gone
// non-finite is silenced alone.
void HurdyGurdyEngine::retire() {
  for (auto &sp : S) {
    Str &s = *sp;
    if (!s.active) continue;
    if (!(s.e < 1e6 * s.os * 128)) { s.clear(); s.active = false; s.FN = 0; continue; } // |v| > 1 km/s, or NaN
    const bool bowing = s.FN > 0 && (running || rate > 1e-4);
    const bool quiet = !bowing && s.e < QUIET[(int)applied] * s.os * 128;
    s.e = 0;
    s.idle = quiet ? s.idle + 1 : 0;
    if (s.idle > 8) { s.active = false; s.clear(); }
  }
}

void HurdyGurdyEngine::report() {
  const double dt = (double)(t - lastPost) / fs;
  for (int i = 0; i < TRACE; i++) { liftOut[i] = lift[(tw + i) % TRACE]; pullOut[i] = pull[(tw + i) % TRACE]; }
  Message m;
  m.key = (int16_t)melody;
  for (int which = 0; which < 2; which++) {
    const float *src = which ? pullOut.data() : liftOut.data();
    m.type = which ? msg::pull : msg::lift;
    for (int i = 0; i < TRACE;) {
      const int c = std::min(29, TRACE - i);
      m.count = (uint16_t)(c + 1); m.values[0] = (float)i;
      for (int q = 0; q < c; q++) m.values[1 + q] = src[i + q];
      post(m);
      i += c;
    }
  }
  int on = 0, sounding = 0;
  for (auto &s : S) { if (s->FT > 0) on |= 1 << s->id; if (s->active) sounding |= 1 << s->id; }
  const Str &c = *S[CH1];
  const double v[13] = {rate, phase, vB, buzzThreshold(Pm), c.L.Ls, c.L.beta, (double)(chien.hits - hits0) / dt, Pm.tirant,
                        running ? 1.0 : 0.0, (double)on, (double)sounding, liftMax, surge};
  m.type = msg::state; m.count = 13;
  for (int q = 0; q < 13; q++) m.values[q] = (float)v[q];
  post(m);
  hits0 = chien.hits; liftMax = 0;
  lastPost = t;
}

} // namespace forte::hurdygurdy
