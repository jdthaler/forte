# the RF cavity bells no longer crash when a held high key is pressed

### RF Cavity Bells (patch)
- **No more "memory access out of bounds":** pressing into a held key (aftertouch, a Seaboard's Press), or turning up the Beam current while one is held, started its train of bunches with the first one long overdue. On keys whose bunches come less than a block apart (G6 and up at the default spacing) the engine then wrote before its output, and the page stopped with that error. A train now starts on the next of the accelerator's buckets, every bunch spacing from the strike on, so it builds the field in step with the strike's whatever moment the pressure comes.
