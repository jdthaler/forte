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

## Bubble Organ (`bubbles`): built

Now an instrument: see [bubbles/README.md](../bubbles/README.md), whose
*Prior art and references* carry this brief's research.

---

## Spring Keyboard (`springs`): built

Now an instrument: see [springs/README.md](../springs/README.md), whose
*Prior art and references* carry this brief's research.
