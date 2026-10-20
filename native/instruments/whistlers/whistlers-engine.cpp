// whistlers-engine.cpp — the Whistlers' engine (whistlers-engine.h).

#include "whistlers-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"

namespace forte::whistlers {

constexpr double OUT = 0.3;          // a whistler's nose (the Airy peak) at full velocity
constexpr double CLICK = 0.5;        // the crack's click
constexpr double TWEEK = 0.12;       // each tweek mode
constexpr double CHORUS = 0.12;      // a chorus element at its loudest
constexpr double PRESS_T = 0.02;     // s: a key's pressure is followed with this time constant
constexpr double STEAL_T = 0.005;    // s: a stolen voice fades with this time constant
constexpr double SILENT = 1e-7;      // a component quieter than this (−140 dB) past its nose is done
constexpr double ENV_SILENT = 1e-4;  // a receiver faded to this (−80 dB) is closed
constexpr double TWEEK_TOP = 0.42;   // the tweeks start at this share of the sample rate
constexpr double CLICK_LO = 1000, CLICK_HI = 10000; // Hz: the click's band
constexpr int FIRST = 21, LAST = 108;
constexpr int CB = 32;               // samples per control step: frequencies and amplitudes are set this often

WhistlersEngine::WhistlersEngine(double fs) : Engine(fs), rng(0x77e15e1u), lines(LAST - FIRST + 1) { voices.reserve(2 * kMaxVoices); }

void WhistlersEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
}

int WhistlersEngine::voiceCount() const {
  int n = 0;
  for (const Voice &v : voices) n += !v.stolen;
  return n;
}

const KeyLines &WhistlersEngine::linesOf(int key) {
  KeyLines &k = lines[std::clamp(key, FIRST, LAST) - FIRST];
  const double f = keyFreq(key) * tuningOf(P.data()).ratio(key);
  const int ducts = std::clamp((int)std::lround(P[p::ducts]), 1, MAX_DUCTS);
  const double dens = P[p::density], lpp = P[p::plasmapause], spread = P[p::spread];
  if (k.valid && k.f == f && k.density == dens && k.lpp == lpp && (ducts == 1 || k.spread == spread) && k.ducts >= ducts) return k;
  // the key's own line, whose nose is its note; the others' a step of `spread` farther out and
  // nearer in, alternately (they keep what was built for the ones they share)
  const bool same = k.valid && k.f == f && k.density == dens && k.lpp == lpp;
  const int from = same && (k.ducts == 1 || k.spread == spread) ? k.ducts : same ? 1 : 0;
  if (from == 0) trackOf(k.tr[0], lineFor(f, lpp, dens), lpp, dens);
  const double L0 = k.tr[0].line.L;
  for (int d = std::max(1, from); d < ducts; d++) {
    const int step = (d + 1) / 2, sign = d % 2 ? 1 : -1;
    trackOf(k.tr[d], L0 * (1 + sign * step * spread), lpp, dens);
  }
  k.valid = true; k.f = f; k.density = dens; k.lpp = lpp; k.spread = spread; k.ducts = std::max(ducts, from);
  return k;
}

void WhistlersEngine::start(Voice &v, int key, double velocity) {
  const KeyLines &k = linesOf(key);
  v.key = key; v.vel = velocity;
  v.ducts = std::clamp((int)std::lround(P[p::ducts]), 1, pick(MAX_DUCTS, 3, 2)); // Quality: fewer ducts
  for (int d = 0; d < v.ducts; d++) v.tr[d] = k.tr[d];
  v.scale = 1 / (2 * v.tr[0].cap); // the first hop's nose (both branches together) at 1
  // the hops this receiver hears, and their level: each further one has travelled the line twice
  // more and been reflected twice more
  const int h0 = (int)P[p::receiver] == receiver_::source ? 2 : 1;
  const double R = P[p::echo], least = pick(1e-3, 1e-2, 3e-2); // Quality: fewer echoes
  v.ncomp = 0;
  double first = INFINITY;
  for (int d = 0; d < v.ducts; d++) {
    const double weight = d == 0 ? 1 : 0.35 + 0.55 * rng.uniform();
    const Track &t = v.tr[d];
    first = std::min(first, h0 * t.nose.tau - 1.5 * t.ta * std::cbrt((double)h0));
    double g = 1;
    for (int j = 0; j < MAX_HOPS && g >= least; j++, g *= R * R) {
      for (int dir : {-1, 1}) {
        if (dir > 0 && t.f[NLO] <= t.nose.f) continue; // no upper branch: the nose is past the duct's cutoff
        Comp &c = v.comps[v.ncomp++];
        c = Comp{};
        c.duct = d; c.hop = h0 + 2 * j; c.dir = dir; c.idx = NLO - 1;
        c.gain = g * weight;
      }
      if (R <= 0) break;
    }
  }
  const bool travel = P[p::travel] > 0.5;
  v.clock = travel ? 0 : first;
  // the crack along the ground: it reaches the receiver d / c after the stroke
  const double h = P[p::iono], dist = P[p::distance];
  v.sfClock = travel ? 0 : dist / C_KM;
  v.ntweek = 0;
  if (P[p::sferic] > 0) {
    const int most = pick(MAX_TWEEKS, 4, 2); // Quality: fewer tweek modes
    for (int m = 1; m <= most && tweekCutoff(m, h) < 0.9 * TWEEK_TOP * fs; m++) { v.tweeks[v.ntweek] = Tweek{}; v.tweeks[v.ntweek++].m = m; }
  }
  v.clicked = P[p::sferic] <= 0;
  v.lp1 = v.lp2 = 0;
  for (Element &e : v.el) e.live = false;
  v.toNext = 0;
  v.env = 1; v.held = true; v.stolen = false; v.done = false;
  v.press = v.pressTarget = 0;
  // what the page draws
  Message m;
  m.type = kStroke; m.key = (int16_t)key; m.count = 12;
  const Track &t = v.tr[0];
  const double vals[12] = {t.line.L, t.line.fce, t.nose.f, t.nose.tau, v.clock, travel ? 1.0 : 0.0, t.line.neq, t.line.alpha, (double)v.ducts, (double)h0, velocity, R};
  for (int i = 0; i < 12; i++) m.values[i] = (float)vals[i];
  post(m);
}

void WhistlersEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < FIRST || key > LAST) return;
  // past kMaxVoices (fewer at Medium and Low Quality), the quietest let-go voice (or else the
  // oldest) fades out
  int live = 0;
  Voice *victim = nullptr;
  for (Voice &x : voices) {
    if (x.stolen) continue;
    live++;
    if (!x.held && (!victim || x.env < victim->env)) victim = &x;
  }
  if (live >= pick(kMaxVoices, 16, 10)) { // Quality: fewer strokes heard at once
    if (!victim) for (Voice &x : voices) if (!x.stolen) { victim = &x; break; }
    if (victim) victim->stolen = true;
  }
  if ((int)voices.size() >= 2 * kMaxVoices) {
    for (auto it = voices.begin(); it != voices.end(); ++it) if (it->stolen) { voices.erase(it); break; }
  }
  voices.emplace_back();
  start(voices.back(), key, velocity);
}

void WhistlersEngine::noteOff(int key, double) {
  for (Voice &v : voices) if (v.key == key && v.held) v.held = false;
}

void WhistlersEngine::pressure(double value, int key) {
  for (Voice &v : voices) if (key < 0 || key == v.key) v.pressTarget = value;
}

// A component's frequency and amplitude at T s after the stroke: the frequency whose delay over
// its hops is T, on its branch (before its nose arrives, the nose's, rising as the Airy function).
void WhistlersEngine::evalComp(const Voice &v, const Comp &c, double T, double &f, double &a) const {
  const Track &t = v.tr[c.duct];
  const double n = c.hop, tn = n * t.nose.tau, ta = t.ta * std::cbrt(n), rise = 1.5 * ta;
  const double cap = t.cap * std::pow(n, -1.0 / 3);
  if (T < tn) {
    f = t.nose.f;
    a = T <= tn - rise ? 0 : cap * 0.5 * (1 - std::cos(std::numbers::pi * (T - (tn - rise)) / rise));
    return;
  }
  const int i = c.idx, j = i + c.dir;
  if (j < 0 || j >= NT) { f = t.f[i]; a = 0; return; }
  const double t0 = n * t.tau[i], t1 = n * t.tau[j], u = std::clamp((T - t0) / std::max(1e-30, t1 - t0), 0.0, 1.0);
  f = t.f[i] + u * (t.f[j] - t.f[i]);
  // 1/A² is |dτ/df| / S², which goes to 0 at the nose: interpolate that
  const auto inv2 = [&](int k) { return k == NLO - 1 ? 0.0 : t.amp[k] > 0 ? 1 / (t.amp[k] * t.amp[k]) : 1e30; };
  const double q = n * (inv2(i) + u * (inv2(j) - inv2(i)));
  a = 1 / std::sqrt(q + 1 / (cap * cap));
}

void WhistlersEngine::play(Voice &v, float *L, float *R, int n) {
  const double dt = n / fs;
  // the receiver: open while the key or the pedal holds it, then fading
  if (v.stolen) v.env *= std::exp(-dt / STEAL_T);
  else if (!v.held && !sustain) v.env *= std::exp(-dt / P[p::release]);
  v.press += (v.pressTarget - v.press) * (1 - std::exp(-dt / PRESS_T));
  const double out = OUT * v.vel * v.scale;
  const double T0 = v.clock, T1 = T0 + dt;
  bool any = false;
  // the whistler: every duct, hop and branch
  for (int k = 0; k < v.ncomp; k++) {
    Comp &c = v.comps[k];
    if (c.done) continue;
    any = true;
    const Track &t = v.tr[c.duct];
    // walk the branch to the frequency arriving at T1
    const double hop = c.hop;
    if (T1 >= hop * t.nose.tau) {
      if (c.dir < 0) { while (c.idx > 0 && hop * t.tau[c.idx - 1] <= T1) c.idx--; }
      else { while (c.idx < NT - 1 && hop * t.tau[c.idx + 1] <= T1) c.idx++; }
    }
    double f1, a1;
    evalComp(v, c, T1, f1, a1);
    a1 *= c.gain * out;
    const double w1 = (TAU * std::min(f1, 0.45 * fs)) / fs, a0 = c.a, w0 = c.w > 0 ? c.w : w1;
    if (a0 > 0 || a1 > 0) {
      double zr = c.zr, zi = c.zi, rr = std::cos(w0), ri = std::sin(w0);
      const double dw = (w1 - w0) / n, dr = std::cos(dw), di = std::sin(dw), da = (a1 - a0) / n;
      double a = a0, e = v.env, de = 0;
      (void)de;
      for (int i = 0; i < n; i++) {
        L[i] = (float)(L[i] + a * e * zi);
        R[i] = (float)(R[i] + a * e * zr);
        const double t2 = zr * rr - zi * ri; zi = zr * ri + zi * rr; zr = t2;
        const double r2 = rr * dr - ri * di; ri = rr * di + ri * dr; rr = r2;
        a += da;
      }
      const double m = 1 / std::hypot(zr, zi);
      c.zr = zr * m; c.zi = zi * m;
    }
    c.w = w1; c.a = a1;
    const bool end = c.dir < 0 ? c.idx == 0 : c.idx >= NT - 1;
    if (T1 > hop * t.nose.tau && (a1 < SILENT || end)) c.done = true;
  }
  // the crack: a click, then each waveguide mode's tweek, sliding down onto its cutoff
  const double S0 = v.sfClock, S1 = S0 + dt, h = P[p::iono], dist = P[p::distance], t0 = dist / C_KM;
  const double lvl = P[p::sferic] * v.vel, cl = std::cos(SFERIC_AZ), cr = std::sin(SFERIC_AZ);
  if (!v.clicked) {
    any = true;
    const double g1 = 1 - std::exp(-TAU * CLICK_HI / fs), g2 = 1 - std::exp(-TAU * CLICK_LO / fs);
    const int at = S1 > t0 ? std::clamp((int)std::ceil((t0 - S0) * fs), 0, n - 1) : -1;
    double y1 = v.lp1, y2 = v.lp2;
    for (int i = 0; i < n; i++) {
      const double x = i == at && v.click == 0 ? CLICK * lvl : 0;
      y1 += g1 * (x - y1); y2 += g2 * (x - y2);
      const double y = (y1 - y2) * v.env;
      L[i] = (float)(L[i] + cl * y); R[i] = (float)(R[i] + cr * y);
    }
    if (at >= 0) v.click = 1;
    v.lp1 = y1; v.lp2 = y2;
    if (v.click > 0 && std::fabs(y1) < 1e-9 && std::fabs(y2) < 1e-9) v.clicked = true;
  }
  const double ftop = TWEEK_TOP * fs, f1c = tweekCutoff(1, h);
  for (int k = 0; k < v.ntweek; k++) {
    Tweek &tw = v.tweeks[k];
    if (tw.done) continue;
    any = true;
    const double ts = tweekStart(tw.m, h, dist, ftop);
    if (S1 <= ts) continue;
    const double f = std::min(ftop, tweekFreq(tw.m, h, dist, S1)), fm = tweekCutoff(tw.m, h);
    // near its cutoff a mode bounces between the ground and the ionosphere f₁ (f_m / f) times a
    // second, losing a little at each bounce
    tw.loss *= std::exp(-f1c * (fm / f) * -std::log(BOUNCE_R) * dt);
    const double ramp = std::min(1.0, (S1 - ts) / 3e-4);
    const double a1 = TWEEK * lvl * tweekAmp(tw.m, h, dist, f) * tw.loss * ramp;
    const double w1 = (TAU * f) / fs, w0 = tw.w > 0 ? tw.w : w1, a0 = tw.a;
    double zr = tw.zr, zi = tw.zi, rr = std::cos(w0), ri = std::sin(w0);
    const double dw = (w1 - w0) / n, dr = std::cos(dw), di = std::sin(dw), da = (a1 - a0) / n;
    double a = a0;
    for (int i = 0; i < n; i++) {
      const double y = a * v.env * zi;
      L[i] = (float)(L[i] + cl * y); R[i] = (float)(R[i] + cr * y);
      const double t2 = zr * rr - zi * ri; zi = zr * ri + zi * rr; zr = t2;
      const double r2 = rr * dr - ri * di; ri = rr * di + ri * dr; rr = r2;
      a += da;
    }
    const double m = 1 / std::hypot(zr, zi);
    tw.zr = zr * m; tw.zi = zi * m; tw.w = w1; tw.a = a1;
    if (a1 < SILENT && S1 > ts + 0.01) tw.done = true;
  }
  // chorus: while the key is held, rising elements on its line, from about a quarter of the
  // equatorial gyrofrequency up to just under half
  const double fce = v.tr[0].line.fce;
  const double rate = v.held && !v.stolen ? P[p::chorus] + PRESSURE_RATE * v.press : 0;
  if (rate > 0) {
    if (v.toNext <= 0) v.toNext = rng.exponential(1 / rate);
    v.toNext -= dt;
    if (v.toNext <= 0) {
      v.toNext = rng.exponential(1 / rate);
      const int most = pick(MAX_ELEMENTS, 5, 3); // Quality: fewer chorus elements at once
      int live = 0;
      for (const Element &e : v.el) live += e.live;
      for (Element &e : v.el) {
        if (e.live || live >= most) continue;
        e = Element{};
        e.live = true;
        e.f0 = fce * (0.12 + 0.18 * rng.uniform()); e.f1 = fce * 0.47;
        e.dur = P[p::element] * (0.75 + 0.5 * rng.uniform());
        e.amp = CHORUS * v.vel * (0.4 + 0.6 * rng.uniform());
        Message m;
        m.type = kChorus; m.key = (int16_t)v.key; m.count = 3;
        m.values[0] = (float)e.f0; m.values[1] = (float)e.f1; m.values[2] = (float)e.dur;
        post(m);
        break;
      }
    }
  }
  for (Element &e : v.el) {
    if (!e.live) continue;
    any = true;
    const double u1 = std::min(1.0, (e.age + dt) / e.dur), s = std::sin(std::numbers::pi * u1);
    const double a1 = e.amp * s * s, f = e.f0 + (e.f1 - e.f0) * u1;
    const double w1 = (TAU * std::min(f, 0.45 * fs)) / fs, w0 = e.w > 0 ? e.w : w1, a0 = e.age > 0 ? e.amp * std::pow(std::sin(std::numbers::pi * e.age / e.dur), 2) : 0;
    double zr = e.zr, zi = e.zi, rr = std::cos(w0), ri = std::sin(w0);
    const double dw = (w1 - w0) / n, dr = std::cos(dw), di = std::sin(dw), da = (a1 - a0) / n;
    double a = a0;
    for (int i = 0; i < n; i++) {
      L[i] = (float)(L[i] + a * v.env * zi);
      R[i] = (float)(R[i] + a * v.env * zr);
      const double t2 = zr * rr - zi * ri; zi = zr * ri + zi * rr; zr = t2;
      const double r2 = rr * dr - ri * di; ri = rr * di + ri * dr; rr = r2;
      a += da;
    }
    const double m = 1 / std::hypot(zr, zi);
    e.zr = zr * m; e.zi = zi * m; e.w = w1; e.age += dt;
    if (u1 >= 1) e.live = false;
  }
  v.clock = T1; v.sfClock = S1;
  if (v.env < ENV_SILENT || (!any && !v.held)) v.done = true;
}

void WhistlersEngine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasParams) return;
  for (int i0 = 0; i0 < n; i0 += CB) {
    const int m = std::min(CB, n - i0);
    for (Voice &v : voices) play(v, L + i0, R + i0, m);
  }
  std::erase_if(voices, [](const Voice &v) { return v.done; }); // finished voices, in place
}

} // namespace forte::whistlers
