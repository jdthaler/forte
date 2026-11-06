# Strike on the Singing Arc and the Huygens Keyboard

### Forte (patch)
- A descriptor's `strike` may say what velocity does where it isn't how loud, and the Seaboard panel shows it (`shared/rise.js`).

### Singing Arc (minor)
- Strike: velocity is how hard the key closes its contact. A soft key closes it slowly, and the note swells in later (half its level in about 180 ms at the softest). A hard one closes it with a jolt that knocks the capacitor's charge off the arc's voltage, and the note sounds at once (in 30–65 ms). The computer keys' 0.75 plays as before. The Expression group gains its Strike switch, and the plugin gains its parameter.

### Huygens Keyboard (minor)
- Strike: velocity is how fast the key brings its lamp's supply on and opens its keyer. The softest key takes eight times the Key attack, so the note eases in. The hardest takes an eighth of it, switching the note on at once. The computer keys' 0.75 plays as before. The Expression group gains its Strike switch, and the plugin gains its parameter.
