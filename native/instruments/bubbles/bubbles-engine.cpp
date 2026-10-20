// bubbles-engine.cpp — the bubble organ's engine (bubbles-engine.h).

#include "bubbles-engine.h"

#include <algorithm>
#include <cmath>
#include <limits>

#include "forte/dsp.h"

namespace forte::bubbles {

constexpr double OUT = 1;            // output units per pascal at the reference distance
constexpr double MIN_AGE = 0.012;    // s: a bubble younger than this is never stolen
constexpr double FADE = 0.006;       // s: a stolen bubble fades out over this
constexpr double BURST = 0.002;      // s: a bubble that reaches the surface bursts: its ring stops over this
constexpr double BEND_T = 0.02;      // s: the pitch wheel's glide
constexpr double END = 1e-4;         // a bubble is freed 80 dB below its peak
constexpr double P_GLIDE = 0.05;     // s: the tank's pressure follows its knob with this time constant
constexpr double PRESS_GAIN = 2;     // aftertouch: full pressure releases (1 + 2) times as many bubbles
constexpr double KICK_JITTER = 0.25; // the kick varies by this (× irregularity) from bubble to bubble
constexpr int POST_BLOCKS = 4;       // view messages every few blocks
constexpr int EV_MAX = 48;           // release events posted per block at most

BubbleEngine::BubbleEngine(double fs, uint32_t seed, int pool, int soft) : Engine(fs), rand(seed) {
  configure(seed, pool, soft);
  for (int i = 0; i < NK; i++) nozzles[i].key = KEY_LO + i;
  // each nozzle's radius at the default conditions, cut for its key's note in the keyboard's tuning
  // (equal temperament until it changes: cached per tuning version), and with "keep in tune"
  // re-sized for the conditions (cached per condition version)
  def = defaultEnv();
  for (int i = 0; i < NK; i++) Rnom[i] = tuneRadius(keyFreq(KEY_LO + i), def);
  tuneVer.fill(-1); nomVer.fill(0);
  for (int i = 0; i < NK; i++) { double g[2]; hydrophoneGains(KEY_LO + i, g); gainL[i] = g[0]; gainR[i] = g[1]; }
  env = def;
}

void BubbleEngine::configure(uint32_t seed, int size, int softLimit) {
  rand = Mulberry32(seed);
  spare = std::numeric_limits<double>::quiet_NaN();
  pool.assign(std::max(1, size), Bubble{});
  soft = softLimit;
  rec = nullptr;
  log.reserve(4096);
}

void BubbleEngine::setParams(const double *p) {
  const bool changed = !hasParams || P[p::depth] != p[p::depth] || P[p::pressure] != p[p::pressure] || P[p::gas] != p[p::gas]
                       || P[p::liquid] != p[p::liquid] || P[p::keepInTune] != p[p::keepInTune];
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  const forte::Tuning t = tuningOf(P.data());
  if (!(t == tuning)) { tuning = t; nomV++; ver++; } // every nozzle re-cut for the new tuning
  env = nozzleEnv(P.data());
  pTarget = P[p::pressure] * P_ATM;
  if (!hasParams) pT = pTarget;
  hasParams = true;
  if (changed) ver++;
}

void BubbleEngine::noteOn(int key, double velocity) {
  if (!hasParams || !(key >= KEY_LO && key <= KEY_HI)) return; // no nozzle outside A3–C8
  Nozzle &z = nozzles[key - KEY_LO];
  // every press owes one bubble, released in the next block even if the key is already up again
  // (a quick tap); a held key struck again releases its next bubble now: the same nozzle, never a second
  z.held = true; z.owed = true; z.vel = std::max(0.0, std::min(1.0, velocity)); z.first = true;
}

void BubbleEngine::noteOff(int key, double) { if (key >= KEY_LO && key <= KEY_HI) nozzles[key - KEY_LO].held = false; }

void BubbleEngine::allNotesOff() {
  for (Nozzle &z : nozzles) { z.held = false; z.owed = false; z.press = 0; }
  for (Bubble &b : pool) if (b.on) startFade(b, FADE);
}

void BubbleEngine::pressure(double value, int key) {
  const double v = std::max(0.0, std::min(1.0, value == value ? value : 0.0));
  if (key < 0) for (Nozzle &z : nozzles) z.press = v;
  else if (key >= KEY_LO && key <= KEY_HI) nozzles[key - KEY_LO].press = v;
}

int BubbleEngine::voiceCount() const {
  int n = 0;
  for (const Bubble &b : pool) if (b.on) n++;
  return n;
}

// a standard normal deviate, clipped to ±2.5
double BubbleEngine::gauss() {
  double g;
  if (spare == spare) { g = spare; spare = std::numeric_limits<double>::quiet_NaN(); }
  else {
    const double u = std::max(1e-12, rand()), v = rand(), r = std::sqrt(-2 * std::log(u));
    g = r * std::cos(TAU * v); spare = r * std::sin(TAU * v);
  }
  return std::max(-2.5, std::min(2.5, g));
}

// samples to the nozzle's next release: mean 1/rate, regular blended with exponential (Poisson) gaps
double BubbleEngine::interval(const Nozzle &z) {
  const double mean = fs / (expr.slideOr(z.key, P[p::rate]) * (1 + PRESS_GAIN * z.press)), j = P[p::irregular];
  return std::max(1.0, mean * (1 - j + j * -std::log(1 - rand())));
}

double BubbleEngine::radius(int i) {
  const int key = KEY_LO + i;
  if (!P[p::keepInTune]) {
    if (nomVer[i] != nomV) { Rnom[i] = tuneRadius(keyFreq(key) * tuning.ratio(key), def); nomVer[i] = nomV; }
    return Rnom[i];
  }
  if (tuneVer[i] != ver) { Rtune[i] = tuneRadius(keyFreq(key) * tuning.ratio(key), env); tuneVer[i] = ver; }
  return Rtune[i];
}

void BubbleEngine::startFade(Bubble &b, double sec) {
  const double step = 1 / std::max(1.0, sec * fs);
  if (!(b.fadeStep >= step)) b.fadeStep = step;
}

// Release a bubble from nozzle z, `offset` samples into this block. False if the pool is full.
bool BubbleEngine::release(Nozzle &z, int offset) {
  Bubble *slot = nullptr;
  int live = 0;
  for (Bubble &b : pool) { if (!b.on) { if (!slot) slot = &b; } else if (b.fadeStep == 0) live++; }
  if (live >= soft) { // fade the quietest bubble that has had time to sound
    Bubble *victim = nullptr;
    for (Bubble &b : pool) if (b.on && b.fadeStep == 0 && b.age >= MIN_AGE * fs && (!victim || b.env < victim->env)) victim = &b;
    if (victim) startFade(*victim, FADE);
  }
  if (!slot) return false;
  const int i = z.key - KEY_LO;
  const Liquid *liq = env.liq;
  const Gas *gas = env.gas;
  // the bubble at its nozzle, under the tank's pressure as it is now
  Env renv;
  renv.liq = liq; renv.gas = gas; renv.d = P[p::depth]; renv.p0 = pB + liq->rho * G * P[p::depth];
  double R = radius(i), vel = z.vel;
  // the key's own bend: its nozzle releases the bubble that rings r × the note its own would ring
  // here and now (a bubble's note is set as it pinches off: those already rising keep theirs)
  if (const double r = expr.bendOf(z.key); r != 1) R = tuneRadius(acoustics(R, renv).fd * r, renv);
  const bool first = z.first;
  if (!first) {
    R *= 1 + (P[p::spread] / 100) * gauss();
    vel *= std::max(0.2, 1 + KICK_JITTER * P[p::irregular] * gauss());
  }
  z.first = false; z.released++;
  if (logging) log.push_back({z.key, frame + offset, R, vel, first}); // tests only
  const Acoustics a = acoustics(R, renv);
  Bubble &b = *slot;
  b.on = true; b.key = z.key; b.age = 0; b.start = offset; b.fade = 1; b.fadeStep = 0;
  b.R0 = R; b.R = R; b.d0 = P[p::depth]; b.d = P[p::depth]; b.U = riseSpeed(R, *liq); b.pb0 = a.pb; b.phiRe = a.phiRe; b.phiIm = a.phiIm;
  b.nSlow = slowExponent(R, *gas, a.pb);
  b.liq = liq; b.gas = gas; b.vel = vel; b.fd0 = a.fd;
  setRing(b, a);
  b.mr = std::exp(b.sr / fs) * std::cos(b.si / fs); b.mi = std::exp(b.sr / fs) * std::sin(b.si / fs);
  b.ur = 0; b.ui = 0; b.env = 0; b.peak = 0;
  b.gl = gainL[i]; b.gr = gainR[i];
  // the kick: a pressure step Δp (a share of 2σ/R), ramped over the neck's snap time; the wall's
  // equilibrium moves by Δp/(ρRmω₀²) along a raised cosine, and the wall rings about it
  const double dp = kickPressure(R, *liq, vel);
  b.rampA = dp / (liq->rho * R * a.m * a.omega0 * a.omega0); b.rampV = 0;
  b.rampAl = (2 * a.b) / (a.omega0 * a.omega0); b.rampBe = (1 - a.b * b.rampAl) / a.omegaD;
  b.rampN = std::max(1, (int)std::round((P[p::snap] / 1000) * fs)); b.rampK = 0; b.rampLeft = b.rampN + 1;
  // record this one for the waveform view
  if (messages) startRecording(b, a);
  if (messages && nev < EV_MAX) {
    nev++;
    Message m;
    m.type = msg::release; m.key = (int16_t)z.key; m.count = 7;
    const double v[7] = {(double)offset, R, a.fd, a.b, b.U, P[p::depth], vel};
    for (int k = 0; k < 7; k++) m.values[k] = (float)v[k];
    post(m);
  }
  return true;
}

// The ring's complex frequency s = −b + iω_d, and the output coefficient c = OUT·ρR²s²/r_ref (p = Re(c·u)).
void BubbleEngine::setRing(Bubble &b, const Acoustics &a) {
  b.b = a.b; b.wd = a.omegaD; b.w0 = a.omega0;
  b.sr = -a.b; b.si = a.omegaD;
  const double k = (OUT * b.liq->rho * b.R * b.R) / R_REF;
  b.cr = k * (b.sr * b.sr - b.si * b.si); b.ci = k * 2 * b.sr * b.si;
}

void BubbleEngine::startRecording(Bubble &b, const Acoustics &a) {
  // a window long enough to see the ring fall 40 dB, at most 120 periods (so every period gets ≥ 8 points)
  const double T = std::max(0.004, std::min({4.6 / a.b, 120 / a.fd, 1.5}));
  rec = &b; recStride = std::max(1, (int)std::ceil((T * fs) / WAVE_N)); recPhase = 0; recPost = 0;
  waveKey = b.key; waveCount = 0; waveDone = false; waveNew = true;
  const double v[17] = {recStride / fs, b.R0, a.fd, a.b, a.delta, a.dth, a.drad, a.dvis, a.kappa, b.d0,
                        std::floor(frame / 16777216.0), (double)(frame % 16777216), a.pb - (2 * b.liq->sigma) / b.R0, a.chi, a.m, b.vel, b.U};
  for (int k = 0; k < 17; k++) waveMeta[k] = (float)v[k];
}

// Where the bubble is at the end of this block, and its ring there (in ac). False once it has
// reached the surface: it bursts, and its ring stops.
bool BubbleEngine::glide(Bubble &b, int n) {
  const double t = (b.age + n) / fs;
  const double d = b.d0 - riseDistance(t, b.U);
  if (d <= b.R) { startFade(b, BURST); return false; }
  double R;
  ac = glideRing(b.R0, b.pb0, b.nSlow, {b.phiRe, b.phiIm}, *b.liq, *b.gas, d, pB, R);
  b.R = R; b.d = d;
  return true;
}

void BubbleEngine::render(Bubble &b, float *L, float *Rt, int n) {
  const int i0 = b.start;
  double ur = b.ur, ui = b.ui, mr = b.mr, mi = b.mi, cr = b.cr, ci = b.ci, fade = b.fade;
  // sweep s and c linearly from their values now to the block's end
  double dr = 1, di = 0, dcr = 0, dci = 0;
  const int steps = n - i0;
  if (b.age > 0 && glide(b, n)) {
    const Acoustics &a = ac;
    const double sr1 = -a.b, si1 = a.omegaD, k = (OUT * b.liq->rho * b.R * b.R) / R_REF;
    const double cr1 = k * (sr1 * sr1 - si1 * si1), ci1 = k * 2 * sr1 * si1;
    const double er = (sr1 - b.sr) / (steps * fs), ei = (si1 - b.si) / (steps * fs), ee = std::exp(er);
    dr = ee * std::cos(ei); di = ee * std::sin(ei);
    dcr = (cr1 - cr) / steps; dci = (ci1 - ci) / steps;
    b.b = a.b; b.wd = a.omegaD; b.w0 = a.omega0; b.sr = sr1; b.si = si1; b.cr = cr1; b.ci = ci1;
  }
  const double gl = b.gl, gr = b.gr, fstep = b.fadeStep;
  const bool recording = rec == &b;
  for (int i = i0; i < n; i++) {
    if (b.rampLeft > 0) {
      // The neck snapping: the equilibrium e moves out along a raised cosine, taken piecewise linear
      // between samples. u is the wall's deviation from the particular solution e − 2bė/ω₀², which
      // rings freely between samples; at each sample the slope of e changes by Δv, and u jumps by
      // 2bΔv/ω₀² + i(1 − 2b²/ω₀²)Δv/ω_d. The output Re(s²u) is then exactly ẍ: no staircase.
      const int k = b.rampK++, N = b.rampN;
      const double v = k < N ? 0.5 * b.rampA * fs * (std::cos((std::numbers::pi * k) / N) - std::cos((std::numbers::pi * (k + 1)) / N)) : 0;
      const double dv = v - b.rampV;
      b.rampV = v;
      ur += b.rampAl * dv; ui += b.rampBe * dv; b.rampLeft--;
    }
    const double y = (cr * ur - ci * ui) * fade;
    L[i] = (float)(L[i] + gl * y); // a Float32Array's +=
    Rt[i] = (float)(Rt[i] + gr * y);
    if (recording && recPhase++ % recStride == 0 && waveCount < WAVE_N) wave[waveCount++] = (float)(y / OUT); // Pa at r_ref
    const double nr = ur * mr - ui * mi;
    ui = ur * mi + ui * mr; ur = nr;
    const double tr = mr * dr - mi * di;
    mi = mr * di + mi * dr; mr = tr;
    cr += dcr; ci += dci;
    if (fstep != 0) { fade -= fstep; if (fade <= 0) { fade = 0; break; } }
  }
  // renormalise the step to its exact value at the block's end
  const double e = std::exp(b.sr / fs);
  b.mr = e * std::cos(b.si / fs); b.mi = e * std::sin(b.si / fs);
  b.ur = ur; b.ui = ui; b.fade = fade;
  b.age += n - i0; b.start = 0;
  b.env = std::hypot(ur, ui) * std::hypot(b.cr, b.ci) * fade;
  if (b.env > b.peak) b.peak = b.env;
  const bool over = fade <= 0 || (b.rampLeft == 0 && b.env <= END * b.peak) || !(b.env < 1e3);
  if (over) b.on = false;
  if (recording && (over || waveCount >= WAVE_N)) { waveDone = true; rec = nullptr; }
}

void BubbleEngine::bend(double value) {
  bendTo = std::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12);
}

void BubbleEngine::noteBend(double ratio, int key) { expr.setBend(ratio, key); }

// Slide sets the key's own bubble rate, as the wheel sets every nozzle's: the next gap it draws is
// at that rate.
void BubbleEngine::slide(double value, int key) {
  const ParamInfo &r = kParams[p::rate];
  expr.setSlide(value == value ? std::clamp(value, r.min, r.max) : value, key);
}

void BubbleEngine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasParams) return;
  // the tank's pressure glides to its knob
  pT += (pTarget - pT) * (1 - std::exp(-n / (P_GLIDE * fs)));
  if (std::fabs(pTarget - pT) < 1e-6 * pTarget) pT = pTarget;
  // pitch bend: the pump pushes the air above the water until the pressure at the nozzles is × r²
  // (Minnaert: the bubbles' note × r); the bubbles already rising are squeezed or swell with it
  if (bendNow != bendTo) {
    bendNow += (bendTo - bendNow) * (1 - std::exp(-n / (BEND_T * fs)));
    if (std::fabs(bendNow - bendTo) < 1e-9) bendNow = bendTo;
  }
  if (bendNow == 1) pB = pT;
  else { const double col = env.liq->rho * G * P[p::depth]; pB = std::max(0.01 * P_ATM, bendNow * bendNow * (pT + col) - col); }
  // nozzles: release what is due in this block
  for (Nozzle &z : nozzles) {
    if (z.owed) { // the bubble a press owes, at the start of this block; the gaps run from it
      if (!release(z, 0)) continue; // pool full: next block
      z.owed = false; z.due = interval(z);
    }
    if (!z.held) continue;
    while (z.due < n) {
      if (!release(z, std::max(0, (int)std::floor(z.due)))) { z.due = n; break; } // pool full: try again next block
      z.due += interval(z);
    }
    z.due -= n;
  }
  for (Bubble &b : pool) if (b.on) render(b, L, R, n);
  frame += n;
  if (messages) postViews(n);
}

void BubbleEngine::postViews(int n) {
  // the latest bubble's waveform: as it fills, and once more when complete
  if (waveDone || (rec && ++recPost >= 8)) {
    recPost = 0;
    Message m;
    if (waveNew) {
      m.type = msg::waveStart; m.key = (int16_t)waveKey; m.count = 17;
      std::copy(waveMeta, waveMeta + 17, m.values);
      post(m);
      waveSent = 0; waveNew = false;
    }
    for (; waveSent < waveCount;) {
      const int c = std::min(29, waveCount - waveSent);
      m.type = msg::waveData; m.key = (int16_t)waveKey; m.count = (uint16_t)(c + 1);
      m.values[0] = (float)waveSent;
      std::copy(wave.begin() + waveSent, wave.begin() + waveSent + c, m.values + 1);
      post(m);
      waveSent += c;
    }
    m.type = msg::waveShow; m.key = (int16_t)waveKey; m.count = 2;
    m.values[0] = (float)waveCount; m.values[1] = waveDone ? 1 : 0;
    post(m);
    waveDone = false;
  }
  if (++blocks < POST_BLOCKS && nev == 0) return;
  blocks = 0;
  Message m;
  m.type = msg::bubbles; m.count = 4;
  m.values[0] = (float)std::floor(frame / 16777216.0); m.values[1] = (float)(frame % 16777216);
  m.values[2] = (float)n; m.values[3] = (float)voiceCount();
  post(m);
  nev = 0;
}

} // namespace forte::bubbles
