// saw-model.h — the physics of the musical saw: a thin steel blade bent along its length into an
// S, whose curvature changes sign along a line across it (the inflection). A bending wave that
// varies across the blade (its shape φₘ(y), a free–free beam's, wavenumber q = βₘ/W) is stiffened
// wherever the blade is curved, because bending it there stretches the steel (Donnell's shallow
// shell; Shankar, Bryde & Mahadevan 2022). At the inflection the curvature is zero, so the wave
// is softest there, and it is trapped: the curved blade on either side cannot carry it at its
// frequency. With b(x) = b′x through the inflection, the trapped modes are the eigenmodes of
//   Ω² f = L² f + ε² X L⁻² (X f),   L = ∂²_X − 1,   X = q x,   Ω = ω / (a q²),   ε = c b′ / (a q³)
// (a² = κ/ρh = c²h²/12(1 − ν²), c² = Y/ρ), solved once in saw-table.h; for small ε a harmonic
// well, Ω² ≈ 1 + (2n + 1)√2 ε. The note is the lowest trapped mode with two nodal lines along the
// blade (φ₂). The blade tapers, so where the inflection sits sets q, and with the bend's ε, the
// note: the player slides the S along the blade to play.
//
// The player bends the S tighter as it moves toward the narrow, stiff tip (our model of the
// player: b′ ∝ 1/W², so the curvature keeps pace with the blade's stiffness, a² q⁴), and the S
// turns over X_S on either side of the inflection: past that the curvature holds at b₀ = b′X_S.
// Away from the inflection the curvature saturates (b₀ tanh(b′x/b₀)) and the blade widens toward
// the handle, so the curved blade's band edge, ω_edge²(x) = a²q(x)⁴ + c²b(x)², is the barrier the
// mode must tunnel through to reach the knees or the fingers that hold the blade, where its energy
// is lost. Gamow's rate, the bounce rate in the well (the levels' spacing over 2π) times the WKB
// transmission e^(−2∫κ dx), κ² = (ω_edge² − ω²)/(2a²q²), is the leak to the hands.
//
// Keys past the blade's compass play a bigger or smaller saw of the same shape: every length
// scaled by λ, which leaves ε alone and divides each frequency by λ.
#pragma once

namespace forte::saw {

// Steel.
constexpr double YOUNG = 200e9, RHO = 7850, NU = 0.29;
// A 26-inch musical saw (our numbers for a typical blade, not one maker's): its length, its width
// at the heel (by the handle) and at the toe, and where along it the inflection can sit and the
// hands hold it, as fractions of the length from the handle.
constexpr double LEN = 0.66, W_HEEL = 0.17, W_TOE = 0.045;
constexpr double S_LO = 0.25, S_HI = 0.85;
constexpr double GRIP_HEEL = 0.03, GRIP_TIP = 0.97;
constexpr double W_MID = 0.5 * (W_HEEL + W_TOE);  // the width halfway along, where the bend's b′ is the parameter's
constexpr double X_S = 0.1;                        // m: half the S's turn, past which the curvature holds at b₀ = b′·X_S
constexpr double BETA[2] = {4.730041, 7.853205};   // free–free beam across the width: the first two bending shapes
constexpr double Q_J = 10;                         // a J's waves, unconfined: Shankar et al.'s measured Q
constexpr double HAND_T60 = 0.3;                   // s: a hand laid on the blade after its key

// The trapped modes a voice plays, the note first: (shape across the width, order along it). The
// Quality keeps the first NMODES_Q of them.
constexpr int NMODE = 5;
struct ModeId { int m, n; };
constexpr ModeId MODES[NMODE] = {{0, 0}, {0, 1}, {1, 0}, {0, 2}, {1, 1}};
constexpr int NMODES_Q[3] = {5, 3, 2};

double waveSpeed();            // c = √(Y/ρ)
double plateA(double h);       // a = c h / √(12(1 − ν²)), m²/s
double widthAt(double s);      // the blade's width at s (fraction of the length from the handle), m
double crossShape(int m, double u); // φₘ across the width, u in [0, 1]; ±2 at the edges, mean square 1
double hermite(int n, double xi);   // the normalised Hermite function hₙ(ξ), ∫ hₙ² dξ = 1

struct Trap { double Omega, rms; }; // ω/(a q²), and the RMS width along the blade in 1/q
Trap trapped(double eps, int n);    // from saw-table.h; past its ends, the harmonic well

// The blade as the parameters make it.
struct Blade { double h, bend, eta; bool S; };
Blade blade(const double *P);

// The note (Hz) with the inflection at s, on the blade as built (λ = 1).
double noteAt(const Blade &b, double s);

// A voice's blade bent for the note f: where the inflection sits, the scale, and every mode.
struct Plan {
  double f = 0;                       // the note (Hz)
  double s = 0, lambda = 1;           // the inflection (fraction of the length) and the blade's scale
  double W = 0, h = 0, bend = 0, b0 = 0, a = 0; // there: width (m), thickness (m), b′ (1/m²), b₀ (1/m), a (m²/s)
  double q[2] = {}, eps[2] = {};      // each shape's q (1/m) and ε
  double fm[NMODE] = {}, ell[NMODE] = {}, mass[NMODE] = {}, sigma[NMODE] = {}, leak[NMODE] = {};
  double massS = 0, sigmaS = 0;       // the note's mode on an S of this bend: its mass and its losses
  // fm: Hz; ell: the Hermite length along the blade (m); mass: modal mass (kg, ρhWℓ); sigma: the
  // amplitude's decay rate (1/s), leak its share from tunnelling to the hands
};
Plan plan(const Blade &b, double f);

// The local band edge (Hz) of shape m at x metres from the inflection (toward the tip positive),
// on the blade the plan bends: below it a wave of that shape cannot run there.
double bandEdge(const Plan &pl, int m, double x);
// e^(−2∫κ dx) from the inflection out to the grip on one side (side −1 the handle, +1 the tip).
double transmission(const Plan &pl, int m, double omega, int side);

// The bow's friction: μ(u) = μd + (μs − μd)/(1 + u/v₀) at sliding speed u (m/s).
struct Friction {
  double mus = 0.8, mud = 0.3, v0 = 0.1;
  double slope(double u) const { const double e = 1 / (1 + u / v0); return ((mus - mud) * e * e) / v0; } // −dμ/du
};
// The bow force (N) at which the note's mode just starts to grow, bowed at the inflection of an S
// of this bend (a J's is the S's: nothing it can hold grows there): the bow pressure's unit.
double threshold(const Plan &pl, double speed);

} // namespace forte::saw
