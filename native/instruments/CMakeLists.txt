# One subdirectory per ported instrument (docs/PLUGINS.md, step 3 on): its engine and model in
# C++, its generated parameter tables, and forte_add_plugin().
file(GLOB forte_instruments LIST_DIRECTORIES true RELATIVE ${CMAKE_CURRENT_SOURCE_DIR} ${CMAKE_CURRENT_SOURCE_DIR}/*)
foreach(dir ${forte_instruments})
  if (IS_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/${dir} AND EXISTS ${CMAKE_CURRENT_SOURCE_DIR}/${dir}/CMakeLists.txt)
    add_subdirectory(${dir})
  endif()
endforeach()
