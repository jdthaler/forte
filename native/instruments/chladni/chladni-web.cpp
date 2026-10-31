// chladni-web.cpp — the model's functions the page's views and the tests call (chladni/src/chladni-wasm.js).

#include "forte/web.h"
#include "chladni-model.h"

using namespace forte::chladni;

namespace {
const Plate &plateOf(int id) { return plate(id / 2, id % 2 == 1); }
Plate scratchPlate; // the tests' plates, solved at any Poisson ratio and clamp
}

extern "C" {
// A plate (id = 2·material + clamped): its mode count, and each mode's Λ, block and place in it.
FORTE_EXPORT int chladni_mode_count(int id) { return plateOf(id).count; }
FORTE_EXPORT double chladni_lambda(int id, int n) { return plateOf(id).m[n].lambda; }
FORTE_EXPORT int chladni_block(int id, int n) { return plateOf(id).m[n].block; }
// Mode n's shape at (x, y) on the unit plate, −1 … 1.
FORTE_EXPORT double chladni_shape(int id, int n, double x, double y) { return shape(plateOf(id), n, x, y); }
// Mode n's shape on a g × g grid over the plate (row by row from y = −1), into out.
FORTE_EXPORT void chladni_grid(int id, int n, int g, float *out) {
  const Plate &pl = plateOf(id);
  for (int j = 0; j < g; j++)
    for (int i = 0; i < g; i++) out[j * g + i] = (float)shape(pl, n, -1 + (2.0 * i) / (g - 1), -1 + (2.0 * j) / (g - 1));
}
// A figure's spots: its mode, the bow's place on its path, the fingers' x and y (into out[6]).
FORTE_EXPORT void chladni_spots(int id, int figure, double *out) {
  const Spots &s = plateOf(id).spots[figure];
  out[0] = s.mode; out[1] = s.bow; out[2] = s.fx[0]; out[3] = s.fy[0]; out[4] = s.fx[1]; out[5] = s.fy[1];
}
FORTE_EXPORT void chladni_path_point(double s, double *out) { pathPoint(s, out[0], out[1]); }
FORTE_EXPORT double chladni_path_shift(double s, double d) { return pathShift(s, d); }
// A key's plate for parameters P: side, mass, f0, η, the figure's mode and the mode count; then
// each mode's frequency and decay (into out: 6 + 2·count values).
FORTE_EXPORT int chladni_key_plate(int key, const double *P, double *out) {
  const KeyPlate k = keyPlate(key, P, plateOf(plateId(P)));
  out[0] = k.side; out[1] = k.mass; out[2] = k.f0; out[3] = k.eta; out[4] = k.target; out[5] = threshold(k, P);
  for (int n = 0; n < k.count; n++) { out[6 + 2 * n] = k.f[n]; out[7 + 2 * n] = k.sigma[n]; }
  return k.count;
}
// The tests: solve a plate at Poisson ratio nu, clamped or free, with clamp stiffness kappa; then
// its Λ and shapes.
FORTE_EXPORT int chladni_solve(double nu, int clamped, double kappa) { solvePlate(scratchPlate, nu, clamped != 0, kappa, false); return scratchPlate.count; }
FORTE_EXPORT double chladni_solved_lambda(int n) { return scratchPlate.m[n].lambda; }
FORTE_EXPORT int chladni_solved_block(int n) { return scratchPlate.m[n].block; }
FORTE_EXPORT double chladni_solved_shape(int n, double x, double y) { return shape(scratchPlate, n, x, y); }
FORTE_EXPORT double chladni_finger() { return FINGER; }
FORTE_EXPORT double chladni_clamp() { return CLAMP; }
FORTE_EXPORT double chladni_kappa() { return KAPPA; }
}

// The tests' hooks, on the engine of a handle (forte_engine).
#include "chladni-engine.h"
extern "C" {
FORTE_EXPORT int chladni_voice_count(forte::Engine *e) { return static_cast<ChladniPlateEngine *>(e)->count; }
// voice i: key, touch, N, stick fraction, modes played, the figure's mode, the bow's place, side, mass
FORTE_EXPORT void chladni_voice_state(forte::Engine *e, int i, double *out) {
  const auto &v = *static_cast<ChladniPlateEngine *>(e)->voices[i];
  const double a[9] = {(double)v.key, v.touch ? 1.0 : 0.0, v.N, v.sticks, (double)v.M, (double)v.kp.target, v.s, v.kp.side, v.kp.mass};
  for (int j = 0; j < 9; j++) out[j] = a[j];
}
// voice i's modal displacements (which 0) or last ones (1)
FORTE_EXPORT const double *chladni_voice_q(forte::Engine *e, int i, int which) {
  const auto &v = *static_cast<ChladniPlateEngine *>(e)->voices[i];
  return which ? v.q1.data() : v.q.data();
}
}
