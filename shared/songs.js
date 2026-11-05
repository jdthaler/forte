// songs.js — Songs, on every instrument page: a song from a MIDI file, played live by the page's
// instrument, its keys going down on screen as it plays. ♪ Songs, in the header after Tour, opens
// a card with Forte's own songs (songs/index.json: public-domain pieces, written by
// tools/make-songs.mjs), Open a MIDI file…, and the song's ▶ Play / ■ Stop, where it is (drag to
// move) and its speed. A .mid dropped anywhere on the page opens and plays too.
//
// A song plays as a MIDI keyboard would: its messages go through shared/midi.js createInput to
// the page's own MIDI handler (pageMIDI, which every page gives as it builds itself), so the
// velocity curve, the pedals, pitch bend and the instrument's own controllers work as they do
// from a keyboard. Of a General MIDI file only what an instrument can play is kept
// (shared/midifile.js playable: no program changes, volume or percussion), and the song moves by
// whole octaves to fit the instrument's keys (fit) when most of it would fall outside them.
// Panic, a tour starting, or leaving the page stops it. The page's settings stay as they are.

import { parseMIDI, playable, fit, transpose } from './midifile.js';
import { createInput, pageMIDI } from './midi.js';
import { tourLayout } from './layout.js';
import { inPlugin } from './in-plugin.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const btn = (text, title, cls) => { const b = el('button', cls, text); b.type = 'button'; if (title) { b.title = title; b.setAttribute('aria-label', title); } return b; };
const toast = (msg) => import('./shell.js').then((m) => m.toast(msg), () => {});
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];
const MIDI_FILE = /\.(mid|midi|smf|kar|rmi)$/i;

const root = document.body.dataset.root ?? '../';
// not in a plugin's window, where the plugin plays the notes (shared/in-plugin.js)
if (document.body.dataset.instrument && $('#keyboard') && !inPlugin) mount();

function mount() {
  const instrument = $('body > header h1')?.textContent.trim() || 'instrument';

  // ♪ Songs, in the header after Tour and before How it works, in their look
  const start = btn('', 'Songs: play a MIDI file on this instrument', 'forte-about forte-songs-start');
  start.setAttribute('aria-label', 'Songs: play a MIDI file on this instrument');
  start.setAttribute('aria-pressed', 'false');
  start.append(Object.assign(el('span', 'forte-about-i forte-songs-glyph'), { ariaHidden: 'true', textContent: '♪' }), el('span', 'forte-about-label', 'Songs'));
  // How it works (shared/notes.js) is in the header by now; a tour (shared/tour.js) puts Tour before both
  const about = $('body > header .forte-about:not(.forte-get):not(.forte-tour-start)');
  if (about) about.before(start); else $('body > header .brand')?.after(start);

  // the card: over the controls, just above the keys, as the tour's; on a phone at the top of the views
  const card = el('section', 'forte-songs');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'forte-songs-title');
  card.hidden = true;
  const head = el('div', 'forte-songs-head');
  const kicker = el('span', 'forte-songs-kicker', `Songs · played live on the ${instrument}`);
  const fold = btn('', 'Fold the songs away to see the views', 'forte-songs-fold');
  fold.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6 8 10.5 12.5 6"/></svg>';
  fold.setAttribute('aria-expanded', 'true');
  const close = btn('✕', 'Stop the song and close (Esc)', 'forte-songs-close');
  head.append(kicker, fold, close);
  const title = el('h2', 'forte-songs-title', 'Play a song');
  title.id = 'forte-songs-title';
  const list = el('ul', 'forte-songs-list');
  const transport = el('div', 'forte-songs-transport');
  const play = btn('▶ Play', 'Play the song', 'forte-songs-play');
  const where = document.createElement('input');
  Object.assign(where, { type: 'range', min: 0, max: 1000, step: 1, value: 0, className: 'forte-songs-where' });
  where.setAttribute('aria-label', 'Where in the song');
  const time = el('span', 'forte-songs-time', '0:00');
  const speed = document.createElement('select');
  speed.className = 'forte-songs-speed';
  speed.title = 'Speed';
  speed.setAttribute('aria-label', 'Speed');
  for (const s of SPEEDS) speed.add(new Option(`${Math.round(s * 100)} %`, s));
  speed.value = '1';
  transport.append(play, where, time, speed);
  const fileRow = el('div', 'forte-songs-file');
  const open = btn('Open a MIDI file…', 'Play a MIDI file of your own (.mid) on this instrument', 'forte-songs-open');
  const picker = Object.assign(document.createElement('input'), { type: 'file', accept: '.mid,.midi,.smf,.kar,.rmi,audio/midi,audio/x-midi', hidden: true });
  fileRow.append(open, el('span', 'forte-songs-or', 'or drop one on the page'), picker);
  const note = el('p', 'forte-songs-note');
  note.hidden = true;
  card.append(head, title, transport, note, list, fileRow); // the transport high, in sight on a phone
  const phone = matchMedia('(max-width: 600px), (max-width: 1050px) and (max-height: 500px)'); // as shared/layout.css
  const views = $('#views');
  const put = () => { if (phone.matches && views) views.prepend(card); else document.body.appendChild(card); };
  put();
  phone.addEventListener('change', put);

  // ---- the songs --------------------------------------------------------------------------
  let catalogue = null;
  async function load() {
    if (catalogue) return catalogue;
    catalogue = (async () => {
      const index = await (await fetch(`${root}songs/index.json`)).json();
      return index.map((s) => ({ ...s, url: `${root}songs/${s.file}` }));
    })().catch(() => []);
    const songs = await catalogue;
    list.replaceChildren(...songs.map((s) => {
      const li = el('li');
      const b = btn('', `Play ${s.title} (${s.by})`, 'forte-songs-song');
      b.dataset.song = s.file;
      b.append(el('span', 'forte-songs-name', s.title), el('span', 'forte-songs-by', s.by));
      b.addEventListener('click', async () => { b.blur(); choose(await fetchSong(s), s.title, true); });
      li.append(b);
      return li;
    }));
    return songs;
  }
  async function fetchSong(s) {
    if (!s.parsed) s.parsed = parseMIDI(await (await fetch(s.url)).arrayBuffer());
    return s.parsed;
  }

  // ---- playing ----------------------------------------------------------------------------
  let song = null; // { name, events, duration, shift }
  let pos = 0, playing = false, t0 = 0, rate = 1, next = 0, timer = 0, input = null, dragging = false;
  const now = () => ((performance.now() - t0) / 1000) * rate;

  function choose(parsed, name, go) {
    stop();
    const page = pageMIDI();
    let events = playable(parsed.events, { controllers: page?.controllers });
    const [lo, hi] = tourLayout.keys?.kb.bounds() ?? [0, 127];
    const shift = fit(events, lo, hi);
    events = transpose(events, shift);
    song = { name, events, duration: Math.max(parsed.duration, events.at(-1)?.t ?? 0), shift };
    pos = 0;
    title.textContent = name;
    for (const b of list.querySelectorAll('.forte-songs-song')) b.setAttribute('aria-current', String(b.querySelector('.forte-songs-name').textContent === name));
    const notes = events.filter((e) => (e.data[0] & 0xf0) === 0x90 && e.data[2] > 0);
    const out = notes.filter((e) => e.data[1] < lo || e.data[1] > hi).length;
    const said = [];
    if (shift) said.push(`Played ${Math.abs(shift / 12) === 1 ? 'an octave' : `${Math.abs(shift / 12)} octaves`} ${shift > 0 ? 'up' : 'down'} to fit the keys.`);
    if (out) said.push(`${out} of its ${notes.length} notes are beyond this instrument’s keys and stay silent.`);
    if (!notes.length) said.push('This file has no notes to play.');
    note.textContent = said.join(' ');
    note.hidden = !said.length;
    show();
    open_();
    if (!notes.length) return;
    // a file dropped before any click on the page: the browser won't let the sound start yet
    if (go && navigator.userActivation && !navigator.userActivation.hasBeenActive) { toast('Press ▶ Play to hear it'); return; }
    if (go) begin();
  }

  async function begin() {
    if (!song || playing) return;
    const page = pageMIDI();
    if (!page) { toast('This page can’t play songs yet'); return; }
    playing = true;
    show();
    // the keys in sight, and the audio running before the first note (as a tour's)
    const keys = song.events.filter((e) => (e.data[0] & 0xf0) === 0x90).map((e) => e.data[1]);
    if (keys.length) tourLayout.keys?.reveal(Math.min(...keys), Math.max(...keys));
    $('#start')?.click();
    for (let i = 0; i < 80 && !tourLayout.audio(); i++) await new Promise((r) => setTimeout(r, 100));
    if (!playing) return;
    input = createInput((data) => page.onMIDI({ data }), page.controllers);
    if (pos >= song.duration) pos = 0;
    t0 = performance.now() - (pos / rate) * 1000;
    next = song.events.findIndex((e) => e.t >= pos);
    if (next < 0) next = song.events.length;
    tick();
  }
  function tick() {
    if (!playing) return;
    const t = now();
    while (next < song.events.length && song.events[next].t <= t + 0.002) input.take(song.events[next++].data);
    pos = Math.min(t, song.duration);
    show();
    if (next >= song.events.length && t >= song.duration) { stop(); pos = 0; show(); return; }
    const wait = next < song.events.length ? ((song.events[next].t - t) * 1000) / rate : 50;
    timer = setTimeout(tick, Math.max(0, Math.min(50, wait)));
  }
  function stop() {
    if (!playing) return;
    playing = false;
    clearTimeout(timer);
    input?.letGo();
    input = null;
    show();
  }
  function seek(s) {
    const was = playing;
    stop();
    pos = Math.max(0, Math.min(song?.duration ?? 0, s));
    if (was) begin(); else show();
  }

  function show() {
    const d = song?.duration ?? 0;
    play.disabled = !song || !song.events.length;
    where.disabled = !song;
    play.textContent = playing ? '■ Stop' : '▶ Play';
    play.title = playing ? 'Stop the song' : 'Play the song';
    play.setAttribute('aria-label', play.title);
    if (!dragging) where.value = d ? String(Math.round((1000 * pos) / d)) : '0';
    where.setAttribute('aria-valuetext', `${clock(pos)} of ${clock(d)}`);
    time.textContent = song ? `${clock(pos)} / ${clock(d)}` : '0:00';
    start.classList.toggle('playing', playing);
  }
  show();

  function open_() {
    if (!card.hidden) return;
    // one card at a time: a tour ends when the songs open
    if ($('.forte-tour-start')?.getAttribute('aria-pressed') === 'true') $('.forte-tour-close')?.click();
    card.hidden = false;
    card.classList.remove('folded');
    fold.setAttribute('aria-expanded', 'true');
    document.body.classList.add('songs-card');
    start.setAttribute('aria-pressed', 'true');
    load();
    if (phone.matches) {
      const top = card.getBoundingClientRect().top, under = $('body > header')?.getBoundingClientRect().bottom ?? 0;
      if (top < under || top > innerHeight / 2) scrollTo({ top: Math.max(0, scrollY + top - under - 8) });
    }
  }
  function shut() {
    stop();
    card.hidden = true;
    document.body.classList.remove('songs-card');
    start.setAttribute('aria-pressed', 'false');
  }

  start.addEventListener('click', () => { if (card.hidden) open_(); else shut(); start.blur(); });
  close.addEventListener('click', () => { shut(); start.focus({ preventScroll: true }); });
  fold.addEventListener('click', () => {
    const f = card.classList.toggle('folded');
    fold.title = f ? 'Show the songs' : 'Fold the songs away to see the views';
    fold.setAttribute('aria-label', fold.title);
    fold.setAttribute('aria-expanded', String(!f));
    fold.blur();
  });
  play.addEventListener('click', () => { if (playing) stop(); else begin(); play.blur(); });
  where.addEventListener('input', () => { dragging = true; if (song) time.textContent = `${clock((+where.value / 1000) * song.duration)} / ${clock(song.duration)}`; });
  where.addEventListener('change', () => { dragging = false; if (song) seek((+where.value / 1000) * song.duration); where.blur(); });
  speed.addEventListener('change', () => {
    const was = playing;
    stop();
    rate = +speed.value;
    if (was) begin();
    speed.blur();
  });
  open.addEventListener('click', () => { picker.click(); open.blur(); });
  picker.addEventListener('change', () => { if (picker.files[0]) openFile(picker.files[0]); picker.value = ''; });
  $('#panic')?.addEventListener('click', stop);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !card.hidden && !document.querySelector('dialog[open]')) shut(); });
  // a tour starting stops the song and closes the card (shared/tour.js presses Tour)
  document.addEventListener('click', (e) => { if (e.target.closest?.('.forte-tour-start') && !card.hidden) shut(); }, true);
  addEventListener('pagehide', stop);

  async function openFile(file) {
    try {
      const parsed = parseMIDI(await file.arrayBuffer());
      choose(parsed, parsed.name || file.name.replace(MIDI_FILE, ''), true);
    } catch (err) {
      toast(`Can’t play ${file.name}: ${err.message}`);
    }
  }

  // ---- a file dropped on the page -------------------------------------------------------------
  const drop = el('div', 'forte-songs-drop');
  drop.append(el('div', 'forte-songs-drop-text', `Drop a MIDI file to play it on the ${instrument}`));
  drop.hidden = true;
  document.body.appendChild(drop);
  const files = (e) => [...(e.dataTransfer?.items ?? [])].some((i) => i.kind === 'file');
  let depth = 0;
  addEventListener('dragenter', (e) => { if (!files(e)) return; depth++; drop.hidden = false; });
  addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; drop.hidden = true; } });
  addEventListener('dragover', (e) => { if (files(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  addEventListener('drop', (e) => {
    depth = 0;
    drop.hidden = true;
    const f = [...(e.dataTransfer?.files ?? [])][0];
    if (!f) return;
    e.preventDefault();
    if (!MIDI_FILE.test(f.name) && !/midi/.test(f.type)) { toast(`${f.name} isn’t a MIDI file (.mid)`); return; }
    openFile(f);
  });
}
