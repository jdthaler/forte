// harmonium-engine.cpp — the free-reed organ's engine (harmonium-engine.h).

#include "harmonium-engine.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <memory>

#include "forte/dsp.h"

namespace forte::harmonium {

constexpr double OUT = 0.02;      // output units per m³/s² of volume acceleration
constexpr int MAX_KEYS = 16;      // keys sounding at once
constexpr double FADE = 0.03;     // s: a stolen key fades out over this
constexpr double BEND_T = 0.02;   // s: the pitch wheel's glide
constexpr double YOUNG = 0.05;    // s: a key this young is never stolen
constexpr double MUTE = 0.02;     // s: a stop's mutes open or close over this
constexpr double GLIDE = 0.02;    // s: live knobs (pressure target, aftertouch, cassotto) glide
constexpr double NOISE = 0.004;   // turbulence: a random pressure on the reed, uniform within ±NOISE/2 of Δp
constexpr int POST_BLOCKS = 6;
constexpr int MAX_INNER = 10;     // Newton iterations per step (1 usually)
constexpr double F_OS = 440;      // Hz: reeds from here up are integrated at twice the sample rate
constexpr double INF = std::numeric_limits<double>::infinity();

// Half-band low-pass for the 2× decimation (Kaiser-windowed sinc, cut-off at the output Nyquist).
static std::array<double, 63> halfband(double beta = 8) {
  constexpr int N = 63;
  std::array<double, N> h{};
  const double M = (N - 1) / 2.0;
  const auto I0 = [](double x) { double s = 1, t = 1; for (int k = 1; k < 40; k++) { const double q = x / (2 * k); t *= q * q; s += t; } return s; };
  double sum = 0;
  for (int i = 0; i < N; i++) {
    const double n = i - M, sinc = n == 0 ? 0.5 : std::sin((PI * n) / 2) / (PI * n), r = n / M;
    h[i] = sinc * (I0(beta * std::sqrt(1 - r * r)) / I0(beta)); sum += h[i];
  }
  for (int i = 0; i < N; i++) h[i] /= sum;
  return h;
}

// ---- a reed --------------------------------------------------------------------------------

void HarmoniumEngine::Reed::init(HarmoniumEngine &eng, const ReedModel &model) {
  const bool keepTrack = track;
  *this = Reed{};
  R = &model;
  os = model.fSound >= eng.fOS ? 2 : 1;
  h = 1 / (eng.fs * os); fsr = 1 / h; T = model.table.A.data();
  io = eng.io; noise = eng.noise.data();
  ni = (int)std::floor(NOISE_N * (0.5 + eng.rand())) % NOISE_N;
  // mode 2 only while it is well below the internal Nyquist frequency
  two = model.modes[1].om * h < 2.5;
  stiffen(1);
  k[K_R1] = -model.geo.y0; // the set: the tip rests y0 above the plate (mode 1 carries it)
  k[K_RLH] = (1.5 * AIR.rho * model.lj) / h; // the jet's air mass per area, for BDF2
  k[K_CH] = (1.5 * model.C) / h; k[K_HAK] = h / (1.5 * model.Ma); k[K_ALK] = (model.K * h) / (1.5 * model.Ma);
  k[K_TLO] = model.table.lo; k[K_TDY] = model.table.dy; k[K_TIDY] = 1 / model.table.dy; k[K_TN2] = model.table.n - 2;
  k[K_YMA] = 1 - std::exp(-h * 2 * PI * std::min(20.0, model.fSound / 8)); // the live frequency: y's running mean
  ampK = std::exp(-h / 0.01); // the amplitude readout falls back over 10 ms
  track = eng.trackAll || keepTrack;
  reset();
  st[S_LASTX] = -1;
  if (eng.bendNow != 1) stiffen(eng.bendNow);
}

// The tongue's modes with its stiffness × r² (pitch bend: the mass and the set unchanged, so each
// mode's frequency × r); the air's parts keep their tuning.
void HarmoniumEngine::Reed::stiffen(double r) {
  const auto &m = R->modes;
  const double r2 = r * r;
  // modes: exact transition over one step for x'' + 2ζωx' + ω²x = 0, plus the response to a held force
  struct Co { double p11, p12, p21, p22, gq, gv; };
  const auto co = [this, r, r2](const Mode &md) {
    const double w = md.om * r, kk = md.k * r2, z = md.zeta, wd = w * std::sqrt(1 - z * z), e = std::exp(-z * w * h), c = std::cos(wd * h), s = std::sin(wd * h);
    const double p11 = e * (c + ((z * w) / wd) * s), p12 = (e * s) / wd, p21 = (-e * w * w * s) / wd, p22 = e * (c - ((z * w) / wd) * s);
    return Co{p11, p12, p21, p22, (1 - p11) / kk, -p21 / kk};
  };
  const Co c1 = co(m[0]);
  k[K_A11] = c1.p11; k[K_A12] = c1.p12; k[K_A21] = c1.p21; k[K_A22] = c1.p22; k[K_S1] = m[0].S;
  k[K_GQ1] = c1.gq * m[0].S; k[K_GV1] = c1.gv * m[0].S;
  k[K_DQ] = c1.gq * R->drag; k[K_DV] = c1.gv * R->drag; // the tongue's drag, held over the step
  m1 = m[0].m; k1 = m[0].k * r2;
  if (two) {
    const Co c2 = co(m[1]);
    k[K_B11] = c2.p11; k[K_B12] = c2.p12; k[K_B21] = c2.p21; k[K_B22] = c2.p22; k[K_S2] = m[1].S;
    k[K_GQ2] = c2.gq * m[1].S; k[K_GV2] = c2.gv * m[1].S; m2 = m[1].m; k2 = m[1].k * r2;
  } else { k[K_B11] = 1; k[K_B22] = 1; m2 = 1; k2 = 1; }
  k[K_DVS] = 0.5 * (k[K_S1] * k[K_GV1] + k[K_S2] * k[K_GV2]);
  kr = r;
}

void HarmoniumEngine::Reed::reset() {
  for (int i = 0; i < S_YM; i++) st[i] = 0;
  st[S_Q1] = k[K_R1]; st[S_YM] = k[K_R1];
  asleep = true;
}

// Set the reed at a steady state (tests).
void HarmoniumEngine::Reed::setSteady(const Equilibrium &e) {
  st[S_Q1] = k[K_R1] + (R->modes[0].S * e.dp) / R->modes[0].k; st[S_Q2] = two ? (R->modes[1].S * e.dp) / R->modes[1].k : 0;
  st[S_V1] = 0; st[S_V2] = 0; st[S_X] = st[S_XP] = e.x; st[S_DP] = e.dp; st[S_PC] = st[S_PCP] = e.pc;
  st[S_UIN] = st[S_UINP] = e.U; st[S_UG] = e.U; st[S_A] = e.A; st[S_YM] = st[S_Q1] + st[S_Q2];
}

double HarmoniumEngine::Reed::energy() const { // mechanical energy about rest, J
  const double d1 = st[S_Q1] - k[K_R1];
  return 0.5 * (k1 * d1 * d1 + m1 * st[S_V1] * st[S_V1] + k2 * st[S_Q2] * st[S_Q2] + m2 * st[S_V2] * st[S_V2]);
}

// One step (of this reed's own length h), with st[S_AIN] the reed's share of the pallet opening,
// io[0] the reservoir pressure and io[1] the cassotto's. Leaves in st[S_DW] the rate of change
// of the flow leaving downstream, d/dt (U_g + Σ Sₙ vₙ): the reed's sound.
void HarmoniumEngine::Reed::step() {
  const double a = st[S_AIN], P = io[0], pd = io[1], rho = 1.2, nz = noise[ni];
  ni = ni + 1 == NOISE_N ? 0 : ni + 1;
  const double tlo = k[K_TLO], tidy = k[K_TIDY], tdy = k[K_TDY], tn2 = k[K_TN2];
  // free motion of each mode over the step (about its rest)
  const double r1 = k[K_R1], q10 = st[S_Q1], v10 = st[S_V1], q20 = st[S_Q2], v20 = st[S_V2];
  const double vt = v10 + v20, fd = -(vt < 0 ? -vt : vt) * vt; // the air's drag on the tongue (explicit: it is slow)
  const double d1 = q10 - r1, qf1 = r1 + k[K_A11] * d1 + k[K_A12] * v10 + k[K_DQ] * fd, vf1 = k[K_A21] * d1 + k[K_A22] * v10 + k[K_DV] * fd;
  const double qf2 = k[K_B11] * q20 + k[K_B12] * v20, vf2 = k[K_B21] * q20 + k[K_B22] * v20;
  const double S1 = k[K_S1], S2 = k[K_S2], gq1 = k[K_GQ1], gv1 = k[K_GV1], gq2 = k[K_GQ2], gv2 = k[K_GV2], gq = gq1 + gq2, dvS = k[K_DVS];
  const double dpOld = st[S_DP], dp0 = dpOld + nz * NOISE * (dpOld < 0 ? -dpOld : dpOld); // with turbulence
  // BDF2: (3z' − 4z + z⁻)/2h, written as 1.5(z' − ẑ)/h with ẑ = (2z − ½z⁻)/1.5
  const double x0 = st[S_X], U0 = st[S_UIN], pc0 = st[S_PC];
  const double Uh = (4 * U0 - st[S_UINP]) * (1.0 / 3), xh = (4 * x0 - st[S_XP]) * (1.0 / 3), pch = (4 * pc0 - st[S_PCP]) * (1.0 / 3);
  const double rlh = k[K_RLH], Ch = k[K_CH];
  const bool open = a > 1e-6;
  const double ha = open ? a * k[K_HAK] : 0, alpha = open ? k[K_ALK] / a : 0;
  double x = 2 * x0 - st[S_XP], lo = -INF, hi = INF; // start from the extrapolated jet speed
  double dpn = 0, Un = 0, q1 = 0, v1 = 0, q2 = 0, v2 = 0, A = 0, pcn = 0;
  for (int it = 0; it < MAX_INNER; it++) {
    const double ax = x < 0 ? -x : x;
    dpn = rlh * (x - xh) + (0.5 * rho * ax + EPS_V) * x; // unsteady Bernoulli through the gap
    const double D = rlh + rho * ax + EPS_V;
    pcn = pd + dpn;
    double dUn = 0;
    if (open) { // the throat, implicit in U_in': U' + α U'|U'| = B
      const double B = Uh + ha * (P - pcn), sq = std::sqrt(1 + 4 * alpha * (B < 0 ? -B : B));
      Un = (2 * B) / (1 + sq); dUn = (-ha * D) / sq;
    } else Un = 0;
    // the reed under the mean pressure difference over the step
    const double Fa = 0.5 * (dp0 + dpn);
    q1 = qf1 + gq1 * Fa; v1 = vf1 + gv1 * Fa; q2 = qf2 + gq2 * Fa; v2 = vf2 + gv2 * Fa;
    // the gap's area at the tip's height (table, linear interpolation)
    const double u = (q1 + q2 - tlo) * tidy;
    int j;
    if (!(u >= 0)) j = 0; else if (u >= tn2) j = (int)tn2; else j = (int)u;
    const double a0 = T[j], dA = (T[j + 1] - a0) * tidy;
    A = a0 + dA * (u - j) * tdy;
    if (A < 1e-12) A = 1e-12;
    // the cell's air balance (BDF2)
    const double r = Ch * (pcn - pch) - Un + CD * A * x + S1 * v1 + S2 * v2;
    const double dr = Ch * D - dUn + CD * (A + 0.5 * x * dA * gq * D) + dvS * D;
    const double step = r / dr, tol = 1e-2 * (ax + 0.1);
    if (step < tol && step > -tol) { // close enough: take the Newton step, carrying the state along linearly
      const double dx = -step, dF = 0.5 * D * dx;
      dpn += D * dx; pcn += D * dx; Un += dUn * dx;
      q1 += gq1 * dF; v1 += gv1 * dF; q2 += gq2 * dF; v2 += gv2 * dF;
      A += dA * gq * dF; x += dx;
      break;
    }
    if (r > 0) hi = x; else lo = x;
    double xn = x - step;
    if (!(xn > lo && xn < hi)) xn = lo > -INF && hi < INF ? 0.5 * (lo + hi) : r > 0 ? x - 2 * (ax + 1) : x + 2 * (ax + 1);
    x = xn;
  }
  st[S_Q1] = q1; st[S_V1] = v1; st[S_Q2] = q2; st[S_V2] = v2;
  st[S_PCP] = pc0; st[S_UINP] = U0; st[S_XP] = x0;
  st[S_X] = x; st[S_DP] = dpn; st[S_PC] = pcn; st[S_UIN] = Un; st[S_A] = A;
  const double Ug = CD * A * x, W = Ug + S1 * v1 + S2 * v2, dW = (W - st[S_W]) * fsr;
  st[S_UG] = Ug; st[S_W] = W; st[S_DW] = dW;
  if (track) { // live pitch: upward crossings of y through its running mean, and the amplitude
    const double y = q1 + q2, ym = st[S_YM] + k[K_YMA] * (y - st[S_YM]), yc = y - ym, py = st[S_PREVY], t = st[S_T] + 1;
    st[S_YM] = ym; st[S_T] = t;
    if (py < 0 && yc >= 0) {
      const double tc = t - 1 + py / (py - yc), lx = st[S_LASTX];
      if (lx >= 0) { const double T1 = tc - lx, per = st[S_PER]; st[S_PER] = per > 0 ? per + 0.3 * (T1 - per) : T1; }
      st[S_LASTX] = tc; st[S_NX] += 1;
    }
    st[S_PREVY] = yc;
    const double ay = yc < 0 ? -yc : yc, amp = st[S_AMP];
    st[S_AMP] = ay > amp ? ay : amp * ampK;
  }
}

// ---- the engine ----------------------------------------------------------------------------

HarmoniumEngine::HarmoniumEngine(double fs, uint32_t seed)
    : Engine(fs), h(1 / fs),
      keys([this](int key, uint64_t ver) {
        const Snapshot &s = snapshots[ver % snapshots.size()];
        Voicing v;
        v.set = s.v[0].load(std::memory_order_relaxed); v.clearance = s.v[1].load(std::memory_order_relaxed); v.q = s.v[2].load(std::memory_order_relaxed);
        v.throat = s.v[3].load(std::memory_order_relaxed); v.cell = s.v[4].load(std::memory_order_relaxed); v.detune = s.v[5].load(std::memory_order_relaxed);
        auto d = std::make_unique<KeyReeds>();
        for (int r = 0; r < NRANKS; r++) reedModel(rankFreq(key, r, v), v, d->r[r]);
        return d;
      }) {
  for (auto &s : snapshots) for (auto &x : s.v) x.store(0);
  fir = halfband();
  configure(seed, F_OS, false);
}

void HarmoniumEngine::configure(uint32_t seed, double fos, bool track) {
  fOS = fos; trackAll = track;
  rng = seed ? seed : 1;
  for (int i = 0; i < NOISE_N; i++) noise[i] = rand();
}

// xorshift32: seeded, so renders repeat exactly
double HarmoniumEngine::rand() {
  uint32_t s = rng;
  s ^= s << 13; s ^= s >> 17; s ^= s << 5;
  rng = s;
  return s / 4294967296.0 - 0.5;
}

void HarmoniumEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
  const double dk[6] = {P[p::set], P[p::clearance], P[p::q], P[p::throat], P[p::cell], P[p::detune]};
  bool changed = version == 0;
  for (int i = 0; i < 6; i++) if (dk[i] != designKey[i]) changed = true;
  if (changed) { // a new version of every key's reeds: new notes get theirs
    for (int i = 0; i < 6; i++) designKey[i] = dk[i];
    version++;
    Snapshot &s = snapshots[version % snapshots.size()];
    for (int i = 0; i < 6; i++) s.v[i].store(dk[i], std::memory_order_relaxed);
    keys.prepare(version, KEY_MIN, KEY_MAX, focus ? focus->key : 60);
  }
  Ptarget = P[p::pressure];
  if (!started) { Pres = Pt = P[p::pressure]; started = true; cOn = P[p::cassotto] ? 1 : 0; cassF = P[p::cassF]; cass = cassotto(P[p::cassF]); }
}

// The voice's reeds, once its key's are designed: what noteOn does with them.
void HarmoniumEngine::start(Voice &v) {
  const bool focused = focus == &v;
  for (int r = 0; r < NRANKS; r++) { v.reeds[r].track = focused; v.reeds[r].init(*this, v.data.data->r[r]); }
  v.pending = false;
  for (int r = 0; r < NRANKS; r++) if (v.mute[r] > 0 && v.down) v.reeds[r].asleep = false;
  // percussion: a hammer strikes the 8′ reed (into the slot) as the key goes down
  if (P[p::percussion] && v.mute[1] > 0 && v.down) {
    Reed &rd = v.reeds[1];
    const ReedModel &R = *rd.R;
    const double xh = 0.7, vt = percussionSpeed(v.vel);
    const double J = (vt * rd.m1) / modeShape(R.modes[0].lam, xh);
    rd.st[S_V1] += J * modeShape(R.modes[0].lam, xh) / rd.m1;
    if (rd.two) rd.st[S_V2] += (J * modeShape(R.modes[1].lam, xh)) / rd.m2;
  }
}

void HarmoniumEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < 0 || key > 127) return;
  Voice *v = byKey[key];
  if (v && (v->dead || v->fading || v->version != version)) { if (!v->dead) v->fading = true; v = nullptr; }
  if (!v) {
    for (Voice &s : pool) { // a free slot (one in no list)
      bool used = false;
      for (int i = 0; i < count && !used; i++) used = voices[i] == &s;
      if (!used) { v = &s; break; }
    }
    if (!v) return; // the pool is full of fading voices: drop the note
    Voice &n = *v;
    n.key = key; n.version = version; n.data = {}; n.pending = true; n.vel = velocity;
    for (Reed &rd : n.reeds) rd = Reed{};
    engaged(P.data(), on);
    for (int r = 0; r < NRANKS; r++) n.mute[r] = on[r] ? 1 : 0;
    for (double &x : n.s) x = 0;
    n.s[V_FADE] = 1;
    n.down = false; n.fading = false; n.dead = false; n.age = 0;
    std::tie(n.gl, n.gr) = keyPan(key, 0.5, 36, 96);
    n.nList = 0;
    voices[count++] = v; byKey[key] = v;
    if (auto d = keys.get(key, version)) { n.data = d; keys.acquire(d); for (int r = 0; r < NRANKS; r++) n.reeds[r].init(*this, d.data->r[r]); n.pending = false; }
    // too many keys: the quietest released one (never a young one) fades out
    int live = 0;
    for (int i = 0; i < count; i++) if (!voices[i]->fading && !voices[i]->dead) live++;
    if (live > MAX_KEYS) {
      Voice *victim = nullptr;
      double score = INF;
      for (int i = 0; i < count; i++) {
        Voice *u = voices[i];
        if (u == v || u->fading || u->age < YOUNG) continue;
        const double s = (u->down ? 1e6 : 0) + u->s[V_ENV];
        if (s < score) { score = s; victim = u; }
      }
      if (victim) victim->fading = true;
    }
  }
  v->down = true; v->s[V_AT] = 1; v->s[V_AR] = 1 / (palletOpen(velocity) * fs); v->vel = velocity;
  if (!v->pending) {
    for (int r = 0; r < NRANKS; r++) if (v->mute[r] > 0) v->reeds[r].asleep = false;
    if (P[p::percussion] && v->mute[1] > 0) {
      Reed &rd = v->reeds[1];
      const ReedModel &R = *rd.R;
      const double xh = 0.7, vt = percussionSpeed(velocity);
      const double J = (vt * rd.m1) / modeShape(R.modes[0].lam, xh);
      rd.st[S_V1] += J * modeShape(R.modes[0].lam, xh) / rd.m1;
      if (rd.two) rd.st[S_V2] += (J * modeShape(R.modes[1].lam, xh)) / rd.m2;
    }
  }
  setFocus(v);
}

void HarmoniumEngine::setFocus(Voice *v) {
  if (focus == v) return;
  if (focus && !trackAll) for (Reed &rd : focus->reeds) rd.track = false;
  focus = v;
  if (v) for (Reed &rd : v->reeds) rd.track = true;
}

void HarmoniumEngine::noteOff(int key, double velocity) {
  if (key < 0 || key > 127) return;
  Voice *v = byKey[key];
  if (!v) return;
  v->down = false; v->s[V_AT] = 0; v->s[V_AR] = 1 / (palletClose(velocity) * fs);
  press[key] = 0; updateAfter();
}

void HarmoniumEngine::allNotesOff() {
  for (int i = 0; i < count; i++) { Voice &v = *voices[i]; v.fading = true; v.down = false; v.s[V_AT] = 0; }
}

int HarmoniumEngine::voiceCount() const {
  int n = 0;
  for (int i = 0; i < count; i++) for (const Reed &r : voices[i]->reeds) if (!r.asleep) n++;
  return n;
}

void HarmoniumEngine::pressure(double value, int key) {
  if (key < 0) { press.fill(0); after = value; }
  else if (key < 128) { press[key] = value; updateAfter(); }
}
void HarmoniumEngine::updateAfter() { double a = 0; for (int k = 0; k < 128; k++) if (press[k] > a) a = press[k]; after = a; }

void HarmoniumEngine::bend(double value) {
  bendTo = std::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12);
}

void HarmoniumEngine::process(float *L, float *R, int n) {
  for (int at = 0; at < n; at += 128) {
    const int m = std::min(128, n - at);
    if (bendNow != bendTo) { // the pitch wheel glides; every reed is retuned each block
      bendNow += (bendTo - bendNow) * (1 - std::exp(-m / (BEND_T * fs)));
      if (std::fabs(bendNow - bendTo) < 1e-9) bendNow = bendTo;
      for (int i = 0; i < count; i++) for (Reed &r : voices[i]->reeds) if (r.R) r.stiffen(bendNow);
    }
    run(L + at, R + at, m);
  }
  keys.audioCycle();
}

void HarmoniumEngine::run(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasParams) return;
  // voices whose reeds were not designed when the key went down (the plugin's worker) start now
  for (int i = 0; i < count; i++) {
    Voice &v = *voices[i];
    if (!v.pending || v.fading) continue;
    v.version = version;
    if (auto d = keys.get(v.key, version)) { v.data = d; keys.acquire(d); start(v); }
  }
  const double h = this->h;
  engaged(P.data(), on);
  const double mStep = (n * h) / MUTE, g = 1 - std::exp(-h / GLIDE);
  // the wind: effort (target × aftertouch × pumping) into the reservoir, or the chest alone
  const double Cw = WIND.G * windTau(P.data()), kw = h / Cw, G = WIND.G, pumpRate = P[p::pump];
  // the cassotto's coefficients (its tuning glides per block)
  const double cTarget = P[p::cassotto] ? 1 : 0;
  if (cassF != P[p::cassF]) {
    cassF += (P[p::cassF] - cassF) * std::min(1.0, n / fs / 0.05);
    if (std::fabs(cassF - P[p::cassF]) < 0.5) cassF = P[p::cassF];
    cass = cassotto(cassF);
  }
  const Cassotto cs = cass;
  const double cA = cs.C / h, cB = cs.M / h + 0.5 * cs.R, det = cA * cB + 0.25; // trapezoidal Helmholtz step
  const bool cassRun = cTarget > 0 || cOn > 1e-6;
  if (!cassRun) { cOn = 0; pd = 0; Uk = 0; UkPrev = 0; Wlast = 0; }
  const double fadeK = 1 - h / FADE;
  for (int k = 0; k < count; k++) { // mutes follow the stops; list the reeds that are awake
    Voice &v = *voices[k];
    v.nList = 0;
    if (v.pending) continue;
    for (int r = 0; r < NRANKS; r++) {
      const double tgt = on[r] ? 1 : 0;
      if (v.mute[r] != tgt) { v.mute[r] = tgt > v.mute[r] ? std::min(1.0, v.mute[r] + mStep) : std::max(0.0, v.mute[r] - mStep); if (tgt && v.down) v.reeds[r].asleep = false; }
      if (!v.reeds[r].asleep) { v.list[v.nList] = &v.reeds[r]; v.amul[v.nList] = v.mute[r]; v.nList++; }
    }
  }
  double Pt = this->Pt, afterS = this->afterS, cOn = this->cOn, Pres = this->Pres;
  const double Ptarget = this->Ptarget, after = this->after;
  const Voice *f = focus && !focus->dead && !focus->pending ? focus : nullptr;
  double UtotLast = 0, fAcc = 0;
  for (int i = 0; i < n; i++) {
    // knobs glide
    Pt += g * (Ptarget - Pt); afterS += g * (after - afterS);
    double eff = Pt * (1 + afterS);
    if (pumpRate > 0) { eff *= pumpShape(tWind, pumpRate); tWind += h; }
    io[0] = Pres; io[1] = cassRun ? (cOn += g * (cTarget - cOn)) * pd : 0;
    double Utot = 0, Wtot = 0, l0 = 0, l1 = 0, r0 = 0, r1 = 0;
    for (int k = 0; k < count; k++) {
      Voice &v = *voices[k];
      if (v.dead || v.pending) continue;
      double *vsd = v.s;
      double va = vsd[V_A];
      const double at = vsd[V_AT];
      if (va != at) { const double ar = vsd[V_AR]; va = at > va ? std::min(at, va + ar) : std::max(at, va - ar); vsd[V_A] = va; }
      double s0 = 0, s1 = 0, W = 0;
      for (int r = 0; r < v.nList; r++) { // each reed at its own rate: two half steps, or one step held
        Reed &rd = *v.list[r];
        double *st = rd.st;
        st[S_AIN] = va * v.amul[r];
        if (rd.os == 2) {
          rd.step(); s0 += st[S_DW]; const double u = st[S_UIN], w = st[S_W];
          rd.step(); s1 += st[S_DW]; Utot += 0.5 * (u + st[S_UIN]); W += 0.5 * (w + st[S_W]);
        } else {
          rd.step(); const double d = st[S_DW]; s0 += d; s1 += d; Utot += st[S_UIN]; W += st[S_W];
        }
      }
      double fade = vsd[V_FADE];
      if (v.fading) vsd[V_FADE] = fade *= fadeK;
      const double gF = OUT * (1 - cOn) * fade;
      s0 *= gF; s1 *= gF;
      Wtot += W * fade;
      l0 += v.gl * s0; l1 += v.gl * s1; r0 += v.gr * s0; r1 += v.gr * s1;
      const double as = s0 < 0 ? -s0 : s0, env = vsd[V_ENV];
      vsd[V_ENV] = as > env ? as : env * 0.9998;
      if (&v == f) fAcc += s0 * s0 + s1 * s1;
    }
    if (cassRun) { // the cassotto: C dp/dt = ΣW − U_k, M dU_k/dt = p − R U_k (trapezoidal)
      const double p0 = pd, u0 = Uk;
      const double rhs1 = cA * p0 + 0.5 * (Wtot + Wlast - u0), rhs2 = (cs.M / h) * u0 + 0.5 * (p0 - cs.R * u0);
      const double pn = (rhs1 * cB - 0.5 * rhs2) / det, un = (rhs2 + 0.5 * pn) / cB;
      pd = pn; Uk = un; Wlast = Wtot;
      const double c = (0.7071 * OUT * cOn * (un - UkPrev)) / h; UkPrev = un;
      l0 += c; l1 += c; r0 += c; r1 += c;
    }
    hiL[2 * i] = l0; hiL[2 * i + 1] = l1; hiR[2 * i] = r0; hiR[2 * i + 1] = r1;
    // the reservoir: C dP/dt = G (P_effort − P) − Σ U_in
    Pres += kw * (G * (eff - Pres) - Utot);
    if (Pres < 0) Pres = 0;
    UtotLast = Utot; Usum += Utot; Ucnt++;
    if (f) record(*f); // the focused reed's trace, for the views
  }
  this->Utot = UtotLast;
  this->Pt = Pt; this->afterS = afterS; this->cOn = cOn; this->Pres = Pres;
  decimate(L, R, n);
  // retire voices: pallet shut, every reed asleep
  for (int k = 0; k < count; k++) {
    Voice &v = *voices[k];
    v.age += n / fs;
    if (v.pending) { if (v.fading) v.dead = true; continue; }
    if (v.fading && v.s[V_FADE] < 1e-4) { v.dead = true; continue; }
    int awake = 0;
    for (int r = 0; r < NRANKS; r++) {
      Reed &rd = v.reeds[r];
      if (rd.asleep) continue;
      const bool shut = v.s[V_A] == 0 || v.mute[r] == 0;
      // asleep once its pallet or mute is shut and it has gone quiet
      const bool quiet = (v.s[V_A] == 0 && v.s[V_ENV] < 1e-5) || rd.energy() < 1e-9;
      if (shut && quiet && std::fabs(rd.st[S_PC]) < 0.05 && std::fabs(rd.st[S_UIN]) < 1e-7) { rd.asleep = true; rd.reset(); } else awake++;
    }
    if (!awake && !v.down && v.s[V_A] == 0) v.dead = true;
  }
  int j = 0;
  for (int k = 0; k < count; k++) {
    Voice *v = voices[k];
    if (v->dead) { if (byKey[v->key] == v) byKey[v->key] = nullptr; keys.release(v->data); v->data = {}; }
    else voices[j++] = v;
  }
  count = j;
  if (focus && focus->dead) setFocus(nullptr);
  if (messages) {
    envBuf[nEnv % ENV] = std::sqrt(fAcc / (2 * n)); nEnv++; // the focused key's rms over the block
    if (++blocks >= POST_BLOCKS) { blocks = 0; postView(n); }
  }
}

// 2× → 1×: the half-band FIR, whose every other tap (but the centre) is zero. The history is
// kept twice over so that the taps read it without wrapping.
void HarmoniumEngine::decimate(float *L, float *R, int n) {
  constexpr int M = 63, c = (M - 1) / 2;
  const double *hf = fir.data();
  double *hl = histL.data(), *hr = histR.data();
  int p = hpos;
  for (int i = 0; i < n; i++) {
    for (int k = 0; k < 2; k++) { const double xl = hiL[2 * i + k], xr = hiR[2 * i + k]; hl[p] = hl[p + M] = xl; hr[p] = hr[p + M] = xr; p = p + 1 == M ? 0 : p + 1; }
    // the newest sample sits at p − 1; tap t multiplies the sample t steps back
    double sl = hf[c] * hl[p + M - 1 - c], sr = hf[c] * hr[p + M - 1 - c];
    for (int t = 0; t < M; t += 2) { const int q = p + M - 1 - t; sl += hf[t] * hl[q]; sr += hf[t] * hr[q]; } // c is odd: the even taps are the nonzero ones
    L[i] = (float)sl; R[i] = (float)sr;
  }
  hpos = p;
}

// The reed the views show: the focused key's first sounding rank (8′ if it is drawn).
int HarmoniumEngine::shownReed(const Voice &v) const {
  static constexpr int order[] = {1, 2, 3, 0, 4};
  for (int r : order) if (v.mute[r] > 0 && !v.reeds[r].asleep) return r;
  return 1;
}
void HarmoniumEngine::record(const Voice &v) {
  Trace &tr = trace;
  if (++tr.cnt < tr.dec) return;
  tr.cnt = 0;
  const double *st = v.reeds[shownReed(v)].st;
  const int w = tr.w;
  tr.y[w] = st[S_Q1] + st[S_Q2]; tr.U[w] = st[S_UG]; tr.A[w] = st[S_A]; tr.dp[w] = st[S_DP];
  tr.w = w + 1 == (int)tr.y.size() ? 0 : w + 1;
}
void HarmoniumEngine::postView(int n) {
  const Voice *v = focus && !focus->pending ? focus : nullptr;
  Trace &tr = trace;
  const double P_ = Pres, Ptgt = Pt * (1 + afterS), Uair = Ucnt ? Usum / Ucnt : Utot;
  Usum = 0; Ucnt = 0;
  const int reeds = voiceCount();
  const double dtEnv = n / fs;
  Message m;
  // the envelope since the last post, oldest first
  const int ne = std::min(nEnv, POST_BLOCKS);
  m.type = msg::env; m.key = 0; m.count = (uint16_t)ne;
  for (int i = 0; i < ne; i++) m.values[i] = (float)envBuf[(nEnv - ne + i) % ENV];
  post(m);
  Message hd;
  hd.type = msg::reed;
  float *x = hd.values;
  x[1] = (float)P_; x[2] = (float)Ptgt; x[3] = (float)Uair; x[4] = (float)reeds; x[11] = (float)dtEnv;
  hd.count = 29;
  if (!v) { hd.key = 0; post(hd); return; }
  const int r = shownReed(*v);
  const Reed &rd = v->reeds[r];
  const ReedModel &R = *rd.R;
  // the trace: about 2.5 periods at TRACE points, decimated from the internal rate
  const double per = 1 / (R.fSound * h);
  const int dec = std::max(1, (int)std::floor((2.5 * per) / TRACE + 0.5));
  if (dec != tr.dec) { tr.dec = dec; tr.cnt = 0; }
  const int Ln = (int)tr.y.size();
  const std::array<double, TRACE * 8> *arrays[4] = {&tr.y, &tr.U, &tr.A, &tr.dp};
  for (int a = 0; a < 4; a++) {
    for (int i0 = 0; i0 < TRACE; i0 += 29) {
      Message t;
      t.type = msg::trace; t.key = (int16_t)a;
      const int c = std::min(29, TRACE - i0);
      t.values[0] = (float)i0;
      for (int i = 0; i < c; i++) t.values[1 + i] = (float)(*arrays[a])[(tr.w - TRACE + i0 + i + Ln) % Ln];
      t.count = (uint16_t)(c + 1);
      post(t);
    }
  }
  hd.key = (int16_t)v->key;
  x[0] = (float)r; x[5] = (float)R.fSound; x[6] = (float)R.fNat; x[7] = (float)rd.st[S_YM]; x[8] = (float)TRACE; x[9] = (float)(dec * h);
  const Geo &g = R.geo;
  x[12] = (float)g.L; x[13] = (float)g.b; x[14] = (float)g.h; x[15] = (float)g.e; x[16] = (float)g.delta; x[17] = (float)g.y0; x[18] = (float)R.modes[0].lam;
  for (int k = 0; k < NRANKS; k++) { const Reed &q = v->reeds[k]; x[19 + k] = (float)(!q.asleep && v->mute[k] > 0 ? q.freq() : 0); x[24 + k] = (float)q.st[S_AMP]; }
  post(hd);
}

} // namespace forte::harmonium
