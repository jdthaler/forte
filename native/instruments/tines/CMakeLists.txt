# The Tine Piano (tines/): its engine and model in C++, its plugins and its WebAssembly.
include(tines-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_tines STATIC tines-model.cpp tines-engine.cpp tines-instrument.cpp)
target_include_directories(forte_tines PUBLIC .)
target_link_libraries(forte_tines PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(tines NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_tines)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(tines INSTRUMENT forte_tines SOURCES tines-web.cpp OUT ${FORTE_ROOT}/tines/wasm/tines.wasm)
endif()
