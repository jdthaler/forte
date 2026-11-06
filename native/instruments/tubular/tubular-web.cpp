// tubular-web.cpp — the model's functions the page's views call (tubular/src/tubular-wasm.js),
// what the page sends with a note (its tube, packed), and the engine's test hooks (its voices).

#include <algorithm>
#include <memory>

#include "forte/web.h"
#include "tubular-engine.h"

using namespace forte::tubular;

// The views ask for the same tube again and again: keep the last one.
static const Tube &cachedTube(int key, const double *P) {
  static std::unique_ptr<Tube> tube;
  static int lastKey = -1;
  static double last[6] = {};
  key = std::min(KEY_MAX, std::max(KEY_MIN, key));
  const double now[6] = {P[p::material], P[p::diameter], P[p::wall], P[p::cap], P[p::distance], tuningOf(P).ratio(key)};
  if (!tube || key != lastKey || !std::equal(now, now + 6, last)) {
    if (!tube) tube = std::make_unique<Tube>();
    buildTube(key, (int)now[0], now[1], now[2], now[3], now[5], now[4], *tube);
    lastKey = key; std::copy(now, now + 6, last);
  }
  return *tube;
}

extern "C" {
// A key's tube for the parameters P into out, returning how many numbers it wrote: key, L, mass,
// f4, the section (E, rho, G, kappa, a, ai, A, I, mc, Jc), its place (x, y), the number of modes
// N, the shape's points NX; then per mode: f, sigRad, J, dampW, the gains (re, im left, re, im
// right), the roots (alpha, beta, ka, kb), the coefficients (4) and its shape w at NX points from
// the bottom to the top.
constexpr int NX = 97;
FORTE_EXPORT int tubular_tube(int key, const double *P, double *out) {
  const Tube &t = cachedTube(key, P);
  const Section &s = t.s;
  int n = 0;
  for (double v : {(double)t.key, t.L, t.mass, t.f4, s.E, s.rho, s.G, s.kappa, s.a, s.ai, s.A, s.I, s.mc, s.Jc, t.place.x, t.place.y, (double)t.count, (double)NX})
    out[n++] = v;
  for (int i = 0; i < t.count; i++) {
    const Mode &m = t.m[i];
    for (double v : {m.f, m.sigRad, m.J, m.dampW, m.gain[0].real(), m.gain[0].imag(), m.gain[1].real(), m.gain[1].imag(),
                     m.r.alpha, m.r.beta, m.r.ka, m.r.kb, m.c[0], m.c[1], m.c[2], m.c[3]})
      out[n++] = v;
    for (int j = 0; j < NX; j++) out[n++] = modeW(m, t.L, (t.L * j) / (NX - 1));
  }
  return n;
}
// Mode i of a key's tube: its w and ψ at x (m from the bottom), and ∫₀ᴸ w e^{iκx} dx (re, im).
static const Tube *lastTube(int key, const double *P) { return &cachedTube(key, P); }
FORTE_EXPORT void tubular_mode_at(int key, const double *P, int i, double x, double *out) {
  const Tube &t = *lastTube(key, P);
  out[0] = modeW(t.m[i], t.L, x); out[1] = modePsi(t.m[i], t.L, x);
}
FORTE_EXPORT void tubular_transform(int key, const double *P, int i, double kappa, double *out) {
  const Tube &t = *lastTube(key, P);
  const auto I = modeTransform(t.m[i], t.L, kappa);
  out[0] = I.real(); out[1] = I.imag();
}
// The section of a tube (E, rho, G, kappa, a, ai, A, I, mc, Jc).
FORTE_EXPORT void tubular_section(int material, double diameter, double wall, double cap, double *out) {
  const Section s = sectionOf(material, diameter, wall, cap);
  const double v[10] = {s.E, s.rho, s.G, s.kappa, s.a, s.ai, s.A, s.I, s.mc, s.Jc};
  for (int i = 0; i < 10; i++) out[i] = v[i];
}
// The beam's frequencies for a section, a length and a band, returning how many.
FORTE_EXPORT int tubular_freqs(int material, double diameter, double wall, double cap, double L, double fLo, double fHi, int n, double *out) {
  return tubeFreqs(sectionOf(material, diameter, wall, cap), L, fLo, fHi, std::min(n, MAX_MODES), out);
}
FORTE_EXPORT double tubular_det(int material, double diameter, double wall, double cap, double L, double omega) {
  return tubeDet(sectionOf(material, diameter, wall, cap), L, omega);
}
FORTE_EXPORT double tubular_euler(int material, double diameter, double wall, double L, int n) { return eulerFreq(sectionOf(material, diameter, wall, 0), L, n); }
FORTE_EXPORT double tubular_cutoff(int material, double diameter, double wall) { return cutoffFreq(sectionOf(material, diameter, wall, 0)); }
FORTE_EXPORT double tubular_cut_length(int material, double diameter, double wall, double cap, double note) { return cutLength(sectionOf(material, diameter, wall, cap), note); }
FORTE_EXPORT double tubular_kappa(double nu, double m) { return cowperKappa(nu, m); }
FORTE_EXPORT double tubular_beta_l(int n) { return BETA_L[n]; }
// The Bessel functions (0: J₀, 1: J₁, 2: Y₀, 3: Y₁) and the fat cylinder's factor.
FORTE_EXPORT double tubular_bessel(int which, double x) {
  return which == 0 ? besselJ0(x) : which == 1 ? besselJ1(x) : which == 2 ? besselY0(x) : besselY1(x);
}
FORTE_EXPORT double tubular_fat(double ka) { return fatCylinder(ka); }
// The constants the views and tests use: the metals (E, rho, nu × 3), air (c, rho), the layout
// (SPACING, ROW, MIC_HALF, MIC_DROP, DAMPER_Z, DAMPER_W), CAP_DEPTH, KEY_LO, KEY_HI, KEY_MIN, KEY_MAX.
FORTE_EXPORT int tubular_constants(double *out) {
  int n = 0;
  for (const Material &m : MATERIALS) { out[n++] = m.E; out[n++] = m.rho; out[n++] = m.nu; }
  for (double v : {C_AIR, RHO_AIR, SPACING, ROW, MIC_HALF, MIC_DROP, DAMPER_Z, DAMPER_W, CAP_DEPTH, (double)KEY_LO, (double)KEY_HI, (double)KEY_MIN, (double)KEY_MAX})
    out[n++] = v;
  return n;
}
FORTE_EXPORT void tubular_place(int key, double *out) { const Place p = placeOf(key); out[0] = p.x; out[1] = p.y; }
// malletOf: m, K, p, alpha
FORTE_EXPORT void tubular_mallet(double hardness, double mass, double *out) {
  const Mallet m = malletOf(hardness, mass);
  out[0] = m.m; out[1] = m.K; out[2] = m.p; out[3] = m.alpha;
}

// A key's tube for the parameters P, packed (packTube) into out, returning how many numbers:
// what the page sends with a note (noteData), and its engine takes (tubular_offer).
FORTE_EXPORT int tubular_voice_data(int key, const double *P, double *out) { return packTube(cachedTube(key, P), out); }
FORTE_EXPORT int tubular_offer(TubularEngine *e, const double *packed, int n) { return e->offer(packed, n); }

// The tests' hooks, on the engine of a handle (forte_engine): its voices in order, and each one's
// key, fading, dead, released, E, lastContactMs, Fmax, age, whether it is its key's (byKey),
// malletOn, damp, N (modes), and how many of them sound (not cut by the sample rate or Quality).
FORTE_EXPORT int tubular_voices(TubularEngine *e) { return e->nVoices; }
FORTE_EXPORT void tubular_voice(TubularEngine *e, int i, double *out) {
  const TubularEngine::Voice &v = *e->voices[i];
  int sounding = 0;
  for (int k = 0; k < v.N; k++) sounding += !v.cut[k];
  const double x[13] = {(double)v.key, (double)v.fading, (double)v.dead, (double)v.released, v.E, v.lastContactMs, v.Fmax, v.age,
                        (double)(e->byKey[v.key] == &v), (double)v.malletOn, v.damp, (double)v.N, (double)sounding};
  for (int k = 0; k < 13; k++) out[k] = x[k];
}
}
