// pipes-main.js — the page: wires the shell to the engine and draws the views.

import { createShell } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { keyFreq } from '../../shared/dsp.js';
import { INSTRUMENT } from './pipes-instrument.js';
import { RANKS, STOPS, CP, AIR, engaged, organName, footage } from './pipes-data.js';
import { wasmModel } from './pipes-wasm.js';

// The views draw what the engine plays: the WebAssembly model (the same physics as the engine, in C++).
const M = await wasmModel();

const $ = (s) => document.querySelector(s);
const RANK_ORDER = [0, 2, 1, 3, 4, 5]; // as the engine picks the pipe to show
let focus = 60, shown = 0, model = null, msg = null, frozen = null;
const WIND_SEC = 8;
const windHist = { t: new Float64Array(1024), P: new Float64Array(1024), S: new Float64Array(1024), Q: new Float64Array(1024), n: 0 };
let clock = 0;
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum });

// A key's six pipes (each voiced by a linear analysis, about a millisecond a key) go with its note
// to the engine, built by the page's WebAssembly model, so the audio thread never voices them. Built
// ahead, a key at a time, when the page is idle.
const packed = new Map();
const voicing = (P) => `${P.cutup}|${P.gain}|${P.offset}`;
function keyData(key, P) {
  const id = `${key}|${voicing(P)}`;
  let d = packed.get(id);
  if (!d) { d = M.keyModels(key, P); if (packed.size > 256) packed.clear(); packed.set(id, d); }
  return d;
}
const noteData = (key, vel, P) => keyData(key, P);
let warm = null;
function warmUp() {
  clearTimeout(warm);
  const v = voicing(shell.P), keys = [];
  const [lo, hi] = shell.P.fullRange ? INSTRUMENT.range : INSTRUMENT.compass.keys; // the keys that play
  for (let k = lo; k <= hi; k++) if (!packed.has(`${k}|${v}`)) keys.push(k);
  keys.sort((a, b) => Math.abs(a - focus) - Math.abs(b - focus));
  const step = () => {
    const k = keys.shift();
    if (k === undefined || v !== voicing(shell.P)) return;
    keyData(k, shell.P);
    warm = setTimeout(step, 15);
  };
  warm = setTimeout(step, 200);
}

const shell = createShell({
  ...INSTRUMENT,
  noteData,
  base: 48,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; shell.keys.focus?.(key); updateModel(); },
  onParam: (id) => { if (['cutup', 'gain', 'offset', 'fullRange', '*'].includes(id)) warmUp(); updateModel(); },
  onMessage: (m) => {
    if (m.type !== 'pipe') return;
    msg = m;
    clock += (6 * 128) / m.fs;
    push(windHist, { t: clock, P: m.Pc, S: m.Pset, Q: m.Q });
    if (m.key && (m.key !== focus || m.rank !== shown)) { focus = m.key; shown = m.rank; updateModel(); }
    const sag = m.Pset > 0 ? (100 * (m.Pset - m.Pc)) / m.Pset : 0;
    $('#wind-read').textContent = `${m.Pc.toFixed(0)} Pa (${sag >= 0 ? '−' : '+'}${Math.abs(sag).toFixed(1)} %) · ${(m.Q * 1000).toFixed(1)} L/s · ${m.pipes} pipe${m.pipes === 1 ? '' : 's'} speaking`;
  },
});

function push(h, o) {
  const N = h.t.length, i = h.n % N;
  for (const k in o) h[k][i] = o[k];
  h.n++;
}
const span = (s) => `<span>${s}</span>`;
const mm = (x, d = 1) => `${(x * 1000).toFixed(d)} mm`;

// The focused key's pipe as the engine built it (the model is deterministic).
function updateModel() {
  const P = shell.P, on = engaged(P);
  if (!on[shown]) shown = RANK_ORDER.find((r) => on[r]) ?? 0;
  const f = M.pipeFreq(focus, shown), stopped = RANKS[shown].stopped;
  model = M.pipeModel(f, stopped, P, { tune: M.tuning(f, stopped) });
  const name = shown >= 3 ? `Mixture rank ${footage(Math.round(f / keyFreq(focus)))}` : STOPS[RANKS[shown].stop].name;
  $('#jet-key').textContent = organName(focus);
  $('#jet-read').textContent = `${name}, ${f.toFixed(1)} Hz`;
  const g = model.geo, mk = model.modes.map((m) => ({ f: m.f, alpha: 0.35 + 0.5 * Math.min(1, 40 / m.Q) }));
  spectrum.set(stopped ? 0 : f, mk);
  $('#spec-read').textContent = `${organName(focus)} ${name}: ${stopped ? 'stopped, odd modes 1 : 3 : 5' : 'open, modes 1 : 2 : 3'} · Q₁ ${model.Q1.toFixed(0)}`;
  info();
  void g;
}
function info() {
  if (!model) return;
  const g = model.geo, m = msg && msg.key === focus ? msg : null;
  const Uj = m && m.Uj > 0.5 ? m.Uj : Math.sqrt((2 * shell.P.pressure) / AIR.rho), th = Uj / (model.f * g.W), tau = g.W / (CP * Uj);
  $('#jet-info').innerHTML = [
    span(`Ø ${mm(g.D)}, speaking length ${model.L.toFixed(model.L < 0.1 ? 3 : 2)} m${model.stopped ? ' (stopped)' : ''}`),
    span(`mouth ${mm(g.H)} wide, cut up ${mm(g.W)} (${(g.W / g.H).toFixed(2)} of its width), flue ${mm(g.h, 2)}`),
    span(`jet ${Uj.toFixed(1)} m/s, U/fW = ${th.toFixed(1)}, crosses in ${(tau * 1000).toFixed(2)} ms = ${(tau * model.f).toFixed(2)} of a period`),
  ].join(' · ');
}

// One period of the trace: between the last two upward crossings of the mouth flow's mean.
function period(m) {
  const n = m.n, y = m.v;
  if (!n) return null;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += y[i];
  mean /= n;
  const ups = [];
  for (let i = 1; i < n; i++) if (y[i - 1] < mean && y[i] >= mean) ups.push(i - 1 + (mean - y[i - 1]) / (y[i] - y[i - 1]));
  if (ups.length < 2) return null;
  return { a: ups[ups.length - 2], b: ups[ups.length - 1] };
}
const lerp = (arr, u) => { const i = Math.max(0, Math.min(arr.length - 2, Math.floor(u))), f = u - i; return arr[i] + (arr[i + 1] - arr[i]) * f; };
const phaseNow = () => ((performance.now() / 1000) % 2) / 2;
let infoTimer = 0;

// ---- view 1: the jet in the mouth -------------------------------------------------------------------
// A cut through the mouth turned on its side: the jet runs left to right from the flue to the
// labium; outside the pipe is up, inside is down. Sideways (in and out) is drawn wider than along.
const jcv = $('#jet');
animate(() => {
  const { ctx, w, h } = fit(jcv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  if (!model) return;
  if (performance.now() - infoTimer > 250) { infoTimer = performance.now(); info(); }
  const g = model.geo, live = msg && msg.key === focus && msg.n && msg.rank === shown ? msg : null;
  const per = live ? period(live) : null;
  if (per && live.Uj > 0.5) frozen = { v: Float64Array.from(live.v), eta: Float64Array.from(live.eta), qin: Float64Array.from(live.qin), dp: Float64Array.from(live.dp), per, dt: live.dt, Uj: live.Uj, key: live.key, rank: live.rank };
  const fr = frozen && frozen.key === focus && frozen.rank === shown && msg && msg.key === focus ? frozen : null;
  let etaMax = 3 * g.b;
  if (fr) for (let i = 0; i < fr.eta.length; i++) etaMax = Math.max(etaMax, Math.abs(fr.eta[i]));
  // along the jet: the cut-up fills ~60 % of the width; across: the swing fills ~70 % of the height
  const x0 = Math.max(60, 0.2 * w), x1 = w - Math.max(90, 0.3 * w), sxA = (x1 - x0) / g.W;
  const top = 18, bot = h - 6, ym = (top + bot) / 2;
  const sy = Math.min((0.36 * (bot - top)) / (etaMax + g.b), 40 * sxA);
  const X = (x) => x0 + x * sxA, Y = (eta) => ym + eta * sy; // + is into the pipe (down)
  const exag = sy / sxA;
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'left';
  ctx.fillText('↑ outside', 4, top + 12); ctx.fillText('↓ inside the pipe', 4, bot - 4);
  const u = phaseNow(), NX = 64, shape = new Array(NX + 1).fill(0);
  let q = 0.5, vNow = 0, vmax = 1e-9;
  if (fr) {
    const { a, b } = fr.per, Tp = b - a, tNow = a + u * Tp;
    const lagPerM = 1 / (CP * fr.Uj * fr.dt); // trace samples per metre of jet
    const A = Math.max(1.0001, model.A);
    for (let i = 0; i <= NX; i++) {
      const xx = (g.W * i) / NX;
      let t = tNow + (g.W - xx) * lagPerM; // this bend reaches the labium (W − x)/c_p from now
      t = a + ((((t - a) % Tp) + Tp) % Tp);
      shape[i] = lerp(fr.eta, t) * A ** (xx / g.W - 1);
    }
    q = Math.max(0, Math.min(1, lerp(fr.qin, tNow) / (2 * g.b * g.H * fr.Uj)));
    vNow = lerp(fr.v, tNow);
    for (let i = 0; i < fr.v.length; i++) vmax = Math.max(vmax, Math.abs(fr.v[i]));
  }
  const lip = Math.max(4, 0.06 * (bot - top));
  // the flue: the lower lip above the jet and the languid below, ending at x = 0
  ctx.fillStyle = '#5b6170';
  ctx.fillRect(x0 - 40, Y(-g.b) - lip, 40, lip);
  ctx.fillStyle = '#4a4f5c';
  ctx.fillRect(x0 - 40, Y(g.b), 40, Math.min(bot - Y(g.b), 3 * lip));
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  ctx.fillText('lower lip', x0 - 4, Y(-g.b) - lip - 3);
  ctx.fillText('languid', x0 - 4, Math.min(bot - 2, Y(g.b) + 3 * lip + 11));
  // the upper lip, bevelled to its edge (the labium) y₀ off the jet's axis, into the pipe's side
  const xl = X(g.W), yl = Y(g.y0);
  ctx.fillStyle = '#5b6170';
  ctx.beginPath(); ctx.moveTo(xl, yl); ctx.lineTo(xl + 22, yl - lip); ctx.lineTo(w - 4, yl - lip); ctx.lineTo(w - 4, yl + 2); ctx.lineTo(xl + 22, yl + 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  ctx.fillText('labium', w - 6, yl - lip - 3);
  // the cut-up
  ctx.strokeStyle = css('--grid'); ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(X(0), top + 14); ctx.lineTo(X(0), bot); ctx.moveTo(xl, top + 14); ctx.lineTo(xl, bot); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
  ctx.fillText(`cut-up W = ${mm(g.W)}`, (X(0) + xl) / 2, bot - 4);
  // the jet: ±b about its centre line
  ctx.fillStyle = css('--accent'); ctx.globalAlpha = 0.85;
  ctx.beginPath();
  for (let i = 0; i <= NX; i++) { const x = X((g.W * i) / NX), y = Y(shape[i] - g.b); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  for (let i = NX; i >= 0; i--) ctx.lineTo(X((g.W * i) / NX), Y(shape[i] + g.b));
  ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  // past the labium: the share of the jet that goes into the pipe, and the share that goes out
  const ye = Y(shape[NX]);
  ctx.strokeStyle = css('--accent'); ctx.lineCap = 'round';
  ctx.globalAlpha = 0.3 + 0.7 * q; ctx.lineWidth = 1 + 6 * q;
  ctx.beginPath(); ctx.moveTo(xl, ye); ctx.quadraticCurveTo(xl + 20, ye, xl + 30, Math.min(bot - 4, yl + 0.3 * (bot - yl))); ctx.stroke();
  ctx.globalAlpha = 0.3 + 0.7 * (1 - q); ctx.lineWidth = 1 + 6 * (1 - q);
  ctx.beginPath(); ctx.moveTo(xl, ye); ctx.quadraticCurveTo(xl + 14, ye, xl + 18, Math.max(top + 4, yl - lip - 0.4 * (yl - top))); ctx.stroke();
  ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.lineCap = 'butt';
  // the acoustic flow through the mouth: into the pipe (↓) or out (↑)
  if (fr) {
    const len = 0.32 * (bot - top) * (vNow / vmax), xa = X(0.5 * g.W), ya = ym - len / 2;
    ctx.strokeStyle = css('--accent-2'); ctx.fillStyle = css('--accent-2'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xa, ya + len); ctx.stroke();
    if (Math.abs(len) > 5) { const d = Math.sign(len), ye2 = ya + len; ctx.beginPath(); ctx.moveTo(xa, ye2); ctx.lineTo(xa - 4, ye2 - 6 * d); ctx.lineTo(xa + 4, ye2 - 6 * d); ctx.closePath(); ctx.fill(); }
    ctx.lineWidth = 1;
    const T = (fr.per.b - fr.per.a) * fr.dt;
    ctx.fillStyle = css('--text'); ctx.textAlign = 'left';
    ctx.fillText(`${(1 / T).toFixed(1)} Hz, ${(2 / T).toFixed(0)}× slower · ${(100 * q).toFixed(0)} % of the jet into the pipe · across ×${exag.toFixed(0)}`, 4, 11);
  } else { ctx.fillStyle = css('--muted'); ctx.textAlign = 'left'; ctx.fillText('at rest: play a key', 4, 11); }
}, jcv);

// ---- view 2: pressure against flow at the mouth ------------------------------------------------------
const lcv = $('#loop');
animate(() => {
  const { ctx, w, h } = fit(lcv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  const fr = frozen && msg && msg.key === focus && frozen.key === focus && frozen.rank === shown ? frozen : null;
  const padL = 42, padB = 18, padT = 8, padR = 8;
  if (!fr) { ctx.fillStyle = css('--muted'); ctx.fillText('play a key', padL + 6, padT + 14); $('#loop-read').textContent = ''; return; }
  let vMax = 1e-6, pMax = 1e-6;
  const n = fr.v.length;
  for (let i = 0; i < n; i++) { vMax = Math.max(vMax, Math.abs(fr.v[i])); pMax = Math.max(pMax, Math.abs(fr.dp[i])); }
  vMax *= 1.1; pMax *= 1.1;
  const X = (v) => padL + ((v + vMax) / (2 * vMax)) * (w - padL - padR), Y = (p) => padT + ((pMax - p) / (2 * pMax)) * (h - padT - padB);
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted');
  ctx.beginPath(); ctx.moveTo(X(0), padT); ctx.lineTo(X(0), h - padB); ctx.moveTo(padL, Y(0)); ctx.lineTo(w - padR, Y(0)); ctx.stroke();
  ctx.textAlign = 'center';
  for (const v of [-vMax / 1.1, vMax / 1.1]) ctx.fillText(`${v.toFixed(v > 9.95 || v < -9.95 ? 0 : 1)}`, X(v), h - 5);
  ctx.fillText('air through the mouth (m/s), into the pipe →', (padL + w - padR) / 2, h - 5);
  ctx.textAlign = 'right';
  for (const p of [-pMax / 1.1, pMax / 1.1]) ctx.fillText(`${p.toFixed(0)}`, padL - 4, Y(p) + 3);
  ctx.save(); ctx.translate(10, h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('pressure (Pa)', 0, 0); ctx.restore();
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.5;
  for (let i = 1; i < n; i++) { ctx.globalAlpha = 0.12 + 0.88 * (i / n); ctx.beginPath(); ctx.moveTo(X(fr.v[i - 1]), Y(fr.dp[i - 1])); ctx.lineTo(X(fr.v[i]), Y(fr.dp[i])); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.lineWidth = 1;
  const { a, b } = fr.per, t = a + phaseNow() * (b - a);
  ctx.fillStyle = css('--accent-2'); ctx.beginPath(); ctx.arc(X(lerp(fr.v, t)), Y(lerp(fr.dp, t)), 4, 0, 2 * Math.PI); ctx.fill();
  // the power the pressure puts into the pipe's air: ⟨Δp·Q⟩ = S_m⟨Δp·v⟩ over one period
  let e = 0, cnt = 0;
  for (let i = Math.ceil(a); i < Math.floor(b); i++) { e += fr.dp[i] * fr.v[i]; cnt++; }
  const Pw = cnt ? (e / cnt) * model.geo.Sm : 0;
  $('#loop-read').textContent = `${Pw >= 0 ? 'feeds the pipe' : 'takes from the pipe'} ${Math.abs(Pw * 1000).toFixed(Math.abs(Pw) < 0.0095 ? 2 : 1)} mW · swing ±${(vMax / 1.1).toFixed(1)} m/s`;
}, lcv);

// ---- view 3: the wind -------------------------------------------------------------------------------
const wcv = $('#wind');
animate(() => {
  const { ctx, w, h } = fit(wcv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  const padL = 40, padR = 40, padT = 8, padB = 16, N = windHist.t.length, n = Math.min(windHist.n, N);
  const tEnd = clock, t0 = tEnd - WIND_SEC;
  const X = (t) => padL + ((t - t0) / WIND_SEC) * (w - padL - padR);
  const Pset = shell.P.pressure;
  let pLo = Pset * 0.9, pHi = Pset * 1.04, qMax = 1e-3;
  for (let k = 0; k < n; k++) { const i = (windHist.n - 1 - k) % N; if (windHist.t[i] < t0) break; pLo = Math.min(pLo, windHist.P[i]); pHi = Math.max(pHi, windHist.P[i], windHist.S[i]); qMax = Math.max(qMax, windHist.Q[i] * 1.2); }
  const span = pHi - pLo, lo = pLo - 0.08 * span, hi = pHi + 0.08 * span;
  const Y = (p) => h - padB - ((p - lo) / (hi - lo)) * (h - padT - padB), YQ = (q) => h - padB - (q / qMax) * (h - padT - padB);
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  const st = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => (hi - lo) / s < 6) || 1000;
  for (let p = Math.ceil(lo / st) * st; p <= hi; p += st) { ctx.beginPath(); ctx.moveTo(padL, Y(p)); ctx.lineTo(w - padR, Y(p)); ctx.stroke(); ctx.fillText(`${p}`, padL - 4, Y(p) + 3); }
  ctx.save(); ctx.translate(9, h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('Pa', 0, 0); ctx.restore();
  ctx.textAlign = 'left'; ctx.fillStyle = '#ffd27a'; ctx.fillText(`${(qMax * 1000).toFixed(0)} L/s`, w - padR + 3, padT + 8);
  ctx.textAlign = 'center'; ctx.fillStyle = css('--muted');
  for (let s = 0; s <= WIND_SEC; s += 2) ctx.fillText(`${s - WIND_SEC} s`, X(t0 + s), h - 3);
  const line = (arr, Yf, col, dash = []) => {
    ctx.strokeStyle = col; ctx.setLineDash(dash); ctx.beginPath();
    let started = false;
    for (let k = n - 1; k >= 0; k--) { const i = (windHist.n - 1 - k) % N, t = windHist.t[i]; if (t < t0) continue; if (started) ctx.lineTo(X(t), Yf(arr[i])); else { ctx.moveTo(X(t), Yf(arr[i])); started = true; } }
    ctx.stroke(); ctx.setLineDash([]);
  };
  line(windHist.Q, YQ, '#ffd27a');
  line(windHist.S, Y, '#9fb4c8', [4, 3]);
  ctx.lineWidth = 1.8; line(windHist.P, Y, css('--accent')); ctx.lineWidth = 1;
}, wcv);

updateModel();
warmUp();
