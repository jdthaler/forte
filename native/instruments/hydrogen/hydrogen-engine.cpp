// hydrogen-engine.cpp — the Hydrogen Lamp's engine (hydrogen-engine.h).

#include "hydrogen-engine.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/dsp.h"
#include "forte/fdlibm.h"

namespace forte::hydrogen {

constexpr double PI = std::numbers::pi;
constexpr double OUT = 0.15;       // a voice's gain at full velocity: its steady rms is OUT/√2
constexpr double BEND_T = 0.02;    // s: how fast a bend glides
constexpr double MERGE_HZ = 0.02;  // a line's fine structure narrower than this is played as one tone
constexpr double REACH = 1e-3;     // the spectrometer turns its gain up at most √(1/REACH) (30 dB)
constexpr int REPORT = 1536;       // samples between the page's reports
constexpr double SHUTTER_OPEN = 29.95; // s: the Shutter knob all the way up leaves it open

// The spectrometer's window, by wavelength (nm), its edges soft over ±1.5 %.
static double edge(double x, double at) { // 0 below at, 1 above, over ±1.5 % in ln λ
  const double u = (std::log(x / at) / 0.015 + 1) / 2;
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return u * u * (3 - 2 * u);
}
static double windowGain(int window, double nm) {
  switch (window) {
    case window_::visible: return edge(nm, 380) * (1 - edge(nm, 750));
    case window_::ultraviolet: return 1 - edge(nm, 380);
    case window_::infrared: return edge(nm, 750);
    default: return 1;
  }
}

HydrogenEngine::HydrogenEngine(double fs) : Engine(fs) {
  voices.resize(kMaxVoices + 8);
  int lines = 0;
  for (int k = 0; k < GASES; k++) lines = std::max(lines, gasOf((GasKind)k).lines);
  lineSum.assign(lines, 0);
}

int HydrogenEngine::lampChanged() {
  const Lamp lamp = lampOf(P.data());
  if (glows[live].ready() && glows[live].lamp == lamp) return -1;
  // a slot no voice still plays from, or else the one fewest do (they move to the new glow)
  int use = -1, fewest = 1 << 30;
  for (int g = 0; g < (int)glows.size(); g++) {
    if (g == live && glows[g].ready()) continue;
    int n = 0;
    for (const Voice &v : voices) n += v.active && v.glow == g;
    if (n < fewest) { fewest = n; use = g; }
  }
  glows[use].build(lamp);
  live = use;
  return fewest > 0 ? use : -1;
}

void HydrogenEngine::setParams(const double *p) {
  bool rebuild = !hasParams;
  for (int i = 0; i < p::count; i++) {
    if (P[i] != p[i] && (i == p::window || i == p::alphaScale || i == p::slowmo || i == p::temperature)) rebuild = true;
    P[i] = p[i];
  }
  hasParams = true;
  const int moved = lampChanged();
  for (Glow &g : glows) if (g.ready()) g.tune(P[p::alphaScale]);
  if (rebuild || moved >= 0) for (Voice &v : voices) if (v.active) light(v, -1);
}

void HydrogenEngine::bend(double value) { wheel = fdlibm::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12); }

int HydrogenEngine::voiceCount() const {
  int n = 0;
  for (const Voice &v : voices) n += v.active;
  return n;
}

int HydrogenEngine::oscillatorsOf(int key) const {
  for (const Voice &v : voices) if (v.active && v.key == key && v.lit) return v.count;
  return -1;
}

double HydrogenEngine::gainOf(int key) const {
  for (const Voice &v : voices) if (v.active && v.key == key && v.lit) return v.gain;
  return 0;
}

// The voice's lines: every kept line of its glow within hearing, through the window, played as one
// tone or, where its fine structure is wider than MERGE_HZ, as its components; the strongest
// MAX_OSC of them (fewer at lower Quality). velocity < 0: the voice is sounding already, and its
// lines carry on (a change of window, α or slow motion).
void HydrogenEngine::light(Voice &v, double velocity) {
  const Glow &g = glows[v.glow];
  const bool fresh = velocity >= 0;
  const int cap = pick(MAX_OSC, 40, 16), window = (int)P[p::window];
  const double top = std::min(20000.0, 0.45 * fs), b = v.bendNow;
  v.fKey = keyFreq(v.key) * tuningOf(P.data()).ratio(v.key);
  struct Cand { double score; int kept, comp; double ratio, weight; };
  std::array<Cand, MAX_OSC> best;
  int nb = 0;
  auto offer = [&](const Cand &c) { // keep the `cap` strongest (a small min-heap)
    auto less = [](const Cand &x, const Cand &y) { return x.score > y.score; };
    if (nb < cap) { best[nb++] = c; std::push_heap(best.begin(), best.begin() + nb, less); }
    else if (c.score > best[0].score) { std::pop_heap(best.begin(), best.begin() + nb, less); best[nb - 1] = c; std::push_heap(best.begin(), best.begin() + nb, less); }
  };
  double all = 0, seen = 0;
  for (size_t j = 0; j < g.kept.size(); j++) {
    const Line &L = g.gas->line[g.kept[j]];
    const double f = v.fKey * L.ratio * b;
    if (f < 16 || f > top) continue;
    const double W = windowGain(window, L.nm / b);
    all += g.steadyPower[j];
    seen += g.steadyPower[j] * W;
    if (!(W > 0)) continue;
    const Component *c = &g.comps[g.compStart[j]];
    const int nc = g.compStart[j + 1] - g.compStart[j];
    double lo = INFINITY, hi = -INFINITY, mean = 0;
    for (int i = 0; i < nc; i++) { lo = std::min(lo, c[i].ratio); hi = std::max(hi, c[i].ratio); mean += c[i].weight * c[i].ratio; }
    if (nc <= 1 || (hi - lo) * v.fKey < MERGE_HZ) offer({g.steadyPower[j] * W, (int)j, -1, mean, 1});
    else for (int i = 0; i < nc; i++) if (c[i].weight > 1e-3) offer({g.steadyPower[j] * W * c[i].weight, (int)j, i, c[i].ratio, c[i].weight});
  }
  std::sort(best.begin(), best.begin() + nb, [](const Cand &x, const Cand &y) { return x.score > y.score; });
  // carry the old tones over where the same line (or component) is still played
  std::array<Osc, MAX_OSC> old;
  const int oldCount = fresh ? 0 : v.count;
  for (int i = 0; i < oldCount; i++) old[i] = v.osc[i];
  v.count = nb;
  v.peak = 0;
  for (int i = 0; i < nb; i++) {
    const Cand &c = best[i];
    const int line = g.kept[c.kept];
    const Line &L = g.gas->line[line];
    Osc o;
    int same = -1;
    for (int k = 0; k < oldCount && same < 0; k++) if (old[k].line == line && std::fabs(old[k].ratio - c.ratio) < 1e-12) same = k;
    if (same >= 0) o = old[same];
    else {
      const double ph = 2 * PI * rng.uniform(), pa = 2 * PI * rng.uniform();
      o.zr = fdlibm::cos(ph); o.zi = fdlibm::sin(ph);
      o.ar = fdlibm::cos(pa); o.ai = fdlibm::sin(pa);
      o.br = o.bi = o.dr = o.di = 0;
    }
    o.kept = c.kept; o.line = line; o.weight = c.weight; o.ratio = c.ratio;
    o.lambda = L.nm;
    o.nat = g.width[c.kept];
    o.stark = L.stark;
    o.de = L.de; o.su = L.su; o.sl = L.sl; o.gu = L.gu; o.gl = L.gl;
    o.clock = g.clockOf[c.kept];
    v.osc[i] = o;
    v.peak += c.score;
  }
  if (fresh) v.gain = all > 0 ? OUT * velocity / std::sqrt(std::max(seen, REACH * all)) : 0;
  else if (all > 0 && v.gain > 0) {
    // keep the velocity the voice was struck with, the normalisation of the new window
    v.gain = v.gain * std::sqrt(std::max(v.peakNorm, 1e-300)) / std::sqrt(std::max(seen, REACH * all));
  }
  v.peakNorm = std::max(seen, REACH * all);
  retune(v, b);
  v.density = -1;
  widths(v);
}

// Each tone's turn a sample at bend b, and the window's gain at its wavelength.
void HydrogenEngine::retune(Voice &v, double b) {
  const int window = (int)P[p::window];
  for (int i = 0; i < v.count; i++) {
    Osc &o = v.osc[i];
    const double w = 2 * PI * v.fKey * o.ratio * b / fs;
    o.cr = fdlibm::cos(w); o.ci = fdlibm::sin(w);
    o.win = windowGain(window, o.lambda / b);
  }
}

// Each line's width (Hz) in the sound: its levels' decay in slow motion, and the atoms' Doppler
// shifts and the ions' Stark fields in proportion to its frequency.
void HydrogenEngine::widths(Voice &v) {
  const double d = expr.slideOr(v.key, P[p::density]) * v.current; // more current, more ions: their Stark fields broaden the lines
  if (d == v.density) return;
  v.density = d;
  const Gas &a = *glows[v.glow].gas;
  const double F0 = 2.603 * std::pow(d * A0_CM * A0_CM * A0_CM, 2.0 / 3), dop = dopplerWidth(P[p::temperature], a.mass);
  for (int i = 0; i < v.count; i++) {
    Osc &o = v.osc[i];
    const double f = v.fKey * o.ratio * v.bendNow;
    double w = o.nat / (o.clock ? P[p::slowmo] * SLOW_CLOCK : P[p::slowmo]);
    if (o.de > 0) {
      // each level's Stark width: linear where its neighbours are nearer than its shift, else quadratic
      const double u = o.su * F0, l = o.sl * F0;
      const double stark = (u * (o.gu > u ? u / o.gu : 1) + l * (o.gl > l ? l / o.gl : 1)) / o.de;
      w += (dop + stark) * f;
    } else w += (dop + o.stark * F0) * f;
    o.rho = std::exp(-PI * w * SUB / fs);
  }
}

void HydrogenEngine::setSustain(bool on) {
  sustain = on;
  if (!on) for (Voice &v : voices) if (v.active && v.lit && !v.held) { v.lit = false; v.tOff = v.t; }
}

void HydrogenEngine::allNotesOff() {
  for (Voice &v : voices) v.active = false;
}

void HydrogenEngine::noteOn(int key, double velocity) {
  if (!hasParams) return;
  // Quality: past 32 lamps at High, 16 at Medium and 8 at Low, the oldest goes out (at once)
  int on = 0;
  Voice *oldest = nullptr, *slot = nullptr;
  for (Voice &v : voices) {
    if (!v.active) { if (!slot) slot = &v; continue; }
    on++;
    if (!oldest || (v.lit < oldest->lit) || (v.lit == oldest->lit && v.age < oldest->age)) oldest = &v;
  }
  if (oldest && on >= pick(kMaxVoices, 16, 8)) { oldest->active = false; if (!slot) slot = oldest; }
  if (!slot) return;
  Voice &v = *slot;
  v.active = true; v.held = true; v.lit = true; v.current = 1; press.reset(key);
  v.key = key; v.age = clock++; v.glow = live;
  v.t = 0; v.tOff = -1; v.shut = 1; v.liftK = 1;
  v.bendNow = wheel * expr.bendOf(key);
  v.peakNorm = 0;
  std::tie(v.gl, v.gr) = keyPan(key);
  light(v, velocity);
}

// Lift: the afterglow when the discharge stops: a slow lift draws it out (up to four times as
// long), a fast one cuts it short (a quarter).
void HydrogenEngine::noteOff(int key, double velocity) {
  const double s = liftScale(velocity);
  for (Voice &v : voices) {
    if (v.active && v.key == key && v.held) {
      v.held = false;
      if (!sustain && v.lit) { v.lit = false; v.tOff = v.t; v.liftK = s * s; }
    }
  }
}

// A voice's lines, SUB samples on: their powers from the glow's step response (on at the key,
// off at the release), the atoms' amplitudes a step of their random walk, and the gains each
// tone glides to over the next SUB samples.
void HydrogenEngine::update(Voice &v) {
  const Glow &g = glows[v.glow];
  v.t += SUB / fs / P[p::slowmo];
  const double b = glideTo(v.bendNow, wheel * expr.bendOf(v.key), SUB / fs, BEND_T);
  if (b != v.bendNow) { v.bendNow = b; retune(v, b); v.density = -1; }
  // Press: the lamp's discharge current, up to four times: as many more excitations (each line's
  // power with it) and ions
  v.current = glideTo(v.current, 1 + 3 * press.of(v.key), SUB / fs, PRESS_GLIDE);
  widths(v);
  const double nyq = 0.48 * fs;
  // each grid's row now, since the key and since its release (the slow ladder's clock runs
  // 1/SLOW_CLOCK times faster)
  double on[2] = {g.rowAt(v.t), -1}, off[2] = {v.tOff >= 0 ? g.rowAt((v.t - v.tOff) / v.liftK) : -1, -1};
  if (g.slow()) { on[1] = g.rowAt(v.t / SLOW_CLOCK, 1); off[1] = v.tOff >= 0 ? g.rowAt((v.t - v.tOff) / v.liftK / SLOW_CLOCK, 1) : -1; }
  // the shutter: −60 dB in its time once the lamp is out, unless it is all the way open
  if (!v.lit && P[p::shutter] < SHUTTER_OPEN) v.shut *= std::exp(-std::log(1000.0) * SUB / fs / P[p::shutter]);
  double sum = 0;
  for (int i = 0; i < v.count; i++) {
    Osc &o = v.osc[i];
    const double S = g.powerAtRow(o.kept, on[o.clock]) - g.powerAtRow(o.kept, off[o.clock]);
    const double Pw = std::max(0.0, S) * o.weight * o.win;
    sum += Pw;
    const double amp = v.fKey * o.ratio * b < nyq ? v.gain * v.shut * std::sqrt(Pw * v.current) : 0;
    const double s = std::sqrt(std::max(0.0, 1 - o.rho * o.rho) / 2);
    o.ar = o.rho * o.ar + s * rng.gauss();
    o.ai = o.rho * o.ai + s * rng.gauss();
    o.dr = (amp * o.ar - o.br) / SUB;
    o.di = (amp * o.ai - o.bi) / SUB;
    const double z = 1.5 - 0.5 * (o.zr * o.zr + o.zi * o.zi); // keep the phasor on the unit circle
    o.zr *= z; o.zi *= z;
  }
  // a released lamp is out when its light has fallen 60 dB, or its response has settled
  const bool settled = (v.t - v.tOff) / v.liftK > g.end() && (!g.slow() || (v.t - v.tOff) / v.liftK / SLOW_CLOCK > g.end(1));
  if (!v.lit && (sum * v.shut * v.shut < 1e-6 * v.peak || settled)) v.active = false;
}

void HydrogenEngine::report() {
  // the lines heard (each line's power summed over the voices), and the populations of the levels
  // the page's diagram shows (hydrogen's: every nl up to n = 7), of the lamps of today's gas
  std::fill(lineSum.begin(), lineSum.end(), 0.0);
  std::array<double, DISPLAY> pops{};
  bool any = false;
  const Gas &a = *glows[live].gas;
  for (const Voice &v : voices) {
    if (!v.active || glows[v.glow].gas != &a) continue;
    any = true;
    for (int i = 0; i < v.count; i++) {
      const Osc &o = v.osc[i];
      lineSum[o.line] += (o.br * o.br + o.bi * o.bi) / (o.ar * o.ar + o.ai * o.ai + 1e-30);
    }
    const Glow &g = glows[v.glow];
    for (int s = 0; s < (int)a.display.size(); s++) {
      double x = g.popAt(s, v.t, v.t / SLOW_CLOCK);
      if (v.tOff >= 0) x -= g.popAt(s, v.t - v.tOff, (v.t - v.tOff) / SLOW_CLOCK);
      pops[s] += v.gain * v.gain * v.shut * v.shut * std::max(0.0, x);
    }
  }
  Message m;
  m.type = 0;
  // the 28 strongest lines, as (line, power) pairs in two messages
  std::array<int, 28> top{};
  int nt = 0;
  for (int k = 0; k < a.lines; k++) {
    if (!(lineSum[k] > 0)) continue;
    if (nt < 28) { top[nt++] = k; continue; }
    int w = 0;
    for (int i = 1; i < 28; i++) if (lineSum[top[i]] < lineSum[top[w]]) w = i;
    if (lineSum[k] > lineSum[top[w]]) top[w] = k;
  }
  for (int part = 0; part < 2; part++) {
    m.type = 0; m.key = (int16_t)part; m.count = 0;
    for (int i = part * 14; i < std::min(nt, part * 14 + 14); i++) {
      m.values[m.count++] = (float)top[i];
      m.values[m.count++] = (float)lineSum[top[i]];
    }
    post(m);
  }
  m.type = 1; m.key = any ? 1 : 0; m.count = DISPLAY;
  for (int s = 0; s < DISPLAY; s++) m.values[s] = (float)pops[s];
  post(m);
}

void HydrogenEngine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasParams) return;
  // the step responses' rows as far as the voices have got (a few a block: they are shared)
  for (int gi = 0; gi < (int)glows.size(); gi++) {
    double age = 0;
    for (const Voice &v : voices) if (v.active && v.glow == gi) age = std::max(age, v.t + (SUB + n) / fs / P[p::slowmo]);
    if (age > 0) glows[gi].ensure(age, age / SLOW_CLOCK, 8);
  }
  double buf[SUB];
  int i = 0;
  while (i < n) {
    if (sub == 0) {
      for (Voice &v : voices) if (v.active) update(v);
      sub = SUB;
    }
    const int m = std::min(sub, n - i);
    for (Voice &v : voices) {
      if (!v.active) continue;
      for (int k = 0; k < m; k++) buf[k] = 0;
      int j = 0;
      // four tones at a time: their rotations are independent, so they run side by side
      for (; j + 4 <= v.count; j += 4) {
        Osc &a = v.osc[j], &b = v.osc[j + 1], &c = v.osc[j + 2], &d = v.osc[j + 3];
        double ar = a.zr, ai = a.zi, abr = a.br, abi = a.bi;
        double br = b.zr, bi = b.zi, bbr = b.br, bbi = b.bi;
        double cr = c.zr, ci = c.zi, cbr = c.br, cbi = c.bi;
        double dr = d.zr, di = d.zi, dbr = d.br, dbi = d.bi;
        for (int k = 0; k < m; k++) {
          double r = ar * a.cr - ai * a.ci; ai = ar * a.ci + ai * a.cr; ar = r;
          r = br * b.cr - bi * b.ci; bi = br * b.ci + bi * b.cr; br = r;
          r = cr * c.cr - ci * c.ci; ci = cr * c.ci + ci * c.cr; cr = r;
          r = dr * d.cr - di * d.ci; di = dr * d.ci + di * d.cr; dr = r;
          abr += a.dr; abi += a.di; bbr += b.dr; bbi += b.di;
          cbr += c.dr; cbi += c.di; dbr += d.dr; dbi += d.di;
          buf[k] += (abr * ar - abi * ai) + (bbr * br - bbi * bi) + (cbr * cr - cbi * ci) + (dbr * dr - dbi * di);
        }
        a.zr = ar; a.zi = ai; a.br = abr; a.bi = abi;
        b.zr = br; b.zi = bi; b.br = bbr; b.bi = bbi;
        c.zr = cr; c.zi = ci; c.br = cbr; c.bi = cbi;
        d.zr = dr; d.zi = di; d.br = dbr; d.bi = dbi;
      }
      for (; j < v.count; j++) {
        Osc &o = v.osc[j];
        double zr = o.zr, zi = o.zi, br = o.br, bi = o.bi;
        const double cr = o.cr, ci = o.ci, dr = o.dr, di = o.di;
        for (int k = 0; k < m; k++) {
          const double r = zr * cr - zi * ci;
          zi = zr * ci + zi * cr; zr = r;
          br += dr; bi += di;
          buf[k] += br * zr - bi * zi;
        }
        o.zr = zr; o.zi = zi; o.br = br; o.bi = bi;
      }
      for (int k = 0; k < m; k++) { L[i + k] += (float)(v.gl * buf[k]); R[i + k] += (float)(v.gr * buf[k]); }
    }
    sub -= m; i += m;
    reportIn -= m;
    if (reportIn <= 0 && messages) { report(); reportIn = REPORT; }
  }
}

} // namespace forte::hydrogen
