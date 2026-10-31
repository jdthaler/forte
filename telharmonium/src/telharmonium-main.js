// telharmonium-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './telharmonium-instrument.js';
import { wasmModel } from './telharmonium-wasm.js';
import { tunedFreq } from '../../shared/tuning.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();
const { HARMONICS } = model;
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'), { fLo: 25, fHi: 12000 });
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let focus = 60, state = null;
const relays = new Map(); // key → { shaft, teeth, manual, root }, as the engine closed it

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  holdHint: { ms: 400, text: 'Hold the key down: its relay stays closed, and its alternators sound, while it is held.' },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onMessage: (m) => {
    if (m.type === 'state') state = m;
    else if (m.type === 'relay') { if (m.on) relays.set(m.key, m); else relays.delete(m.key); }
  },
  onNoteOn: (key) => { focus = key; update(); },
  onParam: () => update(),
});

const fmtHz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(f < 100 ? 2 : 1)} Hz`);
const dB = (a) => 20 * Math.log10(Math.max(a, 1e-9));

// A shaft's turning rate at full speed: the engine's unit (keyTarget[60 + pc] / 128 teeth).
const unit = (P, pc) => tunedFreq(P, 60 + pc) / 128;
// The alternator a key plays: the engine's own (once its relay closed), or what it would close alone.
function assignOf(key, P) {
  const r = relays.get(key);
  if (r) return { shaft: r.shaft, teeth: r.teeth, manual: r.manual, root: r.root };
  const pc = key % 12, root = P.shafts === 'eight' && !model.built(pc) ? key - 4 : -1;
  return { ...model.assign(key, root), manual: key >= P.split ? 1 : 0, root };
}
// Its harmonics: frequency, the stop's level, and whether the shaft carries the alternator.
function harmonicsOf(key, P) {
  const a = assignOf(key, P), base = a.teeth * unit(P, a.shaft), out = [];
  for (let h = 1; h <= HARMONICS; h++) {
    const f = h * base, level = model.stopLevel(P[`${a.manual ? 'm' : 'a'}${h}`]);
    out.push({ h, f, level, exists: h === 1 || f <= P.top, teeth: a.teeth * h });
  }
  return { ...a, base, harmonics: out };
}

function update() {
  const P = shell.P, k = harmonicsOf(focus, P);
  $('#focus-name').textContent = `${noteName(focus)} · ${NAMES[k.shaft]} shaft`;
  spectrum.set(k.base, k.harmonics.filter((x) => x.exists && x.level > 0).map((x) => ({ f: x.f, alpha: 0.25 + 0.7 * x.level })));
  info();
}

function info() {
  const P = shell.P, k = harmonicsOf(focus, P), et = tunedFreq(P, focus), cents = state?.cents ?? 0;
  const teeth1906 = (t) => (t >= 16 ? `${t / 16}` : `${t}/16`);
  const rpm = unit(P, k.shaft) * 16 * 60;
  const just = k.root >= 0 ? `the just ${(focus - k.root) % 12 === 4 ? 'major third (5 : 4)' : 'minor seventh (7 : 4)'} of ${noteName(k.root)}, ${(1200 * Math.log2(k.base / et)).toFixed(1)} ¢ from equal temperament` : 'its own shaft, equal temperament';
  const on = k.harmonics.filter((x) => x.exists && x.level > 0);
  const rows = [
    ['note', `${fmtHz(k.base)} · ${just}`],
    ['alternator', `${teeth1906(k.teeth)} teeth on the ${NAMES[k.shaft]} shaft (turning ${rpm.toFixed(0)} rpm, counted as the 1906 C-shaft's)`],
    ['harmonics', on.length ? on.map((x) => `${x.h}: ${fmtHz(x.f)} (${x.level >= 0.999 ? 'full' : `${dB(x.level).toFixed(0)} dB`})`).join(' · ') : 'every stop off'],
    ['missing', k.harmonics.filter((x) => !x.exists).map((x) => x.h).join(', ') || 'none: the shaft carries all eight'],
    ['manual', `${k.manual ? 'II (melody)' : 'I (accompaniment)'}, on its own line`],
    ['motor', `${cents >= 0 ? '+' : ''}${cents.toFixed(2)} ¢ · load ${(100 * (state?.load ?? 0)).toFixed(0)} % of ten full notes`],
  ];
  $('#info').innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
}

// ---- views -----------------------------------------------------------------------
const visible = (cv) => cv.offsetParent !== null;
let infoT = 0;
animate((t) => { if (t - infoT > 250 && visible($('#info'))) { infoT = t; info(); } });

// The shafts: each alternator in use, a drum at its place by teeth, lit by how many keys use it;
// its teeth stripes sweep as it turns (slowed down a thousandfold).
const T_LO = 3, T_HI = 15; // log2 of the engine's teeth (A0's own alternator: 8)
animate((t) => {
  const cv = $('#shafts');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, eight = P.shafts === 'eight', speed = 2 ** ((state?.cents ?? 0) / 1200);
  const use = new Map(); // `${shaft}:${teeth}` → count
  for (const key of relays.keys()) for (const x of harmonicsOf(key, P).harmonics) if (x.exists) {
    const id = `${assignOf(key, P).shaft}:${x.teeth}`;
    use.set(id, (use.get(id) || 0) + (x.level > 0 ? 1 : 0.25));
  }
  const padL = 30, padR = 8, rowH = h / 12;
  const X = (T) => padL + ((w - padL - padR) * (Math.log2(T) - T_LO)) / (T_HI - T_LO);
  const ink = css('--text'), muted = css('--muted'), grid = css('--grid'), acc = css('--accent');
  ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'middle';
  for (let pc = 0; pc < 12; pc++) {
    const y = (pc + 0.5) * rowH, missing = eight && !model.built(pc);
    ctx.fillStyle = missing ? muted : ink; ctx.textAlign = 'left';
    ctx.fillText(NAMES[pc], 4, y);
    ctx.strokeStyle = missing ? grid : muted; ctx.setLineDash(missing ? [3, 4] : []);
    ctx.lineWidth = Math.max(1, rowH * 0.12);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.setLineDash([]); ctx.lineWidth = 1;
  }
  const drumW = Math.max(4, Math.min(14, (w - padL - padR) / 60)), drumH = Math.max(3, rowH * 0.72);
  for (const [id, n] of use) {
    const [shaft, teeth] = id.split(':').map(Number), x = X(teeth), y = (shaft + 0.5) * rowH;
    ctx.globalAlpha = Math.min(1, 0.35 + 0.3 * n);
    ctx.fillStyle = acc; ctx.fillRect(x - drumW / 2, y - drumH / 2, drumW, drumH);
    // the teeth sweeping past: stripes moving at the drum's rate, slowed
    const rate = (teeth * unit(P, shaft) * speed) / 1000, phase = ((t / 1000) * rate) % 1;
    ctx.strokeStyle = css('--accent-ink'); ctx.globalAlpha *= 0.6;
    for (let s = 0; s < 3; s++) {
      const yy = y - drumH / 2 + (((s / 3 + phase) % 1) * drumH);
      ctx.beginPath(); ctx.moveTo(x - drumW / 2, yy); ctx.lineTo(x + drumW / 2, yy); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  const c = state?.cents ?? 0;
  $('#shafts-read').textContent = `motor ${c >= 0 ? '+' : ''}${c.toFixed(1)} ¢ · ${relays.size} key${relays.size === 1 ? '' : 's'} down`;
}, $('#shafts'));

// The buses: each manual's eight, the current one note gets now (the robbing law, with the notes on
// it), over the tick of what a single note gets at that stop.
animate(() => {
  const cv = $('#buses');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, N = [new Array(HARMONICS).fill(0), new Array(HARMONICS).fill(0)];
  for (const key of relays.keys()) { const k = harmonicsOf(key, P); for (const x of k.harmonics) if (x.exists) N[k.manual][x.h - 1]++; }
  const padT = 26, padB = 16, top = 0, range = 36, gap = 10;
  const Y = (d) => padT + ((h - padT - padB) * (top - Math.max(top - range, d))) / range;
  const colW = (w - gap - 30) / (2 * HARMONICS);
  ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = css('--muted'); ctx.strokeStyle = css('--grid');
  for (let d = top; d >= top - range; d -= 12) { ctx.beginPath(); ctx.moveTo(26, Y(d)); ctx.lineTo(w, Y(d)); ctx.stroke(); ctx.fillText(`${d}`, 22, Y(d) + 3); }
  for (let m = 0; m < 2; m++) {
    const x0 = 30 + m * (HARMONICS * colW + gap);
    ctx.textAlign = 'left'; ctx.fillStyle = css('--muted');
    ctx.fillText(m ? 'II · melody' : 'I · accompaniment', x0, 9);
    for (let i = 0; i < HARMONICS; i++) {
      const level = model.stopLevel(P[`${m ? 'm' : 'a'}${i + 1}`]), n = N[m][i];
      const x = x0 + i * colW + colW * 0.15, bw = colW * 0.7;
      if (level > 0) {
        const g = n ? model.busGain(n, level, P.robbing) : level;
        ctx.fillStyle = m ? css('--accent-2') : css('--accent'); ctx.globalAlpha = n ? 0.9 : 0.25;
        ctx.fillRect(x, Y(dB(g)), bw, h - padB - Y(dB(g)));
        ctx.globalAlpha = 1; ctx.strokeStyle = css('--text'); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 2, Y(dB(level))); ctx.lineTo(x + bw + 2, Y(dB(level))); ctx.stroke(); ctx.lineWidth = 1;
        if (n > 1) { ctx.fillStyle = css('--text'); ctx.textAlign = 'center'; ctx.fillText(`×${n}`, x + bw / 2, Math.min(Y(dB(g)), Y(dB(level))) - 4); }
      }
      ctx.fillStyle = level > 0 ? css('--text') : css('--muted'); ctx.textAlign = 'center';
      ctx.fillText(`${i + 1}`, x + bw / 2, h - 4);
    }
  }
}, $('#buses'));

// The response from the switchboard to the air, with the focused key's harmonics on it.
const F_LO = 30, F_HI = 10000;
animate(() => {
  const cv = $('#response');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, padL = 30, padR = 8, padT = 8, padB = 18, top = 10, range = 60;
  const X = (x) => padL + ((w - padL - padR) * Math.log(x / F_LO)) / Math.log(F_HI / F_LO);
  const Y = (d) => padT + ((h - padT - padB) * (top - d)) / range;
  ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
  for (const x of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { ctx.beginPath(); ctx.moveTo(X(x), padT); ctx.lineTo(X(x), h - padB); ctx.stroke(); ctx.fillText(x >= 1000 ? `${x / 1000}k` : `${x}`, X(x), h - 5); }
  ctx.textAlign = 'right';
  for (let d = top; d >= top - range; d -= 10) { ctx.beginPath(); ctx.moveTo(padL, Y(d)); ctx.lineTo(w - padR, Y(d)); ctx.stroke(); ctx.fillText(`${d}`, padL - 4, Y(d) + 3); }
  const tap = P.distance > 0 ? model.lineExact(model.TAP_HZ, P.cable, P.distance).abs : 1;
  const line = (f) => (P.distance > 0 ? model.lineExact(f, P.cable, P.distance).abs / tap : 1);
  const ref = model.receiver(1000, 'telephone').abs * model.horn(1000, 1.8).abs;
  const air = (f) => (model.receiver(f, P.receiver).abs * model.horn(f, P.horn).abs * model.voicing(f, P.voicing)) / ref;
  const curve = (fn, dash, color) => {
    ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < 240; i++) { const f = F_LO * (F_HI / F_LO) ** (i / 239), y = Math.max(padT, Math.min(h - padB, Y(dB(fn(f))))); if (i) ctx.lineTo(X(f), y); else ctx.moveTo(X(f), y); }
    ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
  };
  curve(line, [5, 4], css('--accent-2'));
  curve((f) => line(f) * air(f), [], css('--text'));
  const k = harmonicsOf(focus, P);
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2;
  for (const x of k.harmonics) {
    if (!x.exists || x.level <= 0 || x.f < F_LO || x.f > F_HI) continue;
    const d = dB(x.level * line(x.f) * air(x.f));
    ctx.beginPath(); ctx.moveTo(X(x.f), h - padB); ctx.lineTo(X(x.f), Math.max(padT, Y(d))); ctx.stroke();
  }
  ctx.lineWidth = 1;
}, $('#response'));

update();
