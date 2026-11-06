// pulsars-engine.cpp — the Pulsars' engine (pulsars-engine.h).

#include "pulsars-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"

namespace forte::pulsars {

constexpr double OUT = 0.08;         // a pulsar at full velocity whose sightline cuts its beam's middle: this rms
constexpr double STEAL_T = 0.005;    // s: a stolen voice fades with this time constant
constexpr double SILENT = 1e-5;      // a switched-off pulsar this faint is gone
constexpr double BRIGHTEST = 5;   // no single pulse brighter than this many times the average (the log-normal's far tail cut)
constexpr int FIRST = 21, LAST = 108;

PulsarsEngine::PulsarsEngine(double fs) : Engine(fs), rng(0x50a5a75u) {
  voices.reserve(kSlots);
}

void PulsarsEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
}

int PulsarsEngine::voiceCount() const {
  int n = 0;
  for (const Voice &v : voices) n += !v.stolen;
  return n;
}

void PulsarsEngine::allNotesOff() {
  voices.clear();
  used.fill(false);
}

int PulsarsEngine::freeSlot() {
  for (int s = 0; s < kSlots; s++) if (!used[s]) return s;
  return -1;
}

double PulsarsEngine::desiredDm(const Voice &v) const { return expr.slideOr(v.key, P[p::dm]); }

void PulsarsEngine::slide(double value, int key) { expr.setSlide(value, key); }

// The voice's table `which` from its setup, at this Quality's size: harmonics up to
// the top of hearing (or less, at Medium and Low), and as many pieces of the band as its spread of
// delays needs when nothing takes them out.
void PulsarsEngine::fill(Voice &v, int which) {
  const int q = pick(0, 1, 2);
  if (!builders[q]) builders[q].emplace(NTAB >> q);
  Builder &b = *builders[q];
  if (!pool[v.slot]) pool[v.slot] = std::make_unique<float[]>((size_t)4 * (NTAB + 1));
  float *base = pool[v.slot].get();
  Tables &t = v.tab[which];
  t.L = base + (size_t)(2 * which) * (NTAB + 1);
  t.R = base + (size_t)(2 * which + 1) * (NTAB + 1);
  const double top = pick(std::min(0.45 * fs, 20000.0), std::min(0.45 * fs, 16000.0), std::min(0.45 * fs, 12000.0));
  const Setup &s = v.setup;
  const double spread = std::max(smearLeft(s, 0), smearLeft(s, 1));
  const int most = pick(256, 96, 32);
  const int pieces = std::clamp((int)std::ceil(std::sqrt(0.6 * TAU * top * spread * s.bw)) + 4, 4, most);
  b.build(s, t, top, pieces);
}

void PulsarsEngine::startXf(Voice &v) {
  v.xf = REBUILD;
  v.inc = v.setup.f / fs;
}

void PulsarsEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < FIRST || key > LAST) return;
  // the same key again: the pulsar switches back on, as it is
  for (Voice &x : voices) {
    if (x.key != key || x.stolen) continue;
    x.vel = velocity; x.held = true; x.tOff = -1; x.t = 0; x.lg = 1; x.lgStep = 0;
    return;
  }
  // past kMaxVoices (fewer at Medium and Low Quality), the oldest let-go pulsar (or else the
  // oldest) fades out
  int live = 0;
  Voice *victim = nullptr, *oldest = nullptr;
  for (Voice &x : voices) {
    if (x.stolen) continue;
    live++;
    if (!oldest) oldest = &x;
    if (!x.held && !victim) victim = &x;
  }
  if (live >= pick(kMaxVoices, 16, 8)) {
    Voice *go = victim ? victim : oldest;
    go->stolen = true; go->held = false;
  }
  int slot = freeSlot();
  if (slot < 0) { // every table in use: the oldest fading voice goes at once
    for (size_t i = 0; i < voices.size(); i++) {
      if (!voices[i].stolen) continue;
      used[voices[i].slot] = false;
      voices.erase(voices.begin() + (long)i);
      break;
    }
    slot = freeSlot();
    if (slot < 0) return;
  }
  used[slot] = true;
  voices.emplace_back();
  Voice &v = voices.back();
  v.key = key; v.slot = slot; v.vel = velocity;
  v.setup = setupOf(key, P.data(), expr.slideOr(key, P[p::dm]));
  v.cur = 0;
  fill(v, 0);
  v.inc = v.setup.f / fs;
  v.phase = 0.5; // between pulses
  v.aPrev = v.aNext = 1;
  // each sub-band's switch: as fast as its scattering tail lets it, and never a click
  for (int b = 0; b < SUBBANDS; b++) {
    const Band sb = subBand(v.setup, b);
    const double tau = std::max(scatterTime(v.setup.dm, 0.5 * (sb.lo + sb.hi), v.setup.scatter), FLOOR_T);
    (b == 0 ? v.kL : v.kR) = 1 - std::exp(-1 / (fs * tau));
  }
  // what the page draws
  const Geometry g = geometryOf(v.setup);
  const Band all = bandOf(v.setup);
  Message m;
  m.type = kPulsar; m.key = (int16_t)key; m.count = 16;
  const double vals[16] = {g.f, g.alpha, g.zeta, g.beta, g.rho, g.rlc, g.rem, v.setup.dm, scatterTime(v.setup.dm, v.setup.fc, v.setup.scatter),
                           smearLeft(v.setup, 0), smearLeft(v.setup, 1), (double)v.setup.dedisp, (double)v.tab[0].harmonics, velocity,
                           dmDelay(v.setup.dm, all.lo) - dmDelay(v.setup.dm, all.hi), v.tab[0].smear};
  for (int i = 0; i < 16; i++) m.values[i] = (float)vals[i];
  post(m);
}

// Lift: a slow lift fades the pulse train out over up to 0.6 s before the pulsar switches off; a
// fast one cuts it, within 30 ms, the dispersed tail too.
void PulsarsEngine::noteOff(int key, double velocity) {
  const double s = liftScale(velocity);
  for (Voice &v : voices) if (v.key == key && v.held && !v.stolen) {
    v.held = false;
    if (s > 1) { v.lgStep = -1 / (0.6 * (s - 1) * fs); continue; } // switches off once faded
    v.tOff = v.t;
    if (liftPast(velocity) > 0) v.lgStep = -1 / (0.03 * fs);
  }
}

int PulsarsEngine::harmonicsOf(int key) const {
  for (auto it = voices.rbegin(); it != voices.rend(); ++it) if (it->key == key) return it->tab[it->cur].harmonics;
  return 0;
}
int PulsarsEngine::tableSizeOf(int key) const {
  for (auto it = voices.rbegin(); it != voices.rend(); ++it) if (it->key == key) return it->tab[it->cur].n;
  return 0;
}

void PulsarsEngine::run(Voice &v, float *L, float *R, int n) {
  const double dt = 1 / fs, ks = 1 - std::exp(-1 / (fs * STEAL_T));
  const Setup &s = v.setup;
  const bool sweep = s.dedisp == kNone && s.dm > 0;
  const double m = P[p::jitter];
  for (int i = 0; i < n; i++) {
    // the share of each sub-band the pulses reach: in from the top of the band as the pulsar
    // switches on, out the same way as it switches off
    double tl, tr;
    if (v.stolen) { tl = tr = 0; }
    else {
      tl = sweep ? arrived(s, 0, v.t) : (v.t >= 0 ? 1 : 0);
      tr = sweep ? arrived(s, 1, v.t) : tl;
      if (!v.held && v.tOff >= 0) {
        const double u = v.t - v.tOff;
        tl = std::min(tl, 1 - (sweep ? arrived(s, 0, u) : 1.0));
        tr = std::min(tr, 1 - (sweep ? arrived(s, 1, u) : 1.0));
      }
    }
    v.envL += (tl - v.envL) * (v.stolen ? ks : v.kL);
    v.envR += (tr - v.envR) * (v.stolen ? ks : v.kR);
    // a new turn: the next pulse's brightness, log-normal with the modulation index, less as the
    // smear averages several pulses together
    v.phase += v.inc;
    if (v.phase >= 1) {
      v.phase -= 1;
      v.aPrev = v.aNext;
      if (m > 0) {
        const Tables &t = v.tab[v.cur];
        const double turn = 1 / s.f, me = m * std::sqrt(turn / (turn + t.smear));
        const double sg2 = std::log(1 + me * me);
        v.aNext = std::min(std::exp(std::sqrt(sg2) * rng.gauss() - 0.5 * sg2), BRIGHTEST);
      } else v.aNext = 1;
    }
    const double a = v.aPrev + (v.aNext - v.aPrev) * v.phase;
    // the turn's tables, crossfaded to a rebuilt one
    const Tables &t = v.tab[v.cur];
    double x = v.phase * t.n;
    int j = std::min((int)x, t.n - 1);
    double fr = x - j;
    double yl = t.L[j] + fr * (t.L[j + 1] - t.L[j]), yr = t.R[j] + fr * (t.R[j + 1] - t.R[j]);
    double dl = t.dcL, dr = t.dcR;
    if (v.xf > 0) {
      const Tables &u = v.tab[1 - v.cur];
      x = v.phase * u.n; j = std::min((int)x, u.n - 1); fr = x - j;
      const double w = (double)v.xf / REBUILD;
      yl = w * yl + (1 - w) * (u.L[j] + fr * (u.L[j + 1] - u.L[j]));
      yr = w * yr + (1 - w) * (u.R[j] + fr * (u.R[j + 1] - u.R[j]));
      dl = w * dl + (1 - w) * u.dcL; dr = w * dr + (1 - w) * u.dcR;
      if (--v.xf == 0) v.cur = 1 - v.cur;
    }
    // the power less its long-run mean (the receiver's baseline): a bright pulse rises above it,
    // a faint one leaves a dip
    if (v.lgStep != 0) { v.lg += v.lgStep; if (v.lg <= 0) { v.lg = 0; v.lgStep = 0; if (v.tOff < 0) v.tOff = v.t; } }
    const double g = OUT * v.vel * v.lg;
    L[i] = (float)(L[i] + g * v.envL * (a * yl + (a - 1) * dl));
    R[i] = (float)(R[i] + g * v.envR * (a * yr + (a - 1) * dr));
    v.t += dt;
  }
}

void PulsarsEngine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  int i = 0;
  while (i < n) {
    const int seg = std::min(n - i, REBUILD - (int)(clock % REBUILD));
    for (Voice &v : voices) run(v, L + i, R + i, seg);
    clock += seg; i += seg;
    if (clock % REBUILD == 0 && !voices.empty()) {
      // one sounding pulsar whose setup has changed (a knob, the mod wheel, its own DM) gets a new
      // table, crossfaded in over the next REBUILD samples
      const int nv = (int)voices.size();
      for (int c = 0; c < nv; c++) {
        Voice &v = voices[(nextCheck + c) % nv];
        if (v.stolen || v.xf > 0) continue;
        const Setup s = setupOf(v.key, P.data(), desiredDm(v));
        if (s == v.setup) continue;
        v.setup = s;
        fill(v, 1 - v.cur);
        startXf(v);
        nextCheck = (nextCheck + c + 1) % nv;
        break;
      }
    }
  }
  // finished voices give their tables back
  for (Voice &v : voices) {
    const bool gone = (v.stolen || !v.held) && v.envL < SILENT && v.envR < SILENT &&
                      (v.stolen || (v.setup.dedisp != kNone || v.setup.dm <= 0 ? true : arrived(v.setup, 1, v.t - v.tOff) >= 1));
    if (gone) { used[v.slot] = false; v.slot = -2; }
  }
  std::erase_if(voices, [](const Voice &v) { return v.slot == -2; });
}

} // namespace forte::pulsars
