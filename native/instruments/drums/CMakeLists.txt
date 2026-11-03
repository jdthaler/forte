# Timpani and Tabla: its engine and model in C++, its plugins and its WebAssembly.
include(drums-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_drums STATIC drums-model.cpp drums-engine.cpp drums-instrument.cpp)
target_include_directories(forte_drums PUBLIC .)
target_link_libraries(forte_drums PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(drums NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_drums)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(drums INSTRUMENT forte_drums SOURCES drums-web.cpp OUT ${FORTE_ROOT}/drums/wasm/drums.wasm)
endif()
