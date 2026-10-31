// quantum-tour.js — the guided tour of the quantum keyboard's physics (shared/tour.js)
import { tour, note, chord, run } from '../../shared/tour.js';

export const TOUR = tour('quantum', [
  {
    title: 'A wavepacket in a box',
    views: ['Packet in the well', 'Quantum carpet'],
    play: [note('C4', { dur: 8 })],
    text: `Each key launches a quantum **wavepacket** in a square well: a superposition of energy levels around n̄ = 40. It bounces back and forth like a classical particle at first, and the detector's signal is the note.

But the levels are not evenly spaced (Eₙ ∝ n² in a box), so the packet's components drift out of phase and it **smears out** across the well: the note fades. The carpet, sampled once per bounce, shows it.`,
  },
  {
    title: 'Revivals',
    views: ['Quantum carpet', 'Return probability |⟨ψ(0)|ψ(t)⟩|²'],
    play: [note('C4', { dur: 9 })],
    text: `The smearing is not forever. Because the levels' spacing grows evenly, at the **revival time** T_rev every component is back in phase and the packet re-forms whole: the note comes back.

In between are **fractional revivals**: at T_rev/q the packet splits into q copies, sounding an octave or a twelfth up. The page locks T_rev to the tempo, so the notes return on the beat: the echoes are the packet's own physics, not a delay line.`,
  },
  {
    title: 'The harmonic oscillator never dephases',
    views: ['Quantum carpet', 'Spectrogram'],
    preset: 'Harmonic oscillator: never dephases',
    play: [note('C4', { dur: 4 }), { at: 4, set: { potential: 'box' } }, note('C4', { at: 4.1, dur: 5 })],
    text: `In a harmonic well the levels are **exactly evenly spaced**, so every component keeps step forever: the packet swings back and forth unchanged, one steady tone that never dissolves.

Then the same note in the square well: a tone that dissolves and reassembles. The difference is the quadratic term in the energy levels.`,
  },
  {
    title: 'Octave echoes: a molecule',
    views: ['Return probability |⟨ψ(0)|ψ(t)⟩|²', 'Spectrogram'],
    preset: 'Morse molecule: octave echoes at T_rev/4',
    play: [run('C4 E4 G4', { step: 1.4, dur: 1.2 })],
    text: `The Morse potential describes a vibrating diatomic molecule. Its packets revive too, with an **octave echo** at T_rev/4, where the packet is in two copies, and the return probability touches ½.

Played at tempo, each note comes back on the beat and an octave up on the off-beats.`,
  },
  {
    title: 'Decoherence: no way back',
    views: ['Return probability |⟨ψ(0)|ψ(t)⟩|²', 'Spectrogram'],
    preset: 'Dephasing: no way back',
    play: [note('C4', { dur: 8 })],
    text: `A revival needs the phases to stay coherent. Add random **dephasing** (an environment nudging each level) and the components can no longer find their way back into step: the attack is identical, but **nothing returns**.

That is decoherence, the reason the quantum world's revivals are hard to see: the faint trace in the return-probability view is what the coherent packet would do.`,
  },
]);
