// nmr-model.cpp — the NMR keyboard's physics (nmr-model.h).

#include "nmr-model.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"
#include "forte/linalg.h"
#include "nmr-params.h"

namespace forte::nmr {

// Gottlieb, Kotlyar and Nudelman (1997), Table 1: δ in ppm from TMS, J in Hz. In dry DMSO
// ethanol's OH proton stays long enough to couple to the CH₂ (the 5 Hz the paper's notes give);
// in chloroform it hops between molecules and its coupling averages away, so it is a group of its
// own. 2-Propanol's OH, whose shift the table leaves out (it wanders with concentration), is left
// out. HDO in D₂O: 4.79. The diffusion coefficients are rounded: HDO in D₂O 1.9 × 10⁻⁹ m²/s, small
// molecules in DMSO (viscosity 2.0 mPa s) about 0.8 × 10⁻⁹ and in chloroform (0.54 mPa s) about
// 2.5 × 10⁻⁹ (Stokes–Einstein).
static const std::array<Sample, SAMPLES> SAMPLE_TABLE = {{
  {3, 2, {{{3, 1.06}, {2, 3.44}, {1, 4.63}}}, {{{0, 1, 7.0}, {1, 2, 5.0}}}, 0.8e-9},  // ethanol in DMSO-d₆
  {3, 1, {{{3, 1.25}, {2, 3.72}, {1, 1.32}}}, {{{0, 1, 7.0}}}, 2.5e-9},               // ethanol in CDCl₃
  {1, 0, {{{1, 4.79}}}, {}, 1.9e-9},                                                // HDO in D₂O
  {3, 1, {{{3, 1.26}, {3, 2.05}, {2, 4.12}}}, {{{0, 2, 7.0}}}, 2.5e-9},               // ethyl acetate in CDCl₃
  {2, 1, {{{6, 1.22}, {1, 4.04}}}, {{{0, 1, 6.0}}}, 2.5e-9},                          // 2-propanol in CDCl₃
}};

const Sample &sample(int index) { return SAMPLE_TABLE[std::clamp(index, 0, SAMPLES - 1)]; }

double anchorPpm(const Sample &s) {
  double lo = s.g[0].ppm;
  for (int i = 1; i < s.groups; i++) lo = std::min(lo, s.g[i].ppm);
  return lo;
}

double keyLarmor(int key, const double *P) {
  const Sample &s = sample((int)P[p::sample]);
  return keyFreq(key) * tuningOf(P).ratio(key) / (anchorPpm(s) * 1e-6);
}

// How many ways n spins ½ add up to a total spin S (2S = s2): C(n, n/2 − S) − C(n, n/2 − S − 1).
static double binom(int n, int k) {
  if (k < 0 || k > n) return 0;
  double r = 1;
  for (int i = 1; i <= k; i++) r = r * (n - k + i) / i;
  return r;
}
static double multiplicity(int n, int s2) { const int k = (n - s2) / 2; return binom(n, k) - binom(n, k - 1); }

void buildSystem(const Sample &s, double f0, KeySystem &k) {
  k.f0 = f0;
  k.B0 = f0 * 1e-6 / GAMMA_MHZ_T;
  k.anchor = anchorPpm(s);
  k.fAnchor = k.anchor * 1e-6 * f0;
  k.combos = k.elems = k.lines = 0;
  k.ok = true;
  k.combo.clear();
  k.combo.reserve(16);
  // the clusters: groups joined by couplings
  std::array<int, MAX_GROUPS> cluster{};
  for (int g = 0; g < s.groups; g++) cluster[g] = g;
  for (bool moved = true; moved;) {
    moved = false;
    for (int i = 0; i < s.couplings; i++) {
      const int a = s.c[i].a, b = s.c[i].b, m = std::min(cluster[a], cluster[b]);
      if (cluster[a] != m || cluster[b] != m) { cluster[a] = cluster[b] = m; moved = true; }
    }
  }
  std::vector<double> starts; // ρ_ab after a 90° pulse, unnormalised, element by element
  double total = 0;           // Σ start · fm: the signal at t = 0, to normalise to 1
  for (int c0 = 0; c0 < s.groups; c0++) {
    if (cluster[c0] != c0) continue;
    std::array<int, MAX_GROUPS> mem{};
    int nm = 0;
    for (int g = 0; g < s.groups; g++) if (cluster[g] == c0) mem[nm++] = g;
    std::array<double, MAX_GROUPS> J[MAX_GROUPS] = {};
    for (int i = 0; i < s.couplings; i++) {
      int a = -1, b = -1;
      for (int j = 0; j < nm; j++) { if (mem[j] == s.c[i].a) a = j; if (mem[j] == s.c[i].b) b = j; }
      if (a >= 0 && b >= 0) { J[a][b] = J[b][a] = s.c[i].J; }
    }
    // every choice of the members' total spins (2S from n down to 0 or 1)
    std::array<int, MAX_GROUPS> s2{};
    int protons = 0;
    for (int j = 0; j < nm; j++) { s2[j] = s.g[mem[j]].n; protons += s2[j]; }
    // the other clusters' states multiply each trace over this one: a cluster of n protons counts
    // 2⁻ⁿ of its trace, so that every proton gives the signal the same share
    const double share = std::ldexp(1.0, -protons);
    while (true) {
      double weight = share;
      int dim = 1;
      bool spinless = true;
      for (int j = 0; j < nm; j++) { weight *= multiplicity(s.g[mem[j]].n, s2[j]); dim *= s2[j] + 1; spinless = spinless && s2[j] == 0; }
      if (!spinless && weight > 0) {
        if (dim > MAX_DIM) { k.ok = false; }
        else {
          Combo cb;
          cb.dim = dim;
          // the product basis: state index → each member's 2m (from 2S down)
          std::vector<std::array<int, MAX_GROUPS>> m2(dim);
          for (int i = 0; i < dim; i++) {
            int r = i;
            for (int j = nm - 1; j >= 0; j--) { const int d = s2[j] + 1; m2[i][j] = s2[j] - 2 * (r % d); r /= d; }
          }
          auto index = [&](const std::array<int, MAX_GROUPS> &m) {
            int i = 0;
            for (int j = 0; j < nm; j++) i = i * (s2[j] + 1) + (s2[j] - m[j]) / 2;
            return i;
          };
          auto raise = [](int S2, int M2) { const double S = S2 / 2.0, m = M2 / 2.0; return std::sqrt(std::max(0.0, S * (S + 1) - m * (m + 1))); }; // ⟨m+1|S₊|m⟩
          Matrix H = Matrix::Zero(dim, dim), Fm = Matrix::Zero(dim, dim), Rz = Matrix::Zero(dim, dim);
          for (int i = 0; i < dim; i++) {
            double d = 0;
            for (int a = 0; a < nm; a++) {
              d += TAU * s.g[mem[a]].ppm * 1e-6 * f0 * m2[i][a] / 2;
              for (int b = a + 1; b < nm; b++) d += TAU * J[a][b] * (m2[i][a] / 2.0) * (m2[i][b] / 2.0);
            }
            H(i, i) = d;
            // flip-flops: π J (S₊ᵃ S₋ᵇ + S₋ᵃ S₊ᵇ)
            for (int a = 0; a < nm; a++) for (int b = 0; b < nm; b++) {
              if (a == b || J[a][b] == 0) continue;
              if (m2[i][a] + 2 > s2[a] || m2[i][b] - 2 < -s2[b]) continue;
              std::array<int, MAX_GROUPS> t = m2[i];
              t[a] += 2; t[b] -= 2;
              H(index(t), i) += std::numbers::pi * J[a][b] * raise(s2[a], m2[i][a]) * raise(s2[b], m2[i][b] - 2);
            }
            // F₋ = Σ S₋: ⟨m−1|S₋|m⟩ = ⟨m|S₊|m−1⟩
            for (int a = 0; a < nm; a++) {
              if (m2[i][a] - 2 < -s2[a]) continue;
              std::array<int, MAX_GROUPS> t = m2[i];
              t[a] -= 2;
              Fm(index(t), i) += raise(s2[a], m2[i][a] - 2);
            }
            // the π pulse about y: |S, m⟩ → (−1)^{S−m} |S, −m⟩ for each member
            std::array<int, MAX_GROUPS> t = m2[i];
            int sign = 1;
            for (int a = 0; a < nm; a++) { t[a] = -m2[i][a]; if (((s2[a] - m2[i][a]) / 2) % 2) sign = -sign; }
            Rz(index(t), i) = sign;
          }
          // diagonalise block by block of total M (H conserves it), so that eigenvectors never mix
          // blocks, even where levels of different M are degenerate
          Matrix V = Matrix::Zero(dim, dim);
          int col = 0;
          int mTop = 0;
          for (int j = 0; j < nm; j++) mTop += s2[j];
          for (int M = -mTop; M <= mTop; M += 2) {
            std::vector<int> st;
            for (int i = 0; i < dim; i++) { int t = 0; for (int j = 0; j < nm; j++) t += m2[i][j]; if (t == M) st.push_back(i); }
            if (st.empty()) continue;
            const int nb = (int)st.size();
            Matrix h(nb, nb);
            for (int x = 0; x < nb; x++) for (int y = 0; y < nb; y++) h(x, y) = H(st[x], st[y]);
            const Eigen_ e = symEig(h);
            for (int c = 0; c < nb; c++) {
              for (int x = 0; x < nb; x++) V(st[x], col) = e.X(x, c);
              cb.E[col] = e.lambda(c);
              cb.M2[col] = (int8_t)M;
              col++;
            }
          }
          const Matrix Fe = V.transpose() * Fm * V, Re = V.transpose() * Rz * V;
          for (int c = 0; c < dim; c++) for (int a = 0; a < dim; a++) cb.R[c * dim + a] = Re(c, a);
          cb.first = k.elems;
          for (int a = 0; a < dim; a++) for (int b = 0; b < dim; b++) {
            if (cb.M2[b] != cb.M2[a] + 2) continue;
            if (k.elems >= MAX_ELEMS) { k.ok = false; continue; }
            Elem &el = k.elem[k.elems++];
            el.combo = (int16_t)k.combos; el.a = (int16_t)a; el.b = (int16_t)b; el.line = -1;
            el.w = cb.E[b] - cb.E[a];
            el.fm = Fe(a, b);
            // after a 90° pulse about x, ρ's order −1 part is F₋/2i: the receiver's phase is set so
            // that it starts real, and every combo counts as often as its total spins occur
            starts.push_back(weight * el.fm);
            total += weight * el.fm * el.fm;
          }
          cb.count = k.elems - cb.first;
          k.combo.push_back(cb);
          k.combos++;
        }
      }
      // the next choice of total spins
      int j = nm - 1;
      while (j >= 0 && s2[j] < 2) { s2[j] = s.g[mem[j]].n; j--; }
      if (j < 0) break;
      s2[j] -= 2;
    }
  }
  for (int i = 0; i < k.elems; i++) k.elem[i].start = total > 0 ? starts[i] / total : 0;
  // the lines: coherences within a thousandth of a hertz of each other make one (they would take a
  // quarter of an hour to drift a cycle apart), if the receiver sees them
  std::array<int, MAX_ELEMS> order{};
  for (int i = 0; i < k.elems; i++) order[i] = i;
  std::sort(order.begin(), order.begin() + k.elems, [&](int x, int y) { return k.elem[x].w < k.elem[y].w; });
  for (int q = 0; q < k.elems; q++) {
    Elem &el = k.elem[order[q]];
    if (std::fabs(el.fm) < 1e-9) continue; // a coherence the receiver cannot see
    if (k.lines > 0 && std::fabs(el.w - k.line[k.lines - 1].w) < TAU * 1e-3) el.line = (int16_t)(k.lines - 1);
    else if (k.lines < MAX_LINES) { k.line[k.lines] = {el.w, 0}; el.line = (int16_t)k.lines++; }
    else { k.ok = false; continue; }
    k.line[el.line].intensity += el.start * el.fm;
  }
}

void keySystem(int key, const double *P, KeySystem &k) { buildSystem(sample((int)P[p::sample]), keyLarmor(key, P), k); }

void piPulse(const KeySystem &k, const std::complex<double> *before, std::complex<double> *after) {
  for (int ci = 0; ci < k.combos; ci++) {
    const Combo &cb = k.combo[ci];
    const int d = cb.dim;
    for (int t = cb.first; t < cb.first + cb.count; t++) {
      const int c = k.elem[t].a, dd = k.elem[t].b;
      std::complex<double> sum = 0;
      for (int s = cb.first; s < cb.first + cb.count; s++) {
        const int a = k.elem[s].a, b = k.elem[s].b;
        const double r = cb.R[c * d + b] * cb.R[dd * d + a];
        if (r != 0) sum += r * std::conj(before[s]);
      }
      after[t] = sum;
    }
  }
}

double dephasing(int profile, double S) {
  switch (profile) {
    case kGauss: { const double u = S / 2.3548200450309493; return std::exp(-u * u / 2); }
    case kGradient: { const double x = S / 2; return std::fabs(x) < 1e-8 ? 1 : std::sin(x) / x; }
    default: return std::exp(-std::fabs(S) / 2);
  }
}

} // namespace forte::nmr
