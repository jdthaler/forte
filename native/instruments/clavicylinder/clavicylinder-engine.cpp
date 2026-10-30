// clavicylinder-engine.cpp — the clavicylinder's engine (clavicylinder-engine.h).

#include "clavicylinder-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"

namespace forte::clavicylinder {

constexpr double OUT = 2.0;         // the output's scale: the cords' velocity to the key, as heard
constexpr double LAND = 0.006, LIFT = 0.006; // s: the key's travel onto the glass, and off it
constexpr double KNOCK = 3e-3;      // N·s: the bar's knock on the glass from a key struck at full velocity
constexpr double KNOCK_T = 4e-4;    // s: how long the knock lasts through each layer of cloth
constexpr double FLY_R = 0.12;      // m: the lead's radius on the 10-inch flywheel (§23)
constexpr double GLASS_I = 4e-4;    // kg·m²: the glass, its wooden core and the iron spindle
constexpr double FOOT = 0.6;        // s: how soon the foot makes up a lost speed (and learns a steady drag)
constexpr double FOOT_I = 3.5 * FLY_R * FLY_R + GLASS_I; // kg·m²: the wheel the foot is used to (the default lead)
constexpr double BEARING = 2e-4;    // N·m·s: the spindle in its leather bearings
constexpr int REPORT_BLOCKS = 12;   // the page's state every few blocks
// The Quality: modes a bar plays (the lowest; the fourth already sits 13 times above the note),
// bars sounding at once before the quietest untouched one is let go, and the peak under which an
// untouched bar stops (−90, −80, −70 dB)
constexpr int MODES_Q[3] = {MODES, 4, 2};
constexpr int VOICES[3] = {NK, 24, 12};
constexpr double QUIET[3] = {3e-5, 1e-4, 3e-4};

ClavicylinderEngine::ClavicylinderEngine(double fs) : Engine(fs), k(1 / fs) {}

void ClavicylinderEngine::setParams(const double *p) {
  const bool first = !hasParams;
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
  inertia = P[p::flywheel] * FLY_R * FLY_R + GLASS_I;
  for (int i = 0; i < count; i++) voices[i]->fr = friction(P[p::wet], P[p::grip], voices[i]->b.L); // the glass, wetted or soaped under held keys
  if (first) W = TAU * P[p::speed];
}

void ClavicylinderEngine::start(Voice &v, int key) {
  v = Voice{};
  v.key = key;
  v.after = pressureAll;
  v.b = bar(key, P.data(), fs);
  v.N = std::min(v.b.count, MODES_Q[(int)quality]);
  v.pad = pad(P[p::wet], layersOf(P.data(), v.b.post), v.b.L);
  v.fr = friction(P[p::wet], P[p::grip], v.b.L);
  v.Yb = 0;
  for (int i = 0; i < v.N; i++) {
    const BarMode &m = v.b.modes[i];
    const ModeCoeffs c = modeCoeffs(m.f, m.sigma, fs);
    v.a1[i] = c.a1; v.a2[i] = c.a2; v.bf[i] = c.b / v.b.m; // per newton
    v.c[i] = m.c; v.cn[i] = m.cn; v.e[i] = m.e;
    v.Yb += (m.c * m.c * v.bf[i]) / k;
  }
  const auto [pl, pr] = keyPan(key, 0.6, 36, 89); // across Chladni's compass; the keys past it at its ends
  v.pl = pl * v.b.balance; v.pr = pr * v.b.balance;
}

void ClavicylinderEngine::pressure(double value, int key) { // MIDI aftertouch: channel (key −1) or polyphonic
  if (key < 0) { pressureAll = value; for (int i = 0; i < count; i++) voices[i]->after = value; }
  else for (int i = 0; i < count; i++) if (voices[i]->key == key) voices[i]->after = value;
}

void ClavicylinderEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < 21 || key > 108) return;
  Voice *v = nullptr;
  for (int i = 0; i < count && !v; i++) if (voices[i]->key == key) v = voices[i];
  if (v && v->dead) start(*v, key); // let go this block: the same slot, started afresh
  if (!v) {
    v = &slots[key - 21];
    start(*v, key);
    voices[count++] = v;
    if (count > VOICES[(int)quality]) { // let go of the quietest bar no key is holding (never a held one)
      Voice *q = nullptr;
      for (int i = 0; i < count; i++) { Voice *x = voices[i]; if (!x->touch && x != v && (!q || x->peak < q->peak)) q = x; }
      if (q) q->dead = true;
    }
  }
  v->touch = true; v->vel = velocity;
  // The bar meets the glass at the speed the key went down: a knock, a pulse of normal force
  // lasting longer through more cloth. It sounds the modes that move toward the glass, and
  // its friction gives the note its first push: a firm key speaks at once, a gentle one swells.
  const double tau = KNOCK_T * layersOf(P.data(), v->b.post);
  v->knock = (KNOCK * velocity * velocity) / tau;
  v->knockDecay = std::exp(-k / tau);
  focus = key;
}

void ClavicylinderEngine::noteOff(int key, double) {
  for (int i = 0; i < count; i++) if (voices[i]->key == key) voices[i]->touch = false;
}

// The cloth's force on the glass (N): the slider (at middle C) through the key's regulation,
// velocity for how firmly the key goes down, aftertouch for pressing harder.
double ClavicylinderEngine::force(const Voice &v) const { return v.touch ? P[p::press] * v.b.reg * (0.5 + v.vel) * (1 + v.after) : 0; }

void ClavicylinderEngine::process(float *L, float *R, int n) {
  for (int at = 0; at < n; at += 128) run(L + at, R + at, std::min(128, n - at));
}

void ClavicylinderEngine::run(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasParams) return;
  // The cylinder: the foot pushes once a turn (Chladni's off-centre weight brings the crank back
  // up), making up within about FOOT seconds the speed a wheel of Chladni's weight has lost, and
  // learning a steady drag; the bars' friction (from the last block) and the bearings slow it. A
  // heavy flywheel loses less speed before the foot answers, and smooths the push; the foot is
  // the same whatever the wheel.
  const double Wt = TAU * P[p::speed], s = P[p::treadle], kp = (2 * FOOT_I) / FOOT, ki = FOOT_I / (FOOT * FOOT);
  double w = W, th = theta;
  for (int i = 0; i < n; i++) {
    foot = std::max(0.0, foot + k * ki * (Wt - w));
    const double drive = std::max(0.0, kp * (Wt - w) + foot + BEARING * Wt);
    const double torque = drive * (1 + s * std::cos(th)) - CYL_R * load - BEARING * w;
    w = std::max(0.0, w + (k * torque) / inertia);
    th += w * k;
    V[i] = w * CYL_R;
  }
  W = w; theta = std::fmod(th, TAU);

  const double lamOn = 1 - std::exp(-k / LAND), lamOff = 1 - std::exp(-k / LIFT);
  double drag = 0;
  for (int vi = 0; vi < count; vi++) {
    Voice &v = *voices[vi];
    if (v.dead) continue;
    const int NM = v.N;
    double *q = v.q.data(), *q1 = v.q1.data();
    const double *a1 = v.a1.data(), *a2 = v.a2.data(), *bf = v.bf.data(), *c = v.c.data(), *cn = v.cn.data(), *e = v.e.data();
    // the cloth: its spring and damper over a sample, and so the pad's response to the friction
    const Pad &pd = v.pad;
    const double mud = v.fr.mud, dmu = v.fr.dmu, v0 = v.fr.v0, beta = v.fr.beta, noise = v.fr.noise;
    const double pk_ = pd.k, pc = pd.c();
    const double D = pk_ * k + pc, g = D / (1 + D * v.Yb), km = k / pd.m, Yp = km / (1 + km * g);
    const double Nt = force(v);
    const bool tr = focus == v.key;
    double pk = 0, sticks = 0, fsum = 0;
    for (int i = 0; i < n; i++) {
      v.Nn += (Nt - v.Nn) * (v.touch ? lamOn : lamOff);
      if (!v.touch && v.Nn < 1e-4) v.Nn = 0;
      // the knock: the glass pushes the bar back across the rub, and presses the cloth harder
      const double kn = v.knock;
      v.knock = kn > 1e-6 ? kn * v.knockDecay : 0;
      const double Nf = v.Nn + kn;
      // free step of every mode, with the knock
      double X = 0, Xf = 0;
      for (int j = 0; j < NM; j++) {
        const double y = a1[j] * q[j] - a2[j] * q1[j] - bf[j] * cn[j] * kn;
        X += c[j] * q[j]; Xf += c[j] * y;
        q1[j] = q[j]; q[j] = y;
      }
      const double vf = (Xf - X) / k;
      double P = 0, F = 0;
      if (Nf > 0) {
        // the pad: P = P0 + g·u⁺ on the bar, u⁺ = u0 + Yp·F (backward Euler through its spring)
        const double P0 = (pk_ * (v.x - Xf) - pc * vf) / (1 + D * v.Yb);
        const double u0 = (v.u - km * P0) / (1 + km * g);
        const double s0 = V[i] - u0, cc = Yp * Nf;
        rng = (int32_t)((uint32_t)rng * 1664525u + 1013904223u); // the glass's small waves: friction noise
        const double nz = 1 + noise * (rng / 2147483648.0);
        const double md = mud * nz, dm = dmu * nz;
        // Stick if the force that holds s = 0 is within μs·N; otherwise slip in the direction of
        // s0 at the speed us solving us − |s0| + Yp N μ(us) = 0, by Newton from the last slip
        // speed, kept inside the bracket (0, |s0|).
        if (std::fabs(s0) <= cc * (md + dm)) { F = s0 / Yp; v.stick = true; v.slip = 0; sticks++; }
        else {
          const double sg = s0 > 0 ? 1 : -1, a = sg * s0;
          double lo = 0, hi = a, us = v.slip > 0 && v.slip < a ? v.slip : 0.5 * a, mu = 0;
          for (int it = 0; it < 20; it++) {
            const double xx = us / v0, ee = 1 / (1 + xx * xx);
            mu = md + dm * ee + beta * us;
            const double ph = us - a + cc * mu;
            if (ph > 0) hi = us; else lo = us;
            if (std::fabs(ph) < 1e-12 + 1e-10 * a) break;
            const double d = 1 + cc * (beta - (2 * dm * xx * ee * ee) / v0);
            double un = us - ph / d;
            if (!(d > 0 && un > lo && un < hi)) un = 0.5 * (lo + hi);
            us = un;
          }
          F = sg * Nf * mu; v.stick = false; v.slip = us;
        }
        v.u = u0 + Yp * F;
        P = P0 + g * v.u;
        v.x += k * v.u;
        for (int j = 0; j < NM; j++) q[j] += bf[j] * c[j] * P;
      } else { // off the glass the cloth rides on the bar
        double Xn = 0;
        for (int j = 0; j < NM; j++) Xn += c[j] * q[j];
        v.u = (Xn - X) / k; v.x = Xn; v.slip = 0; v.stick = false;
      }
      v.F = F;
      fsum += F;
      // what the cords pass to the key and the soundboard: each mode's velocity there
      double o = 0;
      for (int j = 0; j < NM; j++) o += e[j] * (q[j] - q1[j]);
      o *= OUT * fs;
      L[i] = (float)(L[i] + v.pl * o); // a Float32Array's +=
      R[i] = (float)(R[i] + v.pr * o);
      if (std::fabs(o) > pk) pk = std::fabs(o);
      if (tr) { trS[tw] = (float)(V[i] - v.u); trF[tw] = (float)F; tw = (tw + 1) % TRACE; }
    }
    v.peak = pk;
    v.sticks = sticks / n;
    drag += fsum / n;
    if (!v.touch && v.Nn == 0) { v.quiet = pk < QUIET[(int)quality] ? v.quiet + 1 : 0; if (v.quiet > 40) v.dead = true; }
  }
  load = drag;
  int j = 0;
  for (int i = 0; i < count; i++) if (!voices[i]->dead) voices[j++] = voices[i];
  count = j;
  if (messages && ++tick >= REPORT_BLOCKS) { tick = 0; report(); }
}

// Throttled state for the page's views: the focused bar's modes, its contact trace (oldest first),
// then the state itself.
void ClavicylinderEngine::report() {
  const Voice *v = nullptr;
  for (int i = 0; i < count && !v; i++) if (voices[i]->key == focus) v = voices[i];
  Message m;
  m.key = (int16_t)focus;
  const int nm = v ? std::min(v->N, 14) : 0;
  if (v) {
    m.type = msg::q; m.count = (uint16_t)(2 * nm);
    for (int j = 0; j < nm; j++) { m.values[j] = (float)v->q[j]; m.values[nm + j] = (float)((v->q[j] - v->q1[j]) * fs); }
    post(m);
  }
  for (int which = 0; which < 2; which++) {
    const std::array<float, TRACE> &tr = which ? trF : trS;
    m.type = which ? msg::traceF : msg::traceS;
    for (int i = 0; i < TRACE;) {
      const int c = std::min(29, TRACE - i);
      m.count = (uint16_t)(c + 1); m.values[0] = (float)i;
      for (int q = 0; q < c; q++) m.values[1 + q] = tr[(tw + i + q) % TRACE];
      post(m);
      i += c;
    }
  }
  m.type = msg::state; m.count = 7;
  const double s[7] = {theta, W / TAU, v ? v->Nn : 0, W * CYL_R, v && v->touch ? 1.0 : 0.0, (double)nm, v ? v->sticks : 0};
  for (int q = 0; q < 7; q++) m.values[q] = (float)s[q];
  post(m);
}

} // namespace forte::clavicylinder
