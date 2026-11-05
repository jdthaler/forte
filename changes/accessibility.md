# screen readers, keyboard focus and Reduce Motion

### Forte (minor)
- **A screen reader names everything:** the symbol buttons in the keyboard bar (⌨, − +, ◀ ▶) say what they do; each view's picture is named by its view and described by its caption; a slider says its value as the page shows it (10.0 ‰, not 523) on every page; a control's ⓘ explanation is read after its name; the bubble above the keys is read out as it opens; the keys are one named picture, not a list of letters; the MIDI pill announces a device; and on the front page each Listen, Plugin and How it works names its instrument.
- **Keyboard focus stays where it was:** a button or menu used from the keyboard (Tab, then Enter or Space) keeps the focus, so Tab goes on to the next control and a screen reader keeps its place, instead of starting again at the top. The pointer still hands the keys back to the instrument. A group's title in the Controls panel is no longer a Tab stop that does nothing.
- **A focus ring on every control** reached with Tab, in the instrument's colour, including the handle between the views and the controls.
- **Reduce Motion:** with the system's setting on, every view draws four times a second instead of every frame, so it steps rather than scrolls and swings, and nothing in the page slides, springs or scrolls smoothly.
- `tools/check-pages.mjs` fails on a control a screen reader can't name, a view's canvas without a name or a slider without its value as text; `test/site-tests.mjs` on a view with an animation loop of its own.

### Ribbon Piano (patch)
- Keyboard focus is kept after Enter or Space, its views follow Reduce Motion, and its sliders say their values as shown.

### Tonewheel Organ (patch)
- Keyboard focus is kept after Enter or Space, its views follow Reduce Motion, its sliders say their values as shown, and the vibrato scanner is a named picture.

### Tine Piano (patch)
- Keyboard focus is kept after Enter or Space, its views follow Reduce Motion, and its sliders say their values as shown.

### Huygens Keyboard (patch)
- Keyboard focus is kept after Enter or Space, its views follow Reduce Motion, and its sliders say their values as shown.

### Black-Hole Keyboard (patch)
- Keyboard focus is kept after Enter or Space, its views follow Reduce Motion, and its sliders say their values as shown.

### Electric Grand (patch)
- Replay and the motion's speed keep keyboard focus after Enter or Space.

### Reed Piano (patch)
- Replay keeps keyboard focus after Enter or Space.

### Tangent Clavier (patch)
- Replay and the motion's speed keep keyboard focus after Enter or Space.
