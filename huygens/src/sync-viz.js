// sync-viz.js — devil's staircase / Arnold tongues, firing raster.

import { noteName } from './tuning.js';

function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function fit(cv) {
  const dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
  const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
  if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

export const JUST_MARKS = [
  [1, 1, 'unison'], [16, 15, '16:15'], [9, 8, '9:8'], [7, 6, '7:6'], [6, 5, '6:5'], [5, 4, '5:4'], [4, 3, '4:3'],
  [7, 5, '7:5'], [3, 2, '3:2'], [8, 5, '8:5'], [5, 3, '5:3'], [7, 4, '7:4'], [9, 5, '9:5'], [15, 8, '15:8'], [2, 1, '2:1'],
];
const cents = (p, q) => 1200 * Math.log2(p / q);
// colour a lock by its complexity (p + q): simple ratios bright and warm
function lockColor(code) {
  const p = Math.floor(code / 100), q = code % 100, c = p + q;
  const hue = (200 + c * 23) % 360, light = Math.max(38, 70 - c * 2.5);
  return `hsl(${hue} 80% ${light}%)`;
}

export class StairView {
  constructor(canvas) {
    this.cv = canvas;
    this.stair = null;       // { xs, ys }
    this.rows = [];          // tongue rows: { kick, xs, row }
    this.nRows = 24; this.kmax = 0.15;
    this.kick = 0.06;
    this.marks = [];         // current chord: natural intervals (cents)
  }
  reset(full) { this.stair = null; if (full) this.rows = []; }
  draw() {
    const { ctx, w, h } = fit(this.cv);
    ctx.clearRect(0, 0, w, h);
    const muted = css('--muted'), grid = css('--grid'), text = css('--text');
    const padL = 40, padR = 10, top = 16, mid = Math.round(h * 0.46), gap = 22, bot = h - 18;
    const X = (c) => padL + ((w - padL - padR) * c) / 1200;
    ctx.font = '10px system-ui, sans-serif';
    // just-ratio guides
    for (const [p, q, name] of JUST_MARKS) {
      const x = X(cents(p, q));
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke();
      if (p + q <= 13) { ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.fillText(name, x, 11); }
    }
    // ET semitone ticks
    ctx.fillStyle = muted; ctx.textAlign = 'center';
    for (let s = 0; s <= 12; s++) {
      const x = X(100 * s);
      ctx.fillRect(x - 0.5, bot, 1, 4);
      if (s % 2 === 0) ctx.fillText(`${100 * s}`, x, h - 3);
    }
    // --- top: pull = measured − natural interval
    const range = 40, Y = (v) => top + ((mid - top) * (range - v)) / (2 * range);
    ctx.strokeStyle = grid;
    for (const v of [-range, -20, 0, 20, range]) { ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(w - padR, Y(v)); ctx.stroke(); }
    ctx.textAlign = 'right'; ctx.fillStyle = muted;
    for (const v of [-range, 0, range]) ctx.fillText(`${v > 0 ? '+' : ''}${v}¢`, padL - 4, Y(v) + 3);
    ctx.save(); ctx.translate(10, (top + mid) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('pull', 0, 0); ctx.restore();
    if (this.stair) {
      const { xs, ys } = this.stair;
      ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.5; ctx.beginPath();
      let pen = false;
      for (let i = 0; i < xs.length; i++) {
        const v = ys[i] - xs[i];
        if (!Number.isFinite(v)) { pen = false; continue; }
        const y = Y(Math.max(-range, Math.min(range, v)));
        if (pen) ctx.lineTo(X(xs[i]), y); else { ctx.moveTo(X(xs[i]), y); pen = true; }
      }
      ctx.stroke(); ctx.lineWidth = 1;
    } else { ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.fillText('computing…', (padL + w) / 2, (top + mid) / 2); }
    // --- bottom: tongue map
    const t0 = mid + gap, YK = (k) => bot - ((bot - t0) * k) / this.kmax;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(padL, t0, w - padL - padR, bot - t0);
    for (const r of this.rows) {
      if (!r) continue;
      const y0 = YK(r.kick + this.kmax / (2 * this.nRows)), y1 = YK(r.kick - this.kmax / (2 * this.nRows));
      const dx = r.xs[1] - r.xs[0];
      for (let i = 0; i < r.xs.length; i++) {
        if (!r.row[i]) continue;
        ctx.fillStyle = lockColor(r.row[i]);
        ctx.fillRect(X(r.xs[i] - dx / 2), y0, Math.max(1, X(dx) - X(0) + 0.5), y1 - y0 + 0.5);
      }
    }
    ctx.textAlign = 'right'; ctx.fillStyle = muted;
    for (const k of [0, 0.05, 0.1, 0.15]) ctx.fillText(`${(k * 100).toFixed(0)}%`, padL - 4, YK(k) + 3);
    ctx.save(); ctx.translate(10, (t0 + bot) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('coupling', 0, 0); ctx.restore();
    ctx.strokeStyle = text; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(padL, YK(this.kick)); ctx.lineTo(w - padR, YK(this.kick)); ctx.stroke(); ctx.setLineDash([]);
    // current chord's intervals above its lowest note
    for (const m of this.marks) {
      const c = ((m % 1200) + 1200) % 1200 || (m > 0 ? 1200 : 0);
      ctx.fillStyle = css('--accent-2');
      ctx.beginPath(); ctx.arc(X(c), YK(this.kick), 4.5, 0, 2 * Math.PI); ctx.fill();
      ctx.beginPath(); ctx.arc(X(c), Y(0), 3.5, 0, 2 * Math.PI); ctx.fill();
    }
  }
}

// Firing raster, triggered on the lowest note so a locked chord stands still.
export class RasterView {
  constructor(canvas) { this.cv = canvas; this.state = null; }
  set(st) { this.state = st; }
  draw() {
    const { ctx, w, h } = fit(this.cv);
    ctx.clearRect(0, 0, w, h);
    const st = this.state, muted = css('--muted');
    ctx.font = '11px system-ui, sans-serif';
    if (!st || !st.fires.length) {
      ctx.fillStyle = muted; ctx.textAlign = 'center';
      ctx.fillText('Hold a chord: each row is one oscillator, each tick a lamp firing', w / 2, h / 2);
      return;
    }
    const rows = [...st.fires].filter((r) => r.times.length > 2).sort((a, b) => a.key - b.key);
    if (!rows.length) return;
    const root = rows[0], per = (root.times[root.times.length - 1] - root.times[0]) / (root.times.length - 1);
    const span = 4 * per;
    // trigger: the latest root firing that leaves a full window after it
    let trig = root.times[0];
    for (const t of root.times) if (t + span <= st.t) trig = t;
    const padL = 46, padR = 8, rh = Math.min(26, (h - 10) / rows.length);
    const X = (t) => padL + ((w - padL - padR) * (t - trig)) / span;
    rows.forEach((r, i) => {
      const y = 6 + i * rh;
      ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(padL, y, w - padL - padR, rh - 3);
      ctx.fillStyle = muted; ctx.textAlign = 'right'; ctx.fillText(noteName(r.key), padL - 6, y + rh / 2 + 3);
      ctx.fillStyle = css('--accent');
      for (const t of r.times) {
        if (t < trig - 1 || t > trig + span) continue;
        ctx.fillRect(X(t) - 1, y + 2, 2, rh - 7);
      }
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    for (let k = 0; k <= 4; k++) { ctx.beginPath(); ctx.moveTo(X(trig + k * per), 2); ctx.lineTo(X(trig + k * per), h - 2); ctx.stroke(); }
  }
}
