// impulses.h — the synthetic impulse responses of shared/impulses.js: a soundboard (a plate's
// modes, randomly placed and phased, shaped by a radiation curve) and a room. Both come from
// the same seeded Mulberry32 generator, so the C++ draws the same random numbers and builds the
// same responses as the page (each sample rounded to float32 as a Web Audio buffer holds it).
#pragma once

#include <cstdint>
#include <vector>

namespace forte {

// Mulberry32, as in shared/impulses.js: uniform in [0, 1).
class Mulberry32 {
 public:
  explicit Mulberry32(uint32_t seed) : a(seed) {}
  double operator()() {
    a += 0x6d2b79f5u;
    uint32_t t = a;
    t = (t ^ (t >> 15)) * (t | 1u);
    t ^= t + (t ^ (t >> 7)) * (t | 61u);
    return (t ^ (t >> 14)) / 4294967296.0;
  }
 private:
  uint32_t a;
};

using StereoIR = std::vector<float>[2];

void soundboardIR(double fs, double seconds, std::vector<float> (&out)[2]); // default 0.4 s on the pages
void roomIR(double fs, double seconds, std::vector<float> (&out)[2]);       // the shell uses 2.0 s

// The scale a Web Audio ConvolverNode gives an impulse response (normalize = true): 0.00125 / its
// RMS over all channels × 44100 / fs (tools/audio-util.mjs, webAudioIR).
double webAudioScale(const std::vector<float> (&ir)[2], double fs);

} // namespace forte
