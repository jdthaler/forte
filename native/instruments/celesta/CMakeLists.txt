# Celesta: its engine and model in C++, its plugins and its WebAssembly.
include(celesta-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_celesta STATIC celesta-model.cpp celesta-engine.cpp celesta-instrument.cpp)
target_include_directories(forte_celesta PUBLIC .)
target_link_libraries(forte_celesta PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(celesta NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_celesta)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(celesta INSTRUMENT forte_celesta SOURCES celesta-web.cpp OUT ${FORTE_ROOT}/celesta/wasm/celesta.wasm)
endif()
