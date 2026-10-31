# saved states written as the plugins save them

### Forte (patch)
- `tools/contract.mjs --save-states` writes a value as the plugins save it: a value off its step
  on the step (the carillon's *Warbling bells* strike angle, 11.25° on a 0.5° step, saves as
  11.5°), and a tiny one with its whole exponent (Project 8's gas, 1e-10 mbar, had been written
  as 1e-1). The two states 0.42.0 wrote are written again, so the plugins' saved-state test
  passes and the 0.42.0 plugins can be built.
