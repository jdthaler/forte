// clavichord-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './clavichord-instrument.js';
import { tangentSpeed } from './clavichord-params.js';
import { wasmModel } from './clavichord-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();
const TAU = 2 * Math.PI;

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'), { fLo: 25, fHi: 16000 });
new SpectrogramView($('#spectrogram'), { spectrum });
let focus = 60, course = null, modes = null, state = null, shape = null;
const trace = []; // [t (s), cents, finger force (N), sounding]

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  holdHint: { ms: 300, text: 'Hold the key down: the tangent stays on the strings, and the note sounds, only while its key is down.' },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; shell.keys.focus(key); update(); },
  onParam: () => update(),
  onMessage: (m) => {
    if (m.type !== 'state') return;
    state = m;
    if (m.shaped) shape = { q: m.q.slice(), qd: m.qd.slice(), p: m.p.slice(), pd: m.pd.slice(), len: m.len, phase: m.shapePhase };
    trace.push([performance.now() / 1000, m.cents, m.F, m.phase === 'held' && m.key >= 0]);
    while (trace.length && trace[0][0] < trace.at(-1)[0] - 5.5) trace.shift();
  },
});

const mm = (x) => `${(x * 1000).toFixed(2)} mm`;
const cm = (x) => `${(x * 100).toFixed(1)} cm`;
const signed = (x, d = 1) => { const t = Math.abs(x).toFixed(d); return `${x < 0 && +t ? '−' : '+'}${t}`; };

function update() {
  const P = shell.P;
  course = model.course(focus, P);
  modes = {
    speaking: model.partials(focus, 0, P, 'speaking'),
    after: model.partials(focus, 0, P, 'after'),
    open: model.partials(focus, 0, P, 'open'),
    four: course.strings.length > 2 ? model.partials(focus, 2, P, 'speaking') : [],
  };
  // markers: the speaking length's partials (brighter: a bigger share of the stroke's force at the
  // bridge, ∝ 1/n), the 4′'s, and the afterlength's own pitches, dim unless the listing is thin
  const sp = modes.speaking, quiet = Math.min(1, 0.15 / Math.max(0.02, P.listing));
  spectrum.set(sp[0].f, [
    ...modes.after.slice(0, 4).map((m) => ({ f: m.f, color: css('--accent-2'), alpha: 0.15 + 0.5 * quiet })),
    ...modes.four.map((m, n) => ({ f: m.f, color: css('--four'), alpha: 0.25 + 0.5 / (n + 1) })),
    ...sp.map((m, n) => ({ f: m.f, alpha: 0.2 + 0.7 / (n + 1) })),
  ]);
  for (const id of ['#focus-name', '#focus-name-2']) $(id).textContent = noteName(focus);
  info();
}

function info() {
  const P = shell.P, c = course, s0 = c.strings[0];
  const names = c.keys > 1 ? `${noteName(c.key0)} and ${noteName(c.key1)}` : noteName(c.key0);
  const wire = (s) => `${s.brass ? 'brass' : 'iron'} ${(s.d * 1000).toFixed(2)} mm`;
  const pair = c.strings.slice(0, 2), four = c.strings[2];
  const dc = model.cents(focus, P, P.press + 0.1) - model.cents(focus, P, P.press);
  const fa = Math.sqrt(s0.Tnom / s0.mu) / (2 * c.a);
  const rows = [
    ['strings', `${pair.length} × ${wire(s0)}${four ? `, and a 4′ ${wire(four)} on its own bridge` : ''}, shared by ${names}${c.keys > 1 ? ' (fretted: the higher key wins)' : ''}`],
    ['speaking length', `${cm(c.L)} from the bridge to this key’s tangent; afterlength ${cm(c.a)} to the hitchpin (sounds ${fa.toFixed(0)} Hz, if the listing lets it)`],
    ['tension', `${s0.Tnom.toFixed(1)} N a string with the key down (${(s0.T0).toFixed(1)} N at rest) · ${(s0.stress / 1e6).toFixed(0)} MPa · B = ${s0.B.toExponential(1)}`],
    ['the tangent', `${mm(c.z)} up under ${P.press.toFixed(2)} N; each 0.1 N more raises the note ${dc.toFixed(1)} ¢`],
    ['tuned for its give', `on a rigid nut the note would be ${signed(c.centsNominal)} ¢; the tangent, riding the strings on the key and finger (${P.mass.toFixed(0)} g), makes up the rest`],
    ['stroke', `the tangent meets the strings at ${(100 * tangentSpeed(P.velocity)).toFixed(0)} cm/s (computer keys)`],
  ];
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

// ---- the strings, from the side ---------------------------------------------------
// One string of the course, with the engine's own partials (the focused course's string 0) in slow
// motion: partial n as q cos(ns) + (q̇/ω) sin(ns), s turning slowly, so the shapes and their
// relative phases are the engine's.
let strobe = 0, lastT = 0, vmax = 1e-6, zShown = 0, exaggeration = 1;
const cv = $('#strings');
animate((t) => {
  const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t; strobe += dt * TAU * 0.6;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  if (!course) return;
  const c = course, st = state && state.course === courseNumber() ? state : null, sh = st && shape ? shape : null;
  const phase = st ? st.phase : 'idle';
  const pad = 14, x0 = pad + 10, x1 = w - pad - 10, Xs = (X) => x0 + (X / c.l) * (x1 - x0);
  const yRest = h * 0.62, zScale = (h * 0.4) / model.BED; // the key bed's height at the top of the travel
  const Y = (y) => yRest - y * zScale;
  exaggeration = zScale / ((x1 - x0) / c.l);
  // the tangent's height: the engine's while a key holds it, falling to the rest line otherwise
  const z = st && (phase === 'held' || phase === 'lifting') ? st.z : 0;
  zShown += (z - zShown) * Math.min(1, dt * 30);
  const L = st && st.L > 0 ? st.L : c.L, a = c.l - L;
  // the vibration: the engine's partials, exaggerated so the largest fills a fifth of the height
  const omega = (list, n) => TAU * (list[n]?.f ?? (n + 1) * list[0].f);
  const open = sh && sh.phase === 'open';
  const sp = open ? modes.open : modes.speaking;
  const amp = (q, qd, list, n) => q * Math.cos((n + 1) * strobe) + (qd / omega(list, n)) * Math.sin((n + 1) * strobe);
  let peak = 1e-9;
  const qs = sh ? Array.from(sh.q, (q, n) => amp(q, sh.qd[n], sp, n)) : [], ps = sh && !open ? Array.from(sh.p, (p, n) => amp(p, sh.pd[n], modes.after, n)) : [];
  for (let n = 0; n < qs.length; n++) peak = Math.max(peak, Math.hypot(sh.q[n], sh.qd[n] / omega(sp, n)));
  vmax = Math.max(peak, vmax * Math.exp(-dt / 1.5));
  const vScale = sh && phase !== 'idle' ? (h * 0.16) / vmax : 0;
  const vib = (X) => {
    if (!vScale) return 0;
    let y = 0;
    if (open || X < L) { const len = open ? c.l : L; for (let n = 0; n < qs.length; n++) y += qs[n] * Math.sin(((n + 1) * Math.PI * X) / len); }
    else for (let n = 0; n < ps.length; n++) y += ps[n] * Math.sin(((n + 1) * Math.PI * (X - L)) / a);
    return y * vScale;
  };
  const statik = (X) => (open ? 0 : X < L ? (zShown * X) / L : (zShown * (c.l - X)) / a);
  // the rest line, the bridge, the hitchpin and the listing woven in by it
  ctx.strokeStyle = css('--grid'); ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(Xs(0), yRest); ctx.lineTo(Xs(c.l), yRest); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#8a6a44';
  ctx.beginPath(); ctx.moveTo(Xs(0) - 7, yRest + 12); ctx.lineTo(Xs(0) + 7, yRest + 12); ctx.lineTo(Xs(0), yRest); ctx.closePath(); ctx.fill();
  ctx.fillStyle = css('--muted');
  ctx.beginPath(); ctx.arc(Xs(c.l), yRest, 3.5, 0, TAU); ctx.fill();
  const lw = c.listingWidth;
  ctx.fillStyle = css('--accent-2'); ctx.globalAlpha = 0.18 + 0.25 * Math.min(1, shell.P.listing);
  ctx.fillRect(Xs(c.l - lw), yRest - h * 0.07, Xs(c.l) - Xs(c.l - lw), h * 0.12); ctx.globalAlpha = 1;
  ctx.fillStyle = css('--muted');
  ctx.textAlign = 'left'; ctx.fillText('bridge', Xs(0) - 8, yRest + 24);
  ctx.textAlign = 'right'; ctx.fillText('listing · hitchpin', Xs(c.l) + 6, yRest + 24);
  // the other tangent of a fretted pair, waiting under the string
  ctx.textAlign = 'center';
  if (c.keys > 1) {
    const other = focus === c.key0 ? c.key1 : c.key0, Lo = model.tangentPoint(other, shell.P);
    ctx.strokeStyle = css('--brass'); ctx.globalAlpha = 0.35; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(Xs(Lo), yRest + 4 + h * 0.3); ctx.lineTo(Xs(Lo), yRest + 6); ctx.stroke(); ctx.lineWidth = 1; ctx.globalAlpha = 1;
    ctx.fillText(noteName(other), Xs(Lo), Math.abs(Xs(Lo) - Xs(L)) < 30 ? h - 16 : h - 4); // clear of this key's name
  }
  // the tangent: a brass blade on the end of the key, pressing the strings up
  const yT = Y(zShown);
  ctx.strokeStyle = css('--brass'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(Xs(L), yRest + 4 + h * 0.3); ctx.lineTo(Xs(L), yT + 2); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = css('--text'); ctx.fillText(noteName(st && st.key >= 0 ? st.key : focus), Xs(L), h - 4);
  // the finger's force on the key, as an arrow up the tangent
  if (st && phase === 'held' && st.F > 0) {
    const len = Math.min(h * 0.28, 22 * st.F), xa = Xs(L) + 9, ya = yRest + 4 + h * 0.3;
    ctx.strokeStyle = css('--accent-2'); ctx.fillStyle = css('--accent-2'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xa, ya - len); ctx.stroke(); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xa - 4, ya - len + 5); ctx.lineTo(xa + 4, ya - len + 5); ctx.lineTo(xa, ya - len); ctx.closePath(); ctx.fill();
  }
  // the string
  ctx.strokeStyle = c.strings[0].brass ? css('--brass') : css('--iron'); ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i <= 240; i++) {
    const X = (i / 240) * c.l, y = Y(statik(X)) - vib(X);
    if (i) ctx.lineTo(Xs(X), y); else ctx.moveTo(Xs(X), y);
  }
  ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  ctx.fillText(phase === 'held' ? 'held: speaking length rings' : phase === 'lifting' ? 'the key lets go' : open ? 'released: the whole string, until the listing stops it' : 'at rest', w - 6, 12);
  ctx.textAlign = 'left';
  readout(st);
}, cv);

// course numbers: the model's course for the focused key (the engine reports the course it shows)
const courseNumber = () => course?.course;

let readT = 0;
function readout(st) {
  const now = performance.now();
  if (now - readT < 120) return;
  readT = now;
  const c = course;
  $('#strings-read').textContent = `${cm(c.L)} + ${cm(c.a)} · heights ×${Math.round(exaggeration)}`;
  $('#strings-info').innerHTML = st && st.phase === 'held'
    ? [`<span>tangent ${mm(st.z)} up</span>`, `<span>finger ${st.F.toFixed(2)} N</span>`, `<span>${signed(st.cents, 2)} ¢</span>`, `<span>tension ×${st.Tr.toFixed(4)}</span>`].join(' · ')
    : 'press and hold a key';
}

// ---- pitch and pressure over the last five seconds -----------------------------------
const tc = $('#trace');
animate(() => {
  const { ctx, w, h } = fit(tc);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif';
  const padL = 34, padR = 34, padT = 8, padB = 16, now = performance.now() / 1000, span = 5;
  const X = (t) => padL + ((t - (now - span)) / span) * (w - padL - padR);
  // ranges: the pitch's, at least ±5 ¢, and the finger's, at least 0–2 N
  // (the pitch's from most of the trace: a stroke's brief overshoot is drawn clipped, not scaled to)
  let fMax = 2;
  const cs = [];
  for (const [, cc, F, on] of trace) if (on) { cs.push(Math.abs(cc)); fMax = Math.max(fMax, F * 1.15); }
  cs.sort((a, b) => a - b);
  const cMax = Math.ceil(Math.max(5, 1.15 * (cs[Math.floor(0.9 * (cs.length - 1))] ?? 0)) / 5) * 5;
  const Yc = (cc) => padT + ((h - padT - padB) * (cMax - cc)) / (2 * cMax), Yf = (F) => padT + ((h - padT - padB) * (fMax - F)) / fMax;
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted');
  ctx.textAlign = 'right';
  for (const cc of [-cMax, 0, cMax]) { ctx.beginPath(); ctx.moveTo(padL, Yc(cc)); ctx.lineTo(w - padR, Yc(cc)); ctx.stroke(); ctx.fillText(`${cc > 0 ? '+' : ''}${cc}`, padL - 4, Yc(cc) + 3); }
  ctx.textAlign = 'left';
  for (const F of [0, fMax / 2, fMax]) ctx.fillText(`${F.toFixed(1)}`, w - padR + 4, Yf(F) + 3);
  ctx.textAlign = 'center';
  for (let s = 1; s < span; s++) ctx.fillText(`−${span - s} s`, X(now - span + s), h - 4);
  const line = (k, Yv, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath();
    let pen = false;
    for (const r of trace) {
      if (!r[3]) { pen = false; continue; }
      const x = X(r[0]), y = Yv(r[k]);
      if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      pen = true;
    }
    ctx.stroke(); ctx.lineWidth = 1;
  };
  ctx.save(); ctx.beginPath(); ctx.rect(padL, padT, w - padL - padR, h - padT - padB); ctx.clip();
  line(2, Yf, css('--accent-2'));
  line(1, Yc, css('--accent'));
  ctx.restore();
  const last = trace.at(-1);
  $('#trace-read').textContent = last && last[3] ? `${signed(last[1], 2)} ¢ at ${last[2].toFixed(2)} N` : 'hold a key; try aftertouch or the Bebung';
}, tc);

update();
