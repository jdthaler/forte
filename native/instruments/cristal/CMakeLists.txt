# Cristal Baschet: its engine and model in C++, its plugins and its WebAssembly.
include(cristal-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_cristal STATIC cristal-model.cpp cristal-engine.cpp cristal-instrument.cpp)
target_include_directories(forte_cristal PUBLIC .)
target_link_libraries(forte_cristal PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(cristal NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_cristal)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(cristal INSTRUMENT forte_cristal SOURCES cristal-web.cpp OUT ${FORTE_ROOT}/cristal/wasm/cristal.wasm)
endif()
