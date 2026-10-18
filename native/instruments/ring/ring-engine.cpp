// ring-engine.cpp — the storage ring's engine.

#include "ring-engine.h"

#include <cmath>

#include "forte/dsp.h"

namespace forte::ring {

constexpr double OUT = 0.03;
constexpr double AHEAD = 2;         // turns: a pulse is queued this long before it arrives
constexpr double REACH = 6;         // a pulse is computed out to ±6 of its σ
constexpr double PRESS_TIME = 0.02; // s: a key's pressure is followed with this time constant

void StorageRingEngine::Voice::inject(double velocity, const double *P) {
  charge = velocity; Z = P[p::kick];
  theta = 0; phiS = 0; phiB = 0; logX = 0; logS = 0;
  released = false; scraped = false;
}

// Queue the next turn's pulse, then go one turn on.
void StorageRingEngine::Voice::schedule(const double *P, double fs) {
  const Ring r = ringOf(key, P, press);
  T = fs / r.frev;
  const Detuning d = detuning(theta, Z);
  const double x = Z * d.amp * chromatic(r.D, phiS) * std::exp(logX) * std::cos(phiB + d.phase);
  const double offset = P[p::phase] * r.sigma * std::exp(logS) * std::cos(phiS); // turns: early or late against the RF
  const double sig = std::hypot(r.sigma * T, PICKUP_SIGMA * fs);
  const int i = (head + count) % SLOTS;
  pt[i] = next + offset * T;
  pw[i] = (charge * T) / (std::sqrt(TAU) * sig); // a pulse of area charge·T: the train's mean is the charge
  pd[i] = P[p::size] * x;
  pk[i] = 1 / (2 * sig * sig);
  pr[i] = REACH * sig;
  if (count < SLOTS) count++; else head = (head + 1) % SLOTS;
  const double tau = scraped ? P[p::scrape] : P[p::lifetime];
  charge *= std::exp(-1 / (r.frev * tau));
  theta += 2 * TAU * r.mu;
  phiS += TAU * r.Qs;
  phiB += TAU * P[p::tune];
  logX -= 1 / (r.frev * P[p::damping]);
  logS -= 2 / (r.frev * P[p::damping]);
  press += (pressTarget - press) * (1 - std::exp(-1 / (r.frev * PRESS_TIME)));
  next += T;
}

StorageRingEngine::StorageRingEngine(double fs) : Engine(fs) { voices.reserve(kMaxVoices + 1); }

void StorageRingEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
}

void StorageRingEngine::setSustain(bool on) {
  sustain = on;
  if (!on) for (Voice &v : voices) if (v.released) v.scraped = true;
}

void StorageRingEngine::noteOn(int key, double velocity) {
  if (!hasParams) return;
  Voice *v = nullptr;
  for (Voice &x : voices) if (x.key == key) { v = &x; break; }
  if (!v) {
    Voice nv;
    nv.key = key;
    nv.T = fs / keyFreq(key);
    nv.next = 0.5 * nv.T; // the first arrival, half a turn in
    voices.push_back(nv);
    v = &voices.back();
  }
  v->inject(velocity, P.data());
  if ((int)voices.size() > kMaxVoices) voices.erase(voices.begin()); // the oldest goes
}

void StorageRingEngine::noteOff(int key, double) {
  for (Voice &v : voices) if (v.key == key && !v.released) { v.released = true; if (!sustain) v.scraped = true; }
}

void StorageRingEngine::pressure(double value, int key) {
  for (Voice &v : voices) if (key < 0 || key == v.key) v.pressTarget = value;
}

void StorageRingEngine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasParams) return;
  const int mode = (int)P[p::pickup]; // 0: two buttons, 1: one button, 2: their difference
  const double a = std::exp((-TAU * P[p::cutoff]) / fs);
  for (Voice &v : voices) {
    for (int i = 0; i < n; i++) {
      const double t = v.t;
      while (t >= v.next - AHEAD * v.T) v.schedule(P.data(), fs);
      while (v.count && t > v.pt[v.head] + v.pr[v.head]) { v.head = (v.head + 1) % SLOTS; v.count--; } // pulses gone by
      double s = 0, dsum = 0;
      for (int j = 0, k = v.head; j < v.count; j++, k = (k + 1) % SLOTS) {
        const double u = t - v.pt[k];
        if (u > -v.pr[k] && u < v.pr[k]) { const double g = v.pw[k] * std::exp(-u * u * v.pk[k]); s += g; dsum += g * v.pd[k]; }
      }
      const double xl = mode == 2 ? 2 * dsum : s + dsum, xr = mode == 0 ? s - dsum : xl;
      v.hl1 = a * (v.hl1 + xl - v.hl0); v.hl0 = xl;
      v.hr1 = a * (v.hr1 + xr - v.hr0); v.hr0 = xr;
      L[i] = (float)(L[i] + OUT * v.hl1); // a Float32Array's +=
      R[i] = (float)(R[i] + OUT * v.hr1);
      v.t = t + 1;
    }
  }
  std::erase_if(voices, [](const Voice &v) { return v.scraped && v.charge < 1e-4; }); // finished voices, in place
}

} // namespace forte::ring
