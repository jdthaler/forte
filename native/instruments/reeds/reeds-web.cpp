// reeds-web.cpp — the model's functions the page's views call (reeds/src/reeds-wasm.js): a key's
// reed and its voice data, packed for the engine; the slot's C(y), the comb node, the field's pull
// and one strike traced sample by sample (traceStrike); and, for the tests, a lossless strike, the
// bare finite-element reed and the engine's hooks (its voices and slot).

#include <algorithm>
#include <cmath>
#include <memory>
#include <vector>

#include "forte/web.h"
#include "reeds-engine.h"

using namespace forte::reeds;

extern "C" void *forte_scratch();

namespace {
// the latest key asked for, kept: the views ask for it again and again
struct Cached { int key = -1; uint64_t version = 0; KeyModel model; };
const KeyModel &cachedModel(int key, double solder, double strike, double hardness, double fs) {
  static Cached c;
  key = std::min(KEY_MAX, std::max(KEY_MIN, key));
  const uint64_t v = reedVersion(solder, strike, hardness, fs);
  if (c.key != key || c.version != v) { c.model = keyModel(key, solder, strike, hardness, fs); c.key = key; c.version = v; }
  return c.model;
}

// the last strike traced
struct Trace {
  double fs2 = 0, contactMs = 0, Fmax = 0;
  int n = 0, N = 0, nFrames = 0, release = -1;
  std::vector<float> y, dC, volt, q, eta;
  std::array<double, MAX_MODES> amps{};
};
Trace trace;
} // namespace

extern "C" {
// Key m's reed (keyModel) at rate fs (the engine's: twice the audio rate) into out, returning how
// many numbers it wrote: key, f0, L, h, b, mReed, M, J, blobSide, ratio, xh, xd, xp, the hammer's
// mass, K, p, alpha, kPick, then the FEM's nel, EI, mu, m, its number of modes and of free degrees
// of freedom (N), the number of modes kept; per kept mode n, f, ratio, bare, sigma, sigSteel,
// sigClamp, w, pk, dampW, Gamma, Theta; the FEM's omega, Gamma and Theta; its modes' degrees of
// freedom (N × modes, row-major, for the mode shapes).
FORTE_EXPORT int reeds_key_model(int key, double solder, double strike, double hardness, double fs, double *out) {
  const KeyModel &k = cachedModel(key, solder, strike, hardness, fs);
  const Info &i = k.info;
  const TunedReed &r = k.reed;
  int n = 0;
  for (double v : {(double)i.key, i.f0, i.L, i.h, i.b, i.mReed, i.M, i.J, i.blobSide, i.ratio, i.xh, i.xd, i.xp, i.hammer.mass, i.hammer.K,
                   i.hammer.p, i.hammer.alpha, i.kPick, (double)r.nel, r.EI, r.mu, r.m, (double)r.omega.size(), (double)r.N, (double)k.modes.size()})
    out[n++] = v;
  for (const Mode &m : k.modes)
    for (double v : {(double)m.n, m.f, m.ratio, m.bare, m.sigma, m.sigSteel, m.sigClamp, m.w, m.pk, m.dampW, m.Gamma, m.Theta}) out[n++] = v;
  for (const auto *a : {&r.omega, &r.Gamma, &r.Theta}) for (double v : *a) out[n++] = v;
  for (double v : r.X) out[n++] = v;
  return n;
}
// The same key's voice data, packed (packVoiceData) into out, returning how many numbers: what the
// page sends with a note (noteData), and its engine takes (reeds_offer).
FORTE_EXPORT int reeds_voice_data(int key, double solder, double strike, double hardness, double fs, double *out) {
  return packVoiceData(cachedModel(key, solder, strike, hardness, fs).voice, out);
}
FORTE_EXPORT int reeds_offer(ReedEngine *e, const double *packed, int n) { return e->offer(packed, n); }

// The slot's C(y) for a gap (mm), SLOT_Y.n values (capCurve); its grid: min, step, n.
FORTE_EXPORT void reeds_cap_curve(double gap, double *out) { fillCap(out, gap); }
FORTE_EXPORT void reeds_slot_grid(double *out) { out[0] = SLOT_Y.min; out[1] = SLOT_Y.step; out[2] = SLOT_Y.n; }
// pickupNode: R, tau, fc, gain
FORTE_EXPORT void reeds_pickup_node(double rbias, double bias, double *out) {
  const Node d = pickupNode(rbias, bias);
  out[0] = d.R; out[1] = d.tau; out[2] = d.fc; out[3] = d.gain;
}
// electrostaticShift: kE, cents
FORTE_EXPORT void reeds_electrostatic_shift(double kPick, double gap, double offset, double bias, double *out) {
  const Shift s = electrostaticShift(kPick, gap, offset, bias);
  out[0] = s.kE; out[1] = s.cents;
}
FORTE_EXPORT double reeds_hammer_speed(double vel) { return hammerSpeed(vel); }

// traceStrike: one strike of key's reed (built at 2 fs, as the page's noteData) with the parameters
// in the scratch area (p::count numbers, as shared/wasm.js writes them), sample by sample at the
// engine's internal rate, for `seconds`; the modal coordinates for the first nFrames samples.
// Returns the number of samples; reeds_trace_info and reeds_trace_array read the rest.
FORTE_EXPORT int reeds_trace(int key, double velocity, double fs, double seconds, int nFrames) {
  double P[p::count];
  std::copy_n((const double *)forte_scratch(), p::count, P);
  const VoiceData d = cachedModel(key, P[p::solder], P[p::strike], P[p::hardness], 2 * fs).voice;
  auto e = std::make_unique<ReedEngine>(fs);
  e->setParams(P);
  auto v = std::make_unique<ReedEngine::Voice>();
  v->start(*e, d.key, d);
  const int N = v->N, n = (int)std::floor(seconds * e->fs2 + 0.5);
  v->strike(hammerSpeed(velocity));
  Trace &t = trace;
  t = Trace{};
  t.fs2 = e->fs2; t.n = n; t.N = N; t.nFrames = nFrames;
  t.y.assign(n, 0); t.dC.assign(n, 0); t.volt.assign(n, 0); t.q.assign((size_t)nFrames * N, 0); t.eta.assign(nFrames, 0);
  const double k = 1 / e->fs2;
  double u = 0, xp = 0;
  for (int s = 0; s < n; s++) {
    double one = 0;
    const bool was = v->hammerOn;
    v->render(&one, 1, *e);
    if (was && !v->hammerOn) {
      // each mode's amplitude at the slot as the hammer leaves, from two successive samples
      t.release = s;
      for (int i = 0; i < N; i++) {
        const double c = std::cos(v->om[i] * k), a = v->q[i], b = v->q1[i];
        t.amps[i] = std::fabs(v->pk[i]) * std::sqrt(std::max(0.0, a * a - 2 * c * a * b + b * b)) / std::sin(v->om[i] * k);
      }
    }
    double yy = 0;
    for (int i = 0; i < N; i++) yy += v->pk[i] * v->q[i];
    t.y[s] = (float)yy; t.dC[s] = (float)one;
    u = e->nodeA * u + e->nodeB * (one - xp); xp = one; t.volt[s] = (float)u;
    if (s < nFrames) { for (int i = 0; i < N; i++) t.q[(size_t)s * N + i] = (float)v->q[i]; t.eta[s] = v->hammerOn ? (float)v->eta : NAN; }
  }
  t.contactMs = (v->contactSamples / e->fs2) * 1000; t.Fmax = v->Fmax;
  return n;
}
// A lossless strike, for the tests' energy balance: key's reed (built at 2 fs) with no damping,
// a felt with no hysteresis (alpha = 0) and no pull from the field (kF = 0), struck at `velocity`
// and run for `seconds` at the engine's rate. Into out: the hammer's mass, its speed at launch, its
// speed (signed, positive toward the reed) on its last step in flight, the samples in contact, fs2 and N;
// then each mode's angular frequency, its coordinate (unit modal mass) on the last two samples (q,
// then q1). Returns how many numbers it wrote.
FORTE_EXPORT int reeds_lossless_strike(int key, double velocity, double fs, double seconds, double *out) {
  double P[p::count];
  std::copy_n((const double *)forte_scratch(), p::count, P);
  VoiceData d = cachedModel(key, P[p::solder], P[p::strike], P[p::hardness], 2 * fs).voice;
  d.sigma.fill(0); d.hammer.alpha = 0;
  auto e = std::make_unique<ReedEngine>(fs);
  e->setParams(P);
  e->kF = 0;
  auto v = std::make_unique<ReedEngine::Voice>();
  v->start(*e, d.key, d);
  const double v0 = hammerSpeed(velocity), k = 1 / e->fs2;
  v->strike(v0);
  double vh = 0;
  const int n = (int)std::floor(seconds * e->fs2 + 0.5);
  for (int s = 0; s < n; s++) {
    double one = 0;
    const bool was = v->hammerOn;
    v->render(&one, 1, *e);
    if (was) vh = (v->eta - v->etaPrev) / k;
  }
  int m = 0;
  for (double x : {d.hammer.mass, v0, vh, (double)v->contactSamples, e->fs2, (double)v->N}) out[m++] = x;
  for (const auto *a : {&v->om, &v->q, &v->q1}) for (int i = 0; i < v->N; i++) out[m++] = (*a)[i];
  return m;
}
// The bare finite-element reed (reedFEM) for a tongue L × h × b with a tip mass M and rotary
// inertia J, nModes modes: EI, mu, m, the number of modes, then omega, Gamma and Theta.
FORTE_EXPORT int reeds_fem(double L, double h, double b, double M, double J, int nModes, double *out) {
  const ReedFEM r = reedFEM(L, h, b, M, J, 20, std::max(1, std::min(MAX_MODES, nModes)));
  int m = 0;
  for (double x : {r.EI, r.mu, r.m, (double)r.omega.size()}) out[m++] = x;
  for (const auto *a : {&r.omega, &r.Gamma, &r.Theta}) for (double x : *a) out[m++] = x;
  return m;
}
// fs2, n, N, nFrames, release, contactMs, Fmax, then amps (N)
FORTE_EXPORT void reeds_trace_info(double *out) {
  const Trace &t = trace;
  int n = 0;
  for (double v : {t.fs2, (double)t.n, (double)t.N, (double)t.nFrames, (double)t.release, t.contactMs, t.Fmax}) out[n++] = v;
  for (int i = 0; i < t.N; i++) out[n++] = t.amps[i];
}
// the trace's arrays (float32): 0 y, 1 dC, 2 volt, 3 q (nFrames × N), 4 eta
FORTE_EXPORT const float *reeds_trace_array(int which) {
  const std::vector<float> *a[] = {&trace.y, &trace.dC, &trace.volt, &trace.q, &trace.eta};
  return which >= 0 && which < 5 ? a[which]->data() : nullptr;
}

// The tests' hooks, on the engine of a handle (forte_engine): its voices in order, and each one's
// key, dead, killing, hits, peak, hammerOn, keyDown, damped, whether it is its key's (byKey),
// contactSamples, Fmax, N, yMin, yMax and its version.
FORTE_EXPORT int reeds_voices(ReedEngine *e) { return e->nVoices; }
FORTE_EXPORT void reeds_voice(ReedEngine *e, int i, double *out) {
  const ReedEngine::Voice &v = *e->voices[i];
  const double x[15] = {(double)v.key, (double)v.dead, (double)v.killing, (double)v.hits, v.peak, (double)v.hammerOn, (double)v.keyDown,
                        (double)v.damped, (double)(e->byKey[v.key] == &v), (double)v.contactSamples, v.Fmax, (double)v.N, v.yMin, v.yMax,
                        (double)v.version};
  for (int k = 0; k < 15; k++) out[k] = x[k];
}
// The slot and comb node: fs2, damperSigma, hammerMax, kF,
// nodeA, nodeB, y0, cRest, dRest, y0N, cRestN, dRestN, blend, twoTables.
FORTE_EXPORT void reeds_state(ReedEngine *e, double *out) {
  const double x[14] = {e->fs2, e->damperSigma, (double)e->hammerMax, e->kF, e->nodeA, e->nodeB, e->y0, e->cRest, e->dRest, e->y0N, e->cRestN,
                        e->dRestN, (double)e->blend, (double)e->twoTables};
  for (int k = 0; k < 14; k++) out[k] = x[k];
}
FORTE_EXPORT void reeds_set_kf(ReedEngine *e, double kF) { e->kF = kF; }
// C(y) now (0) and, while the gap glides, the next block's (1): SLOT_Y.n values
FORTE_EXPORT double *reeds_cap(ReedEngine *e, int which) { return which ? e->capB : e->capA; }
// a test's own δC for the next block (2 × its samples), added once
FORTE_EXPORT double *reeds_extra(ReedEngine *e) { return e->extra.data(); }
FORTE_EXPORT void reeds_use_extra(ReedEngine *e) { e->hasExtra = true; }
}
