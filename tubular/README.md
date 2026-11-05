# Tubular Bells

Orchestral chimes: a row of brass tubes, 1½ inches across, hung by cords from a frame and struck
on their caps with a rawhide mallet. Each tube bends like a free bar, and the note you hear is
played by none of its modes. Modes 4, 5 and 6 lie close to 2 : 3 : 4, the 2nd, 3rd and 4th
harmonics of a note an octave below mode 4, and the ear hears that missing note: the **strike
note**. A felt-lined damper bar presses on every tube near its top until the pedal lifts it.

Every key is a tube cut to length, from the orchestral set's 18 (C4–F5) and, with **Full range**,
on down to a 5.1 m tube at A0 and up to a 29 cm one at C8. Each tube is solved as a Timoshenko
beam with the cap on its top end, struck by a Hertzian mallet, and heard through the air as a
line of dipoles reaching two microphones in front of the frame.

## The physics

### The tube

A chime is a thin-walled brass tube (cartridge brass: E = 110 GPa, ρ = 8530 kg/m³, ν = 0.375),
38.1 mm across with a 1.6 mm wall by default. It hangs from a cord near its top, so both ends are
free. The tube bends as a **Timoshenko beam**: its slenderness is high for the low modes, but its
high modes are short enough that shear and the rotary inertia of the cross-section matter. With
the deflection w and the section's rotation ψ, at angular frequency ω,

    κGA (w″ − ψ′) + ρAω² w = 0,    EI ψ″ + κGA (w′ − ψ) + ρIω² ψ = 0,

where A and I are the annulus's area and second moment, G = E/2(1 + ν), and κ is Cowper's (1966)
shear coefficient for a hollow circle (0.538 for the default tube). Solutions go as e^{λx} with
λ = ±α and ±iβ, the roots of

    λ⁴ + ρω²(1/κG + 1/E) λ² + ρ²ω⁴/(EκG) − ρAω²/(EI) = 0,

and ψ = (λ + c/λ) w with c = ρω²/κG. Below the second spectrum's cutoff, √(κGA/ρI)/2π = 19.6 kHz
for the default tube, α and β are real; the model keeps the modes under 20 kHz and under 0.97 of
that cutoff.

### The cap

A brass plug and striking ring close the top end. It is a point mass m_c (120 g by default) and a
rotary inertia J_c = m_c (r_i²/4 + d²/3) for a plug d = 25 mm deep in the bore, at x = L. Free at
the bottom and loaded at the top, the boundary conditions are

    x = 0:   κGA (w′ − ψ) = 0,               EI ψ′ = 0
    x = L:   κGA (w′ − ψ) = m_c ω² w,         EI ψ′ = J_c ω² ψ

(the cap's terms come from its kinetic energy in the Lagrangian). On the basis e^{−αx}, e^{α(x−L)},
cos βx and sin βx, which stays well conditioned however long the tube is, these are four rows of a
4 × 4 matrix whose determinant vanishes at each mode. The model scans it for sign changes and
refines each root; the mode's shape is the null vector (the cofactors of the matrix's best row),
scaled to unit modal mass

    ∫₀ᴸ ρ(A w² + I ψ²) dx + m_c w(L)² + J_c ψ(L)² = 1,

in closed form. A mass at the end lowers every mode, the low ones most (at high frequency the cap
holds its end nearly still, and that shifts each mode by about the same βL, a smaller share of a
higher mode's). So with the cap, modes 5 and 6 rise against mode 4.

### Cut to the strike note

Each tube is cut so that **mode 4 is an octave above the key's note** (its equal-tempered pitch
times the keyboard's tuning). The length starts from Euler–Bernoulli's f₄ = (14.137)² √(EI/ρA) /
2πL² and is refined against the Timoshenko tube with its cap, f₄ ∝ L^−p with p measured along the
way. The default C4 tube is 1.606 m long and weighs 2.51 kg (plus its cap), A4 1.218 m, F5 0.946 m.

For a thin free bar the modes lie near (2n + 1)²: modes 4, 5 and 6 are in the ratio
9² : 11² : 13² = 81 : 121 : 169, that is 2 : 2.99 : 4.17 of half of mode 4. Close enough to 2 : 3 : 4,
the ear takes them as harmonics of a virtual fundamental an octave below mode 4 (Rossing 2000).
Shear and the cap move them: the default C4 tube's are 2 : 2.95 : 4.06, its F5 tube's 2 : 2.89 :
3.88 (the shorter tube is stubbier, so shear flattens its high modes more). The low modes, 0.23,
0.62 and 1.22 times the strike note at C4, are below it and barely heard (see the radiation).

### The mallet

The mallet strikes the cap's edge (or anywhere down the tube: **Strike point**), with the speed
the key gives, up to 3 m/s. Its face is a Hertzian spring, F = Kδ^{3/2}, with a little hysteresis,
K given as the force at 1 mm (1500 N for rawhide); the mallet is 220 g. The contact is solved
implicitly every sample against every mode's response at the strike point (the same solver as the
celesta's and the vibraphone's felt), and each mode is an exact two-pole resonator between. A
rawhide stroke at full speed lasts about 1.1 ms with a peak force near 1.4 kN; a soft mallet stays
longer and cannot reach the fast modes, a hard one leaves sooner and rings them all.

### Radiation, and what the microphones hear

A tube moving sideways pushes the air like a line of transverse dipoles: a thin cylinder of
radius a moving at velocity U carries a dipole of 2πa²U per unit length (potential flow round a
cylinder). Far from it, a mode of shape w radiates in proportion to its Fourier transform
I(k cos θ) = ∫ w(x) e^{ikx cos θ} dx along the tube's axis, so its power is

    P = π ρ₀ ω⁴ k² a⁴ |q|² J / 8c,    J = ∫₋₁¹ (1 − μ²) |I(kμ)|² dμ,

and its amplitude decays at σ_rad = πρ₀ω²k²a⁴ J χ(ka) / 8c. I is in closed form for the tube's
basis, and J is summed over μ finely enough for |I|², a band-limited function. For an infinitely
long, uniform motion this is the 2-D cylinder's (π²/4) ρ₀ c (ka)³ a U² per unit length (Morse and
Ingard 1968); χ(ka) = 4/(π²(ka)⁴|H₁′(ka)|²) is the exact 2-D factor that takes over from it on a
fat cylinder (χ ≈ 1 for ka ≪ 1, 0.47 at ka = 1).

The bending waves of the default tube travel slower than sound below about 404 Hz and faster
above it. Below, the air flows round from one half-wavelength to the next and the mode barely
radiates (radiation alone would take hours to stop modes 1–3); above, they radiate
strongly and more so the higher they are. With the metal's internal friction η (1 × 10⁻⁴ by
default, σ = πfη) the default C4 tube's modes ring for

| mode | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| × strike note | 0.226 | 0.624 | 1.220 | 2.000 | 2.952 | 4.059 | 5.305 | 6.673 |
| T₆₀ (s) | 372 | 135 | 68 | 39 | 21 | 10.4 | 5.4 | 3.1 |

so a hard stroke's clang of high modes dies in a second or two and leaves the strike note's three
humming on.

What you hear is the pressure at two microphones 70 cm apart, 60 cm below the caps, **Listening
distance** in front of the frame. Each stretch of the tube reaches each microphone by its own
path: the dipole's whole near and far field,

    p = (iρ₀a²/2) Σ ∫ w(x) k cos α (1 − i/kr) e^{−ikr} / r dx · (modal acceleration),

summed over stretches short enough that the path across each is straight (its integral then in
closed form). Each mode gets a gain and a phase for each microphone, which the engine applies to
its two-pole state. A phase cannot delay a strike, so the farther microphone's channel also
waits, in whole samples, for the difference between the two paths from the tube's middle (that
much phase is taken back from each mode). Near the frame the low modes, whose two halves would cancel far away, are
heard too; far away, the air leaves mostly the modes that radiate. The level is kept the same at
every distance. The tubes hang in two rows, the naturals 7.5 cm apart and the sharps 12 cm behind
them between, so the stereo comes from where each tube hangs.

### The damper bar

A felt-lined bar presses on all the tubes 7 cm below their tops (a 3 cm pad), unless the pedal is
down; a held key keeps it off its own tube. It is a dashpot on each tube: mode n is damped in
proportion to the mean of w_n² under the pad, scaled so that **Damper felt** is the T₆₀ it gives
modes 4–6 on average. Modes with a node near the pad are damped less: on the default C4 tube
mode 4 has one there, so its damped note fades on its overtones' hum a little longer.

## What to listen for

- **The strike note.** Play G4 with the pedal down and listen for the pitch: it is G4, yet the
  spectrum has no line there (the dashed marker), only the modes around it. The strike note view
  puts each mode on that note's harmonics.
- **The clang, then the hum.** A hard mallet (Plastic mallet) rings the high modes for a second
  or two; then modes 4–6 hum on for many seconds (watch the spectrogram).
- **Mallets.** Leather-wrapped: the strike note alone, mellow; rawhide: the orchestra's; plastic
  or brass: bright and clangy.
- **The cap.** No cap, then a heavy one (presets): the overtones lift against mode 4 and the
  strike note's colour changes.
- **Where you stand.** Close up (0.8 m) you hear the low modes and each tube's place in the
  frame; far off (12 m), mostly the strike note's modes.
- **The damper bar.** Without the pedal, chords stop as the keys come up; with it, peals overlap.
- **Struck lower down.** A third of the way down the tube the mallet sits near nodes of some
  modes: the timbre hollows.

## Files

```
tubular/index.html, style.css              the page
tubular/src/tubular-params.js              GROUPS, DEFAULTS, PRESETS
tubular/src/tubular-instrument.js          the descriptor
tubular/src/tubular-wasm.js                the engine and the model, as WebAssembly
tubular/src/tubular-main.js                the page's views; each note's tube built ahead and sent with it
tubular/src/tubular-tour.js                the guided tour
tubular/wasm/tubular.wasm                  the C++ built as WebAssembly
native/instruments/tubular/tubular-model.* the tube (Timoshenko, cap), the radiation, the frame's layout
native/instruments/tubular/tubular-engine.* the real-time engine: mallet, modes, damper, microphones
native/instruments/tubular/tubular-web.cpp the model's functions for the views and tests
test/tubular-tests.mjs                     the tests
tools/render-tubular.mjs                   the demos
```

## Simplifications

- The tube is a beam: the cross-section keeps its shape. Its ovalling (shell) modes, its
  torsional and longitudinal modes and the air column inside are left out; a mallet striking the
  cap's side excites mostly bending.
- One plane of bending: the mallet drives the modes in the plane it strikes, and the tube is
  perfectly round, so the other plane's twins, which a real tube's small asymmetries split and
  set beating, are not there.
- The cord and the hanging hole take no energy, and the cap is a point mass and inertia at the
  very end (a real plug is 2–3 cm long).
- The radiation is the thin line-dipole's with the 2-D fat-cylinder factor: no radiation from the
  tube's ends or its cap's face, and the other tubes do not scatter the sound.
- Each stretch of tube is in the far field of its own length; the paths across it are straight.
- The damper is a dashpot, linear and still; real felt also adds a little mass and stiffness.
- Internal friction is one loss factor for every mode; brass's varies a little with frequency.

## Quality

High plays every mode under 0.45 of the sample rate (up to 48 per tube) and up to 24 tubes at
once. Medium leaves out the modes above 10 kHz, 14 tubes; Low above 6 kHz, 8 tubes. Medium and
Low also let a tube go at −70 and −60 dB under its loudest instead of −90. The strike note's
modes and the pitch are the same at every level.

## Prior art and references

**The original instrument.**
- J. Harrington (1888). US Patent 389,841, for tubular bells, which Harrington, of Coventry,
  England, had patented in Britain in 1884 and made with Harrington, Latham & Co. from about 1885;
  see [Bicycles and bells](https://www.coventrysociety.org.uk/2023/11/22/bicycles-and-bells/),
  The Coventry Society.
- [Tubular bell](https://en.wikipedia.org/wiki/Tubular_bell), Wikipedia: brass tubes 30–38 mm
  across, written range C4–F5 (some to G5), a pedal damping all the bells at once.

**The physics.**
- T. D. Rossing (2000). *Science of Percussion Instruments*. World Scientific, 67–69. Chimes:
  modes 4, 5 and 6 near 2 : 3 : 4, the strike note an octave below mode 4.
- N. H. Fletcher & T. D. Rossing (1998). *The Physics of Musical Instruments*, 2nd edn. Springer,
  New York. [doi:10.1007/978-0-387-21603-4](https://doi.org/10.1007/978-0-387-21603-4).
- S. P. Timoshenko (1921). "On the correction for shear of the differential equation for
  transverse vibrations of prismatic bars." *Phil. Mag.* 41(245), 744–746.
  [doi:10.1080/14786442108636264](https://doi.org/10.1080/14786442108636264).
- G. R. Cowper (1966). "The shear coefficient in Timoshenko's beam theory." *J. Appl. Mech.*
  33(2), 335–340. [doi:10.1115/1.3625046](https://doi.org/10.1115/1.3625046).
- H. Hertz (1882). "Über die Berührung fester elastischer Körper." *J. reine angew. Math.* 92,
  156–171. [doi:10.1515/crll.1882.92.156](https://doi.org/10.1515/crll.1882.92.156).
- P. M. Morse & K. U. Ingard (1968). *Theoretical Acoustics*. McGraw-Hill. The radiation of a
  cylinder moving sideways.
- E. Terhardt (1974). "Pitch, consonance, and harmony." *J. Acoust. Soc. Am.* 55(5), 1061–1069.
  [doi:10.1121/1.1914648](https://doi.org/10.1121/1.1914648). Virtual pitch.
- M. Abramowitz & I. A. Stegun, eds. (1964). *Handbook of Mathematical Functions*. National
  Bureau of Standards, 9.1.10–9.1.11: the Bessel functions' power series.

**Earlier models and syntheses.**
- J. M. Chowning (1973). "The synthesis of complex audio spectra by means of frequency
  modulation." *J. Audio Eng. Soc.* 21(7), 526–534. FM's inharmonic spectra, bells and chimes
  among them.
- Tubular bells are a standard sound in General MIDI (program 15) and are sold as sample
  libraries; the Tubular Bells here plays its tubes from the physics above.
