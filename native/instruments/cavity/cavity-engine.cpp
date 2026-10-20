// cavity-engine.cpp — the RF cavity bells' engine (cavity-engine.h).

#include "cavity-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"

namespace forte::cavity {

constexpr double OUT = 0.12;
constexpr double BEND_T = 0.02;     // s: the pitch wheel's glide (the tuner squeezing the cavity)
constexpr double PRESS_T = 0.02;    // s: a key's pressure is followed with this time constant
constexpr double REPORT_HZ = 30;    // messages to the page a second
constexpr double SILENT = 1e-8;     // a voice whose stored energy falls below this has finished (−90 dB),
constexpr double SILENT_DAMPED = 1e-6; // or this once let go (the trapped modes the coupler hardly reaches)
constexpr double MODE_SILENT = 1e-14;
constexpr double STEAL_T = 0.004;   // s: a stolen voice's amplitudes fade with this time constant

// A bunch of charge q arriving frac of a sample before the sample the amplitudes stand at:
// each mode takes the bunch's kick, turned on by the rest of that sample (to second order).
void CavityBellsEngine::Voice::kick(double q, double frac) {
  for (int j = 0; j < cav.count; j++) {
    if (!use[j] || w[j] > 0.45 * TAU) continue; // Quality's cut, or past Nyquist (a key bent far up): a sample cannot hold it
    const double psi = w[j] * frac, c = 1 - 0.5 * psi * psi, s = psi - (psi * psi * psi) / 6;
    const double kr = q * cav.modes[j].kick.real(), ki = q * cav.modes[j].kick.imag();
    ar[j] += kr * c - ki * s;
    ai[j] += kr * s + ki * c;
    on[j] = true;
  }
}

CavityBellsEngine::CavityBellsEngine(double fs) : Engine(fs) { voices.reserve(2 * kMaxVoices); }

// The modes a bunch rings: all of them, or (with Quality's cut) those heard within `cut` of the
// loudest, by the kick a bunch gives them and their larger probe.
void CavityBellsEngine::choose(Voice &v) {
  const Cavity &c = v.cav;
  double top = 0;
  for (int j = 0; j < c.count; j++) top = std::max(top, std::abs(c.modes[j].kick) * std::max(std::fabs(c.modes[j].x1), std::fabs(c.modes[j].xN)));
  for (int j = 0; j < c.count; j++) v.use[j] = std::abs(c.modes[j].kick) * std::max(std::fabs(c.modes[j].x1), std::fabs(c.modes[j].xN)) >= v.cut * top;
}

int CavityBellsEngine::ringing() const {
  int k = 0;
  for (const Voice &v : voices) for (int j = 0; j < v.cav.count; j++) k += v.on[j];
  return k;
}

void CavityBellsEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
  version++;
  for (Voice &v : voices) {
    const int count = v.cav.count, cells = v.cav.cells;
    v.cav = cavityOf(v.key, P.data());
    if (v.cav.cells != cells) { v.ar.fill(0); v.ai.fill(0); } // a new cavity: what rang has gone
    if (std::isnan(ex.slideOr(v.key, NAN))) { v.off = P[p::offset]; choose(v); } // a key's own offset (MPE) stays its own
    else aim(v, v.off);
    retune(v, count);
  }
}

// The modes' turn per sample at the current bend (the wheel's and the key's own) and detuning
// (their decay is set per block).
void CavityBellsEngine::retune(Voice &v, int count) {
  for (int j = count; j < v.cav.count; j++) v.ar[j] = v.ai[j] = 0;
  const double r = bendNow * v.nb * std::pow(2.0, v.det / 1200);
  for (int j = 0; j < v.cav.count; j++) v.w[j] = (TAU * v.cav.modes[j].f * r) / fs;
}

// The kicks of a beam that passes `offset` off the axis (a key's slide): each band's field where
// the bunch crosses the cells, and the modes Quality rings for them; the rest of the cavity is P's.
void CavityBellsEngine::aim(Voice &v, double offset) {
  v.off = offset;
  double radial[BANDS];
  for (int b = 0; b < BANDS; b++) radial[b] = radialOf(b, offset);
  for (int j = 0; j < v.cav.count; j++) { Mode &m = v.cav.modes[j]; m.kick = m.kick1 * radial[m.band]; }
  choose(v); // off the axis other modes are the loud ones
}

void CavityBellsEngine::setSustain(bool on) {
  sustain = on;
  if (!on) for (Voice &v : voices) if (v.released) v.damped = true;
}

void CavityBellsEngine::bend(double value) {
  bendTo = std::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12);
}

void CavityBellsEngine::noteOn(int key, double velocity) {
  if (!hasParams) return;
  Voice *v = nullptr;
  for (Voice &x : voices) if (x.key == key) { v = &x; break; }
  if (!v) {
    voices.emplace_back();
    v = &voices.back();
    v->key = key;
    v->cav = cavityOf(key, P.data());
    v->off = P[p::offset];
    v->nb = ex.bendOf(key);
    // Quality: Medium and Low ring only the modes heard within 40 and 30 dB of the loudest, and let
    // a mode go 30 and 50 dB sooner than High, the key 5 and 20 dB sooner
    v->cut = pick(0.0, 1e-2, 3e-2);
    v->modeSilent = pick(MODE_SILENT, 1e-10, 1e-8);
    v->silent = pick(SILENT, 3e-8, 1e-6);
    choose(*v);
    retune(*v, 0);
  }
  // the key's own bend and beam offset (MPE) from this bunch on, without a glide
  v->nb = ex.bendOf(key);
  if (const double off = ex.slideOr(key, P[p::offset]); off != v->off) aim(*v, off);
  // a second bunch adds to what still rings, in or out of phase with it
  v->charge = velocity;
  v->held = true; v->released = false; v->damped = false; v->stolen = false;
  v->kick(velocity, 0);
  v->toNext = (P[p::spacing] * fs) / (v->cav.fpi * (bendNow * v->nb));
  focus = key;
  // past kMaxVoices (Quality: 16 at Medium, 8 at Low), the quietest voice whose key is up (or else
  // the oldest) fades out
  int live = 0;
  Voice *victim = nullptr;
  for (Voice &x : voices) {
    if (x.stolen) continue;
    live++;
    if (&x != v && !x.held && (!victim || x.peak < victim->peak)) victim = &x;
  }
  if (live > pick(kMaxVoices, 16, 8)) {
    if (!victim) for (Voice &x : voices) if (!x.stolen && &x != v) { victim = &x; break; }
    if (victim) victim->stolen = true;
  }
  if ((int)voices.size() >= 2 * kMaxVoices) { // keys faster than the fades: the oldest fading voice goes at once
    for (auto it = voices.begin(); it != voices.end(); ++it) if (it->stolen) { voices.erase(it); break; }
  }
}

void CavityBellsEngine::noteOff(int key, double) {
  for (Voice &v : voices) if (v.key == key && !v.released) { v.held = false; v.released = true; if (!sustain) v.damped = true; }
}

void CavityBellsEngine::pressure(double value, int key) {
  for (Voice &v : voices) if (key < 0 || key == v.key) v.pressTarget = value;
}

void CavityBellsEngine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasParams) return;
  const double dt = n / fs;
  if (bendNow != bendTo) {
    bendNow += (bendTo - bendNow) * (1 - std::exp(-dt / BEND_T));
    if (std::fabs(bendNow - bendTo) < 1e-9) bendNow = bendTo;
  }
  const bool far = (int)P[p::probe] == 1;
  const double Qin = P[p::qext], Qhom = P[p::qhom], Qrel = P[p::release];
  // the walls' mechanical mode, a two-pole low-pass at unit gain that the detuning follows
  const ModeCoeffs mc = modeCoeffs(P[p::mech], (std::numbers::pi * P[p::mech]) / Q_MECH, fs);
  const double mg = 1 - mc.a1 + mc.a2;
  for (Voice &v : voices) {
    const Cavity &c = v.cav;
    const int N = c.cells;
    // the accelerating passband's field: its energy (Σ|A|² over N, 1 in a full bunch's field) and
    // its peak cell
    double e2 = 0, peak = 0;
    for (int j = 0; j < N; j++) e2 += v.ar[j] * v.ar[j] + v.ai[j] * v.ai[j];
    e2 /= N;
    for (int cell = 0; cell < N; cell++) {
      double er = 0, ei = 0;
      for (int j = 0; j < N; j++) { const double x = c.x[j * N + cell]; er += v.ar[j] * x; ei += v.ai[j] * x; }
      peak = std::max(peak, er * er + ei * ei);
    }
    v.peak = std::sqrt(peak);
    if (!v.quenched && v.peak > P[p::quench]) { v.quenched = true; v.quenchLeft = P[p::recovery]; }
    else if (v.quenched && (v.quenchLeft -= dt) <= 0) v.quenched = false;
    // Lorentz detuning: −K·E², through the walls' mechanical mode
    const double drive = -P[p::lorentz] * e2;
    for (int i = 0; i < n; i++) { const double d = mc.a1 * v.det - mc.a2 * v.det1 + mg * drive; v.det1 = v.det; v.det = d; }
    v.press += (v.pressTarget - v.press) * (1 - std::exp(-dt / PRESS_T));
    // the key's own bend and offset (MPE) glide as the wheel does; the offset re-cuts the kicks
    v.nb = glideTo(v.nb, ex.bendOf(v.key), dt, BEND_T);
    if (const double off = ex.slideOr(v.key, P[p::offset]); off != v.off) aim(v, glideTo(v.off, off, dt, BEND_T));
    retune(v, c.count);
    // each mode's turn and decay this block
    double energy = 0;
    for (int j = 0; j < c.count; j++) {
      if (!v.use[j] && !v.on[j]) continue; // left out by Quality: never rung
      if (v.w[j] > 0.45 * TAU) { v.ar[j] = v.ai[j] = 0; v.on[j] = false; continue; } // past Nyquist
      const double sig = decayRate(c.modes[j], Qin, Qhom, v.damped ? Qrel : 0, v.quenched) * (v.w[j] / (TAU * c.modes[j].f / fs))
                         + (v.stolen ? 1 / STEAL_T : 0);
      const double g = std::exp(-sig / fs);
      v.rr[j] = g * std::cos(v.w[j]);
      v.ri[j] = g * std::sin(v.w[j]);
      const double e = v.ar[j] * v.ar[j] + v.ai[j] * v.ai[j];
      energy += e;
      if (e < v.modeSilent) { v.ar[j] = v.ai[j] = 0; v.on[j] = false; }
    }
    // the train: while the key is held, a bunch every `spacing` periods of the π mode
    const double current = std::clamp(P[p::current] + v.press * (1 - P[p::current]), 0.0, 1.0);
    const bool train = v.held && !v.stolen && current > 0;
    // (the train keeps time with the accelerator's master oscillator, which the pitch wheel moves
    // with the cavity's tuner, and a key's own bend with its own; the Lorentz detuning moves the
    // cavity alone)
    const double q = TRAIN * v.charge * current, Tb = (P[p::spacing] * fs) / (c.fpi * (bendNow * v.nb));
    if (!train) v.toNext = Tb;
    // the block in pieces between the bunches' arrivals
    int i0 = 0;
    while (i0 < n) {
      const bool hit = train && v.toNext < n - i0; // a bunch arrives before the block ends
      const int i1 = hit ? i0 + (int)std::floor(v.toNext) + 1 : n;
      const double frac = hit ? i1 - i0 - v.toNext : 0;
      for (int j = 0; j < c.count; j++) {
        if (!v.on[j]) continue;
        double a = v.ar[j], b = v.ai[j];
        const double cr = v.rr[j], ci = v.ri[j], gl = far ? c.modes[j].xN : c.modes[j].x1, gr = c.modes[j].xN;
        for (int i = i0; i < i1; i++) {
          L[i] = (float)(L[i] + OUT * a * gl); // a Float32Array's +=
          R[i] = (float)(R[i] + OUT * a * gr);
          const double t = a * cr - b * ci;
          b = a * ci + b * cr; a = t;
        }
        v.ar[j] = a; v.ai[j] = b;
      }
      if (hit) { v.kick(q, frac); v.toNext += Tb; }
      v.toNext -= i1 - i0;
      i0 = i1;
    }
    if (!train && energy < (v.damped || v.stolen ? std::max(SILENT_DAMPED, v.silent) : v.silent)) v.charge = 0; // finished
  }
  if (focus >= 0 && (sinceReport += n) >= fs / REPORT_HZ) {
    sinceReport = 0;
    for (const Voice &v : voices) if (v.key == focus) report(v);
  }
  std::erase_if(voices, [](const Voice &v) { return v.charge == 0; }); // finished voices, in place
}

// What the page draws: the accelerating passband's field in each cell, and the modes' levels.
void CavityBellsEngine::report(const Voice &v) {
  const Cavity &c = v.cav;
  const int N = c.cells;
  Message m;
  m.type = kCells; m.key = (int16_t)v.key; m.count = 30;
  for (int cell = 0; cell < N; cell++) {
    double er = 0, ei = 0;
    for (int j = 0; j < N; j++) { const double x = c.x[j * N + cell]; er += v.ar[j] * x; ei += v.ai[j] * x; }
    m.values[2 * cell] = (float)er; m.values[2 * cell + 1] = (float)ei;
  }
  m.values[24] = (float)v.peak; m.values[25] = (float)v.det; m.values[26] = v.quenched ? 1 : 0; m.values[27] = (float)N;
  post(m);
  Message s;
  s.type = kModes; s.key = (int16_t)v.key; s.count = 19;
  for (int j = 0; j < N; j++) s.values[j] = (float)std::hypot(v.ar[j], v.ai[j]);
  for (int b = 1; b < BANDS; b++) {
    double e = 0;
    for (int j = b * N; j < (b + 1) * N; j++) e += v.ar[j] * v.ar[j] + v.ai[j] * v.ai[j];
    s.values[11 + b] = (float)std::sqrt(e);
  }
  s.values[18] = (float)N;
  post(s);
}

} // namespace forte::cavity
