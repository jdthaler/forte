// organ-main.js — the page: wires the shell (shared/shell.js) to the engine, the console (drawbars,
// switches, swell pedal) and the visualisations. The worklet runs the engine, the C++ built as
// WebAssembly (organ-wasm.js), and the views call its model.

import { createShell } from '../../shared/shell.js';
import { INSTRUMENT } from './organ-instrument.js';
import { ALL_PARAMS } from './organ-params.js';
import { DRAWBARS, NUM_WHEELS, PC_NAMES } from './tonewheels.js';
import { wasmModel } from './organ-wasm.js';
import { SpectrogramView, animate } from '../../shared/views.js';
import { GeneratorView, LeslieView, OutputView, drawScanner, BAR_COLORS, useModel } from './organ-viz.js';
import { controlOwns, focusedByPointer, unfocus } from '../../shared/focus.js';
import { tuningRatio } from '../../shared/tuning.js';
import { rotarySelector } from '../../shared/faces.js';
import { paramsStore } from '../../shared/registry.js';

const $ = (s) => document.querySelector(s);
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const noteName = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);

// The model the views call: the engine's, from the same C++, built as WebAssembly.
const M = await wasmModel();
useModel(M);
const { keyAnalysis, keyWheel, percWheel, centsOff, gearFreq, etFreq, drawbarGain, wheelSpec } = M;
const wheelName = (w) => { const s = wheelSpec(w); return `${PC_NAMES[s.pc]}${s.octave}`; };
const GEN_KEYS = new Set(ALL_PARAMS.filter((p) => p.kind === 'gen').map((p) => p.id));

let focusKey = 60, lastState = null;
const shell = createShell({
  ...INSTRUMENT,
  store: paramsStore('organ'), // the page's own name for its settings, from before the shell
  keyVelocity: 100 / 127,      // the computer keys play MIDI 100
  arrows: { param: 'expression', step: 0.05 },
  onAudio: (a) => { a.analyser.smoothingTimeConstant = 0.6; output.setAnalyser(a.analyser); spectro.setAnalyser(a.analyser); },
  onMessage: (m) => {
    if (m.type !== 'state') return;
    lastState = m;
    leslieView.set(m);
    const rpm = 1200 * m.shaft * (P().mains / 60);
    $('#shaft').textContent = m.shaft > 0.001 ? `${rpm.toFixed(0)} rpm · ${(1200 * Math.log2(m.shaft)).toFixed(0)} ¢` : 'stopped';
    $('#leslie-read').textContent = P().leslieOn ? `horn ${(m.hornHz * 60).toFixed(0)} rpm · drum ${(m.drumHz * 60).toFixed(0)} rpm` : '';
  },
  onNoteOn: (key) => { focusKey = key; refreshFocus(); refreshActivity(); },
  onNoteOff: () => refreshActivity(),
  onPanic: () => refreshActivity(),
  // the engine rebuilds its generator itself when a 'gen' parameter changes (organ-model.h)
  onParam: (id) => {
    if (id === '*' || GEN_KEYS.has(id)) refreshGenerator();
    refreshConsole(); refreshFocus(); refreshActivity(); refreshSwell();
  },
});
const P = () => shell.P;
const setP = (changes) => shell.set(changes);
$('#preset').options[0].text = 'Registrations & setups…';

// Space flips the Leslie between slow and fast (and out of bypass), ` the motor
const typing = (t) => t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['range', 'checkbox'].includes(t.type)));
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || typing(e.target) || controlOwns(e)) return;
  if (e.code === 'Space') { e.preventDefault(); setP({ leslie: P().leslie === 'fast' ? 'slow' : 'fast', leslieOn: true }); }
  else if (e.code === 'Backquote') { e.preventDefault(); setP({ motor: !P().motor }); }
});

// ---------------------------------------------------------------------------
// drawbars and console switches

const drawbarEls = DRAWBARS.map((db, d) => {
  const el = document.createElement('div');
  el.className = `drawbar ${db.color}`;
  el.tabIndex = 0;
  el.setAttribute('role', 'slider');
  el.setAttribute('aria-label', `${db.label} drawbar`);
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '8');
  el.innerHTML = `<div class="slot"><div class="rod"><span></span></div></div><div class="ft">${db.name}</div>`;
  const slot = el.querySelector('.slot');
  const setFromY = (y) => {
    const r = slot.getBoundingClientRect();
    const v = Math.max(0, Math.min(8, Math.round((y - r.top - 14) / 15)));
    setDrawbar(d, v);
  };
  el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); el.focus(); setFromY(e.clientY); });
  el.addEventListener('pointermove', (e) => { if (el.hasPointerCapture(e.pointerId)) setFromY(e.clientY); });
  el.addEventListener('wheel', (e) => { e.preventDefault(); setDrawbar(d, P().drawbars[d] + (e.deltaY > 0 ? 1 : -1)); }, { passive: false });
  el.addEventListener('keydown', (e) => {
    if (focusedByPointer(el)) return; // dragged with the pointer: the arrows go back to the keyboard
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setDrawbar(d, P().drawbars[d] + (e.code === 'ArrowDown' ? 1 : -1)); }
  });
  $('#drawbars').appendChild(el);
  return el;
});

function setDrawbar(d, v) {
  v = Math.max(0, Math.min(8, v));
  if (P().drawbars[d] === v) return;
  const db = [...P().drawbars]; db[d] = v;
  setP({ drawbars: db });
}

// expression (swell) pedal on screen: tablets have no ↑ ↓ keys and no CC 11.
// The engine glides to each new setting, so dragging it is click-free.
const swell = $('#swell');
const setExpression = (v) => setP({ expression: Math.round(Math.max(0, Math.min(1, v)) * 100) / 100 });
const swellFromY = (y) => {
  const r = swell.querySelector('.track').getBoundingClientRect();
  setExpression(1 - (y - r.top - 8) / Math.max(1, r.height - 16));
};
swell.addEventListener('pointerdown', (e) => { swell.setPointerCapture(e.pointerId); swell.focus(); swellFromY(e.clientY); });
swell.addEventListener('pointermove', (e) => { if (swell.hasPointerCapture(e.pointerId)) swellFromY(e.clientY); });
swell.addEventListener('wheel', (e) => { e.preventDefault(); setExpression(P().expression + (e.deltaY > 0 ? -0.02 : 0.02)); }, { passive: false });
swell.addEventListener('keydown', (e) => {
  if (focusedByPointer(swell)) return; // dragged with the pointer: the arrows go back to the keyboard
  const step = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, PageUp: 0.2, PageDown: -0.2 }[e.code];
  if (step !== undefined) setExpression(P().expression + step);
  else if (e.code === 'Home' || e.code === 'End') setExpression(e.code === 'End' ? 1 : 0);
  else return;
  e.preventDefault(); e.stopPropagation();
});

const regString = (a) => `${a[0]}${a[1]} ${a[2]}${a[3]}${a[4]}${a[5]} ${a[6]}${a[7]}${a[8]}`;
$('#registration').addEventListener('change', (e) => {
  const digits = e.target.value.replace(/[^0-8]/g, '');
  if (digits.length === 9) setP({ drawbars: digits.split('').map(Number) });
  else e.target.value = regString(P().drawbars);
  unfocus(e.target);
});

for (const b of document.querySelectorAll('#perc button')) {
  b.addEventListener('click', () => { setP({ [b.dataset.k]: !P()[b.dataset.k] }); unfocus(b); });
}
// The B-3's vibrato: a six-position knob, and its tab that turns it on; off, the knob keeps its place.
const VIB = ['V1', 'C1', 'V2', 'C2', 'V3', 'C3'];
let vibAt = 'C3';
const vibKnob = rotarySelector(VIB, (i) => { vibAt = VIB[i]; setP({ vib: vibAt }); });
$('#vib').appendChild(vibKnob.el);
$('#vib').addEventListener('keydown', (e) => {
  const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
  if (!step) return;
  e.preventDefault(); e.stopPropagation();
  vibAt = VIB[Math.max(0, Math.min(5, VIB.indexOf(vibAt) + step))];
  setP({ vib: vibAt });
});
$('#vib-on').addEventListener('click', (e) => { setP({ vib: P().vib === 'off' ? vibAt : 'off' }); unfocus(e.currentTarget); });
// The Leslie's half-moon (slow, stop, fast), and a tab that bypasses the cabinet.
for (const b of document.querySelectorAll('#leslie button')) {
  b.addEventListener('click', () => { setP({ leslieOn: true, leslie: b.dataset.v }); unfocus(b); });
}
$('#leslie-on').addEventListener('click', (e) => { setP({ leslieOn: !P().leslieOn }); unfocus(e.currentTarget); });
$('#motor').addEventListener('click', (e) => { setP({ motor: !P().motor }); unfocus(e.currentTarget); });

function refreshConsole() {
  P().drawbars.forEach((v, d) => {
    const el = drawbarEls[d];
    el.style.setProperty('--v', v);
    el.querySelector('.rod span').textContent = v;
    el.setAttribute('aria-valuenow', String(v));
    el.querySelector('.slot').style.opacity = d === 8 && P().percOn ? 0.45 : 1;
  });
  $('#registration').value = regString(P().drawbars);
  const press = (b, on) => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); };
  for (const b of document.querySelectorAll('#perc button')) press(b, !!P()[b.dataset.k]);
  if (P().vib !== 'off') vibAt = P().vib;
  vibKnob.show(VIB.indexOf(vibAt));
  $('#vib').setAttribute('aria-valuetext', `${vibAt}${P().vib === 'off' ? ' (off)' : ''}`);
  press($('#vib-on'), P().vib !== 'off');
  for (const b of document.querySelectorAll('#leslie button')) press(b, P().leslie === b.dataset.v);
  $('#leslie').style.setProperty('--tilt', `${{ slow: -16, stop: 0, fast: 16 }[P().leslie] ?? 0}deg`);
  $('#leslie').classList.toggle('bypassed', !P().leslieOn);
  press($('#leslie-on'), P().leslieOn);
  press($('#motor'), P().motor);
}

// ---------------------------------------------------------------------------
// analysis + visualisation

const genView = new GeneratorView($('#generator'), (w) => {
  if (w === null) { $('#gen-caption').textContent = defaultCaption; return; }
  const s = wheelSpec(w);
  const f = (P().tuning === 'et' ? etFreq(w) : gearFreq(w)) * (P().mains / 60) * tuningRatio(P(), w + 23); // wheel 46 = A4, in the keyboard's tuning
  const users = [];
  for (const k of shell.activeKeys()) for (let d = 0; d < 9; d++) if (keyWheel(k, d) === w && P().drawbars[d] > 0) users.push(`${noteName(k)} ${DRAWBARS[d].name}`);
  $('#gen-caption').textContent = `Wheel ${w} · ${wheelName(w)} · ${s.teeth} teeth on the ${s.gear[0]}/${s.gear[1]} gear · ${f.toFixed(3)} Hz · ${centsOff(w) >= 0 ? '+' : ''}${centsOff(w).toFixed(2)} ¢ vs ET`
    + (users.length ? ` · now feeding ${users.join(', ')}` : '');
});
const defaultCaption = $('#gen-caption').textContent;
const leslieView = new LeslieView($('#leslie-view'));
const output = new OutputView($('#output'));
const spectro = new SpectrogramView($('#spectrogram'), { fLo: 30, fHi: 12000 });

function refreshGenerator() {
  for (let w = 1; w <= NUM_WHEELS; w++) genView.cents[w] = P().tuning === 'et' ? 0 : centsOff(w);
  genView.harmonic = P().tuning === 'harmonic';
  $('#gen-mode').textContent = { gears: '12 gear pairs · shared wheels', et: 'idealised: exact ET wheels', harmonic: 'bypassed: each key has its own exact harmonics' }[P().tuning];
}

function refreshActivity() {
  const a = genView.activity;
  a.fill(0);
  if (P().tuning === 'harmonic') return;
  for (const k of shell.activeKeys()) {
    for (let d = 0; d < 9; d++) {
      if (d === 8 && P().percOn) continue;
      a[keyWheel(k, d)] += drawbarGain(P().drawbars[d]);
    }
    if (P().percOn) a[percWheel(k, P().percThird)] += 0.7;
  }
}

function refreshFocus() {
  const rows = keyAnalysis(focusKey, P());
  $('#focus-name').textContent = noteName(focusKey);
  $('#focus-name2').textContent = noteName(focusKey);
  const fmtDb = (x) => `${x > 0.05 ? '+' : x < -0.05 ? '−' : ''}${Math.abs(x).toFixed(1)} dB`;
  const fmtC = (c) => (Math.abs(c) < 0.005 ? '0.00' : `${c > 0 ? '+' : ''}${c.toFixed(2)}`);
  $('#analysis').innerHTML = '<tr><th>drawbar</th><th>wheel</th><th>plays (Hz)</th><th>harmonic (Hz)</th><th>Δ cents</th><th title="the wheel’s level through the key’s taper wire, re C4 at 8′">level</th></tr>'
    + rows.map((r) => {
      const off = P().drawbars[r.d] === 0 || (r.d === 8 && P().percOn);
      const cls = r.folded ? 'fold' : r.cents > 0.005 ? 'pos' : r.cents < -0.005 ? 'neg' : '';
      const cents = r.folded ? `${fmtC(r.cents)} (folded)` : fmtC(r.cents);
      return `<tr class="${off ? 'off' : ''}"><td>${r.name}</td><td>${P().tuning === 'harmonic' ? '—' : `#${r.w}`}</td><td>${r.actual.toFixed(2)}</td><td>${r.ideal.toFixed(2)}</td><td class="${cls}">${cents}</td><td>${fmtDb(r.db)}</td></tr>`;
    }).join('');
  output.focus = rows.map((r) => ({
    actual: r.actual, ideal: r.ideal, color: BAR_COLORS[DRAWBARS[r.d].color],
    level: r.d === 8 && P().percOn ? 0 : P().drawbars[r.d] / 8,
  }));
  spectro.set(0, output.focus.filter((m) => m.level > 0).map((m) => ({ f: m.actual, color: m.color, alpha: 0.3 + 0.6 * m.level })));
}

function frame() {
  const shown = (cv) => cv.offsetParent !== null; // views can be hidden from the Views menu
  if (shown(genView.cv)) genView.draw();
  if (shown(leslieView.cv)) leslieView.draw(P());
  if (shown(output.cv)) output.draw(keyAnalysis(focusKey, P())[2].actual * (lastState ? lastState.shaft : 1));
  if (shown($('#scanner'))) drawScanner($('#scanner'), lastState, P());
}

// the swell pedal and the readouts that show the expression
function refreshSwell() {
  const db = `${((P().expression - 1) * 40).toFixed(0)} dB`;
  $('#swell-read').textContent = db;
  const sw = $('#swell');
  sw.style.setProperty('--e', P().expression);
  sw.setAttribute('aria-valuenow', String(P().expression));
  sw.setAttribute('aria-valuetext', db);
}

// The console's switches head the group they belong to (the Leslie's switch with its rotors),
// and the groups you play with come first, after the drawbars.
for (const sw of document.querySelectorAll('.switches .sw-group')) {
  const det = $(`#groups details[data-group="${sw.dataset.group}"]`);
  det.querySelector('summary').after(sw);
}
$('.switches').remove();
$('#groups details.group').before(...['perc', 'vib', 'leslie'].map((id) => $(`#groups details[data-group="${id}"]`)));
for (const det of document.querySelectorAll('#groups details.group')) det.open = ['gen', 'keys'].includes(det.dataset.group);

refreshConsole();
refreshGenerator();
refreshFocus();
refreshSwell();
animate(frame);
