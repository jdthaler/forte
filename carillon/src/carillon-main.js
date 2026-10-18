// carillon-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './carillon-instrument.js';
import { PARTIAL_NAMES, DESIGNATION, idealRatio } from './partials.js';
import { geomOf, innerAt, outerAt } from './bell-profile.js';
import { wasmModel } from './carillon-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly. (The
// rib's outline, drawn from its stations, is the FEM's JavaScript: bell-profile.js.)
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const TAU = 2 * Math.PI;
const cents = (a, b) => 1200 * Math.log2(a / b);
const spectrum = new SpectrumView($('#spectrum'), { fLo: 40, fHi: 16000 });
new SpectrogramView($('#spectrogram'), { spectrum });
let focus = 60, sel = null, live = null, levelHist = [], atStrike = null;

const shell = createShell({
  ...INSTRUMENT,
  base: 60,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { if (key !== focus) levelHist = []; focus = key; atStrike = null; shell.keys.focus?.(key); update(); },
  onParam: () => update(),
  onMessage: (m) => {
    if (m.type !== 'bell' || !m.key) return;
    live = { key: m.key, id: m.id, amp: Float32Array.from(m.amp.subarray(0, m.n)), age: m.age, contactMs: m.contactMs, fwhm: m.fwhm, Fmax: m.Fmax, v: m.v, t: performance.now() / 1000 };
    if (!B || m.key !== focus || m.id !== bellId()) return;
    // the partials as heard just after the strike: what the strike note is made of
    if (m.age > 0.03 && m.age < 0.2 && (!atStrike || atStrike.age > m.age)) atStrike = { amp: live.amp, age: m.age };
    if (sel !== null) {
      levelHist.push({ t: live.t, a: levelOf(sel) });
      while (levelHist.length && levelHist[0].t < live.t - 8) levelHist.shift();
    }
  },
});
const bellId = () => `${shell.P.profile}|${shell.P.historic}`;

// ---- the focus bell: its modes, resonators (doublet members) and partial table --------------------
let B = null, MODES = null, RES = null, G = null, ESTIMATE = null;
const fmtHz = (f) => (f < 100 ? f.toFixed(2) : f < 1000 ? f.toFixed(1) : f.toFixed(0));
const isLive = () => live && live.key === focus && live.id === bellId() && performance.now() / 1000 - live.t < 0.5;
// a mode's heard amplitude (both members of its doublet) in a set of resonator amplitudes
function levelOf(i, amp = live?.amp) {
  if (!amp) return 0;
  let a = 0;
  for (let r = 0; r < RES.length; r++) if (RES[r][0] === i) a += amp[r] || 0;
  return a;
}
// the resonators' frequencies and amplitudes as the estimator's partials
function partialsFrom(amp) {
  const P = shell.P;
  return RES.map(([i, mem], r) => {
    const md = MODES[i], as = model.asymmetryOf(md.m, P.asym / 100, B.hist);
    return { f: md.f * (md.m > 0 ? model.doubletSplit(md.kappa, as.e)[mem] : 1), a: amp[r] || 0, i };
  });
}
function update() {
  const P = shell.P;
  B = model.bellOf(focus, P.profile, P.historic);
  MODES = model.bellModes(B, P);
  RES = [];
  MODES.forEach((md, i) => { RES.push([i, 0]); if (md.m > 0) RES.push([i, 1]); });
  G = geomOf(B.rib.stations);
  if (sel === null || sel >= MODES.length) sel = MODES.findIndex((m) => m.name === 'nominal');
  const name = noteName(focus);
  $('#focus-name').textContent = name; $('#bell-key').textContent = name;
  $('#focus-size').textContent = `${(B.D * 100).toFixed(0)} cm across, ${B.mass < 1000 ? `${B.mass.toFixed(0)} kg` : `${(B.mass / 1000).toFixed(2)} t`} · ${B.rib.register} rib`;
  ESTIMATE = null;
  drawTable();
}

function drawTable() {
  const P = shell.P, fNom = B.fNom, liveNow = isLive();
  let amax = 1e-30;
  if (liveNow) for (let i = 0; i < MODES.length; i++) amax = Math.max(amax, levelOf(i));
  const idx = MODES.map((m, i) => i), named = idx.filter((i) => MODES[i].name), others = idx.filter((i) => !MODES[i].name && MODES[i].f < 4.5 * B.fPrime);
  const row = (i) => {
    const md = MODES[i], tm = B.rib.modes[md.j], as = model.asymmetryOf(md.m, P.asym / 100, B.hist), sp = model.doubletSplit(md.kappa, as.e);
    const split = md.m > 0 ? md.f * (sp[1] - sp[0]) : 0;
    const id = md.name, c = id ? cents(md.f, (fNom * idealRatio(id, P.profile)) / 2) : null;
    const lv = liveNow ? levelOf(i) / amax : 0, db = lv > 0 ? 20 * Math.log10(lv) : -Infinity;
    const bar = db > -60 ? `<i style="width:${(60 + db).toFixed(0)}px"></i>` : '';
    const t60 = 6.91 / md.sigma;
    return `<tr data-i="${i}" class="${id ? 'named' : ''}${i === sel ? ' sel' : ''}"><td>${id ? PARTIAL_NAMES[id] : `m = ${md.m}`}</td><td>${id ? DESIGNATION[id] : `(${md.m},${tm.c.length})`}</td>`
      + `<td>${fmtHz(md.f)}</td><td>${(md.f / B.fPrime).toFixed(3)}</td><td>${id ? `${c >= 0 ? '+' : ''}${c.toFixed(1)}` : ''}</td>`
      + `<td>${md.m > 0 ? split.toFixed(split < 1 ? 3 : 2) : '—'}</td><td>${t60 < 10 ? t60.toFixed(1) : t60.toFixed(0)}</td><td class="bar">${bar}</td></tr>`;
  };
  const c = model.clapperOf(B, P), v = model.clapperSpeed(B, P, P.velocity), tau = model.hertzTime(c.m, c.K, v);
  $('#partials').innerHTML = '<tr><th>partial</th><th>(m,n)</th><th>f (Hz)</th><th>× prime</th><th>¢ off</th><th>split (Hz)</th><th>T₆₀ (s)</th><th>level</th></tr>'
    + named.map(row).join('') + others.map(row).join('')
    + `<tr><td colspan="8" class="note">Tuned by the nominal, ${fmtHz(fNom)} Hz, an octave above the key. ¢ off: from the ideal ${P.profile === 'major' ? '0.5 : 1 : 1.25 : 1.5 : 2 : 2.5 : 3 : 4' : '0.5 : 1 : 1.2 : 1.5 : 2 : 2.5 : 3 : 4'}, read against the nominal (the founder tunes the first five). (m,n): 2m nodal meridians, n nodal circles. Split: how far apart the doublet’s two modes are, the rate they beat at. T₆₀: bronze’s loss plus radiation. `
    + `Clapper ball ${c.m < 10 ? c.m.toFixed(2) : c.m.toFixed(0)} kg at ${v.toFixed(1)} m/s (the computer keys’ stroke): Hertz contact ≈ ${(tau * 1000).toFixed(2)} ms against a rigid wall.</td></tr>`;
}
$('#partials').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-i]');
  if (!tr) return;
  sel = +tr.dataset.i; levelHist = [];
  drawTable();
});
setInterval(() => { if (B && isLive()) drawTable(); }, 250);

// ---- the bell, a mode's shape, from the side and from below -------------------------------------------
const bcv = $('#bell');
animate(() => {
  if (!B) return;
  const { ctx, w, h } = fit(bcv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, md = MODES[sel], tm = B.rib.modes[md.j], now = performance.now() / 1000;
  const stripH = Math.max(22, Math.min(40, h * 0.16)), top = 8, bot = h - stripH - 12;
  // side view: the section to scale, the bell's axis in the middle
  const H = B.rib.H, sc = Math.min((w * 0.55) / 1.08, (bot - top) / (H + 0.06)), sideW = 1.08 * sc;
  const cx = 6 + sideW / 2, X = (r) => cx + r * sc, Y = (z) => bot - z * sc;
  let lmax = 1e-30;
  if (isLive()) for (let i = 0; i < MODES.length; i++) lmax = Math.max(lmax, levelOf(i));
  const amp = isLive() ? Math.min(1, (3 * levelOf(sel)) / lmax) : 0.6, phase = Math.cos(TAU * 0.6 * now);
  const view = tm.v, wmax = view ? Math.max(...view.map(Math.abs), 1e-9) : 1, A = (0.045 * amp) / wmax;
  const wAt = (u) => { if (!view) return 0; const x = u * (view.length - 1), i = Math.min(view.length - 2, Math.floor(x)), f = x - i; return view[i] * (1 - f) + view[i + 1] * f; };
  for (const side of [1, -1]) {
    const sgn = side > 0 ? 1 : tm.m % 2 ? -1 : 1; // the far side, θ = π, moves as cos mπ
    ctx.beginPath();
    const N = 80;
    for (let i = 0; i <= N; i++) { const u = i / N, [r, z] = outerAt(G, u), [a, b] = G.tan(u), d = A * sgn * phase * wAt(u); if (i) ctx.lineTo(X(side * (r - b * d)), Y(z + a * d)); else ctx.moveTo(X(side * (r - b * d)), Y(z + a * d)); }
    for (let i = N; i >= 0; i--) { const u = i / N, [r, z] = innerAt(G, u), [a, b] = G.tan(u), d = A * sgn * phase * wAt(u); ctx.lineTo(X(side * (r - b * d)), Y(z + a * d)); }
    ctx.closePath();
    const grd = ctx.createLinearGradient(X(-0.5), 0, X(0.5), 0);
    grd.addColorStop(0, '#6e5530'); grd.addColorStop(0.5, '#d2ae6a'); grd.addColorStop(1, '#6e5530');
    ctx.fillStyle = grd; ctx.fill();
  }
  ctx.fillStyle = '#4a4f57'; ctx.fillRect(X(-0.14), Y(H + 0.05), 0.28 * sc, 0.035 * sc); // the headstock
  ctx.strokeStyle = css('--accent-2'); ctx.setLineDash([4, 4]);
  for (const c of tm.c) { const z = c * H; ctx.beginPath(); ctx.moveTo(X(-0.53), Y(z)); ctx.lineTo(X(0.53), Y(z)); ctx.stroke(); }
  ctx.setLineDash([]);
  // the clapper: its ball against the inner wall at the strike height, its shaft from the crown
  const zi = P.strikeHeight * H;
  let ri = 0.4, best = 1;
  for (let i = 0; i <= 300; i++) { const [r, z] = innerAt(G, i / 300); if (Math.abs(z - zi) < best && z < 0.8 * H) { best = Math.abs(z - zi); ri = r; } }
  const br = 0.05, bx = X(ri - br - 0.004), by = Y(zi);
  ctx.strokeStyle = '#8b9099'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(0), Y(H - 0.04)); ctx.lineTo(bx, by); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.arc(bx, by, Math.max(3, br * sc), 0, TAU); ctx.fill();
  // seen from below: the lip's 2m lobes, nodal meridians, the doublet's axes, the strike point, the listener
  const tx = cx + sideW / 2 + 10, tw = w - tx - 6;
  if (tw > 60 && md.m > 0) {
    const R = Math.min(tw * 0.34, (bot - top) * 0.36), ox = tx + tw / 2, oy = top + (bot - top) / 2;
    const as = model.asymmetryOf(md.m, P.asym / 100, B.hist), psi = as.psi, lip = view ? Math.abs(view[view.length - 1]) / wmax : 1;
    ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.arc(ox, oy, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= 180; i++) { const th = (i / 180) * TAU, rr = R * (1 + 0.12 * amp * lip * phase * Math.cos(md.m * (th - psi))); const px = ox + rr * Math.cos(th), py = oy - rr * Math.sin(th); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.stroke(); ctx.lineWidth = 1;
    ctx.strokeStyle = css('--accent-2'); ctx.setLineDash([3, 3]);
    for (let q = 0; q < 2 * md.m; q++) { const th = psi + (Math.PI / 2 + q * Math.PI) / md.m; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + 1.12 * R * Math.cos(th), oy - 1.12 * R * Math.sin(th)); ctx.stroke(); }
    ctx.setLineDash([]);
    if (as.e > 0) { // the lower member's antinode (the heavy side) ━, and the upper member's ┄
      for (const [ang, dash] of [[psi, []], [psi + Math.PI / (2 * md.m), [2, 2]]]) {
        ctx.strokeStyle = '#efe2bf'; ctx.lineWidth = 2.5; ctx.setLineDash(dash); ctx.beginPath();
        ctx.moveTo(ox + 1.18 * R * Math.cos(ang), oy - 1.18 * R * Math.sin(ang)); ctx.lineTo(ox + 1.36 * R * Math.cos(ang), oy - 1.36 * R * Math.sin(ang)); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.lineWidth = 1;
    }
    const al = (P.strikeAngle * Math.PI) / 180, be = ((P.strikeAngle + P.around) * Math.PI) / 180;
    ctx.fillStyle = css('--strike'); ctx.beginPath();
    ctx.moveTo(ox + 0.86 * R * Math.cos(al), oy - 0.86 * R * Math.sin(al)); ctx.lineTo(ox + 0.66 * R * Math.cos(al + 0.13), oy - 0.66 * R * Math.sin(al + 0.13)); ctx.lineTo(ox + 0.66 * R * Math.cos(al - 0.13), oy - 0.66 * R * Math.sin(al - 0.13)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = css('--text'); const lx = ox + 1.5 * R * Math.cos(be), ly = oy - 1.5 * R * Math.sin(be);
    ctx.beginPath(); ctx.moveTo(lx, ly - 5); ctx.lineTo(lx + 5, ly); ctx.lineTo(lx, ly + 5); ctx.lineTo(lx - 5, ly); ctx.closePath(); ctx.fill();
    ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${2 * md.m} nodal meridians`, ox, Math.min(bot + 8, oy + 1.4 * R + 12));
    ctx.textAlign = 'left';
  }
  // strip: the chosen partial's level as heard, last 8 s
  const sy = h - stripH - 2, sx = 6, swd = w - 12;
  ctx.strokeStyle = css('--grid'); ctx.strokeRect(sx, sy, swd, stripH);
  if (levelHist.length > 1) {
    const t1 = levelHist[levelHist.length - 1].t, amx = Math.max(...levelHist.map((p) => p.a), 1e-30);
    ctx.strokeStyle = css('--accent'); ctx.beginPath();
    levelHist.forEach((p, i) => { const xx = sx + swd * (1 - (t1 - p.t) / 8), db = 20 * Math.log10(Math.max(p.a, 1e-30) / amx), yy = sy + Math.min(stripH, (-db / 40) * stripH); if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); });
    ctx.stroke();
  }
  ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('this partial as heard, last 8 s (40 dB)', sx + 4, sy + 11);
  $('#mode-name').textContent = md.name ? `${PARTIAL_NAMES[md.name]} ${DESIGNATION[md.name]}` : `m = ${md.m}, ${tm.c.length} nodal circle${tm.c.length === 1 ? '' : 's'}`;
  $('#bell-read').textContent = isLive() && live.contactMs ? `clapper on the bell ${live.contactMs.toFixed(2)} ms (force pulse ${live.fwhm.toFixed(2)} ms wide), peak ${live.Fmax < 1e4 ? live.Fmax.toFixed(0) : `${(live.Fmax / 1000).toFixed(1)}k`} N` : `${fmtHz(md.f)} Hz${view ? '' : ' (shape not drawn)'}`;
}, bcv);

// ---- the strike note: subharmonic summation on the partials as heard just after the strike -------------
const scv = $('#strike');
animate(() => {
  if (!B) return;
  const { ctx, w, h } = fit(scv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, liveNow = isLive(), struck = atStrike && live && live.key === focus && live.id === bellId();
  // the estimate: from the partials just after the last strike (or, before any, the model's prediction)
  if (!ESTIMATE || ESTIMATE.src !== (struck ? atStrike : null)) {
    const parts = struck ? partialsFrom(atStrike.amp) : model.struckPartials(B, P).map((p, k) => ({ ...p, i: k }));
    ESTIMATE = { ...model.strikeNote(parts), src: struck ? atStrike : null };
  }
  const parts = liveNow ? partialsFrom(live.amp) : model.struckPartials(B, P).map((p, k) => ({ ...p, i: k }));
  const fLo = 40, fHi = 12000, X = (f) => 8 + ((w - 16) * Math.log(f / fLo)) / Math.log(fHi / fLo);
  const midY = h * 0.45, botY = h - 16;
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.textAlign = 'center'; ctx.strokeStyle = css('--grid');
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { ctx.beginPath(); ctx.moveTo(X(f), 4); ctx.lineTo(X(f), botY); ctx.stroke(); ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, X(f), h - 4); }
  // pitch strength (of the estimate's input)
  const est = ESTIMATE;
  if (est.curve) {
    const c = est.curve, cm = Math.max(...c, 1e-30);
    ctx.strokeStyle = css('--accent-2'); ctx.beginPath();
    let first = true;
    for (let i = 0; i < c.length; i++) { const f = 2 ** (Math.log2(est.fLo) + i / est.ppo); if (f < fLo || f > fHi) continue; const yy = midY - (c[i] / cm) * (midY - 12); if (!first) ctx.lineTo(X(f), yy); else { ctx.moveTo(X(f), yy); first = false; } }
    ctx.stroke();
  }
  // partial stems: level as heard now, 50 dB range
  let amx = 1e-30;
  for (const p of parts) amx = Math.max(amx, p.a);
  for (const p of parts) {
    if (!(p.a > 0) || p.f > fHi) continue;
    const db = 20 * Math.log10(p.a / amx);
    if (db < -50) continue;
    const yy = botY - ((db + 50) / 50) * (botY - midY - 14), nm = MODES[p.i]?.name;
    ctx.strokeStyle = nm ? css('--accent') : 'rgba(217,180,95,0.45)'; ctx.lineWidth = nm ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(X(p.f), botY); ctx.lineTo(X(p.f), yy); ctx.stroke(); ctx.lineWidth = 1;
  }
  // names of the main partials, each on the first of three lines where it fits
  const ends = [-1e9, -1e9, -1e9];
  for (const md of MODES) {
    if (!md.name || md.f > fHi || ['quint', 'deciem'].includes(md.name)) continue;
    const xx = X(md.f), label = md.name === 'octnom' ? 'oct. nom.' : md.name === 'superquint' ? 'superq.' : md.name, hw = ctx.measureText(label).width / 2 + 3;
    const row = ends.findIndex((e) => e < xx - hw);
    if (row < 0) continue;
    ends[row] = xx + hw;
    ctx.fillStyle = css('--muted'); ctx.fillText(label, xx, midY + 4 + 10 * row);
  }
  if (est.f > 0) {
    const xs = X(est.f);
    ctx.strokeStyle = css('--strike'); ctx.lineWidth = 2; ctx.setLineDash([5, 3]); ctx.beginPath(); ctx.moveTo(xs, 6); ctx.lineTo(xs, botY); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
    let near = null, dc = Infinity;
    for (const md of MODES) { const c = Math.abs(cents(md.f, est.f)); if (c < dc) { dc = c; near = md; } }
    const k = 69 + 12 * Math.log2(est.f / 440), kr = Math.round(k), off = 100 * (k - kr), cn = cents(est.f, B.fNom / 2);
    $('#strike-read').textContent = `${fmtHz(est.f)} Hz = ${noteName(kr)} ${off >= 0 ? '+' : ''}${off.toFixed(1)} ¢ · nominal ÷ 2 ${cn >= 0 ? '+' : ''}${cn.toFixed(1)} ¢ · nearest partial: ${near.name ? PARTIAL_NAMES[near.name] : `m = ${near.m}`}, ${dc.toFixed(0)} ¢ away${struck ? '' : ' (predicted)'}`;
  }
  spectrum.set(0, MODES.filter((m) => m.f < 16000).map((m) => ({ f: m.f, color: m.name ? '#d9b45f' : 'rgba(217,180,95,0.4)', alpha: m.name ? 0.85 : 0.5 })).concat(est.f > 0 ? [{ f: est.f, color: '#ff6b5a', alpha: 0.9 }] : []));
}, scv);

update();
