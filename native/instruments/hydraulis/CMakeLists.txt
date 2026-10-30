# The Hydraulis (hydraulis/): its engine and model in C++, its plugins and its WebAssembly. Its
# pipes are the Pipe Organ's (native/instruments/pipes), on their own bores and wind.
include(hydraulis-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_hydraulis STATIC hydraulis-model.cpp hydraulis-engine.cpp hydraulis-instrument.cpp)
target_include_directories(forte_hydraulis PUBLIC .)
target_link_libraries(forte_hydraulis PUBLIC forte_pipes_flue) # the Pipe Organ's flue pipes (pipes-flue.h)

if (FORTE_PLUGINS)
  forte_add_plugin(hydraulis NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_hydraulis)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(hydraulis INSTRUMENT forte_hydraulis SOURCES hydraulis-web.cpp OUT ${FORTE_ROOT}/hydraulis/wasm/hydraulis.wasm)
endif()
