// harpsichord-engine.cpp — the harpsichord's engine (harpsichord-engine.h).

#include "harpsichord-engine.h"

#include <algorithm>
#include <cmath>
#include <memory>
#include <numbers>

namespace forte::harpsichord {

using std::numbers::pi;

constexpr double OUT = 0.06;            // board microphone units → output
constexpr double DRY = 0.05;            // bridge force (N) → output, with the soundboard off
// keys sounding at once: beyond maxVoices() (16 at High) the quietest released one fades, beyond
// hardVoices() (24) the quietest sounding one too (harpsichord-engine.h)
constexpr double KILL_SIGMA = 200;      // s⁻¹: a stolen or retuned voice dies away this fast
constexpr double QUIET = 4e-6;          // N: a string whose bridge force stays below this is put to sleep
constexpr double DROP = 1e-6;           // N: top partials below this stop being integrated
constexpr double RAMP = 0.02;           // s: the buff's leather and the soundboard switch glide over this
constexpr double KNOCK_COUPLING = 0.04; // share of a knock's impulse that reaches the board at the bridge
static const double FAST_FALL = fallSpeed(1);
constexpr int CHOIRS[3] = {FRONT, BACK, FOUR};

// ---- a voice: one key's strings and jacks --------------------------------------------------

void HarpsichordEngine::Voice::start(HarpsichordEngine &e, int k, Data::Ref r) {
  eng = &e; inUse = true; key = k; version = e.version; ref = r;
  e.data.acquire(r);
  has.fill(false); lifts.fill(false); sleep.fill(false); quiet.fill(0); nList = 0;
  lift = 0; V = 0.3; vDown = fallSpeed(DEFAULT_RELEASE); keyDown = false; pending = false;
  top = ACTION::top + rowGap(ROW_FOUR, e.mp);
  knockT = -1; knockAmp = 0; knockN = std::max(2, (int)std::floor(ACTION::knock * e.fs + 0.5));
  killing = false; dead = false; sounded = false; peak = 0; age = 0;
  kw = segmentWeights(k, BACK);
  for (auto &b : sb) b.fill(0);
  sbn = 0;
}

// Key down at velocity vel: arm the engaged plectra and send the jacks up.
void HarpsichordEngine::Voice::press(double vel) {
  const Params &P = eng->mp;
  const Registration reg = registration(P);
  const int m = key;
  V = jackSpeed(vel);
  for (int ch : CHOIRS) {
    const bool any = ch == BACK ? reg.rows[ROW_BACK] || reg.rows[ROW_LUTE] : reg.rows[ch]; // (front and 4′: their row's index is the choir's)
    lifts[ch] = reg.lift[ch];
    if (!any && !has[ch]) continue;
    PluckedString &st = strings[ch];
    if (!has[ch]) {
      buildString(st, m, ch, P, ref.data->S[ch], ref.data->parts[ch], eng->fs);
      st.limit(eng->kept(ref.data->parts[ch])); // (Quality: fewer partials)
      has[ch] = true;
      w[ch] = segmentWeights(m, ch);
      w0[ch] = -1; w1[ch] = -1;
      for (int s = 0; s < NSEG; s++) if (w[ch][s] > 0) { if (w0[ch] < 0) w0[ch] = s; w1[ch] = s; }
      sleep[ch] = false; quiet[ch] = 0;
      list[nList++] = ch;
    }
    st.wake(); sleep[ch] = false; quiet[ch] = 0;
    const int rows[2] = {ch, ROW_LUTE};
    for (int i = 0; i < (ch == BACK ? 2 : 1); i++) {
      const int row = rows[i], p = row == ROW_LUTE ? PT::LUTE : PT::MAIN;
      const bool on = reg.rows[row];
      const double gap = rowGap(row, P);
      if (on) { const Plectrum pl = plectrumFor(m, row, P); st.armPlectrum(p, &pl, pluckPoint(m, row, P), gap, true, lift - gap > 0); }
      else st.armPlectrum(p, nullptr, 0, gap, false, lift - gap > 0);
    }
    st.onRelease = &HarpsichordEngine::onRelease; st.ctx = this;
  }
  // a plectrum still above its string must come back under it first
  pending = false;
  for (int i = 0; i < nList; i++) { const PluckedString &st = strings[list[i]]; if (st.phase[0] == Phase::above || st.phase[1] == Phase::above) pending = true; }
  keyDown = !pending;
  knockT = -1;
}
void HarpsichordEngine::Voice::release(double r) { keyDown = false; pending = false; vDown = fallSpeed(r); }
void HarpsichordEngine::Voice::kill() {
  if (killing) return;
  killing = true; keyDown = false; pending = false;
  for (int i = 0; i < nList; i++) {
    const int ch = list[i];
    PluckedString &st = strings[ch];
    st.extra.fill(KILL_SIGMA); st.setDamping(st.extra.data()); st.phase[0] = st.phase[1] = Phase::off; st.wake(); sleep[ch] = false;
  }
}

void HarpsichordEngine::Voice::render(int n) {
  HarpsichordEngine &e = *eng;
  double *lb = e.liftBuf.data();
  const double h = 1 / e.fs;
  double lf = lift;
  // the jacks: up at the key's speed to the rail, or down as the key comes up
  for (int t = 0; t < n; t++) {
    if (keyDown) {
      if (lf < top) { lf += V * h; if (lf >= top) { lf = top; knock(ACTION::keyMass * V); } }
    } else if (lf > 0) {
      lf -= (pending ? FAST_FALL : vDown) * h;
      if (lf <= 0) { lf = 0; if (!killing) knock(ACTION::jackMass * (pending ? FAST_FALL : vDown)); }
    }
    lb[t] = lf;
  }
  lift = lf;
  if (pending) {
    bool back = true;
    for (int i = 0; i < nList; i++) { const PluckedString &st = strings[list[i]]; if (st.phase[0] == Phase::above || st.phase[1] == Phase::above) back = false; }
    if (back) { pending = false; keyDown = true; }
  }
  // knocks: a half-sine of force on the cloth, into the board through the case
  if (knockT >= 0) {
    double *sg = e.seg.data();
    const int N = knockN;
    for (int t = 0; t < n && knockT < N; t++, knockT++) {
      const double f = knockAmp * std::sin((pi * (knockT + 0.5)) / N);
      for (int s = 0; s < 3; s++) if (kw[s] != 0) sg[s * BLOCK + t] += kw[s] * f;
    }
    if (knockT >= N) knockT = -1;
  }
  // the strings
  double pk0 = 0;
  bool awake = false;
  const bool sy = e.P[p::sympathy] > 0 && e.quality != Quality::low; // (Quality: no sympathetic strings at Low)
  for (auto &b : sb) { b[0] = b[sbn]; std::fill(b.begin() + 1, b.begin() + 1 + n, 0.0); }
  sbn = n;
  for (int i = 0; i < nList; i++) {
    const int ch = list[i];
    PluckedString &st = strings[ch];
    if (sleep[ch]) continue;
    const bool lifted = lifts[ch] && !killing;
    st.kcOn = e.P[p::kc] != 0;
    const double pk = st.render(n, lifted ? lb : e.zeroBuf.data(), keyDown && lifted, ch == BACK ? e.buffBuf.data() : e.zeroBuf.data(), e.seg.data(), BLOCK, w[ch].data(), w0[ch], w1[ch], 1,
                               sy ? sb[ch].data() + 1 : nullptr);
    if (pk > pk0) pk0 = pk;
    if (!(pk < 1e4) || !std::isfinite(st.q()[0])) {
      dead = true;
      Message m;
      m.type = msg::error; m.key = (int16_t)key;
      e.post(m);
      return;
    }
    st.dropTop(e.pick(DROP, 4e-6, 1.5e-5)); // (Quality: sooner)
    // asleep once quiet and nothing is about to touch it (a plectrum waiting to pluck, or the jack on
    // its way down)
    const bool waiting = lifted && (pending || (keyDown && (st.phase[0] == Phase::under || st.phase[1] == Phase::under)) || (!keyDown && lift > 0));
    quiet[ch] = pk < QUIET ? quiet[ch] + 1 : 0;
    if (quiet[ch] > 30 && !waiting) { sleep[ch] = true; st.silence(); }
    else awake = true;
  }
  peak = pk0; age += n;
  if (pk0 > 1e-3) sounded = true;
  if (killing && (pk0 < QUIET || !awake)) dead = true;
  if (!awake && !keyDown && !pending && lift <= 0 && knockT < 0) dead = true;
}
void HarpsichordEngine::Voice::knock(double J) { // J: impulse (N·s); a half-sine of duration τ peaks at πJ/2τ
  knockAmp = (KNOCK_COUPLING * pi * J) / (2 * ACTION::knock); knockT = 0;
}

// ---- the soundboard ------------------------------------------------------------------------

// RBJ Butterworth high-pass biquad (Q = 1/√2) at f.
static void hpCoeffs(double f, double fs, double &b0, double &b1, double &b2, double &a1, double &a2) {
  const double w = (2 * pi * std::min(f, 0.45 * fs)) / fs, c = std::cos(w), al = std::sin(w) / std::numbers::sqrt2, a0 = 1 + al;
  b0 = (1 + c) / 2 / a0; b1 = -(1 + c) / a0; b2 = (1 + c) / 2 / a0; a1 = (-2 * c) / a0; a2 = (1 - al) / a0;
}
static double hp100(double f) { return (f / 100) / std::hypot(1.0, f / 100); } // the acoustic short circuit round the case
// |pressure per newton| at mic j from segment s, averaged (rms) over the top third of the modal
// band: the residual path's level, so the two join.
static double residualGain(const BoardModel &B, int s, int j) {
  double e = 0;
  int cnt = 0;
  for (int i = 0; i < 32; i++) {
    const double f = B.fTop * (0.66 + (0.34 * i) / 31), w = 2 * pi * f;
    double re = 0, im = 0;
    for (int k = 0; k < B.K; k++) {
      const double wk = 2 * pi * B.f[k], d = wk * wk - w * w, s2 = 2 * B.sigma[k] * w, den = d * d + s2 * s2;
      const double gk = B.mic[2 * k + j] * hp100(B.f[k]) * B.phi[k * NSEG + s] * -w * w;
      re += (gk * d) / den; im -= (gk * s2) / den;
    }
    e += re * re + im * im; cnt++;
  }
  return std::sqrt(e / cnt);
}

void HarpsichordEngine::Board::init(double fs) {
  const BoardModel &B = boardModel();
  const double k = 1 / fs;
  K = B.K;
  for (int i = 0; i < K; i++) {
    const double om = 2 * pi * B.f[i], sig = B.sigma[i], r = std::exp(-sig * k), od = std::sqrt(om * om - sig * sig);
    a1[i] = 2 * r * std::cos(od * k); a2[i] = r * r;
    const double b = (k * r * std::sin(od * k)) / od;
    for (int s = 0; s < NSEG; s++) ph[i * NSEG + s] = b * B.phi[i * NSEG + s];
    ml[i] = fs * fs * B.mic[2 * i] * hp100(B.f[i]); mr[i] = fs * fs * B.mic[2 * i + 1] * hp100(B.f[i]);
  }
  fb = 1 / (2 * pi * BOARD::mb * B.Ginf);
  lpG = 1 - std::exp((-2 * pi * fb) / fs);
  // residual: per segment, the modal band's mean response at its top, through a 4th-order high-pass
  // there; above the band each bridge point is heard mostly by the nearer microphone (an equal-power
  // pan by its place along the bridge: bass end left, treble end right)
  for (int s = 0; s < NSEG; s++) {
    const double g = std::hypot(residualGain(B, s, 0), residualGain(B, s, 1)), pan = ((SEGS[s].t - 0.5) * 1.2 + 1) * pi / 4;
    res[2 * s] = g * std::cos(pan); res[2 * s + 1] = g * std::sin(pan);
  }
  hpCoeffs(B.fTop, fs, b0, b1, b2, ha1, ha2);
}

void HarpsichordEngine::Board::run(const double *seg, double *Lo, double *Ro, int n) {
  double *z = hz.data();
  for (int t = 0; t < n; t++) {
    double rl = 0, rr = 0;
    for (int s = 0; s < NSEG; s++) { lp[s] += lpG * (seg[s * BLOCK + t] - lp[s]); rl += res[2 * s] * lp[s]; rr += res[2 * s + 1] * lp[s]; }
    const double f0 = lp[0], f1 = lp[1], f2 = lp[2], f3 = lp[3], f4 = lp[4];
    double mlv = 0, mrv = 0;
    for (int i = 0, j = 0; i < K; i++, j += 5) {
      const double x0 = e0[i], x1 = e1[i];
      const double xn = a1[i] * x0 - a2[i] * x1 + ph[j] * f0 + ph[j + 1] * f1 + ph[j + 2] * f2 + ph[j + 3] * f3 + ph[j + 4] * f4;
      const double acc = xn - 2 * x0 + x1;
      e1[i] = x0; e0[i] = xn;
      mlv += ml[i] * acc; mrv += mr[i] * acc;
    }
    // residual through two biquads per mic (Butterworth high-pass, 4th order)
    double y = rl;
    for (int b = 0; b < 2; b++) { const int o = 2 * b; const double v = b0 * y + z[o]; z[o] = b1 * y - ha1 * v + z[o + 1]; z[o + 1] = b2 * y - ha2 * v; y = v; }
    mlv += y;
    y = rr;
    for (int b = 2; b < 4; b++) { const int o = 2 * b; const double v = b0 * y + z[o]; z[o] = b1 * y - ha1 * v + z[o + 1]; z[o + 1] = b2 * y - ha2 * v; y = v; }
    mrv += y;
    Lo[t] = mlv; Ro[t] = mrv;
  }
  // what has died away to nothing goes to zero, before it decays on into subnormal numbers (slow): a
  // bridge segment nothing drives any more (the 4′'s, once its strings have stopped)
  constexpr double TINY = 1e-30;
  auto flush = [](double &x) { if (std::fabs(x) < TINY) x = 0; };
  for (double &x : lp) flush(x);
  for (double &x : hz) flush(x);
  for (int i = 0; i < K; i++) { flush(e0[i]); flush(e1[i]); }
}

// ---- the engine -----------------------------------------------------------------------------

HarpsichordEngine::HarpsichordEngine(double fs)
    : Engine(fs),
      data([this](int key, uint64_t v) {
        const Snapshot &s = snapshots[v % snapshots.size()];
        Params q;
        for (int i = 0; i < 12; i++) q.tuning.r[i] = s.ratio[i].load(std::memory_order_relaxed);
        q.detune = s.detune.load(std::memory_order_relaxed); q.loss = s.loss.load(std::memory_order_relaxed); q.fmax = s.fmax.load(std::memory_order_relaxed);
        auto d = std::make_unique<KeyStrings>();
        for (int c : CHOIRS) { d->S[c] = stringDesign(key, c, q); stringPartials(d->S[c], q, this->fs, d->parts[c]); }
        return d;
      }),
      sym(3 * 128, SYM_MODES, BLOCK, fs, false) {
  sym.quiet = QUIET;
  unitTables(MATERIALS[0].taper); // the plectra's tables and the board, now rather than at the first note
  board.init(fs);
  glide = 1 - std::exp(-1 / (RAMP * fs));
}

void HarpsichordEngine::setParams(const double *p) {
  const bool first = !hasParams;
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  mp = paramsOf(P.data());
  hasParams = true;
  // physics knobs: a change makes new strings for the next press (a new version of every key's)
  const std::array<double, 4> sig = {P[p::detune], P[p::loss], P[p::damper], P[p::fmax]};
  if (first || sig != physSig || !(mp.tuning == physTuning)) {
    physSig = sig; physTuning = mp.tuning; version++;
    Snapshot &s = snapshots[version % snapshots.size()];
    for (int i = 0; i < 12; i++) s.ratio[i].store(mp.tuning.r[i], std::memory_order_relaxed);
    s.detune.store(mp.detune, std::memory_order_relaxed); s.loss.store(mp.loss, std::memory_order_relaxed); s.fmax.store(mp.fmax, std::memory_order_relaxed);
    data.prepare(version, KEY_MIN, KEY_MAX, focus);
  }
  if (first) { buff = mp.buff ? 1 : 0; mix = mp.soundboard ? 1 : 0; }
}

void HarpsichordEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < KEY_MIN || key > KEY_MAX) return;
  velocity = std::min(1.0, std::max(0.0, velocity));
  focus = key;
  down[key] = 1;
  Voice *v = byKey[key];
  if (v && (v->killing || v->dead || v->version != version)) { if (!v->dead) v->kill(); v = nullptr; byKey[key] = nullptr; }
  if (v) { v->press(velocity); symSet(key, *v->ref.data, v->version); return; }
  const Data::Ref r = data.get(key, version);
  if (r) { begin(key, velocity, r); return; }
  // the key's strings are being built (a few ms): the note waits for them
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) { pending[i] = {key, velocity, false, -1}; return; }
  if (nPending < (int)pending.size()) pending[nPending++] = {key, velocity, false, -1};
}

void HarpsichordEngine::begin(int key, double velocity, Data::Ref r) {
  Voice *v = byKey[key];
  if (v && (v->killing || v->dead || v->version != version)) { if (!v->dead) v->kill(); v = nullptr; }
  if (!v) {
    Voice *free = nullptr;
    for (Voice &u : pool) if (!u.inUse) { free = &u; break; }
    if (!free) { // every voice busy (beyond anything the stealing lets happen): the oldest dying one goes
      for (int i = 0; i < nVoices && !free; i++) if (voices[i]->killing) free = voices[i];
      if (!free) return;
      for (int i = 0, j = 0; i < nVoices; i++) if (voices[i] != free) voices[j++] = voices[i];
      nVoices--;
      if (byKey[free->key] == free) byKey[free->key] = nullptr;
      data.release(free->ref);
    }
    v = free;
    v->start(*this, key, r);
    voices[nVoices++] = v; byKey[key] = v;
    steal(v);
  }
  v->press(velocity);
  symSet(key, *v->ref.data, v->version);
}

void HarpsichordEngine::retryPending() {
  int j = 0;
  for (int i = 0; i < nPending; i++) {
    const Pending pd = pending[i];
    const Data::Ref r = data.get(pd.key, version);
    if (!r) { pending[j++] = pd; continue; }
    begin(pd.key, pd.velocity, r);
    if (pd.off) noteOff(pd.key, pd.relVel);
  }
  nPending = j;
}

// relVel: the MIDI note-off's release velocity (0..1), or −1 for none.
void HarpsichordEngine::noteOff(int key, double relVel) {
  if (key < 0 || key > 127) return;
  down[key] = 0;
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) { pending[i].off = true; pending[i].relVel = relVel; }
  if (Voice *v = byKey[key]) v->release(relVel >= 0 && std::isfinite(relVel) ? std::min(1.0, relVel) : DEFAULT_RELEASE);
}

void HarpsichordEngine::allNotesOff() {
  nPending = 0;
  for (int i = 0; i < nVoices; i++) voices[i]->kill();
  byKey.fill(nullptr);
  down.fill(0);
  for (int g = 0; g < sym.groups(); g++) sym.clear(g);
  symHush = true;
  boardHush = true;
}

// Too many keys sounding: fade the quietest released one; never one that has not sounded yet.
void HarpsichordEngine::steal(Voice *keep) {
  int live = 0;
  for (int i = 0; i < nVoices; i++) if (!voices[i]->killing && voices[i] != keep) live++;
  if (live + 1 <= maxVoices()) return; // (Quality: fewer)
  Voice *victim = nullptr;
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    if (v->killing || v == keep) continue;
    if (!v->keyDown && v->sounded && (!victim || v->peak < victim->peak)) victim = v;
  }
  if (!victim && live + 1 > hardVoices())
    for (int i = 0; i < nVoices; i++) {
      Voice *v = voices[i];
      if (v->killing || v == keep) continue;
      if (v->sounded && (!victim || v->peak < victim->peak)) victim = v;
    }
  if (victim) { victim->kill(); if (byKey[victim->key] == victim) byKey[victim->key] = nullptr; }
}

// The partials of a string a voice makes now (all of them at High).
int HarpsichordEngine::kept(const Partials &pt) const {
  if (quality == Quality::high) return pt.N;
  int n = 0;
  while (n < pt.N && n < nTop() && (pt.f[n] < fTop() || n < 16)) n++;
  return n;
}

void HarpsichordEngine::onRelease(void *ctx, PluckedString &st, int p) {
  Voice *v = static_cast<Voice *>(ctx);
  v->eng->pluckInfo(*v, st, p);
}
void HarpsichordEngine::pluckInfo(Voice &v, PluckedString &st, int p) {
  if (!messages) return;
  Message &m = pluckMsg;
  const PluckedString::Release &r = st.relInfo[p];
  m.type = msg::pluck; m.key = (int16_t)v.key; m.count = 8;
  const double vals[8] = {(double)st.S.choir, p == PT::LUTE ? 1.0 : 0.0, r.F, r.u, r.w, r.s, r.theta, st.x[p]};
  for (int i = 0; i < 8; i++) m.values[i] = (float)vals[i];
  post(m);
}

void HarpsichordEngine::process(float *L, float *R, int n) {
  for (int at = 0; at < n; at += BLOCK) processBlock(L + at, R + at, std::min(BLOCK, n - at));
  data.audioCycle();
}

void HarpsichordEngine::processBlock(float *L, float *R, int n) {
  std::fill(L, L + n, 0.0f); std::fill(R, R + n, 0.0f);
  if (!hasParams) return;
  if (nPending) retryPending();
  for (int s = 0; s < NSEG; s++) std::fill(seg.begin() + s * BLOCK, seg.begin() + s * BLOCK + n, 0.0);
  // the buff's leather comes on and off gradually
  const double bT = mp.buff ? 1 : 0, g = glide;
  double b = buff;
  for (int t = 0; t < n; t++) { b += g * (bT - b); if (std::fabs(bT - b) < 1e-6) b = bT; buffBuf[t] = b; }
  buff = b;
  for (int i = 0; i < nVoices; i++) if (!voices[i]->dead) voices[i]->render(n);
  symRun(n);
  int j = 0;
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    if (v->dead) {
      if (byKey[v->key] == v) byKey[v->key] = nullptr;
      data.release(v->ref);
      v->ref = {}; v->inUse = false; // the voice keeps its fields (dead) until it is reused
    } else voices[j++] = v;
  }
  nVoices = j;
  // soundboard microphones, or the bridge force itself (soundboard off), crossfaded
  board.run(seg.data(), bL.data(), bR.data(), n);
  // after Panic, once the voices have faded, the board fades out over this block and rests
  if (boardHush) {
    bool quiet = true;
    for (int i = 0; i < nVoices && quiet; i++) quiet = voices[i]->dead;
    if (quiet) {
      for (int t = 0; t < n; t++) { const double w = 1 - double(t + 1) / n; bL[t] *= w; bR[t] *= w; }
      board.clear();
      boardHush = false;
    }
  }
  const double mT = mp.soundboard ? 1 : 0;
  double mx = mix;
  const double *sg = seg.data();
  for (int t = 0; t < n; t++) {
    mx += g * (mT - mx);
    const double d0 = sg[t], d1 = sg[BLOCK + t], d2 = sg[2 * BLOCK + t], d3 = sg[3 * BLOCK + t], d4 = sg[4 * BLOCK + t];
    const double dl = DRY * (d0 + 0.7 * d1 + 0.3 * d2 + d3 * 0.85 + d4 * 0.15), dr = DRY * (0.3 * d0 + 0.7 * d1 + d2 + d3 * 0.15 + d4 * 0.85);
    L[t] = (float)(OUT * mx * bL[t] + (1 - mx) * dl);
    R[t] = (float)(OUT * mx * bR[t] + (1 - mx) * dr);
  }
  mix = std::fabs(mx - mT) < 1e-6 ? mT : mx;
}

// ---- sympathetic strings ---------------------------------------------------------------------

// Key's groups, from the strings its voice plays (its choirs' lowest partials below SYM_FMAX): made
// again when the strings or the damper's knobs have changed. Under the damper a partial decays
// faster by the felt's resistance R at its point, R φ²/2, up to ω/2 (beyond that a partial is no
// longer one: the felt soaks up the wave as it arrives).
void HarpsichordEngine::symSet(int key, const KeyStrings &d, uint64_t ver) {
  const std::array<double, 4> sig = {P[p::damper], P[p::xFront], P[p::xBack], P[p::xFour]};
  if (quality == Quality::low) return; // (Quality: none at Low; symRun lets those made before fade)
  if (symVer[key] == ver && sig == symSig && quality == symQuality) return;
  if (sig != symSig || quality != symQuality) { symSig = sig; symQuality = quality; symVer.fill(0); }
  const double fmax = std::min(SYM_FMAX, 0.45 * fs);
  for (int ch : CHOIRS) {
    const StringDesign &S = d.S[ch];
    const Partials &pt = d.parts[ch];
    const double R = ACTION::feltR * mp.damper * std::sqrt(S.T * S.mu), xd = std::min(0.5 * S.L, pluckPoint(key, ch, mp) + DAMPER_OFFSET);
    const double nrm = std::sqrt(2 / (S.mu * S.L));
    std::array<SympatheticMode, SYM_MODES> modes;
    int m = 0;
    for (int i = 0; i < pt.N && m < symModes() && pt.f[i] < fmax; i++) { // (Quality: fewer at Medium)
      SympatheticMode &md = modes[m++];
      const double phi = nrm * std::sin(pt.k[i] * xd);
      md.omega = 2 * pi * pt.f[i];
      md.cV = (pt.b[i] < 0 ? -1 : 1) * std::sqrt(2 * pt.sigB[i]);
      md.sigma = pt.sigma[i];
      md.damped = md.sigma + std::min(0.5 * R * phi * phi, 0.5 * md.omega);
      md.oV = pt.b[i]; md.loud = std::fabs(pt.b[i]); // its output: its bridge force, as a voice's
    }
    const int g = 3 * key + ch;
    sym.set(g, modes.data(), m);
    const std::array<double, NSEG> w = segmentWeights(key, ch);
    Sympathetic::Tap taps[Sympathetic::TAPS];
    int nt = 0;
    for (int s = 0; s < NSEG && nt < Sympathetic::TAPS; s++) if (w[s] > 0) taps[nt++] = {s, w[s], 0};
    sym.route(g, taps, nt);
  }
  symVer[key] = ver;
}

// After the voices' n samples, the groups': a string's damper is off it while its key is held and
// its jack has risen; each group feels the strings' bridge signals at the steps' midpoints, as its
// own run from step to step.
void HarpsichordEngine::symRun(int n) {
  const double kap = P[p::sympathy];
  if (kap <= 0) return;
  // after Panic the groups stay still until the voices have faded out
  if (symHush) {
    for (int i = 0; i < nVoices; i++) if (!voices[i]->dead) return;
    symHush = false;
  }
  // at Low the groups are off: undriven, their dampers down, what still rings fades, and then they rest
  const bool off = quality == Quality::low;
  if (off) {
    bool still = true;
    for (int g = 3 * KEY_MIN; g < 3 * (KEY_MAX + 1) && still; g++) still = sym.silent(g);
    if (still) return;
  }
  const Registration reg = registration(mp);
  for (int key = KEY_MIN; key <= KEY_MAX; key++)
    for (int ch : CHOIRS) sym.damp(3 * key + ch, off || !(down[key] && reg.lift[ch]));
  bool any = false;
  symStamp++;
  std::fill(tS.begin(), tS.begin() + n, 0.0);
  for (int i = 0; i < nVoices; i++) {
    const Voice *v = voices[i];
    if (v->dead) continue;
    for (int j = 0; j < v->nList; j++) {
      const int ch = v->list[j], g = 3 * v->key + ch;
      if (v->sleep[ch]) continue;
      any = true;
      const double *b = v->sb[ch].data();
      double *o = own[g].data();
      const bool first = ownAt[g] != symStamp;
      ownAt[g] = symStamp;
      for (int t = 0; t < n; t++) {
        const double x = 0.5 * (b[t] + b[t + 1]);
        tS[t] += x;
        o[t] = first ? x : o[t] + x;
      }
      sym.own(g, o, nullptr);
    }
  }
  double *const buses[NSEG] = {seg.data(), seg.data() + BLOCK, seg.data() + 2 * BLOCK, seg.data() + 3 * BLOCK, seg.data() + 4 * BLOCK};
  sym.run(off ? 0 : kap, tS.data(), zeroBuf.data(), any, n, buses);
}

} // namespace forte::harpsichord
