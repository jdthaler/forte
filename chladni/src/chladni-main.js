// chladni-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './chladni-instrument.js';
import { FIGURES } from './chladni-params.js';
import { wasmModel } from './chladni-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const phys = await wasmModel();

const $ = (s) => document.querySelector(s);
const TAU = 2 * Math.PI, G = 9.81;
const GRID = 72;         // each mode's shape on a GRID × GRID lattice, for the sand and the figures
const GRAINS = 4000;     // grains of sand on a plate
const spectrum = new SpectrumView($('#spectrum'), { fLo: 40, fHi: 16000 });
new SpectrogramView($('#spectrogram'), { spectrum });
let focus = 69, kp = null, state = null, id = 0, modes = [];

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'force', step: 0.2 },
  holdHint: { ms: 400, text: 'Hold the key down: its plate is bowed only while the key is held, and it takes a moment to speak.' },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onMessage: (m) => { if (m.type === 'state') state = m; },
  onNoteOn: (key) => { focus = key; shell.keys.focus(key); update(); },
  onParam: () => update(),
});

// ---- the model's numbers ------------------------------------------------------------
let plateKey = '';
function update() {
  const P = shell.P;
  id = phys.plateId(P);
  modes = phys.modes(id);
  kp = phys.keyPlate(focus, P);
  const t = kp.target;
  spectrum.set(kp.f[t], kp.f.map((f, n) => ({ f, alpha: n === t ? 1 : 0.35 })));
  for (const s of ['#focus-name', '#focus-name-2']) $(s).textContent = noteName(focus);
  const sp = phys.spots(id, Number(P.figure));
  const [bx, by] = phys.pathPoint(phys.pathShift(sp.bow, P.shift));
  $('#modes').innerHTML = '<tr><th>mode</th><th>f (Hz)</th><th>ratio</th><th>T60 (s)</th><th>under the bow</th><th>under the fingers</th></tr>'
    + kp.f.map((f, n) => {
      const b = phys.shape(id, n, bx, by), fg = Math.hypot(...sp.fingers.map(([x, y]) => phys.shape(id, n, x, y)));
      return `<tr${n === t ? ' class="hl"' : ''}><td>${n + 1}${n === t ? ' ★' : ''}</td><td>${f.toFixed(1)}</td><td>${(f / kp.f[t]).toFixed(3)}</td><td>${(6.91 / kp.sigma[n]).toFixed(2)}</td><td>${b.toFixed(2)}</td><td>${fg.toFixed(2)}</td></tr>`;
    }).join('');
  // a new set of plates (another figure, material, hold or thickness) gets fresh sand
  const k = `${id}/${P.figure}/${P.thickness}`;
  if (k !== plateKey) { plateKey = k; sands.clear(); }
  info();
}

const MATERIAL = ['brass', 'glass', 'steel', 'aluminium'];
function info() {
  if (!kp) return;
  const P = shell.P, st = state && state.key === focus && state.touch ? state : null;
  const N = st ? st.N : kp.threshold * P.force * (0.5 + P.velocity);
  const rows = [
    ['plate', `${(kp.side * 100).toFixed(1)} cm square, ${P.thickness.toFixed(2)} mm of ${MATERIAL[P.material]} · ${(kp.mass * 1000).toFixed(0)} g`],
    ['held', Number(P.hold) === 0 ? `by a clamp at the centre, ${(phys.CLAMP * 2 * kp.side * 50).toFixed(1)} mm across between leather pads` : 'free, by the fingers alone'],
    ['figure', `${FIGURES[P.figure]}: mode ${kp.target + 1}, on ${noteName(focus)} (${kp.f0.toFixed(1)} Hz)`],
    ['speaks above', `${kp.threshold.toFixed(3)} N of bow (${((kp.threshold * 1000) / G).toFixed(1)} g) at ${(P.speed * 100).toFixed(0)} cm/s`],
    [st ? 'bow now' : 'computer keys', `${N.toFixed(3)} N · ${(N / kp.threshold).toFixed(1)} × threshold${st ? ` · the hair sticks ${(100 * st.stick).toFixed(0)} % of the time` : ''}`],
  ];
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

// ---- the sand ------------------------------------------------------------------------
// Each key's plate keeps its own sand. A grain hops wherever the plate's acceleration beats
// gravity: launched at about the plate's speed v there, it lands v²/g or so away in a random
// direction, g/2v times a second, so it wanders (diffusion D ≈ v³/g, in real time) until it
// reaches a place that shakes less than g: the nodal lines.
const sands = new Map();
const plateSand = (key) => {
  if (!sands.has(key)) {
    const s = new Float32Array(2 * GRAINS);
    for (let i = 0; i < s.length; i++) s[i] = Math.random() * 2 - 1;
    sands.set(key, s);
  }
  return sands.get(key);
};
let seed = 1;
const gauss = () => { // Box–Muller, from a small LCG (no Math.random in the hot loop)
  seed = (seed * 1664525 + 1013904223) >>> 0; const u = (seed + 1) / 4294967297;
  seed = (seed * 1664525 + 1013904223) >>> 0; const v = seed / 4294967296;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
};
// The modes worth following: the strongest few of the focused plate, with ω and the grid.
function active() {
  if (!state || state.key !== focus || !kp) return [];
  const out = [];
  let top = 0;
  for (let n = 0; n < Math.min(state.modes, kp.f.length); n++) top = Math.max(top, state.amps[n] * kp.f[n]);
  if (top <= 0) return out;
  for (let n = 0; n < Math.min(state.modes, kp.f.length); n++) {
    const a = state.amps[n], w = TAU * kp.f[n];
    if (a * kp.f[n] > 0.02 * top) out.push({ n, a, w, g: phys.grid(id, n, GRID) });
  }
  return out.sort((x, y) => y.a * y.w - x.a * x.w).slice(0, 10);
}
const at = (g, x, y) => { // bilinear, from the grid
  const u = ((x + 1) / 2) * (GRID - 1), v = ((y + 1) / 2) * (GRID - 1);
  const i = Math.min(GRID - 2, Math.max(0, Math.floor(u))), j = Math.min(GRID - 2, Math.max(0, Math.floor(v)));
  const fu = u - i, fv = v - j, r = j * GRID + i;
  return (1 - fv) * ((1 - fu) * g[r] + fu * g[r + 1]) + fv * ((1 - fu) * g[r + GRID] + fu * g[r + GRID + 1]);
};
function shake(dt) {
  const act = active();
  if (!act.length || !kp) return 0;
  const s = plateSand(focus), half = kp.side / 2;
  let peak = 0;
  for (let i = 0; i < GRAINS; i++) {
    const x = s[2 * i], y = s[2 * i + 1];
    let v2 = 0, a2 = 0;
    for (const m of act) { const p = m.a * at(m.g, x, y); v2 += (p * m.w) ** 2; a2 += (p * m.w * m.w) ** 2; }
    // amplitudes: the sum of the modes' squares (they ring at different frequencies), × √2 for the peak
    const acc = Math.sqrt(2 * a2);
    peak = Math.max(peak, acc);
    if (acc <= G) continue;
    // it leaves the plate once the plate outruns gravity, and bouncing off it as it rises, at up to
    // twice its speed
    const v = 2 * Math.sqrt(2 * v2) * Math.sqrt(1 - G / acc);
    const step = Math.sqrt((2 * v * v * v * dt) / G) / half; // √(2 D dt), in the plate's units
    let nx = x + step * gauss(), ny = y + step * gauss();
    nx = nx > 1 ? 2 - nx : nx < -1 ? -2 - nx : nx; // grains that would fall off bounce back
    ny = ny > 1 ? 2 - ny : ny < -1 ? -2 - ny : ny;
    s[2 * i] = Math.max(-1, Math.min(1, nx)); s[2 * i + 1] = Math.max(-1, Math.min(1, ny));
  }
  return peak;
}

const shadeImage = Object.assign(document.createElement('canvas'), { width: 48, height: 48 });
const PLATE_COLOUR = ['#c9a646', '#9fc6d4', '#9aa3ad', '#c7ccd2'];
let lastT = 0, infoT = 0, peakAcc = 0;
const visible = (cv) => cv.offsetParent !== null;
animate((t) => {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t;
  peakAcc = shake(dt);
  if (visible($('#plate'))) drawPlate();
  if (visible($('#figures'))) drawFigures();
  if (t - infoT > 250 && visible($('#info'))) { infoT = t; info(); }
});

// The plate from above: the metal, shaded where it moves, the sand, the clamp, the bow and the
// fingers.
function drawPlate() {
  const { ctx, w, h } = fit($('#plate'));
  ctx.clearRect(0, 0, w, h);
  if (!kp) return;
  const P = shell.P, S = Math.max(10, Math.min(w, h) - 36), x0 = (w - S) / 2, y0 = (h - S) / 2;
  const X = (x) => x0 + ((x + 1) / 2) * S, Y = (y) => y0 + ((1 - y) / 2) * S;
  ctx.fillStyle = PLATE_COLOUR[P.material] ?? PLATE_COLOUR[0];
  ctx.fillRect(x0, y0, S, S);
  // where it shakes: darker with the plate's speed
  const act = active();
  if (act.length) {
    const n = 48, img = shadeImage.getContext('2d').createImageData(n, n), vs = new Float32Array(n * n);
    let vmax = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -1 + (2 * (i + 0.5)) / n, y = 1 - (2 * (j + 0.5)) / n;
      let v2 = 0; for (const m of act) v2 += (m.a * m.w * at(m.g, x, y)) ** 2;
      vs[j * n + i] = Math.sqrt(v2); vmax = Math.max(vmax, vs[j * n + i]);
    }
    for (let k = 0; k < n * n; k++) { img.data[4 * k] = 40; img.data[4 * k + 1] = 20; img.data[4 * k + 2] = 0; img.data[4 * k + 3] = (115 * vs[k]) / (vmax || 1); }
    shadeImage.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(shadeImage, x0, y0, S, S);
  }
  // sand
  const s = plateSand(focus);
  ctx.fillStyle = '#fbf6ea';
  const r = Math.max(1, S / 300);
  for (let i = 0; i < GRAINS; i++) ctx.fillRect(X(s[2 * i]) - r / 2, Y(s[2 * i + 1]) - r / 2, r, r);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.strokeRect(x0, y0, S, S);
  // the clamp
  if (Number(P.hold) === 0) {
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath(); ctx.arc(X(0), Y(0), Math.max(3, phys.CLAMP * S), 0, TAU); ctx.fill();
  }
  // the bow: across the edge at its place on the path
  const sp = phys.spots(id, Number(P.figure));
  const [bx, by] = phys.pathPoint(state && state.key === focus && state.bow ? state.bow : phys.pathShift(sp.bow, P.shift));
  ctx.fillStyle = state && state.key === focus && state.touch ? css('--accent-2') : '#2a2016';
  const L = 0.16 * S, T = 6;
  if (bx === 1) ctx.fillRect(X(1) - T / 2, Y(by) - L / 2, T + 6, L);
  else ctx.fillRect(X(bx) - L / 2, Y(1) - 6 - T / 2, L, T + 6);
  // the fingers
  if (P.finger) {
    ctx.strokeStyle = 'rgba(160,60,40,0.9)'; ctx.fillStyle = 'rgba(230,150,120,0.45)'; ctx.lineWidth = 2;
    for (const [fx, fy] of sp.fingers) { ctx.beginPath(); ctx.arc(X(fx), Y(fy), Math.max(4, 0.035 * S), 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.lineWidth = 1;
  }
  $('#plate-read').textContent = `${(kp.side * 100).toFixed(1)} cm · ${peakAcc > 0 ? `shakes up to ${(peakAcc / G).toFixed(0)} g` : 'still'}`;
}

// The ten figures' nodal lines on this plate: a cell is dark where its mode changes sign.
const figureImages = new Map();
function figureImage(n, px) {
  const k = `${id}/${n}/${px}`;
  if (figureImages.has(k)) return figureImages.get(k);
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d'), img = g.createImageData(px, px), gr = phys.grid(id, n, GRID);
  for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) {
    const x = -1 + (2 * (i + 0.5)) / px, y = 1 - (2 * (j + 0.5)) / px, d = 2 / px;
    const v = at(gr, x, y), line = Math.sign(v) !== Math.sign(at(gr, x + d, y)) || Math.sign(v) !== Math.sign(at(gr, x, y - d));
    const o = 4 * (j * px + i);
    img.data[o] = line ? 40 : 230; img.data[o + 1] = line ? 30 : 205; img.data[o + 2] = line ? 20 : 140; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  figureImages.set(k, c);
  return c;
}
function drawFigures() {
  const { ctx, w, h } = fit($('#figures'));
  ctx.clearRect(0, 0, w, h);
  if (!modes.length) return;
  const cols = w > 1.6 * h ? 5 : w > 0.9 * h ? 4 : 2, rows = Math.ceil(FIGURES.length / cols);
  const cell = Math.min((w - 8) / cols, (h - 8) / rows), size = Math.max(8, cell - 18);
  const lowest = modes[0].lambda;
  // which mode sounds loudest now
  let loud = -1;
  if (state && state.key === focus) { let a = 0; for (let n = 0; n < state.modes; n++) { const v = state.amps[n] * (kp?.f[n] ?? 0); if (v > a) { a = v; loud = n; } } if (a < 1e-6) loud = -1; }
  ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
  FIGURES.forEach((name, f) => {
    const sp = phys.spots(id, f), n = sp.mode;
    const cx = 4 + (f % cols) * cell + cell / 2, cy = 4 + Math.floor(f / cols) * cell;
    const px = Math.max(16, Math.round(size * (window.devicePixelRatio || 1)));
    ctx.globalAlpha = n === loud ? 1 : 0.75;
    ctx.drawImage(figureImage(n, px), cx - size / 2, cy, size, size);
    ctx.globalAlpha = 1;
    if (f === Number(shell.P.figure)) { ctx.strokeStyle = css('--accent'); ctx.lineWidth = 3; ctx.strokeRect(cx - size / 2 - 2, cy - 2, size + 4, size + 4); ctx.lineWidth = 1; }
    if (n === loud) { ctx.fillStyle = css('--accent-2'); ctx.fillRect(cx - size / 2, cy + size + 2, size, 3); }
    ctx.fillStyle = css('--muted');
    ctx.fillText(`${(modes[n].lambda / lowest).toFixed(2)} ×`, cx, cy + size + 14);
  });
  $('#figures-read').textContent = loud >= 0 ? `sounding: mode ${loud + 1}` : '';
}

// two taps on the plate: fresh sand
$('#plate').addEventListener('dblclick', () => { sands.delete(focus); });

shell.keys.focus(focus);
update();
