// tess-engine.cpp — TESS's engine (tess-engine.h).

#include "tess-engine.h"

#include <algorithm>
#include <cmath>

namespace forte::tess {

constexpr double OUT = 0.2;      // the output at full velocity for a dip as deep as the full scale
constexpr double FADE_IN = 0.005, FADE_OUT = 0.01; // s: for a year with no quiet stretch between dips

TessEngine::TessEngine(double fs) : Engine(fs), dcL(5, fs), dcR(5, fs) {
  spectrum.resize(TABLE);
  coef.resize(MAX_H + 1);
  store.assign((size_t)kMaxVoices * 2 * (TABLE + 1), 0.0f);
  voices.resize(kMaxVoices);
  for (int i = 0; i < kMaxVoices; i++) {
    voices[i].table[0] = store.data() + (size_t)(2 * i) * (TABLE + 1);
    voices[i].table[1] = store.data() + (size_t)(2 * i + 1) * (TABLE + 1);
  }
}

void TessEngine::setParams(const double *p) {
  bool changed = !hasParams;
  for (int i = 0; i < p::count; i++) {
    if (P[i] != p[i] && i != p::volume && i != p::room && i != p::venue) changed = true;
    P[i] = p[i];
  }
  hasParams = true;
  if (!changed) return;
  const double k = P[p::planetRadius] * R_EARTH / (P[p::starRadius] * R_SUN);
  const LimbDarkening ld = limbDarkening(P[p::teff]);
  if (k != occ.k || ld.u1 != occ.ld.u1 || ld.u2 != occ.ld.u2) occ.build(k, ld);
  version++;
}

// The voice's year as a table: the band-limited light curve (its harmonics up to the top of
// hearing, or less at lower Quality), from the Fourier series by an inverse FFT.
void TessEngine::build(Voice &v, float *into) {
  const Orbit o = orbitOf(v.key, P.data());
  const double top = std::min(pick(20000.0, 12000.0, 8000.0), 0.45 * fs);
  const int H = std::clamp((int)(top / o.freq), 1, MAX_H);
  harmonics(o, occ, H, coef.data());
  std::fill(spectrum.begin(), spectrum.end(), std::complex<double>(0, 0));
  spectrum[0] = coef[0] * TABLE;
  for (int n = 1; n <= H; n++) spectrum[n] = spectrum[TABLE - n] = coef[n] * TABLE;
  fft.inverse(spectrum.data());
  for (int i = 0; i < TABLE; i++) into[i] = (float)spectrum[i].real();
  into[TABLE] = into[0];
  v.H = H;
  v.inc = o.freq / fs;
  // the quiet stretch between dips, kept clear of the band limit's ripple by 1.5 cycles of the top harmonic
  if (o.phiT <= 0) { v.quietFrom = 0; v.quietTo = 1; }
  else {
    const double m = 1.5 / H;
    v.quietFrom = o.phiT + m; v.quietTo = 1 - o.phiT - m;
    if (v.quietFrom >= v.quietTo) v.quietFrom = v.quietTo = -1;
  }
  // a harder key is a brighter star: its light, and so the dips, in proportion (flux ∝ velocity)
  const double vel = std::max(v.vel, 1e-3);
  v.gain = OUT * vel / P[p::scale];
  v.sigma = P[p::noise] > 0.5 ? noise(P[p::tmag] - 2.5 * std::log10(vel), o.speedup / fs) : 0;
  v.built = version;
}

void TessEngine::end(Voice &v) {
  v.ending = true;
  if (v.quietFrom < 0) v.envStep = -1 / (FADE_OUT * fs);
}

int TessEngine::voiceCount() const {
  int n = 0;
  for (const Voice &v : voices) n += v.active;
  return n;
}

int TessEngine::harmonicsOf(int key) const {
  for (const Voice &v : voices) if (v.active && v.key == key) return v.H;
  return -1;
}

void TessEngine::setSustain(bool on) {
  sustain = on;
  if (!on) for (Voice &v : voices) if (v.active && !v.held && !v.ending) end(v);
}

void TessEngine::noteOn(int key, double velocity) {
  if (!hasParams) return;
  for (Voice &v : voices) {
    if (v.active && v.key == key && !v.ending) { // the same planet, its star brighter or fainter now
      v.vel = velocity; v.held = true;
      build(v, v.table[v.cur]);
      return;
    }
  }
  // Quality: past 24 planets at Medium and 12 at Low (48 at High), the oldest ends at its next quiet stretch
  int live = 0;
  Voice *oldest = nullptr, *slot = nullptr;
  for (Voice &v : voices) {
    if (!v.active) { if (!slot) slot = &v; continue; }
    if (!v.ending) { live++; if (!oldest || v.age < oldest->age) oldest = &v; }
  }
  if (oldest && live >= pick(kMaxVoices, 24, 12)) end(*oldest);
  if (!slot) { // every slot taken: the oldest goes at once
    for (Voice &v : voices) if (!slot || v.age < slot->age) slot = &v;
  }
  Voice &v = *slot;
  v.active = true; v.held = true; v.ending = false;
  v.key = key; v.vel = velocity; v.age = clock++; v.cur = 0;
  std::tie(v.gl, v.gr) = keyPan(key);
  build(v, v.table[0]);
  // start just before a transit begins, where the light is steady, so the first dip is the attack
  if (v.quietFrom >= 0) { v.phase = v.quietTo; v.env = 1; v.envStep = 0; }
  else { v.phase = 0.5; v.env = 0; v.envStep = 1 / (FADE_IN * fs); }
}

void TessEngine::noteOff(int key, double) {
  for (Voice &v : voices) {
    if (v.active && v.key == key && v.held && !v.ending) { v.held = false; if (!sustain) end(v); }
  }
}

void TessEngine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasParams) return;
  // a change of parameters reaches one voice a block, crossfaded over it
  Voice *fading = nullptr;
  for (int j = 0; j < kMaxVoices && !fading; j++) {
    Voice &v = voices[(next + j) % kMaxVoices];
    if (v.active && v.built != version) { build(v, v.table[1 - v.cur]); fading = &v; next = (next + j + 1) % kMaxVoices; }
  }
  for (Voice &v : voices) {
    if (!v.active) continue;
    const float *t = v.table[v.cur], *u = &v == fading ? v.table[1 - v.cur] : nullptr;
    for (int i = 0; i < n; i++) {
      const double x = v.phase * TABLE;
      const int j = (int)x;
      const double f = x - j;
      double s = t[j] + f * (t[j + 1] - t[j]);
      if (u) s += ((i + 1.0) / n) * (u[j] + f * (u[j + 1] - u[j]) - s);
      if (v.envStep != 0) {
        v.env += v.envStep;
        if (v.env >= 1) { v.env = 1; v.envStep = 0; }
        if (v.env <= 0) { v.active = false; break; }
      }
      const double y = -v.gain * v.env * (s + (v.sigma > 0 ? v.sigma * rng.gauss() : 0)); // the light falls in a transit
      L[i] = (float)(L[i] + v.gl * y);
      R[i] = (float)(R[i] + v.gr * y);
      v.phase += v.inc;
      if (v.phase >= 1) v.phase -= 1;
      // a let-go planet's note ends when the light is steady again, after the dip it was in
      if (v.ending && v.quietFrom >= 0 && v.phase >= v.quietFrom && v.phase <= v.quietTo) { v.active = false; break; }
    }
    if (u) v.cur = 1 - v.cur;
  }
  // the light's mean (the dips' average) is no sound
  for (int i = 0; i < n; i++) { L[i] = (float)dcL.run(L[i]); R[i] = (float)dcR.run(R[i]); }
}

} // namespace forte::tess
