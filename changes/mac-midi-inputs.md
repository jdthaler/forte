# the Mac apps pick their MIDI inputs

### Forte (minor)
- **The Mac standalone apps pick their MIDI inputs:** Audio/MIDI Settings lists every MIDI input
  with a tick box where it said "Coming Soon". All are ticked at first, as before; an unticked one
  is disconnected, and stays so the next time the app opens, while an input plugged in later is
  connected. It is a change to clap-wrapper kept in `native/cmake/patches/` and applied when the
  build fetches it. Windows already had a picker; Linux's apps still connect every input.
