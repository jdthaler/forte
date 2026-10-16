// chain.cpp — the plugins' output chain (chain.h), as shared/chain.js builds it on the pages.

#include "forte/chain.h"

#include <algorithm>
#include <cmath>
#include <cstring>

#include "forte/impulses.h"

namespace forte {

void OutputChain::configure(const Chain &chain, double sampleRate) {
  c = chain;
  fs = sampleRate;
  coef = 1 - std::exp(-1 / (0.02 * fs));
  if (c.body >= 0) {
    std::vector<float> ir[2];
    soundboardIR(fs, c.bodySeconds, ir);
    const double g = webAudioScale(ir, fs);
    bodyL.setIR(ir[0].data(), ir[0].size(), g);
    bodyR.setIR(ir[1].data(), ir[1].size(), g);
  }
  if (c.room >= 0) {
    std::vector<float> ir[2];
    roomIR(fs, c.roomSeconds, ir);
    const double g = webAudioScale(ir, fs);
    roomL.setIR(ir[0].data(), ir[0].size(), g);
    roomR.setIR(ir[1].data(), ir[1].size(), g);
  }
  limiter.set(c.limiterThreshold, c.limiterKnee, c.limiterRatio, c.limiterAttack, c.limiterRelease, fs);
  for (auto *v : {&tmpL, &tmpR, &wetL, &wetR}) v->assign(kBlock, 0.0f);
  first = true;
  reset();
}

void OutputChain::setParams(const double *P) {
  const double trim = std::pow(10.0, c.trimDb / 20);
  master.target = c.volume >= 0 ? P[c.volume] * trim : 1;
  if (c.room >= 0) room.target = c.roomGain * P[c.room];
  if (c.tone >= 0) tone.target = P[c.tone];
  if (c.body >= 0) { const double x = P[c.body]; dry.target = 1 - c.bodyDry * x; body.target = c.bodyWet * x; }
  if (first) { for (Ramp *r : {&tone, &dry, &body, &room, &master}) r->value = r->target; first = false; }
}

void OutputChain::reset() {
  toneL.reset(); toneR.reset();
  bodyL.reset(); bodyR.reset(); roomL.reset(); roomR.reset();
  limiter.reset();
  toneAt = -1;
}

void OutputChain::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i += kBlock) run(L + i, R + i, std::min(kBlock, n - i));
}

void OutputChain::run(float *L, float *R, int n) {
  auto step = [&](Ramp &r) { r.value += (r.target - r.value) * coef; return r.value; };
  if (c.tone >= 0) {
    for (int i = 0; i < n; i++) {
      const double f = step(tone);
      if ((i & 15) == 0 && f != toneAt) { toneL.set(f, fs); toneR.set(f, fs); toneAt = f; }
      L[i] = (float)toneL.run(L[i]);
      R[i] = (float)toneR.run(R[i]);
    }
  }
  if (c.body >= 0) {
    std::fill(wetL.begin(), wetL.begin() + n, 0.0f);
    std::fill(wetR.begin(), wetR.begin() + n, 0.0f);
    bodyL.process(L, wetL.data(), n);
    bodyR.process(R, wetR.data(), n);
    for (int i = 0; i < n; i++) {
      const double d = step(dry), b = step(body);
      L[i] = (float)(d * L[i] + b * wetL[i]);
      R[i] = (float)(d * R[i] + b * wetR[i]);
    }
  }
  if (c.room >= 0) {
    std::fill(wetL.begin(), wetL.begin() + n, 0.0f);
    std::fill(wetR.begin(), wetR.begin() + n, 0.0f);
    roomL.process(L, wetL.data(), n);
    roomR.process(R, wetR.data(), n);
    for (int i = 0; i < n; i++) {
      const double g = step(room);
      L[i] = (float)(L[i] + g * wetL[i]);
      R[i] = (float)(R[i] + g * wetR[i]);
    }
  }
  for (int i = 0; i < n; i++) {
    const double g = step(master);
    L[i] = (float)(L[i] * g);
    R[i] = (float)(R[i] * g);
  }
  limiter.process(L, R, n);
}

} // namespace forte
