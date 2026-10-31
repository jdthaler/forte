# Prior art and credits

Forte builds on more than sixty years of work in physical-modelling
synthesis and musical acoustics. Its instruments use methods, equations and
measurements that other people developed, and many other instruments,
commercial and open source, have modelled pianos, organs, electric pianos,
strings, plates and bells before it. This page credits that work across the
whole project: the history of the field, the techniques Forte uses, the
algorithms in its shared code, and earlier physical-modelling instruments.
Each instrument's README has its own, more detailed references for the
physics of that instrument.

Every citation below was checked against the publisher's record (most via
their DOI), the author's own bibliography, or the standard itself, and every
link was checked in October 2026. Corrections are welcome as issues or pull
requests.

## Contents

1. [Foundations of physical-modelling synthesis](#1-foundations-of-physical-modelling-synthesis)
2. [Techniques Forte uses, and where they come from](#2-techniques-forte-uses-and-where-they-come-from)
3. [Algorithms and data in Forte's shared code](#3-algorithms-and-data-in-fortes-shared-code)
4. [Physical-modelling instruments and projects](#4-physical-modelling-instruments-and-projects)
5. [Sonification and science-outreach precedents](#5-sonification-and-science-outreach-precedents)
6. [Trademarks](#6-trademarks)

## 1. Foundations of physical-modelling synthesis

### Musical acoustics

* **Lord Rayleigh (J. W. Strutt)**, *The Theory of Sound*, 2 vols., first
  published 1877–78; Cambridge Library Collection reissue, 2011,
  [doi:10.1017/CBO9781139058087](https://doi.org/10.1017/CBO9781139058087) (vol. 1).
  Vibrating strings, bars, plates and shells, and the energy (Rayleigh)
  method for their frequencies.
* **N. H. Fletcher and T. D. Rossing**, *The Physics of Musical
  Instruments* (Springer, 1991; 2nd ed. 1998),
  [doi:10.1007/978-1-4612-2980-3](https://doi.org/10.1007/978-1-4612-2980-3) (1st ed.),
  [doi:10.1007/978-0-387-21603-4](https://doi.org/10.1007/978-0-387-21603-4) (2nd ed.).
  The standard reference for the acoustics of nearly every instrument
  family in Forte.
* **A. Chaigne and J. Kergomard**, *Acoustics of Musical Instruments*
  (Springer, 2016),
  [doi:10.1007/978-1-4939-3679-3](https://doi.org/10.1007/978-1-4939-3679-3).
  A graduate text on the physics of musical instruments.

### A short history of the synthesis methods

* **1962 — the vocal tract as a tube.** J. L. Kelly and C. C. Lochbaum,
  "Speech synthesis", *Proc. Fourth International Congress on Acoustics*,
  Copenhagen, paper G42, pp. 1–4 (1962). The vocal tract as a chain of
  cylindrical sections with scattering junctions between them: the
  ancestor of digital waveguides.
* **1971 — the first finite-difference string synthesis.** L. Hiller and
  P. Ruiz, "Synthesizing musical sounds by solving the wave equation for
  vibrating objects", *J. Audio Eng. Soc.* **19**(6), 462–470 (Part I) and
  **19**(7), from p. 542 (Part II) (1971). Vibrating strings computed
  directly from the wave equation by finite differences, long before this
  could run in real time.
* **1979 — synthetic reverberation from noise.** J. A. Moorer, "About this
  reverberation business", *Computer Music Journal* **3**(2), 13–28 (1979),
  [doi:10.2307/3680280](https://doi.org/10.2307/3680280). (See §3: Forte's
  room is built this way.)
* **1983 — self-sustained oscillation.** M. E. McIntyre, R. T. Schumacher
  and J. Woodhouse, "On the oscillations of musical instruments",
  *J. Acoust. Soc. Am.* **74**(5), 1325–1345 (1983),
  [doi:10.1121/1.390157](https://doi.org/10.1121/1.390157). A linear
  resonator coupled to a nonlinear excitation (bow, reed, jet) by a
  reflection function: the framework behind Forte's bowed and rubbed
  instruments (Viola Organista, Glass Armonica, Clavicylinder, Hurdy-Gurdy, Chladni Plate).
* **1983 — the plucked-string algorithm.** K. Karplus and A. Strong,
  "Digital synthesis of plucked-string and drum timbres", *Computer Music
  Journal* **7**(2), 43–55 (1983),
  [doi:10.2307/3680062](https://doi.org/10.2307/3680062); and D. A. Jaffe
  and J. O. Smith, "Extensions of the Karplus–Strong plucked-string
  algorithm", *Computer Music Journal* **7**(2), 56–69 (1983),
  [doi:10.2307/3680063](https://doi.org/10.2307/3680063), which gave it
  physical interpretations: fine tuning by fractional delay, decay
  stretching, dynamics and pick position.
* **1984, 1993 — mass–interaction modelling (CORDIS-ANIMA, ACROE,
  Grenoble).** C. Cadoz, A. Luciani and J.-L. Florens, "Responsive input
  devices and sound synthesis by stimulation of instrumental mechanisms:
  the Cordis system", *Computer Music Journal* **8**(3), 60–73 (1984),
  [doi:10.2307/3679813](https://doi.org/10.2307/3679813) (title as
  registered; often cited with "simulation"); and "CORDIS-ANIMA: a
  modeling and simulation system for sound and image synthesis — the
  general formalism", *Computer Music Journal* **17**(1), 19–29 (1993),
  [doi:10.2307/3680567](https://doi.org/10.2307/3680567). Instruments
  assembled from masses, springs and nonlinear links, played through
  force-feedback keys.
* **1986–1992 — digital waveguides.** J. O. Smith, "Efficient simulation
  of the reed-bore and bow-string mechanisms", *Proc. ICMC 1986*, The Hague,
  pp. 275–280; "Music applications of digital waveguides", CCRMA Technical
  Report STAN-M-39, Stanford University (1987); and "Physical modeling
  using digital waveguides", *Computer Music Journal* **16**(4), 74–91
  (1992), [doi:10.2307/3680470](https://doi.org/10.2307/3680470).
  Travelling waves in delay lines, with losses and dispersion lumped into
  filters. Patented as J. O. Smith, "Digital signal processing using
  waveguide networks", [US 4,984,276](https://patents.google.com/patent/US4984276A/en)
  (Stanford University; filed 1989, granted 8 January 1991; expired). The
  whole subject is collected in Smith's online book *Physical Audio Signal
  Processing for Virtual Musical Instruments and Audio Effects* (W3K
  Publishing, 2010), <https://ccrma.stanford.edu/~jos/pasp/>.
* **1986 — wave digital filters.** A. Fettweis, "Wave digital filters:
  theory and practice", *Proc. IEEE* **74**(2), 270–327 (1986),
  [doi:10.1109/PROC.1986.13458](https://doi.org/10.1109/PROC.1986.13458).
  Passive circuit and mechanical networks discretised so that they stay
  passive; the basis of much later "virtual analog" and lumped-element
  modelling.
* **1991, 1993 — modal synthesis (MOSAIC, later Modalys, IRCAM).**
  J.-M. Adrien, "The missing link: modal synthesis", in G. De Poli,
  A. Piccialli and C. Roads (eds.), *Representations of Musical Signals*
  (MIT Press, 1991), pp. 269–297; and J. D. Morrison and J.-M. Adrien,
  "MOSAIC: a framework for modal synthesis", *Computer Music Journal*
  **17**(1), 45–56 (1993),
  [doi:10.2307/3680569](https://doi.org/10.2307/3680569). A structure as a
  set of modes (frequency, damping, shape) with objects that connect at
  points: the representation most of Forte's struck instruments use.
* **1992 — excitation and resonator.** G. Borin, G. De Poli and A. Sarti,
  "Algorithms and structures for synthesis using physical models",
  *Computer Music Journal* **16**(4), 30–42 (1992),
  [doi:10.2307/3680467](https://doi.org/10.2307/3680467).
* **1992, 1994 — finite-difference piano strings.** A. Chaigne, "On the use
  of finite differences for musical synthesis. Application to plucked
  stringed instruments", *J. d'Acoustique* **5**(2), 181–211 (1992); and
  A. Chaigne and A. Askenfelt, "Numerical simulations of piano strings.
  I. A physical model for a struck string using finite difference
  methods", *J. Acoust. Soc. Am.* **95**(2), 1112–1118 (1994),
  [doi:10.1121/1.408459](https://doi.org/10.1121/1.408459), and "II.
  Comparisons with measurements and systematic exploration of some
  hammer–string parameters", **95**(3), 1631–1640 (1994),
  [doi:10.1121/1.408549](https://doi.org/10.1121/1.408549). The stiff
  string struck by a nonlinear felt hammer; Forte's Ribbon Piano takes its
  felt values at C2 and C4 from this work.
* **1993 — waveguide meshes.** S. A. Van Duyne and J. O. Smith, "Physical
  modeling with the 2-D digital waveguide mesh", *Proc. ICMC 1993*, Tokyo,
  pp. 40–47; and "The 2-D digital waveguide mesh", *Proc. IEEE WASPAA
  1993*, pp. 177–180,
  [doi:10.1109/ASPAA.1993.379968](https://doi.org/10.1109/ASPAA.1993.379968).
* **1993, 1995 — commuted synthesis.** J. O. Smith, "Efficient synthesis
  of stringed musical instruments", *Proc. ICMC 1993*, Tokyo, pp. 64–71;
  M. Karjalainen, V. Välimäki and Z. Jánosy, "Towards high-quality sound
  synthesis of the guitar and string instruments", *Proc. ICMC 1993*,
  Tokyo, pp. 56–63; J. O. Smith and S. A. Van Duyne, "Commuted piano
  synthesis", *Proc. ICMC 1995*, Banff, pp. 319–326. A linear body (a
  soundboard) moved past the string into the excitation, or applied as an
  impulse response.
* **1998 — review.** M. Karjalainen, V. Välimäki and T. Tolonen,
  "Plucked-string models: from the Karplus–Strong algorithm to digital
  waveguides and beyond", *Computer Music Journal* **22**(3), 17–32 (1998),
  [doi:10.2307/3681155](https://doi.org/10.2307/3681155).
* **2002 — textbook.** P. R. Cook, *Real Sound Synthesis for Interactive
  Applications* (A K Peters, 2002),
  [doi:10.1201/b19597](https://doi.org/10.1201/b19597).
* **2003 — the functional transformation method.** L. Trautmann and
  R. Rabenstein, *Digital Sound Synthesis by Physical Modeling Using the
  Functional Transformation Method* (Springer, 2003),
  [doi:10.1007/978-1-4615-0049-0](https://doi.org/10.1007/978-1-4615-0049-0).
  Exact modal solutions of the string PDE, discretised mode by mode.
* **2006 — review.** V. Välimäki, J. Pakarinen, C. Erkut and
  M. Karjalainen, "Discrete-time modelling of musical instruments",
  *Rep. Prog. Phys.* **69**(1), 1–78 (2006),
  [doi:10.1088/0034-4885/69/1/R01](https://doi.org/10.1088/0034-4885/69/1/R01).
  The broadest survey of the field: finite differences, waveguides, modal
  and source–filter methods, wave digital filters, and their hybrids.
* **2009 — numerical sound synthesis.** S. Bilbao, *Numerical Sound
  Synthesis: Finite Difference Schemes and Simulation in Musical Acoustics*
  (Wiley, 2009),
  [doi:10.1002/9780470749012](https://doi.org/10.1002/9780470749012).
  Energy methods for proving numerical stability, applied to strings,
  bars, plates, nonlinear contacts and collisions. It is behind Forte's
  approach to stable nonlinear schemes. The NESS project that followed is
  listed in §4.
* **2026 — review.** P. Tablas de Paula, J. O. Smith III, V. Välimäki and
  J. D. Reiss, "Four decades of digital waveguides", arXiv:2604.12878
  (2026), <https://arxiv.org/abs/2604.12878>.

### Keyboard instruments in particular

* **G. Weinreich**, "Coupled piano strings", *J. Acoust. Soc. Am.* **62**(6),
  1474–1484 (1977), [doi:10.1121/1.381677](https://doi.org/10.1121/1.381677).
  Double decay and aftersound from unison strings coupled at a moving
  bridge; the Ribbon Piano's shared bridge reproduces it.
* **B. Bank, F. Avanzini, G. Borin, G. De Poli, F. Fontana and
  D. Rocchesso**, "Physically informed signal processing methods for piano
  sound synthesis: a research overview", *EURASIP J. Appl. Signal Process.*
  **2003**(10) (2003),
  [doi:10.1155/S1110865703304093](https://doi.org/10.1155/S1110865703304093).
* **J. Bensa, S. Bilbao, R. Kronland-Martinet and J. O. Smith**, "The
  simulation of piano string vibration: from physical models to finite
  difference schemes and digital waveguides", *J. Acoust. Soc. Am.*
  **114**(2), 1095–1107 (2003),
  [doi:10.1121/1.1587146](https://doi.org/10.1121/1.1587146).
* **J. O. Smith, S. Serafin, J. Abel and D. Berners**, "Doppler simulation
  and the Leslie", *Proc. DAFx-02*, Hamburg, pp. 13–20 (2002). The rotating
  horn and drum of the Tonewheel Organ's Leslie.
* **D. M. F. Chapman**, "The tones of the kalimba (African thumb piano)",
  *J. Acoust. Soc. Am.* **131**(1), 945–950 (2012),
  [doi:10.1121/1.3651090](https://doi.org/10.1121/1.3651090). The tine as a
  clamped–supported–free beam, the Kalimba's tines.
* **O. Christensen and B. B. Vistisen**, "Simple model for low-frequency
  guitar function", *J. Acoust. Soc. Am.* **68**(3), 758–766 (1980),
  [doi:10.1121/1.384814](https://doi.org/10.1121/1.384814). The top and the
  sound hole as two coupled oscillators, the Kalimba's box.
* **The hydraulis.** Hero's *Pneumatica* I.42 and Vitruvius's *De
  architectura* X.8 describe it; W. Walcker-Mayer, *The Roman Organ of
  Aquincum* (1972), reconstructs the organ of AD 228, and the European
  Cultural Centre of Delphi's [reconstruction](https://eccd.gr/en/ancient-hydraulis/)
  the Dion organ (1st century BC). Recordings of such reconstructions are
  sold as sample libraries (for one,
  [Rare Sound Essence's](https://pulse.audio/product/ancient-roman-pneumatic-organ-by-rare-sound-essence/)).
  The Hydraulis plays its wind (the head of water under the bowl, the
  water's bounce, the pumps, the bubbles at the rim) from those
  descriptions, with the Pipe Organ's flue pipes; its sources are in
  `hydraulis/README.md`.
* **The Telharmonium.** T. Cahill, [US 580,035](https://patents.google.com/patent/US580035A/en)
  (1897), and R. Weidenaar, *Magic Music from the Telharmonium* (Scarecrow
  Press, 1995), the history and engineering the Telharmonium is built from;
  the tonewheel organs ([Hammond, 1934](https://patents.google.com/patent/US1956350A/en))
  are its descendants. We did not find an earlier physical model of it. Its
  sources are in `telharmonium/README.md`.
* **The regal.** Praetorius draws the regals and their resonators in
  *Syntagma musicum II* (1619); Monteverdi scores one for Charon in
  *L'Orfeo* (1607). The beating reed is G. R. Plitnik's ("Vibration
  characteristics of pipe organ reed tongues…", *J. Acoust. Soc. Am.*
  **107**(6), 3460–3473, 2000) and A. Miklós, J. Angster, S. Pitsch and
  T. D. Rossing's (*J. Acoust. Soc. Am.* **113**, 1081–1091, 2003; **119**,
  3121–3129, 2006). Modartt's [Organteq](https://www.modartt.com/organteq)
  models reed pipes physically, and regals are sold as sample libraries.
  The Regal plays its curved tongues, shallots, short resonators and wedge
  bellows from those; its sources are in `regal/README.md`.

## 2. Techniques Forte uses, and where they come from

* **Modal synthesis with impulse-invariant resonators** (`shared/dsp.js`
  `modeCoeffs`, and the same two-pole update in the modal engines of the
  pianos, electric pianos, clavier and glass): each mode is a damped
  oscillator whose discrete impulse response equals the continuous one at
  the sample times. Modal synthesis: Adrien (1991);
  Morrison & Adrien (1993). Impulse invariance: J. O. Smith, *Physical
  Audio Signal Processing*, "Impulse invariant method",
  <https://ccrma.stanford.edu/~jos/pasp/Impulse_Invariant_Method.html>.
* **Rayleigh–Ritz, Galerkin and finite elements** (tapered piano strings;
  the Pyrophone's flame–tube model; Hermite beam elements for the tines and
  reeds): Rayleigh (1877–78); W. Ritz, "Über eine neue Methode zur Lösung
  gewisser Variationsprobleme der mathematischen Physik", *J. reine angew.
  Math.* **135**, 1–61 (1909),
  [doi:10.1515/crll.1909.135.1](https://doi.org/10.1515/crll.1909.135.1);
  W. Ritz, "Theorie der Transversalschwingungen einer quadratischen Platte
  mit freien Rändern", *Ann. Phys.* **333**, 737–786 (1909),
  [doi:10.1002/andp.19093330403](https://doi.org/10.1002/andp.19093330403)
  (the free square plate of Chladni's figures, solved in a Legendre basis as
  the Chladni Plate does, and checked against A. W. Leissa, "The free
  vibration of rectangular plates", *J. Sound Vib.* **31**, 257–293 (1973),
  [doi:10.1016/S0022-460X(73)80371-2](https://doi.org/10.1016/S0022-460X(73)80371-2));
  R. Courant, "Variational methods for the solution of problems of
  equilibrium and vibrations", *Bull. Amer. Math. Soc.* **49**(1), 1–23
  (1943),
  [doi:10.1090/S0002-9904-1943-07818-4](https://doi.org/10.1090/S0002-9904-1943-07818-4).
* **Contact laws for hammers, tangents, mallets and pads**: H. Hertz,
  "Ueber die Berührung fester elastischer Körper", *J. reine angew. Math.*
  **92**, 156–171 (1882),
  [doi:10.1515/crll.1882.92.156](https://doi.org/10.1515/crll.1882.92.156);
  K. H. Hunt and F. R. E. Crossley, "Coefficient of restitution interpreted
  as damping in vibroimpact", *J. Appl. Mech.* **42**(2), 440–445 (1975),
  [doi:10.1115/1.3423596](https://doi.org/10.1115/1.3423596);
  T. Schwager and T. Pöschel, "Coefficient of restitution and linear–dashpot
  model revisited", *Granular Matter* **9**(6), 465–469 (2007),
  [doi:10.1007/s10035-007-0065-z](https://doi.org/10.1007/s10035-007-0065-z)
  (the Hurdy-Gurdy's chien on the soundboard);
  X. Boutillon, "Model for piano hammers: experimental determination and
  digital simulation", *J. Acoust. Soc. Am.* **83**(2), 746–754 (1988),
  [doi:10.1121/1.396117](https://doi.org/10.1121/1.396117);
  A. Stulov, "Hysteretic model of the grand piano hammer felt",
  *J. Acoust. Soc. Am.* **97**(4), 2577–2585 (1995),
  [doi:10.1121/1.411912](https://doi.org/10.1121/1.411912);
  Chaigne & Askenfelt (1994).
* **Implicit (Newton) solution of nonlinear contacts and friction**, each
  sample, so that a stiff contact cannot run away: the delay-free loop
  between a nonlinearity and a linear resonator, G. Borin, G. De Poli and
  D. Rocchesso, "Elimination of delay-free loops in discrete-time models of
  nonlinear acoustic systems", *IEEE Trans. Speech Audio Process.* **8**(5),
  597–605 (2000), [doi:10.1109/89.861380](https://doi.org/10.1109/89.861380);
  energy-based contact schemes, Bilbao (2009) and V. Chatziioannou and
  M. van Walstijn, "Energy conserving schemes for the simulation of musical
  instrument contact dynamics", *J. Sound Vib.* **339**, 262–279 (2015),
  [doi:10.1016/j.jsv.2014.11.017](https://doi.org/10.1016/j.jsv.2014.11.017).
  Bow and finger friction as a self-sustained oscillation: McIntyre,
  Schumacher & Woodhouse (1983).
* **Energy-conserving and scalar-auxiliary-variable (SAV) schemes**
  (Gong Keyboard): Bilbao (2009); J. Shen, J. Xu and J. Yang, "The scalar
  auxiliary variable (SAV) approach for gradient flows", *J. Comput. Phys.*
  **353**, 407–416 (2018),
  [doi:10.1016/j.jcp.2017.10.021](https://doi.org/10.1016/j.jcp.2017.10.021);
  M. Ducceschi, S. Bilbao, S. Willemsen and S. Serafin, "Linearly-implicit
  schemes for collisions in musical acoustics based on energy
  quadratisation", *J. Acoust. Soc. Am.* **149**(5), 3502–3516 (2021),
  [doi:10.1121/10.0005008](https://doi.org/10.1121/10.0005008);
  M. Ducceschi and S. Bilbao, "Simulation of the geometrically exact
  nonlinear string via energy quadratisation", *J. Sound Vib.* **534**,
  117021 (2022),
  [doi:10.1016/j.jsv.2022.117021](https://doi.org/10.1016/j.jsv.2022.117021);
  S. Bilbao, M. Ducceschi and F. Zama, "Explicit exactly energy-conserving
  methods for Hamiltonian systems", *J. Comput. Phys.* **472**, 111697
  (2023),
  [doi:10.1016/j.jcp.2022.111697](https://doi.org/10.1016/j.jcp.2022.111697).
* **Digital waveguides** (the Viola Organista's and the Hurdy-Gurdy's bowed strings): Smith
  (1987, 1992); *Physical Audio Signal Processing*.
* **Fractional delay lines** (the Leslie's Doppler shift, the bowed
  strings' waveguides, the Pyrophone's flame delay): T. I. Laakso, V. Välimäki,
  M. Karjalainen and U. K. Laine, "Splitting the unit delay",
  *IEEE Signal Process. Mag.* **13**(1),
  30–60 (1996), [doi:10.1109/79.482137](https://doi.org/10.1109/79.482137).
  Forte's delay lines interpolate with a Catmull–Rom cubic (§3).
* **polyBLEP anti-aliasing** (the Huygens Keyboard's sawtooth): introduced
  in V. Välimäki and A. Huovilainen, "Antialiasing oscillators in
  subtractive synthesis", *IEEE Signal Process. Mag.* **24**(2), 116–125
  (2007), [doi:10.1109/MSP.2007.323276](https://doi.org/10.1109/MSP.2007.323276),
  after the band-limited impulse trains of T. Stilson and J. O. Smith,
  "Alias-free synthesis of classic analog waveforms", *Proc. ICMC 1996*,
  Hong Kong, pp. 332–335; developed further in V. Välimäki,
  J. Pekonen and J. Nam, "Perceptually informed synthesis of bandlimited
  classical waveforms using integrated polynomial interpolation",
  *J. Acoust. Soc. Am.* **131**(1), 974–986 (2012),
  [doi:10.1121/1.3651227](https://doi.org/10.1121/1.3651227).
* **Soundboard and room as impulse responses** (`shared/impulses.js`):
  commuted synthesis, Smith (1993), Karjalainen, Välimäki & Jánosy (1993)
  and Smith & Van Duyne (1995); synthetic reverberation, Moorer (1979).
* **The Web Audio API and AudioWorklet**: every engine runs in an
  `AudioWorkletProcessor`. P. Adenot and H. Choi (eds.), *Web Audio API*,
  W3C Recommendation, 17 June 2021,
  <https://www.w3.org/TR/2021/REC-webaudio-20210617/>; the current draft is
  *Web Audio API 1.1*, <https://www.w3.org/TR/webaudio/>.

## 3. Algorithms and data in Forte's shared code

| where | what | source and licence |
|---|---|---|
| `shared/linalg.js` `symEig` | Householder tridiagonalisation and the implicit QL algorithm (`tred2`, `tql2`) for symmetric eigenproblems | Ported from **JAMA: A Java Matrix Package** by J. Hicklin, C. Moler and P. Webb (The MathWorks) and R. F. Boisvert, B. Miller, R. Pozo and K. Remington (NIST), <https://math.nist.gov/javanumerics/jama/>, released to the public domain. JAMA's algorithms are those of the Wilkinson–Reinsch *Handbook* used in EISPACK: R. S. Martin, C. Reinsch and J. H. Wilkinson, "Householder's tridiagonalization of a symmetric matrix", *Numer. Math.* **11**, 181–195 (1968), [doi:10.1007/BF02161841](https://doi.org/10.1007/BF02161841); H. Bowdler, R. S. Martin, C. Reinsch and J. H. Wilkinson, "The QR and QL algorithms for symmetric matrices", *Numer. Math.* **11**, 293–306 (1968), [doi:10.1007/BF02166681](https://doi.org/10.1007/BF02166681); B. T. Smith et al., *Matrix Eigensystem Routines — EISPACK Guide*, LNCS 6 (Springer, 1976), [doi:10.1007/3-540-07546-1](https://doi.org/10.1007/3-540-07546-1). |
| `shared/linalg.js` `genEig`, `cholesky` | K x = λ M x reduced to standard form with the Cholesky factor of M | R. S. Martin and J. H. Wilkinson, "Reduction of the symmetric eigenproblem Ax = λBx and related problems to standard form", *Numer. Math.* **11**, 99–110 (1968), [doi:10.1007/BF02165306](https://doi.org/10.1007/BF02165306). |
| `shared/dsp.js` `modeCoeffs` | impulse-invariant two-pole modal resonator | Smith, *PASP*, "Impulse invariant method" (§2). |
| `shared/dsp.js` `Biquad` | low-pass, high-pass, band-pass (0 dB peak), notch and peaking biquads | R. Bristow-Johnson's "Cookbook formulae for audio EQ biquad filter coefficients", published as *Audio EQ Cookbook*, W3C Working Group Note, 8 June 2021, ed. R. Toy, "adapted from Audio-EQ-Cookbook.txt, by Robert Bristow-Johnson, with permission", <https://www.w3.org/TR/audio-eq-cookbook/> (W3C document licence). |
| `shared/dsp.js` `DCBlock` | DC blocker y[n] = x[n] − x[n−1] + R y[n−1] | J. O. Smith, *Introduction to Digital Filters with Audio Applications*, "DC blocker", <https://ccrma.stanford.edu/~jos/filters/DC_Blocker.html>. |
| `shared/dsp.js` `Delay` (and the same cubic in the organ's Leslie and the bowed strings) | fractional delay line with cubic interpolation | The Catmull–Rom spline: E. Catmull and R. Rom, "A class of local interpolating splines", in *Computer Aided Geometric Design* (Academic Press, 1974), pp. 317–326, [doi:10.1016/B978-0-12-079050-0.50020-5](https://doi.org/10.1016/B978-0-12-079050-0.50020-5). Fractional delay in general: Laakso et al. (1996). |
| `shared/impulses.js` `roomIR` | the shell's room: three bands of exponentially decaying noise, the more low-passed ones ringing longer, after a 14 ms pre-delay | Moorer (1979), who found that synthetic impulse responses made of exponentially decaying Gaussian noise, filtered for the desired roll-off, sounded like natural halls. |
| `shared/impulses.js` `soundboardIR` | the Ribbon Piano's soundboard: hundreds of randomly placed, decaying modes under a radiation curve, applied as an impulse response | The commuted-synthesis idea of Smith (1993), Karjalainen, Välimäki & Jánosy (1993) and Smith & Van Duyne (1995). |
| `shared/impulses.js` `rng` | seeded pseudo-random numbers | **Mulberry32**, by Tommy Ettinger (2017), dedicated to the public domain under CC0, <https://gist.github.com/tommyettinger/46a874533244883189143505d203312c>. |
| `shared/shell.js`, `shared/views.js` | room reverb (`ConvolverNode`), limiter (`DynamicsCompressorNode`), tone (`BiquadFilterNode`), live spectrum (`AnalyserNode`, a Blackman-windowed FFT) | The browser's built-in nodes, as specified in the *Web Audio API* (§2). |
| `tools/audio-util.mjs` `webAudioIR` | offline demo renders scale impulse responses as the pages' `ConvolverNode`s do | The *Web Audio API*'s normalisation algorithm, `calculateNormalizationScale` (GainCalibration 0.00125, MinPower 0.000125, × 44100 / sample rate), <https://www.w3.org/TR/webaudio/#dom-convolvernode-normalize>. |
| `tools/audio-util.mjs` `fft`, `convolve` | iterative radix-2 FFT and FFT convolution | J. W. Cooley and J. W. Tukey, "An algorithm for the machine calculation of complex Fourier series", *Math. Comp.* **19**(90), 297–301 (1965), [doi:10.1090/S0025-5718-1965-0178586-1](https://doi.org/10.1090/S0025-5718-1965-0178586-1). |
| `tools/loudness.mjs` | K-weighting (high shelf, then high-pass) at 48 kHz, 400 ms blocks overlapping by 75 %, loudness = −0.691 + 10 log₁₀(power); target −23 LUFS | Recommendation **ITU-R BS.1770**, "Algorithms to measure audio programme loudness and true-peak audio level" (BS.1770-5, 11/2023), <https://www.itu.int/rec/R-REC-BS.1770>; the filter coefficients are the Recommendation's. The −23 LUFS target is that of **EBU R 128**, "Loudness normalisation and permitted maximum level of audio signals", <https://tech.ebu.ch/publications/r128>. |
| `tools/reeds-slot-table.mjs` | Laplace's equation in the Reed Piano's pickup slot by successive over-relaxation, on nested grids | S. P. Frankel, "Convergence rates of iterative treatments of partial differential equations", *Math. Tables Aids Comput.* **4**(30), 65–75 (1950), [doi:10.1090/S0025-5718-1950-0046149-3](https://doi.org/10.1090/S0025-5718-1950-0046149-3); D. Young, "Iterative methods for solving partial difference equations of elliptic type", *Trans. Amer. Math. Soc.* **76**(1), 92–111 (1954), [doi:10.1090/S0002-9947-1954-0059635-7](https://doi.org/10.1090/S0002-9947-1954-0059635-7). |
| `blackhole/src/qnm.js`, `tools/qnm-table.mjs` | Kerr quasinormal modes by continued fractions (with the n-th inversion for overtones), solved by complex secant iteration | S. A. Teukolsky, "Perturbations of a rotating black hole. I. Fundamental equations for gravitational, electromagnetic, and neutrino-field perturbations", *Astrophys. J.* **185**, 635 (1973), [doi:10.1086/152444](https://doi.org/10.1086/152444); E. W. Leaver, "An analytic representation for the quasi-normal modes of Kerr black holes", *Proc. R. Soc. Lond. A* **402**, 285–298 (1985), [doi:10.1098/rspa.1985.0119](https://doi.org/10.1098/rspa.1985.0119). Checked against E. Berti, V. Cardoso and C. M. Will, *Phys. Rev. D* **73**, 064030 (2006), [doi:10.1103/PhysRevD.73.064030](https://doi.org/10.1103/PhysRevD.73.064030), and E. Berti, V. Cardoso and A. O. Starinets, "Quasinormal modes of black holes and black branes", *Class. Quantum Grav.* **26**, 163001 (2009), [doi:10.1088/0264-9381/26/16/163001](https://doi.org/10.1088/0264-9381/26/16/163001). |

The WebAssembly and the plugins also compile in open-source libraries: Eigen, fdlibm (as V8
computes it), Emscripten's C library, and for the plugins CLAP, clap-wrapper, the VST 3 SDK,
Apple's AudioUnitSDK, RtAudio, RtMidi and CHOC. Their licences and notices are in
[THIRD-PARTY-NOTICES.md](https://github.com/jdthaler/forte/blob/live/THIRD-PARTY-NOTICES.md).

Other tools (`tools/gongs-modes.mjs`, `tools/bowed-tuning.mjs`,
`tools/lock-comparison.mjs`) compute tables from each instrument's own
model; their physics and sources are in the instrument READMEs.

## 4. Physical-modelling instruments and projects

Many instruments modelled the physics of sound before Forte, some of them
the same keyboards. This list is meant to be broad and fair. It includes
only products and projects that their developers describe as physical,
acoustic, component or circuit modelling, and marks as *hybrid* those that
combine modelling with recorded samples. Years are first releases where a
source confirms them. Discontinued products link to a review or to
Wikipedia.

### Hardware instruments

* **Yamaha VL1** (Yamaha; introduced 1993, shown in the US at NAMM 1994):
  "Virtual Acoustic" synthesis, digital-waveguide models of wind, brass and
  string instruments played with a breath controller. Yamaha began the work
  in 1989, under an agreement with Stanford University, which owned the
  waveguide patents. The VL family grew to include the VL7, VL1-m and
  VL70-m, and a VL engine in the EX5.
  [Yamaha Synth: the history of the VL1](https://yamahasynth.com/learn/synth-programming/synth-history-dom-sigalas-on-vl1/);
  [Smith, *PASP*: Digital waveguide models](https://ccrma.stanford.edu/~jos/pasp/Digital_Waveguide_Models_I.html);
  [Wikipedia: digital waveguide synthesis](https://en.wikipedia.org/wiki/Digital_waveguide_synthesis).
* **Sondius** (Stanford Office of Technology Licensing and CCRMA,
  1993–1997): a project to commercialise physical modelling. It produced
  the SynthBuilder modelling tool and models for about two thirds of the
  General MIDI set. In 1997 Yamaha and Stanford combined their patents in
  the Sondius-XG portfolio, and the team spun out as Staccato Systems,
  which Analog Devices acquired in 2000. P. Scandalis, J. O. Smith III and
  N. Porcaro, ["Sondius physical modeling work at CCRMA 1993–1997"](https://www.moforte.com/wp-content/uploads/2024/05/Sondius-Physical-Modeling-Work-at-CCRMA-1993-1997.pdf),
  CCRMA Open House, 2024.
* **Korg Prophecy** (1995) and **Korg Z1** (1997): Korg's MOSS
  (Multi-Oscillator Synthesis System). The Prophecy's oscillator types
  include brass, reed and plucked-string physical models; the Z1 added
  bowed-string, electric-piano and organ models.
  [Prophecy](https://en.wikipedia.org/wiki/Korg_Prophecy) ·
  [Z1](https://en.wikipedia.org/wiki/Korg_Z1).
* **Korg OASYS PCI** (1999): a DSP card for computers with physical models
  of plucked strings, a reed electric piano and a tonewheel organ, among
  others. [Wikipedia](https://en.wikipedia.org/wiki/Korg_OASYS_PCI).
* **Korg OASYS** (2005) and **Kronos** (2011) workstations: the STR-1
  plucked-string physical model and the CX-3 tonewheel-organ model.
  [Kronos engines](https://www.korg.com/us/products/synthesizers/kronos_x/page_5.php).
* **Technics SX-WSA1** (1995), *hybrid*: "acoustic modelling", in which
  sampled excitations drive modelled resonators (strings, tubes, plates,
  membranes). [Sound On Sound review](https://www.soundonsound.com/reviews/technics-sx-wsa1).
* **Roland V-Piano** (2009): a modelled piano whose notes evolve "without
  requiring samples". Roland's later digital pianos describe their engines
  as "SuperNATURAL Piano Modeling", "PureAcoustic Piano Modeling" and
  "Piano Reality Modeling".
  [V-Piano](https://www.roland.com/global/products/v-piano/) ·
  [V-Piano Grand](https://www.roland.com/global/products/v-piano_grand/) ·
  [HP704](https://www.roland.com/global/products/hp704/) ·
  [LX708](https://www.roland.com/global/products/lx708/) ·
  [GP-9](https://www.roland.com/global/products/gp-9/).
* **Roland V-Accordion** (from 2004): accordions simulated by "Physical
  Behavior Modeling". [FR-7](https://www.roland.com/global/products/fr-7/).
* **Nord (Clavia)** organs: the C1 and C2D combo organs and the organ
  sections of the Nord Electro and Stage simulate a B3 tonewheel organ
  (and Vox and Farfisa combo organs); Nord's pianos and pipe organs are
  sampled, so they are not listed here.
  [C2D](https://www.nordkeyboards.com/legacy-products/nord-c2d/) ·
  [Electro 6](https://www.nordkeyboards.com/legacy-products/nord-electro-6/).
* **Hammond (Hammond Suzuki)** digital organs: the current XK-7D describes
  its sound engine as "Physical-Modeled" replication of the tonewheel
  generator chain. [XK-7D](https://hammondorganco.com/xk-7d).
* **Viscount Physis** organs: physical modelling applied to organ pipes.
  [Physis technology](https://www.viscountinstruments.com/about-us/technology/physis-tecnology/).
* **Haken Continuum** and its **EaganMatrix** sound engine (Haken Audio),
  also used in the **Expressive E Osmose**: a modular engine whose modules
  include modal and waveguide physical models.
  [Continuum](https://en.wikipedia.org/wiki/Continuum_Fingerboard) ·
  [Osmose](https://www.expressivee.com/2-osmose).
* **Arturia MicroFreak** (2019): a hybrid synthesizer with a Karplus–Strong
  oscillator mode and seven modes from Mutable Instruments, including a
  modal resonator. [MicroFreak](https://www.arturia.com/products/hardware-synths/microfreak/overview).

### Commercial software

* **Modartt** (France).
  * **Pianoteq** (first released 26 August 2006): pianos as real-time
    physical models of strings, hammers, soundboard and sympathetic
    resonance. On the same engine, Modartt also models instruments close
    to Forte's: tine and reed electric pianos (Vintage Tines and Vintage
    Reeds; [Electric](https://www.modartt.com/electric)); the Hohner
    Clavinet D6, Pianet N and T and Electra-Piano
    ([Hohner collection](https://www.modartt.com/hohner_collection)); a
    Yamaha CP-80 electric grand ([KIViR](https://www.modartt.com/kivir));
    harpsichords ([harpsichord](https://www.modartt.com/harpsichord));
    vibraphones ([vibes](https://www.modartt.com/vibes)); celesta,
    glockenspiel and toy piano ([Celeste](https://www.modartt.com/celeste));
    tubular bells, church bells and carillons
    ([free instruments](https://www.modartt.com/pianoteq_free)); and, in
    2026, the Champagne Flute, a physical model of champagne glasses.
    [Pianoteq](https://www.modartt.com/pianoteq) ·
    [Modartt news](https://www.modartt.com/news).
  * **Organteq** (2019): a physically modelled pipe organ, with flue and
    reed pipes. [Organteq](https://www.modartt.com/organteq).
* **Applied Acoustics Systems** (Montréal; founded 1998 by Marc-Pierre
  Verge and Philippe Dérogis). [About AAS](https://www.applied-acoustics.com/about/).
  * **Tassman** (2000, discontinued): a modular synthesizer of exciters
    (mallet, plectrum, bow) and resonators (beam, string, plate, tube).
    [Sound On Sound review](https://www.soundonsound.com/reviews/applied-acoustic-systems-tassman-v12).
  * **Lounge Lizard** (2002): electric pianos modelled from hammer, tine or
    reed, damper and pickup. [Lounge Lizard EP-5](https://www.applied-acoustics.com/lounge-lizard-ep-5/).
  * **String Studio** (2005): bowed, plucked and struck string models with
    frets, dampers and soundboard. [String Studio VS-3](https://www.applied-acoustics.com/string-studio-vs-3/).
  * **Strum** (2008): modelled acoustic and electric guitars.
    [Strum GS-2](https://www.applied-acoustics.com/strum-gs-2/).
  * **Chromaphone** (2011): two coupled resonators (beams, marimba bars,
    tubes, strings, membranes, plates). [Chromaphone 3](https://www.applied-acoustics.com/chromaphone-3/).
  * **Ableton Live**'s physical-modelling instruments Collision (mallet
    percussion), Electric (electric piano) and Tension (strings), and its
    Corpus resonator effect, were developed with AAS.
    [Live instrument reference](https://www.ableton.com/en/live-manual/12/live-instrument-reference/) ·
    [Corpus](https://www.ableton.com/en/live-manual/12/live-audio-effect-reference/).
* **Apple, Logic Pro.** **Sculpture** (Logic Pro 7, 2004) "generates sounds
  by simulating the physical properties of a vibrating string", which Apple
  calls component modelling; the **Vintage Electric Piano** (Rhodes,
  Wurlitzer and Hohner Electra-Piano), **Vintage Clav** (Hohner D6) and
  **Vintage B3** (tonewheel organ and rotor cabinet) also use component
  modelling.
  [Logic Pro 7 announcement](https://www.apple.com/newsroom/2004/09/29Apple-Introduces-Logic-Pro-7-Logic-Express-7/) ·
  [Sculpture](https://support.apple.com/guide/logicpro/sculpture-overview-lgsia12ea31/mac) ·
  [Vintage Electric Piano](https://support.apple.com/guide/logicpro/vintage-electric-piano-overview-lgsifc1ba323/mac) ·
  [Vintage Clav](https://support.apple.com/guide/logicpro/vintage-clav-overview-lgsifbfa34b9/mac) ·
  [Vintage B3](https://support.apple.com/guide/logicpro/vintage-b3-overview-lgsia12bc0e/mac).
* **Physical Audio** (London; C. J. Webb, M. Ducceschi and S. Bilbao,
  growing out of the NESS project at Edinburgh): finite-difference and
  modal models in real time. Plugins include Modus (collisions of strings,
  plates, springs and rattles), Derailer (strings and bars with nonlinear
  spring connections), Preparation (prepared strings), Tetrad (modelled
  plates with granular synthesis, *hybrid*) and a modal model of a spring
  reverb. [About](https://physicalaudio.co.uk/about/) ·
  [Products](https://physicalaudio.co.uk/products/).
* **Audio Modeling** (Italy), **SWAM**: real-time physical models of solo
  strings, woodwinds and brass; the engine was in development from 2009,
  and the company was founded in 2017.
  [About](https://audiomodeling.com/about) ·
  [SWAM Violin](https://audiomodeling.com/products/swam-violin).
* **Arturia** (V Collection). Described by Arturia as physical modelling:
  **Piano V**, **Stage-73 V** (Rhodes), **Wurli V** (by 2012),
  **Clavinet V** and **B-3 V**. Circuit modelling: **VOX Continental V**
  (by 2014) and **Farfisa V** (2016). *Hybrid* (samples with circuit
  modelling): **CP-70 V**.
  [Piano V](https://www.arturia.com/products/software-instruments/piano-v/overview) ·
  [Stage-73 V](https://www.arturia.com/products/software-instruments/stage-73-v/overview) ·
  [Wurli V](https://www.arturia.com/products/software-instruments/wurli-v/overview) ·
  [Clavinet V](https://www.arturia.com/products/software-instruments/clavinet-v/overview) ·
  [B-3 V](https://www.arturia.com/products/software-instruments/b-3-v/overview) ·
  [CP-70 V](https://www.arturia.com/products/software-instruments/cp-70-v/overview).
* **GSi** (Genuine Soundware and Instruments, Italy): **VB3** (2006; VB3-II,
  2023), a simulated tonewheel organ with rotary speaker; **Model D6**
  (2023), a physically modelled Clavinet; **Cantoria**, a modelled Baroque
  pipe organ; **Free Vibes**, a modelled vibraphone; **Piano Studio**
  (2026), a modelled grand piano; and component-modelled combo organs.
  [VB3-II](https://www.genuinesoundware.com/?a=showproduct&b=44) ·
  [Model D6](https://www.genuinesoundware.com/?a=showproduct&b=58) ·
  [Cantoria](https://www.genuinesoundware.com/?a=showproduct&b=68) ·
  [Free Vibes](https://www.genuinesoundware.com/?a=showproduct&b=69) ·
  [Piano Studio](https://www.genuinesoundware.com/?a=showproduct&b=75).
* **Native Instruments**: **B4** (2000) and **B4 II**, a modelled tonewheel
  organ with rotary speaker, no longer sold
  ([Sound On Sound review of B4 II](https://www.soundonsound.com/reviews/native-instruments-b4-ii));
  **Reaktor Prism** (reviewed in 2010), an exciter driving Reaktor's modal bank
  ([Prism](https://www.native-instruments.com/products/reaktor-prism)). NI's
  Kontakt instruments are sampled and not listed.
* **IK Multimedia**: **Hammond B-3X**, a physically modelled B-3 and Leslie
  ([B-3X](https://www.ikmultimedia.com/products/hammondb3x)); **MODO BASS**,
  real-time modal synthesis of electric, fretless and double basses
  ([MODO BASS 2](https://www.ikmultimedia.com/products/modobass2)).
* **Madrona Labs Kaivo**, *hybrid*: granular synthesis feeding modelled
  resonators and bodies. [Kaivo](https://madronalabs.com/products/kaivo).

### Open-source and research toolkits

* **The Synthesis ToolKit (STK)**, Perry R. Cook and Gary P. Scavone
  (distributed since 1996; MIT-style licence): C++ classes for waveguide,
  modal and other instrument models (plucked and bowed strings, clarinet,
  modal bars and more). P. R. Cook and G. P. Scavone, "The Synthesis
  ToolKit (STK)", *Proc. ICMC 1999*, Beijing,
  [paper](https://ccrma.stanford.edu/software/stk/papers/stkicmc99.pdf).
  <https://ccrma.stanford.edu/software/stk/>. Its models also run in
  **ChucK** (Ge Wang and Perry R. Cook, 2003; MIT/GPL),
  <https://chuck.stanford.edu/doc/reference/ugens-stk.html>.
* **Faust** (GRAME, since 2002; LGPL) and its **physical-modelling
  library** `physmodels.lib` (R. Michon, P.-A. Grumiaux and Y. Orlarey,
  2016–): waveguide, mass–spring and modal building blocks, strings, bowed
  strings, winds and modal percussion, with `mesh2faust` to turn
  finite-element meshes into modal models.
  <https://faustlibraries.grame.fr/libs/physmodels/>. Y. Orlarey, D. Fober
  and S. Letz, "FAUST: an efficient functional approach to DSP
  programming", in *New Computational Paradigms for Computer Music*
  (Delatour, 2009), pp. 65–96, <https://hal.science/hal-02159014>;
  R. Michon, S. R. Martin and J. O. Smith, "MESH2FAUST: a modal physical
  model generator for the Faust programming language — application to bell
  modeling", *Proc. ICMC 2017*, <https://hal.science/hal-03162901>;
  R. Michon, J. O. Smith, C. Chafe, G. Wang and M. Wright, "The Faust
  physical modeling library: a modular playground for the digital
  luthier", *International Faust Conference*, 2018,
  <https://hal.science/hal-02158706>; R. Michon, J. O. Smith, M. Wright,
  C. Chafe, J. Granzow and G. Wang, "Mobile music, sensors, physical
  modeling, and digital fabrication: articulating the augmented mobile
  instrument", *Appl. Sci.* **7**(12), 1311 (2017),
  [doi:10.3390/app7121311](https://doi.org/10.3390/app7121311).
* **Modalys** (IRCAM): the descendant of MOSAIC (Adrien; Morrison &
  Adrien, §1), a modal-synthesis environment of connected vibrating
  objects. Free to download with an IRCAM Forum account since version 3.7
  (2022), but not open source.
  <https://forum.ircam.fr/projects/detail/modalys/>.
* **Csound** (Barry Vercoe and others; LGPL): waveguide opcodes (`pluck`,
  `repluck`, `wgpluck`, `wgpluck2`, `wgbow`, `wgbowedbar`, `wgbrass`,
  `wgclar`, `wgflute`, `wguide1`, `wguide2`), `streson`, the
  finite-difference `barmodel` and `prepiano` (a prepared piano string, by
  Stefan Bilbao and John ffitch), and optional STK opcodes.
  [Waveguide opcodes](https://csound.com/docs/manual/SiggenWavguide.html) ·
  [prepiano](https://csound.com/docs/manual/prepiano.html) ·
  [STK opcodes](https://csound.com/docs/manual/STKTop.html).
* **Pure Data and Max.** **pmpd** (Cyrille Henry, 2003–; GPL-3.0),
  mass–link physical modelling for Pd, <https://github.com/ch-nry/pd-pmpd>;
  C. Henry, "Physical modeling for Pure Data (pmpd) and real time
  interaction with an audio synthesis", *Proc. SMC 2004*, Paris,
  [doi:10.5281/zenodo.849205](https://doi.org/10.5281/zenodo.849205).
  **PeRColate** (Dan Trueman and R. Luke DuBois), largely a port of the STK
  to Max/MSP, now maintained by Cycling '74 under its own non-commercial
  licence, <https://github.com/Cycling74/percolate>. **mi-gen~** (James
  Leonard; GPL-3.0), a mass-interaction toolbox for Max's gen~,
  <https://github.com/mi-creative/mi-gen>; J. Leonard and J. Villeneuve,
  "mi-gen~: an efficient and accessible mass-interaction sound synthesis
  toolbox", *Proc. SMC 2019*, <https://hal.science/hal-02270792>.
* **SuperCollider** `sc3-plugins` (GPL): `DWGPlucked` and `DWGBowed`
  (Victor Bombi), digital-waveguide strings, and `OteyPiano`, a waveguide
  piano after Clayton Otey. <https://supercollider.github.io/sc3-plugins/> ·
  [DWGPlucked](https://doc.sccode.org/Classes/DWGPlucked.html).
* **Mutable Instruments** (Émilie Gillet; firmware MIT-licensed):
  **Elements** (2015), an exciter (bow, blow, strike) driving a modal
  resonator of 64 state-variable filters; **Rings** (2015), a modal
  resonator, sympathetic strings as a comb-filter network, and a string
  with dispersion and nonlinearity; and **Plaits** (2018), with
  Karplus–Strong and modal engines.
  [Elements](https://pichenettes.github.io/mutable-instruments-documentation/modules/elements/) ·
  [Rings](https://pichenettes.github.io/mutable-instruments-documentation/modules/rings/) ·
  [Plaits](https://pichenettes.github.io/mutable-instruments-documentation/modules/plaits/) ·
  [source code](https://github.com/pichenettes/eurorack).
* **setBfree** (Robin Gareus and Will Panther, from Fredrik Kilander's
  Beatrix; first release 2012; GPL-2.0): a tonewheel organ with overdrive
  and rotary speaker. <https://setbfree.org/>.
* **GENESIS** (ACROE, Grenoble): a musician-oriented environment for
  CORDIS-ANIMA mass-interaction models. N. Castagné and C. Cadoz,
  "GENESIS: a friendly musician-oriented environment for mass-interaction
  physical modeling", *Proc. ICMC 2002*, Gothenburg, pp. 330–337,
  <https://hal.science/hal-00481717>.
* **Synth-A-Modeler** (Edgar Berdahl, with Peter Vasil): compiles
  mass-interaction, waveguide and modal model descriptions into Faust.
  E. Berdahl and J. O. Smith, "An introduction to the Synth-A-Modeler
  compiler: for modular and open-source sound synthesis using physical
  models", *Linux Audio Conference 2012*,
  <http://lac.linuxaudio.org/2012/papers/34.pdf>;
  <https://github.com/eberdahl/Synth-A-Modeler>.
* **NESS — Next Generation Sound Synthesis** (Stefan Bilbao, University of
  Edinburgh with EPCC; European Research Council Starting Grant,
  2012–2016): large-scale finite-difference synthesis on GPUs, including
  brass, bowed strings, guitars, nonlinear cymbals and gongs, and 3D rooms.
  <https://www.ness.music.ed.ac.uk/>.

### In the browser

* **Pink Trombone** (Neil Thapen, 2017; MIT licence): a speech synthesiser
  whose vocal tract is a 44-segment tube with scattering junctions, in the
  Kelly–Lochbaum tradition, running in Web Audio.
  <https://dood.al/pinktrombone/>.
* **Tone.js** (Yotam Mann; MIT): `PluckSynth`, Karplus–Strong string
  synthesis.
  <https://tonejs.github.io/docs/15.1.22/classes/PluckSynth.html>.
* **Faust on the web**: the Faust IDE, <https://faustide.grame.fr/>, and
  `faustwasm`, which compiles Faust (including `physmodels.lib`) to
  WebAssembly AudioWorklets, <https://github.com/grame-cncm/faustwasm>.
* **WebChucK**: ChucK, and with it the STK models, compiled to WebAssembly
  and run in an AudioWorklet. <https://chuck.stanford.edu/webchuck/>.

## 5. Sonification and science-outreach precedents

Forte's "new physics" keyboards play what scientists have long listened
to. A few precedents (the instrument READMEs have the physics and the
data):

* **Gravitational waves.** LIGO turned its first detection, GW150914, into
  sound when it announced it on 11 February 2016: "The sound of two black
  holes colliding" (Caltech/MIT/LIGO Lab),
  <https://www.ligo.caltech.edu/video/ligo20160211v2>. The Gravitational
  Wave Open Science Center publishes the audio files,
  <https://gwosc.org/audio/>. Earlier and alongside: M. Favata's *Sounds of
  Spacetime*, <https://www.soundsofspacetime.org/>; *Black Hole Hunter*, a
  listening game from Cardiff University's gravitational physics group,
  <http://www.blackholehunter.org/>; and J. Levin, "The sound the universe
  makes", TED 2011,
  <https://www.ted.com/talks/janna_levin_the_sound_the_universe_makes>.
  The Black-Hole Keyboard plays the ringdown, the last part of such a
  signal.
* **NASA and Chandra.** *A Universe of Sound*, the Chandra X-ray Center's
  sonification programme with SYSTEM Sounds, running since 2020,
  <https://chandra.si.edu/sound/>, including the pressure waves in the
  Perseus galaxy cluster scaled up into hearing range (May 2022),
  <https://chandra.si.edu/photo/2022/sonify5/>.
* **The Sun and the stars.** Stanford's *The Singing Sun*: solar
  oscillations measured by SOHO/MDI, processed into sound by
  A. Kosovichev, <https://solar-center.stanford.edu/singing/>; S. J. Hale,
  *BiSON — Sounds of the Sun* (University of Birmingham, 2015),
  <https://epapers.bham.ac.uk/id/eprint/2090/>; and the Kepler mission's
  "orchestra" of Sun-like stars (University of Birmingham, 2011),
  <https://www.birmingham.ac.uk/news-archive/2011/kepler-listens-to-an-orchestra-of-solar-type-stars>.
  These were the starting point for the Star Keyboard.
* **Quantum music.** *Quantum Music* (2015–2018), a Creative Europe
  project coordinated by the Institute of Musicology SASA in Belgrade with
  physicists and musicians, which built a "hybrid piano",
  <https://quantummusic.org/beyond-quantum-music/about-us/>; and
  E. R. Miranda (ed.), *Quantum Computer Music: Foundations, Methods and
  Advanced Concepts* (Springer, 2022),
  [doi:10.1007/978-3-031-13909-3](https://doi.org/10.1007/978-3-031-13909-3).
* **Particle physics.** *Quantizer* (MIT Media Lab with ATLAS, first
  performed at the Montreux Jazz Festival in 2016) turns live collision data
  from the ATLAS detector into music: J. Cherston, E. Hill, S. Goldfarb and
  J. A. Paradiso, "Musician and Mega-Machine: Compositions Driven by
  Real-Time Particle Collision Data from the ATLAS Detector", NIME 2016,
  <https://nime.org/proc/cherston2016>. The Storage Ring plays the
  accelerator rather than the collisions: a kicked bunch heard through its
  beam pickup. RF Cavity Bells plays the accelerator's cavities: the modes
  a bunch leaves ringing in a superconducting TESLA cavity (B. Aune et al.,
  "Superconducting TESLA cavities", *Phys. Rev. ST Accel. Beams* **3**,
  092001 (2000),
  [doi:10.1103/PhysRevSTAB.3.092001](https://doi.org/10.1103/PhysRevSTAB.3.092001)).
  Collider Showers plays the collisions' showers themselves, through the
  sound they make: the heat a shower leaves in a calorimeter's crystal rings
  it (the thermo-acoustic effect, measured in a resonant bar rung by an
  electron beam by B. Buonomo et al., *Astropart. Phys.* **24**, 65 (2005),
  [arXiv:gr-qc/0505009](https://arxiv.org/abs/gr-qc/0505009)). *LHCsound*
  (L. Asquith and others, ATLAS, 2010) sonified ATLAS events as data.
* **Whistlers and the magnetosphere's radio.** Whistlers were heard before
  they were understood: H. Barkhausen's field telephones in 1919, T. L.
  Eckersley's D/√f law in 1935, and L. R. O. Storey's explanation in 1953,
  lightning's crack dispersed along the Earth's field lines (*Phil. Trans.
  R. Soc. A* **246**, 113 (1953),
  [doi:10.1098/rsta.1953.0011](https://doi.org/10.1098/rsta.1953.0011)).
  Recordings of whistlers, tweeks and chorus have been played as music ever
  since, and receivers such as HamSCI's Whistler Catcher make them; the
  Contralogic *Whistler* plugin imitates them with noise through resonant
  filters. Whistlers computes them: every key a field line, its whistler
  the cold-plasma group delay along it.
* **The sound of the Big Bang.** M. Whittle's *Big Bang Acoustics*
  (University of Virginia, from 2004) plays the microwave background's
  power spectrum as sound, and the first million years as a falling roar;
  J. G. Cramer's *The Sound of the Big Bang* (University of Washington, with
  WMAP's data in 2003 and Planck's in 2013),
  <https://faculty.washington.edu/jcramer/BBSound_2013.html>, does the same
  from the measured spectrum. The Early Universe integrates each note's
  waves from the cosmological parameters instead (C.-P. Ma and
  E. Bertschinger, *Astrophys. J.* **455**, 7 (1995),
  [arXiv:astro-ph/9506072](https://arxiv.org/abs/astro-ph/9506072)), so its
  knobs change the universe; W. Hu and M. White, "The cosmic symphony",
  *Scientific American* **290** (2), 44 (2004), describes the peaks as a
  harmonic series.
* **Cyclotron radiation from single electrons.** B. Monreal and
  J. A. Formaggio proposed hearing each tritium decay electron by its
  cyclotron radiation (*Phys. Rev. D* **80**, 051301 (2009),
  [doi:10.1103/PhysRevD.80.051301](https://doi.org/10.1103/PhysRevD.80.051301)),
  and Project 8 first did it with krypton-83m (D. M. Asner et al.,
  *Phys. Rev. Lett.* **114**, 162501 (2015),
  [doi:10.1103/PhysRevLett.114.162501](https://doi.org/10.1103/PhysRevLett.114.162501));
  its chirping tracks are drawn as spectrograms, not played. We know of no
  instrument built on them before Project 8, which computes each electron's
  radiation, bounce and collisions and moves its frequencies to the key.
* **Broadband axion detection.** Y. Kahn, B. R. Safdi and J. Thaler proposed
  reading dark-matter axions as a flux through a pickup in a toroidal
  magnet's hole (*Phys. Rev. Lett.* **117**, 141801 (2016),
  [doi:10.1103/PhysRevLett.117.141801](https://doi.org/10.1103/PhysRevLett.117.141801)),
  and ABRACADABRA-10 cm searched with it (J. L. Ouellet et al., *Phys. Rev.
  Lett.* **122**, 121802 (2019),
  [doi:10.1103/PhysRevLett.122.121802](https://doi.org/10.1103/PhysRevLett.122.121802));
  the axion field's Rayleigh statistics are J. W. Foster, N. L. Rodd and
  B. R. Safdi's (*Phys. Rev. D* **97**, 123006 (2018),
  [doi:10.1103/PhysRevD.97.123006](https://doi.org/10.1103/PhysRevD.97.123006)).
  We found no instrument or sonification built on such a signal before
  ABRACADABRA, which plays the experiment's flux, the halo's line and the
  SQUID's noise at each key's axion.
* **Atomic spectra as sound.** Hydrogen's Balmer lines scaled down into
  hearing are an old classroom demonstration, and data sonifications (the
  Chandra X-ray Center's, NASA's and ESA's) play astronomical spectra as
  chords or sweeps. We found no instrument that plays a spectrum from the
  atom's own rates: the Hydrogen Lamp's line strengths are Einstein
  coefficients and a radiative cascade (D. E. Osterbrock & G. J. Ferland,
  *Astrophysics of Gaseous Nebulae and Active Galactic Nuclei*, 2006; P. J.
  Storey & D. G. Hummer, *MNRAS* **272**, 41 (1995),
  [doi:10.1093/mnras/272.1.41](https://doi.org/10.1093/mnras/272.1.41)),
  played in slow motion so the cascade is heard, each line as wide as its
  levels' lifetimes.
* **Planets as sound.** SYSTEM Sounds (Matt Russo, Dan Tamayo and others,
  2017) sped TRAPPIST-1's planets up until their orbits were notes, a piano
  note struck once an orbit, and ESA's 2021 animation of TOI-178's resonant
  chain gave each planet a note at each orbit and half orbit. The transit
  light curve itself, the signal TESS (G. R. Ricker et al., *J. Astron.
  Telesc. Instrum. Syst.* **1**, 014003 (2015),
  [doi:10.1117/1.JATIS.1.1.014003](https://doi.org/10.1117/1.JATIS.1.1.014003))
  and Kepler search for, is drawn, not played; TESS plays it as the
  waveform, each orbit one cycle, with the limb darkening and photon noise
  that shape what the satellite records.
* **Particle detectors as instruments.** Collider Showers rings a calorimeter's crystals by
  the heat a shower leaves (the thermo-acoustic effect); CUORE plays the heat itself, as a
  cryogenic calorimeter reads it: the CUORE Collaboration's electro-thermal model of its
  bolometers ([arXiv:2205.04549](https://arxiv.org/abs/2205.04549)) with the thermistor of
  M. Carrettoni & M. Vignati, *JINST* **6**, P08007 (2011),
  [doi:10.1088/1748-0221/6/08/P08007](https://doi.org/10.1088/1748-0221/6/08/P08007), each
  key's calibration heater firing at the note's rate. No earlier instrument made from these
  pulses is known to us.
* **Trapped ions.** The Ion Chain plays the normal modes of a linear Coulomb crystal as
  D. F. V. James computes them ("Quantum dynamics of cold trapped ions with application to
  quantum computation", *Appl. Phys. B* **66**, 181–190 (1998),
  [doi:10.1007/s003400050373](https://doi.org/10.1007/s003400050373)), in W. Paul's
  radio-frequency trap (*Rev. Mod. Phys.* **62**, 531 (1990),
  [doi:10.1103/RevModPhys.62.531](https://doi.org/10.1103/RevModPhys.62.531)), with the
  linear–zigzag transition of J. P. Schiffer (*Phys. Rev. Lett.* **70**, 818 (1993),
  [doi:10.1103/PhysRevLett.70.818](https://doi.org/10.1103/PhysRevLett.70.818)) and the
  image-current detection and resistive cooling of D. J. Wineland and H. G. Dehmelt
  (*J. Appl. Phys.* **46**, 919 (1975), [doi:10.1063/1.321602](https://doi.org/10.1063/1.321602)).
  No earlier instrument made from these modes is known to us.
* **Synchronisation and mode locking in musical oscillators.**
  B. van der Pol and J. van der Mark, "Frequency demultiplication",
  *Nature* **120**, 363–364 (1927),
  [doi:10.1038/120363a0](https://doi.org/10.1038/120363a0) (the neon-lamp
  relaxation oscillator of the Huygens Keyboard and the Trautonium); O. Sala,
  "Synchronizing system for electrical musical instruments",
  [US 2,740,892](https://patents.google.com/patent/US2740892A/en) (1956), the
  Mixtur-Trautonium's relaxation oscillators locked to subharmonics of the
  played one, the instrument the Trautonium models, and after it Doepfer's
  [Trautonium modules](https://doepfer.de/traut/traut_e.htm) and Moog's
  [Subharmonicon](https://www.moogmusic.com/synthesizers/subharmonicon/)
  (2020); N. H. Fletcher, "Mode
  locking in nonlinearly excited inharmonic musical oscillators",
  *J. Acoust. Soc. Am.* **64**(6), 1566–1569 (1978),
  [doi:10.1121/1.382139](https://doi.org/10.1121/1.382139); M. Abel,
  S. Bergweiler and R. Gerhard-Multhaupt, "Synchronization of organ pipes:
  experimental observations and modeling", *J. Acoust. Soc. Am.*
  **119**(4), 2467–2475 (2006),
  [doi:10.1121/1.2170441](https://doi.org/10.1121/1.2170441); and, as music,
  N. Lem, "Sound in multiples: synchrony and interaction design using
  coupled-oscillator networks", *Proc. SMC 2019*,
  <https://www.smc2019.uma.es/articles/P3/P3_09_SMC2019_paper.pdf>.

## 6. Trademarks

Product and company names on this page (and elsewhere in Forte) are
trademarks or registered trademarks of their respective owners. They are
used only to identify and credit earlier work; Forte is not affiliated
with or endorsed by any of them.
