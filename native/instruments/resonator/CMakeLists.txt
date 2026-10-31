# Magnetic Resonator Piano: its engine and model in C++, its plugins and its WebAssembly.
include(resonator-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_resonator STATIC resonator-model.cpp resonator-engine.cpp resonator-instrument.cpp)
target_include_directories(forte_resonator PUBLIC .)
target_link_libraries(forte_resonator PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(resonator NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_resonator)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(resonator INSTRUMENT forte_resonator SOURCES resonator-web.cpp OUT ${FORTE_ROOT}/resonator/wasm/resonator.wasm)
endif()
