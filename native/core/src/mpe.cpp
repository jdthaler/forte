// mpe.cpp — MPE (forte/mpe.h), message for message as shared/mpe.js decodes it.

#include "forte/mpe.h"

#include <cmath>

#include "forte/fdlibm.h"

namespace forte {

void MpeDecoder::setMode(int m) {
  if (m < 0 || m >= mpe::kModes) m = mpe::autoDetect;
  if (m == mode_) return;
  mode_ = m;
  for (Channel &c : ch_) c = Channel{c.key, 0, NAN};
}

void MpeDecoder::reset() {
  zone_[0] = zone_[1] = -1;
  range_[0] = range_[1] = mpe::kMemberBend;
  for (Channel &c : ch_) c = Channel{-1, 0, NAN};
}

int MpeDecoder::members(int zone) const {
  if (mode_ == mpe::off) return 0;
  if (zone_[zone] >= 0) return zone_[zone];
  if (mode_ == mpe::on && zone == 0 && zone_[1] < 0) return 15; // no configuration message yet
  return 0;
}

int MpeDecoder::zoneOf(int c) const {
  if (c >= 1 && c <= members(0)) return 0;
  if (c <= 14 && c >= 15 - members(1)) return 1;
  return -1;
}
bool MpeDecoder::isMember(int c) const { return zoneOf(c) >= 0; }

// A zone of `count` members: the other zone gives up channels it would share, and the zone's
// members bend ±48 again.
void MpeDecoder::configure(int zone, int count) {
  count = count < 0 ? 0 : count > 15 ? 15 : count;
  zone_[zone] = count;
  if (zone_[1 - zone] < 0) zone_[1 - zone] = 0;
  if (zone_[1 - zone] > 14 - count) zone_[1 - zone] = 14 - count < 0 ? 0 : 14 - count;
  range_[zone] = mpe::kMemberBend;
}

bool MpeDecoder::midi(const uint8_t *d, Sink &sink) {
  if (mode_ == mpe::off) return false;
  const int cmd = d[0] & 0xf0, c = d[0] & 0x0f;
  Channel &C = ch_[c];
  const int zone = zoneOf(c);
  if (cmd == 0xb0) {
    // RPNs: 101 and 100 choose one, 6 (and 38) set it; 6 on a master for RPN 6 configures its zone
    if (d[1] == 101) { C.rpnMsb = d[2]; C.dataMsb = -1; return false; }
    if (d[1] == 100) { C.rpnLsb = d[2]; C.dataMsb = -1; return false; }
    if ((d[1] == 6 || d[1] == 38) && C.rpnMsb == 0) {
      if (d[1] == 6) C.dataMsb = d[2];
      if (C.rpnLsb == 6 && d[1] == 6 && (c == 0 || c == 15)) configure(c == 0 ? 0 : 1, d[2]);
      else if (C.rpnLsb == 0 && zone >= 0 && C.dataMsb >= 0) // a member's bend range: semitones, then cents
        range_[zone] = C.dataMsb + (d[1] == 38 ? d[2] / 100.0 : 0);
      return false;
    }
    if (d[1] == 74 && zone >= 0) {
      C.slide = d[2] / 127.0;
      if (C.key >= 0) sink.noteSlide(C.key, C.slide);
      return true;
    }
    return false;
  }
  if (zone < 0) return false;
  if (cmd == 0x90 && d[2] > 0) {
    C.key = d[1];
    sink.noteBend(C.key, C.bend * range_[zone]);
    sink.noteSlide(C.key, C.slide);
    return false;
  }
  if (cmd == 0xe0) {
    C.bend = ((d[2] << 7) + d[1] - 8192) / 8191.0;
    if (C.bend < -1) C.bend = -1;
    if (C.key >= 0) sink.noteBend(C.key, C.bend * range_[zone]);
    return true;
  }
  if (cmd == 0xd0) {
    if (C.key >= 0) sink.notePressure(C.key, d[1] / 127.0);
    return true;
  }
  return false;
}

double bendRatio(const Tuning &t, int key, double semitones) {
  if (!(semitones == semitones)) semitones = 0;
  if (semitones > mpe::kMaxBend) semitones = mpe::kMaxBend;
  if (semitones < -mpe::kMaxBend) semitones = -mpe::kMaxBend;
  const double r = fdlibm::pow(2.0, semitones / 12);
  return t.equal ? r : r * t.ratio(key + semitones) / t.ratio(key);
}

} // namespace forte
