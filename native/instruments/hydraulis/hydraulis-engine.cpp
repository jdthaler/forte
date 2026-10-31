// hydraulis-engine.cpp — the water organ's engine (hydraulis-engine.h).

#include "hydraulis-engine.h"

#include <algorithm>
#include <cmath>

namespace forte::hydraulis {

namespace {
constexpr double OUT = 0.08;     // output per m³/s² of the mouths' volume acceleration: ρ/4πr at 1.2 m
constexpr double FADE = 0.03;    // s: a stolen key fades out over this
constexpr double BEND_T = 0.02;  // s: the pitch wheel's glide
constexpr double YOUNG = 0.05;   // s: a key this young is never stolen
constexpr double COCK = 0.08;    // s: a rank's stopcock turns over this
constexpr double GLIDE = 0.02;   // s: the turbulence knob glides
constexpr double EFFORT_T = 0.3; // s: the pumpers take this long to change pace
constexpr double SETTLE = 0.2;   // s: the rim's depth and the cistern's size glide (a block at a time)
constexpr double NOISE = 2e-3;   // turbulence: velocity fluctuations at the flue of NOISE × U_j × the knob
constexpr double RB = 8e3;       // Pa·s/m³: air escaping under the rim once the water inside reaches it
constexpr double ROOM = 0.5;     // the pumpers start a stroke while the bowl has room for this share of one
constexpr double BOUNCE = 0.3;   // a slide's rebound off its stop, as a share of its speed
constexpr double BUBBLE_R0 = 0.008, BUBBLE_R1 = 0.022; // m: the bubbles breaking away under the rim
constexpr double BUBBLE_Q = 18;  // their ring's quality factor
constexpr double BUBBLE_OUT = 0.6; // their sound per metre of radius, at Gurgle × 1
constexpr int POST_BLOCKS = 6;
constexpr double PI = std::numbers::pi;
// Quality: the modes a pipe keeps at Medium and Low (at most this many, up to this frequency)
constexpr int MEDIUM_MODES = 8, LOW_MODES = 5;
constexpr double MEDIUM_F = 10000, LOW_F = 7000;
} // namespace

// ---- a key's pipes, and their packed form ---------------------------------------------------------

KeyModels keyModels(int key, const Design &d) {
  KeyModels k;
  k.key = key; k.design = d;
  for (int r = 0; r < RANKS; r++) {
    const double f = pipeFreq(key, r, d.ratio);
    const bool stopped = RANK[r].stopped;
    k.pipes[r] = pipeModel(f, stopped, d.bore, d.voicing, tuning(f, stopped));
  }
  return k;
}

int packKeyModels(const KeyModels &k, double *out) {
  int n = 0;
  for (double v : {(double)k.key, k.design.bore, k.design.voicing.cutup, k.design.voicing.gain, k.design.voicing.offset, k.design.ratio}) out[n++] = v;
  for (const PipeModel &R : k.pipes) {
    const pipes::Geometry &g = R.geo;
    for (double v : {R.f, R.stopped ? 1.0 : 0.0, R.M, R.A, g.W, g.b, g.H, g.y0, g.h, g.dd, g.Sm, g.D, (double)R.nModes}) out[n++] = v;
    for (int m = 0; m < R.nModes; m++) { out[n++] = R.modes[m].om; out[n++] = R.modes[m].sigma; }
  }
  return n;
}

bool unpackKeyModels(const double *in, int n, KeyModels &k) {
  int i = 0;
  const auto take = [&](double &v) { if (i >= n) return false; v = in[i++]; return true; };
  double key = 0;
  Design &d = k.design;
  if (!take(key) || !take(d.bore) || !take(d.voicing.cutup) || !take(d.voicing.gain) || !take(d.voicing.offset) || !take(d.ratio)) return false;
  k.key = (int)key;
  for (PipeModel &R : k.pipes) {
    R = PipeModel{};
    pipes::Geometry &g = R.geo;
    double stopped = 0, modes = 0;
    for (double *v : {&R.f, &stopped, &R.M, &R.A, &g.W, &g.b, &g.H, &g.y0, &g.h, &g.dd, &g.Sm, &g.D, &modes}) if (!take(*v)) return false;
    R.stopped = g.stopped = stopped != 0;
    if (!(modes >= 0 && modes <= pipes::MODES_OPEN)) return false;
    R.nModes = (int)modes;
    for (int m = 0; m < R.nModes; m++) {
      pipes::Mode &md = R.modes[m];
      if (!take(md.om) || !take(md.sigma)) return false;
      md.n = m + 1; md.f = md.om / TAU; md.Q = md.om / (2 * md.sigma); md.harm = R.stopped ? 2 * m + 1 : m + 1;
    }
    if (R.nModes) { R.fRes = R.modes[0].f; R.Q1 = R.modes[0].Q; }
  }
  return i == n;
}

// ---- the engine ---------------------------------------------------------------------------------------

HydraulisEngine::HydraulisEngine(double fs, double fOS)
    : Engine(fs),
      fOS(fOS), h(1 / fs),
      data([this](int key, uint64_t ver) -> std::unique_ptr<KeyModels> {
        const Shared &s = designs[ver & 15];
        Design d;
        d.bore = s.bore.load(std::memory_order_relaxed);
        d.voicing = {s.cutup.load(std::memory_order_relaxed), s.gain.load(std::memory_order_relaxed), s.offset.load(std::memory_order_relaxed)};
        d.ratio = s.ratio[((key % 12) + 12) % 12].load(std::memory_order_relaxed);
#if !FORTE_THREADS
        if (offered && offered->key == key && offered->design == d) return std::move(offered);
#endif
        return std::make_unique<KeyModels>(keyModels(key, d));
      }) {
  configure(1, false);
  pipes::halfband(fir);
  // each voice's delay lines: enough for the longest key at the widest cut-up, in any tuning (a
  // pipe's line is longest at the lowest pitch of each oversampling band it can fall in)
  const double cutMax = kParams[p::cutup].max;
  for (int k = KEY_MIN; k <= KEY_MAX; k++) {
    size_t need = 0;
    for (int r = 0; r < RANKS; r++) {
      const double f0 = pipeFreq(k, r);
      size_t most = 0;
      for (double f : {f0 * RATIO_MIN, fOS, 3 * fOS}) {
        if (f < f0 * RATIO_MIN || f > f0 * RATIO_MAX) continue;
        const double W = cutW(f, RANK[r].stopped) * cutMax;
        most = std::max(most, (size_t)Pipe::lineLength((W / pipes::CP) * fs * osFor(f)));
      }
      need += most;
    }
    lineMax = std::max(lineMax, need);
  }
#if FORTE_THREADS
  for (Voice &v : pool) v.lines.assign(lineMax, 0.0);
#endif
}

double HydraulisEngine::rand() { // xorshift32: seeded, so renders repeat exactly
  seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5;
  return seed / 4294967296.0 - 0.5;
}

void HydraulisEngine::configure(uint32_t s, bool tr, bool st) {
  seed = s ? s : 1; track = tr; still = st;
  for (int i = 0; i < NOISE_N; i++) noise[i] = rand();
}

bool HydraulisEngine::offer(const double *packed, int n) {
#if FORTE_THREADS
  (void)packed; (void)n;
  return false;
#else
  auto d = std::make_unique<KeyModels>();
  if (!unpackKeyModels(packed, n, *d) || d->key < 0 || d->key > 127) return false;
  offered = std::move(d);
  return true;
#endif
}

bool HydraulisEngine::useModels(const double *packed, int n) {
  auto d = std::make_unique<KeyModels>();
  if (!unpackKeyModels(packed, n, *d)) return false;
  custom.push_back(std::move(d));
  return true;
}

void HydraulisEngine::setParams(const double *v) {
  for (int i = 0; i < p::count; i++) P[i] = v[i];
  const bool first = !hasParams;
  hasParams = true;
  const Tuning t = tuningOf(P.data()); // the keyboard's: a change of it cuts new pipes for the next notes
  Design d;
  d.bore = P[p::bore]; d.voicing = {P[p::cutup], P[p::gain], P[p::offset]};
  if (first || !(d == design) || !(t == tuning)) {
    design = d; tuning = t; version++;
    Shared &s = designs[version & 15];
    s.bore.store(d.bore, std::memory_order_relaxed);
    s.cutup.store(d.voicing.cutup, std::memory_order_relaxed); s.gain.store(d.voicing.gain, std::memory_order_relaxed); s.offset.store(d.voicing.offset, std::memory_order_relaxed);
    for (int i = 0; i < 12; i++) s.ratio[i].store(t.r[i], std::memory_order_relaxed);
    data.prepare(version, KEY_MIN, KEY_MAX, focusKey ? focusKey : 67);
  }
  if (!started) { // the pumpers have filled the bowl before the first note: the water inside at the rim
    started = true;
    pRimNow = P[p::rim]; sizeNow = P[p::cistern];
    cis = cistern(sizeNow, pRimNow);
    pc = cis.pRim; dV = cis.Vrim; Qw = 0;
    effort = P[p::effort];
    nz = NOISE * P[p::noise];
    for (int r = 0; r < RANKS; r++) cock[r] = cockOpen[r] = P[p::open + r] != 0 ? 1 : 0;
    nextBubble = 0;
  }
}

HydraulisEngine::Voice *HydraulisEngine::freeVoice(size_t need) {
  Voice *v = nullptr;
  for (Voice &u : pool) if (!u.inUse) { v = &u; break; }
  if (!v) {
    int best = -1;
    for (int i = 0; i < nVoices; i++) if (voices[i]->fading && (best < 0 || voices[i]->fade < voices[best]->fade)) best = i;
    if (best < 0) return nullptr;
    v = voices[best];
    if (byKey[v->key] == v) byKey[v->key] = nullptr;
    data.release(v->ref);
    std::copy(voices.begin() + best + 1, voices.begin() + nVoices, voices.begin() + best);
    nVoices--;
  }
  if (v->lines.size() < need) {
#if FORTE_THREADS
    return nullptr;
#else
    v->lines.assign(need, 0.0);
#endif
  }
  return v;
}

bool HydraulisEngine::startKey(int key, double velocity, const KeyModels *models, Data::Ref ref) {
  Voice *v = byKey[key];
  if (v && (v->dead || v->fading || v->version != version)) { if (!v->dead) { v->fading = true; v->down = false; v->pushing = false; } v = nullptr; }
  if (!v) {
    size_t need = 0;
    for (int r = 0; r < RANKS; r++) need += Pipe::lineLength((models->pipes[r].geo.W / pipes::CP) * fs * osFor(models->pipes[r].f));
    v = freeVoice(need);
    if (!v) return false;
    v->inUse = true; v->key = key; v->version = version; v->models = models; v->ref = ref; v->nb = expr.bendOf(key);
    data.acquire(ref);
    size_t at = 0;
    for (int r = 0; r < RANKS; r++) {
      pipes::FlueSetup s;
      s.fs = fs; s.os = osFor(models->pipes[r].f); s.noise = noise.data(); s.track = track;
      s.maxModes = pick(pipes::MODES_OPEN, MEDIUM_MODES, LOW_MODES); s.maxF = pick<double>(INFINITY, MEDIUM_F, LOW_F); // Quality: Medium and Low leave out the highest modes
      s.draw = rand();
      v->pipes[r].init(s, &models->pipes[r], r, v->lines.data() + at, bendNow * v->nb);
      at += v->pipes[r].N;
    }
    v->s = v->sv = v->open = 0;
    v->fade = 1; v->env = 0; v->age = 0;
    v->down = false; v->fading = false; v->dead = false; v->pushing = false;
    const double pan = rowPan(key), ang = ((pan * 0.85 + 1) * PI) / 4;
    v->gl = std::cos(ang); v->gr = std::sin(ang);
    v->nList = 0;
    voices[nVoices++] = v; byKey[key] = v;
    int live = 0;
    for (int i = 0; i < nVoices; i++) if (!voices[i]->fading && !voices[i]->dead) live++;
    if (live > pick(MAX_KEYS, 12, 8)) { // the quietest released key (never a young one) fades out; Medium and Low let fewer keys sound
      Voice *victim = nullptr;
      double score = INFINITY;
      for (int i = 0; i < nVoices; i++) {
        Voice *u = voices[i];
        if (u == v || u->fading || u->age < YOUNG) continue;
        const double sc = (u->down ? 1e6 : 0) + u->env;
        if (sc < score) { score = sc; victim = u; }
      }
      if (victim) victim->fading = true;
    }
  }
  v->nb = expr.bendOf(key);
  // the finger pushes the slide in, from wherever its spring has brought it back to
  v->down = true; v->pushing = true; v->s0 = v->s; v->pushT = 0; v->pushDur = pushTime(velocity, P[p::push]) * std::max(0.05, 1 - v->s);
  for (int r = 0; r < RANKS; r++) if (cock[r] > 0) v->pipes[r].asleep = false;
  focusKey = key;
  return true;
}

void HydraulisEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < 0 || key > 127) return;
  if (!custom.empty()) { startKey(key, velocity, custom.back().get(), {}); return; }
  const Data::Ref r = data.get(key, version);
  if (r) { startKey(key, velocity, r.data, r); return; }
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) { pending[i] = {key, velocity, false, -1}; return; }
  if (nPending < (int)pending.size()) pending[nPending++] = {key, velocity, false, -1};
}

void HydraulisEngine::retryPending() {
  int j = 0;
  for (int i = 0; i < nPending; i++) {
    const Pending pd = pending[i];
    const Data::Ref r = data.get(pd.key, version);
    if (!r) { pending[j++] = pd; continue; }
    startKey(pd.key, pd.velocity, r.data, r);
    if (pd.off) noteOff(pd.key, pd.offVelocity);
  }
  nPending = j;
}

void HydraulisEngine::noteOff(int key, double velocity) {
  (void)velocity;
  if (key < 0 || key > 127) return;
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) { pending[i].off = true; pending[i].offVelocity = velocity; }
  leanKey[key] = 0;
  Voice *v = byKey[key];
  if (!v) return;
  if (v->pushing) { // let go mid-push: the slide keeps the speed the finger gave it
    const double u = std::min(1.0, v->pushT / v->pushDur);
    v->sv = (1 - v->s0) * (PI / (2 * v->pushDur)) * std::sin(PI * u);
  }
  v->down = false; v->pushing = false;
}

void HydraulisEngine::allNotesOff() {
  nPending = 0;
  for (int i = 0; i < nVoices; i++) { Voice *v = voices[i]; v->fading = true; v->down = false; v->pushing = false; }
  leanKey.fill(0);
}

void HydraulisEngine::pressure(double value, int key) {
  const double x = std::clamp(value, 0.0, 1.0);
  if (key < 0) { lean = x; return; }
  if (key < 128) leanKey[key] = x;
}

int HydraulisEngine::voiceCountNow() const {
  int n = 0;
  for (int i = 0; i < nVoices; i++) for (const Pipe &q : voices[i]->pipes) if (!q.asleep) n++;
  return n;
}
int HydraulisEngine::voiceCount() const { return voiceCountNow(); }

void HydraulisEngine::bend(double value) {
  bendTo = std::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12);
}

void HydraulisEngine::process(float *L, float *R, int n) {
  for (int at = 0, m; at < n; at += m) {
    bool own = false;
    for (int i = 0; i < nVoices && !own; i++) own = voices[i]->nb != expr.bendOf(voices[i]->key);
    m = std::min(bendNow != bendTo || own ? 128 : BLOCK_MAX, n - at);
    if (bendNow != bendTo) {
      bendNow += (bendTo - bendNow) * (1 - std::exp(-m / (BEND_T * fs)));
      if (std::fabs(bendNow - bendTo) < 1e-9) bendNow = bendTo;
    }
    for (int i = 0; i < nVoices; i++) {
      Voice &v = *voices[i];
      if (own) v.nb = glideTo(v.nb, expr.bendOf(v.key), m / fs, BEND_T);
      const double r = bendNow * v.nb;
      for (Pipe &q : v.pipes) if (q.R && q.rt != r) q.retime(r);
    }
    processBlock(L + at, R + at, m);
  }
  data.audioCycle();
}

// A bubble breaks away under the rim: a radius drawn between BUBBLE_R0 and BUBBLE_R1, ringing at
// its Minnaert frequency; the next one breaks away when the escaped air has filled it.
void HydraulisEngine::popBubble() {
  const double R = BUBBLE_R0 + (BUBBLE_R1 - BUBBLE_R0) * (rand() + 0.5);
  Bubble *b = &bubbles[0];
  for (Bubble &u : bubbles) if (!u.on) { b = &u; break; } else if (u.amp < b->amp) b = &u;
  const double f = minnaert(R), w = (TAU * f) / fs;
  b->on = true; b->c = 0; b->s = 1; b->rc = std::cos(w); b->rs = std::sin(w);
  b->decay = std::exp(-(PI * f / BUBBLE_Q) / fs);
  b->amp = BUBBLE_OUT * R;
  bubbled++;
  const double Rn = BUBBLE_R0 + (BUBBLE_R1 - BUBBLE_R0) * (rand() + 0.5);
  nextBubble = (4 * PI / 3) * Rn * Rn * Rn;
}

void HydraulisEngine::processBlock(float *L, float *R, int n) {
  std::fill(L, L + n, 0.0f); std::fill(R, R + n, 0.0f);
  if (!hasParams) return;
  if (nPending) retryPending();
  const double rho = AIR.rho;
  // the rim's depth and the cistern's size glide, a block at a time
  const double kS = 1 - std::exp(-(n / fs) / SETTLE);
  if (pRimNow != P[p::rim] || sizeNow != P[p::cistern]) {
    pRimNow += (P[p::rim] - pRimNow) * kS; sizeNow += (P[p::cistern] - sizeNow) * kS;
    if (std::fabs(pRimNow - P[p::rim]) < 1e-6 * P[p::rim]) pRimNow = P[p::rim];
    if (std::fabs(sizeNow - P[p::cistern]) < 1e-9) sizeNow = P[p::cistern];
    cis = cistern(sizeNow, pRimNow);
  }
  const Cistern &c = cis;
  const int nPumps = P[p::pumps] >= 0.5 ? 2 : 1;
  double leanMax = lean;
  for (int i = 0; i < nVoices; i++) if (voices[i]->down) leanMax = std::max(leanMax, leanKey[voices[i]->key]);
  const double effortTo = P[p::effort] + (1 - P[p::effort]) * leanMax, kE = 1 - std::exp(-h / EFFORT_T);
  const double cStep = h / COCK, g = 1 - std::exp(-h / GLIDE), nzT = NOISE * P[p::noise];
  const double fadeK = 1 - h / FADE, gurgle = P[p::gurgle];
  const double w2 = std::pow(springOmega(P[p::spring]), 2);
  bool on[RANKS];
  for (int r = 0; r < RANKS; r++) on[r] = P[p::open + r] != 0;
  for (int k = 0; k < nVoices; k++) { // wake the pipes whose rank is drawn under a held key; list the pipes that are awake
    Voice *v = voices[k];
    v->nList = 0;
    for (int r = 0; r < RANKS; r++) {
      if (on[r] && v->down) v->pipes[r].asleep = false;
      if (!v->pipes[r].asleep) v->list[v->nList++] = &v->pipes[r];
    }
  }
  const double kAir = h / c.Ca, kW = h / c.Mw, kB = kAir / RB;
  double pw = pc, dv = dV, qw = Qw, qdraw = Qdraw, eff = effort, nzs = nz;
  bool any4 = false;
  int last4 = 0;
  for (int i = 0; i < n; i++) {
    eff += kE * (effortTo - eff); nzs += g * (nzT - nzs);
    for (int r = 0; r < RANKS; r++) { // the stopcocks turn
      const double tgt = on[r] ? 1 : 0;
      if (cock[r] != tgt) { const double x = cock[r] = tgt > cock[r] ? std::min(1.0, cock[r] + cStep) : std::max(0.0, cock[r] - cStep); cockOpen[r] = x * x * (3 - 2 * x); }
    }
    // the pumps: a stroke starts when the pace allows, a pump is back at the top, and the bowl has room
    double qp = 0;
    if (!still) {
      const double T = strokeTime(eff);
      sinceStroke += h;
      Pump &nx = pump[nPumps == 2 ? nextPump : 0];
      if (!nx.cycling && sinceStroke >= T / nPumps && c.Vrim - dv >= ROOM * STROKE_V) {
        nx.cycling = true; nx.t = 0; nx.vol = 0; nx.back = -1;
        sinceStroke = 0; strokes++;
        if (nPumps == 2) nextPump ^= 1;
      }
      const double push = pushPressure(eff, c.pRim);
      for (int j = 0; j < nPumps; j++) {
        Pump &u = pump[j];
        if (!u.cycling) continue;
        u.t += h;
        if (u.back < 0) { // the piston goes down, from 1 (top) to 0
          const double q = pistonFlow(push, pw, u.t, u.vol / STROKE_V, T); // (at the pace the pumpers are at now)
          qp += q; u.vol += q * h; u.pos = std::max(0.0, 1 - u.vol / STROKE_V);
          if (u.vol >= STROKE_V) u.back = 0;
        } else { // and comes back up
          u.back = std::min(1.0, u.back + h / ((1 - DELIVER) * T));
          u.pos = 0.5 * (1 - std::cos(PI * u.back));
          if (u.back >= 1) u.cycling = false;
        }
      }
      // the water under the rim, then the air (the pipes' draw from the sample before)
      qw += kW * (pw - dv / c.Ch - c.Rw * qw);
      dv += h * qw;
      const bool rim = dv >= c.Vrim;
      if (rim) { dv = c.Vrim; if (qw > 0) qw = 0; }
      double pn = pw + kAir * (qp - qdraw - qw), qe = 0;
      if (rim && pn > c.pRim) { pn = (pn + kB * c.pRim) / (1 + kB); qe = (pn - c.pRim) / RB; } // air escapes under the rim
      pw = pn < 0 ? 0 : pn;
      if (qe > 0) {
        escAcc += qe * h;
        if (nextBubble <= 0) { const double Rn = BUBBLE_R0 + (BUBBLE_R1 - BUBBLE_R0) * (rand() + 0.5); nextBubble = (4 * PI / 3) * Rn * Rn * Rn; }
        if (escAcc >= nextBubble) { escAcc -= nextBubble; popBubble(); }
      }
      Qesc = qe; sumEsc += qe;
    } else pw = c.pRim;
    Qpump = qp; sumPump += qp;
    double draw = 0, l1 = 0, r1 = 0, l2a = 0, l2b = 0, r2a = 0, r2b = 0, l4[4] = {0, 0, 0, 0}, r4[4] = {0, 0, 0, 0};
    for (int k = 0; k < nVoices; k++) {
      Voice *v = voices[k];
      if (v->dead) continue;
      // the slide: pushed in by the finger (a half-cosine over its push time), held, or sprung back to its stop
      double s = v->s;
      if (v->pushing) {
        v->pushT += h;
        const double u = std::min(1.0, v->pushT / v->pushDur);
        s = v->s0 + (1 - v->s0) * 0.5 * (1 - std::cos(PI * u));
        if (u >= 1) { v->pushing = false; s = 1; }
        v->sv = 0;
      } else if (!v->down && (s > 0 || v->sv != 0)) {
        v->sv -= w2 * (s + 1) * h;
        s += v->sv * h;
        if (s <= 0) { s = 0; v->sv = v->sv < 0 ? -BOUNCE * v->sv : v->sv; if (v->sv < 0.1) v->sv = 0; }
      }
      if (s != v->s) { v->s = s; v->open = slideOpen(s); }
      const double a0 = CD_HOLE * HOLE_FLUE * v->open; // each pipe's hole, as a share of its flue
      double s1 = 0, s2a = 0, s2b = 0, s4[4] = {0, 0, 0, 0};
      bool q4 = false;
      for (int r = 0; r < v->nList; r++) {
        Pipe &q = *v->list[r];
        // the hole and the flue in series: the foot's pressure
        const double a = a0 * cockOpen[q.rank], fl = q.flue, foot = (pw * a * a) / (a * a + 1);
        const double Uj = foot > 0 ? std::sqrt((2 * foot) / rho) : 0, iU = Uj > 0 ? 1 / Uj : 0;
        q.foot = foot; q.Uj = Uj;
        draw += fl * Uj;
        if (q.os == 2) { q.step(Uj, iU, nzs); s2a += q.out; q.step(Uj, iU, nzs); s2b += q.out; }
        else if (q.os == 4) { for (int j = 0; j < 4; j++) { q.step(Uj, iU, nzs); s4[j] += q.out; } q4 = true; }
        else { q.step(Uj, iU, nzs); s1 += q.out; }
      }
      const double fade = v->fade;
      if (v->fading) v->fade = fade * fadeK;
      const double gF = OUT * fade;
      s1 *= gF; s2a *= gF; s2b *= gF;
      l1 += v->gl * s1; r1 += v->gr * s1;
      l2a += v->gl * s2a; l2b += v->gl * s2b; r2a += v->gr * s2a; r2b += v->gr * s2b;
      double as = s1 + s2a;
      if (q4) {
        for (int j = 0; j < 4; j++) { s4[j] *= gF; l4[j] += v->gl * s4[j]; r4[j] += v->gr * s4[j]; }
        as += s4[0]; any4 = true; last4 = i;
      }
      as = std::fabs(as);
      v->env = as > v->env ? as : v->env * 0.9998;
    }
    qdraw = draw; sumDraw += draw; sumN++;
    // the bubbles, in the middle
    double bub = 0;
    for (Bubble &b : bubbles) {
      if (!b.on) continue;
      const double cn = b.c * b.rc - b.s * b.rs, sn = b.c * b.rs + b.s * b.rc;
      b.c = cn * b.decay; b.s = sn * b.decay;
      bub += b.amp * b.c;
      if (std::fabs(b.c) + std::fabs(b.s) < 1e-5) b.on = false;
    }
    bub *= gurgle;
    loL[i] = l1 + 0.7 * bub; loR[i] = r1 + 0.7 * bub;
    hiL[2 * i] = l2a; hiL[2 * i + 1] = l2b; hiR[2 * i] = r2a; hiR[2 * i + 1] = r2b;
    for (int j = 0; j < 4; j++) { hi4L[4 * i + j] = l4[j]; hi4R[4 * i + j] = r4[j]; }
  }
  pc = pw; dV = dv; Qw = qw; Qdraw = qdraw; effort = eff; nz = nzs;
  if (any4 || quiet4 < FIR_N) decimate4(n);
  quiet4 = any4 ? std::min(FIR_N, 4 * (n - 1 - last4)) : std::min(FIR_N, quiet4 + 4 * n);
  decimate(L, R, n);
  for (int i = 0; i < n; i++) { L[i] = (float)(L[i] + loL[i]); R[i] = (float)(R[i] + loR[i]); }
  // retire: slide shut, every pipe quiet
  for (int k = 0; k < nVoices; k++) {
    Voice *v = voices[k];
    v->age += n / fs;
    if (v->fading && v->fade < 1e-4) { v->dead = true; continue; }
    int awake = 0;
    for (Pipe &q : v->pipes) {
      if (q.asleep) continue;
      if ((v->open == 0 || cockOpen[q.rank] == 0) && q.energy() < 1e-14) { q.asleep = true; q.reset(); q.foot = q.Uj = 0; } else awake++;
    }
    if (!awake && !v->down && v->s == 0 && v->sv == 0) v->dead = true;
  }
  int j = 0;
  for (int k = 0; k < nVoices; k++) {
    Voice *v = voices[k];
    if (v->dead) {
      if (byKey[v->key] == v) byKey[v->key] = nullptr;
      data.release(v->ref);
      v->ref = {}; v->inUse = false;
    } else voices[j++] = v;
  }
  nVoices = j;
  if (messages && ++blocks >= POST_BLOCKS) { blocks = 0; postView(); }
}

// 2× → 1×: the half-band FIR, whose every other tap (but the centre) is zero.
void HydraulisEngine::decimate(float *L, float *R, int n) {
  constexpr int M = FIR_N, c = (M - 1) / 2;
  int p = hpos;
  for (int i = 0; i < n; i++) {
    for (int k = 0; k < 2; k++) { const double xl = hiL[2 * i + k], xr = hiR[2 * i + k]; histL[p] = histL[p + M] = xl; histR[p] = histR[p + M] = xr; p = p + 1 == M ? 0 : p + 1; }
    double sl = fir[c] * histL[p + M - 1 - c], sr = fir[c] * histR[p + M - 1 - c];
    for (int t = 0; t < M; t += 2) { const int q = p + M - 1 - t; sl += fir[t] * histL[q]; sr += fir[t] * histR[q]; }
    L[i] = (float)sl; R[i] = (float)sr;
  }
  hpos = p;
}

// 4× → 2×, the same half-band at twice the rate, added into the 2× stream.
void HydraulisEngine::decimate4(int n) {
  constexpr int M = FIR_N, c = (M - 1) / 2;
  int p = h4pos;
  for (int i = 0; i < 2 * n; i++) {
    for (int k = 0; k < 2; k++) { const double xl = hi4L[2 * i + k], xr = hi4R[2 * i + k]; hist4L[p] = hist4L[p + M] = xl; hist4R[p] = hist4R[p + M] = xr; p = p + 1 == M ? 0 : p + 1; }
    double sl = fir[c] * hist4L[p + M - 1 - c], sr = fir[c] * hist4R[p + M - 1 - c];
    for (int t = 0; t < M; t += 2) { const int q = p + M - 1 - t; sl += fir[t] * hist4L[q]; sr += fir[t] * hist4R[q]; }
    hiL[i] += sl; hiR[i] += sr;
  }
  h4pos = p;
}

// Live data for the page's views: the wind, the pumps and the keys sounding.
void HydraulisEngine::postView() {
  const double N = sumN ? sumN : 1;
  Message s;
  s.type = msg::state;
  s.key = (int16_t)focusKey;
  const Voice *f = focusKey ? byKey[focusKey] : nullptr;
  const double v[17] = {pc, dV, cis.Vrim, Qw, sumPump / N, sumDraw / N, sumEsc / N, pump[0].pos, pump[1].pos, effort, cis.pRim, cis.fb,
                        (double)voiceCountNow(), (double)bubbled, P[p::pumps] >= 0.5 ? 2.0 : 1.0, f ? f->open : 0, (double)strokes};
  for (int i = 0; i < 17; i++) s.values[i] = (float)v[i];
  s.count = 17;
  post(s);
  sumPump = sumDraw = sumEsc = 0; sumN = 0;
  Message k;
  k.type = msg::keys;
  int m = 0;
  for (int i = 0; i < nVoices && m < 15; i++) {
    const Voice *u = voices[i];
    if (u->dead || u->open <= 0) continue;
    k.values[2 * m] = (float)u->key; k.values[2 * m + 1] = (float)(u->open * u->fade); m++;
  }
  k.count = (uint16_t)(2 * m);
  post(k);
}

} // namespace forte::hydraulis
