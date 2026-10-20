// huygens-engine.cpp — the neon-lamp engine (huygens-engine.h).

#include "huygens-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/fdlibm.h"

namespace forte::huygens {

using fdlibm::cos;
using fdlibm::exp;
using fdlibm::log;
using fdlibm::pow;
using fdlibm::sin;

static constexpr double PI = 3.141592653589793, TWO_PI = 2 * PI, SQRT2 = 1.4142135623730951;
static constexpr double BEND_T = 0.02;   // s: a note's bend glides with this time constant
static constexpr double BEND_TOP = 0.25; // a bent lamp plays at most fs/4: the polyBLEP corrects one reset at a time
static constexpr double SERVO_WIN = 0.12; // s: the pitch servo's window on each lamp

double tuneR(double f, const Neon &p) {
  return 1 / (f * p.cap * log((p.vNom - p.vExt) / (p.vNom - p.vStrike)));
}

// ---- an oscillator ---------------------------------------------------------------------------

void Osc::start(NeonEngine &eng, int k, double f, double phase, bool settled) {
  key = k; fTarget = f;
  C = eng.p.cap;
  driftCents = 0;
  bend = eng.bendOf(k, f); bentAt = INT64_MIN / 2; // a bend starts there
  retune(f, eng.p);
  // initial phase: random (a real key), or given (0 = just fired) for analysis
  const Neon &p = eng.p;
  const double ph = std::isnan(phase) ? eng.rand() : phase;
  V = p.vNom - (p.vNom - p.vExt) * exp(-ph * log((p.vNom - p.vExt) / (p.vNom - p.vStrike)));
  gate = settled ? 1 : 0;  // output keyer
  power = settled ? 1 : 0; // supply connection
  keyDown = true; dead = false;
  nf = 0; sent = 0;
  prevOut = 0; // one-sample delay for the polyBLEP
  hx = 0; hy = 0; // coupling-capacitor high-pass state
  I = 0;       // current drawn from the rail this sample
  drift = 0; driftCents = 0;
  supply = 0; V0 = 0; fireAt = -1;
  setPan(p.width);
}

void Osc::setPan(double width) {
  const double x = std::max(-1.0, std::min(1.0, ((key - 66) / 30.0) * width));
  panL = cos(((x + 1) * PI) / 4) * SQRT2;
  panR = sin(((x + 1) * PI) / 4) * SQRT2;
}

void Osc::retune(double f, const Neon &p) {
  fTarget = f;
  R = tuneR(f * bend, p);
  tau = R * C * pow(2, -driftCents / 1200);
}

void Osc::applyDrift(NeonEngine &eng, double dt) {
  const Neon &p = eng.p;
  if (p.drift <= 0 && driftCents == 0) return;
  const double tc = 1 / std::max(0.01, p.driftRate);
  const double u = eng.rand(), v = eng.rand();
  const double g = std::sqrt(-2 * log(u + 1e-12)) * cos(TWO_PI * v);
  drift += (-drift / tc) * dt + p.drift * std::sqrt((2 * dt) / tc) * g;
  driftCents = p.drift > 0 ? drift : 0;
  tau = R * C * pow(2, -driftCents / 1200); // resistor wander
}

// Phase 1 of a sample: connect the key, and find when (if ever) the lamp would strike on its own
// during this sample.
void Osc::plan(double vr, const NeonEngine &eng) {
  const double k = eng.k, vs = eng.p.vStrike;
  if (keyDown) {
    gate += (1 - gate) * eng.attackAlpha;
    power += (1 - power) * eng.attackAlpha;
  } else gate -= gate * eng.releaseAlpha;
  supply = vr * power;
  V0 = V;
  fireAt = -1;
  const double S = supply;
  if (S > vs && S - V0 > 1e-12) {
    const double ts = tau * log((S - V0) / (S - vs));
    if (ts < k) fireAt = ts / k;
  }
}

// capacitor voltage at fraction x of this sample, if it has not fired
double Osc::voltageAt(double x, double k) const { return supply + (V0 - supply) * exp((-x * k) / tau); }

// Phase 2: apply the (natural or triggered) firing, return output one sample late so a polyBLEP
// can correct both sides of each reset.
double Osc::finish(const NeonEngine &eng, double t) {
  const double k = eng.k, vs = eng.p.vStrike, ve = eng.p.vExt, S = supply;
  double Vn, jump = 0, d = 0;
  if (fireAt >= 0) {
    const double x = fireAt;
    fires[nf & 255] = t + x; nf++;
    const double vBefore = voltageAt(x, k);
    Vn = S + (ve - S) * exp((-(1 - x) * k) / tau);
    jump = vBefore - ve;
    d = 1 - x;
  } else Vn = voltageAt(1, k);
  // charge drawn through R this sample (the reset is the lamp's own loop)
  I = (C * (Vn - V0 + jump)) / k;
  V = Vn;
  double cur = Vn - 0.5 * (vs + ve);
  if (jump != 0 && !std::isnan(jump)) {
    const double h = -jump;                  // downward step
    prevOut += (h * d * d) / 2;              // polyBLEP, sample before
    cur += (-h * (1 - d) * (1 - d)) / 2;     // polyBLEP, sample after
  }
  const double keyed = prevOut;
  prevOut = cur * gate;
  // coupling capacitor: y[n] = x[n] − x[n−1] + ρ y[n−1]
  const double y = keyed - hx + eng.dcRho * hy;
  hx = keyed; hy = y;
  return y;
}

// Mean frequency over the last `win` seconds: least-squares slope of firing time against firing
// number.
double Osc::frequency(double t, double win, double fs) const {
  const int64_t n = std::min<int64_t>(nf, 256);
  if (n < 4) return 0;
  const double lastT = fires[(nf - 1) & 255];
  if (t - lastT > (3 * fs) / target()) return 0;
  double cnt = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (int64_t j = 1; j <= n; j++) {
    const double ts = fires[(nf - j) & 255];
    if (lastT - ts > win * fs) break;
    const double x = (double)-j;
    cnt++; sx += x; sy += ts; sxx += x * x; sxy += x * ts;
  }
  if (cnt < 4) return 0;
  const double slope = (cnt * sxy - sx * sy) / (cnt * sxx - sx * sx);
  return fs / slope;
}

// ---- the engine ------------------------------------------------------------------------------

NeonEngine::NeonEngine(double fs, uint32_t seed) : Engine(fs), k(1 / fs), rand(seed) {
  vr = p.vNom;
  update();
  // state for the page, at most 30 times a second: whole 128-sample blocks
  stateEvery = 128 * (int)std::ceil(fs / 128 / 30);
}

void NeonEngine::update() {
  attackAlpha = 1 - exp(-k / std::max(1e-4, p.attack));
  releaseAlpha = 1 - exp(-k / std::max(1e-4, p.release));
  regAlpha = 1 - exp(-k * TWO_PI * 4);
  dcRho = exp(-k * TWO_PI * std::max(0.0, p.dcCut));
}

// The descriptor's engineParams: the lamp voltages kept in order, 5 V apart (V_ext < V_s <
// supply). A change of tuning (the lamps' or the keyboard's) retunes the keys held down, as the
// page's 'retune' does.
void NeonEngine::setParams(const double *P) {
  const Neon old = p;
  p.kick = P[p::kick]; p.rSrc = P[p::rSrc]; p.pitchHold = P[p::pitchHold] != 0;
  p.drift = P[p::drift]; p.driftRate = P[p::driftRate];
  p.vNom = P[p::vNom]; p.vStrike = std::min(P[p::vStrike], P[p::vNom] - 5); p.vExt = std::min(P[p::vExt], P[p::vStrike] - 5);
  p.attack = P[p::attack]; p.release = P[p::release]; p.width = P[p::width];
  if (old.vNom != p.vNom || old.vStrike != p.vStrike || old.vExt != p.vExt) for (int i = 0; i < nos; i++) osc[i]->retune(osc[i]->fTarget, p);
  if (old.width != p.width) for (int i = 0; i < nos; i++) osc[i]->setPan(p.width);
  update();
  const int tu = (int)P[p::tuning], to = (int)P[p::tonic];
  const double mi = P[p::mistune];
  const forte::Tuning kb = tuningOf(P);
  if (tu != tuning || to != tonic || mi != mistune || !(kb == keyboard)) {
    tuning = tu; tonic = to; mistune = mi; keyboard = kb;
    for (int i = 0; i < nos; i++) if (osc[i]->keyDown && !osc[i]->dead) osc[i]->retune(keyTarget(osc[i]->key), p);
  }
}

double NeonEngine::bendOf(int key, double f) const {
  return std::min(expr.bendOf(key), std::max(1.0, (BEND_TOP * fs) / f));
}

void NeonEngine::retune(int key, double f) {
  if (key < 0 || key > 127) return;
  if (Osc *o = byKey[key]) o->retune(f, p);
}

// A slot for a new oscillator: a free one, else (only with more notes than slots between two
// blocks) one already dead, taken off the list at once.
Osc *NeonEngine::slot() {
  for (Osc &o : pool) if (!o.used) return &o;
  for (int i = 0; i < nos; i++) if (osc[i]->dead) {
    Osc *o = osc[i];
    if (byKey[o->key] == o) byKey[o->key] = nullptr;
    for (int j = i; j < nos - 1; j++) osc[j] = osc[j + 1];
    nos--;
    return o;
  }
  return nullptr;
}

void NeonEngine::noteOn(int key, double) {
  const bool had = offered;
  offered = false;
  last = nullptr;
  if (key < 0 || key > 127) return;
  const double f = had && !std::isnan(offF) ? offF : keyTarget(key);
  Osc *o = byKey[key];
  if (o && !o->dead) {
    o->keyDown = true;
    const double b = bendOf(key, f); // a bend starts there
    const bool bent = b != o->bend;
    if (bent) { o->bend = b; o->bentAt = t; }
    if (f != o->fTarget || bent) o->retune(f, p);
    last = o;
    return;
  }
  if (o) o->keyDown = false;
  o = slot();
  if (!o) return;
  o->used = true;
  o->start(*this, key, f, had ? offPhase : NAN, had && offSettled);
  osc[nos++] = o; byKey[key] = o;
  if (nos > p.maxOsc) {
    Osc *victim = osc[0];
    for (int i = 0; i < nos; i++) if (!osc[i]->keyDown) { victim = osc[i]; break; }
    victim->dead = true;
  }
  last = o;
}

void NeonEngine::noteOff(int key, double) {
  if (key < 0 || key > 127) return;
  if (Osc *o = byKey[key]) o->keyDown = false;
}

void NeonEngine::allNotesOff() { for (int i = 0; i < nos; i++) osc[i]->keyDown = false; }

// Every oscillator's period is R_i C·g(V) with the same g(V) = ln[(V − V_e)/(V − V_s)], so the
// supply voltage scales the whole keyboard without touching any interval. Pulse coupling only
// ever advances a lamp, so locked chords run sharp; this servo nudges the supply to hold the
// average pitch.
double NeonEngine::supplySetpoint(double dt) {
  if (p.pitchHold) {
    double err = 0;
    int n = 0;
    for (int i = 0; i < nos; i++) {
      const Osc &o = *osc[i];
      if (!o.keyDown || o.power < 0.9 || t - o.bentAt < SERVO_WIN * fs) continue;
      const double f = o.frequency((double)t, SERVO_WIN, fs);
      if (f > 0) { err += huygens::log2(f / o.target()) + hold; n++; }
    }
    // err: what each would play at the nominal supply, in octaves
    if (n) hold += ((err / n - hold) * dt) / p.holdTime;
    else hold *= exp(-dt / (4 * p.holdTime));
  } else hold = 0;
  const double g0 = log((p.vNom - p.vExt) / (p.vNom - p.vStrike));
  const double gT = g0 * pow(2, hold), e = exp(gT);
  return std::max(p.vStrike * 1.02, (p.vExt - p.vStrike * e) / (1 - e));
}

// keep order[0..n) sorted by firing time; equal times keep arrival order
static int insertByTime(Osc **order, int n, Osc *o) {
  int i = n;
  while (i > 0 && order[i - 1]->fireAt > o->fireAt) { order[i] = order[i - 1]; i--; }
  order[i] = o;
  return n + 1;
}
static int removeAt(Osc **order, int n, int i) {
  for (int j = i; j < n - 1; j++) order[j] = order[j + 1];
  return n - 1;
}

void NeonEngine::process(float *L, float *R, int n) {
  for (int j = 0; j < nos; j++) { // the bends glide, block by block: only those moving are retuned
    Osc &o = *osc[j];
    const double to = bendOf(o.key, o.fTarget);
    if (o.bend != to) { o.bend = glideTo(o.bend, to, n * k, BEND_T); o.retune(o.fTarget, p); o.bentAt = t; }
  }
  for (int j = 0; j < nos; j++) osc[j]->applyDrift(*this, n * k);
  const double vSet = supplySetpoint(n * k);
  const double tauRail = p.rSrc * p.cRail, eR = tauRail > 0 ? exp(-k / tauRail) : 0;
  const double g = 0.004 * p.master;
  const double kick = p.kick * (p.vStrike - p.vExt);
  for (int i = 0; i < n; i++) {
    double l = 0, r = 0, I = 0;
    const double v = vr;
    for (int j = 0; j < nos; j++) osc[j]->plan(v, *this);
    // Pulse coupling through the shared cathode resistor: when a lamp fires, its discharge
    // current briefly lifts the voltage across every other lamp by `kick`. Any lamp that close
    // to striking fires in the same instant (and may set off others); the rest are untouched.
    if (kick > 0 && nos > 1) {
      int no = 0;
      for (int j = 0; j < nos; j++) if (osc[j]->fireAt >= 0) no = insertByTime(order, no, osc[j]);
      for (int e = 0; e < no; e++) {
        Osc *src = order[e];
        const double x = src->fireAt;
        for (int j = 0; j < nos; j++) {
          Osc *o = osc[j];
          if (o == src || o->power < 0.5) continue;
          if (o->fireAt >= 0 && o->fireAt <= x) continue;
          if (o->voltageAt(x, k) + kick >= p.vStrike) {
            if (o->fireAt >= 0) {
              int at = -1;
              for (int m = e + 1; m < no; m++) if (order[m] == o) { at = m; break; }
              if (at >= 0) no = removeAt(order, no, at);
            }
            o->fireAt = x;
            no = insertByTime(order, no, o); // lands after src: equal times keep arrival order
          }
        }
      }
    }
    for (int j = 0; j < nos; j++) {
      Osc *o = osc[j];
      const double s = o->finish(*this, (double)t);
      I += o->I;
      l += o->panL * s; r += o->panR * s;
    }
    // rail: source (with optional regulator cancelling the average sag)
    Ilp += regAlpha * (I - Ilp);
    const double vSrc = vSet + (p.regulate ? p.rSrc * Ilp : 0);
    const double vInf = vSrc - p.rSrc * I;
    vr = vInf + (vr - vInf) * eR;
    L[i] = (float)(g * l); R[i] = (float)(g * r);
    t++;
  }
  int j = 0;
  for (int i = 0; i < nos; i++) {
    Osc *o = osc[i];
    if (!o->keyDown && o->gate < 1e-4) o->dead = true;
    if (o->dead) {
      if (byKey[o->key] == o) byKey[o->key] = nullptr;
      o->used = false;
      if (last == o) last = nullptr;
    } else osc[j++] = o;
  }
  nos = j;
  if (listening && (sinceState += n) >= stateEvery) {
    sinceState = 0;
    stateFires = drainFirings(fireBuf, kFireBuf);
    stateOsc = summary(oscBuf, kOscBuf);
    stateT = t; stateHold = hold;
    Message m;
    m.type = msg::state;
    post(m);
  }
}

int NeonEngine::drainFirings(double *buf, int cap) {
  int w = 0;
  for (int i = 0; i < nos; i++) {
    Osc &o = *osc[i];
    const int n = (int)std::min<int64_t>(o.nf - o.sent, 256);
    if (!o.keyDown || w + 2 + n > cap) { o.sent = o.nf; continue; }
    buf[w++] = o.key; buf[w++] = n;
    for (int64_t j = o.nf - n; j < o.nf; j++) buf[w++] = o.fires[j & 255];
    o.sent = o.nf;
  }
  return w;
}

int NeonEngine::summary(double *buf, int cap) const {
  int w = 0;
  for (int i = 0; i < nos; i++) {
    const Osc &o = *osc[i];
    if (o.keyDown && w + 3 <= cap) { buf[w++] = o.key; buf[w++] = o.target(); buf[w++] = o.driftCents; }
  }
  return w;
}

int NeonEngine::report(double win, Report *out, int cap) const {
  int w = 0;
  for (int i = 0; i < nos && w < cap; i++) {
    const Osc &o = *osc[i];
    out[w++] = {o.key, o.keyDown ? o.frequency((double)t, win, fs) : 0, o.target(), o.driftCents};
  }
  return w;
}

} // namespace forte::huygens
