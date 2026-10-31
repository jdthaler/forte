// hydrogen-tour.js — the guided tour of the hydrogen lamp's physics (shared/tour.js)
import { tour, note, chord } from '../../shared/tour.js';

export const TOUR = tour('hydrogen', [
  {
    title: 'The light of hydrogen, as sound',
    views: ['The spectroscope', 'Energy levels'],
    play: [note('A3', { dur: 5 })],
    text: `A hydrogen lamp glows in a few sharp colours: the **Balmer series**, red Hα, blue-green Hβ, violet Hγ and on. Each line is an electron falling from a level n to level 2, at a frequency \`∝ 1/2² − 1/n²\` (Rydberg's formula; Bohr's atom, 1913).

Each key plays the whole spectrum with Hα on the key: the other lines sound at their true ratios to it, so every note is a chord the atom chose.`,
  },
  {
    title: 'The cascade',
    views: ['Energy levels', 'Spectrogram'],
    preset: 'Laser to 12p: a long cascade',
    play: [note('A3', { dur: 7 })],
    text: `A laser lifts atoms to one level, here 12p. From there they fall **step by step**, l changing by one each time, until they reach the ground state 1s: a cascade.

In slow motion you hear it fill in: the lines from 12p at once, those lower down only as the cascade reaches their upper level. The Grotrian diagram lights each level by how many atoms it holds.`,
  },
  {
    title: 'A lamp and a nebula',
    views: ['The spectroscope', 'Energy levels'],
    play: [chord('A3 E4', { dur: 4 }), { at: 4, set: { excitation: 'recombination', temperature: 10000, caseB: true, density: 1000 } }, chord('A3 E4', { at: 4.1, dur: 4 })],
    text: `In a discharge lamp, electrons knock atoms up from the ground state: mostly into low levels, so Hα is loud and the series short.

In a nebula, starlight has stripped the atoms bare and electrons are **recaptured**, often into high levels, and cascade down: the series reaches much higher. Astronomers read a nebula's temperature and density from these ratios.`,
  },
  {
    title: 'Other windows: Lyman and Paschen',
    views: ['The spectroscope', 'Spectrum'],
    preset: 'The Lyman series: two octaves and a fourth up',
    play: [note('A2', { dur: 3.5 }), { at: 3.5, set: { window: 'infrared', excitation: 'recombination', temperature: 10000 } }, note('A5', { at: 3.6, dur: 3.5 })],
    text: `Falls to level 1, the **Lyman** series, lie in the ultraviolet: Lyman α is \`(1 − ¼)/(¼ − 1/9) = 5.4\` times Hα's frequency, two octaves and a fourth up. Falls to levels 3, 4 and 5 (Paschen, Brackett, Pfund) lie in the infrared, far below.

The spectroscope's window chooses which you hear, each still pitched against Hα on the key.`,
  },
  {
    title: 'Crowded by ions: Stark broadening',
    views: ['Spectrum', 'Spectrogram'],
    preset: 'A dense plasma: Stark-broadened lines',
    play: [chord('A3 E4', { dur: 6 })],
    text: `In a dense plasma every atom feels the electric fields of the ions around it, which shift its levels (the **Stark effect**). The high levels, big and loosely bound, are shifted most: the lines from the top of the series smear into bands and merge.

The width of the lines measures the plasma's density: this is how the densities of white-dwarf atmospheres are found.`,
  },
]);
