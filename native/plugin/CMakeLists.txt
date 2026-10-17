# forte_plugin: the CLAP plugin every instrument shares; forte_add_plugin() (cmake/forte.cmake)
# makes each instrument's CLAP, VST3, AU v2 and standalone from it.
add_library(forte_plugin STATIC plugin.cpp)
target_include_directories(forte_plugin PUBLIC .)
target_link_libraries(forte_plugin PUBLIC forte_core clap clap-wrapper-extensions)
target_include_directories(forte_plugin SYSTEM PRIVATE ${choc_SOURCE_DIR})

# The editor: editor.html in a web view (editor.h). Off, the plugins have no window and the
# DAW shows its generic panel.
option(FORTE_EDITOR "Give the plugins their window (a web view)" ON)
if (FORTE_EDITOR)
  set(html ${CMAKE_CURRENT_BINARY_DIR}/generated/editor-html.h)
  add_custom_command(OUTPUT ${html}
    COMMAND ${CMAKE_COMMAND} -DIN=${CMAKE_CURRENT_SOURCE_DIR}/editor.html -DOUT=${html} -DNAME=kEditorHtml
            -P ${CMAKE_CURRENT_SOURCE_DIR}/../cmake/embed.cmake
    DEPENDS editor.html ../cmake/embed.cmake VERBATIM)
  add_library(forte_editor STATIC editor.cpp ${html})
  target_include_directories(forte_editor PRIVATE ${CMAKE_CURRENT_BINARY_DIR}/generated)
  target_include_directories(forte_editor SYSTEM PUBLIC ${choc_SOURCE_DIR})
  target_link_libraries(forte_editor PUBLIC clap)
  if (APPLE)
    target_link_libraries(forte_editor PUBLIC "-framework WebKit" "-framework Cocoa")
  elseif (WIN32)
    target_compile_options(forte_editor PRIVATE /bigobj)
  else()
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(gtk3 REQUIRED IMPORTED_TARGET gtk+-3.0)
    pkg_check_modules(webkit2 REQUIRED IMPORTED_TARGET webkit2gtk-4.1)
    find_package(X11 REQUIRED)
    target_link_libraries(forte_editor PUBLIC PkgConfig::gtk3 PkgConfig::webkit2 X11::X11)
  endif()
  target_link_libraries(forte_plugin PUBLIC forte_editor)
  target_compile_definitions(forte_plugin PRIVATE FORTE_EDITOR=1)
endif()
