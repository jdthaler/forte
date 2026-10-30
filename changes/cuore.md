# CUORE

### CUORE (new)
- New instrument, in the devices section: the crystals of CUORE, the Cryogenic Underground
  Observatory for Rare Events, the neutrinoless double beta decay search under the Gran Sasso.
  Every key is a 5 cm cube of tellurium dioxide at 10 mK, read by a germanium thermistor; its
  heater fires a pulse of heat at the key's rate, sped up (1,320 times at the defaults), and the
  thermistor's voltage is the sound.
- **The bolometer:** the CUORE collaboration's electrothermal model, stepped every sample (ROS2,
  split where a pulse lands): the bias circuit (60 GΩ loads, the wires' 500 pF), the thermistor's
  electrons (R₀ exp(√(T₀/T)), Joule heating, electron–phonon coupling), the crystal's Debye T³
  heat capacity (2.2 nJ/K at 10 mK) and the Teflon clips to the copper. A 2,528 keV pulse is
  370 µV, rising in 76 ms and falling in 316 ms, against CUORE's measured 55 and 220 ms.
- **What you hear:** every key's pulses pass through the same bolometer, so its rise and fall are
  one formant over the keyboard: low keys buzz, high keys pile up and round off. Big pulses
  saturate the thermistor (mellower, not as much louder); the mod wheel warms the heat sink to
  14 mK (twenty times quieter, slower pulses); 8 mK's hot electrons fall fast. Velocity is the
  pulse's energy (2,528 keV at full, the decay's Q-value), aftertouch adds to it, and pitch bend
  and MPE bend the heater's rate.
- **Views:** the pulses in the crystal's own time, with the proportional answer dashed, and the
  bolometer, each part glowing as it warms.
- Presets: CUORE at 10 mK, its real heater (a pulse every 300 s on A4), warmer, colder, big
  pulses, Cuoricino's 3 cm crystal, long wires, piled up.
- Its plugins (CLAP, VST3, AU and standalone, AU code `Cuor`), with the others.
