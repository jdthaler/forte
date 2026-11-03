// planets-engine.cpp — the Ringing Planets' engine (planets-engine.h).

#include "planets-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"
#include "forte/fdlibm.h"

namespace forte::planets {

namespace fd = forte::fdlibm;
constexpr double OUT = 0.06;          // the reference quake's rms at the start, at Mw 9
constexpr double RELEASE = 0.15;      // s: a key let go stops the recording, fading this fast
constexpr double FLOOR = 3e-5;        // an oscillator this far under the voice's loudest (at the start) is gone

PlanetEngine::PlanetEngine(double fs) : Engine(fs) {
  for (Voice &v : voices) { v.cL.reserve(2 * MAX_COEF); v.cR.reserve(2 * MAX_COEF); }
  order.reserve(resp.m.capacity());
}

void PlanetEngine::setParams(const double *p) {
  static constexpr int geo[] = {p::planet, p::atten, p::mech, p::strike, p::depth, p::distance, p::azimuth, p::lat, p::sensor};
  for (int i : geo) if (P[i] != p[i]) dirty = true;
  if (!hasParams) dirty = true;
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
}

int PlanetEngine::voiceCount() const {
  int n = 0;
  for (const Voice &v : voices) n += v.on;
  return n;
}

void PlanetEngine::setSustain(bool on) {
  sustain = on;
  if (!on) for (Voice &v : voices) if (v.on && v.released) v.damped = true;
}

void PlanetEngine::allNotesOff() {
  for (Voice &v : voices) { v.on = false; v.count = 0; }
}

// E = Σ_m c_m e^{imψ}, from m = −l (ψ: the oscillator's spin turn, e^{iψ} = pr + i pi)
void PlanetEngine::envelope(const Voice &v, const Osc &o, double *eL, double *eR) {
  // E = e^{−ilψ} Σ_k c_k e^{ikψ}: the sum by Horner, e^{ilψ} by squaring (|e^{iψ}| = 1, so its inverse is its conjugate)
  double qr = 1, qi = 0, br = o.pr, bi = o.pi;
  for (int e = o.l; e > 0; e >>= 1) {
    if (e & 1) { const double t = qr * br - qi * bi; qi = qr * bi + qi * br; qr = t; }
    const double t = br * br - bi * bi; bi = 2 * br * bi; br = t;
  }
  qi = -qi;
  const double pr = o.pr, pi = o.pi;
  const int top = 2 * o.l;
  const double *cl = v.cL.data() + o.off, *cr = v.cR.data() + o.off;
  double lr = cl[2 * top], li = cl[2 * top + 1];
  for (int k = top - 1; k >= 0; k--) { const double t = lr * pr - li * pi + cl[2 * k]; li = lr * pi + li * pr + cl[2 * k + 1]; lr = t; }
  eL[0] = lr * qr - li * qi; eL[1] = lr * qi + li * qr;
  if (v.stereo) {
    double rr = cr[2 * top], ri = cr[2 * top + 1];
    for (int k = top - 1; k >= 0; k--) { const double t = rr * pr - ri * pi + cr[2 * k]; ri = rr * pi + ri * pr + cr[2 * k + 1]; rr = t; }
    eR[0] = rr * qr - ri * qi; eR[1] = rr * qi + ri * qr;
  } else { eR[0] = eL[0]; eR[1] = eL[1]; }
}

void PlanetEngine::start(Voice &v, int key, double velocity) {
  if (dirty) { respond(P.data(), resp); dirty = false; }
  v.key = key; v.on = true; v.released = false; v.damped = false; v.level = 1;
  v.stereo = resp.stereo;
  v.K = speedup(key, P.data());
  v.spin = expr.slideOr(key, P[p::spin]);
  v.Kc = 0; v.spinC = -1; v.nC = 0;
  const double mw = magnitude(velocity, P.data()), h = halfDuration(mw, P.data());
  const double scale = OUT * fd::pow(10.0, 1.5 * (mw - MW_REF));
  const double nyq = 0.45 * TAU * fs / v.K;
  // the strongest multiplets, through the rupture's filter, below Nyquist
  order.clear();
  double top = 0;
  for (int i = 0; i < (int)resp.m.size(); i++) {
    const Multiplet &m = resp.m[i];
    if (m.w > nyq) continue;
    order.push_back(i);
    top = std::max(top, m.bound * sourceSpectrum(m.w, h));
  }
  const auto score = [&](int i) { return resp.m[i].bound * sourceSpectrum(resp.m[i].w, h); };
  std::stable_sort(order.begin(), order.end(), [&](int a, int b) { return score(a) > score(b); });
  const int cap = pick(MAX_MULT, 80, 40);
  v.count = 0; v.cL.clear(); v.cR.clear(); v.peak = 0;
  for (int i : order) {
    const Multiplet &m = resp.m[i];
    const double F = sourceSpectrum(m.w, h), b = m.bound * F;
    if (v.count >= cap || b < 1e-4 * top) break;
    if ((int)v.cL.size() + 2 * (2 * m.l + 1) > 2 * MAX_COEF) continue;
    Osc &o = v.osc[v.count++];
    o = {};
    o.w = m.w; o.decay = m.decay; o.spinRate = m.spinRate; o.l = m.l; o.off = (int)v.cL.size();
    o.bound = b * scale; o.zr = 1; o.zi = 0; o.pr = 1; o.pi = 0;
    for (int k = 0; k < 2 * (2 * m.l + 1); k++) {
      v.cL.push_back(resp.cL[m.off + k] * F * scale);
      v.cR.push_back(resp.cR[m.off + k] * F * scale);
    }
    envelope(v, o, o.eL, o.eR);
    v.peak = std::max(v.peak, o.bound);
  }
}

void PlanetEngine::noteOn(int key, double velocity) {
  if (!hasParams) return;
  for (Voice &v : voices) if (v.on && v.key == key && !v.released) { v.released = true; if (!sustain) v.damped = true; }
  // a free voice, or the oldest
  int best = -1;
  for (int i = 0; i < MAX_VOICES; i++) if (!voices[i].on) { best = i; break; }
  if (best < 0) { best = 0; for (int i = 1; i < MAX_VOICES; i++) if (started[i] < started[best]) best = i; }
  started[best] = ++age;
  start(voices[best], key, velocity);
  // Quality: past 12 notes ringing at Medium and 6 at Low, the oldest is let go
  const int cap = pick(MAX_VOICES, 12, 6);
  for (;;) {
    int ringing = 0, oldest = -1;
    for (int i = 0; i < MAX_VOICES; i++) if (voices[i].on && !voices[i].damped) { ringing++; if (oldest < 0 || started[i] < started[oldest]) oldest = i; }
    if (ringing <= cap) break;
    voices[oldest].damped = true;
  }
}

void PlanetEngine::noteOff(int key, double) {
  for (Voice &v : voices) if (v.on && v.key == key && !v.released) { v.released = true; if (!sustain) v.damped = true; }
}

void PlanetEngine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  const double dt = n / fs, fall = fd::exp(-1 / (fs * RELEASE));
  const double wheelRatio = fd::pow(2.0, wheel * kBendSemitones / 12);
  for (Voice &v : voices) {
    if (!v.on) continue;
    v.spin = glideTo(v.spin, expr.slideOr(v.key, P[p::spin]), dt, 0.05);
    const double K = v.K * wheelRatio * expr.bendOf(v.key);
    const bool turns = K != v.Kc, spins = turns || v.spin != v.spinC || n != v.nC;
    v.Kc = K; v.spinC = v.spin; v.nC = n;
    double *bl = bufL.data(), *br = bufR.data();
    for (int i = 0; i < n; i++) bl[i] = br[i] = 0;
    const double inv = 1.0 / n;
    for (int j = 0; j < v.count;) {
      Osc &o = v.osc[j];
      const double ws = K * o.w, as = K * o.decay;
      if (turns) { const double r = fd::exp(-as / fs); o.rr = r * fd::cos(ws / fs); o.ri = r * fd::sin(ws / fs); }
      if (spins) { const double dpsi = K * o.spinRate * v.spin * dt; o.dr = fd::cos(dpsi); o.di = fd::sin(dpsi); }
      // the spin turns the pattern: the envelope at the block's end
      { const double t = o.pr * o.dr - o.pi * o.di; o.pi = o.pr * o.di + o.pi * o.dr; o.pr = t;
        const double g = 1 / std::sqrt(o.pr * o.pr + o.pi * o.pi); o.pr *= g; o.pi *= g; }
      double eL1[2], eR1[2];
      envelope(v, o, eL1, eR1);
      double zr = o.zr, zi = o.zi;
      const double rr = o.rr, ri = o.ri;
      if (ws < 0.49 * TAU * fs) {
        double er = o.eL[0], ei = o.eL[1];
        const double der = (eL1[0] - er) * inv, dei = (eL1[1] - ei) * inv;
        if (!v.stereo) {
          for (int i = 0; i < n; i++) {
            er += der; ei += dei;
            bl[i] += zr * er - zi * ei;
            const double t = zr * rr - zi * ri; zi = zr * ri + zi * rr; zr = t;
          }
        } else {
          double fr = o.eR[0], fi = o.eR[1];
          const double dfr = (eR1[0] - fr) * inv, dfi = (eR1[1] - fi) * inv;
          for (int i = 0; i < n; i++) {
            er += der; ei += dei; fr += dfr; fi += dfi;
            bl[i] += zr * er - zi * ei;
            br[i] += zr * fr - zi * fi;
            const double t = zr * rr - zi * ri; zi = zr * ri + zi * rr; zr = t;
          }
        }
      } else {
        for (int i = 0; i < n; i++) { const double t = zr * rr - zi * ri; zi = zr * ri + zi * rr; zr = t; }
      }
      o.zr = zr; o.zi = zi;
      o.eL[0] = eL1[0]; o.eL[1] = eL1[1]; o.eR[0] = eR1[0]; o.eR[1] = eR1[1];
      // gone under the floor: dropped (the last takes its place)
      if (std::sqrt(zr * zr + zi * zi) * o.bound < FLOOR * v.peak) { v.osc[j] = v.osc[--v.count]; continue; }
      j++;
    }
    double lv = v.level;
    for (int i = 0; i < n; i++) {
      if (v.damped) lv *= fall;
      L[i] = (float)(L[i] + lv * bl[i]);
      R[i] = (float)(R[i] + lv * (v.stereo ? br[i] : bl[i]));
    }
    v.level = lv;
    if (v.count == 0 || v.level < 1e-4) { v.on = false; v.count = 0; }
  }
}

} // namespace forte::planets
