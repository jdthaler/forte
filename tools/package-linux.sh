#!/usr/bin/env bash
# package-linux.sh — the Linux packages a plugin release ships next to its archives
# (docs/PLUGINS.md, step 5): Forte-plugins-linux.deb (Debian, Ubuntu, Mint…) and
# Forte-plugins-linux.rpm (Fedora, openSUSE…), one package, forte-plugins, with every instrument
# in every Linux format, put where every host and every user finds them:
#
#   /usr/lib/vst3/<Name>.vst3                      the VST3s
#   /usr/lib/clap/<Name>.clap                      the CLAPs
#   /usr/lib/forte/<Name>                          the standalone apps, the Forte app among them
#   /usr/bin/forte                                 the Forte app, every instrument in one
#   /usr/share/applications/net.jthaler.forte.desktop, and its icon, so it is in the app menu
#   /usr/share/doc/forte-plugins/                  INSTALL.md, LICENSE.txt, THIRD-PARTY-NOTICES.md
#
# The libraries they need are worked out from the binaries (dpkg-shlibdeps; rpmbuild's own
# scan), so the package manager installs WebKitGTK and the rest with them. The version is
# Forte's, with the commit's time as the release (0.45.0-20261105130000), so each plugin
# release upgrades the one before even when Forte's version did not move. Run from the
# repository's root, on the folder tools/package-plugins.sh packs as Forte-plugins-linux
# (needs dpkg-deb, dpkg-shlibdeps and rpmbuild):
#
#   tools/package-linux.sh "native/build/pkg/Forte-plugins/Forte plugins"     writes dist/
set -euo pipefail
src=$(cd "$1" && pwd)
out=$PWD/dist
work=$PWD/native/build/linux-packages
version=$(node -p "require('./package.json').version")
release=$(TZ=UTC git log -1 --format=%cd --date=format-local:%Y%m%d%H%M%S)
rm -rf "$work"
mkdir -p "$work" "$out"

# The tree the package installs, in $work/root
root=$work/root
mkdir -p "$root/usr/lib/vst3" "$root/usr/lib/clap" "$root/usr/lib/forte" "$root/usr/bin" \
  "$root/usr/share/applications" "$root/usr/share/icons/hicolor/512x512/apps" "$root/usr/share/doc/forte-plugins"
n=0
for p in "$src"/*.vst3; do cp -R "$p" "$root/usr/lib/vst3/"; n=$((n + 1)); done
for p in "$src"/*.clap; do cp -R "$p" "$root/usr/lib/clap/"; done
for p in "$src"/*; do [ -f "$p" ] && [ -x "$p" ] && [[ "$(basename "$p")" != *.* ]] && cp "$p" "$root/usr/lib/forte/"; done
[ "$n" -gt 0 ] || { echo "no VST3s in $src" >&2; exit 1; }
[ -x "$root/usr/lib/forte/Forte" ] || { echo "no Forte app in $src" >&2; exit 1; }
[ "$(find "$root/usr/lib/clap" -name '*.clap' | wc -l)" = "$n" ] || { echo "not a CLAP for each VST3 in $src" >&2; exit 1; }
ln -s ../lib/forte/Forte "$root/usr/bin/forte"
cp icons/icon-512.png "$root/usr/share/icons/hicolor/512x512/apps/net.jthaler.forte.png"
cat > "$root/usr/share/applications/net.jthaler.forte.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Forte
GenericName=Physical-model keyboard instruments
Comment=Every Forte instrument, synthesised from its physics
Exec=forte
Icon=net.jthaler.forte
Terminal=false
Categories=AudioVideo;Audio;Music;Midi;
Keywords=synthesizer;piano;organ;instrument;MIDI;
EOF
cp "$src/INSTALL.md" "$src/LICENSE.txt" "$src/THIRD-PARTY-NOTICES.md" "$root/usr/share/doc/forte-plugins/"
# everything read-only but for its owner, as a package manager expects
find "$root" -type d -exec chmod 755 {} +
find "$root" -type f -exec chmod go-w {} +

summary='Physical-model keyboard instruments as VST3, CLAP and standalone apps'
read -r -d '' description <<EOF || true
Forte's instruments, synthesised from their physics: the same C++ as the
instruments on https://forte.jthaler.net, as $n VST3 and CLAP plugins
(in /usr/lib/vst3 and /usr/lib/clap) and standalone apps (in /usr/lib/forte),
with the Forte app (forte), every instrument in one window.
EOF

# .deb
deb=$work/deb
mkdir -p "$deb/DEBIAN"
cp -R "$root"/. "$deb/"
# dpkg-shlibdeps reads a source package's debian/control; a minimal one will do
mkdir -p "$work/shlibs/debian"
printf 'Source: forte-plugins\n\nPackage: forte-plugins\nArchitecture: amd64\n' > "$work/shlibs/debian/control"
elves=()
while IFS= read -r -d '' f; do elves+=("-e$f"); done < <(find "$deb/usr/lib" -type f \( -name '*.so' -o -name '*.clap' -o -perm -u+x \) -print0)
depends=$(cd "$work/shlibs" && dpkg-shlibdeps -O "${elves[@]}" | sed -n 's/^shlibs:Depends=//p')
[ -n "$depends" ] || { echo "dpkg-shlibdeps found no dependencies" >&2; exit 1; }
cat > "$deb/DEBIAN/control" <<EOF
Package: forte-plugins
Version: $version-$release
Architecture: amd64
Maintainer: Jesse Thaler <https://github.com/jdthaler/forte/issues>
Installed-Size: $(du -sk --exclude=DEBIAN "$deb" | cut -f1)
Depends: $depends
Section: sound
Priority: optional
Homepage: https://forte.jthaler.net
Description: $summary
$(sed 's/^/ /' <<< "$description")
EOF
dpkg-deb --root-owner-group -Zxz --build "$deb" "$out/Forte-plugins-linux.deb"

# .rpm: rpmbuild packs the same tree; its scan of the binaries writes the Requires (sonames,
# which every rpm distribution resolves to its own package names), and it provides nothing,
# so the plugins' own .so files don't stand in for system libraries
rpm=$work/rpm
mkdir -p "$rpm"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}
cat > "$rpm/SPECS/forte-plugins.spec" <<EOF
Name: forte-plugins
Version: $version
Release: $release
Summary: $summary
License: MIT
URL: https://forte.jthaler.net
BuildArch: x86_64
AutoProv: no
%global debug_package %{nil}
%global __os_install_post %{nil}
%global _build_id_links none
%global _binary_payload w6T.xzdio
%description
$description
%install
cp -a "$root"/. %{buildroot}/
%files
/usr/lib/vst3/*
/usr/lib/clap/*
/usr/lib/forte
/usr/bin/forte
/usr/share/applications/net.jthaler.forte.desktop
/usr/share/icons/hicolor/512x512/apps/net.jthaler.forte.png
%doc /usr/share/doc/forte-plugins
EOF
rpmbuild --quiet --define "_topdir $rpm" -bb "$rpm/SPECS/forte-plugins.spec"
cp "$rpm"/RPMS/x86_64/forte-plugins-*.rpm "$out/Forte-plugins-linux.rpm"
ls -l "$out"/Forte-plugins-linux.deb "$out"/Forte-plugins-linux.rpm
