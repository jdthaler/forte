// ionchain-engine.cpp — the Ion Chain's engine (ionchain-engine.h).

#include "ionchain-engine.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/dsp.h"
#include "forte/fdlibm.h"

namespace forte::ionchain {

namespace {
constexpr double PI = std::numbers::pi;
constexpr double OUT = 0.12;     // the amplifier: one ion kicked at full velocity peaks near this
constexpr double BEND_T = 0.01;  // the pitch wheel's glide (s)
constexpr double STEAL_T = 0.006; // a stolen voice's fade (s)
constexpr double DONE = 1e-9;    // a cooled voice ends below this (velocity amplitude squared)
} // namespace

IonChainEngine::IonChainEngine(double fs) : Engine(fs) {
  stateEvery = 128 * (int)std::ceil(fs / 128 / 30); // at most 30 times a second, in whole blocks
}

int IonChainEngine::voiceCount() const {
  int n = 0;
  for (const Voice &v : voices) n += v.alive;
  return n;
}

// A mode's displacement and velocity from its phasor: q = Re c, q̇ = Re((−σ + iω_d) c).
void IonChainEngine::motion(const Voice &v, double *q, double *qd) const {
  for (int m = 0; m < v.M; m++) { q[m] = v.cr[m]; qd[m] = -v.sig[m] * v.cr[m] - v.wd[m] * v.ci[m]; }
}
// And the phasor for a displacement and velocity: c = q − i (q̇ + σ q) / ω_d.
void IonChainEngine::place(Voice &v, const double *q, const double *qd) {
  for (int m = 0; m < v.M; m++) {
    if (!v.on[m]) { v.cr[m] = v.ci[m] = 0; continue; }
    v.cr[m] = q[m]; v.ci[m] = -(qd[m] + v.sig[m] * q[m]) / v.wd[m];
  }
}

// The voice's step and output weights for its frequency now (the note × the wheel's bend × its
// own × √λ) and its losses (the resistor's, the cooling laser's once cooled, a stolen voice's
// fade). keep: as the motion was, displacement and velocity, across the change.
void IonChainEngine::tune(Voice &v, bool keep) {
  double q[MAXM], qd[MAXM];
  if (keep) motion(v, q, qd);
  const double f = v.f0 * bendNow * v.bend, nyq = 0.45 * fs;
  for (int m = 0; m < v.M; m++) {
    const double fm = f * std::sqrt(v.lam[m]), w = 2 * PI * fm;
    const double s = v.sR[m] + (v.cooled ? v.sD[m] : 0) + (v.stolen ? 1 / STEAL_T : 0);
    const double wd = std::sqrt(std::max(w * w - s * s, 1e-6 * w * w)); // (overdamped: barely turning)
    const double a = fdlibm::exp(-s / fs);
    v.rr[m] = a * fdlibm::cos(wd / fs); v.ri[m] = a * fdlibm::sin(wd / fs);
    v.sig[m] = s; v.wd[m] = wd;
    // out = Re(W c) with W = w (−σ + iω_d): the mode's velocity, as each electrode hears it
    const double heard = fm < nyq ? 1 : 0;
    v.lr[m] = -s * v.wl[m] * heard; v.li[m] = -wd * v.wl[m] * heard;
    v.gr[m] = -s * v.wr[m] * heard; v.gi[m] = -wd * v.wr[m] * heard;
  }
  if (keep) place(v, q, qd);
}

void IonChainEngine::take(Voice &v) {
  v.N = crystal.N; v.M = crystal.M;
  for (int m = 0; m < v.M; m++) {
    v.lam[m] = crystal.lam[m]; v.wl[m] = cpl.wl[m]; v.wr[m] = cpl.wr[m]; v.sR[m] = cpl.sR[m]; v.sD[m] = cpl.sD[m];
  }
}

double IonChainEngine::energy(const Voice &v) const {
  double e = 0;
  for (int m = 0; m < v.M; m++) e += (v.cr[m] * v.cr[m] + v.ci[m] * v.ci[m]) * v.wd[m] * v.wd[m];
  return e;
}

void IonChainEngine::setParams(const double *p) {
  const bool first = !hasP;
  const int N = std::clamp((int)std::lround(p[p::ions]), 1, MAXN);
  const bool solve = first || N != (int)std::lround(P[p::ions]) || p[p::aniso] != P[p::aniso];
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasP = true;
  const forte::Tuning tuning = tuningOf(P.data());
  for (int k = 0; k < 128; k++) keyTarget[k] = keyFreq(k) * tuning.ratio(k);
  if (solve) {
    before = crystal;
    solveCrystal(crystal, N, P[p::aniso], before.N == N ? &before : nullptr);
  }
  couple(crystal, P.data(), cpl);
  for (Voice &v : voices) {
    if (!v.alive) continue;
    v.f0 = keyTarget[v.key];
    if (v.N != crystal.N) { tune(v); continue; } // a crystal of other ions: it rings on as it was
    if (solve && before.N == v.N) {
      // onto the new modes: x = B_before q, then q' = B_nowᵀ x (both orthonormal)
      double a[MAXM], ad[MAXM], x[MAXM], xd[MAXM], b[MAXM], bd[MAXM];
      motion(v, a, ad);
      const int M = v.M;
      for (int d = 0; d < M; d++) {
        double s = 0, sd = 0;
        for (int m = 0; m < M; m++) { s += before.B[d][m] * a[m]; sd += before.B[d][m] * ad[m]; }
        x[d] = s; xd[d] = sd;
      }
      for (int m = 0; m < M; m++) {
        double s = 0, sd = 0;
        for (int d = 0; d < M; d++) { s += crystal.B[d][m] * x[d]; sd += crystal.B[d][m] * xd[d]; }
        b[m] = s; bd[m] = sd;
      }
      take(v);
      tune(v, false);
      place(v, b, bd);
    } else {
      take(v);
      tune(v);
    }
  }
}

void IonChainEngine::noteOn(int key, double velocity) {
  if (!hasP) return;
  key &= 127;
  Voice *v = nullptr;
  for (Voice &x : voices) if (x.alive && x.key == key && !x.stolen) {
    if (x.N == crystal.N) v = &x;
    else if (!x.cooled) cool(x); // another crystal's: let it go and start this one
  }
  if (!v) {
    for (Voice &x : voices) if (!x.alive) { v = &x; break; }
    if (!v) { // every slot rings: the oldest goes at once
      v = &voices[0];
      for (Voice &x : voices) if (x.born < v->born) v = &x;
    }
    *v = Voice{};
    v->alive = true; v->key = key;
    v->f0 = keyTarget[key];
    v->bend = expr.bendOf(key);
    take(*v);
    // Quality: Medium and Low leave out the modes the electrodes hardly hear
    double top = 0;
    for (int m = 0; m < v->M; m++) top = std::max({top, std::fabs(v->wl[m]), std::fabs(v->wr[m])});
    const double floor = pick(0.0, 0.03, 0.1) * top, nyq = 0.45 * fs, f = v->f0 * bendNow * v->bend;
    for (int m = 0; m < v->M; m++)
      v->on[m] = quality == Quality::high || (std::max(std::fabs(v->wl[m]), std::fabs(v->wr[m])) > floor && f * std::sqrt(v->lam[m]) < nyq);
    tune(*v, false);
  }
  v->born = ++clock;
  v->held = true;
  if (v->cooled) { v->cooled = false; tune(*v); }
  // the pulse: a kick to each mode's velocity, through the pulse's spectrum at the mode's own
  // frequency in the trap (SLOW times the heard one)
  const double tau = P[p::pulse] * 1e-6, f = v->f0 * bendNow * v->bend;
  for (int m = 0; m < v->M; m++) {
    if (!v->on[m]) continue;
    const double dv = velocity * cpl.kick[m] * pulseSpectrum(SLOW * f * std::sqrt(v->lam[m]), tau);
    v->ci[m] -= dv / v->wd[m];
  }
  newest = v;
  // the voices ringing at once: past the cap the oldest fades out fast
  int live = 0;
  for (const Voice &x : voices) live += x.alive && !x.stolen;
  if (live > pick(kMaxVoices, 16, 8)) {
    Voice *old = nullptr;
    for (Voice &x : voices) if (x.alive && !x.stolen && &x != v && (!old || x.born < old->born)) old = &x;
    if (old) { old->stolen = true; tune(*old); }
  }
}

void IonChainEngine::cool(Voice &v) {
  v.held = false;
  if (!v.cooled) { v.cooled = true; tune(v); }
}

void IonChainEngine::noteOff(int key, double) {
  for (Voice &v : voices) if (v.alive && v.key == (key & 127) && v.held) {
    if (sustain) v.held = false; else cool(v);
  }
}

void IonChainEngine::setSustain(bool on) {
  sustain = on;
  if (!on) for (Voice &v : voices) if (v.alive && !v.held && !v.cooled) cool(v);
}

void IonChainEngine::allNotesOff() {
  for (Voice &v : voices) v.alive = false;
  newest = nullptr;
}

void IonChainEngine::bend(double value) {
  bendTo = fdlibm::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12);
}

void IonChainEngine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasP) return;
  const double dt = n / fs, was = bendNow;
  bendNow = glideTo(bendNow, bendTo, dt, BEND_T);
  for (Voice &v : voices) {
    if (!v.alive) continue;
    const double b = glideTo(v.bend, expr.bendOf(v.key), dt, BEND_T);
    if (b != v.bend || bendNow != was) { v.bend = b; tune(v); }
    for (int i = 0; i < n; i++) {
      double l = 0, r = 0;
      for (int m = 0; m < v.M; m++) {
        if (!v.on[m]) continue;
        const double cr = v.cr[m] * v.rr[m] - v.ci[m] * v.ri[m], ci = v.cr[m] * v.ri[m] + v.ci[m] * v.rr[m];
        v.cr[m] = cr; v.ci[m] = ci;
        l += v.lr[m] * cr - v.li[m] * ci;
        r += v.gr[m] * cr - v.gi[m] * ci;
      }
      L[i] = (float)(L[i] + OUT * l); // a Float32Array's +=
      R[i] = (float)(R[i] + OUT * r);
    }
    if ((v.cooled || v.stolen) && energy(v) < DONE) { v.alive = false; if (newest == &v) newest = nullptr; }
  }
  if ((sinceState += n) >= stateEvery) {
    sinceState = 0;
    const Voice *v = newest && newest->alive ? newest : nullptr;
    if (v && v->N == crystal.N) {
      // each ion's motion, as a camera sees it: the RMS of its displacement along and across the
      // axis over the modes (in ℓ, before the kick's scale), and whether the cooling light is on
      Message a, b;
      a.type = msg::axial; b.type = msg::radial; a.key = b.key = (int16_t)v->key;
      a.values[0] = (float)(v->f0 * bendNow * v->bend); a.values[1] = v->cooled ? 1.f : 0.f;
      for (int j = 0; j < v->N; j++) {
        double sz = 0, sx = 0;
        for (int m = 0; m < v->M; m++) {
          const double c2 = 0.5 * (v->cr[m] * v->cr[m] + v->ci[m] * v->ci[m]);
          sz += crystal.B[2 * j + 1][m] * crystal.B[2 * j + 1][m] * c2;
          sx += crystal.B[2 * j][m] * crystal.B[2 * j][m] * c2;
        }
        a.values[2 + j] = (float)std::sqrt(sz); b.values[j] = (float)std::sqrt(sx);
      }
      a.count = (uint16_t)(2 + v->N); b.count = (uint16_t)v->N;
      post(a); post(b);
    }
  }
}

} // namespace forte::ionchain
