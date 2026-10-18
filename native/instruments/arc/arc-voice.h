// arc-voice.h — the "microphone" of Simon's talking arc: a singer synthesised in place of an
// audio input, a glottal source (the Rosenberg pulse's flow derivative) through a cascade of
// three formant resonators, gliding round the vowels a–e–i–o–u.
#pragma once

#include <array>
#include <cstdint>

namespace forte::arc {

struct Vowel { char name; double F[3]; };
// Typical formants of an adult male voice (Hz): F1, F2, F3.
inline constexpr std::array<Vowel, 5> VOWELS = {{
  {'a', {730, 1090, 2440}},
  {'e', {530, 1840, 2480}},
  {'i', {270, 2290, 3010}},
  {'o', {570, 840, 2410}},
  {'u', {300, 870, 2240}},
}};

class Singer {
 public:
  Singer(double fs, int32_t seed = 7);
  void setFormants(const double F[3]);
  void formantsAt(double t, double out[3]) const; // hold each vowel, then glide (cosine) to the next
  int vowel() const;                               // the index of the vowel now
  static double source(double p);                  // glottal flow derivative (unit peak flow) at phase p
  double next();

  double f0 = 130.81, f0t = 130.81, env = 0;
  bool on = false;

 private:
  double fs, ph = 0, t = 0, vib = 0;
  uint32_t seed;
  double y1[3] = {}, y2[3] = {}, c1[3] = {}, c2[3] = {}, g[3] = {};
  double prev = 0, kAtt, kRel, kGl;
};

} // namespace forte::arc
