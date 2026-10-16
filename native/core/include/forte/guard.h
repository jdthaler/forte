// guard.h — shared/guard.js: a NaN or an infinity must not silence the instrument for good (it
// would also lodge in the reverb and the limiter). Zero the block; the caller stops the notes.
#pragma once

#include <cmath>
#include <cstring>

namespace forte {

// True if the block is finite; otherwise zeroes it and returns false.
inline bool guardBlock(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) if (!std::isfinite(L[i] + R[i])) {
    std::memset(L, 0, n * sizeof *L);
    std::memset(R, 0, n * sizeof *R);
    return false;
  }
  return true;
}

} // namespace forte
