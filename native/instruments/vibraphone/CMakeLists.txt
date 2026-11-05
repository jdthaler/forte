# The Vibraphone (vibraphone/): its engine and model in C++, its plugins and its WebAssembly.
include(vibraphone-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

# The bars' finite elements (bar.h), a library of their own: the Marimba and Xylophone solves its
# wooden bars with them too.
add_library(forte_bars STATIC bar.cpp)
target_include_directories(forte_bars PUBLIC .)
target_link_libraries(forte_bars PUBLIC forte_core)

add_library(forte_vibraphone STATIC vibraphone-model.cpp vibraphone-engine.cpp vibraphone-instrument.cpp)
target_include_directories(forte_vibraphone PUBLIC .)
target_link_libraries(forte_vibraphone PUBLIC forte_core forte_bars)

if (FORTE_PLUGINS)
  forte_add_plugin(vibraphone NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_vibraphone)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(vibraphone INSTRUMENT forte_vibraphone SOURCES vibraphone-web.cpp OUT ${FORTE_ROOT}/vibraphone/wasm/vibraphone.wasm)
endif()
