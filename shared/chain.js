// chain.js — the output chain after the engine, built from an instrument's `chain`
// (in its descriptor, <slug>/src/<slug>-instrument.js). Every page uses it; the native
// plugins rebuild the same chain in C++.
//
//   node → [tone low-pass] → [body: dry + soundboard convolution] → master (+ room) → limiter → out
//
// chain = {
//   volume: id,            master gain = P[volume] × the registry's trim
//   room?: id,             room reverb (shared/impulses.js roomIR, roomSeconds long) at roomGain × P[room]
//   roomSeconds?: 2.0, roomGain?: 0.6,
//   tone?: id,             low-pass at P[tone] Hz, Q 0.6 (dB, as Web Audio reads it)
//   body?: { param, seconds, dry, wet },   a soundboard or body (shared/impulses.js soundboardIR):
//                          dry signal × (1 − dry·P[param]) + convolved × wet·P[param]
//   limiter?: { threshold?, knee?, ratio?, attack?, release? },   overrides of LIMITER
// }

import { roomIR, soundboardIR } from './impulses.js';

export const LIMITER = { threshold: -3, knee: 3, ratio: 12, attack: 0.002, release: 0.15 };
export const ROOM = { seconds: 2.0, gain: 0.6 };
export const TONE_Q = 0.6;

// The gains the chain sets from the parameters (what `apply` ramps to).
export function chainGains(chain, P, trim = 1) {
  const g = { master: chain.volume ? P[chain.volume] * trim : 1 };
  if (chain.room) g.room = (chain.roomGain ?? ROOM.gain) * P[chain.room];
  if (chain.tone) g.tone = P[chain.tone];
  if (chain.body) { const x = P[chain.body.param]; g.dry = 1 - chain.body.dry * x; g.body = chain.body.wet * x; }
  return g;
}

// The limiter: shared/limiter.js in the 'forte-limiter' processor that shared/worklet.js
// registers (the page adds that module before building the chain). Web Audio's
// DynamicsCompressorNode, the fallback, delays everything 6 ms to look ahead.
function createLimiter(ctx, L) {
  try {
    return new AudioWorkletNode(ctx, 'forte-limiter', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers',
      processorOptions: L,
    });
  } catch {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = L.threshold; c.knee.value = L.knee; c.ratio.value = L.ratio;
    c.attack.value = L.attack; c.release.value = L.release;
    return c;
  }
}

// Build the chain on `ctx` after `node`. Returns the nodes, `tap` (the signal before the
// body and room, for an analyser) and apply(P, trim), which ramps the gains (20 ms).
export function createChain(ctx, node, chain, destination = ctx.destination) {
  let tap = node, tone = null;
  if (chain.tone) { tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.Q.value = TONE_Q; node.connect(tone); tap = tone; }
  let bus = tap, dry = null, bodyGain = null;
  if (chain.body) {
    const body = ctx.createConvolver();
    body.buffer = soundboardIR(ctx, chain.body.seconds);
    dry = ctx.createGain(); bodyGain = ctx.createGain(); bus = ctx.createGain();
    tap.connect(dry).connect(bus);
    tap.connect(body).connect(bodyGain).connect(bus);
  }
  const master = ctx.createGain(), limiter = createLimiter(ctx, { ...LIMITER, ...chain.limiter });
  bus.connect(master);
  let roomGain = null;
  if (chain.room) {
    const room = ctx.createConvolver(); room.buffer = roomIR(ctx, chain.roomSeconds ?? ROOM.seconds);
    roomGain = ctx.createGain(); bus.connect(room).connect(roomGain).connect(master);
  }
  master.connect(limiter).connect(destination);
  const apply = (P, trim = 1) => {
    const t = ctx.currentTime, g = chainGains(chain, P, trim);
    if (tone) tone.frequency.setTargetAtTime(g.tone, t, 0.02);
    if (dry) { dry.gain.setTargetAtTime(g.dry, t, 0.02); bodyGain.gain.setTargetAtTime(g.body, t, 0.02); }
    if (roomGain) roomGain.gain.setTargetAtTime(g.room, t, 0.02);
    master.gain.setTargetAtTime(g.master, t, 0.02);
  };
  return { tap, tone, dry, bodyGain, master, roomGain, limiter, apply };
}
