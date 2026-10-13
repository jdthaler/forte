// Start a new instrument from the template.
// Usage: node tools/new-instrument.mjs <slug> <EngineName> "<Display Name>"
//   e.g. node tools/new-instrument.mjs gongs Gong "Gong Keyboard"
// Creates <slug>/ (page, style, src/<slug>-*.js, README), test/<slug>-tests.mjs and
// tools/render-<slug>.mjs, all working, then you replace the bar physics with yours.
// Add the instrument to shared/registry.js when it is ready to show.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';

const [slug, Eng, name] = process.argv.slice(2);
if (!slug || !Eng || !name || !/^[a-z][a-z0-9-]*$/.test(slug)) {
  console.error('usage: node tools/new-instrument.mjs <slug> <EngineName> "<Display Name>"');
  process.exit(1);
}
const R = new URL('../', import.meta.url);
if (existsSync(new URL(`${slug}/`, R))) { console.error(`${slug}/ already exists`); process.exit(1); }

const common = (s) => s
  .replaceAll('TemplateEngine', `${Eng}Engine`)
  .replaceAll('template-', `${slug}-`)
  .replaceAll("id: 'template'", `id: '${slug}'`)
  .replaceAll("SLUG = 'template'", `SLUG = '${slug}'`)
  .replaceAll('data-instrument="template"', `data-instrument="${slug}"`)
  .replaceAll('Template Bars', name);
const write = (rel, text) => { const u = new URL(rel, R); mkdirSync(new URL('./', u), { recursive: true }); writeFileSync(u, text); console.log('  +', rel); };

const T = new URL('docs/template/', R);
for (const f of readdirSync(new URL('src/', T))) {
  write(`${slug}/src/${f.replace('template-', `${slug}-`)}`, common(readFileSync(new URL(`src/${f}`, T), 'utf8')).replaceAll('../../../shared/', '../../shared/'));
}
write(`${slug}/index.html`, common(readFileSync(new URL('index.html', T), 'utf8')).replace(' data-root="../../"', '').replaceAll('"../../', '"../'));
write(`${slug}/style.css`, readFileSync(new URL('style.css', T), 'utf8'));
write(`${slug}/README.md`, common(readFileSync(new URL('README.md', T), 'utf8')).replaceAll('{slug}', slug).replaceAll('{name}', name));
for (const [from, to] of [['test/template-tests.mjs', `test/${slug}-tests.mjs`], ['tools/render-template.mjs', `tools/render-${slug}.mjs`]]) {
  write(to, common(readFileSync(new URL(from, R), 'utf8')).replaceAll('../docs/template/', `../${slug}/`).replaceAll('template', slug));
}
console.log(`\nnext: node test/${slug}-tests.mjs, then open http://localhost:8765/${slug}/`);
