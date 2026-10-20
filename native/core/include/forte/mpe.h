// mpe.h — MPE (MIDI Polyphonic Expression, MMA/AMEI 2018), as shared/mpe.js has it: a controller
// that gives each note a channel of its own, so that channel's pitch bend, pressure and CC74
// (slide) are that note's alone.
//
// Zones: the lower zone's master is channel 1 and its members 2, 3, …; the upper zone's master is
// channel 16 and its members 15, 14, …. The MPE Configuration Message (RPN 6 on a master: how many
// member channels, 0 for none) sets a zone up and resets its members' bend to ±48 semitones; RPN 0
// on a member changes that for the zone. What a master sends (its bend, pressure, controllers) is
// every note's, as plain MIDI is: the instrument's wheel bends by kBendSemitones.
//
// The mode: auto (the default) plays plain MIDI until a controller sends the configuration
// message, so an ordinary keyboard plays as ever; on plays as if the lower zone had 15 members
// until one says otherwise; off never decodes MPE.
#pragma once

#include <cstdint>

#include "forte/tuning.h"

namespace forte {

namespace mpe {
enum Mode : int { autoDetect = 0, on = 1, off = 2 };
inline constexpr int kModes = 3;
inline const char *const kModeNames[] = {"Auto", "On", "Off"};
inline constexpr double kMemberBend = 48; // semitones: a member's bend, until RPN 0 says otherwise
inline constexpr double kMaxBend = 96;    // semitones: no note bends further
} // namespace mpe

class MpeDecoder {
 public:
  // What a note's own channel sends, for that note (its key).
  struct Sink {
    virtual void noteBend(int key, double semitones) = 0;
    virtual void noteSlide(int key, double value) = 0;    // CC74 / 127; NaN: none yet
    virtual void notePressure(int key, double value) = 0; // channel pressure / 127
    virtual ~Sink() = default;
  };

  MpeDecoder() { reset(); }
  void setMode(int m);
  int mode() const { return mode_; }
  // Reads one MIDI message (status, data 1, data 2). True when it was MPE's own (a member channel's
  // pitch bend, channel pressure or CC74, handed to the sink as its note's): the host does nothing
  // more with it. A member's note-on first hands the sink the key's bend and slide, then returns
  // false: the host plays the note as ever.
  bool midi(const uint8_t *d, Sink &sink);
  bool active() const { return members(0) > 0 || members(1) > 0; } // channels are notes' own now
  int members(int zone) const;      // 0: the lower zone, 1: the upper
  bool isMember(int channel) const; // 0-based
  double memberBend(int zone) const { return range_[zone]; }
  void reset();                     // forget every configuration message and channel
  // take another decoder's zones and member bend ranges (not its notes): the Forte app's next
  // instrument hears the controller as the last one did
  void adoptZones(const MpeDecoder &o) {
    for (int z = 0; z < 2; z++) { zone_[z] = o.zone_[z]; range_[z] = o.range_[z]; }
  }

 private:
  struct Channel {
    int key = -1;      // the note it last played
    double bend = 0;   // −1 … 1
    double slide = 0;  // 0 … 1, NaN: none yet
    int rpnMsb = 127, rpnLsb = 127; // the RPN data entry goes to (127: none)
    int dataMsb = -1;
  };
  int zoneOf(int channel) const;    // the zone a member channel is in, else −1
  void configure(int zone, int count);
  int mode_ = mpe::autoDetect;
  int zone_[2] = {-1, -1};          // members per zone, from a configuration message (−1: none came)
  double range_[2] = {mpe::kMemberBend, mpe::kMemberBend};
  Channel ch_[16];
};

// A note's pitch bend as a frequency ratio: `semitones` along the keyboard's tuning from `key`
// (between keys the cents in between, as a glide), so a slide to the next key lands on its tuned
// pitch; 2^(semitones/12) in equal temperament.
double bendRatio(const Tuning &t, int key, double semitones);

} // namespace forte
