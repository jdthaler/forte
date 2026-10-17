# The Pyrophone (pyrophone/): its engine and model in C++, its plugins and its WebAssembly.
include(pyrophone-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_pyrophone STATIC pyrophone-model.cpp pyrophone-engine.cpp pyrophone-instrument.cpp)
target_include_directories(forte_pyrophone PUBLIC .)
target_link_libraries(forte_pyrophone PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(pyrophone NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_pyrophone)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(pyrophone INSTRUMENT forte_pyrophone SOURCES pyrophone-web.cpp OUT ${FORTE_ROOT}/pyrophone/wasm/pyrophone.wasm)
endif()
