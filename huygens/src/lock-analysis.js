// lock-analysis.js — what the held chord is playing, from its firing times.
//
// The worklet sends each sounding lamp's new firing times (in samples). Two
// lamps that fire at the same instant have locked: from then on their motion
// repeats exactly (see sync-theory.js). So a pair counts as locked when its
// last few shared firings all give the same ratio of firing counts, and that
// ratio is the lock p:q exactly, with no frequency estimate involved. Notes
// in no locked pair are timed by a least-squares fit over at least 40 periods
// of the lowest note.

import { nearestRatio } from './tuning.js';

const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

// Lock of two firing-time lists (sorted, in samples) at time `now`:
// { p, q, fa, fb, span } with f_b/f_a = p/q exactly, or null.
//
// Between consecutive shared firings each lamp fires some number of times.
// Locked motion is periodic, so this sequence of counts repeats: we look for
// the period P (in shared firings) that explains the longest recent stretch,
// seen at least twice and lasting at least minDur seconds. (A chord can lock
// with a long pattern, e.g. counts 4,5,5,5,5,10,… for 67 cycles; a short run of
// equal counts inside it is not a lock.) The ratio is the count over one period.
export function pairLock(A, B, now, fs, minDur = 0.25) {
  const ia = [], ib = [];                          // indexes of shared firings
  for (let i = 0, j = 0; i < A.length && j < B.length;) {
    const d = A[i] - B[j];
    if (Math.abs(d) < 1e-6) { ia.push(i); ib.push(j); i++; j++; } else if (d < 0) i++; else j++;
  }
  const N = ia.length - 1;                         // steps between shared firings: 1..N
  if (N < 2) return null;
  const n0 = Math.max(0, N - 256);
  const same = (k, l) => ia[k] - ia[k - 1] === ia[l] - ia[l - 1] && ib[k] - ib[k - 1] === ib[l] - ib[l - 1];
  let P = 0, len = 0;
  for (let p = 1; p <= Math.min(64, (N - n0) >> 1); p++) {
    let m = 0;
    while (N - m - p > n0 && same(N - m, N - m - p)) m++;
    if (m < p || m + p <= len) continue;
    if (A[ia[N]] - A[ia[N - m - p]] < minDur * fs) continue;
    P = p; len = m + p;
  }
  if (!P) return null;
  const tK = A[ia[N]];
  let gap = 0;
  for (let k = N - P + 1; k <= N; k++) gap = Math.max(gap, A[ia[k]] - A[ia[k - 1]]);
  const k0 = N - P * Math.floor(len / P), span = tK - A[ia[k0]];
  const nA = ia[N] - ia[k0], nB = ib[N] - ib[k0];
  if (now - tK > gap + 2 * Math.max(span / nA, span / nB)) return null; // the next one is overdue
  const g = gcd(nA, nB);
  return { p: nB / g, q: nA / g, fa: (nA * fs) / span, fb: (nB * fs) / span, span };
}

// mean frequency from a least-squares fit of firing time against firing number
export function fitFrequency(times, from, fs) {
  let a = times.length - 1;
  while (a > 0 && times[a - 1] >= from) a--;
  const n = times.length - a;
  if (n < 4) return 0;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { const y = times[a + i]; sx += i; sy += y; sxx += i * i; sxy += i * y; }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return slope > 0 ? fs / slope : 0;
}

export class FiringLog {
  constructor(keep = 3) { this.keep = keep; this.keys = new Map(); this.t = 0; this.fs = 48000; this.hold = 0; }
  clear() { this.keys.clear(); }

  // a 'state' message: { t, fs, hold, osc: [key, fTarget, drift, …], fires: [key, n, t₁…t_n, …] }
  ingest(m) {
    this.t = m.t; this.fs = m.fs; this.hold = m.hold;
    const live = new Map();
    for (let i = 0; i + 2 < m.osc.length; i += 3) live.set(m.osc[i], { fTarget: m.osc[i + 1], drift: m.osc[i + 2] });
    for (const k of [...this.keys.keys()]) if (!live.has(k)) this.keys.delete(k);
    for (const [k, info] of live) {
      const e = this.keys.get(k);
      if (e) Object.assign(e, info); else this.keys.set(k, { times: [], ...info });
    }
    const f = m.fires;
    for (let i = 0; i < f.length; i += 2 + f[i + 1]) {
      const e = this.keys.get(f[i]);
      if (e) for (let j = 0; j < f[i + 1]; j++) e.times.push(f[i + 2 + j]);
    }
    const cut = this.t - this.keep * this.fs;
    for (const e of this.keys.values()) {
      let a = Math.max(0, e.times.length - 4096);
      while (a < e.times.length && e.times[a] < cut) a++;
      if (a) e.times.splice(0, a);
    }
  }

  // firings in the last `seconds`, for the raster
  recent(seconds) {
    const from = this.t - seconds * this.fs, out = [];
    for (const [key, e] of this.keys) {
      let a = e.times.length;
      while (a > 0 && e.times[a - 1] >= from) a--;
      out.push({ key, times: e.times.slice(a) });
    }
    return { t: this.t, fs: this.fs, fires: out };
  }

  // { notes: [{ key, f, fTarget, drift }], pairs: [{ a, b, lock: {p, q} | null, ratio, design, beat }] }
  // In a chord some locked pairs never fire together (C and G of a locked
  // C–E–G may meet only through E), so locks are chained: notes joined by
  // pairs that share firings form a locked group, and any two notes in a group
  // are locked at the product of the ratios along the way.
  analyze() {
    const fs = this.fs, now = this.t;
    const keys = [...this.keys.keys()].sort((x, y) => x - y);
    const notes = keys.map((key, i) => ({ key, ...this.keys.get(key), f: 0, span: 0, group: i, r: [1, 1] }));
    const edges = [];
    for (let i = 0; i < notes.length; i++) for (let j = i + 1; j < notes.length; j++) {
      const a = notes[i], b = notes[j], lk = pairLock(a.times, b.times, now, fs);
      if (!lk) continue;
      if (lk.span > a.span) { a.f = lk.fa; a.span = lk.span; }
      if (lk.span > b.span) { b.f = lk.fb; b.span = lk.span; }
      edges.push({ a, b, p: lk.p, q: lk.q, span: lk.span });
    }
    // merge groups; r = frequency relative to the group's first note, as a fraction
    edges.sort((x, y) => y.span - x.span);
    for (const { a, b, p, q } of edges) {
      if (a.group === b.group) continue;
      // b's group is rescaled so that r_b = r_a · p/q
      const num = a.r[0] * p * b.r[1], den = a.r[1] * q * b.r[0];
      const old = b.group;
      for (const n of notes) if (n.group === old) {
        const x = n.r[0] * num, y = n.r[1] * den, g = gcd(x, y);
        n.r = [x / g, y / g]; n.group = a.group;
      }
    }
    // within a group, time every note from its best-measured member
    for (const ref of notes) {
      if (!ref.span || notes.some((n) => n.group === ref.group && n.span > ref.span)) continue;
      for (const n of notes) if (n.group === ref.group) n.f = (ref.f * n.r[0] * ref.r[1]) / (n.r[1] * ref.r[0]);
    }
    const pairs = [];
    for (let i = 0; i < notes.length; i++) for (let j = i + 1; j < notes.length; j++) {
      const a = notes[i], b = notes[j];
      let lock = null;
      if (a.group === b.group && a.span && b.span) {
        const x = b.r[0] * a.r[1], y = b.r[1] * a.r[0], g = gcd(x, y);
        lock = { p: x / g, q: y / g };
      }
      pairs.push({ a, b, lock });
    }
    // notes in no locked pair: fit over ≥ 40 periods of the lowest note
    const win = notes.length ? Math.min(this.keep, Math.max(0.3, 40 / notes[0].fTarget)) : 0;
    for (const n of notes) if (!n.span) n.f = fitFrequency(n.times, now - win * fs, fs);
    for (const pr of pairs) {
      const { a, b } = pr;
      pr.ratio = pr.lock ? pr.lock.p / pr.lock.q : a.f > 0 && b.f > 0 ? b.f / a.f : 0;
      pr.design = nearestRatio(b.fTarget / a.fTarget, 9);
      pr.beat = pr.ratio ? Math.abs(pr.design.q * b.f - pr.design.p * a.f) : 0;
    }
    return { notes: notes.filter((n) => n.f > 0).map(({ key, f, fTarget, drift }) => ({ key, f, fTarget, drift })), pairs: pairs.filter((p) => p.ratio) };
  }
}
