// nmr-engine.cpp — the NMR keyboard's engine (nmr-engine.h).

#include "nmr-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"
#include "forte/fdlibm.h"

namespace forte::nmr {

constexpr double OUT = 0.25;      // a 90° pulse on fully relaxed spins: the signal's start
constexpr double GATE_T = 0.002;  // s: the receiver opens over this after a pulse (the probe's ring-down)
constexpr double BLANK_T = 0.001; // s: the receiver closes over this before a π pulse, which fires once it has
constexpr double REL_T = 0.006;   // s: the receiver closes with this time constant
constexpr double FADE_T = 0.004;  // s: a voice replaced by a new pulse on its key fades with this
constexpr double BEND_T = 0.01;   // s: the field follows the pitch wheel with this time constant
constexpr double SILENT = 1e-4;   // a refocusable signal under this (−80 dB of a full note) is over
constexpr double FRAME_T = 1.0 / 30;
constexpr int FIRST = 21, LAST = 108;
constexpr int CB = 32;            // samples per control step: π pulses fire on its edges

NmrEngine::NmrEngine(double fs) : Engine(fs) {
  voices.resize(kPool);
  for (int k = 0; k < 128; k++) { mz[k] = 1; mzT[k] = 0; sysSample[k] = -1; }
}

void NmrEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
}

void NmrEngine::bend(double value) { wheelTarget = fdlibm::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12); }

int NmrEngine::voiceCount() const {
  int n = 0;
  for (const Voice &v : voices) n += v.on && !v.fading;
  return n;
}

static double t2of(const double *P) { return std::min(P[p::t2], 2 * P[p::t1]); } // T₂ ≤ 2 T₁

// The key's magnetisation along the field now: back toward equilibrium (1) by T₁ since it was set.
double NmrEngine::recovered(int key) const { return 1 - (1 - mz[key]) * std::exp(-(clock - mzT[key]) / P[p::t1]); }
double NmrEngine::mzOf(int key) const { return key >= 0 && key < 128 ? recovered(key) : 1; }

int NmrEngine::linesOf(int key) const {
  for (const Voice &v : voices) if (v.on && !v.fading && v.key == key) return v.nl;
  return 0;
}

const KeySystem &NmrEngine::system(int key) {
  const int s = (int)P[p::sample];
  const double f0 = keyLarmor(key, P.data());
  if (!sys[key]) sys[key] = std::make_unique<KeySystem>();
  if (sysSample[key] != s || sysF0[key] != f0) { keySystem(key, P.data(), *sys[key]); sysSample[key] = s; sysF0[key] = f0; }
  return *sys[key];
}

// The voice's lines from its coherences now (at t0): each line's amplitude is Σ ρ_ab ⟨a|F₋|b⟩ over
// its coherences (and over the lines Quality merged into one).
void NmrEngine::lines(Voice &v) {
  const KeySystem &k = *sys[v.key];
  for (int l = 0; l < v.nl; l++) v.a[l] = 0;
  for (int e = 0; e < k.elems; e++) {
    const Elem &el = k.elem[e];
    if (el.line >= 0 && v.slot[el.line] >= 0) v.a[v.slot[el.line]] += v.x[e] * el.fm;
  }
}

void NmrEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < FIRST || key > LAST) return;
  press.reset(key);
  // a new pulse on a key spoils what its sample still had in the transverse plane
  for (Voice &x : voices) if (x.on && x.key == key && !x.fading) x.fading = true;
  // past the voices Quality allows, the quietest let-go voice (else the oldest) fades out
  int live = 0;
  Voice *victim = nullptr;
  for (Voice &x : voices) {
    if (!x.on || x.fading) continue;
    live++;
    if (!victim || (!x.held && (victim->held || x.peak < victim->peak)) || (x.held && victim->held && x.age > victim->age)) victim = &x;
  }
  if (live >= pick(24, 12, 6) && victim) victim->fading = true;
  Voice *v = nullptr;
  for (Voice &x : voices) if (!x.on) { v = &x; break; }
  if (!v) { // every slot in use: the most faded
    for (Voice &x : voices) if (x.fading && (!v || x.rel < v->rel)) v = &x;
    if (!v) return;
  }
  const KeySystem &k = system(key);
  // the pulse: it tips the magnetisation that has come back since the key's last pulse by θ
  const double theta = std::clamp(velocity, 0.0, 1.0) * P[p::flip] * std::numbers::pi / 180;
  const double before = recovered(key);
  mz[key] = before * std::cos(theta); mzT[key] = clock;
  v->on = true; v->held = true; v->fading = false; v->receiving = true; v->closeT = 0;
  v->key = key;
  v->amp = OUT * std::sin(theta) * before;
  v->age = v->t0 = v->S = v->D = v->phi = v->gate = 0;
  v->keyAt = -1;
  v->rel = 1;
  v->bendNow = wheel * expr.bendOf(key);
  v->peak = std::fabs(v->amp);
  v->nyL = v->nyR = 0;
  for (int e = 0; e < k.elems; e++) v->x[e] = k.elem[e].start;
  // the lines it keeps: those under 0.45 fs. Quality: Medium and Low merge lines closer than
  // 0.05 Hz and 0.5 Hz (second-order splittings, beats slower than a few seconds) into one at
  // their mean, then keep the 32 and 16 strongest; High keeps every line
  const double merge = TAU * pick(0.0, 0.05, 0.5);
  const int most = pick(MAX_LINES, 32, 16);
  std::array<int16_t, MAX_LINES> group{};
  std::array<double, MAX_LINES> gw{}, gi{};
  int ng = 0;
  for (int l = 0; l < k.lines; l++) { // the key's lines come in order of frequency
    const Line &ln = k.line[l];
    group[l] = -1;
    if (std::fabs(ln.w) > 0.45 * TAU * fs) continue;
    const double in = std::fabs(ln.intensity) + 1e-12;
    if (ng > 0 && merge > 0 && ln.w - gw[ng - 1] / gi[ng - 1] < merge) { gw[ng - 1] += ln.w * in; gi[ng - 1] += in; }
    else { gw[ng] = ln.w * in; gi[ng] = in; ng++; }
    group[l] = (int16_t)(ng - 1);
  }
  std::array<int, MAX_LINES> order{};
  for (int g = 0; g < ng; g++) order[g] = g;
  std::sort(order.begin(), order.begin() + ng, [&](int a, int b) { return gi[a] > gi[b]; });
  std::array<int16_t, MAX_LINES> gslot{};
  for (int g = 0; g < ng; g++) gslot[g] = -1;
  v->nl = 0;
  for (int q = 0; q < ng && v->nl < most; q++) {
    const int g = order[q];
    gslot[g] = (int16_t)v->nl;
    v->w[v->nl] = gw[g] / gi[g];
    v->r[v->nl] = std::polar(1.0, v->w[v->nl] / fs);
    v->nl++;
  }
  for (int l = 0; l < k.lines; l++) v->slot[l] = group[l] >= 0 ? gslot[group[l]] : (int16_t)-1;
  lines(*v);
  Message m;
  m.type = kStrike; m.key = (int16_t)key; m.count = 7;
  const double vals[7] = {k.f0 * 1e-6, k.B0, theta * 180 / std::numbers::pi, before, mz[key], v->amp / OUT, (double)v->nl};
  for (int i = 0; i < 7; i++) m.values[i] = (float)vals[i];
  post(m);
}

// Lift: how the receiver closes. A slow lift fades the echoes out (over up to 0.3 s), a fast one
// cuts them; open until gone, a lift that isn't middling closes it too.
void NmrEngine::noteOff(int key, double velocity) {
  const double s = liftScale(velocity);
  for (Voice &v : voices) {
    if (!v.on || v.key != key || !v.held || v.fading) continue;
    v.held = false;
    if (s != 1) { v.receiving = false; v.closeT = s > 1 ? REL_T + 0.3 * (s - 1) : REL_T * s * s; }
    else if ((int)P[p::acquire] == acquire_::held) v.receiving = false; // the receiver closes
  }
}

void NmrEngine::allNotesOff() {
  for (Voice &v : voices) v.on = false;
  pedal = pending = false;
  allAt = -1;
  press.clear();
}

void NmrEngine::setSustain(bool on) {
  if (on && !pedal) { pending = true; toPulse = P[p::spacing]; }
  pedal = on;
}

// Ask for a π pulse. A spectrometer blanks its receiver for every pulse, which would otherwise
// swamp it: the receivers listening close over BLANK_T, the pulse fires once they have, and they
// open again as the probe rings down (GATE_T), as after a key's pulse. Heard open, the pulse would be
// a click: it turns the real channel over (M_x → −M_x) in microseconds.
void NmrEngine::arm(int only) {
  if (only < 0) { if (allAt < 0) allAt = clock + BLANK_T; return; }
  for (Voice &v : voices)
    if (v.on && !v.fading && v.key == only && v.keyAt < 0) v.keyAt = clock + BLANK_T;
}

// A π pulse about y on every sample still sounding: each one's coherences are carried across
// (ρ' = R ρ Rᵀ, order +1 to −1), the phases its spins gathered from the field are negated, and its
// magnetisation along the field turned upside down.
void NmrEngine::pulse(int only) {
  pulses++;
  pulsedAt = clock;
  Message m;
  m.type = kPulse; m.count = 0;
  for (Voice &v : voices) {
    if (!v.on || v.fading || !v.receiving || !sys[v.key] || (only >= 0 && v.key != only)) continue;
    const KeySystem &k = *sys[v.key];
    const double dt = v.age - v.t0;
    for (int e = 0; e < k.elems; e++) scratch[e] = v.x[e] * std::polar(1.0, k.elem[e].w * dt);
    piPulse(k, scratch.data(), v.x.data());
    v.t0 = v.age;
    v.S = -v.S; v.phi = -v.phi;
    v.gate = 0; // the probe rings down; the receiver opens again over GATE_T
    lines(v);
    mz[v.key] = -recovered(v.key); mzT[v.key] = clock;
    if (m.count < 30) { m.values[m.count++] = (float)v.key; m.values[m.count++] = (float)mz[v.key]; }
  }
  post(m);
}

void NmrEngine::play(Voice &v, float *L, float *R, int n) {
  const KeySystem &k = *sys[v.key];
  const double dt = n / fs;
  // the field's spread now (the mod wheel or the note's own slide), and its offset (the pitch wheel)
  const double shim = expr.slideOr(v.key, P[p::shim]);
  const double dS = TAU * shim * 1e-9 * k.f0 * dt;
  v.bendNow = glideTo(v.bendNow, wheel * expr.bendOf(v.key), dt, BEND_T);
  const double dw = TAU * k.fAnchor * (v.bendNow - 1);
  const Sample &smp = sample(sysSample[v.key]);
  const double t2 = t2of(P.data()), Dk = smp.D / (COIL_M * COIL_M);
  const int profile = (int)P[p::profile];
  auto envelope = [&](double age, double S, double D) { return v.amp * std::exp(-age / t2 - Dk * D) * dephasing(profile, S); };
  const double S0 = v.S, S1 = S0 + dS;
  const double D1 = v.D + (S0 * S0 + S0 * S1 + S1 * S1) / 3 * dt; // ∫S² dt, S linear over the step
  const double e0 = envelope(v.age, S0, v.D), e1 = envelope(v.age + dt, S1, D1);
  const double bound = std::fabs(v.amp) * std::exp(-(v.age + dt) / t2 - Dk * D1); // what an echo could bring back
  // the receiver: opening, closing, or fading for a newer pulse
  const double closeStep = v.fading ? std::exp(-1 / (fs * FADE_T)) : !v.receiving ? std::exp(-1 / (fs * (v.closeT ? v.closeT : REL_T))) : 1;
  const double gateStep = 1 / (fs * GATE_T);
  // a π pulse armed for this sample: its receiver closes, to be shut when the pulse fires
  const bool blank = (allAt >= 0 || v.keyAt >= 0) && v.receiving && !v.fading;
  const double blankStep = 1 / (fs * BLANK_T);
  const double noise = P[p::noise] <= -100 ? 0 : std::pow(10.0, P[p::noise] / 20) * OUT;
  const bool quad = (int)P[p::channels] == channels_::quadrature;
  // the noise's band: the receiver's filter, a little above the highest line
  double top = 0;
  for (int l = 0; l < v.nl; l++) top = std::max(top, std::fabs(v.w[l]));
  const double g = 1 - std::exp(-TAU * std::min(0.45 * fs, std::max(200.0, 1.25 * top / TAU)) / fs);
  const double ngain = noise / std::sqrt(g / (2 - g));
  // each line's phasor at the step's start, and the offset's phase
  const double since = v.age - v.t0;
  std::array<std::complex<double>, MAX_LINES> z;
  for (int l = 0; l < v.nl; l++) z[l] = v.a[l] * std::polar(1.0, v.w[l] * since);
  std::complex<double> c = std::polar(1.0, v.phi);
  const std::complex<double> cr = std::polar(1.0, dw / fs);
  const bool silent = std::max(std::fabs(e0), std::fabs(e1)) < 1e-7;
  double gate = v.gate, rel = v.rel;
  for (int i = 0; i < n; i++) {
    std::complex<double> s = 0;
    if (!silent) {
      for (int l = 0; l < v.nl; l++) { s += z[l]; z[l] *= v.r[l]; }
      s *= c * (e0 + (e1 - e0) * i / n);
    }
    c *= cr;
    if (blank) gate = std::max(0.0, gate - blankStep);
    else if (gate < 1) gate = std::min(1.0, gate + gateStep);
    rel *= closeStep;
    const double open = (0.5 - 0.5 * std::cos(std::numbers::pi * gate)) * rel;
    double yl = s.real(), yr = quad ? s.imag() : s.real();
    if (noise > 0) {
      auto gauss = [&]() { // four uniforms: roughly normal, unit variance
        double u = 0;
        for (int j = 0; j < 4; j++) { seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5; u += seed * (1.0 / 4294967296.0); }
        return (u - 2) * std::sqrt(3.0);
      };
      v.nyL += g * (ngain * gauss() - v.nyL);
      v.nyR = quad ? v.nyR + g * (ngain * gauss() - v.nyR) : v.nyL;
      yl += v.nyL; yr += v.nyR;
    }
    L[i] = (float)(L[i] + open * yl);
    R[i] = (float)(R[i] + open * yr);
  }
  v.gate = gate; v.rel = rel;
  v.age += dt; v.S = S1; v.D = D1; v.phi += dw * dt;
  v.peak = bound;
  // over: the receiver closed, or nothing left that an echo could bring back (while a held key's
  // receiver still hears its noise, it stays)
  if (rel < SILENT || (bound < SILENT * OUT && !(v.held && v.receiving && noise > 0))) {
    if (!v.fading) {
      Message m;
      m.type = kEnd; m.key = (int16_t)v.key; m.count = 1;
      m.values[0] = (float)v.age;
      post(m);
    }
    v.on = false;
  }
}

void NmrEngine::frame() {
  Message m;
  m.type = kFrame; m.count = 0;
  int k = 0;
  const double t2 = t2of(P.data());
  const int profile = (int)P[p::profile];
  for (const Voice &v : voices) {
    if (!v.on || v.fading || !v.receiving) continue;
    const double Dk = sample(sysSample[v.key]).D / (COIL_M * COIL_M);
    const double bound = v.amp / OUT * std::exp(-v.age / t2 - Dk * v.D);
    const double vals[6] = {(double)v.key, v.S, bound, bound * dephasing(profile, v.S), v.age, recovered(v.key)};
    for (int i = 0; i < 6; i++) m.values[6 * k + i] = (float)vals[i];
    if (++k == FRAME_VOICES) { m.count = 6 * k; post(m); k = 0; }
  }
  if (k > 0 || m.count == 0) { m.count = 6 * k; post(m); }
}

void NmrEngine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasParams) return;
  for (int i0 = 0; i0 < n; i0 += CB) {
    const int m = std::min(CB, n - i0);
    // the π pulses armed BLANK_T ago fire, the receivers shut by now
    constexpr double EPS = 1e-9;
    if (allAt >= 0 && clock >= allAt - EPS) { allAt = -1; pulse(); }
    for (Voice &v : voices)
      if (v.keyAt >= 0 && clock >= v.keyAt - EPS) { v.keyAt = -1; if (v.on && !v.fading) pulse(v.key); }
    if (pending) { pending = false; arm(); }
    else if (pedal && P[p::train] > 0.5) {
      if (toPulse <= 0) { arm(); toPulse += P[p::spacing]; if (toPulse <= 0) toPulse = P[p::spacing]; }
    }
    // Press: a firm press into a held key runs its own echo train, a π pulse on its sample at once
    // and then every echo time, up to four times as often the harder it is pressed
    for (Voice &v : voices) {
      if (!v.on || v.fading || !v.held || !v.receiving) continue;
      const double x = press.of(v.key);
      if (x <= 0) { v.echo = 0; continue; }
      if (v.echo <= 0) { arm(v.key); v.echo += P[p::spacing] / (1 + 3 * x); if (v.echo <= 0) v.echo = P[p::spacing]; }
      v.echo -= m / fs;
    }
    wheel = glideTo(wheel, wheelTarget, m / fs, BEND_T);
    for (Voice &v : voices) if (v.on) play(v, L + i0, R + i0, m);
    if (pedal) toPulse -= m / fs;
    clock += m / fs;
  }
  toFrame -= n / fs;
  if (toFrame <= 0 && messages) { frame(); toFrame += FRAME_T; if (toFrame <= 0) toFrame = FRAME_T; }
}

} // namespace forte::nmr
