// mpe-tests.cpp — MPE (forte/mpe.h) against shared/mpe.js (js-vectors.h): a stream decoded message
// for message, with what it hands each note, and a note's bend along the tunings.

#include <cmath>
#include <vector>

#include "check.h"
#include "forte/mpe.h"
#include "js-vectors.h"

using namespace forte;

namespace {
struct Recorder : MpeDecoder::Sink {
  std::vector<double> events;
  void noteBend(int key, double v) override { events.insert(events.end(), {0.0, (double)key, v}); }
  void noteSlide(int key, double v) override { events.insert(events.end(), {1.0, (double)key, v}); }
  void notePressure(int key, double v) override { events.insert(events.end(), {2.0, (double)key, v}); }
};
bool same(double a, double b) { return a == b || (a != a && b != b); }
} // namespace

TEST("mpe: a stream decodes as shared/mpe.js decodes it, to the last bit") {
  MpeDecoder mpe;
  Recorder r;
  const int steps = (int)(sizeof js::kMpeOwn / sizeof js::kMpeOwn[0]);
  int wrong = 0;
  for (int i = 0; i < steps; i++) {
    const int *m = js::kMpeIn + 3 * i;
    r.events.clear();
    bool own = false;
    if (m[0] == 0) mpe.setMode(m[1]);
    else { const uint8_t d[3] = {(uint8_t)m[0], (uint8_t)m[1], (uint8_t)m[2]}; own = mpe.midi(d, r); }
    const int a = js::kMpeEventAt[i], b = js::kMpeEventAt[i + 1];
    bool ok = own == (js::kMpeOwn[i] != 0) && (int)r.events.size() == 3 * (b - a);
    for (int k = 0; ok && k < 3 * (b - a); k++) ok = same(r.events[k], js::kMpeEvents[3 * a + k]);
    if (!ok && wrong++ < 5) std::printf("       step %d (%02x %d %d) differs\n", i, m[0], m[1], m[2]);
  }
  CHECK(wrong == 0);
}

TEST("mpe: a note's bend along the tuning is shared/mpe.js bendRatio's; 2^(s/12) in equal temperament") {
  const int nk = (int)(sizeof js::kBendKey / sizeof js::kBendKey[0]), ns = (int)(sizeof js::kBendSemitones / sizeof js::kBendSemitones[0]);
  const int nt = (int)(sizeof js::kBendTunings / sizeof js::kBendTunings[0]) / (3 + kCustomCents);
  double worst = 0;
  for (int t = 0; t < nt; t++) {
    const double *q = js::kBendTunings + t * (3 + kCustomCents);
    double custom[kCustomCents];
    for (int k = 0; k < kCustomCents; k++) custom[k] = q[3 + k];
    const Tuning T = makeTuning(q[0], q[1], q[2], custom);
    for (int k = 0; k < nk; k++) for (int s = 0; s < ns; s++) {
      const double got = bendRatio(T, js::kBendKey[k], js::kBendSemitones[s]), want = js::kBendRatio[(t * nk + k) * ns + s];
      worst = std::max(worst, std::fabs(got / want - 1));
      if (t == 0) CHECK(got == std::pow(2.0, std::clamp(js::kBendSemitones[s], -mpe::kMaxBend, mpe::kMaxBend) / 12));
    }
  }
  std::printf("       worst relative difference %.1e\n", worst);
  CHECK(worst < 1e-12);
}

TEST("mpe: a slide to the next key lands on its tuned pitch, in any temperament") {
  double custom[kCustomCents] = {};
  const Tuning T = makeTuning(0, 1, 0, custom); // ¼-comma meantone on C
  for (int key = 48; key < 72; key++) for (int s : {-7, -1, 1, 2, 12}) {
    const double f0 = std::pow(2.0, (key - 69) / 12.0) * T.ratio(key), f1 = std::pow(2.0, (key + s - 69) / 12.0) * T.ratio(key + s);
    CHECK(std::fabs(f0 * bendRatio(T, key, s) / f1 - 1) < 1e-12);
  }
}
