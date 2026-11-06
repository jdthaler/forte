// expression.js — the five ways a held key is played beyond which key it is, as a Seaboard
// names them: Strike (how hard it goes down: velocity), Glide (its own pitch bend, MPE), Slide
// (its own CC74, MPE), Press (aftertouch and MPE pressure) and Lift (how fast it comes up:
// release velocity). Every instrument has a switch for each, in its Expression group: a preset
// can turn off the ones that make little sense on it, and anyone can turn any of them off.
//
// The switches are the page's parameters (they go in P, presets, songs and links), not the
// engine's: shell.js adds the group, and the worklet (shared/worklet.js) holds back what a switch
// that is off would let through (createGate). The plugins have the same five as their own
// parameters (native/plugin/plugin.cpp), saved under the same ids.
//
// A page shows only the switches its instrument answers to (responds): Strike unless its
// descriptor says `strike: false`, Glide where `mpe.bend` is more than 0, Slide where
// `mpe.slide` (with a mod wheel to slide), Press where it has `aftertouch` or `mpe.press`, and
// Lift where it has `lift` (what a slow or a fast release does).

export const EXPRESSION_IDS = ['strikeOn', 'glideOn', 'slideOn', 'pressOn', 'liftOn'];

export const EXPRESSION = {
  id: 'expression',
  title: 'Expression',
  open: false,
  params: [
    { id: 'strikeOn', label: 'Strike: how hard a key goes down', type: 'checkbox', def: true, hint: 'Off: every note as hard as the computer keys play' },
    { id: 'glideOn', label: 'Glide: a note’s own pitch bend', type: 'checkbox', def: true, hint: 'MPE. Off: each note stays on its key’s pitch (the pitch wheel still bends them all)' },
    { id: 'slideOn', label: 'Slide: a note’s own slide (CC74)', type: 'checkbox', def: true, hint: 'MPE. Off: a finger moving along the key does nothing (the mod wheel still works)' },
    { id: 'pressOn', label: 'Press: pressing into a held key', type: 'checkbox', def: true, hint: 'Aftertouch and MPE pressure. Off: ignored' },
    { id: 'liftOn', label: 'Lift: how fast a key comes up', type: 'checkbox', def: true, hint: 'Release velocity. Off: every release at the instrument’s usual speed' },
  ],
};

export const EXPRESSION_DEFAULTS = Object.fromEntries(EXPRESSION.params.map((p) => [p.id, p.def]));

/** Whether instrument descriptor I answers to switch `id` (one of EXPRESSION_IDS). */
export function responds(I, id) {
  switch (id) {
    case 'strikeOn': return I.strike !== false;
    case 'glideOn': return (I.mpe?.bend ?? 0) > 0;
    case 'slideOn': return !!I.mpe?.slide && !!I.modWheel;
    case 'pressOn': return !!I.aftertouch || !!I.mpe?.press;
    case 'liftOn': return !!I.lift;
    default: return true;
  }
}

/** The switches instrument I doesn't answer to (yet): its pages hide them, and its plugin and saved presets leave them out. */
export const unanswered = (I) => EXPRESSION_IDS.filter((id) => !responds(I, id));

/** A descriptor's groups with the Expression group after them (once). */
export const withExpression = (groups) => (groups.includes(EXPRESSION) ? groups : [...groups, EXPRESSION]);

/**
 * What the engine is sent, with the switches applied (shared/worklet.js). message(m) gives the
 * message to pass on (maybe changed), or null to drop it; params(P, send) reads the switches from
 * a new P, and a switch just turned off lets go of what it held (a bent note back on its pitch, a
 * slid one back to the wheel, a pressed one to no pressure), through send. keyVelocity: the
 * velocity a note gets with Strike off when P has no `velocity` (the computer keys').
 */
export function createGate(keyVelocity = 0.75) {
  let strike = true, glide = true, slide = true, press = true, lift = true, fixed = keyVelocity;
  const bent = new Set(), slid = new Set(), pressed = new Set(); // keys (null: the channel) holding some
  return {
    params(P, send) {
      if (!P) return;
      fixed = typeof P.velocity === 'number' ? P.velocity : keyVelocity;
      strike = P.strikeOn !== false; lift = P.liftOn !== false;
      if (glide && P.glideOn === false) for (const key of bent) send({ type: 'noteBend', key, value: 1 });
      if (slide && P.slideOn === false) for (const key of slid) send({ type: 'slide', key, value: NaN });
      if (press && P.pressOn === false) for (const key of pressed) send({ type: 'pressure', key, value: 0 });
      glide = P.glideOn !== false; slide = P.slideOn !== false; press = P.pressOn !== false;
      if (!glide) bent.clear();
      if (!slide) slid.clear();
      if (!press) pressed.clear();
    },
    message(m) {
      switch (m.type) {
        case 'noteOn': return strike ? m : { ...m, velocity: fixed };
        case 'noteOff': return lift || m.velocity === undefined ? m : { ...m, velocity: undefined };
        case 'noteBend': // a note's own bend (1: none, as a note struck plain starts)
          if (m.value === 1) { bent.delete(m.key); return m; }
          if (!glide) return null;
          bent.add(m.key); return m;
        case 'slide':
          if (Number.isNaN(m.value)) { slid.delete(m.key); return m; }
          if (!slide) return null;
          slid.add(m.key); return m;
        case 'pressure': {
          const key = m.key ?? null;
          if (!press) return null;
          if (m.value > 0) pressed.add(key); else pressed.delete(key);
          return m;
        }
        case 'panic': bent.clear(); slid.clear(); pressed.clear(); return m;
        default: return m;
      }
    },
  };
}
