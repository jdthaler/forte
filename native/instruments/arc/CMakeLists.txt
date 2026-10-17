# The Singing Arc (arc/): its engine and model in C++, its plugins and its WebAssembly.
include(arc-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_arc STATIC arc-model.cpp arc-voice.cpp arc-engine.cpp arc-instrument.cpp)
target_include_directories(forte_arc PUBLIC .)
target_link_libraries(forte_arc PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(arc NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_arc)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(arc INSTRUMENT forte_arc SOURCES arc-web.cpp OUT ${FORTE_ROOT}/arc/wasm/arc.wasm)
endif()
