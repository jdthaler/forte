// quantum-engine.cpp — the Quantum Keyboard's engine (quantum-engine.h).

#include "quantum-engine.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/fdlibm.h"

namespace forte::quantum {

namespace fd = forte::fdlibm;
using std::numbers::pi;

constexpr double OUT = 0.3;      // launch peak at full velocity
constexpr double TAU_MIN = 1e-4; // shortest pump ramp, s (keeps the onset below Nyquist)
constexpr double SLIDE_T = 0.02; // s: a note's slide (its dephasing rate) glides with this time constant
constexpr int KEY_LO = 21, KEY_HI = 108; // the descriptor's range, A0–C8: the packets built ahead

static double erf(double x) { // Abramowitz & Stegun 7.1.26, |error| < 1.5e-7
  const double s = x < 0 ? -1 : 1, a = std::fabs(x), t = 1 / (1 + 0.3275911 * a);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * fd::exp(-a * a));
}
static bool truthy(double x) { return x != 0 && !std::isnan(x); }

// ---- a voice: one wavepacket ---------------------------------------------------------------------

bool QuantumEngine::Voice::start(const QuantumEngine &eng, int k, double vel, const Packet &p) {
  const double fs = eng.fs;
  const int NP = (int)p.pairs.size();
  // States lo..hi (every state some pair uses). Pairs come sorted by Δn = k and then by i, so each
  // group k is a contiguous run of i: (i, i+k), i = a…b−1.
  int lo = INT32_MAX, hi = INT32_MIN;
  for (const Pair &q : p.pairs) { lo = std::min(lo, q.i); hi = std::max(hi, q.j); }
  const int nS = NP ? hi - lo + 1 : 0;
  if (nS > MAX_STATES) return false; // (σ ≤ 4 spans at most 49)
  key = k; pk = &p; S = nS;
  first = NP ? lo : 0;
  const double Eref = NP ? p.E[lo] : 0;
  for (int s = 0; s < S; s++) {
    const double t = (2 * pi * p.scale * (p.E[lo + s] - Eref)) / fs;
    th[s] = t; cr[s] = fd::cos(t); ci[s] = fd::sin(t);
  }
  G = 0;
  int nw = 0, last = 0;
  for (const Pair &q : p.pairs) {
    const int i = q.i - lo;
    const double wv = truthy(q.w) ? q.w : 0; // (|| 0)
    if (G && gk[G - 1] == q.k) {
      for (int z = last + 1; z < i; z++) w[nw++] = 0; // the run's gaps
      w[nw++] = wv; gb[G - 1] = i + 1;
    } else {
      if (G == MAX_STATES || nw >= MAX_W) return false;
      gk[G] = q.k; ga[G] = i; gb[G] = i + 1; gw[G] = nw; G++;
      w[nw++] = wv;
    }
    last = i;
  }
  for (int g = 0; g < G; g++) { gD[g] = 1; gR[g] = 1; }
  useIm = p.d == coil;
  // the electrode's Franck–Condon offset, faded out by its AC coupling over DC_FADE
  dc = truthy(p.dc) ? p.dc : 0; dcEnd = (int64_t)jsRound(DC_FADE * fs);
  // pump pulse: τ = 1/(√2 σ ω_cl); the coherences start at count = −4τ·fs
  const double tau = std::max(TAU_MIN, 1 / (std::numbers::sqrt2 * p.sigma * 2 * pi * p.pitch));
  rampK = 1 / (std::numbers::sqrt2 * tau * fs);
  count = -(int64_t)std::ceil(4 * tau * fs);
  rampEnd = -count;
  env = OUT * vel;
  // across C2–C7, the keyboard it was first drawn on; the keys beyond sit at its ends
  const double pan = std::max(-1.0, std::min(1.0, (2.0 * (k - 36)) / (96 - 36) - 1)) * 0.6, a = ((pan + 1) * pi) / 4;
  gl = fd::cos(a); gr = fd::sin(a); // keyPan(key)
  released = quench = stolen = dead = false;
  coh = folded = false; lam = 0; gain = 1; dcB = dcC = 0;
  s0 = 0; s1 = S; active = NP; // the states rotated, and the pairs summed (see trim)
  const double x = eng.expr.slideOr(k, NAN); // a slide starts there
  slid = x == x; deph = slid ? x : eng.P[p::dephase];
  rates(eng);
  return true;
}

// The present amplitude of every pair still summed, appended to buf from index m (past the
// buffer's end, counted but not kept).
int QuantumEngine::Voice::strengths(double *b, int m) const {
  for (int g = 0; g < G; g++) {
    if (gD[g] == 0) continue;
    const double f = env * gD[g];
    for (int i = ga[g], q = gw[g]; i < gb[g]; i++, q++, m++) if (m < BUF) b[m] = f * std::fabs(w[q]) * (coh ? mag[i] * mag[i + gk[g]] : 1);
  }
  return m;
}

// Drop the pairs weaker than tau. Within a group the weights fall off towards both ends of its run,
// so the group shrinks from its ends; the states no group uses any more stop being rotated.
void QuantumEngine::Voice::trim(double tau) {
  int lo = INT32_MAX, hi = 0, n = 0;
  for (int g = 0; g < G; g++) {
    if (gD[g] == 0) continue;
    const double cut = tau / (env * gD[g]);
    const int k = gk[g];
    int a = ga[g], b = gb[g];
    while (a < b && std::fabs(w[gw[g] + a - ga[g]]) * amp(a) * amp(a + k) < cut) a++;
    while (b > a && std::fabs(w[gw[g] + b - 1 - ga[g]]) * amp(b - 1) * amp(b - 1 + k) < cut) b--;
    if (a == b) { gD[g] = 0; continue; }
    gw[g] += a - ga[g]; ga[g] = a; gb[g] = b;
    lo = std::min(lo, a); hi = std::max(hi, b + gk[g]); n += b - a;
  }
  s0 = n ? lo : 0; s1 = n ? hi : 0; active = n;
}

void QuantumEngine::Voice::rates(const QuantumEngine &eng) { // T₁ (or the release quench) and T_φ, applied live
  const double fs = eng.fs, T1 = stolen ? 0.005 : quench ? eng.P[p::release] : eng.P[p::T1];
  r1 = fd::exp(-1 / (fs * T1));
  if (!slid) deph = eng.P[p::dephase];
  const double Gp = std::max(0.0, truthy(deph) ? deph : 0); // Γ_φ = 1/T_φ
  for (int g = 0; g < G; g++) gR[g] = fd::exp(-(gk[g] * gk[g] * Gp) / fs);
  gdt = Gp / fs;
}

// What the electrode's AC coupling takes off the reading at count c, over env.
double QuantumEngine::Voice::offset(int64_t c) const {
  double g = 1;
  if (c < rampEnd) g = 0.5 * (1 + erf((double)c * rampK));
  const double o = coh ? dc * g * g + dcB * g + dcC : dc * g * g;
  return c > 0 ? (c < dcEnd ? 0.5 * o * (1 + fd::cos((pi * (double)c) / (double)dcEnd)) : 0) : o;
}

// The second pulse of a phase-locked pair (Ramsey), on a key whose packet `old` still rings: this
// pulse adds its amplitudes to the ones the first left. The pump's carrier sits δ off the line of
// the packet's central level n₀, and this pulse's phase is φ. With bₙ the old voice's amplitudes
// (its own residual and its pump's g) and T the delay between the two pulses' centres, each state's
// amplitude relative to this pulse's is
//   Rₙ = √(env₁/env₂) · Vₙ · bₙ · e^(−i[(θₙ − θₙ₀)·T·fs − 2πδT + φ]),
// where Vₙ = e^(−Λ(n − n̄)²), Λ = ∫Γ_φ dt, is what dephasing left of the state's coherence with the
// pump. What dephasing took beyond that (each group's coherence over Vₘ·Vₙ, on average) rings on
// in `old`, incoherently. Returns whether `old` has anything left.
bool QuantumEngine::Voice::cohere(const QuantumEngine &eng, Voice &old) {
  const Packet &pkt = *pk;
  const int64_t c1 = old.count - count; // the old pulse's clock at this one's centre (count is −lead)
  const double Ts = (double)c1, T = Ts / eng.fs;
  // what the old packet would have lost by then (T₁, dephasing), over the lead to this pulse's centre
  const int64_t lead = std::max<int64_t>(0, c1 - std::max<int64_t>(old.count + 1, 0));
  const double rho = std::sqrt((std::max(0.0, old.env) * fd::pow(old.r1, (double)lead)) / env);
  const double g1 = c1 < old.rampEnd ? 0.5 * (1 + erf((double)c1 * old.rampK)) : 1;
  double cw = 0, cm = 0, cmax = -1;
  int n0 = 0;
  for (int s = 0; s < S; s++) {
    const double c2 = pkt.c[first + s] * pkt.c[first + s];
    cw += c2; cm += c2 * s;
    if (c2 > cmax) { cmax = c2; n0 = s; }
  }
  const double nb = cw > 0 ? cm / cw : 0, L = old.lam + old.gdt * (double)lead;
  const double Phi = 2 * pi * eng.P[p::ramseyDetune] * T - eng.P[p::ramseyPhase] * (pi / 180);
  std::array<double, MAX_STATES> V{};
  for (int s = 0; s < S; s++) {
    V[s] = fd::exp(-L * (s - nb) * (s - nb));
    const double br = (old.coh ? old.Rr[s] : 0) + g1, bi = old.coh ? old.Ri[s] : 0;
    const double ph = Phi - (th[s] - th[n0]) * Ts, cs = fd::cos(ph), sn = fd::sin(ph), a = rho * V[s];
    Rr[s] = a * (br * cs - bi * sn); Ri[s] = a * (br * sn + bi * cs);
    mag[s] = std::sqrt((Rr[s] + 1) * (Rr[s] + 1) + Ri[s] * Ri[s]);
  }
  coh = true; folded = false;
  double wmax = 0, bmax = 0;
  for (int g = 0; g < G; g++) for (int i = ga[g], q = gw[g]; i < gb[g]; i++, q++) {
    wmax = std::max(wmax, std::fabs(w[q]));
    bmax = std::max(bmax, std::fabs(w[q]) * mag[i] * mag[i + gk[g]]);
  }
  gain = wmax > 0 ? bmax / wmax : 0;
  // the incoherent remainder, group by group
  bool left = false;
  for (int g = 0; g < old.G; g++) {
    if (old.gD[g] == 0) continue;
    const int k = old.gk[g];
    double sw = 0, sv = 0;
    for (int i = old.ga[g], q = old.gw[g]; i < old.gb[g]; i++, q++) {
      const double a = std::fabs(old.w[q]) * old.amp(i) * old.amp(i + k);
      sw += a; sv += a * V[i] * V[i + k];
    }
    const double r = sw > 0 ? 1 - sv / (sw * old.gD[g]) : 0;
    if (r > 1e-6) { old.gD[g] *= r; left = true; } else old.gD[g] = 0;
  }
  // the electrode: the offset this pulse adds (in g² and g), and the one the old voice was still fading
  if (truthy(dc)) for (int g = 0; g < G; g++) {
    const int k = gk[g];
    for (int i = ga[g], q = gw[g]; i < gb[g]; i++, q++) dcB += w[q] * (Rr[i] + Rr[i + k]);
  }
  if (!left) dcC = (old.env * old.offset(old.count)) / env;
  return left;
}

// The key's slide: the dephasing rate glides toward it, block by block (and back to P's once it is
// gone).
void QuantumEngine::Voice::dephase(const QuantumEngine &eng, int n) {
  const double x = eng.expr.slideOr(key, NAN);
  const bool own = x == x;
  if (!own && !slid) return;
  slid = true;
  const double to = own ? x : eng.P[p::dephase], was = deph;
  deph = glideTo(deph, to, n / eng.fs, SLIDE_T);
  if (!own && deph == to) slid = false;
  if (deph != was) rates(eng);
}

// Exact phases from the sample counter: aₙ = e^(−iθₙ·count).
void QuantumEngine::Voice::sync() {
  const double c = (double)count;
  if (coh && folded) { // aₙ = (Rₙ + 1)·e^(−iθₙ·count)
    for (int s = s0; s < s1; s++) {
      const double ph = th[s] * c, cs = fd::cos(ph), sn = fd::sin(ph), br = Rr[s] + 1, bi = Ri[s];
      re[s] = br * cs + bi * sn; im[s] = bi * cs - br * sn;
    }
    return;
  }
  for (int s = s0; s < s1; s++) { const double ph = th[s] * c; re[s] = fd::cos(ph); im[s] = -fd::sin(ph); }
}

template <class T>
void QuantumEngine::Voice::render(T *L, T *R, int n) {
  if (coh) { renderCoherent(L, R, n); return; }
  const int64_t c0 = count;
  sync();
  double e = env;
  for (int t = 0; t < n; t++) {
    const int64_t c = ++count;
    const bool dec = c >= 0; // decoherence clocks start at the pump's centre
    for (int s = s0; s < s1; s++) {
      const double x = re[s], y = im[s];
      re[s] = x * cr[s] + y * ci[s]; im[s] = y * cr[s] - x * ci[s];
    }
    double acc = 0;
    for (int g = 0; g < G; g++) {
      const double D = gD[g];
      if (D == 0) continue;
      const int k = gk[g], b = gb[g];
      int q = gw[g];
      double sum = 0;
      if (useIm) for (int i = ga[g]; i < b; i++, q++) sum += w[q] * (re[i] * im[i + k] - im[i] * re[i + k]);
      else for (int i = ga[g]; i < b; i++, q++) sum += w[q] * (re[i] * re[i + k] + im[i] * im[i + k]);
      acc += D * sum;
      if (dec) { const double Dn = D * gR[g]; gD[g] = Dn < 1e-9 ? 0 : Dn; }
    }
    double ramp = 1;
    if (c < rampEnd) { const double gg = 0.5 * (1 + erf((double)c * rampK)); ramp = gg * gg; }
    if (truthy(dc) && c > 0) acc -= c < dcEnd ? 0.5 * dc * (1 + fd::cos((pi * (double)c) / (double)dcEnd)) : 0;
    else acc -= dc;
    const double v = e * ramp * acc;
    L[t] = (T)(L[t] + gl * v); R[t] = (T)(R[t] + gr * v);
    if (dec) e *= r1;
  }
  env = e;
  lam += gdt * (double)std::max<int64_t>(0, count - std::max<int64_t>(c0 + 1, 0) + 1);
  if (e < 3e-6) dead = true;
}

// A voice a coherent restrike made: while its pump builds, aₙ = (Rₙ + g(t))·e^(−iθₙ·count), the
// phasors times each state's amplitude, sample by sample; once it is done, Rₙ + 1 is in the phasors.
template <class T>
void QuantumEngine::Voice::renderCoherent(T *L, T *R, int n) {
  const int64_t c0 = count;
  const bool fold = folded;
  sync();
  const double *ar = fold ? re.data() : xr.data(), *ai = fold ? im.data() : xi.data();
  const bool off = truthy(dc) || dcB != 0 || dcC != 0;
  double e = env;
  for (int t = 0; t < n; t++) {
    const int64_t c = ++count;
    const bool dec = c >= 0;
    for (int s = s0; s < s1; s++) {
      const double x = re[s], y = im[s];
      re[s] = x * cr[s] + y * ci[s]; im[s] = y * cr[s] - x * ci[s];
    }
    double g = 1;
    if (!fold) {
      if (c < rampEnd) g = 0.5 * (1 + erf((double)c * rampK));
      for (int s = s0; s < s1; s++) {
        const double br = Rr[s] + g, bi = Ri[s];
        xr[s] = re[s] * br - im[s] * bi; xi[s] = re[s] * bi + im[s] * br;
      }
    }
    double acc = 0;
    for (int gi = 0; gi < G; gi++) {
      const double D = gD[gi];
      if (D == 0) continue;
      const int k = gk[gi], b = gb[gi];
      int q = gw[gi];
      double sum = 0;
      if (useIm) for (int i = ga[gi]; i < b; i++, q++) sum += w[q] * (ar[i] * ai[i + k] - ai[i] * ar[i + k]);
      else for (int i = ga[gi]; i < b; i++, q++) sum += w[q] * (ar[i] * ar[i + k] + ai[i] * ai[i + k]);
      acc += D * sum;
      if (dec) { const double Dn = D * gR[gi]; gD[gi] = Dn < 1e-9 ? 0 : Dn; }
    }
    if (off) {
      const double o = dc * g * g + dcB * g + dcC;
      acc -= c > 0 ? (c < dcEnd ? 0.5 * o * (1 + fd::cos((pi * (double)c) / (double)dcEnd)) : 0) : o;
    }
    const double v = e * acc;
    L[t] = (T)(L[t] + gl * v); R[t] = (T)(R[t] + gr * v);
    if (dec) e *= r1;
  }
  env = e;
  lam += gdt * (double)std::max<int64_t>(0, count - std::max<int64_t>(c0 + 1, 0) + 1);
  if (!folded && count >= rampEnd) folded = true;
  if (e * gain < 3e-6) dead = true;
}

// ---- packets as doubles ----------------------------------------------------------------------------

int packPacket(const Packet &pk, double *out, int max) {
  const int N = (int)pk.E.size(), NP = (int)pk.pairs.size(), n = 8 + 2 * N + 5 * NP;
  if (n > max) return 0;
  int k = 0;
  for (double v : {(double)pk.key, (double)pk.d, pk.dc, pk.sigma, pk.pitch, pk.scale, (double)N, (double)NP}) out[k++] = v;
  for (double v : pk.E) out[k++] = v;
  for (int i = 0; i < N; i++) out[k++] = i < (int)pk.c.size() ? pk.c[i] : 0;
  for (const Pair &p : pk.pairs) { out[k++] = p.i; out[k++] = p.j; out[k++] = p.k; out[k++] = p.f; out[k++] = p.w; }
  return n;
}
bool unpackPacket(const double *a, int n, Packet &pk) {
  if (n < 8) return false;
  const int N = (int)a[6], NP = (int)a[7];
  if (N < 0 || NP < 0 || NP > MAX_PAIRS || n != 8 + 2 * N + 5 * NP) return false;
  pk.key = (int)a[0]; pk.d = (int)a[1]; pk.dc = a[2]; pk.sigma = a[3]; pk.pitch = a[4]; pk.scale = a[5];
  pk.E.assign(a + 8, a + 8 + N);
  pk.c.assign(a + 8 + N, a + 8 + 2 * N);
  pk.pairs.resize(NP);
  for (int q = 0; q < NP; q++) {
    const double *b = a + 8 + 2 * N + 5 * q;
    pk.pairs[q] = {(int)b[0], (int)b[1], (int)b[2], b[3], b[4]};
    if (pk.pairs[q].i < 0 || pk.pairs[q].j >= N || pk.pairs[q].i >= pk.pairs[q].j) return false;
  }
  return true;
}

// ---- the engine ----------------------------------------------------------------------------------------

QuantumEngine::QuantumEngine(double fs)
    : Engine(fs), fMax(fMaxAt(fs)), data([this](int key, uint64_t v) { return build(key, v); }) {}

// On the worker (in place without threads): the packet of `key` for the knobs of `version`.
std::unique_ptr<Packet> QuantumEngine::build(int key, uint64_t v) {
  const auto &s = snapshots[v % snapshots.size()];
  PacketParams q;
  q.potential = (int)s[0].load(); q.eta = s[1].load(); q.lock = s[2].load() != 0; q.bpm = s[3].load();
  q.beats = s[4].load(); q.nbar = s[5].load(); q.sigma = s[6].load(); q.detector = (int)s[7].load();
  for (int i = 0; i < 12; i++) q.tuning.r[i] = s[8 + i].load();
  return std::make_unique<Packet>(makePacket(key, q, fMax));
}

bool QuantumEngine::offer(const double *packed, int n) {
#if FORTE_THREADS
  (void)packed; (void)n;
  return false;
#else
  auto d = std::make_unique<Packet>();
  if (!unpackPacket(packed, n, *d)) return false;
  offered = std::move(d);
  return true;
#endif
}

PacketParams QuantumEngine::packetParams() const {
  PacketParams q;
  q.potential = (int)P[p::potential]; q.eta = P[p::eta]; q.lock = P[p::lock] != 0; q.bpm = P[p::bpm];
  q.beats = P[p::beats]; q.nbar = P[p::nbar]; q.sigma = P[p::sigma]; q.detector = (int)P[p::detector];
  q.tuning = tuningOf(P.data());
  return q;
}

void QuantumEngine::setParams(const double *v) {
  const bool first = !hasParams;
  for (int i = 0; i < p::count; i++) P[i] = v[i];
  hasParams = true;
  // the packets are built for the knobs as they are, nearest the last key played first
  const PacketParams q = packetParams();
  if (first || !(q == pp)) {
    pp = q;
    version++;
    auto &s = snapshots[version % snapshots.size()];
    s[0].store(q.potential); s[1].store(q.eta); s[2].store(q.lock ? 1 : 0); s[3].store(q.bpm);
    s[4].store(q.beats); s[5].store(q.nbar); s[6].store(q.sigma); s[7].store(q.detector);
    for (int i = 0; i < 12; i++) s[8 + i].store(q.tuning.r[i]);
    data.prepare(version, KEY_LO, KEY_HI, nVoices ? voices[nVoices - 1]->key : 60);
  }
  for (int i = 0; i < nVoices; i++) voices[i]->rates(*this);
}

void QuantumEngine::noteOn(int key, double velocity) {
  if (!hasParams) return;
  if (offered && offered->key == key) { startNote(key, velocity, {}, std::move(offered)); return; }
  const Data::Ref r = data.get(key, version);
  if (r) { startNote(key, velocity, r, nullptr); return; }
  // the packet is being built (about a millisecond): the note waits for it
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) { pending[i] = {key, velocity, false}; return; }
  if (nPending < (int)pending.size()) pending[nPending++] = {key, velocity, false};
}

void QuantumEngine::retryPending() {
  int j = 0;
  for (int i = 0; i < nPending; i++) {
    const Pending pd = pending[i];
    const Data::Ref r = data.get(pd.key, version);
    if (!r) { pending[j++] = pd; continue; }
    startNote(pd.key, pd.velocity, r, nullptr);
    if (pd.off) noteOff(pd.key, -1);
  }
  nPending = j;
}

// Two packets of the same key's well, alike to the last bit (the page sends a copy with each note).
static bool samePacket(const Packet &a, const Packet &b) {
  return a.key == b.key && a.d == b.d && a.dc == b.dc && a.sigma == b.sigma && a.pitch == b.pitch && a.scale == b.scale &&
         a.E == b.E && a.c == b.c && a.pairs.size() == b.pairs.size();
}

// A restrike excites a fresh packet; the old one rings on (or is already quenching). With Coherent
// restrike on, the new pulse adds to the packet still ringing on the key instead (Voice::cohere),
// unless the knobs have changed its well since.
void QuantumEngine::startNote(int key, double velocity, Data::Ref r, std::unique_ptr<Packet> own) {
  const Packet *pk = own ? own.get() : r.data;
  if (!pk || pk->pairs.empty()) return;
  Voice *v = nullptr;
  for (Voice &u : pool) if (!u.inUse) { v = &u; break; }
  if (!v) return; // every voice busy (beyond anything the stealing below lets happen)
  if (!v->start(*this, key, velocity, *pk)) return;
  v->inUse = true; v->ref = r; v->own = std::move(own);
  data.acquire(r);
  Voice *old = nullptr;
  if (truthy(P[p::ramsey]) && v->env > 0)
    for (int i = nVoices - 1; i >= 0; i--) {
      Voice *u = voices[i];
      if (u->key == key && !u->stolen && !u->dead) { old = u; break; }
    }
  if (old && old->pk && old->first == v->first && old->S == v->S && samePacket(*old->pk, *pk) && !v->cohere(*this, *old)) drop(old);
  voices[nVoices++] = v;
  int live = 0;
  for (int i = nVoices - 1; i >= 0; i--) {
    Voice *u = voices[i];
    if (u->stolen) continue;
    if (++live > MAX_VOICES) { u->stolen = true; u->rates(*this); }
  }
  budget();
}

// At most BUDGET pairs summed per sample, over all voices: past it, the weakest pairs of all, by
// their amplitude now (velocity, T₁ decay and dephasing included), are dropped for good.
void QuantumEngine::budget() {
  int n = 0;
  for (int i = 0; i < nVoices; i++) n += voices[i]->active;
  if (n <= BUDGET) return;
  int m = 0;
  for (int i = 0; i < nVoices; i++) m = voices[i]->strengths(buf.data(), m);
  if (m <= BUDGET) return;
  // the (m − BUDGET)th smallest of what the buffer kept, or none
  const int len = std::min(m, BUF), at = m - BUDGET;
  double tau = NAN;
  if (at < len) { std::nth_element(buf.begin(), buf.begin() + at, buf.begin() + len); tau = buf[at]; }
  for (int i = 0; i < nVoices; i++) voices[i]->trim(tau);
}

// A voice gone at once (its packet taken over by a coherent restrike).
void QuantumEngine::drop(Voice *v) {
  data.release(v->ref); v->ref = {}; v->own.reset(); v->pk = nullptr; v->inUse = false; v->dead = true;
  int j = 0;
  for (int i = 0; i < nVoices; i++) if (voices[i] != v) voices[j++] = voices[i];
  nVoices = j;
}

void QuantumEngine::noteOff(int key, double) {
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) pending[i].off = true;
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    if (v->key == key && !v->released) {
      v->released = true;
      if (!sustain) { v->quench = true; v->rates(*this); }
    }
  }
}

void QuantumEngine::setSustain(bool on) {
  sustain = on;
  if (!on) for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    if (v->released && !v->quench) { v->quench = true; v->rates(*this); }
  }
}

void QuantumEngine::allNotesOff() {
  nPending = 0;
  for (int i = 0; i < nVoices; i++) { Voice *v = voices[i]; data.release(v->ref); v->ref = {}; v->own.reset(); v->pk = nullptr; v->inUse = false; v->dead = true; }
  nVoices = 0;
}

template <class T>
void QuantumEngine::render(T *L, T *R, int n) {
  std::fill(L, L + n, T(0)); std::fill(R, R + n, T(0));
  if (hasParams && nPending) retryPending();
  for (int i = 0; i < nVoices; i++) { voices[i]->dephase(*this, n); voices[i]->render(L, R, n); }
  int j = 0; // drop finished voices in place (no allocation; an offered packet goes with its voice)
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    if (v->dead) { data.release(v->ref); v->ref = {}; v->own.reset(); v->pk = nullptr; v->inUse = false; }
    else voices[j++] = v;
  }
  nVoices = j;
  data.audioCycle();
}
void QuantumEngine::process(float *L, float *R, int n) { render(L, R, n); }
void QuantumEngine::process(double *L, double *R, int n) { render(L, R, n); }

} // namespace forte::quantum
