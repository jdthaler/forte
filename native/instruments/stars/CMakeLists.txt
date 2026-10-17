# The Star Keyboard (stars/): its engine and model in C++, its plugins and its WebAssembly.
include(stars-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_stars STATIC stars-model.cpp stars-engine.cpp stars-instrument.cpp)
target_include_directories(forte_stars PUBLIC .)
target_link_libraries(forte_stars PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(stars NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_stars)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(stars INSTRUMENT forte_stars SOURCES stars-web.cpp OUT ${FORTE_ROOT}/stars/wasm/stars.wasm)
endif()
