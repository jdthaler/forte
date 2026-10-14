// Run every test/*-tests.mjs in parallel and report all failures (npm test).
// Usage: node tools/test-all.mjs [filter]    e.g. node tools/test-all.mjs gongs

import { readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';

const dir = new URL('../test/', import.meta.url);
const filter = process.argv[2] || '';
const files = readdirSync(dir).filter((f) => f.endsWith('-tests.mjs') && f.includes(filter)).sort();
const width = Math.max(1, Math.min(files.length, availableParallelism()));
const results = new Map();
const t0 = performance.now();

function run(file) {
  return new Promise((resolve) => {
    const start = performance.now();
    const child = spawn(process.execPath, [new URL(file, dir).pathname], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ file, code, out, s: (performance.now() - start) / 1000 }));
  });
}

const queue = [...files];
await Promise.all(Array.from({ length: width }, async () => {
  while (queue.length) { const f = queue.shift(); results.set(f, await run(f)); }
}));

let failed = 0;
for (const f of files) {
  const r = results.get(f);
  const ok = r.code === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${f.padEnd(26)} ${r.s.toFixed(1).padStart(5)} s`);
  if (!ok) console.log(r.out.split('\n').filter((l) => /FAIL|Error|error|failed|FAILED|at /.test(l)).slice(0, 30).map((l) => `      ${l}`).join('\n'));
}
console.log(`\n${files.length - failed}/${files.length} suites passed in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
