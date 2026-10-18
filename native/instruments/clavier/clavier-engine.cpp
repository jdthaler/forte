// clavier-engine.cpp — the tangent clavier's engine (clavier-engine.h).

#include "clavier-engine.h"

#include <algorithm>
#include <cmath>

namespace forte::clavier {

constexpr double OUT = 0.1;   // pickup signal (m/s) → output
constexpr double BUSHING = 2; // N·s/m: friction of a released key
static double strikeSpeed(double vel) { return 0.3 + 3.7 * vel; } // m/s at the tangent (clavier-params.js)

// The parameters a held note follows at once; any other change makes the next note a new string.
static bool live(int i) {
  switch (i) {
    case p::gap: case p::tip: case p::wrap: case p::t60: case p::hf: case p::stiff: case p::yarn: return false;
    default: return true;
  }
}

// RBJ shelving biquad.
static void shelf(bool low, double f, double db, double fs, double &b0, double &b1, double &b2, double &a1, double &a2) {
  const double A = std::pow(10.0, db / 40), w = (2 * PI * f) / fs, c = std::cos(w), al = std::sin(w) / std::numbers::sqrt2, sA = 2 * std::sqrt(A) * al;
  double a0;
  if (low) { b0 = A * (A + 1 - (A - 1) * c + sA); b1 = 2 * A * (A - 1 - (A + 1) * c); b2 = A * (A + 1 - (A - 1) * c - sA); a0 = A + 1 + (A - 1) * c + sA; a1 = -2 * (A - 1 + (A + 1) * c); a2 = A + 1 + (A - 1) * c - sA; }
  else { b0 = A * (A + 1 + (A - 1) * c + sA); b1 = -2 * A * (A - 1 + (A + 1) * c); b2 = A * (A + 1 + (A - 1) * c - sA); a0 = A + 1 - (A - 1) * c + sA; a1 = 2 * (A - 1 - (A + 1) * c); a2 = A + 1 - (A - 1) * c - sA; }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
}
double ClavierEngine::Shelf::run(double x) {
  const double y = b0 * x + z1;
  z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y;
  return y;
}

ClavierEngine::ClavierEngine(double fs) : Engine(fs), pool(new Voice[POOL]) {
  k = 1 / fs;
  lpF = 1 - std::exp(-1 / (0.01 * fs));      // 10 ms: the tip's quasi-static squeeze, and smoothing of key force
  lpFall = 1 - std::exp(-1 / (0.0005 * fs));
  lpM = 1 - std::exp(-128 / (0.012 * fs));   // mute felt engages over ~12 ms (per block)
  killDecay = std::exp(-1 / (0.004 * fs));
  shelf(true, 130, -3, fs, shL.b0, shL.b1, shL.b2, shL.a1, shL.a2); // amplifier (Gabrielli et al. 2013)
  shelf(false, 4000, 3, fs, shH.b0, shH.b1, shH.b2, shH.a1, shH.a2);
  dcR = std::exp((-2 * PI * 8) / fs);
  lpG = 1 - std::exp(-1 / (0.01 * fs));      // the volume pot, smoothed over 10 ms
  byKey.fill(nullptr);
}

void ClavierEngine::setParams(const double *p) {
  const bool first = !hasParams;
  bool remodel = first, pickups = false, muteX = false;
  for (int i = 0; i < p::count; i++) {
    if (!first && p[i] != P[i]) {
      if (!live(i)) remodel = true;
      if (i == p::pickup || i == p::xLower || i == p::xUpper || i == p::field) pickups = true;
      if (i == p::muteX) muteX = true;
    }
    P[i] = p[i];
  }
  hasParams = true;
  if (remodel) version++;
  tone = toneBiquad(P.data(), fs);
  if (!first) for (int i = 0; i < nVoices; i++) {
    if (pickups) setPickups(*voices[i]);
    if (muteX) setMuteX(*voices[i]);
  }
}

// A fresh string for `key`, from its model.
void ClavierEngine::init(Voice &v, int key) {
  keyModel(key, P.data(), fs, v.mdl);
  const KeyModel &mdl = v.mdl;
  const StringDesign &S = mdl.S;
  v.key = key; v.version = version;
  const int N = mdl.nModes, M = mdl.nYarn;
  const double L = S.L, Ln = S.Ln, mu = S.mu, mn = (mu * L) / 2, nu = (mu * Ln) / 2;
  v.N = N; v.M = M;
  v.q = v.qa; v.q1 = v.qb; v.r = v.ra; v.r1 = v.rb;
  std::fill(v.qa, v.qa + N_MAX, 0.0); std::fill(v.qb, v.qb + N_MAX, 0.0);
  std::fill(v.ra, v.ra + M_MAX, 0.0); std::fill(v.rb, v.rb + M_MAX, 0.0);
  double Cb = 0;
  for (int i = 0; i < N; i++) {
    const Mode &m = mdl.modes[i];
    const int n = m.n;
    const double c = (mu * L * (n % 2 ? 1 : -1)) / (n * PI);
    v.A1[i] = m.a1; v.A2[i] = m.a2;
    v.eps[i] = (m.b * m.kn * m.kn) / mu; // ∂a1/∂T: the recursion's response to a tension change
    v.c[i] = c; v.beta[i] = (m.b * c) / mn; v.w[i] = (m.kn * m.kn * L) / 2;
    Cb += c * v.beta[i];
  }
  double Cy = 0;
  for (int j = 0; j < M; j++) { v.B1[j] = mdl.yarn[j].a1; v.B2[j] = mdl.yarn[j].a2; v.by[j] = mdl.yarn[j].b / nu; Cy += v.by[j]; }
  v.ms = (mu * L) / 3; v.Cb = Cb; v.Cy = Cy;
  v.mass = v.ms - Cb / (k * k);      // residual mass of the speaking static shape (> 0)
  v.kcGain = S.EA / (2 * L);         // ΔT = EA/2L · ∫u_x²
  // the tip and its wrap belong to this string as tuned (S.dTnom): a slider move changes the next
  // note, not the pitch of one already held
  v.Kr = tipK(P.data()); v.wrapK = S.EA / (L * 2 * P[p::wrap] * 1e-3);
  v.s = 0; v.s1 = 0; v.eta = -REST_GAP; v.eta1 = -REST_GAP;
  v.C1 = 0; v.C0 = 0; v.um = 0; v.Q = 0;
  v.Flp = 0; v.Fr = 0; v.Fa = 0; v.force = 0;
  v.Pl = 0; v.Pu = 0; v.ul = 0; v.uu = 0;
  v.pressure = chanPressure; v.down = false; v.thrown = false; v.muted = false;
  v.dead = false; v.killing = false; v.fade = 1; v.peak = 0; v.quiet = 0; v.Fpeak = 0;
  setPickups(v);
  setMuteX(v);
}

void ClavierEngine::setPickups(Voice &v) {
  const double L = v.mdl.S.L;
  const PickupX X = pickupX(v.key, P.data());
  for (int i = 0; i < v.N; i++) { v.Wl[i] = pickupWeight(v.mdl.modes[i].n, X.lower, L); v.Wu[i] = pickupWeight(v.mdl.modes[i].n, X.upper, L); }
  v.xl = X.lower / L; v.xu = X.upper / L;
  const auto [gl, gu] = pickupMix((int)P[p::pickup]);
  v.gl = gl; v.gu = gu;
  v.lam = P[p::field] * 1e-3;
  v.Pl = v.lam * fieldFlux(v.ul / v.lam); v.Pu = -v.lam * fieldFlux(-v.uu / v.lam);
}

void ClavierEngine::setMuteX(Voice &v) {
  const double L = v.mdl.S.L, mu = v.mdl.S.mu, xm = std::min(0.9 * L, P[p::muteX] * 1e-3), mn = (mu * L) / 2;
  double Pb = 0, Pg = 0;
  for (int i = 0; i < v.N; i++) {
    const double ph = std::sin(v.mdl.modes[i].kn * xm);
    v.phi[i] = ph; v.gam[i] = (v.mdl.modes[i].b * ph) / mn;
    Pb += ph * v.beta[i]; Pg += ph * v.gam[i];
  }
  v.xm = xm / L; v.Pb = Pb; v.Pg = Pg;
}

void ClavierEngine::render(Voice &v, double *out, int n) {
  const double k2 = k * k;
  const StringDesign &S = v.mdl.S;
  const int N = v.N, M = v.M;
  const double *A1 = v.A1, *A2 = v.A2, *eps = v.eps, *cc = v.c, *beta = v.beta;
  const double *w = v.w, *Wl = v.Wl, *Wu = v.Wu, *phi = v.phi, *gam = v.gam;
  const double *B1 = v.B1, *B2 = v.B2, *by = v.by;
  const double Kr = v.Kr, lr = P[p::tipLoss], Mt = P[p::keyMass] * 1e-3, gap = S.gap, L = S.L;
  const double mass = v.mass, Cy = v.Cy, Cb = v.Cb;
  const double muteK = MUTE_K * muteLevel, muteR = MUTE_R * muteLevel;
  const bool muted = muteLevel > 1e-4;
  const double G = muteK + muteR / k, Pb = v.Pb, Pg = v.Pg, xm = v.xm;
  const double den = 1 + G * Pg, lamM = xm - Pb / k2;
  const bool kc = P[p::kc] != 0;
  const double kcGain = v.kcGain, wrapK = v.wrapK, dTnom = S.dTnom, Tt = S.T;
  const double lev = S.mag * OUT * fs * (GAP_REF / S.gap), gl = v.gl * lev, gu = v.gu * lev; // levels matched across gaps
  const double lamP = v.lam, xl = v.xl, xu = v.xu;
  const double target = v.down ? P[p::press] + PRESS_MAX * std::max(v.pressure, bendNow) : -RETURN_FORCE;
  double *q = v.q, *q1 = v.q1, *r = v.r, *r1 = v.r1;
  double s = v.s, s1 = v.s1, eta = v.eta, eta1 = v.eta1, C1 = v.C1, C0 = v.C0, um = v.um, Qn = v.Q;
  double Fl = v.Flp, Pl = v.Pl, Pu = v.Pu, peak = 0, fade = v.fade, Frp = v.Fr, Fap = v.Fa;
  if (muted && !v.muted) { um = xm * s; for (int i = 0; i < N; i++) um += phi[i] * q[i]; } // felt lands: where is the string?
  v.muted = muted;
  for (int t = 0; t < n; t++) {
    // tension of the speaking length: stretch + wrap (from the quasi-static tip force) − the tuned state
    const double dl = Fl > 0 ? Fl / Kr : 0, dW = wrapK * dl * std::cbrt(dl); // δ² = (F/K)^(4/3)
    double dT = (kc ? kcGain * Qn : (kcGain * s * s) / L) + dW - dTnom;
    if (dT < -0.5 * Tt) dT = -0.5 * Tt; else if (dT > 0.6 * Tt) dT = 0.6 * Tt;
    // 1. free step (into q1)
    double SC = 0, SU = 0;
    if (muted) for (int i = 0; i < N; i++) { const double x = (A1[i] - eps[i] * dT) * q[i] - A2[i] * q1[i]; q1[i] = x; SC += cc[i] * x; SU += phi[i] * x; }
    else for (int i = 0; i < N; i++) { const double x = (A1[i] - eps[i] * dT) * q[i] - A2[i] * q1[i]; q1[i] = x; SC += cc[i] * x; }
    double RF = 0;
    for (int j = 0; j < M; j++) { const double x = B1[j] * r[j] - B2[j] * r1[j]; r1[j] = x; RF += x; }
    // 2. contact solve. Junction: z = s⁺ = RF + Cy·Fj, with
    //    Fj = Fc + λ·Fm − mass·ŝ − J0 − Ks·s,  ŝ = (z − 2s + s1)/k²,  Fm = f1 z + f0 (felt)
    const double s0 = (-2 * s + s1) / k2, J0 = (SC - 2 * C1 + C0) / k2, Ks = (Tt + dT) / L;
    double f1 = 0, f0 = 0;
    if (muted) { f1 = (-G * lamM) / den; f0 = (-G * (SU - Pb * s0) + (muteR / k) * um) / den; }
    const double Az = 1 / Cy - lamM * f1 + mass / k2;
    const double Bz = -RF / Cy - lamM * f0 + mass * s0 + J0 + Ks * s;
    const double Fkey = v.thrown ? 0 : v.down ? (v.force += lpF * (target - v.force)) : -RETURN_FORCE;
    // the finger on a held key catches its rebound (it damps upward motion, not the stroke); a
    // released key only rubs its bushings
    const double cK = v.down ? (!v.thrown && eta < eta1 ? KEY_DAMPING : 0) : BUSHING, Ae = Mt / k2 + cK / (2 * k);
    const double Be = -(Mt * (2 * eta - eta1)) / k2 - (cK * eta1) / (2 * k) - Fkey;
    double z = -Bz / Az, e = -Be / Ae, Fr = 0, Fa = 0;
    if (e - z > 0 || z - gap > 0) {
      if (Frp > 0 || Fap > 0) { z = s; e = eta; }
      const double d0 = eta - s, p0 = s - gap;
      double res = INFINITY, zp = z, ep = e;
      for (int it = 0; it < 40; it++) {
        // rubber tip and anvil: F = K δ^1.5 (1 + λ dδ/dt), never pulling
        const double d = e - z, pp = z - gap;
        double dFr = 0, dFa = 0;
        Fr = 0; Fa = 0;
        if (d > 0) {
          const double sq = std::sqrt(d), hc = 1 + (lr * (d - d0)) / k;
          Fr = Kr * d * sq * hc;
          if (Fr > 0) dFr = Kr * (1.5 * sq * hc + (d * sq * lr) / k); else Fr = 0;
        }
        if (pp > 0) {
          const double sq = std::sqrt(pp), hc = 1 + (ANVIL_LOSS * (pp - p0)) / k;
          Fa = ANVIL_K * pp * sq * hc;
          if (Fa > 0) dFa = ANVIL_K * (1.5 * sq * hc + (pp * sq * ANVIL_LOSS) / k); else Fa = 0;
        }
        const double g1 = Az * z + Bz - Fr + Fa, g2 = Ae * e + Be + Fr, nr = std::fabs(g1) + std::fabs(g2);
        if (nr < 1e-10 * (1 + Fr + Fa)) break;
        if (nr > res) { z = 0.5 * (z + zp); e = 0.5 * (e + ep); continue; } // backtrack
        res = nr; zp = z; ep = e;
        const double J11 = Az + dFr + dFa, J22 = Ae + dFr, det = J11 * J22 - dFr * dFr;
        const double dz = (-g1 * J22 - dFr * g2) / det, de = (-g2 * J11 - dFr * g1) / det;
        z += dz; e += de;
        if (std::fabs(dz) < 1e-15 && std::fabs(de) < 1e-15) break;
      }
    }
    if (Fr > 0 && v.thrown) { v.thrown = false; v.force = target; }
    const double Fc = Fr - Fa, Fm = f1 * z + f0, sh = z / k2 + s0;
    const double Fj = Fc + lamM * Fm - mass * sh - J0 - Ks * s;
    // 3. modal update (into q1, then swap)
    double Q = 0, yl = 0, yu = 0;
    if (muted) for (int i = 0; i < N; i++) { const double x = q1[i] - beta[i] * sh + gam[i] * Fm; q1[i] = x; Q += w[i] * x * x; yl += Wl[i] * x; yu += Wu[i] * x; }
    else for (int i = 0; i < N; i++) { const double x = q1[i] - beta[i] * sh; q1[i] = x; Q += w[i] * x * x; yl += Wl[i] * x; yu += Wu[i] * x; }
    double zs = 0;
    for (int j = 0; j < M; j++) { const double x = r1[j] + by[j] * Fj; r1[j] = x; zs += x; }
    std::swap(q, q1); std::swap(r, r1);
    C0 = C1; C1 = SC - Cb * sh + Pb * Fm;
    um = xm * zs + SU - Pb * sh + Pg * Fm;
    s1 = s; s = zs; eta1 = eta; eta = e;
    if (!v.down && eta < -REST_GAP) { eta = eta1 = -REST_GAP; }
    Qn = Q + (s * s) / L;
    Frp = Fr; Fap = Fa;
    Fl += (Fr < Fl ? lpFall : lpF) * (Fr - Fl); // the wrap lets go as soon as the tip lifts
    if (Fa > v.Fpeak) v.Fpeak = Fa;
    // pickups: Φ ∝ e^(±u/λ); output ∝ dΦ/dt, normalised to the string's velocity
    const double ul = xl * s + yl, uu = xu * s + yu;
    const double nPl = lamP * fieldFlux(ul / lamP), nPu = -lamP * fieldFlux(-uu / lamP);
    double y = gl * (nPl - Pl) + gu * (nPu - Pu);
    Pl = nPl; Pu = nPu; v.ul = ul; v.uu = uu;
    if (v.killing) { fade *= killDecay; y *= fade; }
    out[t] += y;
    const double a = y < 0 ? -y : y;
    if (a > peak) peak = a;
  }
  v.q = q; v.q1 = q1; v.r = r; v.r1 = r1; v.Q = Qn; v.Fr = Frp; v.Fa = Fap;
  v.s = s; v.s1 = s1; v.eta = eta; v.eta1 = eta1; v.C1 = C1; v.C0 = C0; v.um = um;
  v.Flp = Fl; v.Pl = Pl; v.Pu = Pu; v.fade = fade;
  v.peak = peak;
  if (!(peak < 1e3) || !std::isfinite(s)) {
    v.dead = true;
    Message m;
    m.type = msg::error; m.key = (int16_t)v.key;
    post(m);
    return;
  }
  if (v.killing && fade < 1e-4) v.dead = true;
  if (!v.down && eta <= -REST_GAP) {
    v.quiet = peak < 3e-5 ? v.quiet + 1 : 0;
    if (v.quiet > 40) v.dead = true;
  }
}

void ClavierEngine::pressure(double value, int key) {
  const double x = std::min(1.0, std::max(0.0, value));
  if (key < 0) { chanPressure = x; for (int i = 0; i < nVoices; i++) voices[i]->pressure = x; }
  else for (int i = 0; i < nVoices; i++) if (voices[i]->key == key) voices[i]->pressure = x;
}
void ClavierEngine::bend(double value) { bendNow = std::max(0.0, std::min(1.0, value)); }

void ClavierEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < KEY_MIN || key > KEY_MAX) return;
  Voice *v = byKey[key - KEY_MIN];
  if (!v || v->dead || v->killing || v->version != version) {
    if (v && !v->dead) { v->down = false; v->thrown = false; } // release()
    // a free slot of the pool; when every one holds a string (sixty-odd at once), the faintest of
    // those fading out, or else the faintest
    bool used[POOL] = {};
    for (int i = 0; i < nVoices; i++) used[voices[i] - pool.get()] = true;
    int slot = -1;
    for (int i = 0; i < POOL && slot < 0; i++) if (!used[i]) slot = i;
    if (slot < 0) {
      int pos = -1;
      double score = INFINITY;
      for (int pass = 0; pass < 2 && pos < 0; pass++)
        for (int i = 0; i < nVoices; i++) {
          const Voice &u = *voices[i];
          if (pass == 0 && !u.killing) continue;
          const double sc = pass == 0 ? u.fade * u.peak : u.peak + (u.down ? 1 : 0);
          if (sc < score) { score = sc; pos = i; }
        }
      Voice *gone = voices[pos];
      if (byKey[gone->key - KEY_MIN] == gone) byKey[gone->key - KEY_MIN] = nullptr;
      std::copy(voices.begin() + pos + 1, voices.begin() + nVoices, voices.begin() + pos);
      nVoices--;
      slot = (int)(gone - pool.get());
    }
    v = &pool[slot];
    init(*v, key);
    voices[nVoices++] = v;
    byKey[key - KEY_MIN] = v;
  }
  v->pressure = chanPressure;
  // strike: the tangent flies at the key's speed until it meets the string
  v->eta1 = v->eta - strikeSpeed(std::min(1.0, std::max(0.0, velocity))) * k;
  v->down = true; v->thrown = true; v->Fpeak = 0;
  if (nVoices > MAX_VOICES) {
    Voice *victim = nullptr;
    double score = INFINITY;
    for (int i = 0; i < nVoices; i++) {
      Voice *u = voices[i];
      if (u != v && !u->killing && u->peak + (u->down ? 1 : 0) < score) { score = u->peak + (u->down ? 1 : 0); victim = u; }
    }
    if (victim) victim->killing = true;
  }
}

void ClavierEngine::noteOff(int key, double) {
  if (key < KEY_MIN || key > KEY_MAX) return;
  if (Voice *v = byKey[key - KEY_MIN]) { v->down = false; v->thrown = false; }
}

void ClavierEngine::allNotesOff() { for (int i = 0; i < nVoices; i++) voices[i]->killing = true; }

void ClavierEngine::process(float *L, float *R, int n) {
  for (int at = 0; at < n; at += BLOCK_MAX) block(L + at, R + at, std::min(BLOCK_MAX, n - at));
}

void ClavierEngine::block(float *L, float *R, int n) {
  if (!hasParams) { std::fill(L, L + n, 0.0f); std::fill(R, R + n, 0.0f); return; }
  double *x = mono.data();
  std::fill(x, x + n, 0.0);
  const bool on = P[p::muteOn] != 0 || space;
  muteLevel += lpM * ((on ? P[p::mute] : 0) - muteLevel);
  if (muteLevel < 1e-4 && !on) muteLevel = 0;
  for (int i = 0; i < nVoices; i++) render(*voices[i], x, n);
  int j = 0;
  for (int i = 0; i < nVoices; i++) {
    Voice *v = voices[i];
    if (v->dead) { if (byKey[v->key - KEY_MIN] == v) byKey[v->key - KEY_MIN] = nullptr; }
    else voices[j++] = v;
  }
  nVoices = j;
  const double gT = std::pow(10.0, P[p::gain] / 20);
  double g = gain < 0 ? gT : gain;
  for (int i = 0; i < n; i++) {
    g += lpG * (gT - g);
    const double xi = x[i];
    double y = tone.b0 * xi + tz1;
    tz1 = tone.b1 * xi - tone.a1 * y + tz2; tz2 = tone.b2 * xi - tone.a2 * y;
    y = shL.run(shH.run(y));
    const double d = y - dcx + dcR * dcy;
    dcx = y; dcy = d;
    L[i] = (float)(g * d); R[i] = (float)(g * d);
  }
  gain = g;
}

} // namespace forte::clavier
