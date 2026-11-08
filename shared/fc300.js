// fc300.js — a Roland FC-300 MIDI foot controller, drawn in the drawer at the left of an instrument
// page (shared/layout.js) once one is seen: its ▼ ▲, CTL 1 and 2, five number pedals and two
// expression pedals with their toe switches, each lit as it moves, with what it does on this
// instrument. shared/midi.js opens it when an input sends the FC-300's switches (CC80–83) or comes
// by the interface the last one came by, and hands it that input's messages.
//
//   const m = footModel();  m.midi(data), m.sysex(event)   the pure state it draws (test/fc300-tests.mjs)
//   drive(event, state)     what a pedal does while Forte drives it: { send, preset, soft }
//   fc300Panel()            the section (once per page); .input(id, name, connected), .midi(id, data)
//
// As it comes (Standard mode) it sends control and program changes, which shared/midi.js plays:
// CTL 1 and 2 and EXP 1's toe switch are the sustain, sostenuto and soft pedals, EXP 1 the volume,
// EXP 2 the page's Morph (shared/morph.js; the mod wheel where there is none), the number pedals the presets. Its switches come latched (a press down, the
// next up), which its own menus change and SysEx can't.
//
// Driven by Forte (its System Exclusive mode, shared/fc300-sysex.js; a button here, the browser's
// SysEx permission): it sends each pedal as the foot moves it, so the switches are as a piano's
// pedals are, down while held; the toe switch flips the soft pedal; ▲ ▼ step through the presets
// and the number pedals choose among the five around the one playing, lit as its own lights show
// a patch (red the first five, green the next); its display shows the preset's number and its LCD
// the instrument and the preset. Nothing is written to it: at its next power-up it is as it was.

import { pageMIDI, createInput, controllersOf, presetChoices, presetIndex, choosePreset, footMorph } from './midi.js';
import { ASK, parse, event, enter, leave, display, lcd, lights } from './fc300-sysex.js';

export const PEDALS = ['down', 'up', 'ctl1', 'ctl2', 'number1', 'number2', 'number3', 'number4', 'number5', 'toe1', 'toe2', 'exp1', 'exp2'];
// as it comes, what each switch sends (Standard mode, the manual's p. 17)
export const STANDARD = { 80: 'ctl1', 81: 'ctl2', 82: 'toe1', 83: 'toe2', 7: 'exp1', 1: 'exp2' };

/** What the FC-300 is doing, from its messages: each switch down or not, each pedal's position, the patch it last sent. */
export function footModel({ now = () => performance.now() / 1000 } = {}) {
  const down = Object.fromEntries(PEDALS.filter((p) => !p.startsWith('exp')).map((p) => [p, false]));
  const exp = { exp1: null, exp2: null }; // 0..127, null until it moves
  const when = Object.fromEntries(PEDALS.map((p) => [p, -Infinity]));
  const m = {
    down, exp, when,
    mode: 'standard',    // 'standard' (as it comes), 'sysex' (Forte drives it)
    program: null,       // the last program change (Standard mode)
    midi(data) {
      const [st, d1, d2] = data, cmd = st & 0xf0;
      if (cmd === 0xb0 && STANDARD[d1]) {
        const p = STANDARD[d1];
        if (p.startsWith('exp')) exp[p] = d2; else down[p] = d2 >= 64;
        when[p] = now();
      } else if (cmd === 0xc0) {
        m.program = d1;
        when[`number${(d1 % 5) + 1}`] = now();
      }
    },
    sysex(ev) {
      if (!ev) return;
      if (ev.mode) { m.mode = ev.mode === 'sysex' ? 'sysex' : 'standard'; return; }
      if (ev.pedal.startsWith('exp')) exp[ev.pedal] = ev.value; else down[ev.pedal] = ev.down;
      when[ev.pedal] = now();
    },
  };
  return m;
}

/**
 * What a pedal does while Forte drives the FC-300 (an event from fc300-sysex.js event), given
 * state = { soft (the toe switch's soft pedal is down), index (the preset playing, −1 none), count
 * (how many presets) }: { send: [channel messages for the page], preset: the preset to choose or
 * null, soft: the toe switch's state after it, morph: EXP 2's 0..127 for the page's Morph or null }.
 */
export function drive(ev, { soft = false, index = -1, count = 0 } = {}) {
  const out = { send: [], preset: null, soft, morph: null };
  if (!ev?.pedal) return out;
  const { pedal, down } = ev;
  const cc = (n, on) => out.send.push([0xb0, n, on ? 127 : 0]);
  if (pedal === 'ctl1') cc(64, down);                                // the sustain pedal, down while held
  else if (pedal === 'ctl2') cc(66, down);                           // the sostenuto
  else if (pedal === 'toe1' && down) { out.soft = !soft; cc(67, out.soft); } // the soft pedal: a press puts it down, the next lifts it
  else if (pedal === 'exp1') out.send.push([0xb0, 7, ev.value]);     // the volume
  else if (pedal === 'exp2') out.morph = ev.value;                   // Morph (the mod wheel on a page without one)
  else if (down && count > 0 && (pedal === 'up' || pedal === 'down')) {
    const at = index < 0 ? (pedal === 'up' ? -1 : count) : index;
    const n = at + (pedal === 'up' ? 1 : -1);
    if (n >= 0 && n < count) out.preset = n;
  } else if (down && count > 0 && pedal.startsWith('number')) {
    const n = Math.floor(Math.max(0, index) / 5) * 5 + (+pedal.slice(6) - 1);
    out.preset = n; // past the last, choosePreset says there is none
  }
  return out;
}

/** Its lights, display and LCD for preset `index` of `count` named `name` on instrument `title`, and the soft pedal. */
export function face(dev, { index = -1, count = 0, name = '', title = '', soft = false } = {}) {
  const slot = index >= 0 ? index % 5 : -1, green = index >= 0 && Math.floor(index / 5) % 2 === 1;
  return [
    ...lights(dev, {
      red: [0, 1, 2, 3, 4].map((i) => i === slot && !green), green: [0, 1, 2, 3, 4].map((i) => i === slot && green),
      toe: [soft, false], up: index < count - 1, down: index > 0,
    }),
    ...display(dev, index >= 0 ? String(index + 1).padStart(3, '0') : '---'),
    ...lcd(dev, title, index >= 0 ? name : count ? `${count} presets` : ''),
  ];
}

// ---- the section --------------------------------------------------------------------------------------

const STORE = 'forte/fc300/v1'; // { name: the interface it came by, drive: whether Forte drives it }
const ANSWER = 400;              // ms: how long it has to say which mode it is in
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const prefs = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { return {}; } };
const remember = (o) => { try { localStorage.setItem(STORE, JSON.stringify({ ...prefs(), ...o })); } catch { /* storage blocked */ } };
const granted = async () => {
  try { return (await navigator.permissions.query({ name: 'midi', sysex: true })).state === 'granted'; } catch { return false; }
};

// The drawing: its top panel as the manual draws it (p. 9), in a 300 × 150 box
const SVG_NS = 'http://www.w3.org/2000/svg';
function drawing() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 300 152');
  svg.setAttribute('class', 'forte-fc300-art');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'The FC-300: ▼ ▲, CTL 1 and 2, five number pedals, two expression pedals');
  const add = (tag, attrs, parent = svg) => { const e = document.createElementNS(SVG_NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent.append(e); return e; };
  const text = (x, y, t, cls = 'lbl') => { const e = add('text', { x, y, class: cls, 'text-anchor': 'middle' }); e.textContent = t; return e; };
  add('rect', { x: 1, y: 1, width: 298, height: 150, rx: 7, class: 'body' });
  const parts = {};
  // the display: its three digits, and the mode it is in
  add('rect', { x: 8, y: 7, width: 82, height: 22, rx: 3, class: 'screen' });
  parts.digits = text(28, 23, '---', 'digits');
  parts.lcd = text(68, 21, '', 'lcd');
  // a switch: its pad, its light above
  const sw = (key, x, y, w, h, label, led = true) => {
    const g = add('g', { class: 'sw', 'data-pedal': key });
    add('rect', { x, y, width: w, height: h, rx: 4, class: 'pad' }, g);
    if (led) add('circle', { cx: x + 7, cy: y + 7, r: 3, class: 'led' }, g);
    const t = add('text', { x: x + w / 2, y: y + h / 2 + 4, class: 'name', 'text-anchor': 'middle' }, g);
    t.textContent = label;
    parts[key] = g;
    return g;
  };
  sw('down', 8, 34, 39, 38, '▼'); sw('up', 51, 34, 39, 38, '▲');
  sw('ctl1', 98, 7, 42, 65, 'CTL 1'); sw('ctl2', 144, 7, 42, 65, 'CTL 2');
  for (let i = 0; i < 5; i++) {
    const g = sw(`number${i + 1}`, 8 + i * 36, 82, 32, 62, `${i + 1}/${i + 6}`, false);
    add('circle', { cx: 8 + i * 36 + 11, cy: 89, r: 3, class: 'led red' }, g);
    add('circle', { cx: 8 + i * 36 + 21, cy: 89, r: 3, class: 'led green' }, g);
  }
  // the expression pedals: a treadle, how far down its toe is, its toe switch's light
  for (const [i, x] of [[1, 196], [2, 250]]) {
    const g = add('g', { class: 'exp', 'data-pedal': `exp${i}` });
    add('rect', { x, y: 7, width: 46, height: 137, rx: 5, class: 'pad' }, g);
    parts[`fill${i}`] = add('rect', { x: x + 4, y: 140, width: 38, height: 0, rx: 3, class: 'fill' }, g);
    const t = add('g', { class: 'sw', 'data-pedal': `toe${i}` }, g);
    add('circle', { cx: x + 23, cy: 15, r: 3, class: 'led' }, t);
    parts[`toe${i}`] = t;
    text(x + 23, 82, `EXP ${i}`, 'name');
    parts[`exp${i}`] = g;
  }
  return { svg, parts };
}

// What each pedal does on this instrument, from its descriptor and the page
function meanings(I, params) {
  const map = I ? controllersOf(I) : {};
  // what the instrument maps a controller to itself (an organ's Leslie on CC64 and the mod wheel)
  const own = (cc, pedal = false) => {
    const c = map[cc];
    if (c === undefined) return null;
    const id = typeof c === 'object' ? c.param : c;
    const name = params.find((p) => p.id === id)?.label ?? `${id.charAt(0).toUpperCase()}${id.slice(1)}`;
    if (c?.toggle) return `${name}: each press flips it, ${c.toggle.join(' or ')}`;
    if (c?.values) return `${name}: ${c.values[1]} ${pedal ? 'from halfway down' : 'while down'}`;
    return name;
  };
  const space = document.body.dataset.space; // what Space and CC64 are: 'Sustain', 'Hold' (shared/shell.js), a page's own
  const wheel = I?.modWheel && params.find((p) => p.id === (typeof I.modWheel === 'string' ? I.modWheel : I.modWheel.param));
  const volume = I?.chain?.volume && params.find((p) => p.id === I.chain.volume);
  return {
    ctl1: own(64) ?? (space === 'Hold' ? 'Hold: keys stay down' : space === 'Sustain' ? 'Sustain pedal' : space || 'nothing here'),
    ctl2: own(66) ?? 'Sostenuto: holds the keys down as it goes down',
    toe1: own(67) ?? (I?.strike === false ? 'Soft pedal: nothing here (how hard a key is struck doesn\'t matter)' : 'Soft pedal: softer strikes'),
    toe2: 'nothing here',
    exp1: own(7, true) ?? (volume ? `${volume.label}: toe down its top, heel down silent` : 'Volume: heel down silent'),
    exp2: own(1, true) ?? (wheel ? `${wheel.label} (the mod wheel)` : 'the mod wheel: nothing here'), // on a page without Morph
  };
}

let panel = null;
export function fc300Panel() {
  if (panel) return panel;
  const model = footModel();
  const inputs = new Map(); // input id → its name
  const det = el('details', 'forte-fc300 forte-drawer-own');
  const sum = el('summary', '', 'Roland FC-300');
  const body = el('div', 'forte-fc300-body');
  const { svg, parts } = drawing();
  const status = el('p', 'forte-fc300-status'); status.setAttribute('aria-live', 'polite');
  const legend = el('dl', 'forte-fc300-legend');
  const buttons = el('div', 'forte-fc300-buttons');
  const driveB = el('button', '', 'Let Forte drive it'); driveB.type = 'button';
  driveB.title = 'Put the FC-300 in its System Exclusive mode: each switch down while held, the preset on its display (the browser asks first to let this page talk SysEx to it)';
  const backB = el('button', '', 'Hand it back'); backB.type = 'button'; backB.hidden = true;
  backB.title = 'Take the FC-300 out of its System Exclusive mode, as its MODE button does';
  buttons.append(driveB, backB);
  const note = el('p', 'forte-fc300-note');
  const screen = el('div', 'forte-fc300-lcd'); screen.hidden = true; screen.setAttribute('aria-label', 'What its LCD shows');
  body.append(svg, screen, status, legend, buttons, note);
  det.append(sum, body);

  // the instrument's descriptor: what each pedal does
  let I = null, params = [], meaning = meanings(null, []);
  const rows = {};
  const ROWS = [['ctl1', 'CTL 1'], ['ctl2', 'CTL 2'], ['toe1', 'EXP 1 toe'], ['exp1', 'EXP 1'], ['exp2', 'EXP 2'], ['toe2', 'EXP 2 toe'], ['numbers', '1–5']];
  for (const [k, name] of ROWS) { const dt = el('dt', '', name), dd = el('dd', ''); legend.append(dt, dd); rows[k] = { dt, dd }; }
  const words = () => {
    for (const [k] of ROWS) rows[k].dd.textContent = meaning[k];
    rows.numbers.dt.textContent = driving ? '▲ ▼, 1–5' : '1–5';
    rows.numbers.dd.textContent = driving ? 'Presets: ▲ ▼ the next and the one before, 1–5 the five around it' : 'Presets in the menu\'s order (▲ for 6–10)';
    rows.toe1.dd.textContent = `${meaning.toe1} (a press down, the next up)`;
    rows.toe2.dd.classList.add('none');
    morphed();
  };
  // EXP 2 moves the page's Morph (shared/midi.js footMorph), which comes once the presets are ready
  const MORPH = 'Morph: heel down its From preset, toe down its To one';
  const morphed = () => { const t = document.querySelector('#forte-morph-t') ? MORPH : meaning.exp2; if (rows.exp2.dd.textContent !== t) rows.exp2.dd.textContent = t; };
  const slug = document.body.dataset.instrument;
  if (slug) {
    import(new URL(`../${slug}/src/${slug}-instrument.js`, import.meta.url).href).then((m) => {
      I = m.INSTRUMENT; params = (I.groups ?? []).flatMap((g) => g.params); meaning = meanings(I, params); words(); draw();
    }, () => {});
  }

  // ---- drawing, at most once a frame ----
  let frame = 0;
  const request = () => { if (!frame) frame = requestAnimationFrame(draw); };
  function draw() {
    frame = 0;
    morphed();
    const lit = (key, on) => parts[key]?.classList.toggle('on', !!on);
    for (const k of ['down', 'up', 'ctl1', 'ctl2', 'toe1', 'toe2']) lit(k, model.down[k]);
    if (driving) lit('toe1', soft);
    for (const i of [1, 2]) {
      const v = model.exp[`exp${i}`], h = v === null ? 0 : (v / 127) * 128;
      parts[`fill${i}`].setAttribute('height', h.toFixed(1)); parts[`fill${i}`].setAttribute('y', (140 - h).toFixed(1));
      parts[`exp${i}`].classList.toggle('known', v !== null);
    }
    // the number pedals' lights: the preset playing (driven), else the patch it last sent
    const index = driving ? presetIndex() : model.program;
    const slot = index === null || index < 0 ? -1 : index % 5;
    const green = slot >= 0 && (driving ? Math.floor(index / 5) % 2 === 1 : index % 10 >= 5);
    for (let i = 0; i < 5; i++) {
      const g = parts[`number${i + 1}`];
      g.classList.toggle('red', i === slot && !green); g.classList.toggle('green', i === slot && green);
      g.classList.toggle('on', !!model.down[`number${i + 1}`]);
    }
    parts.digits.textContent = index === null || index < 0 ? '---' : String(index + 1).padStart(3, '0');
    parts.lcd.textContent = driving ? 'Forte' : '';
    svg.classList.toggle('driven', driving);
    screen.hidden = !driving;
  }

  // ---- driving it, over SysEx ----
  let link = null, port = null, driving = false, soft = false, busy = false;
  const foot = createInput((d) => pageMIDI()?.onMIDI({ data: d }), pageMIDI()?.controllers ?? {}, { device: true });
  const say = (t) => { status.textContent = t; };
  const access = () => { link ??= navigator.requestMIDIAccess({ sysex: true }).catch((e) => { link = null; throw e; }); return link; };
  const live = (all) => [...all.values()].filter((p) => p.state !== 'disconnected');
  // which output it listens on, and at which Device ID: ask each (the one its input's name first)
  async function find() {
    const acc = await access();
    const names = new Set(inputs.values()), wanted = prefs().name;
    const outs = live(acc.outputs).sort((a, b) => (names.has(b.name) || b.name === wanted) - (names.has(a.name) || a.name === wanted));
    for (const out of outs) {
      const got = await new Promise((resolve) => {
        const ins = live(acc.inputs);
        const done = (r) => { clearTimeout(timer); for (const i of ins) i.removeEventListener('midimessage', on); resolve(r); };
        const on = (e) => { const ev = event(parse(e.data)); if (ev?.mode) done({ out, inp: e.target, dev: ev.dev, mode: ev.mode }); };
        const timer = setTimeout(() => done(null), ANSWER);
        for (const i of ins) i.addEventListener('midimessage', on);
        for (const m of ASK) out.send(m);
      });
      if (got) return got;
    }
    return null;
  }
  const send = (msgs) => { if (!port) return; try { for (const m of msgs) port.out.send(m); } catch { /* gone */ } };
  const show = () => {
    if (!driving || !port) return;
    const list = presetChoices(), index = presetIndex();
    const title = I?.name ?? document.title.split(/[—|·]/)[0].trim(), name = index >= 0 ? list[index]?.text ?? '' : `${list.length} presets`;
    send(face(port.dev, { index, count: list.length, name: list[index]?.text ?? '', title, soft }));
    screen.replaceChildren(el('span', '', title.slice(0, 16)), el('span', '', name.slice(0, 16)));
  };
  const onSysex = (e) => {
    const ev = event(parse(e.data));
    if (!ev || !port || ev.dev !== port.dev) return;
    if (ev.mode) { // a mode change: its MODE button, or a power-up (in Standard mode)
      model.sysex(ev);
      if (ev.mode !== 'sysex' && driving) stopDriving('It left its System Exclusive mode (its MODE button, or it was switched off): it sends as it comes again.');
      if (ev.mode === 'sysex' && !driving) startDriving(port);
      request();
      return;
    }
    model.sysex(ev);
    const out = drive(ev, { soft, index: presetIndex(), count: presetChoices().length });
    soft = out.soft;
    for (const d of out.send) foot.take(d);
    if (out.morph !== null && !footMorph(out.morph)) foot.take([0xb0, 1, out.morph]);
    if (out.preset !== null) choosePreset(out.preset);
    if (ev.pedal === 'toe1' || ev.pedal === 'up' || ev.pedal === 'down') show();
    request();
  };
  function startDriving(p) {
    port = p; driving = true; model.mode = 'sysex';
    port.inp.removeEventListener('midimessage', onSysex);
    port.inp.addEventListener('midimessage', onSysex);
    remember({ drive: true });
    driveB.hidden = true; backB.hidden = false;
    say('Forte drives it: each switch is down while your foot holds it, and its display shows the preset.');
    note.textContent = 'While Forte drives it, it sends nothing to other apps (MainStage, a DAW). Hand it back, or switch it off and on, to use it there.';
    words(); show(); request();
  }
  function stopDriving(why) {
    if (driving) foot.letGo();
    driving = false; soft = false; model.mode = 'standard';
    driveB.hidden = false; backB.hidden = true;
    say(why); note.textContent = standardNote; words(); request();
  }
  const standardNote = 'As it comes, each switch latches: a press puts it down, the next lifts it. Forte can drive it instead, each switch down only while held and the preset on its display. The browser asks first; nothing is written to it.';
  async function take({ quiet = false, auto = false } = {}) {
    if (busy || driving) return;
    busy = true; driveB.disabled = true;
    if (!quiet) say('Looking for it…');
    try {
      const got = await find();
      if (!got) { if (!quiet) say('It didn\'t answer. Is a MIDI cable from your interface\'s MIDI OUT to the FC-300\'s MIDI IN? Its replies need its MIDI OUT to the interface\'s IN, as for playing.'); return; }
      if (got.mode !== 'sysex') {
        if (auto && !prefs().drive) return; // found by itself: left as it is until asked
        for (const m of enter(got.dev)) got.out.send(m);
      }
      startDriving(got);
    } catch (e) {
      if (!quiet) say(e?.name === 'SecurityError' || e?.name === 'NotAllowedError' ? 'The browser didn\'t let this page talk SysEx to it. Allow MIDI device control for this site, then try again.' : 'No MIDI ports to reach it on.');
    } finally { busy = false; driveB.disabled = false; }
  }
  driveB.addEventListener('click', () => take());
  backB.addEventListener('click', () => {
    if (port) send(leave(port.dev));
    remember({ drive: false });
    stopDriving('Handed back: it went on to its next mode, as its MODE button would. Press MODE (or ▼ and ▲ together) until STANDARD lights, or switch it off and on.');
  });
  document.addEventListener('forte-preset', () => { show(); request(); });
  document.querySelector('#preset')?.addEventListener('change', () => setTimeout(() => { show(); request(); }, 0));

  const showSection = () => {
    if (det.isConnected || !document.querySelector('#forte-drawer')) return; // in a plugin's window: nothing
    document.dispatchEvent(new CustomEvent('forte-drawer', { detail: { section: 'fc300', element: det } }));
  };
  say('As it comes: it plays Forte as it is (Standard mode, channel 1).');
  note.textContent = standardNote;
  words(); draw();

  panel = {
    element: det, model,
    async input(id, name, connected) {
      if (!connected) {
        inputs.delete(id);
        if (!inputs.size) { if (driving) stopDriving('Its MIDI interface went away.'); say('Not plugged in: its interface isn\'t there.'); }
        return;
      }
      const first = !inputs.size;
      inputs.set(id, name);
      if (name) remember({ name });
      showSection();
      if (first && !driving) {
        say('As it comes: it plays Forte as it is (Standard mode, channel 1).');
        if (await granted()) take({ quiet: true, auto: true }); // once allowed, find it by itself: drive it again if it was, or if it is in its SysEx mode still
      }
    },
    midi(id, data) { if (!inputs.has(id)) return; model.midi(data); request(); },
  };
  return panel;
}
