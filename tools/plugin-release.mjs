// plugin-release.mjs — the notes of a plugin release (the release-plugins workflow, step 5 of
// docs/PLUGINS.md): which instruments it holds, at which versions, the downloads, and how to
// install them (native/INSTALL.md).
//
// Usage: node tools/plugin-release.mjs              prints the notes (Markdown)
//        node tools/plugin-release.mjs --tag        prints the default tag, plugins-v<Forte version>
//        node tools/plugin-release.mjs --plugins    prints "<id><TAB><name>" for each instrument
//                                                   with plugins (tools/package-plugins.sh)
//        node tools/plugin-release.mjs --files      prints every archive a release must hold
//        node tools/plugin-release.mjs --manifest   prints what a release holds: each instrument's
//                                                   version and the native/ tree it was built from

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { FORTE_VERSION } from '../shared/registry.js';
import { SYSTEMS, archive, withPlugins } from '../shared/plugins.js';

export const ASSETS = Object.fromEntries(SYSTEMS.map(([name, suffix]) => [name, archive(null, suffix)]));
export const FORMATS = { macOS: 'AU, VST3, CLAP, standalone (Apple silicon and Intel, macOS 10.15 or later)', Windows: 'VST3, CLAP, standalone (64-bit)', Linux: 'VST3, CLAP, standalone (x86-64)' };
export const released = withPlugins;

// A release is published only when this changes (the release-plugins workflow compares it with
// the latest release's manifest.txt): a new or changed instrument, or any change under native/.
export function manifest() {
  const tree = execSync('git rev-parse HEAD:native', { cwd: new URL('..', import.meta.url) }).toString().trim();
  return [`native ${tree}`, ...released().map((i) => `${i.id} ${i.version}`)].join('\n');
}

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
    '| Instrument | Version | macOS | Windows | Linux |',
    '|---|---|---|---|---|',
    ...released().map((i) => `| [${i.name}](https://forte.jthaler.net/${i.id}/) | ${i.version} | ${SYSTEMS.map(([, suffix]) => `\`${archive(i.id, suffix)}\``).join(' | ')} |`),
    '',
    'Every instrument together:',
    '',
    '| System | Download | Formats |',
    '|---|---|---|',
    ...Object.entries(ASSETS).map(([sys, f]) => `| ${sys} | \`${f}\` | ${FORMATS[sys]} |`),
    '',
    unwrap(install).replace(/^## /gm, '### '),
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  console.log(arg === '--tag' ? `plugins-v${FORTE_VERSION}`
    : arg === '--plugins' ? released().map((i) => `${i.id}\t${i.name}`).join('\n')
    : arg === '--manifest' ? manifest()
    : arg === '--files' ? [null, ...released().map((i) => i.id)].flatMap((id) => SYSTEMS.map(([, suffix]) => archive(id, suffix))).join('\n')
    : notes());
}
