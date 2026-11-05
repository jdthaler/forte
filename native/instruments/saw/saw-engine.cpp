// saw-engine.cpp — the musical saw's engine (saw-engine.h).

#include "saw-engine.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/fdlibm.h"

namespace forte::saw {

using fdlibm::cos;
using fdlibm::exp;
using fdlibm::log2;
using fdlibm::pow;
using fdlibm::sin;
using std::numbers::pi;

constexpr double OUT = 5;            // the microphone: the blade's velocity under it (m/s), as heard
constexpr int CHUNK = 16;            // samples between turns of the modes' frequencies
constexpr double LAND = 0.02;        // s: the bow set on the edge
constexpr double LIFT = 0.01;        // s: and lifted off
constexpr double DRAW = 0.03;        // s: the bow getting up to speed
constexpr double NOISE = 0.02;       // the rosin's grain: friction's jitter
constexpr double MAXFORCE = 20;      // N: as hard as a hand presses a bow on a saw (on a bigger or smaller one, as λ², as its threshold scales)
constexpr double BITE = 3;           // a key struck at full velocity: the bow pressed this much harder at first
constexpr double BITE_T = 0.25;      // s: over which the bite lets go (1/e)
constexpr double MALLET_M = 0.02;    // kg: a felt mallet's head (scaled with a bigger or smaller saw, as λ³)
constexpr double VIB_IN = 0.35;      // s: the knee starts shaking once the note has started
constexpr double BEND_T = 0.03;      // s: the wheel's and a note's own bend, glided
constexpr double REBEND = 0.02;      // octaves the note moves before the blade is bent afresh (the rest is a turn of the modes)
constexpr double MIC_X = 0.4, MIC_U = 0.8; // the microphone: past the inflection toward the tip (in the note's ℓ), and across the blade
constexpr double STEAL_T = 0.02;     // s: a stolen voice's fade
constexpr double QUIET[3] = {1e-5, 3e-5, 1e-4}; // the peak under which a voice no bow is on stops (Quality)

SawEngine::SawEngine(double fs) : Engine(fs) {}

void SawEngine::setParams(const double *p) {
  const bool m = (int)p[p::mode] == mode_::saw;
  if (hasP && m != mono) { for (Voice &v : voices) v.held = false; held = 0; } // a change of playing lifts the fingers
  mono = m;
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasP = true;
  bl = blade(P.data());
  keyboard = tuningOf(P.data());
  for (int k = 0; k < 128; k++) keyTarget[k] = 440 * pow(2.0, (k - 69) / 12.0) * keyboard.ratio(k);
  version++;
}

int SawEngine::voiceCount() const {
  int n = 0;
  for (const Voice &v : voices) n += v.alive;
  return n;
}

// The modes' steps for their ω and σ now (and the hand's loss), and the edge's response to the bow.
static void coefficients(Voice &v, double T) {
  const double hand = v.stolen ? 1 / STEAL_T : v.hand ? std::log(1000.0) / HAND_T60 : 0;
  v.Y = 0; v.Yd = 0;
  for (int j = 0; j < v.M; j++) {
    const double s = v.pl.sigma[j] + hand, w = v.w[j], e = exp(-s * T);
    v.sg[j] = s;
    v.pr[j] = e * cos(w * T); v.pim[j] = e * sin(w * T);
    // the force held over the sample: Δz = F (p − 1) / ((−σ + iω) M ω)
    const double A = v.pr[j] - 1, B = v.pim[j], c2 = s * s + w * w, Mw = v.pl.mass[j] * w;
    v.gr[j] = (-s * A + w * B) / (c2 * Mw);
    v.gi[j] = (-w * A - s * B) / (c2 * Mw);
    v.Y += (v.b[j] * v.b[j] * v.pim[j]) / Mw;
    v.Yd += v.b[j] * v.b[j] * v.gi[j];
  }
}

void SawEngine::place(Voice &v) {
  const double x = 0.01 * P[p::place] * v.pl.lambda, xm = MIC_X * v.pl.ell[0];
  for (int j = 0; j < v.M; j++) {
    const auto [m, n] = MODES[j];
    v.b[j] = crossShape(m, 0) * hermite(n, x / v.pl.ell[j]);
    v.r[j] = crossShape(m, MIC_U) * hermite(n, xm / v.pl.ell[j]);
  }
  v.Nth = threshold(v.pl, P[p::speed]);
}

void SawEngine::bendFor(Voice &v, double f, bool fresh) {
  double old[NMODE];
  for (int j = 0; j < v.M; j++) old[j] = v.pl.mass[j] * v.w[j];
  v.pl = plan(bl, f);
  for (int j = 0; j < v.M; j++) {
    const double w = 2 * pi * v.pl.fm[j];
    if (!fresh && old[j] > 0) { const double k = std::sqrt(old[j] / (v.pl.mass[j] * w)); v.zr[j] *= k; v.zi[j] *= k; } // E/ω kept
    v.w[j] = w;
  }
  v.f = f;
  place(v);
  coefficients(v, 1 / fs);
}

// The note moved by a little (the knee, the wheel): every mode turns with it, its action kept.
void SawEngine::retune(Voice &v, double f) {
  const double r = f / v.pl.f;
  for (int j = 0; j < v.M; j++) {
    const double w = 2 * pi * v.pl.fm[j] * r, k = std::sqrt(v.w[j] / w);
    v.zr[j] *= k; v.zi[j] *= k; v.w[j] = w;
  }
  v.f = f;
  coefficients(v, 1 / fs);
}

void SawEngine::excite(Voice &v, double velocity) {
  v.vel = std::clamp(velocity, 0.0, 1.0);
  v.held = true; v.hand = false; v.quiet = 0;
  v.age = 0;
  if ((int)P[p::excite] == excite_::bow) v.bite = BITE * v.vel;
  else {
    double w = 0;
    for (int j = 0; j < v.M; j++) w += v.b[j] * v.zi[j];
    v.mallet = true; v.xm = w; v.vm = 0.05 + 0.5 * v.vel; // the felt arrives touching, at the mallet's speed
  }
  coefficients(v, 1 / fs);
}

void SawEngine::start(Voice &v, int key, double velocity) {
  v = Voice{};
  v.alive = true; v.key = key; v.born = t++;
  v.u = v.uTo = log2(keyTarget[key]);
  v.bend = expr.bendOf(key);
  v.vib = expr.slideOr(key, P[p::vibrato]);
  v.after = pressureAll;
  v.M = NMODES_Q[(int)quality];
  bendFor(v, pow(2.0, v.u) * bendNow * v.bend, true);
  built[&v - voices.data()] = version;
  excite(v, velocity);
}

// Past the Quality's voices, the oldest let-go voice is damped fast, else the oldest held one.
void SawEngine::steal(const Voice *keep) {
  Voice *victim = nullptr;
  for (int pass = 0; pass < 2 && !victim; pass++)
    for (Voice &v : voices)
      if (v.alive && !v.stolen && &v != keep && (pass == 1 || !v.held) && (!victim || v.born < victim->born)) victim = &v;
  if (!victim) return;
  victim->stolen = true; victim->held = false; victim->hand = true;
  coefficients(*victim, 1 / fs);
}

void SawEngine::noteOn(int key, double velocity) {
  if (!hasP || key < 0 || key > 127) return;
  if (mono) {
    int j = 0;
    for (int i = 0; i < held; i++) if (stack[i] != key) stack[j++] = stack[i];
    held = j; stack[held++] = key;
    Voice *w = nullptr;
    for (Voice &v : voices) if (v.alive && !v.stolen) { w = &v; break; }
    if (w && w->held) { // the player bends the blade to the new key: the note slides, the bow keeps on
      w->key = key; w->uTo = log2(keyTarget[key]);
      w->uRate = std::fabs(w->uTo - w->u) / P[p::glide];
      newest = w;
      return;
    }
    if (w) { // still ringing: bent to the new key, and played again
      w->key = key; w->u = w->uTo = log2(keyTarget[key]); w->uRate = 0;
      w->bend = expr.bendOf(key);
      excite(*w, velocity);
      newest = w;
      return;
    }
  } else {
    for (Voice &v : voices) if (v.alive && !v.stolen && v.key == key) { excite(v, velocity); newest = &v; return; }
  }
  Voice *v = nullptr;
  for (Voice &x : voices) if (!x.alive) { v = &x; break; }
  if (!v) for (Voice &x : voices) if (!v || x.born < v->born) v = &x;
  start(*v, key, velocity);
  newest = v;
  int live = 0;
  for (const Voice &x : voices) live += x.alive && !x.stolen;
  if (live > pick(kMaxVoices, 10, 6)) steal(v); // Quality: fewer saws at once
}

void SawEngine::noteOff(int key, double) {
  if (key < 0 || key > 127) return;
  auto letGo = [&](Voice &v) { v.held = false; if (!sustain) { v.hand = true; coefficients(v, 1 / fs); } };
  if (mono) {
    int j = 0;
    for (int i = 0; i < held; i++) if (stack[i] != key) stack[j++] = stack[i];
    held = j;
    for (Voice &v : voices) if (v.alive && v.held && v.key == key) {
      if (held > 0) { // back to the key still down
        v.key = stack[held - 1]; v.uTo = log2(keyTarget[v.key]);
        v.uRate = std::fabs(v.uTo - v.u) / P[p::glide];
      } else letGo(v);
    }
    return;
  }
  for (Voice &v : voices) if (v.alive && v.held && v.key == key) letGo(v);
}

void SawEngine::setSustain(bool on) {
  sustain = on;
  if (!on) for (Voice &v : voices) if (v.alive && !v.held && !v.hand) { v.hand = true; coefficients(v, 1 / fs); }
}

void SawEngine::allNotesOff() {
  for (Voice &v : voices) v.alive = false;
  held = 0;
  newest = nullptr;
}

void SawEngine::pressure(double value, int key) { // MIDI aftertouch: channel (key −1) or polyphonic
  value = std::clamp(value, 0.0, 1.0);
  if (key < 0) pressureAll = value;
  for (Voice &v : voices) if (v.alive && (key < 0 || v.key == key)) v.after = value;
}

void SawEngine::bend(double value) { bendTo = pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12); }

void SawEngine::process(float *L, float *R, int n) {
  for (int at = 0; at < n; at += 128) run(L + at, R + at, std::min(128, n - at));
}

void SawEngine::run(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasP) return;
  const double T = 1 / fs, lamOn = 1 - exp(-T / LAND), lamOff = 1 - exp(-T / LIFT), lamV = 1 - exp(-T / DRAW);
  const bool bow = (int)P[p::excite] == excite_::bow;
  const Friction fr;
  const double dmu = fr.mus - fr.mud, Vt = P[p::speed];
  const double tau = 0.001 * P[p::contact];
  for (int at = 0; at < n; at += CHUNK) {
    const int m = std::min(CHUNK, n - at);
    const double dt = m * T;
    bendNow = glideTo(bendNow, bendTo, dt, BEND_T);
    vibPhase = std::fmod(vibPhase + 2 * pi * P[p::vibRate] * dt, 2 * pi);
    const double sv = sin(vibPhase);
    for (int vi = 0; vi < kPool; vi++) {
      Voice &v = voices[vi];
      if (!v.alive) continue;
      // the note now: One saw's slide, the bends, and the knee's vibrato once the note has begun
      if (v.u != v.uTo) {
        const double s = v.uRate * dt;
        v.u = std::fabs(v.uTo - v.u) <= s ? v.uTo : v.u + (v.uTo > v.u ? s : -s);
      }
      v.bend = glideTo(v.bend, expr.bendOf(v.key), dt, BEND_T);
      v.vib = glideTo(v.vib, expr.slideOr(v.key, P[p::vibrato]), dt, BEND_T);
      v.age += dt;
      const double base = pow(2.0, v.u) * bendNow * v.bend;
      const double f = base * pow(2.0, (v.vib * std::min(1.0, v.age / VIB_IN) * sv) / 1200);
      if (built[vi] != version || std::fabs(log2(base / v.pl.f)) > REBEND) { built[vi] = version; bendFor(v, base, false); }
      retune(v, f);
      const int M = v.M;
      const double Nt = v.held && bow ? std::min(MAXFORCE * v.pl.lambda * v.pl.lambda, P[p::force] * v.Nth * (0.5 + v.vel) * (1 + v.after) * (1 + v.bite)) : 0;
      v.bite *= exp(-dt / BITE_T);
      double pk = 0, sticks = 0;
      for (int i = at; i < at + m; i++) {
        v.N += (Nt - v.N) * (Nt > v.N ? lamOn : lamOff);
        if (Nt == 0 && v.N < 1e-6) v.N = 0;
        v.V += ((v.held ? Vt : v.V) - v.V) * lamV;
        // the free step of every mode
        double vf = 0, wc = 0;
        for (int j = 0; j < M; j++) {
          const double zr = v.zr[j];
          v.zr[j] = v.pr[j] * zr - v.pim[j] * v.zi[j];
          v.zi[j] = v.pr[j] * v.zi[j] + v.pim[j] * zr;
          vf += v.b[j] * (v.w[j] * v.zr[j] - v.sg[j] * v.zi[j]);
          wc += v.b[j] * v.zi[j];
        }
        double F = 0;
        if (v.N > 0) {
          // the edge's velocity under the bow is vf + Y·F; the hair moves at V
          const double s0 = v.V - vf, cc = v.Y * v.N;
          rng = (int32_t)((uint32_t)rng * 1664525u + 1013904223u);
          const double nz = 1 + NOISE * (rng / 2147483648.0);
          const double ms = fr.mus * nz, md = fr.mud * nz, dm = dmu * nz;
          if (std::fabs(s0) <= cc * ms) { F = s0 / v.Y; v.stick = true; v.slip = 0; sticks++; }
          else {
            // slip in the direction of s0 at the speed u solving u − |s0| + Y N μ(u) = 0, by Newton
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
        } else { v.slip = 0; v.stick = false; }
        v.F = F;
        double Fm = 0;
        if (v.mallet) {
          const double mm = MALLET_M * v.pl.lambda * v.pl.lambda * v.pl.lambda, K = mm * (pi / tau) * (pi / tau);
          // the felt pushes only while it is pressed into the steel, by K times how far, solved with
          // this sample's moves of the mallet and of the blade under it (implicit, so a hard felt on
          // a small blade stays stable)
          const double d0 = v.xm + v.vm * T - wc;
          if (d0 > 0) Fm = (K * d0) / (1 + K * (T * T / mm + v.Yd));
          else if (v.vm < 0) v.mallet = false; // it has bounced off
          v.vm -= (Fm / mm) * T;
          v.xm += v.vm * T;
          F += Fm; // and pushes the blade on
        }
        if (F != 0) for (int j = 0; j < M; j++) { v.zr[j] += v.gr[j] * v.b[j] * F; v.zi[j] += v.gi[j] * v.b[j] * F; }
        // the microphone: the blade's velocity under it
        double o = 0;
        for (int j = 0; j < M; j++) o += v.r[j] * (v.w[j] * v.zr[j] - v.sg[j] * v.zi[j]);
        o *= OUT;
        L[i] = (float)(L[i] + o); // a Float32Array's +=
        R[i] = (float)(R[i] + o);
        pk = std::max(pk, std::fabs(o));
      }
      v.peak = std::max(v.peak * 0.9, pk);
      v.sticks = sticks / m;
      if (!v.held || !bow) {
        v.quiet = pk < QUIET[(int)quality] && v.N == 0 && !v.mallet ? v.quiet + 1 : 0;
        if (v.quiet > 300) v.alive = false;
      }
    }
  }
  if (messages && ++tick >= 6) { tick = 0; report(); }
}

// Throttled state for the page: the newest voice.
void SawEngine::report() {
  const Voice *v = newest && newest->alive ? newest : nullptr;
  Message m;
  m.type = msg::state;
  m.key = (int16_t)(v ? v->key : -1);
  if (!v) { m.count = 0; post(m); return; }
  int live = 0;
  for (const Voice &x : voices) live += x.alive;
  const double s[14] = {v->f, v->pl.s, v->pl.lambda, v->pl.W, v->pl.eps[0], v->pl.ell[0], v->N, v->Nth, v->sticks, v->mallet ? 1.0 : 0.0,
                        v->pl.leak[0], v->sg[0], (double)live, v->held ? 1.0 : 0.0};
  int c = 0;
  for (double x : s) m.values[c++] = (float)x;
  for (int j = 0; j < NMODE; j++) {
    m.values[c++] = j < v->M ? (float)std::hypot(v->zr[j], v->zi[j]) : 0.0f;
    m.values[c++] = (float)((v->pl.fm[j] * v->f) / v->pl.f);
  }
  m.count = (uint16_t)c;
  post(m);
}

} // namespace forte::saw
