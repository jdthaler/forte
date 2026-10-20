# {name}

One paragraph: what the instrument is, what is physical about it, and what
you can hear that a sample could not give you.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/{slug}/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play |
| `←` `→` | octave |
| `↑` `↓` | velocity |
| `Space` | sustain |
| MIDI | notes, velocity, sustain pedal (CC64) |

## The physics

The model, from the mechanism to the sound, one stage per paragraph. Give
the equations and the numbers (and where the numbers come from). Say which
parameters on the page change what.

## What to listen for

The physical effects the demos in `examples/{slug}/` isolate, and how to
hear each one on the page.

## Files

```
{slug}/index.html, style.css          page
{slug}/src/{slug}-params.js           parameters and presets
{slug}/src/{slug}-instrument.js       the descriptor: everything but the page
{slug}/src/{slug}-main.js             page wiring and views
{slug}/src/{slug}-wasm.js, {slug}/wasm/{slug}.wasm   the engine and model, built from the C++
native/instruments/{slug}/            the physics in C++: model and engine (plugins and WebAssembly)
test/{slug}-tests.mjs                 node test/{slug}-tests.mjs
tools/render-{slug}.mjs               node tools/render-{slug}.mjs → examples/{slug}/
```

## Simplifications

What is left out or approximated, and how much it matters.

## Quality

What Medium and Low trim (High plays everything) and what you hear. Here:
past 24 bars ringing at Medium and 12 at Low, the oldest fades out.

## Prior art and references

**The original instrument.** Inventors, patents, first descriptions.

**The physics.** The papers this model relies on, credited to their
authors: Authors (year). "Title." *Venue* volume, pages. [doi:…](https://doi.org/…)

**Earlier models and syntheses.** Academic and commercial physical
models of this instrument, each with a link and one neutral line:
[Name](https://…) (Developer, year).
