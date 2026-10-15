# The workshop: instruments waiting to be built

These instruments are listed in `shared/registry.js` with `ready: false`, so
they show on the landing page and in the menus as "in the workshop". Each
section below is a build brief: the physics, the effects that should be
playable, suggested controls and views, what the tests should check against,
the traps, and the prior art: the original literature and earlier models,
academic and commercial, so that whoever builds an instrument starts with
the credits in hand.

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

## Singing Arc (`arc`)

*After William Duddell's singing arc (1900), which he played from a
keyboard.*

**Physics.**
- **The circuit:** a carbon arc lamp has a negative differential resistance
  (its V–I characteristic falls). A series LC circuit across it oscillates
  at f ≈ 1/(2π√LC), with amplitude set by the arc's nonlinearity. Duddell
  played tunes from a keyboard that switched combinations of capacitors
  across a fixed coil (Duddell 1901, Appendix III).
- **The sound:** the arc's current modulates its temperature and plasma
  column size. The column's thermal expansion radiates sound directly, so
  the arc is its own loudspeaker. Model the heat input as the electrical
  power u·i from the arc model (with a falling characteristic it is not
  ∝ i²), with radiated pressure ∝ d²(volume)/dt², i.e. ∝ dP/dt.
- **The arc:** use a Mayr-type dynamic arc model (thermal memory). It
  gives the hysteresis loop. The Cassie model has a flat static
  characteristic, so on its own it cannot start the oscillation. The hiss
  is a separate effect: Ayrton traced it to oxygen reaching the crater
  above a "hissing current", so add it as conductance noise above that
  current.

**Playable effects.**
- Arc current (bias), L/C ratio (timbre), and electrode gap.
- Hysteresis and "singing" versus "hissing" regimes.
- **The "talking arc":** microphone currents coupled into the arc
  circuit make the arc reproduce speech (Simon 1897–98; Duddell 1900).
  This is the historical arc-telephony demo.

**Views.**
- The arc's V–I curve with the operating point moving around its loop.
- The circuit with current flow.
- The plasma column's glow brightness ∝ power.

**Tests.**
- Small-signal oscillation condition |R_neg| > circuit loss.
- Frequency against the LC formula, including the shift from the arc's
  small-signal reactance (inductive for a thermal-memory arc, so the note
  falls slightly; Duddell measured about 1% below the formula).
- The Mayr model's hysteresis loop.

**Prior art.**

*History and invention.*
- E. Thomson (1893). "Method of and means for producing alternating
  currents." US Patent 500,630.
  [Google Patents](https://patents.google.com/patent/US500630A). A
  condenser and coil across a direct-current discharge gap; Duddell
  credits Thomson's 1892 experiments.
- H. Th. Simon (1898). "Akustische Erscheinungen am electrischen
  Flammenbogen." *Ann. Phys.* 300(2), 233–239.
  [doi:10.1002/andp.18983000204](https://doi.org/10.1002/andp.18983000204).
  The "talking arc": microphone currents fed into an arc make it
  reproduce speech.
- H. Ayrton (1899). "The hissing of the electric arc." *J. IEE* 28(140),
  400–436. [doi:10.1049/jiee-1.1899.0020](https://doi.org/10.1049/jiee-1.1899.0020).
- W. Duddell (1901). "On rapid variations in the current through the
  direct-current arc." *J. IEE* 30(148), 232–267 (read 13 December 1900).
  [doi:10.1049/jiee-1.1901.0007](https://doi.org/10.1049/jiee-1.1901.0007).
  The singing arc, played at the meeting from a keyboard that switched
  capacitors (Appendix III).
- Anon. (1900). "Some experiments on the direct-current arc." *Nature*
  63(1625), 182–183. [doi:10.1038/063182a0](https://doi.org/10.1038/063182a0).
  Report of Duddell's demonstration.
- H. Ayrton (1902). *The Electric Arc*. The Electrician Printing and
  Publishing Co., London.
  [archive.org](https://archive.org/details/electricarc00ayrtrich).
- V. Poulsen (1905). "Method of producing alternating currents with a
  high number of vibrations." US Patent 789,449.
  [Google Patents](https://patents.google.com/patent/US789449A). The arc
  converter for radio.
- E. Ruhmer (1908). *Wireless Telephony in Theory and Practice*. Trans.
  J. Erskine-Murray. D. Van Nostrand, New York.
  [archive.org](https://archive.org/details/wirelesstelephon00ruhmrich).
  The speaking arc and arc telephony.
- R. Wittje (2013). "The electrical imagination: sound analogies,
  equivalent circuits, and the rise of electroacoustics, 1863–1939."
  *Osiris* 28(1), 40–63. [doi:10.1086/671362](https://doi.org/10.1086/671362).

*Physics literature.*
- A. Blondel (1906). "Sur les phénomènes de l'arc chantant." *J. Phys.
  Théor. Appl.* 5(1), 77–97.
  [doi:10.1051/jphystap:01906005007700](https://doi.org/10.1051/jphystap:01906005007700).
- G. W. Nasmyth (1908). "The frequency of the singing arc." *Phys. Rev.
  (Ser. I)* 27(2), 117–140.
  [doi:10.1103/PhysRevSeriesI.27.117](https://doi.org/10.1103/PhysRevSeriesI.27.117).
- H. D. Arnold & I. B. Crandall (1917). "The thermophone as a precision
  source of sound." *Phys. Rev.* 10(1), 22–38.
  [doi:10.1103/PhysRev.10.22](https://doi.org/10.1103/PhysRev.10.22).
- O. Mayr (1943). "Beiträge zur Theorie des statischen und des
  dynamischen Lichtbogens." *Archiv für Elektrotechnik* 37(12), 588–608.
  [doi:10.1007/BF02084317](https://doi.org/10.1007/BF02084317).
- L. O. Chua & S. M. Kang (1976). "Memristive devices and systems."
  *Proc. IEEE* 64(2), 209–223.
  [doi:10.1109/PROC.1976.10092](https://doi.org/10.1109/PROC.1976.10092).
- M. G. Drouet & F. Nadeau (1979). "Pressure waves due to arcing faults in
  a substation." *IEEE Trans. Power Appar. Syst.* PAS-98(5), 1632–1635.
  [doi:10.1109/TPAS.1979.319480](https://doi.org/10.1109/TPAS.1979.319480).
  Measured sound pressure following the rate of change of arc power.
- Ph. Béquin, K. Castor, Ph. Herzog & V. Montembault (2007). "Modeling
  plasma loudspeakers." *J. Acoust. Soc. Am.* 121(4), 1960–1970.
  [doi:10.1121/1.2697201](https://doi.org/10.1121/1.2697201).
- J.-M. Ginoux & B. Rossetto (2013). "The singing arc: the oldest
  memristor?" In A. Adamatzky & G. Chen (eds), *Chaos, CNN, Memristors
  and Beyond*, World Scientific, 494–507.
  [doi:10.1142/9789814434805_0040](https://doi.org/10.1142/9789814434805_0040).
- J.-M. Ginoux (2017). "From the series-dynamo machine to the singing arc:
  Gérard-Lescuyer, Blondel, Poincaré." In *History of Nonlinear
  Oscillations Theory in France (1880–1940)*, Springer, 3–37.
  [doi:10.1007/978-3-319-55239-2_1](https://doi.org/10.1007/978-3-319-55239-2_1).

*Earlier models and synthesis projects.*
- W. Duddell (1913). "A water model of the musical electric arc." *Proc.
  Phys. Soc. Lond.* 26(1), 117.
  [doi:10.1088/1478-7814/26/1/311](https://doi.org/10.1088/1478-7814/26/1/311).
  Duddell's own hydraulic analogue of the musical arc.
- Max Kohl AG (c. 1911): singing- and speaking-arc teaching apparatus in
  the firm's *Physical Apparatus* price list No. 50, reproduced in Wittje
  (2013), fig. 5. Commercial demonstration sets.
- [Speaking arc and singing arc](https://www.youtube.com/watch?v=cCEU3ShVE2E)
  (Fondazione Scienza e Tecnica, Florence, 2016): a microphone-modulated
  speaking arc, and an arc oscillator retuned with a variable capacitor.
- S. Klein (1956). "Electrical transducer." US Patent 2,768,246.
  [Google Patents](https://patents.google.com/patent/US2768246A). The
  Ionophone, an audio-modulated corona-discharge loudspeaker, later sold
  as the Ionovac.
- [Ionophone and Ionovac history](http://www.roger-russell.com/ionovac/ionovac.htm)
  (R. Russell, 1996–2004): Klein's Ionophone, the DuKane and Electro-Voice
  Ionovac, the Fane Ionofane and the Hill plasma loudspeaker.
- F. J. Fransson & E. V. Jansson (1975). "STL-Ionophone: transducer
  properties and construction." *J. Acoust. Soc. Am.* 58(4), 910–915.
  [doi:10.1121/1.380743](https://doi.org/10.1121/1.380743). A glow
  discharge in air with superimposed AC used as a laboratory sound
  source.
- A. E. Hill (1980). "Sound production using large volume plasmas." US
  Patent 4,219,705. [Google Patents](https://patents.google.com/patent/US4219705A).
- [CORONA plasma tweeter](https://www.lansche-audio.com/products/plasmatweeter/)
  (Lansche Audio): the music signal modulates a small high-voltage plasma.
- [Acapella Audio Arts](https://www.acapella.de/): loudspeaker maker
  whose ion tweeter drives the air with a modulated plasma.
- [ArcAttack](https://arcattack.com/): performance group playing music on
  modulated Tesla-coil discharges.

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
