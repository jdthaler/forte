// cuore-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { tunedFreq } from '../../shared/tuning.js';
import { INSTRUMENT } from './cuore-instrument.js';
import { wasmModel } from './cuore-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let focus = 69, focusVel = null;
let frame = { crystals: [] }; // the engine's latest state of every sounding crystal

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key, vel) => { focus = key; focusVel = vel; update(); },
  onMessage: (m) => { if (m.type === 'frame') frame = m; },
  onPanic: () => { frame = { crystals: [] }; },
  onParam: () => update(),
});

const sig = (v, d = 3) => Number(v.toPrecision(d)).toLocaleString('en-US', { maximumSignificantDigits: d });
const fmtTime = (s) => (s < 1 ? `${sig(s * 1000)} ms` : s < 120 ? `${sig(s)} s` : `${sig(s / 60)} min`);

// The time between a pulse's 10 % and 90 % on its rise, and between its 90 % and 30 % on its fall,
// as CUORE quotes them.
function times(x, dt) {
  let peak = 0, at = 0;
  x.forEach((v, i) => { if (v > peak) { peak = v; at = i; } });
  let r10 = 0, r90 = 0, d90 = at, d30 = at;
  for (let i = 0; i <= at; i++) { if (!r10 && x[i] >= 0.1 * peak) r10 = i; if (!r90 && x[i] >= 0.9 * peak) r90 = i; }
  for (let i = at; i < x.length; i++) { if (d90 === at && x[i] < 0.9 * peak) d90 = i; if (x[i] < 0.3 * peak) { d30 = i; break; } }
  return { peak, rise: (r90 - r10) * dt, decay: (d30 - d90) * dt };
}

let view = null; // the focus key's pulses: { t, x, lin, rest, … }

function update() {
  const P = shell.P, rest = model.rest(P);
  const f = tunedFreq(P, focus), speedup = P.periodA4 * 440, period = speedup / f; // s of the crystal's time
  const vel = focusVel ?? P.velocity, E = P.energy * vel;
  // the pulses on screen: four seconds, or two and a half heater periods
  const span = Math.min(Math.max(4, 2.5 * period), 60), n = 1200, dt = span / n;
  const tr = model.train(P, E, period, dt, n, { sub: Math.max(2, Math.ceil(dt / 0.002)) });
  const x = Array.from(tr.V, (v) => rest.V - v);
  // a small pulse scaled up: what the thermistor would give if it answered in proportion
  const small = model.train(P, 1e-3, period, dt, n, { sub: Math.max(2, Math.ceil(dt / 0.002)) });
  const lin = Array.from(small.V, (v) => ((rest.V - v) * E) / 1e-3);
  // one pulse alone, for its times and its spectrum
  const one = model.train(P, E, 0, 0.002, 2000, { sub: 1, stride: 2 });
  const single = Array.from(one.V, (v) => rest.V - v), t1 = times(single, 0.004);
  view = { x, lin, span, period, rest, E, t1 };
  // the note's harmonics: the pulse's spectrum at n × the heater's rate (in the crystal's time)
  const top = Math.min(40, Math.floor(18000 / f)), amps = [];
  for (let h = 1; h <= top; h++) {
    const w = (2 * Math.PI * h) / period;
    let re = 0, im = 0;
    single.forEach((v, i) => { re += v * Math.cos(w * i * 0.004); im += v * Math.sin(w * i * 0.004); });
    amps.push(Math.hypot(re, im));
  }
  const most = Math.max(1e-30, ...amps);
  spectrum.set(f, amps.map((a, i) => ({ f: (i + 1) * f, alpha: 0.2 + 0.7 * Math.sqrt(a / most) })).filter((m) => m.alpha > 0.22));
  $('#focus-name').textContent = noteName(focus);
  $('#pulse-read').textContent = `${sig(E, 3)} MeV every ${fmtTime(period)} · peak ${sig(t1.peak * 1e6)} µV · rise ${fmtTime(t1.rise)} · fall ${fmtTime(t1.decay)}`;
  $('#pulse-more').textContent = `Speed-up ${sig(speedup)}×: the heater on ${noteName(focus)} fires every ${fmtTime(period)} here and ${f.toFixed(1)} times a second in the sound.`;
  $('#bolo-read').textContent = `${sig(rest.mass)} g TeO₂ · C = ${sig(rest.Cc * 1e9)} nJ/K · R = ${sig(rest.R / 1e6)} MΩ at rest`;
}

// The pulses: the thermistor's voltage off its rest (µV, as the bolometer gives it), in the
// crystal's time, with the proportional answer dashed.
animate(() => {
  const { ctx, w, h } = fit($('#pulse'));
  ctx.clearRect(0, 0, w, h);
  if (!view) return;
  const { x, lin, span } = view;
  const x0 = 46, x1 = w - 10, y0 = 12, y1 = h - 22;
  const hi = Math.max(1e-12, ...x, ...lin) * 1.1, lo = Math.min(0, ...x) * 1.1;
  const X = (i) => x0 + (i / (x.length - 1)) * (x1 - x0), Y = (v) => y1 - ((v - lo) / (hi - lo)) * (y1 - y0);
  ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(x0, Y(0)); ctx.lineTo(x1, Y(0)); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.stroke();
  ctx.strokeStyle = css('--muted'); ctx.setLineDash([4, 4]); ctx.beginPath();
  lin.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)))); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.beginPath();
  x.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)))); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif';
  ctx.fillText(`${sig(hi / 1.1 * 1e6, 2)} µV`, 2, Y(hi / 1.1) + 3);
  ctx.fillText('0', x0 - 12, Y(0) + 3);
  ctx.fillText(`seconds in the crystal's time: 0 – ${sig(span, 2)}`, x0, h - 6);
}, $('#pulse'));

// The bolometer: the crystal, its thermistor and heater, its clips and frame, and the bias
// circuit, each glowing by how far above the sink it is now (the focus crystal's latest frame,
// or its rest).
animate(() => {
  const { ctx, w, h } = fit($('#bolometer'));
  ctx.clearRect(0, 0, w, h);
  if (!view) return;
  const P = shell.P, rest = view.rest, Ts = P.tbase * 1e-3;
  const c = frame.crystals.find((k) => k.key === focus) ?? frame.crystals[0];
  const now = c ? { V: c.V, Te: c.Te, Tc: c.Tc, Tt: c.Tt } : rest;
  // a glow from 0 (the sink) to 1 (a hot pulse's top), on a square-root scale so rest shows too
  const scaleT = Math.max(1e-6, view.E * 1.602e-13 / Math.max(rest.Cc, 1e-15));
  const glow = (T) => Math.min(1, Math.sqrt(Math.max(0, T - Ts) / (scaleT + (rest.Te - Ts))));
  const tint = (g, base) => { const [r, gg, b] = base; return `rgb(${Math.round(r + (255 - r) * g)}, ${Math.round(gg + (170 - gg) * g)}, ${Math.round(b + (90 - b) * g)})`; };
  const parts = [
    ['electrons (NTD)', now.Te, [30, 30, 34]],
    ['crystal (TeO₂)', now.Tc, [40, 70, 110]],
    ['Teflon clips', now.Tt, [200, 200, 205]],
  ];
  // the legend: each part's temperature now, and the thermistor's resistance and voltage
  const rows = [...parts.map(([name, T, base]) => [name, `${(T * 1e3).toFixed(3)} mK`, tint(glow(T), base)]),
    ['copper (sink)', `${P.tbase.toFixed(3)} mK`, '#6b3d22'],
    ['thermistor', `${sig(model.resistance(P.t0, now.Te) / 1e6)} MΩ`, null],
    ['its voltage', `${(now.V * 1e3).toFixed(3)} mV`, null]];
  ctx.font = '11px system-ui, sans-serif';
  const legendW = 16 + Math.max(...rows.map(([name, value]) => ctx.measureText(`${name}: ${value}`).width)), step = 15;
  // the schematic beside the legend when both fit, else above it
  const beside = (w - legendW - 12) / 1.75 >= h * 0.3;
  const s = beside ? Math.min(h * 0.6, (w - legendW - 12) / 1.75) : Math.min(w * 0.55, (h - rows.length * step - 16) / 1.6);
  const cx = beside ? s * 0.8 + 4 : w / 2, cy = beside ? h * 0.46 : s * 0.75 + 4;
  // the copper frame and the plate below it, at the sink's temperature
  ctx.fillStyle = '#6b3d22'; ctx.fillRect(cx - s * 0.75, cy + s * 0.72, s * 1.5, s * 0.1);
  ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 3; ctx.strokeRect(cx - s * 0.68, cy - s * 0.68, s * 1.36, s * 1.36); ctx.lineWidth = 1;
  // the Teflon clips at the corners
  ctx.fillStyle = tint(glow(now.Tt), parts[2][2]);
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillRect(cx + dx * s * 0.56 - s * 0.07, cy + dy * s * 0.56 - s * 0.07, s * 0.14, s * 0.14);
  // the crystal
  ctx.fillStyle = tint(glow(now.Tc), parts[1][2]);
  ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
  ctx.strokeStyle = css('--accent'); ctx.strokeRect(cx - s / 2, cy - s / 2, s, s);
  // the thermistor (its electrons) and the heater on its face
  const chip = s * 0.16;
  ctx.fillStyle = tint(glow(now.Te), parts[0][2]);
  ctx.fillRect(cx - chip / 2, cy - chip * 0.6, chip, chip * 1.2);
  ctx.fillStyle = '#9aa0aa'; ctx.fillRect(cx + s * 0.2, cy + s * 0.24, chip * 0.7, chip * 0.35);
  // the bias wires out to the load resistors and the amplifier
  ctx.strokeStyle = css('--muted'); ctx.beginPath(); ctx.moveTo(cx + chip / 2, cy); ctx.lineTo(cx + s * 0.85, cy); ctx.stroke();
  const lx = beside ? cx + s * 0.95 : Math.max(4, (w - legendW) / 2), ly = beside ? cy - (rows.length * step) / 2 : cy + s * 0.85 + 8;
  rows.forEach(([name, value, colour], i) => {
    const y = ly + i * step + 8;
    if (colour) { ctx.fillStyle = colour; ctx.fillRect(lx, y - 8, 10, 10); }
    ctx.fillStyle = css('--muted'); ctx.fillText(`${name}: ${value}`, lx + 16, y + 1);
  });
}, $('#bolometer'));

update();
