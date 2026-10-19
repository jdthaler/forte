// quantum-web.cpp — the model's functions the page and its views call (quantum/src/quantum-wasm.js):
// each key's packet and the eigenfunctions on the views' grid; the page's packets for the engine;
// and the engine's test hooks (its voices, and a render in double precision into a
// Float64Array).

#include <vector>

#include "forte/web.h"
#include "quantum-engine.h"

using namespace forte::quantum;
using Voice = QuantumEngine::Voice;

namespace {
PacketParams paramsOf(const double *a) {
  PacketParams q;
  q.potential = (int)a[0]; q.eta = a[1]; q.lock = a[2] != 0; q.bpm = a[3];
  q.beats = a[4]; q.nbar = a[5]; q.sigma = a[6]; q.detector = (int)a[7];
  double custom[forte::kCustomCents]; // then the tuning: pitch, temperament, root, the custom cents
  for (int i = 0; i < forte::kCustomCents; i++) custom[i] = a[11 + i];
  q.tuning = forte::makeTuning(a[8], a[9], a[10], custom);
  return q;
}
double L64[128], R64[128];
std::vector<double> grid;
} // namespace

extern "C" {
// makePacket(key, P, { fMax, maxPairs, rel }) for P = potential, eta, lock, bpm, beats, nbar, sigma,
// detector, then the tuning's 14 (pitch, temperament, tuningRoot, cents1 … cents11): key, id, d, f0, pitch, nbar, sigma, scale, offBeat, Tcl, Trev, Tsr, tColl, kap, dc, the
// number of states N and of pairs NP, then ns, c and E (N each) and i, j, k, f, w per pair. Returns
// the count, or 0 if out has not room for `max`.
FORTE_EXPORT int quantum_make_packet(const double *P, int key, double fMax, int maxPairs, double rel, double *out, int max) {
  const Packet pk = makePacket(key, paramsOf(P), fMax, maxPairs, rel);
  const int N = (int)pk.ns.size(), NP = (int)pk.pairs.size(), n = 17 + 3 * N + 5 * NP;
  if (n > max) return 0;
  int k = 0;
  for (double v : {(double)pk.key, (double)pk.id, (double)pk.d, pk.f0, pk.pitch, pk.nbar, pk.sigma, pk.scale, pk.offBeat ? 1.0 : 0.0,
                   pk.Tcl, pk.Trev, pk.Tsr, pk.tColl, pk.kap, pk.dc, (double)N, (double)NP}) out[k++] = v;
  for (int v : pk.ns) out[k++] = v;
  for (double v : pk.c) out[k++] = v;
  for (double v : pk.E) out[k++] = v;
  for (const Pair &p : pk.pairs) { out[k++] = p.i; out[k++] = p.j; out[k++] = p.k; out[k++] = p.f; out[k++] = p.w; }
  return n;
}
// solveNbar(key, P): n̄, and whether the lock reached the beat (locked[0]).
FORTE_EXPORT double quantum_solve_nbar(const double *P, int key, double *locked) {
  bool l = false;
  const double nb = solveNbar(key, paramsOf(P), &l);
  locked[0] = l ? 1 : 0;
  return nb;
}
// waveGrid's eigenfunctions: N states (ns and E, N each, in `in`), rows points each, kept here
// until the next call; returns where (phi[i * rows + r]).
FORTE_EXPORT const double *quantum_wave_grid(int id, double kap, double nbar, double eta, int N, const double *in, int rows) {
  std::vector<int> ns(N);
  for (int i = 0; i < N; i++) ns[i] = (int)in[i];
  const std::vector<double> E(in + N, in + 2 * N);
  grid = waveGrid(id, ns, E, kap, nbar, eta, rows).phi;
  return grid.data();
}

// A packet the page built, packed (packPacket), for the next note on its key.
FORTE_EXPORT int quantum_offer(QuantumEngine *e, const double *packed, int n) { return e->offer(packed, n) ? 1 : 0; }

// n samples (≤ 128) rendered in double precision, into quantum_left64 and quantum_right64.
FORTE_EXPORT void quantum_process64(QuantumEngine *e, int n) { e->process(L64, R64, n < 128 ? n : 128); }
FORTE_EXPORT double *quantum_left64() { return L64; }
FORTE_EXPORT double *quantum_right64() { return R64; }

// The hooks, on the engine of a handle (forte_engine): its voices in order; each one's key, count,
// gl, gr, active, G, S, s0, s1, released, quench, stolen, dead, env, useIm, dc; its arrays (0 w,
// 1 gD, 2 gR as doubles; 3 gk, 4 ga, 5 gb, 6 gw as int32); and its packet, packed (packPacket). A
// voice stays where it is in the pool while it sounds.
FORTE_EXPORT int quantum_voices(QuantumEngine *e) { return e->nVoices; }
FORTE_EXPORT Voice *quantum_voice(QuantumEngine *e, int i) { return i >= 0 && i < e->nVoices ? e->voices[i] : nullptr; }
FORTE_EXPORT void quantum_voice_state(const Voice *v, double *out) {
  const double x[16] = {(double)v->key, (double)v->count, v->gl, v->gr, (double)v->active, (double)v->G, (double)v->S, (double)v->s0, (double)v->s1,
                        v->released ? 1.0 : 0.0, v->quench ? 1.0 : 0.0, v->stolen ? 1.0 : 0.0, v->dead ? 1.0 : 0.0, v->env, v->useIm ? 1.0 : 0.0, v->dc};
  for (int k = 0; k < 16; k++) out[k] = x[k];
}
FORTE_EXPORT void *quantum_voice_array(Voice *v, int which) {
  switch (which) {
    case 0: return v->w.data();
    case 1: return v->gD.data();
    case 2: return v->gR.data();
    case 3: return v->gk.data();
    case 4: return v->ga.data();
    case 5: return v->gb.data();
    case 6: return v->gw.data();
    default: return nullptr;
  }
}
FORTE_EXPORT int quantum_voice_packet(const Voice *v, double *out, int max) { return v->pk ? packPacket(*v->pk, out, max) : 0; }
}
