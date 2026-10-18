// chain.cpp — the plugins' output chain (chain.h), as shared/chain.js builds it on the pages.

#include "forte/chain.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstring>

#include "forte/impulses.h"

namespace forte {

OutputChain::~OutputChain() { stop(); }

void OutputChain::stop() {
#if FORTE_CHAIN_THREADS
  if (worker.joinable()) {
    { std::lock_guard<std::mutex> l(m); quit = true; }
    cv.notify_one();
    worker.join();
  }
  quit = false;
#endif
  for (auto &r : rooms) delete r.exchange(nullptr);
  playing = chosen = -1;
  wanted.store(-1);
}

// The venue's room at this rate, scaled as Web Audio's ConvolverNode scales it
OutputChain::Room *OutputChain::build(int venue) const {
  std::vector<float> ir[2];
  venueIR(fs, venue, c.roomSeconds, ir);
  const double g = webAudioScale(ir, fs) * venueGain(venue, ir[0].size(), fs);
  Room *r = new Room;
  r->L.setIR(ir[0].data(), ir[0].size(), g);
  r->R.setIR(ir[1].data(), ir[1].size(), g);
  r->length = ir[0].size();
  return r;
}

void OutputChain::configure(const Chain &chain, double sampleRate, const double *P) {
  stop();
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
    const int v = c.venue >= 0 && P ? std::clamp((int)P[c.venue], 0, kVenueCount - 1) : kDefaultVenue;
    rooms[v].store(build(v));
    playing = chosen = v;
#if FORTE_CHAIN_THREADS
    if (c.venue >= 0) worker = std::thread([this] {
      std::unique_lock<std::mutex> l(m);
      while (!quit) {
        const int w = wanted.load(std::memory_order_acquire);
        if (w >= 0 && !rooms[w].load(std::memory_order_acquire)) {
          l.unlock();
          Room *r = build(w);
          l.lock();
          rooms[w].store(r, std::memory_order_release);
        }
        cv.wait_for(l, std::chrono::milliseconds(10), [&] { return quit; }); // the audio thread never signals
      }
    });
#endif
  }
  limiter.set(c.limiterThreshold, c.limiterKnee, c.limiterRatio, c.limiterAttack, c.limiterRelease, fs);
  for (auto *v : {&tmpL, &tmpR, &wetL, &wetR, &zeros}) v->assign(kBlock, 0.0f);
  first = true;
  reset();
}

void OutputChain::setParams(const double *P) {
  const double trim = std::pow(10.0, c.trimDb / 20);
  master.target = c.volume >= 0 ? P[c.volume] * trim : 1;
  if (c.room >= 0) room.target = c.roomGain * P[c.room];
  if (c.room >= 0 && c.venue >= 0) {
    chosen = std::clamp((int)P[c.venue], 0, kVenueCount - 1);
#if FORTE_CHAIN_THREADS
    if (!rooms[chosen].load(std::memory_order_acquire)) wanted.store(chosen, std::memory_order_release);
#else
    if (!rooms[chosen].load()) rooms[chosen].store(build(chosen));
#endif
  }
  if (c.tone >= 0) tone.target = P[c.tone];
  if (c.body >= 0) { const double x = P[c.body]; dry.target = 1 - c.bodyDry * x; body.target = c.bodyWet * x; }
  if (first) { for (Ramp *r : {&tone, &dry, &body, &room, &master}) r->value = r->target; first = false; }
}

void OutputChain::reset() {
  toneL.reset(); toneR.reset();
  bodyL.reset(); bodyR.reset();
  for (auto &a : rooms) if (Room *r = a.load(std::memory_order_acquire)) { r->L.reset(); r->R.reset(); r->ringing = 0; }
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
    // the chosen room hears the bus once it is built; the one it replaces rings out
    if (chosen != playing && chosen >= 0) {
      if (Room *r = rooms[chosen].load(std::memory_order_acquire)) {
        if (playing >= 0) { Room *was = rooms[playing].load(std::memory_order_relaxed); was->ringing = was->length; }
        r->ringing = 0;
        playing = chosen;
      }
    }
    std::fill(wetL.begin(), wetL.begin() + n, 0.0f);
    std::fill(wetR.begin(), wetR.begin() + n, 0.0f);
    for (int k = 0; k < kVenueCount; k++) {
      Room *r = rooms[k].load(std::memory_order_acquire);
      if (!r) continue;
      if (k == playing) { r->L.process(L, wetL.data(), n); r->R.process(R, wetR.data(), n); }
      else if (r->ringing > 0) {
        r->L.process(zeros.data(), wetL.data(), n); r->R.process(zeros.data(), wetR.data(), n);
        r->ringing = r->ringing > (size_t)n ? r->ringing - n : 0;
      }
    }
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
