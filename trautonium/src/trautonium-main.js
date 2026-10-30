// trautonium-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './trautonium-instrument.js';
import { wasmModel } from './trautonium-wasm.js';
import { tunedFreq } from '../../shared/tuning.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();
const { V_STRIKE, V_EXT, CAP } = model;
const SWING = V_STRIKE - V_EXT;

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'), { fLo: 25, fHi: 16000 });
new SpectrogramView($('#spectrogram'), { spectrum }); // its analyser, range and markers
let focus = 60, state = null, stateAt = 0;

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'f1', step: 50 },
  holdHint: { ms: 400, text: 'Hold the key down: the note sounds while the finger keeps the wire on the rail.' },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onMessage: (m) => { if (m.type === 'state') { state = m; stateAt = performance.now(); } },
  onNoteOn: (key) => { focus = key; shell.keys.focus(key); update(); },
  onParam: () => update(),
  onCC: (cc, v) => { if (cc === 11) shell.setParam('swell', v / 127); }, // the volume pedal
});

const live = () => (state && state.key === focus && performance.now() - stateAt < 300 ? state : null);
const fmtR = (r) => (r >= 1e6 ? `${(r / 1e6).toFixed(2)} MΩ` : `${(r / 1e3).toFixed(1)} kΩ`);
const fmtHz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(f < 10 ? 2 : 1)} Hz`);

// What the circuit predicts for the focused key: its note in the keyboard's tuning (the engine's
// keyTarget), the capture window and each divider's pulse.
function predict(P) {
  const st = live();
  const f = st ? st.f : tunedFreq(P, focus);
  const delta = model.window(P.sync, P.supply);
  const divs = [1, 2, 3, 4].map((i) => {
    const n = P[`div${i}`], level = P[`sub${i}`], m = model.lockCount(n, P.slack, delta);
    return { n, level, m, own: n * (1 + P.slack) };
  });
  return { f, delta, divs, st };
}

function update() {
  const P = shell.P, { f, divs } = predict(P);
  $('#focus-name').textContent = noteName(focus);
  const markers = [{ f, alpha: 0.9 }];
  for (const d of divs) if (d.level > 0) markers.push({ f: d.m ? f / d.m : f / d.own, alpha: 0.4 + 0.5 * d.level, color: css('--accent-2') });
  for (let i = 1; i <= 4; i++) if (P[`g${i}`] > 0) markers.push({ f: P[`f${i}`], alpha: 0.25, color: css('--muted') });
  spectrum.set(f, markers);
  info();
}

function info() {
  const P = shell.P, { f, delta, divs, st } = predict(P);
  const R = model.wireR(f, P.supply), g = model.periods(P.supply);
  const rows = [
    ['note', `${noteName(focus)} · ${fmtHz(f)}${st ? ' (sounding)' : ''}`],
    ['wire', `${fmtR(R)} from the finger to the end, charging ${CAP * 1e9} nF`],
    ['lamp', `strikes at ${V_STRIKE} V, goes out at ${V_EXT} V, charging toward ${P.supply.toFixed(0)} V: a period is RC × ${g.toFixed(3)} = ${(1000 / f).toFixed(2)} ms`],
    ['sync', `${(P.sync * SWING).toFixed(2)} V a flash: a divider fires with the master when its own firing is due within ${(100 * delta).toFixed(1)} % of its period (the slack is ${(100 * P.slack / (1 + P.slack)).toFixed(1)} %)`],
    ...divs.map((d, i) => {
      const measured = st && st.counts[i] > 0 ? st.counts[i] : null;
      const m = measured ?? d.m, what = m ? `every ${m === 1 ? '' : `${ordinal(m)} `}flash${m !== d.n ? ` (a pulse early: ÷${m})` : ''} · ${fmtHz(f / m)}`
        : `slips: runs on its own at ${fmtHz(f / d.own)}, ${(1200 * Math.log2(d.own / d.n)).toFixed(0)} ¢ flat of f/${d.n}`;
      return [`÷${d.n}${d.level > 0 ? '' : ' (off)'}`, what];
    }),
  ];
  if (st) rows.push(['pressure', `${(100 * st.p).toFixed(0)} % · first circuit at ${fmtHz(st.f1)}`]);
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

// ---- views -----------------------------------------------------------------------
const visible = (cv) => cv.offsetParent !== null;
let infoT = 0;
animate((t) => { if (t - infoT > 250 && visible($('#info'))) { infoT = t; info(); } });

// The lamps: each one's capacitor voltage, from the model's charging curve V = S + (V_e − S) e^(−x g / r)
// (x in master periods, r its time constant over the master's), reset where the engine says it fires.
animate((t) => {
  const cv = $('#lamps');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, { f, divs } = predict(P), S = P.supply, g = model.periods(S), K = P.sync * SWING;
  const st = live();
  const lamps = [{ n: 1, level: P.master, m: 1, own: 1, master: true }, ...divs.map((d, i) => ({ ...d, m: st && st.counts[i] > 0 ? st.counts[i] : st ? 0 : d.m }))];
  const N = Math.min(25, Math.max(4, ...lamps.map((l) => (l.m || Math.ceil(l.own)) + 1)));
  const padL = 64, padR = 8, rowH = h / lamps.length;
  const X = (x) => padL + ((w - padL - padR) * x) / N;
  const ink = css('--text'), muted = css('--muted'), grid = css('--grid'), acc = css('--accent'), acc2 = css('--accent-2');
  ctx.font = '10px system-ui, sans-serif';
  // the master's flashes, down every row
  ctx.strokeStyle = grid;
  for (let k = 0; k <= N; k++) { ctx.beginPath(); ctx.moveTo(X(k), 0); ctx.lineTo(X(k), h); ctx.stroke(); }
  lamps.forEach((l, r) => {
    const y0 = r * rowH + rowH * 0.85, y1 = r * rowH + rowH * 0.15;
    const Y = (v) => y0 + ((y1 - y0) * (v - V_EXT)) / SWING;
    // the band the master's kick reaches: a divider in it fires
    if (!l.master && K > 0) { ctx.fillStyle = acc2; ctx.globalAlpha = 0.15; ctx.fillRect(padL, Y(V_STRIKE), w - padL - padR, Y(V_STRIKE - K) - Y(V_STRIKE)); ctx.globalAlpha = 1; }
    ctx.strokeStyle = grid; ctx.setLineDash([3, 3]);
    for (const v of [V_STRIKE, V_EXT]) { ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(w - padR, Y(v)); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.fillStyle = l.level > 0 ? ink : muted; ctx.textAlign = 'left';
    ctx.fillText(l.master ? 'master' : `÷${l.n}`, 4, r * rowH + rowH * 0.45);
    ctx.fillStyle = muted;
    ctx.fillText(l.master ? fmtHz(f) : l.m ? `fires on ${l.m}` : 'slips', 4, r * rowH + rowH * 0.45 + 12);
    // its firings: every m-th flash, or (slipping) every `own` periods, drifting past the flashes
    const span = l.master ? 1 : l.m || l.own, tc = l.master ? 1 : l.own;
    const phase = l.master || l.m ? 0 : (((t / 1000) * 0.5 * (l.own % 1 || 0.25)) % span);
    ctx.strokeStyle = l.master ? acc : acc2; ctx.globalAlpha = l.level > 0 ? 1 : 0.35; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x0 = phase - span; x0 < N; x0 += span) {
      let first = true;
      for (let i = 0; i <= 60; i++) {
        const x = x0 + (span * i) / 60;
        if (x < 0 || x > N) continue;
        const v = S + (V_EXT - S) * Math.exp((-(x - x0) * g) / tc);
        if (first) { ctx.moveTo(X(x), Y(V_EXT)); ctx.lineTo(X(x), Y(v)); first = false; } else ctx.lineTo(X(x), Y(v));
      }
      if (x0 + span <= N && !first) ctx.lineTo(X(x0 + span), Y(V_EXT)); // the discharge
    }
    ctx.stroke();
    // the kicks at each flash, while it charges
    if (!l.master && K > 0) {
      ctx.lineWidth = 1;
      for (let k = 1; k <= N; k++) {
        const since = (((k - phase) % span) + span) % span;
        if (since < 1e-6) continue; // it fired on this flash
        const v = S + (V_EXT - S) * Math.exp((-since * g) / tc);
        ctx.beginPath(); ctx.moveTo(X(k), Y(v)); ctx.lineTo(X(k), Y(Math.min(V_STRIKE + 2, v + K))); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  });
  $('#lamps-read').textContent = `${N} flashes of the master · ${fmtHz(f)}`;
}, $('#lamps'));

// The circuits' response (the model's), with the focused note's harmonics on it.
const F_LO = 30, F_HI = 12000;
animate(() => {
  const cv = $('#circuits');
  if (!visible(cv)) return;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, { f, divs } = predict(P);
  const padL = 30, padR = 8, padT = 8, padB = 18, top = 20, range = 50;
  const X = (x) => padL + ((w - padL - padR) * Math.log(x / F_LO)) / Math.log(F_HI / F_LO);
  const Y = (db) => padT + ((h - padT - padB) * (top - db)) / range;
  const dB = (a) => 20 * Math.log10(Math.max(a, 1e-6));
  ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
  for (const x of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { ctx.beginPath(); ctx.moveTo(X(x), padT); ctx.lineTo(X(x), h - padB); ctx.stroke(); ctx.fillText(x >= 1000 ? `${x / 1000}k` : `${x}`, X(x), h - 5); }
  ctx.textAlign = 'right';
  for (let d = top; d >= top - range; d -= 10) { ctx.beginPath(); ctx.moveTo(padL, Y(d)); ctx.lineTo(w - padR, Y(d)); ctx.stroke(); ctx.fillText(`${d}`, padL - 4, Y(d) + 3); }
  // the note's harmonics, each a sawtooth's 1/k, through the circuits
  const ks = [];
  for (let k = 1; k * f < F_HI && k <= 96; k++) ks.push(k);
  const resp = model.response(ks.map((k) => k * f), P);
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2;
  ks.forEach((k, i) => {
    const db = dB((P.master * resp[i] * 4) / k);
    if (db < top - range) return;
    ctx.beginPath(); ctx.moveTo(X(k * f), h - padB); ctx.lineTo(X(k * f), Math.max(padT, Y(db))); ctx.stroke();
  });
  // the dividers' notes
  ctx.strokeStyle = css('--accent-2');
  for (const d of divs) if (d.level > 0) {
    const fd = d.m ? f / d.m : f / d.own;
    if (fd < F_LO) continue;
    const db = dB(d.level * model.response([fd], P)[0] * 4);
    ctx.beginPath(); ctx.moveTo(X(fd), h - padB); ctx.lineTo(X(fd), Math.max(padT, Y(db))); ctx.stroke();
  }
  // the response
  const fsx = Array.from({ length: 240 }, (_, i) => F_LO * (F_HI / F_LO) ** (i / 239)), rs = model.response(fsx, P);
  ctx.strokeStyle = css('--text'); ctx.lineWidth = 1.5; ctx.beginPath();
  fsx.forEach((x, i) => { const y = Math.max(padT, Math.min(h - padB, Y(dB(rs[i])))); if (i) ctx.lineTo(X(x), y); else ctx.moveTo(X(x), y); });
  ctx.stroke(); ctx.lineWidth = 1;
}, $('#circuits'));

update();
