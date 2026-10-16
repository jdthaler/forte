// denormals.h — flush denormals to zero while the audio thread processes: decaying modes and
// filters reach them, and on x86 they cost a hundred times a normal number.
#pragma once

#if defined(__SSE2__) || defined(_M_X64) || (defined(_M_IX86_FP) && _M_IX86_FP >= 2)
#include <immintrin.h>
#define FORTE_FTZ_SSE 1
#endif

namespace forte {

class NoDenormals {
 public:
  NoDenormals() {
#if FORTE_FTZ_SSE
    saved = _mm_getcsr();
    _mm_setcsr(saved | 0x8040); // flush to zero, denormals are zero
#elif defined(__aarch64__)
    __asm__ __volatile__("mrs %0, fpcr" : "=r"(saved));
    __asm__ __volatile__("msr fpcr, %0" ::"r"(saved | (1ull << 24))); // FZ
#endif
  }
  ~NoDenormals() {
#if FORTE_FTZ_SSE
    _mm_setcsr(saved);
#elif defined(__aarch64__)
    __asm__ __volatile__("msr fpcr, %0" ::"r"(saved));
#endif
  }
  NoDenormals(const NoDenormals &) = delete;
  NoDenormals &operator=(const NoDenormals &) = delete;

 private:
#if FORTE_FTZ_SSE
  unsigned saved = 0;
#elif defined(__aarch64__)
  unsigned long long saved = 0;
#endif
};

} // namespace forte
