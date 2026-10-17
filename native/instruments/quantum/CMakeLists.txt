# The Quantum Keyboard (quantum/): its engine and model in C++, its plugins and its WebAssembly.
include(quantum-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_quantum STATIC quantum-model.cpp quantum-engine.cpp quantum-instrument.cpp)
target_include_directories(forte_quantum PUBLIC .)
target_link_libraries(forte_quantum PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(quantum NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_quantum)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(quantum INSTRUMENT forte_quantum SOURCES quantum-web.cpp OUT ${FORTE_ROOT}/quantum/wasm/quantum.wasm)
endif()
