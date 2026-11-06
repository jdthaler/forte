// offline.mjs — the files the service worker (sw.js) keeps for the site to work offline, each
// with a hash of what it holds.
//
// sw.js keeps every page and everything a page loads (its scripts, styles, WebAssembly, data,
// README, the icons and the songs' MIDI files): about 11 MB, 5 MB as GitHub Pages sends it. The demos (examples/*.m4a)
// and the pictures a shared link shows (preview.jpg) stay online only. The list in sw.js is the
// site as it was released: tools/release.mjs writes it as the release's last step, and a pull
// request into live fails (tools/release.mjs --check-pr) when it isn't the site's. On main it is
// the last release's, and nothing serves it there: sw.js isn't registered on localhost
// (shared/boot.js), and tools/check-offline.mjs serves a list made from the checkout.
//
// Usage: node tools/offline.mjs            write the list into sw.js
//        node tools/offline.mjs --check    exit 1 when sw.js's list isn't the checkout's

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const R = new URL('..', import.meta.url);

// What the site serves that a page can load: the files git has or would add (not what it ignores).
const KEEP = /\.(html|js|css|wasm|json|webmanifest|png|svg|mid)$|(^|\/)README\.md$|^docs\/PRIOR_ART\.md$/;
const SKIP = /^(native|test|tools|changes|docs\/template)\/|^\.|^(package\.json|sw\.js)$|^README\.md$/;
export const kept = (path) => KEEP.test(path) && !SKIP.test(path);

// The first 12 hex digits of a SHA-256: the service worker checks each file it fetches against it.
export const hashOf = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 12);

// { path: hash } for every file kept, sorted, from the files as they are in the checkout.
export function offlineFiles(root = R) {
  const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root }).toString().split('\0');
  const files = [...new Set(listed)].filter((f) => kept(f) && existsSync(new URL(f, root))).sort(); // (a deleted file git still has)
  return Object.fromEntries(files.map((f) => [f, hashOf(readFileSync(new URL(f, root)))]));
}

// sw.js with `files` as its list.
const LIST = /(\/\/ <offline-files>\n)[\s\S]*?(\n\/\/ <\/offline-files>)/;
export function withFiles(sw, files) {
  if (!LIST.test(sw)) throw new Error('sw.js has no // <offline-files> … // </offline-files> block');
  const lines = Object.entries(files).map(([f, h]) => `  ${JSON.stringify(f)}: '${h}',`);
  return sw.replace(LIST, (_, a, b) => `${a}const FILES = {\n${lines.join('\n')}\n};${b}`);
}

// The list sw.js has now.
export function filesIn(sw) {
  const block = sw.match(LIST)?.[0] ?? '';
  return Object.fromEntries([...block.matchAll(/^ {2}"([^"]+)": '([0-9a-f]+)',$/gm)].map((m) => [m[1], m[2]]));
}

// What differs between two lists: added, removed and changed paths.
export function differences(was, now) {
  const out = [];
  for (const f of Object.keys(now)) if (!(f in was)) out.push(`+ ${f}`); else if (was[f] !== now[f]) out.push(`~ ${f}`);
  for (const f of Object.keys(was)) if (!(f in now)) out.push(`- ${f}`);
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = new URL('sw.js', R), sw = readFileSync(url, 'utf8'), files = offlineFiles();
  const diff = differences(filesIn(sw), files);
  if (process.argv.includes('--check')) {
    if (diff.length) {
      console.error(`sw.js's offline list isn't the site's (${diff.length} file${diff.length === 1 ? '' : 's'}: ${diff.slice(0, 5).join(', ')}${diff.length > 5 ? ', …' : ''}): run node tools/offline.mjs and commit sw.js`);
      process.exit(1);
    }
    console.log(`sw.js keeps the site's ${Object.keys(files).length} files`);
  } else {
    writeFileSync(url, withFiles(sw, files));
    console.log(`sw.js keeps ${Object.keys(files).length} files (${diff.length} changed)`);
  }
}
