# Project 8: its engine and model in C++, its plugins and its WebAssembly.
include(project8-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_project8 STATIC project8-model.cpp project8-engine.cpp project8-instrument.cpp)
target_include_directories(forte_project8 PUBLIC .)
target_link_libraries(forte_project8 PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(project8 NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_project8)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(project8 INSTRUMENT forte_project8 SOURCES project8-web.cpp OUT ${FORTE_ROOT}/project8/wasm/project8.wasm)
endif()
