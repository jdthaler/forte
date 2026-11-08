# Combinations

Several of Forte's instruments played at once from one keyboard, as a pedalboard holds pedals:
layered on the same keys, split across the keyboard, or both. Each instrument keeps its own
physics and its own engine; this page only decides which keys reach which instrument, and mixes
what they play.

Part of [Forte](../README.md).

| Input | |
|---|---|
| `Z`…`/` and `Q`…`]` | two rows of keys, as on every page; `←` `→` move them an octave |
| `Space` | each instrument's own pedal: a damper where it has one, holding its keys where it holds them |
| MIDI | notes by their keys; the wheels, pedals, aftertouch, bend and MPE reach every instrument; a program change picks a combination |

## Playing it

Up to four instruments, each a card in Controls. **Add an instrument** puts one on every key, as
you left it on its own page, so it layers with the rest until you move its keys. On its card:

* **Keys**: the lowest and highest key it plays. Two instruments whose keys overlap are layered
  there; where one stops and the next starts, the keyboard is split. *Press a key…* takes the next
  key you play, on screen, from the computer or from MIDI.
* **Octave**: moves what it plays up or down, so a bass on the left hand can sound where it should.
* **Preset**: one of its own presets, one of yours saved on its own page, its default settings,
  or its settings as on its own page again, after you change them there. The menu names the one
  it plays, until a MIDI controller moves its settings.
* **Level**: how loud it is against the others, in decibels.
* **On** turns it off and on without losing its settings; **✕** takes it off. Its name links to
  its own page, with every setting, its views and How it works.

The **Combinations** menu starts from a set of them: the piano and the viola organista's strings
layered, a tonewheel organ's bass under an electric grand, a gong below a gamelan, timpani, marimba
and glass armonica across three splits, and others. **Default settings** goes back to the first.
The page remembers what you made here, and each instrument's settings with it.

The same menu keeps your own, as an instrument's Presets menu keeps your presets:
*Save this combination…* names it and keeps it in this browser, under **Your combinations**;
*Copy a link to this combination* makes a link that opens the page with it; *Your combinations
and files…* lists them (play, link, save to a file, delete) and opens a combinations file. A
combination holds each instrument, its keys, octave, level and on or off, and every setting it
plays with (by its contract's parameter ids, as a preset file holds them), so it plays the same
whatever you have done on the instruments' own pages since. The menu names the combination
playing until you change something; a MIDI program change counts yours after the starting ones.

## How the keys are shared

A key `k` reaches an instrument when it is on and `lo ≤ k ≤ hi`, its lowest and highest keys. The
instrument plays it as

  k′ = k + 12·octave

and stays silent when `k′` is outside its own keys (its compass, while its own page keeps that
closed). A key's note-off goes to the instruments its note-on reached, at the keys they played,
whatever changes in between, so moving a split or an octave never leaves a note hanging.

Each instrument hears a note's velocity as its own page would: through the MIDI velocity curve and
the soft pedal, and its own `midiVelocity` where it has one. Its MPE decoder runs on every message,
so a note's own bend, slide and pressure follow it into whichever instruments play it.

## The sound

Each instrument runs in its own AudioWorklet, its engine the same WebAssembly its page plays, and
goes through its own output chain: its tone, its body, its room or venue and its limiter. Then its
**Level**, then the page's **Volume**, then one more limiter on the sum, at −1 dBFS with no makeup
gain, which only catches the peaks that two or more instruments add up to. A combination costs
the audio thread what its instruments cost on their own pages, together: the CPU pill shows the
sum, and its tooltip each instrument's share.

## The views

* **The keys**: the whole keyboard with a lane for each instrument, the keys it plays in its
  colour and its notes as they sound.
* **Spectrum** and **Spectrogram**: everything together, after the limiter.

## What is simplified

* **Each instrument has its own room.** Two instruments in a hall are two halls, each with its own
  reverb, rather than one shared space.
* **No pan or mix between them** beyond each one's level: the stereo is each instrument's own.
* **In the plugins, the Forte app.** It plays up to four the same way, each with its keys, octave,
  level and on/off on a card under its header (**+** beside its Instrument menu adds one). Its
  combinations menu, beside **+**, saves them as yours, files in a `Combinations` folder beside the
  instruments' presets (`~/Library/Audio/Presets/Forte/Combinations` on a Mac,
  `%APPDATA%\Forte\Presets\Combinations` on Windows, `~/.local/share/forte/presets/Combinations` on
  Linux) in the same format as this page's files, so either opens the other's; it starts from none
  of the combinations above. In a DAW, several Forte plugins on one MIDI track do it too.

## Files

* `src/combine-params.js`: the combinations, the routing (`routed`), the saved state, and your
  combinations' file and link formats.
* `src/combine-main.js`: the page: the instruments hosted from their descriptors, the keys, MIDI
  and the views.
* `src/combine-mine.js`: your combinations in the Presets menu, and their dialog.
* `test/combine-tests.mjs`: the routing, every combination against the registry and the
  instruments' presets, and your combinations' files (the one the Forte app's tests read,
  `native/tests/presets/combinations/`) and links.
