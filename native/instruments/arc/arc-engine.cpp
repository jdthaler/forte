// arc-engine.cpp — the singing arc's engine (arc-engine.h).

#include "arc-engine.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/fdlibm.h"

namespace forte::arc {

static constexpr double PI = std::numbers::pi;
static constexpr double R_LEAK = 2000;       // Ω, a resting capacitor's leak (and an open contact's end point)
static constexpr double T_CLOSE = 5e-5;      // s, contact closing time constant (closed in ≈ 0.5 ms)
static constexpr double K_OPEN = 4000;       // Ω/s: an opening contact's spark grows in resistance as the contacts part
static constexpr double I_DROP = 2e-4;       // A, a switching branch is dropped once its current is below this
static constexpr double R_QUENCH = 50;       // Ω: once the parted contacts' spark is this resistive it goes out at a current zero
static constexpr double NOISE0 = 6e-5;       // rms conductance flicker of a quiet arc (seeds every note)
static constexpr double HISS_RMS = 0.008;    // rms conductance noise of a fully hissing arc (× the hiss knob)
static constexpr double F_NOISE = 4000;      // Hz, corner of the column's fluctuations
static constexpr double STEAL_AFTER = 0.04;  // s: a note must have sounded this long before it can be stolen
static constexpr double STEAL_WAIT = 0.014;  // s: a stolen arc's new capacitor waits for the old note to fade
static constexpr double POST_EVERY = 0.025;  // s, view updates
static constexpr double SMOOTH = 0.03;       // s, parameter glides

// JavaScript's ToUint32 and ToInt32 of a number
static uint32_t toUint32(double x) {
  if (!std::isfinite(x)) return 0;
  double m = std::fmod(std::trunc(x), 4294967296.0);
  if (m < 0) m += 4294967296.0;
  return (uint32_t)m;
}
static double jround(double x) { return std::floor(x + 0.5); } // Math.round
// the bank is cut for the arcs' circuit, whatever the mode (arc-instrument.js, bankParams)
static ArcParams bankParams(const double *P) { ArcParams a = arcParams(P); a.talk = false; return a; }

// ---- an arc lamp and its circuit ----------------------------------------------------------------

void Arc::init(ArcEngine *e, int k, double s) {
  eng = e; index = k;
  std::fill(std::begin(capV), std::end(capV), NAN);
  seed = toUint32(s * 2654435761.0);
  if (!seed) seed = 1;
  gl = std::numbers::sqrt2 / 2; gr = std::numbers::sqrt2 / 2;
}
// start from the DC operating point of the present settings
void Arc::rest(const Op &op) {
  is = op.I0; X = op.I0; u = op.u0; ia = op.I0; P = op.u0 * op.I0; uDC = op.u0; Imean = op.I0;
  ic = 0; vB = op.u0; CB = 0; nM = 0; nT = 0;
  std::fill(std::begin(capV), std::end(capV), NAN);
}
bool Arc::held() const {
  if (nM > 0 || pendKey != NONE) return true;
  for (int k = 0; k < nT; k++) if (tDir[k] > 0) return true;
  return false;
}
bool Arc::has(int key) const {
  if (pendKey == key) return true;
  for (int k = 0; k < nM; k++) if (mKey[k] == key) return true;
  for (int k = 0; k < nT; k++) if (tKey[k] == key) return true;
  return false;
}
bool Arc::holds(int key) const {
  if (pendKey == key) return true;
  for (int k = 0; k < nM; k++) if (mKey[k] == key) return true;
  for (int k = 0; k < nT; k++) if (tKey[k] == key && tDir[k] > 0) return true;
  return false;
}

// A key closes its contact: the capacitor (resting at the arc's voltage through the leak) joins.
void Arc::engage(int key, double C) {
  for (int k = 0; k < nM; k++) if (mKey[k] == key) return;
  for (int k = 0; k < nT; k++) if (tKey[k] == key) { tDir[k] = 1; return; } // re-press while it was opening
  if (nT >= MAXE || nM + nT >= MAXE) return;
  const ArcEngine &e = *eng;
  const int k = nT++;
  double v = uDC;
  if (key >= 0 && key < 128 && !std::isnan(capV[key])) v = uDC + (capV[key] - uDC) * fdlibm::exp(-(e.time - capT[key]) / (e.fs * R_LEAK * C));
  if (nM == 0 && nT == 1) { ic = 0; vB = v; } // the branch was open: it starts here
  tKey[k] = key; tC[k] = C; tV[k] = v; tI[k] = 0; tR[k] = R_LEAK; tDir[k] = 1;
}
// A key opens its contact: a closed capacitor is split off the bank at the bank's voltage,
// carrying its share of the bank's current.
void Arc::release(int key) {
  if (pendKey == key) { pendKey = NONE; return; }
  for (int k = 0; k < nT; k++) if (tKey[k] == key && tDir[k] > 0) { tDir[k] = -1; tR[k] = std::max(tR[k], (2 * eng->h) / tC[k]); return; }
  for (int k = 0; k < nM; k++) if (mKey[k] == key) {
    const double C = mC[k];
    double sumI = 0;
    for (int j = 0; j < nT; j++) sumI += tI[j];
    const double share = CB > 0 ? ((ic - sumI) * C) / CB : 0;
    nM--; mKey[k] = mKey[nM]; mC[k] = mC[nM];
    CB -= C; if (CB < 1e-15 || nM == 0) CB = 0;
    if (nT < MAXE) { const int t = nT++; tKey[t] = key; tC[t] = C; tV[t] = vB; tI[t] = share; tR[t] = (2 * eng->h) / C; tDir[t] = -1; }
    return;
  }
}
void Arc::releaseAll() {
  pendKey = NONE;
  for (int guard = MAXE; nM > 0 && guard > 0; guard--) release(mKey[nM - 1]);
  for (int k = 0; k < nT; k++) if (tDir[k] > 0) { tDir[k] = -1; tR[k] = std::max(tR[k], (2 * eng->h) / tC[k]); }
}
void Arc::removeT(int k) {
  const int j = --nT;
  tKey[k] = tKey[j]; tC[k] = tC[j]; tV[k] = tV[j]; tI[k] = tI[j];
  tR[k] = tR[j]; tDir[k] = tDir[j]; tY[k] = tY[j]; tW[k] = tW[j];
}

// n samples at the base rate; adds the oversampled pressure into eng.osL/osR.
void Arc::run(int n, const double *emf) {
  ArcEngine &e = *eng;
  const int OS = e.OS;
  const double h = e.h, h2 = 0.5 * h;
  const double kClose = fdlibm::exp(-h / T_CLOSE), dOpen = K_OPEN * h, kn = e.kNoise, nNorm = e.noiseNorm;
  const bool quiet = e.quiet, watch = index == e.focus && e.messages;
  double *osL = e.osL.data(), *osR = e.osR.data();
  double is_ = is, ic_ = ic, vB_ = vB, X_ = X, u_ = u, ia_ = ia, Pw = P, nf_ = nf;
  uint32_t sd = seed;
  double stP_ = 0, stI2_ = 0, stOut_ = 0, stUmax_ = stUmax;
  const double kDC = e.kDC, iOut = 0.1 * e.sm.I0; // the arc counts as out while its current has all but stopped
  for (int s = 0; s < n; s++) {
    const double E = e.sE[s], Rb = e.sRb[s], A = e.sA[s], B = e.sB[s], Xm = e.sXm[s], del2 = e.sDel2[s], itau = e.sItau[s], th = e.sTh[s];
    const double L = e.sL[s], R = e.sR[s], kout = e.sKout[s], sig = quiet ? 0 : e.sSig[s] * nNorm;
    const double Lbh = SUPPLY.Lb / h, as = Lbh + 0.5 * Rb, bs = 0.5 / as, Lh = L / h, ac = Lh + 0.5 * R, bc = 0.5 / ac;
    const double em0 = emf ? emf[s] : 0, em1 = emf ? (s + 1 < n ? emf[s + 1] : emf[s]) : 0;
    for (int o = 0; o < OS; o++) {
      const double e0 = em0 + ((em1 - em0) * o) / OS, e1 = em0 + ((em1 - em0) * (o + 1)) / OS;
      // the column's fluctuations (and the hiss): low-passed white noise on the conductance
      sd ^= sd << 13; sd ^= sd >> 17; sd ^= sd << 5;
      nf_ += kn * ((int32_t)sd / 2147483648.0 - nf_);
      const double nu = 1 + sig * nf_;
      // Norton source of the circuit as the arc sees it at the end of the step
      const double a_s = (Lbh * is_ + E - 0.5 * Rb * is_ - 0.5 * u_) / as;
      double J = a_s, GN = bs, a_c = 0, p = 0, q = 0;
      const bool act = nM > 0 || nT > 0;
      if (act) {
        a_c = (Lh * ic_ + 0.5 * (u_ + e0 + e1 - R * ic_ - vB_)) / ac;
        double sumY = 0, sumYw = 0, sumI = 0;
        for (int k = 0; k < nT; k++) {
          const double C = tC[k];
          double r = tDir[k] > 0 ? tR[k] * kClose : tR[k] + dOpen;
          if (r > R_LEAK) r = R_LEAK;
          tR[k] = r;
          const double Y = 1 / (r + h2 / C), w = tV[k] + (h2 / C) * tI[k];
          tY[k] = Y; tW[k] = w; sumY += Y; sumYw += Y * w; sumI += tI[k];
        }
        if (CB > 0) { const double D = CB + h2 * (bc + sumY); p = (CB * vB_ + h2 * (ic_ - sumI + a_c + sumYw)) / D; q = (h2 * bc) / D; }
        else { const double D = bc + sumY; p = (a_c + sumYw) / D; q = bc / D; }
        J = a_s - (a_c - bc * p); GN = bs + bc * (1 - q);
      }
      // the column: θ-method in X, Newton (the current through it is J·g/(G_N + g))
      double Fold;
      { const double w = (A * X_ + B) / (A * X_ + 2 * B); Fold = (w * itau) * ((ia_ * ia_ - X_ * X_) / X_); }
      double Y = X_ + h * Fold;
      if (Y < 0.5 * X_) Y = 0.5 * X_; else if (Y > 2 * X_ + Xm) Y = 2 * X_ + Xm;
      double g = 0, iaN = 0;
      for (int it = 0; it < 4; it++) {
        const double d = Y - Xm, rr = std::sqrt(d * d + del2), Xe = 0.5 * (Y + Xm + rr), dXe = 0.5 * (1 + d / rr), den = A * Xe + B;
        const double G = (Xe * Xe) / den, dG = G * dXe * (A * Xe + 2 * B) / (Xe * den);
        g = G * nu;
        const double S = GN + g;
        iaN = (g * J) / S;
        const double w = (A * Y + B) / (A * Y + 2 * B), dw = (A * B) / ((A * Y + 2 * B) * (A * Y + 2 * B));
        const double i2 = iaN * iaN, F = w * itau * ((i2 - Y * Y) / Y);
        const double Fx = itau * (dw * ((i2 - Y * Y) / Y) - w * (i2 / (Y * Y) + 1)), Fi = w * itau * ((2 * iaN) / Y);
        const double dia = (J * GN * dG * nu) / (S * S);
        const double res = Y - X_ - h * ((1 - th) * Fold + th * F), dres = 1 - h * th * (Fx + Fi * dia);
        double Yn = Y - res / dres;
        if (!(Yn > 0.5 * Y)) Yn = 0.5 * Y; else if (Yn > 2 * Y + Xm) Yn = 2 * Y + Xm;
        const bool done = std::fabs(Yn - Y) < 1e-9 * (Y + Xm);
        Y = Yn;
        if (done) break;
      }
      if (Y < 1e-3 * Xm) Y = 1e-3 * Xm;
      X_ = Y;
      { const double d = X_ - Xm, Xe = 0.5 * (X_ + Xm + std::sqrt(d * d + del2)); g = ((Xe * Xe) / (A * Xe + B)) * nu; }
      const double uN = J / (GN + g);
      iaN = g * uN;
      is_ = a_s - bs * uN;
      if (act) {
        const double vBn = p + q * uN, icN = a_c + bc * (uN - vBn);
        for (int k = 0; k < nT; k++) {
          const double iN = tY[k] * (vBn - tW[k]), iO = tI[k];
          tV[k] += (h2 / tC[k]) * (iO + iN); tI[k] = iN;
          // an opening contact's spark goes out at a current zero once the contacts have parted
          if (tDir[k] < 0 && tR[k] >= R_QUENCH && (iN * iO <= 0 || std::fabs(iN) < I_DROP)) tDir[k] = -2;
        }
        vB_ = vBn; ic_ = icN;
        // contacts: merge a closed one into the bank, drop an open one whose current has died
        for (int k = nT - 1; k >= 0; k--) {
          const double C = tC[k];
          if (tDir[k] > 0 && tR[k] < (2 * h) / C) {
            if (CB > 0) vB_ = (CB * vB_ + C * tV[k]) / (CB + C); else vB_ = tV[k];
            CB += C;
            if (nM < MAXE) { mKey[nM] = tKey[k]; mC[nM++] = C; }
            removeT(k);
          } else if (tDir[k] == -2 || (tDir[k] < 0 && tR[k] >= R_LEAK && std::fabs(tI[k]) < I_DROP)) {
            const int key = tKey[k];
            if (key >= 0 && key < 128) { capV[key] = tV[k]; capT[key] = e.time + s; }
            removeT(k);
          }
        }
        if (nM == 0 && nT == 0) { ic_ = 0; CB = 0; }
      }
      const double Pn = uN * iaN, y = kout * (Pn - Pw);
      Pw = Pn; u_ = uN; ia_ = iaN;
      const int m = s * OS + o;
      osL[m] += gl * y; osR[m] += gr * y;
      stP_ += Pn; stI2_ += ic_ * ic_;
      if (std::fabs(iaN) < iOut) stOut_++;
      if (uN > stUmax_) stUmax_ = uN;
      if (watch && ++tcount >= dec) { tcount = 0; trail[ti] = (float)iaN; trail[ti + 1] = (float)uN; ti = (ti + 2) % (2 * TRAIL); }
    }
    uDC += kDC * (u_ - uDC); Imean += kDC * (is_ - Imean);
  }
  is = is_; ic = ic_; vB = vB_; X = X_; u = u_; ia = ia_; P = Pw; seed = sd; nf = nf_;
  stP += stP_; stI2 += stI2_; stOut += stOut_; stN += n * OS; stUmax = stUmax_;
  if (!std::isfinite(X + u + is + ic + vB)) rest(arcOp(arcParams(e.P.data()))); // never let a blow-up through
}

// ---- the engine ---------------------------------------------------------------------------------

ArcEngine::ArcEngine(double fs, double seed_, bool quiet_, int os)
    : Engine(fs), singer(fs, 7),
      data([this](int key, uint64_t v) -> std::unique_ptr<double> {
        if (key < KEY_LO || key > KEY_HI) return nullptr;
        // the parameters of that version (a snapshot the audio thread may be rewriting: check)
        for (Snapshot &s : snapshots) {
          if (s.version.load(std::memory_order_acquire) != v) continue;
          double Q[7];
          for (int i = 0; i < 7; i++) Q[i] = s.v[i].load(std::memory_order_relaxed);
          std::atomic_thread_fence(std::memory_order_acquire);
          if (s.version.load(std::memory_order_relaxed) != v) return nullptr;
          ArcParams a;
          a.current = Q[0]; a.gap = Q[1]; a.tau = Q[2]; a.restrike = Q[3]; a.coil = Q[4]; a.coilR = Q[5]; a.tune = (int)Q[6];
          return std::make_unique<double>(capFor(key, a));
        }
        return nullptr;
      }) {
  setup(seed_, quiet_, os);
}

void ArcEngine::configure(double seed_, bool quiet_, int os) {
  setup(seed_, quiet_, os);
  if (hasParams) { // as a new engine would be: the same parameters, from rest
    hasParams = false;
    const std::array<double, p::count> Q = P;
    setParams(Q.data());
  }
}

void ArcEngine::setup(double seed_, bool quiet_, int os) {
  seed = seed_; quiet = quiet_;
  OS = os > 0 ? os : fs <= 50000 ? 4 : fs <= 100000 ? 2 : 1;
  h = 1 / (fs * OS);
  for (int k = 0; k < MAXA; k++) { arcs[k] = Arc{}; arcs[k].init(this, k, seed * 7919 + k * 104729 + 1); }
  nArcs = 1; mode = mode_::mono; focus = 0; time = 0; sincePost = 0;
  nStack = 0;
  singer = Singer(fs, (int32_t)toUint32(seed * 31 + 5));
  osL.assign(128 * OS, 0); osR.assign(128 * OS, 0);
  kNoise = 1 - fdlibm::exp((-2 * PI * F_NOISE) / (fs * OS));
  noiseNorm = std::sqrt((3 * (2 - kNoise)) / kNoise); // one-pole on uniform noise → unit rms
  kS = 1 - fdlibm::exp(-1 / (SMOOTH * fs)); kDC = 1 - fdlibm::exp(-1 / (0.02 * fs));
  // decimation: Kaiser-windowed sinc, cutoff ≈ 0.44 fs
  firN = OS > 1 ? 16 * OS : 1;
  fir.assign(firN, 0);
  if (OS > 1) {
    const int N = firN;
    const double fc = 0.44 / OS, beta = 7;
    auto I0 = [](double x) { double s = 1, t = 1; for (int k = 1; k < 30; k++) { const double y = x / (2 * k); t *= y * y; s += t; } return s; };
    double sum = 0;
    for (int k = 0; k < N; k++) {
      const double m = k - (N - 1) / 2.0, sinc = m == 0 ? 2 * fc : fdlibm::sin(2 * PI * fc * m) / (PI * m), r = (2.0 * k) / (N - 1) - 1;
      fir[k] = sinc * (I0(beta * std::sqrt(std::max(0.0, 1 - r * r))) / I0(beta)); sum += fir[k];
    }
    for (int k = 0; k < N; k++) fir[k] /= sum;
  }
  histL.assign(2 * firN, 0); histR.assign(2 * firN, 0); hp = 0;
  hasTable = false; tableVersion = 0;
  lastVer.fill(0);
}

void ArcEngine::bend(double value) {
  bendRatio = fdlibm::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12);
  target.L = P[p::coil] * 1e-3 / (bendRatio * bendRatio);
  singer.bend = bendRatio;
}

void ArcEngine::setParams(const double *np) {
  const bool first = !hasParams;
  const int oldMode = mode;
  for (int i = 0; i < p::count; i++) P[i] = np[i];
  hasParams = true;
  target = {P[p::current], P[p::gap], P[p::tau], P[p::restrike], P[p::coil] * 1e-3 / (bendRatio * bendRatio), P[p::coilR], P[p::dist], P[p::hiss], P[p::voice]};
  const ArcParams a = arcParams(P.data());
  if (first) {
    sm = target;
    const Op o = arcOp(a);
    for (Arc &arc : arcs) arc.rest(o);
  }
  op = arcOp(a);
  // the capacitors: a new bank, built off the audio thread, nearest the last key first
  const uint64_t v = tuneVersion(bankParams(P.data()));
  if (v != version) {
    version = v;
    snapAt = (snapAt + 1) % (int)snapshots.size();
    Snapshot &s = snapshots[snapAt];
    s.version.store(0, std::memory_order_relaxed);
    std::atomic_thread_fence(std::memory_order_release);
    const ArcParams b = bankParams(P.data());
    const double Q[7] = {b.current, b.gap, b.tau, b.restrike, b.coil, b.coilR, (double)b.tune};
    for (int i = 0; i < 7; i++) s.v[i].store(Q[i], std::memory_order_relaxed);
    s.version.store(version, std::memory_order_release);
#if FORTE_THREADS
    data.prepare(version, KEY_LO, KEY_HI, focus >= 0 && arcs[focus].nM > 0 ? arcs[focus].mKey[0] : 60);
#endif
  }
  const int m = (int)P[p::mode];
  const int n = m == mode_::poly ? std::max(2, std::min(MAXA, (int)jround(P[p::arcs]))) : 1;
  if (first || oldMode != m || n != nArcs) reconfigure(m, n);
}

void ArcEngine::reconfigure(int m, int n) {
  for (Arc &a : arcs) a.releaseAll();
  singer.on = false; nStack = 0;
  const Op o = arcOp(arcParams(P.data()));
  for (int k = 0; k < MAXA; k++) {
    Arc &a = arcs[k];
    if (k >= nArcs && k < n && !a.active()) a.rest(o); // an arc lit afresh starts at rest
    if (n > 1) { const double x = (k / (double)(n - 1) - 0.5) * 1.2, ang = ((x + 1) * PI) / 4; a.gl = fdlibm::cos(ang); a.gr = fdlibm::sin(ang); }
    else { a.gl = std::numbers::sqrt2 / 2; a.gr = std::numbers::sqrt2 / 2; }
  }
  mode = m; nArcs = n; focus = 0;
  if (m == mode_::talk) arcs[0].engage(-1, TALK.C); // the transformer's blocking condenser
}

void ArcEngine::setTable(const double *caps, bool current) {
  for (int i = 0; i < NK; i++) table[i] = caps[i];
  hasTable = true;
  tableVersion = current ? version : 0;
}

// capacitor for a key: the page's table (even a slightly stale one, while a slider moves: the bank
// stays as it was cut), else the key's built for these parameters (in place without threads),
// else its last one, else Kelvin's
double ArcEngine::capOf(int key) {
  const int i = key - KEY_LO;
  const bool in = i >= 0 && i < NK;
  if (hasTable && in && tableVersion == version) return table[i];
  if (lastVer[key] == version) return lastCap[key];
  if (hasTable && in) return table[i];
  if (const KeyData<double>::Ref r = data.get(key, version)) { lastCap[key] = *r.data; lastVer[key] = version; return *r.data; }
  if (lastVer[key]) return lastCap[key];
  return kelvinC(keyFreq(key), P[p::coil] * 1e-3);
}
// The engine's step flattens a note as the trapezoidal rule flattens an LC circuit, ω → (2/h)·atan(ωh/2),
// and the steady-note integration the capacitors are cut with (256 steps a period) by its own, smaller,
// amount. A capacitor is scaled by the difference, so the note lands on its key at any sample rate:
// at 48 kHz, 2.6 ¢ at C8, under 0.1 ¢ from C3 to C6.
double ArcEngine::warped(double C) const {
  const auto a = [](double x) { return fdlibm::atan(x) / x; };
  const double w = 1 / std::sqrt(P[p::coil] * 1e-3 * C), r = a(w * h / 2) / a(PI / SteadyOptions{}.M);
  return C > 0 && std::isfinite(r) ? C * r * r : C;
}
bool ArcEngine::ready(int key) {
  if (const KeyData<double>::Ref r = data.get(key, version)) { lastCap[key] = *r.data; lastVer[key] = version; return true; }
  return false;
}

void ArcEngine::noteOn(int key, double) {
  if (!hasParams || key < 0 || key > 127) return;
  if (mode == mode_::talk) {
    int i = 0; while (i < nStack && stack[i] != key) i++;
    if (i < nStack) { for (int j = i; j + 1 < nStack; j++) stack[j] = stack[j + 1]; nStack--; }
    if (nStack < 128) stack[nStack++] = key;
    singer.f0t = keyFreq(key);
    if (!singer.on || singer.env < 0.01) singer.f0 = singer.f0t;
    singer.on = true;
    return;
  }
  const double C = warped(capOf(key));
  if (mode == mode_::mono) { Arc &a = arcs[0]; if (!a.held()) a.onset = time; a.engage(key, C); focus = 0; return; }
  // several arcs: the arc that already has this key (re-press), else a free one, else steal
  Arc *a = nullptr;
  for (int k = 0; k < nArcs; k++) if (arcs[k].has(key)) { a = &arcs[k]; break; }
  if (!a) {
    double best = 0;
    for (int k = 0; k < nArcs; k++) {
      Arc &c = arcs[k];
      if (c.held()) continue;
      const double rank = (c.active() ? 1e12 : 0) + c.released; // silent arcs first, then the longest released
      if (!a || rank < best) { a = &c; best = rank; }
    }
  }
  if (!a) { // steal the longest-held note that has sounded (it fades as its contact opens)
    Arc *best = nullptr;
    for (int k = 0; k < nArcs; k++) { Arc &c = arcs[k]; if (time - c.onset >= STEAL_AFTER * fs && (!best || c.onset < best->onset)) best = &c; }
    if (!best) return; // every arc has only just started: drop the note rather than cut one off
    // the old note fades as its contact opens; the new capacitor goes in once it has
    best->releaseAll(); best->released = time; best->onset = time;
    best->pendKey = key; best->pendC = C; best->pendAt = time + jround(STEAL_WAIT * fs);
    focus = best->index;
    return;
  }
  if (!a->held()) a->onset = time;
  if (a->pendKey == key) return;
  a->engage(key, C); focus = a->index;
}
void ArcEngine::noteOff(int key, double) {
  if (!hasParams) return;
  if (mode == mode_::talk) {
    int i = 0; while (i < nStack && stack[i] != key) i++;
    if (i < nStack) { for (int j = i; j + 1 < nStack; j++) stack[j] = stack[j + 1]; nStack--; }
    if (nStack) singer.f0t = keyFreq(stack[nStack - 1]); else singer.on = false;
    return;
  }
  for (int k = 0; k < nArcs; k++) { Arc &a = arcs[k]; if (a.holds(key)) { a.release(key); if (!a.held()) a.released = time; } }
}
void ArcEngine::allNotesOff() {
  if (mode == mode_::talk) { singer.on = false; nStack = 0; return; }
  for (Arc &a : arcs) { a.releaseAll(); a.released = time; }
}
int ArcEngine::voiceCount() const {
  int n = 0;
  for (int k = 0; k < nArcs; k++) if (arcs[k].active()) n++;
  return mode == mode_::talk ? (singer.on ? 1 : 0) : n;
}

void ArcEngine::process(float *L, float *R, int n) {
  std::fill(L, L + n, 0.0f); std::fill(R, R + n, 0.0f);
  if (hasParams) for (int s0 = 0; s0 < n; s0 += 128) block(L, R, s0, std::min(128, n - s0));
#if FORTE_THREADS
  // pick up the worker's capacitors a key at a time, so that every key has its latest
  const int key = KEY_LO + poll;
  poll = (poll + 1) % NK;
  if (lastVer[key] != version) if (const KeyData<double>::Ref r = data.get(key, version)) { lastCap[key] = *r.data; lastVer[key] = version; }
#endif
  data.audioCycle();
}

void ArcEngine::block(float *L, float *R, int s0, int n) {
  const double k = kS;
  const bool talk = mode == mode_::talk;
  // per-sample parameter glides and everything that follows from them
  for (int s = 0; s < n; s++) {
    sm.I0 += k * (target.I0 - sm.I0); sm.l += k * (target.l - sm.l); sm.tau += k * (target.tau - sm.tau); sm.rho += k * (target.rho - sm.rho);
    sm.L += k * (target.L - sm.L); sm.R += k * (target.R - sm.R); sm.dist += k * (target.dist - sm.dist); sm.hiss += k * (target.hiss - sm.hiss); sm.voice += k * (target.voice - sm.voice);
    const double A = AYRTON.a + AYRTON.b * sm.l, B = AYRTON.c + AYRTON.d * sm.l, V0 = A + B / sm.I0, Xm = B / (sm.rho * V0 - A);
    const double tau = sm.tau * 1e-6, w = (A * sm.I0 + B) / (A * sm.I0 + 2 * B), z = (h * 2 * w) / tau;
    const double fx = FLOOR_SHARP * Xm;
    sA[s] = A; sB[s] = B; sXm[s] = Xm; sDel2[s] = fx * fx; sItau[s] = 1 / tau; sTh[s] = std::max(0.5, 1 - 1 / z);
    sE[s] = SUPPLY.E; sRb[s] = (SUPPLY.E - V0) / sm.I0;
    sL[s] = talk ? TALK.L : sm.L; sR[s] = talk ? TALK.R : sm.R;
    sKout[s] = pressureGain(sm.dist) / h;
    const double hf = hissFactor(arcs[0].Imean, sm.l);
    sSig[s] = NOISE0 + HISS_RMS * sm.hiss * hf;
    emf[s] = talk ? sm.voice * singer.next() : 0;
  }
  std::fill(osL.begin(), osL.begin() + n * OS, 0.0); std::fill(osR.begin(), osR.begin() + n * OS, 0.0);
  for (Arc &a : arcs) if (a.pendKey != NONE && time >= a.pendAt) { const int key = a.pendKey; a.pendKey = NONE; a.engage(key, a.pendC); }
  for (int a = 0; a < MAXA; a++) {
    Arc &arc = arcs[a];
    if (a < nArcs || arc.active()) {
      if (a == focus) arc.dec = trailDec(arc);
      arc.run(n, talk && a == 0 ? emf : nullptr);
    }
  }
  // decimate
  if (OS == 1) { for (int s = 0; s < n; s++) { L[s0 + s] = (float)osL[s]; R[s0 + s] = (float)osR[s]; } }
  else {
    const int N = firN;
    const double *f = fir.data();
    double *hL = histL.data(), *hR = histR.data();
    int p_ = hp;
    for (int s = 0; s < n; s++) {
      for (int o = 0; o < OS; o++) { const int m = s * OS + o; hL[p_] = hL[p_ + N] = osL[m]; hR[p_] = hR[p_ + N] = osR[m]; p_ = p_ + 1 == N ? 0 : p_ + 1; }
      double yl = 0, yr = 0;
      for (int j = 0; j < N; j++) { yl += f[j] * hL[p_ + j]; yr += f[j] * hR[p_ + j]; }
      L[s0 + s] = (float)yl; R[s0 + s] = (float)yr;
    }
    hp = p_;
  }
  time += n;
  sincePost += n / fs;
  if (messages && sincePost >= POST_EVERY) { sincePost = 0; report(); }
}

// the view's loop shows about two cycles of the sounding note
int ArcEngine::trailDec(const Arc &arc) const {
  double C = arc.CB;
  for (int k = 0; k < arc.nT; k++) if (arc.tDir[k] > 0) C += arc.tC[k];
  const double L = mode == mode_::talk ? TALK.L : sm.L;
  if (!(C > 0)) return std::max(1, (int)jround((fs * OS * 0.01) / TRAIL));
  const double f = 1 / (2 * PI * std::sqrt(L * C));
  return std::max(1, (int)jround((2 * fs * OS) / (f * TRAIL)));
}

void ArcEngine::report() {
  for (int k = 0; k < nArcs; k++) {
    Arc &a = arcs[k];
    const double N = std::max(1.0, a.stN);
    Message m;
    m.type = msg::arc; m.key = (int16_t)k;
    const double v[6] = {a.stP / N, std::sqrt(a.stI2 / N), a.stOut / N, a.stUmax, a.Imean, a.uDC};
    for (int i = 0; i < 6; i++) m.values[i] = (float)v[i];
    int nk = 0;
    for (int j = 0; j < a.nM && nk < 23; j++) m.values[7 + nk++] = (float)a.mKey[j];
    for (int j = 0; j < a.nT && nk < 23; j++) if (a.tDir[j] > 0) m.values[7 + nk++] = (float)a.tKey[j];
    m.values[6] = (float)nk; m.count = (uint16_t)(7 + nk);
    post(m);
    a.stP = 0; a.stI2 = 0; a.stOut = 0; a.stN = 0; a.stUmax = 0;
  }
  const Arc &f = arcs[focus];
  Message h_;
  h_.type = msg::head;
  const double v[12] = {(double)focus, (double)mode, (double)nArcs, (double)f.ti, f.X, sm.I0, op.u0, op.Xm, op.Ur, hissFactor(f.Imean, sm.l), hissCurrent(sm.l),
                        mode == mode_::talk && singer.on ? (double)singer.vowel() : -1.0};
  for (int i = 0; i < 12; i++) h_.values[i] = (float)v[i];
  h_.count = 12;
  post(h_);
  for (int at = 0; at < 2 * TRAIL; at += 29) {
    Message t;
    t.type = msg::trail;
    const int c = std::min(29, 2 * TRAIL - at);
    t.values[0] = (float)at;
    for (int i = 0; i < c; i++) t.values[1 + i] = f.trail[at + i];
    t.count = (uint16_t)(1 + c);
    post(t);
  }
  Message s;
  s.type = msg::show;
  post(s);
}

} // namespace forte::arc
