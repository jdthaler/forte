# The Pipe Organ (pipes/): its engine and model in C++, its plugins and its WebAssembly.
include(pipes-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

# the flue pipes' physics and their real-time jets, which the Hydraulis plays too
add_library(forte_pipes_flue STATIC pipes-model.cpp pipes-flue.cpp)
target_include_directories(forte_pipes_flue PUBLIC .)
target_link_libraries(forte_pipes_flue PUBLIC forte_core)

add_library(forte_pipes STATIC pipes-engine.cpp pipes-instrument.cpp)
target_include_directories(forte_pipes PUBLIC .)
target_link_libraries(forte_pipes PUBLIC forte_pipes_flue)

if (FORTE_PLUGINS)
  forte_add_plugin(pipes NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_pipes)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(pipes INSTRUMENT forte_pipes SOURCES pipes-web.cpp OUT ${FORTE_ROOT}/pipes/wasm/pipes.wasm)
endif()
