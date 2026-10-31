// regal-engine.cpp — the regal's engine (regal-engine.h).

#include "regal-engine.h"

#include <algorithm>
#include <cmath>
#include <limits>

#include "forte/dsp.h"

namespace forte::regal {

constexpr double OUT = 0.06;      // output units per m³/s² of the mouths' volume acceleration
constexpr int MAX_KEYS = 16;       // keys sounding at once
constexpr double FADE = 0.03;      // s: a stolen key fades out over this
constexpr double YOUNG = 0.05;     // s: a key this young is never stolen
constexpr double MUTE = 0.02;      // s: a stop's mutes open or close over this
constexpr double GLIDE = 0.02;     // s: the wind's weight and aftertouch glide
constexpr double BEND_T = 0.02;    // s: the pitch wheel's glide
constexpr double NOISE = 0.002;    // turbulence: a random pressure on the tongue, ± this × P_b
constexpr int POST_BLOCKS = 6;
constexpr double CDP = 0.61;       // the pallet's contraction
constexpr double PALLET = 25;      // a pallet's full opening over the reed's open gap at rest
constexpr double INF = std::numeric_limits<double>::infinity();

static double palletOpen(double vel) { return 0.003 + 0.027 * (1 - vel) * (1 - vel); } // s
static double palletClose(double vel) { return vel >= 0 ? 0.015 - 0.012 * std::min(1.0, vel) : 0.008; }

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

// ---- a reed in its tube --------------------------------------------------------------------

double RegalEngine::Sim::noise() { // xorshift32, uniform in ±0.5
  uint32_t s = rng;
  s ^= s << 13; s ^= s >> 17; s ^= s << 5;
  rng = s;
  return s / 4294967296.0 - 0.5;
}

void RegalEngine::Sim::init(const Reed &model, double fs, double fOSv, double kr, uint32_t seed) {
  R = &model;
  os = model.f0 >= fOSv ? 2 : 1;
  h = 1 / (fs * os);
  m = model.m; k0 = model.k; k = k0 * kr * kr; c = model.c; S = model.S; h0 = model.h0; bs = model.bs; Ls = model.Ls;
  zc = model.zc;
  // the contact's stiffness, as far as the step can follow it (its frequency flat on the shallot
  // under ωh = 1.2)
  const double wMax = 1.2 / h, KsMax = (wMax * wMax * m - k0) / 0.2357;
  Ks = std::min(model.Ks, std::max(KsMax, 0.0));
  Ch = (model.Vb / (Air::rho * Air::c * Air::c)) / h;
  const double A0 = gapArea(0, h0, bs, Ls);
  Kp = CDP * PALLET * A0 * std::sqrt(2 / Air::rho);
  noiseAmp = NOISE;
  rng = seed ? seed : 1;
  // the tube: cylinders of whole steps (rounded cumulatively), the last with a first-order
  // all-pass for the fraction of its round trip, so the tube's length is kept
  const Tube &t = model.tube;
  const double cs = Air::c * h, ec = endCorrection(t);
  double need = 0;
  for (int i = 0; i < t.n; i++) need += t.len[i];
  need = (need + ec) / cs;
  const double shrink = need * 2 > DL - 8 ? (DL - 8) / (need * 2) : 1; // past the memory: shorter
  nseg = t.n;
  double X = 0;
  int Xr = 0, at = 0;
  const double f = model.f0;
  ap = false;
  for (int i = 0; i < t.n; i++) {
    const bool last = i == t.n - 1;
    const double l = (t.len[i] + (last ? ec : 0)) * shrink, D = l / cs;
    const double a = std::sqrt(t.area[i] / PI);
    gl[i] = std::exp(-((3e-5 * std::sqrt(f)) / a) * l);
    int nR, nLn;
    if (!last) {
      X += D;
      const int r = (int)std::lround(X);
      nR = nLn = std::max(1, r - Xr); Xr += nR;
    } else {
      const double Drt = 2 * (X + D - Xr); // the round trip it has to make up
      if (Drt >= 2.5) {
        const int nt = (int)std::lround(Drt) - 1;
        nR = nt / 2; nLn = nt - nR;
        const double d = Drt - nt; // what the all-pass delays, in [0.5, 1.5]
        eta = (1 - d) / (1 + d); ap = true;
      } else nR = nLn = 1;
    }
    lenR[i] = nR; lenL[i] = nLn; offR[i] = at; at += nR; offL[i] = at; at += nLn;
  }
  for (int i = 0; i + 1 < nseg; i++) rj[i] = (t.area[i] - t.area[i + 1]) / (t.area[i] + t.area[i + 1]);
  Z0 = (Air::rho * Air::c) / t.area[0];
  Zend = (Air::rho * Air::c) / t.area[nseg - 1];
  const double aEnd = std::sqrt(t.area[nseg - 1] / PI), fc = std::min(Air::c / (TAU * aEnd * std::sqrt(3.0)), 0.45 / h);
  beta = std::exp(-TAU * fc * h);
  reset();
}

void RegalEngine::Sim::reset() {
  q = v = Pb = pd = U = Uin = lp = Um = out = apx = apy = env = energy = 0;
  for (int i = 0; i < DL; i++) buf[i] = 0;
  for (int i = 0; i < nseg; i++) posR[i] = posL[i] = 0;
}

// The flow through a gap of conductance K (U = K √Δp) into a tube of impedance Z, with the pressure
// across it X − Z U: U = K √(X − Z U), solved in closed form.
static inline double flow(double K, double Z, double X) {
  if (K <= 0) return 0;
  const double ax = X < 0 ? -X : X, K2Z = K * K * Z;
  const double u = (2 * K * K * ax) / (K2Z + std::sqrt(K2Z * K2Z + 4 * K * K * ax));
  return X < 0 ? -u : u;
}

void RegalEngine::Sim::step(double Pw, double open) {
  // the waves arriving at each segment's ends
  double aR[MAX_SEG], aL[MAX_SEG];
  for (int i = 0; i < nseg; i++) { aR[i] = gl[i] * buf[offR[i] + posR[i]]; aL[i] = gl[i] * buf[offL[i] + posL[i]]; }
  // the tongue: pressure across it, its spring and losses, and the shallot pushing back
  double I, dI;
  contact(q, h0, I, dI);
  double Fc = 0;
  if (I > 0) {
    const double kc = Ks * dI;
    Fc = Ks * I + 2 * zc * std::sqrt(m * kc) * v;
    if (Fc < 0) Fc = 0;
  }
  const double dp = Pb - pd;
  const double F = S * dp * (1 + noiseAmp * noise()) - k * q - c * v - Fc;
  v += (h * F) / m;
  q += h * v;
  // the jet through the gap, into the shallot
  const double A = gapArea(q, h0, bs, Ls), K = CD * A * 1.2909944487358056; // √(2/ρ)
  const double Ur = S * v; // the tongue sweeping air into the shallot
  const double X = Pb - 2 * aL[0] - Z0 * Ur;
  U = flow(K, Z0, X);
  const double Ud = U + Ur;
  pd = 2 * aL[0] + Z0 * Ud;
  const double in0 = aL[0] + Z0 * Ud;
  // the boot, implicitly through its pallet: Ch (P_b' − P_b) = U_in(P_w − P_b') − U − S v
  {
    const double Kpo = Kp * open, Rr = Ch * (Pw - Pb) + Ud;
    double D;
    if (Rr >= 0) { const double s = (2 * Rr) / (Kpo + std::sqrt(Kpo * Kpo + 4 * Ch * Rr)); D = s * s; Uin = Kpo * s; }
    else { const double s = (-2 * Rr) / (Kpo + std::sqrt(Kpo * Kpo - 4 * Ch * Rr)); D = -s * s; Uin = -Kpo * s; }
    Pb = Pw - D;
  }
  // the junctions, then the open end
  double inR[MAX_SEG], inL[MAX_SEG];
  inR[0] = in0;
  for (int i = 0; i + 1 < nseg; i++) {
    const double r = rj[i], a = aR[i], b = aL[i + 1];
    inL[i] = r * a + (1 - r) * b;
    inR[i + 1] = (1 + r) * a - r * b;
  }
  {
    double x = aR[nseg - 1];
    if (ap) { const double y = eta * x + apx - eta * apy; apx = x; apy = y; x = y; }
    lp = (1 - beta) * x + beta * lp;
    const double refl = -lp;
    inL[nseg - 1] = refl;
    const double um = (x - refl) / Zend;
    out = (um - Um) / h;
    Um = um;
  }
  for (int i = 0; i < nseg; i++) {
    buf[offR[i] + posR[i]] = (float)inR[i]; if (++posR[i] == lenR[i]) posR[i] = 0;
    buf[offL[i] + posL[i]] = (float)inL[i]; if (++posL[i] == lenL[i]) posL[i] = 0;
  }
  const double ao = out < 0 ? -out : out;
  env = ao > env ? ao : env * 0.9999;
  energy = 0.5 * m * v * v + 0.5 * k * q * q;
}

// ---- the engine ----------------------------------------------------------------------------

RegalEngine::RegalEngine(double fs, uint32_t s) : Engine(fs) {
  fir = halfband();
  configure(s, 250);
}

void RegalEngine::configure(uint32_t s, double f) { seed = s ? s : 1; fOS = f; }

void RegalEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
  voicing.curve = P[p::curve]; voicing.thick = P[p::thickness]; voicing.q = P[p::q];
  voicing.leather = (int)P[p::facing] == facing_::leather;
  voicing.shape = (int)P[p::resonator]; voicing.resLen = P[p::resLength];
  tuning = tuningOf(P.data());
  on[0] = P[p::regal16] > 0.5; on[1] = P[p::regal8] > 0.5; on[2] = P[p::regal4] > 0.5;
  hand = (int)P[p::bellows] == bellows_::hand;
  P0 = P[p::pressure];
  if (!started) { started = true; P0s = P0; Pbel = Pw = P0; ub = 0; fill[0] = fill[1] = 1; active = 0; }
}

void RegalEngine::bend(double value) { bendTo = std::exp2((value * kBendSemitones) / 12); }

void RegalEngine::updateAfter() {
  double a = press[0];
  for (int k = 1; k < 128; k++) a = std::max(a, press[k]);
  after = a;
}

void RegalEngine::pressure(double value, int key) {
  value = std::clamp(value, 0.0, 1.0);
  if (key < 0) { for (double &x : press) x = 0; press[0] = value; }
  else if (key < 128) press[key] = value;
  updateAfter();
}

int RegalEngine::voiceCount() const {
  int n = 0;
  for (int i = 0; i < count; i++) if (!voices[i]->dead && !voices[i]->fading) n++;
  return n;
}

void RegalEngine::allNotesOff() {
  for (int i = 0; i < count; i++) voices[i]->fading = true;
  for (double &x : press) x = 0;
  after = 0;
}

void RegalEngine::start(Voice &v, double velocity) {
  v.voicing = voicing;
  const double kr = bendNow * v.nb;
  for (int r = 0; r < NRANKS; r++) {
    designKey(v.key, r, voicing, tuning, v.model[r]);
    v.sim[r].init(v.model[r], fs, fOS, kr, seed * 7919u + (uint32_t)(++seq) * 104729u + (uint32_t)r);
    v.sim[r].asleep = !on[r];
    v.mute[r] = on[r] ? 1 : 0;
  }
  (void)velocity;
}

void RegalEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < 0 || key > 127) return;
  Voice *v = byKey[key];
  if (v && (v->dead || v->fading || !(v->voicing == voicing))) { if (!v->dead) v->fading = true; byKey[key] = nullptr; v = nullptr; }
  if (!v) {
    for (Voice &s : pool) if (!s.used) { v = &s; break; }
    if (!v) return; // the pool is full of fading voices: drop the note
    Voice &n = *v;
    n.used = true; n.key = key; n.open = 0; n.openTo = 0; n.fade = 1; n.env = 0; n.age = 0;
    n.down = false; n.fading = false; n.dead = false; n.nb = expr.bendOf(key);
    std::tie(n.gl, n.gr) = keyPan(key, 0.5, 36, 84);
    start(n, velocity);
    voices[count++] = v; byKey[key] = v;
    // too many keys: the quietest released one (never a young one) fades out. Quality: Medium and
    // Low let fewer keys sound
    int live = 0;
    for (int i = 0; i < count; i++) if (!voices[i]->fading && !voices[i]->dead) live++;
    if (live > pick(MAX_KEYS, 10, 6)) {
      Voice *victim = nullptr;
      double score = INF;
      for (int i = 0; i < count; i++) {
        Voice *u = voices[i];
        if (u == v || u->fading || u->age < YOUNG) continue;
        const double s = (u->down ? 1e6 : 0) + u->env;
        if (s < score) { score = s; victim = u; }
      }
      if (victim) victim->fading = true;
    }
  }
  if (v->nb != expr.bendOf(key)) { v->nb = expr.bendOf(key); for (Sim &s : v->sim) s.stiffen(bendNow * v->nb); }
  v->down = true; v->openTo = 1; v->openRate = 1 / (palletOpen(velocity) * fs);
  for (int r = 0; r < NRANKS; r++) if (v->mute[r] > 0 || on[r]) v->sim[r].asleep = false;
  focus = v;
}

void RegalEngine::noteOff(int key, double velocity) {
  if (key < 0 || key > 127) return;
  press[key] = 0; updateAfter();
  Voice *v = byKey[key];
  if (!v) return;
  v->down = false; v->openTo = 0; v->openRate = 1 / (palletClose(velocity) * fs);
}

// The wind, one output sample: the active bellows' board sinking on its air, the calcant raising
// the other, the trunk (and the tremulant's vent) into the chest, the reeds drawing Uin.
void RegalEngine::stepWind(double Uin) {
  const double h = 1 / fs;
  P0s = glideTo(P0s, P0, h, GLIDE);
  afterS = glideTo(afterS, after, h, GLIDE);
  const double P0e = P0s * (1 + 0.25 * afterS);
  double Ut;
  if (hand) {
    const double Cb = (0.5 * V_BELLOWS) / (Air::rho * Air::c * Air::c), Ma = P0e / (G * A_BOARD);
    const double Rb = 2 * BELLOWS_Z * std::sqrt(Ma / Cb);
    const double Peq = bellowsPressure(P0e, fill[active]);
    ub += (h / Ma) * (Peq - Pbel - Rb * ub);
    if (ub < 0 && fill[active] >= 1) ub = 0;
    Ut = G_TRUNK * (Pbel - Pw);
    Pbel += (h / Cb) * (ub - Ut);
    fill[active] -= (ub * h) / V_BELLOWS;
    const int other = 1 - active;
    fill[other] = std::min(1.0, fill[other] + h / RAISE_T);
    if (fill[active] <= 0.02) { // the calcant lets the other bellows take over: its board starts at rest
      fill[active] = std::max(fill[active], 0.0);
      active = other; ub = 0;
    }
  } else {
    Pbel = P0e; fill[0] = fill[1] = 1; ub = 0;
    Ut = G_TRUNK * (Pbel - Pw);
  }
  // the tremulant: a sprung pallet that opens a vent out of the trunk a few times a second
  double Gv = 0;
  if (P[p::tremulant] > 0.5 || trem > 0) {
    trem = P[p::tremulant] > 0.5 ? std::min(1.0, trem + h / 0.05) : std::max(0.0, trem - h / 0.05);
    tTrem += h * P[p::tremRate];
    if (tTrem >= 1) tTrem -= 1;
    const double s = std::sin(TAU * tTrem);
    Gv = trem * G_TREM * (s > 0 ? s * s : 0);
  }
  // the chest, implicitly: Cc dP_w/dt = G (P_bellows − P_w) − G_v P_w − ΣU_in
  const double Cc = V_CHEST / (Air::rho * Air::c * Air::c), a = h / Cc;
  Pw = (Pw + a * (G_TRUNK * Pbel - Uin)) / (1 + a * (G_TRUNK + Gv));
  if (Pw < 0) Pw = 0;
  draw = G_TRUNK * (Pbel - Pw);
  (void)Ut;
}

void RegalEngine::process(float *L, float *R, int n) {
  if (!hasParams) { for (int i = 0; i < n; i++) L[i] = R[i] = 0; return; }
  const double mStep = 1 / (MUTE * fs), fadeK = std::exp(-1 / (FADE * fs)), h = 1 / fs;
  // the pitch wheel glides the tongues' stiffness (their tuning wires)
  if (bendNow != bendTo) {
    bendNow = glideTo(bendNow, bendTo, n / fs, BEND_T);
    for (int i = 0; i < count; i++) for (Sim &s : voices[i]->sim) if (s.R) s.stiffen(bendNow * voices[i]->nb);
  }
  for (int i = 0; i < count; i++) { // a key's own bend (MPE) glides the same way
    Voice &v = *voices[i];
    const double to = expr.bendOf(v.key);
    if (v.nb != to) { v.nb = glideTo(v.nb, to, n / fs, BEND_T); for (Sim &s : v.sim) if (s.R) s.stiffen(bendNow * v.nb); }
  }
  const Voice *f = focus && !focus->dead ? focus : nullptr;
  int fr = -1;
  if (f) { for (int r : {1, 0, 2}) if (f->mute[r] > 0 && !f->sim[r].asleep) { fr = r; break; } }
  for (int i = 0; i < n; i++) {
    double Uin = 0, l0 = 0, l1 = 0, r0 = 0, r1 = 0;
    const double Pc = Pw;
    for (int k = 0; k < count; k++) {
      Voice &v = *voices[k];
      if (v.dead) continue;
      if (v.open != v.openTo) v.open = v.openTo > v.open ? std::min(v.openTo, v.open + v.openRate) : std::max(v.openTo, v.open - v.openRate);
      double s0 = 0, s1 = 0;
      for (int r = 0; r < NRANKS; r++) {
        const double tgt = on[r] ? 1 : 0;
        if (v.mute[r] != tgt) { v.mute[r] = tgt > v.mute[r] ? std::min(1.0, v.mute[r] + mStep) : std::max(0.0, v.mute[r] - mStep); if (tgt > 0) v.sim[r].asleep = false; }
        Sim &s = v.sim[r];
        if (s.asleep) continue;
        const double op = v.open * v.mute[r];
        if (s.os == 2) {
          s.step(Pc, op); s0 += s.out; const double u = s.Uin;
          if (&v == f && r == fr) record(s, 0);
          s.step(Pc, op); s1 += s.out; Uin += 0.5 * (u + s.Uin);
          if (&v == f && r == fr) record(s, 1);
        } else {
          s.step(Pc, op); s0 += s.out; s1 += s.out; Uin += s.Uin;
          if (&v == f && r == fr) record(s, 0);
        }
      }
      if (v.fading) v.fade *= fadeK;
      const double g = OUT * v.fade;
      s0 *= g; s1 *= g;
      l0 += v.gl * s0; l1 += v.gl * s1; r0 += v.gr * s0; r1 += v.gr * s1;
      const double as = s0 < 0 ? -s0 : s0;
      v.env = as > v.env ? as : v.env * 0.9998;
    }
    hiL[2 * i] = l0; hiL[2 * i + 1] = l1; hiR[2 * i] = r0; hiR[2 * i + 1] = r1;
    stepWind(Uin);
    tSim += h;
  }
  decimate(L, R, n);
  // retire voices: pallet shut and every reed quiet
  for (int k = 0; k < count; k++) {
    Voice &v = *voices[k];
    v.age += n / fs;
    if (v.fading && v.fade < 1e-4) { v.dead = true; continue; }
    int awake = 0;
    for (int r = 0; r < NRANKS; r++) {
      Sim &s = v.sim[r];
      if (s.asleep) continue;
      const bool shut = v.open == 0 || v.mute[r] == 0;
      if (shut && s.env * OUT < 1e-6 && s.energy < 1e-12 && std::fabs(s.Pb) < 0.05) { s.asleep = true; s.reset(); } else awake++;
    }
    if (!awake && !v.down && v.open == 0) v.dead = true;
  }
  int j = 0;
  for (int k = 0; k < count; k++) {
    Voice *v = voices[k];
    if (v->dead) { if (byKey[v->key] == v) byKey[v->key] = nullptr; if (focus == v) focus = nullptr; v->used = false; }
    else voices[j++] = v;
  }
  count = j;
  if (messages && ++blocks >= POST_BLOCKS) { blocks = 0; postView(); }
}

// 2× → 1×: the half-band FIR, whose every other tap (but the centre) is zero.
void RegalEngine::decimate(float *L, float *R, int n) {
  constexpr int M = 63, c = (M - 1) / 2;
  const double *hf = fir.data();
  double *hl = histL.data(), *hr = histR.data();
  int p = hpos;
  for (int i = 0; i < n; i++) {
    for (int k = 0; k < 2; k++) { const double xl = hiL[2 * i + k], xr = hiR[2 * i + k]; hl[p] = hl[p + M] = xl; hr[p] = hr[p + M] = xr; p = p + 1 == M ? 0 : p + 1; }
    double sl = hf[c] * hl[p + M - 1 - c], sr = hf[c] * hr[p + M - 1 - c];
    for (int t = 0; t < M; t += 2) { const int q = p + M - 1 - t; sl += hf[t] * hl[q]; sr += hf[t] * hr[q]; }
    L[i] = (float)sl; R[i] = (float)sr;
  }
  hpos = p;
}

// The focused reed's trace: about two periods at TRACE points, from its own rate.
void RegalEngine::record(const Sim &s, int sub) {
  (void)sub;
  if (!messages) return;
  Trace &t = trace;
  // the period, from upward crossings of the tongue's running mean
  const double tt = tSim + (sub ? s.h : 0);
  const double y = s.q - 0.5 * s.h0;
  if (lastQ < 0 && y >= 0) { if (lastCross > 0) period = 0.8 * period + 0.2 * (tt - lastCross); if (period <= 0) period = tt - lastCross; lastCross = tt; }
  lastQ = y;
  if (++t.cnt < t.dec) return;
  t.cnt = 0;
  t.q[t.w] = s.q; t.U[t.w] = s.U; t.pd[t.w] = s.pd; t.Pb[t.w] = s.Pb;
  t.w = (t.w + 1) % TRACE;
  t.n = std::min(t.n + 1, TRACE);
  const double aq = std::fabs(s.q);
  t.qAmp = std::max(aq, t.qAmp * 0.999);
}

void RegalEngine::postView() {
  Message m;
  const Voice *f = focus && !focus->dead ? focus : nullptr;
  int fr = -1;
  if (f) { for (int r : {1, 0, 2}) if (f->mute[r] > 0 && !f->sim[r].asleep) { fr = r; break; } }
  if (f && fr >= 0) {
    const Sim &s = f->sim[fr];
    const Reed &R = *s.R;
    // the trace's step: TRACE points over two periods
    const double per = period > 0 ? period : 1 / R.f0;
    const int dec = std::max(1, (int)std::lround((2 * per) / (TRACE * s.h)));
    if (dec != trace.dec) { trace.dec = dec; trace.n = 0; }
    trace.dt = trace.dec * s.h;
    // the traces, oldest first, 29 points a message
    const std::array<double, TRACE> *tr[4] = {&trace.q, &trace.U, &trace.pd, &trace.Pb};
    for (int w = 0; w < 4; w++) {
      for (int at = 0; at < TRACE; at += 29) {
        m = Message{}; m.type = msg::trace; m.key = (int16_t)w;
        const int cnt = std::min(29, TRACE - at);
        m.values[0] = (float)at;
        for (int i = 0; i < cnt; i++) m.values[1 + i] = (float)(*tr[w])[(trace.w + at + i) % TRACE];
        m.count = (uint16_t)(1 + cnt);
        post(m);
      }
    }
    m = Message{}; m.type = msg::reed; m.key = (int16_t)f->key;
    const float vals[] = {(float)fr, (float)R.f0, (float)R.fNat, (float)R.L, (float)R.b, (float)R.h, (float)R.h0, (float)R.Ls, (float)R.bs,
                          (float)trace.dt, (float)trace.n, (float)trace.qAmp, (float)(period > 0 ? 1 / period : 0), (float)voicing.shape};
    for (int i = 0; i < (int)std::size(vals); i++) m.values[i] = vals[i];
    m.count = (uint16_t)std::size(vals);
    post(m);
  } else {
    m = Message{}; m.type = msg::reed; m.key = 0; m.count = 0;
    post(m);
  }
  m = Message{}; m.type = msg::wind; m.key = 0;
  const float w[] = {(float)(P0s * (1 + 0.25 * afterS)), (float)Pbel, (float)Pw, (float)fill[0], (float)fill[1], (float)active, (float)(draw * 1000), hand ? 1.f : 0.f, (float)trem};
  for (int i = 0; i < (int)std::size(w); i++) m.values[i] = w[i];
  m.count = (uint16_t)std::size(w);
  post(m);
}

// ---- the tuning tool's and the tests' measure ----------------------------------------------

double measureReed(const Reed &R, double fs, double P0, double t0, double t1) {
  static RegalEngine::Sim s; // big: not on the stack
  s.init(R, fs, 250, 1, 12345);
  s.asleep = false;
  const int steps = s.os;
  const double h = 1 / fs, openRate = h / 0.01;
  double open = 0, lastY = 0, first = -1, last = -1;
  int crossings = 0;
  const double mean = 0.5 * R.h0;
  for (double t = 0; t < t1; t += h) {
    open = std::min(1.0, open + openRate);
    for (int k = 0; k < steps; k++) {
      s.step(P0, open);
      const double y = s.q - mean, tt = t + k * s.h;
      if (tt >= t0 && lastY < 0 && y >= 0) {
        const double tc = tt - s.h * y / (y - lastY); // linear interpolation of the crossing
        if (first < 0) first = tc; else { last = tc; crossings++; }
      }
      lastY = y;
    }
  }
  return crossings > 0 ? crossings / (last - first) : 0;
}

} // namespace forte::regal
