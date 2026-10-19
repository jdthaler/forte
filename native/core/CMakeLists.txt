# forte_core: the engine contract and what every instrument shares (docs/PLUGINS.md, step 2):
# DSP, impulse responses, linear algebra, the output chain, and the real-time plumbing.
add_library(forte_core STATIC
  src/params.cpp src/fdlibm.cpp src/impulses.cpp src/linalg.cpp src/fft.cpp src/convolver.cpp src/limiter.cpp src/chain.cpp src/tuning.cpp)
target_include_directories(forte_core PUBLIC include)
target_link_libraries(forte_core PUBLIC forte_eigen)
target_compile_features(forte_core PUBLIC cxx_std_20)
# No fused multiply-adds in the plugins: the WebAssembly has none and rounds every product, and on
# Apple silicon clang would fuse them (x86-64 without -mfma has none), so the plugins give the
# WebAssembly's numbers to the last bit on every machine.
if (NOT MSVC AND NOT EMSCRIPTEN)
  target_compile_options(forte_core PUBLIC -ffp-contract=off)
endif()
if (NOT EMSCRIPTEN)
  find_package(Threads REQUIRED)
  target_link_libraries(forte_core PUBLIC Threads::Threads)
endif()
