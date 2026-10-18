// impulses.h — the synthetic impulse responses of shared/impulses.js: a soundboard (a plate's
// modes, randomly placed and phased, shaped by a radiation curve) and a room. Both come from
// the same seeded Mulberry32 generator, so the C++ draws the same random numbers and builds the
// same responses as the page (each sample rounded to float32 as a Web Audio buffer holds it).
#pragma once

#include <cstddef>
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

// The venues (shared/impulses.js VENUES), in the order of the chain's venue choice: shoebox halls
// built from their physics (image sources, then a diffuse tail decaying in each octave band in
// Eyring's time), and 'room', roomIR, which has no size.
inline constexpr int kBandCount = 7;
inline constexpr double kBands[kBandCount] = {125, 250, 500, 1000, 2000, 4000, 8000};
struct Venue {
  const char *id, *name;
  double size[3];                  // width, length, height (m); all 0 for roomIR
  double alpha[kBandCount];        // the walls' mean absorption in each band
  double src[3], mic[3];           // the source, and the middle of the microphone pair (m)
};
inline constexpr Venue kVenues[] = {
  {"studio", "Studio", {6, 8, 3.2}, {0.2, 0.25, 0.3, 0.3, 0.32, 0.35, 0.35}, {2.6, 2.3, 1.2}, {3.1, 5.4, 1.7}},
  {"room", "Room", {0, 0, 0}, {}, {}, {}},
  {"recital", "Recital hall", {14, 22, 9}, {0.2, 0.2, 0.22, 0.22, 0.22, 0.24, 0.26}, {6.5, 4.5, 1.5}, {7.3, 12, 2.5}},
  {"hall", "Concert hall", {19, 49, 18}, {0.22, 0.24, 0.27, 0.28, 0.28, 0.29, 0.3}, {9, 7, 2}, {9.8, 26, 3}},
  {"cathedral", "Cathedral", {30, 90, 28}, {0.16, 0.16, 0.155, 0.155, 0.15, 0.15, 0.15}, {14, 20, 1.6}, {15.2, 50, 2.5}},
};
inline constexpr int kVenueCount = (int)(sizeof kVenues / sizeof kVenues[0]);
inline constexpr int kDefaultVenue = 1; // 'room'

void reverbTimes(const Venue &v, double (&T)[kBandCount]); // each band's (s)
double venueSeconds(const Venue &v);                          // the response's length (s)
// The venue's response; 'room' (or an index out of range) is roomIR roomSeconds long.
void venueIR(double fs, int venue, double roomSeconds, std::vector<float> (&out)[2]);
// The gain that gives it the default room's energy once Web Audio's normalisation has scaled it.
double venueGain(int venue, size_t length, double fs);

// The scale a Web Audio ConvolverNode gives an impulse response (normalize = true): 0.00125 / its
// RMS over all channels × 44100 / fs (tools/audio-util.mjs, webAudioIR).
double webAudioScale(const std::vector<float> (&ir)[2], double fs);

} // namespace forte
