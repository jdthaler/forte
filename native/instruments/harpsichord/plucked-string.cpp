// plucked-string.cpp — one string, its contacts and its plectra (plucked-string.h).

#include "plucked-string.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <numbers>

namespace forte::harpsichord {

using std::numbers::pi;

void PluckedString::init(const StringDesign &S_, const Partials &parts, double fs_) {
  S = S_; N = parts.N; Na = N; fs = fs_; h = 1 / fs_;
  for (int i = 0; i < N; i++) {
    W[i] = 2 * pi * parts.f[i]; K[i] = parts.k[i]; BF[i] = parts.b[i]; sigBase[i] = parts.sigma[i]; G[i] = (K[i] * K[i]) / S.mu;
    SC[i] = (parts.b[i] < 0 ? -1 : 1) * std::sqrt(2 * parts.sigB[i]) * fs_;
  }
  kc = (S.mat->E * S.A) / (2 * S.L); dT = 0; stretched = false; kcOn = false;
  for (int i = 0; i < N_MAX; i++) { qa[i] = qb[i] = 0; extra[i] = 0; }
  flip = false;
  nrm = std::sqrt(2 / (S.mu * S.L));
  x.fill(-1);
  cDirty = true;
  uNow.fill(0); uOld.fill(0); uf.fill(0); hv.fill(0); al.fill(0); be.fill(0); Fc.fill(0); act.fill(0);
  phase = {Phase::off, Phase::off};
  gap.fill(0); s.fill(0); zOld.fill(0); Kz.fill(0); Fp.fill(0); Fd = 0; passDepth.fill(0);
  released = {false, false}; relInfo = {};
  onRelease = nullptr; ctx = nullptr;
  feltK = feltR = feltPre = tongueK = thick = buffK = buffR = 0;
  peakF = 0; work = 0;
  setDamping(nullptr);
}

void PluckedString::setDamping(const double *ex) {
  for (int i = 0; i < N; i++) {
    const double sg = sigBase[i] + (ex ? ex[i] : 0), w0 = W[i], r = std::exp(-sg * h);
    const double wd = std::sqrt(std::max(w0 * w0 - sg * sg, 1e-6));
    A1[i] = 2 * r * std::cos(wd * h); A2[i] = r * r; sig[i] = sg;
    Bin[i] = (1 - A1[i] + A2[i]) / (w0 * w0);
    EP[i] = ((r * h * std::sin(wd * h)) / wd) * G[i]; // −∂a₁/∂(ω²) · g
  }
  for (int p = 0; p < MAXP; p++) if (x[p] >= 0) fillPoint(p);
  cDirty = true;
}

void PluckedString::setPoint(int p, double xp) {
  if (x[p] == xp) return;
  x[p] = xp; fillPoint(p); cDirty = true; hv[p] = 0;
}
void PluckedString::fillPoint(int p) {
  const double xp = x[p];
  double *PH = PHI[p].data(), *PB = PHB[p].data();
  for (int i = 0; i < N; i++) { PH[i] = nrm * std::sin(K[i] * xp); PB[i] = Bin[i] * PH[i]; }
}
void PluckedString::updateC() {
  for (int i = 0; i < MAXP; i++) for (int j = i; j < MAXP; j++) {
    double c = 0;
    if (x[i] >= 0 && x[j] >= 0) { const double *A = PHI[i].data(), *B = PHB[j].data(); for (int n = 0; n < Na; n++) c += A[n] * B[n]; }
    C[i * MAXP + j] = C[j * MAXP + i] = c;
  }
  cDirty = false;
}
double PluckedString::dispAtQ(int p, const double *qq, int n) const {
  const double *A = PHI[p].data();
  double u = 0;
  for (int i = 0; i < n; i++) u += A[i] * qq[i];
  return u;
}
double PluckedString::staticCompliance(int p) const {
  const double *A = PHI[p].data();
  double c = 0;
  for (int i = 0; i < N; i++) c += (A[i] * A[i]) / (W[i] * W[i]);
  return c;
}

void PluckedString::armPlectrum(int p, const Plectrum *plp, double xp, double g, bool engaged, bool jackUp) {
  if (!engaged) { phase[p] = Phase::off; return; }
  setPoint(p, xp);
  pl[p] = *plp; gap[p] = g; passDepth[p] = plp->overlap;
  Kz[p] = (S.T * S.L) / (xp * (S.L - xp));
  // a plectrum already under its string (perhaps loading it) stays as it is; one newly engaged is
  // under the string or above it, as the jack stands
  if (phase[p] == Phase::off) { phase[p] = jackUp ? Phase::above : Phase::under; s[p] = plp->s0; zOld[p] = plp->s0; }
  released[p] = false;
}

double PluckedString::energy() const {
  const double *a_ = q(), *b_ = q1();
  double E = 0;
  for (int i = 0; i < Na; i++) {
    const double w = W[i], c = std::cos(w * h), s2 = std::pow(std::sin(w * h), 2), a = a_[i], b = b_[i];
    E += (w * w * (a * a - 2 * c * a * b + b * b)) / (2 * s2);
  }
  return E;
}

bool PluckedString::needsContacts(double liftMax, bool keyDown, bool buffOn) const {
  for (int p = 0; p < 2; p++) {
    const Phase ph = phase[p];
    if (ph == Phase::under && (keyDown || liftMax - gap[p] > -0.5e-3 || s[p] != pl[p].s0)) return true;
    if (ph == Phase::above && !keyDown) return true;
  }
  if (x[PT::DAMPER] >= 0 && liftMax < feltPre + 2e-3) return true;
  return buffOn && x[PT::BUFF] >= 0;
}

double PluckedString::render(int n, const double *lift, bool keyDown, const double *buffG, double *seg, int stride, const double *wts, int w0, int w1, double gain,
                             double *sym) {
  const bool buffOn = buffG[0] > 1e-6 || buffG[n - 1] > 1e-6;
  double lmax = 0;
  for (int t = 0; t < n; t++) if (lift[t] > lmax) lmax = lift[t];
  if (!needsContacts(lmax, keyDown, buffOn)) return sym ? free<true>(n, seg, stride, w0, w1, wts, gain, sym) : free<false>(n, seg, stride, w0, w1, wts, gain, sym);
  if (cDirty) updateC();
  const int Nn = Na;
  const double *a1 = A1.data(), *a2 = A2.data(), *bf = BF.data(), *ep = EP.data(), *g = G.data();
  double most = 0;
  bool ran = false;
  const int s0 = w0 * stride, s1 = w1 * stride;
  const double k0 = wts[w0] * gain, k1 = wts[w1] * gain;
  double *qq = q(), *qq1 = q1();
  double ymin = std::numeric_limits<double>::infinity(), ymax = -ymin;
  for (int t = 0; t < n; t++) {
    const double L = lift[t], bg = buffG[t];
    const bool kcs = kcOn && stretched;
    const double d = kcs ? dT : 0; // a₁ − ep·δT: the stretched string's partials (δT = 0: linear)
    // 1. candidates and their laws F = α − βu
    int m = 0;
    for (int p = 0; p < MAXP; p++) {
      act[p] = 0;
      if (x[p] < 0) continue;
      bool cand = false;
      if (p < 2) {
        const Phase ph = phase[p];
        const double y = L - gap[p];
        if (ph == Phase::under && (keyDown || y > -0.5e-3 || s[p] != pl[p].s0)) { const double k = 1 / beamC(pl[p], s[p]); al[p] = k * y; be[p] = k; cand = true; }
        else if (ph == Phase::above && !keyDown) { al[p] = tongueK * (y - thick); be[p] = tongueK; cand = true; }
      } else if (p == PT::DAMPER) {
        if (L < feltPre + 2e-3) { al[p] = feltK * (L - feltPre); be[p] = feltK + feltR / (2 * h); cand = true; }
      } else if (bg > 1e-6) { al[p] = 0; be[p] = bg * (buffK + buffR / (2 * h)); cand = true; }
      if (!cand) { hv[p] = 0; continue; }
      if (!hv[p]) { uNow[p] = dispAtQ(p, qq, Nn); uOld[p] = dispAtQ(p, qq1, Nn); hv[p] = 1; }
      if (p == PT::DAMPER) al[p] += (feltR / (2 * h)) * uOld[p];
      else if (p == PT::BUFF) al[p] += ((bg * buffR) / (2 * h)) * uOld[p];
      act[p] = 1; idx[m++] = p;
    }
    // 2. the free step, with the free displacement at the candidates
    if (m == 0) {
      for (int i = 0; i < Nn; i++) qq1[i] = (a1[i] - ep[i] * d) * qq[i] - a2[i] * qq1[i];
    } else if (m == 1) {
      const double *P0 = PHI[idx[0]].data();
      double u0 = 0;
      for (int i = 0; i < Nn; i++) { const double v = (a1[i] - ep[i] * d) * qq[i] - a2[i] * qq1[i]; qq1[i] = v; u0 += P0[i] * v; }
      uf[idx[0]] = u0;
    } else {
      const double *P0 = PHI[idx[0]].data(), *P1 = PHI[idx[1]].data(), *P2 = PHI[idx[m > 2 ? 2 : 1]].data(), *P3 = PHI[idx[m > 3 ? 3 : 1]].data();
      double u0 = 0, u1 = 0, u2 = 0, u3 = 0;
      for (int i = 0; i < Nn; i++) { const double v = (a1[i] - ep[i] * d) * qq[i] - a2[i] * qq1[i]; qq1[i] = v; u0 += P0[i] * v; u1 += P1[i] * v; u2 += P2[i] * v; u3 += P3[i] * v; }
      uf[idx[0]] = u0; uf[idx[1]] = u1;
      if (m > 2) uf[idx[2]] = u2;
      if (m > 3) uf[idx[3]] = u3;
    }
    double y = 0;
    if (m) {
      solve();
      // 3. plectra: a loaded one slides along and may let go; an unloaded one eases back; a
      // returning one gets past once the tongue has swung far enough
      bool again = false;
      for (int a = 0; a < m; a++) {
        const int p = idx[a];
        if (p > 1) continue;
        if (phase[p] == Phase::under) {
          if (act[p]) { if (slide(p, Fc[p], L - gap[p])) again = true; }
          else ease(p);
        } else if (act[p]) {
          const double pen = uf[p] + cross(p) + C[p * MAXP + p] * Fc[p] - (L - gap[p] - thick);
          if (pen > passDepth[p]) { phase[p] = Phase::under; s[p] = pl[p].s0; zOld[p] = pl[p].s0; act[p] = 0; Fc[p] = 0; again = true; }
        }
      }
      if (again) solve();
      // 4. apply the forces; the bridge force
      const double f0 = act[idx[0]] ? Fc[idx[0]] : 0, *B0 = PHB[idx[0]].data();
      if (m == 1) {
        if (f0 != 0) for (int i = 0; i < Nn; i++) { const double v = qq1[i] + B0[i] * f0; qq1[i] = v; y += bf[i] * v; }
        else for (int i = 0; i < Nn; i++) y += bf[i] * qq1[i];
      } else {
        const double f1 = act[idx[1]] ? Fc[idx[1]] : 0, *B1 = PHB[idx[1]].data();
        const double f2 = m > 2 && act[idx[2]] ? Fc[idx[2]] : 0, *B2 = PHB[idx[m > 2 ? 2 : 1]].data();
        const double f3 = m > 3 && act[idx[3]] ? Fc[idx[3]] : 0, *B3 = PHB[idx[m > 3 ? 3 : 1]].data();
        for (int i = 0; i < Nn; i++) { const double v = qq1[i] + B0[i] * f0 + B1[i] * f1 + B2[i] * f2 + B3[i] * f3; qq1[i] = v; y += bf[i] * v; }
      }
      // 5. the candidates' displacement one step on, by superposition: u = u_free + C F
      for (int a = 0; a < m; a++) {
        const int p = idx[a];
        double u = uf[p];
        for (int b = 0; b < m; b++) { const int j = idx[b]; if (act[j]) u += C[p * MAXP + j] * Fc[j]; }
        if (p < 2 && act[p]) { work += (Fc[p] * (u - uOld[p])) / 2; const double af = Fc[p] < 0 ? -Fc[p] : Fc[p]; if (af > peakF) peakF = af; stretched = true; }
        uOld[p] = uNow[p]; uNow[p] = u;
      }
      Fp[0] = act[0] ? Fc[0] : 0; Fp[1] = act[1] ? Fc[1] : 0; Fd = act[PT::DAMPER] ? Fc[PT::DAMPER] : 0;
    } else {
      for (int i = 0; i < Nn; i++) y += bf[i] * qq1[i];
      Fp[0] = Fp[1] = 0; Fd = 0;
    }
    if (sym) {
      double z = 0;
      for (int i = 0; i < Nn; i++) z += SC[i] * (qq1[i] - qq[i]);
      sym[t] += z;
    }
    if (kcs) {
      double Q = 0;
      for (int i = 0; i < Nn; i++) Q += g[i] * qq1[i] * qq1[i];
      dT = std::min(kc * Q, 0.1 * S.T); ran = true;
      if (dT > most) most = dT;
    }
    std::swap(qq, qq1);
    seg[s0 + t] += k0 * y;
    if (s1 != s0) seg[s1 + t] += k1 * y;
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
  }
  flip = qq == qb.data();
  if (ran && most < 1e-5 * S.T) { stretched = false; dT = 0; }
  return 0.5 * (ymax - ymin);
}
// Σ_{j≠p} C_pj F_j over the active points: what the other contacts add at point p.
double PluckedString::cross(int p) const {
  double u = 0;
  for (int j = 0; j < MAXP; j++) if (j != p && act[j]) u += C[p * MAXP + j] * Fc[j];
  return u;
}

// The free string: partials only, the fast path.
template <bool SY>
double PluckedString::free(int n, double *seg, int stride, int w0, int w1, const double *wts, double gain, double *sym) {
  const int Nn = Na;
  const double *a1 = A1.data(), *a2 = A2.data(), *bf = BF.data();
  const int s0 = w0 * stride, s1 = w1 * stride;
  const double k0 = wts[w0] * gain, k1 = wts[w1] * gain;
  double *qq = q(), *qq1 = q1();
  double ymin = std::numeric_limits<double>::infinity(), ymax = -ymin;
  const bool kcs = kcOn && stretched;
  // δT is held below T/10: the first-order a₁ (slope θ sin θ, θ = ωk) then stays stable up to 0.45 fs
  const double *ep = EP.data(), *g = G.data(), *sc = SC.data(), dTmax = 0.1 * S.T;
  double most = 0;
  for (int t = 0; t < n; t++) {
    double y = 0, z = 0;
    if (kcs) {
      const double d = dT;
      double Q = 0;
      for (int i = 0; i < Nn; i++) {
        const double v = (a1[i] - ep[i] * d) * qq[i] - a2[i] * qq1[i];
        if (SY) z += sc[i] * (v - qq[i]);
        qq1[i] = v; y += bf[i] * v; Q += g[i] * v * v;
      }
      dT = std::min(kc * Q, dTmax);
      if (dT > most) most = dT;
    } else {
      for (int i = 0; i < Nn; i++) {
        const double v = a1[i] * qq[i] - a2[i] * qq1[i];
        if (SY) z += sc[i] * (v - qq[i]);
        qq1[i] = v; y += bf[i] * v;
      }
    }
    if (SY) sym[t] += z;
    std::swap(qq, qq1);
    seg[s0 + t] += k0 * y;
    if (s1 != s0) seg[s1 + t] += k1 * y;
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
  }
  flip = qq == qb.data();
  if (kcs && most < 1e-5 * S.T) { stretched = false; dT = 0; } // linear from the next block
  hv.fill(0); Fp[0] = Fp[1] = 0; Fd = 0;
  return 0.5 * (ymax - ymin);
}

// Solve (I + βC)F = α − β u_free over the active points; drop one-sided contacts that would pull
// (rising plectra push up, F ≥ 0; returning plectra and the felt push down, F ≤ 0) and solve again.
void PluckedString::solve() {
  double *r = rhs.data();
  for (int iter = 0; iter <= MAXP; iter++) {
    int m = 0;
    for (int p = 0; p < MAXP; p++) if (act[p]) sid[m++] = p;
    if (!m) return;
    for (int a = 0; a < m; a++) {
      const int p = sid[a];
      r[a] = al[p] - be[p] * uf[p];
      for (int b = 0; b < m; b++) M[a * MAXP + b] = (a == b ? 1 : 0) + be[p] * C[p * MAXP + sid[b]];
    }
    for (int k = 0; k < m; k++) { // Gaussian elimination (m ≤ 4; I + βC is diagonally dominant here)
      const double d = M[k * MAXP + k];
      for (int a = k + 1; a < m; a++) {
        const double f = M[a * MAXP + k] / d;
        if (f == 0) continue;
        for (int b = k; b < m; b++) M[a * MAXP + b] -= f * M[k * MAXP + b];
        r[a] -= f * r[k];
      }
    }
    for (int k = m - 1; k >= 0; k--) {
      double v = r[k];
      for (int b = k + 1; b < m; b++) v -= M[k * MAXP + b] * r[b];
      r[k] = v / M[k * MAXP + k];
    }
    int worst = -1;
    double wv = 0;
    for (int a = 0; a < m; a++) {
      const int p = sid[a];
      const double F = r[a];
      Fc[p] = F;
      double bad = 0;
      if (p < 2) bad = phase[p] == Phase::under ? -F : F;
      else if (p == PT::DAMPER) bad = F;
      if (bad > wv) { wv = bad; worst = p; }
    }
    if (worst < 0) return;
    act[worst] = 0; Fc[worst] = 0;
  }
}

// Plectrum p carries force F with its top at y: move the contact point by the friction law.
// Returns true if the forces must be solved again (its stiffness changed, or it let go).
bool PluckedString::slide(int p, double F, double y) {
  const Plectrum &P = pl[p];
  const double kz = Kz[p], Zh = S.Z / h, z0 = P.s0, zo = zOld[p];
  double sp = s[p];
  const double zs = lateralZ(P, sp, F), need = Zh * (zs - zo) + kz * (zs - z0);
  const bool tip = need < F * coneLo(P, sp, F);
  if (!tip && need <= F * coneHi(P, sp, F)) { zOld[p] = zs; return false; } // sticks
  // slides: the force follows the plectrum's stiffness at the new point (the other contacts held)
  sl.p = p; sl.y = y; sl.ufe = uf[p] + cross(p); sl.Cpp = C[p * MAXP + p]; sl.tip = tip;
  if (tip) {
    if (slideG(P.len) < 0) { letGo(p, F, y); return true; } // past the tip: the pluck
    double a = sp, b = P.len;
    for (int it = 0; it < 48; it++) { const double mid = 0.5 * (a + b); if (slideG(mid) < 0) a = mid; else b = mid; }
    sp = 0.5 * (a + b);
  } else {
    double a = 0.05 * P.len, b = sp;
    if (slideG(a) > 0) sp = a;
    else { for (int it = 0; it < 48; it++) { const double mid = 0.5 * (a + b); if (slideG(mid) > 0) b = mid; else a = mid; } sp = 0.5 * (a + b); }
  }
  s[p] = sp;
  zOld[p] = lateralZ(P, sp, slideF(sp));
  const double k = 1 / beamC(P, sp);
  al[p] = k * y; be[p] = k;
  return true;
}
// The vertical force if the string sat at s (the plectrum's stiffness there).
double PluckedString::slideF(double sp) const {
  const double k = 1 / beamC(pl[sl.p], sp), f = (k * (sl.y - sl.ufe)) / (1 + k * sl.Cpp);
  return f > 0 ? f : 0;
}
// The lateral balance at s: Z(z − z_old)/h + K_z(z − z₀) − F tan(θ ∓ φ).
double PluckedString::slideG(double sp) const {
  const int p = sl.p;
  const Plectrum &P = pl[p];
  const double f = slideF(sp), z = lateralZ(P, sp, f);
  return (S.Z / h) * (z - zOld[p]) + Kz[p] * (z - P.s0) - f * (sl.tip ? coneLo(P, sp, f) : coneHi(P, sp, f));
}
// Unloaded, the string eases back sideways towards where it was caught.
void PluckedString::ease(int p) {
  const Plectrum &P = pl[p];
  const double kz = Kz[p], Zh = S.Z / h, z0 = P.s0;
  const double z = (Zh * zOld[p] + kz * z0) / (Zh + kz);
  zOld[p] = z; s[p] = std::fabs(z - z0) < 1e-9 ? z0 : std::max(z0, std::min(z, P.len));
}
void PluckedString::letGo(int p, double F, double y) {
  const Plectrum &P = pl[p];
  const double sp = s[p];
  Release &r = relInfo[p];
  phase[p] = Phase::above; act[p] = 0; Fc[p] = 0; released[p] = true;
  r.F = F; r.y = y; r.u = uf[p] + cross(p) + C[p * MAXP + p] * F; r.w = F * beamC(P, sp); r.s = sp; r.theta = std::atan(F * beamG(P, sp));
  if (onRelease) onRelease(ctx, *this, p);
}

// Stop integrating top partials that have died away (a few per call).
void PluckedString::dropTop(double thr) {
  double *qq = q(), *qq1 = q1();
  int n = 0;
  while (n < 4 && Na > 4) {
    const int i = Na - 1;
    if (std::fabs(BF[i]) * (std::fabs(qq[i]) + std::fabs(qq1[i])) >= thr) break;
    qq[i] = qq1[i] = 0; Na--; n++;
  }
  if (n) { cDirty = true; hv.fill(0); }
}
void PluckedString::wake() { if (Na != N) { Na = N; cDirty = true; hv.fill(0); } }
void PluckedString::silence() { qa.fill(0); qb.fill(0); hv.fill(0); stretched = false; dT = 0; }

} // namespace forte::harpsichord
