# The workshop: build briefs

Every instrument briefed here has now been built, and each section below
points to its README. A new instrument starts here as a brief, listed in
`shared/registry.js` with `ready: false` so that it shows on the landing page
and in the menus as "in the workshop". A brief covers the physics, the
effects that should be playable, suggested controls and views, what the
tests should check against, the traps, and the prior art: the original
literature and earlier models, academic and commercial, so that whoever
builds an instrument starts with the credits in hand.

To build one, follow [INSTRUMENT_GUIDE.md](INSTRUMENT_GUIDE.md):

```bash
node tools/new-instrument.mjs <slug> <EngineName> "<Name>"
```

Use the slug and name from the registry. Lessons from the first fourteen
instruments:

* **Test combinations of extreme settings at 44.1 and 48 kHz**, not one
  knob at a time. Most NaNs and blow-ups the review found needed two knobs
  at their limits.
* **Smooth every live control per sample** (gains, pans, cutoffs), or it
  zippers.
* **Re-striking a sounding key must not create a second voice** for the
  same string, reed or bar.
* **Voice stealing must fade**, and must never take a voice that hasn't
  sounded yet.
* **Self-oscillating instruments must speak on every key at the default
  touch.** Measure their onset times.
* **Check every README number against the code** before committing.
* **Going live:**
  - set `ready: true, version: '0.1.0'`;
  - run `node tools/loudness.mjs` and set the suggested `trim`;
  - add a `CHANGELOG.md` entry;
  - `npm test` (the site and level tests check all of this);
  - browser-check the page at desktop and iPad sizes.

---

## Harpsichord (`harpsichord`): built

Now an instrument: see [harpsichord/README.md](../harpsichord/README.md), whose
*Prior art and references* carry this brief's research.

---

## Pipe Organ (`pipes`): built

Now an instrument: see [pipes/README.md](../pipes/README.md), whose
*Prior art and references* carry this brief's research.

---

## Carillon (`carillon`): built

Now an instrument: see [carillon/README.md](../carillon/README.md), whose
*Prior art and references* carry this brief's research.

---

## Vibraphone (`vibraphone`): built

Now an instrument: see [vibraphone/README.md](../vibraphone/README.md), whose
*Prior art and references* carry this brief's research.

---

## Free-Reed Organ (`harmonium`): built

Now an instrument: see [harmonium/README.md](../harmonium/README.md), whose
*Prior art and references* carry this brief's research.

---

## Singing Arc (`arc`): built

Now an instrument: see [arc/README.md](../arc/README.md), whose
*Prior art and references* carry this brief's research.

---

## Star Keyboard (`stars`): built

Now an instrument: see [stars/README.md](../stars/README.md), whose
*Prior art and references* carry this brief's research.

---

## Wind Harp (`windharp`): built

Now an instrument: see [windharp/README.md](../windharp/README.md), whose
*Prior art and references* carry this brief's research.

---

## Bubble Organ (`bubbles`): built

Now an instrument: see [bubbles/README.md](../bubbles/README.md), whose
*Prior art and references* carry this brief's research.

---

## Spring Keyboard (`springs`): built

Now an instrument: see [springs/README.md](../springs/README.md), whose
*Prior art and references* carry this brief's research.
