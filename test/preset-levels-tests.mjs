// No factory preset is nearly silent: at its loudest key it is within PRESET_FLOOR LU of its
// instrument's defaults. Run: node test/preset-levels-tests.mjs   (table: node tools/loudness.mjs presets)

import { measurePresets, PRESET_FLOOR } from '../tools/loudness.mjs';

let failures = 0;
const rows = await measurePresets();
console.log(`every factory preset at its loudest key, against its defaults (floor ${PRESET_FLOOR} LU)`);
for (const r of rows) {
  if (r.lu >= PRESET_FLOOR) continue;
  failures++;
  console.log(`  FAIL ${r.id}: ${r.name}: ${r.lu.toFixed(1)} LU, nearly silent beside the defaults`);
}
console.log(`  ${rows.length - failures} of ${rows.length} presets ok`);
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
