# dependencies.cmake — every dependency, pinned to a commit (docs/PLUGINS.md: "Dependencies
# pinned"). FetchContent downloads them into the build tree at configure time; set
# FETCHCONTENT_SOURCE_DIR_<NAME> to use a local copy. SOURCE_SUBDIR points nowhere, so
# fetching only downloads: the projects that need them add them themselves.

include(FetchContent)
set(FETCHCONTENT_QUIET ON)

function(forte_fetch name repo commit)
  FetchContent_Declare(${name} GIT_REPOSITORY ${repo} GIT_TAG ${commit} SOURCE_SUBDIR fetch-only ${ARGN})
  FetchContent_MakeAvailable(${name})
  set(${name}_SOURCE_DIR ${${name}_SOURCE_DIR} PARENT_SCOPE)
endfunction()

# Eigen 3.4.1 (MPL 2): linear algebra for the models (shared/linalg.js)
forte_fetch(eigen https://gitlab.com/libeigen/eigen.git d71c30c47858effcbd39967097a2d99ee48db464)
add_library(forte_eigen INTERFACE)
target_include_directories(forte_eigen SYSTEM INTERFACE ${eigen_SOURCE_DIR})
target_compile_definitions(forte_eigen INTERFACE EIGEN_MPL2_ONLY EIGEN_NO_DEBUG)

if (FORTE_PLUGINS)
  # The plugin formats. CLAP 1.2.10 (MIT) is the plugin; clap-wrapper 0.16.0 (MIT) makes the
  # VST3, AU v2 and standalone from it, with the SDKs below (versions as clap-wrapper tests them).
  forte_fetch(clap https://github.com/free-audio/clap 195b42a004144fab0b3cf95e9c067187d15365b7)               # 1.2.10
  # Our changes to clap-wrapper, kept here (cmake/patches/): the macOS standalone's Audio/MIDI
  # Settings pick its MIDI inputs, and its Info.plist names its icon. They touch only macOS's
  # code, so Windows (whose checkout may have other line endings) leaves them out.
  set(clapwrapper_patches "")
  if (NOT WIN32)
    set(clapwrapper_patches PATCH_COMMAND)
    foreach(patch clap-wrapper-mac-midi-inputs clap-wrapper-mac-app-icon)
      if (clapwrapper_patches STREQUAL "PATCH_COMMAND")
        list(APPEND clapwrapper_patches ${CMAKE_COMMAND})
      else()
        list(APPEND clapwrapper_patches COMMAND ${CMAKE_COMMAND})
      endif()
      list(APPEND clapwrapper_patches -DPATCH=${CMAKE_CURRENT_LIST_DIR}/patches/${patch}.patch -P ${CMAKE_CURRENT_LIST_DIR}/apply-patch.cmake)
    endforeach()
  endif()
  forte_fetch(clapwrapper https://github.com/free-audio/clap-wrapper 1cca996e96f29ab2be7ae9f8cfe532bbc92e1dd6 # 0.16.0
    ${clapwrapper_patches})
  forte_fetch(vst3sdk https://github.com/steinbergmedia/vst3sdk 9fad9770f2ae8542ab1a548a68c1ad1ac690abe0       # 3.8.0 build 66 (MIT)
    GIT_SUBMODULES base public.sdk pluginterfaces cmake)
  forte_fetch(rtaudio https://github.com/thestk/rtaudio b4f04903312e0e0efffbe77655172e0f060dc085)             # 6.0.1, standalone audio
  forte_fetch(rtmidi https://github.com/thestk/rtmidi 1e5b49925aa60065db52de44c366d446a902547b)               # 6.0.0, standalone MIDI
  forte_fetch(choc https://github.com/Tracktion/choc 1c3ab9ed0b59a145ad6a2f38e35b601117a657b4)                # 2026-10-08 (ISC), the editor's web view
  set(CLAP_SDK_ROOT ${clap_SOURCE_DIR} CACHE PATH "" FORCE)
  set(VST3_SDK_ROOT ${vst3sdk_SOURCE_DIR} CACHE PATH "" FORCE)
  set(RTAUDIO_SDK_ROOT ${rtaudio_SOURCE_DIR} CACHE PATH "" FORCE)
  set(RTMIDI_SDK_ROOT ${rtmidi_SOURCE_DIR} CACHE PATH "" FORCE)
  if (APPLE)
    forte_fetch(audiounitsdk https://github.com/apple/AudioUnitSDK 53a9a2008aae7fb1b0a9f093dd523b9b12f6c0d9)  # 1.1.0 (Apache 2)
    set(AUDIOUNIT_SDK_ROOT ${audiounitsdk_SOURCE_DIR} CACHE PATH "" FORCE)
  endif()
  if (WIN32)
    forte_fetch(wil https://github.com/microsoft/wil f0c6a81c0c9a4b23b6801f40554b8bec425a83b4)                # 1.0.240803.1 (MIT), standalone
    set(WIL_SDK_ROOT ${wil_SOURCE_DIR} CACHE PATH "" FORCE)
  endif()

  set(CLAP_WRAPPER_DOWNLOAD_DEPENDENCIES OFF CACHE BOOL "" FORCE)
  set(CLAP_WRAPPER_BUILD_AUV2 ${APPLE} CACHE BOOL "" FORCE)
  set(CLAP_WRAPPER_BUILD_STANDALONE ON CACHE BOOL "" FORCE)
  add_subdirectory(${clapwrapper_SOURCE_DIR} ${CMAKE_BINARY_DIR}/clap-wrapper EXCLUDE_FROM_ALL)
endif()
