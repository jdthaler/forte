// cimbalom-engine.cpp — the cimbalom's engine (cimbalom-engine.h).

#include "cimbalom-engine.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace forte::cimbalom {

using std::numbers::pi;

// the microphones' pressure, as heard: the dulcimer's lighter, smaller board radiates more for the
// same force, so it is heard from a little further off to match the cimbalom
constexpr double OUT_BOARD[2] = {0.005, 0.0025};
constexpr double BEND_T = 0.02;     // s: a note's own bend glides as the instruments that bend glide theirs
constexpr double KAPPA = 0.5;       // the sympathetic strings' share of the bridge's motion at full Sympathy
constexpr int REPORT_BLOCKS = 4;    // the page's state every few blocks
constexpr double QUIET = 3e-6;      // N: a course whose bridge force stays under this (20 blocks) has stopped
constexpr double HAMMER_LIFE = 0.05; // s: the hammer is followed this long at most after it is thrown
constexpr double HEAD_SHARE = 0.25;  // of the hammer's mass, in its head (the rest in the stick, as the strings feel it)
constexpr double STICK_ZETA = 0.08;  // the stick's flex: its damping ratio

CimbalomEngine::CimbalomEngine(double fs) : Engine(fs), sym(128, SYM_MODES, BLOCK, fs, false) {
  slides.fill(NAN);
  after.fill(-1);
  sym.quiet = 1e-6;
  boards[0].init(0, fs);
  boards[1].init(1, fs);
  for (int s = 0; s < NSEG; s++) bus[s] = seg.data() + s * BLOCK;
}

// What designs the strings: the build, their spread, the bridge, the losses and the tuning.
static bool modelParam(int i) { return i == p::build || i == p::detune || i == p::bridge || i == p::loss || i >= p::pitch; }

void CimbalomEngine::setParams(const double *p) {
  bool changed = !hasParams;
  for (int i = 0; i < p::count; i++) { if (P[i] != p[i] && modelParam(i)) changed = true; P[i] = p[i]; }
  const int oldBuild = hasParams ? mp.build : -1;
  mp = paramsOf(P.data());
  if (changed) {
    version++;
    // another instrument: what sounds fades out, its sympathetic strings and soundboard with it
    if (oldBuild >= 0 && oldBuild != mp.build) {
      for (int i = 0; i < nVoices; i++) if (voices[i]->fadeStep == 0) voices[i]->fadeStep = 1 / (0.02 * fs);
      for (int k = 0; k < 128; k++) sym.remove(k);
    }
  }
  hasParams = true;
}

CimbalomEngine::Voice *CimbalomEngine::find(int key) {
  for (int i = 0; i < nVoices; i++) if (voices[i]->key == key && voices[i]->fadeStep == 0) return voices[i];
  return nullptr;
}

CimbalomEngine::Voice *CimbalomEngine::allocate(int key) {
  // too many sounding: the quietest undamped course fades out, or else the oldest
  int live = 0;
  for (int i = 0; i < nVoices; i++) live += voices[i]->fadeStep == 0;
  if (live >= maxVoices()) {
    Voice *q = nullptr;
    for (int i = 0; i < nVoices; i++) { Voice *x = voices[i]; if (x->fadeStep == 0 && !x->down && (!q || x->peak < q->peak)) q = x; }
    if (!q) for (int i = 0; i < nVoices; i++) { Voice *x = voices[i]; if (x->fadeStep == 0 && (!q || x->age > q->age)) q = x; }
    if (q) q->fadeStep = 1 / (0.01 * fs);
  }
  Voice *v = nullptr;
  for (Voice &x : pool) if (!x.inUse) { v = &x; break; }
  if (!v) { // every slot busy (fading): the oldest goes at once
    int o = 0;
    for (int i = 1; i < nVoices; i++) if (voices[i]->age > voices[o]->age) o = i;
    v = voices[o];
    for (int i = o; i < nVoices - 1; i++) voices[i] = voices[i + 1];
    nVoices--;
  }
  v->inUse = true; v->key = key;
  voices[nVoices++] = v;
  return v;
}

static void coef(double w, double sg, double k, double &A1, double &A2, double &b) {
  const double r = std::exp(-sg * k), wd = std::sqrt(std::max(w * w - sg * sg, 1e-6));
  A1 = 2 * r * std::cos(wd * k); A2 = r * r;
  b = (k * r * std::sin(wd * k)) / wd; // impulse-invariant input gain
}

// The course's strings and their partials, from rest.
void CimbalomEngine::build(Voice &v) {
  const double k = 1 / fs;
  Course C = courseOf(v.key, mp);
  C.strings = std::min(C.strings, strTop());
  v.C = C; v.strings = C.strings;
  v.xh = std::clamp(slides[v.key] == slides[v.key] ? slides[v.key] : mp.strike, 0.01, 0.99) * C.L;
  const double fmax = std::min(fTop(), 0.45 * fs);
  std::array<Partial, N_MAX> ps;
  std::array<Partial, N_FAR> pf;
  int o = 0;
  for (int j = 0; j < C.strings; j++) {
    const int ns = partials(C, j, false, mp, v.xh, nTop(), fmax, ps.data());
    const int nf = partials(C, j, true, mp, 0, farTop(), fmax, pf.data());
    if (j == 0) { v.nStruck = ns; v.nFar = nf; }
    for (int i = 0; i < ns + nf; i++, o++) {
      const Partial &q = i < ns ? ps[i] : pf[i - ns];
      double b = 0, bd = 0;
      coef(TAU * q.f, q.sigma, k, v.A1[o], v.A2[o], b);
      coef(TAU * q.f, q.sigma + SIGMA_DAMPER, k, v.D1[o], v.D2[o], bd);
      v.wq[o] = TAU * q.f; v.sq[o] = q.sigma;
      const double c = std::sqrt(2 * q.sigB);
      v.bg[o] = b; v.bc[o] = b * c; v.cK[o] = c * fs; v.beta[o] = q.beta;
      v.bpsi[o] = b * q.psi / C.strings; v.psiy[o] = q.psi / C.strings;
      v.q[o] = v.q1[o] = 0;
    }
  }
  v.nOsc = o;
  v.liftK = 1; v.bent = 1;
  if (expr.bendOf(v.key) != 1) retune(v, expr.bendOf(v.key)); // bent before it was struck
  v.ver = version; v.built = quality;
  v.S = 0; v.fade = 1; v.fadeStep = 0; v.peak = 0; v.level = 0; v.age = 0; v.quiet = 0; v.strokes = 0;
  v.w = segmentWeights(C.place);
  v.h = Hammer{};
}

// A stroke: the hammer leaves the player's hand at `speed`, just above the strings where they are now.
void CimbalomEngine::launch(Voice &v, double speed) {
  // the strike point (the mod wheel, or the note's own slide) at this stroke
  const double xh = std::clamp(slides[v.key] == slides[v.key] ? slides[v.key] : mp.strike, 0.01, 0.99) * v.C.L;
  if (xh != v.xh) {
    v.xh = xh;
    const double nrm = std::sqrt(2 / (v.C.mu * v.C.L));
    for (int j = 0, o = 0; j < v.strings; j++, o += v.nFar)
      for (int n = 0; n < v.nStruck; n++, o++) {
        const double psi = nrm * std::sin((n + 1) * pi * xh / v.C.L);
        v.psiy[o] = psi / v.strings; v.bpsi[o] = v.bg[o] * psi / v.strings;
      }
  }
  double ys = 0;
  for (int i = 0; i < v.nOsc; i++) ys += v.psiy[i] * v.q[i];
  Hammer &h = v.h;
  h = Hammer{};
  h.active = true; h.face = faceOf(mp.head);
  // the head and the stick behind it, joined by the stick's flex: their relative mode at the Stick's frequency
  const double M = mp.mass * 1e-3, ws = TAU * mp.stick;
  h.m = HEAD_SHARE * M; h.ms = M - h.m;
  const double mr = h.m * h.ms / M;
  h.ks = mr * ws * ws; h.rs = 2 * STICK_ZETA * mr * ws;
  h.y = h.ys = ys; h.v = h.vs = speed; h.delta = 0;
  v.strokes++;
  if (v.key == focus) { historyLen = 0; historyDone = false; history.fill(0); }
}

void CimbalomEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < 0 || key > 127) return;
  Voice *v = find(key);
  // strings designed before a change to them (or to the Quality) are let go, and the key built anew
  if (v && (v->ver != version || v->built != quality)) { v->fadeStep = 1 / (0.01 * fs); v = nullptr; }
  if (!v) { v = allocate(key); build(*v); }
  down[key] = 1;
  v->down = true; v->vel = velocity; v->age = 0;
  v->nextRoll = mp.roll > 0 ? 1 / mp.roll : 0;
  focus = key;
  launch(*v, hammerSpeed(velocity));
}

void CimbalomEngine::damper(Voice &v, double scale) {
  if (scale == v.liftK) return;
  v.liftK = scale;
  double bd = 0;
  for (int o = 0; o < v.nOsc; o++) coef(v.wq[o] * v.bent, v.sq[o] + SIGMA_DAMPER / scale, 1 / fs, v.D1[o], v.D2[o], bd);
}

// The course tightened (or let go) to sound × r: every partial's recursions, struck and far side,
// at its frequency × r (the input gains as built).
void CimbalomEngine::retune(Voice &v, double r) {
  v.bent = r;
  double b = 0;
  for (int o = 0; o < v.nOsc; o++) {
    coef(v.wq[o] * r, v.sq[o], 1 / fs, v.A1[o], v.A2[o], b);
    coef(v.wq[o] * r, v.sq[o] + SIGMA_DAMPER / v.liftK, 1 / fs, v.D1[o], v.D2[o], b);
  }
}

// Lift: with the dampers on the keys, how fast the felt falls back on the course as the key
// comes up: a slow lift lets it settle gently, a longer tail, a fast one stops it sooner.
void CimbalomEngine::noteOff(int key, double velocity) {
  if (key < 0 || key > 127) return;
  down[key] = 0;
  for (int i = 0; i < nVoices; i++) if (voices[i]->key == key) { voices[i]->down = false; damper(*voices[i], sustain || mp.dampers != dampers_::keys ? 1 : liftScale(velocity)); }
}

void CimbalomEngine::allNotesOff() {
  for (int i = 0; i < nVoices; i++) voices[i]->fadeStep = 1 / (0.01 * fs);
  for (int k = 0; k < 128; k++) { down[k] = 0; sym.clear(k); }
}

void CimbalomEngine::pressure(double value, int key) {
  if (key < 0) { after.fill(value); return; }
  if (key < 128) after[key] = value;
}
void CimbalomEngine::slide(double value, int key) { if (key >= 0 && key < 128) slides[key] = value; }

// One voice for n samples: the strings, the hammer while it is near them, the tremolo's strokes.
// Adds the bridge force into the board's segments and the bridge signal into Sall.
void CimbalomEngine::render(Voice &v, int n, double *sg) {
  const double k = 1 / fs;
  if (const double to = expr.bendOf(v.key); v.bent != to) retune(v, glideTo(v.bent, to, n * k, BEND_T)); // Glide
  Hammer &h = v.h;
  const bool histOn = v.key == focus && !historyDone;
  double blockPeak = 0;
  for (int t = 0; t < n; t++) {
    // the tremolo: another stroke, the hands alternating, as hard as the key is pressed (once it says)
    if (v.down && mp.roll > 0) {
      v.nextRoll -= k;
      if (v.nextRoll <= 0) {
        rng = rng * 1664525u + 1013904223u;
        const double r = (rng >> 8) * (1.0 / 16777216.0);
        v.nextRoll += (1 / mp.roll) * (1 + 0.12 * (r - 0.5));
        const double pr = after[v.key] >= 0 ? 0.3 + 0.9 * after[v.key] : (v.strokes % 2 ? 0.8 : 0.7);
        launch(v, hammerSpeed(v.vel) * pr);
      }
    }
    v.damped = mp.dampers != dampers_::none && !sustain && !(mp.dampers == dampers_::keys && v.down);
    const double *a1 = v.damped ? v.D1.data() : v.A1.data(), *a2 = v.damped ? v.D2.data() : v.A2.data();
    const double S0 = v.S;
    double S = 0, Fb = 0;
    double *q = v.q.data(), *q1 = v.q1.data();
    const double *bc = v.bc.data(), *cK = v.cK.data(), *beta = v.beta.data();
    const int N = v.nOsc;
    if (h.active) {
      // the strings' next step without the hammer, then the force the compression it leaves gives
      double yfree = 0, H = 0;
      for (int i = 0; i < N; i++) {
        const double x = a1[i] * q[i] - a2[i] * q1[i] - bc[i] * S0;
        v.tmp[i] = x; yfree += v.psiy[i] * x; H += v.psiy[i] * v.bpsi[i];
      }
      const double Fs = h.ks * (h.ys - h.y) + h.rs * (h.vs - h.v); // the stick on the head
      const double dfree = h.y + k * (h.v + k * Fs / h.m) - yfree, D = H + k * k / h.m, d0 = h.delta;
      double F = 0;
      if (dfree > 0) {
        const Face &f = h.face;
        const auto g = [&](double Fx, double &dg) {
          const double d1 = dfree - D * Fx;
          if (d1 <= 0) { dg = 1; return Fx; }
          const double s = std::max(0.0, 1 + f.alpha * (d1 - d0) / k), pw = f.K * std::pow(d1, f.p);
          dg = 1 + D * (f.p * pw / d1 * s + (s > 0 ? pw * f.alpha / k : 0));
          return Fx - pw * s;
        };
        double lo = 0, hi = dfree / D;
        F = 0.5 * hi;
        for (int it = 0; it < 40; it++) {
          double dg;
          const double gv = g(F, dg);
          if (gv > 0) hi = F; else lo = F;
          double Fn = F - gv / dg;
          if (!(Fn > lo && Fn < hi)) Fn = 0.5 * (lo + hi);
          if (std::fabs(Fn - F) <= 1e-12 * (1 + hi)) { F = Fn; break; }
          F = Fn;
        }
      }
      h.v += k * (Fs - F) / h.m;
      h.y += k * h.v;
      h.vs -= k * Fs / h.ms;
      h.ys += k * h.vs;
      h.delta = dfree - D * F;
      h.F = F;
      for (int i = 0; i < N; i++) {
        const double x = v.tmp[i] + v.bpsi[i] * F;
        S += cK[i] * (x - q[i]); Fb += beta[i] * x;
        q1[i] = q[i]; q[i] = x;
      }
      if (F > 0) { if (!h.touching) h.contacts++; h.touching = true; h.onTime += k; h.peakF = std::max(h.peakF, F); }
      else h.touching = false;
      if (histOn && historyLen < HISTORY) history[historyLen++] = F;
      h.age += k;
      if ((h.v < 0 && h.vs < 0 && h.delta < -0.5e-3) || h.age > HAMMER_LIFE) {
        h.active = false; h.F = 0;
        if (v.key == focus) { lastPeakF = h.peakF; lastOn = h.onTime; lastContacts = h.contacts; }
      }
    } else {
      for (int i = 0; i < N; i++) {
        const double x = a1[i] * q[i] - a2[i] * q1[i] - bc[i] * S0;
        S += cK[i] * (x - q[i]); Fb += beta[i] * x;
        q1[i] = q[i]; q[i] = x;
      }
      if (histOn && historyLen > 0 && historyLen < HISTORY) history[historyLen++] = 0;
    }
    v.S = S;
    double g = 1;
    if (v.fadeStep > 0) { v.fade = std::max(0.0, v.fade - v.fadeStep); g = v.fade; }
    v.Sblock[t] = S * g;
    Sall[t] += S * g;
    const double out = Fb * g;
    for (int s = 0; s < NSEG; s++) sg[s * BLOCK + t] += v.w[s] * out;
    blockPeak = std::max(blockPeak, std::fabs(out));
  }
  v.peak = std::max(v.peak * 0.97, blockPeak);
  // the level the Decay view draws: the peak, held through two periods (or 30 ms) so that it reads the
  // envelope, not the blocks' phase in the wave
  v.level = std::max(blockPeak, v.level * std::exp(-n / (fs * std::max(0.03, 2 / v.C.f0))));
  v.age += n * k;
  v.quiet = (!h.active && blockPeak < QUIET) ? v.quiet + 1 : 0;
}

// The sympathetic strings: each key's course as its in-phase mode (c√ν), a few partials, rebuilt
// a few keys a block when the strings change.
void CimbalomEngine::symRefresh() {
  if (quality != symQuality) { symQuality = quality; for (int key = 0; key < 128; key++) symVer[key] = 0; }
  const int nm = symModes();
  for (int done = 0, tries = 0; done < 8 && tries < KEY_MAX - KEY_MIN + 1; tries++) {
    const int key = KEY_MIN + symNext;
    symNext = (symNext + 1) % (KEY_MAX - KEY_MIN + 1);
    if (symVer[key] == version) continue;
    done++;
    symVer[key] = version;
    if (nm == 0) { sym.remove(key); continue; }
    const Course C = courseOf(key, mp);
    std::array<Partial, SYM_MODES> ps;
    const int n = partials(C, 0, false, mp, 0.5 * C.L, nm, std::min(fTop(), 0.45 * fs), ps.data());
    std::array<SympatheticMode, SYM_MODES> m;
    const double nu = C.strings;
    for (int i = 0; i < n; i++) {
      SympatheticMode &d = m[i];
      d.omega = TAU * ps[i].f;
      d.sigma = ps[i].sigma + nu * ps[i].sigB;
      d.damped = d.sigma + SIGMA_DAMPER;
      d.cV = std::sqrt(2 * nu * ps[i].sigB); d.cH = 0;
      d.oV = std::sqrt(nu) * ps[i].beta; d.oH = 0;
      d.loud = d.oV;
    }
    sym.set(key, m.data(), n);
    const auto w = segmentWeights(C.place);
    const Sympathetic::Tap t[NSEG] = {{0, w[0], 0}, {1, w[1], 0}, {2, w[2], 0}};
    sym.route(key, t, NSEG);
  }
}

void CimbalomEngine::process(float *L, float *R, int n) {
  for (int off = 0; off < n; off += BLOCK) {
    const int m = std::min(BLOCK, n - off);
    seg.fill(0);
    std::fill(Sall.begin(), Sall.begin() + m, 0.0);
    if (hasParams) symRefresh();
    for (int i = 0; i < nVoices; i++) render(*voices[i], m, seg.data());
    // the sympathetic strings, driven by every voice but their own key's
    if (hasParams) {
      const double kap = KAPPA * mp.sympathy;
      for (int key = KEY_MIN; key <= KEY_MAX; key++) sym.damp(key, mp.dampers != dampers_::none && !sustain && !(mp.dampers == dampers_::keys && down[key]));
      for (int i = 0; i < nVoices; i++) if (sym.size(voices[i]->key)) sym.own(voices[i]->key, voices[i]->Sblock.data(), nullptr);
      if (kap > 0 && symModes() > 0) sym.run(kap, Sall.data(), zeros.data(), nVoices > 0, m, bus.data());
      else { for (int key = KEY_MIN; key <= KEY_MAX; key++) sym.clear(key); sym.running = 0; }
    }
    Board &b = boards[mp.build == build_::dulcimer ? 1 : 0];
    b.run(seg.data(), bL.data(), bR.data(), m);
    const double out = OUT_BOARD[mp.build == build_::dulcimer ? 1 : 0];
    for (int t = 0; t < m; t++) { L[off + t] = (float)(out * bL[t]); R[off + t] = (float)(out * bR[t]); }
    // finished and faded voices
    int w = 0;
    for (int i = 0; i < nVoices; i++) {
      Voice *v = voices[i];
      const bool gone = (v->fadeStep > 0 && v->fade <= 0) || v->quiet > 20;
      if (gone) v->inUse = false; else voices[w++] = v;
    }
    nVoices = w;
    if (++tick % REPORT_BLOCKS == 0) report();
  }
}

void CimbalomEngine::report() {
  Voice *v = focus >= 0 ? find(focus) : nullptr;
  if (v) {
    Message m;
    m.type = msg::shape; m.key = (int16_t)v->key; m.count = 30;
    const double nrm = std::sqrt(2 / (v->C.mu * v->C.L)), nrf = v->C.Lfar > 0 ? std::sqrt(2 / (v->C.mu * v->C.Lfar)) : 0;
    m.values[0] = (float)v->C.L; m.values[1] = (float)v->C.Lfar; m.values[2] = (float)v->xh;
    m.values[3] = (float)(v->h.active ? -v->h.delta * 1e3 : -1);
    m.values[4] = (float)v->h.F; m.values[5] = (float)v->C.side;
    for (int i = 0; i < 12; i++) m.values[6 + i] = (float)(i < v->nStruck ? nrm * v->q[i] * 1e3 : 0);
    for (int i = 0; i < 8; i++) m.values[18 + i] = (float)(i < v->nFar ? nrf * v->q[v->nStruck + i] * 1e3 : 0);
    m.values[26] = (float)v->strings; m.values[27] = (float)v->damped; m.values[28] = (float)v->C.f0; m.values[29] = (float)v->C.ffar;
    post(m);
  }
  {
    Message m;
    m.type = msg::state; m.key = (int16_t)focus; m.count = 8;
    const double lv = v ? v->level : 0;
    m.values[0] = (float)(lv > 0 ? 20 * std::log10(lv) : -200);
    m.values[1] = (float)(v ? v->peak : 0); m.values[2] = (float)nVoices;
    m.values[3] = (float)lastPeakF; m.values[4] = (float)lastOn; m.values[5] = (float)lastContacts;
    m.values[6] = (float)sym.running; m.values[7] = (float)(v && v->damped);
    post(m);
  }
  // the stroke's force, once the hammer has gone (or the record is full)
  if (!historyDone && historyLen > 0 && (historyLen >= HISTORY || !(v && v->h.active))) {
    historyDone = true;
    int last = 0;
    for (int i = 0; i < historyLen; i++) if (history[i] > 0) last = i;
    const int span = std::min(HISTORY, std::max(24, (int)(last * 1.25) + 4)), dec = std::max(1, (span + 83) / 84);
    for (int c = 0; c < 3; c++) {
      Message m;
      m.type = msg::contact; m.key = (int16_t)c; m.count = 30;
      m.values[0] = (float)(dec / fs); m.values[1] = (float)std::min(84, (span + dec - 1) / dec);
      for (int i = 0; i < 28; i++) {
        const int j = (c * 28 + i) * dec;
        double mx = 0;
        for (int u = 0; u < dec && j + u < historyLen; u++) mx = std::max(mx, history[j + u]);
        m.values[2 + i] = (float)mx;
      }
      post(m);
    }
  }
}

// ---- the soundboard

static void hpCoeffs(double f, double fs, double &b0, double &b1, double &b2, double &a1, double &a2) {
  const double w = (2 * pi * std::min(f, 0.45 * fs)) / fs, c = std::cos(w), al = std::sin(w) / std::numbers::sqrt2, a0 = 1 + al;
  b0 = (1 + c) / 2 / a0; b1 = -(1 + c) / a0; b2 = (1 + c) / 2 / a0; a1 = (-2 * c) / a0; a2 = (1 - al) / a0;
}
static double hp100(double f) { return (f / 100) / std::hypot(1.0, f / 100); } // the acoustic short circuit round the case
// |pressure per newton| at mic j from segment s, rms over the top third of the modal band: the
// residual path's level, so the two join.
static double residualGain(const BoardModel &B, int s, int j) {
  double e = 0;
  for (int i = 0; i < 32; i++) {
    const double f = B.fTop * (0.66 + (0.34 * i) / 31), w = 2 * pi * f;
    double re = 0, im = 0;
    for (int k = 0; k < B.K; k++) {
      const double wk = 2 * pi * B.f[k], d = wk * wk - w * w, s2 = 2 * B.sigma[k] * w, den = d * d + s2 * s2;
      const double gk = B.mic[2 * k + j] * hp100(B.f[k]) * B.phi[k * NSEG + s] * -w * w;
      re += (gk * d) / den; im -= (gk * s2) / den;
    }
    e += re * re + im * im;
  }
  return std::sqrt(e / 32);
}

void CimbalomEngine::Board::init(int build, double fs) {
  const BoardModel &B = boardModel(build);
  const double k = 1 / fs;
  K = B.K;
  for (int i = 0; i < K; i++) {
    const double om = 2 * pi * B.f[i], sig = B.sigma[i], r = std::exp(-sig * k), od = std::sqrt(om * om - sig * sig);
    a1[i] = 2 * r * std::cos(od * k); a2[i] = r * r;
    const double b = (k * r * std::sin(od * k)) / od;
    for (int s = 0; s < NSEG; s++) ph[i * NSEG + s] = b * B.phi[i * NSEG + s];
    ml[i] = fs * fs * B.mic[2 * i] * hp100(B.f[i]); mr[i] = fs * fs * B.mic[2 * i + 1] * hp100(B.f[i]);
  }
  const double fb = 1 / (2 * pi * B.spec.mb * B.Ginf);
  lpG = 1 - std::exp((-2 * pi * fb) / fs);
  for (int s = 0; s < NSEG; s++) {
    const double g = std::hypot(residualGain(B, s, 0), residualGain(B, s, 1)), pan = ((0.5 * s - 0.5) * 0.8 + 1) * pi / 4;
    res[2 * s] = g * std::cos(pan); res[2 * s + 1] = g * std::sin(pan);
  }
  hpCoeffs(B.fTop, fs, b0, b1, b2, ha1, ha2);
}

void CimbalomEngine::Board::run(const double *sg, double *Lo, double *Ro, int n) {
  double *z = hz.data();
  for (int t = 0; t < n; t++) {
    double rl = 0, rr = 0;
    for (int s = 0; s < NSEG; s++) { lp[s] += lpG * (sg[s * BLOCK + t] - lp[s]); rl += res[2 * s] * lp[s]; rr += res[2 * s + 1] * lp[s]; }
    const double f0 = lp[0], f1 = lp[1], f2 = lp[2];
    double mlv = 0, mrv = 0;
    for (int i = 0, j = 0; i < K; i++, j += NSEG) {
      const double x0 = e0[i], x1 = e1[i];
      const double xn = a1[i] * x0 - a2[i] * x1 + ph[j] * f0 + ph[j + 1] * f1 + ph[j + 2] * f2;
      const double acc = xn - 2 * x0 + x1;
      e1[i] = x0; e0[i] = xn;
      mlv += ml[i] * acc; mrv += mr[i] * acc;
    }
    double y = rl;
    for (int b = 0; b < 2; b++) { const int o = 2 * b; const double v = b0 * y + z[o]; z[o] = b1 * y - ha1 * v + z[o + 1]; z[o + 1] = b2 * y - ha2 * v; y = v; }
    mlv += y;
    y = rr;
    for (int b = 2; b < 4; b++) { const int o = 2 * b; const double v = b0 * y + z[o]; z[o] = b1 * y - ha1 * v + z[o + 1]; z[o + 1] = b2 * y - ha2 * v; y = v; }
    mrv += y;
    Lo[t] = mlv; Ro[t] = mrv;
  }
  constexpr double TINY = 1e-30;
  auto flush = [](double &x) { if (std::fabs(x) < TINY) x = 0; };
  for (double &x : lp) flush(x);
  for (double &x : hz) flush(x);
  for (int i = 0; i < K; i++) { flush(e0[i]); flush(e1[i]); }
}

} // namespace forte::cimbalom
