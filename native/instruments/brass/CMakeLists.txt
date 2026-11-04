# Brass: its engine and model in C++, its plugins and its WebAssembly.
include(brass-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_brass STATIC brass-model.cpp brass-engine.cpp brass-instrument.cpp)
target_include_directories(forte_brass PUBLIC .)
target_link_libraries(forte_brass PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(brass NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_brass)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(brass INSTRUMENT forte_brass SOURCES brass-web.cpp OUT ${FORTE_ROOT}/brass/wasm/brass.wasm)
endif()
