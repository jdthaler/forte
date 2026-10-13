// template-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../../shared/shell.js';
import { SpectrumView, fit, css, animate } from '../../../shared/views.js';
import { GROUPS, PRESETS } from './template-params.js';
import { keyModes, modeShape, BETA_L } from './template-model.js';

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
let focus = 60;

const shell = createShell({
  id: 'template',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'],
  worklet: { modules: ['src/template-engine.js'], engine: 'TemplateEngine' },
  chain: { volume: 'volume', room: 'room' },
  space: 'sustain',
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; update(); },
  onParam: () => update(),
});

function update() {
  const modes = keyModes(focus, shell.P);
  spectrum.set(modes[0].f, modes.map((m) => ({ f: m.f, alpha: 0.3 + 0.6 * Math.min(1, Math.abs(m.amp)) })));
  $('#focus-name').textContent = noteName(focus);
  $('#modes').innerHTML = '<tr><th>mode</th><th>f (Hz)</th><th>ratio</th><th>T60 (s)</th><th>strike gain</th></tr>'
    + modes.map((m, n) => `<tr><td>${n + 1}</td><td>${m.f.toFixed(1)}</td><td>${(m.f / modes[0].f).toFixed(3)}</td><td>${(6.91 / m.sigma).toFixed(2)}</td><td>${m.amp.toFixed(3)}</td></tr>`).join('');
}

// The bar: its first four mode shapes, and where the mallet lands.
animate(() => {
  const { ctx, w, h } = fit($('#bar'));
  ctx.clearRect(0, 0, w, h);
  const x0 = 24, x1 = w - 24, cols = [css('--accent'), css('--accent-2'), '#9fe39f', '#d8a0ff'];
  for (let n = 0; n < 4; n++) {
    const yc = ((n + 0.5) * h) / 4, A = h / 12;
    ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(x0, yc); ctx.lineTo(x1, yc); ctx.stroke();
    ctx.strokeStyle = cols[n]; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= 200; i++) { const u = i / 200, X = x0 + u * (x1 - x0), Y = yc - (A * modeShape(n, u)) / 2; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
    ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif'; ctx.fillText(`mode ${n + 1}  (βL = ${BETA_L[n].toFixed(3)})`, x0, yc - A - 2);
  }
  const xs = x0 + shell.P.strike * (x1 - x0);
  ctx.strokeStyle = css('--text'); ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(xs, 0); ctx.lineTo(xs, h); ctx.stroke(); ctx.setLineDash([]);
});

update();
