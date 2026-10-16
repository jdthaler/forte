# forte_core: the engine contract and what every instrument shares (docs/PLUGINS.md, step 2):
# DSP, impulse responses, linear algebra, the output chain, and the real-time plumbing.
add_library(forte_core STATIC
  src/params.cpp src/impulses.cpp src/linalg.cpp src/fft.cpp src/convolver.cpp src/limiter.cpp src/chain.cpp)
target_include_directories(forte_core PUBLIC include)
target_link_libraries(forte_core PUBLIC forte_eigen)
target_compile_features(forte_core PUBLIC cxx_std_20)
if (NOT EMSCRIPTEN)
  find_package(Threads REQUIRED)
  target_link_libraries(forte_core PUBLIC Threads::Threads)
endif()
