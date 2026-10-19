// pyrophone-engine.cpp — the pyrophone's engine (pyrophone-engine.h).

#include "pyrophone-engine.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/fdlibm.h"

namespace forte::pyrophone {

namespace fd = forte::fdlibm;
namespace {
constexpr double TAU = 2 * std::numbers::pi;
constexpr double OUT = 0.045;        // output scale: a forte note peaks ≈ 0.2–0.4
constexpr double F_TURB = 300;       // Hz, corner of the flame's turbulence spectrum
constexpr double SEP = 0.012;        // s, time for the flames to part or rejoin
constexpr double POST_EVERY = 0.016; // s, view updates
constexpr double PRESS = 0.25;       // aftertouch: full pressure parts the flames 25 % further
constexpr double PUFF = 3;           // extra turbulence just after the flames part (× velocity)
constexpr double SINGING = 0.1;      // rms flow at the flame above which a tube counts as singing
constexpr double BEND_TAU = 0.02;    // s, the pitch wheel's glide (the gas's sound speed follows per block)
constexpr double SQRT2 = std::numbers::sqrt2;

double jsRound(double x) { return std::floor(x + 0.5); } // Math.round
double keyFreqJS(int m) { return 440 * fd::pow(2.0, (m - 69) / 12.0); }
TubeParams tubeOf(const double *P) { return {P[p::bore], P[p::damp], P[p::xf], P[p::lag]}; }
} // namespace

// ---- a tube ------------------------------------------------------------------------------------
void PyrophoneEngine::Voice::init(PyrophoneEngine &eng, int k) {
  *this = Voice();
  key = k; id = ++eng.serial;
  const double pp = std::max(-1.0, std::min(1.0, (2.0 * (key - 48)) / (84 - 48) - 1)) * 0.6, a = ((pp + 1) * std::numbers::pi) / 4; // keyPan(key, 0.6, 48, 84)
  panL = fd::cos(a); panR = fd::sin(a);
  theta = eng.coolTheta(key);
}

// Tube length from the tuning: the steady limit cycle (at this β) lands on the key's frequency
// when the gas is fully warm, f = W c_hot / (2π L): the key's note in the keyboard's tuning.
void PyrophoneEngine::Voice::tune(const PyrophoneEngine &eng, double b) {
  const double *P = eng.P.data();
  W = eng.tune->W(P[p::autotune] != 0 ? b : betaOn(P[p::flame], 0.7, eng.tune->betaH, eng.tune->betaMax));
  hHot = (TAU * (keyFreqJS(key) * eng.keys.ratio(key))) / (W * eng.fs); // L/c_hot units per sample
  // the modes a sample can hold: below 0.45 fs with the wheel bent all the way up (every mode of
  // the keys up to C6; at C8 four or five)
  int n = 1;
  while (n < N_MODES && eng.sys.w[n] * hHot * fd::pow(2.0, kBendSemitones / 12) < 0.9 * std::numbers::pi) n++;
  if (n != N) { // a re-cut tube that gains or loses a mode: those start at rest, every coefficient anew
    for (int j = std::min(n, N); j < N_MODES; j++) { eta[j] = 0; vel[j] = 0; }
    N = n; xf = -1; dBore = NAN;
  }
}

void PyrophoneEngine::Voice::coeffs(const PyrophoneEngine &eng) {
  const double *P = eng.P.data();
  const Tube &sys = eng.sys;
  if (xf != P[p::xf]) {
    xf = P[p::xf];
    const double a = P[p::listen], norm = 1 / (1 + a);
    for (int j = 0; j < N; j++) {
      cf[j] = sys.cf[j]; g[j] = sys.g[j];
      // radiated pressure ∝ d/dt[u(1) − a·u(0)]: top mouth plus (a ×) the bottom mouth
      wo[j] = ((j % 2 ? 1 : -1) - a) * norm;
    }
  }
  // gas temperature → sound speed → this tube's time step
  const double T = T_HOT - P[p::drift] * (1 - theta), hNew = hHot * std::sqrt(T / T_HOT) * eng.bendNow;
  if (hNew != h || dBore != eng.tp.bore || dDamp != eng.tp.damp) {
    h = hNew; dBore = eng.tp.bore; dDamp = eng.tp.damp;
    for (int j = 0; j < N; j++) {
      // c = cos(ω_d h), sn = sin(ω_d h)/ω_d with ω_d² = ω² − (ζ/2)²; for an overdamped mode the
      // same with cosh and sinh, and at the boundary their common limit (series in ω_d²h²)
      const double w0 = sys.w[j], s = sys.zeta[j] / 2, d2 = w0 * w0 - s * s, x2 = d2 * h * h;
      double c, sn;
      if (x2 > 1e-4) { const double wd = std::sqrt(d2); c = fd::cos(wd * h); sn = fd::sin(wd * h) / wd; }
      else if (x2 < -1e-4) { const double wd = std::sqrt(-d2); c = std::cosh(wd * h); sn = std::sinh(wd * h) / wd; }
      else { c = 1 - (x2 / 2) * (1 - x2 / 12); sn = h * (1 - (x2 / 6) * (1 - x2 / 20)); }
      const double e = fd::exp(-s * h);
      m11[j] = e * (c + s * sn); m12[j] = e * sn;
      m21[j] = -e * w0 * w0 * sn; m22[j] = e * (c - s * sn);
      b1[j] = (1 - m11[j]) / (w0 * w0);
    }
  }
  d = std::min((double)(HIST - 4), std::max(0.0, P[p::lag] / h - 0.5));
}

void PyrophoneEngine::Voice::render(PyrophoneEngine &eng, float *L, float *R, int n) {
  constexpr int mask = HIST - 1;
  const int di = (int)std::floor(d);
  const double fr = d - di;
  // turbulence rms; parting the flames stirs the gas: a puff that settles in ~40 ms
  const double puff = 1 + PUFF * (keyDown ? vel0 : 0) * fd::exp(-since / 0.04);
  const double kb = eng.kSep, eps = eng.P[p::noise] * eng.turbNorm * puff, kt = eng.kTurb;
  const double iW2 = 1 / (W * W), c1 = std::fabs(cf[0]);
  const double og = OUT * gain;
  double b = beta, tb = turb, g1 = 1, pk = 0, uf2 = 0;
  uint32_t s = eng.seed;
  int w = hw, f = fade;
  for (int i = 0; i < n; i++) {
    b += kb * (betaT - b);
    // flame velocity now, and as the flame felt it τ ago
    double uf = 0;
    for (int j = 0; j < N; j++) uf += cf[j] * eta[j];
    hist[w] = uf; w = (w + 1) & mask; uf2 += uf * uf;
    const double ha = hist[(w - 1 - di) & mask], hb = hist[(w - 2 - di) & mask];
    // turbulence at the flame: low-passed white noise, rms = noise (× mean draught)
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    tb += kt * ((int32_t)s / 2147483648.0 - tb);
    const double q = b * heat(ha + fr * (hb - ha) + eps * tb);
    double y = 0;
    for (int j = 0; j < N; j++) {
      const double F = g[j] * q, e = eta[j], v = vel[j];
      eta[j] = m11[j] * e + m12[j] * v + b1[j] * F;
      const double vn = m21[j] * e + m22[j] * v + m12[j] * F;
      vel[j] = vn; y += wo[j] * vn;
    }
    if (f > 0) { g1 = std::max(0.0, 1 - (double)f / eng.fadeLen); f++; }
    const double out = og * g1 * y;
    L[i] += panL * out; R[i] += panR * out;
    // mode-1 amplitude at the flame (the bifurcation diagram's y axis)
    const double e1 = eta[0], v1 = vel[0], a = c1 * std::sqrt(e1 * e1 + v1 * v1 * iW2);
    if (a > pk) pk = a;
    if (watch) observe(e1, v1);
  }
  hw = w; beta = b; turb = tb; eng.seed = s; fade = f;
  amp = std::sqrt(eta[0] * eta[0] + vel[0] * vel[0] * iW2) * c1;
  amp2 = std::sqrt(eta[1] * eta[1] + vel[1] * vel[1] * iW2 * 0.25) * std::fabs(cf[1]);
  peak = pk; song = std::sqrt(uf2 / n); // rms flow at the flame, whatever mode sings
  if (fade >= eng.fadeLen) dead = true;
  if (!std::isfinite(amp)) { dead = true; eta.fill(0); vel.fill(0); hist.fill(0); }
}

// Strobe: snapshot the modes at a phase that advances by 1/48 cycle per view frame (a slow-motion
// picture of the real cycle), and keep a trail of mode 1.
void PyrophoneEngine::Voice::observe(double e1, double v1) {
  sinceZ++;
  if (prevE1 < 0 && e1 >= 0) {
    if (sinceZ > 4) period = 0.8 * period + 0.2 * sinceZ;
    sinceZ = 0;
    if (wantSnap) { snapAt = (int)jsRound(strobe * period); wantSnap = false; }
  }
  prevE1 = e1;
  if (sinceZ == snapAt) {
    for (int j = 0; j < N; j++) { snap[j] = (float)eta[j]; snap[N + j] = (float)vel[j]; }
    snapAt = -1; snapped = true; strobe = std::fmod(strobe + 1.0 / 48, 1.0);
  }
  if (++tcount >= tdec) {
    tcount = 0;
    trail[ti] = (float)e1; trail[ti + 1] = (float)(v1 / W); ti = (ti + 2) % TRAIL;
    if (tnew < TRAIL / 2) tnew++;
  }
}

// ---- the engine ----------------------------------------------------------------------------------
PyrophoneEngine::PyrophoneEngine(double fs)
    : Engine(fs), kSep(1 - fd::exp(-1 / (SEP * fs))), kTurb(1 - fd::exp((-TAU * F_TURB) / fs)),
      // uniform(−1,1) has rms 1/√3; a one-pole with coefficient k keeps k/(2−k) of the variance
      turbNorm(std::sqrt(3 * (2 - kTurb) / kTurb)), fadeLen((int)jsRound(0.03 * fs)),
      data([this](int, uint64_t v) { return build(v); }) {}

// On the worker (in place without threads): the tuning table for the tube of `version`.
std::unique_ptr<Tuning> PyrophoneEngine::build(uint64_t v) {
  const auto &snap = snapshots[v % snapshots.size()];
  const TubeParams t = {snap[0].load(), snap[1].load(), snap[2].load(), snap[3].load()};
#if !FORTE_THREADS
  if (hasOffered && offered.P == t) return std::make_unique<Tuning>(offered);
#endif
  return std::make_unique<Tuning>(tuning(t));
}

bool PyrophoneEngine::offer(const double *a, int n) {
#if FORTE_THREADS
  (void)a; (void)n;
  return false;
#else
  if (n != 10 + TUNE_N) return false;
  offered.P = {a[0], a[1], a[2], a[3]};
  offered.betaH = a[4]; offered.betaMax = a[5]; offered.mode = (int)a[6]; offered.fold = a[7];
  offered.b0 = a[8]; offered.db = a[9];
  for (int i = 0; i < TUNE_N; i++) offered.Ws[i] = a[10 + i];
  hasOffered = pageTables = true;
  return true;
#endif
}

// The table the tubes are cut from: the current tube's once it is in, the last one until then
// (null before the first).
const Tuning *PyrophoneEngine::current() {
  if (tune && tuneVersion == version) return tune;
#if !FORTE_THREADS
  // a page that offers its tables keeps the last one until the new one arrives
  if (pageTables && tune && !(hasOffered && offered.P == tp)) return tune;
#endif
  const Data::Ref r = data.get(0, version);
  if (!r) return tune;
  data.release(tuneRef);
  data.acquire(r);
  tuneRef = r; tune = r.data; tuneVersion = version;
  retune();
  return tune;
}
// held keys follow the flame power (and the threshold); released ones the key-up power
void PyrophoneEngine::retune() {
  for (int i = 0; i < nVoices; i++) { Voice &v = *voices[i]; v.betaT = v.keyDown ? betaDown(v.vel0, v.press) : betaUp(); }
}

// flames apart: K β_H (0.4 + 0.6 v); aftertouch parts them up to 25 % further (below the scream)
double PyrophoneEngine::betaDown(double vel, double press) {
  const double b = bH();
  return std::min(betaMax(), betaOn(P[p::flame], vel, b, betaMax()) * (1 + PRESS * press));
}

double PyrophoneEngine::coolTheta(int key) const { // the tube's warmth, cooled since it last sounded
  return warm[key] * fd::exp(-(time - warmAt[key]) / (P[p::warm] * fs));
}

void PyrophoneEngine::setParams(const double *p) {
  const bool first = !hasParams;
  const double listen = P[p::listen];
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
  keys = tuningOf(P.data()); // (new tubes are cut to it; a singing tube keeps its length, as for its other parameters)
  const TubeParams t = tubeOf(P.data());
  if (first || !(t == tp)) {
    tp = t;
    sys = tube(t);
    version++;
    auto &snap = snapshots[version % snapshots.size()];
    snap[0].store(t.bore); snap[1].store(t.damp); snap[2].store(t.xf); snap[3].store(t.lag);
    data.prepare(version, 0, 0, 0);
  }
  if (!first && listen != P[p::listen]) for (int i = 0; i < nVoices; i++) voices[i]->xf = -1;
  retune();
}

void PyrophoneEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < 0 || key > 127) return;
  if (!current()) { // the first table is being built (a few tens of ms): the note waits for it
    for (int i = 0; i < nPending; i++) if (pending[i].key == key) { pending[i] = {key, velocity, false}; return; }
    if (nPending < (int)pending.size()) pending[nPending++] = {key, velocity, false};
    return;
  }
  start(key, velocity);
}

void PyrophoneEngine::start(int key, double velocity) {
  Voice *v = nullptr;
  for (int i = 0; i < nVoices; i++) if (voices[i]->key == key && !voices[i]->fade) { v = voices[i]; break; }
  const double b = betaOn(P[p::flame], velocity, bH(), betaMax());
  if (!v) {
    if (nVoices >= MAXV) steal();
    for (Voice &x : pool) {
      bool used = false;
      for (int i = 0; i < nVoices && !used; i++) used = voices[i] == &x;
      if (!used) { v = &x; break; }
    }
    if (!v) return; // every tube of the pool sounds or fades
    v->init(*this, key);
    v->tune(*this, b);
    voices[nVoices++] = v;
  } else if (v->amp < 0.02) v->tune(*this, b); // a silent tube may be re-cut; a singing one keeps its length
  v->vel0 = velocity; v->press = pressure_; v->since = 0;
  v->keyDown = true;
  v->betaT = betaDown(velocity, v->press);
  focus = key;
}

void PyrophoneEngine::noteOff(int key, double) {
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) pending[i].off = true;
  for (int i = 0; i < nVoices; i++) {
    Voice &v = *voices[i];
    if (v.key == key && v.keyDown) { v.keyDown = false; v.betaT = betaUp(); v.rel = 0; v.chkT = 0; v.chkA = INFINITY; }
  }
}

void PyrophoneEngine::steal() {
  Voice *best = nullptr;
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    if (!v->fade && (!best || (!v->keyDown && best->keyDown) || (v->keyDown == best->keyDown && v->amp < best->amp))) best = v;
  }
  if (best) best->fade = 1;
}

void PyrophoneEngine::store(const Voice &v) { warm[v.key] = v.theta; warmAt[v.key] = time; }

void PyrophoneEngine::bend(double value) {
  bendTo = fd::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12);
}

void PyrophoneEngine::allNotesOff() {
  for (int i = 0; i < nVoices; i++) store(*voices[i]);
  nVoices = 0; nPending = 0;
}

void PyrophoneEngine::pressure(double value, int key) { // aftertouch: lean on a key to part its flames further
  if (key < 0) pressure_ = value;
  for (int i = 0; i < nVoices; i++) {
    Voice &v = *voices[i];
    if (v.keyDown && (key < 0 || key == v.key)) { v.press = value; v.betaT = betaDown(v.vel0, value); }
  }
}

void PyrophoneEngine::process(float *L, float *R, int n) {
  std::fill(L, L + n, 0.0f);
  std::fill(R, R + n, 0.0f);
  if (!hasParams) return;
#if FORTE_THREADS
  if (tuneVersion != version) current(); // a new table from the worker
  if (nPending && tune) { // notes that waited for the first table
    const int k = nPending;
    nPending = 0;
    for (int i = 0; i < k; i++) { start(pending[i].key, pending[i].velocity); if (pending[i].off) noteOff(pending[i].key, -1); }
  }
#endif
  const double dt = n / fs, kw = 1 - fd::exp(-dt / P[p::warm]);
  bendNow += (bendTo - bendNow) * (1 - fd::exp(-dt / BEND_TAU));
  if (std::fabs(bendNow - bendTo) < 1e-9) bendNow = bendTo;
  for (int i = 0; i < nVoices; i++) {
    Voice &v = *voices[i];
    // warm-up: the gas heats while the flames are apart or the tube sings (a tube that remembers
    // its note after release stays hot, and in tune), and cools once it is silent
    v.theta += kw * ((v.keyDown || v.song > SINGING ? 1 : 0) - v.theta);
    v.watch = v.key == focus;
    v.coeffs(*this);
    v.render(*this, L, R, n);
    v.age += dt; v.since += dt; v.rel += dt;
    // A released tube that has stopped singing fades out and is freed: once it is inaudible, or
    // once it is quiet and no longer dying away (only the flames' breath is left).
    if (!v.keyDown && !v.fade) {
      const double a = SQRT2 * v.song;
      if (a < 1e-3) v.fade = 1;
      else if (v.rel > 0.25 && a < 0.05 && v.rel - v.chkT > 0.1) {
        if (a > 0.8 * v.chkA) v.fade = 1;
        v.chkT = v.rel; v.chkA = a;
      }
    }
  }
  time += n;
  int k = 0;
  for (int i = 0; i < nVoices; i++) {
    if (voices[i]->dead) store(*voices[i]);
    else voices[k++] = voices[i];
  }
  nVoices = k;
  data.audioCycle();
  sincePost += dt;
  if (messages && sincePost >= POST_EVERY) { sincePost = 0; report(); }
}

// Live data for the page: every tube's operating point, and the focused tube's strobed mode
// snapshot and mode-1 trail.
void PyrophoneEngine::report() {
  Message m;
  for (int i = 0; i < nVoices; i++) {
    const Voice &v = *voices[i];
    m.type = msg::tube; m.key = (int16_t)v.key; m.count = 5;
    const double x[5] = {v.beta, v.amp, v.amp2, v.keyDown ? 1.0 : 0.0, v.theta};
    for (int j = 0; j < 5; j++) m.values[j] = (float)x[j];
    post(m);
  }
  Voice *f = nullptr;
  for (int i = 0; i < nVoices; i++) if (voices[i]->key == focus && !voices[i]->fade) { f = voices[i]; break; }
  if (f) {
    f->wantSnap = true;
    f->tdec = std::max(1, (int)jsRound(f->period / 48));
    // the trail written since the last report (all of it for a newly focused tube)
    int count = f->id == shownFocus ? f->tnew : TRAIL / 2;
    shownFocus = f->id; f->tnew = 0;
    int at = ((f->ti - 2 * count) % TRAIL + TRAIL) % TRAIL;
    while (count > 0) {
      const int pairs = std::min(count, 14);
      m.type = msg::trail; m.key = (int16_t)f->key; m.count = (uint16_t)(1 + 2 * pairs);
      m.values[0] = (float)at;
      for (int j = 0; j < 2 * pairs; j++) m.values[1 + j] = f->trail[(at + j) % TRAIL];
      post(m);
      at = (at + 2 * pairs) % TRAIL; count -= pairs;
    }
    const double T = T_HOT - P[p::drift] * (1 - f->theta);
    m.type = msg::focus; m.key = (int16_t)f->key; m.count = 9 + 2 * N_MODES;
    const double x[9] = {f->W, f->beta, f->amp, f->theta, T, 1200 * std::log2(std::sqrt(T / T_HOT)), f->period / fs, (double)f->ti, f->snapped ? 1.0 : 0.0};
    for (int j = 0; j < 9; j++) m.values[j] = (float)x[j];
    for (int j = 0; j < 2 * N_MODES; j++) m.values[9 + j] = f->snap[j];
    post(m);
    f->snapped = false;
  }
  m.type = msg::end; m.key = -1; m.count = 1; m.values[0] = (float)nVoices;
  post(m);
}

} // namespace forte::pyrophone
