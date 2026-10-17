#!/usr/bin/env bash
# package-plugins.sh — the archives a plugin release ships (docs/PLUGINS.md, step 5), from the
# plugins one system built: Forte-plugins-<system> with every instrument that has plugins
# (`plugin.ready` in shared/registry.js), and Forte-<id>-<system> with each one alone, each with
# native/INSTALL.md, and on macOS and Linux native/install.sh with its Makefile (make install,
# make verify). The template's plugins are left out. The archives keep the bundles'
# executable bits and macOS's signatures. Run from the repository's root after building:
#
#   tools/package-plugins.sh <linux|macos|windows>     writes dist/
set -euo pipefail
preset=$1
plugins=native/build/$preset/plugins
root=native/build/pkg
rm -rf "$root" dist
mkdir -p "$root" dist

# Every bundle wherever the generator put it (Visual Studio nests them in CLAP/Release/, VST3/
# and Standalone-*/Release/), and Linux's standalone, which has no extension.
bundles() {
  find "$plugins" \( -name '*.clap' -o -name '*.vst3' -o -name '*.component' -o -name '*.app' -o -name '*.exe' \) -prune -print
  [ "$preset" != linux ] || find "$plugins" -mindepth 1 -maxdepth 1 -type f ! -name '*.*' -perm -u+x
}

# pack <archive name without extension> <folder name inside it> <instrument name>…
pack() {
  local out=$1 folder=$2; shift 2
  local dir="$root/$out/$folder"
  mkdir -p "$dir"
  for name in "$@"; do
    local n=0
    while IFS= read -r p; do
      b=$(basename "$p")
      if [ "$b" = "$name" ] || [ "${b%.*}" = "$name" ]; then cp -R "$p" "$dir"/; n=$((n + 1)); fi
    done < <(bundles)
    [ "$n" -gt 0 ] || { echo "no plugins built for $name in $plugins" >&2; exit 1; }
  done
  cp native/INSTALL.md "$dir"/
  [ "$preset" = windows ] || { cp native/install.mk "$dir/Makefile"; cp native/install.sh "$dir/"; }
  case "$preset" in
    macos) ditto -c -k --sequesterRsrc --keepParent "$dir" "dist/$out-macos.zip" ;;
    windows) (cd "$root/$out" && 7z a -tzip -bso0 "../../../../dist/$out-windows.zip" "$folder") ;;
    linux) tar -czf "dist/$out-linux.tar.gz" -C "$root/$out" "$folder" ;;
  esac
}

names=()
while IFS=$'\t' read -r id name; do
  name=${name%$'\r'}
  names+=("$name")
  pack "Forte-$id" "$name" "$name"
done < <(node tools/plugin-release.mjs --plugins)
[ "${#names[@]}" -gt 0 ] || { echo "tools/plugin-release.mjs --plugins listed no instruments" >&2; exit 1; }
pack Forte-plugins "Forte plugins" "${names[@]}"
ls -l dist
