// organ-engine.cpp — organ-engine.js in C++ (organ-engine.h).

#include "organ-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/fdlibm.h"

namespace forte::organ {

namespace fd = forte::fdlibm;

namespace {

constexpr double PI = 3.141592653589793;
constexpr double TAU = 2 * PI;
constexpr double C_SOUND = 343;
constexpr double HARM[9] = {0.5, 1.5, 1, 2, 3, 4, 5, 6, 8}; // drawbar footages as harmonics of 8'
constexpr double SMOOTH_T = 0.015; // s: live gains, drive and crossover glide (no zipper noise)
constexpr double VIB_DEPTH[7] = {0, 0.33, 0.62, 1, 0.33, 0.62, 1}; // off, V1–V3, C1–C3

// Tube drive: a triode biased off-centre, y = n·(tanh(k·x + B0) − tanh B0). The bias B0 sits
// outside the gain k = 15·drive², so the curve stays asymmetric (even harmonics) without turning
// into a rectifier. n is set so a full chord (DRIVE_REF) comes out at its own level.
constexpr double DRIVE_B0 = 0.25, DRIVE_REF = 0.25;
const double DRIVE_TB0 = fd::tanh(DRIVE_B0);
double driveNorm(double k) { return k > 1e-6 ? DRIVE_REF / (fd::tanh(k * DRIVE_REF + DRIVE_B0) - DRIVE_TB0) : 0; }
bool near(double a, double b) { return std::fabs(a - b) <= 1e-7 * (1 + std::fabs(b)); }

// Math.round: the nearest integer, halves up
double jsRound(double x) { const double r = std::floor(x); return x - r >= 0.5 ? r + 1 : r; }

// Ring buffer read with cubic Hermite interpolation at a fractional delay.
double readFrac(const double *buf, int mask, int w, double delay) {
  const double pos = w - delay;
  const double fi = std::floor(pos), f = pos - fi;
  const int i = (int)fi;
  const double x0 = buf[(i - 1) & mask], x1 = buf[i & mask], x2 = buf[(i + 1) & mask], x3 = buf[(i + 2) & mask];
  const double c1 = 0.5 * (x2 - x0), c2 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3, c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2);
  return ((c3 * f + c2) * f + c1) * f + x1;
}

} // namespace

void Biquad::set(bool lowpass, double f, double Q, double fs) {
  const double w = (TAU * f) / fs, c = fd::cos(w), al = fd::sin(w) / (2 * Q), a0 = 1 + al;
  if (lowpass) { b0 = (1 - c) / 2 / a0; b1 = (1 - c) / a0; b2 = b0; }
  else { b0 = (1 + c) / 2 / a0; b1 = -(1 + c) / a0; b2 = b0; }
  a1 = (-2 * c) / a0; a2 = (1 - al) / a0;
}

Params paramsOf(const double *P) {
  Params q;
  q.tuning = (int)P[p::tuning];
  q.mains = P[p::mains]; q.wheelHarm = P[p::wheelHarm]; q.crosstalk = P[p::crosstalk]; q.leakage = P[p::leakage];
  for (int d = 0; d < 9; d++) q.drawbars[d] = (int)P[p::drawbar1 + d];
  q.motor = P[p::motor] > 0;
  q.inertia = P[p::inertia]; q.spinUp = P[p::spinUp]; q.loading = P[p::loading];
  q.spread = P[p::spread]; q.bounce = P[p::bounce]; q.contactTime = P[p::contactTime];
  q.percOn = P[p::percOn] > 0; q.percSoft = P[p::percSoft] > 0; q.percFast = P[p::percFast] > 0; q.percThird = P[p::percThird] > 0;
  q.percFastTau = P[p::percFastTau]; q.percSlowTau = P[p::percSlowTau]; q.percLevel = P[p::percLevel];
  q.vib = (int)P[p::vib];
  q.sections = P[p::sections]; q.sectionDelay = P[p::sectionDelay]; q.scanRate = P[p::scanRate];
  q.expression = P[p::expression]; q.drive = P[p::drive];
  q.hornSlow = P[p::hornSlow]; q.hornFast = P[p::hornFast]; q.drumSlow = P[p::drumSlow]; q.drumFast = P[p::drumFast];
  q.hornAccel = P[p::hornAccel]; q.hornDecel = P[p::hornDecel]; q.drumAccel = P[p::drumAccel]; q.drumDecel = P[p::drumDecel];
  q.hornRadius = P[p::hornRadius]; q.micDist = P[p::micDist]; q.micSpread = P[p::micSpread];
  q.balance = P[p::balance]; q.crossover = P[p::crossover]; q.reflections = P[p::reflections];
  // the Leslie switch: bypassed, or on at a speed (bypassing it leaves the speed the rotors spin
  // to as it was: the setParams below keeps it)
  const int les = (int)P[p::leslie];
  q.leslieOn = les != leslie_::bypass;
  q.leslie = les == leslie_::fast ? Params::fast : les == leslie_::stop ? Params::stop : Params::slow;
  return q;
}

OrganEngine::OrganEngine(double fs) : Engine(fs), dt(1 / fs), aSm(1 - fd::exp(-dt / SMOOTH_T)) {
  hornHz = p.hornSlow; drumHz = p.drumSlow;
  for (int w = 1; w < NW; w++) { const double ph = TAU * rand(); cr[w] = fd::cos(ph); ci[w] = fd::sin(ph); }
  for (int k = 0; k < NUM_KEYS; k++) { keys[k].key = KEY_LO + k; keys[k].idx = k; }
  updateDerived();
  snapLive();
}

void OrganEngine::configure() {
  updateRotations();
  for (int i = 0; i < nArr; i++) initKeyOsc(*keyArr[i]);
}

void OrganEngine::setParams(const double *P) {
  Params next = paramsOf(P);
  if (!next.leslieOn) next.leslie = p.leslie;
  apply(next);
}

void OrganEngine::apply(const Params &next) {
  const double prevSections = p.sections;
  p = next;
  if (p.sections != prevSections) { std::fill(I, I + 64, 0.0); std::fill(V, V + 65, 0.0); }
  updateDerived();
  // the generator: built on the first call, rebuilt when a parameter it depends on changes
  const double of[5] = {(double)p.tuning, p.mains, p.wheelHarm, p.crosstalk, p.leakage};
  if (!haveGen || !std::equal(of, of + 5, genOf)) {
    std::copy(of, of + 5, genOf);
    buildGenerator(gen, p.tuning, p.mains, p.wheelHarm, p.crosstalk, p.leakage, fs);
    haveGen = true;
    configure();
  }
  // glide while anything is audible; jump when only the leakage hiss is left
  if (nArr || peak > 1e-3) gliding = true; else snapLive();
}

// Targets of the parameters that glide while the organ plays.
void OrganEngine::liveTargets() {
  tPre = 0.11 * expGain;
  tDrive = p.drive;
  tLam = p.loading;
  tMaster = p.master;
  tHornG = std::min(1.0, 1 + p.balance);
  tDrumG = std::min(1.0, 1 - p.balance);
  tRefl = p.reflections;
  tXo = p.crossover;
}

void OrganEngine::snapLive() {
  liveTargets();
  sPre = tPre; sDrive = tDrive; sLam = tLam; sMaster = tMaster;
  sHornG = tHornG; sDrumG = tDrumG; sRefl = tRefl; sXo = tXo;
  driveK = 15 * sDrive * sDrive; driveN = driveNorm(driveK);
  setCrossover(sXo);
  gliding = false;
}

void OrganEngine::setCrossover(double f) {
  const double q = 0.7071;
  lp1.set(true, f, q, fs); lp2.set(true, f, q, fs);
  hp1.set(false, f, q, fs); hp2.set(false, f, q, fs);
}

void OrganEngine::updateDerived() {
  alphaC = p.contactTime <= 0 ? 1 : 1 - fd::exp(-dt / (p.contactTime * 1e-6));
  const double tau = p.percFast ? p.percFastTau : p.percSlowTau;
  percDecay = fd::exp(-dt / tau);
  for (int d = 0; d < 9; d++) { const int n = p.drawbars[d]; dbg[d] = n <= 0 ? 0 : fd::pow(10, (-3.0 * (8 - n)) / 20); }
  if (p.percOn) {
    dbg[8] = 0; // the 1' contacts are borrowed to key the percussion
    if (!p.percSoft) for (int d = 0; d < 9; d++) dbg[d] *= 0.708;
  }
  percGain = p.percOn ? p.percLevel * (p.percSoft ? 0.5 : 1) : 0;
  expGain = fd::pow(10, ((p.expression - 1) * 40) / 20);
  const double os = 2, h = dt / os;
  lcTau = std::max(p.sectionDelay * 1e-6, 1.25 * h);
  lcN = (int)std::max(2.0, std::min(60.0, jsRound(p.sections)));
  lcK = h / lcTau;
  liveTargets();
}

void OrganEngine::updateRotations() {
  if (!haveGen) return;
  for (int w = 1; w < NW; w++) {
    const double d = TAU * gen.wheelHz[w] * speed * dt;
    rc[w] = fd::cos(d); rs[w] = fd::sin(d);
    // renormalise the phasor to stop amplitude drift
    const double m = cr[w] * cr[w] + ci[w] * ci[w];
    const double s = 1.5 - 0.5 * m;
    cr[w] *= s; ci[w] *= s;
  }
  for (int i = 0; i < nArr; i++) updateKeyRot(*keyArr[i]);
}

// "harmonic" (ideal additive) mode: each key owns nine exact harmonics
void OrganEngine::initKeyOsc(Key &k) {
  if (!k.osc) {
    k.osc = true;
    for (int d = 0; d < 9; d++) { const double ph = TAU * rand(); k.hc[d] = fd::cos(ph); k.hs[d] = fd::sin(ph); k.hv[d] = 0; k.hmute[d] = 0; }
  }
  updateKeyRot(k);
}

void OrganEngine::updateKeyRot(Key &k) {
  if (!k.osc || !haveGen) return;
  const double f0 = gen.keyHz[k.idx];
  for (int d = 0; d < 9; d++) {
    const double f = f0 * HARM[d];
    const double dd = f < 0.45 * fs ? TAU * f * speed * dt : 0;
    k.hrc[d] = fd::cos(dd); k.hrs[d] = fd::sin(dd);
    k.hmute[d] = f < 0.45 * fs ? 0 : 1;
    const double m = k.hc[d] * k.hc[d] + k.hs[d] * k.hs[d], s = 1.5 - 0.5 * m;
    k.hc[d] *= s; k.hs[d] *= s;
  }
}

// Nine contact springs touch their busbars at slightly different points in the key travel, and
// each may bounce. A faster key press closes them closer together.
void OrganEngine::schedule(Key &k, bool closing, double keySpeed) {
  const double spread = (p.spread * 1e-3 * fs) / keySpeed;
  int n = 0;
  for (int d = 0; d < 9; d++) {
    int64_t t = now + 1 + (int64_t)jsRound(k.order[d] * spread * (0.8 + 0.4 * rand()));
    k.ev[n++] = {t, (uint8_t)d, (uint8_t)(closing ? 1 : 0)};
    const int nb = (int)std::floor(p.bounce * (1 + 3 * rand()));
    for (int b = 0; b < nb && n + 2 <= MAX_EVENTS; b++) {
      t += (int64_t)std::max(1.0, jsRound((0.04 + 0.2 * rand()) * 1e-3 * fs * (1 + b)));
      k.ev[n++] = {t, (uint8_t)d, (uint8_t)(closing ? 0 : 1)};
      t += (int64_t)std::max(1.0, jsRound((0.03 + 0.15 * rand()) * 1e-3 * fs));
      k.ev[n++] = {t, (uint8_t)d, (uint8_t)(closing ? 1 : 0)};
    }
  }
  // by time, keeping the order of equal times (the JavaScript's sort is stable)
  for (int i = 1; i < n; i++) {
    const ContactEvent e = k.ev[i];
    int j = i;
    while (j > 0 && k.ev[j - 1].t > e.t) { k.ev[j] = k.ev[j - 1]; j--; }
    k.ev[j] = e;
  }
  k.nev = n;
  k.evi = 0;
}

// velocity 0..1 (MIDI velocity / 127; the computer keys play 100): it sets the key speed
void OrganEngine::noteOn(int key, double velocity) {
  const int idx = key - KEY_LO;
  if (idx < 0 || idx > NUM_KEYS - 1) return;
  Key &k = keys[idx];
  if (!k.live) {
    // each key's contacts have their own fixed geometry
    Rng kr(1000 + key);
    for (int d = 0; d < 9; d++) { k.order[d] = kr(); k.g[d] = 0; k.tgt[d] = 0; }
    k.down = false; k.nev = 0; k.evi = 0; k.osc = false;
    if (haveGen && gen.harmonic) initKeyOsc(k);
    k.live = true; nLive++;
    keyArr[nArr++] = &k;
  }
  if (k.down) return;
  if (held == 0) percEnv = 1; // single trigger: re-arms only when all keys are up
  held++;
  k.down = true;
  schedule(k, true, 0.5 + velocity);
}

void OrganEngine::noteOff(int key, double) {
  const int idx = key - KEY_LO;
  if (idx < 0 || idx > NUM_KEYS - 1) return;
  Key &k = keys[idx];
  if (!k.live || !k.down) return;
  k.down = false;
  held = std::max(0, held - 1);
  schedule(k, false, 1.2);
}

void OrganEngine::allNotesOff() {
  for (int i = 0; i < nArr; i++) if (keyArr[i]->down) noteOff(keyArr[i]->key, -1);
}

// every 768 samples (6 blocks of 128, as the page's views expect): the state for the views
void OrganEngine::tick(int n) {
  stateClock += n;
  if (stateClock >= 768) { stateClock -= 768; postState(); }
}
void OrganEngine::postState() {
  Message m;
  m.type = msg::state;
  const double s[8] = {speed, hornAng, hornHz, drumAng, drumHz, scanPos, (double)lcN, percEnv};
  m.count = 8;
  for (int i = 0; i < 8; i++) m.values[i] = (float)s[i];
  post(m);
}

void OrganEngine::process(float *L, float *R, int n) { render(L, R, n); }
void OrganEngine::processDouble(double *L, double *R, int n) { render(L, R, n); }

template <class T> void OrganEngine::render(T *L, T *R, int n) {
  std::fill(L, L + n, T(0)); std::fill(R, R + n, T(0));
  if (!haveGen) { tick(n); return; }
  const Generator &g = gen;
  const double dtb = n * dt;

  // motor: synchronous lock when powered, viscous + Coulomb coast-down when not
  if (p.motor) speed += (1 - speed) * (1 - fd::exp(-dtb / p.spinUp));
  else speed = std::max(0.0, speed - (speed / p.inertia + 0.012) * dtb);
  updateRotations();

  // Leslie rotor speeds: first-order approach with separate up/down times
  const double tgtH = p.leslie == Params::fast ? p.hornFast : p.leslie == Params::slow ? p.hornSlow : 0;
  const double tgtD = p.leslie == Params::fast ? p.drumFast : p.leslie == Params::slow ? p.drumSlow : 0;
  hornHz += (tgtH - hornHz) * (1 - fd::exp(-dtb / (tgtH > hornHz ? p.hornAccel : p.hornDecel)));
  drumHz += (tgtD - drumHz) * (1 - fd::exp(-dtb / (tgtD > drumHz ? p.drumAccel : p.drumDecel)));

  const double *lvl = g.level, *A2 = g.a2, *A3 = g.a3, *LK = g.leak, *XT = g.xtalk;
  const int16_t *PT = g.partner, *KM = g.keyMap;
  const int16_t *percMap = p.percThird ? g.perc3 : g.perc2;
  const int percD = p.percThird ? 4 : 3;
  const bool harmonic = g.harmonic;
  const bool vibOn = p.vib > 0, chorus = p.vib >= 4;
  const double scanInc = p.scanRate * speed * dt;
  const double depth = vibOn ? VIB_DEPTH[p.vib] * lcN : 0;
  // as leslieGeometry(p), without allocating
  const double wall = std::max(CABINET, p.hornRadius + 0.04), D = std::max(p.micDist, wall + MIC_CLEAR);
  const double sp = (p.micSpread * PI) / 360;
  mics[0] = -fd::sin(sp) * D; mics[1] = fd::cos(sp) * D; mics[2] = fd::sin(sp) * D; mics[3] = mics[1];
  const double rH = p.hornRadius, rD = 0.15;
  const double hornInc = TAU * hornHz * dt, drumInc = TAU * drumHz * dt;
  // live parameters: glide sample by sample towards their targets while gliding
  const bool glide = gliding;
  const double aS = aSm;
  double pre = sPre, lam = sLam, master = sMaster, hornG = sHornG, drumG = sDrumG, refl = sRefl;
  double dK = driveK, dN = driveN;
  double pk = 0;

  for (int s = 0; s < n; s++) {
    if (glide) {
      pre += (tPre - pre) * aS; lam += (tLam - lam) * aS; master += (tMaster - master) * aS;
      hornG += (tHornG - hornG) * aS; drumG += (tDrumG - drumG) * aS; refl += (tRefl - refl) * aS;
      if (sDrive != tDrive) {
        sDrive += (tDrive - sDrive) * aS;
        if (std::fabs(tDrive - sDrive) < 1e-6) sDrive = tDrive;
        dK = 15 * sDrive * sDrive; dN = driveNorm(dK);
      }
      if (sXo != tXo) {
        sXo += (tXo - sXo) * aS;
        if (std::fabs(tXo - sXo) < 0.01) sXo = tXo;
        setCrossover(sXo);
      }
    }
    // --- tonewheels (EMF ∝ shaft speed)
    double leakSum = 0;
    for (int w = 1; w < NW; w++) {
      const double c = cr[w], si = ci[w];
      const double nc = c * rc[w] - si * rs[w], ns = c * rs[w] + si * rc[w];
      cr[w] = nc; ci[w] = ns;
      const double val = speed * lvl[w] * (ns + A2[w] * 2 * ns * nc + A3[w] * (3 * ns - 4 * ns * ns * ns));
      v[w] = val;
      leakSum += LK[w] * val;
    }

    // --- contacts → busbars
    for (int d = 0; d < 10; d++) { num[d] = 0; den[d] = 0; }
    for (int j = 0; j < nArr; j++) {
      Key &k = *keyArr[j];
      while (k.evi < k.nev && k.ev[k.evi].t <= now) { const ContactEvent &e = k.ev[k.evi++]; k.tgt[e.d] = e.s; }
      if (harmonic && k.osc) {
        for (int d = 0; d < 9; d++) {
          const double c = k.hc[d], si = k.hs[d];
          const double nc = c * k.hrc[d] - si * k.hrs[d], ns = c * k.hrs[d] + si * k.hrc[d];
          k.hc[d] = nc; k.hs[d] = ns;
          k.hv[d] = k.hmute[d] ? 0 : speed * ns;
        }
      }
      for (int d = 0; d < 9; d++) {
        double gg = k.g[d];
        const double t = k.tgt[d];
        if (gg != t) {
          gg += (t - gg) * alphaC;
          if (std::fabs(gg - t) < 1e-5) gg = t;
          k.g[d] = gg;
        }
        if (gg > 0) {
          double x;
          if (harmonic && k.osc) x = k.hv[d];
          else { const int w = KM[k.idx * 9 + d]; x = v[w] + XT[w] * v[PT[w]]; }
          num[d] += gg * x;
          den[d] += gg;
        }
      }
      if (k.g[8] > 0 && percGain > 0) {
        double x;
        if (harmonic && k.osc) x = k.hv[percD];
        else { const int w = percMap[k.idx]; x = v[w] + XT[w] * v[PT[w]]; }
        num[9] += k.g[8] * x;
        den[9] += k.g[8];
      }
    }
    // busbar loading, Millman's theorem: n wheels of source resistance R_s on a busbar loaded by
    // R_L give Σv·(1+λ)/(1+λn), λ = R_L/R_s
    double x = 0;
    for (int d = 0; d < 9; d++) if (den[d] > 0) x += dbg[d] * num[d] * (1 + lam) / (1 + lam * den[d]);
    if (den[9] > 0) x += percGain * percEnv * num[9] * (1 + lam) / (1 + lam * den[9]);
    percEnv *= percDecay;
    x = pre * (x + leakSum);

    // --- scanner vibrato: LC ladder (2× oversampled, symplectic Euler)
    if (vibOn) {
      for (int o = 0; o < 2; o++) {
        I[1] = (I[1] + lcK * (x - V[1])) / (1 + lcK);
        for (int k = 2; k <= lcN; k++) I[k] += lcK * (V[k - 1] - V[k]);
        for (int k = 1; k < lcN; k++) V[k] += lcK * (I[k] - I[k + 1]);
        V[lcN] = (V[lcN] + lcK * I[lcN]) / (1 + lcK);
      }
      V[0] = x - I[1];
      scanPhase += scanInc;
      if (scanPhase >= 1) scanPhase -= 1;
      const double tri = 1 - std::fabs(2 * scanPhase - 1);
      const double pos = depth * tri;
      const int i0 = (int)std::min((double)(lcN - 1), std::floor(pos));
      const double f = pos - i0;
      scanPos = pos;
      const double pick = 2 * ((1 - f) * V[i0] + f * V[i0 + 1]);
      x = chorus ? 0.5 * (x + pick) : pick;
    }

    // --- tube drive (biased soft clip, see DRIVE_B0) and the coupling capacitor
    if (dK > 1e-6) x = dN * (fd::tanh(dK * x + DRIVE_B0) - DRIVE_TB0);
    const double yDC = x - dcIn + 0.9995 * dcOut;
    dcIn = x; dcOut = yDC; x = yDC;

    double yl, yr;
    if (!p.leslieOn) {
      yl = yr = x;
    } else {
      // --- Leslie: crossover, then moving sources heard by two mics
      const double lo = lp2.run(lp1.run(x)), hi = hp2.run(hp1.run(x));
      wi = (wi + 1) & MASK;
      hornBuf[wi] = hi; drumBuf[wi] = lo;
      hornAng += hornInc; if (hornAng > TAU) hornAng -= TAU;
      drumAng += drumInc; if (drumAng > TAU) drumAng -= TAU;
      const double sh = fd::sin(hornAng), chh = fd::cos(hornAng);
      const double sd = fd::sin(drumAng), cd = fd::cos(drumAng);
      yl = 0; yr = 0;
      for (int m = 0; m < 2; m++) {
        const double mx = mics[2 * m], my = mics[2 * m + 1];
        // horn: highly directional bell at radius rH; plus its image in the rear wall. The mics
        // are outside the cabinet; dd ≥ 5 cm guards the 1/r law.
        double dx = mx - rH * sh, dy = my - rH * chh, dd = std::max(0.05, fd::hypot(dx, dy));
        double ca = (dx * sh + dy * chh) / dd, dir = (1 + ca) / 2;
        double y = hornG * (0.08 + 0.92 * dir * dir) * (D / dd) * readFrac(hornBuf, MASK, wi, (dd / C_SOUND) * fs);
        dy = my + 2 * wall + rH * chh; dd = fd::hypot(dx, dy);
        ca = (dx * sh - dy * chh) / dd; dir = (1 + ca) / 2;
        y += refl * hornG * (0.08 + 0.92 * dir * dir) * (D / dd) * readFrac(hornBuf, MASK, wi, (dd / C_SOUND) * fs);
        // drum: rotating baffle, broader pattern
        dx = mx - rD * sd; dy = my - rD * cd; dd = std::max(0.05, fd::hypot(dx, dy));
        ca = (dx * sd + dy * cd) / dd;
        y += drumG * (0.45 + 0.55 * (1 + ca) / 2) * (D / dd) * readFrac(drumBuf, MASK, wi, (dd / C_SOUND) * fs);
        dy = my + 2 * wall + rD * cd; dd = fd::hypot(dx, dy);
        ca = (dx * sd - dy * cd) / dd;
        y += 0.5 * refl * drumG * (0.45 + 0.55 * (1 + ca) / 2) * (D / dd) * readFrac(drumBuf, MASK, wi, (dd / C_SOUND) * fs);
        if (m == 0) yl = y; else yr = y;
      }
    }
    yl *= master; yr *= master;
    L[s] = (T)yl; R[s] = (T)yr;
    const double a = std::max(std::fabs(yl), std::fabs(yr));
    if (a > pk) pk = a;
    now++;
  }

  // the glide: write back, and stop once everything has arrived
  if (glide) {
    if (near(pre, tPre) && near(lam, tLam) && near(master, tMaster) && near(hornG, tHornG) && near(drumG, tDrumG)
        && near(refl, tRefl) && sDrive == tDrive && sXo == tXo) {
      pre = tPre; lam = tLam; master = tMaster; hornG = tHornG; drumG = tDrumG; refl = tRefl;
      gliding = false;
    }
    sPre = pre; sLam = lam; sMaster = master; sHornG = hornG; sDrumG = drumG; sRefl = refl;
    driveK = dK; driveN = dN;
  }

  // retire keys whose contacts are all open
  int j = 0;
  for (int i = 0; i < nArr; i++) {
    Key *k = keyArr[i];
    bool any = k->down || k->evi < k->nev;
    for (int d = 0; d < 9 && !any; d++) if (k->g[d] > 0) any = true;
    if (any) keyArr[j++] = k;
    else { k->live = false; nLive--; }
  }
  nArr = j;
  if (!(pk < 1e3)) { // NaN or blow-up: reset the delay line and rotors
    std::fill(I, I + 64, 0.0); std::fill(V, V + 65, 0.0);
    std::fill(hornBuf, hornBuf + BUF_LEN, 0.0); std::fill(drumBuf, drumBuf + BUF_LEN, 0.0);
    Message m;
    m.type = msg::error;
    post(m);
  }
  peak = pk;
  tick(n);
}

template void OrganEngine::render<float>(float *, float *, int);
template void OrganEngine::render<double>(double *, double *, int);

} // namespace forte::organ
