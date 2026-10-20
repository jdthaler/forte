// showers-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './showers-instrument.js';
import { wasmModel } from './showers-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum });
const SLOW = 0.5; // the views' slow motion: the first mode turns this many times a second
let focus = 60, struck = -1e9;
// what the engine last told us about each key's crystal: its deposit (and when), its modes
const deposits = new Map(), rings = new Map(), hits = [];
let tree = null; // the struck crystal's cascade, drawn for a moment after each note

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; struck = performance.now(); update(); },
  onParam: () => update(),
  onMessage: (m) => {
    if (m.type === 'shower') {
      deposits.set(m.key, { ...m, at: performance.now() });
      if (m.key === focus) tree = cascade(m);
    } else if (m.type === 'modes') rings.set(m.key, m);
    else if (m.type === 'hit' && m.key === focus) { hits.push({ ...m, at: performance.now() }); if (hits.length > 40) hits.shift(); }
  },
});

const T60 = (sigma) => Math.log(1000) / sigma;
const fmtT = (t) => (t < 1 ? `${(t * 1000).toFixed(0)} ms` : `${t.toFixed(t < 10 ? 2 : 1)} s`);
let modes = [], levels = [];

function update() {
  const P = shell.P, slender = model.slenderness(P.depth, P.width);
  modes = model.modes(focus, P);
  // what this particle rings, at the computer keys' velocity (a pion's, one of its showers)
  const sh = model.shower(P.particle, P.velocity * P.energy, P.depth, { seed: 7, slender });
  const xbar = model.share(P.offset, P.width, 0).xbar;
  levels = modes.map((m) => Math.abs(m.hear * (m.flex ? xbar * sh.kicks.b[m.n - 1] : sh.kicks.a[m.n - 1])));
  const top = Math.max(1e-12, ...levels);
  spectrum.set(modes[0].f, modes.map((m, j) => ({ m, l: levels[j] / top })).filter((x) => x.l > 1e-3)
    .map(({ m, l }) => ({ f: m.f, alpha: 0.2 + 0.7 * Math.sqrt(l), color: m.flex ? css('--accent-2') : undefined })));
  $('#focus-name').textContent = noteName(focus);
  $('#focus-name2').textContent = noteName(focus);
  const rows = modes.map((m, j) => ({ ...m, l: levels[j] / top })).filter((m) => m.l > 3e-3).sort((a, b) => b.l - a.l).slice(0, 14);
  $('#modetab').innerHTML = '<tr><th>mode</th><th>f (Hz)</th><th>f / f₁</th><th>T60</th><th>rung</th></tr>'
    + rows.map((m) => `<tr><td>${m.flex ? `bending ${m.n}` : `stretching ${m.n}`}</td><td>${m.f.toFixed(1)}</td><td>${(m.f / modes[0].f).toFixed(4)}</td>`
      + `<td>${fmtT(T60(m.sigma))}</td><td>${(20 * Math.log10(m.l)).toFixed(1)} dB</td></tr>`).join('');
}

// A picture of the cascade (Heitler's model): the particle splits in two every radiation length
// or so, until its pieces reach the critical energy near the shower's maximum, then they stop.
function cascade(m) {
  let seed = (m.key * 7919 + Math.round(m.gev * 13)) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const tmax = Math.max(1, Math.log((m.gev * 1000) / model.constants.EC_MEV)), gens = Math.min(9, Math.max(1, Math.round(tmax / Math.LN2 / 1.6)));
  const segs = [];
  const grow = (t, y, dir, g) => {
    if (g >= gens) return;
    const len = Math.LN2 * (1.2 + rnd()), t1 = t + len, y1 = y + dir * len * 0.02;
    segs.push({ t, y, t1, y1, g });
    grow(t1, y1, dir + (rnd() - 0.5) * 0.9, g + 1);
    if (rnd() < 0.92) grow(t1, y1, dir - (rnd() - 0.2) * 0.9, g + 1);
  };
  grow(m.start, 0, 0, 0);
  return { segs, gens, at: performance.now(), depth: m.depth };
}

// The row of crystals: the heat each shower left, and the crystal ringing in slow motion.
animate(() => {
  const { ctx, w, h } = fit($('#event'));
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, now = performance.now(), t = now / 1000;
  const rowsN = 7, ip = Math.max(34, w * 0.07), x0 = ip + 6, x1 = w - 10, L = x1 - x0;
  const pitch = h / rowsN, hh = Math.max(4, Math.min(pitch * 0.62, (L / model.slenderness(P.depth, P.width)) * 1.1));
  const yOf = (j) => h / 2 + (j * pitch); // j = −3 … 3, the next key up below
  // the collision: a point on the left
  ctx.fillStyle = css('--muted');
  ctx.beginPath(); ctx.arc(ip * 0.75, h / 2, 3, 0, 2 * Math.PI); ctx.fill();
  const all = [...rings.values()], top = Math.max(1e-9, ...all.map((r) => Math.max(...r.long, ...r.flex.map((b) => b * 0.3), 0)));
  for (let j = -3; j <= 3; j++) {
    const key = focus + j, yc = yOf(j), dep = deposits.get(key), ring = rings.get(key);
    // the heat along the crystal, fading as the next one comes
    if (dep) {
      const age = (now - dep.at) / 1000, peak = Math.max(1e-9, ...[...deposits.values()].map((d) => Math.max(...d.profile)));
      const fade = 0.25 + 0.75 * Math.exp(-age / 1.5);
      const n = dep.profile.length;
      for (let b = 0; b < n; b++) {
        const v = dep.profile[b] / peak;
        if (v < 0.01) continue;
        ctx.globalAlpha = Math.min(0.95, Math.sqrt(v) * fade);
        ctx.fillStyle = css('--accent-2');
        ctx.fillRect(x0 + (L * b) / n, yc - hh / 2, L / n + 0.5, hh);
      }
      ctx.globalAlpha = 1;
    }
    // the crystal's outline, bent by its bending modes, with marks the stretching modes move
    const A = ring ? ring.long.map((a) => a / top) : [], B = ring ? ring.flex.map((b) => b / top) : [];
    const slender = model.slenderness(P.depth, P.width);
    const u = (z) => A.reduce((s, a, n) => s + a * Math.cos((n + 1) * Math.PI * z) * Math.cos(2 * Math.PI * SLOW * (n + 1) * t), 0);
    const y = (z) => B.reduce((s, b, m) => s + b * model.flexShape(m, z) * Math.cos(2 * Math.PI * SLOW * model.flexRatio(m, slender) * t), 0);
    const ux = L * 0.04, uy = pitch * 0.12;
    ctx.strokeStyle = j === 0 ? css('--text') : css('--muted');
    ctx.lineWidth = j === 0 ? 1.6 : 1;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const z = i / 40, X = x0 + L * z + ux * u(z), Y = yc + s * hh / 2 + uy * y(z);
        if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      }
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.45;
    for (let i = 1; i < 16; i++) {
      const z = i / 16, X = x0 + L * z + ux * u(z), Y = yc + uy * y(z);
      ctx.beginPath(); ctx.moveTo(X, Y - hh / 2 + 2); ctx.lineTo(X, Y + hh / 2 - 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif';
    if (key >= 21 && key <= 108) ctx.fillText(noteName(key), 2, yc - 3);
  }
  // the particle coming in, and its cascade in the struck crystal
  const age = (now - struck) / 1000, yIn = h / 2 + P.offset * pitch;
  if (age < 0.6) {
    ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.globalAlpha = 1 - age / 0.6;
    ctx.beginPath(); ctx.moveTo(ip * 0.75, h / 2); ctx.lineTo(x0, yIn); ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  }
  if (tree) {
    const ta = (now - tree.at) / 1000;
    if (ta < 1.6) {
      ctx.strokeStyle = css('--accent');
      for (const sg of tree.segs) {
        ctx.globalAlpha = Math.max(0, (1 - ta / 1.6) * (1 - sg.g / (tree.gens + 1)));
        ctx.beginPath();
        ctx.moveTo(x0 + (L * sg.t) / tree.depth, yIn + sg.y * pitch * 2);
        ctx.lineTo(x0 + (L * Math.min(sg.t1, tree.depth)) / tree.depth, yIn + sg.y1 * pitch * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  // pile-up photons landing, as sparks where they convert
  for (const s of hits) {
    const a = 1 - (now - s.at) / 400;
    if (a <= 0) continue;
    ctx.globalAlpha = a; ctx.fillStyle = css('--accent');
    ctx.beginPath(); ctx.arc(x0 + (L * Math.min(s.start, s.depth)) / s.depth, h / 2 + s.x * hh, 2.5, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const d = deposits.get(focus);
  ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif';
  if (d) ctx.fillText(`${d.particle}, ${d.gev >= 1000 ? `${(d.gev / 1000).toFixed(2)} TeV` : `${d.gev.toFixed(d.gev < 10 ? 1 : 0)} GeV`}`, x0, h - 3);
}, $('#event'));

// The shower's profile along the crystal, the first stretching modes' strain, and the modes' levels.
animate(() => {
  const { ctx, w, h } = fit($('#profile'));
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, d = deposits.get(focus), T = P.depth;
  const barsW = Math.min(150, w * 0.32), padL = 30, padR = barsW + 16, padT = 14, padB = 22, W = Math.max(10, w - padL - padR), H = Math.max(10, h - padT - padB);
  const span = T * 1.25, X = (t) => padL + (W * t) / span, Y = (v) => padT + H * (1 - v);
  ctx.strokeStyle = css('--grid'); ctx.strokeRect(padL, padT, W, H);
  // the crystal's back face, and the leaked part beyond it
  ctx.fillStyle = css('--grid'); ctx.globalAlpha = 0.35; ctx.fillRect(X(T), padT, X(span) - X(T), H); ctx.globalAlpha = 1;
  // the stretching modes' strain along the crystal, sin(nπz/L)
  const cols = [css('--accent'), css('--muted'), css('--muted')];
  for (let n = 1; n <= 3; n++) {
    ctx.strokeStyle = cols[n - 1]; ctx.globalAlpha = 0.5; ctx.setLineDash(n === 1 ? [] : [3, 3]);
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) { const z = i / 60, v = 0.5 + 0.42 * Math.sin(n * Math.PI * z); if (i) ctx.lineTo(X(z * T), Y(v)); else ctx.moveTo(X(z * T), Y(v)); }
    ctx.stroke();
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  // the mean electromagnetic profile at this energy beyond the face, for the leak, and the last shower
  const E = P.velocity * P.energy, tm = model.emTmax(E, P.particle === 'photon');
  const prof = d?.profile ?? null, n = prof?.length ?? 24;
  let peak = 0;
  for (let i = 0; i <= 80; i++) peak = Math.max(peak, model.emProfile((span * i) / 80, tm));
  if (prof) peak = Math.max(peak, ...prof);
  ctx.strokeStyle = css('--accent-2'); ctx.setLineDash([4, 3]); ctx.beginPath();
  for (let i = 0; i <= 80; i++) { const tt = (span * i) / 80, v = model.emProfile(tt, tm) / peak; if (i) ctx.lineTo(X(tt), Y(0.95 * v)); else ctx.moveTo(X(tt), Y(0.95 * v)); }
  ctx.stroke(); ctx.setLineDash([]);
  if (prof) {
    ctx.fillStyle = css('--accent-2'); ctx.globalAlpha = 0.8;
    for (let b = 0; b < n; b++) { const v = prof[b] / peak; ctx.fillRect(X((b * T) / n), Y(0.95 * v), X(T / n) - X(0) + 0.5, Y(0) - Y(0.95 * v)); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(`left ${(100 * prof.reduce((s, v) => s + v, 0) * (T / n)).toFixed(0)} % in this crystal`, padL + 4, padT + 11);
  }
  ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('front', padL, h - 6); ctx.fillText('back', X(T) - 22, h - 6); ctx.fillText(`${T.toFixed(1)} X₀`, X(T) + 3, h - 6);
  // the modes' levels now, in dB under the loudest
  const r = rings.get(focus), bx = w - barsW - 6;
  if (r) {
    const ms = model.modes(focus, P), hear = (flex, k) => Math.abs(ms.find((m) => m.flex === flex && m.n === k)?.hear ?? 0);
    const lv = [...r.long.map((a, i) => ({ v: a * hear(false, i + 1), flex: false })), ...r.flex.map((b, i) => ({ v: b * hear(true, i + 1), flex: true }))];
    const tp = Math.max(1e-12, ...lv.map((x) => x.v)), bw = barsW / Math.max(1, lv.length);
    lv.forEach((x, i) => {
      const v = x.v > 0 ? Math.max(0, 1 + (20 * Math.log10(x.v / tp)) / 60) : 0;
      ctx.fillStyle = x.flex ? css('--accent-2') : css('--accent');
      ctx.fillRect(bx + i * bw, Y(v), Math.max(1, bw - 1), Y(0) - Y(v));
    });
  }
  ctx.fillStyle = css('--muted');
  ctx.fillText('modes now (60 dB)', bx, h - 6);
}, $('#profile'));

update();
