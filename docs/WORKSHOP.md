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

## Harpsichord (`harpsichord`)

*After a Flemish Ruckers double-manual harpsichord (Antwerp, 1600s), as
later rebuilt with aligned manuals (ravalement).*

**Physics.**
- **Strings:** stiff, in modal form, with brass in the bass and iron above.
  Reuse the approach in `piano/src/physics.js`.
- **The pluck:** each key lifts a jack whose quill (a plectrum: an elastic
  cantilever of bird quill or Delrin) catches the string, bends, slides
  along it and slips off. Model it as a contact with friction between a
  cantilever tip and the string: the string is displaced until the
  plectrum's tip slides past. Release point, plectrum stiffness and pluck
  position set the spectrum. The comb filter from the pluck point is a
  defining sound.
- **On release:** the jack falls back. The tongue pivots against its
  spring, so the plectrum slips past the string without re-plucking (a
  faint brush). Then the damper lands, with an audible release thump.

**Playable effects.**
- Registration: 8′ and 4′ choirs (a second 8′ was often added in the
  rebuild), with the manuals coupled. An unaltered Ruckers double had
  uncoupled manuals a fourth apart, for transposing.
- The **buff (harp) stop:** leather pads pressed against the strings near
  the nut damp them, especially the upper partials, giving a short, dull,
  pizzicato-like tone. Grove lists "lute stop" as an erroneous English
  name for it (French *registre de luth*, German *Lautenzug*).
- The **lute (nasal) stop:** a row of jacks plucking very close to the
  nut, which is nasal. It is an English and German feature, not original
  to Ruckers.
- Plectrum material (quill versus Delrin) and voicing (stiffness).
- Velocity matters little: a few dB and a slightly brighter tone, plus a
  louder key knock (Penttinen 2006). Say so on the page, and let the
  release thump depend on how fast the key comes up.

**Views.**
- Slow motion of the jack, plectrum and string at the pluck.
- The comb-filter spectrum for the current pluck point.

**Tests.**
- Plucked-string Fourier amplitudes ∝ sin(nπx_p/L)/n² for an ideal pluck
  (the limit of an infinitely stiff, frictionless plectrum).
- Inharmonicity B against the string's diameter and tension.
- Energy given to the string equals the plectrum's work.
- Release displacement and timing depend on plectrum stiffness, shape
  and pluck point.

**Traps.** The slip is a discontinuity: solve the contact implicitly, as
the clavier's contacts do (`clavier/src/clavier-engine.js`).

**Prior art.**

*History and invention.*
- F. Hubbard (1965). *Three Centuries of Harpsichord Making*. Harvard
  University Press, Cambridge, Mass.
  [Harvard University Press](https://www.hup.harvard.edu/books/9780674888456).
- G. G. O'Brien (1990). *Ruckers: A Harpsichord and Virginal Building
  Tradition*. Cambridge University Press, Cambridge.
  [Cambridge University Press](https://www.cambridge.org/9780521066822).
- J. Lambrechts-Douillez & G. G. O'Brien (2001, rev. 2023). "Ruckers
  family." *Grove Music Online*.
  [doi:10.1093/gmo/9781561592630.article.24062](https://doi.org/10.1093/gmo/9781561592630.article.24062).
- E. M. Ripin, rev. J. Koster (2001). "Buff stop" and "Lute stop." *Grove
  Music Online*.
  [doi:10.1093/gmo/9781561592630.article.04266](https://doi.org/10.1093/gmo/9781561592630.article.04266);
  [doi:10.1093/gmo/9781561592630.article.17217](https://doi.org/10.1093/gmo/9781561592630.article.17217).
- E. L. Kottick (2003). *A History of the Harpsichord*. Indiana University
  Press, Bloomington.
  [Indiana University Press](https://iupress.org/9780253023476/a-history-of-the-harpsichord/).
- J. Koster (2019). "History and construction of the harpsichord." In
  M. Kroll (ed.), *The Cambridge Companion to the Harpsichord*, 2–30.
  Cambridge University Press.
  [doi:10.1017/9781316659359.003](https://doi.org/10.1017/9781316659359.003).

*Physics literature.*
- H. Fletcher (1964). "Normal vibration frequencies of a stiff piano
  string." *J. Acoust. Soc. Am.* 36(1), 203–209.
  [doi:10.1121/1.1918933](https://doi.org/10.1121/1.1918933).
- N. H. Fletcher (1977). "Analysis of the design and performance of
  harpsichords." *Acustica* 37(3), 139–147 (no DOI).
- W. R. Savage, E. L. Kottick, T. J. Hendrickson & K. D. Marshall (1992).
  "Air and structural modes of a harpsichord." *J. Acoust. Soc. Am.*
  91(4), 2180–2189. [doi:10.1121/1.403652](https://doi.org/10.1121/1.403652).
- D. H. Griffel (1994). "The dynamics of plucking." *J. Sound Vib.*
  175(3), 289–297. [doi:10.1006/jsvi.1994.1329](https://doi.org/10.1006/jsvi.1994.1329).
  A plectrum–string model of the harpsichord pluck.
- N. H. Fletcher & T. D. Rossing (1998). "Harps, harpsichords,
  clavichords, and dulcimers." In *The Physics of Musical Instruments*,
  2nd edn, 331–351. Springer, New York.
  [doi:10.1007/978-0-387-21603-4_11](https://doi.org/10.1007/978-0-387-21603-4_11).
- N. Giordano & J. P. Winans II (1999). "Plucked strings and the
  harpsichord." *J. Sound Vib.* 224(3), 455–473.
  [doi:10.1006/jsvi.1999.2187](https://doi.org/10.1006/jsvi.1999.2187).
- N. H. Fletcher & C. Beebe (2010). "Harpsichord and clavichord." In
  T. D. Rossing (ed.), *The Science of String Instruments*, 123–143.
  Springer, New York.
  [doi:10.1007/978-1-4419-7110-4_8](https://doi.org/10.1007/978-1-4419-7110-4_8).
- J. MacRitchie & G. Nuti (2015). "Using historical accounts of
  harpsichord touch to empirically investigate the production and
  perception of dynamics on the 1788 Taskin." *Front. Psychol.* 6, 183.
  [doi:10.3389/fpsyg.2015.00183](https://doi.org/10.3389/fpsyg.2015.00183).
- A. Paté, J.-L. Le Carrou, A. Givois & A. Roy (2017). "Influence of
  plectrum shape and jack velocity on the sound of the harpsichord: an
  experimental study." *J. Acoust. Soc. Am.* 141(3), 1523–1534.
  [doi:10.1121/1.4976955](https://doi.org/10.1121/1.4976955).
- A. Paté, A. Givois, S. Le Conte, J.-L. Le Carrou, M. Castellengo &
  S. Vaiedelich (2017). "Perception of harpsichord plectra voicing."
  *Acta Acust. united Acust.* 103(4), 685–704.
  [doi:10.3813/AAA.919097](https://doi.org/10.3813/AAA.919097).

*Earlier models and synthesis projects.*
- V. Välimäki, H. Penttinen, J. Knif, M. Laurson & C. Erkut (2004).
  "Sound synthesis of the harpsichord using a computationally efficient
  physical model." *EURASIP J. Appl. Signal Process.* 2004(7), 934–948.
  [doi:10.1155/S111086570440211X](https://doi.org/10.1155/S111086570440211X).
  Commuted digital-waveguide strings with a resonator for beating, a
  soundboard filter fitted to measured bridge responses, and a sampled
  key-release thump.
- H. Penttinen (2006). "On the dynamics of the harpsichord and its
  synthesis." *Proc. DAFx-06*, Montreal, 115–120.
  [PDF](https://dafx.de/paper-archive/2006/papers/p_115.pdf). Measured
  velocity dependence, added to the 2004 model with gain and timbre
  control and a filter for the soundboard knock.
- H. Penttinen (2006). *Loudness and Timbre Issues in Plucked Stringed
  Instruments: Analysis, Synthesis, and Design*. Doctoral thesis,
  Helsinki University of Technology.
  [urn:nbn:fi:tkk-007423](https://urn.fi/urn:nbn:fi:tkk-007423).
- C.-Y. J. Perng, J. O. Smith & T. D. Rossing (2010). "Physical modeling
  of the harpsichord plectrum-string interaction." *Proc. DAFx-10*, Graz.
  [PDF](https://dafx.de/paper-archive/2010/DAFx10/PerngSmithRossing_DAFx10_P93.pdf).
  The plectrum as a large-deflection beam acting on both string
  polarisations up to release (frictionless contact).
- C.-Y. J. Perng, J. O. Smith & T. D. Rossing (2011). "Harpsichord sound
  synthesis using a physical plectrum model interfaced with the digital
  waveguide." *Proc. DAFx-11*, Paris, 329–335.
  [PDF](https://dafx.de/paper-archive/2011/Papers/24_e.pdf). Adds the
  plectrum-tip geometry for the slip-off and drives a waveguide string.
- R. Michon & J. O. Smith (2011). "FAUST-STK: a set of linear and
  nonlinear physical models for the FAUST programming language." *Proc.
  DAFx-11*, Paris, 199–204.
  [PDF](https://dafx.de/paper-archive/2011/Papers/20_e.pdf). Includes a
  commuted-synthesis harpsichord ported from a SynthBuilder patch.
- L. Larisch, B. Lemke & G. Wittum (2020). "3d Modeling and simulation of
  a harpsichord." *Comput. Visual. Sci.* 23, 6.
  [doi:10.1007/s00791-020-00326-1](https://doi.org/10.1007/s00791-020-00326-1).
  Finite-element eigenmodes of the soundboard and the whole instrument,
  compared with measurements.
- M. Hamilton, R. Russo, C. Webb & M. Ducceschi (2025). "A two-register
  haptic interface for articulated control of harpsichord physical
  models." *Proc. Forum Acusticum / EuroNoise 2025*, 2851–2858.
  [doi:10.61782/fa.2025.0046](https://doi.org/10.61782/fa.2025.0046).
  A sensor-equipped harpsichord action driving a real-time nonlinear
  modal string model.
- R. Bader, N. Plath & P. Kontopidis (2025). "Sound impact of simple
  viscoelastic damping changes due to aging and the role of the double
  bentside on soundboard tension in a 1755 Dulcken harpsichord."
  arXiv:2511.09037. [doi:10.48550/arXiv.2511.09037](https://doi.org/10.48550/arXiv.2511.09037).
  Finite-difference soundboard model from measured thickness and damping.
- [Ruckers harpsichord](https://www.modartt.com/harpsichord) (Modartt,
  add-on for Pianoteq 5.6 or later): physical model of a copy of a 1624
  Ioannes Ruckers, with lower 8′, upper 8′ and 4′ registers, buff stop and
  a rattle pedal.
- [KIViR harpsichords](https://www.modartt.com/kivir) (Modartt, KIViR
  project): free physically modelled Pianoteq instruments after a 1697
  Carlo Grimaldi and a copy of a 1733 François Étienne Blanchet.
- [Karsten Collection](https://www.modartt.com/karsten) (Modartt, add-on
  for Pianoteq 6.7 or later): physically modelled historical keyboards,
  including a 1680 Giovanni Giusti harpsichord.

---

## Pipe Organ (`pipes`)

*After the Baroque pipe organ.*

**Physics.**
- **Flue pipes:** a planar air jet from the flue crosses the mouth and hits
  the labium (upper lip). The pipe's acoustic flow deflects the jet, and the
  jet drives the pipe. The jet-drive model (Cremer & Ising; Coltman;
  Fletcher; Verge et al.; reviewed by Fabre & Hirschberg) is a delayed
  nonlinear feedback loop:
  - jet transit delay τ ≈ W/c_p over the cut-up W, with measured
    phase velocity c_p ≈ 0.4 U_j (models use 0.4–0.5 U_j; it varies with
    frequency);
  - the jet's deflection grows along it, and the flow splits at the
    labium as a tanh (Bickley jet profile), whose time derivative drives
    the pipe;
  - vortex shedding at the labium, which limits the amplitude;
  - pipe resonator as modes or a waveguide.
- **The chiff:** while the jet is establishing itself, edge tones and upper
  modes sound first.
- **Overblowing:** too much wind pressure jumps the pipe to its octave (open
  pipes) or twelfth (stopped pipes).
- **Shared wind:** the wind chest and reservoir have finite volume and a
  regulator. Big chords make the pressure sag and the pitch drop slightly:
  "wind sag", which organists know as a living wind.

**Playable effects.**
- Stops: Principal 8′ and 4′, Gedackt 8′ (stopped), Mixture (several ranks
  at octaves and fifths).
- Wind pressure, mouth cut-up, and chiff (pressure-rise time, i.e. pallet
  speed, and cut-up; Nolle & Finch 1992).
- Wind-system stiffness from stable to "breathing".
- Optional tremulant (a valve modulating the wind).

**Views.**
- The jet waving in the mouth.
- Pressure and flow phase portrait.
- Wind-chest pressure over time.

**Tests.**
- Open versus stopped pipe mode ratios (1:2:3 versus 1:3:5) and end
  corrections: about 0.61 a at the open top (unflanged; Levine &
  Schwinger), while the mouth correction depends on cut-up, mouth width,
  ears and the mouth-to-bore area ratio (Ernoult & Fabre 2017).
- The jet-delay condition for speaking: Strouhal-number range.
- Overblowing: the jump to the next mode happens when U_j/(fW) crosses a
  critical value, so the threshold pressure scales roughly as (fW)², and
  the return jump comes at a lower pressure (hysteresis).
- Wind sag: the jet velocity follows U_j = √(2p/ρ), but the pitch, set
  mainly by the resonator, falls only slightly: far less than the ½Δp/p
  that f ∝ √p would give, and less for higher-Q pipes.

**Traps.** Jet models self-oscillate only in a window. Test speaking and
onset on every key at the default wind.

**Prior art.**

*History and invention.*
- Vitruvius (1914). *The Ten Books on Architecture*, trans. M. H. Morgan.
  Harvard University Press, Cambridge, Mass.
  [Project Gutenberg](https://www.gutenberg.org/ebooks/20239). Book IX
  ch. 8 credits Ctesibius with the first water organs; Book X ch. 8
  describes the water organ, its windchest, sliders and water-filled wind
  regulator.
- M. Praetorius (1619). *Syntagma musicum*, vol. II, *De Organographia*.
  Wolfenbüttel. [archive.org](https://archive.org/details/SyntagmaMusicumBd.21619).
- F. Bédos de Celles (1766–1778). *L'art du facteur d'orgues*, 4 parts.
  Académie royale des sciences, Paris.
  [IMSLP (BnF scans)](https://imslp.org/wiki/L'art_du_facteur_d'orgues_%28B%C3%A9dos_de_Celles_de_Salelles,_Fran%C3%A7ois_Lamathe%29).
- J. G. Töpfer (1855). *Lehrbuch der Orgelbaukunst*, vol. 1. Voigt,
  Weimar. [archive.org](https://archive.org/details/bub_gb_8FlDAAAAcAAJ).
  Includes the scaling (Mensur) of flue stops.
- P. Williams (1993). *The Organ in Western Culture, 750–1250*. Cambridge
  University Press. [archive.org](https://archive.org/details/organinwesterncu0000will).
- B. Owen (2001). "Tremulant." *Grove Music Online*.
  [doi:10.1093/gmo/9781561592630.article.49736](https://doi.org/10.1093/gmo/9781561592630.article.49736).

*Physics literature.*
- H. R. A. Mallock (1918). "Note on the effect of wind pressure on the
  pitch of organ pipes." *Proc. R. Soc. Lond. A* 95(666), 99–106.
  [doi:10.1098/rspa.1918.0051](https://doi.org/10.1098/rspa.1918.0051).
- H. Levine & J. Schwinger (1948). "On the radiation of sound from an
  unflanged circular pipe." *Phys. Rev.* 73(4), 383–406.
  [doi:10.1103/PhysRev.73.383](https://doi.org/10.1103/PhysRev.73.383).
- L. Cremer & H. Ising (1967). "Die selbsterregten Schwingungen von
  Orgelpfeifen." *Acustica* 19(3), 143–153 (no DOI).
- J. W. Coltman (1968). "Sounding mechanism of the flute and organ pipe."
  *J. Acoust. Soc. Am.* 44(4), 983–992.
  [doi:10.1121/1.1911240](https://doi.org/10.1121/1.1911240).
- N. H. Fletcher (1976). "Jet-drive mechanism in organ pipes." *J. Acoust.
  Soc. Am.* 60(2), 481–483.
  [doi:10.1121/1.381105](https://doi.org/10.1121/1.381105).
- J. W. Coltman (1976). "Jet drive mechanisms in edge tones and organ
  pipes." *J. Acoust. Soc. Am.* 60(3), 725–733.
  [doi:10.1121/1.381120](https://doi.org/10.1121/1.381120).
- N. H. Fletcher (1976). "Sound production by organ flue pipes."
  *J. Acoust. Soc. Am.* 60(4), 926–936.
  [doi:10.1121/1.381174](https://doi.org/10.1121/1.381174).
- N. H. Fletcher (1976). "Transients in the speech of organ flue pipes – a
  theoretical study." *Acustica* 34(4), 224–233 (no DOI).
- T. L. Finch & A. W. Nolle (1986). "Pressure wave reflections in an organ
  note channel." *J. Acoust. Soc. Am.* 79(5), 1584–1591.
  [doi:10.1121/1.393293](https://doi.org/10.1121/1.393293).
- A. W. Nolle & T. L. Finch (1992). "Starting transients of flue organ
  pipes in relation to pressure rise time." *J. Acoust. Soc. Am.* 91(4),
  2190–2202. [doi:10.1121/1.403653](https://doi.org/10.1121/1.403653).
- M. P. Verge, R. Caussé, B. Fabre, A. Hirschberg, A. P. J. Wijnands &
  A. van Steenbergen (1994). "Jet oscillations and jet drive in
  recorder-like instruments." *Acta Acustica* 2(5), 403–419 (no DOI).
- M. P. Verge, B. Fabre, A. Hirschberg & A. P. J. Wijnands (1997). "Sound
  production in recorderlike instruments. I. Dimensionless amplitude of
  the internal acoustic field." *J. Acoust. Soc. Am.* 101(5), 2914–2924.
  [doi:10.1121/1.418521](https://doi.org/10.1121/1.418521).
- N. H. Fletcher & T. D. Rossing (1998). *The Physics of Musical
  Instruments*, 2nd edn, ch. 16 "Flutes and flue organ pipes"
  (pp. 503–551) and ch. 17 "Pipe organs" (pp. 552–580). Springer, New
  York. [doi:10.1007/978-0-387-21603-4](https://doi.org/10.1007/978-0-387-21603-4).
- P. de la Cuadra, C. Vergez & B. Fabre (2007). "Visualization and
  analysis of jet oscillation under transverse acoustic perturbation."
  *J. Flow Vis. Image Process.* 14(4), 355–374.
  [doi:10.1615/JFlowVisImageProc.v14.i4.20](https://doi.org/10.1615/JFlowVisImageProc.v14.i4.20).
- R. Auvray, B. Fabre & P.-Y. Lagrée (2012). "Regime change and
  oscillation thresholds in recorder-like instruments." *J. Acoust. Soc.
  Am.* 131(2), 1574–1585.
  [doi:10.1121/1.3672815](https://doi.org/10.1121/1.3672815).
- B. Fabre, J. Gilbert, A. Hirschberg & X. Pelorson (2012). "Aeroacoustics
  of musical instruments." *Annu. Rev. Fluid Mech.* 44, 1–25.
  [doi:10.1146/annurev-fluid-120710-101031](https://doi.org/10.1146/annurev-fluid-120710-101031).
- A. Ernoult & B. Fabre (2017). "Window impedance of recorder-like
  instruments." *Acta Acust. united Acust.* 103(1), 106–116.
  [doi:10.3813/AAA.919037](https://doi.org/10.3813/AAA.919037).
- G. Villegas Curulla, A. Ernoult, B. Véron, B. Fabre & B. F. G. Katz
  (2026). "From bellows to pipe foot: experimental and lumped-parameter
  analysis of steady-state and transient pressure in a flue organ wind
  system." *Acta Acustica* 10, 90.
  [doi:10.1051/aacus/2026089](https://doi.org/10.1051/aacus/2026089).

*Earlier models and synthesis projects.*
- A. W. Nolle (1983). "Flue organ pipes: adjustments affecting steady
  waveform." *J. Acoust. Soc. Am.* 73(5), 1821–1832.
  [doi:10.1121/1.389405](https://doi.org/10.1121/1.389405). Compares
  pipes with an electrical oscillator analogue of the flue pipe.
- V. Välimäki, M. Karjalainen, Z. Jánosy & U. K. Laine (1992). "A
  real-time DSP implementation of a flute model." *Proc. IEEE ICASSP-92*
  2, 249–252. [doi:10.1109/ICASSP.1992.226073](https://doi.org/10.1109/ICASSP.1992.226073).
  Real-time digital-waveguide model of an air-jet instrument.
- [STK Flute class](https://ccrma.stanford.edu/software/stk/classstk_1_1Flute.html)
  (P. R. Cook & G. P. Scavone, Synthesis ToolKit): open-source
  digital-waveguide flute with a polynomial jet nonlinearity.
- M. P. Verge, A. Hirschberg & R. Caussé (1997). "Sound production in
  recorderlike instruments. II. A simulation model." *J. Acoust. Soc. Am.*
  101(5), 2925–2939. [doi:10.1121/1.419481](https://doi.org/10.1121/1.419481).
  Time-domain jet-drive simulation with vortex-shedding losses at the
  labium.
- B. Fabre & A. Hirschberg (2000). "Physical modeling of flue
  instruments: a review of lumped models." *Acta Acust. united Acust.*
  86(4), 599–610 (no DOI).
- C. Zinato (2008). "Method and electronic device used to synthesise the
  sound of church organ flue pipes by taking advantage of the physical
  modeling technique of acoustic instruments." US Patent 7,442,869 B2
  (Viscount International). [USPTO scan](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/7442869).
- M. Miyamoto et al. (2013). "Numerical study on acoustic oscillations of
  2D and 3D flue organ pipe like instruments with compressible LES."
  *Acta Acust. united Acust.* 99(1), 154–171.
  [doi:10.3813/AAA.918599](https://doi.org/10.3813/AAA.918599).
  Large-eddy simulation of the flue pipe (not real time).
- S. Terrien, C. Vergez & B. Fabre (2013). "Flute-like musical
  instruments: a toy model investigated through numerical continuation."
  *J. Sound Vib.* 332(15), 3833–3848.
  [doi:10.1016/j.jsv.2013.01.041](https://doi.org/10.1016/j.jsv.2013.01.041).
  Delay, tanh nonlinearity and modal resonator, the structure of this
  brief, analysed by numerical continuation.
- R. Auvray, A. Ernoult, B. Fabre & P.-Y. Lagrée (2014). "Time-domain
  simulation of flute-like instruments: comparison of jet-drive and
  discrete-vortex models." *J. Acoust. Soc. Am.* 136(1), 389–400.
  [doi:10.1121/1.4875716](https://doi.org/10.1121/1.4875716).
- L. Gabrielli, S. Tomassetti, S. Squartini, C. Zinato & S. Guaiana
  (2019). "A multi-stage algorithm for acoustic physical model parameters
  estimation." *IEEE/ACM Trans. Audio Speech Lang. Process.* 27(8),
  1229–1240. [doi:10.1109/TASLP.2019.2914530](https://doi.org/10.1109/TASLP.2019.2914530).
  Parameter estimation for a commercial flue-pipe model (jet delay,
  sigmoid nonlinearity, noise, waveguide bore).
- [Physis](https://www.viscountinstruments.com/about-us/technology/physis-tecnology/)
  (Viscount International): organs that Viscount says compute the physics
  of each pipe in real time, with a shared wind supply whose pressure
  varies with the stops drawn.
- [Organteq](https://www.modartt.com/organteq) (Modartt, 2019; Organteq 2,
  2023): pipe-organ synthesiser that Modartt describes as physically
  modelled and sample-free, covering flue and reed pipes.

---

## Carillon (`carillon`)

*After the Low Countries carillon (bells tuned by François and Pieter
Hemony with Jacob van Eyck, from 1644).*

**Physics.**
- **Bell modes:** an axisymmetric shell of a real bell profile, solved by FEM
  (axisymmetric shell elements, Fourier index m). It gives the named
  partials: hum, prime (fundamental), tierce (minor third), quint,
  nominal, and so on.
- **The strike note:** the perceived pitch comes from the nominal group
  (partials near 2:3:4 relative to it) and lies about an octave below the
  nominal. It is a virtual pitch that often has no partial at its
  frequency. In small bells (carillon trebles) the prime and hum dominate
  instead.
- **Asymmetry:** small departures from perfect symmetry split each (m ≥ 1)
  pair into doublets, which beat (warble). The named partials all have
  m ≥ 2.
- **The clapper:** Hertz contact with the soundbow, played by batons on a
  carillon console.

**Playable effects.**
- **Bell profile:** minor-third (traditional) versus major-third (Eijsbouts
  with Eindhoven University of Technology, 1980s; the profile was found by
  finite-element structural optimisation).
- Doublet split, clapper hardness, strike point.
- Tuning by the profile, versus "out of tune" historic bells.

**Views.**
- The bell profile with the shape of the mode under the cursor.
- The partial table with names and cents against ideal.
- A strike-note readout from a virtual-pitch estimator (Terhardt's
  algorithm, a harmonic sieve or subharmonic summation).

**Tests.**
- FEM convergence.
- Published partial ratios for a minor-third bell: hum 0.5, prime 1, tierce
  1.2, quint 1.5, nominal 2 (the ideal 5:10:12:15:20 that the Hemonys
  tuned towards; real bells deviate, so allow a tolerance).
- Doublet splitting ∝ the asymmetry.
- The virtual-pitch estimator finds the strike note on standard bells.

**Traps.** Shell FEM needs care with shear locking. Use a validated
element, or Rayleigh–Ritz with the profile as a thin shell. Carillon bells
are thick-walled, and their partials depart from thin-shell bending theory
(Lehr 1986), so check a thin-shell model against a thick-shell or 3D one.

**Prior art.**

*History and invention.*
- Lord Rayleigh (1890). "On bells." *Phil. Mag.* 29(176), 1–17.
  [doi:10.1080/14786449008619901](https://doi.org/10.1080/14786449008619901).
- A. B. Simpson (1895, 1896). "On bell tones" and "On bell tones No. II."
  *The Pall Mall Magazine* 7, 183–194, and 10, 150–155. Transcriptions by
  W. A. Hibbert: [1895](https://web.archive.org/web/20260508120415/https://www.hibberts.co.uk/simpsons-first-paper/),
  [1896](https://web.archive.org/web/20260508120205/https://www.hibberts.co.uk/simpsons-second-paper/).
  The case for tuning the partials of bells, behind "Simpson tuning".
- A. Lehr (1959). *De klokkengieters François en Pieter Hemony*.
  Eijsbouts, Asten. [Open Library](https://openlibrary.org/works/OL3397718W).
- A. Lehr (1965). "Hedendaagse Nederlandse klokkengietkunst." *Neth.
  Acoust. Soc. Publ.* 7, 20–49; in English as "Contemporary Dutch
  bell-founding art", in T. D. Rossing (ed.), *Acoustics of Bells* (1984).
  [Transcription](https://web.archive.org/web/20260508133347/https://www.hibberts.co.uk/lehrs-paper-on-the-theory-of-bell-tuning/).
  Includes the history of Hemony tuning.
- A. Lehr (1991). *The Art of the Carillon in the Low Countries*. Lannoo,
  Tielt. [Open Library](https://openlibrary.org/works/OL3397716W).
- H. Klotz & L. Rombouts (2001). "Hemony." *Grove Music Online*.
  [doi:10.1093/gmo/9781561592630.article.12772](https://doi.org/10.1093/gmo/9781561592630.article.12772).
- L. Rombouts (2014). *Singing Bronze: A History of Carillon Music*.
  Leuven University Press.
  [doi:10.2307/j.ctt15hvwrh](https://doi.org/10.2307/j.ctt15hvwrh).
- A. Schoofs, F. van Asperen, P. Maas & A. Lehr (1987). "I. Computation of
  bell profiles using structural optimization." *Music Perception* 4(3),
  245–254. [doi:10.2307/40285368](https://doi.org/10.2307/40285368).
  The major-third bell, designed at Eindhoven University of Technology
  with Eijsbouts.
- A. Lehr (1987). "III. From theory to practice." *Music Perception*
  4(3), 267–280. [doi:10.2307/40285370](https://doi.org/10.2307/40285370).

*Physics literature.*
- R. Perrin & T. Charnley (1973). "Group theory and the bell." *J. Sound
  Vib.* 31(4), 411–418.
  [doi:10.1016/S0022-460X(73)80257-3](https://doi.org/10.1016/S0022-460X%2873%2980257-3).
- R. Perrin (1977). "A group theoretical approach to warble in ornamented
  bells." *J. Sound Vib.* 52(3), 307–313.
  [doi:10.1016/0022-460X(77)90561-2](https://doi.org/10.1016/0022-460X%2877%2990561-2).
- T. Charnley & R. Perrin (1978). "Studies with an eccentric bell."
  *J. Sound Vib.* 58(4), 517–525.
  [doi:10.1016/0022-460X(78)90357-7](https://doi.org/10.1016/0022-460X%2878%2990357-7).
- E. Terhardt, G. Stoll & M. Seewann (1982). "Algorithm for extraction of
  pitch and pitch salience from complex tonal signals." *J. Acoust. Soc.
  Am.* 71(3), 679–688. [doi:10.1121/1.387544](https://doi.org/10.1121/1.387544).
- H. Duifhuis, L. F. Willems & R. J. Sluyter (1982). "Measurement of pitch
  in speech: an implementation of Goldstein's theory of pitch perception."
  *J. Acoust. Soc. Am.* 71(6), 1568–1580.
  [doi:10.1121/1.387811](https://doi.org/10.1121/1.387811). The harmonic
  sieve.
- R. Perrin, T. Charnley & J. dePont (1983). "Normal modes of the modern
  English church bell." *J. Sound Vib.* 90(1), 29–49.
  [doi:10.1016/0022-460X(83)90401-7](https://doi.org/10.1016/0022-460X%2883%2990401-7).
- E. Terhardt & M. Seewann (1984). "Auditive und objektive Bestimmung der
  Schlagtonhöhe von historischen Kirchenglocken." *Acustica* 54, 129–144.
  [English translation by W. A. Hibbert](https://web.archive.org/web/20260508105251/https://www.hibberts.co.uk/terhardt-and-seewan-1984/).
- A. Lehr (1986). "Partial groups in the bell sound." *J. Acoust. Soc.
  Am.* 79(6), 2000–2011. [doi:10.1121/1.393208](https://doi.org/10.1121/1.393208).
- T. D. Rossing & R. Perrin (1987). "Vibrations of bells." *Applied
  Acoustics* 20(1), 41–70.
  [doi:10.1016/0003-682X(87)90082-X](https://doi.org/10.1016/0003-682X%2887%2990082-X).
- D. J. Hermes (1988). "Measurement of pitch by subharmonic summation."
  *J. Acoust. Soc. Am.* 83(1), 257–264.
  [doi:10.1121/1.396427](https://doi.org/10.1121/1.396427).
- P. J. M. Roozen-Kroon (1992). *Structural Optimization of Bells*. PhD
  thesis, Eindhoven University of Technology.
  [doi:10.6100/IR373470](https://doi.org/10.6100/IR373470).
- N. H. Fletcher & T. D. Rossing (1998). "Bells." In *The Physics of
  Musical Instruments*, 2nd edn, 675–707. Springer, New York.
  [doi:10.1007/978-0-387-21603-4_21](https://doi.org/10.1007/978-0-387-21603-4_21).
- T. D. Rossing (2000). *Science of Percussion Instruments*. World
  Scientific. [doi:10.1142/4294](https://doi.org/10.1142/4294). Chapter
  "Church bells and carillons", 128–145:
  [doi:10.1142/9789812709288_0011](https://doi.org/10.1142/9789812709288_0011).
- N. H. Fletcher, W. T. McGee & A. Z. Tarnopolsky (2002). "Bell clapper
  impact dynamics and the voicing of a carillon." *J. Acoust. Soc. Am.*
  111(3), 1437–1444. [doi:10.1121/1.1448517](https://doi.org/10.1121/1.1448517).
- N. McLachlan, B. Keramati Nigjeh & A. Hasell (2003). "The design of
  bells with harmonic overtones." *J. Acoust. Soc. Am.* 114(1), 505–511.
  [doi:10.1121/1.1575748](https://doi.org/10.1121/1.1575748).
- W. A. Hibbert (2008). *The Quantification of Strike Pitch and Pitch
  Shifts in Church Bells*. PhD thesis, The Open University.
  [Thesis page](https://web.archive.org/web/20260422143744/https://www.hibberts.co.uk/phd-thesis/).
- W. A. Hibbert, S. Taherzadeh & D. B. Sharp (2017). "Virtual pitch and
  pitch shifts in church bells." *Open J. Acoust.* 7(3), 52–68.
  [doi:10.4236/oja.2017.73006](https://doi.org/10.4236/oja.2017.73006).

*Earlier models and synthesis projects.*
- A. J. M. Houtsma & H. J. G. M. Tholen (1987). "II. A perceptual
  evaluation." *Music Perception* 4(3), 255–266.
  [doi:10.2307/40285369](https://doi.org/10.2307/40285369). Listening
  tests on computer-synthesised carillons of major-third, minor-third and
  "neutral-third" bells.
- M. Karjalainen, V. Välimäki & P. A. A. Esquef (2002). "Efficient
  modeling and synthesis of bell-like sounds." *Proc. DAFx-02*, Hamburg,
  181–186. [PDF](https://www.dafx.de/paper-archive/2002/DAFX02_Karjalainen_Valimaki_Esquef_bell-like_sounds.pdf).
  Source–filter and inharmonic digital-waveguide models, with parallel
  resonators for beating doublets, fitted to a handbell.
- E. K. Canfield-Dafilou & K. J. Werner (2017). "Modal audio effects: a
  carillon case study." *Proc. DAFx-17*, Edinburgh, 247–254.
  [PDF](https://www.dafx.de/paper-archive/2017/papers/DAFx17_paper_22.pdf).
  Modal analysis and resynthesis of recordings of the 60 bells of the
  Lurie Carillon (University of Michigan).
- R. Michon, S. R. Martin & J. O. Smith (2017). "MESH2FAUST: a modal
  physical model generator for the Faust programming language –
  application to bell modeling." *Proc. ICMC 2017*, Shanghai.
  [hal-03162901](https://hal.science/hal-03162901v1). Turns a
  finite-element modal analysis of a 3D mesh into a Faust modal model;
  demonstrated on bells.
- [Faust physmodels.lib bell models](https://faustlibraries.grame.fr/libs/physmodels/)
  (GRAME Faust libraries, 2017): modal church, English, French, German
  and Russian bell models generated with Mesh2Faust, with strike position
  and sharpness controls.
- M. Rau, O. Das & E. K. Canfield-Dafilou (2019). "Improved carillon
  synthesis." *Proc. DAFx-19*, Birmingham.
  [PDF](https://www.dafx.de/paper-archive/2019/DAFx2019_paper_34.pdf).
  Modal model of a Hoover Tower (Stanford) carillon bell with resolved
  doublets, a clapper excitation fitted to accelerometer data, and modal
  belfry reverberation.
- M. Carvalho, V. Debut & J. Antunes (2021). "Physical modelling
  techniques for the dynamical characterization and sound synthesis of
  historical bells." *Heritage Science* 9, 157.
  [doi:10.1186/s40494-021-00620-2](https://doi.org/10.1186/s40494-021-00620-2).
  3D scans, finite-element modal models checked against measured modes,
  and time-domain synthesis for chosen clapper and impact point; includes
  two 18th-century Mafra carillon bells.
- [Pianoteq "Church bells and carillons"](https://www.modartt.com/pianoteq_free)
  (Modartt, by 2011): free add-on for the physically modelled Pianoteq
  engine, based on bells recorded at the European Bell Institute; the
  companion Tubular Bells add-on (2011) offers partials retuned to major
  and minor patterns.
- [Chromaphone 3](https://www.applied-acoustics.com/chromaphone-3/)
  (Applied Acoustics Systems, 2020; first version 2011): synthesiser of
  coupled modelled resonators (strings, plates, membranes, beams, bars,
  tubes), with bells and chimes among its presets.

---

## Vibraphone (`vibraphone`)

*After the Deagan vibraharp (1927), which followed the Leedy vibraphone of
the early 1920s.*

**Physics.**
- **Bars:** aluminium bars undercut so modes 1, 2 and 3 sit at 1 : 4 : 10.
  Optimise the undercut shape with an Euler–Bernoulli or Timoshenko FEM.
- **Resonators:** a closed quarter-wave tube under each bar, coupled to the
  bar through the air gap (a two-oscillator model: bar mode plus tube
  mode). Energy can beat between bar and tube when they are closely
  tuned. The tube makes the fundamental louder and, by drawing energy from
  the bar faster, shortens its decay.
- **The motor:** rotating butterfly discs at the tube mouths periodically
  open and close the coupling. That is the vibraphone tremolo, with both
  amplitude and a little frequency modulation, and a phase that differs bar
  to bar along the shaft.
- **Damper pedal:** a felt bar.
- **Celesta variant (optional):** steel plates over tuned wooden
  resonators, struck by felt hammers through a simplified piano-type
  action, with a damper pedal.

**Playable effects.**
- Motor speed (and off).
- Disc phase.
- Mallet hardness.
- Undercut voicing (pure 1:4:10 versus a plain bar's 1 : 2.76 : 5.40).
- Damper pedal.

**Views.**
- The bar's mode shapes and undercut profile.
- The tube's standing wave.
- Disc angle against coupling.

**Tests.**
- A plain bar reproduces free–free beam ratios (the template already
  does).
- The undercut optimiser reaches 1 : 4 : 10 within 1 ¢.
- Coupled bar–tube mode splitting matches the two-oscillator formula.
- The tremolo rate equals twice the shaft's revolutions per second (each
  disc covers its tube mouth twice per turn).

**Prior art.**

*History and invention.*
- J. C. Deagan (1919). "Xylophone." US Patent 1,293,723 (filed 1917).
  [Google Patents](https://patents.google.com/patent/US1293723A).
  Shutters over the resonator mouths, closed further as the temperature
  rises, to keep the tubes in tune.
- H. E. Winterhoff (1927). "Musical bar." US Patent 1,632,751 (filed
  1923, assigned to Leedy Manufacturing Co.).
  [Google Patents](https://patents.google.com/patent/US1632751A). Undercut
  bars with the first overtone tuned to an octave relation.
- M. L. Jones (1930). "Musical instrument." US Patent 1,760,141 (filed
  1928, assigned to J. C. Deagan Inc.).
  [Google Patents](https://patents.google.com/patent/US1760141A).
  Pedal-released damper for metal-bar instruments with fan blades turning
  in the resonators.
- H. J. Schluter (1931). "Vibrant bar for musical instruments." US Patent
  1,838,502 (filed 1930, assigned to J. C. Deagan Inc.).
  [Google Patents](https://patents.google.com/patent/US1838502A). Bars
  thinned so the overtones fall in harmonic relation.
- W. D. Gladstone (1932). "Percussion musical instrument." US Patent
  1,843,553 (filed 1930).
  [Google Patents](https://patents.google.com/patent/US1843553A). A
  revolving fan ("pulsator") in each resonator.
- H. A. Bower (1933). "Control mechanism for vibra harps." US Patent
  1,902,614 (filed 1931).
  [Google Patents](https://patents.google.com/patent/US1902614A).
  Player-controlled motor speed for the tremolo.
- J. Blades & T. Brett (2014). "Vibraphone [vibraharp] (USA)." *Grove
  Music Online*.
  [doi:10.1093/gmo/9781561592630.article.A2258609](https://doi.org/10.1093/gmo/9781561592630.article.A2258609).
- J. Holland, J. Blades & A. B. Acker (2018). "Celesta." *Grove Music
  Online*.
  [doi:10.1093/omo/9781561592630.013.3000000242](https://doi.org/10.1093/omo/9781561592630.013.3000000242).

*Physics literature.*
- F. Orduña-Bustamante (1991). "Nonuniform beams with harmonically
  related overtones for use in percussion instruments." *J. Acoust. Soc.
  Am.* 90(6), 2935–2941.
  [doi:10.1121/1.401768](https://doi.org/10.1121/1.401768). Erratum:
  91(6), 3582–3583 (1992),
  [doi:10.1121/1.403816](https://doi.org/10.1121/1.403816).
- I. Bork (1995). "Practical tuning of xylophone bars and resonators."
  *Applied Acoustics* 46(1), 103–127.
  [doi:10.1016/0003-682X(95)93953-F](https://doi.org/10.1016/0003-682X%2895%2993953-F).
- J. Petrolito & K. A. Legge (1997). "Optimal undercuts for the tuning of
  percussive beams." *J. Acoust. Soc. Am.* 102(4), 2432–2437.
  [doi:10.1121/1.419625](https://doi.org/10.1121/1.419625).
- N. H. Fletcher & T. D. Rossing (1998). "Mallet percussion
  instruments." In *The Physics of Musical Instruments*, 2nd edn,
  623–648. Springer, New York.
  [doi:10.1007/978-0-387-21603-4_19](https://doi.org/10.1007/978-0-387-21603-4_19).
- I. Bork, A. Chaigne, L.-C. Trebuchet, M. Kosfelder & D. Pillot (1999).
  "Comparison between modal analysis and finite element modelling of a
  marimba bar." *Acta Acust. united Acust.* 85, 258–266 (no DOI).
- T. D. Rossing (2000). *Science of Percussion Instruments*. World
  Scientific, Singapore. [doi:10.1142/4294](https://doi.org/10.1142/4294).
  Chapter 7, "Metallophones", 64–78:
  [doi:10.1142/9789812709288_0007](https://doi.org/10.1142/9789812709288_0007).
- T. D. Rossing (2001). "Acoustics of percussion instruments: recent
  progress." *Acoust. Sci. Technol.* 22(3), 177–188.
  [doi:10.1250/ast.22.177](https://doi.org/10.1250/ast.22.177).
- F. Soares, J. Antunes & V. Debut (2021). "Multi-modal tuning of
  vibrating bars with simplified undercuts using an evolutionary
  optimization algorithm." *Applied Acoustics* 173, 107704.
  [doi:10.1016/j.apacoust.2020.107704](https://doi.org/10.1016/j.apacoust.2020.107704).
- F. Soares, J. Antunes & V. Debut (2021). "Tuning of bending and
  torsional modes of bars used in mallet percussion instruments."
  *J. Acoust. Soc. Am.* 150(4), 2757–2769.
  [doi:10.1121/10.0006573](https://doi.org/10.1121/10.0006573).
- D. Beaton & G. Scavone (2021). "Three-dimensional tuning of idiophone
  bar modes via finite element analysis." *J. Acoust. Soc. Am.* 149(6),
  3758–3768. [doi:10.1121/10.0005062](https://doi.org/10.1121/10.0005062).
- D. Beaton & G. Scavone (2022). "Experimental measurements of a
  prototype vibraphone bar with three-dimensional cutaway geometry."
  *JASA Express Lett.* 2(8), 083201.
  [doi:10.1121/10.0013470](https://doi.org/10.1121/10.0013470).

*Earlier models and synthesis projects.*
- V. Doutaut & A. Chaigne (1994). "Numerical simulations of bar
  percussion instruments." *J. Phys. IV* 4(C5), C5-613–C5-616.
  [doi:10.1051/jp4:19945131](https://doi.org/10.1051/jp4:19945131).
- A. Chaigne & V. Doutaut (1997). "Numerical simulations of xylophones.
  I. Time-domain modeling of the vibrating bars." *J. Acoust. Soc. Am.*
  101(1), 539–557. [doi:10.1121/1.418117](https://doi.org/10.1121/1.418117).
  Finite-difference model of a non-uniform damped bar struck by a mallet
  with Hertzian contact.
- V. Doutaut, D. Matignon & A. Chaigne (1998). "Numerical simulations of
  xylophones. II. Time-domain modeling of the resonator and of the
  radiated sound pressure." *J. Acoust. Soc. Am.* 104(3), 1633–1647.
  [doi:10.1121/1.424376](https://doi.org/10.1121/1.424376). Adds the
  coupled tubular resonator and radiation; applied to xylophone, marimba
  and vibraphone.
- G. Essl & P. R. Cook (1999). "Banded waveguides: towards physical
  modeling of bowed bar percussion instruments." *Proc. ICMC 1999*.
  [hdl:2027/spo.bbp2372.1999.408](https://hdl.handle.net/2027/spo.bbp2372.1999.408).
- G. Essl & P. R. Cook (2000). "Measurements and efficient simulations of
  bowed bars." *J. Acoust. Soc. Am.* 108(1), 379–388.
  [doi:10.1121/1.429471](https://doi.org/10.1121/1.429471).
- L. Henrique & J. Antunes (2003). "Optimal design and physical modelling
  of mallet percussion instruments." *Acta Acust. united Acust.* 89,
  948–963 (no DOI). [Author preprint](http://projects.itn.pt/Mafra/File4.pdf).
  Finite-element optimisation of vibraphone and marimba bar profiles
  (e.g. 1:4:10), then modal synthesis of mallet impacts.
- G. Essl, S. Serafin, P. R. Cook & J. O. Smith (2004). "Theory of banded
  waveguides." *Computer Music J.* 28(1), 37–50.
  [doi:10.1162/014892604322970634](https://doi.org/10.1162/014892604322970634).
- P. Rucz, M. Á. Ulveczki, J. Angster & A. Miklós (2021). "Simulation of
  mallet percussion instruments by a coupled modal vibroacoustic finite
  element model." *J. Acoust. Soc. Am.* 149(5), 3200–3212.
  [doi:10.1121/10.0004216](https://doi.org/10.1121/10.0004216). Coupled
  3D bar, resonator and radiation model with nonlinear mallet contact.
- F. Soares, J. Antunes & V. Debut (2022). "A minimal model of the
  bar-resonator vibroacoustic interaction in mallet percussion
  instruments." *Applied Acoustics* 199, 109049.
  [doi:10.1016/j.apacoust.2022.109049](https://doi.org/10.1016/j.apacoust.2022.109049).
  The bar's fundamental as an oscillator coupled to the tube: the
  two-oscillator model of this brief.
- F. Soares, V. Debut & J. Antunes (2023). "The bar-resonator interaction
  in mallet percussion instruments: a multi-modal model and experimental
  validation." *J. Sound Vib.* 548, 117528.
  [doi:10.1016/j.jsv.2022.117528](https://doi.org/10.1016/j.jsv.2022.117528).
- [STK ModalBar](https://ccrma.stanford.edu/software/stk/classstk_1_1ModalBar.html)
  (P. R. Cook & G. P. Scavone, Synthesis ToolKit): modal struck bar with
  marimba and vibraphone presets and vibrato controls.
- [Csound `vibes` opcode](https://csound.com/docs/manual/vibes.html)
  (J. ffitch after P. R. Cook): struck metal bar as in a vibraphone, with
  tremolo frequency and amplitude inputs.
- [Faust physmodels.lib `marimbaModel`](https://faustlibraries.grame.fr/libs/physmodels/)
  (GRAME Faust libraries): modal bar generated with Mesh2Faust from a 3D
  model, coupled to a resonance tube.
- [Pianoteq Vibes](https://www.modartt.com/vibes) (Modartt, 2009):
  physically modelled vibraphones with adjustable tremolo and mallet
  hardness.
- [Pianoteq Celeste](https://www.modartt.com/celeste) (Modartt, 2010):
  physically modelled celesta and glockenspiel.
- [Pianoteq Xylo](https://www.modartt.com/xylo) (Modartt, 2010):
  physically modelled xylophone and bass marimba.
- [Chromaphone 3](https://www.applied-acoustics.com/chromaphone-3/)
  (Applied Acoustics Systems, 2020; first version 2011): pairs of coupled
  modelled resonators, including beam, marimba and tube types, excited by
  a mallet.
- [Collision](https://www.ableton.com/en/packs/collision/) (Ableton with
  Applied Acoustics Systems, 2009): physically modelled mallet and
  resonators for Ableton Live.

---

## Free-Reed Organ (`harmonium`)

*After the harmonium and the accordion.*

**Physics.**
- **The reed:** a brass (harmonium) or steel (accordion) reed, a
  cantilever, swings through a close-fitting slot. Air from the bellows
  flows through the gap, and the flow and pressure difference drive the
  reed: a self-excited valve. In Fletcher's (1993) classification the
  harmonium and accordion reed acts as a blown-closed (inward-striking)
  valve (Ricot, Caussé & Misdariis 2005). Pipe-coupled Asian free reeds
  (sho, sheng, khaen) act as blown-open valves.
- **What sets the pitch:** the reed alone, with slight pressure dependence.
  This is unlike the clarinet, where the pipe controls the pitch.
- The slot-gap function (overlap area against displacement) sets the
  timbre. The bellows reservoir has finite volume.
- `huygens/experiments/reed-pipe-engine.js` has a starting point: a reed
  coupled to a pipe.

**Playable effects.**
- **Musette:** two or three reeds per key tuned ±5–20 ¢ apart, which beat.
- Bellows pressure as live expression, on the mod wheel or aftertouch, with
  pitch falling slightly (roughly linearly) as pressure rises over the
  normal playing range (Cottingham, Reed & Busha 1999).
- **Expression stop:** the harmonium's direct bellows connection.
- Reed-chamber filtering, which mainly changes the timbre and lowers the
  pitch slightly; in accordions the cassotto tone chamber further softens
  the upper harmonics.

**Views.**
- Reed motion in the slot.
- Flow against displacement.
- The beating between the musette reeds.

**Tests.**
- The threshold blowing pressure for oscillation.
- Frequency against pressure (a slight, roughly linear fall over the
  playing range).
- Each pair's beat rate equals its frequency difference.
- Onset time against pressure.

**Prior art.**

*History and invention.*
- J. J. Ohala (2011). "Christian Gottlieb Kratzenstein: pioneer in speech
  synthesis." *Proc. 17th Int. Congress of Phonetic Sciences (ICPhS
  XVII)*, Hong Kong, 156–159.
  [PDF](https://www.internationalphoneticassociation.org/icphs-proceedings/ICPhS2011/OnlineProceedings/SpecialSession/Session7/Ohala/Ohala.pdf).
  Kratzenstein's free-reed vowel resonators, his answer to the St
  Petersburg Academy's 1780 prize question (published 1781).
- G.-J. Grenié (1810). French patent, "Jeu d'orgue rendu expressif par le
  moyen d'un plus ou moins grand volume d'air comprimé dans le sommier",
  granted 23 June 1810. [INPI, dossier 1BA557](https://bases-brevets19e.inpi.fr/brevets?detail=428067).
  The *orgue expressif*: free reeds whose loudness follows the wind
  pressure.
- C. Demian, C. Demian & G. Demian (1829). Austrian privilege for the
  "Accordion", Vienna, description dated 6 May 1829 (Priv. Reg. No. 1757,
  23 May 1829). [English summary translation, The Classical Free-Reed,
  Inc. (archived)](https://web.archive.org/web/20090619162610/http://www.ksanti.net/free-reed/history/demian.html).
- C. Wheatstone (1829, 1844). British Patents No. 5803 of 1829,
  "Improvements in the construction of wind musical instruments", and
  No. 10041 of 1844, "Improvements in the action of the concertina, &c.
  by vibrating springs". [Scans, Concertina Library](http://www.concertina.com/patents/index.htm).
- L.-P.-A. Martin (1841). French patent, "Instantanéité du son donné à
  l'anche libre et expression graduée du son de l'anche libre, obtenue à
  l'aide d'un système de soupapes", granted 10 September 1841.
  [INPI, dossier 1BA9346](https://bases-brevets19e.inpi.fr/brevets?detail=440649).
  Percussion action for prompt speech of the reeds.
- A.-F. Debain (1842). French patent, "Changements et perfectionnements
  apportés à la fabrication des orgues à anches libres et à cylindres",
  granted 30 September 1842, with additions to 1844 that name the
  harmonium. [INPI, dossier 1BA9306](https://bases-brevets19e.inpi.fr/brevets?detail=441473).
  Often dated 1840; INPI holds no Debain free-reed patent of that year.
- B. Owen (2001). "Reed organ." *Grove Music Online*.
  [doi:10.1093/gmo/9781561592630.article.43321](https://doi.org/10.1093/gmo/9781561592630.article.43321).
- H. S. Harrington & G. Kubik (2001). "Accordion." *Grove Music Online*.
  [doi:10.1093/gmo/9781561592630.article.46180](https://doi.org/10.1093/gmo/9781561592630.article.46180).

*Physics literature.*
- A. O. St Hilaire, T. A. Wilson & G. S. Beavers (1971). "Aerodynamic
  excitation of the harmonium reed." *J. Fluid Mech.* 49(4), 803–816.
  [doi:10.1017/S0022112071002374](https://doi.org/10.1017/S0022112071002374).
- A. O. St Hilaire & P. G. Vaidya (1975). "Finite amplitude analysis of a
  flow-structure interaction problem." *J. Fluid Mech.* 67(2), 377–396.
  [doi:10.1017/S0022112075000365](https://doi.org/10.1017/S0022112075000365).
- N. H. Fletcher (1993). "Autonomous vibration of simple
  pressure-controlled valves in gas flows." *J. Acoust. Soc. Am.* 93(4),
  2172–2180. [doi:10.1121/1.406857](https://doi.org/10.1121/1.406857).
- H. T. Bahnson, J. F. Antaki & Q. C. Beery (1998). "Acoustical and
  physical dynamics of the diatonic harmonica." *J. Acoust. Soc. Am.*
  103(4), 2134–2144. [doi:10.1121/1.421359](https://doi.org/10.1121/1.421359).
- J. P. Cottingham, C. H. Reed & M. Busha (1999). "Variation of frequency
  with blowing pressure for an air-driven free reed." *J. Acoust. Soc.
  Am.* 105(2), 1001 (abstract).
  [doi:10.1121/1.425800](https://doi.org/10.1121/1.425800).
- A. Z. Tarnopolsky, N. H. Fletcher & J. C. S. Lai (2000). "Oscillating
  reed valves — an experimental study." *J. Acoust. Soc. Am.* 108(1),
  400–406. [doi:10.1121/1.429473](https://doi.org/10.1121/1.429473).
- D. Ricot, R. Caussé & N. Misdariis (2005). "Aerodynamic excitation and
  sound production of blown-closed free reeds without acoustic coupling:
  the example of the accordion reed." *J. Acoust. Soc. Am.* 117(4),
  2279–2290. [doi:10.1121/1.1852546](https://doi.org/10.1121/1.1852546).
- L. Millot & C. Baumann (2007). "A proposal for a minimal model of free
  reeds." *Acta Acust. united Acust.* 93, 122–144.
  [HAL hal-04369449](https://hal.science/hal-04369449).
- J. Cottingham (2011). "Acoustics of free-reed instruments." *Physics
  Today* 64(3), 44–48. [doi:10.1063/1.3563819](https://doi.org/10.1063/1.3563819).
- J. Biernat & J. Cottingham (2014). "Attack transients in free reed
  instruments." *Proc. Meetings on Acoustics*, 035002.
  [doi:10.1121/1.4891627](https://doi.org/10.1121/1.4891627).

*Earlier models and synthesis projects.*
- R. Caussé, N. Misdariis & D. Ricot (1999). "Studies of accordion reed
  vibrations — applications in sound synthesis." *J. Acoust. Soc. Am.*
  106(4), 2287 (abstract).
  [doi:10.1121/1.427818](https://doi.org/10.1121/1.427818). IRCAM
  measurements towards a simple physical reed model for synthesis,
  programmable in Modalys.
- T. Hikichi, N. Osaka & F. Itakura (2003). "Time-domain simulation of
  sound production of the sho." *J. Acoust. Soc. Am.* 113(2), 1092–1101.
  [doi:10.1121/1.1534605](https://doi.org/10.1121/1.1534605).
  Time-domain model of a pipe-coupled free reed, checked against measured
  threshold pressure and frequency.
- T. Hikichi, N. Osaka & F. Itakura (2004). "Sho-So-In: control of a
  physical model of the sho by means of automatic feature extraction from
  real sounds." *J. New Music Res.* 33(4), 355–365.
  [doi:10.1080/0929821052000343831](https://doi.org/10.1080/0929821052000343831).
- L. Millot (2011). "Chromatical playing on diatonic harmonica: from
  physical modeling to sound synthesis." *J. Acoust. Soc. Am.* 130(4),
  2342 (abstract). [doi:10.1121/1.3654370](https://doi.org/10.1121/1.3654370).
  Two-reed harmonica channel with a nonlinear airflow model coupled to a
  time-varying vocal tract.
- N. V. Puranik & G. P. Scavone (2022). "Physical modelling synthesis of a
  harmonium." *Proc. Meetings on Acoustics* 49, 035015.
  [doi:10.1121/2.0001679](https://doi.org/10.1121/2.0001679). Adapted
  Millot–Baumann reed model driven by bellows pressure, followed by an
  enclosure filter estimated from recordings.
- N. Puranik & G. Scavone (2023). "Clamped bar model for free reeds."
  *Proc. Forum Acusticum 2023*, Turin, 1809–1815.
  [doi:10.61782/fa.2023.0853](https://doi.org/10.61782/fa.2023.0853).
  Distributed (clamped-bar) reed model with a time-domain scheme for reed
  motion and airflow.
- N. Puranik & G. Scavone (2023). "Physically inspired signal model for
  harmonium sound synthesis." *Proc. DAFx23*, Copenhagen.
  [DAFx archive](https://dafx.de/paper-archive/details/YpJGemANSDbyjvvVLMb4rg).
  Real-time Pure Data simplification of their physical model.
- [Roland V-Accordion FR-8x](https://www.roland.com/global/products/fr-8x/)
  (Roland): Roland describes its engine as "Advanced Physical Behavior
  Modeling" of bellows and individual reeds, with cassotto and musette
  simulation; it does not say whether the reed tones are sampled.

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

## Star Keyboard (`stars`)

*A companion to the black hole.*

**Physics.**
- **Oscillations:** solar-like stars oscillate in p-modes that are
  stochastically excited and damped by near-surface convection. They are
  never struck: each mode is a damped oscillator driven by noise, so
  notes breathe.
- **Frequencies:** asymptotic relation ν_{n,l} ≈ Δν (n + l/2 + ε) − δν_{0l}.
  The large separation Δν ∝ √(mean density), and ν_max ∝ g/√T_eff.
- **Visibility:** l = 0, 1, 2 (and, weakly, 3). The visibility of each
  degree is set by limb darkening and the passband; the inclination sets
  the relative heights of the m components within each multiplet, which
  sum to one (Gizon & Solanki 2003).
- **Rotation:** splitting into m-multiplets.
- **Red giants:** mixed modes (p–g coupling) with period spacing ΔΠ.
- **Keys:** each key is a star whose ν_max (∝ g/√T_eff), after the fixed
  speed-up, lands on the note; its Δν then follows from its mean density.
  Mapping real μHz to audio is a fixed speed-up factor; state it
  (Kosovichev's solar sounds used 42,000).

**Playable effects.**
- Star type: main-sequence Sun-like star, subgiant, red giant (mixed
  modes), δ Scuti (driven by the κ-mechanism: coherent, not stochastic).
- Rotation rate.
- Inclination.
- Convective driving (mode heights) and damping (linewidths, Γ = η/π).
- Pressing a key rather than holding: a "flare" kick (a modelling
  choice, after Wolff 1972).

**Views.**
- The échelle diagram (frequency mod Δν against frequency), live.
- The power spectrum with the Gaussian ν_max envelope.
- A sphere showing the (l, m) pattern.

**Tests.**
- The solar Δν = 135.1 μHz and ν_max ≈ 3090 μHz from the scaling relations
  for solar parameters. These are the normalisation (Huber et al. 2011),
  so also check that Δν scales as √(mean density) when M and R vary.
- Stochastic driving: a Lorentzian line with the set linewidth.
- Rotational splitting ∝ Ω(1 − C_nl).
- Échelle ridges are vertical for a first-order, pure p-mode spectrum.

**Traps.** Notes don't decay while held, so give release a physical
meaning: switching off convective driving lets the modes ring down at their
linewidths.

**Prior art.**

*History and invention.*
- R. B. Leighton, R. W. Noyes & G. W. Simon (1962). "Velocity fields in
  the solar atmosphere. I. Preliminary report." *ApJ* 135, 474–499.
  [doi:10.1086/147285](https://doi.org/10.1086/147285). Discovery of the
  five-minute oscillations (period about 296 s).
- R. K. Ulrich (1970). "The five-minute oscillations on the solar
  surface." *ApJ* 162, 993–1002.
  [doi:10.1086/150731](https://doi.org/10.1086/150731). Standing acoustic
  waves trapped below the photosphere, on discrete ridges in the
  wavenumber–frequency diagram.
- J. W. Leibacher & R. F. Stein (1971). "A new description of the solar
  five-minute oscillation." *Astrophys. Lett.* 7, 191–192.
  [ADS](https://ui.adsabs.harvard.edu/abs/1971ApL.....7..191L/abstract).
  Independently, the same interpretation as trapped acoustic modes.
- F.-L. Deubner (1975). "Observations of low wavenumber nonradial
  eigenmodes of the Sun." *A&A* 44, 371–375.
  [ADS](https://ui.adsabs.harvard.edu/abs/1975A%26A....44..371D/abstract).
  The predicted ridges, resolved.
- A. Claverie, G. R. Isaak, C. P. McLeod, H. B. van der Raay & T. Roca
  Cortes (1979). "Solar structure from global studies of the 5-minute
  oscillation." *Nature* 282, 591–594.
  [doi:10.1038/282591a0](https://doi.org/10.1038/282591a0). Equally
  spaced low-degree global modes in integrated sunlight.
- G. Grec, E. Fossat & M. Pomerantz (1980). "Solar oscillations: full disk
  observations from the geographic South Pole." *Nature* 288, 541–544.
  [doi:10.1038/288541a0](https://doi.org/10.1038/288541a0).
- H. Kjeldsen, T. R. Bedding, M. Viskum & S. Frandsen (1995). "Solarlike
  oscillations in η Boo." *AJ* 109, 1313–1319.
  [doi:10.1086/117363](https://doi.org/10.1086/117363). The first reported
  solar-like oscillations in another star, later confirmed.
- F. Bouchy & F. Carrier (2001). "P-mode observations on α Cen A." *A&A*
  374, L5–L8. [doi:10.1051/0004-6361:20010792](https://doi.org/10.1051/0004-6361:20010792).
- J. De Ridder, C. Barban, F. Baudin et al. (2009). "Non-radial
  oscillation modes with long lifetimes in giant stars." *Nature* 459,
  398–400. [doi:10.1038/nature08022](https://doi.org/10.1038/nature08022).
  CoRoT red giants.
- P. G. Beck, T. R. Bedding, B. Mosser et al. (2011). "Kepler detected
  gravity-mode period spacings in a red giant star." *Science* 332, 205.
  [doi:10.1126/science.1201939](https://doi.org/10.1126/science.1201939).
- T. R. Bedding, B. Mosser, D. Huber et al. (2011). "Gravity modes as a way
  to distinguish between hydrogen- and helium-burning red giant stars."
  *Nature* 471, 608–611.
  [doi:10.1038/nature09935](https://doi.org/10.1038/nature09935).

*Physics literature.*
- P. Ledoux (1951). "The nonradial oscillations of gaseous stars and the
  problem of Beta Canis Majoris." *ApJ* 114, 373–384.
  [doi:10.1086/145477](https://doi.org/10.1086/145477). Rotational
  splitting and the constant C_nl.
- C. L. Wolff (1972). "Free oscillations of the Sun and their possible
  stimulation by solar flares." *ApJ* 176, 833–842.
  [doi:10.1086/151680](https://doi.org/10.1086/151680).
- P. Goldreich & D. A. Keeley (1977). "Solar seismology. II. The
  stochastic excitation of the solar p-modes by turbulent convection."
  *ApJ* 212, 243–251. [doi:10.1086/155043](https://doi.org/10.1086/155043).
- M. Tassoul (1980). "Asymptotic approximations for stellar nonradial
  pulsations." *ApJS* 43, 469–490.
  [doi:10.1086/190678](https://doi.org/10.1086/190678). The asymptotic p-
  and g-mode relations.
- R. K. Ulrich (1986). "Determination of stellar ages from
  asteroseismology." *ApJ* 306, L37–L40.
  [doi:10.1086/184700](https://doi.org/10.1086/184700). Δν and mean
  density; the small separation as an age diagnostic.
- T. M. Brown, R. L. Gilliland, R. W. Noyes & L. W. Ramsey (1991).
  "Detection of possible p-mode oscillations on Procyon." *ApJ* 368,
  599–609. [doi:10.1086/169725](https://doi.org/10.1086/169725). ν_max
  scaling with the acoustic cut-off frequency.
- H. Kjeldsen & T. R. Bedding (1995). "Amplitudes of stellar oscillations:
  the implications for asteroseismology." *A&A* 293, 87–106.
  [ADS](https://ui.adsabs.harvard.edu/abs/1995A%26A...293...87K/abstract).
  The scaling relations for Δν and ν_max.
- A. A. Pamyatnykh (1999). "Pulsational instability domains in the upper
  main sequence." *Acta Astron.* 49, 119–148.
  [ADS](https://ui.adsabs.harvard.edu/abs/1999AcA....49..119P/abstract).
  κ-mechanism instability strips, including δ Scuti.
- L. Gizon & S. K. Solanki (2003). "Determining the inclination of the
  rotation axis of a Sun-like star." *ApJ* 589, 1009–1019.
  [doi:10.1086/374715](https://doi.org/10.1086/374715).
- C. Aerts, J. Christensen-Dalsgaard & D. W. Kurtz (2010).
  *Asteroseismology*. Astronomy and Astrophysics Library, Springer.
  [doi:10.1007/978-1-4020-5803-5](https://doi.org/10.1007/978-1-4020-5803-5).
- D. Huber, T. R. Bedding, D. Stello et al. (2011). "Testing scaling
  relations for solar-like oscillations from the main sequence to red
  giants using Kepler data." *ApJ* 743, 143.
  [doi:10.1088/0004-637X/743/2/143](https://doi.org/10.1088/0004-637X/743/2/143).
  The solar reference values ν_max = 3090 ± 30 μHz and
  Δν = 135.1 ± 0.1 μHz.
- B. Mosser, M. J. Goupil, K. Belkacem et al. (2012). "Probing the core
  structure and evolution of red giants using gravity-dominated mixed
  modes observed with Kepler." *A&A* 540, A143.
  [doi:10.1051/0004-6361/201118519](https://doi.org/10.1051/0004-6361/201118519).
- W. J. Chaplin & A. Miglio (2013). "Asteroseismology of solar-type and
  red-giant stars." *Annu. Rev. Astron. Astrophys.* 51, 353–392.
  [doi:10.1146/annurev-astro-082812-140938](https://doi.org/10.1146/annurev-astro-082812-140938).

*Earlier models and synthesis projects.*
- [The Singing Sun / Solar Sounds](https://solar-center.stanford.edu/singing/)
  (A. G. Kosovichev, Stanford Solar Oscillations Investigation, 1997): 40
  days of disc-averaged SOHO/MDI Doppler data, filtered to keep the
  l = 0–3 modes and sped up 42,000 times.
- E. J. Rhodes Jr., A. G. Kosovichev, J. Schou, P. H. Scherrer &
  J. Reiter (1997). "Measurements of frequencies of solar oscillations
  from the MDI medium-l program." *Sol. Phys.* 175, 287–310.
  [doi:10.1023/A:1004963425123](https://doi.org/10.1023/A:1004963425123).
  Its CD-ROM carried solar sound files illustrating the stochastic modes.
- [ESO: ultrabass sounds of the giant star ξ Hya](https://www.eso.org/public/news/eso0215/)
  (ESO press release eso0215, 2002; data from S. Frandsen, F. Carrier,
  C. Aerts et al.): the 16 strongest observed oscillation frequencies of
  a red giant, multiplied by 10⁶.
- Z. Kolláth & J. Keuler (2006). "Stellar acoustics as input for music
  composition." *Musicae Scientiae* 10(1 suppl.), 161–183.
  [doi:10.1177/1029864906010001081](https://doi.org/10.1177/1029864906010001081).
  Csound synthesis from models of variable stars, for the composition
  "Stellar Music No. 1".
- Z. Kolláth (2006). "Public outreach in asteroseismology." *ASP Conf.
  Ser.* 349, 421–433.
  [ADS](https://ui.adsabs.harvard.edu/abs/2006ASPC..349..421K/abstract).
  Stellar sounds as sums of transposed model frequencies.
- B. Ulaş (2009). "Musical scale estimation for some multiperiodic
  pulsating stars." *Commun. Asteroseismol.* 159, 131–134.
  [doi:10.1553/cia159s131](https://doi.org/10.1553/cia159s131).
- B. Ulaş (2015). "The multiperiodic pulsating star Y Cam A as a musical
  instrument." arXiv:1507.07307.
  [doi:10.48550/arXiv.1507.07307](https://doi.org/10.48550/arXiv.1507.07307).
  Chords and a composition from a δ Scuti star's observed frequencies.
- B. Carey & B. Ulaş (2016). "VR 'Space Opera': mimetic spectralism in an
  immersive starlight audification system." arXiv:1611.03081.
  [doi:10.48550/arXiv.1611.03081](https://doi.org/10.48550/arXiv.1611.03081).
- [SoSH: Sonification of Solar Harmonics](https://solar-center.stanford.edu/sosh/)
  (T. P. Larson, S. Shafer & E. diFalco; Stanford and University of
  Nebraska Omaha): Pure Data tool that isolates SOHO/MDI and SDO/HMI
  global modes and transposes them to audio, keeping frequency ratios.
  Described in T. P. Larson, S. Shafer & E. diFalco (2019), *AAS Meeting*
  234, 307.06 ([ADS](https://ui.adsabs.harvard.edu/abs/2019AAS...23430706L/abstract)).
- D. Huppenkothen, J. Pampin, J. R. A. Davenport & J. Wenlock (2023). "The
  sonified Hertzsprung–Russell diagram." *Proc. ICAD 2023*, 268–275.
  [doi:10.21785/icad2023.6263](https://doi.org/10.21785/icad2023.6263).
  Audified Kepler light curves, including pulsating stars, on an
  interactive HR diagram.
- [AstroSounds](https://www.astrosounds.be/en/) (K. Kolenberg, KU Leuven
  and UAntwerp, with partners): citizen-science project in which
  participants listen to sonified Kepler light curves of pulsating stars.

---

## Wind Harp (`windharp`)

*The Aeolian harp, made playable.*

**Physics.**
- **Excitation:** wind over a string sheds a von Kármán vortex street at
  the Strouhal frequency f_s = St·U/d (St ≈ 0.2; more precisely
  St ≈ 0.27 − 1.03/√Re, about 0.17 at Re = 100, Williamson & Brown 1998;
  no shedding below Re ≈ 47). When f_s nears one of the string's
  harmonics, the wake locks onto it (lock-in), and the string sounds that
  harmonic, often a high one rather than the fundamental.
- **Model:** the wake-oscillator model (a van der Pol wake variable coupled
  to the string's modes; Facchinetti, de Langre & Biolley, *J. Fluids
  Struct.* 19, 2004) captures lock-in: acceleration coupling reproduces
  the observed lock-in range. Facchinetti et al. (2004, *Eur. J. Mech. B*)
  and Violette, de Langre & Szydlowski (2010) extend it to cables and
  their mode switching.

**Playable effects.**
- Each key is a string, or a set of strings tuned in unison.
- Wind speed is the global expression (mod wheel or aftertouch), with gusts
  (filtered noise).
- Raising the wind moves lock-in to higher harmonics (mode switching, not
  always one step at a time), and the response near each switch can be
  hysteretic (Brika & Laneville 1993).
- String diameter, tension and damping.

**Views.**
- A lock-in map: Strouhal frequency against wind speed over the string's
  harmonics, with the current operating point.
- The vortex street (schematic) and the string shape.

**Tests.**
- The Strouhal relation.
- The lock-in range against the wake-oscillator coupling constants.
- Hysteresis width.
- Harmonic jumps at the predicted wind speeds.

**Prior art.**

*History and invention.*
- A. Kircher (1650). *Musurgia universalis*, vol. 2, book IX,
  Machinamentum X, pp. 352–355. Rome.
  [archive.org scan](https://archive.org/details/chepfl-lipr-AXC19_02/page/n378/mode/1up).
  The Aeolian harp: gut strings tuned in unison or octaves, which sound
  other intervals than their open notes in the wind.
- V. Strouhal (1878). "Ueber eine besondere Art der Tonerregung." *Ann.
  Phys.* 241(10), 216–251.
  [doi:10.1002/andp.18782411005](https://doi.org/10.1002/andp.18782411005).
- Lord Rayleigh (1879). "Acoustical observations. II." *Phil. Mag.*
  7(42), 149–162.
  [doi:10.1080/14786447908639584](https://doi.org/10.1080/14786447908639584).
  Shows that the Aeolian string vibrates across the wind, not along it.
- H. Bénard (1908). "Formation de centres de giration à l'arrière d'un
  obstacle en mouvement." *C. R. Acad. Sci.* 147, 839–842.
  [archive.org scan](https://archive.org/details/comptesrendusheb147acad/page/n846/mode/1up).
- T. von Kármán (1911, 1912). "Über den Mechanismus des Widerstandes, den
  ein bewegter Körper in einer Flüssigkeit erfährt." *Nachr. Ges. Wiss.
  Göttingen, Math.-Phys. Kl.* 1911, 509–517; 1912, 547–556.
  [EuDML (1911)](https://eudml.org/doc/58812),
  [EuDML (1912)](https://eudml.org/doc/58837).
- Lord Rayleigh (1915). "Aeolian tones." *Phil. Mag.* 29(172), 433–444.
  [doi:10.1080/14786440408635325](https://doi.org/10.1080/14786440408635325).
- A. Roshko (1954). *On the Development of Turbulent Wakes from Vortex
  Streets*. NACA Report 1191.
  [NTRS](https://ntrs.nasa.gov/citations/19930092207).
- S. Bonner (2001). "Aeolian harp." *Grove Music Online*.
  [doi:10.1093/gmo/9781561592630.article.46545](https://doi.org/10.1093/gmo/9781561592630.article.46545).

*Physics literature.*
- R. E. D. Bishop & A. Y. Hassan (1964). "The lift and drag forces on a
  circular cylinder oscillating in a flowing fluid." *Proc. R. Soc. Lond.
  A* 277(1368), 51–75.
  [doi:10.1098/rspa.1964.0005](https://doi.org/10.1098/rspa.1964.0005).
- C. C. Feng (1968). "The measurement of vortex induced effects in flow
  past stationary and oscillating circular and D-section cylinders."
  Thesis, University of British Columbia.
  [doi:10.14288/1.0104049](https://doi.org/10.14288/1.0104049). Lock-in
  ("capture") measured at several damping levels.
- R. T. Hartlen & I. G. Currie (1970). "Lift-oscillator model of
  vortex-induced vibration." *J. Eng. Mech. Div. ASCE* 96(5), 577–591.
  [doi:10.1061/JMCEA3.0001276](https://doi.org/10.1061/JMCEA3.0001276).
  A self-excited lift oscillator coupled to the structure's velocity.
- D. Brika & A. Laneville (1993). "Vortex-induced vibrations of a long
  flexible circular cylinder." *J. Fluid Mech.* 250, 481–508.
  [doi:10.1017/S0022112093001533](https://doi.org/10.1017/S0022112093001533).
  Hysteresis loops and jumps between branches as the wind rises and
  falls.
- C. H. K. Williamson & G. L. Brown (1998). "A series in 1/√Re to
  represent the Strouhal–Reynolds number relationship of the cylinder
  wake." *J. Fluids Struct.* 12(8), 1073–1085.
  [doi:10.1006/jfls.1998.0184](https://doi.org/10.1006/jfls.1998.0184).
- C. H. K. Williamson & R. Govardhan (2004). "Vortex-induced vibrations."
  *Annu. Rev. Fluid Mech.* 36, 413–455.
  [doi:10.1146/annurev.fluid.36.050802.122128](https://doi.org/10.1146/annurev.fluid.36.050802.122128).
- M. L. Facchinetti, E. de Langre & F. Biolley (2004). "Coupling of
  structure and wake oscillators in vortex-induced vibrations." *J. Fluids
  Struct.* 19(2), 123–140.
  [doi:10.1016/j.jfluidstructs.2003.12.004](https://doi.org/10.1016/j.jfluidstructs.2003.12.004).
  Van der Pol wake oscillator on a one-degree-of-freedom structure;
  acceleration coupling reproduces the observed lock-in domains.
- M. L. Facchinetti, E. de Langre & F. Biolley (2004). "Vortex-induced
  travelling waves along a cable." *Eur. J. Mech. B Fluids* 23(1),
  199–208.
  [doi:10.1016/j.euromechflu.2003.04.004](https://doi.org/10.1016/j.euromechflu.2003.04.004).
  Wake oscillators distributed along a cable.
- E. de Langre (2006). "Frequency lock-in is caused by coupled-mode
  flutter." *J. Fluids Struct.* 22(6–7), 783–791.
  [doi:10.1016/j.jfluidstructs.2006.04.008](https://doi.org/10.1016/j.jfluidstructs.2006.04.008).
- R. Violette, E. de Langre & J. Szydlowski (2010). "A linear stability
  approach to vortex-induced vibrations and waves." *J. Fluids Struct.*
  26(3), 442–466.
  [doi:10.1016/j.jfluidstructs.2010.01.002](https://doi.org/10.1016/j.jfluidstructs.2010.01.002).
  Which mode of a tensioned cable locks in, and mode switching as the
  flow speed changes.

*Earlier models and synthesis projects.*
- Y. Dobashi, T. Yamamoto & T. Nishita (2003). "Real-time rendering of
  aerodynamic sound using sound textures based on computational fluid
  dynamics." *ACM Trans. Graph.* 22(3), 732–740.
  [doi:10.1145/882262.882339](https://doi.org/10.1145/882262.882339).
  Aerodynamic sounds (swords, wind) from CFD-precomputed sound textures,
  replayed in real time.
- R. Selfridge, J. D. Reiss, E. J. Avital & X. Tang (2016). "Physically
  derived synthesis model of an Aeolian tone." *AES 141st Convention*,
  Los Angeles (no DOI). Real-time Aeolian-tone synthesis from
  fluid-dynamics formulae, compared with wind-tunnel and computational
  results.
- R. Selfridge, D. Moffat, J. D. Reiss & E. J. Avital (2017). "Real-time
  physical model of an Aeolian harp." *Proc. 24th Int. Congress on Sound
  and Vibration (ICSV24)*, London. doi:10.25144/24498 (the publisher's
  landing page was offline when checked). Aeolian-harp model from
  semi-empirical fluid-dynamics equations with a wind model, evaluated in
  a listening test.
- R. Selfridge, D. Moffat, E. J. Avital & J. D. Reiss (2018). "Creating
  real-time aeroacoustic sound effects using physically informed
  models." *J. Audio Eng. Soc.* 66(7/8), 594–607.
  [doi:10.17743/jaes.2018.0033](https://doi.org/10.17743/jaes.2018.0033).
  A compact-source Aeolian-tone model, used for swords, Aeolian harps and
  propellers.
- [Nemisindo Aeolian Tones](https://nemisindo.com/models/aeolian-tones)
  (Nemisindo): browser procedural-audio model, hybrid: filtered noise at a
  Reynolds-dependent Strouhal frequency and its harmonics, with an
  "Aeolian Harp" preset but no string model or lock-in.

---

## Bubble Organ (`bubbles`)

**Physics.**
- **Pitch:** a gas bubble in a liquid rings at its Minnaert frequency,
  f₀ = (1/2πR)·√(3γp₀/ρ) (≈ 3.3 kHz·mm / R in water). Corrections for
  surface tension and thermal effects follow Devin (1959). Damping is
  thermal, viscous and radiative.
- **Each note:** a bubble pinches off a nozzle and is shock-excited at
  release (Longuet-Higgins, Kerman & Lunde), giving a damped chirp. Near
  the free surface the liquid's effective mass shrinks, so a bubble rising
  towards it glides up in pitch, by up to √2 just below the surface (van
  den Doel 2005, after Leighton 1994): the "bloop" glide. The falling
  hydrostatic pressure on the way up (with the bubble expanding) lowers
  the pitch by only about 10–15 ¢ per 10 cm.
- **Keys:** pressing a key releases bubbles of the radius tuned to the
  note. Holding it keeps releasing them at a set rate, with a little
  randomness (the "brook").

**Playable effects.**
- Water depth, tank pressure, gas (air, helium or SF₆ through γ), liquid
  (water or glycerol through ρ and viscosity), release rate, and bubble
  size spread.

**Views.**
- Bubbles rising in a tank, coloured by pitch.
- The damped pressure waveform of the latest bubble.

**Tests.**
- Minnaert's formula.
- Devin's damping constants against published values for air in water.
- Pitch ∝ √p₀ with depth, at fixed radius.
- A γ change (helium) shifts pitch by √(γ ratio).

**Prior art.**

*History and invention.*
- Lord Rayleigh (1917). "On the pressure developed in a liquid during the
  collapse of a spherical cavity." *Phil. Mag.* 34(200), 94–98.
  [doi:10.1080/14786440808635681](https://doi.org/10.1080/14786440808635681).
  The equation of radial motion of a spherical cavity in a liquid.
- M. Minnaert (1933). "On musical air-bubbles and the sounds of running
  water." *Phil. Mag.* 16(104), 235–248.
  [doi:10.1080/14786443309462277](https://doi.org/10.1080/14786443309462277).
  Identified the bubble's volume pulsation as the source of the sound and
  derived its frequency.
- M. Strasberg (1956). "Gas bubbles as sources of sound in liquids."
  *J. Acoust. Soc. Am.* 28(1), 20–26.
  [doi:10.1121/1.1908212](https://doi.org/10.1121/1.1908212).

*Physics literature.*
- M. Strasberg (1953). "The pulsation frequency of nonspherical gas
  bubbles in liquids." *J. Acoust. Soc. Am.* 25(3), 536–537.
  [doi:10.1121/1.1907076](https://doi.org/10.1121/1.1907076).
- C. Devin (1959). "Survey of thermal, radiation, and viscous damping of
  pulsating air bubbles in water." *J. Acoust. Soc. Am.* 31(12),
  1654–1667. [doi:10.1121/1.1907675](https://doi.org/10.1121/1.1907675).
- A. Prosperetti (1977). "Thermal effects and damping mechanisms in the
  forced radial oscillations of gas bubbles in liquids." *J. Acoust. Soc.
  Am.* 61(1), 17–27. [doi:10.1121/1.381252](https://doi.org/10.1121/1.381252).
- T. G. Leighton & A. J. Walton (1987). "An experimental study of the
  sound emitted from gas bubbles in a liquid." *Eur. J. Phys.* 8(2),
  98–104. [doi:10.1088/0143-0807/8/2/005](https://doi.org/10.1088/0143-0807/8/2/005).
- H. C. Pumphrey, L. A. Crum & L. Bjørnø (1989). "Underwater sound
  produced by individual drop impacts and rainfall." *J. Acoust. Soc. Am.*
  85(4), 1518–1526. [doi:10.1121/1.397353](https://doi.org/10.1121/1.397353).
- M. S. Longuet-Higgins (1990). "Bubble noise spectra." *J. Acoust. Soc.
  Am.* 87(2), 652–661. [doi:10.1121/1.398934](https://doi.org/10.1121/1.398934).
- H. N. Oğuz & A. Prosperetti (1990). "Bubble entrainment by the impact of
  drops on liquid surfaces." *J. Fluid Mech.* 219, 143–179.
  [doi:10.1017/S0022112090002890](https://doi.org/10.1017/S0022112090002890).
- M. S. Longuet-Higgins, B. R. Kerman & K. Lunde (1991). "The release of
  air bubbles from an underwater nozzle." *J. Fluid Mech.* 230, 365–390.
  [doi:10.1017/S0022112091000836](https://doi.org/10.1017/S0022112091000836).
- A. Prosperetti & H. N. Oğuz (1993). "The impact of drops on liquid
  surfaces and the underwater noise of rain." *Annu. Rev. Fluid Mech.* 25,
  577–602. [doi:10.1146/annurev.fl.25.010193.003045](https://doi.org/10.1146/annurev.fl.25.010193.003045).
- T. G. Leighton (1994). *The Acoustic Bubble*. Academic Press, London.
  Ch. 3, "The freely-oscillating bubble", pp. 129–286:
  [doi:10.1016/B978-0-12-441920-9.50008-0](https://doi.org/10.1016/B978-0-12-441920-9.50008-0).

*Earlier models and synthesis projects.*
- K. van den Doel (2005). "Physically based models for liquid sounds."
  *ACM Trans. Appl. Percept.* 2(4), 534–546.
  [doi:10.1145/1101530.1101554](https://doi.org/10.1145/1101530.1101554).
  Real-time synthesis of streams, pouring, rain and waves from stochastic
  populations of Minnaert bubbles, with a rising-pitch term for bubbles
  near the surface.
- C. Zheng & D. L. James (2009). "Harmonic fluids." *ACM Trans. Graph.*
  28(3) (SIGGRAPH 2009).
  [doi:10.1145/1531326.1531343](https://doi.org/10.1145/1531326.1531343).
  Bubble oscillators driven by 3D fluid animations, each radiated through
  a precomputed acoustic transfer function.
- W. Moss, H. Yeh, J.-M. Hong, M. C. Lin & D. Manocha (2010). "Sounding
  liquids: automatic sound synthesis from fluid simulation." *ACM Trans.
  Graph.* 29(3).
  [doi:10.1145/1805964.1805965](https://doi.org/10.1145/1805964.1805965).
  Couples bubble-resonance equations to shallow-water and grid–SPH fluid
  simulators.
- C. Drioli & D. Rocchesso (2011). "Acoustic rendering of particle-based
  simulation of liquids in motion." *J. Multimodal User Interfaces*
  5(3–4), 187–195.
  [doi:10.1007/s12193-011-0063-7](https://doi.org/10.1007/s12193-011-0063-7).
  Sound rendering for particle-based liquid simulations.
- T. R. Langlois, C. Zheng & D. L. James (2016). "Toward animating water
  with complex acoustic bubbles." *ACM Trans. Graph.* 35(4).
  [doi:10.1145/2897824.2925904](https://doi.org/10.1145/2897824.2925904).
  Bubble sounds from two-phase simulations, with frequency shifts from
  bubble shape and proximity to surfaces.
- K. Xue, R. M. Aronson, J.-H. Wang, T. R. Langlois & D. L. James (2023).
  "Improved water sound synthesis using coupled bubbles." *ACM Trans.
  Graph.* 42(4). [doi:10.1145/3592424](https://doi.org/10.1145/3592424).
  Coupled-bubble oscillators for the low-frequency sound of bubble clouds.

---

## Spring Keyboard (`springs`)

**Physics.**
- Waves on a helical spring are strongly dispersive: the flexural, torsional
  and axial families couple. Struck at one end, a pulse disperses into
  chirps that arrive and re-arrive after reflections. That is the "pew" of
  spring reverbs and slinkies.
- **Model:** a helical spring as a thin curved rod (Wittrick's equations), or
  the reduced zero-helix-angle model of Fletcher, Tarnopolskaya & de Hoog,
  whose dispersion relation the spring-reverb papers use (Parker &
  Bilbao; Bilbao & Parker). Use a modal or finite-difference model with
  the correct dispersion.

**Playable effects.**
- Each key is a spring whose coil radius, wire diameter and length set the
  chirp's timing and pitch range, scaled so each key's lowest echo pitch
  or repetition rate lands on the note.
- Damping and coupling of the spring's ends.
- Several springs in parallel, as in spring reverbs.

**Views.**
- A spectrogram of the chirp echoes, live.
- The spring's dispersion curve with group-delay markers.

**Tests.**
- The dispersion relation against Wittrick's.
- Group delay against frequency measured from the engine's impulse
  response.
- Echo spacing equals the round-trip group delay.

**Prior art.**

*History and invention.*
- L. Hammond (1941). "Electrical musical instrument." US Patent
  2,230,836 (filed 15 July 1939, granted 4 February 1941).
  [USPTO scan](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/2230836).
  A mechanical reverberator for the electric organ: helical springs in
  oil-damped tubes between a drive transducer and a pickup.
- J. D. Stack (1948). "Sound reverberating device." US Patent 2,437,445
  (filed 7 November 1944, granted 9 March 1948; assigned to Twentieth
  Century-Fox). [USPTO scan](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/2437445).
  Coil-spring delay and reverberation for film sound.
- F. S. Crawford (1987). "Slinky whistlers." *Am. J. Phys.* 55(2),
  130–134. [doi:10.1119/1.15229](https://doi.org/10.1119/1.15229).
  The dispersive chirp of a struck Slinky, compared with ionospheric
  whistlers.

*Physics literature.*
- W. H. Wittrick (1966). "On elastic wave propagation in helical
  springs." *Int. J. Mech. Sci.* 8(1), 25–47.
  [doi:10.1016/0020-7403(66)90061-0](https://doi.org/10.1016/0020-7403%2866%2990061-0).
- L. Della Pietra & S. della Valle (1982). "On the dynamic behaviour of
  axially excited helical springs." *Meccanica* 17(1), 31–43.
  [doi:10.1007/BF02156005](https://doi.org/10.1007/BF02156005).
- T. Tarnopolskaya, F. R. de Hoog & N. H. Fletcher (1999). "Low-frequency
  mode transition in the free in-plane vibration of curved beams."
  *J. Sound Vib.* 228(1), 69–90.
  [doi:10.1006/jsvi.1999.2400](https://doi.org/10.1006/jsvi.1999.2400).
- N. H. Fletcher, T. Tarnopolskaya & F. R. de Hoog (2001). "Wave
  propagation on helices and hyperhelices: a fractal regression."
  *Proc. R. Soc. Lond. A* 457(2005), 33–43.
  [doi:10.1098/rspa.2000.0654](https://doi.org/10.1098/rspa.2000.0654).
  The zero-helix-angle curved-rod model whose dispersion relation the
  spring-reverb papers use.
- S. V. Sorokin (2009). "Linear dynamics of elastic helical springs:
  asymptotic analysis of wave propagation." *Proc. R. Soc. A* 465(2105),
  1513–1537. [doi:10.1098/rspa.2008.0468](https://doi.org/10.1098/rspa.2008.0468).
- J. Parker & S. Bilbao (2009). "Spring reverberation: a physical
  perspective." *Proc. 12th Int. Conf. Digital Audio Effects (DAFx-09)*,
  Como. [PDF](https://www.dafx.de/paper-archive/2009/papers/paper_84.pdf).
  Measured impulse responses, and the echo time T_D and transition
  frequency F_C in terms of the spring's geometry.

*Earlier models and synthesis projects.*
- J. S. Abel, D. P. Berners, S. Costello & J. O. Smith III (2006). "Spring
  reverb emulation using dispersive allpass filters in a waveguide
  structure." *AES 121st Convention*, San Francisco (no DOI). Waveguide
  loop with cascaded dispersive allpass filters.
- S. Bilbao & J. Parker (2010). "A virtual model of spring
  reverberation." *IEEE Trans. Audio Speech Lang. Process.* 18(4),
  799–808. [doi:10.1109/TASL.2009.2031506](https://doi.org/10.1109/TASL.2009.2031506).
  Finite-difference simulation of the curved-rod spring model.
- V. Välimäki, J. Parker & J. S. Abel (2010). "Parametric spring
  reverberation effect." *J. Audio Eng. Soc.* 58(7/8), 547–562 (no
  DOI). Parametric model with chirp-generating allpass chains and delay
  lines.
- J. Parker, H. Penttinen, S. Bilbao & J. S. Abel (2010). "Modeling
  methods for the highly dispersive Slinky spring: a novel musical toy."
  *Proc. DAFx-10*, Graz.
  [PDF](https://www.dafx.de/paper-archive/2010/DAFx10/ParkerPenttinenBilbaoAbel_DAFx10_P80.pdf).
  Finite-difference and waveguide Slinky models, played as a MIDI
  instrument.
- J. Parker (2011). "Efficient dispersion generation structures for
  spring reverb emulation." *EURASIP J. Adv. Signal Process.* 2011,
  646134. [doi:10.1155/2011/646134](https://doi.org/10.1155/2011/646134).
- H. Gamper, J. Parker & V. Välimäki (2011). "Automated calibration of a
  parametric spring reverb model." *Proc. DAFx-11*, Paris, 37–44.
  [PDF](https://www.dafx.de/paper-archive/2011/Papers/39_e.pdf).
- V. Välimäki, J. D. Parker, L. Savioja, J. O. Smith & J. S. Abel (2012).
  "Fifty years of artificial reverberation." *IEEE Trans. Audio Speech
  Lang. Process.* 20(5), 1421–1448.
  [doi:10.1109/TASL.2012.2189567](https://doi.org/10.1109/TASL.2012.2189567).
  Review, including the history and modelling of spring reverbs.
- S. Bilbao (2013). "Numerical simulation of spring reverberation."
  *Proc. DAFx-13*, Maynooth.
  [PDF](https://www.dafx.de/paper-archive/2013/papers/22.dafx2013_submission_19.pdf).
  Finite-difference schemes for the full helical-spring model.
- J. McQuillan & M. van Walstijn (2021). "Modal spring reverb based on
  discretisation of the thin helical spring model." *Proc. DAFx-20in21*,
  191–198. [doi:10.23919/DAFx51585.2021.9768284](https://doi.org/10.23919/DAFx51585.2021.9768284).
- J. McQuillan, M. van Walstijn, J. D. Parker & M. Ortiz (2025). "Physical
  modeling of a spring reverb tank incorporating helix angle, damping, and
  magnetic bead coupling." *J. Audio Eng. Soc.* 73(6), 312–330.
  [doi:10.17743/jaes.2022.0199](https://doi.org/10.17743/jaes.2022.0199).
- [Dual Spring Reverb](https://physicalaudio.co.uk/products/dual-spring-reverb/)
  (Physical Audio, Edinburgh): plug-in built on a modal model of wave
  propagation in helical springs, with no samples or impulse responses.
- [Spring Reverb](https://www.softube.com/plug-ins/spring-reverb)
  (Softube): plug-in that Softube describes as built with component and
  physical modelling.
- [Springs](https://www.audiothing.net/effects/springs/) (AudioThing,
  2019): hybrid; AudioThing describes it as a combination of convolution
  and modelling.
