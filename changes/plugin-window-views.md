# the site's views in the plugin window

### Forte (minor)
- **The plugin window shows the instrument's views:** its new **Views** button, beside the pedal, opens a pane above the controls with the views from the instrument's page (the modes, the waveforms, the spectrum and spectrogram), drawing what the plugin plays: the DAW's notes and automation, a MIDI keyboard, the window's own keys and controls. Drag the bar between the pane and the controls to share the window, or double-click it to go back to the usual share; the window remembers both. The window opens larger (1000 × 760).
- Each plugin carries its page and the site's shared code and serves them to its window itself, so the views need no network; the downloads grow by about 300 KB a plugin. While the views show, the plugin sends the window the engine's messages and its sound (before the room and the limiter); with them hidden it sends nothing more than before.
- A plugin release is published when Forte's version moves too, since the plugins now carry `shared/`.
- `editor.html?instrument=<slug>`, served by `npm run serve`, is the plugin window with a real instrument's engine playing silently, for working on the window in a browser.

### Ribbon Piano (patch)
- Its page follows the plugin in the plugin window's Views.

### Tonewheel Organ (patch)
- Its page follows the plugin in the plugin window's Views, the console's drawbars and switches included.

### Tine Piano (patch)
- Its page follows the plugin in the plugin window's Views.

### Huygens Keyboard (patch)
- Its page follows the plugin in the plugin window's Views.

### Black-Hole Keyboard (patch)
- Its page follows the plugin in the plugin window's Views.

### Harpsichord (patch)
- Its engine's messages reach the plugin window's views.
