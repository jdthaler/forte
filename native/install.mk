# Installs and checks the Forte plugins in this folder (macOS and Linux). It ships as `Makefile`
# in each download, next to the plugins, and works on whichever plugins are in its folder: one
# instrument's or every instrument's. In Terminal, in this folder:
#
#   make install     copy the plugins to your plugin folders (and, on a Mac, clear the download
#                    quarantine and make Logic, MainStage and GarageBand notice them)
#   make verify      check that each plugin is installed and can load: auval for the Audio Units
#                    and the signatures on a Mac, the libraries they need on Linux, and
#                    clap-validator for the CLAPs if you have it
#   make uninstall   remove them again
#   make check       check the plugins in this folder can load, without installing anything
#
# Add a format to do just that one: au (macOS), vst3, clap or app (the standalone), e.g.
#   make install-au, make verify-vst3, make uninstall-clap, make check-app
# The standalone runs from this folder too: make check-app, then open it.
#
# Nothing needs sudo: everything goes in your own Library (macOS) or home folder (Linux). The
# folders can be changed, e.g. `make install VST3_DIR=/some/where` (also CLAP_DIR, AU_DIR and
# APP_DIR). On a Mac, `make` comes with Apple's command line tools: if it asks, let it install
# them (or run `xcode-select --install`). The work is in install.sh, which runs without make too.
# native/install.mk in https://github.com/jdthaler/forte.

.PHONY: help install verify uninstall check
help:
	@sed -n '/^$$/q; s/^# \{0,1\}//p' Makefile
install verify uninstall check:
	@bash ./install.sh $@
# one format: make install-au, verify-vst3, uninstall-clap, check-app…
install-%:
	@bash ./install.sh install $*
verify-%:
	@bash ./install.sh verify $*
uninstall-%:
	@bash ./install.sh uninstall $*
check-%:
	@bash ./install.sh check $*
