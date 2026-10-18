# forte.cmake — building an instrument.

set(FORTE_PLUGIN_DIR ${CMAKE_CURRENT_LIST_DIR}/../plugin)
set(FORTE_WEB_DIR ${CMAKE_CURRENT_LIST_DIR}/../web)

# forte_add_plugin(<slug> NAME <name> VERSION <x.y.z> AU_SUBTYPE <code> INSTRUMENT <library> [ACCENT <#rrggbb>])
#
# <library> holds the instrument's engine and its InstrumentInfo (it defines
# forte_instrument()). ACCENT, the window's colour, defaults to FORTE_ACCENT (<slug>-info.cmake). Makes forte_<slug>_clap, _vst3, _auv2 (macOS) and _standalone into
# ${CMAKE_BINARY_DIR}/plugins, and forte_<slug>_all to build them all. Plugin ids:
# net.jthaler.forte.<slug> (CLAP, bundles), AU manufacturer Frte (docs/PLUGINS.md).
function(forte_add_plugin slug)
  cmake_parse_arguments(A "" "NAME;VERSION;AU_SUBTYPE;INSTRUMENT;ACCENT" "" ${ARGN})
  if (NOT A_ACCENT)
    set(A_ACCENT "${FORTE_ACCENT}")
  endif()
  # the version in the instrument's InstrumentInfo (<slug>-params.h); the WebAssembly is built
  # without it, so bumping a version changes only <slug>-info.cmake and the plugins
  target_compile_definitions(${A_INSTRUMENT} PRIVATE "FORTE_INSTRUMENT_VERSION=\"${A_VERSION}\"")
  set(impl forte_${slug}_impl)
  add_library(${impl} STATIC ${FORTE_PLUGIN_DIR}/entry-impl.cpp)
  target_link_libraries(${impl} PUBLIC forte_plugin ${A_INSTRUMENT})
  string(REPLACE "#" "" rgb "${A_ACCENT}") # (a # can't go through a compiler's command line)
  target_compile_definitions(${impl} PRIVATE "FORTE_ACCENT_RGB=\"${rgb}\"")
  make_clapfirst_plugins(
    TARGET_NAME forte_${slug}
    IMPL_TARGET ${impl}
    OUTPUT_NAME "${A_NAME}"
    ENTRY_SOURCE ${FORTE_PLUGIN_DIR}/entry.cpp
    BUNDLE_IDENTIFIER "net.jthaler.forte.${slug}"
    BUNDLE_VERSION "${A_VERSION}"
    COPY_AFTER_BUILD FALSE
    WINDOWS_FOLDER_VST3 TRUE
    PLUGIN_FORMATS CLAP VST3 AUV2
    ASSET_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/plugins
    AUV2_MANUFACTURER_NAME "Forte"
    AUV2_MANUFACTURER_CODE "Frte"
    AUV2_SUBTYPE_CODE "${A_AU_SUBTYPE}"
    AUV2_INSTRUMENT_TYPE "aumu"
    STANDALONE_CONFIGURATIONS standalone "${A_NAME}" "net.jthaler.forte.${slug}"
  )
endfunction()

# forte_add_wasm(<slug> INSTRUMENT <library> OUT <path.wasm> [SOURCES <model bindings…>])
#
# The instrument's WebAssembly for the website: the engine contract (web/engine-api.cpp) and the
# model functions its views call (SOURCES), as a standalone .wasm with no JavaScript glue
# (shared/wasm.js loads it), copied to OUT, next to the page. It is committed; CI rebuilds it
# with the pinned Emscripten and fails if the committed file differs.
function(forte_add_wasm slug)
  cmake_parse_arguments(A "" "INSTRUMENT;OUT" "SOURCES" ${ARGN})
  set(t forte_${slug}_wasm)
  add_executable(${t} ${FORTE_WEB_DIR}/engine-api.cpp ${A_SOURCES})
  target_link_libraries(${t} PRIVATE ${A_INSTRUMENT})
  set_target_properties(${t} PROPERTIES OUTPUT_NAME ${slug} SUFFIX ".wasm")
  target_compile_options(${t} PRIVATE -fno-exceptions)
  target_link_options(${t} PRIVATE --no-entry -sSTANDALONE_WASM -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=4mb
    -sSTACK_SIZE=256kb -fno-exceptions -sFILESYSTEM=0 -sEXPORTED_FUNCTIONS=_malloc,_free)
  get_filename_component(dir ${A_OUT} DIRECTORY)
  add_custom_command(TARGET ${t} POST_BUILD COMMAND ${CMAKE_COMMAND} -E make_directory ${dir}
                     COMMAND ${CMAKE_COMMAND} -E copy $<TARGET_FILE:${t}> ${A_OUT} VERBATIM)
endfunction()
