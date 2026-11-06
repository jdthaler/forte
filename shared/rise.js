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
//
// Below them, "On the RISE": its own settings, read over SysEx (shared/rise-sysex.js) once the
// browser allows it, with a button that sets it up as Forte expects and its five sensitivities.
// It writes only when one of those is pressed or moved.

import { createMpe, MEMBER_BEND } from './mpe.js';
import { FADERS, controllersOf, ccValue, mpeMode, signed } from './midi.js';
import { IDENTIFY, parse, differences, forForte, set as setting, PARAMS } from './rise-sysex.js';

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
  // each note's own bend, slide and pressure, as a RISE in MPE sends them (a lower zone of 15)
  const mpe = createMpe({
    noteBend: (key, semis) => { const f = finger(key); if (f) { f.glide = semis; set('glide', semis); } },
    noteSlide: (key, u) => { const f = finger(key); if (f && !Number.isNaN(u)) { f.slide = u; set('slide', u); } },
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
      if (st >= 0xf0) return; // SysEx, clock and the rest: no finger's
      if (cmd === 0x90 && d2 > 0) {
        channels.add(ch); single = ch === 0;
        fingers.set(ch, { key: d1, strike: d2 / 127, glide: single ? master.glide : 0, slide: NaN, press: 0, t: now() });
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
      mpe.midi(data);
    },
  };
}

// ---- the panel --------------------------------------------------------------------------------------

const STORE = 'forte/rise/v1';
const ANSWER = 1500; // ms: how long the RISE has to answer an identify
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
  const own = settingsSection(() => [...inputs.values()][0] ?? '');
  body.append(slab, dims, note, own.element);
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
    note.textContent = model.single ? 'Its notes come on channel 1: it isn\'t sending MPE, so every note glides and presses together. Set it to MPE under On the RISE below (or in ROLI Dashboard).'
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
      own.connected(inputs.size > 0, connected);
    },
    midi(id, data) { if (!inputs.has(id)) return; model.midi(data); request(); },
  };
  return panel;
}

// ---- the RISE's own settings, over SysEx (shared/rise-sysex.js) --------------------------------------
//
// Reading asks the browser for SysEx (its own permission, "control and reprogram your MIDI devices"),
// on a button the first time and by itself once granted. Nothing is written but by a button or a
// slider here: Set up for Forte (after a second press to confirm) and the five sensitivities.

let link = null; // the SysEx MIDI access, asked for once
async function ports(name) {
  link ??= navigator.requestMIDIAccess({ sysex: true }).catch((e) => { link = null; throw e; });
  const acc = await link;
  const pick = (all) => { const ps = [...all.values()].filter((p) => p.state !== 'disconnected'); return ps.find((p) => p.name === name) ?? ps.find((p) => /seaboard/i.test(p.name ?? '')); };
  const out = pick(acc.outputs), inp = pick(acc.inputs);
  if (!out || !inp) throw new Error('no port');
  return { out, inp };
}
/** The RISE's settings (rise-sysex.js parse), or a rejection: 'denied', 'no port', 'no answer'. */
async function identify(name) {
  let p;
  try { p = await ports(name); } catch (e) { throw new Error(e?.name === 'SecurityError' || e?.name === 'NotAllowedError' ? 'denied' : e?.message || 'no port'); }
  const { out, inp } = p;
  await inp.open?.();
  return new Promise((resolve, reject) => {
    const done = (s) => { clearTimeout(timer); inp.removeEventListener('midimessage', on); if (s) resolve(s); else reject(new Error('no answer')); };
    const on = (ev) => { const s = parse(ev.data); if (s) done(s); };
    const timer = setTimeout(() => done(null), ANSWER);
    inp.addEventListener('midimessage', on);
    out.send(IDENTIFY);
  });
}
async function write(name, msgs) {
  const { out } = await ports(name);
  for (const m of msgs) out.send(m);
}
const granted = async () => {
  try { return (await navigator.permissions.query({ name: 'midi', sysex: true })).state === 'granted'; } catch { return false; }
};

const SENS = [['strike', 'Strike'], ['glide', 'Glide'], ['slide', 'Slide'], ['pressSens', 'Press', 'press'], ['lift', 'Lift']];
function settingsSection(nameOf) {
  const box = el('section', 'forte-rise-own');
  box.setAttribute('aria-label', 'The RISE\'s own settings');
  const h = el('h3', '', 'On the RISE');
  const status = el('p', 'forte-rise-status'); status.setAttribute('aria-live', 'polite');
  const list = el('dl', 'forte-rise-settings'); list.hidden = true;
  const buttons = el('div', 'forte-rise-buttons');
  const readB = el('button', '', 'Read its settings'); readB.type = 'button';
  readB.title = 'Ask the RISE for its settings (the browser asks first to let this page talk SysEx to it)';
  const forteB = el('button', '', 'Set up for Forte'); forteB.type = 'button'; forteB.hidden = true;
  buttons.append(readB, forteB);
  const sens = el('details', 'forte-rise-sens'); sens.hidden = true;
  const sum = el('summary', '', 'Sensitivity'); sens.append(sum);
  const sliders = SENS.map(([key, label, param = key]) => {
    const row = el('label', 'forte-rise-srow');
    const input = el('input'); input.type = 'range'; input.min = '0'; input.max = '127'; input.step = '1';
    const val = el('output', '', '');
    row.append(el('span', '', label), input, val);
    sens.append(row);
    let timer = 0;
    const fill = () => { input.style.setProperty('--fill', `${(+input.value / 127) * 100}%`); val.textContent = input.value; };
    const send = () => { clearTimeout(timer); timer = 0; write(nameOf(), setting(param, +input.value)).catch(() => say('The RISE isn\'t there to write to.')); if (state) state[key] = +input.value; };
    input.addEventListener('input', () => { fill(); clearTimeout(timer); timer = setTimeout(send, 120); });
    input.addEventListener('change', send);
    return { key, input, fill };
  });
  const sensNote = el('p', 'forte-rise-snote', 'Each moves the RISE at once, and it keeps it.');
  sens.append(sensNote);
  box.append(h, status, list, buttons, sens);

  let state = null, busy = false, armed = 0;
  const say = (t) => { status.textContent = t; };
  const row = (k, v) => { list.append(el('dt', '', k), el('dd', '', v)); };
  function show(s) {
    state = s;
    list.replaceChildren();
    row('MIDI mode', s.mode === 'mpe' ? `MPE, ${s.upper ? 'upper' : 'lower'} zone of ${s.members}, bend ±${s.bend}`
      : s.mode === 'single' ? `Single Channel, channel ${s.channel}, bend ±${s.bend}` : `Multi Channel, bend ±${s.bend}`);
    row('Press', s.press === 'channel' ? 'channel pressure' : 'polyphonic aftertouch');
    row('Slide', `CC ${s.slideCc}, ${s.slideMode === 0 ? 'absolute' : s.slideMode === 1 ? 'relative' : 'relative, both ways'}`);
    row('Faders, pad', `CC ${s.faders.slice(0, 3).join(', ')} · ${s.faders.slice(3).join(', ')}`);
    row('Octave', `${signed(s.octave)}${s.transpose ? `, transposed ${signed(s.transpose)}` : ''}`);
    row('Firmware', `${s.firmware || '?'}${s.battery ? ` · battery ${s.battery} of 7` : ''}`);
    list.hidden = false;
    const off = differences(s);
    say(off.length ? `Not as Forte expects: ${off.join('; ')}.` : 'Set up as Forte expects.');
    status.classList.toggle('off', off.length > 0);
    forteB.hidden = off.length === 0; disarm();
    for (const x of sliders) { x.input.value = String(s[x.key]); x.fill(); }
    sens.hidden = false;
    readB.textContent = 'Read again';
  }
  async function read({ quiet = false } = {}) {
    if (busy) return;
    busy = true; readB.disabled = forteB.disabled = true;
    if (!quiet) say('Asking the RISE…');
    try { show(await identify(nameOf())); }
    catch (e) {
      const why = e?.message;
      if (!quiet || state) say(why === 'denied' ? 'The browser didn\'t let this page talk SysEx to the RISE. Allow MIDI device control for this site, then read again.'
        : why === 'no port' ? 'No way to send to the RISE: its MIDI output isn\'t there.'
        : 'The RISE didn\'t answer. An original RISE or a RISE 2 should: is it on its USB cable, not Bluetooth?');
    } finally { busy = false; readB.disabled = forteB.disabled = false; }
  }
  const disarm = () => { clearTimeout(armed); armed = 0; forteB.textContent = 'Set up for Forte'; forteB.classList.remove('armed'); };
  readB.addEventListener('click', () => read());
  forteB.addEventListener('click', async () => {
    if (!armed) { // a second press writes: the RISE keeps these until ROLI Dashboard (or this) changes them
      forteB.textContent = 'Write to the RISE'; forteB.classList.add('armed');
      say('This sets MPE on 15 channels at ±48, Slide on CC74 (absolute), Press as channel pressure, and the faders and pad on CC 107, 109, 111, 113 and 114. The RISE keeps them. Press again to write.');
      armed = setTimeout(() => { disarm(); if (state) show(state); }, 8000);
      return;
    }
    disarm();
    try { await write(nameOf(), forForte()); } catch { say('The RISE isn\'t there to write to.'); return; }
    say('Written. Reading it back…');
    setTimeout(() => read(), 400);
  });
  return {
    element: box,
    /** a Seaboard came or went: read it by itself if the browser already allows SysEx */
    async connected(any, arrived) {
      if (!any) { state = null; list.hidden = sens.hidden = forteB.hidden = true; readB.textContent = 'Read its settings'; say(''); disarm(); return; }
      if (!arrived || state) return;
      say('Its own settings (MIDI mode, Slide, sensitivity) can be read and set from here.');
      if (await granted()) read({ quiet: true });
    },
  };
}
