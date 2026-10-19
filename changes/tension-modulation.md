# tension modulation: hard notes start sharp and glide down

### Ribbon Piano (minor)
- **Tension modulation (Kirchhoff–Carrier):** a hard blow stretches the string, so its tension
  and every partial's pitch rise, then glide back as the note decays. Each unison string has its
  own tension, from both bending families (torsion neither stretches nor feels it); tapered
  members use their Ritz shapes. One C3 string at 5 m/s starts 5 ¢ sharp and is within 0.5 ¢
  after 1.8 s; a soft blow does not move. A voice costs about a third more while it glides and
  nothing more once the glide is under a hundredth of a cent.
- New checkbox *Tension modulation (pitch glide)* under *String*, on by default (parameter `kc`).

### Electric Grand (minor)
- **Tension modulation (Kirchhoff–Carrier):** the CP-70's short, stiff strings stretch a lot under
  a hard blow: at full velocity E1 starts 45 ¢ sharp and is 6 ¢ sharp after 1.8 s, C4 18 ¢. It
  grows with the square of the blow, so at velocity 0.6 E2 starts 3 ¢ sharp. Only the steel core
  stretches; the winding adds mass. About 40 % more CPU while a note glides.
- New checkbox *Tension modulation (pitch glide)* under *Strings*, on by default (parameter `kc`).

### Harpsichord (minor)
- **Tension modulation (Kirchhoff–Carrier):** the pluck's 2–4 mm lift stretches the wire, so each
  note starts sharp and settles: c¹ about 5 ¢, c³ about 25 ¢ (short strings plucked near the nut
  stretch most), FF about 9 ¢ held through its long decay. Touch hardly changes it, as the
  plectrum lets go where it lets go. About 30 % more CPU while a string glides.
- New checkbox *Tension modulation (pitch glide)* under *Strings and tuning*, on by default
  (parameter `kc`).
