#!/usr/bin/env bash
# install.sh — installs and checks the Forte plugins in its folder, on macOS and Linux. It ships
# in each download next to the plugins and a Makefile that runs it (native/install.mk), and works
# on whichever plugins are in its folder: one instrument's or every instrument's.
#
#   bash install.sh install | verify | uninstall      (or make install, make verify…)
#
# The folders can be changed through VST3_DIR, CLAP_DIR, AU_DIR and APP_DIR.
# native/install.sh in https://github.com/jdthaler/forte.
set -euo pipefail
cd "$(dirname "$0")"
OS=$(uname -s)
case "$OS" in
  Darwin)
    PLUGINS="$HOME/Library/Audio/Plug-Ins"
    AU_DIR=${AU_DIR:-$PLUGINS/Components}
    VST3_DIR=${VST3_DIR:-$PLUGINS/VST3}
    CLAP_DIR=${CLAP_DIR:-$PLUGINS/CLAP}
    APP_DIR=${APP_DIR:-$HOME/Applications} ;;
  Linux)
    VST3_DIR=${VST3_DIR:-$HOME/.vst3}
    CLAP_DIR=${CLAP_DIR:-$HOME/.clap}
    APP_DIR=${APP_DIR:-$HOME/.local/bin} ;;
  *) echo "This is for macOS and Linux; on Windows, follow INSTALL.md." >&2; exit 1 ;;
esac

# Every plugin in this folder, one per line, as "<kind> <name>": au, vst3, clap or app. Names
# have spaces in them, so the commands read this list line by line.
each() {
  local p
  for p in *.component; do [ -e "$p" ] && echo "au $p"; done
  for p in *.vst3; do [ -e "$p" ] && echo "vst3 $p"; done
  for p in *.clap; do [ -e "$p" ] && echo "clap $p"; done
  for p in *.app; do [ -e "$p" ] && echo "app $p"; done
  for p in *; do [ -f "$p" ] && [ -x "$p" ] && [[ "$p" != *.* ]] && echo "app $p"; done
  true
}

# dir <kind>: the folder that kind goes in
dir() { case "$1" in au) echo "$AU_DIR" ;; vst3) echo "$VST3_DIR" ;; clap) echo "$CLAP_DIR" ;; app) echo "$APP_DIR" ;; esac; }

list=$(each)
[ -n "$list" ] || { echo "No plugins next to install.sh." >&2; exit 1; }

install() {
  local kind name d
  while read -r kind name; do
    d=$(dir "$kind"); mkdir -p "$d"
    rm -rf "${d:?}/$name"
    cp -R "$name" "$d/"
    if [ "$OS" = Darwin ]; then xattr -dr com.apple.quarantine "$d/$name" 2>/dev/null || true; fi
    echo "installed $d/$name"
  done <<< "$list"
  if [ "$OS" = Darwin ] && grep -q '^au ' <<< "$list"; then killall -9 AudioComponentRegistrar 2>/dev/null || true; fi
  echo "Now check them: make verify"
}

verify() {
  local kind name p bad=0 plist t s m missing
  fail() { echo "FAIL  $*"; bad=$((bad + 1)); }
  while read -r kind name; do
    p="$(dir "$kind")/$name"
    if [ ! -e "$p" ]; then fail "$p is not installed (make install)"; continue; fi
    if ! diff -rq "$name" "$p" >/dev/null 2>&1; then fail "$p differs from this download (make install)"; continue; fi
    if [ "$OS" = Darwin ]; then
      if xattr -r "$p" 2>/dev/null | grep -q com.apple.quarantine; then fail "$p is still quarantined (make install)"; continue; fi
      if ! codesign --verify --deep "$p" 2>/dev/null; then fail "$p: its signature does not check out (codesign --verify --deep)"; continue; fi
    fi
    if [ "$kind" = au ]; then
      plist="$p/Contents/Info.plist"
      t=$(/usr/libexec/PlistBuddy -c 'Print :AudioComponents:0:type' "$plist")
      s=$(/usr/libexec/PlistBuddy -c 'Print :AudioComponents:0:subtype' "$plist")
      m=$(/usr/libexec/PlistBuddy -c 'Print :AudioComponents:0:manufacturer' "$plist")
      if ! auval -v "$t" "$s" "$m" > "${TMPDIR:-/tmp}/forte-auval.log" 2>&1 ||
         ! grep -q 'AU VALIDATION SUCCEEDED' "${TMPDIR:-/tmp}/forte-auval.log"; then
        fail "$p: auval -v $t $s $m failed (its log: ${TMPDIR:-/tmp}/forte-auval.log). If it cannot find the component, log out and back in, then try again."
        continue
      fi
    fi
    if [ "$OS" = Linux ]; then
      missing=$(find "$p" -type f -exec ldd {} \; 2>/dev/null | { grep 'not found' || true; } | awk '{print $1}' | sort -u | tr '\n' ' ')
      if [ -n "$missing" ]; then fail "$p needs libraries this system lacks: ${missing}(install them with your package manager)"; continue; fi
    fi
    if [ "$kind" = clap ] && command -v clap-validator >/dev/null; then
      clap-validator validate "$p" >/dev/null 2>&1 || { fail "$p: clap-validator validate failed"; continue; }
    fi
    echo "ok    $p"
  done <<< "$list"
  if [ "$bad" -gt 0 ]; then echo "$bad problem(s)"; exit 1; fi
  echo "All installed and working."
}

uninstall() {
  local kind name d
  while read -r kind name; do
    d=$(dir "$kind")
    if [ -e "$d/$name" ]; then rm -rf "${d:?}/$name"; echo "removed $d/$name"; fi
  done <<< "$list"
}

case "${1:-}" in
  install|verify|uninstall) "$1" ;;
  *) echo "usage: bash install.sh install|verify|uninstall" >&2; exit 2 ;;
esac
