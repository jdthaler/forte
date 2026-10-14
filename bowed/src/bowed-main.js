// bowed-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, fit, css, animate } from '../../shared/views.js';
import { GROUPS, PRESETS } from './bowed-params.js';
import { RANGE, loopDesign, schelleng, friction, keyForce, riseTime, helmholtz, helmholtzEnvelope, VOICED } from './bowed-model.js';
import { BowedString, settleTime } from './string.js';

const $ = (s) => document.querySelector(s);
const FS = 48000;
const spectrum = new SpectrumView($('#spectrum'), { fLo: 40, fHi: 16000, dbTop: -10, dbRange: 90 });
const KIND = { helmholtz: 'Helmholtz motion', multiple: 'multiple slipping (surface sound)', raucous: 'raucous', none: '—' };
let focus = 60, st = null, mean = null;
const trail = [];

const shell = createShell({
  id: 'bowed',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'],
  range: RANGE,
  base: 48,
  worklet: { modules: ['src/bowed-engine.js'], engine: 'OrganistaEngine' },
  chain: { volume: 'volume', room: 'room' },
  space: 'hold',
  arrows: { param: 'force', step: 0.05 },
  modWheel: 'force',
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onMessage: (m) => {
    if (m.type !== 'state') return;
    if (m.key !== st?.key) mean = null;
    st = m;
    if (m.active) { trail.push([m.beta, m.FN, m.kind]); if (trail.length > 80) trail.shift(); }
    $('#motion-read').innerHTML = m.active ? `<b>${KIND[m.kind]}</b> · ${m.spp.toFixed(2)} slips/period` : '';
    $('#force-read').textContent = m.active ? `F = ${fmtN(m.FN)}` : '';
    info();
  },
  onNoteOn: (key) => { if (key !== focus) { focus = key; trail.length = 0; update(); } },
  onParam: () => update(),
});

const fmtN = (F) => (F >= 1 ? `${F.toFixed(2)} N` : `${(F * 1000).toFixed(F < 0.01 ? 1 : 0)} mN`);
const design = () => loopDesign(focus, shell.P, FS);

function update() {
  const L = design();
  $('#focus-name').textContent = noteName(focus);
  $('#attack-name').textContent = noteName(focus);
  spectrum.set(L.fKey, [{ f: L.fKey, alpha: 0.6 }]);
  attackMap.invalidate();
  info();
}

function info() {
  const P = shell.P, L = design(), S = schelleng(L, P), h = helmholtz(L.beta, P.speed);
  const F = st && st.key === focus && st.active ? st.FN : keyForce(focus, P.velocity, P.force);
  const kind = st && st.key === focus && st.active ? st.kind : 'none';
  const rows = [
    ['string', `${(L.L * 100).toFixed(0)} cm, ${L.T.toFixed(0)} N, ${L.wound ? 'wound' : 'plain'} steel`],
    ['wave speed, Z₀', `${L.c.toFixed(0)} m/s, ${L.Z0.toFixed(3)} kg/s`],
    ['free string', `${L.f0.toFixed(2)} Hz (+${(1200 * Math.log2(L.f0 / L.fKey)).toFixed(1)} ¢; bowing flattens it)`],
    ['decay of free string', `T60 = ${(6.91 / L.sigma1).toFixed(1)} s`],
    ['wheel', `β = ${L.beta.toFixed(3)} (${(L.beta * L.L * 1000).toFixed(0)} mm from bridge), v_B = ${(P.speed * 100).toFixed(0)} cm/s`],
    ['Helmholtz slip', `${(h.vSlip * 100).toFixed(0)} cm/s for ${(L.beta * 100).toFixed(0)} % of each period`],
    ['corner amplitude at wheel', `${(P.speed * (1 - L.beta) * 1000 / L.f0).toFixed(2)} mm peak to peak`],
    ['Schelleng F_min … F_max', `${fmtN(S.Fmin)} … ${fmtN(S.Fmax)}`],
    ['voiced touch', fmtN(VOICED[focus])],
    ['force now', `${fmtN(F)} = ${(F / S.Fmax).toFixed(2)} F_max`],
    ['motion', KIND[kind]],
  ];
  $('#info').innerHTML = rows.map(([k, v], i) => `<dt>${k}</dt><dd${i === rows.length - 1 ? ` class="${kind}"` : ''}>${v}</dd>`).join('');
}

// ---- the string ---------------------------------------------------------------
const cvS = $('#string');
let wheelAngle = 0;
animate(() => {
  if (cvS.offsetParent === null) return;
  const { ctx, w, h } = fit(cvS);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, L = design();
  const x0 = 26, x1 = Math.max(x0 + 10, w - 26), yc = h * 0.42, X = (u) => x0 + u * (x1 - x0);
  const xb = X(L.beta), R = Math.max(2, Math.min(h * 0.22, 60));
  // bridge and nut
  ctx.fillStyle = css('--spruce');
  ctx.fillRect(x0 - 8, yc - 3, 8, h * 0.5);
  ctx.fillStyle = css('--muted');
  ctx.fillRect(x1, yc - 3, 6, h * 0.5);
  ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('bridge', x0 - 4, Math.min(h - 2, yc + h * 0.5 + 10));
  ctx.fillText('nut', x1 + 3, Math.min(h - 2, yc + h * 0.5 + 10));
  // the wheel, under the string, turning at the bow speed
  const pressed = st && st.key === focus && st.active && st.FN > 0;
  const wy = yc + R + 3;
  wheelAngle += (P.speed / 0.08) / 60;
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.globalAlpha = pressed ? 1 : 0.5;
  ctx.beginPath(); ctx.arc(xb, wy, R, 0, 2 * Math.PI); ctx.stroke();
  ctx.lineWidth = 1;
  for (let k = 0; k < 6; k++) {
    const a = wheelAngle + (k * Math.PI) / 3;
    ctx.beginPath(); ctx.moveTo(xb, wy); ctx.lineTo(xb + R * Math.cos(a), wy + R * Math.sin(a)); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // shape and Helmholtz envelope
  const N = 96, env = new Float64Array(N);
  let emax = 1e-9;
  for (let j = 0; j < N; j++) { env[j] = helmholtzEnvelope((j / (N - 1)) * L.L, L.L, L.beta, P.speed, L.f0); emax = Math.max(emax, env[j]); }
  const shape = st && st.key === focus && st.active ? st.shape : null;
  if (shape) {
    if (!mean || mean.length !== N) mean = Float64Array.from(shape);
    else for (let j = 0; j < N; j++) mean[j] += 0.08 * (shape[j] - mean[j]);
  }
  const g = (h * 0.3) / emax;
  ctx.setLineDash([3, 4]); ctx.strokeStyle = css('--muted');
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    for (let j = 0; j < N; j++) { const Y = yc - g * ((mean ? mean[j] : 0) + (sgn * env[j]) / 2); if (j) ctx.lineTo(X(j / (N - 1)), Y); else ctx.moveTo(X(j / (N - 1)), Y); }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = css('--text'); ctx.lineWidth = 2;
  ctx.beginPath();
  for (let j = 0; j < N; j++) { const Y = yc - g * (shape ? shape[j] : 0); if (j) ctx.lineTo(X(j / (N - 1)), Y); else ctx.moveTo(X(j / (N - 1)), Y); }
  ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'left';
  ctx.fillText(`displacement × ${(g / 1000).toFixed(0)} px/mm`, x0, 12);
}, cvS);

// ---- Schelleng diagram -----------------------------------------------------------
const cvD = $('#schelleng');
animate(() => {
  if (cvD.offsetParent === null) return;
  const { ctx, w, h } = fit(cvD);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, L = design();
  const bLo = 0.02, bHi = 0.5;
  const S = (b) => schelleng({ ...L, beta: b }, P, b, P.speed);
  const fLo = Math.max(1e-5, S(bHi).Fmin / 4), fHi = S(bLo).Fmax * 4;
  const pl = 40, pr = 8, pt = 8, pb = 22, W = Math.max(1, w - pl - pr), H = Math.max(1, h - pt - pb);
  const X = (b) => pl + (W * Math.log(b / bLo)) / Math.log(bHi / bLo);
  const Y = (F) => pt + (H * Math.log(fHi / F)) / Math.log(fHi / fLo);
  const line = (fn) => { ctx.beginPath(); for (let i = 0; i <= 60; i++) { const b = bLo * (bHi / bLo) ** (i / 60), y = Math.max(pt, Math.min(pt + H, Y(fn(b)))); if (i) ctx.lineTo(X(b), y); else ctx.moveTo(X(b), y); } };
  const fill = (top, bot, color) => {
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) { const b = bLo * (bHi / bLo) ** (i / 60); ctx.lineTo(X(b), Math.max(pt, Math.min(pt + H, Y(top(b))))); }
    for (let i = 60; i >= 0; i--) { const b = bLo * (bHi / bLo) ** (i / 60); ctx.lineTo(X(b), Math.max(pt, Math.min(pt + H, Y(bot(b))))); }
    ctx.closePath(); ctx.fillStyle = color; ctx.globalAlpha = 0.13; ctx.fill(); ctx.globalAlpha = 1;
  };
  fill(() => fHi, (b) => Math.max(S(b).Fmax, S(b).Fmin), css('--rauc'));
  fill((b) => S(b).Fmax, (b) => Math.min(S(b).Fmax, S(b).Fmin), css('--helm'));
  fill((b) => Math.min(S(b).Fmin, S(b).Fmax), () => fLo, css('--multi'));
  ctx.strokeStyle = css('--rauc'); ctx.lineWidth = 1.5; line((b) => S(b).Fmax); ctx.stroke();
  ctx.strokeStyle = css('--multi'); line((b) => S(b).Fmin); ctx.stroke(); ctx.lineWidth = 1;
  // axes
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.strokeStyle = css('--grid');
  ctx.textAlign = 'center';
  for (const b of [0.02, 0.05, 0.1, 0.2, 0.5]) { ctx.beginPath(); ctx.moveTo(X(b), pt); ctx.lineTo(X(b), pt + H); ctx.stroke(); ctx.fillText(String(b), X(b), h - 8); }
  ctx.fillText('β (wheel position)', pl + W / 2, h - 0);
  ctx.textAlign = 'right';
  for (let e = Math.ceil(Math.log10(fLo)); e <= Math.floor(Math.log10(fHi)); e++) { const F = 10 ** e; ctx.beginPath(); ctx.moveTo(pl, Y(F)); ctx.lineTo(pl + W, Y(F)); ctx.stroke(); ctx.fillText(fmtN(F), pl - 3, Y(F) + 3); }
  ctx.textAlign = 'left'; ctx.fillStyle = css('--text'); ctx.globalAlpha = 0.6;
  ctx.fillText('raucous', X(0.25), Math.max(pt + 10, Y(S(0.25).Fmax) - 6));
  ctx.fillText('Helmholtz', X(0.03), Y(Math.sqrt(S(0.03).Fmax * Math.max(S(0.03).Fmin, 1e-9))));
  ctx.fillText('surface sound', X(0.06), Math.min(pt + H - 4, Y(S(0.06).Fmin) + 14));
  ctx.globalAlpha = 1;
  // the key: voiced force and the live operating point
  const col = (k) => (k === 'helmholtz' ? css('--helm') : k === 'multiple' ? css('--multi') : k === 'raucous' ? css('--rauc') : css('--muted'));
  for (let i = 0; i < trail.length; i++) {
    const [b, F, k] = trail[i];
    if (!(F > fLo)) continue;
    ctx.fillStyle = col(k); ctx.globalAlpha = (0.5 * i) / trail.length;
    ctx.beginPath(); ctx.arc(X(b), Y(F), 2.5, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const live = st && st.key === focus && st.active && st.FN > fLo;
  const F = live ? st.FN : keyForce(focus, P.velocity, P.force);
  ctx.beginPath(); ctx.arc(X(L.beta), Y(Math.max(F, fLo)), 6, 0, 2 * Math.PI);
  if (live) { ctx.fillStyle = col(st.kind); ctx.fill(); } else { ctx.strokeStyle = css('--text'); ctx.stroke(); }
}, cvD);

// ---- bow-point velocity ---------------------------------------------------------------
const cvV = $('#bowv');
animate(() => {
  if (cvV.offsetParent === null) return;
  const { ctx, w, h } = fit(cvV);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, L = design(), hz = helmholtz(L.beta, P.speed);
  const vTop = 1.6 * P.speed, vBot = 1.25 * hz.vSlip;
  const Y = (v) => 6 + ((h - 18) * (vTop - v)) / (vTop - vBot);
  ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left';
  for (const [v, lab, c] of [[P.speed, 'v_B (stick)', '--helm'], [0, '0', '--grid'], [hz.vSlip, '−v_B(1−β)/β (slip)', '--multi']]) {
    ctx.strokeStyle = css(c); ctx.setLineDash(v ? [4, 4] : []); ctx.beginPath(); ctx.moveTo(0, Y(v)); ctx.lineTo(w, Y(v)); ctx.stroke();
    ctx.fillStyle = css('--muted'); ctx.fillText(lab, 4, Y(v) - 3);
  }
  ctx.setLineDash([]);
  if (!st || st.key !== focus || !st.active) return;
  const x = st.trace, n = x.length, per = Math.max(4, st.period);
  const span = Math.min(n - 2, Math.round(3 * per));
  // trigger on the last slip onset that leaves a full window
  let end = n - 1;
  for (let i = n - 2; i > span; i--) if (x[i] < 0.5 * P.speed && x[i - 1] >= 0.5 * P.speed && i + per * 0.3 < n) { end = Math.min(n - 1, i + Math.round(per * 0.3)); break; }
  const a = end - span;
  ctx.strokeStyle = css('--text'); ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = 0; i <= span; i++) { const X = (i / span) * w, v = Math.max(vBot, Math.min(vTop, x[a + i])); if (i) ctx.lineTo(X, Y(v)); else ctx.moveTo(X, Y(v)); }
  ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  ctx.fillText(`${(span / FS * 1000).toFixed(1)} ms`, w - 4, h - 3);
}, cvV);

// ---- attack map (computed here, a few cells per frame) ---------------------------------
const cvA = $('#attack');
const attackMap = (() => {
  const NX = 14, NY = 12, rises = [], fracs = [];
  for (let i = 0; i < NX; i++) rises.push(0.001 * 150 ** (i / (NX - 1)));
  for (let j = 0; j < NY; j++) fracs.push(0.08 + (0.92 * j) / (NY - 1));
  let grid = new Float64Array(NX * NY), done = 0, key = -1, str = null, Fr = null, Fmax = 1, sig = '';
  const signature = (P) => [focus, P.speed, P.beta, P.mus, P.mud, P.v0, P.memory, P.torsionQ, P.losses, P.mobility].join();
  return {
    rises, fracs, NX, NY,
    invalidate() { const s = signature(shell.P); if (s !== sig) { sig = s; done = 0; grid.fill(NaN); } },
    step(budgetMs) {
      if (done >= NX * NY) return;
      const P = shell.P;
      if (key !== focus || !str) { key = focus; str = new BowedString(focus, FS); }
      const L = loopDesign(focus, P, str.fs);
      str.design(L); Fr = friction(P); Fmax = schelleng(L, P).Fmax;
      const t0 = performance.now();
      while (done < NX * NY && performance.now() - t0 < budgetMs) {
        const i = done % NX, j = Math.floor(done / NX);
        grid[done] = settleTime(str, Fr, P.speed, fracs[j] * Fmax, rises[i], 0.5) * L.f0; // in periods
        done++;
      }
    },
    get grid() { return grid; }, get done() { return done; }, get Fmax() { return Fmax; },
  };
})();
attackMap.invalidate();
animate(() => {
  if (cvA.offsetParent === null) return;
  attackMap.step(6);
  const { ctx, w, h } = fit(cvA);
  ctx.clearRect(0, 0, w, h);
  const { NX, NY, rises, fracs, grid } = attackMap;
  const pl = 44, pr = 70, pt = 6, pb = 24, W = Math.max(1, w - pl - pr), H = Math.max(1, h - pt - pb), cw = W / NX, ch = H / NY;
  const shade = (p) => { // periods to settle → light (fast) … dark (slow)
    if (!Number.isFinite(p)) return 'rgb(30,26,34)';
    const u = Math.min(1, Math.log(1 + p) / Math.log(1 + 60));
    return `rgb(${Math.round(240 - 190 * u)},${Math.round(205 - 160 * u)},${Math.round(160 - 105 * u)})`;
  };
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const p = grid[j * NX + i];
    if (Number.isNaN(p)) continue;
    ctx.fillStyle = shade(p);
    ctx.fillRect(pl + i * cw, pt + (NY - 1 - j) * ch, Math.ceil(cw), Math.ceil(ch));
  }
  // cell centres: rise time 1 … 150 ms (log) across, F/F_max 0.08 … 1 up
  const XR = (ms) => pl + (Math.log(ms) / Math.log(150) * (NX - 1) + 0.5) * cw;
  const YF = (f) => pt + H - (((f - fracs[0]) / (fracs[NY - 1] - fracs[0])) * (NY - 1) + 0.5) * ch;
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
  for (const r of [1, 3, 10, 30, 100]) ctx.fillText(`${r}`, XR(r), h - 10);
  ctx.fillText('force rise time (ms)', pl + W / 2, h - 0);
  ctx.textAlign = 'right';
  for (const f of [0.2, 0.4, 0.6, 0.8, 1]) ctx.fillText(`${f.toFixed(1)}`, pl - 4, YF(f) + 3);
  ctx.save(); ctx.translate(10, pt + H / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('F / F_max', 0, 0); ctx.restore();
  // legend
  ctx.textAlign = 'left';
  [[2, '2 periods'], [10, '10'], [40, '40'], [Infinity, 'not settled']].forEach(([p, lab], k) => {
    ctx.fillStyle = shade(p); ctx.fillRect(pl + W + 8, pt + 4 + k * 16, 12, 12);
    ctx.fillStyle = css('--muted'); ctx.fillText(lab, pl + W + 24, pt + 14 + k * 16);
  });
  // this key's touch
  const P = shell.P, rise = riseTime(P.velocity, P.attack) * 1000, frac = keyForce(focus, P.velocity, P.force) / attackMap.Fmax;
  const xx = XR(Math.max(1, Math.min(150, rise))), yy = YF(Math.max(0.08, Math.min(1.04, frac)));
  ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(xx, yy, Math.max(1, Math.min(7, cw / 2)), 0, 2 * Math.PI); ctx.stroke(); ctx.lineWidth = 1;
  $('#attack-read').textContent = attackMap.done < NX * NY ? `computing ${Math.round((100 * attackMap.done) / (NX * NY))} %` : `touch: ${rise.toFixed(0)} ms rise, ${frac.toFixed(2)} F_max`;
}, cvA);

update();
