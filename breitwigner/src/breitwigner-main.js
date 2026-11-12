// breitwigner-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName, keyFreq } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './breitwigner-instrument.js';
import { wasmModel } from './breitwigner-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly, and
// the states the engine says are ringing (its frames, thirty times a second).
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers

const now = () => performance.now() / 1000;
const fmtHz = (f) => (f >= 100 ? `${f.toFixed(0)} Hz` : f >= 10 ? `${f.toFixed(1)} Hz` : f >= 0.1 ? `${f.toFixed(2)} Hz` : `${(f * 1000).toPrecision(3)} mHz`);
const fmtT = (t) => (t >= 120 ? `${(t / 60).toFixed(1)} min` : t >= 1 ? `${t.toFixed(1)} s` : t >= 1e-3 ? `${(t * 1000).toPrecision(3)} ms` : `${(t * 1e6).toFixed(0)} μs`);

let focus = 69;                       // the last key struck
let frame = { at: 0, states: [] };    // every ringing state, from the engine
const SPAN = 6;                       // s of the decay law on screen
const traces = new Map();             // key → [{ t, db, gap }]: its |ψ|² over the last SPAN seconds
const births = new Map();             // key → { t, db, fwhm }: its last strike, as the frames saw it
const TURNS = 1.5;                    // the Amplitude view's slow motion: turns a second
let spin = null;                      // the last key's state, replayed slowly: { key, r, th, trail, last }

const live = () => (now() - frame.at < 0.5 ? frame.states : []); // (frames stop when the audio does)
const db = (amp) => 20 * Math.log10(Math.max(amp, 1e-9));        // |ψ|² in dB

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; reborn(); update(); },
  onParam: () => update(),
  onPanic: () => { frame = { at: now(), states: [] }; },
  onMessage: (m) => { if (m.type === 'frame') onFrame(m.states); },
});

// A frame from the engine: each state's |ψ| joins its key's trace. A level that rose, or a key
// back after a silence, is a new strike.
function onFrame(states) {
  const t = now();
  frame = { at: t, states };
  for (const s of states) {
    let tr = traces.get(s.key);
    if (!tr) traces.set(s.key, tr = []);
    const d = db(s.amp), last = tr[tr.length - 1];
    const gap = !last || t - last.t > 0.2, struck = gap || d > last.db + 0.2;
    if (struck) births.set(s.key, { t, db: d, fwhm: s.fwhm });
    tr.push({ t, db: d, gap });
  }
  for (const [key, tr] of traces) {
    while (tr.length && tr[0].t < t - SPAN - 1) tr.shift();
    if (!tr.length) { traces.delete(key); births.delete(key); }
  }
  marks();
}

// the spectrum's markers: the ringing keys' masses, or the last key's while nothing rings
function marks() {
  const ringing = live();
  spectrum.set(0, ringing.length ? ringing.map((s) => ({ f: s.f, alpha: 0.25 + 0.6 * Math.min(1, s.amp) })) : [{ f: model.key(focus, shell.P).mass, alpha: 0.35 }]);
}

// the last key's state starts its slow-motion life again
function reborn() {
  spin = { key: focus, r: 1, th: (shell.P.phase * Math.PI) / 180, trail: [], last: now() };
}

function update() {
  const k = model.key(focus, shell.P);
  $('#lines-read').textContent = `${noteName(focus)} · Γ = ${fmtHz(k.fwhm)} · τ = ${fmtT(k.tau)}`;
  $('#turn-read').textContent = `${noteName(focus)} · × ${Math.exp(-Math.PI * k.share).toFixed(4)} a turn`;
  marks();
}

// ---- Lines: every ringing key's Breit–Wigner line, at its mass ----------------------------------
// On the keyboard's scale all but the widest lines are needles, so the last key's line is drawn
// again at the right under a glass, ±4 Γ across.
const F_LO = 24, F_HI = 9000;
animate(() => {
  const { ctx, w, h } = fit($('#lines'));
  ctx.clearRect(0, 0, w, h);
  const gw = Math.round(Math.min(260, Math.max(96, 0.36 * w))), gx0 = w - gw - 6; // the glass
  const padL = 10, padR = gw + 20, padT = 12, padB = 18, y0 = h - padB, H = y0 - padT, span = Math.log(F_HI / F_LO);
  const X = (f) => padL + ((w - padL - padR) * Math.log(Math.max(f, 1e-3) / F_LO)) / span;
  const F = (x) => F_LO * Math.exp((span * (x - padL)) / (w - padL - padR));
  ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted');
  for (let key = 24; key <= 108; key += 12) { // the C's
    const x = X(keyFreq(key));
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, y0); ctx.stroke();
    if (w - padL - padR > 220 || key % 24 === 0) ctx.fillText(noteName(key), x, h - 5);
  }
  ctx.beginPath(); ctx.moveTo(padL, y0); ctx.lineTo(w - padR, y0); ctx.stroke();
  const style = (color, ghost) => {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
    if (ghost) { ctx.setLineDash([4, 4]); ctx.globalAlpha = 0.55; ctx.stroke(); ctx.setLineDash([]); }
    else { ctx.globalAlpha = 0.22; ctx.fill(); ctx.globalAlpha = 0.95; ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  };
  // one line on the keyboard's scale: its height the chance |ψ|², its width Γ
  const draw = (f0, G, height, color, ghost) => {
    if (!(f0 > F_LO && f0 < F_HI) || !(height > 0)) return;
    const reach = 8 * G, xa = Math.max(padL, Math.floor(X(f0 - reach))), xb = Math.min(w - padR, Math.ceil(X(f0 + reach))), xp = X(f0);
    ctx.beginPath();
    ctx.moveTo(xa, y0);
    for (let x = xa; x <= xb; x++) {
      if (x > xp && x - 1 < xp) ctx.lineTo(xp, y0 - H * height); // the peak itself, between two pixels
      ctx.lineTo(x, y0 - H * height * model.line(F(x), f0, G));
    }
    if (xb <= xp) ctx.lineTo(xp, y0 - H * height);
    ctx.lineTo(Math.max(xb, xp), y0);
    style(color, ghost);
  };
  // the same line under the glass: u = (f − M)/Γ from −4 to 4
  const U = (u) => gx0 + gw / 2 + (u * gw) / 8;
  const glass = (height, ghost) => {
    if (!(height > 0)) return;
    ctx.beginPath(); ctx.moveTo(gx0, y0);
    for (let x = gx0; x <= gx0 + gw; x++) { const u = ((x - gx0 - gw / 2) * 8) / gw; ctx.lineTo(x, y0 - (H * height) / (1 + 4 * u * u)); }
    ctx.lineTo(gx0 + gw, y0);
    style(css('--accent'), ghost);
  };
  // the last key's line whole, dashed, as the engine has it now (or the controls, once it has gone);
  // within it, what is left of its state, and every other ringing key's
  const ringing = live(), mine = ringing.find((s) => s.key === focus), k = model.key(focus, shell.P);
  const f0 = mine ? mine.f : k.mass, G = mine ? mine.fwhm : k.fwhm, left = mine ? mine.amp * mine.amp : 0;
  for (const s of ringing) if (s.key !== focus) draw(s.f, s.fwhm, s.amp * s.amp, css('--accent-2'));
  draw(f0, G, 1, css('--accent'), true);
  if (mine) draw(f0, G, left, css('--accent'));
  // the glass: its frame, a thread to the line it shows, the line, and its width at half its height
  ctx.strokeStyle = css('--grid');
  ctx.strokeRect(gx0 + 0.5, padT + 0.5, gw - 1, H);
  for (const u of [-3, -2, -1, 0, 1, 2, 3]) { ctx.beginPath(); ctx.moveTo(U(u), y0); ctx.lineTo(U(u), y0 + (u ? 3 : 5)); ctx.stroke(); }
  if (f0 > F_LO && f0 < F_HI) {
    ctx.strokeStyle = css('--muted'); ctx.globalAlpha = 0.5; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(X(f0), padT); ctx.lineTo(gx0, padT + 10); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  glass(1, true);
  glass(left, false);
  const y = y0 - H / 2;
  ctx.strokeStyle = css('--text'); ctx.fillStyle = css('--text'); ctx.globalAlpha = 0.8;
  ctx.beginPath(); ctx.moveTo(U(-0.5), y); ctx.lineTo(U(0.5), y); ctx.moveTo(U(-0.5), y - 3); ctx.lineTo(U(-0.5), y + 3); ctx.moveTo(U(0.5), y - 3); ctx.lineTo(U(0.5), y + 3); ctx.stroke();
  const said = [`Γ = ${fmtHz(G)}`, `Γ ${fmtHz(G)}`].find((text) => ctx.measureText(text).width < gw / 2 - 14); // beside the peak, where it fits
  ctx.textAlign = 'left'; if (said) ctx.fillText(said, gx0 + 5, padT + 13);
  ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.fillStyle = css('--muted');
  ctx.fillText(fmtHz(f0), U(0), h - 5);
}, $('#lines'));

// ---- Decay law: |ψ|² of every ringing key against time, on a logarithmic scale ---------------------
const DB_LO = -60;
animate(() => {
  const { ctx, w, h } = fit($('#decay'));
  ctx.clearRect(0, 0, w, h);
  const padL = 34, padR = 8, padT = 8, padB = 18, t1 = now(), t0 = t1 - SPAN;
  const X = (t) => padL + ((w - padL - padR) * (t - t0)) / SPAN, Y = (d) => padT + ((h - padT - padB) * -d) / -DB_LO;
  ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted');
  ctx.textAlign = 'right';
  for (const [d, text] of [[0, '1'], [-20, '10⁻²'], [-40, '10⁻⁴'], [-60, '10⁻⁶']]) { ctx.beginPath(); ctx.moveTo(padL, Y(d)); ctx.lineTo(w - padR, Y(d)); ctx.stroke(); ctx.fillText(text, padL - 4, Y(d) + 3); }
  ctx.textAlign = 'center';
  for (let s = 0; s <= SPAN; s++) { const x = X(t1 - s); ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, h - padB); ctx.stroke(); ctx.fillText(s ? `−${s} s` : 'now', Math.min(x, w - padR - 10), h - 5); }
  ctx.save();
  ctx.beginPath(); ctx.rect(padL, padT, w - padL - padR, h - padT - padB); ctx.clip();
  const trace = (tr, color, width) => {
    ctx.beginPath();
    let pen = false;
    for (const q of tr) {
      if (q.gap) pen = false;
      const x = X(q.t), y = Y(q.db);
      if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      pen = true;
    }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); ctx.lineWidth = 1;
  };
  ctx.globalAlpha = 0.7;
  for (const [key, tr] of traces) if (key !== focus) trace(tr, css('--accent-2'), 1.5);
  ctx.globalAlpha = 1;
  const b = births.get(focus);
  if (b && b.fwhm > 0) { // the last key's own law: e^(−t/τ), a straight line of 4.34 dB a lifetime
    const slope = (10 / Math.LN10) / model.lifetime(b.fwhm), tEnd = Math.min(t1, b.t + (b.db - DB_LO) / slope);
    ctx.strokeStyle = css('--text'); ctx.globalAlpha = 0.6; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(X(b.t), Y(b.db)); ctx.lineTo(X(tEnd), Y(b.db - slope * (tEnd - b.t))); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  if (traces.has(focus)) trace(traces.get(focus), css('--accent'), 2);
  ctx.restore();
}, $('#decay'));

// ---- Amplitude: the last key's ψ in the complex plane, in slow motion ------------------------------
animate(() => {
  const { ctx, w, h } = fit($('#argand'));
  ctx.clearRect(0, 0, w, h);
  const gauge = 22, R = Math.max(4, Math.min((w - gauge) / 2, h / 2) - 10), cx = (w - gauge) / 2, cy = h / 2;
  const k = model.key(focus, shell.P), phase = (shell.P.phase * Math.PI) / 180;
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif';
  ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
  ctx.textAlign = 'left'; ctx.fillText('Re ψ', cx + R - 26, cy + 12); ctx.fillText('Im ψ', cx + 4, cy - R + 10);
  // its whole life as the controls have it: r = e^(−(Γ/2M)θ), to a hundredth or forty turns
  const rate = k.share / 2, turns = Math.min(40, Math.log(100) / (2 * Math.PI * rate)), N = Math.ceil(turns * 90);
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const th = (2 * Math.PI * turns * i) / N, r = R * Math.exp(-rate * th), x = cx + r * Math.cos(phase + th), y = cy - r * Math.sin(phase + th);
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.strokeStyle = css('--accent'); ctx.globalAlpha = 0.28; ctx.stroke(); ctx.globalAlpha = 1;
  if (!spin) return;
  // the state itself, replayed at TURNS turns a second: its width the one it has now
  const t = now(), dth = 2 * Math.PI * TURNS * Math.min(0.1, t - spin.last);
  spin.last = t;
  const mine = live().find((s) => s.key === spin.key), per = mine ? mine.fwhm / mine.f : model.key(spin.key, shell.P).share;
  if (spin.r > 0.004) {
    spin.r *= Math.exp((-per / 2) * dth); spin.th += dth;
    spin.trail.push([spin.r * Math.cos(spin.th), spin.r * Math.sin(spin.th)]);
    if (spin.trail.length > 6000) spin.trail.shift();
  }
  ctx.beginPath();
  spin.trail.forEach(([re, im], i) => { if (i) ctx.lineTo(cx + R * re, cy - R * im); else ctx.moveTo(cx + R * re, cy - R * im); });
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1;
  const x = cx + R * spin.r * Math.cos(spin.th), y = cy - R * spin.r * Math.sin(spin.th);
  // what is heard: its imaginary part
  const gx = cx + R + gauge / 2 + 4;
  ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(gx, cy - R); ctx.lineTo(gx, cy + R); ctx.stroke();
  ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(gx, y); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(gx, cy); ctx.lineTo(gx, y); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = css('--text'); ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 2 * Math.PI); ctx.fill();
}, $('#argand'));

update();
