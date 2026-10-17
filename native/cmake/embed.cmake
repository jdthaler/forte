# embed.cmake — cmake -DIN=<file> -DOUT=<header> -DNAME=<symbol> -P embed.cmake writes the file
# as a byte array (kName, kNameSize) for the plugins to carry (the editor's page).
file(READ ${IN} hex HEX)
string(LENGTH "${hex}" n)
math(EXPR size "${n} / 2")
string(REGEX REPLACE "([0-9a-f][0-9a-f])" "0x\\1," bytes "${hex}")
string(REGEX REPLACE "(0x..,0x..,0x..,0x..,0x..,0x..,0x..,0x..,0x..,0x..,0x..,0x..,0x..,0x..,0x..,0x..,)" "\\1\n" bytes "${bytes}")
get_filename_component(src ${IN} NAME)
file(WRITE ${OUT} "// generated from ${src} by cmake/embed.cmake. Do not edit.\n#pragma once\n#include <cstddef>\n"
  "inline const unsigned char ${NAME}[] = {\n${bytes}0x00};\ninline const size_t ${NAME}Size = ${size};\n")
