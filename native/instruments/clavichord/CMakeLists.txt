# Clavichord: its engine and model in C++, its plugins and its WebAssembly.
include(clavichord-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_clavichord STATIC clavichord-model.cpp clavichord-engine.cpp clavichord-instrument.cpp)
target_include_directories(forte_clavichord PUBLIC .)
target_link_libraries(forte_clavichord PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(clavichord NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_clavichord)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(clavichord INSTRUMENT forte_clavichord SOURCES clavichord-web.cpp OUT ${FORTE_ROOT}/clavichord/wasm/clavichord.wasm)
endif()
