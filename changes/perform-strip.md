# the controls above the keys are back

### Forte (patch)
- **The strip of controls above the keys is back on every instrument page:** since the pages wait
  for their WebAssembly model before building their controls, the layout placed them before they
  existed, leaving every control in the sidebar and "More controls" alone above the keys (and the
  presets without "Default settings"). The layout now places controls whenever the page adds them.
