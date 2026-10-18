# Pyrophone

A flame organ after Frédéric Kastner's pyrophone (patented 1873): every key is
a glass tube, open at both ends, with gas flames burning a third of the way up.
Nothing strikes or bows the tube. The flame's heat release feeds the tube's own
standing wave, and above a threshold the silence becomes unstable, so the note
**grows by itself** out of the flame's turbulence, swells for tens to hundreds
of milliseconds, and settles on a limit cycle. The threshold is a *subcritical*
Hopf bifurcation, so the tubes are bistable: just below it a silent tube stays
silent and a singing one keeps singing. Notes remember having sung.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/pyrophone/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (88 tubes, A0–C8) |
| `←` `→` | octave |
| `↑` `↓` | velocity (how far a key parts the flames) |
| `Space` | hold: keys stay down (flames stay apart) while Space is held |
| MIDI | notes, velocity, sustain pedal (= hold); **mod wheel = flame power**; aftertouch parts the flames further |
| Touch | lean on a held key (slide the finger along it, either way, or press harder with an Apple Pencil) = aftertouch: parts the flames further |

## The physics

**History.** Higgins (1777) heard a hydrogen flame sing inside a glass tube.
Rijke (1859) got the same song from a heated gauze in the lower half of a tube
and none from the upper half. Rayleigh (1878) gave the reason: the heat
release must be in phase with the pressure oscillation to feed it, the
thermal analogue of pushing a swing at the right moment. Kastner found that
flames in a tube sing when they are apart and fall silent when they touch,
and built a keyboard that moves them apart.

**The tube.** The model is the Galerkin model of a Rijke tube used by
Balasubramanian & Sujith (2008, *Phys. Fluids* 20, 044103), Juniper (2011,
*J. Fluid Mech.* 667, 272–308) and Magri & Juniper (2013, *J. Fluid Mech.*
719, 183–202).
Lengths are in units of L and time in units of L/c, so every tube obeys the same
equations. In those units, with acoustic velocity u (in units of the mean draught ū) and
pressure p,

  ∂u/∂t + ∂p/∂x = 0,  ∂p/∂t + ∂u/∂x + ζp = q̇ δ(x − x_f).

Open–open modes, u = Σ ηⱼ cos(jπx) and p = −Σ (η̇ⱼ/jπ) sin(jπx), turn this
into one oscillator per mode, coupled only through the flame:

  η̈ⱼ + ζⱼ η̇ⱼ + (jπ)² ηⱼ = −2jπ sin(jπx_f) q̇,  u_f = Σ cos(jπx_f) ηⱼ.

Ten modes are kept (as in Juniper's and Magri & Juniper's linear work).

**Losses.** ζⱼ = c₁j² + c₂√j (Matveev 2003): radiation from the two open ends,
∝ ω², plus the viscous and thermal boundary layer on the wall, ∝ √ω. Both come
from the tube's bore a/L. Radiation: an unflanged open end reflects
|R| ≈ 1 − (ka)²/2, so c₁ = (πa/L)². The wall: Kirchhoff's σ = (1/a)√(ων/2)(1 +
(γ−1)/√Pr) for hot air (ν = 2.6·10⁻⁵ m²/s at 400 K) and a 0.6 m tube, so
c₂ = 1.48 (L/a)√(2πν/cL). The default bore, a/L = 1/30, gives c₁ = 0.011,
c₂ = 0.037, so the fundamental has Q = π/ζ₁ = 66 and its losses are mostly at
the wall. Wide tubes radiate more and lose their upper modes (∝ j²); narrow ones
lose their fundamental to the wall. Magri & Juniper's hot-wire tube has
c₁ = 0.01, c₂ = 0.004. At the widest bore with the most damping (a/L = 0.15,
× 4) modes 8–10 are overdamped (ζⱼ/2 > jπ); there ka > 1 too, beyond where the
end-loss formula holds.

**The flame.** Heckl's (1990) modified King's law gives the heat-release
fluctuation for a flame velocity u_f, felt a lag τ late:

  q̇ = β [ √|1/3 + u_f(t − τ)| − √(1/3) ].

King's law makes heat transfer grow like √(flow speed). Heckl's 1/3 makes
the law reverse when the oscillating flow at the flame cancels a third of the
draught. A flame cannot release more heat than its fuel holds, so the law is
capped where |1/3 + u_f| = 3 (three times the mean heat release); every limit
cycle at the normal settings stays well inside it, and only extreme flame
positions and lags reach it. β, the heater gain, is in Magri & Juniper's
normalisation; the linear gain is (√3/2)β. Small perturbations ∝ e^{st} obey a scalar characteristic
equation, 1 = (√3/2) β e^{−sτ} Σⱼ cos(jπx_f)·(−2jπ sin(jπx_f)) / (s² + ζⱼs + (jπ)²),
which the model solves by Newton continuation from β = 0. The tests reproduce
Magri & Juniper's published eigenvalues (−0.0056 + 3.1848i at β = 0.1 and
+0.00023 + 3.3570i at β = 0.5) to all quoted digits, with the delay
Taylor-expanded as theirs is (e^{−sτ} → 1 − sτ); the exact delay moves them
by less than 10⁻³. For one mode and weak
coupling,

  s ≈ −ζⱼ/2 + (√3/4) β sin(2jπx_f) [sin(jπτ) + i cos(jπτ)] + ijπ,

which is **Rayleigh's criterion** in one line: mode j is driven where
sin(2jπx_f)·sin(jπτ) > 0. For the fundamental with a short lag, that means
the lower half of the tube, best at L/4, exactly as Rijke found. The octave is
driven in the lowest and third quarters, and nothing is driven in the top
quarter. Kastner's flames at ⅓ sit on the pressure node of mode 3
(sin 3π/3 = 0), so the third harmonic is missing (−53 dB) unless you move them.
The defaults (x_f = ⅓, τ = 0.25 L/c, i.e. 45° of the fundamental) put the Hopf
point at β_H = 0.0884; the one-mode formula gives 0.0896.

**Why the tubes are bistable.** For u_f = U cos θ the first harmonic of the
heat release, relative to its linear value (the describing function), is
D(U) = 1 + (27/32)U² + … It *rises* with amplitude, so a small oscillation
gains more than it should. The Hopf bifurcation is therefore subcritical. D peaks
at 1.203 just past U = ⅓ (exactly D(⅓) = 8√2/(3π)), where the flow at the flame
starts to reverse, and falls afterwards. So the branch of oscillations born at
β_H runs *backwards* (unstable), turns at a fold where the flow first reverses,
and comes forward as the stable limit cycle. The page computes the full
multi-mode, multi-harmonic version by harmonic balance (12 harmonics, Newton,
continuation in amplitude). At the defaults the fold is at β = 0.0768, 13 %
below the Hopf point; the one-mode estimate 1/max D gives 17 %. The fold sits at
amplitude 0.346 ≈ ⅓. When a silent tube is pushed past β_H it does not grow
gently: it jumps to an amplitude of 0.41. Between fold and Hopf, the dashed
unstable cycle is the threshold a kick must cross.

**Keys, velocity, turbulence.** A key parts the flames in 12 ms, setting
β = K β_H (0.4 + 0.6v) for velocity v and flame power K, which is in units of
the threshold β_H, so that it means the same for every bore, damping and flame
position (default K = 3.4: 1.4–3.4× threshold, β = 0.12–0.30 at the defaults).
Releasing it rejoins them, to β = (key-up power) × β_H (default 20 %), and the
tube rings down at its acoustic damping: T60 = 0.7 s at C4, 1.4 s at C3. If the key-up power is put inside the bistable band (above
≈ 87 %), a tube that has sung keeps singing after release, and one that has not
stays silent. The flame is turbulent: white noise, low-passed at 300 Hz, is
added to the velocity the flame feels, rms 2 % of the draught by default, plus a
short puff (×(1 + 3v), decaying in 40 ms) as the flames are pulled apart. This
seeds every onset, gives the tone a breath about 35 dB down, and near the
Hopf end of the bistable band strong turbulence (10 %) kicks a silent tube into
song: noise-induced triggering (Waugh & Juniper 2011).

**Slow onsets.** Above threshold the note grows at the linear rate Re s. In
physical time that is Re s × c/L, so it is proportional to the pitch:

| key at velocity 0.7 (β = 0.246) | C3 | C4 | C5 | C6 |
|---|---|---|---|---|
| e-folding time of the onset | 90 ms | 45 ms | 22 ms | 11 ms |
| time to half the final level | 300 ms | 140 ms | 90 ms | 48 ms |

At velocity 0.1 (1.6× threshold) C3 takes a second. Chords bloom from the
top down. Further past threshold the tube also sings louder (amplitude 0.44 at
β = 0.1, 0.69 at 0.25, 0.88 at 0.55) and brighter.

**The scream.** Further still, a higher mode goes unstable as well, out of tune
with the note, and the tube screams: loud and inharmonic. At the defaults mode
5's own Hopf point is β = 0.67 (7.6× threshold), but with the note already
sounding the scream starts only at β ≈ 0.8–1.0 (measured: the harmonic share of
the sound drops from 92 % to 13 %, and its level more than doubles). Over bore, damping,
flame position and lag, the measured onset lies at 0.84–1.8× the Hopf point of
the screaming mode. So the keys' gain is held below 0.8× the lowest Hopf point
of any mode above the third (other than the one that sings): 6.1× threshold at
the defaults (the power slider stops at 6×, and full aftertouch at 7.5× is held
there), 2× for a narrow bore (a/L = 1/100, whose upper modes are relatively less
damped and scream from about 4.5×), and close to threshold where the flame or
the lag makes several modes nearly equally unstable. Modes 1–3 may still join
in, since they lock to the note: a strong third harmonic, the octave taking
over, period doubling, the mixtures low in the tube. The bifurcation view says
when the keys are held below the scream.

**Tuning and warm-up.** Every tube is a scaled copy (same x_f, τ in units of
L/c, bore), so they all share one bifurcation diagram. A tube's pitch is
f = W c/(2πL), where W is the limit cycle's angular frequency in units of c/L.
The flame's reactance raises W above π by 12.7 ¢ at the Hopf point and by
37 ¢ at β = 0.55. The auto-tuner cuts each tube for its key and velocity: the
acoustic length is L = W c_hot/(2πf), less the open-end corrections 0.61a per
end. C4 is 74 cm long with a 5 cm bore, C3 149 cm, C6 19 cm; A0 is a 7 m
flue, C8 a 5 cm whistle. Where the flame
position makes another mode j speak first, the tube is cut so that mode j
sounds exactly j times the key's frequency. Turn the auto-tuner off and the tubes
are cut for velocity 0.7, so playing from v = 0.2 to 1 raises the pitch by
6.6 ¢: the physics of a fixed tube. The gas in a singing tube is at
T_hot = 400 K; a fresh tube is ΔT cooler (default 4 K) and warms with a
time constant τ_w (default 1 s) while its flames are apart or it sings. Since
c ∝ √T, a cold note starts 600 log₂(T_hot/(T_hot − ΔT)) = 8.7 ¢ flat and slides
up into tune. A tube that keeps singing after release (key-up power in the
bistable band) stays hot, so its pitch does not drift; it only steps down by
the few cents its lower key-up gain gives the limit cycle (5.4 ¢ for a key
played at 0.8). Every silent
tube cools with the same τ_w and remembers its temperature, so a note replayed
soon after starts warm, in tune. Every key from C3 to C6, and a sample from
A0 to C8, is tested to settle within 3 ¢ of equal temperament (measured worst
case 0.2 ¢ on C3–C6, 2.3 ¢ on A0, the slowest to settle).

**Radiation.** Sound leaves through both open ends. The far-field pressure is
∝ d/dt of the outflow: u(1) at the top, −u(0) at the bottom. Odd modes push air
out of both ends at once (a monopole); even modes push it in one end and out
the other (a dipole). The *listening point* weights the bottom mouth by a:
side-on (a = 1) the even modes cancel and the octave drops 33 dB, a hollow
tone; at the top mouth (a = 0) you hear them all. The default is a = 0.5.
Tubes are panned across the stereo field by position.

**Numerics.** Each mode advances by the exact solution of its oscillator over
one sample with the flame's force held (zero-order hold), at the tube's own
time step c(T)/(L f_s), so the linear acoustics is exact at every pitch and
temperature; for an overdamped mode the solution is the same with cosh and
sinh. The hold delays the force by half a sample, so the flame's delay
line is read half a sample early. A mode the sample rate cannot hold is
left out: each tube keeps the modes below 0.45 f_s with the pitch wheel bent
all the way up: every tube up to B♭6 keeps all ten at 48 kHz (up to A6 at
44.1 kHz), C8 four (its fourth harmonic at 16.7 kHz). The scream ceiling is drawn from the
full ten-mode tube, so a tube with fewer modes stays further below it. A tube costs about 0.2 % of a core; 10 tubes
render at 2 % of real time in Node. The tests hold the engine to the model:
growth rate and ring-down within 3 %, limit-cycle amplitude within 2 %, both
thresholds of the hysteresis loop within 3 %, harmonic levels within 1.5 dB.

**In C++.** The engine and the model are C++, built as WebAssembly for this
page and as plugins (CLAP, VST3, AU and a standalone app), where the Space
pedal is Hold on CC64, the mod wheel is the flame power and aftertouch parts
the flames. The views' bifurcation diagram, orbits and tuning come from the
same C++. The tuning table (harmonic balance, about 15 ms) is built on a
worker thread in the plugins, and on the page by its WebAssembly model, which
hands it to the engine; while a tube slider moves, the tubes are cut from the
last table until the new one is in. Ten tubes take about 2 % of a core.

**The views.** The bifurcation diagram (from harmonic balance) shows the
stable and unstable branches, the Hopf point, the fold and the bistable band,
where the keys put β up and down, and a live dot for every sounding tube.
A trail follows the focused tube around the loop. The tube view shows the
standing wave strobed into slow motion: each frame is the real state 1/48 of
a cycle later than the last. The phase portrait of mode 1 shows the trajectory
spiralling out to the stable cycle, inside which sits the dashed threshold
cycle when β is in the bistable band. The spectrum carries the hot tube's mode
frequencies and the harmonic levels harmonic balance predicts.

## What to listen for

`examples/pyrophone/` (regenerate with `node tools/render-pyrophone.mjs`):

1. **Chorale.** Seven chords. Held common tones carry through; every new note
   sighs in at its own rate, the bass slowest.
2. **Hysteresis.** One tube, flames fully apart, with the heater gain slowly raised
   from β = 0.072 to 0.118 and lowered to 0.05 (0.8× to 1.3× threshold and back
   to 0.6×). It starts near β = 0.11, a little past
   the Hopf point because growth there is slow, and keeps singing on the way
   down to ≈ 0.07, near the fold. It stops well below where it started. On the
   page: hold a key with Space and move the mod wheel.
3. **The flame moved from the top to the bottom** of a held tube, at a fixed
   β = 0.3. Rayleigh's map, heard: silence, the twelfth (mode 3), the octave, the octave with a
   subharmonic (period doubling), silence near the middle, the fundamental,
   then a brighter locked mixture of modes 1–3 near the bottom.
4. **Warm-up.** A cold tube (ΔT = 30 K, 67 ¢) slides up into tune over a few
   seconds. Released for half a second and replayed, it starts much closer.
5. **Staccato, then held.** Short notes barely speak, and the low ones not at
   all, because the oscillation has no time to grow.
6. **A wide chord, soft then loud.** It blooms from the top down; further past
   threshold it blooms faster and brighter.
7. **Tubes that remember.** The same arpeggio with the key-up power at 20 % of
   threshold (the notes die) and at 93 %, inside the bistable band. Every tube
   that has sung keeps singing until the key-up power is lowered.

On the page, also try the presets: the octave tube (flame at 68 %), period
doubling at ⅝, the octave taking over with the flame near the bottom, a
cold-glass drift, a hot-wire Rijke tube, and "just past threshold", where soft
notes do not speak at all.

## Files

```
pyrophone/index.html, style.css             page
pyrophone/src/pyrophone-model.js            constants, the keys' heater gain, the one-mode Rayleigh formula the tests check against
pyrophone/src/pyrophone-params.js           parameters and presets
pyrophone/src/pyrophone-main.js             page wiring
pyrophone/src/pyrophone-views.js            bifurcation diagram, tube, phase portrait
pyrophone/src/pyrophone-wasm.js             the engine and model as WebAssembly (pyrophone/wasm/pyrophone.wasm)
native/instruments/pyrophone/               the physics in C++: model (modes, losses, King's law, linear stability, harmonic
                                            balance, tuning), engine, generated tables, reference (plugins and WebAssembly)
test/pyrophone-tests.mjs                    node test/pyrophone-tests.mjs (25 tests, ~15 s)
tools/render-pyrophone.mjs                  node tools/render-pyrophone.mjs → examples/pyrophone/
```

## Simplifications

* **A hot wire's law for a flame.** King's law with Heckl's 1/3 describes heat
  transfer from a heated wire. A flame's response is a low-pass with a spread of
  delays, and depends on how far apart the flames are. Here the flame is one
  lag τ and one gain β, and the key simply sets β. *Why* joined flames are
  silent (Kastner's observation) is not modelled.
* **Uniform gas.** The mean temperature is the same along the tube, as in the
  papers' horizontal Rijke tube. A real vertical tube is cold below the flame
  and hot above it, which shifts the modes and weakens coupling in the upper
  half. The model's symmetric Rayleigh map, with the octave singing with the
  flame at ⅝, is a property of the uniform-gas model.
* **No mean flow.** The draught only sets the velocity scale. Convection and
  entropy waves are neglected (low Mach number).
* **Scaled copies.** Every tube has the same bore ratio, flame position and
  lag in units of L/c, so all share one bifurcation diagram. A real set would
  not be exactly similar; the wall loss alone scales as L^(−1/2).
* **Ten modes.** Nothing above the tenth mode. Harmonic balance uses
  12 harmonics on 64 points; its β(A) is slightly stepped at the 10⁻³ level
  where the |·| in King's law crosses a collocation point.
* **Stability on the diagram** is judged within each family (dβ/dA > 0).
  Secondary instabilities (period doubling, the quasi-periodic fight between
  modes 1 and 2 near the bottom at high power) appear only in the time-domain
  engine.
* **The scream's ceiling** comes from linear stability (each mode's Hopf point)
  and a margin from measured onsets, not from a stability analysis of the
  sounding cycle. Where several modes are nearly equally unstable (a flame at
  either end, a lag near 270°), the tube can still fight between neighbouring
  modes close to threshold; it does so quietly (a note peaks under 0.9).
* **The fuel limit** on the heat release (three times its mean) is a plain cap
  on King's law, not a model of a flame's saturation.
* **Warm-up** is one lumped thermal time constant, with T_hot fixed and
  independent of the flame power: the gas is either heating (flames apart, or
  singing) or cooling. Turbulence is low-passed white noise with a fixed corner.
* **Auto-tune** cuts each tube for the velocity it is played at, which a real
  instrument cannot do (switch it off to hear the difference). The level is
  equalised across the keyboard. The radiation is two point sources with no
  diffraction around the tube.

## Prior art and references

The instrument is Kastner's, the singing tube was found and explained over the
century before him, and the model is the Rijke-tube model of the
thermoacoustics literature, used here as published.

### The original instrument and its history

* **Higgins (1777)** found that a hydrogen flame low in a glass tube sounds a
  note ([Science Museum Group](https://collection.sciencemuseumgroup.org.uk/objects/co5867);
  Kastner's obituary, below).
* **Sondhauss (1850)** and **Rijke (1859)**, in the physics list below: tubes
  sounded by heat, and the heated gauze that sings only in the lower half of
  the tube.
* **Frédéric Kastner** patented the pyrophone in 1873; one of his
  instruments (France, 1873–76) is in the Science Museum Group collection
  ([object 1876-590](https://collection.sciencemuseumgroup.org.uk/objects/co5867)).
  * Kastner, F. (1873). *Expériences nouvelles sur les flammes chantantes et
    invention du pyrophone*. Paris: impr. A. Chaix.
    [BnF](https://catalogue.bnf.fr/ark:/12148/cb30674558h).
  * Kastner, F. (1875). *Les flammes chantantes*. Paris: E. Dentu, 117 pp.
    [BnF](https://catalogue.bnf.fr/ark:/12148/cb30674559v). 3rd ed., *Les
    flammes chantantes: théorie des vibrations et considérations sur
    l'électricité* (Paris: Dentu and Lacroix, 1876):
    [scan](https://archive.org/details/lesflammeschant00librgoog).
  * Kastner, G. E. F. (1875). "Improvement in pyrophones." US Patent 164,458,
    filed 24 December 1874, granted 15 June 1875: the sound is made or stopped
    "by separating or isolating the flames or bringing them together".
    [Google Patents](https://patents.google.com/patent/US164458).
  * Anon. (1882). "Frederic Kastner." *Nature* 26, 304 (obituary).
    [doi:10.1038/026304a0](https://doi.org/10.1038/026304a0).
* **Trimpin's [FireOrgan](https://annex.exploratorium.edu/AIDS/trimpin.state.html)**
  (Exploratorium, 1996): flames driving air through hand-blown glass tubes,
  set off by visitors.

### The physics literature

* Sondhauss, C. (1850). "Ueber die Schallschwingungen der Luft in erhitzten
  Glasröhren und in gedeckten Pfeifen von ungleicher Weite." *Ann. Phys.* 155,
  1–34. [doi:10.1002/andp.18501550102](https://doi.org/10.1002/andp.18501550102).
* Rijke, P. L. (1859). "Notiz über eine neue Art, die in einer an beiden Enden
  offenen Röhre enthaltene Luft in Schwingungen zu versetzen." *Ann. Phys.*
  183, 339–343. [doi:10.1002/andp.18591830616](https://doi.org/10.1002/andp.18591830616).
* Kirchhoff, G. (1868). "Ueber den Einfluss der Wärmeleitung in einem Gase auf
  die Schallbewegung." *Ann. Phys.* 210, 177–193.
  [doi:10.1002/andp.18682100602](https://doi.org/10.1002/andp.18682100602).
* Rayleigh, Lord (1878). "The explanation of certain acoustical phenomena."
  *Nature* 18, 319–321. [doi:10.1038/018319a0](https://doi.org/10.1038/018319a0).
* Rayleigh, Lord (1896). *The Theory of Sound*, 2nd ed., vol. 2. London:
  Macmillan. §§ 322g–322j: the maintenance of vibrations by heat, singing
  flames, Sondhauss's tubes and Rijke's tube.
  [archive.org](https://archive.org/details/theoryofsound02raylrich).
* King, L. V. (1914). "On the convection of heat from small cylinders in a
  stream of fluid: determination of the convection constants of small platinum
  wires with applications to hot-wire anemometry." *Phil. Trans. R. Soc. A*
  214, 373–432. [doi:10.1098/rsta.1914.0023](https://doi.org/10.1098/rsta.1914.0023).
* Heckl, M. A. (1990). "Non-linear acoustic effects in the Rijke tube."
  *Acustica* 72, 63.
* Raun, R. L., Beckstead, M. W., Finlinson, J. C. & Brooks, K. P. (1993). "A
  review of Rijke tubes, Rijke burners and related devices." *Prog. Energy
  Combust. Sci.* 19, 313–364.
  [doi:10.1016/0360-1285(93)90007-2](https://doi.org/10.1016/0360-1285(93)90007-2).
* Matveev, K. I. (2003). *Thermo-acoustic instabilities in the Rijke tube:
  experiments and modeling*. PhD thesis, California Institute of Technology.
* Matveev, K. I. & Culick, F. E. C. (2003). "A study of the transition to
  instability in a Rijke tube with axial temperature gradient." *J. Sound
  Vib.* 264, 689–706.
  [doi:10.1016/S0022-460X(02)01217-8](https://doi.org/10.1016/S0022-460X(02)01217-8).
* Balasubramanian, K. & Sujith, R. I. (2008). "Thermoacoustic instability in a
  Rijke tube: non-normality and nonlinearity." *Phys. Fluids* 20, 044103.
  [doi:10.1063/1.2895634](https://doi.org/10.1063/1.2895634).
* Juniper, M. P. (2011). "Triggering in the horizontal Rijke tube:
  non-normality, transient growth and bypass transition." *J. Fluid Mech.*
  667, 272–308.
  [doi:10.1017/S0022112010004453](https://doi.org/10.1017/S0022112010004453).
* Waugh, I. C. & Juniper, M. P. (2011). "Triggering in a thermoacoustic system
  with stochastic noise." *Int. J. Spray Combust. Dyn.* 3, 225–241.
  [doi:10.1260/1756-8277.3.3.225](https://doi.org/10.1260/1756-8277.3.3.225).
* Magri, L. & Juniper, M. P. (2013). "Sensitivity analysis of a time-delayed
  thermo-acoustic system via an adjoint-based approach." *J. Fluid Mech.* 719,
  183–202. [doi:10.1017/jfm.2012.639](https://doi.org/10.1017/jfm.2012.639).

### Earlier models and syntheses

The engine is the reduced-order Galerkin model of a Rijke tube with Heckl's
heat-release law, as published by Balasubramanian & Sujith (2008), Juniper
(2011) and Magri & Juniper (2013), with Matveev's damping; here it is played
from a keyboard, with the tuning, warm-up and radiation described above. An
array of Rijke tubes has been modelled and controlled as an organ before:

* Pučejdl, K., Hurák, Z. & Zemánek, J. (2020). "Rijke organ: modeling and
  control of array of Rijke tubes." *IFAC-PapersOnLine* 53(2), 8866–8871.
  [doi:10.1016/j.ifacol.2020.12.1404](https://doi.org/10.1016/j.ifacol.2020.12.1404).
