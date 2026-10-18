// grand-engine.cpp — the electric grand's engine (grand-engine.h).

#include "grand-engine.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <memory>

namespace forte::grand {

constexpr double OUT = 0.012;       // bridge force (N) → full-scale audio
constexpr double KILL_SIGMA = 250;  // s⁻¹, fast fade for stolen / panicked / re-struck voices
constexpr double REPEAT = 0.06;     // s: the action needs this long to return the hammer for another blow
constexpr double DROP = 1e-7;       // a top partial falling below this (output units, −140 dB) stops being integrated

// Physics parameters: a change rebuilds the key models (new notes only).
constexpr int PHYS[] = {p::scale, p::stringing, p::detune, p::stiffness, p::loss, p::mount, p::gFrame, p::boardH, p::tilt, p::hRatio, p::kH, p::hardness, p::strike, p::maxFreq, p::stretch};

// ---- the preamp's sections -----------------------------------------------------------------------

RC1 &RC1::set(double b1, double b0, double a1, double a0, double fw, double fs) {
  const double w = TAU * std::min(fw, 0.45 * fs), K = w / std::tan(w / (2 * fs)), A0 = a1 * K + a0;
  B0 = (b1 * K + b0) / A0; B1 = (b0 - b1 * K) / A0; A1 = (a0 - a1 * K) / A0;
  return *this;
}
RC1 &RC1::highpass(double f, double fs) { return set(1, 0, 1, TAU * f, f, fs); }
// shelves of gain g (linear): boost (s + gω)/(s + ω), cut its mirror image
RC1 &RC1::lowShelf(double f, double g, double fs) { const double w = TAU * f; return g >= 1 ? set(1, g * w, 1, w, f, fs) : set(1, w, 1, w / g, f, fs); }
RC1 &RC1::highShelf(double f, double g, double fs) { const double w = TAU * f; return g >= 1 ? set(g, w, 1, w, f, fs) : set(1, w, 1 / g, w, f, fs); }

// ---- a voice ----------------------------------------------------------------------------------

// A new voice from its key's data: what depends on the key alone was derived on the worker
// (GrandEngine::build).
void GrandEngine::Voice::start(const GrandEngine &eng, Data::Ref r, uint64_t ver) {
  const Built &B = *r.data;
  const KeyModel &d = B.d;
  ref = r; b = &B; version = ver;
  key = d.key; k = 1 / eng.fs; N = d.n; nV = d.nV; ns = d.ns;
  a1 = B.a1.data(); a2 = B.a2.data(); h = B.h.data(); bh = B.bh.data(); u = B.u.data(); beta = B.beta.data();
  bf = d.bf.data(); om = B.om.data(); sig = B.sig.data(); dmp = d.damp.data();
  for (int i = 0; i < N; i++) q[i] = q1[i] = 0;
  comp0 = B.comp0; nVa = nV; nHa = N - nV;
  bridgeSums();
  hammer = d.hammer; seg = d.seg; hasDamper = d.hasDamper;
  const auto [pl, pr] = keyPan(key, 0.5, KEY_LO, KEY_HI);
  panL = pl; panR = pr;
  trim = pickupTrim(key); dropThr = DROP / (OUT * trim);
  keyDown = true; damped = false; killing = false; dead = false;
  hammerOn = false; peak = 0; quiet = 0; age = 0; struck = -INFINITY;
  eta = 0; etaPrev = 0; dPrev = -1; F = 0; FV = 0; FH = 0; Fmax = 0; contactSamples = 0; hammerSamples = 0; contact = false;
  setDamper(eng.P[p::damper]);
}

// Per polarisation, over the active modes: Σ u², and the sums that tie the bridge to the output
// (Σ bf u), to the hammer point (Σ h u) and to the hammer's force (Σ u bh).
void GrandEngine::Voice::bridgeSums() {
  double S[8] = {};
  auto add = [&](int i0, int i1, int o) {
    for (int i = i0; i < i1; i++) { const double uu = u[i]; S[o] += beta[i]; S[2 + o] += bf[i] * uu; S[4 + o] += h[i] * uu; S[6 + o] += uu * bh[i]; }
  };
  add(0, nVa, 0); add(nV, nV + nHa, 1);
  invV = 1 / (1 + S[0]); invH = 1 / (1 + S[1]);
  kapV = S[2]; kapH = S[3]; swV = S[4]; swH = S[5]; rhoV = S[6]; rhoH = S[7];
  comp = comp0 - swV * rhoV * invV - swH * rhoH * invH; // compliance under the hammer, bridge included
}

// Is the partial whose strings end at i1 below the threshold? If so, clear it.
bool GrandEngine::Voice::quietTop(int i1) {
  const int i0 = i1 - ns;
  double c = 0;
  for (int i = i0; i < i1; i++) c += std::fabs(bf[i]) * (std::fabs(q[i]) + std::fabs(q1[i]));
  if (c >= dropThr) return false;
  for (int i = i0; i < i1; i++) q[i] = q1[i] = 0;
  return true;
}
// Stop integrating the top partials once their share of the bridge force has fallen below DROP: a
// few per block. Σ u² keeps them (a dropped mode still yields to the bridge within each step); only
// the output correction Σ bf u follows the modes still summed.
void GrandEngine::Voice::dropTop() {
  int n = 0;
  while (n < 4 && nVa > ns && quietTop(nVa)) { nVa -= ns; n++; }
  while (n < 8 && nHa > 0 && quietTop(nV + nHa)) { nHa -= ns; n++; }
  if (n) {
    double kV = 0, kH = 0;
    for (int i = 0; i < nVa; i++) kV += bf[i] * u[i];
    for (int i = nV; i < nV + nHa; i++) kH += bf[i] * u[i];
    kapV = kV; kapH = kH;
  }
}

// Recursion coefficients with an extra decay rate (the damper or the kill) on top of the string's
// own: a2 = e^{−2σk}; a1 places the poles, with the bridge's β, at the exact damped frequency.
void GrandEngine::Voice::coef(double *A1, double *A2, bool kill, double sd) const {
  for (int i = 0; i < N; i++) {
    const double s = sig[i] + (kill ? KILL_SIGMA : sd * dmp[i]), w = om[i], bt = beta[i];
    const double aa = std::exp(-2 * s * k), R2 = (aa - bt) / (1 + bt), R = std::sqrt(R2), st = -std::log(R) / k;
    A1[i] = 2 * R * (1 + bt) * std::cos(std::sqrt(std::max(w * w - st * st, 1e-6)) * k); A2[i] = aa;
  }
}

// Launch the hammer at speed v (m/s) from where the string is now (re-strikes work).
void GrandEngine::Voice::strike(double v) {
  double uu = 0;
  for (int i = 0; i < N; i++) uu += h[i] * q[i];
  if (nVa < nV || nHa < N - nV) { nVa = nV; nHa = N - nV; bridgeSums(); }
  eta = uu - 1.5 * v * k; etaPrev = eta - v * k;
  dPrev = -1; hammerOn = true; hammerSamples = 0; contact = false;
  contactSamples = 0; Fmax = 0; v0 = v; struck = age;
  kOverM = (k * k) / hammer.mass;
  alphaK = hammer.alpha / k;
}

// Solve D + C·F(D) = dFree for the felt compression D one step ahead.
double GrandEngine::Voice::contactForce(double dFree) {
  const double p = hammer.p, K = hammer.K, a = alphaK, C = comp + kOverM;
  const double dp = dPrev > 0 ? std::pow(dPrev, p) : 0;
  if (dFree <= 0) { dPrev = dFree; return 0; }
  double lo = 0, hi = dFree, D = dFree;
  for (int it = 0; it < 50; it++) {
    const double Dp = std::pow(D, p), fr = (1 + a) * Dp - a * dp;
    const double g = D + C * (fr > 0 ? K * fr : 0) - dFree;
    if (std::fabs(g) <= 1e-12 * dFree) break;
    if (g > 0) hi = D; else lo = D;
    const double dg = 1 + (fr > 0 && D > 0 ? (C * K * (1 + a) * p * Dp) / D : 0);
    double Dn = D - g / dg;
    if (!(Dn > lo && Dn < hi)) Dn = 0.5 * (lo + hi);
    D = Dn;
  }
  const double fr = (1 + a) * std::pow(D, p) - a * dp;
  dPrev = D;
  return fr > 0 ? K * fr : 0;
}

// One sample of the hammer phase: the free step of every mode, then the contact and the two bridge
// sums together (q holds the actual state here).
void GrandEngine::Voice::hammerStep(const double *A1, const double *A2, const GrandEngine &eng) {
  double aV = 0, aH = 0, uf = 0;
  for (int i = 0; i < nV; i++) {
    const double q0 = q[i], qm = q1[i], f = A1[i] * q0 - A2[i] * qm;
    aV += u[i] * (f - qm); uf += h[i] * f; q1[i] = q0; q[i] = f;
  }
  for (int i = nV; i < N; i++) {
    const double q0 = q[i], qm = q1[i], f = A1[i] * q0 - A2[i] * qm;
    aH += u[i] * (f - qm); uf += h[i] * f; q1[i] = q0; q[i] = f;
  }
  const double sV0 = aV * invV, sH0 = aH * invH;
  const double etaF = 2 * eta - etaPrev;
  const double Fc = contactForce(etaF - (uf - swV * sV0 - swH * sH0));
  etaPrev = eta; eta = etaF - kOverM * Fc;
  const double sV = sV0 + Fc * rhoV * invV, sH = sH0 + Fc * rhoH * invH;
  double fv = 0, fh = 0;
  for (int i = 0; i < nV; i++) { const double x = q[i] - u[i] * sV + bh[i] * Fc; q[i] = x; fv += bf[i] * x; }
  for (int i = nV; i < N; i++) { const double x = q[i] - u[i] * sH + bh[i] * Fc; q[i] = x; fh += bf[i] * x; }
  if (Fc > 0) {
    contact = true; contactSamples++;
    if (Fc > Fmax) Fmax = Fc;
  }
  F = Fc; FV = fv; FH = fh;
  hammerSamples++;
  if (hammerSamples > eng.hammerMax || (contact && Fc == 0 && dPrev < -2e-3)) hammerOn = false;
}

// Add this voice's piezo signal (panned) and its vertical bridge force (for the board).
void GrandEngine::Voice::render(double *PL, double *PR, double *SEG, int n, GrandEngine &eng) {
  const int h1 = nV + nHa, nva = nVa;
  const double *A1 = damped ? a1d : a1, *A2 = damped ? a2d : a2;
  const double gH = eng.P[p::pickH], pl = panL * trim * OUT, pr = panR * trim * OUT;
  double *sg = SEG + seg * BLOCK;
  const double iV = invV, iH = invH, kV = kapV, kH = kapH;
  // sv, sh: this sample's bridge sums, whose −u S correction to q is still pending
  double sv = 0, sh = 0, pk = 0, fv = 0, fh = 0;
  for (int s = 0; s < n; s++) {
    if (hammerOn) {
      hammerStep(A1, A2, eng);
      fv = FV; fh = FH;
    } else {
      double a = 0, y = 0;
      for (int i = 0; i < nva; i++) {
        const double qa = q[i] - u[i] * sv, qm = q1[i], f = A1[i] * qa - A2[i] * qm;
        a += u[i] * (f - qm); y += bf[i] * f;
        q1[i] = qa; q[i] = f;
      }
      sv = a * iV; fv = y - kV * sv;
      a = 0; y = 0;
      for (int i = nV; i < h1; i++) {
        const double qa = q[i] - u[i] * sh, qm = q1[i], f = A1[i] * qa - A2[i] * qm;
        a += u[i] * (f - qm); y += bf[i] * f;
        q1[i] = qa; q[i] = f;
      }
      sh = a * iH; fh = y - kH * sh;
    }
    const double y = fv + gH * fh;
    PL[s] += pl * y; PR[s] += pr * y;
    sg[s] += fv;
    const double ay = (y < 0 ? -y : y) * OUT;
    if (ay > pk) pk = ay;
  }
  // apply the pending correction, so q is the actual state between blocks
  if (sv != 0) for (int i = 0; i < nva; i++) q[i] -= u[i] * sv;
  if (sh != 0) for (int i = nV; i < h1; i++) q[i] -= u[i] * sh;
  FV = fv; FH = fh;
  peak = pk; age += n;
  if (!(pk < 1e3)) {
    dead = true;
    Message m;
    m.type = msg::error; m.key = (int16_t)key;
    eng.post(m);
    return;
  }
  if (!hammerOn) {
    dropTop();
    quiet = pk < (damped ? 1e-5 : 2e-6) ? quiet + 1 : 0;
    if (quiet > 40) dead = true;
  }
}

// ---- the soundboard ------------------------------------------------------------------------------

// SEG holds the bridge force per segment; writes OUT-scaled mic signals into ML, MR.
void GrandEngine::BoardSlot::run(const double *SEG, double *ML, double *MR, int n, bool active) {
  const int K = c.K;
  const double g = c.lpG;
  Biquad *rf = c.rf.data();
  Biquad &h0 = c.rh[0], &h1 = c.rh[1], &h2 = c.rh[2], &h3 = c.rh[3];
  const double *rs = c.res.data(), *A1 = c.a1.data(), *A2 = c.a2.data(), *PH = c.ph.data(), *RL = c.rl.data(), *RR = c.rr.data();
  if (!active && quiet > 400) { for (int s = 0; s < n; s++) ML[s] = MR[s] = 0; return; }
  double pk = 0;
  for (int s = 0; s < n; s++) {
    const double f0 = (lp[0] += g * (SEG[s] - lp[0])), f1 = (lp[1] += g * (SEG[BLOCK + s] - lp[1])), f2 = (lp[2] += g * (SEG[2 * BLOCK + s] - lp[2]));
    double L = 0, R = 0;
    for (int k = 0, o = 0; k < RES_BANDS; k++, o += 6) {
      L += rf[4 * k + 1].run(rf[4 * k].run(rs[o] * f0 + rs[o + 2] * f1 + rs[o + 4] * f2));
      R += rf[4 * k + 3].run(rf[4 * k + 2].run(rs[o + 1] * f0 + rs[o + 3] * f1 + rs[o + 5] * f2));
    }
    L = h1.run(h0.run(L)); R = h3.run(h2.run(R));
    for (int i = 0, j = 0; i < K; i++, j += 3) {
      const double x0 = e0[i], x1 = e1[i];
      const double xn = A1[i] * x0 - A2[i] * x1 + PH[j] * f0 + PH[j + 1] * f1 + PH[j + 2] * f2;
      const double acc = xn - 2 * x0 + x1;
      e1[i] = x0; e0[i] = xn;
      L += RL[i] * acc; R += RR[i] * acc;
    }
    ML[s] = L * OUT; MR[s] = R * OUT;
    const double a = L < 0 ? -L : L;
    if (a > pk) pk = a;
  }
  quiet = pk * OUT < 1e-7 ? quiet + 1 : 0;
  if (quiet > 400) {
    e0.fill(0); e1.fill(0); lp.fill(0);
    for (Biquad &f : c.rf) f.reset();
    for (Biquad &f : c.rh) f.reset();
  }
}

// ---- the engine --------------------------------------------------------------------------------

GrandEngine::GrandEngine(double fs)
    : Engine(fs), hammerMax((int)std::round(0.08 * fs)), repeat((int)std::round(REPEAT * fs)),
      store(new double[(size_t)POOL * 4 * CAP]()),
      data([this](int key, uint64_t version) { return build(key, version); }) {
  for (int i = 0; i < POOL; i++) {
    Voice &v = pool[i];
    double *s = store.get() + (size_t)i * 4 * CAP;
    v.q = s; v.q1 = s + CAP; v.a1d = s + 2 * CAP; v.a2d = s + 3 * CAP;
  }
}

// The worker's board model for a thickness (the last one is kept: every key of a version needs it).
const BoardModel &GrandEngine::workerBoard(double boardH) {
  if (!wBoard || wBoard->boardH != boardH) wBoard = std::make_unique<BoardModel>(boardModel(boardH));
  return *wBoard;
}

// On the worker (in place without threads): the soundboard (slot 0, its version its thickness), or
// a key's model for the parameters of `version`, and what a voice derives from it alone.
std::unique_ptr<Built> GrandEngine::build(int key, uint64_t version) {
  auto out = std::make_unique<Built>();
  const double k = 1 / fs;
  if (key == 0) {
    const BoardModel &B = workerBoard(std::bit_cast<double>(version));
    auto c = std::make_unique<BoardCoefs>();
    c->boardH = B.boardH; c->K = std::min(B.K, BOARD_MODES);
    const double g = B.micGain * fs * fs; // second difference → acceleration
    for (int i = 0; i < c->K; i++) {
      const double om = B.omega[i], sg = B.sigma[i], r = std::exp(-sg * k), od = std::sqrt(om * om - sg * sg);
      c->a1[i] = 2 * r * std::cos(od * k); c->a2[i] = r * r;
      const double b = (k * r * std::sin(od * k)) / od;
      for (int s = 0; s < SEGMENTS; s++) c->ph[i * SEGMENTS + s] = b * B.phi[i * SEGMENTS + s];
      c->rl[i] = g * B.RL[i]; c->rr[i] = g * B.RR[i];
    }
    c->lpG = 1 - std::exp((-TAU * B.fBridge) / fs); // bridge mass: one-pole low-pass on the force
    for (size_t i = 0; i < c->res.size(); i++) c->res[i] = B.res[i] * B.micGain;
    for (int i = 0; i < 4 * RES_BANDS; i++) c->rf[i].set(Biquad::bp, B.resF[i >> 2], RES_Q, fs);
    for (Biquad &f : c->rh) f.set(Biquad::hp, B.fRes, std::numbers::sqrt2 / 2, fs);
    out->board = std::move(c);
    return out;
  }
  if (key < KEY_LO || key > KEY_HI) return nullptr;
  double Pv[p::count];
  const auto &snap = snapshots[version % snapshots.size()];
  for (int i = 0; i < p::count; i++) Pv[i] = snap[i].load(std::memory_order_relaxed);
  const ModelParams M = modelParams(Pv);
  out->d = keyModel(key, M, M.mount == mount_::board ? &workerBoard(M.boardH) : nullptr, fs);
  const KeyModel &d = out->d;
  const int N = d.n;
  for (auto *v : {&out->om, &out->sig, &out->h, &out->bh, &out->u, &out->beta, &out->a1, &out->a2}) v->resize(N);
  double comp = 0;
  for (int i = 0; i < N; i++) {
    const double om = TAU * d.freq[i], sg = d.sigma[i], sb = 0.5 * d.c[i] * d.c[i]; // σ_b = c²/2 = G(T + EIk²)/L
    out->om[i] = om; out->sig[i] = sg;
    const double r = std::exp(-sg * k), od = std::sqrt(std::max(om * om - sg * sg, 1e-6));
    const double b = (k * r * std::sin(od * k)) / od; // impulse-invariant input gain
    out->h[i] = d.w[i]; out->bh[i] = b * d.w[i]; comp += b * d.w[i] * d.w[i];
    const double a2 = r * r, R2 = std::exp(-2 * (sg + sb) * k), beta = (a2 - R2) / (1 + R2);
    out->beta[i] = beta; out->u[i] = (d.c[i] < 0 ? -1 : 1) * std::sqrt(beta);
  }
  out->comp0 = comp;
  // the string's own recursion (no damper): Voice::coef with no extra decay
  Voice v;
  v.N = N; v.k = k; v.sig = out->sig.data(); v.om = out->om.data(); v.beta = out->beta.data(); v.dmp = d.damp.data();
  v.coef(out->a1.data(), out->a2.data(), false, 0);
  return out;
}

void GrandEngine::setParams(const double *p) {
  const bool first = !hasParams;
  const double oldDamper = P[p::damper];
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
  bool changed = first;
  for (int i : PHYS) if (P[i] != phys[i]) changed = true;
  if (changed) { // a new version of every key: new notes pick it up
    for (int i : PHYS) phys[i] = P[i];
    version++;
    auto &snap = snapshots[version % snapshots.size()];
    for (int i = 0; i < p::count; i++) snap[i].store(P[i], std::memory_order_relaxed);
    data.prepare(version, KEY_LO, KEY_HI, focus);
  }
  if ((int)P[p::mount] == mount_::board) {
    BoardSlot *b = boardFor(P[p::boardH]);
    if (b) { board = b; wantBoard = NAN; }
    else wantBoard = P[p::boardH]; // being built: the board in use until then keeps playing
  } else { board = nullptr; wantBoard = NAN; }
  mix = (int)P[p::mount] == mount_::board ? P[p::listen] : 0;
  if (first || oldDamper != P[p::damper]) for (int i = 0; i < nVoices; i++) voices[i]->setDamper(P[p::damper]);
  for (int c = 0; c < 2; c++) {
    hp[c].highpass(1 / (TAU * P[p::rIn] * 1e3 * C_PIEZO), fs);
    lo[c].lowShelf(EQ.bass, std::pow(10.0, P[p::bass] / 20), fs);
    mid[c].set(Biquad::peak, EQ.mid, EQ.midQ, fs, P[p::mid]);
    hi[c].highShelf(EQ.treble, std::pow(10.0, P[p::treble] / 20), fs);
  }
}

// The board for a thickness: kept from before, or its coefficients now (or null: being built).
GrandEngine::BoardSlot *GrandEngine::boardFor(double boardH) {
  for (BoardSlot &b : boards) if (b.used && b.c.boardH == boardH) return &b;
  const Data::Ref r = data.get(0, boardVersion(boardH));
  return r ? install(*r.data->board) : nullptr;
}
GrandEngine::BoardSlot *GrandEngine::install(const BoardCoefs &c) {
  int used = 0;
  for (BoardSlot &b : boards) used += b.used;
  if (used > 4) { for (BoardSlot &b : boards) b.used = false; board = nullptr; }
  BoardSlot *s = nullptr;
  for (BoardSlot &b : boards) if (!b.used) { s = &b; break; }
  s->used = true; s->c = c;
  s->e0.fill(0); s->e1.fill(0); s->lp.fill(0); s->quiet = 0;
  return s;
}

void GrandEngine::budget(double modes) {
  if (!std::isfinite(modes)) return;
  maxModes = std::min(MODE_BUDGET, std::max(600, (int)std::round(modes)));
  enforceBudget(nullptr);
}

// A voice from the pool; when every one is in use, the quietest goes at once.
GrandEngine::Voice *GrandEngine::freeVoice() {
  for (Voice &v : pool) if (!v.inUse) return &v;
  int at = -1;
  double score = INFINITY;
  for (int i = 0; i < nVoices; i++) {
    const Voice &v = *voices[i];
    const double s = v.killing ? -1 : (v.peak * (v.damped ? 0.1 : 1)) / (1 + v.age / fs);
    if (s < score) { score = s; at = i; }
  }
  Voice *v = voices[at];
  data.release(v->ref);
  v->inUse = false;
  if (byKey[v->key] == v) byKey[v->key] = nullptr;
  for (int i = at; i < nVoices - 1; i++) voices[i] = voices[i + 1];
  nVoices--;
  return v;
}

void GrandEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < KEY_LO || key > KEY_HI) return;
  focus = key;
  Voice *v = byKey[key];
  // the action has not yet brought the hammer back for another blow
  if (v && !v->dead && !v->killing && v->age - v->struck < repeat) { v->keyDown = true; v->updateDamping(*this); return; }
  if (!v || v->dead || v->killing || v->version != version) {
    const Data::Ref r = data.get(key, version);
    if (!r) { // its model is being built (only with threads): the note waits for it
      for (int i = 0; i < nPending; i++) if (pending[i].key == key) { pending[i] = {key, velocity, false}; return; }
      if (nPending < (int)pending.size()) pending[nPending++] = {key, velocity, false};
      return;
    }
    // the same strings, struck again after a physics knob moved: the old voice fades out fast
    if (v && !v->dead) v->kill();
    v = freeVoice();
    v->inUse = true;
    data.acquire(r);
    v->start(*this, r, version);
    voices[nVoices++] = v; byKey[key] = v;
  }
  v->keyDown = true; v->updateDamping(*this);
  v->strike(hammerSpeed(velocity));
  enforceBudget(v);
}

void GrandEngine::retryPending() {
  if (!nPending) return;
  std::array<Pending, 128> list;
  const int n = nPending;
  std::copy(pending.begin(), pending.begin() + n, list.begin());
  nPending = 0;
  for (int i = 0; i < n; i++) {
    const Pending pd = list[i];
    if (!data.get(pd.key, version)) { pending[nPending++] = pd; continue; }
    noteOn(pd.key, pd.velocity);
    if (pd.off) noteOff(pd.key, -1);
  }
}

void GrandEngine::noteOff(int key, double) {
  if (key < 0 || key > 127) return;
  for (int i = 0; i < nPending; i++) if (pending[i].key == key) pending[i].off = true;
  if (Voice *v = byKey[key]) { v->keyDown = false; v->updateDamping(*this); }
}

void GrandEngine::setSustain(bool on) {
  sustain = on;
  for (int i = 0; i < nVoices; i++) voices[i]->updateDamping(*this);
}

void GrandEngine::allNotesOff() {
  nPending = 0;
  for (int i = 0; i < nVoices; i++) voices[i]->kill();
}

// Keep the total oscillator count within budget: fade out the quietest, oldest voices.
void GrandEngine::enforceBudget(const Voice *keep) {
  int total = 0;
  for (int i = 0; i < nVoices; i++) if (!voices[i]->killing) total += voices[i]->active();
  while (total > maxModes) {
    Voice *victim = nullptr;
    double score = INFINITY;
    for (int i = 0; i < nVoices; i++) {
      Voice *v = voices[i];
      if (v == keep || v->killing) continue;
      const double s = (v->peak * (v->damped ? 0.1 : 1)) / (1 + v->age / fs);
      if (s < score) { score = s; victim = v; }
    }
    if (!victim) break;
    victim->kill(); total -= victim->active();
  }
}

void GrandEngine::process(float *L, float *R, int n) {
  for (int at = 0; at < n; at += BLOCK) run(L + at, R + at, std::min(BLOCK, n - at));
  data.audioCycle();
}

void GrandEngine::run(float *L, float *R, int n) {
  // notes and a board that were being built (only with threads)
  retryPending();
  if (!std::isnan(wantBoard)) {
    if (BoardSlot *b = boardFor(wantBoard)) { board = b; wantBoard = NAN; }
  }
  double *PL = pL.data(), *PR = pR.data(), *SEG = seg.data();
  std::fill(PL, PL + n, 0.0); std::fill(PR, PR + n, 0.0);
  for (int s = 0; s < SEGMENTS; s++) std::fill(SEG + s * BLOCK, SEG + s * BLOCK + n, 0.0);
  if (hasParams) for (int i = 0; i < nVoices; i++) voices[i]->render(PL, PR, SEG, n, *this);
  BoardSlot *b = board;
  if (b) b->run(SEG, mL.data(), mR.data(), n, nVoices > 0);
  const double gp = 1 - mix;
  for (int s = 0; s < n; s++) {
    const double l = hi[0].run(mid[0].run(lo[0].run(hp[0].run(PL[s])))), r = hi[1].run(mid[1].run(lo[1].run(hp[1].run(PR[s]))));
    L[s] = (float)(gp * l + (b ? mix * mL[s] : 0));
    R[s] = (float)(gp * r + (b ? mix * mR[s] : 0));
  }
  int j = 0;
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    if (v->dead) {
      if (byKey[v->key] == v) byKey[v->key] = nullptr;
      data.release(v->ref);
      v->ref = {};
      v->inUse = false;
    } else voices[j++] = v;
  }
  nVoices = j;
}

} // namespace forte::grand
