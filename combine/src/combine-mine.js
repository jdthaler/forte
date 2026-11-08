// combine-mine.js — your own combinations on the Combinations page, in its Presets menu after the
// starting ones, as an instrument page's own presets are (shared/user-presets.js):
//   Your combinations             the ones saved in this browser: pick one to play it
//   Save this combination…        names it and saves it in this browser
//   Copy a link to this combination
//                                 a link that opens the page with it (combine-params.js)
//   Your combinations and files…  the list (play, link, save to a file, delete), and opening a
//                                 combinations file, which the Forte app reads and writes too
// Opening a link made that way plays its combination and takes it off the address. A MIDI program
// change counts yours after the starting ones (shared/midi.js choosePreset).
//
//   attachMine({ menu, now, play, paramsOf, versions, toast }) → { shown(name), refresh() }
// now() is the combination playing ({ name, parts }); play(c) plays one; paramsOf(id) gives an
// instrument's parameters (to keep a link short), or null while it is loading; versions() the
// versions a file names. shown(name) sets the menu to your combination of that name, or not.

import { unfocus } from '../../shared/focus.js';
import { sheet, show } from '../../shared/notes.js';
import { byId } from '../../shared/registry.js';
import { MINE, cleanName, combination, combinationsFile, readCombinationsFile, combinationHash, readCombinationHash } from './combine-params.js';

const USER = '__user:';
const ready = (id) => typeof id === 'string' && !!byId(id)?.ready;
const nameOf = (id) => byId(id)?.name ?? id;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fileName = (s) => `${s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim() || 'Forte combinations'}.json`;
export const isMine = (v) => typeof v === 'string' && v.startsWith(USER);

export function attachMine({ menu: sel, now, play, paramsOf, versions, toast }) {
  // ---- this browser's combinations --------------------------------------------------------------
  const load = () => {
    let s = [];
    try { s = JSON.parse(localStorage.getItem(MINE) || '[]'); } catch { /* corrupt */ }
    return (Array.isArray(s) ? s : []).map((c, i) => combination(c, ready, i)).filter(Boolean);
  };
  let mine = load();
  const store = () => {
    try { localStorage.setItem(MINE, JSON.stringify(mine)); return true; } catch { toast('This browser won’t keep combinations (its storage is off or full).'); return false; }
  };
  const find = (n) => mine.findIndex((c) => c.name.toLowerCase() === String(n).toLowerCase());

  // ---- the menu ----------------------------------------------------------------------------------
  const group = (label) => { const g = document.createElement('optgroup'); g.label = label; return g; };
  const yours = group('Your combinations'), actions = group('Save and share');
  actions.append(new Option('Save this combination…', '__save'), new Option('Copy a link to this combination', '__link'), new Option('Your combinations and files…', '__mine'));
  sel.append(actions);
  function refresh() { // "Your combinations" only while there are some (an empty group still shows its name)
    const v = sel.value;
    yours.replaceChildren(...mine.map((c, i) => new Option(c.name, USER + i)));
    if (mine.length) sel.insertBefore(yours, actions); else yours.remove();
    sel.value = [...sel.options].some((o) => o.value === v) ? v : '';
  }
  refresh();
  // the menu's value before a pick, so an action leaves it as it was
  let before = sel.value;
  const note = () => { if (!sel.value.startsWith('__') || isMine(sel.value)) before = sel.value; };
  for (const ev of ['focus', 'pointerdown', 'keydown']) sel.addEventListener(ev, note);
  // Before the page's own listener: these choices are not starting combinations.
  sel.addEventListener('change', (e) => {
    const v = sel.value;
    if (!v.startsWith('__') || v === '__default') return;
    e.stopImmediatePropagation();
    unfocus(sel);
    if (isMine(v)) { playMine(mine[+v.slice(USER.length)]); return; }
    sel.value = before;
    if (v === '__save') openSheet({ save: true });
    else if (v === '__link') copyLink(now());
    else if (v === '__mine') openSheet({});
  });

  function playMine(c) {
    if (!c) return;
    play(structuredClone(c));
    const k = mine.indexOf(c);
    sel.value = k >= 0 ? USER + k : '';
    before = sel.value;
  }
  // the menu names your combination of this name, or (null) none of yours
  function shown(n) {
    const k = n === null ? -1 : find(n);
    if (k >= 0) sel.value = USER + k;
    else if (isMine(sel.value)) sel.value = '';
    before = sel.value;
  }

  // ---- links ---------------------------------------------------------------------------------------
  const link = (c) => `${location.origin}${location.pathname}${combinationHash(c, paramsOf)}`;
  async function copyLink(c) {
    const url = link(c);
    try {
      await navigator.clipboard.writeText(url);
      toast(`Link copied. It opens Combinations with ${c.name ? `“${c.name}”` : 'these instruments'}.`);
    } catch { openSheet({ url }); } // no clipboard (or no permission): show it to copy by hand
  }
  function fromLink() {
    if (!/^#_c=/.test(location.hash)) return;
    const c = readCombinationHash(location.hash, ready);
    history.replaceState(null, '', location.pathname + location.search);
    if (!c) { toast('That link’s combination has no instruments this site has.'); return; }
    play(c);
    sel.value = ''; before = '';
    toast(`Playing ${c.name && !/^Combination \d+$/.test(c.name) ? `“${c.name}”` : 'the combination from the link'}. To keep it, save it from the Presets menu.`);
  }
  window.addEventListener('hashchange', fromLink);
  setTimeout(fromLink); // once the page has finished setting itself up

  // ---- files -------------------------------------------------------------------------------------
  function download(list, file) {
    const blob = new Blob([combinationsFile(list, versions())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fileName(file);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  // a file's combinations join yours (a name already taken gets a number); one alone plays at once
  async function open(file) {
    const { combinations, warning } = readCombinationsFile(await file.text(), ready, nameOf);
    let added = 0, first = null;
    for (const c of combinations) {
      const same = mine.find((m) => m.name.toLowerCase() === c.name.toLowerCase());
      if (same && JSON.stringify(same.parts) === JSON.stringify(c.parts)) { first ??= same; continue; }
      let n = c.name;
      for (let k = 2; find(n) >= 0; k++) n = `${c.name} ${k}`;
      const entry = { ...c, name: n };
      mine.push(entry); added++; first ??= entry;
    }
    store(); refresh();
    return { combinations, added, first, warning };
  }

  // ---- the sheet: save, your combinations, files and a link --------------------------------------------
  let d = null, msg = null;
  function build() {
    d = sheet('Presets', 'forte-combinations-title', null, 'forte-sheet');
    d.querySelector('#forte-combinations-title').textContent = 'Your combinations';
    const body = d.querySelector('.forte-notes-body');
    body.innerHTML = `<section class="forte-mypresets">
      <form class="forte-mypresets-save">
        <label for="forte-combination-name">Save this combination as</label>
        <div class="forte-mypresets-row"><input id="forte-combination-name" type="text" maxlength="80" autocomplete="off" enterkeyhint="done" placeholder="A name"><button type="submit">Save</button></div>
      </form>
      <p class="forte-mypresets-msg" role="status"></p>
      <div class="forte-mypresets-link" hidden>
        <label for="forte-combination-link">A link to this combination</label>
        <div class="forte-mypresets-row"><input id="forte-combination-link" type="text" readonly><button type="button" data-act="copy">Copy</button><button type="button" data-act="share" hidden>Share…</button></div>
      </div>
      <h3>Your combinations</h3>
      <ul class="forte-mypresets-list"></ul>
      <div class="forte-mypresets-files">
        <button type="button" data-act="open">Open a combinations file…</button>
        <button type="button" data-act="all">Save all to a file</button>
        <input type="file" accept=".json,application/json" hidden>
      </div>
      <p class="forte-plugin-more">A combination keeps its instruments, each one’s keys, octave, level and settings. Yours stay in this browser: save them to a file to keep them safe or to move them to another browser. The Forte app opens the same files: put one in its Combinations folder (its combinations menu, beside +, opens that folder).</p>
    </section>`;
    msg = body.querySelector('.forte-mypresets-msg');
    const input = body.querySelector('#forte-combination-name'), picker = body.querySelector('input[type=file]');
    body.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const n = cleanName(input.value);
      if (!n) { say('Give the combination a name.'); input.focus(); return; }
      const c = combination({ ...now(), name: n }, ready);
      if (!c) { say('There are no instruments to save: add one first.'); return; }
      let k = find(n);
      if (k >= 0 && !confirm(`Replace your combination “${mine[k].name}”?`)) return;
      if (k >= 0) mine[k] = c; else { mine.push(c); k = mine.length - 1; }
      if (!store()) return;
      refresh();
      sel.value = USER + k; before = sel.value;
      d.close();
      toast(`Saved “${n}” in this browser.`);
      sel.dispatchEvent(new CustomEvent('forte-saved', { detail: n })); // the page: it is now this one
    });
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const act = b.dataset.act, k = +b.closest('li')?.dataset.k;
      if (act === 'play') { playMine(mine[k]); d.close(); }
      else if (act === 'link') showLink(link(mine[k]));
      else if (act === 'file') download([mine[k]], `Combination - ${mine[k].name}`);
      else if (act === 'delete') {
        if (!confirm(`Delete your combination “${mine[k].name}”?`)) return;
        const wasShown = sel.value === USER + k;
        mine.splice(k, 1); store(); refresh(); list();
        if (wasShown) { sel.value = ''; before = ''; }
      } else if (act === 'open') picker.click();
      else if (act === 'all') { if (mine.length) download(mine, 'Forte combinations'); else say('There are no combinations of yours to save yet.'); }
      else if (act === 'copy') {
        const f = body.querySelector('#forte-combination-link');
        try { await navigator.clipboard.writeText(f.value); say('Link copied.'); } catch { f.select(); say('Copy the link from the box.'); }
      } else if (act === 'share') navigator.share?.({ title: 'Forte combination', url: body.querySelector('#forte-combination-link').value }).catch(() => {});
    });
    picker.addEventListener('change', async () => {
      const f = picker.files?.[0];
      picker.value = '';
      if (!f) return;
      try {
        const r = await open(f);
        list();
        if (r.combinations.length === 1) { playMine(r.first); d.close(); toast(`Playing “${r.first.name}”${r.added ? ', now one of your combinations' : ''}.${r.warning ? ` ${r.warning}` : ''}`); return; }
        say(`${r.added ? `Added ${r.added} of the file’s ${r.combinations.length} combinations.` : 'You have every combination in that file already.'}${r.warning ? ` ${r.warning}` : ''}`);
      } catch (err) { say(err.message); }
    });
  }
  function say(t) { msg.textContent = t; }
  function showLink(url) {
    const box = d.querySelector('.forte-mypresets-link');
    box.hidden = false;
    box.querySelector('input').value = url;
    box.querySelector('[data-act=share]').hidden = !navigator.share;
  }
  const what = (c) => c.parts.map((p) => nameOf(p.id)).join(' + ');
  function list() {
    const ul = d.querySelector('.forte-mypresets-list');
    ul.innerHTML = mine.length
      ? mine.map((c, k) => `<li data-k="${k}"><button type="button" class="forte-mypresets-name" data-act="play" title="Play it: ${esc(what(c))}">${esc(c.name)}</button>
          <span class="forte-mypresets-acts"><button type="button" data-act="link" title="A link to it">Link</button><button type="button" data-act="file" title="Save it to a file">File</button><button type="button" data-act="delete" title="Delete it">Delete</button></span></li>`).join('')
      : '<li class="forte-mypresets-none">None yet. Put the instruments together the way you like, then save them above.</li>';
  }
  function openSheet({ save = false, url = '' }) {
    if (!d) build();
    say('');
    d.querySelector('.forte-mypresets-link').hidden = true;
    if (url) showLink(url);
    list();
    const input = d.querySelector('#forte-combination-name');
    input.value = now().name ?? '';
    show(d, null);
    if (save) { input.focus(); input.select(); }
  }

  return { shown, refresh };
}
