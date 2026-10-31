// telharmonium-engine.cpp — the Telharmonium's engine (telharmonium-engine.h).

#include "telharmonium-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"
#include "forte/expression.h"
#include "forte/fdlibm.h"

namespace forte::telharmonium {

using fdlibm::cos;
using fdlibm::exp;
using fdlibm::sin;

static constexpr double OUT = 0.08;        // the hall's level: a forte note peaks around 0.3
static constexpr double GAIN_T = 0.02;     // s: a key's pressure and the swell glide this fast
static constexpr double HP_HZ = 16;        // the transformers' magnetising inductance passes nothing slower
static constexpr double CHORD = 0.04;      // s: keys struck within this of one another make one chord (Pierce)
static constexpr double PAN_NEAR = 0.891, PAN_FAR = 0.454; // the two manuals' receivers, to either side

static double frac(double x) { return x - std::floor(x); }

// The place of an alternator on its shaft, fixed when the machine was built: a hash of its shaft and teeth.
static double builtPhase(int shaft, int teeth) {
  uint64_t z = (uint64_t)(shaft * 65536 + teeth) + 0x9e3779b97f4a7c15ull;
  z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ull;
  z = (z ^ (z >> 27)) * 0x94d049bb133111ebull;
  z ^= z >> 31;
  return (double)(z >> 11) / 9007199254740992.0;
}

TelharmoniumEngine::TelharmoniumEngine(double fs) : Engine(fs) {
  hpRho = exp(-TAU * HP_HZ / fs);
  for (int m = 0; m < MANUALS; m++) { fwd[m].assign(kHorn, 0); back[m].assign(kHorn, 0); }
  stateEvery = 128 * (int)std::ceil(fs / 128 / 30); // at most 30 times a second, in whole blocks
}

void TelharmoniumEngine::setQuality(Quality q) {
  if (q == quality) return;
  quality = q;
  if (hasP) { setParams(P.data()); }
}

void TelharmoniumEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  const forte::Tuning kb = tuningOf(P.data());
  if (!hasP || !(kb == keyboard)) {
    keyboard = kb;
    for (int k = 0; k < 128; k++) keyTarget[k] = keyFreq(k) * keyboard.ratio(k);
    for (int pc = 0; pc < 12; pc++) unit[pc] = shaftUnit(pc, keyTarget);
    for (Alternator &a : alts) if (a.refs > 0) place(a);
  }
  eight = (int)P[p::shafts] == shafts_::eight;
  pierce = (int)P[p::intonation] == intonation_::pierce;
  top = P[p::top];
  tooth = P[p::tooth];
  toothNow = quality == Quality::low ? 0 : tooth; // Low: the alternators are pure sines
  touch = P[p::touch];
  const double vo = P[p::voicing];
  const bool revoice = vo != voicingAmount;
  voicingAmount = vo;
  split = (int)std::lround(P[p::split]);
  droop = P[p::droop]; flywheel = std::max(0.05, P[p::flywheel]);
  // the circuit's time constant: the offsets in flight keep what they have, then decay at the new rate
  const double newTau = std::max(1e-5, P[p::tau] / 1000);
  if (newTau != tau || revoice) {
    for (Key &k : keys)
      for (int i = 0; i < k.count; i++) { Source &s = k.src[i]; if (!s.dir) { s.c0 *= exp(-(double)(t - s.t0) / (fs * tau)); s.t0 = t; } }
    tau = newTau;
  }
  decay = exp(-1 / (fs * tau));
  for (Key &k : keys)
    for (int i = 0; i < k.count; i++) {
      Source &s = k.src[i];
      const double f = alts[s.alt].teeth * unit[alts[s.alt].shaft];
      const double v = voiced(f);
      const bool third = 3 * f < 0.45 * fs;
      const cplx h0 = v * circuit(f, tau), h3 = third ? v * circuit(3 * f, tau) : cplx(0);
      s.h0r = h0.real(); s.h0i = h0.imag(); s.h3r = h3.real(); s.h3i = h3.imag();
      s.u1 = v * TAU * f * tau; s.u3 = third ? 3 * s.u1 : 0;
    }
  contact = (int)std::lround(P[p::contact] / 1000 * fs);
  rho = std::max(0.0, P[p::robbing]);
  for (int m = 0; m < MANUALS; m++)
    for (int h = 0; h < HARMONICS; h++) {
      const int b = m * HARMONICS + h;
      level[b] = stopLevel(P[(m ? p::m1 : p::a1) + h]);
      rhoBus[b] = level[b] > 0 ? busRho(level[b], rho) : 0;
    }
  swell = P[p::swell];
  if (!hasP) swellNow = swell;
  // the lines
  const int kind = (int)P[p::cable];
  const double km = std::max(0.0, P[p::distance]);
  if (kind != lineKind || km != lineKm) { lineKind = kind; lineKm = km; buildLine(); }
  magnet = std::max(0.1, P[p::magnet]);
  if ((int)P[p::receiver] != receiver) { receiver = (int)P[p::receiver]; buildReceiver(); }
  const double L = std::max(0.0, P[p::horn]);
  if (L != hornLen) {
    hornLen = L;
    if (L > 0) {
      hornD = std::clamp(L / C_AIR * fs, 1.0, kHorn - 4.0);
      hornA = exp(-C_AIR / (MOUTH * L) / fs); // the mouth's reflection: a one-pole at ω_m = c/a
    }
    bareGain = fs / (TAU * 1000);
  }
  hasP = true;
}

// The lines: the telegrapher's line's response, sampled into an impulse response (both manuals'
// lines are alike), normalised by the output transformer's tap at TAP_HZ.
void TelharmoniumEngine::buildLine() {
  lineOn = lineKm > 0;
  if (!lineOn) return;
  std::vector<float> ir(LINE_N);
  lineTaps = lineImpulse(lineKind == cable_::open ? OPEN : CABLE, lineKm, fs, ir.data(), LINE_N);
  for (Convolver &c : lines) c.setIR(ir.data(), lineTaps, 1, 32);
}

double TelharmoniumEngine::voiced(double f) const { return voicing(f, voicingAmount); }

// The diaphragm's first mode, x' = ω₀ y, y' = ω₀ (F − x) − (ω₀/Q) y, held over each sample.
void TelharmoniumEngine::buildReceiver() {
  const double w0 = TAU * receiverF0(receiver) / fs;
  double a[9] = {0, w0, 0, -w0, -w0 / DIAPHRAGM_Q, w0, 0, 0, 0}, e[9];
  expm(a, 3, e, work); // x' = A x + B F, held over the sample: the exponential of [[A, B], [0, 0]]
  rA[0] = e[0]; rA[1] = e[1]; rA[2] = e[3]; rA[3] = e[4];
  rB[0] = e[2]; rB[1] = e[5];
}

void TelharmoniumEngine::place(Alternator &a) const {
  const double ph = TAU * frac(a.teeth * theta[a.shaft] + a.phase);
  a.zr = cos(ph); a.zi = sin(ph);
  const double w = TAU * a.teeth * unit[a.shaft] * speed / fs;
  a.wr = cos(w); a.wi = sin(w);
}

int TelharmoniumEngine::acquire(int shaft, int teeth) {
  int free = -1;
  for (int i = 0; i < kAlts; i++) {
    Alternator &a = alts[i];
    if (a.refs > 0 && a.shaft == shaft && a.teeth == teeth) { a.refs++; return i; }
    if (a.refs == 0 && free < 0) free = i;
  }
  if (free < 0) return -1;
  Alternator &a = alts[free];
  a.shaft = shaft; a.teeth = teeth; a.refs = 1; a.phase = builtPhase(shaft, teeth);
  place(a);
  return free;
}

// A settled winding's steady current now, the exact response of its circuit to its sine (and the
// tooth error's twelfth): Im(G z) for each.
double TelharmoniumEngine::steady(const Source &s, const Key &k) const {
  const Alternator &a = alts[s.alt];
  double v = s.h0r * a.zi + s.h0i * a.zr;
  if (toothNow > 0 && s.h3r != 0) {
    const double z2r = a.zr * a.zr - a.zi * a.zi, z2i = 2 * a.zr * a.zi;
    v += toothNow * (s.h3r * (z2r * a.zi + z2i * a.zr) + s.h3i * (z2r * a.zr - z2i * a.zi));
  }
  return k.gainNow * v;
}

// Its EMF over R now (the flux's derivative): v ωτ cos φ (+ the twelfth's 3 v ωτ a cos 3φ).
double TelharmoniumEngine::emf(const Source &s, const Key &k) const {
  const Alternator &a = alts[s.alt];
  double u = s.u1 * a.zr;
  if (toothNow > 0 && s.u3 != 0) {
    const double z2r = a.zr * a.zr - a.zi * a.zi, z2i = 2 * a.zr * a.zi;
    u += toothNow * s.u3 * (z2r * a.zr - z2i * a.zi);
  }
  return k.gainNow * u;
}

// The current a bus's windings carry now: its offsets, each settled winding's steady part, and the
// current of each whose contacts are moving.
double TelharmoniumEngine::busSum(int b) const {
  double y = C[b];
  for (const Key &k : keys)
    for (int i = 0; i < k.count; i++) {
      const Source &s = k.src[i];
      if (s.bus == b) y += s.dir ? s.y : steady(s, k);
    }
  return y;
}

double TelharmoniumEngine::keyGain(const Key &k) const {
  const double g = 1 - touch + touch * k.vel;
  return g + (1 - g) * k.after;
}

// A winding whose contacts have closed: from here its current is the steady part plus an offset
// decaying as e^{−t/τ}, carried by its bus.
void TelharmoniumEngine::settle(Source &s, const Key &k, int64_t now) {
  s.c0 = s.y - steady(s, k); s.t0 = now;
  C[s.bus] += s.c0;
  s.dir = 0;
}

// The relay closes: each harmonic's winding joins its bus, starting where its share of the bus's
// flux puts it (y = ρI, so the bus current stays continuous), and its contacts engage over the
// contact time; at once (no contact time), the rest of its current is an offset, decaying.
void TelharmoniumEngine::connect(Key &k) {
  k.count = 0;
  k.gainNow = k.gain = keyGain(k);
  for (int h = 1; h <= HARMONICS; h++) {
    const int teeth = k.teeth * h;
    const double f = teeth * unit[k.shaft];
    if ((h > 1 && f > top) || f * speed > 0.45 * fs) continue; // each key keeps its own alternator
    const int b = k.manual * HARMONICS + h - 1;
    const int ai = acquire(k.shaft, teeth);
    if (ai < 0) continue;
    Source &s = k.src[k.count];
    s.alt = ai; s.bus = b; s.harmonic = h;
    const double v = voiced(f); // the alternator's field, voiced: its whole flux, twelfth and all
    const bool third = 3 * f < 0.45 * fs;
    const cplx h0 = v * circuit(f, tau), h3 = third ? v * circuit(3 * f, tau) : cplx(0);
    s.h0r = h0.real(); s.h0i = h0.imag(); s.h3r = h3.real(); s.h3i = h3.imag();
    s.u1 = v * TAU * f * tau; s.u3 = third ? 3 * s.u1 : 0;
    const double Y = busSum(b);
    const int N = busCount[b];
    const double share = level[b] <= 0 ? (N > 0 ? 1.0 / N : 0.0) : rhoBus[b] / (1 + N * rhoBus[b]);
    busCount[b]++;
    k.count++;
    if (contact > 0) { s.dir = 1; s.at = 0; s.len = contact; s.uPrev = 0; s.y = 0; } // parted: no current yet
    else { s.y = share * Y; settle(s, k, t); }
  }
}

// One winding leaves its bus with whatever current it still has (a spark at the contacts).
void TelharmoniumEngine::dropSource(Key &k, int i) {
  Source &s = k.src[i];
  if (!s.dir) C[s.bus] -= s.c0 * exp(-(double)(t - s.t0) / (fs * tau));
  if (--busCount[s.bus] <= 0) { busCount[s.bus] = 0; C[s.bus] = 0; }
  if (s.alt >= 0 && --alts[s.alt].refs < 0) alts[s.alt].refs = 0;
  k.src[i] = k.src[--k.count];
}

void TelharmoniumEngine::drop(Key &k) {
  while (k.count > 0) dropSource(k, k.count - 1);
  k.on = false;
}

// The relay opens: each winding's contacts part over the contact time, its current followed step by
// step as their engagement falls; at once, it leaves with its current.
void TelharmoniumEngine::open(Key &k) {
  k.on = false;
  if (contact <= 0) { drop(k); return; }
  for (int i = 0; i < k.count; i++) {
    Source &s = k.src[i];
    if (s.dir == 0) {
      const double c = s.c0 * exp(-(double)(t - s.t0) / (fs * tau));
      C[s.bus] -= c;
      s.y = steady(s, k) + c;
      s.uPrev = emf(s, k);
      s.at = 0; s.len = contact;
    } else if (s.dir == 1) { // still closing: it opens from where it got to
      s.at = s.len - s.at;
    }
    s.dir = -1;
  }
}

// The lowest key held, on its own shaft, that the key is a major third or a minor seventh above
// (in any octave): Pierce took those from its shaft's 5th and 7th harmonics.
int TelharmoniumEngine::rootFor(int key, const Key *except) const {
  int best = -1;
  for (const Key &k : keys) {
    if (!k.on || &k == except || k.root >= 0 || k.key >= key) continue;
    const int d = (key - k.key) % 12;
    if ((d == 4 || d == 10) && (best < 0 || k.key < best)) best = k.key;
  }
  return best;
}

void TelharmoniumEngine::start(Key &k) {
  const int pc = k.key % 12;
  k.root = -1;
  if (eight && !built(pc) && k.key >= 4) k.root = k.key - 4; // from the third of A, D, E or G
  else if (pierce) k.root = rootFor(k.key, &k);
  Assign a = assign(k.key, k.root);
  if (a.shaft < 0) { k.root = -1; a = assign(k.key, -1); }
  k.shaft = a.shaft; k.teeth = a.teeth;
  connect(k);
  Message m;
  m.type = msg::note; m.key = (int16_t)k.key;
  m.values[0] = 1; m.values[1] = (float)k.shaft; m.values[2] = (float)k.teeth; m.values[3] = (float)k.manual; m.values[4] = (float)k.root;
  m.count = 5;
  post(m);
}

void TelharmoniumEngine::noteOn(int key, double velocity) {
  if (!hasP || key < 0 || key > 127) return;
  for (Key &k : keys) if (k.on && k.key == key) { k.vel = std::clamp(velocity, 0.0, 1.0); return; } // its relay is already closed
  for (Key &k : keys) if (!k.on && k.count > 0 && k.key == key) drop(k); // still opening: struck again
  Key *slot = nullptr;
  for (Key &k : keys) if (!k.alive()) { slot = &k; break; }
  if (!slot) { for (Key &k : keys) if (!k.on && (!slot || k.born < slot->born)) slot = &k; }
  if (!slot) { for (Key &k : keys) if (!slot || k.born < slot->born) slot = &k; }
  drop(*slot);
  Key &k = *slot;
  k.on = true; k.key = key; k.born = t;
  k.vel = std::clamp(velocity, 0.0, 1.0); k.after = 0;
  k.manual = key >= split ? 1 : 0;
  start(k);
  // Pierce: a chord's keys arrive one after another; a key struck just before its root moves to it
  if (pierce)
    for (Key &o : keys) {
      if (!o.on || &o == &k || o.root >= 0 || o.key <= key || (double)(t - o.born) > CHORD * fs) continue;
      if (eight && !built(o.key % 12)) continue;
      const int d = (o.key - key) % 12;
      if (d != 4 && d != 10) continue;
      drop(o); o.on = true;
      start(o);
    }
  int live = 0;
  for (const Key &x : keys) live += x.on;
  if (live > pick(kMaxKeys, 16, 10)) { // Quality: fewer keys at once; the oldest lets go
    Key *old = nullptr;
    for (Key &x : keys) if (x.on && &x != &k && (!old || x.born < old->born)) old = &x;
    if (old) open(*old);
  }
}

void TelharmoniumEngine::noteOff(int key, double) {
  if (key < 0 || key > 127) return;
  for (Key &k : keys) if (k.on && k.key == key) {
    open(k);
    Message m;
    m.type = msg::note; m.key = (int16_t)key; m.values[0] = 0; m.count = 1;
    post(m);
  }
}

void TelharmoniumEngine::allNotesOff() {
  for (Key &k : keys) if (k.on) open(k);
}

void TelharmoniumEngine::pressure(double value, int key) { // aftertouch: one key (poly) or every held key (channel, −1)
  for (Key &k : keys) if (k.on && (key < 0 || k.key == key)) k.after = std::clamp(value, 0.0, 1.0);
}

void TelharmoniumEngine::bend(double value) { bendCents = std::clamp(value, -1.0, 1.0) * kBendSemitones * 100; }

int TelharmoniumEngine::voiceCount() const {
  int n = 0;
  for (const Key &k : keys) n += k.alive();
  return n;
}

void TelharmoniumEngine::run(float *L, float *R, int n) {
  const bool third = toothNow > 0;
  float man[MANUALS][CHUNK], line[MANUALS][CHUNK];
  // the buses
  for (int i = 0; i < n; i++) {
    double Y[BUSES];
    for (int b = 0; b < BUSES; b++) Y[b] = C[b];
    for (Key &k : keys) {
      if (!k.count) continue;
      const double g = k.gainNow;
      for (int j = 0; j < k.count; j++) {
        Source &s = k.src[j];
        if (s.dir) {
          // its contacts are moving: their conductance κ (0 parted, 1 home) puts R/κ in the
          // circuit, so τκ y' + y = κ e/R: the current follows them, and dies as they part.
          // Step by step, κ held over each step and the EMF linear across it.
          s.at++;
          const double q = std::min(1.0, (double)s.at / s.len);
          const double kappa = s.dir > 0 ? 0.5 * (1 - cos(std::numbers::pi * q)) : 0.5 * (1 + cos(std::numbers::pi * q));
          const double tk = tau * std::max(kappa, 1e-6), dk = exp(-1 / (fs * tk));
          const double u = kappa * emf(s, k), slope = (u - s.uPrev) * tk * fs;
          s.y = u - slope + dk * (s.y - s.uPrev + slope);
          s.uPrev = u;
          if (s.at >= s.len) {
            if (s.dir > 0) settle(s, k, t + i);
            else { dropSource(k, j--); continue; } // parted: what current is left sparks across
          }
          if (s.dir) { Y[s.bus] += s.y; continue; }
        }
        const Alternator &a = alts[s.alt];
        double v = s.h0r * a.zi + s.h0i * a.zr;
        if (third) {
          const double z2r = a.zr * a.zr - a.zi * a.zi, z2i = 2 * a.zr * a.zi;
          v += toothNow * (s.h3r * (z2r * a.zi + z2i * a.zr) + s.h3i * (z2r * a.zr - z2i * a.zi));
        }
        Y[s.bus] += g * v;
      }
    }
    for (Alternator &a : alts) if (a.refs > 0) { // the next sample's phases
      const double zr = a.zr;
      a.zr = zr * a.wr - a.zi * a.wi;
      a.zi = zr * a.wi + a.zi * a.wr;
    }
    double sum[MANUALS] = {0, 0};
    for (int b = 0; b < BUSES; b++) {
      if (C[b] != 0) { C[b] *= decay; if (std::fabs(C[b]) < 1e-20) C[b] = 0; }
      if (level[b] <= 0 || busCount[b] == 0) continue;
      const double I = (1 + rho) * Y[b] / (1 + busCount[b] * rhoBus[b]);
      sum[b / HARMONICS] += I;
      accBus[b] += I * I;
    }
    accN++;
    for (int m = 0; m < MANUALS; m++) {
      if (tap == 1) { man[m][i] = (float)sum[m]; continue; }
      // the transformers, then the swell
      const double y = sum[m] - hpX[m] + hpRho * hpY[m];
      hpX[m] = sum[m]; hpY[m] = y;
      man[m][i] = (float)(y * swellNow);
    }
  }
  if (tap == 1) { for (int i = 0; i < n; i++) { L[i] = man[0][i]; R[i] = man[1][i]; } return; }
  // the lines
  for (int m = 0; m < MANUALS; m++) {
    if (lineOn) { std::fill(line[m], line[m] + n, 0.0f); lines[m].process(man[m], line[m], n); }
    else std::copy(man[m], man[m] + n, line[m]);
  }
  if (tap == 2) { for (int i = 0; i < n; i++) { L[i] = line[0][i]; R[i] = line[1][i]; } return; }
  // the receivers and the horns
  for (int i = 0; i < n; i++) {
    double out[MANUALS];
    for (int m = 0; m < MANUALS; m++) {
      const double u = line[m][i];
      // the pull goes as (Φ₀ + φ)², so beyond the magnet's own the force is u + u²/(2 I₀)
      const double F = u + u * u / (2 * magnet);
      double *xr = rx[m];
      const double x0 = rA[0] * xr[0] + rA[1] * xr[1] + rB[0] * F, x1 = rA[2] * xr[0] + rA[3] * xr[1] + rB[1] * F;
      xr[0] = std::fabs(x0) < 1e-30 ? 0 : x0; xr[1] = std::fabs(x1) < 1e-30 ? 0 : x1;
      const double v = xr[1];
      if (tap == 3) { out[m] = v; continue; }
      double o;
      if (hornLen <= 0) o = (v - prevV[m]) * bareGain; // the bare receiver radiates its acceleration
      else {
        auto read = [&](const std::vector<float> &buf) {
          const double at = hornAt - hornD + kHorn;
          const int i0 = (int)at;
          const double f = at - i0;
          return (1 - f) * buf[i0 % kHorn] + f * buf[(i0 + 1) % kHorn];
        };
        const double mouth = read(fwd[m]);
        lp[m] = (1 - hornA) * mouth + hornA * lp[m];
        if (std::fabs(lp[m]) < 1e-30) lp[m] = 0;
        const double refl = -lp[m];
        o = mouth + refl; // what leaves the mouth: the wave arriving, times 1 + R_m
        const double ret = read(back[m]);
        back[m][hornAt] = (float)refl;
        fwd[m][hornAt] = (float)(v + HORN_THROAT * ret);
      }
      prevV[m] = v;
      out[m] = o;
    }
    hornAt = (hornAt + 1) % kHorn;
    if (tap) { L[i] = (float)out[0]; R[i] = (float)out[1]; continue; }
    L[i] = (float)(OUT * (PAN_NEAR * out[0] + PAN_FAR * out[1]));
    R[i] = (float)(OUT * (PAN_FAR * out[0] + PAN_NEAR * out[1]));
  }
}

void TelharmoniumEngine::process(float *L, float *R, int n) {
  if (!hasP) { for (int i = 0; i < n; i++) L[i] = R[i] = 0; return; }
  for (int at = 0; at < n; at += CHUNK) {
    const int m = std::min(CHUNK, n - at);
    const double dt = m / fs;
    // the motor: its speed droops with the load and follows the field rheostat, through the flywheel
    const double target = bendCents - droop * load;
    cents = glideTo(cents, target, dt, flywheel);
    speed = fdlibm::pow(2.0, cents / 1200);
    swellNow = glideTo(swellNow, swell, dt, GAIN_T);
    for (Alternator &a : alts) if (a.refs > 0) place(a);
    for (Key &k : keys) if (k.count) k.gainNow = glideTo(k.gainNow, keyGain(k), dt, GAIN_T);
    run(L + at, R + at, m);
    // the load: every winding's share of its bus's current, in units of its own full current (the
    // voicing's fields set how much each alternator can give, not how hard it pulls on the motor)
    double w = 0;
    for (const Key &k : keys) for (int j = 0; j < k.count; j++) {
      const Source &s = k.src[j];
      if (level[s.bus] <= 0) continue;
      const double x = k.gainNow * (1 + rho) / (1 + busCount[s.bus] * rhoBus[s.bus]); // its stop's level, robbed
      w += x * x;
    }
    load = w / LOAD_REF;
    for (int pc = 0; pc < 12; pc++) theta[pc] = frac(theta[pc] + unit[pc] * speed * m / fs);
    t += m;
  }
  if ((sinceState += n) >= stateEvery) {
    sinceState = 0;
    Message s;
    s.type = msg::state;
    s.values[0] = (float)cents; s.values[1] = (float)load;
    for (int b = 0; b < BUSES; b++) { s.values[2 + b] = accN ? (float)std::sqrt(accBus[b] / accN) : 0; accBus[b] = 0; }
    s.count = 2 + BUSES;
    post(s);
    accN = 0;
  }
}

} // namespace forte::telharmonium
