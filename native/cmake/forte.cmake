# forte.cmake — building an instrument.

set(FORTE_PLUGIN_DIR ${CMAKE_CURRENT_LIST_DIR}/../plugin)

# forte_add_plugin(<slug> NAME <name> VERSION <x.y.z> AU_SUBTYPE <code> INSTRUMENT <library>)
#
# <library> holds the instrument's engine and its InstrumentInfo (it defines
# forte_instrument()). Makes forte_<slug>_clap, _vst3, _auv2 (macOS) and _standalone into
# ${CMAKE_BINARY_DIR}/plugins, and forte_<slug>_all to build them all. Plugin ids:
# net.jthaler.forte.<slug> (CLAP, bundles), AU manufacturer Frte (docs/PLUGINS.md).
function(forte_add_plugin slug)
  cmake_parse_arguments(A "" "NAME;VERSION;AU_SUBTYPE;INSTRUMENT" "" ${ARGN})
  set(impl forte_${slug}_impl)
  add_library(${impl} STATIC ${FORTE_PLUGIN_DIR}/entry-impl.cpp)
  target_link_libraries(${impl} PUBLIC forte_plugin ${A_INSTRUMENT})
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
