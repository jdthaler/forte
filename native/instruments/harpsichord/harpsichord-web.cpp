// harpsichord-web.cpp — the model's functions the page's views call (harpsichord/src/harpsichord-wasm.js),
// and the engine's test hooks (its voices, in order and by key).
// Model functions take the native parameters (P, indexed as in harpsichord-params.h).

#include <memory>
#include <vector>

#include "harpsichord-engine.h"
#include "forte/web.h"

using namespace forte::harpsichord;

namespace {
// the last slow-motion pluck: its trace (t, y, u, F, s, z, w, fb; each `count` long), and its
// string's modal state at the end (N, h, then each partial's ω, q and q1)
std::vector<double> trace, modal;
} // namespace

extern "C" {
// registration: out = the rows that pluck (front, back, 4′, lute), then the choirs whose jacks rise (front, back, 4′)
FORTE_EXPORT void harpsichord_registration(const double *P, double *out) {
  const Registration r = registration(paramsOf(P));
  for (int i = 0; i < 4; i++) out[i] = r.rows[i];
  for (int i = 0; i < 3; i++) out[4 + i] = r.lift[i];
}
// stringDesign: L, d, A, mu, EI, T, B, f0, stress, c, Z, brass?
FORTE_EXPORT void harpsichord_string_design(const double *P, int m, int choir, double *out) {
  const StringDesign S = stringDesign(m, choir, paramsOf(P));
  const double v[12] = {S.L, S.d, S.A, S.mu, S.EI, S.T, S.B, S.f0, S.stress, S.c, S.Z, S.mat == &BRASS ? 1.0 : 0.0};
  for (int i = 0; i < 12; i++) out[i] = v[i];
}
FORTE_EXPORT double harpsichord_string_length(int m, int choir) { return stringLength(m, choir); }
FORTE_EXPORT int harpsichord_is_brass(int m, int choir) { return isBrass(m, choir) ? 1 : 0; }
FORTE_EXPORT double harpsichord_pluck_point(const double *P, int m, int row) { return pluckPoint(m, row, paramsOf(P)); }
// stringPartials of key m's string of a choir: returns how many; out = per partial n, f, k, b, sigS, sigB, sigma
FORTE_EXPORT int harpsichord_partials(const double *P, int m, int choir, double fs, double *out) {
  const Params q = paramsOf(P);
  auto parts = std::make_unique<Partials>();
  stringPartials(stringDesign(m, choir, q), q, fs, *parts);
  for (int i = 0; i < parts->N; i++) {
    const double v[7] = {(double)(i + 1), parts->f[i], parts->k[i], parts->b[i], parts->sigS[i], parts->sigB[i], parts->sigma[i]};
    for (int j = 0; j < 7; j++) out[7 * i + j] = v[j];
  }
  return parts->N;
}
// The slow-motion pluck (simulatePluck): returns how many points it traced (harpsichord_trace has
// them, harpsichord_modal the string's modes at the end); out = released (s, or −1), the
// release's F, y, u, w, s, theta, the plectrum's len, overlap, s0, kTip, EI0, tau, mu, fore,
// material, the string's d and brass?, x, gap, the string's energy at the end, and the plectrum's
// work on it. mu (≥ 0: the plectrum's friction instead of its material's) and bridgeScale (× the
// string's drain into the board) are the tests' knobs: −1 and 1 leave the model as it is.
FORTE_EXPORT int harpsichord_simulate(const double *P, double mu, double bridgeScale, int m, int row, double V, double fs, double sec, int every, double until, double *out) {
  auto sim = std::make_unique<Simulated>();
  Params q = paramsOf(P);
  q.mu = mu; q.bridgeScale = bridgeScale;
  simulatePluck(*sim, m, row, q, V, fs, sec, every < 1 ? 1 : every, until);
  const PluckTrace &t = sim->trace;
  const Plectrum &pl = t.pl;
  const double v[24] = {t.released, t.rel.F, t.rel.y, t.rel.u, t.rel.w, t.rel.s, t.rel.theta, pl.len, pl.overlap, pl.s0, pl.kTip, pl.EI0, pl.tau, pl.mu, pl.fore,
                        (double)pl.material, t.S.d, t.S.mat == &BRASS ? 1.0 : 0.0, t.x, t.gap, t.energy, t.work, t.staticCompliance, t.Kz};
  for (int i = 0; i < 24; i++) out[i] = v[i];
  const size_t n = t.t.size();
  trace.assign(8 * n, 0);
  const std::vector<double> *cols[8] = {&t.t, &t.y, &t.u, &t.F, &t.s, &t.z, &t.w, &t.fb};
  for (int c = 0; c < 8; c++) std::copy(cols[c]->begin(), cols[c]->end(), trace.begin() + c * n);
  const PluckedString &st = sim->st;
  modal.assign({(double)st.N, st.h});
  for (int i = 0; i < st.N; i++) { modal.push_back(st.W[i]); modal.push_back(st.q()[i]); modal.push_back(st.q1()[i]); }
  return (int)n;
}
FORTE_EXPORT const double *harpsichord_trace() { return trace.data(); }
FORTE_EXPORT const double *harpsichord_modal() { return modal.data(); }
// bridgePoint(m, choir): x, y on the board
FORTE_EXPORT void harpsichord_bridge_point(int m, int choir, double *out) {
  const auto b = bridgePoint(m, choir);
  out[0] = b[0]; out[1] = b[1];
}
// boardAdmittance(x, y, f): re, im (s/kg)
FORTE_EXPORT void harpsichord_board_admittance(double x, double y, double f, double *out) {
  const auto Y = boardAdmittance(x, y, f);
  out[0] = Y[0]; out[1] = Y[1];
}
// The plectrum's bending (beamC, beamG, beamPhi) at s, for a plectrum of taper tau, EI0, len and foreshortening
FORTE_EXPORT void harpsichord_beam(double tau, double EI0, double len, double fore, double s, double *out) {
  Plectrum pl;
  pl.tau = tau; pl.T = &unitTables(tau); pl.EI0 = EI0; pl.len = len; pl.fore = fore;
  out[0] = beamC(pl, s); out[1] = beamG(pl, s); out[2] = beamPhi(pl, s);
}

// ---- the engine's test hooks
FORTE_EXPORT int harpsichord_voices(forte::Engine *e) { return static_cast<HarpsichordEngine *>(e)->nVoices; }
// voice i: key, killing, dead, sounded, keyDown, pending, vDown, lift, peak, own (byKey), then per
// choir (front, back, 4′): has a string, its plectra's phases (0 off, 1 under, 2 above)
FORTE_EXPORT void harpsichord_voice(forte::Engine *e, int i, double *out) {
  auto *eng = static_cast<HarpsichordEngine *>(e);
  const HarpsichordEngine::Voice &v = *eng->voices[i];
  const double head[10] = {(double)v.key, (double)v.killing, (double)v.dead, (double)v.sounded, (double)v.keyDown, (double)v.pending, v.vDown, v.lift, v.peak, eng->byKey[v.key] == &v ? 1.0 : 0.0};
  for (int j = 0; j < 10; j++) out[j] = head[j];
  for (int c = 0; c < 3; c++) {
    out[10 + 3 * c] = v.has[c];
    out[11 + 3 * c] = (double)v.strings[c].phase[0];
    out[12 + 3 * c] = (double)v.strings[c].phase[1];
  }
}
FORTE_EXPORT int harpsichord_ready(forte::Engine *e, int key) { return static_cast<HarpsichordEngine *>(e)->ready(key) ? 1 : 0; }
}
