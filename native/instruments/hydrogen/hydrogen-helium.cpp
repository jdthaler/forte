// hydrogen-helium.cpp — the lamp's second gas, helium (hydrogen-model.h heliumGas): its levels and
// lines from NIST (hydrogen-gases.h, tools/hydrogen-gas-tables.mjs), and the few things NIST gives
// no numbers for, from the hydrogen atom that a helium atom's outer electron nearly is.
//
//  * the levels: every term 1snl ^(2S+1)L up to n = HE_NMAX, at NIST's energies (the centroid of its
//    J levels, by weight); the few NIST lacks (high L) are hydrogen's, with a quantum defect of 0;
//  * the lines: a line is a term to a term, its A the J levels' rates averaged over the upper
//    term (Σ g_J A_JJ′ / g), every line NIST lists (n ≤ 10, the intercombination and forbidden
//    lines too); its fine-structure components are the J to J′ lines, at NIST's energies;
//  * from the levels above n = 10, NIST gives no rates: those to a level that the n = 10 term of
//    the same series reaches follow it along the Rydberg series (the oscillator strength falls as
//    n*⁻³, A as ν² n*⁻³ for a fixed lower level); the rest are hydrogen's (its exact A at the
//    same n, l, m, k, scaled by the cube of the frequencies).

#include <algorithm>
#include <cmath>
#include <map>

#include "hydrogen-gases.h"
#include "hydrogen-model.h"

namespace forte::hydrogen {

namespace {
constexpr double CM_PER_RY = 109737.31568160;            // R∞ in cm⁻¹
constexpr double CM_PER_HARTREE = 2 * CM_PER_RY;
constexpr double HE_IP = 198310.66637;                    // cm⁻¹ (NIST)
constexpr double HE_R = CM_PER_RY / (1 + 1 / 7294.29954); // the Rydberg of He⁺'s mass
int key(int n, int L, int S) { return (n * 64 + L) * 2 + S; }
} // namespace

Gas heliumGas() {
  using namespace tables;
  Gas a;
  a.kind = GasKind::helium;
  a.mass = 4.002602 / 1.00794;
  // the terms NIST lists: their centroid and J levels
  struct Term { int n, L, S; double E; std::vector<std::pair<int, double>> J; };
  std::map<int, Term> nist;
  std::vector<int> nistKey(std::size(kHeTerms));
  {
    int lv = 0;
    for (size_t i = 0; i < std::size(kHeTerms); i++) {
      const HeTerm &t = kHeTerms[i];
      Term T{t.n, t.L, t.S, 0, {}};
      double s = 0, g = 0;
      for (int j = 0; j < t.levels; j++, lv++) { T.J.push_back({kHeLevels[lv].J, kHeLevels[lv].E}); s += (2 * kHeLevels[lv].J + 1) * kHeLevels[lv].E; g += 2 * kHeLevels[lv].J + 1; }
      T.E = s / g;
      nistKey[i] = key(t.n, t.L, t.S);
      nist[nistKey[i]] = T;
    }
  }
  // every term up to HE_NMAX, by energy
  struct St { int n, L, S; double E; };
  std::vector<St> st;
  for (int n = 1; n <= HE_NMAX; n++) for (int S = 0; S < 2; S++) for (int L = 0; L < n; L++) {
    if (n == 1 && S == 1) continue;
    auto it = nist.find(key(n, L, S));
    st.push_back({n, L, S, it != nist.end() ? it->second.E : HE_IP - HE_R / (n * n)});
  }
  std::stable_sort(st.begin(), st.end(), [](const St &x, const St &y) { return x.E < y.E; });
  a.states = (int)st.size();
  a.ground = 1;
  std::map<int, int> stateOfKey;
  for (int i = 0; i < a.states; i++) stateOfKey[key(st[i].n, st[i].L, st[i].S)] = i;
  a.E.resize(a.states); a.g.resize(a.states); a.extra.assign(a.states, 0); a.code.resize(a.states);
  for (int i = 0; i < a.states; i++) {
    a.E[i] = st[i].E / CM_PER_RY;
    a.g[i] = (2 * st[i].L + 1) * (2 * st[i].S + 1);
    a.code[i] = (st[i].S * 100 + st[i].n) * 100 + st[i].L;
  }
  a.extra[stateOfKey.at(key(2, 0, 0))] = 51.3; // 2¹S → 1¹S by two photons (Drake 1986)
  const auto nstar = [&](int s) { return std::sqrt(HE_R / (HE_IP - st[s].E)); };
  // the lines: NIST's, then the rest from the levels above n = 10
  std::map<std::pair<int, int>, int> lineOf; // (upper, lower) → line
  auto addLine = [&](int u, int l) {
    const auto k = std::make_pair(u, l);
    auto it = lineOf.find(k);
    if (it != lineOf.end()) return it->second;
    const int i = a.lines++;
    lineOf[k] = i;
    Line L;
    L.upper = u; L.lower = l;
    L.trapped = l == 0;
    const double sigma = st[u].E - st[l].E;
    L.nm = 1e7 / sigma;
    a.line.push_back(L);
    a.fsStart.push_back((int)a.fs.size());
    return i;
  };
  std::map<std::pair<int, int>, double> nistA; // (upper, lower) → Σ g_J A
  for (const HeLine &x : kHeLines) {
    const int u = stateOfKey.at(nistKey[x.upper]), l = stateOfKey.at(nistKey[x.lower]);
    nistA[{u, l}] += x.gA;
  }
  for (const auto &[ul, gA] : nistA) {
    const int u = ul.first, l = ul.second, i = addLine(u, l);
    a.tr.push_back({(uint32_t)u, (uint32_t)l, (uint32_t)i, 0, 0, 0, 0, gA / a.g[u], (st[u].E - st[l].E) / CM_PER_RY});
    // its J components: the offsets of the J levels' energies from the terms' centroids
    const Term &U = nist.at(key(st[u].n, st[u].L, st[u].S)), &Lo = nist.at(key(st[l].n, st[l].L, st[l].S));
    for (const HeLine &x : kHeLines) {
      if (stateOfKey.at(nistKey[x.upper]) != u || stateOfKey.at(nistKey[x.lower]) != l) continue;
      double eu = 0, el = 0;
      for (auto &[J, E] : U.J) if (J == x.Ju) eu = E - U.E;
      for (auto &[J, E] : Lo.J) if (J == x.Jl) el = E - Lo.E;
      a.fs.push_back({(int8_t)(2 * x.Ju), (int8_t)(2 * x.Jl), (eu - el) / CM_PER_RY, (double)x.gA});
    }
  }
  // the rates from above n = 10: along the series from the n = 10 term's, or hydrogen's
  const int NIST_TOP = 10;
  std::vector<Transition> h;
  for (int n = NIST_TOP + 1; n <= HE_NMAX; n++) for (int m = 1; m < n; m++) {
    h.clear();
    hydrogenShell(n, m, h);
    for (const Transition &t : h) for (int S = 0; S < 2; S++) {
      if (m == 1 && S == 1) continue;
      if (m == 1 && t.k != 0) continue;
      const auto iu = stateOfKey.find(key(n, t.l, S)), il = stateOfKey.find(key(m, t.k, S));
      if (iu == stateOfKey.end() || il == stateOfKey.end()) continue;
      const int u = iu->second, l = il->second;
      const double sigma = st[u].E - st[l].E;
      if (!(sigma > 0)) continue;
      double A;
      const auto ref = stateOfKey.find(key(NIST_TOP, t.l, S));
      const auto known = ref != stateOfKey.end() ? nistA.find({ref->second, l}) : nistA.end();
      if (known != nistA.end()) {
        const int r = ref->second;
        const double s10 = st[r].E - st[l].E, q = nstar(r) / nstar(u);
        A = known->second / a.g[r] * (sigma / s10) * (sigma / s10) * q * q * q;
      } else {
        const double sH = CM_PER_RY * MU * t.e;
        A = t.A * std::pow(sigma / sH, 3);
      }
      const int i = addLine(u, l);
      a.tr.push_back({(uint32_t)u, (uint32_t)l, (uint32_t)i, 0, 0, 0, 0, A, sigma / CM_PER_RY});
    }
  }
  a.fsStart.push_back((int)a.fs.size());
  // the reference: D₃, 2³P → 3³D
  const int d3u = stateOfKey.at(key(3, 2, 1)), d3l = stateOfKey.at(key(2, 1, 1));
  const double ref = st[d3u].E - st[d3l].E;
  a.refHz = ref * 100 * C_LIGHT;
  // each line's ratio, and its Stark sizes: a level's linear Stark effect, as hydrogen's at its n,
  // where its neighbours of the same n and spin (L ± 1, both of them: the field mixes the level
  // into its whole n shell) are nearer than its shift; quadratic (its square over the gap) where
  // they are farther (the low L levels, which their quantum defects keep apart)
  const auto gapOf = [&](int s) {
    double gap = 0;
    for (int dL : {-1, 1}) {
      auto it = stateOfKey.find(key(st[s].n, st[s].L + dL, st[s].S));
      if (st[s].L + dL >= 0 && it != stateOfKey.end()) gap = std::max(gap, std::fabs(st[it->second].E - st[s].E) / CM_PER_HARTREE);
    }
    return st[s].n == 1 ? INFINITY : gap;
  };
  for (Line &L : a.line) {
    const double sigma = st[L.upper].E - st[L.lower].E;
    L.ratio = sigma / ref;
    L.de = sigma / CM_PER_HARTREE;
    L.su = STARK * st[L.upper].n * (st[L.upper].n - 1);
    L.sl = STARK * st[L.lower].n * (st[L.lower].n - 1);
    L.gu = gapOf(L.upper);
    L.gl = gapOf(L.lower);
  }
  a.index();
  // the page's diagram: n ≤ 5, L ≤ 3, singlets then triplets
  for (int S = 0; S < 2; S++) for (int n = 1; n <= 5; n++) for (int L = 0; L < std::min(n, 4); L++) {
    auto it = stateOfKey.find(key(n, L, S));
    if (it != stateOfKey.end() && (int)a.display.size() < DISPLAY) a.display.push_back(it->second);
  }
  return a;
}

// How a key lights helium. Discharge: electrons from the ground state 1¹S, as their Maxwellian
// rate Υ e^(−ΔE/kT) (the factors every level shares dropped). Into n¹P, dipole-allowed: van
// Regemorter's Υ = (8π/√3) f (Ry/ΔE) P(ΔE/kT), with NIST's oscillator strengths. Into the triplets,
// only by exchange (the electron that comes out is not the one that went in), whose cross-section
// falls as E⁻³ above threshold, so that a hotter gas lights them less against the singlets; into
// n¹S and n¹D (allowed in spin, forbidden as dipoles), a collision strength that stays level.
// Their sizes at threshold are rough (from the measured cross-sections near threshold: 2³S's peak
// of about 4.5 × 10⁻¹⁸ cm², 2³P's 2.5, 2¹S's 2.5, the n = 3 ones a few tenths of those) and fall
// as n*⁻³ along each series. Recombination: hydrogen's rate into the same n and L (He⁺ is a
// charge of one, as the proton), shared between the singlet and the triplet by their spins' weights,
// ¼ and ¾. Laser: one n¹P, from the ground state.
void heliumPump(const Gas &a, const Lamp &lamp, double *p) {
  const double kT = KB_HARTREE * lamp.T;
  auto n_of = [&](int s) { return (a.code[s] / 100) % 100; };
  auto L_of = [&](int s) { return a.code[s] % 100; };
  auto S_of = [&](int s) { return a.code[s] / 10000; };
  auto find = [&](int n, int L, int S) { for (int s = 0; s < a.states; s++) if (n_of(s) == n && L_of(s) == L && S_of(s) == S) return s; return -1; };
  const auto nstar = [&](int s) { return std::sqrt(HE_R / (HE_IP - a.E[s] * CM_PER_RY)); };
  switch (lamp.excitation) {
    case Excitation::discharge: {
      // rough collision strengths at threshold, Ω₀ = σ E / (π a₀² Ry), each with its series' reference term
      struct Series { int L, S, nref; double omega; bool exchange; };
      static const Series series[] = {{0, 1, 2, 0.077, true}, {1, 1, 2, 0.044, true}, {2, 1, 3, 0.025, true}, {0, 0, 2, 0.040, false}, {2, 0, 3, 0.012, false}};
      for (int s = a.ground; s < a.states; s++) {
        const int n = n_of(s), L = L_of(s), S = S_of(s);
        const double dE = 0.5 * a.E[s], y = dE / kT;
        double U = 0;
        if (L == 1 && S == 0) {
          // f(1¹S → n¹P) from A(n¹P → 1¹S): f = A g_u λ² / (6.6702 × 10¹⁵ g_l), λ in Å
          double A = 0;
          for (int k = a.into[0]; k < a.into[1]; k++) if ((int)a.tr[k].from == s) A += a.tr[k].A;
          const double lambdaA = 1e8 / (a.E[s] * CM_PER_RY), f = A * 3 * lambdaA * lambdaA / 6.6702e15;
          U = 14.51 * f * (0.5 / dE) * vanRegemorter(y);
        } else {
          for (const Series &x : series) {
            if (x.L != L || x.S != S || n < x.nref) continue;
            const int r = find(x.nref, L, S);
            const double q = r >= 0 ? nstar(r) / nstar(s) : 1;
            U = x.omega * q * q * q * (x.exchange ? exchangeShape(kT / dE) : 1);
          }
        }
        p[s] = U * std::exp(-y);
      }
      break;
    }
    case Excitation::recombination:
      for (int s = a.ground; s < a.states; s++) {
        const int n = n_of(s), L = L_of(s), S = S_of(s);
        if (n >= 2 && n <= NMAX) p[s] = (S ? 0.75 : 0.25) * recombination(n, L, lamp.T) * 1e13;
      }
      break;
    case Excitation::laser: {
      const int s = find(std::min(lamp.laserN, HE_NMAX), 1, 0);
      if (s >= 0) p[s] = 1;
      break;
    }
    default:
      break;
  }
}

// Helium's components: NIST's J lines with their offsets times α² (spin–orbit, spin–spin and
// spin–other-orbit are all α² of the level), each J level of a term filled by its weight; a line
// NIST has no J lines for is one tone.
int heliumComponents(const Gas &a, int line, double alphaScale, Component *out) {
  const int lo = a.fsStart[line], hi = a.fsStart[line + 1];
  const double r = a.line[line].ratio, refRy = a.refHz / (100 * C_LIGHT) / CM_PER_RY;
  if (hi == lo) { out[0] = {0, 0, r, 1}; return 1; }
  double total = 0;
  for (int i = lo; i < hi; i++) total += a.fs[i].gA;
  const double s2 = alphaScale * alphaScale;
  int count = 0;
  for (int i = lo; i < hi && count < MAX_COMPONENTS; i++) out[count++] = {a.fs[i].tj, a.fs[i].tk, r + a.fs[i].offset * s2 / refRy, a.fs[i].gA / total};
  return count;
}

} // namespace forte::hydrogen
