// windows-installer.mjs — the Inno Setup script of Forte's Windows installer (docs/PLUGINS.md,
// step 5): Forte-plugins-windows-setup.exe, which a plugin release ships next to the Windows
// archives. tools/package-plugins.sh writes it beside the folder it packs as
// Forte-plugins-windows and compiles it with Inno Setup's ISCC.
//
// The installer puts the plugins where install.cmd does and every host looks: the VST3s in
// C:\Program Files\Common Files\VST3, the CLAPs in ...\CLAP; the standalone apps and the Forte app
// in C:\Program Files\Forte, with a Start menu shortcut each. It asks for administrator rights
// once, is listed in Settings' Apps (Installed apps), where it uninstalls, and installing a newer
// one upgrades it in place. Its Components page picks the formats and the instruments: everything
// at first, or the Forte app alone, or any choice (/COMPONENTS="clap,instruments\gongs" from a
// command line, with /VERYSILENT to ask nothing). Unsigned, like every download: SmartScreen asks
// once (More info, Run anyway).
//
// Usage: node tools/windows-installer.mjs "<folder>" > forte.iss
//   <folder>: the download's folder (Forte plugins), relative to where forte.iss will be

import { pathToFileURL } from 'node:url';
import { FORTE_VERSION } from '../shared/registry.js';
import { released } from './plugin-release.mjs';

// Never change it: Windows knows an installed Forte by it, so a newer installer upgrades it.
export const APP_ID = '{8C2E6B1F-4F0A-4E7B-9C3D-5A1F7E2B9D64}';
export const SETUP = 'Forte-plugins-windows-setup';

// Inno Setup quotes a string by doubling its double quotes; names carry none, but be safe.
const q = (s) => `"${String(s).replaceAll('"', '""')}"`;

export function script(folder, instruments = released()) {
  const files = [], icons = [], comps = [];
  for (const i of instruments) {
    const c = `instruments\\${i.id}`;
    comps.push(`Name: ${q(c)}; Description: ${q(i.name)}; Types: full`);
    files.push(
      `Source: ${q(`${folder}\\${i.name}.vst3\\*`)}; DestDir: ${q(`{commoncf64}\\VST3\\${i.name}.vst3`)}; Components: vst3 and ${c}; Flags: ignoreversion recursesubdirs createallsubdirs`,
      `Source: ${q(`${folder}\\${i.name}.clap`)}; DestDir: "{commoncf64}\\CLAP"; Components: clap and ${c}; Flags: ignoreversion`,
      `Source: ${q(`${folder}\\${i.name}.exe`)}; DestDir: "{app}"; Components: apps and ${c}; Flags: ignoreversion`,
    );
    icons.push(`Name: ${q(`{autoprograms}\\Forte\\${i.name}`)}; Filename: ${q(`{app}\\${i.name}.exe`)}; Components: apps and ${c}`);
  }
  const [major = 0, minor = 0, patch = 0] = FORTE_VERSION.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  return `; Forte's Windows installer, written by tools/windows-installer.mjs (don't edit: run it again)
[Setup]
AppId=${APP_ID.replace('{', '{{')}
AppName=Forte
AppVersion=${FORTE_VERSION}
AppVerName=Forte ${FORTE_VERSION}
AppPublisher=Jesse Thaler
AppPublisherURL=https://forte.jthaler.net
AppSupportURL=https://github.com/jdthaler/forte/issues
AppUpdatesURL=https://forte.jthaler.net/#plugins
VersionInfoVersion=${major}.${minor}.${patch}.0
VersionInfoDescription=Forte plugins setup
DefaultDirName={autopf}\\Forte
DisableDirPage=auto
DefaultGroupName=Forte
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
LicenseFile=${folder}\\LICENSE.txt
SetupIconFile=forte.ico
UninstallDisplayIcon={app}\\Forte.exe
UninstallDisplayName=Forte plugins
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
OutputBaseFilename=${SETUP}
CloseApplications=yes

[Types]
Name: "full"; Description: "Every instrument, in every format"
Name: "app"; Description: "Only the Forte app (every instrument in one window)"
Name: "custom"; Description: "Choose the formats and instruments"; Flags: iscustom

[Components]
Name: "vst3"; Description: "VST3 plugins (C:\\Program Files\\Common Files\\VST3)"; Types: full
Name: "clap"; Description: "CLAP plugins (C:\\Program Files\\Common Files\\CLAP)"; Types: full
Name: "apps"; Description: "A standalone app for each instrument"; Types: full
Name: "forte"; Description: "The Forte app: every instrument in one, picked from its Instrument menu"; Types: full app
Name: "instruments"; Description: "Instruments (for the VST3s, CLAPs and standalone apps)"; Types: full
${comps.join('\n')}

[Files]
Source: ${q(`${folder}\\Forte.exe`)}; DestDir: "{app}"; Components: forte; Flags: ignoreversion
Source: ${q(`${folder}\\INSTALL.md`)}; DestDir: "{app}"; Flags: ignoreversion
Source: ${q(`${folder}\\LICENSE.txt`)}; DestDir: "{app}"; Flags: ignoreversion
Source: ${q(`${folder}\\THIRD-PARTY-NOTICES.md`)}; DestDir: "{app}"; Flags: ignoreversion
${files.join('\n')}

[Icons]
Name: "{autoprograms}\\Forte\\Forte"; Filename: "{app}\\Forte.exe"; Components: forte
${icons.join('\n')}

[Run]
Filename: "{app}\\Forte.exe"; Description: "Open the Forte app"; Components: forte; Flags: nowait postinstall skipifsilent
`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) { // (a plain file:// + path fails on Windows)
  const folder = process.argv[2];
  if (!folder) { console.error('usage: node tools/windows-installer.mjs "<folder>" > forte.iss'); process.exit(2); }
  process.stdout.write('\uFEFF' + script(folder).replaceAll('\n', '\r\n')); // UTF-8 with its BOM, as ISCC reads it
}
