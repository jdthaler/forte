// mpe.js — MPE (MIDI Polyphonic Expression, MMA/AMEI 2018) for every page, as the plugins have it
// (native/core forte/mpe.h, message for message): a controller that gives each note a channel of
// its own, so that channel's pitch bend, pressure and CC74 (slide) are that note's alone.
//
// Zones: the lower zone's master is channel 1 and its members 2, 3, …; the upper zone's master is
// channel 16 and its members 15, 14, …. The MPE Configuration Message (RPN 6 on a master: how many
// member channels, 0 for none) sets a zone up and resets its members' bend to ±48 semitones; RPN 0
// on a member changes that for the zone. What a master sends (its bend, pressure, controllers) is
// every note's, as plain MIDI is: the instrument's wheel bends by ±2 semitones.
//
// The mode: auto (the default) plays plain MIDI until a controller sends the configuration
// message, so an ordinary keyboard plays as ever; on plays as if the lower zone had 15 members
// until one says otherwise; off never decodes MPE.
//
//   const mpe = createMpe({ noteBend(key, semitones), noteSlide(key, value), notePressure(key, value) });
//   mpe.midi(data)   true when the message was MPE's own (the page does nothing more with it); a
//                    member's note-on first hands over the key's bend and slide, then returns false
//   mpe.mode = 'auto' | 'on' | 'off';   mpe.active();   mpe.members(0 | 1);   mpe.reset()
//   bendRatio(P, key, semitones)  a note's bend as a frequency ratio along the keyboard's tuning

import { tuningCents } from './tuning.js';

export const MODES = [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']];
export const MEMBER_BEND = 48; // semitones: a member's bend, until RPN 0 says otherwise
export const MAX_BEND = 96;    // semitones: no note bends further

const channel = (key = -1) => ({ key, bend: 0, slide: NaN, rpnMsb: 127, rpnLsb: 127, dataMsb: -1 });

export function createMpe(sink) {
  let mode = 'auto';
  let zones = [-1, -1];          // members per zone, from a configuration message (−1: none came)
  let range = [MEMBER_BEND, MEMBER_BEND];
  let ch = Array.from({ length: 16 }, () => channel());

  const members = (z) => {
    if (mode === 'off') return 0;
    if (zones[z] >= 0) return zones[z];
    return mode === 'on' && z === 0 && zones[1] < 0 ? 15 : 0; // no configuration message yet
  };
  const zoneOf = (c) => (c >= 1 && c <= members(0) ? 0 : c <= 14 && c >= 15 - members(1) ? 1 : -1);
  // a zone of `count` members: the other gives up channels it would share; its members bend ±48 again
  const configure = (z, count) => {
    count = Math.max(0, Math.min(15, count));
    zones[z] = count;
    if (zones[1 - z] < 0) zones[1 - z] = 0;
    if (zones[1 - z] > 14 - count) zones[1 - z] = Math.max(0, 14 - count);
    range[z] = MEMBER_BEND;
  };

  const mpe = {
    get mode() { return mode; },
    set mode(m) {
      m = MODES.some(([id]) => id === m) ? m : 'auto';
      if (m === mode) return;
      mode = m;
      ch = ch.map((c) => channel(c.key));
    },
    members,
    active: () => members(0) > 0 || members(1) > 0,
    isMember: (c) => zoneOf(c) >= 0,
    memberBend: (z) => range[z],
    reset() { zones = [-1, -1]; range = [MEMBER_BEND, MEMBER_BEND]; ch = ch.map(() => channel()); },
    midi(data) {
      if (mode === 'off') return false;
      const [st, d1, d2] = data, cmd = st & 0xf0, c = st & 0x0f, C = ch[c], zone = zoneOf(c);
      if (cmd === 0xb0) {
        // RPNs: 101 and 100 choose one, 6 (and 38) set it; 6 on a master for RPN 6 configures its zone
        if (d1 === 101) { C.rpnMsb = d2; C.dataMsb = -1; return false; }
        if (d1 === 100) { C.rpnLsb = d2; C.dataMsb = -1; return false; }
        if ((d1 === 6 || d1 === 38) && C.rpnMsb === 0) {
          if (d1 === 6) C.dataMsb = d2;
          if (C.rpnLsb === 6 && d1 === 6 && (c === 0 || c === 15)) configure(c === 0 ? 0 : 1, d2);
          else if (C.rpnLsb === 0 && zone >= 0 && C.dataMsb >= 0) range[zone] = C.dataMsb + (d1 === 38 ? d2 / 100 : 0); // semitones, then cents
          return false;
        }
        if (d1 === 74 && zone >= 0) {
          C.slide = d2 / 127;
          if (C.key >= 0) sink.noteSlide(C.key, C.slide);
          return true;
        }
        return false;
      }
      if (zone < 0) return false;
      if (cmd === 0x90 && d2 > 0) {
        C.key = d1;
        sink.noteBend(C.key, C.bend * range[zone]);
        sink.noteSlide(C.key, C.slide);
        return false;
      }
      if (cmd === 0xe0) {
        C.bend = Math.max(-1, ((d2 << 7) + d1 - 8192) / 8191);
        if (C.key >= 0) sink.noteBend(C.key, C.bend * range[zone]);
        return true;
      }
      if (cmd === 0xd0) {
        if (C.key >= 0) sink.notePressure(C.key, d1 / 127);
        return true;
      }
      return false;
    },
  };
  return mpe;
}

// A note's pitch bend as a frequency ratio: `semitones` along the keyboard's tuning (the page's P)
// from `key` (between keys the cents in between, as a glide), so a slide to the next key lands on
// its tuned pitch; 2^(semitones/12) in equal temperament. As forte/mpe.h bendRatio.
export function bendRatio(P, key, semitones) {
  const s = Number.isFinite(semitones) ? Math.max(-MAX_BEND, Math.min(MAX_BEND, semitones)) : 0;
  const r = 2 ** (s / 12), c = tuningCents(P);
  if (c.every((x) => x === 0)) return r;
  const at = (k) => 2 ** (c[((k % 12) + 12) % 12] / 1200);
  const m = key + s, k = Math.floor(m), t = m - k;
  return (r * (t === 0 ? at(k) : at(k) ** (1 - t) * at(k + 1) ** t)) / at(key);
}
