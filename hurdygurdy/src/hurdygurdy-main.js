// hurdygurdy-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './hurdygurdy-instrument.js';
import { RANGE } from './hurdygurdy-params.js';
import { wasmModel, TRACE } from './hurdygurdy-wasm.js';
import { tunedFreq } from '../../shared/tuning.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();
const FS = 48000;
const NAMES = ['chanterelle', 'chanterelle', 'trompette', 'mouche', 'petit bourdon', 'gros bourdon'];
const PARAM = ['chanterelles', 'chanterelles', 'trompette', 'mouche', 'petit', 'gros'];

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'), { fLo: 40, fHi: 16000, dbTop: -10, dbRange: 90 });
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let state = null, stateAt = 0, melody = RANGE[0];
const history = []; // [seconds, turns/s, buzzing]

const shell = createShell({
  ...INSTRUMENT,
  base: 67,
  arrows: { param: 'crank', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onMessage: (m) => {
    if (m.type !== 'state') return;
    state = m; stateAt = performance.now();
    history.push([stateAt / 1000, m.rate, m.hits > 0]);
    while (history.length && history[0][0] < stateAt / 1000 - 6) history.shift();
    if (m.key !== melody) { melody = m.key; update(); }
  },
  onNoteOn: () => {},
  onParam: () => update(),
});

const live = () => (state && performance.now() - stateAt < 400 ? state : null);
const fmtHz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(1)} Hz`);
const fmtN = (F) => (F >= 1 ? `${F.toFixed(2)} N` : `${(F * 1000).toFixed(0)} mN`);
const turns = (r) => `${r.toFixed(2)} turns/s`;

function update() {
  const P = shell.P, f = tunedFreq(P, melody);
  $('#focus-name').textContent = noteName(melody);
  const markers = [];
  if (P.chanterelles) for (let k = 1; k * f < 16000 && k <= 24; k++) markers.push({ f: k * f, alpha: k === 1 ? 0.9 : 0.35 });
  for (let id = 2; id < 6; id++) if (P[PARAM[id]]) markers.push({ f: model.stringDesign(id, P).f, alpha: 0.7, color: css('--accent-2') });
  spectrum.set(f, markers);
  info();
}

function info() {
  const P = shell.P, st = live();
  const Ls = model.stopLength(melody, P), L = model.loop(0, P, { Ls }), s = model.stringDesign(0, P);
  const vB = st ? st.vB : Math.PI * model.WHEEL_D * P.crank;
  const rows = [
    ['melody', `${noteName(melody)}${melody === RANGE[0] ? ' (open)' : ''} · ${fmtHz(tunedFreq(P, melody))}`],
    ['tangent', melody === RANGE[0] ? `none: the chanterelles sound their whole ${(s.L * 100).toFixed(0)} cm` : `stops the chanterelles at ${(Ls * 100).toFixed(1)} cm from the bridge`],
    ['wheel', `${(P.wheelPos * 1000).toFixed(0)} mm from the bridge: β = ${L.beta.toFixed(3)} of the sounding string · ${(vB * 100).toFixed(0)} cm/s${st ? ` (${turns(st.rate)})` : ''}`],
    ['chanterelles', `gut, ${s.T.toFixed(0)} N, Z₀ ${s.Z0.toFixed(3)} kg/s; bow cleanly from ${fmtN(L.Fmin)} to ${fmtN(L.Fmax)} at this speed, bearing ${fmtN(model.voiced(0) * P.pressure)}`],
  ];
  for (let id = 2; id < 6; id++) {
    const d = model.stringDesign(id, P);
    rows.push([NAMES[id], `${noteName(d.key)} · ${fmtHz(d.f)} · ${d.wound ? 'wound gut' : 'gut'}, ${d.T.toFixed(0)} N${P[PARAM[id]] ? '' : ' · off the wheel'}`]);
  }
  const thr = model.threshold(P);
  rows.push(['chien', `the tirant presses it down with ${fmtN(P.tirant)}: it lifts from about ${turns(thr)} (${(Math.PI * model.WHEEL_D * thr * 100).toFixed(0)} cm/s)${st && st.hits > 0 ? ` · buzzing, ${st.hits.toFixed(0)} landings/s` : ''}`]);
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

const visible = (cv) => cv.offsetParent !== null;
let infoT = 0;
animate((t) => { if (t - infoT > 250 && visible($('#info'))) { infoT = t; info(); } });

// ---- the wheel and the strings, from above ---------------------------------------------------
// x along the strings (tail left, nut right), the six strings across: the drones at the sides,
// the chanterelles in the keybox.
let phaseNow = 0, lastT = 0;
animate((t) => {
  const cv = $('#wheel');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, st = live();
  const rate = st ? st.rate : 0;
  phaseNow = (phaseNow + (rate * (t - lastT)) / 1000) % 1; lastT = t;
  const L0 = 0.36, pad = 14, x0 = pad + 10, x1 = w - pad, X = (m) => x0 + ((x1 - x0) * m) / L0;
  const order = [5, 3, 0, 1, 2, 4]; // across the instrument: gros, mouche, chanterelles, trompette, petit
  const rowY = (i) => h * (0.16 + (0.68 * i) / 5);
  const ink = css('--text'), muted = css('--muted'), grid = css('--grid'), acc = css('--accent'), acc2 = css('--accent-2'), buzz = css('--buzz'), wood = css('--wood');
  // the body and the keybox
  ctx.fillStyle = wood; ctx.globalAlpha = 0.12;
  ctx.beginPath(); ctx.ellipse(X(0.1), h / 2, X(0.16) - X(0), h * 0.46, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(X(0.04), h * 0.36, X(0.33) - X(0.04), h * 0.28);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = grid; ctx.strokeRect(X(0.04), rowY(2) - 10, X(0.33) - X(0.04), rowY(3) - rowY(2) + 20);
  // the wheel, seen from above: its rim under the strings, its spokes turning
  const wx = X(P.wheelPos), ww = Math.max(6, (X(0.075) - X(0)) * 0.35);
  ctx.fillStyle = wood; ctx.globalAlpha = 0.5; ctx.fillRect(wx - ww / 2, h * 0.08, ww, h * 0.84); ctx.globalAlpha = 1;
  ctx.strokeStyle = ink; ctx.globalAlpha = 0.5;
  for (let k = 0; k < 6; k++) { const yy = h * 0.08 + h * 0.84 * ((((k / 6 + phaseNow) % 1) + 1) % 1); ctx.beginPath(); ctx.moveTo(wx - ww / 2, yy); ctx.lineTo(wx + ww / 2, yy); ctx.stroke(); }
  ctx.globalAlpha = 1;
  // the bridge and the nut
  ctx.fillStyle = ink; ctx.fillRect(X(0) - 2, h * 0.1, 3, h * 0.8);
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = muted; ctx.textAlign = 'left';
  // each string
  const amp = Math.min(1, rate / 2.5);
  order.forEach((id, i) => {
    const y = rowY(i), on = !!P[PARAM[id]], sounding = st ? (st.sounding >> id) & 1 : 0;
    const d = model.stringDesign(id, P), end = id <= 1 ? model.stopLength(melody, P) : d.L;
    ctx.strokeStyle = id <= 1 ? acc : acc2; ctx.globalAlpha = on ? 1 : 0.3;
    ctx.lineWidth = 1 + (id >= 3 ? 1 : 0);
    // the vibrating length, as a lens of its amplitude (Helmholtz: ∝ v_B / f)
    const a = sounding ? Math.min(h * 0.045, (amp * 300) / d.f + 1) * (0.6 + 0.4 * Math.sin(t / 30 + id)) : 0;
    ctx.beginPath(); ctx.moveTo(X(0), y);
    for (let k = 1; k <= 24; k++) { const u = k / 24; ctx.lineTo(X(end * u), y - a * Math.sin(Math.PI * u)); }
    for (let k = 23; k >= 0; k--) { const u = k / 24; ctx.lineTo(X(end * u), y + a * Math.sin(Math.PI * u)); }
    ctx.closePath(); ctx.stroke();
    if (end < d.L) { ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.moveTo(X(end), y); ctx.lineTo(X(d.L), y); ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.globalAlpha = 1;
    if (id <= 1 && melody !== RANGE[0]) { ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(X(end), y, 3.5, 0, Math.PI * 2); ctx.fill(); }
    if (id !== 1) { ctx.fillStyle = on ? ink : muted; ctx.fillText(id === 0 ? 'chanterelles' : NAMES[id], X(0.2) + 4, y - 5); }
    // the chien, on the trompette by the bridge: tilting as its foot lifts
    if (id === 2) {
      const lift = st ? Math.max(0, st.liftMax) : 0, tilt = Math.min(1, lift / 2e-4);
      ctx.save(); ctx.translate(X(-0.012), y); ctx.rotate(-0.6 * tilt);
      ctx.fillStyle = tilt > 0.05 ? buzz : wood; ctx.fillRect(-3, -10, 6, 20); ctx.restore();
    }
  });
  ctx.lineWidth = 1;
  $('#wheel-read').textContent = st ? `${turns(st.rate)}${st.running ? '' : ' · stopping'}` : '';
}, $('#wheel'));

// ---- the chien: its lift over the trompette's pull ---------------------------------------------
animate(() => {
  const cv = $('#chien');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const st = live(), P = shell.P;
  const padL = 44, padR = 8, X = (i) => padL + ((w - padL - padR) * i) / (TRACE - 1);
  const ink = css('--text'), muted = css('--muted'), grid = css('--grid'), acc2 = css('--accent-2'), buzz = css('--buzz');
  ctx.font = '10px system-ui, sans-serif';
  const top = [6, h * 0.42], bot = [h * 0.5, h - 16];
  ctx.strokeStyle = grid; ctx.strokeRect(padL, top[0], w - padL - padR, top[1] - top[0]); ctx.strokeRect(padL, bot[0], w - padL - padR, bot[1] - bot[0]);
  ctx.fillStyle = muted; ctx.textAlign = 'right';
  ctx.fillText('lift', padL - 4, top[0] + 10); ctx.fillText('pull', padL - 4, bot[0] + 10);
  ctx.textAlign = 'center'; ctx.fillText(`${((TRACE / FS) * 1000).toFixed(0)} ms`, (padL + w - padR) / 2, h - 3);
  // the pull, with the tirant
  let fMax = P.tirant * 1.6;
  if (st) for (let i = 0; i < TRACE; i++) fMax = Math.max(fMax, Math.abs(st.pull[i]));
  const YF = (F) => bot[1] - ((bot[1] - bot[0]) * (F + fMax * 0.25)) / (fMax * 1.25);
  ctx.strokeStyle = muted; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(padL, YF(P.tirant)); ctx.lineTo(w - padR, YF(P.tirant)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = muted; ctx.textAlign = 'left'; ctx.fillText(`tirant ${fmtN(P.tirant)}`, padL + 4, YF(P.tirant) - 3);
  if (!st) return;
  ctx.strokeStyle = acc2; ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = 0; i < TRACE; i++) { const y = Math.max(bot[0], Math.min(bot[1], YF(st.pull[i]))); if (i) ctx.lineTo(X(i), y); else ctx.moveTo(X(i), y); }
  ctx.stroke();
  // the lift (µm), from the board (the bottom of the panel)
  let yMax = 50e-6;
  for (let i = 0; i < TRACE; i++) yMax = Math.max(yMax, st.lift[i]);
  const YL = (y) => top[1] - ((top[1] - top[0] - 4) * Math.max(0, y)) / yMax;
  ctx.strokeStyle = buzz; ctx.beginPath();
  for (let i = 0; i < TRACE; i++) { const y = YL(st.lift[i]); if (i) ctx.lineTo(X(i), y); else ctx.moveTo(X(i), y); }
  ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = muted; ctx.textAlign = 'right'; ctx.fillText(`${(yMax * 1e6).toFixed(0)} µm`, w - padR - 2, top[0] + 10);
  $('#chien-read').textContent = st.hits > 0 ? `buzzing · ${st.hits.toFixed(0)} landings/s` : 'on the board';
  ctx.fillStyle = ink;
}, $('#chien'));

// ---- the crank's speed over the last six seconds -----------------------------------------------
animate(() => {
  const cv = $('#crank');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, now = performance.now() / 1000, thr = model.threshold(P);
  const padL = 30, padR = 8, padT = 8, padB = 16, span = 6;
  const top = Math.max(2.5, P.crank * (1 + P.coup) * 1.15, thr * 1.2);
  const X = (s) => padL + ((w - padL - padR) * (s - (now - span))) / span;
  const Y = (r) => h - padB - ((h - padT - padB) * r) / top;
  const muted = css('--muted'), grid = css('--grid'), acc = css('--accent'), buzz = css('--buzz');
  ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = grid; ctx.fillStyle = muted; ctx.textAlign = 'right';
  for (let r = 0; r <= top; r += top > 5 ? 1 : 0.5) { ctx.beginPath(); ctx.moveTo(padL, Y(r)); ctx.lineTo(w - padR, Y(r)); ctx.stroke(); ctx.fillText(r.toFixed(1), padL - 4, Y(r) + 3); }
  // where it buzzed
  ctx.fillStyle = buzz; ctx.globalAlpha = 0.25;
  for (let i = 1; i < history.length; i++) if (history[i][2]) ctx.fillRect(X(history[i - 1][0]), padT, X(history[i][0]) - X(history[i - 1][0]), h - padT - padB);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = muted; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(padL, Y(thr)); ctx.lineTo(w - padR, Y(thr)); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.beginPath();
  history.forEach(([s, r], i) => { if (i) ctx.lineTo(X(s), Y(r)); else ctx.moveTo(X(s), Y(r)); });
  ctx.stroke(); ctx.lineWidth = 1;
  const st = live();
  $('#crank-read').textContent = `${st ? turns(st.rate) : 'still'} · buzzes from ${thr.toFixed(2)}`;
}, $('#crank'));

update();
