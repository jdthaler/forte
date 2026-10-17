# The Reed Piano (reeds/): its engine and model in C++, its plugins and its WebAssembly.
include(reeds-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_reeds STATIC reeds-model.cpp reeds-engine.cpp reeds-instrument.cpp)
target_include_directories(forte_reeds PUBLIC .)
target_link_libraries(forte_reeds PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(reeds NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_reeds)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(reeds INSTRUMENT forte_reeds SOURCES reeds-web.cpp OUT ${FORTE_ROOT}/reeds/wasm/reeds.wasm)
endif()
