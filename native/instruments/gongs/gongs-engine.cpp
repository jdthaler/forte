// gongs-engine.cpp — the gong keyboard's engine (gongs-engine.h; gongs/README.md, "Time stepping
// that cannot blow up", explains the scheme).

#include "gongs-engine.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <numbers>

#include "forte/dsp.h"

namespace forte::gongs {

using std::numbers::pi;

namespace {
constexpr double OUT = 0.14;  // output per m/s of surface velocity (at the strike tone's weight)
constexpr int TAPS = 24;      // interpolator taps per phase
// a voice runs linear once its nonlinear energy measure r is below NL_OFF (NL_QUIET if it is quiet:
// under QUIET, or MASKED below the loudest gong); below LITE_R it uses the lite coupling set
constexpr double NL_OFF = 2e-4, NL_QUIET = 1e-3, QUIET = 1e-3, MASKED = 0.03;
constexpr double LITE_R = 1e-2;
// substep control: per-step energy defect up/down, seconds of calm before stepping back, at most
// MAX_SUB substeps, and at most SUB_VOICES voices substepping at once
constexpr double UP = 2e-2, DOWN = 2e-3, CALM = 0.02;
constexpr int MAX_SUB = 2, SUB_VOICES = 2;
// passivity: slack over what the mallets put in, while ψ lags, and the bound's bleed per guard
constexpr double SLACK = 1e-6, LAG = 0.05, BLEED = 1e-3;
constexpr double FIT_PERIODS = 1.5; // the linear tail's statistics average over this many periods
constexpr double CLIP = 2;          // the output is soft-clipped above CLIP (towards 2·CLIP)
constexpr int POST_SAMPLES = 12 * 128; // view messages every 12 blocks of 128
constexpr int BLOCK = 128;          // the blocks the bookkeeping is counted in (the page's)

double sinc2(double t) { if (t < 1e-4) return 1 - (t * t) / 3; const double s = std::sin(t) / t; return s * s; }
double sign(double x) { return x > 0 ? 1 : x < 0 ? -1 : x; }
bool truthy(double x) { return x != 0 && x == x; } // a JavaScript number as a condition
double jsRound(double x) { return std::floor(x + 0.5); }

// Contact: solve δ⁺ + M (Φ(δ⁺) − Φ(δ⁻))/(δ⁺ − δ⁻) = δ_free, Φ(δ) = K δ₊^{5/2}/(5/2).
double pot(double d, double K) { return d > 0 ? 0.4 * K * d * d * std::sqrt(d) : 0; }
double contactF(double d, double dm, double K) {
  if (d <= 0 && dm <= 0) return 0;
  const double dd = d - dm;
  return std::fabs(dd) > 1e-12 * (1 + std::fabs(d)) ? (pot(d, K) - pot(dm, K)) / dd : d > 0 ? K * d * std::sqrt(d) : 0;
}
double contact(double dFree, double dm, double M, double K) {
  if (dFree <= 0 && dm <= 0) return dFree;
  double hi = dFree, lo = dFree - M * contactF(dFree, dm, K) - 1e-12, d = dFree;
  for (int it = 0; it < 60; it++) {
    const double F = contactF(d, dm, K), G = d - dFree + M * F;
    if (std::fabs(G) <= 1e-13 * (1 + std::fabs(dFree))) break;
    if (G > 0) hi = d; else lo = d;
    const double e = 1e-7 * (1 + std::fabs(d)), dG = 1 + (M * (contactF(d + e, dm, K) - contactF(d - e, dm, K))) / (2 * e);
    double dn = d - G / dG;
    if (!(dn > lo && dn < hi)) dn = 0.5 * (lo + hi);
    if (hi - lo < 1e-15 * (1 + std::fabs(d))) break;
    d = dn;
  }
  return d;
}
} // namespace

// ---- the coupling tables, off the audio thread -------------------------------------------------
Shells::Shells() {
#if FORTE_THREADS
  worker = std::thread([this] { run(); });
#endif
}
Shells::~Shells() {
#if FORTE_THREADS
  quit.store(true);
  worker.join();
  Shell *s;
  while (built.pop(s)) delete s;
  while (trash.pop(s)) delete s;
#endif
  for (Entry &e : cache) delete e.shell;
}
#if FORTE_THREADS
// the worker: build the latest request, free what the audio thread retired
void Shells::run() {
  while (!quit.load()) {
    Spec s, last;
    bool any = false;
    while (requests.pop(s)) { last = s; any = true; }
    if (any) {
      Shell *b = buildShell(last).release();
      while (!built.push(b)) {
        if (quit.load()) { delete b; return; }
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
      }
    }
    Shell *t;
    while (trash.pop(t)) delete t;
    if (!any) std::this_thread::sleep_for(std::chrono::milliseconds(2));
  }
}
#endif
const Shell *Shells::find(const Spec &s) {
#if FORTE_THREADS
  Shell *b;
  while (built.pop(b)) adopt(b);
#endif
  for (Entry &e : cache) if (e.shell && e.shell->spec == s) { e.used = ++clock; return e.shell; }
  return nullptr;
}
void Shells::request(const Spec &s) {
  if (find(s)) return;
#if FORTE_THREADS
  if (hasAsked && asked == s) return; // already asked for
  if (requests.push(s)) { asked = s; hasAsked = true; }
#else
  adopt(buildShell(s).release());
#endif
}
void Shells::hold(const Shell *s) { for (Entry &e : cache) if (e.shell == s) { e.holds++; return; } }
void Shells::release(const Shell *s) { for (Entry &e : cache) if (e.shell == s) { e.holds--; return; } }
bool Shells::evict(Entry &e) {
#if FORTE_THREADS
  if (!trash.push(e.shell)) return false;
#else
  delete e.shell;
#endif
  e = Entry{};
  return true;
}
void Shells::adopt(Shell *s) {
#if FORTE_THREADS
  if (hasAsked && asked == s->spec) hasAsked = false;
#endif
  for (Entry &e : cache) if (e.shell && e.shell->spec == s->spec && e.holds == 0) evict(e); // (a stale copy)
  Entry *slot = nullptr;
  for (Entry &e : cache) if (!e.shell) { slot = &e; break; }
  if (!slot) { // full: the least recently used that no voice holds
    for (Entry &e : cache) if (e.holds == 0 && (!slot || e.used < slot->used)) slot = &e;
    if (!slot || !evict(*slot)) {
#if FORTE_THREADS
      if (!trash.push(s))
#endif
        delete s; // (every slot held: cannot happen with fewer voices than slots)
      return;
    }
  }
  *slot = Entry{s, 0, ++clock};
  for (;;) { // keep at most KEEP that no voice holds
    int unheld = 0;
    Entry *lru = nullptr;
    for (Entry &e : cache) if (e.shell && e.holds == 0) { unheld++; if (&e != slot && (!lru || e.used < lru->used)) lru = &e; }
    if (unheld <= KEEP || !lru || !evict(*lru)) break;
  }
}

// ---- a voice ---------------------------------------------------------------------------------------
void View::set(const Pack &pack, int N, int NS) {
  c = &pack;
  rowEnds(pack.p1off, pack.p1j, N, end1.data());
  rowEnds(pack.e1off, pack.e1i, N, endE.data());
  nrows = 0;
  for (int n = 0; n < NS; n++) if (end1[n] > pack.p1off[n]) rows[nrows++] = n;
}

void Voice::init(GongEngine &e, int key_, const double *P_, const Shell &S_) {
  eng = &e;
  keyGong(g, key_, P_, e.fs, S_);
  S = &S_; key = key_; N = g.Nv; R = g.R; k = g.k;
  std::copy(P_, P_ + p::count, P.begin());
  for (Modes *a : {&x, &x1, &xs, &gv, &a0, &a1, &phi, &mL, &mR, &wd, &sg, &m1, &m2, &zt, &zT, &zn, &yp, &tm, &tdw, &toff, &te0, &tw}) a->fill(0);
  for (Coef &c : cf) { c.A.fill(0); c.B.fill(0); c.iD.fill(0); c.WD.fill(0); c.iW.fill(0); }
  zr.fill(0); zi.fill(0); gr.fill(0); gi.fill(0);
  Nb = 0;
  while (Nb < S->N0 && S->cosOf[Nb] < N) Nb++;
  views[0].set(S->full, Nb, S->NS0); views[1].set(S->lite, Nb, S->NS0);
  full = &views[0]; lite = &views[1]; cs = full;
  vScale = g.h * g.w0; // m/s per unit of dx̄/dt̄
  setOutput(P_);
  extra = 0; released = damped = killing = dead = false;
  m = 1; h = k; calm = 0; adapt = true; tail = false; n1 = n2 = lam = tf = 0; fitting = wantFit = odd = armed = false;
  A = cf[0].A.data(); B = cf[0].B.data(); iD = cf[0].iD.data(); WD = cf[0].WD.data(); iW = cf[0].iW.data();
  nl = false; psi = 0; eps0 = 1.5; V = Vprev = V3 = V4 = defect = 0;
  hit = Hit{}; quiet = 0; age = 0; peak = 0; contactMs = 0; Einj = 0; guards = 0; lastF = 0; nlr = 0; v4max = v3max = 0;
  ph = cents = 0; phInit = false; dc = KE = vImpact = 0;
  delete trace; trace = nullptr;
  setDamping();
}

// What reaches the listener: each mode's surface velocity, weighted by (σ_rad)^(far/2) relative to
// the strike tone, at two points near the rim (placed from the strike line, which is at the
// Strike angle from the heavy axis).
void Voice::setOutput(const double *P_) {
  const auto [gl, gr] = keyPan(key, 0.5);
  const double ref = g.loss[S->tuned].srad, far = P_[p::listen], al = P_[p::strikeAngle] * (pi / 180);
  for (int i = 0; i < N; i++) {
    const double w = (OUT * vScale * std::pow(g.loss[i].srad / ref, far / 2)) / k;
    mL[i] = gl * w * interpR(S->R[i].data(), MICS[0][0]) * angular(*S, i, al + MICS[0][1]);
    mR[i] = gr * w * interpR(S->R[i].data(), MICS[1][0]) * angular(*S, i, al + MICS[1][1]);
  }
}

// The exact damped recursion for steps k, k/2, k/4 and k/8 in the energy form, and the energy
// weights W = sinc²(Ωh).
void Voice::setDamping() {
  const double ex = killing ? 300 : damped ? extra : 0, E0 = nl ? energyD() : 0;
  for (int i = 0; i < N; i++) {
    const double Om = S->Om[i], s = (g.sigma[i] + ex) / g.w0;
    sg[i] = s; wd[i] = std::sqrt(std::max(Om * Om - s * s, 1e-9));
  }
  for (int j = 0; j < 4; j++) {
    Coef &c = cf[j];
    const double hh = k / (1 << j);
    for (int i = 0; i < N; i++) {
      const double r = std::exp(-sg[i] * hh), st = (1 - r * r) / (1 + r * r), ct = (2 * r * std::cos(wd[i] * hh)) / (1 + r * r), W = sinc2(S->Om[i] * hh);
      c.iD[i] = 1 / (1 + st); c.A[i] = 2 * ct; c.B[i] = 1 - st; c.WD[i] = W * c.iD[i]; c.iW[i] = 1 / W;
    }
  }
  use();
  if (tail) tailCoeffs();
  if (nl) { const double dE = energyD() - E0; if (dE > 0) Einj += dE; }
}
void Voice::use() {
  Coef &c = cf[m == 1 ? 0 : m == 2 ? 1 : m == 4 ? 2 : 3];
  A = c.A.data(); B = c.B.data(); iD = c.iD.data(); WD = c.WD.data(); iW = c.iW.data();
  h = k / m;
  lam = 1 - std::exp((-2 * h * S->Om[S->tuned]) / (2 * pi * FIT_PERIODS));
}
void Voice::resetFit() {
  m1.fill(0); m2.fill(0); zt.fill(0); zT.fill(0); zn.fill(0);
  std::copy(x.begin(), x.begin() + N, yp.begin());
  n1 = 0; n2 = 0; tf = 0; armed = false;
}

// Change the number of substeps. The previous state is moved to the new spacing exactly for modal
// motion about a fixed offset u (the static response φF/Ω² to a constant contact force F while the
// mallet touches, else each mode's running mean):
//   u(−h') = e^{σh'} [u(0) sin ω(h−h') + u(−h) e^{−σh} sin ωh'] / sin ωh,
// and for the mallet under its constant deceleration. What the modal picture misses is removed
// (or restored) by rescaling the velocity, so the change is energy-neutral.
void Voice::setSub(int mNew) {
  const double E0 = energyD(), hh = h, h2 = k / mNew, F = hit.on ? lastF : 0;
  const double *Om = S->Om.data();
  for (int i = 0; i < N; i++) {
    const double s = std::sin(wd[i] * hh), u = truthy(F) ? (phi[i] * F) / (Om[i] * Om[i]) : nl ? mean(i) : 0;
    x1[i] = u + (std::exp(sg[i] * h2) * ((x[i] - u) * std::sin(wd[i] * (hh - h2)) + (x1[i] - u) * std::exp(-sg[i] * hh) * std::sin(wd[i] * h2))) / s;
  }
  if (hit.on) {
    const double a = -F * hit.Mi, v0 = (hit.xm - hit.xm1 + 0.5 * a * hh * hh) / hh;
    hit.xm1 = hit.xm - v0 * h2 + 0.5 * a * h2 * h2;
    double w1 = 0;
    for (int i = 0; i < N; i++) w1 += phi[i] * x1[i];
    hit.dm1 = hit.xm1 - w1;
  }
  m = mNew; use();
  if (nl) { gradient(); Vprev = V; psi = std::sqrt(std::max(2 * V + eps0, 1e-12 * eps0)); }
  calm = 0;
  const double dE = energyD() - E0;
  if (dE != 0 && !rescale(dE) && dE > 0) Einj += dE;
}

// The scheme's energy: plate (weighted: the physical ½Ω²a² per mode) + (ψ² − ε₀)/2 + mallet and contact.
double Voice::energyD() const {
  double E = 0;
  for (int i = 0; i < N; i++) { const double v = (x[i] - x1[i]) / h; E += iW[i] * (0.5 * v * v + (0.5 * (2 - A[i]) * x[i] * x1[i]) / (h * h)); }
  if (nl) E += 0.5 * (psi * psi - eps0);
  if (hit.on) { const double u = (hit.xm - hit.xm1) / h; E += (0.5 * u * u) / hit.Mi + 0.5 * (pot(hit.d0, hit.K) + pot(hit.dm1, hit.K)); }
  return E;
}

// Rescale the plate velocity by the s nearest 1 so that the scheme's energy changes by −dE.
bool Voice::rescale(double dE) {
  const double ik2 = 1 / (h * h);
  double a = 0, b = 0, c = 0, dw = 0;
  for (int i = 0; i < N; i++) { const double d = x[i] - x1[i], w2 = (2 - A[i]) * ik2 * iW[i]; a += iW[i] * d * d; b -= w2 * x[i] * d; c += w2 * x[i] * x[i]; dw += phi[i] * d; }
  a *= 0.5 * ik2; b *= 0.5; c *= 0.5;
  if (hit.on) { const double M = 1 / hit.Mi, p_ = (hit.xm - hit.xm1 - dw) / h, q = dw / h; a += 0.5 * M * q * q; b += M * p_ * q; c += 0.5 * M * p_ * p_; }
  const double disc = b * b - 4 * a * (c - (a + b + c) + dE);
  if (!(a > 0) || disc < 0) return false;
  const double r = std::sqrt(disc), s1 = (-b + r) / (2 * a), s2 = (-b - r) / (2 * a), s = std::fabs(s1 - 1) < std::fabs(s2 - 1) ? s1 : s2;
  for (int i = 0; i < N; i++) x1[i] = x[i] - s * (x[i] - x1[i]);
  if (hit.on) hit.xm1 += (1 - s) * dw;
  return true;
}

// Passivity guard, a last resort: the gong cannot hold more energy than the mallets gave it.
void Voice::guard(double E) {
  guards++;
  Einj *= 1 - BLEED;
  if (rescale(E - Einj)) return;
  double c = std::sqrt(std::max(0.0, Einj / std::max(E, 1e-30)));
  for (int it = 0; it < 9; it++) {
    if (it == 8) c = 0;
    for (int i = 0; i < N; i++) { x[i] *= c; x1[i] *= c; }
    gradient(); Vprev = V;
    eps0 = std::max(eps0, -8 * V);
    psi = std::sqrt(std::max(2 * V + eps0, 1e-12 * eps0));
    if (energyD() <= Einj) return;
    c = 0.7;
  }
}

double Voice::energy() const { // plate energy (reduced units)
  double E = 0;
  for (int i = 0; i < N; i++) { const double v = (x[i] - x1[i]) / h, X = 0.5 * (x[i] + x1[i]); E += 0.5 * (v * v + S->Om[i] * S->Om[i] * X * X); }
  return E;
}
double Voice::tailAmp2(int i) const {
  const double X = 0.5 * (x[i] + x1[i]) - tm[i], d = x[i] - x1[i], th = 0.5 * tw[i] * h;
  const double c = std::cos(th), s = std::sin(th);
  return (X * X) / (c * c) + (d * d) / (4 * s * s);
}

void Voice::strike(double vel, const double *P_) {
  const Mallet ml = mallet(g, P_, vel);
  const double rs = P_[p::strike];
  if (tail) { tail = false; setDamping(); } // the coefficients go back to the linear ones
  // resolve the contact with ≥ 6 steps (at most MAX_SUB substeps): Hertz contact time on a rigid flat
  const double pm = pi * ml.mu, tc = 3.218 * std::pow(pm * pm / (ml.K * ml.K * std::max(ml.vbar, 1e-6)), 0.2);
  int mm = 1;
  while (mm < MAX_SUB && (6 * k) / mm > tc) mm *= 2;
  if (mm > m) setSub(mm);
  const double al = P_[p::strikeAngle] * (pi / 180); // the strike line, from the heavy axis
  for (int i = 0; i < N; i++) phi[i] = interpR(S->R[i].data(), rs) * angular(*S, i, al);
  double w = 0, w1 = 0;
  for (int i = 0; i < N; i++) { w += phi[i] * x[i]; w1 += phi[i] * x1[i]; }
  const double vb = ml.vbar, hh = h;
  // the mallet starts one step short of the surface, moving at v̄ (plus the surface's own motion)
  const double xm = w - vb * hh, xm1 = xm - vb * hh - (w - w1);
  hit = Hit{true, false, ml.K, 1 / (pi * ml.mu), xm, xm1, xm - w, xm1 - w1, 0, (6 * pi) / S->Om[S->tuned], 0, 0};
  const double ke = 0.5 * pi * ml.mu * vb * vb;
  gradient(); Vprev = V;
  eps0 = 2 * (energy() + std::fabs(V) + ke) + 1e-12;
  psi = std::sqrt(std::max(2 * V + eps0, 1e-12 * eps0));
  resetFit();
  nl = true; nlr = 0; v4max = 0; v3max = 0; released = false; damped = false; setDamping();
  if (cs != full) { cs = full; gradient(); Vprev = V; }
  age = 0; phInit = false; vImpact = ml.v; KE = ke;
  Einj = energyD();
}

// Start from a given displacement, at rest (tests: free vibration of chosen modes).
void Voice::setState(const double *x0, int n) {
  std::fill(x.begin(), x.begin() + N, 0.0); std::fill(x1.begin(), x1.begin() + N, 0.0); tail = false;
  for (int i = 0; i < std::min(N, n); i++) x[i] = x1[i] = x0[i] == x0[i] ? x0[i] : 0;
  gradient(); Vprev = V;
  eps0 = 2 * (energy() + std::fabs(V)) + 1e-12;
  psi = std::sqrt(2 * V + eps0);
  nl = true; hit.on = false; phInit = false; Einj = energyD();
}

// V_nl(x) and g = ∇V_nl (into gv), over this key's modes. The couplings are the cos family's, run
// on each twin pair's complex amplitude z = x_cos − i x_sin (gongs-model.cpp, twinTerms). Row by
// row of in-plane modes: Q̂ = Q^cos − i Q^sin = Σ H z z (or z z̄), then, with ŷ = y^cos + i y^sin,
// each term's share of the gradient to both its modes. Imaginary parts are kept as is and negated
// (zi; see pack), and so are the gradient's (gi, subtracted at the end), so nothing branches.
double Voice::gradient() {
  const Pack &c = *cs->c;
  const int *o1 = c.p1off.data(), *IJ = c.p1ij.data(), *e1o = c.e1off.data(), *EI = c.e1i.data();
  const double *H1 = c.p1h.data(), *EV = c.e1v.data(), *C = S->C0.data();
  const int *co = S->cosOf.data(), *so = S->sinOf.data();
  for (int b = 0; b < Nb; b++) { zr[b] = x[co[b]]; zi[b] = so[b] >= 0 ? -x[so[b]] : 0; zi[NMAX + b] = -zi[b]; gr[b] = gi[b] = gi[NMAX + b] = 0; }
  double s3 = 0, s4 = 0;
  for (int r = 0; r < cs->nrows; r++) {
    const int n = cs->rows[r], e0 = o1[n], e1 = cs->end1[n], f0 = e1o[n], f1 = cs->endE[n];
    double qr = 0, qi = 0;
    for (int e = e0; e < e1; e++) { // (i, j, the imaginary parts' i, j) packed in bytes
      const int k = IJ[e];
      const double ar = zr[k & 255], br = zr[(k >> 8) & 255], ai = zi[(k >> 16) & 255], bi = zi[(unsigned)k >> 24], h = H1[e];
      qr += h * (ar * br - ai * bi); qi += h * (ar * bi + ai * br);
    }
    double lr = 0, li = 0;
    for (int f = f0; f < f1; f++) { lr += EV[f] * zr[EI[f]]; li += EV[f] * zi[EI[f]]; }
    if (!S->sinIp[n]) qi = li = 0;
    // the real in-plane pair: Q^cos = Re Q̂, Q^sin = −Im Q̂ (likewise ℓ); both have the same C
    const double cn = C[n];
    s4 += 0.5 * cn * (qr * qr + qi * qi); s3 += 2 * cn * (qr * lr + qi * li);
    const double yr = cn * (qr + 2 * lr), yim = -cn * (qi + 2 * li); // ŷ/2: each term's H is 2v (v for i = j)
    for (int e = e0; e < e1; e++) {
      const int k = IJ[e], i = k & 255, j = (k >> 8) & 255, ii = (k >> 16) & 255, jj = (unsigned)k >> 24;
      const double h = H1[e], tr = h * yr, ti = h * yim, ar = zr[i], ai = zi[ii], br = zr[j], bi = zi[jj];
      gr[i] += tr * br - ti * bi; gi[ii] += tr * bi + ti * br;
      gr[j] += tr * ar - ti * ai; gi[jj] += tr * ai + ti * ar;
    }
    const double zc = 2 * cn * qr, zs = -2 * cn * qi;
    for (int f = f0; f < f1; f++) { const int i = EI[f]; gr[i] += zc * EV[f]; gi[i] += zs * EV[f]; }
  }
  for (int b = 0; b < Nb; b++) { gv[co[b]] = gr[b]; if (so[b] >= 0) gv[so[b]] = gi[b] - gi[NMAX + b]; }
  V3 = s3; V4 = s4; V = s3 + s4;
  return V;
}

// Consistency projection: ψ pinned to √(V(xⁿ) + V(xⁿ⁻¹) + ε₀), the plate velocity rescaled so the
// scheme's energy is unchanged; the correction's size is the error estimate; the passivity check.
void Voice::project(double Vn) {
  const double Vm = 0.5 * (Vn + Vprev);
  Vprev = Vn;
  if (2 * Vm + eps0 < 0.25 * eps0) { const double e = std::max(2 * eps0, -8 * Vm); psi = sign(psi) * std::sqrt(psi * psi + e - eps0); eps0 = e; }
  const double target = std::sqrt(std::max(2 * Vm + eps0, 1e-12 * eps0)), dE = 0.5 * (psi * psi - target * target);
  const double ik2 = 1 / (h * h);
  double a = 0, b = 0, c = 0, dw = 0;
  for (int i = 0; i < N; i++) { const double d = x[i] - x1[i], w2 = (2 - A[i]) * ik2 * iW[i]; a += iW[i] * d * d; b -= w2 * x[i] * d; c += w2 * x[i] * x[i]; dw += phi[i] * d; }
  a *= 0.5 * ik2; b *= 0.5; c *= 0.5;
  const double Ep = a + b + c, rel = std::fabs(dE) / (Ep + 1e-30);
  if (rel > defect) defect = rel;
  double contactE = 0;
  if (hit.on) {
    const double M = 1 / hit.Mi, p_ = (hit.xm - hit.xm1 - dw) / h, q = dw / h;
    a += 0.5 * M * q * q; b += M * p_ * q; c += 0.5 * M * p_ * p_;
    contactE = 0.5 * (pot(hit.d0, hit.K) + pot(hit.dm1, hit.K));
  }
  double s = 1;
  bool ok = true;
  if (std::fabs(dE) >= 1e-13 * eps0) {
    const double disc = b * b - 4 * a * (c - (a + b + c) - dE);
    if (!(a > 0) || disc < 0) { defect = 1; ok = false; }
    else {
      const double r = std::sqrt(disc), s1 = (-b + r) / (2 * a), s2 = (-b - r) / (2 * a);
      s = std::fabs(s1 - 1) < std::fabs(s2 - 1) ? s1 : s2;
      for (int i = 0; i < N; i++) x1[i] = x[i] - s * (x[i] - x1[i]);
      if (hit.on) hit.xm1 += (1 - s) * dw;
    }
  }
  if (ok) psi = target;
  const double E = a * s * s + b * s + c + contactE + 0.5 * (target * target - eps0);
  if (E > (ok ? 1 + SLACK : 1 + LAG) * Einj + 1e-12 * eps0) { psi = target; guard(E); }
}

// One step of the scheme (size h): advances x, x1.
void Voice::step() {
  const double k2 = h * h;
  if (!nl && !hit.on) {
    if (tail) { for (int i = 0; i < N; i++) { const double xn = A[i] * x[i] - B[i] * x1[i]; x1[i] = x[i]; x[i] = xn * iD[i] + toff[i]; } }
    else for (int i = 0; i < N; i++) { const double xn = A[i] * x[i] - B[i] * x1[i]; x1[i] = x[i]; x[i] = xn * iD[i]; }
    if (trace) trace->insert(trace->end(), x.begin(), x.begin() + N);
    return;
  }
  const double c4 = 0.25 * k2;
  double gx1 = 0, gb = 0, ga0 = 0;
  if (nl) {
    gradient();
    const double v4 = V4 < 0 ? -V4 : V4, v3 = V3 * V3;
    if (v4 > v4max) v4max = v4;
    if (v3 > v3max) v3max = v3;
    project(V);
    // g = ∇V/√(2V + ε₀), with the ε₀ (and the x) the projection leaves
    const double it = 1 / std::sqrt(std::max(2 * V + eps0, 1e-12 * eps0));
    for (int i = 0; i < N; i++) { gv[i] *= it; gx1 += gv[i] * x1[i]; }
  } else std::fill(gv.begin(), gv.begin() + N, 0.0);
  const double nlf = k2 * (psi - 0.25 * gx1);
  for (int i = 0; i < N; i++) {
    const double u = gv[i] * WD[i], a = (A[i] * x[i] - B[i] * x1[i]) * iD[i] - nlf * u;
    a0[i] = a; gb += gv[i] * u; ga0 += gv[i] * a;
  }
  const double den = 1 / (1 + c4 * gb), gX0 = ga0 * den;
  double F = 0, gX1 = 0;
  if (hit.on) {
    double ga1 = 0;
    for (int i = 0; i < N; i++) { a1[i] = k2 * phi[i] * WD[i]; ga1 += gv[i] * a1[i]; }
    gX1 = ga1 * den;
    double w0 = 0, w1 = 0;
    for (int i = 0; i < N; i++) { const double b = c4 * gv[i] * WD[i]; w0 += phi[i] * (a0[i] - b * gX0); w1 += phi[i] * (a1[i] - b * gX1); }
    const double xmF = 2 * hit.xm - hit.xm1, dFree = xmF - w0, Meff = k2 * hit.Mi + w1;
    const double dp = contact(dFree, hit.dm1, Meff, hit.K);
    F = contactF(dp, hit.dm1, hit.K);
    hit.xm1 = hit.xm; hit.xm = xmF - k2 * hit.Mi * F; hit.dm1 = hit.d0; hit.d0 = dp; lastF = F;
    if (F > 0) { hit.touched = true; hit.steps++; if (F > hit.Fmax) hit.Fmax = F; }
    hit.t += h;
    if ((hit.touched && F == 0 && dp < -1) || hit.t > hit.tmax) { contactMs = (hit.steps * h * 1000) / g.w0; hit.on = false; resetFit(); }
  }
  double gdx = 0;
  const bool f = truthy(F);
  for (int i = 0; i < N; i++) {
    const double b = c4 * gv[i] * WD[i], xn = a0[i] - b * gX0 + (f ? F * (a1[i] - b * gX1) : 0);
    gdx += gv[i] * (xn - x1[i]);
    x1[i] = x[i]; x[i] = xn;
  }
  psi += 0.5 * gdx;
  if (fitting && (odd = !odd)) fit();
  if (trace) trace->insert(trace->end(), x.begin(), x.begin() + N);
}

// Running statistics for the linear tail (see resetFit), sampled every other step: each mode's
// mean, and its upward crossings of it. Every mode has Ωh ≤ 2.07, so at two steps none aliases
// onto the mean. The strike tone's crossings are counted with hysteresis, so that the harmonics
// it carries in a crash cannot add crossings.
void Voice::fit() {
  const double l = lam, t0 = tf, dt = 2 * h;
  const int t = S->tuned;
  n1 += l * (1 - n1);
  n2 += l * (n1 - n2);
  const double in2 = 1 / n2;
  for (int i = 0; i < N; i++) {
    const double xi = x[i], u = (m1[i] += l * (xi - m1[i])), mm = (m2[i] += l * (u - m2[i])) * in2, yy = yp[i] - mm, yn = xi - mm;
    if (yy < 0 && yn >= 0 && (i != t || armed)) {
      const double tc = t0 + (dt * yy) / (yy - yn);
      if (zn[i] > 1) zT[i] += 0.3 * (tc - zt[i] - zT[i]); else if (zn[i] > 0) zT[i] = tc - zt[i];
      zt[i] = tc; zn[i]++;
      if (i == t) armed = false;
    }
    yp[i] = xi;
    if (i == t && !armed) { const double v = (xi - x1[i]) / (h * S->Om[t]); if (yn < 0 && yn * yn > 0.09 * (yn * yn + v * v)) armed = true; }
  }
  tf = t0 + dt;
}

void Voice::render(double *bl, double *br, int n, GongEngine &e) {
  if (tail) tailCoeffs();
  // the statistics for a hand-over run only while one may be forced (see limitNonlinear)
  if (nl && wantFit != fitting) { fitting = wantFit; if (fitting) resetFit(); }
  double pk = 0;
  for (int s = 0; s < n; s++) {
    std::copy(x.begin(), x.begin() + N, xs.begin());
    for (int j = 0; j < m; j++) step();
    double l = 0, r = 0;
    for (int i = 0; i < N; i++) { const double v = x[i] - xs[i]; l += mL[i] * v; r += mR[i] * v; }
    bl[s] += l; br[s] += r;
    const double a = l < 0 ? -l : l;
    if (a > pk) pk = a;
    if (nl && adapt) { // substep control
      if (defect > UP && m < MAX_SUB && e.subVoices < SUB_VOICES) { setSub(2 * m); e.subVoices++; }
      else if (m > 1 && defect < DOWN) { if ((calm += k / g.w0) > CALM) setSub(m / 2); }
      else calm = 0;
      defect = 0;
    }
  }
  age += n;
  peak = pk;
  if (!(pk < 1e3) || x[0] != x[0]) {
    dead = true;
    Message msgE; msgE.type = msg::error; msgE.key = (int16_t)key;
    e.post(msgE);
    return;
  }
  // pitch of the strike tone, from the phase advance of its modal coordinate about its slow mean
  const int t = S->tuned;
  const double Om = S->Om[t], X = 0.5 * (x[t] + x1[t]), v = (x[t] - x1[t]) / h, dt = Om * k * n;
  dc += (1 - std::exp(-dt / 25)) * (X - dc);
  const double p_ = std::atan2(-v / Om, X - dc);
  if (phInit) {
    double d = p_ - ph - dt;
    d -= 2 * pi * jsRound(d / (2 * pi));
    cents += 0.25 * ((1200 / std::numbers::ln2) * std::log1p(d / dt) - cents);
  }
  ph = p_; phInit = true;
  // r = (|V₄| + V₃²/E)/E, its largest over the block's steps, held for about two periods of the tone
  if (nl) {
    const double E = std::max(energy(), 1e-30), r = (v4max + v3max / E) / E;
    nlr = std::max(r, nlr * std::exp((-n * k * Om) / (4 * pi)));
    v4max = 0; v3max = 0;
    const bool q = pk < QUIET || pk < MASKED * e.loudest;
    if (!hit.on && (nlr < NL_OFF || (nlr < NL_QUIET && q))) linear();
    else if (!hit.on) { // weakly nonlinear: the lite coupling set
      View *c = nlr < LITE_R ? lite : nlr > 2 * LITE_R ? full : cs;
      if (c != cs) { cs = c; gradient(); Vprev = V; }
    }
  }
  if (!nl && !hit.on) {
    // dead after 40 quiet blocks of 128 output samples (counted in this voice's samples)
    quiet = pk < (damped ? 1e-5 : 3e-6) ? quiet + n : 0;
    if (quiet > 40 * (BLOCK / R)) dead = true;
  }
}

// From here on the voice rings linearly, continuing its motion where the nonlinear one left it.
void Voice::linear() {
  if (m > 1) setSub(1);
  nl = false; nlr = 0;
  const bool ok = fitted();
  bool any = false;
  for (int i = 0; i < N; i++) {
    tm[i] = ok ? mean(i) : 0; tdw[i] = 0;
    if (!ok || zn[i] < 3 || tf - zt[i] > 2 * zT[i]) continue;
    const double w = (2 * pi) / zT[i];
    if (w > 0.6 * wd[i] && w < 1.6 * wd[i]) tdw[i] = w - wd[i];
  }
  for (int i = 0; i < N; i++) if (tm[i] != 0 || tdw[i] != 0) any = true;
  if (any) beginTail(); else tail = false;
}
void Voice::beginTail() {
  for (int i = 0; i < N; i++) { tw[i] = wd[i] + tdw[i]; te0[i] = tailAmp2(i); }
  tail = true; tailCoeffs();
}
// The tail's recursion for the present amplitudes: ω = ω_d + (a/a₀)² Δω.
void Voice::tailCoeffs() {
  for (int i = 0; i < N; i++) {
    const double r = std::exp(-sg[i] * h), f = tdw[i] != 0 && te0[i] > 0 ? std::min(1.0, tailAmp2(i) / te0[i]) : 0;
    tw[i] = wd[i] + f * tdw[i];
    A[i] = (4 * r * std::cos(tw[i] * h)) / (1 + r * r);
    toff[i] = tm[i] * (1 - (A[i] - B[i]) * iD[i]);
  }
}

// view data: mode amplitudes (in thicknesses) and energy per octave band of the key's pitch
double Voice::snapshot(float *amp, int namp, float *band, int nband) const {
  std::fill(band, band + nband, 0.0f);
  double E = 0;
  for (int i = 0; i < N; i++) {
    const double v = (x[i] - x1[i]) / h, X = 0.5 * (x[i] + x1[i]), Om = S->Om[i], e = 0.5 * (v * v + Om * Om * X * X);
    amp[i] = (float)std::sqrt(X * X + (v * v) / (Om * Om));
    const int b = (int)std::max(0.0, std::min(nband - 1.0, std::floor(std::log2(Om / S->Om[S->tuned])) + 1));
    band[b] = (float)(band[b] + e); E += e;
  }
  for (int i = N; i < namp; i++) amp[i] = 0;
  return E;
}

// ---- the engine --------------------------------------------------------------------------------------
// Polyphase interpolator (Kaiser-windowed sinc): a bus at fs/R → fs.
void GongEngine::Upsampler::init(int R_) {
  R = R_;
  const int L = R * TAPS;
  const double c = (L - 1) / 2.0, beta = 7.5;
  auto I0 = [](double v) { double s = 1, t = 1; for (int j = 1; j < 30; j++) { const double q = v / (2 * j); t *= q * q; s += t; } return s; };
  for (int i = 0; i < L; i++) {
    const double u = (i - c) / R, sinc = u == 0 ? 1 : std::sin(pi * u) / (pi * u), q = (2.0 * i) / (L - 1) - 1;
    const double w = I0(beta * std::sqrt(std::max(0.0, 1 - q * q))) / I0(beta);
    h[i] = sinc * w;
  }
  for (int p = 0; p < R; p++) { double s = 0; for (int t = 0; t < TAPS; t++) s += h[p + R * t]; for (int t = 0; t < TAPS; t++) h[p + R * t] /= s; }
}
// one input sample → its R outputs (outL, outR)
void GongEngine::Upsampler::push(double l, double r) {
  w = (w + 1) % TAPS;
  hl[w] = hl[w + TAPS] = l; hr[w] = hr[w + TAPS] = r;
  const int base = w + TAPS;
  for (int p = 0; p < R; p++) {
    double a = 0, b = 0;
    for (int t = 0; t < TAPS; t++) { const double c = h[p + R * t]; a += c * hl[base - t]; b += c * hr[base - t]; }
    outL[p] = a; outR[p] = b;
  }
}

GongEngine::GongEngine(double fs) : Engine(fs) {
  for (int i = 0; i < 4; i++) buses[i].init(1 << i);
}
GongEngine::~GongEngine() { for (Voice &v : pool) delete v.trace; }

void GongEngine::setParams(const double *p_) {
  const bool had = hasP;
  std::array<double, p::count> old = P;
  std::copy(p_, p_ + p::count, P.begin());
  hasP = true;
  shells.request(specOf(P.data())); // build (or fetch) the tables now, not at the next strike
  if (had && (old[p::eta] != P[p::eta] || old[p::radiation] != P[p::radiation] || old[p::thermal] != P[p::thermal] || old[p::release] != P[p::release])) {
    for (int i = 0; i < nv; i++) {
      Voice &v = *order[i];
      for (int id : {p::eta, p::radiation, p::thermal, p::release}) v.P[id] = P[id];
      modeLoss(v.g, v.P.data());
      v.extra = 6.91 / P[p::release]; v.setDamping();
    }
  }
  if (had && old[p::listen] != P[p::listen]) for (int i = 0; i < nv; i++) { Voice &v = *order[i]; v.P[p::listen] = P[p::listen]; v.setOutput(v.P.data()); }
}

void GongEngine::setSustain(bool on) {
  sustain = on;
  if (!on) for (int i = 0; i < nv; i++) { Voice &v = *order[i]; if (v.released && !v.damped) { v.damped = true; v.setDamping(); } }
}

Voice *GongEngine::add(int key, const Shell &S) {
  Voice *slot = nullptr;
  for (Voice &v : pool) {
    bool busy = false;
    for (int i = 0; i < nv && !busy; i++) busy = order[i] == &v;
    if (!busy) { slot = &v; break; }
  }
  if (!slot) { // the pool is full of gongs dying away: the quietest of those that are fading goes
    int victim = -1;
    for (int i = 0; i < nv; i++) if (order[i]->killing && (victim < 0 || order[i]->peak < order[victim]->peak)) victim = i;
    if (victim < 0) for (int i = 0; i < nv; i++) if (victim < 0 || order[i]->peak < order[victim]->peak) victim = i;
    slot = order[victim];
    remove(victim);
  }
  slot->init(*this, key, P.data(), S);
  slot->serial = ++serials;
  shells.hold(&S);
  order[nv++] = slot;
  focus = slot;
  return slot;
}
void GongEngine::remove(int i) {
  shells.release(order[i]->S);
  for (int j = i; j + 1 < nv; j++) order[j] = order[j + 1];
  nv--;
}

void GongEngine::noteOn(int key, double velocity) {
  if (!hasP) return;
  const Spec spec = specOf(P.data());
  if (!shells.find(spec)) { // the tables are being built: the note waits for them (a few ms)
    shells.request(spec);
    if (npending < (int)pending.size()) pending[npending++] = {key, velocity, false};
    return;
  }
  start(key, velocity);
}
void GongEngine::start(int key, double velocity) {
  const Shell *S = shells.find(specOf(P.data()));
  if (!S) return;
  Voice *v = nullptr;
  for (int i = 0; i < nv && !v; i++) if (order[i]->key == key && !order[i]->killing && !order[i]->dead) v = order[i];
  if (v) for (int id : {p::bc, p::rise, p::terms, p::asym, p::thick, p::material}) if (v->P[id] != P[id]) { v->killing = true; v->setDamping(); v = nullptr; break; }
  if (v && v->g.f0 != gongPitch(key, P.data())) { v->killing = true; v->setDamping(); v = nullptr; } // retuned: another gong, cut for the new pitch
  if (!v) v = add(key, *S);
  v->P = P; v->extra = 6.91 / P[p::release]; v->setOutput(P.data());
  v->strike(std::max(0.01, std::min(1.0, velocity)), P.data());
  focus = v;
  int live = 0;
  for (int i = 0; i < nv; i++) if (!order[i]->killing && !order[i]->dead) live++;
  if (live > MAX_VOICES) {
    Voice *victim = nullptr;
    for (int i = 0; i < nv; i++) { Voice *u = order[i]; if (!u->killing && !u->dead && u != v && (!victim || u->peak < victim->peak)) victim = u; }
    if (victim) { victim->killing = true; victim->setDamping(); }
  }
}
void GongEngine::noteOff(int key, double) {
  for (int i = 0; i < npending; i++) if (pending[i].key == key) pending[i].released = true;
  for (int i = 0; i < nv; i++) {
    Voice &v = *order[i];
    if (v.key == key && !v.released) { v.released = true; if (!sustain) { v.damped = true; v.setDamping(); } }
  }
}
void GongEngine::pressure(double value, int key) {
  if (!hasP) return;
  for (int i = 0; i < nv; i++) {
    Voice &v = *order[i];
    if (key < 0 || v.key == key) { v.extra = 6.91 / P[p::release] + 40 * value; v.damped = v.released || value > 0.02; v.setDamping(); }
  }
}
void GongEngine::allNotesOff() {
  npending = 0;
  for (int i = 0; i < nv; i++) { order[i]->killing = true; order[i]->setDamping(); }
}

Voice *GongEngine::place(int key, const double *x0, int n) {
  if (!hasP) return nullptr;
  const Spec spec = specOf(P.data());
  shells.request(spec);
  const Shell *S = shells.find(spec);
  if (!S) return nullptr;
  Voice *v = add(key, *S);
  v->setState(x0, n);
  return v;
}
bool GongEngine::ready() { return hasP && shells.find(specOf(P.data())); }

// Polyphony of the expensive part: at most P.nlvoices gongs run their nonlinear coupling at once.
void GongEngine::limitNonlinear() {
  const double cap = std::max(1.0, hasP ? P[p::nlvoices] : 4.0);
  int count = 0;
  for (int i = 0; i < nv; i++) if (order[i]->nl && !order[i]->killing) count++;
  while (count > cap) {
    Voice *w = nullptr;
    for (int i = 0; i < nv; i++) { Voice *v = order[i]; if (v->nl && !v->killing && !v->hit.on && v->fitted() && (!w || v->nlr < w->nlr)) w = v; }
    if (!w) break;
    w->linear(); count--;
  }
  for (int i = 0; i < nv; i++) {
    Voice *v = order[i];
    if (count < cap || !v->nl || v->killing || v->hit.on) { v->wantFit = false; continue; }
    int rank = 0;
    for (int j = 0; j < nv; j++) { Voice *u = order[j]; if (u != v && u->nl && !u->killing && !u->hit.on && u->nlr < v->nlr) rank++; }
    v->wantFit = count > cap || rank < 2 || (v->fitting && rank < 3);
  }
}

void GongEngine::process(float *L, float *R, int n) {
  for (; n > BLOCK; n -= BLOCK, L += BLOCK, R += BLOCK) process(L, R, BLOCK);
  std::fill(L, L + n, 0.0f); std::fill(R, R + n, 0.0f);
  if (npending) { // notes whose tables have arrived
    int j = 0;
    for (int i = 0; i < npending; i++) {
      const Pending q = pending[i];
      if (hasP && shells.find(specOf(P.data()))) { start(q.key, q.vel); if (q.released) noteOff(q.key, -1); }
      else pending[j++] = q;
    }
    npending = j;
  }
  limitNonlinear();
  subVoices = 0;
  for (int i = 0; i < nv; i++) if (order[i]->m > 1) subVoices++;
  loudest = loud; loud = 0; // the loudest voice's peak in the last block, for masking
  // each bus's input samples in this block: one for each output sample on its grid (fs/R)
  int inputs[4];
  bool active[4] = {};
  for (int b = 0; b < 4; b++) {
    const int Rb = buses[b].R, first = (int)((Rb - frame % Rb) % Rb);
    inputs[b] = first < n ? (n - first + Rb - 1) / Rb : 0;
    std::fill(buses[b].inL.begin(), buses[b].inL.begin() + inputs[b], 0.0); std::fill(buses[b].inR.begin(), buses[b].inR.begin() + inputs[b], 0.0);
  }
  for (int i = 0; i < nv; i++) {
    Voice &v = *order[i];
    const int b = v.R == 1 ? 0 : v.R == 2 ? 1 : v.R == 4 ? 2 : 3;
    if (inputs[b] > 0) v.render(buses[b].inL.data(), buses[b].inR.data(), inputs[b], *this);
    active[b] = true;
    if (v.peak > loud) loud = v.peak;
  }
  for (int b = 0; b < 4; b++) {
    Upsampler &u = buses[b];
    if (active[b]) u.idle = 0;
    else if (u.idle < 3 * (BLOCK / u.R)) u.idle += inputs[b]; // its last voice's tail through the interpolator
    else continue;
    for (int i = 0, j = 0; i < n; i++) {
      const int ph = (int)((frame + i) % u.R);
      if (ph == 0) { u.push(u.inL[j], u.inR[j]); j++; }
      L[i] = (float)(L[i] + u.outL[ph]); R[i] = (float)(R[i] + u.outR[ph]);
    }
  }
  // backstop: a soft clip above CLIP, towards 2·CLIP (normal playing stays far below it)
  for (int i = 0; i < n; i++) {
    const double l = L[i], r = R[i];
    if (l > CLIP || l < -CLIP) L[i] = (float)(sign(l) * CLIP * (1 + std::tanh(std::fabs(l) / CLIP - 1)));
    if (r > CLIP || r < -CLIP) R[i] = (float)(sign(r) * CLIP * (1 + std::tanh(std::fabs(r) / CLIP - 1)));
  }
  for (int i = 0; i < nv;) if (order[i]->dead) remove(i); else i++;
  frame += n;
  if (messages && (sinceView += n) >= POST_SAMPLES) { sinceView = 0; postViews(); }
}

// The focus gong's modes and energy cascade for the views: the page's 'gong' message, in four
// pieces.
void GongEngine::postViews() {
  Voice *f = focus;
  bool alive = false;
  for (int i = 0; i < nv; i++) alive = alive || order[i] == f;
  if (!f || !alive || f->dead) return;
  const double E = f->snapshot(amp, 90, band, 6);
  Message m;
  m.key = (int16_t)f->key;
  m.count = 30;
  for (int piece = 0; piece < 3; piece++) {
    m.type = piece == 0 ? msg::amp1 : piece == 1 ? msg::amp2 : msg::amp3;
    for (int i = 0; i < 30; i++) m.values[i] = amp[30 * piece + i];
    post(m);
  }
  m.type = msg::gong; m.count = 14;
  for (int i = 0; i < 6; i++) m.values[i] = band[i];
  const double v[8] = {E, E > 0 ? f->V / E : 0, f->cents, f->nl ? 1.0 : 0.0, (double)f->m, f->contactMs, f->age / (fs / f->R), (double)f->N};
  for (int i = 0; i < 8; i++) m.values[6 + i] = (float)v[i];
  post(m);
}

} // namespace forte::gongs
