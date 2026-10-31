// ondes-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './ondes-instrument.js';
import { wasmModel } from './ondes-wasm.js';
import { tunedFreq } from '../../shared/tuning.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'), { fLo: 25, fHi: 16000 });
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let focus = 60, state = null, stateAt = 0;

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'vibrato', step: 2 },
  holdHint: { ms: 400, text: 'Hold the key down: the note sounds while the intensity key stays pressed.' },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onMessage: (m) => { if (m.type === 'state') { state = m; stateAt = performance.now(); } },
  onNoteOn: (key) => { focus = key; shell.keys.focus(key); update(); },
  onParam: () => update(),
});

const live = () => (state && state.key === focus && performance.now() - stateAt < 300 ? state : null);
const fmtHz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(f < 10 ? 2 : 1)} Hz`);

// The focused note: what the engine says it plays, or its note in the keyboard's tuning.
function note(P) {
  const st = live(), f = st ? st.f : tunedFreq(P, focus), K = P.pull;
  const delta = st ? st.delta : model.trim(f, K);
  return { st, f, K, delta, r: model.ratio(delta, K) };
}

function update() {
  const P = shell.P, { f } = note(P);
  $('#focus-name').textContent = noteName(focus);
  const markers = [];
  for (let k = 1; k <= 12 && k * f < 16000; k++) markers.push({ f: k * f, alpha: k === 1 ? 0.9 : 0.35 });
  spectrum.set(f, markers);
  info();
}

function info() {
  const P = shell.P, { st, f, K, delta, r } = note(P);
  const F = st ? st.F : model.keyForce(P.velocity);
  const rows = [
    ['note', `${noteName(focus)} · ${fmtHz(f)}${st ? ' (sounding)' : ''}`],
    ['oscillators', `the variable one ${fmtHz(delta)} from the fixed one, near 100 kHz${st && st.drift ? ` (drifting ${st.drift >= 0 ? '+' : ''}${st.drift.toFixed(2)} Hz)` : ''}`],
    ['pull', K > 0 ? `locks within ${fmtHz(K)}: the beat is √(Δ² − K²) = ${fmtHz(model.beat(delta, K))}, its harmonics falling as ${r.toFixed(4)}ⁿ` : 'none: the beat is Δ itself, a pure sine'],
    ['intensity key', `${F.toFixed(2)} N on the powder: ${model.levelDb(F).toFixed(1)} dB SPL${st ? '' : ' (the computer keys\' velocity)'}`],
  ];
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

// ---- views -----------------------------------------------------------------------
const visible = (cv) => cv.offsetParent !== null;
let infoT = 0;
animate((t) => { if (t - infoT > 250 && visible($('#info'))) { infoT = t; info(); } });

// One cycle of the beat: φ against time, integrated (RK4) through Adler's equation over a period.
function cycle(delta, K, n = 360) {
  const W = 2 * Math.PI, D = W * delta, k = W * K, Om = Math.sqrt(Math.max(D * D - k * k, 1e-9)), T = W / Om, h = T / n;
  const phi = new Float64Array(n + 1), f = (p) => D - k * Math.sin(p);
  let p = -Math.PI;
  for (let i = 0; i <= n; i++) {
    phi[i] = p;
    const k1 = f(p), k2 = f(p + (h * k1) / 2), k3 = f(p + (h * k2) / 2), k4 = f(p + h * k3);
    p += (h * (k1 + 2 * k2 + 2 * k3 + k4)) / 6;
  }
  return phi;
}
// What the drawer makes of φ (as the engine's timbres, before their band-limiting).
function timbre(phi, P) {
  const x = Math.cos(phi), y = Math.sin(phi), a = P.balance;
  const on = ['tO', 'tC', 'tg', 'tG', 'tN'].filter((id) => P[id]), share = on.length ? 1 / Math.sqrt(on.length) : 0;
  let v = 0;
  if (P.tO) v += share * (Math.sqrt(1 + a * a + 2 * a * x) - 1);
  if (P.tC) v += share * (2 * Math.max(x, 0) - 2 / Math.PI);
  if (P.tg) v += share * (Math.PI / 4) * Math.atan2(x, Math.abs(y));
  if (P.tG) v += share * (Math.PI / 4) * Math.sign(x);
  if (P.tN) v += share * (Math.PI / 2) * ((x > Math.cos(Math.PI * P.width) ? 1 : 0) - P.width);
  v += P.octave * (3 * Math.PI / 4) * (Math.abs(x) - 2 / Math.PI);
  return v;
}

animate((t) => {
  const cv = $('#beat');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, { f, K, delta } = note(P), phi = cycle(delta, K), n = phi.length - 1;
  const acc = css('--accent'), acc2 = css('--accent-2'), grid = css('--grid'), muted = css('--muted');
  // the circle, with the phase's speed around it, and the phase now (one cycle every 1.6 s)
  const R = Math.max(4, Math.min(h * 0.3, w * 0.13)), cx = R * 1.6 + 6, cy = h / 2;
  ctx.strokeStyle = grid; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
  ctx.strokeStyle = acc2; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const p = (2 * Math.PI * i) / 120, s = (delta - K * Math.sin(p)) / delta, r = R * (1 + 0.45 * s);
    const X = cx + r * Math.cos(p), Y = cy - r * Math.sin(p);
    if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
  }
  ctx.stroke();
  const u = ((t / 1600) % 1) * n, i0 = Math.floor(u), p = phi[i0] + (phi[Math.min(n, i0 + 1)] - phi[i0]) * (u - i0);
  ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(cx + R * Math.cos(p), cy - R * Math.sin(p), Math.max(2, R / 10), 0, 2 * Math.PI); ctx.fill();
  ctx.strokeStyle = acc; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.cos(p), cy - R * Math.sin(p)); ctx.stroke();
  ctx.fillStyle = muted; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('φ', cx, cy - R * 1.55 - 2 > 8 ? cy - R * 1.55 : 10);
  // two cycles of the wave, the phase now marked
  const x0 = cx + R * 1.6 + 12, x1 = w - 8, A = h * 0.36, wave = Array.from(phi, (q) => timbre(q, P));
  const top = Math.max(1e-3, ...wave.map(Math.abs));
  ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(x0, cy); ctx.lineTo(x1, cy); ctx.stroke();
  if (x1 > x0 + 10) {
    ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.beginPath();
    for (let c = 0; c < 2; c++) for (let i = 0; i <= n; i += 2) {
      const X = x0 + ((x1 - x0) * (c + i / n)) / 2, Y = cy - (A * wave[i]) / top;
      if (c === 0 && i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.stroke(); ctx.lineWidth = 1;
    const xm = x0 + ((x1 - x0) * (u / n)) / 2;
    ctx.strokeStyle = acc2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xm, cy - A); ctx.lineTo(xm, cy + A); ctx.stroke(); ctx.setLineDash([]);
  }
  $('#beat-read').textContent = `Δ ${delta.toFixed(1)} · K ${K.toFixed(2)} · beat ${fmtHz(model.beat(delta, K))}`;
}, $('#beat'));

// The diffuseurs: the springs', the tam-tam's and the palme's lines on a log axis, the note's harmonics below.
const F_LO = 30, F_HI = 8000;
animate(() => {
  const cv = $('#diffuseurs');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, { f } = note(P);
  const padL = 64, padR = 8, padB = 16;
  const X = (x) => padL + ((w - padL - padR) * Math.log(x / F_LO)) / Math.log(F_HI / F_LO);
  ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
  for (const x of [50, 100, 200, 500, 1000, 2000, 5000]) { ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), h - padB); ctx.stroke(); ctx.fillText(x >= 1000 ? `${x / 1000}k` : `${x}`, X(x), h - 4); }
  const rows = [
    { name: 'springs', level: P.dR, lines: springLines() },
    { name: 'tam-tam', level: P.dM, lines: gongLines(P.gongD / 100) },
    { name: 'palme', level: P.dPalme, lines: Array.from({ length: model.PALME }, (_, i) => ({ f: tunedFreq(P, 57 + i), a: 1 })) },
  ];
  const rowH = (h - padB) / (rows.length + 1);
  const harm = [];
  for (let k = 1; k * f < F_HI && k <= 64; k++) harm.push(k * f);
  rows.forEach((r, j) => {
    const y0 = j * rowH + 4, y1 = (j + 1) * rowH - 2;
    ctx.fillStyle = r.level > 0 ? css('--text') : css('--muted'); ctx.textAlign = 'left';
    ctx.fillText(r.name, 4, (y0 + y1) / 2 + 3);
    for (const l of r.lines) {
      if (l.f < F_LO || l.f > F_HI) continue;
      const hit = harm.some((x) => Math.abs(x / l.f - 1) < 0.006);
      ctx.strokeStyle = hit ? css('--accent') : css('--accent-2');
      ctx.globalAlpha = (r.level > 0 ? 0.35 + 0.65 * Math.min(1, r.level) : 0.15) * Math.min(1, 0.25 + l.a);
      ctx.beginPath(); ctx.moveTo(X(l.f), y0); ctx.lineTo(X(l.f), y1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
  const y0 = rows.length * rowH + 4, y1 = h - padB - 2;
  ctx.fillStyle = css('--text'); ctx.fillText('note', 4, (y0 + y1) / 2 + 3);
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2;
  harm.forEach((x, k) => { ctx.beginPath(); ctx.moveTo(X(x), y1); ctx.lineTo(X(x), y1 - (y1 - y0) / (1 + 0.5 * k)); ctx.stroke(); });
  ctx.lineWidth = 1;
}, $('#diffuseurs'));

let springCache = null, gongCache = { d: -1, lines: [] };
function springLines() {
  if (springCache) return springCache;
  const out = [], eps = 1 / model.SPRING_R;
  for (const L of model.springLengths) {
    for (let n = 1; n < 400; n++) {
      const k = (n * Math.PI) / L, fr = model.springOmega(k) / (2 * Math.PI);
      if (k > eps && fr > F_HI) break;
      if (fr >= F_LO) out.push({ f: fr, a: 0.6 });
    }
  }
  return (springCache = out);
}
function gongLines(d) {
  if (gongCache.d === d) return gongCache.lines;
  const hz = model.plateHz(d), modes = model.plateModes(), top = Math.max(...modes.map((m) => m.w * m.w));
  const lines = modes.map((m) => ({ f: hz * m.lam * m.lam, a: (m.w * m.w) / top })).filter((l) => l.a > 1e-3);
  gongCache = { d, lines };
  return lines;
}

update();
