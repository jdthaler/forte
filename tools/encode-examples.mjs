// Compress rendered demos for the web and index them.
// examples/<instrument>/*.wav  →  examples/<instrument>/*.m4a  +  examples/index.json
// Usage: node tools/encode-examples.mjs [slug …]   (macOS afconvert, or ffmpeg elsewhere; WAVs stay local)
// With slugs, only those instruments' WAVs are (re-)encoded; the index always covers everything.

import { readdirSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

// AAC at 112 kb/s: macOS afconvert if it is there, otherwise ffmpeg's own AAC encoder
let encoder;
function encode(src, dst) {
  encoder ??= ['afconvert', 'ffmpeg'].find((cmd) => !spawnSync(cmd, ['-h'], { stdio: 'ignore' }).error);
  if (encoder === 'afconvert') execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '112000', src, dst]);
  else if (encoder === 'ffmpeg') execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-c:a', 'aac', '-b:a', '112k', '-movflags', '+faststart', dst]);
  else throw new Error('encoding needs afconvert (macOS) or ffmpeg');
}

const root = new URL('../examples/', import.meta.url);
const only = process.argv.slice(2);
const index = {};
for (const inst of readdirSync(root).filter((d) => d !== 'template' && statSync(new URL(d, root)).isDirectory()).sort()) {
  const dir = new URL(`${inst}/`, root);
  const wavs = readdirSync(dir).filter((f) => f.endsWith('.wav')).sort();
  const list = [];
  for (const wav of wavs) {
    const m4a = wav.replace(/\.wav$/, '.m4a');
    const src = new URL(wav, dir).pathname, dst = new URL(m4a, dir).pathname;
    if ((!only.length || only.includes(inst)) && (!existsSync(dst) || statSync(dst).mtimeMs < statSync(src).mtimeMs)) {
      encode(src, dst);
    }
    if (!existsSync(dst)) continue;
    const title = wav.replace(/\.wav$/, '').replace(/^\d+-/, '').replace(/-/g, ' ');
    list.push({ file: m4a, title: title[0].toUpperCase() + title.slice(1) });
  }
  // keep any already-encoded files whose WAVs are not on this machine
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.m4a')).sort()) {
    if (!list.some((x) => x.file === f)) {
      const title = f.replace(/\.m4a$/, '').replace(/^\d+-/, '').replace(/-/g, ' ');
      list.push({ file: f, title: title[0].toUpperCase() + title.slice(1) });
    }
  }
  list.sort((a, b) => a.file.localeCompare(b.file));
  if (list.length) index[inst] = list;
}
writeFileSync(new URL('index.json', root), JSON.stringify(index, null, 1));
console.log(Object.entries(index).map(([k, v]) => `${k}: ${v.length}`).join(', '));
