// grand-web.cpp — the model's functions the page's views call (grand/src/grand-wasm.js), and the
// engine's hooks: its voices (for the tests and the page's slow-motion view) and the page's
// oscillator budget.

#include <algorithm>
#include <memory>
#include <vector>

#include "forte/web.h"
#include "grand-engine.h"

using namespace forte::grand;
using Voice = GrandEngine::Voice;

// The views ask for the same board again and again (its admittance, then its response per
// partial): keep the last one. fmax and maxModes (the tests': 0 for the model's own) widen its
// modal band.
static const BoardModel &cachedBoard(double boardH, double fmax = 0, int maxModes = 0) {
  static std::unique_ptr<BoardModel> board;
  static int builtModes = 0;
  if (!(fmax > 0)) fmax = BOARD.fmax;
  if (maxModes <= 0) maxModes = BOARD.maxModes;
  if (!board || board->boardH != boardH || board->fmax != fmax || builtModes != maxModes) {
    board = std::make_unique<BoardModel>(boardModel(boardH, fmax, maxModes));
    builtModes = maxModes;
  }
  return *board;
}
static std::vector<double> modes; // grand_board_modes's

// A key's model, packed (grand-wasm.js unpacks it): key, ns, det[3], seg, beta, xh, wH, xd, the
// hammer (mass, K, p, alpha), hasDamper, n, nV, the number of partials; the string (key, f0, cents,
// L, d, dOut, mu, muCore, wound, T, EI, B, stress, cT); per partial n, k, f, w, b, sigInt, GV, GH,
// bridgeV, bridgeH, fH, phiH, damp, stretch; then the flattened modes' freq, sigma, w, c, bf, damp,
// str and idx. It is bigger than the scratch area: it goes in its own buffer.
static std::vector<double> packed;
static double *pack(const KeyModel &d) {
  packed.clear();
  const Scale &S = d.S;
  for (double v : {(double)d.key, (double)d.ns, d.det[0], d.det[1], d.det[2], (double)d.seg, d.beta, d.xh, d.wH, d.xd, d.hammer.mass, d.hammer.K, d.hammer.p,
                   d.hammer.alpha, d.hasDamper ? 1.0 : 0.0, (double)d.n, (double)d.nV, (double)d.partials.size()}) packed.push_back(v);
  for (double v : {(double)S.key, S.f0, S.cents, S.L, S.d, S.dOut, S.mu, S.muCore, S.wound ? 1.0 : 0.0, S.T, S.EI, S.B, S.stress, S.cT}) packed.push_back(v);
  for (const Partial &p : d.partials)
    for (double v : {(double)p.n, p.k, p.f, p.w, p.b, p.sigInt, p.GV, p.GH, p.bridgeV, p.bridgeH, p.fH, p.phiH, p.damp, p.stretch}) packed.push_back(v);
  for (const std::vector<double> *a : {&d.freq, &d.sigma, &d.w, &d.c, &d.bf, &d.damp}) packed.insert(packed.end(), a->begin(), a->end());
  for (uint8_t s : d.str) packed.push_back(s);
  for (uint16_t i : d.idx) packed.push_back(i);
  return packed.data();
}

extern "C" {
// keyModel(key, P, board, fs), P being every parameter in the native order (grand-params.h); the
// board, when P mounts the strings on one, is P's. Returns the packed model; grand_packed() its length.
FORTE_EXPORT double *grand_key_model(const double *P, int key, double fs) {
  const ModelParams M = modelParams(P);
  key = std::min(KEY_MAX, std::max(KEY_MIN, key));
  return pack(keyModel(key, M, M.mount == mount_::board ? &cachedBoard(M.boardH) : nullptr, fs));
}
FORTE_EXPORT int grand_packed() { return (int)packed.size(); }
// boardModel(P)'s numbers: K, D, rhoh, fRes, Ginf, mb, fBridge, f11, density, fc, micGain, fmax.
FORTE_EXPORT int grand_board(double boardH, double fmax, int maxModes, double *out) {
  const BoardModel &B = cachedBoard(boardH, fmax, maxModes);
  const double v[12] = {(double)B.K, B.D, B.rhoh, B.fRes, B.Ginf, B.mb, B.fBridge, B.f11, B.density, B.fc, B.micGain, B.fmax};
  for (int i = 0; i < 12; i++) out[i] = v[i];
  return 12;
}
// The board's modes: per mode m, n, omega, sigma, RL, RR, then phi at the SEGMENTS bridge points
// (9 numbers each, K of them). It may be bigger than the scratch area: it goes in its own buffer.
FORTE_EXPORT double *grand_board_modes(double boardH, double fmax, int maxModes) {
  const BoardModel &B = cachedBoard(boardH, fmax, maxModes);
  modes.clear();
  for (int k = 0; k < B.K; k++) {
    for (double v : {(double)B.m[k], (double)B.n[k], B.omega[k], B.sigma[k], B.RL[k], B.RR[k]}) modes.push_back(v);
    for (int i = 0; i < SEGMENTS; i++) modes.push_back(B.phi[k * SEGMENTS + i]);
  }
  return modes.data();
}
// boardResponse; without the residual path above the modal band if residual is 0
FORTE_EXPORT double grand_board_response(double boardH, double fmax, int maxModes, int residual, int seg, double f, int mic) {
  const BoardModel &B = cachedBoard(boardH, fmax, maxModes);
  if (residual) return boardResponse(B, seg, f, mic);
  BoardModel X = B;
  X.res.fill(0);
  return boardResponse(X, seg, f, mic);
}
FORTE_EXPORT void grand_board_mobility(double boardH, int seg, double f, double *out) {
  const auto y = boardMobility(cachedBoard(boardH), seg, f);
  out[0] = y[0]; out[1] = y[1];
}
// sinFT(q, κ, a): ∫₀ᵃ sin(qx) e^{iκx} dx, re and im
FORTE_EXPORT void grand_sin_ft(double q, double kap, double a, double *out) {
  const auto r = sinFT(q, kap, a);
  out[0] = r[0]; out[1] = r[1];
}
FORTE_EXPORT double grand_hammer_speed(double vel) { return hammerSpeed(vel); }
// decayRates(p, ns): prompt, after
FORTE_EXPORT void grand_decay_rates(double sigInt, double bridgeV, double bridgeH, int ns, double *out) {
  Partial p;
  p.sigInt = sigInt; p.bridgeV = bridgeV; p.bridgeH = bridgeH;
  const DecayRates r = decayRates(p, ns);
  out[0] = r.prompt; out[1] = r.after;
}

// The page's oscillator budget ({ type: 'budget', modes }).
FORTE_EXPORT void grand_budget(GrandEngine *e, double modes) { e->budget(modes); }

// The hooks, on the engine of a handle (forte_engine): its voices in order, the key's (byKey), and
// each one's state: key, active, killing, dead, struck, contactSamples, Fmax, eta, etaPrev, FV, F,
// hammerOn, age, N, nV, ns, keyDown, damped, peak, FH, v0; its modes' q and q1 (live); its model.
FORTE_EXPORT int grand_voices(GrandEngine *e) { return e->nVoices; }
FORTE_EXPORT Voice *grand_voice(GrandEngine *e, int i) { return i >= 0 && i < e->nVoices ? e->voices[i] : nullptr; }
FORTE_EXPORT Voice *grand_by_key(GrandEngine *e, int key) { return key >= 0 && key < 128 ? e->byKey[key] : nullptr; }
FORTE_EXPORT void grand_voice_state(const Voice *v, double *out) {
  const double x[21] = {(double)v->key, (double)v->active(), (double)v->killing, (double)v->dead, v->struck, (double)v->contactSamples, v->Fmax, v->eta, v->etaPrev,
                        v->FV, v->F, (double)v->hammerOn, v->age, (double)v->N, (double)v->nV, (double)v->ns, (double)v->keyDown, (double)v->damped, v->peak, v->FH, v->v0};
  for (int k = 0; k < 21; k++) out[k] = x[k];
}
FORTE_EXPORT double *grand_voice_q(Voice *v) { return v->q; }
FORTE_EXPORT double *grand_voice_q1(Voice *v) { return v->q1; }
FORTE_EXPORT double *grand_voice_model(const Voice *v) { return pack(v->b->d); }
}
