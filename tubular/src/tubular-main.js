// tubular-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { TUNING_KEEP, tuningRatio } from '../../shared/tuning.js';
import { keyFreq } from '../../shared/dsp.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT, KEY_LO, KEY_HI, KEY_MIN, KEY_MAX } from './tubular-instrument.js';
import { wasmModel } from './tubular-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const TAU = 2 * Math.PI;
const STRIKE = [3, 4, 5]; // modes 4–6 (from 0): the strike note's
const spectrum = new SpectrumView($('#spectrum'), { fLo: 30, fHi: 20000 });
new SpectrogramView($('#spectrogram'), { spectrum });
let focus = 69, live = null, ePeak = 0;

// The tubes' modes (a few ms each) are sent with each note, packed by the model, so the audio
// thread never builds a tube. Built ahead, a key at a time, when the page is idle. A tube is cut
// for its metal, section and cap, the microphones' distance and the keyboard's tuning.
const packed = new Map();
const CUT = ['material', 'diameter', 'wall', 'cap', 'distance', ...TUNING_KEEP];
const cutOf = (P) => CUT.map((id) => P[id]).join('|');
function dataFor(key, P) {
  const id = `${key}|${cutOf(P)}`;
  let d = packed.get(id);
  if (!d) { d = model.voiceData(key, P); if (packed.size > 256) packed.clear(); packed.set(id, d); }
  return d;
}
const noteData = (key, vel, P) => dataFor(key, P);
let warm = null;
function warmUp() {
  clearTimeout(warm);
  const P = { ...shell.P }, cut = cutOf(P), keys = [];
  const [lo, hi] = P.fullRange ? INSTRUMENT.range : INSTRUMENT.compass.keys; // the keys that play
  for (let k = lo; k <= hi; k++) if (!packed.has(`${k}|${cut}`)) keys.push(k);
  keys.sort((a, b) => Math.abs(a - focus) - Math.abs(b - focus));
  const step = () => {
    const k = keys.shift();
    if (k === undefined || cut !== cutOf(shell.P)) return;
    dataFor(k, P);
    warm = setTimeout(step, 15);
  };
  warm = setTimeout(step, 200);
}

const shell = createShell({
  ...INSTRUMENT,
  noteData,
  base: 60, // Z = C4: the orchestral set starts there
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; shell.keys.focus(key); update(); },
  onParam: (id) => { if (CUT.includes(id) || id === 'fullRange' || id === '*') warmUp(); update(); },
  onMessage: (m) => {
    if (m.type !== 'tube') return;
    if (!live || m.key !== live.key || m.E > ePeak) ePeak = m.E; else ePeak *= 0.9995;
    live = { ...m, amp: Float64Array.from(m.amp), t: performance.now() / 1000 };
  },
});

// ---- the focus key: its tube and its modes ------------------------------------------------------
let T = null, heard = [];
const fmtHz = (f) => (f < 1000 ? f.toFixed(1) : f.toFixed(0));
const T60 = (m, P) => 6.91 / (m.sigRad + Math.PI * m.f * P.eta);
// a mode at the strike point (fraction of the length down from the top), from its shape's points
function at(m, strike) {
  const u = (1 - Math.min(1, Math.max(0, strike))) * (T.NX - 1), j = Math.min(T.NX - 2, Math.floor(u)), fr = u - j;
  return m.w[j] * (1 - fr) + m.w[j + 1] * fr;
}
const loud = (m) => Math.hypot(...m.gain[0]) * (TAU * m.f) ** 2; // pressure per unit modal displacement, at the left microphone
function update() {
  const P = shell.P;
  T = model.tube(focus, P);
  const name = noteName(focus), s0 = T.f4 / 2;
  $('#focus-name').textContent = name; $('#tube-key').textContent = name;
  $('#focus-size').textContent = `${(1000 * T.L).toFixed(0)} mm long · ${(2000 * T.section.a).toFixed(1)} mm across · ${(T.mass + T.section.mc).toFixed(2)} kg`;
  // each mode as struck (its shape at the mallet) and as heard (× its pressure at the microphones), relative to the loudest
  // as heard after a mezzo-forte stroke: an impulse leaves each mode moving at its shape there,
  // so its displacement goes as 1/ω, and the Hertzian contact (lasting τ = 2.94 δmax/v) passes
  // the modes below 1/2τ and rolls off as 1/ω² above
  const M = model.mallet(P.hardness, P.mass), v = 0.6 * P.speedMax;
  const tau = (2.94 / v) * (((M.p + 1) * M.m * v * v) / (2 * M.K)) ** (1 / (M.p + 1));
  const ex = T.modes.map((m) => Math.abs(at(m, P.strike)));
  heard = T.modes.map((m, i) => { const om = TAU * m.f, x = (om * tau) / Math.PI; return ((ex[i] / om) * loud(m)) / Math.sqrt(1 + x ** 4); });
  const exMax = Math.max(...ex, 1e-30), hMax = Math.max(...heard, 1e-30);
  const rows = T.modes.slice(0, 24).map((m, i) => {
    const h = m.f / s0, n = Math.max(1, Math.round(h)), off = 1200 * Math.log2(h / n), t = T60(m, P);
    const dbx = 20 * Math.log10(ex[i] / exMax), dbh = 20 * Math.log10(heard[i] / hMax);
    return `<tr class="${STRIKE.includes(i) ? 'strike' : ''}"><td>${m.n}</td><td>${fmtHz(m.f)}</td><td>${h.toFixed(3)}</td><td>${h > 0.75 ? `${n} ${off >= 0 ? '+' : '−'}${Math.abs(off).toFixed(0)} ¢` : ''}</td><td>${t < 10 ? t.toFixed(2) : t.toFixed(0)}</td><td>${dbx > -60 ? dbx.toFixed(0) : '—'}</td><td>${dbh > -60 ? dbh.toFixed(0) : '—'}</td></tr>`;
  });
  $('#modes').innerHTML = '<tr><th>mode</th><th>f (Hz)</th><th>× strike note</th><th>nearest harmonic</th><th>T₆₀ (s)</th><th>at mallet (dB)</th><th>heard (dB)</th></tr>' + rows.join('')
    + `<tr><td colspan="7" class="note">The strike note, ${fmtHz(s0)} Hz, is half of mode 4: the key’s pitch. Gold: modes 4–6, which the ear hears as its 2nd, 3rd and 4th harmonics. T₆₀: the metal and the sound radiated, with the damper off. Heard: at the microphones ${P.distance.toFixed(1)} m away, just after a stroke at 60 % velocity (the mallet’s contact, about ${(1000 * tau).toFixed(1)} ms, passes the modes below ${fmtHz(1 / (2 * tau))} Hz). `
    + `${T.modes.length} modes under 20 kHz${T.modes.length > 24 ? ' (the first 24 shown)' : ''}. Mallet ${(1000 * M.m).toFixed(0)} g, ${(M.K * 1e-3 ** M.p).toFixed(0)} N at 1 mm.</td></tr>`;
  spectrum.set(s0, [{ f: s0, color: '#ffffff', alpha: 0.35 }].concat(T.modes.map((m, i) => ({ f: m.f, color: STRIKE.includes(i) ? css('--accent') : '#a88a5a', alpha: STRIKE.includes(i) ? 0.9 : 0.6 }))));
  $('#ladder-read').textContent = T.modes.length > 5 ? `modes 4 : 5 : 6 = ${STRIKE.map((i) => (T.modes[i].f / s0).toFixed(2)).join(' : ')} × ${fmtHz(s0)} Hz` : '';
}

// ---- the frame: the tubes to scale, the struck one bending ---------------------------------------
const lengths = new Map();
function lengthOf(k, P) { // the tube's length for the knobs, without building its modes
  const id = `${k}|${cutOf(P)}`;
  if (!lengths.has(id)) { if (lengths.size > 512) lengths.clear(); lengths.set(id, model.cutLength(P.material, P.diameter, P.wall, P.cap, keyFreq(k) * tuningRatio(P, k))); }
  return lengths.get(id);
}
function shown() { // the orchestral set, or the eighteen tubes around the key played
  if (focus >= KEY_LO && focus <= KEY_HI) return { lo: KEY_LO, hi: KEY_HI };
  const lo = Math.max(KEY_MIN, Math.min(KEY_MAX - 17, focus - 8));
  return { lo, hi: lo + 17 };
}
const fcv = $('#frame');
animate(() => {
  if (!T) return;
  const { ctx, w, h } = fit(fcv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, { lo, hi } = shown();
  const keys = []; for (let k = lo; k <= hi; k++) keys.push(k);
  const L = keys.map((k) => (k === focus ? T.L : lengthOf(k, P))), Lmax = Math.max(...L);
  const xs = keys.map((k) => model.place(k).x), x0 = Math.min(...xs), x1 = Math.max(...xs);
  const top = 22, bottom = h - 8, sy = (bottom - top) / Lmax, padX = 20;
  const X = (x) => padX + ((x - x0) / Math.max(1e-6, x1 - x0)) * (w - 2 * padX);
  const pitch = (w - 2 * padX) / Math.max(1, (x1 - x0) / model.SPACING); // px between naturals
  const tw = Math.max(3, Math.min(pitch * 0.4, 2 * T.section.a * sy * 4)); // a natural and the sharp beside it never touch
  // the rail and the damper bar
  ctx.fillStyle = '#5a4a3a'; ctx.fillRect(4, top - 12, w - 8, 5);
  const fresh = live && live.key === focus;
  const damped = fresh ? live.damp > 0.5 : !(shell.sustain || P.pedalLock);
  const now = performance.now() / 1000;
  keys.forEach((k, j) => {
    const back = model.place(k).y > 0, xc = X(xs[j]), len = L[j] * sy;
    ctx.strokeStyle = 'rgba(200,180,140,0.5)'; ctx.beginPath(); ctx.moveTo(xc, top - 7); ctx.lineTo(xc, top); ctx.stroke(); // the cord
    const g = ctx.createLinearGradient(xc - tw / 2, 0, xc + tw / 2, 0);
    const lit = k === focus;
    g.addColorStop(0, back ? '#6d5a32' : '#8a6f38'); g.addColorStop(0.45, lit ? '#ffe3a0' : back ? '#b49455' : '#d8b468'); g.addColorStop(1, back ? '#4a3c20' : '#6a5328');
    ctx.fillStyle = g;
    if (k !== focus) { ctx.fillRect(xc - tw / 2, top, tw, len); }
    else {
      // the struck tube: its first eight modes at their live amplitudes (as heard), exaggerated and slowed (mode n at 0.4·(f_n/f₄)^½ Hz)
      const N = Math.min(8, T.modes.length), amps = [];
      for (let i = 0; i < N; i++) amps.push(fresh ? live.amp[i] : 0);
      let wmax = 1e-30; const shapes = [];
      for (let q = 0; q < T.NX; q++) {
        let d = 0;
        for (let i = 0; i < N; i++) d += amps[i] * T.modes[i].w[q] * Math.cos(TAU * 0.4 * Math.sqrt(T.modes[i].f / T.f4) * now + i);
        shapes.push(d); wmax = Math.max(wmax, Math.abs(d));
      }
      const A = fresh ? (0.5 * pitch * Math.sqrt(Math.min(1, live.E / Math.max(ePeak, 1e-30)))) / wmax : 0;
      ctx.beginPath();
      for (let q = T.NX - 1; q >= 0; q--) { const y = top + (1 - q / (T.NX - 1)) * len, dx = A * shapes[q]; if (q === T.NX - 1) ctx.moveTo(xc + dx - tw / 2, y); else ctx.lineTo(xc + dx - tw / 2, y); }
      for (let q = 0; q < T.NX; q++) { const y = top + (1 - q / (T.NX - 1)) * len, dx = A * shapes[q]; ctx.lineTo(xc + dx + tw / 2, y); }
      ctx.closePath(); ctx.fill();
      // the mallet, at the strike point
      const ys = top + P.strike * len, gap = fresh && live.malletOn ? 2 : 10;
      ctx.fillStyle = css('--accent'); ctx.beginPath(); ctx.moveTo(xc - tw / 2 - gap, ys); ctx.lineTo(xc - tw / 2 - gap - 9, ys - 6); ctx.lineTo(xc - tw / 2 - gap - 9, ys + 6); ctx.closePath(); ctx.fill();
    }
    if (P.cap > 0.5) { ctx.fillStyle = '#8c7340'; ctx.fillRect(xc - tw / 2 - 1, top, tw + 2, Math.max(2, 0.025 * sy)); }
  });
  const yd = top + model.DAMPER_Z * sy;
  ctx.fillStyle = damped ? '#4a3a2e' : 'rgba(110,90,70,0.35)';
  ctx.fillRect(4, yd - (damped ? 2 : 4), w - 8, 4);
  $('#tube-read').textContent = fresh && live.contactMs ? `mallet contact ${live.contactMs.toFixed(2)} ms, peak force ${live.Fmax.toFixed(0)} N` : `${(1000 * T.L).toFixed(0)} mm long`;
}, fcv);

// ---- the strike note: the modes on the harmonics of a note none of them plays --------------------
const lcv = $('#ladder');
animate(() => {
  if (!T) return;
  const { ctx, w, h } = fit(lcv);
  ctx.clearRect(0, 0, w, h);
  const s0 = T.f4 / 2, hLo = 0.15, hHi = Math.min(24, 20000 / s0);
  const padL = 10, padR = 10, padT = 10, padB = 18, pw = w - padL - padR, ph = h - padT - padB;
  const X = (r) => padL + (Math.log(r / hLo) / Math.log(hHi / hLo)) * pw;
  ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (let n = 1; n <= hHi; n++) {
    ctx.strokeStyle = n === 1 ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.12)';
    if (n === 1) ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(X(n), padT); ctx.lineTo(X(n), padT + ph); ctx.stroke(); ctx.setLineDash([]);
    if (n <= 6 || n === 8 || n === 12 || n === 16) { ctx.fillStyle = css('--muted'); ctx.fillText(n === 1 ? 'strike note' : `${n}`, X(n), h - 5); }
  }
  // each mode's bar: as loud as it is now (live) or as struck (still), in dB over 60
  const fresh = live && live.key === focus;
  const lev = T.modes.map((m, i) => (fresh ? (i < live.amp.length ? live.amp[i] * loud(m) : 0) : heard[i] ?? 0)); // the engine sends the first 16 modes' amplitudes
  const top = Math.max(...lev, 1e-30);
  T.modes.forEach((m, i) => {
    const r = m.f / s0;
    if (r < hLo || r > hHi) return;
    const db = 20 * Math.log10(Math.max(lev[i], 1e-30) / top), frac = Math.max(0, 1 + db / 60);
    ctx.fillStyle = STRIKE.includes(i) ? css('--accent') : '#a88a5a';
    ctx.globalAlpha = fresh ? 0.95 : 0.55;
    ctx.fillRect(X(r) - 2.5, padT + ph * (1 - frac), 5, ph * frac);
    ctx.globalAlpha = 1;
  });
}, lcv);

update();
warmUp();
