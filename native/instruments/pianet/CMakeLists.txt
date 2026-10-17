# The Sticky-Pad Piano (pianet/): its engine and model in C++, its plugins and its WebAssembly.
include(pianet-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

# with V8's fdlibm (../bowed/fdlibm.*), so the reeds and the bond's peel give the JavaScript's numbers
add_library(forte_pianet STATIC ../bowed/fdlibm.cpp pianet-model.cpp pianet-engine.cpp pianet-instrument.cpp)
target_include_directories(forte_pianet PUBLIC . ../bowed)
target_link_libraries(forte_pianet PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(pianet NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_pianet)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(pianet INSTRUMENT forte_pianet SOURCES pianet-web.cpp OUT ${FORTE_ROOT}/pianet/wasm/pianet.wasm)
endif()
