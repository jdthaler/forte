// arc-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT, bankParams } from './arc-instrument.js';
import {
  KEY_LO, KEY_HI, TAU, SUPPLY, TALK, keyFreq, arcOp, staticV, ayrtonV, capFor, startCap, kelvinC, tuneKey, linearAnalysis, circuit,
  thresholdR, thresholdCurrent, upperLimit, hissCurrent,
} from './arc-model.js';

const $ = (s) => document.querySelector(s);
let focus = 60, msg = null, op = null, table = null, job = null;
const spectrum = new SpectrumView($('#spectrum'), { fLo: 50, fHi: 16000 });

const shell = createShell({
  ...INSTRUMENT,
  base: 48,
  arrows: { param: 'current' },
  engineParams: (P) => ({ ...P, table }), // the bank cut so far (retune): in the end, the descriptor's capBank(P)
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; update(); },
  onParam: () => { retune(); update(); },
  onMessage: (m) => { if (m.type === 'arc') msg = m; },
});

// ---- the capacitors: each key's cut for the sounding note (the steady cycle, integrated), a few
// keys per tick so the page stays responsive; meanwhile the quick start-frequency table serves.
// The finished table is the descriptor's capBank(P), cut a key at a time ----
function retune() {
  const P = bankParams(shell.P), key = tuneKey(P);
  if ((table && table.key === key) || (job && job.key === key)) return;
  const o = arcOp(P), quick = new Float64Array(KEY_HI - KEY_LO + 1);
  for (let k = KEY_LO; k <= KEY_HI; k++) quick[k - KEY_LO] = P.tune === 'kelvin' ? kelvinC(keyFreq(k), P.coil * 1e-3) : startCap(k, P, o);
  if (!table || P.tune === 'kelvin') { table = { key: P.tune === 'kelvin' ? key : `start|${key}`, lo: KEY_LO, caps: quick }; shell.sendParams(); }
  if (P.tune === 'kelvin') { job = null; return; }
  job = { key, P: { ...P }, op: o, caps: new Float64Array(KEY_HI - KEY_LO + 1), k: KEY_LO };
  setTimeout(step, 30);
}
function step() {
  const j = job;
  if (!j) return;
  const t0 = performance.now();
  while (j.k <= KEY_HI && performance.now() - t0 < 12) { j.caps[j.k - KEY_LO] = capFor(j.k, j.P, j.op); j.k++; }
  if (j !== job) return;
  if (j.k <= KEY_HI) { setTimeout(step, 0); return; }
  table = { key: j.key, lo: KEY_LO, caps: j.caps }; job = null;
  shell.sendParams(); update();
}

// ---- readouts for the last key ----------------------------------------------------------------
let readTimer = 0;
const fmtHz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(1)} Hz`);
function update() {
  op = arcOp(shell.P);
  clearTimeout(readTimer);
  readTimer = setTimeout(readouts, 60);
  const P = shell.P, talk = P.mode === 'talk', C = capOf(focus), L = talk ? TALK.L : P.coil * 1e-3;
  spectrum.set(keyFreq(focus), talk ? [] : [{ f: 1 / (TAU * Math.sqrt(L * C)), color: css('--accent-2') }, { f: keyFreq(focus), color: css('--accent') }]);
  $('#ckt-read').textContent = `E ${SUPPLY.E} V · R_b ${op.Rb.toFixed(1)} Ω · L_b ${SUPPLY.Lb} H`;
}
const capOf = (key) => (shell.P.mode === 'talk' ? TALK.C : table?.caps[key - KEY_LO] ?? kelvinC(keyFreq(key), shell.P.coil * 1e-3));
function readouts() {
  const P = shell.P, o = op, talk = P.mode === 'talk', C = capOf(focus), L = talk ? TALK.L : P.coil * 1e-3;
  const la = linearAnalysis(circuit(P, C, o)), fK = 1 / (TAU * Math.sqrt(L * C));
  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  const rows = [
    row('arc', `${o.I0.toFixed(2)} A at ${o.u0.toFixed(1)} V, slope ${o.Rd.toFixed(2)} Ω`),
    row('column', `τ ${P.tau.toFixed(0)} µs, L_arc ${(o.Larc * 1e6).toFixed(0)} µH`),
    row('re-strike', `${o.Ur.toFixed(0)} V, below ${o.Xm.toFixed(2)} A`),
    row('hisses above', `${hissCurrent(P.gap).toFixed(1)} A`),
    row(talk ? 'condenser' : `${noteName(focus)}'s capacitor`, `${(C * 1e6).toFixed(2)} µF (Kelvin: ${fmtHz(fK)})`),
    row('note starts', la.sigma > 0 ? `${fmtHz(la.f)}, ×e every ${(1000 / la.sigma).toFixed(0)} ms` : `no: decays at ${(-la.sigma).toFixed(0)}/s`),
  ];
  if (!talk) {
    const Ck = kelvinC(keyFreq(focus), L);
    rows.push(row('sings while', `coil < ${thresholdR(P, Ck).toFixed(2)} Ω, arc < ${thresholdCurrent(P, Ck).toFixed(1)} A`));
    rows.push(row('upper limit', fmtHz(upperLimit(P))));
  }
  $('#info').innerHTML = rows.join('');
}

// ---- the V–I plane ---------------------------------------------------------------------------
const viCv = $('#vi');
animate(() => {
  if (!op) return;
  const { ctx, w, h } = fit(viCv), P = shell.P, o = op;
  ctx.clearRect(0, 0, w, h);
  const f = msg && msg.trail ? msg : null, tr = f?.trail, N = tr ? tr.length / 2 : 0;
  let tiMax = 0, tuMax = 0;
  for (let k = 0; k < N; k++) { tiMax = Math.max(tiMax, tr[2 * k]); tuMax = Math.max(tuMax, tr[2 * k + 1]); }
  const Ih = hissCurrent(P.gap), iMax = Math.max(2.5 * o.I0, 1.08 * tiMax, Math.min(1.15 * Ih, 4 * o.I0)), uMax = Math.max(1.3 * o.Ur, 1.08 * tuMax, 1.25 * o.u0);
  const padL = 36, padR = 10, padT = 8, padB = 20, W = Math.max(10, w - padL - padR), H = Math.max(10, h - padT - padB);
  const X = (i) => padL + (W * i) / iMax, Y = (u) => padT + H * (1 - u / uMax);
  ctx.font = '10px system-ui, sans-serif'; ctx.lineWidth = 1;
  // regions: the column collapsed (re-strike) and hissing
  ctx.fillStyle = css('--out'); ctx.fillRect(padL, padT, X(o.Xm) - padL, H);
  if (Ih < iMax) { ctx.fillStyle = css('--hiss'); ctx.fillRect(X(Ih), padT, padL + W - X(Ih), H); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,140,110,0.6)'; ctx.beginPath(); ctx.moveTo(X(Ih), padT); ctx.lineTo(X(Ih), padT + H); ctx.stroke(); ctx.setLineDash([]); }
  // axes
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
  const di = iMax > 12 ? 4 : iMax > 6 ? 2 : 1;
  for (let i = 0; i <= iMax; i += di) { ctx.beginPath(); ctx.moveTo(X(i), padT); ctx.lineTo(X(i), padT + H); ctx.stroke(); ctx.fillText(`${i}`, X(i), h - 6); }
  ctx.textAlign = 'right';
  for (let u = 0; u <= uMax; u += 20) { ctx.beginPath(); ctx.moveTo(padL, Y(u)); ctx.lineTo(padL + W, Y(u)); ctx.stroke(); ctx.fillText(`${u}`, padL - 4, Y(u) + 3); }
  ctx.fillText('A', w - 2, h - 6); ctx.textAlign = 'left'; ctx.fillText('V', 4, padT + 8);
  // Ayrton's hyperbola, and the model's static curve (with the floor)
  const curve = (fn, i0) => { ctx.beginPath(); let s = false; for (let k = 0; k <= 240; k++) { const i = i0 + ((iMax - i0) * k) / 240, u = fn(i); if (!(u < uMax * 1.5)) { s = false; continue; } if (s) ctx.lineTo(X(i), Y(u)); else { ctx.moveTo(X(i), Y(u)); s = true; } } ctx.stroke(); };
  ctx.setLineDash([3, 3]); ctx.strokeStyle = css('--ayrton'); curve((i) => ayrtonV(i, P.gap), Math.max(0.05, o.B / (uMax - o.A))); ctx.setLineDash([]);
  ctx.strokeStyle = css('--static'); ctx.globalAlpha = 0.7; curve((i) => staticV(i, o), 0.002); ctx.globalAlpha = 1;
  // the supply's load line u = E − R_b·i through the operating point
  ctx.strokeStyle = css('--load'); ctx.beginPath();
  const iA = Math.max(0, (SUPPLY.E - uMax) / o.Rb), iB = Math.min(iMax, SUPPLY.E / o.Rb);
  ctx.moveTo(X(iA), Y(SUPPLY.E - o.Rb * iA)); ctx.lineTo(X(iB), Y(SUPPLY.E - o.Rb * iB)); ctx.stroke();
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'left';
  ctx.fillText(`U_r ${o.Ur.toFixed(0)} V`, X(o.Xm) + 4, Y(o.Ur) - 4);
  if (Ih < iMax) ctx.fillText('hiss', X(Ih) + 4, padT + 12);
  ctx.fillText('out', padL + 3, padT + H - 4);
  // the operating point's loop, oldest faint
  if (tr && N) {
    const ti = f.ti / 2;
    ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2.5;
    for (let k = 1; k < N; k++) {
      const a = (ti + k - 1) % N, b = (ti + k) % N;
      ctx.globalAlpha = 0.15 + 0.85 * (k / N);
      ctx.beginPath(); ctx.moveTo(X(tr[2 * a]), Y(tr[2 * a + 1])); ctx.lineTo(X(tr[2 * b]), Y(tr[2 * b + 1])); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
    const last = (ti + N - 1) % N;
    ctx.fillStyle = css('--accent'); ctx.beginPath(); ctx.arc(X(tr[2 * last]), Y(tr[2 * last + 1]), 4, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = css('--text'); ctx.beginPath(); ctx.arc(X(o.I0), Y(o.u0), 4, 0, TAU); ctx.stroke();
  // what it is doing
  const a = msg?.arcs?.[msg.focus];
  let say = 'silent: play a key';
  if (msg && a) {
    const singing = a.Iac > 0.05 * o.I0 || (P.mode === 'talk' && msg.vowel);
    if (P.mode === 'talk') say = msg.vowel ? `speaking /${msg.vowel}/` : 'the microphone is quiet';
    else if (singing) say = `${a.keys.length ? a.keys.map(noteName).join('+') : 'ringing'} · ${a.out > 0.05 ? `second kind: out ${(a.out * 100).toFixed(0)} % of each cycle` : 'first kind: the current never stops'}`;
    else if (a.keys.length) say = `${a.keys.map(noteName).join('+')}: not singing`;
    if (msg.hiss > 0.05) say += ' · hissing';
  }
  $('#vi-read').textContent = say;
}, viCv);

// ---- the arc's glow, strobed: one cycle a second or so -------------------------------------------------
const glowCv = $('#glow');
let strobe = 0, flick = 0;
animate(() => {
  if (!op) return;
  const { ctx, w, h } = fit(glowCv), P = shell.P, o = op;
  ctx.fillStyle = '#07070a'; ctx.fillRect(0, 0, w, h);
  const arcs = msg?.arcs?.length ? msg.arcs : [{ P: o.u0 * o.I0, keys: [], out: 0 }];
  const n = arcs.length, P0 = o.u0 * o.I0, tr = msg?.trail, N = tr ? tr.length / 2 : 0;
  strobe = (strobe + 1 / 70) % 1;
  for (let k = 0; k < n; k++) {
    const cx = ((k + 0.5) * w) / n, cy = h / 2, cw = w / n;
    // power now: the focused arc runs through its recent cycle in slow motion
    let pw = arcs[k].P;
    if (k === (msg?.focus ?? 0) && N) { const ti = msg.ti / 2, j = (ti + Math.floor(strobe * N)) % N; pw = Math.max(0, tr[2 * j] * tr[2 * j + 1]); }
    if (msg?.hiss > 0.02) { flick = 0.7 * flick + 0.3 * (Math.random() - 0.5); pw *= 1 + 0.5 * msg.hiss * flick; }
    const rel = Math.max(0, pw / P0), gapPx = Math.min(cw * 0.42, Math.max(6, (P.gap / 8) * cw * 0.5 + 6)), rod = Math.max(4, Math.min(h * 0.09, cw * 0.06));
    const xa = cx - gapPx / 2, xb = cx + gapPx / 2;
    // the column: width ∝ √(heat), glow ∝ power
    const r = Math.max(1, rod * 1.6 * Math.sqrt(Math.min(4, rel))), bright = Math.min(1, 0.15 + 0.55 * rel);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3.2 + gapPx / 2);
    g.addColorStop(0, `rgba(255,250,225,${bright})`); g.addColorStop(0.35, `rgba(255,214,110,${0.6 * bright})`); g.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, gapPx / 2 + r * 1.8, r * 2.0, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,255,240,${Math.min(1, 0.3 + bright)})`; ctx.beginPath(); ctx.ellipse(cx, cy, gapPx / 2 + 1, r * 0.55 + 0.5, 0, 0, TAU); ctx.fill();
    // carbons: the positive (left, thicker) with its crater, the negative (right) pointed
    ctx.fillStyle = css('--carbon');
    ctx.fillRect(cx - cw * 0.47, cy - rod * 1.15, xa - (cx - cw * 0.47), rod * 2.3);
    ctx.beginPath(); ctx.moveTo(cx + cw * 0.47, cy - rod * 0.9); ctx.lineTo(xb + rod * 1.2, cy - rod * 0.9); ctx.lineTo(xb, cy); ctx.lineTo(xb + rod * 1.2, cy + rod * 0.9); ctx.lineTo(cx + cw * 0.47, cy + rod * 0.9); ctx.fill();
    ctx.fillStyle = `rgba(255,${200 + 40 * bright},${120 + 100 * bright},${0.6 + 0.4 * bright})`;
    ctx.beginPath(); ctx.ellipse(xa, cy, rod * 0.35, rod * 0.95, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,190,120,${0.5 + 0.3 * bright})`; ctx.beginPath(); ctx.arc(xb, cy, rod * 0.3, 0, TAU); ctx.fill();
    if (n > 1) { ctx.fillStyle = css('--muted'); ctx.textAlign = 'center'; ctx.font = '10px system-ui, sans-serif'; ctx.fillText(arcs[k].keys.map(noteName).join(' ') || '·', cx, h - 6); }
  }
  const a = arcs[msg?.focus ?? 0];
  $('#glow-read').textContent = msg ? `${(a.P).toFixed(0)} W in the arc` : '';
}, glowCv);

// ---- the circuit -----------------------------------------------------------------------------------
const cktCv = $('#circuit');
let dcPhase = 0, acPhase = 0;
animate(() => {
  if (!op) return;
  const { ctx, w, h } = fit(cktCv), P = shell.P, o = op, talk = P.mode === 'talk';
  ctx.clearRect(0, 0, w, h);
  const a = msg?.arcs?.[msg.focus], Idc = a?.I ?? o.I0, Iac = a?.Iac ?? 0, keys = a?.keys ?? [];
  const yT = Math.max(24, h * 0.2), yB = h - Math.max(16, h * 0.14), xE = w * 0.06, xRb = w * 0.2, xLb = w * 0.38, xA = w * 0.55, xL = w * 0.7, xC = w * 0.9;
  const wire = css('--muted'), lit = css('--accent');
  ctx.strokeStyle = wire; ctx.lineWidth = 1.5; ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
  const line = (x0, y0, x1, y1) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  const coil = (x0, x1, y, turns) => { ctx.beginPath(); const s = (x1 - x0) / turns; ctx.moveTo(x0, y); for (let k = 0; k < turns; k++) ctx.arc(x0 + s * (k + 0.5), y, s / 2, Math.PI, 0); ctx.stroke(); };
  // supply loop: battery, rheostat, choke, arc
  line(xE, yT, xRb - 14, yT); line(xE, yB, xA, yB); line(xE, yT, xE, yB * 0.5 + yT * 0.5 - 8); line(xE, yB * 0.5 + yT * 0.5 + 8, xE, yB);
  ctx.lineWidth = 2.5; line(xE - 10, (yT + yB) / 2 - 8, xE + 10, (yT + yB) / 2 - 8); ctx.lineWidth = 1.5; line(xE - 5, (yT + yB) / 2 + 8, xE + 5, (yT + yB) / 2 + 8);
  ctx.beginPath(); ctx.moveTo(xRb - 14, yT); for (let k = 0; k < 6; k++) ctx.lineTo(xRb - 14 + (28 * (k + 0.5)) / 6, yT + (k % 2 ? 5 : -5)); ctx.lineTo(xRb + 14, yT); ctx.stroke();
  line(xRb + 14, yT, xLb - 18, yT); coil(xLb - 18, xLb + 18, yT, 5); line(xLb - 18, yT - 9, xLb + 18, yT - 9); line(xLb + 18, yT, xA, yT);
  // the arc
  const ym = (yT + yB) / 2, glow = Math.min(1, (a?.P ?? o.u0 * o.I0) / (o.u0 * o.I0) * 0.6);
  line(xA, yT, xA, ym - 10); line(xA, ym + 10, xA, yB);
  ctx.fillStyle = `rgba(255,236,150,${0.25 + 0.6 * glow})`; ctx.beginPath(); ctx.ellipse(xA, ym, 6 + 4 * glow, 10, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = css('--carbon'); ctx.fillRect(xA - 4, ym - 22, 8, 12); ctx.fillRect(xA - 3, ym + 10, 6, 12);
  // musical branch: coil, then the capacitors in parallel
  line(xA, yT, xL - 20, yT); coil(xL - 20, xL + 20, yT, 6); line(xL + 20, yT, xC, yT); line(xA, yB, xC, yB);
  const caps = talk ? [-1] : keys.length ? keys.slice(0, 6) : [null];
  const span = Math.min(w * 0.16, 18 * caps.length), x0 = xC - span / 2;
  caps.forEach((k, j) => {
    const x = caps.length === 1 ? xC : x0 + (span * j) / (caps.length - 1), on = k !== null;
    ctx.strokeStyle = on ? lit : wire; ctx.lineWidth = 1.5;
    line(x, yT, x, ym - 4); line(x, ym + 4, x, yB); ctx.lineWidth = 2.5; line(x - 7, ym - 4, x + 7, ym - 4); line(x - 7, ym + 4, x + 7, ym + 4); ctx.lineWidth = 1.5;
    if (on && k >= 0) { ctx.fillStyle = lit; ctx.fillText(noteName(k), x, yB + 12); }
  });
  ctx.strokeStyle = wire;
  if (caps.length > 1) line(x0, yT, x0 + span, yT);
  // current: the supply's steady drift, and the musical branch's swing in slow motion
  dcPhase = (dcPhase + 0.004 * Idc) % 1; acPhase = (acPhase + 1 / 90) % 1;
  ctx.fillStyle = css('--load');
  const loopDC = [[xE, yB], [xE, yT], [xA, yT], [xA, yB], [xE, yB]], lenDC = 2 * (yB - yT) + 2 * (xA - xE);
  for (let k = 0; k < 10; k++) { const p = ((k / 10 + dcPhase) % 1) * lenDC; const [x, y] = along(loopDC, p); ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill(); }
  if (Iac > 0.01) {
    const loopAC = [[xA, yT], [xC, yT], [xC, yB], [xA, yB], [xA, yT]], lenAC = 2 * (xC - xA) + 2 * (yB - yT), swing = Math.min(0.12, 0.03 * Iac) * lenAC * Math.sin(TAU * acPhase);
    ctx.fillStyle = lit;
    for (let k = 0; k < 12; k++) { const p = (((k / 12) * lenAC + swing) % lenAC + lenAC) % lenAC; const [x, y] = along(loopAC, p); ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill(); }
  }
  // labels
  ctx.fillStyle = css('--muted');
  ctx.textAlign = 'left'; ctx.fillText(`${SUPPLY.E} V`, xE + 12, ym + 3);
  ctx.textAlign = 'center';
  ctx.fillText(`R_b ${o.Rb.toFixed(0)} Ω`, xRb, yT - 10); ctx.fillText('choke', xLb, yT - 13); ctx.fillText(`${Idc.toFixed(2)} A`, xA - 30, ym + 3);
  ctx.fillText(talk ? `transformer ${(TALK.L * 1e3).toFixed(1)} mH, ${TALK.R} Ω` : `L ${P.coil.toFixed(0)} mH, ${P.coilR.toFixed(2)} Ω`, xL, yT - 10);
  ctx.textAlign = 'left'; ctx.fillText(talk ? `${(TALK.C * 1e6).toFixed(0)} µF` : 'C', Math.min(w - 30, xC + span / 2 + 10), ym + 3);
}, cktCv);
function along(pts, p) {
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], l = Math.hypot(x1 - x0, y1 - y0);
    if (p <= l) return [x0 + ((x1 - x0) * p) / l, y0 + ((y1 - y0) * p) / l];
    p -= l;
  }
  return pts[pts.length - 1];
}

retune();
update();
