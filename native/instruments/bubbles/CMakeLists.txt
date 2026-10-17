# The Bubble Organ (bubbles/): its engine and model in C++, its plugins and its WebAssembly.
include(bubbles-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_bubbles STATIC bubbles-model.cpp bubbles-engine.cpp bubbles-instrument.cpp)
target_include_directories(forte_bubbles PUBLIC .)
target_link_libraries(forte_bubbles PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(bubbles NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_bubbles)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(bubbles INSTRUMENT forte_bubbles SOURCES bubbles-web.cpp OUT ${FORTE_ROOT}/bubbles/wasm/bubbles.wasm)
endif()
