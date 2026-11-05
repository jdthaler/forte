// gamelan-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './gamelan-instrument.js';
import { wasmModel } from './gamelan-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let focus = 60, struck = -1e9, beat = 0, partners = [0, 0];
const levels = new Map();   // key → its level (modal velocity), from the engine
const trace = [];           // the struck key's [time (ms), level]

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; struck = performance.now(); trace.length = 0; update(); },
  onParam: () => update(),
  onMessage: (m) => {
    if (m.type !== 'gamelan') return;
    if (m.focus === focus) { beat = m.beat; partners = m.f; }
    levels.clear();
    for (const [k, a] of m.voices) levels.set(k, a);
    trace.push([performance.now(), levels.get(focus) ?? 0]);
    while (trace.length && trace[0][0] < performance.now() - 3000) trace.shift();
  },
});

const DEGREE = (key) => { const d = model.larasDegree(key, shell.P.laras); return d > 0 ? `pélog ${d}` : d < 0 ? `sléndro ${-d}` : ''; };
const KIND = { bend: 'bending', torsion: 'twisting', round: 'round', diameters: 'nodal diameters', rim: 'rim', air: 'tube' };
const modeName = (m) => (m.kind === 'bend' ? `bending ${m.order}` : m.kind === 'torsion' ? `torsion ${m.order}` : m.kind === 'round' ? 'round' : m.kind === 'rim' ? `rim (${m.order},0)` : `(${m.order},1)`);

function update() {
  const P = shell.P, d = model.design(focus, P, P.velocity), f1 = d.f1;
  const peak = Math.max(...d.modes.map((m) => Math.abs(m.amp * m.out)));
  spectrum.set(f1, d.modes.map((m, i) => ({ f: m.f, alpha: 0.25 + 0.65 * Math.min(1, Math.abs(m.amp * m.out) / peak), color: i === 0 ? css('--accent') : m.kind === 'torsion' || m.kind === 'diameters' ? css('--accent-2') : undefined })));
  const reg = model.register(focus, P.instrument);
  $('#focus-name').textContent = noteName(focus);
  $('#focus-size').textContent = `${reg.name}${d.bar ? ` · bar ${(100 * d.bar.L).toFixed(1)} × ${(100 * d.bar.w).toFixed(1)} × ${(1000 * d.bar.h).toFixed(0)} mm` : ''} · ${f1.toFixed(1)} Hz ${DEGREE(focus)}`;
  $('#modes').innerHTML = '<tr><th>mode</th><th>f (Hz)</th><th>ratio</th><th>T60 (s)</th><th>strike</th></tr>'
    + d.modes.map((m, n) => `<tr class="${n === 0 ? 'note' : m.kind}"><td>${modeName(m)}</td><td>${m.f.toFixed(1)}</td><td>${(m.f / f1).toFixed(3)}</td><td>${(6.91 / m.sigma).toFixed(2)}</td><td>${(Math.abs(m.amp * m.out) / peak).toFixed(2)}</td></tr>`).join('')
    + (d.tube ? `<tr class="air"><td>tube</td><td>${d.tube.f.toFixed(1)}</td><td>${(d.tube.f / f1).toFixed(3)}</td><td>${(6.91 / d.tube.sigma).toFixed(2)}</td><td>—</td></tr>` : '')
    + `<tr><td class="foot" colspan="5">${d.bar ? 'Bending and twisting (torsion) modes of a thick free–free bar (Timoshenko); the tube a stopped pipe under it.' : 'The measured modes of a ' + (d.family === 'gong' ? 'Balinese gong ageng (Krueger et al. 2010)' : 'small kettle gong (Perrin et al. 2014)') + ': round ones move the boss, the others have nodal diameters, in split pairs.'} Strike: how much of each the stroke puts in, relative to the largest.${d.pairs && P.ombak > 0 ? ` Paired: each partner ${(P.ombak / 2).toFixed(1)} Hz either side.` : ''}</td></tr>`;
}

const glowOf = (a) => Math.max(0, Math.min(1, (20 * Math.log10(Math.max(a, 1e-9)) + 50) / 45));

// The instrument round the struck key: its octave's bars (pélog's seven over sléndro's five, or
// twelve in a row), or kettles and gongs, each glowing as it rings; a pair's two partners side by
// side, their glow swelling and fading together at the beat.
animate(() => {
  const { ctx, w, h } = fit($('#gamelan'));
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, base = focus - (focus % 12), fam = model.register(focus, P.instrument).family;
  if (w < 40 || h < 30) return;
  const rows = P.laras === 'gamelan' ? [[0, 2, 4, 5, 7, 9, 11], [1, 3, 6, 8, 10]] : [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]];
  const now = performance.now(), t = (now - struck) / 1000, paired = P.ombak > 0 && fam !== 'gong';
  const rowH = h / rows.length;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  rows.forEach((row, r) => {
    const n = row.length, cw = w / n;
    row.forEach((pc, i) => {
      const key = base + pc;
      if (key < 21 || key > 108) return;
      const a = levels.get(key) ?? 0, cx = cw * (i + 0.5), cy = rowH * (r + 0.5);
      // the pair's beat on the struck key: the two partners in and out of step
      const swell = paired && key === focus && beat > 0 ? 0.5 + 0.5 * Math.cos(2 * Math.PI * beat * t) : 1;
      const g = glowOf(a) * (paired && key === focus ? 0.35 + 0.65 * swell : 1);
      const parts = paired ? 2 : 1;
      for (let s = 0; s < parts; s++) {
        const pw = (cw * 0.82) / parts, px = cx - (cw * 0.82) / 2 + pw * (s + 0.5);
        ctx.globalAlpha = 0.1 + 0.85 * g; ctx.fillStyle = css('--accent');
        if (fam === 'gangsa' || fam === 'saron') {
          const len = Math.min(rowH * 0.85, rowH * 0.85 * Math.sqrt(model.noteFreq(base, P) / model.noteFreq(key, P)));
          const bw = pw * 0.7;
          if (fam === 'gangsa') { ctx.globalAlpha = 0.25; ctx.fillStyle = css('--bamboo'); ctx.fillRect(px - bw * 0.35, cy - len / 2 + 4, bw * 0.7, len * 0.95); ctx.globalAlpha = 0.1 + 0.85 * g; ctx.fillStyle = css('--accent'); }
          ctx.fillRect(px - bw / 2, cy - len / 2, bw, len * 0.4);
          ctx.globalAlpha = 1; ctx.strokeStyle = key === focus ? css('--text') : css('--grid'); ctx.strokeRect(px - bw / 2, cy - len / 2, bw, len * 0.4);
        } else {
          const R = Math.min(pw * 0.45, rowH * 0.4) * (fam === 'gong' ? 1 : 0.8);
          ctx.beginPath(); ctx.arc(px, cy, R, 0, 2 * Math.PI); ctx.fill();
          ctx.globalAlpha = 1; ctx.strokeStyle = key === focus ? css('--text') : css('--grid'); ctx.stroke();
          ctx.beginPath(); ctx.arc(px, cy, R * 0.3, 0, 2 * Math.PI); ctx.fillStyle = css('--boss'); ctx.globalAlpha = 0.5 + 0.5 * g; ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      const px = Math.min(12, cw / 4);
      if (px >= 8) { ctx.font = `${Math.round(px)}px system-ui, sans-serif`; ctx.fillStyle = css('--muted'); ctx.fillText(noteName(key), cx, rowH * (r + 1) - px); }
    });
  });
  const reg = model.register(focus, P.instrument);
  $('#gamelan-read').textContent = `${reg.name}${paired ? ' pairs' : ''} · ${DEGREE(focus) || noteName(focus)}`;
}, $('#gamelan'));

// The ombak: the two partners' notes as arrows turning against each other at the beat, their sum
// (what you hear) growing and shrinking, and the struck key's level over the last three seconds.
animate(() => {
  const { ctx, w, h } = fit($('#ombak'));
  ctx.clearRect(0, 0, w, h);
  if (w < 40 || h < 30) return;
  const now = performance.now(), t = (now - struck) / 1000, R = Math.min(h / 2 - 8, w / 4 - 8), cx = R + 10, cy = h / 2;
  const fam = model.register(focus, shell.P.instrument).family, paired = shell.P.ombak > 0 && fam !== 'gong' && beat > 0;
  ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
  if (R > 8) {
    const ph = paired ? Math.PI * beat * t : 0, arrow = (a, len, col, x0 = cx, y0 = cy) => {
      const x1 = x0 + len * Math.cos(a), y1 = y0 - len * Math.sin(a);
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.lineWidth = 1;
      return [x1, y1];
    };
    const half = (paired ? 0.5 : 1) * R;
    const [x1, y1] = arrow(Math.PI / 2 + ph, half, css('--accent-2'));
    if (paired) arrow(Math.PI / 2 - ph, half, css('--accent'), x1, y1);
    arrow(Math.PI / 2, paired ? R * Math.abs(Math.cos(ph)) : R, css('--text'));
  }
  // the level trace
  const x0 = 2 * R + 24, X = (tm) => x0 + ((w - x0 - 6) * (tm - (now - 3000))) / 3000, lo = -60, Y = (db) => 6 + ((h - 12) * -Math.max(lo, Math.min(0, db))) / -lo;
  ctx.strokeStyle = css('--grid'); for (let db = lo; db <= 0; db += 20) { ctx.beginPath(); ctx.moveTo(x0, Y(db)); ctx.lineTo(w, Y(db)); ctx.stroke(); }
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.beginPath();
  trace.forEach(([tm, a], i) => { const x = X(tm), y = Y(20 * Math.log10(Math.max(a, 1e-9))); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.stroke(); ctx.lineWidth = 1;
  $('#ombak-read').textContent = paired ? `${noteName(focus)} · ${partners[0].toFixed(1)} and ${partners[1].toFixed(1)} Hz · beats ${beat.toFixed(1)} Hz (${(1200 * Math.log2(partners[1] / partners[0])).toFixed(1)} ¢ apart)` : fam === 'gong' ? 'gongs hang alone: their own ombak is in the spectrogram' : 'one instrument: no pair';
}, $('#ombak'));

// The modes' shapes and where the mallet lands: a bar's first bending modes along it (and its
// first torsion), or a gong's modes from above, their nodal lines.
animate(() => {
  const { ctx, w, h } = fit($('#shapes'));
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, d = model.design(focus, P, P.velocity);
  if (w < 40 || h < 30) return;
  ctx.font = '10px system-ui, sans-serif';
  if (d.bar) {
    const x0 = 16, x1 = w - 16, show = [['bend', 1], ['bend', 2], ['bend', 3], ['torsion', 1]];
    show.forEach(([kind, n], r) => {
      const yc = ((r + 0.5) * h) / show.length, A = h / (show.length * 3);
      ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(x0, yc); ctx.lineTo(x1, yc); ctx.stroke();
      ctx.strokeStyle = kind === 'bend' ? css('--accent') : css('--accent-2'); ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 120; i++) { const u = i / 120, s = kind === 'bend' ? model.bendShape(n - 1, u) / 2 : Math.cos(n * Math.PI * u); const X = x0 + u * (x1 - x0), Y = yc - A * s; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
      ctx.stroke(); ctx.lineWidth = 1;
      const m = d.modes.find((x) => x.kind === kind && x.order === n);
      ctx.fillStyle = css('--muted'); if (m && yc - A - 3 > 8) ctx.fillText(`${kind === 'bend' ? 'bending' : 'twisting'} ${n} · ${(m.f / d.f1).toFixed(2)} × the note`, x0, yc - A - 3);
    });
    const xs = x0 + (0.5 + 0.5 * P.along) * (x1 - x0);
    ctx.strokeStyle = css('--text'); ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(xs, 0); ctx.lineTo(xs, h); ctx.stroke(); ctx.setLineDash([]);
  } else {
    const ms = d.modes.filter((m) => m.kind !== 'rim').slice(0, 6), n = ms.length, R = Math.min(h / 2 - 12, (w / n) / 2 - 6);
    if (R < 8) return;
    ctx.textAlign = 'center';
    ms.forEach((m, i) => {
      const cx = (w / n) * (i + 0.5), cy = h / 2 + 4;
      ctx.fillStyle = css('--panel'); ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = m.kind === 'round' ? css('--accent') : css('--accent-2'); ctx.lineWidth = 1.5;
      if (m.kind === 'round') { const rings = i === 0 ? 0 : 1; for (let q = 1; q <= rings; q++) { ctx.beginPath(); ctx.arc(cx, cy, (R * q) / (rings + 1), 0, 2 * Math.PI); ctx.stroke(); } }
      else for (let q = 0; q < m.order; q++) { const a = (q * Math.PI) / m.order; ctx.beginPath(); ctx.moveTo(cx - R * Math.cos(a), cy - R * Math.sin(a)); ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); ctx.stroke(); }
      ctx.lineWidth = 1;
      ctx.fillStyle = css('--boss'); ctx.beginPath(); ctx.arc(cx, cy, R * 0.22, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = css('--text'); ctx.beginPath(); ctx.arc(cx + R * P.gongStrike * 0.95, cy, 3, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = css('--muted'); ctx.fillText(`${modeName(m)} · ${(m.f / d.f1).toFixed(2)}`, cx, cy - R - 3);
    });
    ctx.textAlign = 'left';
  }
}, $('#shapes'));

update();
