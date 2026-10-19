// pipes-engine.cpp — the pipe organ's engine (pipes-engine.h).

#include "pipes-engine.h"

#include <algorithm>
#include <cmath>

namespace forte::pipes {

namespace {
constexpr double OUT = 0.08;     // output per m³/s² of the mouths' volume acceleration: ρ/4πr at 1.2 m
constexpr double FADE = 0.03;    // s: a stolen key fades out over this
constexpr double BEND_T = 0.02;  // s: the pitch wheel's glide
constexpr double YOUNG = 0.05;   // s: a key this young is never stolen
constexpr double SLIDER = 0.04;  // s: a stop's slider travels over this
constexpr double GLIDE = 0.02;   // s: live knobs (pressure, tremulant) glide
constexpr double U_BUF = 2;      // m/s: delay lines hold a slower jet's transit than this only up to their length
constexpr double NOISE = 2e-3;   // turbulence: velocity fluctuations at the flue of NOISE × U_j × the knob
constexpr int POST_BLOCKS = 6;
constexpr int RANK_ORDER[RANKS] = {0, 2, 1, 3, 4, 5}; // the pipe the views show: the first drawn of P8, G8, O4, mixture
constexpr double PI = std::numbers::pi;

// Half-band low-pass for the 2× decimation (Kaiser-windowed sinc, cut-off at the output Nyquist).
void halfband(std::array<double, PipeEngine::FIR_N> &h, double beta = 8) {
  constexpr int N = PipeEngine::FIR_N;
  const double M = (N - 1) / 2.0;
  const auto I0 = [](double x) { double s = 1, t = 1; for (int k = 1; k < 40; k++) { t *= std::pow(x / (2 * k), 2); s += t; } return s; };
  double sum = 0;
  for (int i = 0; i < N; i++) {
    const double n = i - M, sinc = n == 0 ? 0.5 : std::sin((PI * n) / 2) / (PI * n);
    h[i] = sinc * (I0(beta * std::sqrt(1 - std::pow(n / M, 2))) / I0(beta)); sum += h[i];
  }
  for (int i = 0; i < N; i++) h[i] /= sum;
}
} // namespace

// ---- a key's pipes, and their packed form ---------------------------------------------------------

KeyModels keyModels(int key, const Voicing &design, double ratio) {
  KeyModels k;
  k.key = key; k.design = design; k.ratio = ratio;
  for (int r = 0; r < RANKS; r++) {
    const double f = pipeFreq(key, r, ratio);
    const bool stopped = RANK[r].stopped;
    ModelOptions o;
    o.tune = tuning(f, stopped);
    k.pipes[r] = pipeModel(f, stopped, design, o);
  }
  return k;
}

int packKeyModels(const KeyModels &k, double *out) {
  int n = 0;
  for (double v : {(double)k.key, k.design.cutup, k.design.gain, k.design.offset, k.ratio}) out[n++] = v;
  for (const PipeModel &R : k.pipes) {
    const Geometry &g = R.geo;
    for (double v : {R.f, R.stopped ? 1.0 : 0.0, R.M, R.A, g.W, g.b, g.H, g.y0, g.h, g.dd, g.Sm, g.D, (double)R.nModes}) out[n++] = v;
    for (int m = 0; m < R.nModes; m++) { out[n++] = R.modes[m].om; out[n++] = R.modes[m].sigma; }
  }
  return n;
}

bool unpackKeyModels(const double *in, int n, KeyModels &k) {
  int i = 0;
  const auto take = [&](double &v) { if (i >= n) return false; v = in[i++]; return true; };
  double key = 0;
  if (!take(key) || !take(k.design.cutup) || !take(k.design.gain) || !take(k.design.offset) || !take(k.ratio)) return false;
  k.key = (int)key;
  for (PipeModel &R : k.pipes) {
    R = PipeModel{};
    Geometry &g = R.geo;
    double stopped = 0, modes = 0;
    for (double *v : {&R.f, &stopped, &R.M, &R.A, &g.W, &g.b, &g.H, &g.y0, &g.h, &g.dd, &g.Sm, &g.D, &modes}) if (!take(*v)) return false;
    R.stopped = g.stopped = stopped != 0;
    if (!(modes >= 0 && modes <= MODES_OPEN)) return false; // (0: a pipe with no mode below F_MAX, silent)
    R.nModes = (int)modes;
    for (int m = 0; m < R.nModes; m++) {
      Mode &md = R.modes[m];
      if (!take(md.om) || !take(md.sigma)) return false;
      md.n = m + 1; md.f = md.om / TAU; md.Q = md.om / (2 * md.sigma); md.harm = R.stopped ? 2 * m + 1 : m + 1;
    }
    if (R.nModes) { R.fRes = R.modes[0].f; R.Q1 = R.modes[0].Q; }
  }
  return i == n;
}

// ---- one pipe ---------------------------------------------------------------------------------------

int PipeEngine::Pipe::lineLength(double tauK) {
  int N = 64;
  while (N < std::min(8192.0, tauK / U_BUF + 8)) N <<= 1;
  return N;
}

// Its constants and state. Modes: per mode 6 constants (exact transition over one step for
// x'' + 2σx' + ω²x = F/M, F held) and 2 states (volume displacement x, volume flow v).
void PipeEngine::Pipe::init(PipeEngine &eng, const PipeModel *model, int r, double *line) {
  R = model; rank = r; stopped = model->stopped;
  os = eng.osFor(model->f);
  fsI = eng.fs * os; h = 1 / fsI; n = model->nModes;
  const Geometry &g = model->geo;
  retime(1);
  // the jet
  W = g.W; b = g.b; H = g.H; y0 = g.y0; ib = 1 / g.b;
  bH = g.b * g.H;                             // jet flow into the pipe = bHU_j(1 + tanh)
  hA = g.h * model->A;                        // η = (hA/U_j)·v
  Ks = (AIR.rho * g.dd) / g.Sm;               // Δp_src = Ks dQ_in/dt
  Kl = AIR.rho / (2 * ALPHA_VC * ALPHA_VC);   // Δp_los = −Kl v|v|
  iSm = 1 / g.Sm;
  flue = g.h * g.H;                           // the flue's area: the wind it draws is hH·U_j
  N = lineLength((g.W / CP) * fsI);
  buf = line; mask = N - 1; maxD = N - 4; w = 0;
  std::fill(buf, buf + N, 0.0);
  noise = eng.noise.data(); ni = (int)std::floor(NOISE_N * (0.5 + eng.rand())) % NOISE_N;
  for (int k = 0; k < n; k++) x[k] = v[k] = 0;
  lp = qin = vm = Q = dp = eta = out = 0; asleep = true; foot = Uj = 0;
  track = eng.track; dsp = mean = prev = t = 0; last = -1; per = 0; nx = 0;
  kMean = 1 - std::exp(-h * 2 * PI * std::min(20.0, model->f / 8));
  if (eng.bendNow != 1) retime(eng.bendNow);
}

// The constants of one step of this pipe's own time, r/fsI: pitch bend, the organ's air warmer
// (r > 1) or colder, so that sound and the jet both cross the pipe r× faster. The radiated
// derivative stays in real time.
void PipeEngine::Pipe::retime(double r) {
  const double hs = r == 1 ? h : r / fsI;
  for (int k = 0; k < n; k++) {
    const double w = R->modes[k].om, sg = R->modes[k].sigma, z = sg / w;
    const double wd = w * std::sqrt(std::max(1e-12, 1 - z * z)), e = std::exp(-sg * hs);
    const double co = std::cos(wd * hs), si = std::sin(wd * hs);
    const double p11 = e * (co + ((z * w) / wd) * si), p12 = (e * si) / wd, p21 = (-e * w * w * si) / wd, p22 = e * (co - ((z * w) / wd) * si);
    const double kk = R->M * w * w;
    c[6 * k] = p11; c[6 * k + 1] = p12; c[6 * k + 2] = p21; c[6 * k + 3] = p22; c[6 * k + 4] = (1 - p11) / kk; c[6 * k + 5] = -p21 / kk;
    om[k] = w;
  }
  const Geometry &g = R->geo;
  double cvs = 0;
  for (int k = 0; k < n; k++) cvs += c[6 * k + 5];
  cv = cvs / g.Sm;                            // the mouth speed one step of a held pressure adds, per pascal
  fsS = r == 1 ? fsI : fsI / r;               // steps per second of the pipe's own time
  tauK = (g.W / CP) * fsS;                    // τ in samples = tauK / U_j
  kxc = PHI_C / tauK;                         // the jet low-pass's ω_c·h = φ_c/τ = kxc·U_j
  rt = r;
}

void PipeEngine::Pipe::reset() {
  for (int k = 0; k < n; k++) x[k] = v[k] = 0;
  std::fill(buf, buf + N, 0.0);
  lp = qin = vm = Q = dp = eta = out = 0;
}

double PipeEngine::Pipe::energy() const { // a measure of the modes' motion (volume flow², m⁶/s²)
  double e = 0;
  for (int k = 0; k < n; k++) e += v[k] * v[k] + std::pow(om[k] * x[k], 2);
  return e;
}

// One step at this pipe's own rate with jet speed Uj (m/s), 1/Uj, and noise scaled by nz. Leaves
// the radiated d/dt(mouth flow) in out.
void PipeEngine::Pipe::step(double uj, double iU, double nz) {
  double qn = 0, et = 0, l = lp;
  if (uj > 0) { // as the wind dies the jet's flow goes smoothly to nothing (bHU_j → 0)
    const double tau = tauK * iU;
    double d = tau - 1; // one sample of the loop is in the held force and the backward difference
    if (d < 1) d = 1; else if (d > maxD) d = maxD;
    const int i = (int)d;
    const double f = d - i;
    const int p = w - 1 - i;
    const double x0 = buf[(p + 1) & mask], x1 = buf[p & mask], x2 = buf[(p - 1) & mask], x3 = buf[(p - 2) & mask];
    const double vd = (((0.5 * (x3 - x0) + 1.5 * (x1 - x2)) * f + (x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3)) * f + 0.5 * (x2 - x0)) * f + x1;
    const int k = ni;
    ni = k + 1 == NOISE_N ? 0 : k + 1;
    const double xc = kxc * uj; // the jet's low-pass, corner ω_c τ = φ_c (backward Euler), turbulence included
    l += (xc / (1 + xc)) * (vd + nz * uj * noise[k] - l);
    et = hA * iU * l;
    double u = (et - y0) * ib;
    u = u > 3 ? 1 : u < -3 ? -1 : (u * (27 + u * u)) / (27 + 9 * u * u); // tanh, Padé (C¹ at ±3)
    qn = bH * uj * (1 + u);
  } else l *= 0.99;
  lp = l; eta = et;
  // the modes' free motion over the step, then the pressure: the jet's drive Ks·dQ_in/dt, and the
  // vortex-shedding loss −Kl·v|v| at the new mouth speed v = v_free + cv·F (implicit: a quadratic)
  double vf = 0;
  for (int k = 0, j = 0; k < n; k++, j += 6) {
    const double xk = x[k], vk = v[k];
    x[k] = c[j] * xk + c[j + 1] * vk;
    const double nv = c[j + 2] * xk + c[j + 3] * vk;
    v[k] = nv; vf += nv;
  }
  const double Fs = Ks * (qn - qin) * fsS, r = (vf * iSm) + cv * Fs, ar = r < 0 ? -r : r;
  const double kc = cv * Kl, vn = ar > 0 ? (2 * ar) / (1 + std::sqrt(1 + 4 * kc * ar)) : 0, v2 = r < 0 ? -vn : vn;
  const double F = Fs - Kl * v2 * vn;
  qin = qn; dp = F;
  double q = 0;
  for (int k = 0, j = 0; k < n; k++, j += 6) { x[k] += c[j + 4] * F; const double nv = v[k] + c[j + 5] * F; v[k] = nv; q += nv; }
  vm = v2;
  buf[w] = v2; w = (w + 1) & mask;
  out = (q - Q) * fsI; Q = q;
  if (track) { // on the flow's running integral (the air's displacement), which the upper modes disturb less
    dsp = dsp * (1 - kMean) + v2;
    mean += kMean * (dsp - mean);
    const double y = dsp - mean, py = prev;
    const double tt = ++t;
    if (py < 0 && y >= 0) {
      const double tc = tt - 1 + py / (py - y);
      if (last >= 0) { const double T1 = tc - last; per = per > 0 ? per + 0.3 * (T1 - per) : T1; }
      last = tc; nx++;
    }
    prev = y;
  }
}

// ---- the engine ---------------------------------------------------------------------------------------

PipeEngine::PipeEngine(double fs, double fOS)
    : Engine(fs),
      fOS(fOS), h(1 / fs),
      data([this](int key, uint64_t ver) -> std::unique_ptr<KeyModels> {
        const Design &d = designs[ver & 15];
        const Voicing v{d.cutup.load(std::memory_order_relaxed), d.gain.load(std::memory_order_relaxed), d.offset.load(std::memory_order_relaxed)};
        const double ratio = d.ratio[((key % 12) + 12) % 12].load(std::memory_order_relaxed);
#if !FORTE_THREADS
        if (offered && offered->key == key && offered->design == v && offered->ratio == ratio) return std::move(offered);
#endif
        return std::make_unique<KeyModels>(keyModels(key, v, ratio));
      }),
      wsys(windSystem(0.3)) {
  configure(1, false);
  halfband(fir);
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
        const double W = (U_NOM / ((RANK[r].stopped ? THETA_STOPPED : THETA_OPEN) * f)) * cutMax;
        most = std::max(most, (size_t)Pipe::lineLength((W / CP) * fs * osFor(f)));
      }
      need += most;
    }
    lineMax = std::max(lineMax, need);
  }
#if FORTE_THREADS
  for (Voice &v : pool) v.lines.assign(lineMax, 0.0);
#endif
}

// xorshift32: seeded, so renders repeat exactly
double PipeEngine::rand() {
  seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5;
  return seed / 4294967296.0 - 0.5;
}

void PipeEngine::configure(uint32_t s, bool tr) {
  seed = s ? s : 1; track = tr;
  for (int i = 0; i < NOISE_N; i++) noise[i] = rand();
}

bool PipeEngine::offer(const double *packed, int n) {
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

bool PipeEngine::useModels(const double *packed, int n) {
  auto d = std::make_unique<KeyModels>();
  if (!unpackKeyModels(packed, n, *d)) return false;
  custom.push_back(std::move(d));
  return true;
}

void PipeEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  const bool first = !hasParams;
  hasParams = true;
  const Voicing dk{P[p::cutup], P[p::gain], P[p::offset]};
  const Tuning t = tuningOf(P.data()); // the keyboard's: a change of it cuts new pipes for the next notes
  if (first || !(dk == design) || !(t == tuning)) {
    design = dk; tuning = t; version++;
    Design &d = designs[version & 15];
    d.cutup.store(dk.cutup, std::memory_order_relaxed); d.gain.store(dk.gain, std::memory_order_relaxed); d.offset.store(dk.offset, std::memory_order_relaxed);
    for (int i = 0; i < 12; i++) d.ratio[i].store(t.r[i], std::memory_order_relaxed);
    data.prepare(version, KEY_MIN, KEY_MAX, focus ? focus->key : 60);
  }
  if (!started) { Pset = Pr = Pc = P[p::pressure]; nz = NOISE * P[p::noise]; started = true; }
  if (P[p::wind] != stiff) { stiff = P[p::wind]; wsys = windSystem(P[p::wind]); }
}

// A free voice with room for `need` doubles of delay lines; when every one is busy, the most
// faded of the fading ones goes at once.
PipeEngine::Voice *PipeEngine::freeVoice(size_t need) {
  Voice *v = nullptr;
  for (Voice &u : pool) if (!u.inUse) { v = &u; break; }
  if (!v) {
    int best = -1;
    for (int i = 0; i < nVoices; i++) if (voices[i]->fading && (best < 0 || voices[i]->fade < voices[best]->fade)) best = i;
    if (best < 0) return nullptr;
    v = voices[best];
    if (byKey[v->key] == v) byKey[v->key] = nullptr;
    if (focus == v) focus = nullptr;
    data.release(v->ref);
    std::copy(voices.begin() + best + 1, voices.begin() + nVoices, voices.begin() + best);
    nVoices--;
  }
  if (v->lines.size() < need) {
#if FORTE_THREADS
    return nullptr; // (only a key outside the organ's could need more)
#else
    v->lines.assign(need, 0.0);
#endif
  }
  return v;
}

bool PipeEngine::startKey(int key, double velocity, const KeyModels *models, Data::Ref ref) {
  Voice *v = byKey[key];
  if (v && (v->dead || v->fading || v->version != version)) { if (!v->dead) { v->fading = true; v->down = false; v->aTarget = 0; } v = nullptr; }
  if (!v) {
    size_t need = 0;
    for (int r = 0; r < RANKS; r++) need += Pipe::lineLength((models->pipes[r].geo.W / CP) * fs * osFor(models->pipes[r].f));
    v = freeVoice(need);
    if (!v) return false;
    v->inUse = true; v->key = key; v->version = version; v->models = models; v->ref = ref;
    data.acquire(ref);
    size_t at = 0;
    for (int r = 0; r < RANKS; r++) { v->pipes[r].init(*this, &models->pipes[r], r, v->lines.data() + at); at += v->pipes[r].N; }
    bool stops[STOPS] = {P[p::principal] != 0, P[p::octave] != 0, P[p::gedackt] != 0, P[p::mixture] != 0};
    engaged(stops, on);
    for (int r = 0; r < RANKS; r++) v->slider[r] = v->open[r] = on[r] ? 1 : 0;
    double flues = 0;
    for (const Pipe &q : v->pipes) flues += q.flue;
    v->kPal = 1 / (PALLET.cd * PALLET.area * flues); // k = Σ s·hH × kPal
    v->a = 0; v->aTarget = 0; v->aRate = 0; v->fade = 1; v->env = 0;
    v->down = false; v->fading = false; v->dead = false; v->age = 0; v->pg = 0;
    const double pan = chestPan(key), ang = ((pan * 0.85 + 1) * PI) / 4;
    v->gl = std::cos(ang); v->gr = std::sin(ang);
    v->nList = 0;
    voices[nVoices++] = v; byKey[key] = v;
    int live = 0;
    for (int i = 0; i < nVoices; i++) if (!voices[i]->fading && !voices[i]->dead) live++;
    if (live > MAX_KEYS) { // the quietest released key (never a young one) fades out
      Voice *victim = nullptr;
      double score = INFINITY;
      for (int i = 0; i < nVoices; i++) {
        Voice *u = voices[i];
        if (u == v || u->fading || u->age < YOUNG) continue;
        const double s = (u->down ? 1e6 : 0) + u->env;
        if (s < score) { score = s; victim = u; }
      }
      if (victim) victim->fading = true;
    }
  }
  v->down = true; v->aTarget = 1; v->aRate = 1 / (palletTime(velocity, P[p::rise]) * fs);
  for (int r = 0; r < RANKS; r++) if (v->slider[r] > 0) v->pipes[r].asleep = false;
  focus = v;
  return true;
}

void PipeEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < 0 || key > 127) return;
  if (!custom.empty()) { startKey(key, velocity, custom.back().get(), {}); return; }
  const Data::Ref r = data.get(key, version);
  if (r) { startKey(key, velocity, r.data, r); return; }
  // the key's pipes are being voiced (about a millisecond): the note waits for them
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) { pending[i] = {key, velocity, false, -1}; return; }
  if (nPending < (int)pending.size()) pending[nPending++] = {key, velocity, false, -1};
}

void PipeEngine::retryPending() {
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

void PipeEngine::noteOff(int key, double velocity) {
  if (key < 0 || key > 127) return;
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) { pending[i].off = true; pending[i].offVelocity = velocity; }
  Voice *v = byKey[key];
  if (!v) return;
  v->down = false; v->aTarget = 0; v->aRate = 1 / (closeTime(velocity) * fs);
}

void PipeEngine::allNotesOff() {
  nPending = 0;
  for (int i = 0; i < nVoices; i++) { Voice *v = voices[i]; v->fading = true; v->down = false; v->aTarget = 0; }
}

int PipeEngine::voiceCountNow() const {
  int n = 0;
  for (int i = 0; i < nVoices; i++) for (const Pipe &q : voices[i]->pipes) if (!q.asleep) n++;
  return n;
}
int PipeEngine::voiceCount() const { return voiceCountNow(); }

void PipeEngine::bend(double value) {
  bendTo = std::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12);
}

void PipeEngine::process(float *L, float *R, int n) {
  for (int at = 0, m; at < n; at += m) {
    // pitch bend glides in steps of at most 128 samples, every pipe retimed at each
    m = std::min(bendNow != bendTo ? 128 : BLOCK_MAX, n - at);
    if (bendNow != bendTo) {
      bendNow += (bendTo - bendNow) * (1 - std::exp(-m / (BEND_T * fs)));
      if (std::fabs(bendNow - bendTo) < 1e-9) bendNow = bendTo;
    }
    for (int i = 0; i < nVoices; i++) for (Pipe &q : voices[i]->pipes) if (q.R && q.rt != bendNow) q.retime(bendNow);
    processBlock(L + at, R + at, m);
  }
  data.audioCycle();
}

void PipeEngine::processBlock(float *L, float *R, int n) {
  std::fill(L, L + n, 0.0f); std::fill(R, R + n, 0.0f);
  if (!hasParams) return;
  if (nPending) retryPending();
  const double rho = AIR.rho;
  const bool stops[STOPS] = {P[p::principal] != 0, P[p::octave] != 0, P[p::gedackt] != 0, P[p::mixture] != 0};
  engaged(stops, on);
  const double sStep = h / SLIDER, g = 1 - std::exp(-h / GLIDE);
  const WindSystem &ws = wsys;
  const double kr = h / ws.Cr, kt = h / ws.Mt, kc = h / ws.Cc, cd2 = PALLET.cd * std::sqrt(2 / rho);
  const double tremOn = P[p::tremulant] != 0 ? P[p::tremDepth] : 0, tremW = TAU * P[p::tremRate] * h, nzT = NOISE * P[p::noise];
  const double fadeK = 1 - h / FADE;
  for (int k = 0; k < nVoices; k++) { // wake the pipes whose stop is drawn under a held key; list the pipes that are awake
    Voice *v = voices[k];
    v->nList = 0;
    for (int r = 0; r < RANKS; r++) {
      if (on[r] && v->down) v->pipes[r].asleep = false;
      if (!v->pipes[r].asleep) v->list[v->nList++] = &v->pipes[r];
      else v->slider[r] = v->open[r] = on[r] ? 1 : 0; // a silent pipe's slider is simply where its stop is
    }
  }
  double pset = Pset, pr = Pr, qt = Qt, pc = Pc, tr = trem, ph = tremPh, nzs = nz;
  bool any4 = false; // a 4× pipe sounded in this block, last at sample last4
  int last4 = 0;
  const double Ptarget = P[p::pressure];
  Voice *f = focus && !focus->dead ? focus : nullptr;
  const int shown = f ? shownRank(*f) : -1;
  double qdraw = Qdraw;
  for (int i = 0; i < n; i++) {
    pset += g * (Ptarget - pset); tr += g * (tremOn - tr); nzs += g * (nzT - nzs);
    // the wind: reservoir, trunk, chest (explicit, the draw from the last sample)
    const double Qtr = tr > 1e-6 ? cd2 * WIND.tremArea * tr * 0.5 * (1 - std::cos(ph)) * std::sqrt(pc > 0 ? pc : 0) : 0;
    ph += tremW; if (ph > TAU) ph -= TAU;
    pr += kr * (ws.Gr * (pset - pr) - qt);
    qt += kt * (pr - pc - ws.Rt * qt);
    pc += kc * (qt + ws.Gs * (pset - pc) - qdraw - Qtr);
    if (pc < 0) pc = 0;
    Qtrem = Qtr;
    double draw = 0, l1 = 0, r1 = 0, l2a = 0, l2b = 0, r2a = 0, r2b = 0, l4[4] = {0, 0, 0, 0}, r4[4] = {0, 0, 0, 0};
    for (int k = 0; k < nVoices; k++) {
      Voice *v = voices[k];
      if (v->dead) continue;
      double a = v->a;
      if (a != v->aTarget) { a = v->aTarget > a ? std::min(v->aTarget, a + v->aRate) : std::max(v->aTarget, a - v->aRate); v->a = a; }
      // the groove: the pallet's flow equals the flues' (quasi-static); the sliders move towards
      // their stops, each opening its pipe's foot as a valve (smoothstep)
      double kk = 0;
      const int nl = v->nList;
      for (int r = 0; r < nl; r++) {
        const int q = v->list[r]->rank;
        const double tgt = on[q] ? 1 : 0;
        double x = v->slider[q];
        if (x != tgt) { x = tgt > x ? std::min(1.0, x + sStep) : std::max(0.0, x - sStep); v->slider[q] = x; v->open[q] = x * x * (3 - 2 * x); }
        kk += v->list[r]->flue * v->open[q];
      }
      kk *= v->kPal;
      const double pg = a > 0 ? (pc * a * a) / (a * a + kk * kk) : 0;
      v->pg = pg;
      double s1 = 0, s2a = 0, s2b = 0, s4[4] = {0, 0, 0, 0};
      bool q4 = false;
      const double Ug = pg > 0 ? std::sqrt((2 * pg) / rho) : 0, iUg = Ug > 0 ? 1 / Ug : 0; // the jet speed with the slider open
      for (int r = 0; r < nl; r++) {
        Pipe &q = *v->list[r];
        const double o = v->open[q.rank];
        double Uj = Ug, iU = iUg;
        if (o < 1) { Uj = o > 0 && Ug > 0 ? Ug * std::sqrt(o) : 0; iU = Uj > 0 ? 1 / Uj : 0; }
        q.foot = pg * o; q.Uj = Uj;
        draw += q.flue * Uj;
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
    qdraw = draw;
    loL[i] = l1; loR[i] = r1;
    hiL[2 * i] = l2a; hiL[2 * i + 1] = l2b; hiR[2 * i] = r2a; hiR[2 * i + 1] = r2b;
    for (int j = 0; j < 4; j++) { hi4L[4 * i + j] = l4[j]; hi4R[4 * i + j] = r4[j]; }
    Qsum += draw; Qcnt++;
    if (f && shown >= 0) record(f->pipes[shown]);
  }
  Pset = pset; Pr = pr; Qt = qt; Pc = pc; Qdraw = qdraw; trem = tr; tremPh = ph; nz = nzs;
  // the 4× pipes into the 2× stream, while they sound and until the half-band has emptied
  if (any4 || quiet4 < FIR_N) decimate4(n);
  quiet4 = any4 ? std::min(FIR_N, 4 * (n - 1 - last4)) : std::min(FIR_N, quiet4 + 4 * n);
  decimate(L, R, n);
  for (int i = 0; i < n; i++) { L[i] = (float)(L[i] + loL[i]); R[i] = (float)(R[i] + loR[i]); }
  // retire: pallet shut, every pipe quiet
  for (int k = 0; k < nVoices; k++) {
    Voice *v = voices[k];
    v->age += n / fs;
    if (v->fading && v->fade < 1e-4) { v->dead = true; continue; }
    int awake = 0;
    for (Pipe &q : v->pipes) {
      if (q.asleep) continue;
      if ((v->a == 0 || v->slider[q.rank] == 0) && q.foot == 0 && q.energy() < 1e-14) { q.asleep = true; q.reset(); } else awake++;
    }
    if (!awake && !v->down && v->a == 0) v->dead = true;
  }
  int j = 0;
  for (int k = 0; k < nVoices; k++) {
    Voice *v = voices[k];
    if (v->dead) {
      if (byKey[v->key] == v) byKey[v->key] = nullptr;
      data.release(v->ref);
      v->ref = {}; v->inUse = false; // the voice keeps its fields (dead) until it is reused
    } else voices[j++] = v;
  }
  nVoices = j;
  if (focus && focus->dead) focus = nullptr;
  if (messages && ++blocks >= POST_BLOCKS) { blocks = 0; postView(); }
}

// 2× → 1×: the half-band FIR, whose every other tap (but the centre) is zero. L and R hold the
// result in float until the 1× pipes are added (in double).
void PipeEngine::decimate(float *L, float *R, int n) {
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
void PipeEngine::decimate4(int n) {
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

int PipeEngine::shownRank(const Voice &v) const {
  for (int r : RANK_ORDER) if (v.slider[r] > 0 && !v.pipes[r].asleep) return r;
  for (int r : RANK_ORDER) if (!v.pipes[r].asleep) return r;
  return 0;
}

void PipeEngine::record(const Pipe &q) {
  Trace &t = trace;
  if (++t.cnt < t.dec) return;
  t.cnt = 0;
  const int w = t.w;
  t.v[w] = q.vm; t.dp[w] = q.dp; t.eta[w] = q.eta; t.qin[w] = q.qin;
  t.w = w + 1 == (int)t.v.size() ? 0 : w + 1;
}

// Live data for the page's views: the wind, and the focused pipe's geometry and traces.
void PipeEngine::postView() {
  const double Q = Qcnt ? Qsum / Qcnt : Qdraw;
  Qsum = 0; Qcnt = 0;
  Message s;
  s.type = msg::state;
  const double head[6] = {Pc, Pr, Pset, Q, (double)voiceCountNow(), Qtrem};
  for (int i = 0; i < 6; i++) s.values[i] = (float)head[i];
  const Voice *v = focus;
  if (!v) { s.key = 0; s.count = 6; post(s); return; }
  const int r = shownRank(*v);
  const Pipe &q = v->pipes[r];
  const PipeModel &R = *q.R;
  const Geometry &g = R.geo;
  // the trace: about 2.5 periods at TRACE points, decimated from the pipe's rate (×1 or ×2 per sample)
  const double per = fs / R.f;
  const int dec = std::max(1, (int)std::round((2.5 * per) / TRACE));
  if (dec != trace.dec) { trace.dec = dec; trace.cnt = 0; }
  const int N = (int)trace.v.size();
  const std::array<double, TRACE * 8> *src[4] = {&trace.v, &trace.dp, &trace.eta, &trace.qin};
  for (int k = 0; k < 4; k++) {
    for (int at = 0; at < TRACE; at += 29) {
      Message m;
      m.type = (uint16_t)(msg::v + k); m.key = (int16_t)v->key;
      const int cnt = std::min(29, TRACE - at);
      m.values[0] = (float)at; m.count = (uint16_t)(cnt + 1);
      for (int i = 0; i < cnt; i++) m.values[1 + i] = (float)(*src[k])[(trace.w - TRACE + at + i + N) % N];
      post(m);
    }
  }
  const double rest[15] = {(double)r, R.f, g.W, g.b, g.h, g.H, g.D, R.A, g.y0, q.Uj, q.foot, q.Uj / (R.f * g.W), q.Uj > 0 ? g.W / (CP * q.Uj) : 0,
                           (double)TRACE, dec / fs};
  for (int i = 0; i < 15; i++) s.values[6 + i] = (float)rest[i];
  s.key = (int16_t)v->key; s.count = 21;
  post(s);
}

} // namespace forte::pipes
