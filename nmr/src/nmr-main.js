// nmr-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { tunedFreq } from '../../shared/tuning.js';
import { INSTRUMENT } from './nmr-instrument.js';
import { wasmModel } from './nmr-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum });
let focus = 60;

// each sample's chemical groups, in the order of the model's table
const NAMES = {
  ethanol: ['CH₃', 'CH₂', 'OH'],
  ethanolFast: ['CH₃', 'CH₂', 'OH'],
  water: ['HDO'],
  ethylAcetate: ['CH₃', 'CH₃CO', 'OCH₂'],
  propanol: ['(CH₃)₂', 'CH'],
};
const SPLIT = ['singlet', 'doublet', 'triplet', 'quartet', 'quintet', 'sextet', 'septet'];
const OF = ['', 'doublets', 'triplets', 'quartets'];
// a group's multiplet, first order: its neighbours' protons, the larger coupling first
function multiplet(s, i) {
  const n = s.couplings.filter((c) => c.a === i || c.b === i).map((c) => ({ n: s.groups[c.a === i ? c.b : c.a].n, J: c.J })).sort((a, b) => b.J - a.J);
  if (!n.length) return 'singlet';
  return n.map((x, j) => (j ? `of ${OF[x.n] ?? `${x.n + 1}-lets`}` : SPLIT[x.n] ?? `${x.n + 1}-let`)).join(' ') + ` (J ${n.map((x) => x.J.toFixed(0)).join(', ')} Hz)`;
}

const WINDOW = 4;       // s of the receiver's record on screen
const traces = [];      // { t, key, heard, bound } from the engine's frames
const pulses = [];      // π pulse times
const strikes = [];     // { t, key }
const mzOf = new Map(); // key → { mz, t }: each sample's magnetisation along the field when last set
let frame = { at: 0, voices: [] };
const now = () => performance.now() / 1000;
const hue = (key) => `hsl(${(((key - 21) * 47) % 360 + 360) % 360} 80% 68%)`;

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; update(); },
  onParam: () => update(),
  onMessage: (m) => {
    const t = now();
    if (m.type === 'frame') {
      frame = { at: t, voices: m.voices };
      for (const v of m.voices) { traces.push({ t, key: v.key, heard: v.heard, bound: v.bound }); mzOf.set(v.key, { mz: v.mz, t }); }
      while (traces.length && traces[0].t < t - WINDOW) traces.shift();
    } else if (m.type === 'strike') {
      strikes.push({ t, key: m.key });
      mzOf.set(m.key, { mz: m.mzAfter, t });
      while (strikes.length && strikes[0].t < t - WINDOW) strikes.shift();
    } else if (m.type === 'pulse') {
      pulses.push(t);
      for (const k of m.keys) mzOf.set(k.key, { mz: k.mz, t });
      while (pulses.length && pulses[0] < t - WINDOW) pulses.shift();
    }
  },
});

const fmtHz = (f) => (f >= 1e9 ? `${(f / 1e9).toFixed(3)} GHz` : f >= 1e6 ? `${(f / 1e6).toFixed(1)} MHz` : f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(f < 10 ? 2 : 1)} Hz`);
const fmtT = (s) => (s < 0.1 ? `${(s * 1000).toFixed(1)} ms` : `${s.toFixed(2)} s`);
let sys = model.keySystem(focus, shell.P), smp = model.sample(shell.P.sample);

// the field's spread at a key, as a line width (Hz, full width at half height), and with T₂
const spreadOf = (P, f0) => P.shim * 1e-9 * f0;
const widthOf = (P, f0) => spreadOf(P, f0) + 1 / (Math.PI * Math.min(P.t2, 2 * P.t1));

function update() {
  const P = shell.P;
  sys = model.keySystem(focus, P);
  smp = model.sample(P.sample);
  const f = tunedFreq(P, focus), names = NAMES[P.sample] ?? [];
  const strong = sys.lines.filter((l) => l.intensity > 0.004);
  spectrum.set(f, strong.map((l) => ({ f: l.f, alpha: Math.min(0.9, 0.25 + 3 * l.intensity) })));
  for (const id of ['#focus-name', '#spins-key', '#nmr-key']) $(id).textContent = noteName(focus);
  const dv = spreadOf(P, sys.f0), w = widthOf(P, sys.f0);
  $('#nmr-read').textContent = `${fmtHz(sys.f0)} · lines ${w < 10 ? w.toFixed(2) : w.toFixed(0)} Hz wide`;
  const rows = [
    ['note', `${noteName(focus)}, ${f.toFixed(2)} Hz: the ${names[smp.groups.findIndex((g) => g.ppm === sys.anchor)] ?? 'lowest'} line, ${sys.anchor} ppm`],
    ['Larmor frequency', `${fmtHz(sys.f0)} (protons)`],
    ['field B₀', `${sys.B0.toFixed(2)} T${sys.B0 > model.STRONGEST_T ? ` · stronger than any magnet built (${model.STRONGEST_T} T)` : ''}`],
    ...smp.groups.map((g, i) => [names[i] ?? `group ${i + 1}`, `${g.ppm} ppm → ${fmtHz(g.ppm * 1e-6 * sys.f0)} · ${g.n} H · ${multiplet(smp, i)}`]),
    ['field spread', `${P.shim < 10 ? P.shim.toFixed(1) : P.shim.toFixed(0)} ppb = ${fmtHz(dv)}: dephased in T₂′ ≈ ${fmtT(1 / (Math.PI * Math.max(dv, 1e-9)))}`],
    ['T₂*', fmtT(1 / (Math.PI * w))],
    ['lines', `${sys.lines.length} (the spins' transitions, exactly)`],
  ];
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

// The unit distribution of the field's spread (full width 1), as N quantiles: each arrow's speed.
function quantiles(profile, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const q = (i + 0.5) / n;
    if (profile === 'gradient') out.push(q - 0.5);
    else if (profile === 'gauss') {
      // the normal quantile, through Winitzki's approximation of erf⁻¹ (plenty for a picture)
      const x = 2 * q - 1, a = 0.147, l = Math.log(1 - x * x), t = 2 / (Math.PI * a) + l / 2;
      out.push((Math.sign(x) * Math.sqrt(Math.sqrt(t * t - l / a) - t) * Math.SQRT2) / 2.3548200450309493);
    } else out.push(0.5 * Math.tan(Math.PI * (q - 0.5)));
  }
  return out;
}

// The spins: the fan of isochromats in the rotating frame, for the key last played.
animate(() => {
  const { ctx, w, h } = fit($('#spins'));
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, cx = w / 2, cy = h / 2 + 4, r = Math.max(8, Math.min(w, h) / 2 - 16);
  ctx.strokeStyle = css('--grid');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
  const v = frame.voices.find((x) => x.key === focus) ?? frame.voices[frame.voices.length - 1];
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted');
  if (!v) { ctx.fillText('play a key', 6, 14); $('#spins-read').textContent = ''; return; }
  const ks = model.keySystem(v.key, P);
  const rate = 2 * Math.PI * spreadOf(P, ks.f0); // S per second
  const S = v.S + rate * Math.min(0.1, now() - frame.at);
  const len = r * Math.min(1, Math.abs(v.bound));
  // what T₂ and diffusion leave: the ring an echo can reach
  ctx.strokeStyle = css('--accent-2'); ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.arc(cx, cy, len, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = hue(v.key); ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2;
  for (const u of quantiles(P.profile, 24)) {
    const a = -Math.PI / 2 + u * S; // starting along the receiver's axis (up)
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + len * Math.cos(a), cy + len * Math.sin(a)); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.strokeStyle = css('--text');
  const net = r * v.heard; // the sum, along the axis (negative: a gradient's sinc past its zero)
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - net); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = css('--muted');
  $('#spins-read').textContent = `${noteName(v.key)} · ${fmtT(v.age)} after its pulse · ${(100 * Math.abs(v.heard) / Math.max(1e-9, Math.abs(v.bound))).toFixed(0)} % in step`;
}, $('#spins'));

// The receiver: each sample's signal over the last few seconds, with what an echo could bring back.
animate(() => {
  const { ctx, w, h } = fit($('#receiver'));
  ctx.clearRect(0, 0, w, h);
  const t1 = now(), t0 = t1 - WINDOW, padL = 6, padB = 14, top = 10;
  const X = (t) => padL + ((t - t0) / WINDOW) * (w - padL - 6), Y = (a) => h - padB - Math.min(1, Math.abs(a)) * (h - padB - top);
  ctx.strokeStyle = css('--grid'); ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted');
  ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(w - 6, Y(0)); ctx.stroke();
  for (let s = Math.ceil(t0); s <= t1; s++) { ctx.beginPath(); ctx.moveTo(X(s), top); ctx.lineTo(X(s), h - padB); ctx.stroke(); }
  ctx.fillText(`last ${WINDOW} s`, w - 52, h - 2);
  // pulses: the strikes' (90°, small) and the pedal's (π, tall)
  ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 2;
  for (const p of pulses) { ctx.beginPath(); ctx.moveTo(X(p), 0); ctx.lineTo(X(p), top + 6); ctx.stroke(); }
  ctx.lineWidth = 1;
  for (const s of strikes) { ctx.strokeStyle = hue(s.key); ctx.beginPath(); ctx.moveTo(X(s.t), 2); ctx.lineTo(X(s.t), top - 2); ctx.stroke(); }
  // each key's trace
  const byKey = new Map();
  for (const p of traces) { if (!byKey.has(p.key)) byKey.set(p.key, []); byKey.get(p.key).push(p); }
  for (const [key, pts] of byKey) {
    ctx.strokeStyle = hue(key);
    ctx.setLineDash([2, 3]); ctx.globalAlpha = 0.6; ctx.beginPath();
    pts.forEach((p, i) => { if (i && p.t - pts[i - 1].t < 0.2) ctx.lineTo(X(p.t), Y(p.bound)); else ctx.moveTo(X(p.t), Y(p.bound)); });
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineWidth = 1.5; ctx.beginPath();
    pts.forEach((p, i) => { if (i && p.t - pts[i - 1].t < 0.2) ctx.lineTo(X(p.t), Y(p.heard)); else ctx.moveTo(X(p.t), Y(p.heard)); });
    ctx.stroke(); ctx.lineWidth = 1;
  }
}, $('#receiver'));

// The NMR spectrum of the key's magnet: ppm falling to the right, as chemists plot it, and in hertz below.
animate(() => {
  const { ctx, w, h } = fit($('#nmrspec'));
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, names = NAMES[P.sample] ?? [], pad = 10, padB = 28, top = 16;
  const ppms = smp.groups.map((g) => g.ppm);
  const lo = Math.min(...ppms) - 0.45, hi = Math.max(...ppms) + 0.45; // ppm
  const X = (ppm) => pad + ((hi - ppm) / (hi - lo)) * (w - 2 * pad);
  const f0 = sys.f0, hzPerPx = ((hi - lo) * 1e-6 * f0) / Math.max(1, w - 2 * pad);
  const width = Math.max(widthOf(P, f0), 1.5 * hzPerPx); // Hz: at least a pixel or two
  const n = Math.max(2, Math.floor(w - 2 * pad)), ys = new Float64Array(n + 1);
  const gauss = P.profile === 'gauss', box = P.profile === 'gradient';
  for (const l of sys.lines) {
    if (Math.abs(l.intensity) < 1e-5) continue;
    const c = l.f / f0 * 1e6, i0 = Math.max(0, Math.floor((hi - c - 8 * width / (f0 * 1e-6)) / (hi - lo) * n)), i1 = Math.min(n, Math.ceil((hi - c + 8 * width / (f0 * 1e-6)) / (hi - lo) * n));
    for (let i = i0; i <= i1; i++) {
      const d = ((hi - (i / n) * (hi - lo)) - c) * 1e-6 * f0; // Hz from the line
      const x = d / width;
      ys[i] += l.intensity * (gauss ? Math.exp(-4 * Math.LN2 * x * x) : box ? 1 / (1 + (2 * x) ** 16) : 1 / (1 + 4 * x * x));
    }
  }
  let most = 0;
  for (const y of ys) most = Math.max(most, y);
  const base = h - padB;
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.3; ctx.beginPath();
  for (let i = 0; i <= n; i++) { const y = base - (ys[i] / most) * (base - top - 10); if (i) ctx.lineTo(pad + i * (w - 2 * pad) / n, y); else ctx.moveTo(pad, y); }
  ctx.stroke(); ctx.lineWidth = 1;
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.strokeStyle = css('--grid');
  ctx.beginPath(); ctx.moveTo(pad, base); ctx.lineTo(w - pad, base); ctx.stroke();
  const step = hi - lo > 3 ? 1 : 0.5;
  ctx.textAlign = 'center';
  for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) {
    ctx.beginPath(); ctx.moveTo(X(p), base); ctx.lineTo(X(p), base + 3); ctx.stroke();
    ctx.fillText(`${p}`, X(p), base + 12);
    ctx.fillText(fmtHz(p * 1e-6 * f0).replace(' kHz', 'k').replace(' Hz', ''), X(p), base + 24);
  }
  ctx.textAlign = 'left'; ctx.fillText('ppm', pad, base + 12); ctx.fillText('Hz', pad, base + 24);
  ctx.textAlign = 'center'; ctx.fillStyle = css('--text');
  smp.groups.forEach((g, i) => ctx.fillText(names[i] ?? '', X(g.ppm), top - 2));
  ctx.textAlign = 'left';
}, $('#nmrspec'));

// Every key's magnetisation along the field, growing back toward equilibrium by T₁.
animate(() => {
  const { ctx, w, h } = fit($('#mz'));
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, t = now(), pad = 6, mid = h / 2, amp = h / 2 - 10, n = 88, bw = (w - 2 * pad) / n;
  ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(pad, mid); ctx.lineTo(w - pad, mid); ctx.stroke();
  ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(pad, mid - amp); ctx.lineTo(w - pad, mid - amp); ctx.moveTo(pad, mid + amp); ctx.lineTo(w - pad, mid + amp); ctx.stroke(); ctx.setLineDash([]);
  for (let i = 0; i < n; i++) {
    const key = 21 + i, s = mzOf.get(key);
    const mz = s ? 1 - (1 - s.mz) * Math.exp(-(t - s.t) / P.t1) : 1;
    ctx.fillStyle = mz >= 0 ? css('--accent') : css('--accent-2');
    ctx.globalAlpha = key === focus ? 1 : 0.7;
    const y = mid - mz * amp;
    ctx.fillRect(pad + i * bw + 0.5, Math.min(mid, y), Math.max(1, bw - 1), Math.max(1, Math.abs(y - mid)));
  }
  ctx.globalAlpha = 1;
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted');
  ctx.fillText('+M₀', pad + 2, mid - amp - 2); ctx.fillText('−M₀', pad + 2, mid + amp + 9);
}, $('#mz'));

update();
