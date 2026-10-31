// resonator-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './resonator-instrument.js';
import { wasmModel } from './resonator-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const M = await wasmModel();

const $ = (s) => document.querySelector(s);
const TAU = 2 * Math.PI;
const spectrum = new SpectrumView($('#spectrum'), { fLo: 25, fHi: 12000 });
new SpectrogramView($('#spectrogram'), { spectrum });
let focus = 60, str = null, state = null;
const HIST = 500; // the swell view's history: about 8 s of the engine's reports
const hist = { cur: new Float32Array(HIST), swing: new Float32Array(HIST), cents: new Float32Array(HIST), at: 0 };

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'drive', step: 0.05 },
  holdHint: { ms: 400, text: 'Hold the key down: the coil drives the string only while its key is held, and a bass string takes seconds to swell.' },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onMessage: (m) => { if (m.type === 'state') take(m); },
  onNoteOn: (key) => { if (key !== focus) { hist.cur.fill(0); hist.swing.fill(-90); hist.cents.fill(0); } focus = key; shell.keys.focus(key); update(); },
  onParam: () => update(),
});
hist.swing.fill(-90);

function take(m) {
  state = m;
  if (m.key !== focus) return;
  const i = hist.at;
  hist.cur[i] = m.current;
  hist.swing[i] = 20 * Math.log10(Math.max(m.swing, 1e-6)); // dB re 1 mm
  hist.cents[i] = m.env > 0 ? m.cents : 0;
  hist.at = (i + 1) % HIST;
}

// The loops' partials for the Harmonic choice, as the engine's loopsOf.
const loopsOf = (h) => (h === '12' ? [1, 2] : h === '123' ? [1, 2, 3] : [Number(h)]);

function update() {
  const P = shell.P;
  str = M.strings(focus, P);
  spectrum.set(str.partials[0].f, str.partials.map((p, i) => ({ f: p.f, alpha: loopsOf(P.harmonic).includes(i + 1) ? 0.95 : 0.35 })));
  for (const id of ['#focus-name', '#focus-name-2']) $(id).textContent = noteName(focus);
  info();
}

function info() {
  const P = shell.P, s = str, st = state && state.key === focus ? state : null;
  const h = loopsOf(P.harmonic), fc = h.map((n) => s.partial(n));
  const gap = P.gap * M.gapScale(focus);
  const rows = [
    ['strings', `${s.nu} × ${(s.L * 100).toFixed(1)} cm of ${s.d > 0 ? `${(s.d * 1000).toFixed(2)} mm steel` : ''}${s.mu > 7850 * Math.PI * s.d * s.d * 0.3 ? ', copper-wound' : ''} at ${s.T.toFixed(0)} N`],
    ['stiffness', `B = ${s.B.toExponential(2)}: partial 8 is ${(1200 * Math.log2(s.partial(8) / (8 * s.f1))).toFixed(1)} ¢ sharp of the 8th harmonic`],
    ['coil', `${(s.xa * 100).toFixed(1)} % along (${(s.xa * s.L * 100).toFixed(1)} cm from the front), ${gap.toFixed(1)} mm above the strings`],
    ['loop', `${h.length > 1 ? 'partials' : 'partial'} ${h.join(', ')} at ${fc.map((f) => f.toFixed(1)).join(', ')} Hz · ${P.loop === 'open' ? 'open loop, at the keyboard\'s pitch' : 'locked to the string'}`],
    ['decay', `alone ${(6.91 / (s.partials[0].sigma + s.sigmaBridge)).toFixed(1)} s, its unisons together ${(6.91 / (s.partials[0].sigma + s.nu * s.sigmaBridge)).toFixed(1)} s (T60 of the fundamental)`],
    ['now', st ? `${st.current.toFixed(2)} A in the coil · swing ${(1000 * st.swing).toFixed(0)} µm · ${st.driven} of ${M.CHANNELS} channels driving` : 'not playing'],
  ];
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

// ---- views -----------------------------------------------------------------------
let strobe = 0, lastT = 0, infoT = 0;
const visible = (cv) => cv.offsetParent !== null;
const loop = (cv, draw) => animate((t) => { if (visible(cv)) draw(t); }, cv);
loop($('#string'), drawString);
loop($('#swell'), drawSwell);
loop($('#coil'), drawCoil);
animate((t) => {
  const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t; strobe += dt * TAU * 0.6;
  if (t - infoT > 250 && visible($('#info'))) { infoT = t; if (str) info(); }
});

// The first string from above the keyboard's end: hammer at the left, bridge at the right, the coil
// over it, its swing in slow motion from the engine's partials (each at its own amplitude, its phase
// against the fundamental's kept), hugely exaggerated.
function drawString() {
  const { ctx, w, h } = fit($('#string'));
  ctx.clearRect(0, 0, w, h);
  if (!str) return;
  const st = state && state.key === focus ? state : null, P = shell.P;
  const x0 = 30, x1 = w - 30, yc = h * 0.58, X = (u) => x0 + u * (x1 - x0);
  const amp = st ? st.amp : [], ph = st ? st.phase : [];
  let peak = 0;
  for (const a of amp) peak += a;
  const scale = peak > 1e-6 ? (0.26 * h) / peak : 0;
  $('#string-read').textContent = peak > 1e-6 ? `swing up to ${(peak * 1000).toFixed(0)} µm (shown ×${Math.round(scale / ((x1 - x0) / (str.L * 1000))).toLocaleString()})` : `${(str.L * 100).toFixed(1)} cm, ${str.nu} string${str.nu > 1 ? 's' : ''}`;
  const rel = amp.map((_, n) => (ph[n] ?? 0) - (n + 1) * (ph[0] ?? 0));
  const Y = (u) => { let y = 0; for (let n = 0; n < amp.length; n++) y += amp[n] * Math.sin((n + 1) * Math.PI * u) * Math.cos((n + 1) * strobe + rel[n]); return yc - scale * y; };
  // the frame: the front termination and the bridge
  ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif';
  ctx.fillRect(x0 - 6, yc - 12, 6, 24); ctx.fillRect(x1, yc - 12, 6, 24);
  ctx.textAlign = 'left'; ctx.fillText('front', x0 - 6, yc + 26); ctx.textAlign = 'right'; ctx.fillText('bridge', x1 + 6, yc + 26);
  // the dampers, over the strings just past the hammer, lifted while the key or the pedal holds them
  const up = (st && st.keyDown) || shell.sustain || !str.damper;
  const xd = X(str.xh + 0.06);
  ctx.fillStyle = up ? css('--grid') : '#8a8a8a';
  if (str.damper) ctx.fillRect(xd - 9, yc - (up ? 34 : 14), 18, 10);
  // the coil: a copper winding over the strings, glowing with its current
  const glow = st ? Math.min(1, st.current / 1.5) : 0, xa = X(str.xa), cw = Math.max(10, (M.COIL_W / str.L) * (x1 - x0));
  if (glow > 0.01) { const g = ctx.createRadialGradient(xa, yc - 30, 2, xa, yc - 30, 50); g.addColorStop(0, `rgba(232,178,92,${0.55 * glow})`); g.addColorStop(1, 'rgba(232,178,92,0)'); ctx.fillStyle = g; ctx.fillRect(xa - 60, yc - 90, 120, 120); }
  ctx.fillStyle = css('--accent'); ctx.fillRect(xa - cw / 2, yc - 44, cw, 22);
  ctx.strokeStyle = css('--accent-ink'); for (let i = 1; i < 6; i++) { const y = yc - 44 + (22 * i) / 6; ctx.beginPath(); ctx.moveTo(xa - cw / 2, y); ctx.lineTo(xa + cw / 2, y); ctx.stroke(); }
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'center'; ctx.fillText(st && st.current > 0.005 ? `coil ${st.current.toFixed(2)} A` : 'coil', xa, yc - 50);
  // the hammer below, at an eighth of the length
  const xh = X(str.xh);
  ctx.fillStyle = P.hammer > 0 ? '#d9d3c4' : css('--grid'); ctx.beginPath(); ctx.ellipse(xh, yc + 22, 9, 7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = css('--muted'); ctx.fillText(P.hammer > 0 ? 'hammer' : 'hammer (off)', xh, yc + 44);
  // the string
  ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 200; i++) { const u = i / 200; if (i) ctx.lineTo(X(u), Y(u)); else ctx.moveTo(X(u), Y(u)); }
  ctx.stroke(); ctx.lineWidth = 1;
  // the driven partials' nodes, as ticks
  ctx.fillStyle = css('--text');
  for (const n of loopsOf(P.harmonic)) for (let j = 1; j < n; j++) { const x = X(j / n); ctx.fillRect(x - 0.5, yc - 4, 1, 8); }
}

// The focused note's last eight seconds: coil current, the swing under the coil, the loop's pull.
function drawSwell() {
  const { ctx, w, h } = fit($('#swell'));
  ctx.clearRect(0, 0, w, h);
  const padL = 34, padR = 34, top = 10, bot = h - 16, X = (i) => padL + ((w - padL - padR) * i) / (HIST - 1);
  ctx.font = '10px system-ui, sans-serif';
  ctx.strokeStyle = css('--grid');
  for (let k = 0; k <= 4; k++) { const y = top + ((bot - top) * k) / 4; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke(); }
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'center'; ctx.fillText('8 s', (padL + w - padR) / 2, h - 3);
  const series = (arr, lo, hi, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let j = 0; j < HIST; j++) { const v = arr[(hist.at + j) % HIST], y = bot - ((bot - top) * (Math.min(hi, Math.max(lo, v)) - lo)) / (hi - lo); if (j) ctx.lineTo(X(j), y); else ctx.moveTo(X(j), y); }
    ctx.stroke(); ctx.lineWidth = 1;
  };
  series(hist.cur, 0, 2.5, css('--accent')); // the current's peak, bias and signal
  series(hist.swing, -60, 10, css('--accent-2'));
  series(hist.cents, -50, 50, '#7ddc9a');
  ctx.textAlign = 'right'; ctx.fillStyle = css('--accent-2'); ctx.fillText('+10 dB', padL - 3, top + 8); ctx.fillText('−60', padL - 3, bot);
  ctx.textAlign = 'left'; ctx.fillStyle = css('--accent'); ctx.fillText('2.5 A', w - padR + 3, top + 8); ctx.fillStyle = '#7ddc9a'; ctx.fillText('0 ¢', w - padR + 3, (top + bot) / 2 + 3);
  const st = state && state.key === focus ? state : null;
  $('#swell-read').textContent = !st || st.env <= 0 ? 'not driven' : shell.P.loop === 'open' ? 'open loop' : st.locked ? `locked, ${st.cents >= 0 ? '+' : ''}${st.cents.toFixed(2)} ¢` : 'searching';
}

// For each partial: the coil's pull on it (filled for the loop's), and what the drive sends (outlined).
function drawCoil() {
  const { ctx, w, h } = fit($('#coil'));
  ctx.clearRect(0, 0, w, h);
  if (!str) return;
  const P = shell.P, n = Math.min(16, str.n), loops = loopsOf(P.harmonic);
  const reach = str.partials.slice(0, n).map((p) => Math.abs(p.psiA)), most = Math.max(...reach, 1e-12);
  const send = new Array(n).fill(0);
  if (P.wave === 'noise') send.fill(0.35);
  else if (loops.length > 1 || P.wave === 'sine') for (const k of loops) { if (k <= n) send[k - 1] = 1 / loops.length; }
  else M.driveHarmonics(P.wave, P.bright).forEach((g, m) => { const k = (m + 1) * loops[0]; if (k <= n) send[k - 1] = g; });
  const padL = 10, padB = 16, top = 8, bw = (w - 2 * padL) / n, y0 = h - padB;
  ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (let i = 0; i < n; i++) {
    const x = padL + i * bw, r = reach[i] / most, hgt = (y0 - top) * r;
    ctx.fillStyle = loops.includes(i + 1) ? css('--accent') : css('--accent-2');
    ctx.globalAlpha = loops.includes(i + 1) ? 0.95 : 0.45;
    ctx.fillRect(x + bw * 0.18, y0 - hgt, bw * 0.64, hgt);
    ctx.globalAlpha = 1;
    if (send[i] > 0) { ctx.strokeStyle = css('--text'); ctx.strokeRect(x + bw * 0.1, y0 - (y0 - top) * Math.min(1, send[i]), bw * 0.8, (y0 - top) * Math.min(1, send[i])); }
    ctx.fillStyle = css('--muted'); ctx.fillText(String(i + 1), x + bw / 2, h - 4);
  }
}

shell.keys.focus(focus);
update();
