// blackhole-web.cpp — the model's functions the page's views call (blackhole/src/blackhole-wasm.js):
// the QNM table and its interpolation, a key's voice and its strain; and the engine's hooks: the
// page's note data (a key's voice), the voice limit, and the voices for the tests.
//
// A voice goes to and from JavaScript packed as doubles:
//   key, count, hasChirp,
//   the chirp: Mc, fStart, fIsco, f220, tc, cp, cx, amp, psi, fPk, tauB, fadeT,
//   the info: key, f0, a, M, Msun, nu, rPlusKm, OmegaH, hawkingK,
//   then per mode: l, m, n, f, gamma, tau, Q, amp, cpr, cpi, cxr, cxi.

#include <vector>

#include "blackhole-engine.h"
#include "forte/web.h"

using namespace forte::blackhole;

namespace {
constexpr int HEAD = 24, PER_MODE = 12;

void pack(const KeyVoice &v, double *o) {
  const Chirp &c = v.chirp;
  const Info &i = v.info;
  const double head[HEAD] = {(double)v.key, (double)v.count, v.hasChirp ? 1.0 : 0.0,
                             c.Mc, c.fStart, c.fIsco, c.f220, c.tc, c.cp, c.cx, c.amp, c.psi, c.fPk, c.tauB, c.fadeT,
                             i.key, i.f0, i.a, i.M, i.Msun, i.nu, i.rPlusKm, i.OmegaH, i.hawkingK};
  for (int k = 0; k < HEAD; k++) o[k] = head[k];
  for (int k = 0; k < v.count; k++) {
    const Mode &m = v.modes[k];
    const double row[PER_MODE] = {(double)m.l, (double)m.m, (double)m.n, m.f, m.gamma, m.tau, m.Q, m.amp, m.cpr, m.cpi, m.cxr, m.cxi};
    for (int j = 0; j < PER_MODE; j++) o[HEAD + PER_MODE * k + j] = row[j];
  }
}

void unpack(const double *o, KeyVoice &v) {
  v.key = (int)o[0];
  v.count = (int)o[1] < 0 ? 0 : (int)o[1] > MAX_MODES ? MAX_MODES : (int)o[1];
  v.hasChirp = o[2] != 0;
  Chirp &c = v.chirp;
  c.Mc = o[3]; c.fStart = o[4]; c.fIsco = o[5]; c.f220 = o[6]; c.tc = o[7]; c.cp = o[8]; c.cx = o[9];
  c.amp = o[10]; c.psi = o[11]; c.fPk = o[12]; c.tauB = o[13]; c.fadeT = o[14];
  Info &i = v.info;
  i.key = o[15]; i.f0 = o[16]; i.a = o[17]; i.M = o[18]; i.Msun = o[19]; i.nu = o[20]; i.rPlusKm = o[21]; i.OmegaH = o[22]; i.hawkingK = o[23];
  for (int k = 0; k < v.count; k++) {
    const double *r = o + HEAD + PER_MODE * k;
    Mode &m = v.modes[k];
    m.l = (int)r[0]; m.m = (int)r[1]; m.n = (int)r[2]; m.f = r[3]; m.gamma = r[4]; m.tau = r[5]; m.Q = r[6]; m.amp = r[7];
    m.cpr = r[8]; m.cpi = r[9]; m.cxr = r[10]; m.cxi = r[11];
  }
}

KeyVoice scratchVoice;
std::vector<float> strain;
} // namespace

extern "C" {
// the packed voice's size in doubles, at most
FORTE_EXPORT int blackhole_voice_size() { return HEAD + PER_MODE * MAX_MODES; }

// the table and its interpolation
FORTE_EXPORT int blackhole_table_size() { return tableSize(); }
FORTE_EXPORT int blackhole_table_modes() { return tableModes(); }
FORTE_EXPORT const double *blackhole_table_u() { return tableU(); }
// mode i's l, m, n in out; its Re Mω and log(−Im Mω) per spin from blackhole_table_re / _lim
FORTE_EXPORT void blackhole_table_lmn(int i, double *out) {
  int l, m, n;
  const double *re, *lim;
  tableMode(i, l, m, n, re, lim);
  out[0] = l; out[1] = m; out[2] = n;
}
FORTE_EXPORT const double *blackhole_table_re(int i) { int l, m, n; const double *re, *lim; tableMode(i, l, m, n, re, lim); return re; }
FORTE_EXPORT const double *blackhole_table_lim(int i) { int l, m, n; const double *re, *lim; tableMode(i, l, m, n, re, lim); return lim; }
// Mω in out (re, im); 0 if the table has no such mode
FORTE_EXPORT int blackhole_omega(int l, int m, int n, double a, double *out) {
  Omega w;
  if (!omega(l, m, n, a, w)) return 0;
  out[0] = w.re; out[1] = w.im;
  return 1;
}
FORTE_EXPORT double blackhole_swsh(int s, int l, int m, double theta) { return swsh(s, l, m, theta); }
// a key's voice, packed into out; ratio the keyboard's tuning for the key (shared/tuning.js tuningRatio)
FORTE_EXPORT void blackhole_key_voice(int key, double spinU, double massRatio, double inclination, double t0, double overtones,
                                      double retrograde, int inspiral, double inspiralOct, double fs, double ratio, double *out) {
  ModelParams P;
  P.tuning.r[((key % 12) + 12) % 12] = ratio;
  P.spinU = spinU; P.massRatio = massRatio; P.inclination = inclination; P.t0 = t0; P.overtones = overtones;
  P.retrograde = retrograde; P.inspiral = inspiral != 0; P.inspiralOct = inspiralOct;
  keyVoice(key, P, fs, scratchVoice);
  pack(scratchVoice, out);
}
// the strain of a packed voice at n points: h₊ then h× (float32) at blackhole_strain_buf();
// returns the duration
FORTE_EXPORT double blackhole_strain(const double *voice, int n) {
  unpack(voice, scratchVoice);
  if ((int)strain.size() < 2 * n) strain.resize(2 * n);
  return strainCurve(scratchVoice, n, strain.data(), strain.data() + n);
}
FORTE_EXPORT float *blackhole_strain_buf() { return strain.data(); }

// The hooks, on the engine of a handle (forte_engine).
FORTE_EXPORT void blackhole_offer(RingdownEngine *e, const double *voice) { unpack(voice, e->offered()); e->offerReady(); }
FORTE_EXPORT void blackhole_max_voices(RingdownEngine *e, int n) { e->setMaxVoices(n); }
FORTE_EXPORT Voice *blackhole_voice_at(RingdownEngine *e, int i) { return i >= 0 && i < e->nv ? e->voices[i] : nullptr; }
// key, vel, keyDown, ring, stolen, dead, fade, level, hasChirp, stage, f, t, phi, A, xfade
FORTE_EXPORT void blackhole_voice(const Voice *v, double *out) {
  const double o[15] = {(double)v->key, v->vel, (double)v->keyDown, (double)v->ring, (double)v->stolen, (double)v->dead, v->fade, v->level,
                        (double)v->hasChirp, (double)v->stage, v->f, v->t, v->phi, v->A, v->xfade};
  for (int i = 0; i < 15; i++) out[i] = o[i];
}
}
