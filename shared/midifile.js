// midifile.js — Standard MIDI Files (.mid), read and written, for the songs every page plays
// (shared/songs.js) and the tool that writes Forte's own (tools/make-songs.mjs). No browser needed:
// test/songs-tests.mjs runs it in Node.
//
//   const song = parseMIDI(bytes)   bytes: a Uint8Array or ArrayBuffer of a .mid (format 0, 1 or 2,
//                                   or the same in a RIFF .rmi). Throws an Error saying what's wrong.
//     song.events    [{ t, data }] in time order: t in seconds (the tempo map applied), data a
//                    channel message ([status, d1, d2] or [status, d1]); meta events and SysEx left out
//     song.duration  seconds to the last event (the end of the longest track)
//     song.name      the first track's name, if it has one
//   playable(song.events, { controllers })   what a page plays (below)
//   fit(events, lo, hi)   the whole octaves to move a song by so most of its notes fall in lo..hi
//   transpose(events, semitones)
//   writeMIDI({ name, bpm, division, tracks })   a format 1 file: tracks are [{ name, events: [{ tick, data }] }]

const text = (b) => new TextDecoder('latin1').decode(b);
// a name: UTF-8 if it is (most files now), Latin-1 if not (older ones)
const words = (b) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return text(b); } };

export function parseMIDI(input) {
  let b = input instanceof Uint8Array ? input : new Uint8Array(input);
  // a RIFF MIDI file (.rmi) carries a Standard MIDI File in its data chunk
  if (b.length >= 20 && text(b.subarray(0, 4)) === 'RIFF' && text(b.subarray(8, 12)) === 'RMID') {
    let at = 12;
    while (at + 8 <= b.length) {
      const id = text(b.subarray(at, at + 4)), len = u32(b, at + 4);
      if (id === 'data') { b = b.subarray(at + 8, at + 8 + len); break; }
      at += 8 + len + (len & 1);
    }
  }
  if (b.length < 14 || text(b.subarray(0, 4)) !== 'MThd') throw new Error('not a MIDI file (no MThd header)');
  const hlen = u32(b, 4), format = u16(b, 8), ntracks = u16(b, 10), div = u16(b, 12);
  if (format > 2) throw new Error(`MIDI file format ${format} is unknown`);
  // ticks per quarter note, or (SMPTE) frames a second × ticks a frame
  const smpte = div & 0x8000 ? (256 - (div >> 8)) * (div & 0xff) : 0;
  if (!smpte && !div) throw new Error('MIDI file with no time division');
  let at = 8 + hlen, name = '';
  const raw = [], tempos = []; // raw: { tick, order, data }; tempos: { tick, order, usPerQuarter }
  let order = 0;
  for (let tr = 0; tr < ntracks && at + 8 <= b.length; tr++) {
    const id = text(b.subarray(at, at + 4)), len = u32(b, at + 4);
    const end = Math.min(b.length, at + 8 + len);
    at += 8;
    if (id !== 'MTrk') { at = end; tr--; continue; } // an unknown chunk: skipped
    let tick = 0, status = 0;
    while (at < end) {
      const [delta, n] = varLen(b, at);
      at += n;
      tick += delta;
      let st = b[at];
      if (st >= 0x80) at++;
      else if (status) st = status; // running status
      else throw new Error('MIDI file corrupt (data without a status byte)');
      if (st === 0xff) { // meta
        const type = b[at++], [mlen, k] = varLen(b, at);
        at += k;
        if (at + mlen > end) throw new Error('MIDI file cut short');
        const d = b.subarray(at, at + mlen);
        at += mlen;
        if (type === 0x51 && mlen >= 3) tempos.push({ tick, order: order++, us: (d[0] << 16) | (d[1] << 8) | d[2] });
        else if (type === 0x03 && tr === 0 && !name) name = words(d).trim();
        else if (type === 0x2f) break;
        continue;
      }
      if (st === 0xf0 || st === 0xf7) { const [slen, k] = varLen(b, at); at += k + slen; status = 0; continue; } // SysEx
      if (st >= 0xf0) continue; // a stray system message, no data
      status = st;
      const cmd = st & 0xf0, two = cmd !== 0xc0 && cmd !== 0xd0;
      if (at + (two ? 2 : 1) > end) throw new Error('MIDI file cut short');
      const data = two ? [st, b[at] & 0x7f, b[at + 1] & 0x7f] : [st, b[at] & 0x7f];
      at += two ? 2 : 1;
      raw.push({ tick, order: order++, data });
    }
    at = end;
  }
  raw.sort((x, y) => x.tick - y.tick || x.order - y.order);
  tempos.sort((x, y) => x.tick - y.tick || x.order - y.order);
  // ticks → seconds along the tempo map (120 bpm until the first tempo)
  const seconds = (() => {
    if (smpte) return (tick) => tick / smpte;
    const map = [{ tick: 0, t: 0, us: 500000 }];
    for (const { tick, us } of tempos) {
      const last = map.at(-1), t = last.t + ((tick - last.tick) * last.us) / (div * 1e6);
      if (tick === last.tick) { last.us = us; continue; }
      map.push({ tick, t, us });
    }
    return (tick) => {
      let i = map.length - 1;
      while (i > 0 && map[i].tick > tick) i--;
      const m = map[i];
      return m.t + ((tick - m.tick) * m.us) / (div * 1e6);
    };
  })();
  const events = raw.map(({ tick, data }) => ({ t: seconds(tick), data }));
  return { format, tracks: ntracks, name, events, duration: events.length ? events.at(-1).t : 0 };
}

function u32(b, i) { return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0; }
function u16(b, i) { return (b[i] << 8) | b[i + 1]; }
function varLen(b, i) {
  let v = 0, n = 0;
  for (;;) {
    if (i + n >= b.length) throw new Error('MIDI file cut short');
    const c = b[i + n++];
    v = v * 128 + (c & 0x7f);
    if (!(c & 0x80) || n === 4) return [v, n];
  }
}

const isNote = (d) => (d[0] & 0xe0) === 0x80; // a note-on or note-off
const isNoteOn = (d) => (d[0] & 0xf0) === 0x90 && d[2] > 0;
/** The controllers a song may move on every page: the mod wheel and the three pedals. */
export const SONG_CCS = new Set([1, 64, 66, 67]);

/**
 * What a page plays of a file: its notes, its pedals (CC64, 66, 67), its mod wheel, pitch bend
 * and aftertouch, and the controllers the instrument maps itself (its `controllers`, an organ's
 * swell on CC11). Not a General MIDI file's program changes (they would change the preset), its
 * volume, pan and effects controllers, or its RPNs (they'd set the page's MPE). A GM file's
 * percussion (channel 10) is left out, unless it is all the file has.
 */
export function playable(events, { controllers = {} } = {}) {
  const drumsOnly = !events.some((e) => isNoteOn(e.data) && (e.data[0] & 0x0f) !== 9);
  return events.filter(({ data: d }) => {
    if (!drumsOnly && (d[0] & 0x0f) === 9) return false;
    const cmd = d[0] & 0xf0;
    if (cmd === 0xb0) return SONG_CCS.has(d[1]) || Object.hasOwn(controllers, d[1]);
    return cmd !== 0xc0;
  });
}

/** The whole octaves (a multiple of 12) to move a song by so the most of its notes fall in lo..hi; the smallest such move. */
export function fit(events, lo, hi) {
  const keys = events.filter((e) => isNoteOn(e.data)).map((e) => e.data[1]);
  let best = 0, most = -1;
  for (const s of [0, 12, -12, 24, -24, 36, -36, 48, -48]) {
    const n = keys.filter((k) => k + s >= lo && k + s <= hi).length;
    if (n > most) { most = n; best = s; }
  }
  return best;
}

/** The events with every note (and its key pressure) moved by `semitones`; one moved off the MIDI range is left out. */
export function transpose(events, semitones) {
  if (!semitones) return events;
  return events.flatMap((e) => {
    const d = e.data, cmd = d[0] & 0xf0;
    if (!isNote(d) && cmd !== 0xa0) return [e];
    const k = d[1] + semitones;
    return k < 0 || k > 127 ? [] : [{ ...e, data: [d[0], k, d[2]] }];
  });
}

// ---- writing --------------------------------------------------------------------------------

/**
 * A format 1 Standard MIDI File: a first track with the name and the tempo (bpm, or `tempos`:
 * [{ tick, bpm }]), then each of `tracks` ({ name, events: [{ tick, data }] }). division: ticks a
 * quarter note.
 */
export function writeMIDI({ name = '', bpm = 120, tempos, division = 480, tracks = [] }) {
  const chunk = (id, body) => [...ascii(id), ...be32(body.length), ...body];
  const meta = (type, bytes) => [0xff, type, ...vlq(bytes.length), ...bytes];
  const track = (evs) => {
    const out = [];
    let last = 0;
    for (const e of [...evs].sort((x, y) => x.tick - y.tick)) {
      out.push(...vlq(Math.round(e.tick) - last), ...e.bytes);
      last = Math.round(e.tick);
    }
    out.push(0, 0xff, 0x2f, 0);
    return chunk('MTrk', out);
  };
  const first = [];
  if (name) first.push({ tick: 0, bytes: meta(0x03, utf8(name)) });
  for (const t of tempos ?? [{ tick: 0, bpm }]) {
    const us = Math.round(60e6 / t.bpm);
    first.push({ tick: t.tick, bytes: meta(0x51, [(us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff]) });
  }
  // events at the same tick: note-offs before note-ons, so a repeated note is let go, then struck
  const rank = (d) => ((d[0] & 0xf0) === 0x80 || ((d[0] & 0xf0) === 0x90 && d[2] === 0) ? 0 : 1);
  const body = tracks.map((tr) => track([
    ...(tr.name ? [{ tick: 0, bytes: meta(0x03, utf8(tr.name)) }] : []),
    ...[...tr.events].sort((x, y) => x.tick - y.tick || rank(x.data) - rank(y.data)).map((e) => ({ tick: e.tick, bytes: e.data })),
  ]));
  return Uint8Array.from([
    ...chunk('MThd', [0, 1, ...be16(tracks.length + 1), ...be16(division)]),
    ...track(first), ...body.flat(),
  ]);
}
const ascii = (s) => [...s].map((c) => c.charCodeAt(0) & 0x7f);
const utf8 = (s) => [...new TextEncoder().encode(s)];
const be32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const be16 = (n) => [(n >> 8) & 0xff, n & 0xff];
function vlq(n) {
  const out = [n & 0x7f];
  while ((n = Math.floor(n / 128))) out.unshift((n & 0x7f) | 0x80);
  return out;
}
