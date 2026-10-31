# The Hurdy-Gurdy (hurdygurdy/): its engine and model in C++, its plugins and its WebAssembly. Its
# strings are bowed with the Viola Organista's friction (native/instruments/bowed, bowed-model.h).
include(hurdygurdy-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_hurdygurdy STATIC hurdygurdy-model.cpp hurdygurdy-string.cpp hurdygurdy-engine.cpp hurdygurdy-instrument.cpp)
target_include_directories(forte_hurdygurdy PUBLIC .)
target_link_libraries(forte_hurdygurdy PUBLIC forte_bowed) # (only bowed-model.o is linked from it)

if (FORTE_PLUGINS)
  forte_add_plugin(hurdygurdy NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_hurdygurdy)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(hurdygurdy INSTRUMENT forte_hurdygurdy SOURCES hurdygurdy-web.cpp OUT ${FORTE_ROOT}/hurdygurdy/wasm/hurdygurdy.wasm)
endif()
