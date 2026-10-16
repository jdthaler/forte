// clavier-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, fit, css, animate } from '../../shared/views.js';
import { strikeSpeed } from './clavier-params.js';
import { INSTRUMENT } from './clavier-instrument.js';
import {
  keyModel, stringDesign, releasedFreqs, pickupX, pickupMix, pickupWeight, pressureCents,
  STEEL, REST_GAP, PRESS_MAX,
} from './clavier-model.js';
import { ClavierEngine } from './clavier-engine.js';

const $ = (s) => document.querySelector(s);
const FS = 48000;
const spectrum = new SpectrumView($('#spectrum'));
let focus = 60, focusVel = null, pressure = 0, bend = 0;

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key, vel) => { focus = key; focusVel = vel; shell.keys.focus(key); update(); simulate(); },
  onSustain: () => simulate(), // Space puts the mute bar on the strings: show it in slow motion
  onParam: (id, v, P, p, dragging) => {
    update();
    if (!dragging && !['volume', 'room', 'gain', 'soft', 'medium', 'treble', 'brilliant', 'velocity'].includes(id)) simulate();
  },
  onPressure: (v, key) => { if (key === null || key === focus) pressure = v; showPress(); },
  onBend: (v) => { bend = Math.max(0, v); showPress(); },
});

const db = (x) => 20 * Math.log10(Math.max(Math.abs(x), 1e-6));

// ---------------------------------------------------------------------------
// The focus key: info, mode table, spectrum markers, pickup comb.

let M = null; // { S, modes, released, X }
// The released string's frequencies are a 100-DOF eigen-solve in the bass
// (~5 ms): keep them per key for the parameters they depend on.
const releasedCache = new Map();
function releasedOf(key, P) {
  const sig = [key, P.stiff, P.gap, P.tip, P.wrap].join();
  if (!releasedCache.has(sig)) {
    let fr = [];
    try { fr = releasedFreqs(key, P, 8); } catch { /* singular for odd settings: skip the markers */ }
    if (releasedCache.size > 256) releasedCache.clear();
    releasedCache.set(sig, fr);
  }
  return releasedCache.get(sig);
}
function update() {
  const P = shell.P, S = stringDesign(focus, P), { modes } = keyModel(focus, P, FS), X = pickupX(focus, P), [gl, gu] = pickupMix(P.pickup);
  const pick = modes.map((m) => gl * pickupWeight(m.n, X.lower, S.L) + gu * pickupWeight(m.n, X.upper, S.L));
  const pmax = Math.max(...pick.map(Math.abs), 1e-9);
  const released = releasedOf(focus, P);
  M = { S, modes, released, X, pick, pmax };
  spectrum.set(S.f0, [
    ...modes.map((m, i) => ({ f: m.f, alpha: 0.2 + 0.7 * Math.min(1, Math.abs(pick[i]) / pmax) })),
    ...released.map((f) => ({ f, color: css('--accent-2'), alpha: 0.25 })),
  ]);
  $('#focus-name').textContent = noteName(focus);
  $('#focus-sub').textContent = `${S.f0.toFixed(2)} Hz`;
  const v = strikeSpeed(focusVel ?? P.velocity), tau = (P.gap * 1e-3) / v;
  const rows = [
    ['Speaking', `${(S.L * 100).toFixed(1)} cm`], ['Yarn length', `${(S.Ln * 100).toFixed(1)} cm`],
    ['String', S.wound ? `wound, ${(S.D * 1e3).toFixed(2)} mm on a ${(S.d * 1e3).toFixed(2)} mm core` : `plain, ${(S.d * 1e3).toFixed(3)} mm`],
    ['Tension', `${S.T.toFixed(1)} N, ${(S.stress / 1e6).toFixed(0)} MPa (${((100 * S.stress) / STEEL.strength).toFixed(0)} % of breaking)`],
    ['Stiffness', `B = ${S.B.toExponential(1)}`], ['Pull off anvil', `${S.pull.toFixed(2)} N`],
    ['Carry time', `${(tau * 1e3).toFixed(2)} ms → first null ${(v / (P.gap * 1e-3) / 1000).toFixed(1)} kHz`],
    ['Full pressure', `+${pressureCents(focus, P.press + PRESS_MAX, P).toFixed(0)} ¢`],
    ['Released', released.length ? `${released[0].toFixed(1)} Hz (−${(-1200 * Math.log2(released[0] / S.f0)).toFixed(0)} ¢: the open string, L + Ln)` : '—'],
    ['Pickups', `A ${(X.lower * 100).toFixed(1)} cm, B ${(X.upper * 100).toFixed(1)} cm from tailpiece`],
  ];
  $('#info').innerHTML = rows.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join('');
  $('#modes').innerHTML = '<tr><th>n</th><th>f (Hz)</th><th>vs n·f₁</th><th>T60</th><th>pickups</th></tr>'
    + modes.slice(0, 16).map((m, i) => `<tr><td>${m.n}</td><td>${m.f.toFixed(1)}</td><td>${(1200 * Math.log2(m.f / (m.n * S.f0))).toFixed(1)} ¢</td>`
      + `<td>${(6.91 / m.sigma).toFixed(2)} s</td><td>${db(pick[i] / pmax).toFixed(0)} dB</td></tr>`).join('');
  $('#comb-sub').textContent = `${noteName(focus)} · A at x/L = ${(X.lower / S.L).toFixed(3)}, B at ${(X.upper / S.L).toFixed(3)}`;
  showPress();
}

function showPress() {
  const P = shell.P, F = P.press + PRESS_MAX * Math.max(pressure, bend), c = pressureCents(focus, F, P);
  $('#press-read').textContent = `${F.toFixed(1)} N · ${c >= 0 ? '+' : ''}${c.toFixed(1)} ¢`;
}

// Pickup comb: what each pickup, and the selected mix, hears of partial n.
animate(() => {
  const cv = $('#comb');
  if (cv.offsetParent === null || !M) return;
  const { ctx, w, h } = fit(cv), P = shell.P, { S, X } = M, [gl, gu] = pickupMix(P.pickup);
  ctx.clearRect(0, 0, w, h);
  const n = Math.min(32, Math.max(4, M.modes.length)), padL = 30, padB = 16, padT = 6;
  const A = [], B = [], C = [];
  for (let i = 1; i <= n; i++) { const a = pickupWeight(i, X.lower, S.L), b = pickupWeight(i, X.upper, S.L); A.push(a); B.push(b); C.push(gl * a + gu * b); }
  const top = Math.max(...A.map(Math.abs), ...B.map(Math.abs), ...C.map(Math.abs), 1e-9), range = 40;
  const Xp = (i) => padL + ((i + 0.5) * (w - padL - 4)) / n, Y = (v) => padT + ((h - padT - padB) * Math.min(range, -db(v / top))) / range;
  ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  for (let d = 0; d <= range; d += 10) { const y = padT + ((h - padT - padB) * d) / range; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - 4, y); ctx.stroke(); ctx.fillText(`−${d}`, padL - 4, y + 3); }
  ctx.textAlign = 'center';
  for (let i = 0; i < n; i += n > 16 ? 4 : 2) ctx.fillText(`${i + 1}`, Xp(i), h - 3);
  const bw = Math.max(1, ((w - padL) / n) * 0.6);
  ctx.fillStyle = css('--accent');
  for (let i = 0; i < n; i++) { const y = Y(C[i]); ctx.globalAlpha = C[i] < 0 ? 0.55 : 0.9; ctx.fillRect(Xp(i) - bw / 2, y, bw, Math.max(0, h - padB - y)); }
  ctx.globalAlpha = 1; ctx.lineWidth = 1.5;
  for (const [arr, col] of [[A, css('--accent-2')], [B, '#7cb8ff']]) {
    ctx.strokeStyle = col; ctx.beginPath();
    arr.forEach((v, i) => (i ? ctx.lineTo(Xp(i), Y(v)) : ctx.moveTo(Xp(i), Y(v))));
    ctx.stroke();
  }
  ctx.lineWidth = 1;
}, $('#comb'));
$('#comb-legend').innerHTML = `<span><i style="background:${css('--accent')}"></i>selected mix (faint: inverted)</span>`
  + `<span><i style="background:${css('--accent-2')}"></i>A · lower pickup</span><span><i style="background:#7cb8ff"></i>B · upper pickup</span><span>partial number →</span>`;

// ---------------------------------------------------------------------------
// Slow motion: run the real engine for one strike, a hold and a release, then
// replay the string's shape slowly.

let sim = null, simT0 = performance.now(), speed = 0.005, simWant = false, simQueued = false;
$('#speed').addEventListener('change', (e) => { speed = +e.target.value; simT0 = performance.now(); e.target.blur(); });
$('#replay').addEventListener('click', (e) => { simT0 = performance.now(); e.currentTarget.blur(); });

// The simulation costs up to ~20 ms (a bass note), so it runs only while the
// view is on screen, and then when the main thread is idle (the view's own
// draw loop asks for it), never in the middle of playing a note.
function simulate() { simWant = true; }
function kickSim() {
  if (!simWant || simQueued) return;
  simQueued = true;
  const go = () => { simQueued = false; if (simWant && $('#string').offsetParent !== null) { simWant = false; runSim(); } };
  if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 300 }); else setTimeout(go, 60);
}
function runSim() {
  const P = shell.P, key = focus, vel = focusVel ?? P.velocity, e = new ClavierEngine(FS), muted = P.muteOn || shell.sustain;
  e.setParams({ ...P, room: 0 });
  e.setSustain(shell.sustain); e.muteLevel = muted ? P.mute : 0; // the felt is already on the strings
  const S = stringDesign(key, P), hold = Math.min(0.09, Math.max(0.012, 4 / S.f0)), tail = Math.min(0.08, Math.max(0.012, 3 / S.fRelease));
  const n1 = Math.round((hold + 0.004) * FS), n2 = Math.round(tail * FS), stride = Math.max(1, Math.ceil((n1 + n2) / 900));
  e.noteOn(key, vel);
  const v = e.byKey.get(key), L = new Float32Array(stride), R = new Float32Array(stride), frames = [];
  for (let t = 0; t < n1 + n2; t += stride) {
    if (t >= n1 && v.down) e.noteOff(key);
    frames.push({ t: t / FS, s: v.s, eta: v.eta, Fa: v.Fa, Fr: v.Fr, down: v.down, q: Float32Array.from(v.q), r: Float32Array.from(v.r) });
    e.process(L, R, stride);
  }
  // shape tables: speaking length (x from the tailpiece) and yarn length (ξ from the anvil)
  const nx = 160, ny = 32, N = v.N, Mm = v.M, sinT = new Float32Array(nx * N), cosT = new Float32Array(ny * Mm);
  for (let i = 0; i < nx; i++) for (let j = 0; j < N; j++) sinT[i * N + j] = Math.sin((v.mdl.modes[j].n * Math.PI * i) / (nx - 1));
  for (let i = 0; i < ny; i++) for (let j = 0; j < Mm; j++) cosT[i * Mm + j] = Math.cos(((j + 0.5) * Math.PI * i) / (ny - 1));
  sim = { frames, S, P: { ...P }, key, vel, nx, ny, N, Mm, sinT, cosT, tRel: n1 / FS, X: pickupX(key, P), muted };
  $('#sim-name').textContent = `${noteName(key)} · ${strikeSpeed(vel).toFixed(1)} m/s`;
  simT0 = performance.now();
}

animate(() => {
  const cv = $('#string');
  if (cv.offsetParent === null) return;
  kickSim();
  const { ctx, w, h } = fit(cv), muted = css('--muted');
  ctx.clearRect(0, 0, w, h);
  if (!sim) {
    ctx.fillStyle = muted; ctx.font = '14px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Play a note to see the tangent pin its string', w / 2, h / 2);
    return;
  }
  const { frames, S, P, nx, ny, N, Mm, sinT, cosT, X, muted: felt } = sim, last = frames[frames.length - 1].t;
  const tw = ((performance.now() - simT0) / 1000) % (last / speed + 1.2), tS = Math.min(last, tw * speed);
  let fi = 0; while (fi < frames.length - 1 && frames[fi + 1].t <= tS) fi++;
  const F = frames[fi], Lt = S.L + S.Ln, g = S.gap;
  // geometry: tuning pin on the left, yarn, anvil, speaking length, tailpiece on the right
  const x0 = 22, x1 = Math.max(x0 + 10, w - 22), sx = (x1 - x0) / Lt;
  const lo = -REST_GAP - 0.6e-3, hi = Math.max(g, 0.5e-3) + 1.1e-3, sy = (0.78 * h) / (hi - lo), y0 = 0.1 * h - lo * sy;
  const XP = (pos) => x0 + pos * sx, Y = (u) => y0 + u * sy, xa = XP(S.Ln);
  ctx.strokeStyle = 'rgba(200,204,212,0.22)'; ctx.setLineDash([4, 5]);
  ctx.beginPath(); ctx.moveTo(x0, Y(0)); ctx.lineTo(x1, Y(0)); ctx.stroke(); ctx.setLineDash([]);
  // pickups (A under the string, B over it), drawn where they sit along the speaking length
  const [gl, gu] = pickupMix(P.pickup);
  for (const [x, up, on, lbl] of [[X.lower, false, gl !== 0, 'A'], [X.upper, true, gu !== 0, 'B']]) {
    const px = XP(Lt - x), py = up ? Y(lo) + 2 : Y(hi) - 16;
    ctx.globalAlpha = on ? 1 : 0.35;
    ctx.fillStyle = '#3a2420'; ctx.fillRect(px - 9, py, 18, 14);
    ctx.strokeStyle = css('--accent-2'); ctx.strokeRect(px - 9, py, 18, 14);
    ctx.fillStyle = css('--text'); ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(lbl, px, py + 10);
    ctx.globalAlpha = 1;
  }
  // mute felt (the Mute checkbox, or Space)
  if (felt) { const mx = XP(Lt - P.muteX * 1e-3); ctx.fillStyle = 'rgba(160,140,120,0.6)'; ctx.fillRect(mx - 6, Y(0) - 14, 12, 12); }
  // anvil (below) and tailpiece / tuning pin
  ctx.fillStyle = '#7d828c'; ctx.fillRect(xa - 5, Y(g), 10, Math.max(2, Y(hi) - Y(g)));
  ctx.fillStyle = '#4a4d55'; ctx.fillRect(x1, Y(0) - 18, 8, 36);
  ctx.beginPath(); ctx.arc(x0 - 6, Y(0), 5, 0, 2 * Math.PI); ctx.fill();
  // the string
  const pts = [];
  for (let i = 0; i < ny; i++) { let u = 0; for (let j = 0; j < Mm; j++) u += F.r[j] * cosT[i * Mm + j]; pts.push([XP(S.Ln * (1 - i / (ny - 1))), Y(u)]); }
  pts.reverse();
  for (let i = nx - 1; i >= 0; i--) {
    const xr = i / (nx - 1); let u = F.s * xr;
    for (let j = 0; j < N; j++) u += F.q[j] * sinT[i * N + j];
    pts.push([XP(S.Ln + S.L * (1 - xr)), Y(u)]);
  }
  const yarnEnd = ny;
  ctx.strokeStyle = css('--yarn'); ctx.lineWidth = 7; ctx.globalAlpha = 0.55; ctx.lineCap = 'round';
  ctx.beginPath(); pts.slice(0, yarnEnd).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.globalAlpha = 1; ctx.lineCap = 'butt';
  ctx.strokeStyle = css('--steel'); ctx.lineWidth = S.wound ? 2.5 : 1.5;
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.lineWidth = 1;
  // tangent: rubber tip on the key's lever, above the anvil
  const ty = Y(F.eta);
  ctx.fillStyle = css('--rubber'); ctx.fillRect(xa - 8, ty - 12, 16, 12);
  ctx.strokeStyle = css('--accent'); ctx.strokeRect(xa - 8, ty - 12, 16, 12);
  ctx.fillStyle = '#55575f'; ctx.fillRect(xa - 3, Math.min(ty - 12, Y(lo)), 6, Math.max(0, ty - 12 - Y(lo)));
  // labels
  const phase = !F.down ? (F.Fr > 0 ? 'key let go: tangent lifting' : 'released: the whole string swings, the yarn damps it')
    : F.Fa > 0 ? `pinched on the anvil · ${F.Fa.toFixed(1)} N` : F.Fr > 0 ? 'tangent carrying the string down' : 'tangent in flight';
  ctx.font = '600 13px system-ui, sans-serif'; ctx.fillStyle = css('--text'); ctx.textAlign = 'left';
  ctx.fillText(`t = ${(F.t * 1000).toFixed(2)} ms · ${phase}`, 10, 16);
  ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = muted;
  ctx.fillText(`height ×${(sy / sx).toFixed(0)} · string ${(Lt * 100).toFixed(0)} cm · gap ${(g * 1e3).toFixed(2)} mm`, 10, 31);
  ctx.textAlign = 'center';
  ctx.fillText('yarn', XP(S.Ln / 2), Y(0) + 22);
  ctx.fillText('anvil', xa, Math.min(h - 3, Y(hi) + 12));
  ctx.fillText('tailpiece', Math.min(w - 26, x1), Math.min(h - 3, Y(0) + 32));
}, $('#string'));

update();
simulate();
