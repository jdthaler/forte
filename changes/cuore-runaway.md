# CUORE keeps sounding when Doping moves under a held key

### CUORE (patch)
- **A held key no longer goes silent when Doping moves a long way** (3.4 to 4.9 K, or back): the
  thermistor's resistance jumps 45 times under it, its electrons run away electrothermally, and the
  step took that growth as decay, ran the wrong way and reached NaN. The step now caps the growth
  it takes (ROS2 stays second order with any Jacobian) and follows the runaway; the note settles
  to sound as a key struck at the new Doping.
- **A step that still leaves the physical range after every halving is kept in it**, instead of
  starting the next from millikelvins and volts no thermistor reaches: big pulses in a small
  crystal at a long heater period (a sample is seconds of the crystal's time) went to NaN too.
- The defaults and every preset sound exactly as before.
