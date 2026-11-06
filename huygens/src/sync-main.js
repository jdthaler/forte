// sync-main.js — the page: wires the shell (shared/shell.js) to the engine, and the lock
// analysis and views. The instrument itself (parameters, engine, chain) is huygens-instrument.js.
// The worklet runs the WebAssembly build (huygens-wasm.js), and the views call its model.

import { createShell } from '../../shared/shell.js';
import { INSTRUMENT } from './huygens-instrument.js';
import { keyFreq, noteName, nearestRatio, intervalName } from './tuning.js';
import { TUNING_KEEP, tuningRatio } from '../../shared/tuning.js';
import { wasmModel } from './huygens-wasm.js';
import { SpectrumView, SpectrogramView, animate } from '../../shared/views.js';
import { StairView, RasterView } from './sync-viz.js';
import { FiringLog } from './lock-analysis.js';
import { paramsStore } from '../../shared/layer.js';

const $ = (s) => document.querySelector(s);
const log = new FiringLog(3); // the last 3 s of every sounding lamp's firings

const spectrum = new SpectrumView($('#spectrum'), { fLo: 40, fHi: 16000 });
new SpectrogramView($('#spectrogram'), { spectrum });

// The WebAssembly model (huygens-wasm.js): each key's design frequency (the lock map's theory and
// engine are its too, staircase.js in its worker)
const { tunedFreq } = await wasmModel();

let lastTable = 0;
const shell = createShell({
  ...INSTRUMENT,
  store: paramsStore('huygens'), // the page's own name for its settings, from before the shell
  arrows: { param: 'kick', step: 0.005 },
  noteData: (key, vel, P) => ({ f: tunedFreq(key, P) }), // the design frequency the views mark
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onMessage: (m) => {
    if (m.type !== 'state') return;
    log.ingest(m);
    if (m.fires.length || raster.state?.fires.length) raster.set(log.recent(1));
    const now = performance.now();
    if (now - lastTable > 120) { lastTable = now; updateTables(log.analyze(), log.hold); }
  },
  onNoteOn: () => refreshMarks(),
  onNoteOff: () => refreshMarks(),
  onPanic: () => { log.clear(); refreshMarks(); },
  onParam: (id, v, P, p) => {
    if (id === '*') { retuneSounding(); recomputeStair(true); }
    else if (p.kind === 'tune' || TUNING_KEEP.includes(id)) retuneSounding(); // the engine tunes new notes itself (and the keyboard's tuning, which has no kind)
    else if (id === 'kick') recomputeStair(false);
    else if (['rSrc', 'vNom', 'vStrike', 'vExt'].includes(id)) recomputeStair(true);
  },
});
const P = () => shell.P;
function retuneSounding() { shell.post({ type: 'retune', list: shell.activeKeys().map((k) => [k, tunedFreq(k, P())]) }); refreshMarks(); }

// ---------------------------------------------------------------------------
// analysis + views

const stair = new StairView($('#stair'));
const raster = new RasterView($('#raster'));
let worker = null, stairTimer = 0;
function recomputeStair(full) {
  stair.kick = P().kick; stair.touch();
  clearTimeout(stairTimer);
  stairTimer = setTimeout(() => {
    if (!worker) {
      worker = new Worker('src/staircase-worker.js', { type: 'module' });
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'stair') {
          stair.stair = { xs: m.xs, ys: m.ys };
          $('#stair-read').textContent = `C4 plus a second lamp · coupling ${(P().kick * 100).toFixed(1)} %${m.delta !== undefined ? ` (δ = ${m.delta.toFixed(4)})` : ''}${m.exact ? '' : ' · simulated'}`;
        } else if (m.type === 'row') { stair.nRows = m.rows; stair.rows[m.r] = m; }
        stair.touch();
      };
    }
    stair.reset(full);
    worker.postMessage({ P: { ...P() }, rows: 24, kmax: 0.15, full });
  }, 250);
}

function refreshMarks() {
  const keys = shell.activeKeys();
  stair.touch();
  if (keys.length < 2) { stair.marks = []; return; }
  const f0 = tunedFreq(keys[0], P());
  stair.marks = keys.slice(1).map((k) => 1200 * Math.log2(tunedFreq(k, P()) / f0));
}

// an: log.analyze(). Locks come from shared firings, so their ratios are exact.
function updateTables(an, hold) {
  const live = an.notes;
  // the spectrum's markers: what each oscillator plays (bright) and was designed to play (faint)
  spectrum.set(live.length ? Math.min(...live.map((o) => o.f)) : 0, live.flatMap((o) => [{ f: o.fTarget, color: '#9393a0', alpha: 0.35 }, { f: o.f, alpha: 0.9 }]));
  $('#hold-read').textContent = hold ? `supply servo ${(1200 * -hold).toFixed(1)} ¢` : '';
  if (!live.length) {
    $('#notes').innerHTML = '<tr><td class="free">Play or hold a chord (Space latches notes)</td></tr>';
    $('#pairs').innerHTML = '';
    return;
  }
  const meter = (c, d) => {
    const pos = (v) => `${50 + Math.max(-50, Math.min(50, (v / 30) * 50))}%`;
    return `<span class="meter"><b></b><u style="left:${pos(d)}"></u><i style="left:${pos(c)}"></i></span>`;
  };
  $('#notes').innerHTML = '<tr><th>note</th><th>designed</th><th>playing</th><th>vs equal temperament (±30 ¢)</th></tr>'
    + live.map((o) => {
      // equal temperament at the pitch standard (A4's ratio is the standard's), so a temperament shows
      const et = keyFreq(o.key) * tuningRatio(P(), 69), cd = 1200 * Math.log2(o.fTarget / et), cp = 1200 * Math.log2(o.f / et);
      return `<tr><td>${noteName(o.key)}</td><td>${cd >= 0 ? '+' : ''}${cd.toFixed(1)} ¢</td><td>${cp >= 0 ? '+' : ''}${cp.toFixed(1)} ¢</td><td>${meter(cp, cd)}</td></tr>`;
    }).join('');
  const rows = [];
  for (const { a, b, lock, ratio: r, design, beat } of an.pairs) {
    const nr = nearestRatio(r, 9);
    rows.push(`<tr><td>${noteName(a.key)}–${noteName(b.key)} <span class="muted">${intervalName(b.key - a.key)}</span></td>`
      + `<td>${(1200 * Math.log2(b.fTarget / a.fTarget)).toFixed(1)} ¢</td><td>${(1200 * Math.log2(r)).toFixed(1)} ¢</td>`
      + `<td>${nr.p}:${nr.q} = ${(1200 * Math.log2(nr.p / nr.q)).toFixed(1)} ¢</td>`
      + (lock ? `<td class="locked">locked ${lock.p}:${lock.q}${lock.q > 16 ? ' (long pattern)' : ''}</td>`
        : `<td class="free">${design.p}:${design.q} off by ${(1200 * Math.log2(r / (design.p / design.q))).toFixed(1)} ¢ · beats ${beat.toFixed(1)} Hz</td>`)
      + '</tr>');
  }
  $('#pairs').innerHTML = rows.length ? '<tr><th>pair</th><th>designed</th><th>now</th><th>nearest simple ratio</th><th>status</th></tr>' + rows.slice(0, 15).join('') : '';
}

// views redraw only when something changed (and only while visible)
function frame() { stair.frame(); raster.frame(); }

updateTables({ notes: [], pairs: [] }, 0);
recomputeStair(true);
animate(frame);
