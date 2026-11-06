// rise.js — a ROLI Seaboard RISE, drawn at the left of an instrument page while one is plugged in
// (as PhuzzBox draws its pedal there): its three touch faders and its XY pad, with the controls they
// move on this instrument; its keywave, a dot for each finger where it glides, slides and presses;
// and the five dimensions of its touch (Strike, Glide, Slide, Press, Lift), each lit while it comes
// in, with what it does on this instrument. shared/midi.js opens it when a Seaboard connects and
// hands it that input's messages as they arrive, before the page's own handling.
//
//   const m = riseModel();  m.midi(data)   the pure state the panel draws (and test/rise-tests.mjs checks)
//   risePanel()             the panel (once per page); risePanel().input(id, name, connected), .midi(id, data)
//
// The RISE as ROLI ships it (and as ROLI Dashboard sets it for MPE): notes on channels 2–16, one a
// note, each bending ±48 semitones, sliding on CC74 and pressing with channel pressure; the faders
// send CC 107, 109 and 111 and the pad 113 (X) and 114 (Y), in its MIDI mode only (white lights).
// In its expression mode (cyan lights) the faders set the RISE's own Glide, Slide and Press
// sensitivity and send nothing, so the panel can only say which mode it was last seen in.

import { createMpe, MEMBER_BEND } from './mpe.js';
import { FADERS, controllersOf, ccValue, mpeMode } from './midi.js';

export const KEYS = 25;                 // a RISE 25's keywave: two octaves, C to C
export const DIMENSIONS = [
  ['strike', 'Strike', 'how fast a finger lands: the velocity'],
  ['glide', 'Glide', 'a finger moving sideways: the note\'s own pitch bend'],
  ['slide', 'Slide', 'a finger moving up and down the key: CC74'],
  ['press', 'Press', 'pressing into the key: the note\'s own pressure'],
  ['lift', 'Lift', 'how fast a finger leaves: the release velocity'],
];
const FLASH = 0.6; // s: Strike and Lift stay lit this long

/**
 * What the RISE is doing, from its messages: each finger (by channel), the faders and the pad,
 * the last value of each dimension and when it came, and the layout it sends in.
 */
export function riseModel({ now = () => performance.now() / 1000 } = {}) {
  const fingers = new Map(); // channel → { key, strike, glide (semitones), slide (0..1, NaN: none yet), press, t }
  const cc = {};             // the faders' and the pad's last values (0..127), by CC
  const last = { strike: NaN, glide: NaN, slide: NaN, press: NaN, lift: NaN };
  const when = { strike: -Infinity, glide: -Infinity, slide: -Infinity, press: -Infinity, lift: -Infinity };
  let channels = new Set(), single = false, faderMode = null; // 'midi' once a fader or the pad sends
  let master = { glide: 0, press: 0 };                       // channel 1's, every note's
  const set = (d, v) => { last[d] = v; when[d] = now(); };
  const finger = (key) => { for (const f of fingers.values()) if (f.key === key) return f; return null; };
  const at = {}; // each member channel's CC74: where its finger is on the key (the instrument hears how far it slid, shared/mpe.js slideFrom)
  // each note's own bend and pressure, as a RISE in MPE sends them (a lower zone of 15)
  const mpe = createMpe({
    noteBend: (key, semis) => { const f = finger(key); if (f) { f.glide = semis; set('glide', semis); } },
    noteSlide: () => {},
    notePressure: (key, v) => { const f = finger(key); if (f) { f.press = v; set('press', v); } },
  });
  mpe.mode = 'on';
  return {
    fingers, cc, last, when,
    get single() { return single; },        // its notes come on channel 1: not MPE
    get faderMode() { return faderMode; },
    get channels() { return channels.size; },
    master: () => master,
    /** whether dimension d is coming in now: a finger holds it, or (Strike, Lift) it just came */
    lit(d) {
      if (d === 'strike' || d === 'lift') return now() - when[d] < FLASH;
      for (const f of fingers.values()) {
        if (d === 'glide' && Math.abs(f.glide + master.glide) > 0.05) return true;
        if (d === 'slide' && f.slide > 0.01) return true;
        if (d === 'press' && f.press + master.press > 0.01) return true;
      }
      return false;
    },
    /** the newest finger down, or null */
    newest() { let n = null; for (const f of fingers.values()) if (!n || f.t > n.t) n = f; return n; },
    midi(data) {
      const [st, d1 = 0, d2 = 0] = data, cmd = st & 0xf0, ch = st & 0x0f;
      if (cmd === 0x90 && d2 > 0) {
        channels.add(ch); single = ch === 0;
        fingers.set(ch, { key: d1, strike: d2 / 127, glide: single ? master.glide : 0, slide: at[ch] ?? NaN, press: 0, t: now() });
        set('strike', d2 / 127);
        mpe.midi(data); // its channel's bend and slide, which came first, are this note's (the sink above)
        return;
      }
      if (cmd === 0x80 || cmd === 0x90) {
        const f = fingers.get(ch);
        if (f && f.key === d1) { fingers.delete(ch); if (cmd === 0x80) set('lift', d2 / 127); }
        mpe.midi(data);
        return;
      }
      if (cmd === 0xb0 && FADERS.some(([n]) => n === d1)) { cc[d1] = d2; faderMode = 'midi'; return; }
      if (cmd === 0xb0 && (d1 === 120 || d1 === 123)) { fingers.clear(); mpe.midi(data); return; }
      if (ch === 0) { // the master channel (or a RISE sending on channel 1 alone): every note's
        if (cmd === 0xe0) { master = { ...master, glide: (((d2 << 7) | d1) - 8192) / 8192 * (single ? MEMBER_BEND : 2) }; set('glide', master.glide); return; }
        if (cmd === 0xd0) { master = { ...master, press: d1 / 127 }; set('press', d1 / 127); return; }
        if (cmd === 0xa0) { const f = finger(d1); if (f) { f.press = d2 / 127; set('press', f.press); } return; }
        if (cmd === 0xb0 && d1 === 74) { for (const f of fingers.values()) f.slide = d2 / 127; set('slide', d2 / 127); return; }
      }
      if (cmd === 0xa0) { const f = finger(d1); if (f) { f.press = d2 / 127; set('press', f.press); } return; }
      if (cmd === 0xb0 && d1 === 74) { at[ch] = d2 / 127; const f = fingers.get(ch); if (f) { f.slide = at[ch]; set('slide', f.slide); } }
      mpe.midi(data);
    },
  };
}

// ---- the panel --------------------------------------------------------------------------------------

const STORE = 'forte/rise/v1';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const CHEVRON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5"/></svg>';
const BLACK = [1, 3, 6, 8, 10];

// What each dimension does on this instrument, from its descriptor
function meanings(I, params) {
  const out = {};
  const { bend = 0, slide = false, press = false } = I?.mpe ?? {};
  const wheel = I?.modWheel && (typeof I.modWheel === 'string' ? I.modWheel : I.modWheel.param);
  const wp = params.find((p) => p.id === wheel);
  out.strike = 'how loud, as a key\'s velocity';
  out.glide = !I ? '' : press && bend ? `presses the key as the wheel does, up to ${bend} semitones`
    : bend ? `bends the note alone, up to ±${bend} semitones` : 'nothing here: each note keeps its own pitch';
  out.slide = !I ? '' : slide && wp ? `${wp.label}, for that note alone` : 'nothing here';
  out.press = !I ? '' : I.aftertouch ? I.aftertouch : 'nothing here';
  out.lift = 'how fast the note is let go';
  if (mpeMode() === 'off') out.glide = out.slide = out.press = 'MPE is off in the MIDI menu: every note moves together';
  return out;
}

let panel = null;
export function risePanel() {
  if (panel) return panel;
  const model = riseModel();
  const inputs = new Map(); // id → name, the Seaboards connected
  let I = null, params = [], map = {}, meaning = meanings(null, []);
  let folded = false;
  try { folded = JSON.parse(localStorage.getItem(STORE) || '{}').folded === true; } catch { /* storage blocked */ }

  const aside = el('aside', 'forte-rise');
  aside.id = 'forte-rise';
  aside.setAttribute('aria-label', 'Seaboard RISE');
  const head = el('div', 'forte-rise-head');
  const title = el('b', '', 'Seaboard RISE');
  const fold = el('button', 'forte-fold');
  fold.type = 'button'; fold.innerHTML = CHEVRON;
  fold.setAttribute('aria-controls', 'forte-rise-body');
  head.append(title, fold);
  const body = el('div', 'forte-rise-body'); body.id = 'forte-rise-body';

  // the instrument: its side panel (three faders and the pad, the mode button), then its keywave
  const slab = el('div', 'forte-rise-slab');
  const side = el('div', 'forte-rise-side');
  // each fader a column of lights with its number; the pad a square with a dot; then a legend: what
  // each of the five moves on this instrument, and where it is
  const legend = el('div', 'forte-rise-legend');
  const controls = FADERS.map(([n, name], i) => {
    const tag = i < 3 ? String(i + 1) : name.slice(-1);
    const row = el('div', 'forte-rise-lrow'), label = el('span', 'forte-rise-llabel'), value = el('span', 'forte-rise-lval');
    row.append(el('b', '', tag), label, value);
    legend.append(row);
    return { n, name, tag, row, label, value };
  });
  const faders = controls.slice(0, 3).map((c) => {
    const f = el('div', 'forte-rise-fader');
    const track = el('div', 'forte-rise-track'); track.append(el('i'));
    f.append(track, el('span', 'forte-rise-fnum', c.tag));
    return { ...c, f, track };
  });
  const pad = el('div', 'forte-rise-pad'); pad.append(el('i'));
  pad.title = 'XY pad (X: CC 113, Y: CC 114)';
  const fadersBox = el('div', 'forte-rise-faders'); fadersBox.append(...faders.map((x) => x.f));
  const modeLed = el('span', 'forte-rise-led'), modeText = el('span', 'forte-rise-mode');
  const mode = el('div', 'forte-rise-modeline'); mode.append(modeLed, modeText);
  side.append(fadersBox, pad, legend, mode);
  const wave = el('div', 'forte-rise-wave');
  wave.setAttribute('aria-hidden', 'true');
  const keysEl = el('div', 'forte-rise-keys');
  for (let i = 0; i < KEYS; i++) { const k = el('span', BLACK.includes(i % 12) ? 'b' : 'w'); keysEl.append(k); }
  const dots = el('div', 'forte-rise-dots');
  const range = el('span', 'forte-rise-range');
  wave.append(keysEl, dots, range);
  slab.append(side, wave);

  // the five dimensions: lit while they come in, the newest finger's value, what they do here
  const dims = el('div', 'forte-rise-dims');
  dims.setAttribute('role', 'list');
  const rows = DIMENSIONS.map(([id, name, hint]) => {
    const r = el('div', 'forte-rise-dim'); r.setAttribute('role', 'listitem'); r.dataset.dim = id;
    r.title = `${name}: ${hint}`;
    const meter = el('span', `forte-rise-meter${id === 'glide' ? ' signed' : ''}`); meter.append(el('i'));
    const val = el('span', 'forte-rise-val'), what = el('span', 'forte-rise-what');
    r.append(el('span', 'forte-rise-dot'), el('b', '', name), meter, val, what);
    return { id, r, meter, val, what };
  });
  dims.append(...rows.map((x) => x.r));
  const note = el('p', 'forte-rise-note');
  body.append(slab, dims, note);
  aside.append(head, body);

  const setFolded = (on) => {
    folded = on;
    document.body.classList.toggle('rise-folded', on);
    fold.setAttribute('aria-expanded', String(!on));
    fold.setAttribute('aria-label', on ? 'Show the Seaboard RISE' : 'Fold the Seaboard RISE away');
    fold.title = on ? 'Show the RISE panel' : 'Fold the RISE panel away';
    try { localStorage.setItem(STORE, JSON.stringify({ folded: on })); } catch { /* storage blocked */ }
    request();
  };
  fold.addEventListener('click', () => { setFolded(!folded); fold.blur(); });
  head.addEventListener('click', (e) => { if (folded && !fold.contains(e.target)) setFolded(false); });

  // the instrument's descriptor: what the faders and the pad move, and what each dimension does
  const slug = document.body.dataset.instrument;
  if (slug) {
    import(new URL(`../${slug}/src/${slug}-instrument.js`, import.meta.url).href).then((m) => {
      I = m.INSTRUMENT; params = (I.groups ?? []).flatMap((g) => g.params); map = controllersOf(I); meaning = meanings(I, params); labels(); request();
    }, () => { /* a page without a descriptor: the panel shows the RISE alone */ });
  }
  const paramOf = (n) => { const c = map[n]; const id = typeof c === 'object' ? c?.param : c; return params.find((p) => p.id === id) ?? null; };
  const text = (p, v) => {
    if (!p) return '';
    const x = ccValue(p, v);
    if (p.type === 'checkbox') return x ? 'on' : 'off';
    if (p.type === 'select') return p.options.find(([o]) => o === x)?.[1] ?? String(x);
    try { return p.fmt ? String(p.fmt(x)) : String(+x.toPrecision(3)); } catch { return String(x); }
  };
  function labels() {
    for (const c of controls) {
      const p = paramOf(c.n);
      c.label.textContent = p ? p.label : 'nothing here';
      c.row.classList.toggle('none', !p);
      c.row.title = `${c.name} (CC ${c.n})${p ? `: ${p.label}` : ': moves nothing on this instrument'}`;
      if (c.f) c.f.title = c.row.title;
    }
    for (const x of rows) x.what.textContent = meaning[x.id] ?? '';
  }
  labels();

  let raf = 0, base = 48;
  const fmtDim = (id, v) => {
    if (Number.isNaN(v)) return '–';
    if (id === 'glide') return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 2 : 1)} st`;
    return `${Math.round(v * 127)}`;
  };
  function draw() {
    raf = 0;
    const t = performance.now() / 1000;
    for (const c of controls) {
      const v = model.cc[c.n];
      c.value.textContent = v === undefined ? '' : text(paramOf(c.n), v);
      c.row.classList.toggle('known', v !== undefined);
    }
    for (const x of faders) {
      const v = model.cc[x.n];
      x.track.style.setProperty('--v', v === undefined ? 0 : v / 127);
      x.f.classList.toggle('known', v !== undefined);
    }
    const X = model.cc[113], Y = model.cc[114];
    pad.style.setProperty('--x', X === undefined ? 0.5 : X / 127); pad.style.setProperty('--y', Y === undefined ? 0.5 : Y / 127);
    pad.classList.toggle('known', X !== undefined || Y !== undefined);
    const white = model.faderMode === 'midi';
    modeLed.classList.toggle('white', white);
    modeText.textContent = white ? 'MIDI mode: the faders and the pad move these controls'
      : 'No fader or pad yet. Cyan lights: they set the RISE\'s own Glide, Slide and Press; press the mode button for white';
    // the keywave: two octaves from the C below the lowest finger (a RISE 25 shifted by its octave buttons)
    const keysDown = [...model.fingers.values()].map((f) => f.key);
    if (keysDown.length) {
      const lo = Math.min(...keysDown), hi = Math.max(...keysDown);
      if (lo < base || hi >= base + KEYS) base = 12 * Math.floor(lo / 12);
    }
    range.textContent = `${name(base)}–${name(base + KEYS - 1)}`;
    const m = model.master();
    const fingers = [...model.fingers.values()];
    while (dots.children.length < fingers.length) dots.append(el('i'));
    while (dots.children.length > fingers.length) dots.lastChild.remove();
    fingers.forEach((f, i) => {
      const d = dots.children[i], g = f.glide + m.glide;
      d.style.setProperty('--x', Math.min(1, Math.max(0, (f.key - base + g + 0.5) / KEYS)));
      d.style.setProperty('--y', Number.isNaN(f.slide) ? 0.5 : f.slide);
      d.style.setProperty('--p', Math.min(1, f.press + m.press));
      d.style.setProperty('--s', f.strike);
    });
    const n = model.newest();
    for (const x of rows) {
      const lit = model.lit(x.id);
      x.r.classList.toggle('on', lit);
      let v = model.last[x.id];
      if (n && x.id === 'glide') v = n.glide + m.glide;
      else if (n && x.id === 'slide') v = n.slide;
      else if (n && x.id === 'press') v = Math.min(1, n.press + m.press);
      else if (n && x.id === 'strike') v = n.strike;
      if (x.id === 'glide') { // from the middle, either way
        const R = I?.mpe?.bend > 0 ? I.mpe.bend : 12, u = Number.isNaN(v) ? 0 : Math.max(-1, Math.min(1, v / R)) / 2;
        x.meter.style.setProperty('--from', 0.5 + Math.min(0, u)); x.meter.style.setProperty('--w', Math.abs(u));
      } else x.meter.style.setProperty('--v', Number.isNaN(v) ? 0 : v);
      x.val.textContent = fmtDim(x.id, v);
    }
    const names = [...inputs.values()];
    title.textContent = names.length === 1 ? names[0].replace(/^ROLI\s+/i, '') : 'Seaboard RISE';
    const on = mpeMode() !== 'off';
    note.textContent = model.single ? 'Its notes come on channel 1: it isn\'t sending MPE, so every note glides and presses together. In ROLI Dashboard, set MIDI Mode to MPE.'
      : !on ? 'MPE is off in the MIDI menu: turn it to Auto, and each finger bends, slides and presses its own note.'
      : `MPE: each finger its own channel${model.channels ? ` (${model.channels} so far)` : ''}, each glide up to ±${MEMBER_BEND} semitones.`;
    // keep drawing while something fades (Strike, Lift) or a finger is down
    if (fingers.length || t - model.when.strike < FLASH + 0.1 || t - model.when.lift < FLASH + 0.1) request();
  }
  const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const name = (k) => `${NAMES[k % 12]}${Math.floor(k / 12) - 1}`;
  const request = () => { if (!raf) raf = requestAnimationFrame(draw); };
  const show = () => {
    const any = inputs.size > 0;
    if (any && !aside.isConnected) {
      const main = document.querySelector('body > main');
      if (!main) return;
      main.prepend(aside);
      setFolded(folded);
    }
    document.body.classList.toggle('rise', any);
    if (!any) aside.remove();
    window.dispatchEvent(new Event('resize')); // the views and the keyboard measure their room again
    request();
  };
  panel = {
    model, element: aside,
    input(id, nm, connected) {
      const had = inputs.size;
      if (connected) inputs.set(id, nm || 'Seaboard'); else inputs.delete(id);
      if (!connected) model.midi([0xb0, 123, 0]);
      if (inputs.size !== had || connected) show();
    },
    midi(id, data) { if (!inputs.has(id)) return; model.midi(data); request(); },
  };
  return panel;
}
