// chladni-model.h — the physics: a thin square plate (Kirchhoff) held at its centre by a clamp,
// or free and held only by a finger, as Chladni held his plates, and drawn on with a bow at its
// edge. Its modes come from a Rayleigh–Ritz solve in Legendre polynomials, split by the plate's
// symmetry into four blocks (even or odd across each centre line); every key is the same plate
// scaled so that the chosen figure's mode sounds its note.
#pragma once

#include <array>
#include <vector>

namespace forte::chladni {

constexpr int ORDER = 24;            // Legendre polynomials P0 … P23 along each side
constexpr int HALF = ORDER / 2;      // a block's polynomials along each side
constexpr int BLOCK = HALF * HALF;   // a block's basis
constexpr int MAXMODES = 64;         // the modes kept, lowest first
constexpr double CLAMP = 0.05;       // the clamp's radius, as a fraction of the side (Chladni's: a thumb's breadth on a hand-sized plate)
constexpr double KAPPA = 2e5;        // the clamp's leather pads, both sides: their stiffness over the disc, in D/(a/2)⁴
constexpr int PATH = 201;            // samples of the modes along the bow's path (two half-edges)
constexpr double FINGER = 8;         // N·s/m: a fingertip pressed on the plate (its pulp, as a dashpot)
constexpr double ETA_SPOTS = 2.5e-3; // the loss (η) the figures' spots are worked out for (only the modes' ratios count)
constexpr double QMIN = 240;         // the most a plate's clamp and the air can take: η ≤ 1/QMIN

// The plate's materials: Young's modulus (Pa), density (kg/m³), Poisson's ratio.
struct Material { const char *name; double E, rho, nu; };
extern const std::array<Material, 4> MATERIALS;

// The figures the keyboard offers: a mode of the clamped brass plate (its block and its place in
// it), as Chladni's sand draws it; on another plate, the mode of that block most like it.
struct Figure { int block, index; };
constexpr int NFIG = 10;
extern const std::array<Figure, NFIG> FIGURES;

// Where a figure is bowed and held: the bow's place on its path (0 … 2: from the middle of the edge
// x = 1 up to the corner (1, 1) at 1, then along the edge y = 1 to its middle), the two fingers'
// places, and each mode's φ² summed under them.
struct Spots {
  int mode = 0;
  double bow = 0;
  std::array<double, 2> fx{}, fy{};
  std::array<double, 64> finger{}; // MAXMODES
};

// One mode of the unit plate (side 2, centre at 0): Λ = ω (a/2)² √(ρh/D), its symmetry block
// (x parity + 2·y parity, 0 even, 1 odd), the number of Chladni's nodal lines it shows, and its
// coefficients on the block's polynomials, mass-normalised so that ∫∫ φ² = 4 (a mean square of 1).
struct PlateMode {
  double lambda = 0;
  int block = 0, index = 0; // index: its place in its block, lowest first
  std::array<double, BLOCK> c{};
};
struct Plate {
  int count = 0;
  double nu = 0;
  bool clamped = false;
  std::array<PlateMode, MAXMODES> m;
  std::array<std::array<float, PATH>, MAXMODES> edge{}; // each mode along the bow's path
  std::array<Spots, NFIG> spots{};
};

// The plate's modes for Poisson's ratio nu, clamped at the centre or free (its three rigid motions
// left out). Computed once for each (material, support) and kept.
const Plate &plate(int material, bool clamped);
// Solve into pl (big: keep it off the stack); spots false leaves out the bow's path and the figures'
// spots (the tests' plates), κ the clamp's stiffness.
void solvePlate(Plate &pl, double nu, bool clamped, double kappa = KAPPA, bool spots = true);

// Mode n's displacement at (x, y) on the unit plate (−1 … 1).
double shape(const Plate &pl, int n, double x, double y);
// The point on the bow's path at s (0 … 2), and s shifted by d along it, turned back at its ends.
void pathPoint(double s, double &x, double &y);
double pathShift(double s, double d);
// Mode n along the bow's path at s (interpolated from the table).
double edgeShape(const Plate &pl, int n, double s);

// The mode a figure is on this plate: the mode of its block most like the clamped brass plate's.
int figureMode(const Plate &pl, int figure);
// Where to bow a figure and hold it: the bow where the figure's mode would win over every other
// (its swing there against each mode's loss), two fingers on its nodal lines where the rivals that
// bow would drive move most. Worked out once a plate.
Spots figureSpots(const Plate &pl, int figure);

// A key's plate: its side (m), mass (kg), and for each mode its frequency (Hz) and decay rate (1/s).
struct KeyPlate {
  int count = 0;            // the modes kept (below 18 kHz)
  double side = 0, mass = 0, f0 = 0, eta = 0;
  int target = 0;           // the figure's mode
  const Plate *plate = nullptr;
  std::array<double, MAXMODES> f{}, sigma{};
};
// Parameters indexed as in chladni-params.h; the figure's mode on the key's note in the keyboard's
// tuning.
KeyPlate keyPlate(int key, const double *P, const Plate &pl);
// Which of the eight plates (material × held) the parameters ask for: plate(id / 2, id % 2 == 1).
int plateId(const double *P);

// The bow's friction on the edge (rosin on the brass or glass): μ(u) = μd + (μs − μd) / (1 + u/v0).
struct Friction {
  double mus, mud, v0;
  double slope(double u) const { const double e = 1 / (1 + u / v0); return ((mus - mud) * e * e) / v0; } // −dμ/du
};
Friction friction(const double *P);
// The bow force (N) at which the figure's mode just starts to grow from rest: where the friction's
// fall with speed, N |μ′(V)| φb² / 2m, pays its loss σ (the metal's and the fingers'), with the bow
// at the figure's own place.
double threshold(const KeyPlate &k, const double *P);

} // namespace forte::chladni
