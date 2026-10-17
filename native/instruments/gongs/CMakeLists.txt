# The Gong Keyboard (gongs/): its engine and model in C++, its plugins and its WebAssembly.
include(gongs-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_gongs STATIC gongs-model.cpp gongs-engine.cpp gongs-instrument.cpp)
target_include_directories(forte_gongs PUBLIC .)
target_link_libraries(forte_gongs PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(gongs NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_gongs)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(gongs INSTRUMENT forte_gongs SOURCES gongs-web.cpp OUT ${FORTE_ROOT}/gongs/wasm/gongs.wasm)
endif()
