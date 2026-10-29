// make-previews.mjs — the picture and the words a shared link shows (in Messages, Slack, social
// sites): for each ready instrument, <id>/preview.jpg, its page in Perform at 1200×630 with a
// chord sounding and the page's buttons hidden, and the tags in its <head> (description, Open
// Graph, Twitter card) from its name and tagline in shared/registry.js; for the front page,
// icons/preview.jpg and the same tags (its words are its own, kept as they are).
//
// Usage: node tools/make-previews.mjs [--tags] [filter]
//   --tags   only rewrite the tags (no browser): after a tagline changes
//   filter   only the pages whose id contains it (index for the front page)
// Run it for a new instrument, and again when a page's look changes much; test/site-tests.mjs
// checks every ready instrument has its picture and its tags.
// Needs Playwright (the cloud sessions have it installed globally; CI installs it).

import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { INSTRUMENTS } from '../shared/registry.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
export const SITE = `https://${readFileSync(join(ROOT, 'CNAME'), 'utf8').trim()}/`;
export const W = 1200, H = 630;
export const pictureOf = (id) => (id ? `${id}/preview.jpg` : 'icons/preview.jpg');

const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// The tags for one page: i an instrument, or null for the front page (whose title and
// description are written in index.html).
export function tagsFor(i, html) {
  const title = i ? `${i.name} · Forte` : html.match(/<title>([^<]*)<\/title>/)[1];
  const description = i ? esc(i.tagline) : html.match(/<meta name="description" content="([^"]*)">/)[1];
  const social = i ? description : html.match(/<meta property="og:description" content="([^"]*)">/)?.[1] ?? description;
  const alt = i ? `The ${esc(i.name)}'s page in Forte, playing a chord` : 'Forte: keyboard instruments built from physics';
  return [
    `<meta name="description" content="${description}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Forte">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${social}">`,
    `<meta property="og:url" content="${SITE}${i ? `${i.id}/` : ''}">`,
    `<meta property="og:image" content="${SITE}${pictureOf(i?.id)}">`,
    `<meta property="og:image:width" content="${W}">`,
    `<meta property="og:image:height" content="${H}">`,
    `<meta property="og:image:alt" content="${alt}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ];
}

// The page's <head> with the tags in place of any it had, after its <title>.
export function withTags(html, i) {
  const tags = tagsFor(i, html);
  const kept = html.split('\n').filter((l) => !/^\s*<meta (name="(description|twitter:[^"]*)"|property="og:[^"]*")/.test(l)).join('\n');
  return kept.replace(/^(\s*)(<title>[^<]*<\/title>)\n/m, (_, pad, t) => `${pad}${t}\n${tags.map((x) => pad + x + '\n').join('')}`);
}

const args = process.argv.slice(2);
const tagsOnly = args.includes('--tags');
const filter = args.filter((a) => !a.startsWith('--'))[0] || '';
const pages = [...INSTRUMENTS.filter((i) => i.ready), null].filter((i) => (i?.id ?? 'index').includes(filter));

async function playwright() {
  try { return await import('playwright'); } catch { /* not local: try the global install */ }
  const g = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  return import(join(g, 'playwright', 'index.mjs'));
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.m4a': 'audio/mp4', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };

function serve() {
  const server = createServer(async (req, res) => {
    let path = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!path.startsWith(ROOT + sep) && path !== ROOT) { res.writeHead(403).end(); return; }
    try {
      if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
      res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' }).end(await readFile(path));
    } catch { res.writeHead(404).end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, url: `http://localhost:${server.address().port}/` })));
}

// What a picture leaves out: the buttons, the bars of choices and the keys' letters, so the
// views and the keys fill it; the site's address goes where the buttons were.
const PICTURE_CSS = `
  body > header .status, .forte-views-bar, .forte-controls-bar, .forte-kbbar, .k-label, .forte-caret { display: none !important; }
  body > header::after { content: "forte.jthaler.net"; margin-left: auto; align-self: center; font: 500 15px system-ui, sans-serif; color: #8d887f; padding-right: 8px; }
`;

// The front page's picture: sixteen instruments' pictures, a few from each section, under the
// name. (So it is made after theirs.)
async function frontPicture() {
  const ready = INSTRUMENTS.filter((i) => i.ready), sections = [...new Set(ready.map((i) => i.section))];
  const picked = [];
  for (let k = 0; picked.length < 16; k++) for (const s of sections) { const i = ready.filter((x) => x.section === s)[k]; if (i && picked.length < 16) picked.push(i); }
  const tiles = await Promise.all(picked.map(async (i) => `<img src="data:image/jpeg;base64,${(await readFile(join(ROOT, pictureOf(i.id)))).toString('base64')}" alt="">`));
  return `<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#0b0b0e;position:relative">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);width:${W}px">${tiles.join('')}</div>
    <style>img { width: 100%; display: block; opacity: 0.55; }</style>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;background:radial-gradient(ellipse 48% 42% at 50% 50%, rgba(11,11,14,0.92), rgba(11,11,14,0.25));color:#ece8e1;text-align:center">
      <div style="font:400 120px/1 Georgia,'Times New Roman',serif">Forte</div>
      <div style="font:400 30px/1.3 system-ui,sans-serif;margin-top:14px;color:#d8d3ca">keyboard instruments built from physics</div>
      <div style="font:500 20px system-ui,sans-serif;margin-top:22px;color:#f0b35a">forte.jthaler.net</div>
    </div></body></html>`;
}

async function pictures() {
  const { chromium } = await playwright();
  const { server, url } = await serve();
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    for (const i of pages) {
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      await ctx.addInitScript(() => { try { localStorage.setItem('forte/mode/v1', 'perform'); } catch { /* a picture in Discover, then */ } });
      const tab = await ctx.newPage();
      const errors = [];
      tab.on('pageerror', (e) => errors.push(e.message));
      if (!i) await tab.setContent(await frontPicture());
      else {
        await tab.goto(url + `${i.id}/`, { waitUntil: 'load' });
        await tab.waitForTimeout(800);
        await tab.evaluate(() => document.querySelector('#start')?.click()); // hidden in Perform, where a key starts the audio too
        await tab.waitForTimeout(1000);
        await tab.addStyleTag({ content: PICTURE_CSS });
        await tab.evaluate(() => window.dispatchEvent(new Event('resize')));
        // a C major chord on the keys' lower row, a note at a time, then held while the views fill
        for (const k of ['z', 'c', 'b', ',']) { await tab.keyboard.down(k); await tab.waitForTimeout(250); }
        await tab.waitForTimeout(2500);
      }
      await tab.screenshot({ path: join(ROOT, pictureOf(i?.id)), type: 'jpeg', quality: 82 });
      console.log('  picture', pictureOf(i?.id), errors.length ? `(errors: ${errors.join('; ')})` : '');
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const i of pages) {
    const file = join(ROOT, i ? `${i.id}/index.html` : 'index.html');
    const html = await readFile(file, 'utf8'), next = withTags(html, i);
    if (next !== html) { await writeFile(file, next); console.log('  tags', i?.id ?? 'index'); }
  }
  if (!tagsOnly) await pictures();
}
