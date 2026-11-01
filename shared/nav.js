// nav.js — the Forte header on every instrument page: the instrument's name is
// also the menu (Forte's home page, and every instrument by kind), built from the
// registry. It also brings in the page layout (layout.js) and How it works
// (notes.js), which shows the version.
//
// Usage on an instrument page:
//   <body data-instrument="organ">
//   <header> <div class="brand"> <nav data-forte-nav></nav> <h1>Name</h1> … </div> … </header>
//   <script type="module" src="../shared/nav.js"></script>
// The <h1> moves into the menu's button.

import { INSTRUMENTS, SECTIONS, FORTE_VERSION } from './registry.js';
import './layout.js';
import './notes.js';

const here = document.body.dataset.instrument || '';
const root = document.body.dataset.root ?? '../';

const title = document.querySelector('body > header h1');
for (const slot of document.querySelectorAll('[data-forte-nav]')) {
  const det = document.createElement('details');
  det.className = 'forte-switch';
  const sum = document.createElement('summary');
  sum.title = 'Forte: every instrument, and the home page';
  sum.innerHTML = '<span class="forte-mark" aria-hidden="true">f</span>';
  if (title) sum.appendChild(title); else sum.append('Forte');
  sum.insertAdjacentHTML('beforeend', '<span class="forte-caret" aria-hidden="true">▾</span>');
  det.appendChild(sum);
  const menu = document.createElement('div');
  menu.className = 'forte-menu';
  const home = document.createElement('a');
  home.className = 'forte-menu-home';
  home.href = root;
  home.innerHTML = '<b>Forte</b><span>All instruments, and about the project</span>';
  menu.appendChild(home);
  for (const sec of SECTIONS) {
    const h = document.createElement('div');
    h.className = 'forte-menu-sec';
    h.textContent = sec.title;
    menu.appendChild(h);
    for (const inst of INSTRUMENTS.filter((i) => i.section === sec.id)) {
      const a = document.createElement(inst.ready ? 'a' : 'span');
      a.className = `forte-menu-item${inst.id === here ? ' current' : ''}${inst.ready ? '' : ' soon'}`;
      if (inst.ready) a.href = `${root}${inst.id}/`;
      if (inst.id === here) a.setAttribute('aria-current', 'page');
      a.style.setProperty('--dot', inst.accent);
      a.innerHTML = `<i></i><b>${inst.name}</b><span>${inst.after ? `after ${inst.after}` : inst.physics}${inst.ready ? '' : ' · in the workshop'}</span>`;
      menu.appendChild(a);
    }
  }
  const credit = document.createElement('div');
  credit.className = 'forte-menu-foot';
  credit.innerHTML = `Forte ${FORTE_VERSION} · Vibe coded by Jesse Thaler · <a href="https://github.com/jdthaler/forte">source</a>`;
  menu.appendChild(credit);
  det.appendChild(menu);
  slot.replaceChildren(det);
  // close the menu when clicking elsewhere or pressing Escape
  document.addEventListener('click', (e) => { if (!det.contains(e.target)) det.open = false; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') det.open = false; });
}

// AudioWorklet only exists on secure pages (https:// or localhost): say so up front.
if (!window.isSecureContext || !window.AudioWorkletNode) {
  const bar = document.createElement('div');
  bar.className = 'forte-warning';
  const https = `https://${location.host}${location.pathname}`;
  bar.innerHTML = window.isSecureContext
    ? 'This browser cannot run Forte’s audio (no AudioWorklet). Please use a current Chrome, Edge, Firefox or Safari.'
    : `Audio needs a secure connection. Open <a href="${https}">${https}</a> instead.`;
  document.body.prepend(bar);
}
