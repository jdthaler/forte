# the page check plays the front page's demos

### Forte (patch)
- `tools/check-pages.mjs` checks the front page's Listen buttons: one for each instrument with a
  demo, and two in turn switch to ■ Stop and play their own demo (each served demo plays as a
  short WAV, since Playwright's Chromium decodes no AAC).
