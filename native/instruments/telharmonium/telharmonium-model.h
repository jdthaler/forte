// telharmonium-model.h — the physics, in closed form: what the engine plays and the page draws.
//
//   the pitch-shafts: twelve steel shafts (one a pitch class), geared to one motor, carry inductor
//   alternators; an alternator with T rotor teeth on shaft p makes T times the shaft's turning
//   rate. Keys are tempered between shafts and harmonic along one: a key's n-th harmonic is the
//   alternator with n times its teeth, on its own shaft (Cahill's patents; Weidenaar 1995, Table 4)
//   a key's own alternator has 4·2^octave teeth (the 1906 C-shaft: C3 4 teeth, 129.33 Hz at A = 435);
//   a just third or seventh above a key j is the alternator with 5 or 7 times j's teeth over 4
//   the buses: every key's n-th harmonic flows through bus n of its manual, a transformer coil with
//   its stop (an impedance rheostat) in series. N alternator windings Z_s in parallel on one load
//   Z_L each give a current e/(Z_s + N Z_L): every note added robs the others (Cahill's "robbing")
//   the circuit: windings and coils of one time constant τ = L/R, so a sine switched in at any
//   instant leaves an offset decaying as e^{−t/τ} (the "diaphragm crack")
//   the line: the telegrapher's line, R, L and C a kilometre (G = 0), between the output
//   transformer's resistance and the receivers', exact (cosh γℓ, sinh γℓ); the engine plays its
//   impulse response, sampled from it
//   the receiver: a clamped soft-iron disc (its first mode, λ² = 10.2158) pulled by the square of
//   the magnet's flux plus the coil's; a paper horn, a complete cone (resonances n c/2L)
#pragma once

#include <complex>
#include <vector>

namespace forte::telharmonium {

using cplx = std::complex<double>;

constexpr int HARMONICS = 8, MANUALS = 2, BUSES = HARMONICS * MANUALS;
constexpr double LOAD_REF = 10 * HARMONICS; // the load of ten notes, every stop full out, unrobbed
constexpr double TAP_HZ = 300;                    // the output transformer's tap makes up the line's loss here
constexpr double C_AIR = 343;                     // m/s
constexpr double MOUTH = 0.17;                    // the horn's mouth radius over its length (a cone of about 10°)
constexpr double HORN_THROAT = -0.8;              // the throat's reflection (a paper cone's apex, with its losses)

// The receiver's diaphragm: soft iron, clamped at its rim.
constexpr double IRON_E = 200e9, IRON_RHO = 7870, IRON_NU = 0.29;
constexpr double PLATE_L2 = 10.2158;              // clamped circular plate, first mode: ω = (λ²/a²)√(D/ρh) (Leissa 1969)
constexpr double DIAPHRAGM_A = 0.025, DIAPHRAGM_H = 0.000254; // a 5 cm disc 1/100 inch thick (Cahill, 1902)
constexpr double DIAPHRAGM_Q = 4;                 // loaded by its horn

// The lines: a kilometre's resistance (Ω, the loop), inductance (H) and capacitance (F), and the
// terminations (Ω): the output transformer's secondary and the receivers.
struct LineKind { double R, L, C; };
constexpr LineKind CABLE = {52.8, 0.62e-3, 52e-9}; // #19 gauge, paper insulated: 85 Ω, 1 mH, 0.084 µF a loop mile
constexpr LineKind OPEN = {2.6, 2.2e-3, 5.3e-9};   // 104-mil copper on poles, 12 inches apart
constexpr double R_SOURCE = 600, R_LOAD = 600;

// The shafts and teeth.
double shaftUnit(int pc, const double *keyTarget);     // a shaft's turning rate (rev/s) at full speed: keyTarget[60 + pc] / 128
inline int ownTeeth(int key) { return 4 << (key / 12); }
struct Assign { int shaft = 0, teeth = 4; };
// The alternator a key plays: its own shaft, or (root ≥ 0) the just third (5 : 4) or minor
// seventh (7 : 4) of the root key's own alternator, from the root's shaft. Fails (shaft −1) when
// the interval is neither.
Assign assign(int key, int root);
// The shafts built in 1906 (C, D, E♭, E, F, G, A, B♭); the others' keys are the just thirds of A, D, E, G.
bool built(int pc);
// The 1906 C-shaft's alternators (Weidenaar, Table 4) for a check: frequency of `teeth` at A = 435.
double cShaft435(int teeth);

// A stop's level for the single note it carries: 0 off, k = 1..8 is 3 dB a step up to the full switch.
double stopLevel(double k);
// Bus load ratio ρ_h = Z_L/Z_s of a bus at level ℓ with the coil's own ratio ρ: (1 + ρ)/ℓ − 1.
double busRho(double level, double rho);
// Each of N notes' current on a bus, relative to one note at a full stop: (1 + ρ)/(1 + N ρ_h).
double busGain(int N, double level, double rho);
// The winding's response to its EMF iωΦ: iωτ/(1 + iωτ) (flat above 1/(2πτ)).
cplx circuit(double f, double tau);

// The line's current into the receivers over the source's EMF, relative to no line (R_s + R_r).
cplx lineExact(double f, const LineKind &k, double km);
// Its impulse response at fs, normalised by |H(TAP_HZ)| (but no frequency lifted past LINE_LIFT)
// and delayed by LINE_DELAY samples (so the band-limited response's ringing before its arrival is
// kept); its length, at most `max`.
constexpr int LINE_DELAY = 32, LINE_N = 16384;
constexpr double LINE_LIFT = 2;
int lineImpulse(const LineKind &k, double km, double fs, float *out, int max);


// The fields' voicing: Cahill's rheostats set each alternator's output "to compensate for the
// tendency of receiver diaphragms to produce some tones at different volumes": (Q/|H_r(f) H_m(f)|)^v
// for the 1906 diaphragm in a six-foot horn, H_m = ika/(1 + ika) the mouth's high-pass (v = 1: their
// response undone, every alternator as loud as one at resonance), at most VOICING_MAX.
constexpr double VOICING_MAX = 60, VOICED_HORN = 1.8;
double voicing(double f, double v);
// The diaphragm's first resonance (Hz) for radius a, thickness h.
double plateF01(double a, double h);
double receiverF0(int receiver); // 0: Cahill's thin diaphragm; 1: Arthur Cahill's (10× the area, 3× as thick)
// The receiver's diaphragm velocity per unit force (normalised: iω/ω₀ · ω₀²/(ω₀² − ω² + iωω₀/Q)).
cplx receiverResponse(double f, double f0);
// The horn's radiated pressure per unit throat drive (length L m; L = 0: the bare receiver).
cplx hornResponse(double f, double L);

// A small dense matrix exponential, row-major d × d (scaling and squaring, Taylor): work holds 3 d².
void expm(const double *A, int d, double *out, double *work);

} // namespace forte::telharmonium
