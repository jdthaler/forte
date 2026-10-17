# The Viola Organista (bowed/): its engine and model in C++, its plugins and its WebAssembly.
include(bowed-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_bowed STATIC fdlibm.cpp bowed-model.cpp bowed-string.cpp bowed-engine.cpp bowed-instrument.cpp)
target_include_directories(forte_bowed PUBLIC .)
target_link_libraries(forte_bowed PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(bowed NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_bowed)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(bowed INSTRUMENT forte_bowed SOURCES bowed-web.cpp OUT ${FORTE_ROOT}/bowed/wasm/bowed.wasm)
endif()
