// impulses.js — synthetic impulse responses for the soundboard and the room.
//
// Soundboard: a plate has roughly constant modal density, so we sum many
// randomly placed, randomly phased decaying modes, shaped by a radiation curve
// (weak below ~150 Hz, gently rolled off at the top). This is the "commuted"
// part of the model: bridge velocity in, radiated sound out.

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function soundboardIR(ctx, seconds = 0.4) {
  const fs = ctx.sampleRate, n = Math.floor(seconds * fs);
  const buf = ctx.createBuffer(2, n, fs);
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(11 + 7 * ch), out = buf.getChannelData(ch);
    const nModes = 700, fLo = 40, fHi = Math.min(12000, 0.45 * fs);
    for (let i = 0; i < nModes; i++) {
      const f = fLo + ((fHi - fLo) * (i + r())) / nModes;
      const sig = 9 + 0.011 * f;
      const hp = (f / 150) ** 2 / (1 + (f / 150) ** 2);
      const lp = 1 / Math.sqrt(1 + (f / 7000) ** 2);
      const amp = Math.sqrt(sig) * hp * lp * Math.sqrt(-2 * Math.log(1 - r() * 0.999));
      const w = (2 * Math.PI * f) / fs, rr = Math.exp(-sig / fs);
      const c = 2 * rr * Math.cos(w), r2 = rr * rr;
      const ph = 2 * Math.PI * r();
      let y1 = amp * Math.sin(ph), y2 = amp * Math.sin(ph - w) / rr;
      const len = Math.min(n, Math.ceil((9 / sig) * fs));
      for (let t = 0; t < len; t++) {
        const y = c * y1 - r2 * y2;
        out[t] += y1;
        y2 = y1; y1 = y;
      }
    }
  }
  return buf;
}

export function roomIR(ctx, seconds = 2.2) {
  const fs = ctx.sampleRate, n = Math.floor(seconds * fs);
  const buf = ctx.createBuffer(2, n, fs);
  const pre = Math.floor(0.014 * fs);
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(101 + ch), out = buf.getChannelData(ch);
    let lp = 0, lp2 = 0;
    for (let t = pre; t < n; t++) {
      const tt = (t - pre) / fs;
      const x = r() * 2 - 1;
      lp += 0.12 * (x - lp);
      lp2 += 0.03 * (x - lp2);
      const fade = Math.min(1, tt / 0.006);
      out[t] = fade * (0.55 * x * Math.exp((-6.9 * tt) / 0.9) + 1.6 * lp * Math.exp((-6.9 * tt) / 1.6) + 2.5 * lp2 * Math.exp((-6.9 * tt) / 2.0));
    }
  }
  return buf;
}

// Venues: the spaces the room reverb can be (the chain's `venue` parameter, shared/chain.js).
// 'room' is roomIR above, the pages' room from the start. The others are shoebox halls built
// from their physics: size [width, length, height] in m, the walls' mean absorption coefficient
// in each octave band (BANDS), a source, and a pair of microphones MIC_GAP apart across the
// width, at [x, y, z] in m.
// - Each band's reverberation time is Eyring's with the air's absorption (ISO 9613-1, 20 °C and
//   50 % humidity): T = 24 ln 10 · V / c / (−S ln(1 − α) + 4mV).
// - The early reflections are image sources (Allen and Berkley, J. Acoust. Soc. Am. 65, 1979) up
//   to the mixing time, √V ms: each wall takes √(1 − α) of the pressure (α at 500 Hz–1 kHz) and
//   the image's distance d its 1/d; a one-pole low-pass at 5 kHz softens them as surfaces do.
// - From half the mixing time a diffuse tail takes over: noise split into the octave bands by
//   Linkwitz–Riley crossovers (24 dB an octave), each band decaying in its own T, its energy
//   arriving at 4πc/V per second for a source whose direct sound is 1 at 1 m (Sabine's diffuse
//   field; the images' 1/d² summed over the room come to the same).
// The response starts with the direct sound, which is the dry signal, so a reflection arrives
// (d − r)/c later, and it is scaled to that direct sound. The noise is Mulberry32 again, seeded
// per venue and channel.
export const BANDS = [125, 250, 500, 1000, 2000, 4000, 8000];
const AIR = [0.44, 1.31, 2.73, 4.66, 9.86, 32.8, 117]; // dB/km
const SOUND = 343, MIC_GAP = 0.6, SQRT3 = Math.sqrt(3); // uniform noise × √3 has unit variance
export const VENUES = [
  { id: 'studio', name: 'Studio', size: [6, 8, 3.2], alpha: [0.2, 0.25, 0.3, 0.3, 0.32, 0.35, 0.35], src: [2.6, 2.3, 1.2], mic: [3.1, 5.4, 1.7] },
  { id: 'room', name: 'Room' },
  { id: 'recital', name: 'Recital hall', size: [14, 22, 9], alpha: [0.2, 0.2, 0.22, 0.22, 0.22, 0.24, 0.26], src: [6.5, 4.5, 1.5], mic: [7.3, 12, 2.5] },
  { id: 'hall', name: 'Concert hall', size: [19, 49, 18], alpha: [0.22, 0.24, 0.27, 0.28, 0.28, 0.29, 0.3], src: [9, 7, 2], mic: [9.8, 26, 3] },
  { id: 'cathedral', name: 'Cathedral', size: [30, 90, 28], alpha: [0.16, 0.16, 0.155, 0.155, 0.15, 0.15, 0.15], src: [14, 20, 1.6], mic: [15.2, 50, 2.5] },
];
export const venueOf = (id) => VENUES.find((v) => v.id === id) ?? VENUES[1];

// Each band's reverberation time (s)
export function reverbTimes(v) {
  const [W, L, H] = v.size, V = W * L * H, S = 2 * (W * L + L * H + W * H);
  return BANDS.map((f, b) => (24 * Math.log(10) * V) / SOUND / (-S * Math.log(1 - v.alpha[b]) + 4 * (AIR[b] / 4343) * V));
}
// Its length: the longest T and a tenth more, the last tenth fading out
export const venueSeconds = (v) => 1.1 * Math.max(...reverbTimes(v));

// A Butterworth low-pass or high-pass (Q 1/√2) as [b0, b1, b2, a1, a2]; twice over, one side of a
// Linkwitz–Riley crossover. filter runs one over x in place.
export function butterworth(high, f, fs) {
  const w = (2 * Math.PI * f) / fs, al = Math.sin(w) / Math.SQRT2, c = Math.cos(w), a0 = 1 + al;
  const b0 = (high ? 1 + c : 1 - c) / 2 / a0;
  return [b0, (high ? -2 : 2) * b0, b0, (-2 * c) / a0, (1 - al) / a0];
}
function filter([b0, b1, b2, a1, a2], x) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}
// The octave bands of x (BANDS: below the first crossover, between each two, above the last)
export function splitBands(x, fs) {
  const out = [];
  let rest = Float64Array.from(x);
  for (let j = 1; j < BANDS.length; j++) {
    const f = Math.sqrt(BANDS[j - 1] * BANDS[j]), lo = butterworth(false, f, fs), hi = butterworth(true, f, fs);
    out.push(filter(lo, filter(lo, Float64Array.from(rest))));
    rest = filter(hi, filter(hi, rest));
  }
  out.push(rest);
  return out;
}

export function venueIR(ctx, id, roomSeconds = 2.0) {
  const v = venueOf(id);
  if (!v.size) return roomIR(ctx, roomSeconds);
  const fs = ctx.sampleRate, n = Math.floor(venueSeconds(v) * fs), k = VENUES.indexOf(v);
  const buf = ctx.createBuffer(2, n, fs);
  const [W, L, H] = v.size, V = W * L * H, T = reverbTimes(v), mix = 0.001 * Math.sqrt(V);
  const beta = Math.sqrt(1 - (v.alpha[2] + v.alpha[3]) / 2), g = Math.sqrt((4 * Math.PI * SOUND) / V / fs);
  // the diffuse tail's share of the energy at emission time t: none before mix/2, all from mix
  const share = (t) => { const u = Math.min(1, Math.max(0, (2 * t) / mix - 1)), s = Math.sin(0.5 * Math.PI * u); return s * s; };
  const decay = T.map((t) => Math.exp(-6.9 / (t * fs)));
  const lpA = 1 - Math.exp((-2 * Math.PI * 5000) / fs), fade0 = Math.floor(0.9 * n);
  const reach = SOUND * mix, N = [W, L, H].map((d) => Math.ceil(reach / (2 * d)) + 1);
  // relative to the direct sound at the pair (Web Audio would floor a quieter response's RMS)
  const cx = v.mic[0] - v.src[0], cy = v.mic[1] - v.src[1], cz = v.mic[2] - v.src[2], rc = Math.sqrt(cx * cx + cy * cy + cz * cz);
  for (let ch = 0; ch < 2; ch++) {
    const out = buf.getChannelData(ch), early = new Float64Array(n + 1), s = v.src;
    const m = [v.mic[0] + (ch ? 0.5 : -0.5) * MIC_GAP, v.mic[1], v.mic[2]];
    const ex = m[0] - s[0], ey = m[1] - s[1], ez = m[2] - s[2], r0 = Math.sqrt(ex * ex + ey * ey + ez * ez);
    for (let nx = -N[0]; nx <= N[0]; nx++) for (let ux = 0; ux < 2; ux++)
      for (let ny = -N[1]; ny <= N[1]; ny++) for (let uy = 0; uy < 2; uy++)
        for (let nz = -N[2]; nz <= N[2]; nz++) for (let uz = 0; uz < 2; uz++) {
          const order = Math.abs(2 * nx - ux) + Math.abs(2 * ny - uy) + Math.abs(2 * nz - uz);
          if (order === 0) continue; // the direct sound
          const dx = (1 - 2 * ux) * s[0] + 2 * nx * W - m[0], dy = (1 - 2 * uy) * s[1] + 2 * ny * L - m[1], dz = (1 - 2 * uz) * s[2] + 2 * nz * H - m[2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d >= reach) continue;
          const at = ((d - r0) / SOUND) * fs, i = Math.floor(at), fr = at - i;
          if (i >= n) continue;
          const a = (beta ** order / d) * Math.sqrt(1 - share(d / SOUND));
          early[i] += a * (1 - fr); early[i + 1] += a * fr;
        }
    const r = rng(211 + 2 * k + ch), noise = new Float64Array(n), y = new Float64Array(n);
    for (let t = 0; t < n; t++) noise[t] = (r() * 2 - 1) * SQRT3;
    splitBands(noise, fs).forEach((band, b) => {
      let e = Math.exp((-6.9 * r0) / SOUND / T[b]); // what the band has lost since emission
      for (let t = 0; t < n; t++) { y[t] += band[t] * e; e *= decay[b]; }
    });
    const full = Math.ceil((mix - r0 / SOUND) * fs);
    let lp = 0;
    for (let t = 0; t < n; t++) {
      lp += lpA * (early[t] - lp);
      const tail = t < full ? g * Math.sqrt(share(t / fs + r0 / SOUND)) : g;
      const fade = t < fade0 ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (t - fade0)) / (n - fade0));
      out[t] = fade * rc * (lp + tail * y[t]);
    }
  }
  return buf;
}

// The gain that gives a venue the default room's energy: Web Audio scales every response to the
// same RMS (normalize), so its energy grows with its length; a venue n samples long gets
// √(2 s · fs / n), and 'room' keeps 1.
export function venueGain(id, length, fs) {
  return venueOf(id).size ? Math.sqrt(Math.floor(2.0 * fs) / length) : 1;
}
