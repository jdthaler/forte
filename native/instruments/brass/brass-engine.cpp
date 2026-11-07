// brass-engine.cpp — the brass engine (brass-engine.h).

#include "brass-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"

namespace forte::brass {

constexpr double OUT = 0.035;      // the radiated pressure at 1 m (Pa) to the output
constexpr double RELEASE = 0.03;   // s: the breath stops
constexpr int MAX_SOUNDING = 12;
// The compressor (compress): brass at full cry is some 35 dB above its pianissimo, and its shock
// fronts put its peaks 18-20 dB above its rms, so a fortissimo note's peaks reach 10 dB over full
// scale and a chord's 17 dB. The limiter after it caught them by ducking the whole sound 8-12 dB at
// once and letting it back over 150 ms, a pumping that this rides instead, smoothly. Its detector
// holds each peak for HOLD (longer than the lowest note's period, so it reads the waveform's crest,
// shock fronts and all, not one spike), then lets go over LET_GO; the gain follows it down in
// ATTACK and back up in RECOVER. Above THRESH (re the engine's full scale; the page adds the
// registry's 2.5 dB trim) the peaks rise 1/RATIO as fast, through a KNEE dB soft knee, so
// mezzo-forte and below (the regulation's level, brass-levels.h) are untouched; what is left over
// the ceiling for the limiter is a dB or two.
namespace comp {
constexpr double THRESH = -4, RATIO = 3, KNEE = 6; // dB, ratio, dB
constexpr double HOLD = 0.05, LET_GO = 0.3;        // s
constexpr double ATTACK = 0.004, RECOVER = 0.25;   // s
} // namespace comp

BrassEngine::BrassEngine(double fs) : Engine(fs) {
  for (int i = 0; i < POOL; i++) pool[i].mem = memory.data() + (size_t)i * MEM;
}

void BrassEngine::setParams(const double *p) {
  const bool horn = !hasParams || p[p::horn] != P[p::horn] || p[p::bellSize] != P[p::bellSize];
  bool tune = !hasParams;
  for (int i = p::pitch; i < p::count; i++) tune |= p[i] != P[i];
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
  tuning = tuningOf(P.data());
  if (horn) cutValid = false;
  if (horn || tune) planVersion++;
}

void BrassEngine::pressure(double value, int key) {
  if (key < 0) after = std::clamp(value, 0.0, 1.0);
  else if (key < 128) press[key] = std::clamp(value, 0.0, 1.0);
}

int BrassEngine::voiceCount() const {
  int n = 0;
  for (const Voice &v : pool) n += v.active;
  return n;
}

void BrassEngine::allNotesOff() {
  for (Voice &v : pool) v.active = false;
  peak = 0; peakHold = 0; compGain = 1;
  focus = nullptr;
}

// Lay the voice's bore out in its memory: each segment's two delays, a power of two each, the
// slide's long enough to reach seven positions and a fall of a fifth beyond.
void BrassEngine::start(Voice &v, double velocity) {
  const HornDesign &h = hornDesign(cut.horn);
  buildBore(cut.horn, v.plan.scale, cut.bellSize, v.fsV, v.bore, cut.dCyl);
  const int nc = std::max(1, v.bore.cyl1 - v.bore.cyl0);
  realize(v.bore, v.fsV, v.plan.ext, 0, v.dig);
  int used = 0;
  bool fits = true;
  for (int i = 0; i < v.dig.n; i++) {
    double Dmax = v.dig.D[i] * 1.5 + 8;
    if (i >= v.dig.cyl0 && i < v.dig.cyl1) Dmax = (v.bore.len[i] + (h.extMax + 0.6) * v.plan.Le * 1.6 / nc) * v.fsV / Air::c * 1.5 + 8;
    int size = 8;
    while (size < Dmax) size <<= 1;
    for (int d = 0; d < 2; d++) {
      v.off[d][i] = used; v.mask[d][i] = size - 1;
      used += size;
    }
    if (used > MEM) { fits = false; break; }
  }
  if (!fits) { // a huge horn at a high sample rate: as long delays as the memory holds
    used = 0;
    const int each = MEM / (2 * v.dig.n);
    int size = 8;
    while (size * 2 <= each) size <<= 1;
    for (int i = 0; i < v.dig.n; i++) for (int d = 0; d < 2; d++) { v.off[d][i] = used; v.mask[d][i] = size - 1; used += size; }
  }
  std::fill(v.mem, v.mem + used, 0.0f);
  for (int i = 0; i < v.dig.n; i++) {
    v.last[0][i] = v.last[1][i] = v.last2[0][i] = v.last2[1][i] = v.lz[0][i] = v.lz[1][i] = 0;
    v.fo[i] = v.bo[i] = 0;
    if (i + 1 < v.dig.n) v.kap[i] = (v.dig.Y[i] - v.dig.Y[i + 1]) / (v.dig.Y[i] + v.dig.Y[i + 1]);
  }
  v.t = 0;
  v.y = 0; v.v = 0; v.pc = 0; v.U = 0; v.pm = 0; // (the lips held shut by the tongue)
  v.ra = v.rb = v.Uo = v.out = 0; v.env = 0;
  v.vel = velocity; v.age = 0;
  v.attack = 1e-3 * P[p::tongue];
  v.ym = 0; v.yPrev = 0; v.yl1 = 0; v.yl2 = 0; v.tCross = -1; v.low = false; v.fm = 0; v.crossings = 0; v.yAmp = 0; v.yMax = -1; v.yMin = 1;
  v.slideNow = v.plan.ext;
  v.bendNow = expr.bendOf(v.key) * bendNow;
  v.plunger = v.plungerTo = expr.slideOr(v.key, P[p::plunger]);
  std::tie(v.gl, v.gr) = keyPan(v.key, 0.4);
  v.active = true; v.down = true; v.liftK = 1;
  retune(v, true);
}

// The slide (the bend, the ear's trim), the lips' tension, the plunger: per block.
void BrassEngine::retune(Voice &v, bool reset) {
  const double ratio = v.bendNow; // the note's bend: wheel × its own
  // the whole horn's equivalent length for the note, × the ear's trim, ÷ the bend
  const double Lwant = (v.plan.Le + v.plan.ext) * v.trim / ratio;
  const double ext = std::clamp(Lwant - v.plan.Le, -0.5 * (v.bore.len[v.bore.cyl0] * std::max(1, v.bore.cyl1 - v.bore.cyl0)), 4.0 * v.plan.Le);
  v.slideNow = reset ? ext : v.slideNow + (ext - v.slideNow) * 0.5;
  const int nc = std::max(1, v.dig.cyl1 - v.dig.cyl0);
  for (int i = v.dig.cyl0; i < v.dig.cyl1; i++) {
    const double L = std::max(0.25 * v.bore.len[i], v.bore.len[i] + v.slideNow / nc);
    v.dig.D[i] = std::min(std::max(3.0, L * v.fsV / Air::c), (double)(v.mask[0][i] - 6) / 1.45);
  }
  for (int i = 0; i < v.dig.n; i++) if (v.dig.hot[i]) lagrange(v.dig.D[i], v.base[i], v.taps[i]);
  // the plunger's opening at the mouth
  const double ao = v.bore.mouthR * std::sqrt(plungerOpen(v.plunger));
  const int m = v.dig.n - 1;
  v.dig.Y[m] = PI * ao * ao / (Air::rho * Air::c);
  v.dig.tauR = 1.22 * ao / Air::c;
  if (m > 0) v.kap[m - 1] = (v.dig.Y[m - 1] - v.dig.Y[m]) / (v.dig.Y[m - 1] + v.dig.Y[m]);
  // the lips: tuned to the note (bent with it), as tense as asked
  v.fl = v.plan.f * ratio;
  v.lips = lipsFor(cut.horn, v.fl, v.plan.scale, v.plan.partial, P[p::lipTension] + v.lipTrim, P[p::lipQ], v.lipR);
}

void BrassEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < 0 || key > 127) return;
  if (!cutValid) { cut = cutHorn((int)P[p::horn], P[p::bellSize], fs); cutValid = true; }
  // a key sounding again: the same player tongues a new note
  Voice *v = nullptr;
  for (Voice &x : pool) if (x.active && x.key == key) { v = &x; break; }
  if (v) {
    v->down = true; v->vel = velocity; v->age = 0;
    v->attack = 1e-3 * P[p::tongue];
    focus = v;
    return;
  }
  // a free voice, else the quietest released one, else the oldest
  const int cap = pick(MAX_SOUNDING, 8, 5);
  int sounding = 0;
  for (const Voice &x : pool) sounding += x.active && x.down;
  int pickI = -1;
  for (int i = 0; i < POOL; i++) if (!pool[i].active) { pickI = i; break; }
  if (pickI < 0 || sounding >= cap) {
    double best = INFINITY;
    for (int i = 0; i < POOL; i++) {
      const Voice &x = pool[i];
      if (!x.active) continue;
      const double score = (x.down ? 1e6 : 0) + x.env + 1e-9 * started[i];
      if (sounding >= cap && !x.down) continue;
      if (score < best) { best = score; pickI = i; }
    }
    if (sounding >= cap) { // the oldest sounding key lets go
      uint32_t old = UINT32_MAX;
      for (int i = 0; i < POOL; i++) if (pool[i].active && pool[i].down && started[i] < old) { old = started[i]; pickI = i; }
      pool[pickI].down = false;
      for (int i = 0; i < POOL; i++) if (!pool[i].active) { pickI = i; break; }
    }
  }
  if (pickI < 0) return;
  Voice &nv = pool[pickI];
  nv.key = key;
  const double f = keyFreq(key) * tuning.ratio(key);
  // the smallest horns (high above the horn's compass) run 2, 4 or 8 times a sample, so that their
  // bores are as many samples long as the horn's own
  const Plan guess = planKey(cut, f, fs, false);
  nv.os = guess.octave <= -2 ? std::min(8, 1 << (-guess.octave - 1)) : 1;
  nv.fsV = fs * nv.os;
  nv.plan = planKey(cut, f, nv.fsV, true);
  nv.gain = regulation(cut.horn, key);
  const bool known = learnedVersion[key] == planVersion && learnedPlan[key].partial == nv.plan.partial;
  const double habit = std::pow(2.0, hornDesign(cut.horn).habit / 1200);
  nv.trim = known ? learned[key] : habit;
  nv.lipTrim = known ? learnedLip[key] : 0;
  start(nv, velocity);
  started[pickI] = ++order;
  focus = &nv;
}

// Lift: how the breath stops: a slow lift tapers the note (the mouth pressure falls over up to four
// times the usual), a fast one is a tongue stop (a quarter of it).
void BrassEngine::noteOff(int key, double velocity) {
  for (Voice &v : pool) if (v.active && v.key == key && v.down) {
    const double s = liftScale(velocity);
    v.down = false; v.liftK = s * s;
    if (v.crossings > 12) { learned[key] = v.trim; learnedLip[key] = v.lipTrim; learnedPlan[key] = v.plan; learnedVersion[key] = planVersion; }
  }
}

// The ear: each upward crossing of the lips through their mean times a period; once the note has
// settled, the slide moves to bring it to the note.
void BrassEngine::listen(Voice &v) {
  // (the lips' motion smoothed: two one-pole lowpasses at about the note, so their harmonics' wiggles
  // cannot cross the mean)
  const double a1 = std::min(0.5, TAU * 1.2 * v.plan.f / v.fsV);
  v.yl1 += (v.y - v.yl1) * a1; v.yl2 += (v.yl1 - v.yl2) * a1;
  const double y = v.yl2;
  v.ym += (y - v.ym) * (v.plan.f / (2 * v.fsV));
  v.yMax = std::max(v.yMax * 0.9995, v.y); v.yMin = std::min(v.yMin * 0.9995, v.y);
  const double a = v.yPrev - v.ym, b = y - v.ym;
  // (a Schmitt trigger: an upward crossing counts once the lips have been well below their mean,
  // so a wiggle near it is not taken for a period)
  v.yAmp = std::max(std::abs(b), v.yAmp * (1 - v.plan.f / (3 * v.fsV)));
  if (b < -0.3 * v.yAmp) v.low = true;
  if (a < 0 && b >= 0 && v.low) {
    v.low = false;
    const double tc = v.t - 1 + a / (a - b);
    if (v.tCross >= 0) {
      const double f = v.fsV / (tc - v.tCross);
      const double want = v.plan.f * v.bendNow;
      if (f > 0.5 * want && f < 2 * want) {
        v.fm = v.fm > 0 ? v.fm + 0.3 * (f - v.fm) : f;
        v.crossings++;
        if (ear && v.down && v.crossings > 6 && v.age > v.attack + 0.02) {
          const double e = std::log(v.fm / want);
          if (std::abs(e) < 0.08) {
            // near the note: the slide out (or in), and the lips loosened (or tightened), both
            // bring it down (up)
            // (quickly while the note speaks, then gently, the lips gentler still: where the horn's
            // peaks are weak the pitch follows the lips, and a quick hand there would swing it)
            const bool early = v.age < 0.4 || v.crossings < 40;
            const double g = early ? 0.3 : 0.05, gl = early ? 0.3 : 0.01;
            const double habit = std::pow(2.0, hornDesign(cut.horn).habit / 1200);
            v.trim = std::clamp(v.trim * std::exp(g * e), 0.92 * habit, 1.08 * habit);
            v.lipTrim = std::clamp(v.lipTrim - gl * 1200 / std::log(2.0) * e, -400.0, 400.0);
          } else if (v.crossings > 24 && v.age > v.attack + 0.12) {
            // (not while the note is still speaking: its first periods wander)
            // on the partial below (above): the player reaches for the note with tighter (looser) lips
            v.lipTrim = std::clamp(v.lipTrim + (e < 0 ? 12.0 : -12.0), -400.0, 400.0);
          }
        }
      }
    }
    v.tCross = tc;
    if (&v == focus && trace.armed) { trace.armed = false; trace.n = 0; trace.cnt = 0; }
  }
  v.yPrev = y;
}

void BrassEngine::step(Voice &v, double &outL, double &outR) {
  Digital &d = v.dig;
  const int N = d.n;
  const uint32_t t = v.t;
  const double kNL = Air::beta * P[p::shock] / Air::rhoc2;
  const int iters = iterations();
  float *M = v.mem;
  // what arrives at each segment's ends
  for (int i = 0; i < N; i++) {
    for (int dir = 0; dir < 2; dir++) {
      const float *buf = M + v.off[dir][i];
      const int mask = v.mask[dir][i];
      double out;
      // (the outgoing wave steepens; the returning one, stripped of its treble by the bell and far
      // weaker there, is run linear)
      if (d.hot[i] && !(dir == 0 && d.nl[i] && kNL > 0)) {
        const double *h = v.taps[i];
        const uint32_t j = t - v.base[i];
        const double y = h[0] * buf[j & mask] + h[1] * buf[(j - 1) & mask] + h[2] * buf[(j - 2) & mask] + h[3] * buf[(j - 3) & mask];
        out = v.lz[dir][i] = d.lg[i] * (1 - d.lp[i]) * y + d.lp[i] * v.lz[dir][i];
      } else if (d.hot[i]) {
        // the sample now leaving, read where its own pressure carried it (guessed from the last two)
        const double y = nlRead(buf, mask, t, d.D[i], kNL, 2 * v.last[dir][i] - v.last2[dir][i], iters);
        v.last2[dir][i] = v.last[dir][i];
        v.last[dir][i] = y;
        out = v.lz[dir][i] = d.lg[i] * (1 - d.lp[i]) * y + d.lp[i] * v.lz[dir][i];
      } else {
        out = buf[(t - (uint32_t)d.D[i]) & mask];
      }
      (dir == 0 ? v.fo : v.bo)[i] = out;
    }
  }
  // the lips and the cup
  const double fs = v.fsV, T = 1 / fs;
  {
    const Lips &L = v.lips;
    double F = -L.k * (v.y - L.H0) - v.lipR * v.v + L.S * (v.pm - v.pc);
    if (v.y < 0) F -= 4 * L.k * v.y; // the lips pressed together
    v.v += F / L.m * T;
    v.y += v.v * T;
    const double h = std::max(0.0, v.y);
    const double W = L.w * h * std::sqrt(2 / Air::rho);
    const double Ur = L.S * v.v;
    const double b = v.bo[0], Y0 = d.Y[0], C = d.cupC * fs;
    const double A = C + Y0, K = C * (v.pm - v.pc) + Y0 * (v.pm - 2 * b) - Ur;
    double Delta;
    if (K >= 0) { const double s = 2 * K / (W + std::sqrt(W * W + 4 * A * K)); Delta = s * s; }
    else { const double s = -2 * K / (W + std::sqrt(W * W - 4 * A * K)); Delta = -s * s; }
    v.pc = v.pm - Delta;
    v.U = W * (Delta >= 0 ? std::sqrt(Delta) : -std::sqrt(-Delta));
    M[v.off[0][0] + (t & v.mask[0][0])] = (float)(v.pc - b);
  }
  // the junctions
  for (int i = 0; i + 1 < N; i++) {
    const double aL = v.fo[i], bR = v.bo[i + 1], w = v.kap[i] * (aL - bR);
    M[v.off[0][i + 1] + (t & v.mask[0][i + 1])] = (float)(aL + w);
    M[v.off[1][i] + (t & v.mask[1][i])] = (float)(bR + w);
  }
  // the open end: R = −1 / (1 + s τ), bilinear
  {
    const double a = v.fo[N - 1], K = 2 * fs * d.tauR;
    const double r = (-(a + v.ra) - (1 - K) * v.rb) / (1 + K);
    v.ra = a; v.rb = r;
    M[v.off[1][N - 1] + (t & v.mask[1][N - 1])] = (float)r;
    const double Uo = d.Y[N - 1] * (a - r);
    // far away, a monopole: p = ρ/4π dU/dt at 1 m
    v.out = (Uo - v.Uo) * fs * (Air::rho / (4 * PI));
    v.Uo = Uo;
  }
  listen(v);
  if (&v == focus && !trace.armed) record(v);
  v.t = t + 1;
  const double o = OUT * v.out;
  v.env = std::max(std::abs(o) * v.gain, v.env * (1 - 4e-4 * 48000 / fs));
  outL += v.gl * o; outR += v.gr * o;
}

void BrassEngine::process(float *Lb, float *Rb, int n) {
  for (int i = 0; i < n; i++) Lb[i] = Rb[i] = 0;
  if (!hasParams) return;
  const double dt = n / fs;
  bendNow = glideTo(bendNow, bendTo, dt, 0.02);
  for (Voice &v : pool) {
    if (!v.active) continue;
    // the breath: the tongue lets it go over `attack`, then it follows the velocity and aftertouch
    const double prs = std::max(after, press[v.key]);
    v.pTarget = v.down ? mouthPressure(v.vel, v.plan.f * v.plan.scale, P[p::breath]) * (1 + 0.5 * prs) : 0;
    v.bendNow = glideTo(v.bendNow, expr.bendOf(v.key) * bendNow, dt, 0.03);
    v.plungerTo = expr.slideOr(v.key, P[p::plunger]);
    v.plunger = glideTo(v.plunger, v.plungerTo, dt, 0.02);
    retune(v, false);
    const double kRel = 1 - std::exp(-1 / (v.fsV * RELEASE * v.liftK)), kFol = 1 - std::exp(-1 / (v.fsV * 0.03));
    const double gain = v.gain / v.os;
    for (int i = 0; i < n; i++) {
      double l = 0, r = 0;
      for (int k = 0; k < v.os; k++) {
        if (v.down && v.age < v.attack) {
          // the tongue lets go of breath already pressed behind it: a step (smaller for a softer
          // attack), then the rest over the attack
          const double u = v.age / v.attack, s0 = 0.6 * std::exp(-v.attack / 0.04);
          v.pm = std::max(v.pm, v.pTarget * (s0 + (1 - s0) * 0.5 * (1 - std::cos(PI * u))));
        } else v.pm += (v.pTarget - v.pm) * (v.down ? kFol : kRel);
        step(v, l, r);
        v.age += 1 / v.fsV;
      }
      Lb[i] = (float)(Lb[i] + gain * l);
      Rb[i] = (float)(Rb[i] + gain * r);
    }
    if (!v.down && v.pm < 1 && v.env < 1e-4) { v.active = false; if (focus == &v) focus = nullptr; }
    if (!std::isfinite(v.y) || !std::isfinite(v.out)) { v.active = false; if (focus == &v) focus = nullptr; }
  }
  compress(Lb, Rb, n);
  if (++blocks % 6 == 0) postView();
}

void BrassEngine::compress(float *L, float *R, int n) {
  using namespace comp;
  const double kLet = 1 - std::exp(-1 / (fs * LET_GO)), kA = 1 - std::exp(-1 / (fs * ATTACK)),
               kR = 1 - std::exp(-1 / (fs * RECOVER));
  const int hold = (int)(HOLD * fs);
  const double knee0 = std::pow(10.0, (THRESH - KNEE / 2) / 20), slope = 1 - 1 / RATIO;
  for (int i = 0; i < n; i++) {
    const double x = std::max(std::abs((double)L[i]), std::abs((double)R[i]));
    if (x >= peak) { peak = x; peakHold = hold; }
    else if (peakHold > 0) peakHold--;
    else peak += (x - peak) * kLet;
    double want = 1;
    if (peak > knee0) {
      const double over = 20 * std::log10(peak) - THRESH;
      const double cut = over >= KNEE / 2 ? slope * over : slope * (over + KNEE / 2) * (over + KNEE / 2) / (2 * KNEE);
      want = std::pow(10.0, -cut / 20);
    }
    compGain += (want - compGain) * (want < compGain ? kA : kR);
    L[i] = (float)(L[i] * compGain); R[i] = (float)(R[i] * compGain);
  }
}

// The traces of the focused voice: its cup pressure, lip opening, the wave going into the flare and
// its sound, a point every `dec` steps, about three periods in all, then a pause.
void BrassEngine::record(const Voice &v) {
  Trace &tr = trace;
  if (tr.n >= TRACE) return;
  if (tr.cnt++ % tr.dec) return;
  int last = v.dig.n - 1;
  while (last > 0 && !v.dig.hot[last]) last--;
  tr.pc[tr.n] = (float)v.pc; tr.h[tr.n] = (float)std::max(0.0, v.y); tr.pb[tr.n] = (float)v.fo[last]; tr.rad[tr.n] = (float)(v.out * v.gain);
  tr.n++;
}

void BrassEngine::postView() {
  if (!messages || !focus || !focus->active) return;
  const Voice &v = *focus;
  Message m;
  m.type = msg::state; m.key = (int16_t)v.key;
  int last = v.dig.n - 1;
  while (last > 0 && !v.dig.hot[last]) last--;
  double xs = 0; // how far the steepening wave has come: the cylinder's far end
  for (int i = 0; i <= last && i < v.bore.n; i++) xs += v.bore.len[i];
  const float vals[] = {(float)cut.horn, (float)v.plan.octave, (float)v.plan.partial, (float)v.plan.position, (float)v.plan.valves,
                        (float)(v.plan.f * v.bendNow), (float)v.fm, (float)v.pm, (float)(v.yMax - v.yMin), (float)v.slideNow, (float)v.plan.Le,
                        (float)v.bore.total(), (float)v.trim, (float)v.lipTrim, (float)xs, (float)trace.dt, (float)v.plunger, (float)v.plan.scale};
  m.count = sizeof vals / sizeof *vals;
  for (int i = 0; i < m.count; i++) m.values[i] = vals[i];
  post(m);
  // the bore and its waves at SNAP points along it, every other time
  if ((blocks / 12) % 2 == 0) {
    double cum[MAX_SEG + 1] = {0};
    const int nb = v.bore.n;
    for (int i = 0; i < nb; i++) cum[i + 1] = cum[i] + v.bore.len[i] + (i >= v.bore.cyl0 && i < v.bore.cyl1 ? v.slideNow / std::max(1, v.bore.cyl1 - v.bore.cyl0) : 0);
    float r[SNAP], pf[SNAP], pbk[SNAP];
    int seg = 0;
    for (int k = 0; k < SNAP; k++) {
      const double x = cum[nb] * (k + 0.5) / SNAP;
      while (seg < nb - 1 && x > cum[seg + 1]) seg++;
      const double u = std::clamp((x - cum[seg]) / std::max(1e-9, cum[seg + 1] - cum[seg]), 0.0, 1.0);
      const double D = v.dig.D[seg];
      const float *bf = v.mem + v.off[0][seg], *bb = v.mem + v.off[1][seg];
      // the forward wave written u D samples ago is u of the way along; the backward, (1 − u) D
      const uint32_t af = v.t - 1 - (uint32_t)std::lround(u * D), ab = v.t - 1 - (uint32_t)std::lround((1 - u) * D);
      pf[k] = bf[af & v.mask[0][seg]];
      pbk[k] = bb[ab & v.mask[1][seg]];
      r[k] = (float)v.bore.rad[seg];
    }
    const float *arrs[3] = {pf, pbk, r};
    for (int w = 0; w < 3; w++) for (int first = 0; first < SNAP; first += 28) {
      Message s; s.type = w < 2 ? msg::snap : msg::bore; s.key = (int16_t)v.key;
      s.values[0] = (float)(w < 2 ? w : cum[nb]); s.values[1] = (float)first;
      const int c = std::min(28, SNAP - first);
      for (int i = 0; i < c; i++) s.values[2 + i] = arrs[w][first + i];
      s.count = (uint16_t)(2 + c);
      post(s);
    }
  }
  // the traces, once full; then start again on an upward crossing
  if (trace.n >= TRACE) {
    const float *arrs[4] = {trace.pc, trace.h, trace.pb, trace.rad};
    for (int w = 0; w < 4; w++) for (int first = 0; first < TRACE; first += 28) {
      Message s; s.type = msg::trace; s.key = (int16_t)v.key;
      s.values[0] = (float)w; s.values[1] = (float)first;
      const int c = std::min(28, TRACE - first);
      for (int i = 0; i < c; i++) s.values[2 + i] = arrs[w][first + i];
      s.count = (uint16_t)(2 + c);
      post(s);
    }
    const double per = v.fsV / std::max(20.0, v.plan.f * v.bendNow);
    trace.dec = std::max(1, (int)std::lround(3 * per / TRACE));
    trace.dt = trace.dec / v.fsV;
    trace.n = 0; trace.cnt = 0; trace.armed = true;
  }
}
} // namespace forte::brass
