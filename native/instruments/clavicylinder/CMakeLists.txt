# Clavicylinder: its engine and model in C++, its plugins and its WebAssembly.
include(clavicylinder-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_clavicylinder STATIC clavicylinder-model.cpp clavicylinder-engine.cpp clavicylinder-instrument.cpp)
target_include_directories(forte_clavicylinder PUBLIC .)
target_link_libraries(forte_clavicylinder PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(clavicylinder NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_clavicylinder)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(clavicylinder INSTRUMENT forte_clavicylinder SOURCES clavicylinder-web.cpp OUT ${FORTE_ROOT}/clavicylinder/wasm/clavicylinder.wasm)
endif()
