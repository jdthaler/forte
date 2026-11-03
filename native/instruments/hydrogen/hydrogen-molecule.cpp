// hydrogen-molecule.cpp — the lamp's third gas, molecular hydrogen H₂ (hydrogen-model.h
// molecularGas), with the atoms a discharge or a starlit cloud always holds beside it.
//
//  * the ground state X¹Σg⁺: every bound level v, J (ExoMol RACPPK: Roueff et al. 2019), and its
//    electric-quadrupole lines (ΔJ = 0, ±2), the infrared lines of shocked and starlit gas, which
//    take days to weeks: the slow ladder, on the lamp's second clock (SLOW_CLOCK);
//  * the singlets B¹Σu⁺ and C¹Πu (Abgrall et al. 1994, MOLAT) up to J = 12, and their Lyman and
//    Werner bands back into X, in the far ultraviolet;
//  * the triplets d³Πu and a³Σg⁺ from their constants (tools/hydrogen-gas-tables.mjs), and the
//    Fulcher-α band d → a between them, the red and orange lines of a hydrogen tube; a³Σg⁺ empties
//    into the repulsive b³Σu⁺, whose continuum is left out;
//  * the atoms: hydrogen up to n = ATOM_NMAX, its lines as the hydrogen lamp's, their share of the
//    light set by the lamp's Atoms parameter.
//
// A line is one transition, v′ J′ → v″ J″. The reference line, on the key's note, is the ground
// state's 1–0 S(1) at 2.1218 µm, the brightest line of H₂ in space.

#include <algorithm>
#include <cmath>
#include <numeric>

#include "hydrogen-gases.h"
#include "hydrogen-model.h"
#include "hydrogen-params.h"

namespace forte::hydrogen {

namespace {
constexpr double CM_PER_RY = 109737.31568160;
constexpr double D0 = 36118.0696;            // H₂'s dissociation energy from X(0, 0), cm⁻¹
constexpr double T_GROUND_DISCHARGE = 400;   // K: the rotational temperature of a discharge's cold gas
constexpr double T_GROUND_CLOUD = 200;       // K: a starlit cloud's
// d³Πu's collision strength by exchange at threshold: set so that a 2 × 10⁴ K discharge lights d
// about a tenth as often as B and C together, as the measured cross-sections a few eV above
// threshold have it (van Regemorter's dipole rate, which is an ion's, overstates B and C there)
constexpr double OMEGA_FULCHER = 0.9;
} // namespace

Gas molecularGas() {
  using namespace tables;
  Gas a;
  a.kind = GasKind::molecular;
  a.mass = 2;
  const int nX = (int)std::size(kH2Ground), nE = (int)std::size(kH2Excited);
  // the ground state's levels by energy (the cascade needs every line to run down the indices)
  std::vector<int> order(nX), at(nX);
  std::iota(order.begin(), order.end(), 0);
  std::stable_sort(order.begin(), order.end(), [&](int x, int y) { return kH2Ground[x].E < kH2Ground[y].E; });
  for (int i = 0; i < nX; i++) at[order[i]] = i;
  a.slowStates = nX;
  a.atomStates = nX + nE;
  const int nA = ATOM_NMAX * (ATOM_NMAX + 1) / 2;
  a.states = nX + nE + nA;
  a.ground = 0;
  a.E.resize(a.states); a.g.resize(a.states); a.extra.assign(a.states, 0); a.code.resize(a.states);
  std::vector<double> cm(a.states); // each level's energy above X(0, 0), cm⁻¹
  for (int i = 0; i < nX; i++) {
    const H2Level &x = kH2Ground[order[i]];
    cm[i] = x.E; a.g[i] = x.g;
    a.code[i] = MOLECULE + x.v * 100 + x.J;
  }
  for (int i = 0; i < nE; i++) {
    const H2Level &x = kH2Excited[i];
    cm[nX + i] = x.E; a.g[nX + i] = x.g; a.extra[nX + i] = x.extra;
    a.code[nX + i] = MOLECULE + x.state * 10000 + x.v * 100 + x.J;
  }
  // the atoms, from their own ground state (an atom pair lies D₀ above the molecule: the atoms'
  // share of the light is set apart from it, so only their order matters)
  for (int n = 1; n <= ATOM_NMAX; n++) for (int l = 0; l < n; l++) {
    const int s = a.atomStates + stateOf(n, l);
    cm[s] = D0 + CM_PER_RY * MU * (1 - 1.0 / (n * n));
    a.g[s] = 2 * (2 * l + 1);
    a.code[s] = n * 100 + l;
  }
  a.extra[a.atomStates + stateOf(2, 0)] = A_2S;
  for (int i = 0; i < a.states; i++) a.E[i] = cm[i] / CM_PER_RY;
  // the lines: one a transition
  auto addLine = [&](int u, int l, double A, bool trapped) {
    const int k = a.lines++;
    Line L;
    L.upper = u; L.lower = l;
    L.nm = 1e7 / (cm[u] - cm[l]);
    L.trapped = trapped;
    a.line.push_back(L);
    a.tr.push_back({(uint32_t)u, (uint32_t)l, (uint32_t)k, 0, 0, 0, 0, A, (cm[u] - cm[l]) / CM_PER_RY});
  };
  for (const H2Line &x : kH2Quadrupole) addLine(at[x.upper], at[x.lower], x.A, false);
  for (int i = 0; i < (int)std::size(kH2Electronic); i++) {
    const H2Line &x = kH2Electronic[i];
    if (i < kH2ToGround) addLine(nX + x.upper, at[x.lower], x.A, kH2Ground[x.lower].v == 0); // Case B: X v = 0 absorbs them again
    else addLine(nX + x.upper, nX + x.lower, x.A, false);
  }
  a.atomLines = a.lines;
  {
    std::vector<Transition> h;
    for (int n = 2; n <= ATOM_NMAX; n++) for (int m = 1; m < n; m++) {
      const int k = a.lines++;
      Line L;
      L.upper = a.atomStates + stateOf(n, 0); L.lower = a.atomStates + stateOf(m, 0);
      L.nm = wavelengthNm(n, m);
      L.stark = STARK * (n * (n - 1) + m * (m - 1)) / (0.5 * (1.0 / (m * m) - 1.0 / (n * n)));
      L.trapped = m == 1;
      a.line.push_back(L);
      h.clear();
      hydrogenShell(n, m, h);
      for (Transition t : h) {
        t.from += a.atomStates; t.to += a.atomStates; t.line = k;
        t.e *= MU;
        a.tr.push_back(t);
      }
    }
  }
  // the reference: 1–0 S(1), X(1, 3) → X(0, 1)
  int ru = -1, rl = -1;
  for (int i = 0; i < nX; i++) {
    const H2Level &x = kH2Ground[order[i]];
    if (x.v == 1 && x.J == 3) ru = i;
    if (x.v == 0 && x.J == 1) rl = i;
  }
  const double ref = cm[ru] - cm[rl];
  a.refHz = ref * 100 * C_LIGHT;
  for (Line &L : a.line) L.ratio = 1e7 / L.nm / ref;
  a.index();
  // the page's diagram: X v ≤ 4, J ≤ 3; B v′ ≤ 2 and C v′ = 0 (J′ = 1); d v′ ≤ 1 (Π⁻, N = 1);
  // a v ≤ 1 (N = 1)
  auto find = [&](int state, int v, int J) {
    for (int i = 0; i < a.atomStates; i++) if (a.code[i] == MOLECULE + state * 10000 + v * 100 + J) return i;
    return -1;
  };
  for (int v = 0; v <= 4; v++) for (int J = 0; J <= 3; J++) a.display.push_back(find(0, v, J));
  for (int v = 0; v <= 2; v++) a.display.push_back(find(1, v, 1));
  a.display.push_back(find(2, 0, 1));
  for (int v = 0; v <= 1; v++) a.display.push_back(find(5, v, 1));
  for (int v = 0; v <= 1; v++) a.display.push_back(find(6, v, 1));
  a.display.erase(std::remove(a.display.begin(), a.display.end(), -1), a.display.end());
  return a;
}

// the steady populations of a pump p, the levels decaying at G (the cascade from the top down)
static void cascade(const Gas &a, const double *p, const double *G, double *N) {
  for (int i = a.states - 1; i >= 0; i--) {
    double s = p[i];
    for (int t = a.into[i]; t < a.into[i + 1]; t++) s += a.tr[t].A * N[a.tr[t].from];
    N[i] = G[i] > 0 ? s / G[i] : 0;
  }
}

// How a key lights H₂. The molecules start in X v = 0, their J levels at a rotational temperature
// (each with its nuclear spin's weight: ortho, odd J, three times para's).
//  * Discharge: electrons into B and C as van Regemorter's dipole rate with each line's absorption
//    oscillator strength from X(0, J″), and into d³Πu by exchange (as helium's triplets), its
//    vibrational levels by their Franck–Condon factors from X v = 0, its rotation keeping J for
//    Π⁻ (the Q lines) and taking J ± 1 for Π⁺; the atoms as hydrogen's discharge.
//  * Fluorescence (the Recombination setting): far-ultraviolet starlight, as flat in energy per
//    unit frequency as the interstellar field nearly is, absorbed in the Lyman and Werner lines
//    from X(0, J″) at the rate B J_ν ∝ f/ν; the atoms recombine, as in an ionised nebula.
//  * Laser: one line, X(0, 0) → B(v′, 1), v′ = the laser's level − 2.
//  * Heat: every level at its Boltzmann share (pump()).
// Then the atoms' share: scaled so that their steady light is the Atoms parameter's share of all.
void molecularPump(const Gas &a, const Lamp &lamp, double *p) {
  using namespace tables;
  const int nX = a.slowStates;
  const double kT = KB_HARTREE * lamp.T;
  auto groundPop = [&](double T, int state) {
    const int v = (a.code[state] / 100) % 100, J = a.code[state] % 100;
    if (v != 0 || J > 9) return 0.0;
    return a.g[state] * std::exp(-a.E[state] * CM_PER_RY / (0.6950348 * T));
  };
  auto absorption = [&](const Transition &t) { // f(lower → upper) from A: f = A λ² g_u / (6.6702 × 10¹⁵ g_l), λ in Å
    const double lambdaA = 1e8 / (t.e * CM_PER_RY);
    return t.A * lambdaA * lambdaA * a.g[t.from] / (6.6702e15 * a.g[t.to]);
  };
  switch (lamp.excitation) {
    case Excitation::discharge:
    case Excitation::recombination: {
      const bool cloud = lamp.excitation == Excitation::recombination;
      const double Tg = cloud ? T_GROUND_CLOUD : T_GROUND_DISCHARGE;
      for (int i = 0; i < nX; i++) {
        const double n0 = groundPop(Tg, i);
        if (!(n0 > 0)) continue;
        for (int x = a.into[i]; x < a.into[i + 1]; x++) {
          const Transition &t = a.tr[x];
          if ((int)t.from < nX || (int)t.from >= a.atomStates) continue; // the Lyman and Werner lines into X(0, J″)
          const double f = absorption(t), dE = 0.5 * t.e;
          p[t.from] += cloud ? n0 * f * (1e8 / (t.e * CM_PER_RY)) * 1e-3
                             : n0 * 14.51 * f * (0.5 / dE) * vanRegemorter(dE / kT) * std::exp(-dE / kT);
        }
      }
      if (!cloud) {
        // d³Πu by exchange from X(0, J″), Π⁻ N = J″, Π⁺ N = J″ ± 1 (half each)
        for (int s = nX; s < a.atomStates; s++) {
          const int code = a.code[s] - MOLECULE, state = code / 10000, v = (code / 100) % 100, N = code % 100;
          if (state != 4 && state != 5) continue;
          if (v >= (int)std::size(kH2FulcherFromGround)) continue;
          double from = 0;
          for (int i = 0; i < nX; i++) {
            const int J = a.code[i] % 100;
            if ((a.code[i] / 100) % 100 != 0) continue;
            if (state == 5 ? J == N : std::abs(J - N) == 1) from += groundPop(Tg, i) * (state == 5 ? 1 : 0.5);
          }
          const double dE = 0.5 * a.E[s], y = dE / kT;
          p[s] += from * OMEGA_FULCHER * kH2FulcherFromGround[v] * exchangeShape(kT / dE) * std::exp(-y);
        }
      }
      // the atoms
      const int o = a.atomStates;
      const double dE2 = MU * 0.375;
      for (int n = 2; n <= ATOM_NMAX; n++) {
        if (cloud) for (int l = 0; l < n; l++) p[o + stateOf(n, l)] = recombination(n, l, lamp.T) * 1e13;
        else {
          const double dE = MU * 0.5 * (1 - 1.0 / (n * n));
          p[o + stateOf(n, 1)] = oscillator1s(n) * (0.5 / dE) * std::exp(-(dE - dE2) / kT);
        }
      }
      break;
    }
    case Excitation::laser: {
      const int v = lamp.laserN - 2;
      for (int s = nX; s < a.atomStates; s++)
        if (a.code[s] == MOLECULE + 1 * 10000 + v * 100 + 1) p[s] = 1;
      return; // a laser lights no atoms
    }
    default:
      break;
  }
  shareAtoms(a, lamp, p);
}

// Scale the atoms' pump so that their steady light is the Atoms share of the lamp's (none at 0,
// nothing but them at 1).
void shareAtoms(const Gas &a, const Lamp &lamp, double *p) {
  std::vector<double> G(a.states), N(a.states);
  drain(lamp, G.data());
  cascade(a, p, G.data(), N.data());
  double mol = 0, atoms = 0;
  for (const Transition &t : a.tr) {
    if (lamp.caseB && a.line[t.line].trapped) continue;
    (t.from >= (uint32_t)a.atomStates ? atoms : mol) += t.A * N[t.from] * t.e;
  }
  const double share = std::clamp(lamp.atoms, 0.0, 1.0);
  if (!(atoms > 0) || !(mol > 0)) return;
  const double k = share >= 1 ? 1 : share / (1 - share) * mol / atoms;
  for (int i = a.atomStates; i < a.states; i++) p[i] *= k;
  if (share >= 1) for (int i = 0; i < a.atomStates; i++) p[i] = 0;
}

} // namespace forte::hydrogen
