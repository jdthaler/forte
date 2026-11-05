# Cimbalom: its engine and model in C++, its plugins and its WebAssembly.
include(cimbalom-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_cimbalom STATIC cimbalom-model.cpp cimbalom-engine.cpp cimbalom-instrument.cpp)
target_include_directories(forte_cimbalom PUBLIC .)
target_link_libraries(forte_cimbalom PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(cimbalom NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_cimbalom)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(cimbalom INSTRUMENT forte_cimbalom SOURCES cimbalom-web.cpp OUT ${FORTE_ROOT}/cimbalom/wasm/cimbalom.wasm)
endif()
