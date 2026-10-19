# RF Cavity Bells: its engine and model in C++, its plugins and its WebAssembly.
include(cavity-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_cavity STATIC cavity-model.cpp cavity-engine.cpp cavity-instrument.cpp)
target_include_directories(forte_cavity PUBLIC .)
target_link_libraries(forte_cavity PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(cavity NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_cavity)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(cavity INSTRUMENT forte_cavity SOURCES cavity-web.cpp OUT ${FORTE_ROOT}/cavity/wasm/cavity.wasm)
endif()
