// harpsichord-model.js — the physics of a Flemish double-manual harpsichord
// (after the Ruckers, as later rebuilt with a five-octave compass), free of
// audio and DOM so that the page, the engine, the tests and the render tool
// can all use it. SI units throughout.
//
//   key ─▶ jacks rise ─▶ each engaged plectrum catches its string, bends,
//          slides and slips off (plectrum.js, string.js)
//   strings: three choirs, front 8′, back 8′ and 4′, iron from B♭ up and brass
//          below, stiff strings in modal form, each partial draining into the
//          bridge at the soundboard's conductance there
//   soundboard: an equivalent orthotropic plate, driven along the 8′ and 4′
//          bridges and heard by two microphones over it
//
// Registration follows the French double: the upper manual plays the front
// 8′ (plucked nearest the nut); the lower manual plays the back 8′ and the
// 4′; the shove coupler lets the lower manual take the upper's jacks too.
// The lute row (an English and German addition) plucks the back 8′ strings
// right by the nut from the upper manual; the buff stop presses leather pads
// against the back 8′ strings by the nut.

import { makePlectrum, beamC } from './plectrum.js';
import { PluckedString, PT } from './string.js';

export const KEY_LO = 29, KEY_HI = 89;        // FF – f³, 61 keys
export const C2 = 72;                         // c² (Helmholtz) = C5, the scaling reference
const PI = Math.PI, TAU = 2 * PI;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// Deterministic "random" number in [0, 1) per key and salt (a tuner's small errors).
export function jitter(m, s = 0) { const x = Math.sin(m * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); }

// ---------------------------------------------------------------------------
// Tuning: a pitch standard and a temperament, built from its circle of fifths.

export const PURE_FIFTH = 1200 * Math.log2(3 / 2);           // 701.955 ¢
export const PYTH_COMMA = 1200 * Math.log2(3 ** 12 / 2 ** 19); // 23.460 ¢
export const SYNT_COMMA = 1200 * Math.log2(81 / 80);          // 21.506 ¢
const CIRCLE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];         // C G D A E B F♯ C♯ G♯ E♭ B♭ F
// The twelve fifths in circle order (C–G, G–D, …, F–C), one of them null: the
// fifth that closes the circle, whatever is left over (meantone's wolf).
const narrow = (c) => PURE_FIFTH - c;
export const TEMPERAMENTS = {
  equal: { name: 'Equal', fifths: [...Array(11).fill(700), null] },
  meantone: { name: '¼-comma meantone', fifths: [...Array(8).fill(narrow(SYNT_COMMA / 4)), null, ...Array(3).fill(narrow(SYNT_COMMA / 4))] },
  werckmeister: { name: 'Werckmeister III', fifths: [narrow(PYTH_COMMA / 4), narrow(PYTH_COMMA / 4), narrow(PYTH_COMMA / 4), PURE_FIFTH, PURE_FIFTH, narrow(PYTH_COMMA / 4), PURE_FIFTH, PURE_FIFTH, PURE_FIFTH, PURE_FIFTH, PURE_FIFTH, null] },
};
// Cents of each pitch class above C within the octave.
export function temperamentCents(id) {
  const fifths = (TEMPERAMENTS[id] || TEMPERAMENTS.equal).fifths, c = new Float64Array(12), w = fifths.indexOf(null);
  let x = 0;
  for (let i = 0; i < w; i++) { x += fifths[i]; c[CIRCLE[i + 1]] = ((x % 1200) + 1200) % 1200; }
  x = 0;
  for (let i = 11; i > w; i--) { x -= fifths[i]; c[CIRCLE[i]] = ((x % 1200) + 1200) % 1200; }
  return c;
}
// Departure from equal temperament per pitch class, with A unchanged (it is the pitch standard).
const offMemo = new Map();
export function temperamentOffsets(id) {
  let o = offMemo.get(id);
  if (!o) {
    const c = temperamentCents(id);
    o = Float64Array.from(c, (v, pc) => { let d = v - 100 * pc; if (d > 600) d -= 1200; if (d < -600) d += 1200; return d; });
    const a = o[9];
    for (let i = 0; i < 12; i++) o[i] -= a;
    offMemo.set(id, o);
  }
  return o;
}
// The key's target pitch (Hz) for the 8′ choirs; the 4′ is an octave above.
export function keyPitch(m, P) {
  const off = temperamentOffsets(P.temperament || 'equal')[((m % 12) + 12) % 12];
  return (P.pitch || 440) * 2 ** ((m - 69) / 12 + off / 1200);
}

// ---------------------------------------------------------------------------
// The scale: lengths, wires and tensions

// Iron (as a soft, low-carbon wire; elastic constants as for steel) and
// yellow brass. η: internal loss factor of the wire (estimates).
export const IRON = { name: 'iron', E: 2.0e11, rho: 7850, eta: 2.5e-4 };
export const BRASS = { name: 'brass', E: 1.0e11, rho: 8500, eta: 6e-4 };

export const SCALE = {
  c2: 0.355,      // m: the 8′ c² string (Ruckers' iron scaling, about 35–36 cm)
  fold: 2.5,      // the bass is foreshortened: L = L_P/(1 + (L_P/L_max)^p)^(1/p), L_P the Pythagorean length
  max8: 1.7,      // m: L_max for the 8′ …
  max4: 0.9,      // m: … and for the 4′, whose bridge stands on the board
  brass8: 45,     // the 8′ is brass up to A (MIDI 45), iron from B♭
  brass4: 40,     // the 4′ is brass up to E (MIDI 40), iron from F
  nut: 0.09,      // m: from the nut to the soundboard's front edge (wrestplank and gap)
};

// Pythagorean (L ∝ 1/f, doubling every octave down) from the top, rolled off
// smoothly towards a maximum in the bass; c² is exactly SCALE.c2 (8′) and half that (4′).
function fold(Lf, Lmax) { const p = SCALE.fold; return Lf / (1 + (Lf / Lmax) ** p) ** (1 / p); }
export function stringLength(m, choir) {
  const four = choir === 'four', Lc = four ? SCALE.c2 / 2 : SCALE.c2, Lmax = four ? SCALE.max4 : SCALE.max8;
  return (fold(Lc * 2 ** ((C2 - m) / 12), Lmax) * Lc) / fold(Lc, Lmax);
}
const logInterp = (m, m0, d0, m1, d1) => d0 * (d1 / d0) ** clamp((m - m0) / (m1 - m0), 0, 1);
export function isBrass(m, choir) { return m <= (choir === 'four' ? SCALE.brass4 : SCALE.brass8); }
// Wire diameter (m): graded smoothly, as gauge numbers step it on an instrument.
export function wireDiameter(m, choir) {
  if (choir === 'four') return isBrass(m, choir) ? logInterp(m, 40, 0.26e-3, 29, 0.36e-3) : logInterp(m, 41, 0.24e-3, 89, 0.18e-3);
  return isBrass(m, choir) ? logInterp(m, 45, 0.34e-3, 29, 0.56e-3) : logInterp(m, 46, 0.30e-3, 89, 0.20e-3);
}

// The tuner's small errors: the two 8′ choirs a little apart (P.detune cents
// between them on average, the front sharp), the 4′ a little off its octave.
export function detuneCents(m, choir, P) {
  const d = P.detune ?? 1.5, j = 0.6 + 0.8 * jitter(m, choir === 'front' ? 1 : choir === 'back' ? 2 : 3);
  return d * j * (choir === 'front' ? 0.5 : choir === 'back' ? -0.5 : 0.25 * (jitter(m, 4) < 0.5 ? -1 : 1));
}
export const stringPitch = (m, choir, P) => keyPitch(m, P) * (choir === 'four' ? 2 : 1) * 2 ** (detuneCents(m, choir, P) / 1200);

// One string: tuned so that its stiff-string fundamental is the target,
//   f₁ = (1/2L)√(T/μ)·√(1 + B),  B = π²EI/(TL²) = π³Ed⁴/(64TL²),
// i.e. T = 4L²f₁²μ − EI(π/L)².
export function stringDesign(m, choir, P, f1 = null) {
  const mat = isBrass(m, choir) ? BRASS : IRON;
  const L = stringLength(m, choir), d = wireDiameter(m, choir);
  const A = (PI * d * d) / 4, mu = mat.rho * A, EI = (mat.E * PI * d ** 4) / 64;
  const f0 = f1 ?? stringPitch(m, choir, P);
  const T = 4 * L * L * f0 * f0 * mu - (EI * PI * PI) / (L * L);
  const B = (PI * PI * EI) / (T * L * L);
  return { key: m, choir, mat, L, d, A, mu, EI, T, B, f0, stress: T / A, c: Math.sqrt(T / mu), Z: 2 * Math.sqrt(T * mu) };
}
// Partial n of a pinned stiff string: f_n = (1/2π)√((T k² + EI k⁴)/μ), k = nπ/L
// (= n f₁ √((1 + Bn²)/(1 + B))).
export function partialFreq(S, n) { const k = (n * PI) / S.L; return Math.sqrt((S.T * k * k + S.EI * k ** 4) / S.mu) / TAU; }

// ---------------------------------------------------------------------------
// Losses of a string on its own: air and the wire's internal friction.
//
// Air: a thin wire moving in air feels a viscous drag per metre that has a
// constant part and a boundary-layer part growing as √f; with the air's
// viscosity η_a and density ρ_a (estimates of the usual form)
//   R(f) = 2π η_a + 2π d √(π η_a ρ_a f),   σ_air = R / 2μ.
// Material: σ = π f η (η the loss factor). Thin wires lose relatively more to
// the air, so the treble's partials die sooner.
export const AIR = { eta: 1.8e-5, rho: 1.2 };
export function sigmaString(S, f, lossScale = 1) {
  const R = 2 * PI * AIR.eta + 2 * PI * S.d * Math.sqrt(PI * AIR.eta * AIR.rho * f);
  return (R / (2 * S.mu) + PI * f * S.mat.eta) * lossScale;
}

// ---------------------------------------------------------------------------
// Registers: which jacks pluck which strings, where, from which manual.

export const ROWS = {
  front: { string: 'front', manual: 'upper', name: 'front 8′' },
  back: { string: 'back', manual: 'lower', name: 'back 8′' },
  four: { string: 'four', manual: 'lower', name: '4′' },
  lute: { string: 'back', manual: 'upper', name: 'lute' },
};
export const STRINGS = ['front', 'back', 'four'];
// Plucking distance from the nut at c² (param ids), and the jacks' order in
// the stagger (the back 8′ speaks first, then the front 8′, the 4′, the lute).
export const ROW_PARAM = { front: 'xFront', back: 'xBack', four: 'xFour', lute: 'xLute' };
export const ROW_ORDER = { back: 0, front: 1, four: 2, lute: 1.5 };

// Which jack rows rise when a key goes down, and which of them pluck. Every
// jack on the key rises and lifts its damper; only the engaged rows' plectra
// reach their strings. The lower manual raises the back 8′ and 4′ jacks (and,
// coupled, the upper manual's too); the upper manual raises the front 8′ and
// the lute. The lute row and the back 8′ row share their strings: with both
// rising and engaged, the lute plucks them.
export function registration(P) {
  const lower = P.manual !== 'upper', coupled = lower && !!P.coupler;
  const rises = { back: lower, four: lower, front: !lower || coupled, lute: !lower || coupled };
  const on = { back: !!P.back8, four: !!P.four, front: !!P.front8, lute: !!P.lute };
  const rows = ['back', 'front', 'four', 'lute'].filter((r) => rises[r] && on[r]);
  if (rows.includes('lute') && rows.includes('back')) rows.splice(rows.indexOf('back'), 1);
  const lift = { front: rises.front, back: rises.back || rises.lute, four: rises.four };
  return { rows, lift };
}

// Distance of a row's plucking point from the nut (m). The jack rows run
// straight across the gap while the nut curves away in the bass, so the
// distance grows towards the bass, but less than the string's length: here as
// √L. The plucked fraction β = x/L is ≈ 0.25 at the top and 0.05 at FF.
export function pluckPoint(m, row, P) {
  const choir = ROWS[row].string, L = stringLength(m, choir), Lc = stringLength(C2, choir);
  const x = (P[ROW_PARAM[row]] ?? 50) * 1e-3 * Math.sqrt(L / Lc);
  return clamp(x, 0.002, 0.5 * L);
}
export const DAMPER_OFFSET = 0.004; // m: the damper cloth sits beside the plectrum on the jack
export const BUFF_X = 0.010;        // m: the buff's leather pads touch the strings this far from the nut

// ---------------------------------------------------------------------------
// The action: jack and key speeds, heights.

export const ACTION = {
  gap: 1.0e-3,     // m: plectrum top below the string at rest
  top: 7.5e-3,     // m: the jack rail stops the plectrum this far above the string's rest
  felt: 0,         // m: the damper felt rests on the string at rest, without pressing it
  feltK: 300,      // N/m: the felt's stiffness …
  feltR: 3.0,      // × the string's wave impedance √(Tμ): its damping (it only pushes down: half of each swing)
  tongueK: 60,     // N/m: the tongue's spring, felt by the string as the plectrum passes on the way down
  thick: 0.45e-3,  // m: plectrum thickness (its underside meets the string on the way down)
  keyMass: 0.025,  // kg: key and jacks, landing on the keybed cloth
  jackMass: 0.006, // kg: a jack, dropping back onto its key
  knock: 2e-3,     // s: duration of a knock on the cloth
};
// Velocity 0..1 → jack speed: 8 cm/s (pp) … 80 cm/s (ff).
export const jackSpeed = (vel) => 0.08 * 10 ** clamp(vel, 0, 1);
// Release velocity 0..1 → the jack's fall: 3.5 cm/s (a key let up slowly) … 35 cm/s
// (a jack dropping freely from the rail, √(2gh) for h ≈ 6 mm). Keys that report
// no release velocity use DEFAULT_RELEASE.
export const DEFAULT_RELEASE = 0.6;
export const fallSpeed = (r) => 0.035 * 10 ** clamp(r, 0, 1);

// ---------------------------------------------------------------------------
// The soundboard: an equivalent simply supported orthotropic plate.
//
// A harpsichord's board is spruce about 3 mm thick, its grain along the
// strings, glued all round to the case and loaded and stiffened by its
// bridges and a few ribs. Here it is an equivalent plate (as the piano board
// is in the Electric Grand): a rectangle of the board's size, the mass of
// spruce and bridges (ρh = 1.6 kg/m²), spruce's anisotropy (D_x = 10 D_y,
// along and across the grain), and a stiffness set by the one thing that
// matters most to the strings, the board's mean conductance at the bridge,
// G₀ = 1/(8√(ρh)(D_x D_y)^¼) = 3.5×10⁻³ s/kg (an estimate, about twice a
// piano's: a harpsichord's board is far thinner but its bridge is stiffer).
//   ω_mn = (π²/√(ρh)) √(D_x (m/a)⁴ + 2H (m/a)²(n/b)² + D_y (n/b)⁴),  H = √(D_x D_y)/2
//   φ_mn(x, y) = (2/√(ρh ab)) sin(mπx/a) sin(nπy/b)
// x runs along the strings from the board's front edge, y across it from
// the bass side. The lowest BOARD.maxModes modes are integrated; above them
// the board is heard through a residual path, flat in force (mass-like).
export const BOARD = { a: 1.75, b: 0.85, rhoh: 1.6, aniso: 10, G0: 3.5e-3, eta: 0.04, maxModes: 96, mb: 0.01 };
// Bridge points (segments) that the strings drive: three along the 8′
// bridge, two along the 4′.
export const SEGS = [
  { bridge: 'eight', t: 0 }, { bridge: 'eight', t: 0.5 }, { bridge: 'eight', t: 1 },
  { bridge: 'four', t: 0 }, { bridge: 'four', t: 1 },
];
export const keyT = (m) => (m - KEY_LO) / (KEY_HI - KEY_LO);
// Where key m's string of a choir meets its bridge, on the board: along the
// string from the nut, and across by the key's place. The equivalent plate's
// edges stand for the board's stiffened margins (liners, the 4′ hitch-pin
// rail), so the bridge points stay at least 12 % of the way in from them.
export function bridgePoint(m, choir) {
  const L = stringLength(m, choir), x = clamp(L - SCALE.nut, 0.12 * BOARD.a, 0.88 * BOARD.a);
  const y = BOARD.b * (0.14 + 0.72 * keyT(m)) + (choir === 'four' ? -0.012 : choir === 'back' ? 0.004 : 0);
  return [x, y];
}
// A choir's segment weights: linear between the two nearest points on its bridge.
export function segmentWeights(m, choir) {
  const w = new Float64Array(SEGS.length), t = keyT(m);
  if (choir === 'four') { w[3] = 1 - t; w[4] = t; }
  else if (t < 0.5) { w[0] = 1 - 2 * t; w[1] = 2 * t; } else { w[1] = 2 - 2 * t; w[2] = 2 * t - 1; }
  return w;
}
const segPoint = (s) => { const m = KEY_LO + SEGS[s].t * (KEY_HI - KEY_LO); return bridgePoint(m, SEGS[s].bridge === 'four' ? 'four' : 'back'); };

// Two microphones close over the board, one over its tail (bass) end and one
// over its front (treble) end: each hears the board's motion averaged over a
// Gaussian patch (σ = 0.3 m) under it. The low modes ring the whole board and
// reach both alike; above the modal band the engine's residual path hears
// each bridge point mostly at the nearer microphone.
export const MICS = [[0.85, 0.35], [0.15, 0.65]]; // (x/a, y/b): over the tail (bass) end and the front (treble) end
const MIC_W = 0.3;

let boardMemo = null;
export function boardModel() {
  if (boardMemo) return boardMemo;
  const { a, b, rhoh, aniso, G0, eta, maxModes } = BOARD;
  const sq = 1 / (64 * rhoh * G0 * G0), Dy = sq / Math.sqrt(aniso), Dx = aniso * Dy, H = sq / 2; // √(Dx Dy) = sq
  const omega = (m, n) => (PI * PI / Math.sqrt(rhoh)) * Math.sqrt(Dx * (m / a) ** 4 + 2 * H * (m / a) ** 2 * (n / b) ** 2 + Dy * (n / b) ** 4);
  const all = [], wCap = 6 * omega(1, 1) * Math.sqrt(maxModes);
  for (let m = 1; omega(m, 1) < wCap; m++) for (let n = 1; omega(m, n) < wCap; n++) all.push({ m, n, w: omega(m, n) });
  all.sort((p, q) => p.w - q.w);
  const list = all.slice(0, maxModes), K = list.length, N0 = 2 / Math.sqrt(rhoh * a * b);
  const shape = (k, x, y) => N0 * Math.sin((list[k].m * PI * x) / a) * Math.sin((list[k].n * PI * y) / b);
  const f = new Float64Array(K), sigma = new Float64Array(K), phi = new Float64Array(K * SEGS.length), mic = new Float64Array(2 * K);
  const pts = SEGS.map((_, s) => segPoint(s));
  for (let k = 0; k < K; k++) {
    f[k] = list[k].w / TAU; sigma[k] = (eta * list[k].w) / 2;
    for (let s = 0; s < SEGS.length; s++) phi[k * SEGS.length + s] = shape(k, pts[s][0], pts[s][1]);
    for (let j = 0; j < 2; j++) { // ∫∫ φ g dA over the mic's Gaussian patch (normalised)
      const cx = MICS[j][0] * a, cy = MICS[j][1] * b, nx = 48, ny = 24;
      let sum = 0, wsum = 0;
      for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) {
        const x = ((ix + 0.5) * a) / nx, y = ((iy + 0.5) * b) / ny, g = Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * MIC_W * MIC_W));
        sum += g * shape(k, x, y); wsum += g;
      }
      mic[2 * k + j] = sum / wsum;
    }
  }
  const fTop = K ? f[K - 1] : 1000;
  boardMemo = { K, f, sigma, phi, mic, list, shape, Dx, Dy, Ginf: G0, fTop, f11: K ? f[0] : 0, density: K / fTop, pts };
  return boardMemo;
}

// Driving-point admittance (s/kg) of the board at (x, y): the modal sum, the
// mean conductance G₀ for the modes above the integrated band (faded in
// across its top), then the bridge's own mass m_b in series,
// Y_tot = Y/(1 + iω m_b Y). Returns [Re, Im].
export function boardAdmittance(x, y, f, B = boardModel()) {
  const w = TAU * f;
  let re = 0, im = 0;
  for (let k = 0; k < B.K; k++) {
    const p = B.shape(k, x, y), p2 = p * p, wk = TAU * B.f[k], d = wk * wk - w * w, s2 = 2 * B.sigma[k] * w, den = d * d + s2 * s2;
    re += (p2 * w * s2) / den; im += (p2 * w * d) / den;
  }
  re += B.Ginf / (1 + (B.fTop / f) ** 4);
  const yy = re * re + im * im, zr = re / yy, zi = -im / yy + w * BOARD.mb, zz = zr * zr + zi * zi;
  return [zr / zz, -zi / zz];
}

// ---------------------------------------------------------------------------
// One string's partials, for the engine and the views.
//
// Mass-normalised shapes φₙ(x) = √(2/μL) sin(kₙx), x from the nut. The string
// pushes on the bridge with F = Σ bₙ qₙ, bₙ = (−1)ⁿ⁺¹ √(2/μL)(T kₙ + EI kₙ³),
// and the bridge, moving with velocity Re Y · F, takes power from partial n
// at the rate σ_b = Re Y(fₙ) bₙ²/2ωₙ² (= Re Y · T/L for a flexible string).
export const F_MAX = 10000, N_MAX = 90; // Hz (default; P.fmax in kHz), partials per string at most
export function stringPartials(S, P, fs = 48000) {
  const fmax = Math.min((P.fmax ?? F_MAX / 1000) * 1000, 0.45 * fs), nrm = Math.sqrt(2 / (S.mu * S.L));
  const [bx, by] = bridgePoint(S.key, S.choir), lossScale = (P.loss ?? 1) * (P.lossScale ?? 1), Gs = P.bridgeScale ?? 1;
  const out = [];
  for (let n = 1; n <= N_MAX; n++) {
    const f = partialFreq(S, n);
    if (f > fmax && n > 1) break;
    const k = (n * PI) / S.L, w = TAU * f, b = (n % 2 ? 1 : -1) * nrm * (S.T * k + S.EI * k ** 3);
    const sigS = sigmaString(S, f, lossScale), sigB = Gs * boardAdmittance(bx, by, f)[0] * (b * b) / (2 * w * w);
    out.push({ n, f, k, b, sigS, sigB, sigma: sigS + sigB });
  }
  return { nrm, partials: out };
}
// Decay time (s) of a partial: 60 dB.
export const t60 = (sigma) => Math.log(1000) / sigma;

// The pluck's comb: a string released from rest in the static shape of a
// point force at x_p has modal amplitudes ∝ φₙ(x_p)/ωₙ², ∝ sin(nπβ)/(n²(1 + Bn²))
// (β = x_p/L), and pushes the bridge with partial forces ∝ bₙ × that.
export function combAmplitudes(S, xp, nMax) {
  const a = [];
  for (let n = 1; n <= nMax; n++) {
    const k = (n * PI) / S.L, w2 = (S.T * k * k + S.EI * k ** 4) / S.mu;
    a.push({ n, f: Math.sqrt(w2) / TAU, disp: Math.sin(k * xp) / w2, force: (Math.sin(k * xp) / w2) * (S.T * k + S.EI * k ** 3) });
  }
  return a;
}

// ---------------------------------------------------------------------------
// Putting a string together.

// The string's lateral stiffness at x (static, N/m): K_z = T L / x(L − x).
export const lateralStiffness = (S, x) => (S.T * S.L) / (x * (S.L - x));
// The plectrum of a row at key m. The voicing knob sets the tip stiffness for
// a string of lateral stiffness K_ref = 1000 N/m at the plucking point (about
// c²); the voicer leaves the plectra of slacker strings weaker, k_tip ∝ K_z^0.6.
// Why: friction holds the string until the plectrum's slope under it reaches
// the friction angle, which fixes the plectrum's deflection there (w ≈ ⅔ s tan φ,
// whatever its stiffness), and the string is then up by (k/K_z)·w; a slack bass
// string under a treble plectrum would ride up to the jack rail and never be
// plucked. k ∝ K_z would lift every string alike but give the stiff treble
// strings far more energy (E ≈ ½K_z u²); k ∝ √K_z would even out the energy
// but lift the slack strings too far. The exponent 0.6 is the compromise.
export const VOICING = { Kref: 1000, exp: 0.6 };
export function plectrumFor(m, row, P) {
  const S = stringDesign(m, ROWS[row].string, P), Kz = lateralStiffness(S, pluckPoint(m, row, P));
  const v = (Kz / VOICING.Kref) ** VOICING.exp;
  return makePlectrum({ kTip: (P.stiff ?? 2500) * v, overlap: (P.overlap ?? 0.6) * 1e-3, material: P.material || 'delrin', mu: P.mu ?? null, taper: P.taper ?? null, foreshortening: P.foreshortening ?? true });
}
// The rows' gaps below the string (the stagger: the order in which they speak).
export const rowGap = (row, P) => ACTION.gap + ROW_ORDER[row] * (P.stagger ?? 0.5) * 1e-3;

// A string ready to play: partials, damper felt, buff, tongue.
export function buildString(m, choir, P, fs = 48000) {
  const S = stringDesign(m, choir, P);
  const { partials } = stringPartials(S, P, fs);
  const st = new PluckedString(S, partials, fs);
  const mainRow = choir === 'four' ? 'four' : choir;
  st.feltK = ACTION.feltK; st.feltR = ACTION.feltR * (P.damper ?? 1) * Math.sqrt(S.T * S.mu); st.feltPre = ACTION.felt;
  st.tongueK = ACTION.tongueK; st.thick = ACTION.thick;
  st.setPoint(PT.DAMPER, Math.min(0.5 * S.L, pluckPoint(m, mainRow, P) + DAMPER_OFFSET));
  if (choir === 'back') {
    // the buff: a leather pad by the nut, lightly sprung and lossy (×√(Tμ))
    st.buffK = 400; st.buffR = BUFF.R * Math.sqrt(S.T * S.mu);
    st.setPoint(PT.BUFF, BUFF_X);
  }
  return st;
}
export const BUFF = { R: 0.6 };

// An offline pluck (tests, the slow-motion view): one row's string at key m,
// the key pressed at jack speed V; records every `every` samples until `sec`.
export function simulatePluck(m, row, P, { V = jackSpeed(P.velocity ?? 0.7), fs = 48000, sec = 0.06, every = 1, until = null } = {}) {
  const choir = ROWS[row].string, st = buildString(m, choir, P, fs), pl = plectrumFor(m, row, P), x = pluckPoint(m, row, P);
  const p = row === 'lute' ? PT.LUTE : PT.MAIN, gap = rowGap(row, P);
  st.armPlectrum(p, pl, x, gap, true, false);
  const n = Math.round(sec * fs), lift = new Float64Array(1), buff = new Float64Array(1), seg = new Float64Array(5), wts = new Float64Array(5).fill(1);
  const tr = { t: [], y: [], u: [], F: [], s: [], z: [], w: [], fb: [] };
  let L = 0, released = -1;
  const top = ACTION.top + gap;
  for (let i = 0; i < n; i++) {
    L = Math.min(top, L + V / fs); lift[0] = L;
    seg[0] = 0;
    st.render(1, lift, true, buff, seg, 1, wts, 0, 0, 1);
    if (released < 0 && st.released[p]) released = i;
    if (i % every === 0) {
      const F = st.Fp[p], s = st.s[p];
      tr.t.push(i / fs); tr.y.push(L - gap); tr.u.push(st.dispAtQ(p, st.q)); tr.F.push(F); tr.s.push(s); tr.z.push(st.zOld[p]); tr.w.push(F * beamC(pl, s)); tr.fb.push(seg[0]);
    }
    if (until && released >= 0 && i > released + until * fs) break;
  }
  return { st, pl, x, S: st.S, trace: tr, released: released >= 0 ? released / fs : null, rel: released >= 0 ? { ...st.relInfo[p] } : null, gap };
}
