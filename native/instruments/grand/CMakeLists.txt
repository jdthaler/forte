# The Electric Grand (grand/): its engine and model in C++, its plugins and its WebAssembly.
include(grand-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_grand STATIC grand-model.cpp grand-engine.cpp grand-instrument.cpp)
target_include_directories(forte_grand PUBLIC .)
target_link_libraries(forte_grand PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(grand NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_grand)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(grand INSTRUMENT forte_grand SOURCES grand-web.cpp OUT ${FORTE_ROOT}/grand/wasm/grand.wasm)
endif()
