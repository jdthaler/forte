# The Harpsichord (harpsichord/): its engine and model in C++, its plugins and its WebAssembly.
include(harpsichord-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_harpsichord STATIC plectrum.cpp plucked-string.cpp harpsichord-model.cpp harpsichord-engine.cpp harpsichord-instrument.cpp)
target_include_directories(forte_harpsichord PUBLIC .)
target_link_libraries(forte_harpsichord PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(harpsichord NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_harpsichord)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(harpsichord INSTRUMENT forte_harpsichord SOURCES harpsichord-web.cpp OUT ${FORTE_ROOT}/harpsichord/wasm/harpsichord.wasm)
endif()
