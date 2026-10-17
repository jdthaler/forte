# The Glass Armonica (glass/): its engine and model in C++, its plugins and its WebAssembly.
include(glass-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_glass STATIC glass-model.cpp glass-engine.cpp glass-instrument.cpp)
target_include_directories(forte_glass PUBLIC .)
target_link_libraries(forte_glass PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(glass NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_glass)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(glass INSTRUMENT forte_glass SOURCES glass-web.cpp OUT ${FORTE_ROOT}/glass/wasm/glass.wasm)
endif()
