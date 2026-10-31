// tour.js — a guided tour of an instrument's physics, on its page. A few steps, each showing the
// views it is about, setting the instrument up and playing a phrase on the keys, while a card says
// what to listen for and to look at, and why. Tour in the views' bar starts it; the card's Back
// and Next step through it, ▶ plays a step again, and ✕ (or Esc) ends it. The tour changes
// nothing for good: the views go back to the ones the player turned on, and every setting but the
// volume to what it was.
//
// Each instrument writes its tour in <slug>/src/<slug>-tour.js, which its page loads
// (<script type="module" src="src/<slug>-tour.js"></script>):
//
//   import { tour, chord, run, note } from '../../shared/tour.js';
//   export const TOUR = tour('gongs', [
//     { title: 'A plate, struck', views: ['Gong surface', 'Spectrum'], preset: 'Tam-tam: …',
//       set: { strike: 0.3 }, play: [note('A2', { dur: 4, vel: 0.4 }), chord('A2 E3', { at: 4 })],
//       text: 'What to listen for, in the notes’ Markdown (shared/markdown.js).' },
//   ]);
//
// A step:
//   title   a few words
//   text    what to listen for and look at, and why (Markdown: paragraphs, lists, **bold**,
//           *italics*, `code`, links; a paragraph indented by two spaces is a display equation)
//   views   the views it shows, by name (as their toggles say): the rest are hidden during the
//           step (a step without views keeps the last step's)
//   preset  a factory preset, by name: the step starts from it, otherwise from the defaults
//   set     parameters (by contract id: shared/presets.js) changed from there
//   play    what the keys play from the start of the step: notes { key, at, dur, vel } (key a
//           MIDI number or a name such as 'C4', 'F#3' or 'Bb2'; at and dur in seconds; vel from
//           0 to 1, where on the key it lands, as a finger), { at, set } (parameters changed
//           partway) and { at, pedal: true | false } (Space: the pedal). Arrays nest; note,
//           chord and run (below) make them.
// test/tour-tests.mjs checks every tour against its page: views, presets, parameters and keys.

const NOTE = /^([A-Ga-g])([#♯b♭]?)(-?\d)$/;
const STEPS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
// a key's MIDI number, from a number or a name ('C4' is 60, middle C)
export function midi(k) {
  if (typeof k === 'number') return k;
  const m = NOTE.exec(String(k).trim());
  if (!m) throw new Error(`not a note: ${k}`);
  const acc = { '#': 1, '♯': 1, b: -1, '♭': -1 }[m[2]] ?? 0;
  return 12 * (+m[3] + 1) + STEPS[m[1].toLowerCase()] + acc;
}
const keysOf = (ks) => (Array.isArray(ks) ? ks : String(ks).trim().split(/\s+/)).map(midi);
// one key: { at = 0, dur = 1, vel = 0.6 }
export const note = (k, { at = 0, dur = 1, vel = 0.6 } = {}) => ({ key: midi(k), at, dur, vel });
// keys together ('C4 E4 G4', or an array)
export const chord = (ks, o = {}) => keysOf(ks).map((k) => note(k, o));
// keys one after another, every `step` seconds; each holds for `dur` (default: until the next)
export const run = (ks, { at = 0, step = 0.4, dur, vel = 0.6 } = {}) =>
  keysOf(ks).map((k, i) => note(k, { at: at + i * step, dur: dur ?? step * 0.95, vel }));

// a step's score: every event, flattened and in time order
export const score = (step) => [step.play ?? []].flat(Infinity).filter(Boolean).sort((a, b) => a.at - b.at);
// how long a step plays, s
export const length = (step) => score(step).reduce((t, e) => Math.max(t, e.at + (e.dur ?? 0)), 0);

// A tour: its instrument's id and its steps. In a browser, it also puts Tour in the page's views' bar.
export function tour(id, steps) {
  const t = { id, steps };
  if (typeof document !== 'undefined') mount(t);
  return t;
}

// ---------------------------------------------------------------------------
// the page: the button, the card and the playing (browser only)

async function mount(t) {
  const [{ tourLayout, barTools }, { pageState }, { complete }, { renderMarkdown }] = await Promise.all([
    import('./layout.js'), import('./user-presets.js'), import('./presets.js'), import('./markdown.js'),
  ]);
  const tools = barTools('views');
  if (!tools || !t.steps.length) return;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const btn = (text, title, cls) => { const b = el('button', cls, text); b.type = 'button'; if (title) { b.title = title; b.setAttribute('aria-label', title); } return b; };

  const start = btn('Tour', 'A guided tour of the physics: it plays while it shows you what to listen for', 'forte-tour-start');
  start.setAttribute('aria-label', 'Tour: a guided tour of the physics');
  start.prepend(Object.assign(el('span', 'forte-tour-glyph'), { ariaHidden: 'true', textContent: '▶' }));
  tools.prepend(start);

  // the card
  const card = el('section', 'forte-tour');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'forte-tour-title');
  card.hidden = true;
  const head = el('div', 'forte-tour-head');
  const kicker = el('span', 'forte-tour-kicker');
  const fold = btn('', 'Fold the tour away to see the views', 'forte-tour-fold');
  fold.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6 8 10.5 12.5 6"/></svg>';
  const close = btn('✕', 'End the tour (Esc): your views and settings come back', 'forte-tour-close');
  head.append(kicker, fold, close);
  const title = el('h2', 'forte-tour-title');
  title.id = 'forte-tour-title';
  const text = el('div', 'forte-tour-text');
  const nav = el('div', 'forte-tour-nav');
  const back = btn('◀ Back', 'The step before', 'forte-tour-back');
  const again = btn('▶ Play', 'Play this step again', 'forte-tour-play');
  const next = btn('Next ▶', 'The next step', 'forte-tour-next');
  nav.append(back, again, next);
  card.append(head, title, text, nav);
  // over the controls, just above the keys; on a phone, where the page scrolls, at the top of the
  // views, in the page's flow (there is no room to float it over anything)
  const phone = matchMedia('(max-width: 600px), (max-width: 1050px) and (max-height: 500px)'); // as shared/layout.css
  const views = $('#views');
  const place = () => { if (phone.matches && views) views.prepend(card); else document.body.appendChild(card); };
  place();
  phone.addEventListener('change', place);
  // on a phone, the card's top in sight below the header
  const inSight = () => {
    if (!phone.matches || card.hidden) return;
    const top = card.getBoundingClientRect().top, under = $('body > header')?.getBoundingClientRect().bottom ?? 0;
    if (top < under || top > innerHeight / 2) scrollTo({ top: Math.max(0, scrollY + top - under - 8) });
  };

  let at = -1, saved = null, timers = [], pressed = new Set(), pedal = false, playing = false, marked = [];
  const kept = (v) => (v && 'volume' in v ? { volume: v.volume } : {});
  const space = (on) => { pedal = on; window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: 'Space', key: ' ' })); };

  function hush() {
    for (const id of timers) clearTimeout(id);
    timers = [];
    const kb = tourLayout.keys?.kb;
    for (const k of pressed) kb?.release(k);
    pressed.clear();
    if (pedal) space(false);
    playing = false;
    again.textContent = '▶ Play';
    again.title = 'Play this step again';
  }

  // the instrument as the step has it: the defaults (or a preset), its changes, the player's volume
  function setUp(step) {
    if (!pageState.set || !saved) return;
    const pr = step.preset ? pageState.instrument.presets?.find((p) => p.name === step.preset) : null;
    const want = complete(pageState.params, { ...pr?.p, ...step.set, ...kept(saved) });
    apply(want);
    const sel = $('#preset'), i = pr ? pageState.instrument.presets.indexOf(pr) : -1;
    if (sel) sel.value = i >= 0 && !step.set ? String(i) : '';
  }
  function apply(want) {
    const now = pageState.get();
    if (Object.keys(want).some((k) => now[k] !== want[k])) pageState.set(want);
  }
  // the controls a step changes, marked while it lasts
  function mark(ids) {
    for (const m of marked) m.classList.remove('forte-tour-mark');
    marked = ids.map((id) => document.getElementById(`p-${id}`)?.closest('.param')).filter(Boolean);
    for (const m of marked) m.classList.add('forte-tour-mark');
  }
  // which of the page's views a step names (by its toggle's name, or its key)
  function viewKeys(names) {
    const all = tourLayout.views(), low = (s) => s.toLowerCase();
    return names.map((n) => all.find((v) => low(v.name) === low(n) || v.key === low(n))?.key).filter(Boolean);
  }

  // the audio, started by the click on Tour; notes wait until it runs (for a few seconds at most)
  async function ready() {
    for (let i = 0; i < 80 && !tourLayout.audio(); i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 150));
  }
  async function play() {
    hush();
    const step = t.steps[at], events = score(step), mine = at;
    if (!events.length) return;
    playing = true;
    again.textContent = '■ Stop';
    again.title = 'Stop playing';
    const keys = events.filter((e) => e.key !== undefined).map((e) => e.key);
    if (keys.length) tourLayout.keys?.reveal(Math.min(...keys), Math.max(...keys));
    await ready();
    if (at !== mine || !playing) return;
    const kb = tourLayout.keys?.kb;
    const later = (s, fn) => timers.push(setTimeout(fn, Math.max(0, s * 1000)));
    for (const e of events) {
      if (e.key !== undefined && kb) {
        later(e.at, () => { if (pressed.has(e.key)) kb.release(e.key); kb.press(e.key, e.vel ?? 0.6); pressed.add(e.key); });
        later(e.at + (e.dur ?? 1), () => { if (pressed.delete(e.key)) kb.release(e.key); });
      } else if (e.set) later(e.at, () => apply(complete(pageState.params, { ...pageState.get(), ...e.set })));
      else if (e.pedal !== undefined) later(e.at, () => { if (e.pedal !== pedal) space(e.pedal); });
    }
    later(length(step) + 0.05, () => { if (at === mine) hush(); });
  }

  function go(i) {
    hush();
    at = Math.max(0, Math.min(t.steps.length - 1, i));
    const step = t.steps[at];
    setUp(step);
    if (step.views) tourLayout.show(viewKeys(step.views));
    mark(Object.keys(step.set ?? {}));
    kicker.textContent = `Physics tour · ${at + 1} of ${t.steps.length}`;
    title.textContent = step.title;
    text.innerHTML = renderMarkdown(step.text ?? '').html;
    text.scrollTop = 0;
    back.disabled = at === 0;
    next.textContent = at === t.steps.length - 1 ? 'Done' : 'Next ▶';
    next.title = at === t.steps.length - 1 ? 'End the tour: your views and settings come back' : 'The next step';
    again.disabled = !score(step).length;
    inSight();
    play();
  }

  function begin() {
    if (saved) return;
    saved = pageState.get?.() ?? {};
    saved.__preset = $('#preset')?.value ?? '';
    $('#start')?.click(); // this click is the gesture that lets the audio start
    card.hidden = false;
    card.classList.remove('folded');
    document.body.classList.add('touring-card');
    start.setAttribute('aria-pressed', 'true');
    go(0);
    next.focus({ preventScroll: true });
  }
  function end() {
    if (!saved) return;
    hush();
    mark([]);
    const { __preset, ...was } = saved;
    saved = null;
    if (pageState.set && Object.keys(was).length) apply(complete(pageState.params, was));
    const sel = $('#preset');
    if (sel) sel.value = __preset;
    tourLayout.show(null);
    card.hidden = true;
    document.body.classList.remove('touring-card');
    start.setAttribute('aria-pressed', 'false');
    at = -1;
  }

  start.addEventListener('click', () => { if (saved) end(); else begin(); start.blur(); });
  close.addEventListener('click', () => { end(); start.focus({ preventScroll: true }); });
  back.addEventListener('click', () => go(at - 1));
  next.addEventListener('click', () => { if (at === t.steps.length - 1) end(); else go(at + 1); });
  again.addEventListener('click', () => { if (playing) hush(); else play(); again.blur(); });
  fold.addEventListener('click', () => {
    const f = card.classList.toggle('folded');
    fold.title = f ? 'Show the tour' : 'Fold the tour away to see the views';
    fold.setAttribute('aria-label', fold.title);
    fold.setAttribute('aria-expanded', String(!f));
  });
  fold.setAttribute('aria-expanded', 'true');
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && saved && !document.querySelector('dialog[open]')) end(); });
  // leaving the page mid-tour leaves the player's settings as they were, not the tour's
  addEventListener('pagehide', end);
}
