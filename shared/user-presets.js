// user-presets.js — your own presets on every instrument page, in the Presets menu beside the
// factory ones (shared/layout.js puts that menu in the keyboard bar, or first above the keys on a
// phone):
//   Your presets               the ones saved in this browser: pick one to play it
//   Save these settings…       names them and saves them in this browser
//   Copy a link to these settings
//                              a link that opens the page with them (shared/presets.js)
//   Your presets and files…    the list (play, link, save to a file, delete), and opening a
//                              preset file, which the plugins' Presets menu reads and writes too
// Opening a link made that way applies its settings and takes them off the address.
//
//   attachPresets({ instrument: INSTRUMENT, get: () => P, set: (values) => …, toast })
// get gives the page's parameters (for the organ, P with its console); values() turns them into
// the preset's by contract id. set takes every parameter's value by contract id and applies them
// as choosing a preset would. toast is the page's.

import { presetParams, presetFile, readPresetFile, linkHash, readLinkHash, complete, cleanName } from './presets.js';
import { byId, INSTRUMENTS } from './registry.js';
import { sheet, show } from './notes.js';

const NAMES = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i.name]));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fileName = (s) => `${s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim() || 'Forte preset'}.json`;
const USER = '__user:';

export function attachPresets({ instrument: I, get, set, values = (P) => P, toast = () => {} }) {
  const sel = document.querySelector('#preset');
  if (!sel) return null;
  const params = presetParams(I);
  const reg = byId(I.id);
  const name = reg?.name ?? I.name ?? I.id;
  const STORE = `forte/${I.id}/presets/v1`;
  const now = () => complete(params, values(get()));

  // ---- this browser's presets ----------------------------------------------------------------
  const load = () => {
    let s = [];
    try { s = JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { /* corrupt */ }
    return (Array.isArray(s) ? s : [])
      .filter((pr) => pr && typeof pr.name === 'string' && pr.values && typeof pr.values === 'object')
      .map((pr) => ({ name: cleanName(pr.name) || 'Preset', values: complete(params, pr.values) }));
  };
  let mine = load();
  const store = () => {
    try { localStorage.setItem(STORE, JSON.stringify(mine)); return true; } catch { toast('This browser won’t keep presets (its storage is off or full).'); return false; }
  };
  const find = (n) => mine.findIndex((pr) => pr.name.toLowerCase() === n.toLowerCase());

  // ---- the menu ----------------------------------------------------------------------------------
  const group = (label) => { const g = document.createElement('optgroup'); g.label = label; return g; };
  const yours = group('Your presets'), actions = group('Save and share');
  actions.append(new Option('Save these settings…', '__save'), new Option('Copy a link to these settings', '__link'), new Option('Your presets and files…', '__mine'));
  sel.append(actions);
  function menu() { // "Your presets" only while there are some (an empty group still shows its name)
    const v = sel.value;
    yours.replaceChildren(...mine.map((pr, i) => new Option(pr.name, USER + i)));
    if (mine.length) sel.insertBefore(yours, actions); else yours.remove();
    sel.value = [...sel.options].some((o) => o.value === v) ? v : '';
  }
  menu();
  // the menu's value before a pick, so an action leaves it as it was (a page empties it when a
  // parameter moves, so it names a preset only while the sound is that preset's)
  let before = sel.value;
  const note = () => { if (!sel.value.startsWith('__')) before = sel.value; };
  for (const ev of ['focus', 'pointerdown', 'keydown', 'change']) sel.addEventListener(ev, note);
  // the name of the preset playing now, if the sound is still a preset's
  const current = () => {
    const o = [...sel.options].find((x) => x.value === before);
    return before === '' || before === '__default' || !o ? '' : o.text;
  };

  // Before the page's own listener and layout.js's: these choices are not factory presets.
  document.addEventListener('change', (e) => {
    if (e.target !== sel || !sel.value.startsWith('__') || sel.value === '__default') return;
    e.stopImmediatePropagation();
    const v = sel.value;
    sel.blur();
    if (v.startsWith(USER)) { play(mine[+v.slice(USER.length)]); return; }
    sel.value = before;
    if (v === '__save') openSheet({ save: true });
    else if (v === '__link') copyLink(now(), current());
    else if (v === '__mine') openSheet({});
  }, true);

  function play(pr, shown = true) {
    if (!pr) return;
    set(complete(params, pr.values));
    const k = mine.indexOf(pr);
    sel.value = shown && k >= 0 ? USER + k : '';
    before = sel.value;
  }

  // ---- links ---------------------------------------------------------------------------------------
  const link = (vals, n) => `${location.origin}${location.pathname}${linkHash(params, vals, n)}`;
  async function copyLink(vals, n) {
    const url = link(vals, n);
    try {
      await navigator.clipboard.writeText(url);
      toast(`Link copied. It opens the ${name} with ${n ? `“${n}”` : 'these settings'}.`);
    } catch { openSheet({ url }); } // no clipboard (or no permission): show it to copy by hand
  }
  function fromLink() {
    const got = readLinkHash(location.hash, params);
    if (!got) return;
    history.replaceState(null, '', location.pathname + location.search);
    set(got.values);
    sel.value = ''; before = '';
    toast(`Playing ${got.name ? `“${got.name}”` : 'the settings from the link'}. To keep them, save them from the Presets menu.`);
  }
  window.addEventListener('hashchange', fromLink);
  setTimeout(fromLink); // once the page has finished setting itself up

  // ---- files -------------------------------------------------------------------------------------
  function download(presets, file) {
    const blob = new Blob([presetFile(I, reg?.version, presets)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fileName(file);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  // a file's presets join yours (a name already taken gets a number); one alone plays at once
  async function open(file) {
    const { presets, warning } = readPresetFile(await file.text(), I, NAMES);
    let added = 0, first = null;
    for (const pr of presets) {
      const same = mine.find((m) => m.name.toLowerCase() === pr.name.toLowerCase());
      if (same && JSON.stringify(same.values) === JSON.stringify(pr.values)) { first ??= same; continue; }
      let n = pr.name;
      for (let k = 2; find(n) >= 0; k++) n = `${pr.name} ${k}`;
      const entry = { name: n, values: pr.values };
      mine.push(entry); added++; first ??= entry;
    }
    store(); menu();
    return { presets, added, first, warning };
  }

  // ---- the sheet: save, your presets, files and a link ---------------------------------------------
  let d = null, msg = null;
  function build() {
    d = sheet('Presets', 'forte-presets-title', null, 'forte-sheet');
    d.querySelector('#forte-presets-title').textContent = name;
    const body = d.querySelector('.forte-notes-body');
    body.innerHTML = `<section class="forte-mypresets">
      <form class="forte-mypresets-save">
        <label for="forte-preset-name">Save these settings as</label>
        <div class="forte-mypresets-row"><input id="forte-preset-name" type="text" maxlength="80" autocomplete="off" enterkeyhint="done" placeholder="A name"><button type="submit">Save</button></div>
      </form>
      <p class="forte-mypresets-msg" role="status"></p>
      <div class="forte-mypresets-link" hidden>
        <label for="forte-preset-link">A link to these settings</label>
        <div class="forte-mypresets-row"><input id="forte-preset-link" type="text" readonly><button type="button" data-act="copy">Copy</button><button type="button" data-act="share" hidden>Share…</button></div>
      </div>
      <h3>Your presets</h3>
      <ul class="forte-mypresets-list"></ul>
      <div class="forte-mypresets-files">
        <button type="button" data-act="open">Open a preset file…</button>
        <button type="button" data-act="all">Save all to a file</button>
        <input type="file" accept=".json,application/json" hidden>
      </div>
      <p class="forte-plugin-more">Your presets stay in this browser. Save them to a file to keep them safe or to move them to another browser. The plugins and the Forte app open the same files: put one in their presets folder (their Presets menu opens it).</p>
    </section>`;
    msg = body.querySelector('.forte-mypresets-msg');
    const input = body.querySelector('#forte-preset-name'), picker = body.querySelector('input[type=file]');
    body.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const n = cleanName(input.value);
      if (!n) { say('Give the preset a name.'); input.focus(); return; }
      let k = find(n);
      if (k >= 0 && !confirm(`Replace your preset “${mine[k].name}”?`)) return;
      const entry = { name: n, values: now() };
      if (k >= 0) mine[k] = entry; else { mine.push(entry); k = mine.length - 1; }
      if (!store()) return;
      menu();
      sel.value = USER + k; before = sel.value;
      d.close();
      toast(`Saved “${n}” in this browser.`);
    });
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const act = b.dataset.act, k = +b.closest('li')?.dataset.k;
      if (act === 'play') { play(mine[k]); d.close(); }
      else if (act === 'link') showLink(link(mine[k].values, mine[k].name));
      else if (act === 'file') download([mine[k]], `${name} - ${mine[k].name}`);
      else if (act === 'delete') {
        if (!confirm(`Delete your preset “${mine[k].name}”?`)) return;
        const wasShown = sel.value === USER + k;
        mine.splice(k, 1); store(); menu(); list();
        if (wasShown) { sel.value = ''; before = ''; }
      } else if (act === 'open') picker.click();
      else if (act === 'all') { if (mine.length) download(mine, `${name} presets`); else say('There are no presets of yours to save yet.'); }
      else if (act === 'copy') {
        const f = body.querySelector('#forte-preset-link');
        try { await navigator.clipboard.writeText(f.value); say('Link copied.'); } catch { f.select(); say('Copy the link from the box.'); }
      } else if (act === 'share') navigator.share?.({ title: name, url: body.querySelector('#forte-preset-link').value }).catch(() => {});
    });
    picker.addEventListener('change', async () => {
      const f = picker.files?.[0];
      picker.value = '';
      if (!f) return;
      try {
        const r = await open(f);
        list();
        if (r.presets.length === 1) { play(r.first); d.close(); toast(`Playing “${r.first.name}”${r.added ? ', now one of your presets' : ''}.`); return; }
        say(`${r.added ? `Added ${r.added} of the file’s ${r.presets.length} presets.` : 'You have every preset in that file already.'}${r.warning ? ` ${r.warning}` : ''}`);
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
  function list() {
    const ul = d.querySelector('.forte-mypresets-list');
    ul.innerHTML = mine.length
      ? mine.map((pr, k) => `<li data-k="${k}"><button type="button" class="forte-mypresets-name" data-act="play" title="Play it">${esc(pr.name)}</button>
          <span class="forte-mypresets-acts"><button type="button" data-act="link" title="A link to it">Link</button><button type="button" data-act="file" title="Save it to a file">File</button><button type="button" data-act="delete" title="Delete it">Delete</button></span></li>`).join('')
      : '<li class="forte-mypresets-none">None yet. Set the controls the way you like, then save them above.</li>';
  }
  function openSheet({ save = false, url = '' }) {
    if (!d) build();
    say('');
    d.querySelector('.forte-mypresets-link').hidden = true;
    if (url) showLink(url);
    list();
    const input = d.querySelector('#forte-preset-name');
    input.value = current();
    show(d, null);
    if (save) { input.focus(); input.select(); }
  }

  return { params, open: openSheet, copyLink };
}
