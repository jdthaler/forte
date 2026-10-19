// tuning-ui.js — the pages' Scala files (shared/tuning.js reads them): under the Temperament
// control, a button that opens a .scl file and makes the custom temperament its scale, on the
// temperament root as it is. shared/user-presets.js attaches it, with the presets, on every page
// that has them; a page without calls attachScala itself.
//
//   attachScala({ set: (values) => …, toast })   set takes the parameters a Scala file sets, by id

import { readScala, scalaValues } from './tuning.js';

export function attachScala({ set, toast = () => {} }) {
  const wrap = document.querySelector('#p-temperament')?.closest('.param');
  if (!wrap || document.querySelector('#scala-load')) return null;
  const box = document.createElement('div');
  box.className = 'param scala';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'scala-load'; btn.textContent = 'Load a Scala file (.scl)…';
  btn.title = 'Makes the custom temperament a Scala file’s scale: twelve notes to the octave, built on the temperament root';
  const file = document.createElement('input');
  file.type = 'file'; file.accept = '.scl,text/plain'; file.hidden = true;
  const load = (text, fileName = '') => {
    try {
      const s = readScala(text);
      set(scalaValues(s));
      toast(`Tuned to ${s.name ? `“${s.name}”` : fileName || 'the Scala file'}: the custom temperament is its scale.`);
      return true;
    } catch (e) { toast(e.message); return false; }
  };
  btn.addEventListener('click', () => { file.value = ''; file.click(); btn.blur(); });
  file.addEventListener('change', async () => { const f = file.files?.[0]; if (f) load(await f.text(), f.name); });
  box.append(btn, file);
  wrap.after(box);
  return { load };
}
