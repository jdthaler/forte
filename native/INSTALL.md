# Installing the Forte plugins

Each instrument comes in every format its system has: CLAP, VST3 and a standalone app on
macOS, Windows and Linux, and an Audio Unit (AU) on macOS. They are instruments: put one on
an instrument or MIDI track. They have no window of their own yet, so the DAW shows its
generic panel of sliders. The plugins are built from the same C++ as the instruments on
<https://forte.jthaler.net>, and sound the same.

Download every instrument together or one at a time, from <https://forte.jthaler.net/#plugins>
or from an instrument's page (↓ Plugin). They are free and unsigned: macOS and Windows will
warn about them until you allow them, as below.

## The quick way (macOS and Linux)

Unzip or unpack the download, then in Terminal, in the folder it made (type `cd `, drag the
folder onto the window and press Return):

```bash
make install    # copy the plugins to your plugin folders; on a Mac, also clear the quarantine
make verify     # check each one is installed and loads (on a Mac, auval tests the Audio Units)
```

`make uninstall` removes them again, and `make` alone explains the rest. On a Mac, `make` comes
with Apple's command line tools: if macOS offers to install them, accept (or run
`xcode-select --install`). Without make, `bash install.sh install` does the same. The
standalone apps go in `~/Applications` on a Mac and `~/.local/bin` on Linux. Nothing needs
`sudo`. The sections below do the same by hand, and say what Windows needs.

## macOS

Unzip the download, then copy each bundle to its folder. `~/Library` is hidden in Finder:
use **Go ▸ Go to Folder…** (⇧⌘G) to open it.

| Format | Folder |
|---|---|
| AU (`.component`) | `~/Library/Audio/Plug-Ins/Components` |
| VST3 (`.vst3`) | `~/Library/Audio/Plug-Ins/VST3` |
| CLAP (`.clap`) | `~/Library/Audio/Plug-Ins/CLAP` (create the folder if it isn't there) |

Then clear the download quarantine in Terminal. The plugins are not notarised by Apple, so
without this macOS blocks them and hosts such as Logic and MainStage don't list them:

```bash
xattr -dr com.apple.quarantine ~/Library/Audio/Plug-Ins/Components ~/Library/Audio/Plug-Ins/VST3 ~/Library/Audio/Plug-Ins/CLAP
```

The standalone apps run from anywhere, for example `/Applications`, after the same command
on them: `xattr -dr com.apple.quarantine "/Applications/Bubble Organ.app"`.

For **Logic**, **MainStage** and **GarageBand**, which use only AU, also run
`killall -9 AudioComponentRegistrar` so they notice the new components. The plugins are under
**AU Instruments ▸ Forte**. If one is missing, open **Settings ▸ Plug-in Manager**, select it
and choose **Reset & Rescan Selection**.

## Windows

Unzip the download, then:

- VST3: copy each `.vst3` (it is a folder) into `C:\Program Files\Common Files\VST3`.
- CLAP: copy each `.clap` into `C:\Program Files\Common Files\CLAP`. Create the folder if it
  isn't there.
- The standalone `.exe` files run from anywhere. SmartScreen may warn that they are
  unsigned: choose **More info ▸ Run anyway**.

## Linux

Unpack the download (`tar -xzf Forte-plugins-linux.tar.gz`), then:

- VST3: copy each `.vst3` to `~/.vst3`.
- CLAP: copy each `.clap` to `~/.clap`.
- The standalone apps run from anywhere.

## Making the DAW find them

| DAW | Formats | Rescan |
|---|---|---|
| Logic Pro, MainStage | AU | Scans by itself; see macOS above if one is missing. |
| Ableton Live | VST3, AU | **Settings ▸ Plug-ins**: turn on VST3 (system folders) and AU, then **Rescan**. |
| REAPER | VST3, CLAP, AU | **Preferences ▸ Plug-ins ▸ VST/CLAP**: **Re-scan**. |
| Bitwig | CLAP, VST3 | Finds them by itself. |
| No DAW | — | Open the standalone app, pick your audio output and MIDI keyboard in its settings, and play. |

## Playing

Notes and velocity, the sustain pedal (CC64), the mod wheel (CC1), aftertouch and pitch bend
do what they do on the instrument's page; each page's *How it works* says what. The
instrument's presets are on its **Preset** parameter, and every other control on the page is
a parameter the DAW can automate. The DAW saves the settings with the project.

Problems and questions: <https://github.com/jdthaler/forte/issues>.
