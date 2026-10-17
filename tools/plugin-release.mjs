// plugin-release.mjs — the notes of a plugin release (the release-plugins workflow, step 5 of
// docs/PLUGINS.md): which instruments it holds, at which versions, the downloads, and how to
// install them (native/INSTALL.md).
//
// Usage: node tools/plugin-release.mjs           prints the notes (Markdown)
//        node tools/plugin-release.mjs --tag     prints the default tag, plugins-v<Forte version>

import { readFileSync } from 'node:fs';
import { INSTRUMENTS, FORTE_VERSION } from '../shared/registry.js';

export const ASSETS = { macOS: 'Forte-plugins-macos.zip', Windows: 'Forte-plugins-windows.zip', Linux: 'Forte-plugins-linux.tar.gz' };
export const FORMATS = { macOS: 'AU, VST3, CLAP, standalone (Apple silicon and Intel, macOS 10.15 or later)', Windows: 'VST3, CLAP, standalone (64-bit)', Linux: 'VST3, CLAP, standalone (x86-64)' };
export const released = () => INSTRUMENTS.filter((i) => i.ready && i.plugin?.ready);

// GitHub shows each line break in a release's notes, so paragraphs and list items wrapped in
// the file are joined into one line each (code, tables and headings stay as they are).
function unwrap(md) {
  const out = [];
  let code = false;
  for (const line of md.split('\n')) {
    if (line.startsWith('```')) code = !code;
    const prev = out.at(-1) ?? '';
    const joins = !code && line.trim() && !/^\s*([-*] |[|#>]|\d+\.|```)/.test(line) && prev.trim() && !/^\s*([|#]|```)/.test(prev);
    if (joins) out[out.length - 1] = `${prev} ${line.trim()}`;
    else out.push(line);
  }
  return out.join('\n');
}

export function notes() {
  const install = readFileSync(new URL('../native/INSTALL.md', import.meta.url), 'utf8').replace(/^# .*\n+/, '');
  return [
    `Forte's instruments as plugins, built from the same C++ physics as <https://forte.jthaler.net> (Forte ${FORTE_VERSION}).`,
    '',
    '| Instrument | Version |',
    '|---|---|',
    ...released().map((i) => `| [${i.name}](https://forte.jthaler.net/${i.id}/) | ${i.version} |`),
    '',
    '| System | Download | Formats |',
    '|---|---|---|',
    ...Object.entries(ASSETS).map(([sys, f]) => `| ${sys} | \`${f}\` | ${FORMATS[sys]} |`),
    '',
    unwrap(install).replace(/^## /gm, '### '),
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(process.argv.includes('--tag') ? `plugins-v${FORTE_VERSION}` : notes());
}
