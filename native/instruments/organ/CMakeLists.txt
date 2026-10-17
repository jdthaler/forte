# The Tonewheel Organ (organ/): its engine and model in C++, its plugins and its WebAssembly.
include(organ-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

# with V8's fdlibm (forte/fdlibm.h, tanh and hypot too), so it plays the JavaScript's samples
add_library(forte_organ STATIC organ-model.cpp organ-engine.cpp organ-instrument.cpp)
target_include_directories(forte_organ PUBLIC .)
target_link_libraries(forte_organ PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(organ NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_organ)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(organ INSTRUMENT forte_organ SOURCES organ-web.cpp OUT ${FORTE_ROOT}/organ/wasm/organ.wasm)
endif()
