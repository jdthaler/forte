// Start a new instrument from the template.
// Usage: node tools/new-instrument.mjs <slug> <EngineName> "<Display Name>"
//   e.g. node tools/new-instrument.mjs gongs Gong "Gong Keyboard"
// Creates <slug>/ (page, style, src/<slug>-*.js with its guided tour, README), test/<slug>-tests.mjs,
// tools/render-<slug>.mjs and the native port, native/instruments/<slug>/ (its C++ engine and
// model, generated tables; a VST3 class id in native/ids.json and an AU code in the
// descriptor); then you replace the bar physics with yours, in C++. The page, tests and tools
// play the C++ built as WebAssembly, so build it with Emscripten (native/README.md) before they
// run, and after each change to the C++. Add the instrument to shared/registry.js, with its AU
// code, when it is ready to show.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { INSTRUMENTS, TEMPLATE } from '../shared/registry.js';

const [slug, Eng, name] = process.argv.slice(2);
if (!slug || !Eng || !name || !/^[a-z][a-z0-9-]*$/.test(slug)) {
  console.error('usage: node tools/new-instrument.mjs <slug> <EngineName> "<Display Name>"');
  process.exit(1);
}
const R = new URL('../', import.meta.url);
if (existsSync(new URL(`${slug}/`, R))) { console.error(`${slug}/ already exists`); process.exit(1); }

const cid = slug.replaceAll('-', '_'); // its C++ namespace and function prefix
const common = (s) => s
  .replaceAll('TemplateWasmEngine', `${Eng}WasmEngine`)
  .replaceAll('TemplateEngine', `${Eng}Engine`)
  .replaceAll("id: 'template'", `id: '${slug}'`)
  .replaceAll('wasm/template.wasm', `wasm/${slug}.wasm`)
  .replaceAll('native/instruments/template', `native/instruments/${slug}`)
  .replaceAll('template_', `${cid}_`)
  .replaceAll('template-', `${slug}-`)
  .replaceAll("id: 'template'", `id: '${slug}'`)
  .replaceAll("SLUG = 'template'", `SLUG = '${slug}'`)
  .replaceAll("tour('template'", `tour('${slug}'`)
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
// The native port: the C++ engine and model, its plugin identity, its tables and reference.
const N = new URL('native/instruments/template/', R);
const cpp = (t) => common(t
  .replaceAll('forte::template_', `forte::${cid}`)
  .replaceAll('forte_template', `forte_${cid}`))
  .replaceAll('(template ', `(${slug} `)
  .replaceAll('docs/template/', `${slug}/`)
  .replaceAll('The template (docs/template)', name)
  .replaceAll('the template', `the ${name}`);
for (const f of readdirSync(N).filter((f) => /\.(h|cpp)$|^CMakeLists\.txt$/.test(f))) {
  write(`native/instruments/${slug}/${f.replace('template-', `${slug}-`)}`, cpp(readFileSync(new URL(f, N), 'utf8')));
}
const idsUrl = new URL('native/ids.json', R), ids = JSON.parse(readFileSync(idsUrl, 'utf8'));
ids[slug] = { vst3: randomBytes(16).toString('hex').toUpperCase() }; // never to change once published
writeFileSync(idsUrl, `${JSON.stringify(ids, null, 2).replace(/\{\n\s+("vst3": "[0-9A-F]+")\n\s+\}/g, '{ $1 }')}\n`);
console.log('  + native/ids.json:', slug);
// an AU subtype no one has: four letters of the name
const taken = new Set([...INSTRUMENTS.map((i) => i.plugin?.code), TEMPLATE.plugin.code, 'Smok']);
const letters = name.replace(/[^A-Za-z]/g, '') + 'Xxxx';
let code = letters[0].toUpperCase() + letters.slice(1, 4).toLowerCase();
for (let i = 0; taken.has(code); i++) code = `${code.slice(0, 3)}${'0123456789'[i % 10]}`;
const desc = new URL(`${slug}/src/${slug}-instrument.js`, R);
writeFileSync(desc, readFileSync(desc, 'utf8').replace("  id: '", `  // until it is in shared/registry.js: its plugin's name and AU code (move the code there)\n  plugin: { name: ${JSON.stringify(name)}, code: '${code}' },\n  id: '`));
execFileSync(process.execPath, [new URL('tools/gen-native-params.mjs', R).pathname, slug], { stdio: 'inherit' });
console.log(`\nnext: build its WebAssembly (native/README.md: cmake --preset wasm, then cmake --build --preset wasm),`);
console.log(`then node tools/render-reference.mjs ${slug}, node test/${slug}-tests.mjs, and open http://localhost:8765/${slug}/`);
console.log(`and when it is ready, node tools/make-previews.mjs ${slug} for the picture and tags a shared link shows`);
