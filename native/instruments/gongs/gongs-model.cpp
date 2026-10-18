// gongs-model.cpp — the gong's model (gongs-model.h).

#include "gongs-model.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/dsp.h"
#include "forte/linalg.h"

namespace forte::gongs {

using std::numbers::pi;

const Material &materialOf(const double *P) {
  const int i = (int)std::lround(P[p::material]);
  return MATERIALS[i >= 0 && i < 3 ? i : 0];
}
double plateSpeed(const Material &mat) { return std::sqrt(mat.E / (mat.rho * (1 - NU * NU))); }

double interpR(const double *R, double r) {
  const double u = std::min(1.0, std::max(0.0, r)) * (NR - 1);
  const int i = std::min(NR - 2, (int)std::floor(u));
  const double f = u - i;
  const double y0 = R[std::max(0, i - 1)], y1 = R[i], y2 = R[i + 1], y3 = i + 2 < NR ? R[i + 2] : 2 * R[i + 1] - R[i];
  const double z0 = i == 0 ? 2 * y1 - y2 : y0;
  return y1 + 0.5 * f * (y2 - z0 + f * (2 * z0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - z0)));
}

Spec specOf(const double *P) {
  Spec s;
  s.bc = P[p::bc] >= 0.5 ? 1 : 0;
  s.rise = P[p::rise];
  s.terms = std::max(1, (int)std::lround(P[p::terms])); // (the page's are whole: a step of 50)
  return s;
}

// ---- shell modes and the pruned coupling tensor ----------------------------------------------
// The table's couplings grouped by (in-plane mode, angular block pair), with each plate mode's
// position inside its block (blocks list plate modes in table order), in the order the table
// meets them.
namespace {
struct Group { int n, mp, mq; std::vector<int> a, b; std::vector<double> v; };
std::vector<Group> makeGroups(int bc) {
  const table::Table &T = *table::kTables[bc];
  std::vector<int> pos(T.N), count(64, 0);
  for (int p = 0; p < T.N; p++) pos[p] = count[T.modes[p].m]++;
  std::vector<Group> list;
  std::vector<int> at(T.NS * 64 * 64, -1);
  for (int e = 0; e < T.nH; e++) {
    int p = T.Hp[e], q = T.Hq[e];
    if (T.modes[p].m > T.modes[q].m) std::swap(p, q);
    const int n = T.Hn[e], mp = T.modes[p].m, mq = T.modes[q].m, key = (n * 64 + mp) * 64 + mq;
    if (at[key] < 0) { at[key] = (int)list.size(); list.push_back({n, mp, mq, {}, {}, {}}); }
    Group &g = list[at[key]];
    g.a.push_back(pos[p]); g.b.push_back(pos[q]); g.v.push_back(T.Hv[e]);
  }
  return list;
}
const std::vector<Group> &groupsOf(int bc) {
  static const std::vector<Group> groups[2] = {makeGroups(0), makeGroups(1)};
  return groups[bc];
}

// rows(list, nRows, row, order): stable sort by row then order, with each row's offset
template <class T, class Row, class Order>
std::vector<int> rows(std::vector<T> &list, int nRows, Row row, Order order) {
  std::stable_sort(list.begin(), list.end(), [&](const T &a, const T &b) { return row(a) != row(b) ? row(a) < row(b) : order(a) < order(b); });
  std::vector<int> off(nRows + 1, 0);
  for (const T &e : list) off[row(e) + 1]++;
  for (int r = 0; r < nRows; r++) off[r + 1] += off[r];
  return off;
}

Pack pack(const std::vector<Term> &H, const std::vector<ETerm> &Et, int N, int NS) {
  Pack P;
  std::vector<Term> s1 = H;
  P.p1off = rows(s1, NS, [](const Term &h) { return h.n; }, [](const Term &h) { return h.j; });
  for (const Term &h : s1) { P.p1i.push_back(h.i); P.p1j.push_back(h.j); P.p1ij.push_back((h.i << 8) | h.j); P.p1h.push_back((h.i == h.j ? 1 : 2) * h.v); }
  struct F { int k, n, q; double v; };
  std::vector<F> full;
  for (const Term &h : H) { full.push_back({h.i, h.n, h.j, h.v}); if (h.i != h.j) full.push_back({h.j, h.n, h.i, h.v}); }
  P.p2off = rows(full, N, [](const F &h) { return h.k; }, [](const F &h) { return h.q; });
  for (const F &h : full) { P.p2n.push_back(h.n); P.p2q.push_back(h.q); P.p2nq.push_back((h.n << 8) | h.q); P.p2h.push_back(h.v); }
  std::vector<char> used(NS, 0);
  for (const Term &h : H) used[h.n] = 1;
  std::vector<ETerm> Eu;
  for (const ETerm &e : Et) if (used[e.n]) Eu.push_back(e);
  std::vector<ETerm> e1 = Eu, e2 = Eu;
  P.e1off = rows(e1, NS, [](const ETerm &e) { return e.n; }, [](const ETerm &e) { return e.i; });
  for (const ETerm &e : e1) { P.e1i.push_back(e.i); P.e1v.push_back(e.v); }
  P.e2off = rows(e2, N, [](const ETerm &e) { return e.i; }, [](const ETerm &e) { return e.n; });
  for (const ETerm &e : e2) { P.e2n.push_back(e.n); P.e2v.push_back(e.v); }
  return P;
}
} // namespace

std::unique_ptr<Shell> buildShell(const Spec &spec) {
  const table::Table &T = *table::kTables[spec.bc];
  const int N = T.N, NS = T.NS;
  const double kap = 2 * spec.rise;
  auto S = std::make_unique<Shell>();
  S->spec = spec; S->kappa = kap; S->N = N; S->NS = NS;
  // linear stiffness, block by angular index m (blocks in order of first appearance): λ⁴ δ + κ² Kc
  std::vector<int> blockM, blockOf(64, -1);
  std::vector<std::vector<int>> blocks;
  for (int i = 0; i < N; i++) {
    const int m = T.modes[i].m;
    if (blockOf[m] < 0) { blockOf[m] = (int)blocks.size(); blocks.push_back({}); blockM.push_back(m); }
    blocks[blockOf[m]].push_back(i);
  }
  std::vector<double> K(N * N, 0.0);
  for (int e = 0; e < T.nK; e++) { const int p = T.Kp[e], q = T.Kq[e]; K[p * N + q] = T.Kv[e]; K[q * N + p] = T.Kv[e]; }
  struct SM { int m; double om2; std::vector<double> U; int block, plate; };
  std::vector<SM> modes;
  for (size_t bi = 0; bi < blocks.size(); bi++) {
    const std::vector<int> &idx = blocks[bi];
    const int b = (int)idx.size();
    Matrix A(b, b);
    for (int r = 0; r < b; r++) for (int c = 0; c < b; c++) {
      const int p = idx[r], q = idx[c];
      A(r, c) = (p == q ? T.modes[p].lam2 * T.modes[p].lam2 : 0) + kap * kap * K[p * N + q];
    }
    Vector om2(b);
    Matrix V(b, b);
    if (kap == 0) { // a flat plate: the blocks are diagonal (ascending), their eigenvectors exactly the plate modes
      V.setIdentity();
      for (int c = 0; c < b; c++) om2(c) = A(c, c);
    } else {
      Eigen_ ev = symEig(A);
      om2 = ev.lambda; V = ev.X;
    }
    for (int c = 0; c < b; c++) {
      int dom = 0;
      for (int r = 0; r < b; r++) if (std::fabs(V(r, c)) > std::fabs(V(dom, c))) dom = r;
      const double sgn = V(dom, c) < 0 ? -1 : 1;
      std::vector<double> U(b);
      for (int r = 0; r < b; r++) U[r] = sgn * V(r, c);
      modes.push_back({blockM[bi], om2(c), std::move(U), (int)bi, idx[dom]});
    }
  }
  std::stable_sort(modes.begin(), modes.end(), [](const SM &a, const SM &b) { return a.om2 < b.om2; });
  S->m.resize(N); S->plate.resize(N); S->Om.resize(N); S->plateOm.resize(N);
  for (int i = 0; i < N; i++) {
    S->m[i] = modes[i].m; S->plate[i] = modes[i].plate;
    S->Om[i] = std::sqrt(modes[i].om2); S->plateOm[i] = T.modes[modes[i].plate].lam2;
  }
  S->C.resize(NS);
  for (int n = 0; n < NS; n++) S->C[n] = (3 * (1 - NU * NU)) / T.inplane[n].z4;
  S->tuned = 0;
  while (S->tuned < N && S->m[S->tuned] != 0) S->tuned++;
  // shell-mode indices of each block (ascending), and the transform U (plate → shell) per block
  std::vector<std::vector<int>> cols(blocks.size());
  for (int i = 0; i < N; i++) cols[modes[i].block].push_back(i);
  S->R.resize(N);
  for (int i = 0; i < N; i++) {
    std::array<double, NR> &R = S->R[i];
    R.fill(0);
    const std::vector<int> &idx = blocks[modes[i].block];
    for (size_t r = 0; r < idx.size(); r++) { const double *Rp = T.modes[idx[r]].R; for (int j = 0; j < NR; j++) R[j] += modes[i].U[r] * Rp[j]; }
  }
  // Ublock(r, c) = U of shell mode cols[c] at plate row r
  auto U = [&](int block, int r, int c) { return modes[cols[block][c]].U[r]; };
  auto rowIn = [&](int block, int p) { const std::vector<int> &idx = blocks[block]; return (int)(std::find(idx.begin(), idx.end(), p) - idx.begin()); };
  // curvature terms Ẽ^n_i = κ Σ_p U_pi E^n_p (in the order the table meets them)
  {
    std::vector<double> acc(NS * N, 0.0);
    std::vector<char> seen(NS * N, 0);
    std::vector<int> order;
    for (int e = 0; e < T.nE; e++) {
      const int n = T.En[e], p = T.Ep[e], B = blockOf[T.modes[p].m], r = rowIn(B, p);
      for (size_t j = 0; j < cols[B].size(); j++) {
        const int key = n * N + cols[B][j];
        if (!seen[key]) { seen[key] = 1; order.push_back(key); }
        acc[key] = acc[key] + kap * U(B, r, (int)j) * T.Ev[e];
      }
    }
    for (int key : order) if (acc[key] != 0) S->E.push_back({key / N, key % N, acc[key]});
  }
  // couplings H̃^n = Uᵀ H^n U, block pair by block pair, then the strongest `terms` of them
  std::vector<Term> Ht;
  std::vector<double> M, W;
  for (const Group &g : groupsOf(spec.bc)) {
    const int A = blockOf[g.mp], B = blockOf[g.mq], na = (int)cols[A].size(), nb = (int)cols[B].size();
    const bool same = g.mp == g.mq;
    M.assign(na * nb, 0.0); W.assign(na * nb, 0.0);
    for (size_t e = 0; e < g.a.size(); e++) { M[g.a[e] * nb + g.b[e]] = g.v[e]; if (same) M[g.b[e] * nb + g.a[e]] = g.v[e]; }
    for (int r = 0; r < na; r++) for (int j = 0; j < nb; j++) { double t = 0; for (int q = 0; q < nb; q++) t += M[r * nb + q] * U(B, q, j); W[r * nb + j] = t; }
    for (int i = 0; i < na; i++) for (int j = same ? i : 0; j < nb; j++) {
      double t = 0;
      for (int r = 0; r < na; r++) t += U(A, r, i) * W[r * nb + j];
      if (t != 0) { const int ci = cols[A][i], cj = cols[B][j]; Ht.push_back({g.n, std::min(ci, cj), std::max(ci, cj), t, 0}); }
    }
  }
  for (Term &h : Ht) h.w = (std::sqrt(S->C[h.n]) * std::fabs(h.v)) / (S->Om[h.i] * S->Om[h.j]);
  double cut = 0;
  const int nH = (int)Ht.size();
  if (spec.terms < nH) {
    std::vector<double> wt(nH);
    for (int e = 0; e < nH; e++) wt[e] = Ht[e].w;
    std::sort(wt.begin(), wt.end());
    cut = wt[nH - spec.terms];
  }
  for (const Term &h : Ht) if (h.w >= cut && (int)S->H.size() < spec.terms) S->H.push_back(h);
  // packed for the engine: the full set, and the lite set of the strongest LITE terms
  S->full = pack(S->H, S->E, N, NS);
  std::vector<Term> strongest = S->H;
  std::stable_sort(strongest.begin(), strongest.end(), [](const Term &a, const Term &b) { return a.w > b.w; });
  if ((int)strongest.size() > LITE) strongest.resize(LITE);
  S->lite = pack(strongest, S->E, N, NS);
  return S;
}

void rowEnds(const std::vector<int> &off, const std::vector<int> &idx, int Nv, int *out) {
  for (size_t r = 0; r + 1 < off.size(); r++) {
    int lo = off[r], hi = off[r + 1];
    while (lo < hi) { const int mid = (lo + hi) >> 1; if (idx[mid] < Nv) lo = mid + 1; else hi = mid; }
    out[r] = lo;
  }
}

double backbone(const Shell &S, int p, int Nv) {
  const int N = S.N, NS = S.NS;
  std::vector<int> used; // in-plane modes the couplings use, in order of appearance
  std::vector<char> isUsed(NS, 0), hasPP(NS, 0);
  std::vector<int> ppOrder;
  std::vector<double> Hpp(NS, 0), Hpk(NS * N, 0), Ep(NS, 0), Ek(NS * N, 0);
  for (const Term &h : S.H) if (!isUsed[h.n]) { isUsed[h.n] = 1; used.push_back(h.n); }
  for (const Term &h : S.H) {
    if (h.i >= Nv || h.j >= Nv) continue;
    if (h.i == p && h.j == p) { if (!hasPP[h.n]) { hasPP[h.n] = 1; ppOrder.push_back(h.n); } Hpp[h.n] = h.v; }
    else if (h.i == p || h.j == p) Hpk[h.n * N + (h.i == p ? h.j : h.i)] = h.v;
  }
  for (const ETerm &e : S.E) if (isUsed[e.n] && e.i < Nv) { if (e.i == p) Ep[e.n] = e.v; Ek[e.n * N + e.i] = e.v; }
  double G = 0;
  for (int n : ppOrder) G += 2 * S.C[n] * Hpp[n] * Hpp[n];
  double soft = 0;
  const double O2 = S.Om[p] * S.Om[p];
  for (int k = 0; k < Nv; k++) {
    double d = 0;
    for (int n : used) d += 2 * S.C[n] * (Hpp[n] * Ek[n * N + k] + 2 * (k == p ? Hpp[n] : Hpk[n * N + k]) * Ep[n]);
    if (d != 0) soft += d * d * (1 / (S.Om[k] * S.Om[k]) + 1 / (2 * (S.Om[k] * S.Om[k] - 4 * O2)));
  }
  return (0.75 * G - soft) / (2 * O2);
}

// ---- one key ---------------------------------------------------------------------------------
void keyGong(Gong &g, int key, const double *P, double fs, const Shell &S) {
  const Material &mat = materialOf(P);
  const double cp = plateSpeed(mat), thick = P[p::thick];
  const double f0 = keyFreq(key), w0 = (TAU * f0) / S.Om[S.tuned];
  const double a = (thick * cp) / (std::sqrt(12.0) * w0), h = thick * a;
  // internal rate: the lowest fs/R (R a power of 2) that holds every mode below CAP·fs/R,
  // but no faster than ~24 kHz
  int R = 1;
  while (fs / R > OS_MAX_HZ) R *= 2;
  const double fTop = (S.Om[S.N - 1] * w0) / TAU;
  while (R < 8 && CAP * (fs / (2 * R)) > fTop) R *= 2;
  double fsi = fs / R, k = w0 / fsi;
  int Nv = 0;
  while (Nv < S.N && (S.Om[Nv] * w0) / TAU < CAP * fsi) Nv++;
  // above C6 (the old top key), a gong that would keep fewer than FEW modes runs at twice that
  // rate (up to 2·OS_MAX_HZ) and keeps the next ones, up to FEW, below CAP·fs/R there
  if (key > C6 && Nv < FEW && R > 1 && fs / (R / 2) <= 2 * OS_MAX_HZ) {
    R /= 2; fsi = fs / R; k = w0 / fsi;
    while (Nv < FEW && Nv < S.N && (S.Om[Nv] * w0) / TAU < CAP * fsi) Nv++;
  }
  const double fc = ((AIR.c * AIR.c) / TAU) * std::sqrt((12 * mat.rho * (1 - NU * NU)) / (mat.E * h * h)); // coincidence
  g.S = &S; g.key = key; g.f0 = f0; g.w0 = w0; g.a = a; g.h = h; g.mass = mat.rho * h * pi * a * a; g.cp = cp; g.mat = &mat;
  g.R = R; g.fsi = fsi; g.k = k; g.Nv = Nv; g.fc = fc;
  modeLoss(g, P);
}

void modeLoss(Gong &g, const double *P) {
  const Shell &S = *g.S;
  const Material &mat = *g.mat;
  const double w0 = g.w0, a = g.a, h = g.h, fc = g.fc;
  const double Delta = ((mat.E * (mat.alpha * mat.alpha) * 293) / (mat.rho * mat.cv)) * ((1 + NU) / (1 - NU)), tth = (h * h) / ((pi * pi) * mat.D);
  for (int i = 0; i < g.Nv; i++) {
    const double w = S.Om[i] * w0, f = w / TAU;
    const double wt = w * tth, th = (P[p::thermal] * Delta * w * tth) / (1 + wt * wt);
    const double srad = radiationEfficiency(f / fc, (2 * AIR.c) / (a * fc), (w * a) / AIR.c);
    const double rad = P[p::radiation] * ((AIR.rho * AIR.c) / (mat.rho * h * w)) * srad;
    g.loss[i] = {f, th, rad, srad, P[p::eta], 0.5 * w * (P[p::eta] + th + rad)};
    g.sigma[i] = g.loss[i].sigma;
  }
}

double radiationEfficiency(double x, double pc, double ka) {
  const double small = (ka * ka) / (1 + ka * ka);
  if (x < 0.98) {
    const double al = std::sqrt(x);
    return small * std::min(2.0, (pc / (pi * pi)) * (((1 - al * al) * std::log((1 + al) / (1 - al)) + 2 * al) / std::pow(1 - al * al, 1.5)));
  }
  return small * std::min(2.0, 1 / std::sqrt(std::max(1e-3, 1 - 1 / std::max(x, 1.001))));
}

Mallet mallet(const Gong &g, const double *P, double vel) {
  const double Estar = P[p::hardness] * 1e6 / (1 - HEAD_NU * HEAD_NU), thick = P[p::thick];
  const double K = 16 * (1 - NU * NU) * (Estar / g.mat->E) * std::sqrt(HEAD) * std::pow(thick, -2.5);
  const double v = P[p::speed] * vel * vel; // m/s
  return {K, P[p::mass], v, (std::sqrt(12.0) * v) / (g.cp * (thick * thick))};
}

double contactTime(const Gong &g, const double *P, double vel) {
  const Mallet ml = mallet(g, P, vel);
  const double M = ml.mu * g.mass;
  const double Kd = (4.0 / 3) * (P[p::hardness] * 1e6 / (1 - HEAD_NU * HEAD_NU)) * std::sqrt(HEAD * g.a);
  return 3.218 * std::pow(M * M / (Kd * Kd * std::max(ml.v, 1e-3)), 0.2);
}

} // namespace forte::gongs
