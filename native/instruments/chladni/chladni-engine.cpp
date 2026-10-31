// chladni-engine.cpp — the Chladni Plate's engine (chladni-engine.h).

#include "chladni-engine.h"

#include <algorithm>
#include <cmath>
#include <memory>

#include "forte/dsp.h"

namespace forte::chladni {

constexpr double OUT = 6.0;          // the microphones: the plate's velocity under them (m/s), as heard
constexpr double LAND = 0.015;       // s: the bow set on the edge
constexpr double LIFT = 0.008;       // s: and lifted off
constexpr double DRAW = 0.02;        // s: the bow getting up to speed
constexpr double SHIFT_T = 0.03;     // s: the bow moving along the edge (the wheel's glide)
constexpr double NOISE = 0.02;       // the rosin's grain: friction's jitter
constexpr double MAXFORCE = 40;      // N: as hard as a hand can press a bow
constexpr double BITE = 3;           // the bite of a key struck at full velocity: the bow pressed this much harder at first
constexpr double BITE_T = 12;        // cycles of the note over which the bite lets go (1/e)
constexpr double MIC_L[2] = {-0.42, 0.31}, MIC_R[2] = {0.55, -0.23}; // the microphones over the unit plate
// The Quality: modes a plate plays (the lowest, and always a few past the figure's), plates sounding
// at once before the quietest unbowed one is let go, and the peak under which a lifted plate stops
// (−90, −80, −70 dB)
constexpr int MODES_Q[3] = {MAXMODES, 24, 12};
constexpr int VOICES[3] = {NK, 24, 12};
constexpr double QUIET[3] = {3e-5, 1e-4, 3e-4};

ChladniPlateEngine::ChladniPlateEngine(double fs)
    : Engine(fs), plates([](int id, uint64_t) {
        auto pl = std::make_unique<Plate>();
        solvePlate(*pl, MATERIALS[id / 2].nu, id % 2 == 1);
        return pl;
      }) {}

void ChladniPlateEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
  const int id = plateId(P.data());
  plates.prepare(version, id, id, id);
}

// The modes' two-pole coefficients for the losses now: the metal's, the finger's where its shape
// under the fingertip is, and the hand's once the key is up (and the pedal is not).
void ChladniPlateEngine::coefficients(Voice &v) {
  const bool finger = P[p::finger] > 0.5;
  const int d = (finger ? 1 : 0) | (v.hand ? 2 : 0);
  if (d == v.damp) return;
  v.damp = d;
  const double hand = v.hand ? std::log(1000.0) / P[p::hand] : 0;
  for (int j = 0; j < v.M; j++) {
    const double sf = finger ? (FINGER * v.fin[j]) / (2 * v.kp.mass) : 0;
    const ModeCoeffs c = modeCoeffs(v.kp.f[j], v.kp.sigma[j] + sf + hand, fs);
    v.a1[j] = c.a1; v.a2[j] = c.a2; v.bf[j] = c.b / v.kp.mass; // displacement per newton, a sample
  }
  place(v);
}

// The bow's place on the edge: the figure's, shifted along the path by the wheel (or the note's own
// slide), and the modes' swing there.
void ChladniPlateEngine::place(Voice &v) {
  const Plate &pl = *v.plate.data;
  const Spots &sp = pl.spots[std::clamp((int)P[p::figure], 0, NFIG - 1)];
  v.s = pathShift(sp.bow, v.shift);
  v.Yb = 0;
  for (int j = 0; j < v.M; j++) {
    v.b[j] = edgeShape(pl, j, v.s);
    v.Yb += (v.b[j] * v.b[j] * v.bf[j]) * fs;
  }
}

void ChladniPlateEngine::start(Voice &v, int key, KeyData<Plate>::Ref ref) {
  if (v.plate) plates.release(v.plate);
  v = Voice{};
  v.key = key;
  v.after = pressureAll;
  v.plate = ref;
  v.figure = (int)P[p::figure];
  plates.acquire(ref);
  const Plate &pl = *ref.data;
  v.kp = keyPlate(key, P.data(), pl);
  v.M = std::min(v.kp.count, std::max(MODES_Q[(int)quality], v.kp.target + 5));
  const Spots &sp = pl.spots[std::clamp((int)P[p::figure], 0, NFIG - 1)];
  for (int j = 0; j < v.M; j++) {
    v.l[j] = shape(pl, j, MIC_L[0], MIC_L[1]);
    v.r[j] = shape(pl, j, MIC_R[0], MIC_R[1]);
    v.fin[j] = sp.finger[j];
  }
  v.shift = expr.slideOr(key, P[p::shift]);
  v.Nth = threshold(v.kp, P.data());
  coefficients(v);
}

void ChladniPlateEngine::pressure(double value, int key) { // MIDI aftertouch: channel (key −1) or polyphonic
  if (key < 0) { pressureAll = value; for (int i = 0; i < count; i++) voices[i]->after = value; }
  else for (int i = 0; i < count; i++) if (voices[i]->key == key) voices[i]->after = value;
}

void ChladniPlateEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < 21 || key > 108) return;
  const auto ref = plates.get(plateId(P.data()), version);
  if (!ref) { // the plate is still being worked out (the plugins, just after a change): the note waits
    for (int i = 0; i < npending; i++) if (pending[i].key == key) { pending[i].vel = velocity; return; }
    if (npending < NK) pending[npending++] = {key, velocity};
    return;
  }
  Voice *v = nullptr;
  for (int i = 0; i < count && !v; i++) if (voices[i]->key == key) v = voices[i];
  // a plate made for other parameters (another material, figure or tuning) is made afresh; a
  // sounding one is bowed again as it is
  const bool fresh = !v || v->dead || v->plate.data != ref.data || (int)P[p::figure] != v->figure ||
                     keyPlate(key, P.data(), *ref.data).side != v->kp.side;
  if (!v) {
    v = &slots[key - 21];
    voices[count++] = v;
    if (count > VOICES[(int)quality]) { // let go of the quietest plate no bow is on (never a bowed one)
      Voice *q = nullptr;
      for (int i = 0; i < count; i++) { Voice *x = voices[i]; if (!x->touch && x != v && (!q || x->peak < q->peak)) q = x; }
      if (q) q->dead = true;
    }
  }
  if (fresh) start(*v, key, ref);
  v->touch = true; v->vel = velocity; v->hand = false;
  v->bite = BITE * velocity; // the bow set on the edge bites: pressed harder for its first strokes
  coefficients(*v);
  focus = key;
}

void ChladniPlateEngine::noteOff(int key, double) {
  for (int i = 0; i < npending; i++) if (pending[i].key == key) { pending[i] = pending[--npending]; return; }
  for (int i = 0; i < count; i++)
    if (voices[i]->key == key) { voices[i]->touch = false; if (!sustain) { voices[i]->hand = true; coefficients(*voices[i]); } }
}

void ChladniPlateEngine::setSustain(bool on) {
  sustain = on;
  if (!on) for (int i = 0; i < count; i++) if (!voices[i]->touch) { voices[i]->hand = true; coefficients(*voices[i]); }
}

void ChladniPlateEngine::kill(Voice &v) {
  v.dead = true;
  if (v.plate) { plates.release(v.plate); v.plate = {}; }
}

void ChladniPlateEngine::allNotesOff() {
  for (int i = 0; i < count; i++) kill(*voices[i]);
  count = 0; npending = 0;
}

void ChladniPlateEngine::process(float *L, float *R, int n) {
  for (int at = 0; at < n; at += 128) run(L + at, R + at, std::min(128, n - at));
  plates.audioCycle();
}

void ChladniPlateEngine::run(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasParams) return;
  if (npending) { // notes waiting for their plate
    const auto ref = plates.get(plateId(P.data()), version);
    if (ref) { const int m = npending; npending = 0; for (int i = 0; i < m; i++) noteOn(pending[i].key, pending[i].vel); }
  }
  const double k = 1 / fs, bn = n * k;
  const Friction fr = friction(P.data());
  const double dmu = fr.mus - fr.mud;
  const double lamOn = 1 - std::exp(-k / LAND), lamOff = 1 - std::exp(-k / LIFT), lamV = 1 - std::exp(-k / DRAW);
  for (int vi = 0; vi < count; vi++) {
    Voice &v = *voices[vi];
    if (v.dead) continue;
    coefficients(v); // the finger lifted or set down
    const double to = expr.slideOr(v.key, P[p::shift]);
    if (to != v.shift) { v.shift = glideTo(v.shift, to, bn, SHIFT_T); place(v); }
    const int M = v.M;
    double *q = v.q.data(), *q1 = v.q1.data();
    const double *a1 = v.a1.data(), *a2 = v.a2.data(), *bf = v.bf.data(), *b = v.b.data(), *l = v.l.data(), *r = v.r.data();
    // the bow's force: the slider (times the figure's speaking threshold) through velocity (how hard
    // the key draws it) and aftertouch
    // the key draws it), aftertouch and the attack's bite, which lets go over BITE_T cycles of the note
    const double Nt = v.touch ? std::min(MAXFORCE, P[p::force] * v.Nth * (0.5 + v.vel) * (1 + v.after) * (1 + v.bite)) : 0, Vt = P[p::speed];
    v.bite *= std::exp(-(bn * v.kp.f0) / BITE_T);
    const double Yb = v.Yb;
    double pk = 0, sticks = 0;
    for (int i = 0; i < n; i++) {
      v.N += (Nt - v.N) * (v.touch ? lamOn : lamOff);
      if (!v.touch && v.N < 1e-5) v.N = 0;
      v.V += ((v.touch ? Vt : v.V) - v.V) * lamV;
      // free step of every mode
      double X = 0, Xf = 0;
      for (int j = 0; j < M; j++) {
        const double y = a1[j] * q[j] - a2[j] * q1[j];
        X += b[j] * q[j]; Xf += b[j] * y;
        q1[j] = q[j]; q[j] = y;
      }
      double F = 0;
      if (v.N > 0) {
        // the edge's velocity under the bow is vf + Yb·F; the hair moves at V
        const double vf = (Xf - X) * fs, s0 = v.V - vf, cc = Yb * v.N;
        rng = (int32_t)((uint32_t)rng * 1664525u + 1013904223u);
        const double nz = 1 + NOISE * (rng / 2147483648.0);
        const double ms = fr.mus * nz, md = fr.mud * nz, dm = dmu * nz;
        if (std::fabs(s0) <= cc * ms) { F = s0 / Yb; v.stick = true; v.slip = 0; sticks++; }
        else {
          // slip in the direction of s0 at the speed u solving u − |s0| + Yb N μ(u) = 0, by Newton
          // from the last slip speed, kept inside the bracket (0, |s0|)
          const double sg = s0 > 0 ? 1 : -1, a = sg * s0;
          double lo = 0, hi = a, u = v.slip > 0 && v.slip < a ? v.slip : 0.5 * a, mu = 0;
          for (int it = 0; it < 30; it++) {
            const double e = 1 / (1 + u / fr.v0);
            mu = md + dm * e;
            const double ph = u - a + cc * mu;
            if (ph > 0) hi = u; else lo = u;
            if (std::fabs(ph) < 1e-13 + 1e-10 * a) break;
            const double d = 1 - (cc * dm * e * e) / fr.v0;
            double un = u - ph / d;
            if (!(d > 0 && un > lo && un < hi)) un = 0.5 * (lo + hi);
            u = un;
          }
          F = sg * v.N * mu; v.stick = false; v.slip = u;
        }
        for (int j = 0; j < M; j++) q[j] += bf[j] * b[j] * F;
      } else { v.slip = 0; v.stick = false; }
      v.F = F;
      // the microphones: the plate's velocity under each
      double ol = 0, orr = 0;
      for (int j = 0; j < M; j++) { const double d = q[j] - q1[j]; ol += l[j] * d; orr += r[j] * d; }
      ol *= OUT * fs; orr *= OUT * fs;
      L[i] = (float)(L[i] + ol); // a Float32Array's +=
      R[i] = (float)(R[i] + orr);
      pk = std::max(pk, std::max(std::fabs(ol), std::fabs(orr)));
    }
    v.peak = pk;
    v.sticks = sticks / n;
    if (!v.touch && v.N == 0) { v.quiet = pk < QUIET[(int)quality] ? v.quiet + 1 : 0; if (v.quiet > 40) kill(v); }
  }
  int j = 0;
  for (int i = 0; i < count; i++) {
    if (voices[i]->dead && voices[i]->plate) kill(*voices[i]);
    if (!voices[i]->dead) voices[j++] = voices[i];
  }
  count = j;
  if (messages && ++tick >= 6) { tick = 0; report(); }
}

// Throttled state for the page's sand: the focused plate's modal amplitudes, then the state.
void ChladniPlateEngine::report() {
  const Voice *v = nullptr;
  for (int i = 0; i < count && !v; i++) if (voices[i]->key == focus) v = voices[i];
  Message m;
  m.key = (int16_t)focus;
  if (v) {
    m.type = msg::amps;
    for (int i = 0; i < v->M;) {
      const int c = std::min(29, v->M - i);
      m.count = (uint16_t)(c + 1); m.values[0] = (float)i;
      for (int j = 0; j < c; j++) {
        const int n = i + j;
        const double w = 2 * std::numbers::pi * v->kp.f[n], vel = (v->q[n] - v->q1[n]) * fs;
        m.values[1 + j] = (float)std::sqrt(v->q[n] * v->q[n] + (vel / w) * (vel / w));
      }
      post(m);
      i += c;
    }
  }
  m.type = msg::state;
  const Spots *sp = v ? &v->plate.data->spots[std::clamp((int)P[p::figure], 0, NFIG - 1)] : nullptr;
  const double s[16] = {(double)plateId(P.data()), v ? (double)v->kp.target : 0, v ? v->s : 0, sp ? sp->fx[0] : 0, sp ? sp->fy[0] : 0,
                        P[p::finger], v ? v->kp.side : 0, v ? v->kp.f0 : 0, v ? (double)v->M : 0, v ? v->sticks : 0, v ? v->N : 0,
                        v && v->touch ? 1.0 : 0.0, (double)count, sp ? sp->fx[1] : 0, sp ? sp->fy[1] : 0, v ? v->Nth : 0};
  m.count = 16;
  for (int q = 0; q < 16; q++) m.values[q] = (float)s[q];
  post(m);
}

} // namespace forte::chladni
