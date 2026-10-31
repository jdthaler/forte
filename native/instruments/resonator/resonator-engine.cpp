// resonator-engine.cpp — the Magnetic Resonator Piano's engine (resonator-engine.h).

#include "resonator-engine.h"

#include <algorithm>
#include <cmath>

namespace forte::resonator {

constexpr double OUT = 80.0;        // the bridge's velocity, as heard
constexpr double LATENCY = 0.0027;  // s: the pickup's signal reaches the loop a block late
constexpr double CORNER = 3000;     // Hz: the amplifier and coil's corner (McPherson 2012: "closer to 3000 Hz")
constexpr double I_MAX = 2.5;       // A: the amplifier's rails clip the current
constexpr double RELEASE = 0.04;    // s: the drive's fall when the key lets go
constexpr double DAMPER = 25;       // 1/s: a damper on the strings (T60 0.28 s)
constexpr double Q_BP = 50;         // the loop's band-pass (McPherson 2010)
constexpr double GUARD = 0.7;       // a neighbour this loud (in power, against the note's own) holds the loop
constexpr double A_MIN = 1e-7;      // the band-pass's amplitude under which the loop has nothing to follow
constexpr double CONTACT_K = 2e4;   // N/m: the string against the coil's face
constexpr int REPORT_BLOCKS = 6;
// The Quality: partials a string plays (and under what frequency), unisons, strings ringing at once
// (beyond them the quietest that no key or coil holds is let go), and the peak under which an
// undriven, unheld string stops (−110, −100, −90 dB)
constexpr int PARTIALS_Q[3] = {MAX_PARTIALS, 16, 8};
constexpr double FMAX_Q[3] = {8000, 5000, 3000};
constexpr int UNI_Q[3] = {3, 3, 2};
constexpr int VOICES_Q[3] = {NK, 40, 20};
constexpr double QUIET_Q[3] = {3e-6, 1e-5, 3e-5};

static double clamp(double x, double a, double b) { return x < a ? a : x > b ? b : x; }

ResonatorEngine::ResonatorEngine(double fs) : Engine(fs), k(1 / fs) {
  D = std::max(128, (int)std::lround(LATENCY * fs));
  gc = 1 - std::exp((-TAU * CORNER) / fs);
}

void ResonatorEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
  for (int i = 0; i < count; i++) {
    Voice &v = *voices[i];
    v.bright = expr.slideOr(v.key, P[p::bright]);
    driveHarmonics((int)P[p::wave], v.bright, v.g);
    v.contactK = CONTACT_K;
  }
}

void ResonatorEngine::slide(double value, int key) {
  expr.setSlide(value, key);
  for (int i = 0; i < count; i++) {
    Voice &v = *voices[i];
    if (v.key != key) continue;
    v.bright = expr.slideOr(key, P[p::bright]);
    driveHarmonics((int)P[p::wave], v.bright, v.g);
  }
}

void ResonatorEngine::pressure(double value, int key) { // MIDI aftertouch: channel (key −1) or polyphonic
  if (key < 0) { pressureAll = value; for (int i = 0; i < count; i++) voices[i]->press = value; }
  else for (int i = 0; i < count; i++) if (voices[i]->key == key) voices[i]->press = value;
}

int ResonatorEngine::driven() const {
  int n = 0;
  for (int i = 0; i < count; i++) n += voices[i]->driven;
  return n;
}

double ResonatorEngine::offsetCents(const Voice &v) const {
  const Loop &l = v.loops[0];
  return l.w0 > 0 ? 1200 * std::log2((l.w0 + l.dw) / (TAU * l.fc * k)) : 0;
}

// A key's strings, its modes' coefficients, free and damped, and the hammer's compliance.
void ResonatorEngine::build(Voice &v, int key) {
  const int qi = (int)quality;
  v = Voice{};
  v.key = key;
  v.s = strings(key, P.data(), fs, PARTIALS_Q[qi], FMAX_Q[qi], UNI_Q[qi]);
  v.np = v.s.n; v.nu = v.s.nu; v.N = v.np * v.nu;
  v.s.reg = voicing(key);
  double cH = 0;
  for (int u = 0; u < v.nu; u++) {
    for (int j = 0; j < v.np; j++) {
      const int i = u * v.np + j;
      const Partial &pt = v.s.p[j];
      const ModeCoeffs c = modeCoeffs(pt.f[u], pt.sigma, fs), d = modeCoeffs(pt.f[u], pt.sigma + DAMPER, fs);
      v.a1f[i] = c.a1; v.a2f[i] = c.a2; v.a1d[i] = d.a1; v.a2d[i] = d.a2;
      v.psiA[i] = pt.psiA; v.psiH[i] = pt.psiH; v.beta[i] = pt.beta;
      v.bA[i] = c.b * pt.psiA; v.bH[i] = c.b * pt.psiH; v.bB[i] = c.b * pt.beta;
      cH += c.b * pt.psiH * pt.psiH;
    }
  }
  v.cH = cH / (v.nu * v.nu); // the strings' mean height under the hammer, per newton of its whole force
  v.press = pressureAll;
  v.bright = expr.slideOr(key, P[p::bright]);
  driveHarmonics((int)P[p::wave], v.bright, v.g);
  v.contactK = CONTACT_K;
  const auto [pl, pr] = keyPan(key, 0.5, 21, 108);
  v.pl = pl; v.pr = pr;
  v.damped = true;
  setDamper(v);
}

void ResonatorEngine::setDamper(Voice &v) {
  const bool d = v.s.damper && !v.keyDown && !sustain;
  if (d == v.damped) return;
  v.damped = d;
  for (int i = 0; i < v.N; i++) { v.a1[i] = d ? v.a1d[i] : v.a1f[i]; v.a2[i] = d ? v.a2d[i] : v.a2f[i]; }
}

// The loops for the Harmonic choice, each on its partial: its band-pass and guards, its PLL's
// gains, and the phase that puts the push in step with the string's velocity.
void ResonatorEngine::loopsFor(Voice &v) {
  const Loops ls = loopsOf((int)P[p::harmonic]);
  v.nLoops = ls.n;
  for (int j = 0; j < ls.n; j++) {
    Loop &l = v.loops[j];
    l = Loop{};
    l.h = ls.h[j];
    l.fc = std::min(v.s.partial(l.h), 0.45 * fs);
    l.w0 = (TAU * l.fc) / fs;
    l.bp.set(Biquad::bp, l.fc, Q_BP, fs);
    l.lo.set(Biquad::bp, l.fc * std::pow(2.0, -1.0 / 12), Q_BP, fs);
    l.hi.set(Biquad::bp, l.fc * std::pow(2.0, 1.0 / 12), Q_BP, fs);
    l.ka = 1 - std::exp(-1 / (std::max(0.02, 2 / l.fc) * fs));
    l.ke = 1 - std::exp((-TAU * l.fc) / (4 * fs)); // the phase detector's ripple (at twice the partial), filtered
    // a second-order loop: natural frequency fc/40 (0.5 to 6 Hz), damping 0.8
    const double wn = (TAU * clamp(l.fc / 40, 0.5, 6)) / fs;
    l.kp = 2 * 0.8 * wn; l.ki = wn * wn;
    l.maxDw = l.w0 * 0.03; // the lock range: ±50 ¢
    l.share = 1.0 / ls.n;
    // The calibration: the pickup hears the bridge's push, in phase with the partial's velocity
    // (times the sign of its shape under the coil and at the bridge), D samples late, and the
    // velocity half a sample late again; the force reaches the string a sample after it is
    // computed, and through the coil's corner. Made up, the push is in step with the velocity.
    const Partial &pt = v.s.p[std::min(l.h, v.np) - 1];
    const bool flip = pt.psiA * pt.beta < 0;
    l.cal = l.w0 * (D + 1.5) + std::atan(l.fc / CORNER) + (flip ? PI : 0);
    l.theta = 0;
    l.gain = 1;
    l.nh = 0;
    for (int m = 1; m <= DRIVE_HARMONICS && m * l.h <= v.np && v.s.partial(m * l.h) < 0.45 * fs; m++, l.nh++) l.rs[m - 1] = v.s.partial(m * l.h) / (m * l.fc);
    l.nh = std::max(l.nh, 1);
  }
  // noise: white, then into the band of the note's first partials (a high-pass under the
  // fundamental, two low-passes at six times it)
  v.kz = 1 - std::exp((-TAU * 6 * v.s.f1) / fs);
  v.kzh = 1 - std::exp((-TAU * 0.7 * v.s.f1) / fs);
}

void ResonatorEngine::drive(Voice &v, double velocity) {
  // a channel: the oldest driven note gives up its own past the fifteenth
  if (!v.driven) {
    if (driven() >= CHANNELS) {
      Voice *old = nullptr;
      for (int i = 0; i < count; i++) { Voice *x = voices[i]; if (x->driven && x != &v && (!old || x->order < old->order)) old = x; }
      if (old) old->driven = false;
    }
    v.driven = true;
    v.env = std::min(v.env, 0.0);
  }
  v.order = ++clock;
  v.vel = velocity;
  loopsFor(v);
}

void ResonatorEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < KEY_LO || key > KEY_HI) return;
  Voice *v = nullptr;
  for (int i = 0; i < count && !v; i++) if (voices[i]->key == key) v = voices[i];
  if (!v) {
    v = &slots[key - KEY_LO];
    build(*v, key);
    voices[count++] = v;
    const int cap = VOICES_Q[(int)quality];
    if (count > cap) { // let go of the quietest string no key or coil holds
      int qi = -1;
      for (int i = 0; i < count; i++) { Voice *x = voices[i]; if (!x->keyDown && !x->driven && x != v && (qi < 0 || x->peak < voices[qi]->peak)) qi = i; }
      if (qi >= 0) { for (int i = qi; i < count - 1; i++) voices[i] = voices[i + 1]; count--; }
    }
  }
  v->keyDown = true;
  setDamper(*v);
  // the hammer, if it strikes: from the string's height at its place, at the key's speed
  const double speed = P[p::hammer] * 4 * velocity; // m/s: 4 m/s is a fortissimo
  if (speed > 0) {
    double u = 0;
    for (int i = 0; i < v->N; i++) u += v->psiH[i] * v->q[i];
    v->hy = u / v->nu; v->hv = speed; v->hm = v->s.hammer.mass;
    v->hK = v->s.hammer.K; v->hp = v->s.hammer.p;
    v->hammerOn = true; v->hammerAge = 0; v->contact = false;
  }
  if (P[p::drive] > 0) drive(*v, velocity);
  focus = key;
}

void ResonatorEngine::noteOff(int key, double) {
  for (int i = 0; i < count; i++) {
    Voice &v = *voices[i];
    if (v.key != key) continue;
    v.keyDown = false; v.driven = false;
    setDamper(v);
  }
}

void ResonatorEngine::setSustain(bool on) {
  sustain = on;
  for (int i = 0; i < count; i++) setDamper(*voices[i]);
}

void ResonatorEngine::allNotesOff() {
  count = 0;
  ring.fill(0);
}

void ResonatorEngine::process(float *L, float *R, int n) {
  for (int at = 0; at < n; at += 128) run(L + at, R + at, std::min(128, n - at));
}

void ResonatorEngine::run(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) { L[i] = R[i] = 0; heard[i] = 0; }
  if (!hasParams) { for (int i = 0; i < n; i++) ring[(pos + i) & (RING - 1)] = 0; pos = (pos + n) & (RING - 1); return; }
  const int wave = (int)P[p::wave];
  const bool open = (int)P[p::loop] == loop_::open, noise = wave == wave_::noise, guard = P[p::guard] != 0;
  const double phaseErr = (P[p::phase] * PI) / 180, bias = P[p::bias];
  const double gapT = P[p::gap] * 1e-3, kGap = GAP_REF * GAP_REF;
  const double rise = k / P[p::attack], fall = 1 - std::exp(-k / RELEASE);
  const double quiet = QUIET_Q[(int)quality];
  for (int vi = 0; vi < count; vi++) {
    Voice &v = *voices[vi];
    const int N = v.N, np = v.np, nu = v.nu;
    double *q = v.q.data(), *q1 = v.q1.data();
    const double *a1 = v.a1.data(), *a2 = v.a2.data(), *bA = v.bA.data(), *bH = v.bH.data(), *bB = v.bB.data();
    const double *psiA = v.psiA.data(), *psiH = v.psiH.data(), *beta = v.beta.data();
    const double Inote = P[p::drive] * v.s.reg * (0.25 + 0.75 * v.vel) * (1 + v.press); // A
    v.Inote = Inote;
    const double gap = gapT * v.s.gap, sG = std::sqrt(v.s.G);
    const double Fk = F_REF / v.s.nuFull; // each string's share of the pull (a string the Quality leaves out takes its share away)
    double pk = 0, uaPk = 0;
    const bool active = v.driven || v.env > 0 || v.current > 1e-6;
    for (int i = 0; i < n; i++) {
      double Fc[MAX_UNI] = {0, 0, 0};
      if (active) {
        // the drive: its envelope, then the loops on the pickup, a block late
        v.env = v.driven ? std::min(1.0, v.env + rise) : (v.env > 1e-5 ? v.env * (1 - fall) : 0);
        const double x = ring[(pos + i - D) & (RING - 1)];
        double s = 0;
        if (noise) {
          rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5;
          const double wn = rng * 2.3283064365386963e-10 * 2 - 1;
          v.nz += v.kz * (wn - v.nz); v.nz2 += v.kz * (v.nz - v.nz2); v.nzh += v.kzh * (v.nz2 - v.nzh);
          s = clamp((v.nz2 - v.nzh) * 3 * std::sqrt(0.5 * fs / (6 * v.s.f1)), -1, 1);
        }
        for (int j = 0; j < v.nLoops; j++) {
          Loop &l = v.loops[j];
          double dth;
          if (open) dth = TAU * l.h * v.s.f1 * k;
          else {
            const double y = l.bp.run(x);
            l.pw += l.ka * (y * y - l.pw);
            if (guard) {
              const double yl = l.lo.run(x), yh = l.hi.run(x);
              l.pwLo += l.ka * (yl * yl - l.pwLo); l.pwHi += l.ka * (yh * yh - l.pwHi);
              const double target = std::max(l.pwLo, l.pwHi) > GUARD * l.pw ? 0 : 1;
              l.gain += 0.002 * (target - l.gain);
            } else l.gain = 1;
            const double a = std::sqrt(2 * l.pw);
            const double e = a > A_MIN ? (2 * y * std::cos(l.theta)) / a : 0;
            l.ef += l.ke * (e - l.ef);
            const double ge = l.gain * l.ef;
            l.dw = clamp(l.dw + l.ki * ge, -l.maxDw, l.maxDw);
            dth = l.w0 + l.dw + l.kp * ge;
          }
          l.theta += dth;
          if (l.theta > TAU) l.theta -= TAU;
          if (noise) continue;
          const double ph = l.theta + l.cal + phaseErr;
          if (v.nLoops > 1 || wave == wave_::sine) s += l.share * std::sin(ph);
          else { // the waveform's harmonics, each at its partial of the string
            double acc = v.g[0] * std::sin(ph);
            for (int m = 1; m < l.nh; m++) {
              if (v.g[m] == 0) continue;
              double &pm = l.ph[m];
              pm += dth * (m + 1) * l.rs[m];
              if (pm > TAU) pm -= TAU;
              acc += v.g[m] * std::sin(pm + (m + 1) * (l.cal + phaseErr));
            }
            s += acc;
          }
        }
        // the amplifier: the signal on its bias, never below zero, clipped at the rails, through the coil
        const double Is = Inote * v.env;
        const double icmd = clamp(Is * (bias + s), 0, I_MAX);
        v.current += gc * (icmd - v.current);
      }
      // the coil's pull on each string, from its swing under the coil
      const double i2 = v.current * v.current;
      for (int u = 0; u < nu; u++) {
        double ua = 0;
        const double *pa = psiA + u * np, *qq = q + u * np;
        for (int j = 0; j < np; j++) ua += pa[j] * qq[j];
        const double g = std::max(gap - ua, 0.5 * gap);
        double F = (Fk * i2 * kGap) / (g * g);
        if (ua > gap) F -= v.contactK * (ua - gap); // the string slaps the coil's face
        Fc[u] = F;
        if (u == 0) { v.ua = ua; uaPk = std::max(uaPk, std::fabs(ua)); }
      }
      // every mode's step, with the coil and the bridge
      const double Sb = v.S;
      double Fh = 0;
      if (v.hammerOn) {
        // the hammer: its free step, then the felt's force solved with the strings' compliance under it
        double uf = 0;
        for (int u = 0; u < nu; u++) {
          const double Fu = Fc[u];
          for (int j = u * np; j < (u + 1) * np; j++) uf += psiH[j] * (a1[j] * q[j] - a2[j] * q1[j] + bA[j] * Fu - bB[j] * Sb);
        }
        uf /= nu;
        const double yf = v.hy + v.hv * k, df = yf - uf;
        if (df > 0) {
          const double c = (k * k) / v.hm + v.cH;
          double F = 0;
          for (int it = 0; it < 30; it++) { // F = K (df − cF)^p: Newton from below, monotone
            const double d = std::max(df - c * F, 0.0), dp = std::pow(d, v.hp - 1);
            const double g = F - v.hK * dp * d, dg = 1 + v.hK * v.hp * dp * c;
            const double Fn = std::max(0.0, F - g / dg);
            if (std::fabs(Fn - F) < 1e-9 * (1 + F)) { F = Fn; break; }
            F = Fn;
          }
          Fh = F;
          v.contact = true;
        }
        v.hv -= (Fh * k) / v.hm;
        v.hy += v.hv * k;
        if (++v.hammerAge > fs * 0.002 && Fh == 0 && v.hv < 0) v.hammerOn = false; // it has left the string
      }
      double S = 0, fh = Fh / nu;
      for (int u = 0; u < nu; u++) {
        const double Fu = Fc[u];
        for (int j = u * np; j < (u + 1) * np; j++) {
          const double y = a1[j] * q[j] - a2[j] * q1[j] + bA[j] * Fu + bH[j] * fh - bB[j] * Sb;
          S += beta[j] * (y - q[j]);
          q1[j] = q[j]; q[j] = y;
        }
      }
      S *= fs;
      v.S = S;
      const double o = sG * S;
      heard[i] += (float)o;
      const double out = OUT * o;
      L[i] = (float)(L[i] + v.pl * out);
      R[i] = (float)(R[i] + v.pr * out);
      pk = std::max(pk, std::fabs(out));
    }
    if (!(pk < 10)) { // numerical trouble: silence the string
      v.q.fill(0); v.q1.fill(0); v.S = 0; v.driven = false; v.env = 0; v.current = 0; pk = 0;
    }
    v.peak = pk; v.uaPeak = uaPk;
    const bool held = v.keyDown || v.driven || v.env > 0 || v.hammerOn;
    v.quiet = held || pk > quiet ? 0 : v.quiet + n;
  }
  for (int i = 0; i < n; i++) ring[(pos + i) & (RING - 1)] = heard[i];
  pos = (pos + n) & (RING - 1);
  // let go of the strings that have died away
  int w = 0;
  for (int i = 0; i < count; i++) if (voices[i]->quiet < fs * 0.2) voices[w++] = voices[i];
  count = w;
  if (++tick >= REPORT_BLOCKS) { tick = 0; report(); }
}

void ResonatorEngine::report() {
  if (!messages) return;
  const Voice *v = nullptr;
  for (int i = 0; i < count; i++) if (voices[i]->key == focus) v = voices[i];
  Message m;
  m.key = (int16_t)focus;
  if (v) {
    // the first string's partials: amplitude (mm, as their shapes' peak) and phase
    const int n = std::min(v->np, 15);
    m.type = msg::shape; m.count = (uint16_t)(2 * n);
    const double norm = std::sqrt(2 / (v->s.mu * v->s.L));
    for (int j = 0; j < n; j++) {
      const double om = TAU * v->s.p[j].f[0] * k, re = v->q[j], im = (v->q[j] * std::cos(om) - v->q1[j]) / std::sin(om);
      m.values[j] = (float)(1e3 * norm * std::hypot(re, im));
      m.values[n + j] = (float)std::atan2(im, re);
    }
    post(m);
  }
  Message s;
  s.type = msg::state; s.key = (int16_t)focus; s.count = 10;
  if (v) {
    const Loop &l = v->loops[0];
    s.values[0] = (float)v->env; s.values[1] = (float)(v->Inote * v->env * (P[p::bias] + 1)); s.values[2] = (float)offsetCents(*v);
    s.values[3] = (float)(std::sqrt(2 * l.pw) > A_MIN && l.gain > 0.5 && (int)P[p::loop] == loop_::pll && v->env > 0);
    s.values[4] = (float)std::sqrt(2 * l.pw); s.values[5] = (float)(1e3 * v->uaPeak);
    s.values[7] = v->keyDown; s.values[8] = (float)v->np; s.values[9] = (float)l.h;
  }
  s.values[6] = (float)driven();
  post(s);
}

} // namespace forte::resonator
