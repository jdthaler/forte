// views.js — canvas helpers and the views most instruments want: a live
// log-frequency spectrum with model markers, a scrolling spectrogram, and a
// triggered oscilloscope.

export function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

// Size a canvas to its CSS box at device resolution; returns a 2-D context in CSS pixels.
export function fit(cv) {
  const dpr = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
  const W = Math.round(w * dpr), H = Math.round(h * dpr); // integers, or the bitmap is reset every frame
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(W / w, 0, 0, H / h, 0, 0);
  return { ctx, w, h };
}

// Call draw() every animation frame (the browser pauses this in hidden tabs),
// skipping frames while `canvas` is hidden (a folded or unselected view tab, Perform).
export function animate(draw, canvas = null) {
  const loop = (t) => { requestAnimationFrame(loop); if (!canvas || canvas.offsetParent !== null) draw(t); };
  requestAnimationFrame(loop);
}

// Live spectrum (dB vs log f). set(f0, markers): faint harmonic grid on f0, and
// vertical markers [{ f, color?, alpha? }] for the model's modes.
export class SpectrumView {
  constructor(canvas, { fLo = 25, fHi = 20000, dbTop = -10, dbRange = 100 } = {}) {
    Object.assign(this, { cv: canvas, fLo, fHi, dbTop, dbRange, analyser: null, f0: 0, markers: [] });
    animate(() => this.draw(), canvas);
  }
  setAnalyser(a) { this.analyser = a; this.fft = new Float32Array(a.frequencyBinCount); }
  set(f0, markers = []) { this.f0 = f0; this.markers = markers; }
  draw() {
    const { ctx, w, h } = fit(this.cv);
    ctx.clearRect(0, 0, w, h);
    const { fLo, fHi, dbTop, dbRange } = this;
    const padL = 34, padR = 8, padT = 6, padB = 18;
    const X = (f) => padL + ((w - padL - padR) * Math.log(f / fLo)) / Math.log(fHi / fLo);
    const Y = (d) => padT + ((h - padT - padB) * (dbTop - d)) / dbRange;
    ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      if (f < fLo || f > fHi) continue;
      ctx.beginPath(); ctx.moveTo(X(f), padT); ctx.lineTo(X(f), h - padB); ctx.stroke();
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, X(f), h - 5);
    }
    ctx.textAlign = 'right';
    for (let d = dbTop; d >= dbTop - dbRange; d -= 25) { ctx.beginPath(); ctx.moveTo(padL, Y(d)); ctx.lineTo(w - padR, Y(d)); ctx.stroke(); ctx.fillText(`${d}`, padL - 4, Y(d) + 3); }
    if (this.f0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      for (let n = 2; n * this.f0 < fHi && n < 48; n++) { ctx.beginPath(); ctx.moveTo(X(n * this.f0), padT); ctx.lineTo(X(n * this.f0), h - padB); ctx.stroke(); }
    }
    ctx.lineWidth = 2;
    for (const m of this.markers) {
      if (!(m.f >= fLo && m.f <= fHi)) continue;
      ctx.strokeStyle = m.color || css('--accent'); ctx.globalAlpha = m.alpha ?? 0.75;
      ctx.beginPath(); ctx.moveTo(X(m.f), h - padB); ctx.lineTo(X(m.f), padT + 8); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
    if (this.analyser) {
      this.analyser.getFloatFrequencyData(this.fft);
      const fs = this.analyser.context.sampleRate, N = this.fft.length;
      ctx.beginPath();
      let started = false;
      for (let i = 1; i < N; i++) {
        const f = (i * fs) / (2 * N);
        if (f < fLo || f > fHi) continue;
        const d = Math.max(dbTop - dbRange, Math.min(dbTop, this.fft[i]));
        if (started) ctx.lineTo(X(f), Y(d)); else { ctx.moveTo(X(f), Y(d)); started = true; }
      }
      ctx.strokeStyle = css('--text'); ctx.globalAlpha = 0.7; ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
}

// Live spectrogram: time across (now at the right), log frequency up, level as
// colour, from the instrument's accent. It scrolls at `secs` seconds across,
// whatever the frame rate. Follow a SpectrumView with { spectrum }: its
// analyser, range and markers. Otherwise setAnalyser(a) and set(f0, markers);
// markers [{ f, color? }] are ticks on the frequency axis. For a narrow band,
// log: false and ticks(fLo, fHi) → [{ f, text }] label a linear axis; auto: true
// puts the loudest recent level at the top (for a sound with no fixed level).
export class SpectrogramView {
  constructor(canvas, { spectrum = null, fLo, fHi, dbTop, dbRange = 80, secs = 6, log = true, ticks = null, auto = false } = {}) {
    Object.assign(this, { cv: canvas, spectrum, secs, log, ticks, auto, ref: -80, analyser: null, f0: 0, markers: [], img: null, t: 0, acc: 0 });
    this.fLo = fLo ?? spectrum?.fLo ?? 40;
    this.fHi = fHi ?? spectrum?.fHi ?? 16000;
    this.dbTop = dbTop ?? (spectrum ? spectrum.dbTop - 10 : -20);
    this.dbRange = dbRange;
    animate((t) => this.draw(t), canvas);
  }
  setAnalyser(a) { this.analyser = a; }
  set(f0, markers = []) { this.f0 = f0; this.markers = markers; }
  freq(u) { return this.log ? this.fLo * (this.fHi / this.fLo) ** u : this.fLo + (this.fHi - this.fLo) * u; } // u = 0 at the bottom, 1 at the top
  // 256 colours: the card's background, through the accent, to near white
  palette() {
    const accent = css('--accent'), bg = css('--card') || '#1a1a1e';
    if (this.lut && this.lutKey === accent + bg) return this.lut;
    const probe = document.createElement('canvas').getContext('2d');
    const rgb = (c) => { probe.fillStyle = '#000'; probe.fillStyle = c; const h = probe.fillStyle; return h[0] === '#' ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : (h.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number); };
    const a = rgb(bg).map((v) => v * 0.7), c = rgb(accent), b = c.map((v, i) => 0.35 * v + 0.65 * a[i]), d = c.map((v) => v + (255 - v) * 0.85);
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = i / 255, [p, q, u] = t < 0.35 ? [a, b, t / 0.35] : t < 0.75 ? [b, c, (t - 0.35) / 0.4] : [c, d, (t - 0.75) / 0.25];
      for (let k = 0; k < 3; k++) lut[i * 3 + k] = p[k] + (q[k] - p[k]) * u;
    }
    this.lutKey = accent + bg; this.lut = lut;
    return lut;
  }
  draw(now) {
    const { ctx, w, h } = fit(this.cv);
    const a = this.spectrum?.analyser ?? this.analyser;
    const markers = this.spectrum ? this.spectrum.markers : this.markers, f0 = this.spectrum ? this.spectrum.f0 : this.f0;
    const { fLo, fHi } = this;
    const padL = 34, padB = 16;
    const dpr = this.cv.width / w, W = Math.max(2, Math.round((w - padL) * dpr)), H = Math.max(2, Math.round((h - padB) * dpr));
    const lut = this.palette();
    const gap = this.t ? now - this.t : 0;
    const band = `${fLo} ${fHi} ${this.log}`;
    if (!this.img || this.img.width !== W || this.img.height !== H || this.band !== band || gap > this.secs * 1000) { // new, resized, another band, or back after a long gap
      this.band = band;
      this.img = document.createElement('canvas'); this.img.width = W; this.img.height = H;
      const g = this.img.getContext('2d'); g.fillStyle = `rgb(${lut[0]},${lut[1]},${lut[2]})`; g.fillRect(0, 0, W, H);
      this.col = null; this.acc = 0;
    }
    // how far to scroll: W pixels every `secs` seconds
    this.t = now; this.acc += (Math.min(gap, this.secs * 1000) * W) / (this.secs * 1000);
    const n = Math.min(W, Math.floor(this.acc));
    if (n > 0) {
      this.acc -= n;
      const g = this.img.getContext('2d');
      g.globalCompositeOperation = 'copy'; g.drawImage(this.img, -n, 0); g.globalCompositeOperation = 'source-over';
      const col = g.createImageData(n, H), px = col.data;
      if (a) {
        if (!this.fft || this.fft.length !== a.frequencyBinCount) { this.fft = new Float32Array(a.frequencyBinCount); this.rows = null; }
        a.getFloatFrequencyData(this.fft);
        const N = this.fft.length, fs = a.context.sampleRate;
        if (!this.rows || this.rows.length !== H + 1 || this.rowsKey !== `${fs} ${fLo} ${fHi} ${this.log}`) { // each row's bins, edge to edge
          this.rows = new Int32Array(H + 1); this.rowsKey = `${fs} ${fLo} ${fHi} ${this.log}`;
          for (let y = 0; y <= H; y++) this.rows[y] = Math.min(N - 1, Math.max(1, Math.round((this.freq(1 - y / H) * 2 * N) / fs)));
        }
        if (this.auto) { // the loudest bin in view: up at once, down over a few seconds, never below -80 dB
          let mx = -Infinity;
          for (let b = this.rows[H]; b <= this.rows[0]; b++) if (this.fft[b] > mx) mx = this.fft[b];
          this.ref = Math.max(-80, mx > this.ref ? mx : this.ref + 0.003 * n * (mx - this.ref));
        }
        const top = this.auto ? this.ref + 3 : this.dbTop, range = this.dbRange;
        for (let y = 0; y < H; y++) {
          let d = -Infinity; // the loudest bin in the row, so a narrow line high up is not lost
          for (let b = this.rows[y + 1]; b <= this.rows[y]; b++) if (this.fft[b] > d) d = this.fft[b];
          const k = Math.round(255 * Math.max(0, Math.min(1, 1 - (top - d) / range))) * 3;
          for (let x = 0; x < n; x++) { const q = (y * n + x) * 4; px[q] = lut[k]; px[q + 1] = lut[k + 1]; px[q + 2] = lut[k + 2]; px[q + 3] = 255; }
        }
      } else for (let q = 0; q < px.length; q += 4) { px[q] = lut[0]; px[q + 1] = lut[1]; px[q + 2] = lut[2]; px[q + 3] = 255; }
      g.putImageData(col, W - n, 0);
    }
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.img, padL, 0, w - padL, h - padB);
    const Hc = h - padB, Y = (f) => Hc * (1 - (this.log ? Math.log(f / fLo) / Math.log(fHi / fLo) : (f - fLo) / (fHi - fLo)));
    ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
    const ticks = this.ticks ? this.ticks(fLo, fHi) : [50, 100, 200, 500, 1000, 2000, 5000, 10000].map((f) => ({ f, text: f >= 1000 ? `${f / 1000}k` : `${f}` }));
    let last = Infinity; // labels at least 11 px apart, so a short canvas keeps a few
    for (const { f, text } of ticks) if (f > fLo && f < fHi && last - Y(f) >= 11) { ctx.fillText(text, padL - 6, Y(f) + 3); last = Y(f); }
    ctx.textAlign = 'left'; ctx.fillText(`${this.secs} s ago`, padL, h - 3);
    ctx.textAlign = 'right'; ctx.fillText('now', w - 2, h - 3);
    // the model's lines, as ticks beside the axis
    if (f0 > fLo && f0 < fHi) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(padL - 5, Y(f0) - 0.5, 5, 1); }
    for (const m of markers) {
      if (!(m.f > fLo && m.f < fHi)) continue;
      ctx.globalAlpha = m.alpha ?? 0.75; ctx.fillStyle = m.color || css('--accent');
      ctx.fillRect(padL - 5, Y(m.f) - 1, 5, 2);
    }
    ctx.globalAlpha = 1;
  }
}

// Oscilloscope, triggered on a rising zero crossing; `periods` cycles of f0 if set.
export class ScopeView {
  constructor(canvas, { ms = 20 } = {}) {
    Object.assign(this, { cv: canvas, ms, analyser: null, f0: 0, periods: 3 });
    animate(() => this.draw(), canvas);
  }
  setAnalyser(a) { this.analyser = a; this.buf = new Float32Array(a.fftSize); }
  setPitch(f0, periods = 3) { this.f0 = f0; this.periods = periods; }
  draw() {
    const { ctx, w, h } = fit(this.cv);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = css('--grid');
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    if (!this.analyser) return;
    const a = this.analyser, fs = a.context.sampleRate, x = this.buf;
    a.getFloatTimeDomainData(x);
    const span = Math.min(x.length / 2, Math.round(fs * (this.f0 ? this.periods / this.f0 : this.ms / 1000)));
    let t0 = 0;
    for (let i = 1; i < x.length - span; i++) if (x[i - 1] <= 0 && x[i] > 0) { t0 = i; break; }
    let pk = 1e-4;
    for (let i = t0; i < t0 + span; i++) pk = Math.max(pk, Math.abs(x[i]));
    const g = (0.42 * h) / Math.max(pk, 0.05);
    ctx.beginPath();
    for (let i = 0; i < span; i++) {
      const X = (i / (span - 1)) * w, Y = h / 2 - g * x[t0 + i];
      if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
    }
    ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1;
  }
}
