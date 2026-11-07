// drums-engine.cpp — the Timpani and Tabla's engine (drums-engine.h).

#include "drums-engine.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/dsp.h"

namespace forte::drums {

constexpr double OUT = 0.025;         // the listener's pressure (Pa) as heard
constexpr int BLOCK = 16;             // samples between workings-out of the tension
constexpr double V_MIN = 0.3, V_MAX = 4; // m/s: the beater's speed at velocity 0 and 1
constexpr double C_REST = 1.5;        // N·s/m: a finger resting lightly on the head
constexpr double C_STAY = 10;         // N·s/m: fingers (or a mallet) left pressed after a closed stroke
constexpr double C_HEEL = 4;          // N·s/m: the heel pressing in, at full pressure
constexpr double HEEL_FROM = 0.5;     // pressure below this does nothing (a Seaboard's finger at rest); the heel goes in over the rest
constexpr double HEEL_AT = 0.7;       // where the heel presses, as a fraction of the radius, opposite the strike
constexpr double GLIDE = 0.015;       // s: the pedal's and the heel's glide
constexpr double FADE = 0.03;         // s: a drum let go of to make room for another stops in about this
constexpr double MAX_CONTACT = 0.05;  // s: a beater that has not touched the head by then is gone
// The Quality: modes a drum plays, drums ringing at once, and how far down a drum stops (−100, −90, −80 dB)
constexpr int MODES_Q[3] = {MAXMODES, 26, 14};
constexpr int VOICES_Q[3] = {32, 16, 8};
constexpr double QUIET[3] = {1e-10, 1e-9, 1e-8};

// ---- packing a drum (the page's noteData) ----------------------------------------------------

int packDrum(const KeyDrum &k, const double *P, double *out) {
  int n = 0;
  out[n++] = 1; out[n++] = p::count;
  for (int i = 0; i < p::count; i++) out[n++] = shapesDrum(i) ? P[i] : 0;
  for (double x : {(double)k.key, (double)k.drum, (double)k.count, (double)k.principal, k.a, k.depth, k.T, k.sigma, k.Eh, k.eta, k.rho, k.f0, k.kettle ? 1.0 : 0.0}) out[n++] = x;
  for (int i = 0; i < k.count; i++) {
    const Mode &m = k.mode[i];
    for (double x : {(double)m.m, (double)m.n, m.f, m.sigma, m.sigmaAir, m.grad, m.far}) out[n++] = x;
    for (double c : m.c) out[n++] = c;
    for (double r : m.radial) out[n++] = r;
  }
  return n;
}

bool unpackDrum(const double *in, int n, KeyDrum &k, double *shaping) {
  if (n < 2 + p::count + 13 || in[0] != 1 || in[1] != (double)p::count) return false;
  int at = 2;
  for (int i = 0; i < p::count; i++) shaping[i] = in[at++];
  k.key = (int)in[at++]; k.drum = (int)in[at++]; k.count = (int)in[at++]; k.principal = (int)in[at++];
  if (k.count < 0 || k.count > MAXMODES || n < at + 9 + k.count * (7 + NB + NRS)) return false;
  k.a = in[at++]; k.depth = in[at++]; k.T = in[at++]; k.sigma = in[at++]; k.Eh = in[at++]; k.eta = in[at++];
  k.rho = in[at++]; k.f0 = in[at++]; k.kettle = in[at++] != 0;
  for (int i = 0; i < k.count; i++) {
    Mode &m = k.mode[i];
    m.m = (int)in[at++]; m.n = (int)in[at++]; m.f = in[at++]; m.sigma = in[at++]; m.sigmaAir = in[at++]; m.grad = in[at++]; m.far = in[at++];
    for (double &c : m.c) c = in[at++];
    for (double &r : m.radial) r = in[at++];
  }
  return true;
}

// ---- the engine ------------------------------------------------------------------------------

DrumEngine::DrumEngine(double fs)
    : Engine(fs), data([this](int key, uint64_t version) -> std::unique_ptr<KeyDrum> {
        if (key < KEY_MIN || key > KEY_MAX) return nullptr;
        const Snapshot &s = snapshots[version % snapshots.size()];
        double Q[p::count];
        for (int i = 0; i < p::count; i++) Q[i] = s.P[i].load(std::memory_order_relaxed);
#if !FORTE_THREADS
        if (offered && offered->key == key) {
          bool same = true;
          for (int i = 0; i < p::count && same; i++) if (shapesDrum(i) && offeredFor[i] != Q[i]) same = false;
          if (same) return std::move(offered);
        }
#endif
        return std::make_unique<KeyDrum>(keyDrum(key, Q));
      }) {}

bool DrumEngine::offer(const double *packed, int n) {
#if FORTE_THREADS
  (void)packed; (void)n;
  return false;
#else
  auto d = std::make_unique<KeyDrum>();
  if (!unpackDrum(packed, n, *d, offeredFor.data()) || d->key < KEY_MIN || d->key > KEY_MAX) return false;
  offered = std::move(d);
  return true;
#endif
}

void DrumEngine::setParams(const double *p) {
  bool changed = !hasParams;
  for (int i = 0; i < p::count; i++) {
    if (shapesDrum(i) && P[i] != p[i]) changed = true;
    P[i] = p[i];
  }
  hasParams = true;
  if (changed) {
    version++;
    Snapshot &s = snapshots[version % snapshots.size()];
    for (int i = 0; i < p::count; i++) s.P[i].store(P[i] + 0.0, std::memory_order_relaxed);
    data.prepare(version, KEY_MIN, KEY_MAX, focus >= 0 ? focus : 60);
  }
  for (int i = 0; i < count; i++) { place(*voices[i]); coefficients(*voices[i], voices[i]->tension); }
}

// The strike point (the slider, the wheel or the note's own slide), the resting finger and the heel,
// and the modes' shapes there. The resting finger lies a quarter turn round from the strike, as the
// ring finger lies beside the index: on the nodal line of every odd m mode the strike sets ringing
// (cos mθ at θ = π/2), so it damps the round and the even modes and spares the odd ones.
void DrumEngine::place(Voice &v) {
  const KeyDrum &k = *v.kd;
  v.strike = std::clamp(expr.slideOr(v.key, P[p::strike]), 0.0, 0.95);
  const bool rest = P[p::rest] > 0.5;
  const double rr = std::clamp(P[p::restAt], 0.0, 0.95);
  v.S_s = v.S_r = v.S_h = 0;
  for (int n = 0; n < v.M; n++) {
    const Mode &m = k.mode[n];
    v.phiS[n] = shapeAt(m, v.strike);
    v.phiR[n] = rest && !(m.m & 1) ? shapeAt(m, rr) * ((m.m & 2) ? -1 : 1) : 0; // cos(mπ/2)
    v.phiH[n] = shapeAt(m, HEEL_AT) * ((m.m & 1) ? -1 : 1); // across the head: cos mπ
    v.S_s += v.phiS[n] * v.phiS[n]; v.S_r += v.phiR[n] * v.phiR[n]; v.S_h += v.phiH[n] * v.phiH[n];
  }
}

// The tension now over the drum's own, as √(T/T₀): the pedal and the note's bend (T × b², so the
// principal moves by b), the heel's push (a cone of depth δ stretches the head by δ²/2a²) and the
// head's own swing (its mean square slope, ½ ∫|∇w|² / area).
double DrumEngine::tensionOf(const Voice &v) const {
  const KeyDrum &k = *v.kd;
  const double d = (P[p::push] / 1000) * v.press;
  const double strain = (d * d) / (2 * k.a * k.a) + v.stretch;
  return std::sqrt(v.bendNow * v.bendNow + (k.Eh * strain) / k.T);
}

void DrumEngine::coefficients(Voice &v, double tension) {
  v.tension = tension;
  const double dt = 1 / fs;
  const double extra = v.hand ? std::log(1000.0) / (P[p::hand] * v.liftK) : 0;
  v.Y = 0;
  for (int n = 0; n < v.M; n++) {
    const double w = v.w0[n] * tension, a = v.sig[n] + extra;
    // (a mode the pedal or the heel pushes past the band is held below Nyquist, so it cannot alias)
    const double wd = std::min(std::sqrt(std::max(w * w - a * a, 1e-4 * w * w)), 0.9 * std::numbers::pi * fs);
    const double e = std::exp(-a * dt), c = std::cos(wd * dt), s = std::sin(wd * dt), w2 = wd * wd + a * a;
    v.a11[n] = e * (c + (a / wd) * s); v.a12[n] = (e * s) / wd;
    v.a21[n] = -(e * w2 * s) / wd; v.a22[n] = e * (c - (a / wd) * s);
    const double rq = (1 - v.a11[n]) / w2; // displacement after one sample of unit force, from rest
    v.bq[n] = rq * v.phiS[n]; v.bv[n] = v.a12[n] * v.phiS[n];
    v.Y += rq * v.phiS[n] * v.phiS[n];
  }
}

void DrumEngine::start(Voice &v, int key, Data::Ref r) {
  if (v.ref) data.release(v.ref);
  v = Voice{};
  v.key = key; v.ref = r; v.kd = r.data; v.active = true;
  data.acquire(r);
  const KeyDrum &k = *r.data;
  v.M = std::min(k.count, MODES_Q[(int)quality]);
  while (v.M > 1 && k.mode[v.M - 1].f > 0.42 * fs) v.M--; // the modes are sorted: none above the band
  for (int n = 0; n < v.M; n++) {
    const Mode &m = k.mode[n];
    v.w0[n] = TAU * m.f; v.sig[n] = m.sigma; v.grad[n] = m.grad;
    // the far field: iᵐ × the acceleration; for an odd m the quarter cycle is the velocity's
    const double w = v.w0[n];
    switch (m.m & 3) {
      case 0: v.outQ[n] = -w * w * m.far; break;
      case 1: v.outV[n] = -w * m.far; break;
      case 2: v.outQ[n] = w * w * m.far; break;
      default: v.outV[n] = w * m.far; break;
    }
  }
  std::tie(v.gl, v.gr) = keyPan(key);
  v.press = pressTarget(key);
  v.bendNow = bendAll * expr.bendOf(key);
  place(v);
  coefficients(v, tensionOf(v));
}

void DrumEngine::strike(Voice &v, double velocity) {
  // the beater: the drum's own (a felt mallet on timpani, a fingertip on tabla) or the one chosen
  int b = (int)P[p::beater];
  if (b <= 0 || b >= (int)BEATERS.size()) b = DRUMS[v.kd->drum].beater;
  const Beater &bt = BEATERS[b];
  v.mallet = true; v.touched = false; v.stay = false; v.contact = 0; v.F = 0; v.Fmax = 0;
  // a smaller drum than the instrument's own (the keys above its own) takes a lighter beater, in
  // proportion to its head's area, as a player picks lighter sticks for a small drum: with the same
  // tip, the contact is then shorter as the drum's period is, where a heavy mallet would bury a
  // little head in a thud
  const double own = DRUMS[v.kd->drum].radius * P[p::size], light = std::min(1.0, (v.kd->a / own) * (v.kd->a / own));
  v.mm = bt.mass * light; v.K = bt.K; v.pw = bt.p;
  v.vm = V_MIN + (V_MAX - V_MIN) * std::clamp(velocity, 0.0, 1.0);
  double w = 0;
  for (int n = 0; n < v.M; n++) w += v.phiS[n] * v.q[n];
  v.y = w; // it arrives at the head where the head is now
  v.hand = false; v.released = false; v.liftK = 1;
  coefficients(v, v.tension);
}

void DrumEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < KEY_MIN || key > KEY_MAX) return;
  const Data::Ref r = data.get(key, version);
  if (!r) { // its drum is still being worked out (the plugins, just after a change): the note waits
    for (int i = 0; i < npending; i++) if (pending[i].key == key) { pending[i] = {key, velocity, false}; return; }
    if (npending < NK) pending[npending++] = {key, velocity, false};
    return;
  }
  Voice &v = slots[key - KEY_MIN];
  if (!v.active) {
    voices[count++] = &v;
    start(v, key, r);
  } else if (v.kd != r.data) {
    start(v, key, r); // a drum built for other parameters: this one is struck afresh
  }
  strike(v, velocity);
  focus = key;
  // Quality: past this many drums ringing, the quietest one not being struck stops quickly
  if (count > VOICES_Q[(int)quality]) {
    Voice *q = nullptr;
    for (int i = 0; i < count; i++) { Voice *x = voices[i]; if (x != &v && !x->mallet && !x->hand && (!q || x->energy < q->energy)) q = x; }
    if (q) { q->hand = true; q->sig.fill(0); for (int n = 0; n < q->M; n++) q->sig[n] = std::log(1000.0) / FADE; coefficients(*q, q->tension); }
  }
}

// Lift: the hand that damps the head on release lands gently on a slow lift (it rings on longer)
// and firmly on a fast one; with the heads let ring, only a fast lift brings the hand down.
void DrumEngine::noteOff(int key, double velocity) {
  for (int i = 0; i < npending; i++) if (pending[i].key == key) { pending[i].off = true; return; }
  if (key < KEY_MIN || key > KEY_MAX) return;
  Voice &v = slots[key - KEY_MIN];
  if (!v.active) return;
  v.released = true;
  if (!sustain && !v.hand && (P[p::ring] < 0.5 || liftPast(velocity) > 0)) { v.hand = true; v.liftK = liftScale(velocity); coefficients(v, v.tension); }
}

void DrumEngine::setSustain(bool on) {
  sustain = on;
  if (on || P[p::ring] >= 0.5) return;
  for (int i = 0; i < count; i++) if (voices[i]->released && !voices[i]->hand) { voices[i]->hand = true; coefficients(*voices[i], voices[i]->tension); }
}

void DrumEngine::pressure(double value, int key) {
  value = std::clamp((value - HEEL_FROM) / (1 - HEEL_FROM), 0.0, 1.0); // only a firm press: the heel, from none to full
  if (key < 0) { pressAll = value; for (double &k : keyPress) k = -1; }
  else if (key < 128) keyPress[key] = value;
}

void DrumEngine::bend(double value) { bendAll = std::pow(2.0, (std::clamp(value, -1.0, 1.0) * P[p::pedal]) / 12); }

void DrumEngine::kill(Voice &v) {
  v.active = false;
  if (v.ref) { data.release(v.ref); v.ref = {}; }
  v.kd = nullptr;
}

void DrumEngine::allNotesOff() {
  for (int i = 0; i < count; i++) kill(*voices[i]);
  count = 0; npending = 0;
}

void DrumEngine::retryPending() {
  int j = 0;
  for (int i = 0; i < npending; i++) {
    const Pending pd = pending[i];
    if (!data.get(pd.key, version)) { pending[j++] = pd; continue; }
    npending = j; // (noteOn may add to the list again: it won't, the drum is there)
    noteOn(pd.key, pd.vel);
    if (pd.off) noteOff(pd.key, -1);
  }
  npending = j;
}

void DrumEngine::process(float *L, float *R, int n) {
  for (int at = 0; at < n; at += 128) run(L + at, R + at, std::min(128, n - at));
  data.audioCycle();
}

void DrumEngine::run(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasParams) return;
  if (npending) retryPending();
  const double dt = 1 / fs, dt2 = dt * dt;
  const double cRest = P[p::rest] > 0.5 ? C_REST : 0;
  for (int vi = 0; vi < count; vi++) {
    Voice &v = *voices[vi];
    const int M = v.M;
    double *q = v.q.data(), *u = v.v.data();
    for (int b0 = 0; b0 < n; b0 += BLOCK) {
      const int b1 = std::min(n, b0 + BLOCK);
      const double bt = (b1 - b0) * dt;
      // the tension: the pedal, the heel and the head's swing
      const double to = std::clamp(expr.slideOr(v.key, P[p::strike]), 0.0, 0.95);
      if (std::fabs(to - v.strike) > 1e-9) { place(v); coefficients(v, v.tension); }
      v.press = glideTo(v.press, pressTarget(v.key), bt, GLIDE);
      v.bendNow = glideTo(v.bendNow, bendAll * expr.bendOf(v.key), bt, GLIDE);
      double E = 0, sw = 0;
      for (int j = 0; j < M; j++) {
        const double w = v.w0[j] * v.tension, A2 = q[j] * q[j] + (u[j] * u[j]) / (w * w);
        E += 0.5 * w * w * A2; sw += v.grad[j] * A2;
      }
      v.stretch = sw / (4 * std::numbers::pi * v.kd->a * v.kd->a);
      v.energy = E; v.peak = std::max(v.peak, E);
      const double t = tensionOf(v);
      if (std::fabs(t - v.tension) > 1e-7 * v.tension) coefficients(v, t);
      const double cHeel = C_HEEL * v.press;
      for (int i = b0; i < b1; i++) {
        for (int j = 0; j < M; j++) {
          const double qn = v.a11[j] * q[j] + v.a12[j] * u[j];
          u[j] = v.a21[j] * q[j] + v.a22[j] * u[j];
          q[j] = qn;
        }
        if (v.mallet) {
          // the beater against the head: x = y − w under it, F = K·x^p, solved with the head's
          // response to F over this sample (compliance Y) and the beater's (dt²/m)
          double w = 0;
          for (int j = 0; j < M; j++) w += v.phiS[j] * q[j];
          const double xp = v.y + dt * v.vm - w, C = dt2 / v.mm + v.Y;
          double F = 0;
          if (xp > 0) {
            double lo = 0, hi = xp / C;
            F = std::clamp(v.F, lo, hi);
            for (int it = 0; it < 40; it++) {
              const double x = xp - C * F, kx = v.K * std::pow(x, v.pw), g = F - kx;
              if (g > 0) hi = F; else lo = F;
              const double dg = 1 + C * v.pw * kx / x;
              double nF = F - g / dg;
              if (!(nF > lo && nF < hi)) nF = 0.5 * (lo + hi);
              if (std::fabs(nF - F) < 1e-12 * (1 + F)) { F = nF; break; }
              F = nF;
            }
            for (int j = 0; j < M; j++) { q[j] += v.bq[j] * F; u[j] += v.bv[j] * F; }
            v.touched = true;
          } else if (v.touched) { // off the head again: the player lifts it away
            v.mallet = false;
            if (P[p::stays] > 0.5) v.stay = true;
          }
          v.F = F; v.Fmax = std::max(v.Fmax, F);
          v.vm -= (dt * F) / v.mm; v.y += dt * v.vm;
          if (++v.contact > MAX_CONTACT * fs && !v.touched) v.mallet = false;
        }
        // the hands: dashpots at their points, each implicit (u′ = u / (1 + c·dt·ΣΦ²))
        auto dashpot = [&](const double *phi, double S, double c) {
          if (!(c > 0) || !(S > 0)) return;
          double vel = 0;
          for (int j = 0; j < M; j++) vel += phi[j] * u[j];
          const double d = -(c * dt * vel) / (1 + c * dt * S);
          for (int j = 0; j < M; j++) u[j] += d * phi[j];
        };
        dashpot(v.phiR.data(), v.S_r, cRest);
        if (v.stay) dashpot(v.phiS.data(), v.S_s, C_STAY);
        dashpot(v.phiH.data(), v.S_h, cHeel);
        double s = 0;
        for (int j = 0; j < M; j++) s += v.outQ[j] * q[j] + v.outV[j] * u[j];
        s *= OUT;
        L[i] = (float)(L[i] + v.gl * s);
        R[i] = (float)(R[i] + v.gr * s);
      }
    }
    if (!v.mallet && v.peak > 0 && v.energy < QUIET[(int)quality] * v.peak) kill(v);
    else if (!(v.energy < 1e6)) kill(v); // a numerical failure never sounds
  }
  // the drums that stopped leave the list
  int j = 0;
  for (int i = 0; i < count; i++) if (voices[i]->active) voices[j++] = voices[i];
  count = j;
  if (++tick % 4 == 0) report();
}

void DrumEngine::report() {
  if (focus < 0) return;
  const Voice &v = slots[focus - KEY_MIN];
  if (!v.active) return;
  Message m;
  m.type = msg::state; m.key = (int16_t)focus;
  const int k = std::min(v.M, 26);
  m.values[0] = (float)v.tension; m.values[1] = (float)v.F; m.values[2] = (float)k; m.values[3] = (float)v.press;
  for (int j = 0; j < k; j++) {
    const double w = v.w0[j] * v.tension;
    m.values[4 + j] = (float)std::sqrt(v.q[j] * v.q[j] + (v.v[j] * v.v[j]) / (w * w));
  }
  m.count = (uint16_t)(4 + k);
  post(m);
}

} // namespace forte::drums
