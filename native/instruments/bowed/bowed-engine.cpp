// bowed-engine.cpp — the viola organista's engine (bowed-engine.h).

#include "bowed-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/fdlibm.h"
#include "forte/dsp.h"

namespace forte::bowed {

constexpr double OUT = 13;
constexpr double G_DIRECT = 0.0057; // matches the modes' mean radiation (≈ −45 dB per newton) where they overlap
constexpr double F_BODY = 2400;     // plate modes are modelled up to here
constexpr int POST_EVERY = 2048;    // samples between view updates (≈ 23 per second)
constexpr double STROBE = 1.0 / 48; // the shape is sampled stroboscopically: the corner advances 1/48 period per frame
constexpr double FLYWHEEL = 0.5;    // s: the crank's flywheel smooths changes of treadle speed
constexpr double BEND_T = 0.02;     // s: the pitch wheel's glide
// Released strings leave the loop once this quiet (mean v² at the bow, m²/s²): High waits until
// about 130 dB below a voiced note, Medium and Low 80 and 70.
constexpr double QUIET[3] = {1e-14, 1e-9, 1e-8};

static Params paramsOf(const double *P) {
  Params x;
  x.speed = P[p::speed]; x.beta = P[p::beta]; x.treadle = P[p::treadle]; x.treadleRate = P[p::treadleRate];
  x.force = P[p::force]; x.attack = P[p::attack]; x.mus = P[p::mus]; x.mud = P[p::mud]; x.v0 = P[p::v0];
  x.memory = P[p::memory]; x.grain = P[p::grain]; x.torsionQ = P[p::torsionQ]; x.losses = P[p::losses];
  x.mobility = P[p::mobility]; x.boardEta = P[p::boardEta]; x.damper = P[p::damper]; x.lifted = P[p::lifted] != 0;
  x.tuning = tuningOf(P);
  return x;
}

OrganistaEngine::OrganistaEngine(double fs) : Engine(fs), fly(1 - fdlibm::exp(-1 / (FLYWHEEL * fs))) {
  for (int k = KEY_MIN; k <= KEY_MAX; k++) {
    auto s = std::make_unique<Key>(k, fs);
    s->seg = std::min(NSEG - 1, std::max(0, (int)std::floor(((double)(k - KEY_LO) / (KEY_HI - KEY_LO)) * (NSEG - 1) + 0.5))); // past C2–C6: the bridge's ends
    S[k - KEY_MIN] = std::move(s);
  }
  // the board's modes: their frequencies, the strings' load and the radiation don't depend on the
  // loss factor (boardModes, once)
  const auto all = boardModes(F_BODY, 0);
  M = std::min((int)all.size(), MAX_MODES);
  for (int i = 0; i < M; i++) modes[i] = all[i];
  setFilter(mass, 4000, fs); // the bridge's mass rolls off the top
  voiced(KEY_LO);           // the voicing table, now rather than at the first note
}

// The Quality, applied at the top of a block (and of setParams), at once and without a click: the
// strings' reads (the same strings); the sympathy (a string that leaves it rings on while the
// others keep it going, and retires once quiet); the board's rate, its modes' motion carried
// across (two samples of a free resonator give the next or the one before).
void OrganistaEngine::applyQuality() {
  applied = quality;
  for (auto &s : S) s->fast = applied != Quality::high;
  if (hasParams && Pm.lifted) liftAll();
  const bool h = applied != Quality::high;
  if (h == half) return;
  for (int m = 0; m < M; m++)
    if (h) q2[m] = (a1[m] * q2[m] - q1[m]) / a2[m]; // q[n−2] from q[n] and q[n−1]
    else q2[m] = (q1[m] + a2[m] * q2[m]) / a1[m];   // q[n−1] from q[n] and q[n−2]
  half = h; pair = 0; segH.fill(0);
}

void OrganistaEngine::setParams(const double *P) {
  if (quality != applied) applyQuality(); // (before the dampers are lifted below)
  const bool first = !hasParams;
  const Params old = Pm;
  Pm = paramsOf(P);
  hasParams = true;
  Fr = friction(Pm);
  vBt = Pm.speed; if (first) vB = Pm.speed; // the wheel follows the treadle through the flywheel
  for (auto &s : S) {
    s->design(loopDesign(s->key, Pm, s->fs));
    if (bendNow * s->nb != 1) s->bend(bendNow * s->nb);
    s->setDamper(damped(*s), 6.91 / Pm.damper);
  }
  const Loop &L0 = S[0]->L;
  kB = (2 * L0.G) / (1 + L0.G * L0.Zall);
  if (Pm.boardEta != etaBody) buildBody(Pm.boardEta);
  if (Pm.lifted && !(!first && old.lifted)) liftAll();
  if (!first && old.force != Pm.force) for (int i = 0; i < nAct; i++) { Key &s = *act[i]; if (s.down) s.FT = keyForce(s.key, s.vel, Pm.force, s.after); }
}

// The soundboard: plate modes driven at NSEG points along the bridge.
void OrganistaEngine::buildBody(double eta) {
  etaBody = eta;
  for (int i = 0; i < M; i++) {
    const BoardMode &m = modes[i];
    const double sigma = std::numbers::pi * m.f * eta + m.load; // as boardModes(F_BODY, eta)
    const ModeCoeffs c = modeCoeffs(m.f, sigma, fs);
    const double om = TAU * m.f;
    a1[i] = c.a1; a2[i] = c.a2; q1[i] = 0; q2[i] = 0;
    for (int g = 0; g < NSEG; g++) {
      double xy[2];
      bridgePoint(KEY_LO + ((double)(KEY_HI - KEY_LO) * g) / (NSEG - 1), xy);
      drive[i * NSEG + g] = (c.b * plateShape(m.m, m.n, xy[0], xy[1])) / m.M;
    }
    // mic j hears Re[w_j V]: w_r·v − w_i·(ω q) for a mode ringing at ω, written as w_r·v + w_i·a/ω
    cLr[i] = (m.w[0][0] * fs) / 2; cLi[i] = (m.w[0][1] * fs * fs) / om;
    cRr[i] = (m.w[1][0] * fs) / 2; cRi[i] = (m.w[1][1] * fs * fs) / om;
    // Medium and Low: the same mode at fs/2, driven by each pair of samples' mean force and heard
    // held for two samples; at its own frequency it answers as at fs, the averaging, the hold and
    // the coarser differences made up (every mode is below fs/20, so none of them is far off)
    const ModeCoeffs h = modeCoeffs(m.f, sigma, fs / 2);
    const double x = om / fs, hold = fdlibm::cos(x / 2), sx = fdlibm::sin(x), gv = 2 * sx / fdlibm::sin(2 * x), ga = 4 * fdlibm::pow(fdlibm::sin(x / 2) / sx, 2);
    a1h[i] = h.a1; a2h[i] = h.a2;
    for (int g = 0; g < NSEG; g++) driveH[i * NSEG + g] = (drive[i * NSEG + g] / c.b) * h.b / (2 * hold);
    cLrh[i] = (cLr[i] / 2) * gv / hold; cLih[i] = (cLi[i] / 4) * ga / hold;
    cRrh[i] = (cRr[i] / 2) * gv / hold; cRih[i] = (cRi[i] / 4) * ga / hold;
  }
  // above the modelled modes the board is dense: radiate the bridge force directly
  setFilter(hp[0], Biquad::hp, F_BODY, 0.5412, fs); setFilter(hp[1], Biquad::hp, F_BODY, 1.3066, fs);
}

void OrganistaEngine::liftAll() {
  for (auto &s : S) if (sympathetic(s->key)) activate(*s);
}

void OrganistaEngine::activate(Key &s) {
  if (s.active) return;
  s.clear(); s.active = true; s.idle = 0;
  act[nAct++] = &s;
}

void OrganistaEngine::noteOn(int key, double velocity) {
  Key *s = string(key);
  if (!s || !hasParams) return;
  activate(*s);
  if (s->nb != expr.bendOf(key)) { s->nb = expr.bendOf(key); s->bend(bendNow * s->nb); } // its own bend, at once
  s->down = true; s->vel = velocity; s->after = 0;
  s->FT = keyForce(key, velocity, Pm.force);
  const double rise = riseTime(velocity, Pm.attack);
  s->up = s->FT / std::max(1.0, rise * fs);
  s->setDamper(false, 0);
  focus = key;
}

void OrganistaEngine::noteOff(int key, double) {
  Key *s = string(key);
  if (!s || !s->down) return;
  s->down = false; s->FT = 0;
  s->dn = std::max(s->FN, 1e-6) / (0.015 * fs); // the key lifts the string off the wheel in 15 ms
}

void OrganistaEngine::allNotesOff() { // Panic: every string and the board to rest
  for (int i = 0; i < nAct; i++) { Key &s = *act[i]; s.down = false; s.FT = 0; s.FN = 0; s.clear(); s.active = false; act[i] = nullptr; }
  nAct = 0;
  if (M) { q1.fill(0); q2.fill(0); bodyE = 0; }
  hp[0].reset(); hp[1].reset(); mass.y = 0; dl.fill(0);
  if (hasParams && Pm.lifted) liftAll();
}

void OrganistaEngine::pressure(double value, int key) { // MIDI aftertouch: one key (poly) or every held key (channel, −1)
  for (int i = 0; i < nAct; i++) {
    Key &s = *act[i];
    if (s.down && (key < 0 || key == s.key)) { s.after = value; s.FT = keyForce(s.key, s.vel, Pm.force, s.after); }
  }
}

int OrganistaEngine::voiceCount() const { int n = 0; for (int i = 0; i < nAct; i++) if (act[i]->down) n++; return n; }

void OrganistaEngine::bend(double value) {
  bendTo = fdlibm::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12);
}

void OrganistaEngine::process(float *L, float *R, int n) {
  if (quality != applied) applyQuality();
  for (int at = 0; at < n; at += 128) {
    const int m = std::min(128, n - at);
    const bool wheel = bendNow != bendTo;
    if (wheel) { // the pitch wheel glides; every string is retuned each block
      bendNow += (bendTo - bendNow) * (1 - fdlibm::exp(-m / (BEND_T * fs)));
      if (std::fabs(bendNow - bendTo) < 1e-9) bendNow = bendTo;
    }
    if (hasParams) for (auto &s : S) { // and a key's own bend: a sounding string glides, a silent one takes it at once
      const double to = expr.bendOf(s->key), was = s->nb;
      if (was != to) s->nb = s->active ? glideTo(was, to, m / fs, BEND_T) : to;
      if (wheel || was != to) s->bend(bendNow * s->nb);
    }
    run(L + at, R + at, m);
  }
}

void OrganistaEngine::run(float *Lo, float *Ro, int n) {
  if (!hasParams || (nAct == 0 && bodyE < 1e-18)) {
    for (int i = 0; i < n; i++) Lo[i] = Ro[i] = 0;
    t += n;
    if (hasParams) vB = vBt + (vB - vBt) * fdlibm::exp(-n / (FLYWHEEL * fs));
    return;
  }
  // the bridge segments that carry sounding strings this block
  int nSeg = 0;
  for (int g = 0; g < NSEG; g++) for (int j = 0; j < nAct; j++) if (act[j]->seg == g) { segOn[nSeg++] = g; break; }
  // and each mode's drive at just those, packed (the same products, summed in the same order)
  const double *dsrc = half ? driveH.data() : drive.data();
  for (int m = 0; m < M; m++) for (int k = 0; k < nSeg; k++) driveOn[m * nSeg + k] = dsrc[m * NSEG + segOn[k]];
  const double dph = (TAU * Pm.treadleRate) / fs, swing = Pm.treadle;
  const double sDamp = 6.91 / Pm.damper;
  Key &fo = *S[focus - KEY_MIN];
  double vBm = vB;
  for (int i = 0; i < n; i++) {
    vBm += (vBt - vBm) * fly;
    const double vb = vBm * (1 + swing * fdlibm::sin(ph)); // V8's sine, to the last bit (fdlibm.h)
    ph += dph; if (ph > TAU) ph -= TAU;
    double za = 0;
    for (int j = 0; j < nAct; j++) { const Key &s = *act[j]; za += s.Z * s.ob; }
    const double Vt = kB * za;
    for (int g = 0; g < NSEG; g++) seg[g] = 0;
    double ftot = 0;
    for (int j = 0; j < nAct; j++) {
      Key &s = *act[j];
      if (s.FN != s.FT) { // the key action: force ramps at the key's speed
        if (s.FN < s.FT) s.FN = std::min(s.FT, s.FN + s.up);
        else if (s.FN > s.FT) { s.FN = std::max(s.FT, s.FN - (s.down ? s.up : s.dn)); if (s.FN == 0 && damped(s)) s.setDamper(true, sDamp); }
      }
      double f = s.tick(Vt - s.kself * s.ob, vb * s.wheel, s.FN, Fr);
      const double chk = f + s.ob; // a NaN or ∞ here would reach every string through the shared bridge
      if (chk - chk != 0) { fault(s); f = 0; }
      seg[s.seg] += f; ftot += f;
    }
    // soundboard
    double l = 0, r = 0;
    if (!half) {
      for (int k = 0; k < nSeg; k++) segF[k] = seg[segOn[k]];
      for (int m = 0; m < M; m++) {
        const double *dr = &driveOn[m * nSeg];
        double d = 0;
        for (int k = 0; k < nSeg; k++) d += dr[k] * segF[k];
        const double Q1 = q1[m], Q2 = q2[m], q = a1[m] * Q1 - a2[m] * Q2 + d;
        // modal velocity and acceleration, both centred on the previous sample: v = (q − q2)·fs/2,
        // a = (q − 2q1 + q2)·fs²; the quadrature part of the radiation is −a/ω
        const double dv = q - Q2, da = q - 2 * Q1 + Q2;
        q2[m] = Q1; q1[m] = q;
        l += cLr[m] * dv + cLi[m] * da;
        r += cRr[m] * dv + cRi[m] * da;
      }
      holdL = l; holdR = r; // (what a switch to fs/2 holds until its first step)
    } else { // Medium and Low: the board at fs/2 (applyQuality), a step every second sample
      for (int k = 0; k < nSeg; k++) segH[k] += seg[segOn[k]];
      if (pair) {
        for (int m = 0; m < M; m++) {
          const double *dr = &driveOn[m * nSeg];
          double d = 0;
          for (int k = 0; k < nSeg; k++) d += dr[k] * segH[k];
          const double Q1 = q1[m], Q2 = q2[m], q = a1h[m] * Q1 - a2h[m] * Q2 + d;
          const double dv = q - Q2, da = q - 2 * Q1 + Q2;
          q2[m] = Q1; q1[m] = q;
          l += cLrh[m] * dv + cLih[m] * da;
          r += cRrh[m] * dv + cRih[m] * da;
        }
        holdL = l; holdR = r;
        segH.fill(0);
      }
      pair ^= 1;
      l = holdL; r = holdR;
    }
    const double hf = G_DIRECT * mass.run(hp[1].run(hp[0].run(ftot)));
    dl[dw] = hf; dw = (dw + 1) & 63;
    Lo[i] = (float)(OUT * (l + hf));
    Ro[i] = (float)(OUT * (r + dl[(dw - 23) & 63]));
    if (fo.active) { trace[tw] = (float)fo.vs; tw = (tw + 1) % TRACE; }
    if (t + i == shotAt && fo.active) { fo.shape(shapeBuf.data(), SHAPE_N); shot = true; }
  }
  vB = vBm;
  t += n;
  double e = 0;
  for (int m = 0; m < M; m++) e += q1[m] * q1[m];
  bodyE = e;
  retire();
  if (faults) {
    faults = 0;
    Message m;
    m.type = msg::error; m.key = (int16_t)focus;
    post(m);
  }
  if (messages && (shot || t - lastPost >= 2 * POST_EVERY)) report();
}

// A string that has gone non-finite (or blown up) is silenced and stopped, alone: the others play
// on. Its key has to be pressed again.
void OrganistaEngine::fault(Key &s) {
  s.clear(); s.down = false; s.FT = 0; s.FN = 0; s.after = 0;
  s.setDamper(!Pm.lifted, 6.91 / Pm.damper);
  faults++;
}

// Strings that are damped and silent leave the loop (unless the dampers are lifted: then those past
// C2–C6 still leave it once silent).
void OrganistaEngine::retire() {
  int j = 0;
  for (int i = 0; i < nAct; i++) {
    Key &s = *act[i];
    if (!(s.e < 1e6 * s.os * 128)) fault(s); // |v| > 1 km/s, or NaN
    const bool quiet = !s.down && s.FN == 0 && !(Pm.lifted && sympathetic(s.key)) && s.e < QUIET[(int)applied] * s.os * 128;
    s.e = 0;
    s.idle = quiet ? s.idle + 1 : 0;
    if (s.idle > 8) { s.active = false; s.clear(); } else act[j++] = &s;
  }
  for (int i = j; i < nAct; i++) act[i] = nullptr;
  nAct = j;
}

// Post the focus string's state to the page, and schedule the next stroboscopic snapshot: a whole
// number of (bowed) periods plus 1/48.
void OrganistaEngine::report() {
  Key &s = *S[focus - KEY_MIN];
  motion = s.active ? s.motion(16) : Motion{};
  if (!s.active) shapeBuf.fill(0);
  for (int i = 0; i < TRACE; i++) traceOut[i] = trace[(tw + i) % TRACE];
  const double P0 = fs / (s.L.f0 * bendNow * s.nb), Pact = motion.kind == Kind::helmholtz ? P0 / motion.spp : P0;
  Message m;
  m.key = (int16_t)focus;
  for (int which = 0; which < 2; which++) {
    const float *src = which ? traceOut.data() : shapeBuf.data();
    const int size = which ? TRACE : SHAPE_N;
    m.type = which ? msg::trace : msg::shape;
    for (int i = 0; i < size;) {
      const int c = std::min(29, size - i);
      m.count = (uint16_t)(c + 1); m.values[0] = (float)i;
      for (int q = 0; q < c; q++) m.values[1 + q] = src[i + q];
      post(m);
      i += c;
    }
  }
  m.type = msg::state; m.count = 10;
  const double v[10] = {s.FN, s.FT, vB * s.wheel, s.L.beta, s.down ? 1.0 : 0.0, s.active ? 1.0 : 0.0, (double)motion.kind, motion.spp, Pact, fs / Pact};
  for (int q = 0; q < 10; q++) m.values[q] = (float)v[q];
  post(m);
  lastPost = t;
  shot = false;
  const double k = std::ceil(POST_EVERY / Pact);
  shotF = shotF + k * Pact + STROBE * Pact;
  if (shotF < (double)t) shotF = (double)t + Pact;
  shotAt = (int64_t)std::floor(shotF + 0.5);
}

} // namespace forte::bowed
