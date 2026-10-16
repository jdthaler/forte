// midi.js — Web MIDI for every page.
//
//   startMIDI({ onMIDI, status, button }) asks for MIDI access, listens to every input (and to any
//   plugged in later), and remembers the choice: the next page turns MIDI on by itself when the
//   browser still grants it (resumeMIDI). Each input's messages are cleaned on the way to onMIDI:
//   - a note-on for a note already down on that channel first lets it go (a re-strike, never two
//     presses that one note-off can't undo);
//   - a note-off for a note that isn't down is dropped;
//   - a device that goes away lets go of its notes and of its sustain pedal.
//   wheelValue(p, cc, max?) maps the mod wheel onto a parameter: at rest (0) its default, fully up
//   its maximum, so a wheel at rest never drags the instrument to the bottom of its range.

const KEY = 'forte/midi/v1';

export function startMIDI({ onMIDI, status = () => {}, button = null }) {
  if (!navigator.requestMIDIAccess) { status('No Web MIDI in this browser (try Chrome, Edge or Firefox)'); return; }
  navigator.requestMIDIAccess().then((acc) => {
    try { localStorage.setItem(KEY, '1'); } catch { /* storage blocked */ }
    const down = new Map(); // input id → { notes: Set('channel:key'), pedals: Set(channel) }
    const send = (data) => onMIDI({ data });
    const letGo = (id) => {
      const s = down.get(id);
      if (!s) return;
      for (const nk of s.notes) { const [ch, k] = nk.split(':').map(Number); send([0x80 | ch, k, 0]); }
      for (const ch of s.pedals) send([0xb0 | ch, 64, 0]);
      down.delete(id);
    };
    const clean = (id, data) => {
      const [st, d1, d2] = data, cmd = st & 0xf0, ch = st & 0x0f, nk = `${ch}:${d1}`;
      let s = down.get(id);
      if (!s) down.set(id, (s = { notes: new Set(), pedals: new Set() }));
      if (cmd === 0x90 && d2 > 0) { if (s.notes.has(nk)) send([0x80 | ch, d1, 0]); s.notes.add(nk); }
      else if (cmd === 0x80 || cmd === 0x90) { if (!s.notes.delete(nk)) return; }
      else if (cmd === 0xb0 && d1 === 64) { if (d2 >= 64) s.pedals.add(ch); else s.pedals.delete(ch); }
      else if (cmd === 0xb0 && (d1 === 120 || d1 === 123)) { s.notes.clear(); s.pedals.clear(); }
      send(data);
    };
    const bind = () => {
      const names = [];
      for (const inp of acc.inputs.values()) {
        if (inp.state === 'disconnected') { letGo(inp.id); continue; }
        names.push(inp.name);
        inp.onmidimessage = (ev) => clean(inp.id, ev.data);
      }
      for (const id of [...down.keys()]) if (!acc.inputs.has(id)) letGo(id);
      status(names.length ? `MIDI: ${names.join(', ')}` : 'MIDI: no devices');
    };
    bind();
    acc.onstatechange = bind;
    if (button) button.hidden = true;
  }, () => status('MIDI: permission denied'));
}

/** Turn MIDI on without a click when this site turned it on before and the browser still grants it. */
export async function resumeMIDI(start) {
  let wanted = false;
  try { wanted = localStorage.getItem(KEY) === '1'; } catch { /* storage blocked */ }
  if (!wanted || !navigator.requestMIDIAccess || !navigator.permissions?.query) return;
  try {
    if ((await navigator.permissions.query({ name: 'midi' })).state === 'granted') start();
  } catch { /* 'midi' is not a permission this browser can be asked about: wait for the button */ }
}

/** The mod wheel (CC value 0..127) on parameter p: at rest its default, fully up `top` (its max). */
export function wheelValue(p, cc, top = p.max) {
  if (cc <= 0) return p.def;
  const u = cc / 127;
  let v = p.log ? p.def * (top / p.def) ** u : p.def + (top - p.def) * u;
  if (p.step) v = Math.round(v / p.step) * p.step;
  return Math.min(p.max, Math.max(p.min, v));
}
