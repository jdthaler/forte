// audio-util.mjs — FFT convolution, WAV writing, an AudioContext stand-in for Node.

import { writeFileSync } from 'node:fs';

export function fft(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inv ? 2 : -2) * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

export function convolve(x, h) {
  let N = 1;
  while (N < x.length + h.length) N <<= 1;
  const ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N);
  ar.set(x); br.set(h);
  fft(ar, ai, false); fft(br, bi, false);
  for (let i = 0; i < N; i++) {
    const r = ar[i] * br[i] - ai[i] * bi[i], im = ar[i] * bi[i] + ai[i] * br[i];
    ar[i] = r; ai[i] = im;
  }
  fft(ar, ai, true);
  return ar.subarray(0, x.length);
}

export function writeWav(path, [L, R], gain, FS) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(FS, 24); buf.writeUInt32LE(FS * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  const soft = (v) => (Math.abs(v) < 0.8 ? v : Math.sign(v) * (0.8 + 0.2 * Math.tanh((Math.abs(v) - 0.8) / 0.2)));
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(32767 * soft(L[i] * gain)), 44 + i * 4);
    buf.writeInt16LE(Math.round(32767 * soft(R[i] * gain)), 46 + i * 4);
  }
  writeFileSync(path, buf);
}


export const FS_SHIM = (FS) => ({
  sampleRate: FS,
  createBuffer: (c, n) => { const ch = Array.from({ length: c }, () => new Float32Array(n)); return { getChannelData: (i) => ch[i] }; },
});
