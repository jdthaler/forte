// nav.js — the Forte header on every instrument page: a link home and an
// instrument switcher built from the registry. It also brings in the page
// layout (layout.js) and How it works (notes.js), which shows the version.
//
// Usage on an instrument page:
//   <body data-instrument="organ">
//   <header> … <nav data-forte-nav></nav> … </header>
//   <script type="module" src="../shared/nav.js"></script>

import { INSTRUMENTS, SECTIONS, FORTE_VERSION } from './registry.js';
import './layout.js';
import './notes.js';

const here = document.body.dataset.instrument || '';
const root = document.body.dataset.root ?? '../';

for (const slot of document.querySelectorAll('[data-forte-nav]')) {
  const home = document.createElement('a');
  home.className = 'forte-home';
  home.href = root;
  home.textContent = 'Forte';
  home.title = 'All Forte instruments';

  const det = document.createElement('details');
  det.className = 'forte-switch';
  const sum = document.createElement('summary');
  sum.textContent = 'Instruments';
  det.appendChild(sum);
  const menu = document.createElement('div');
  menu.className = 'forte-menu';
  for (const sec of SECTIONS) {
    const h = document.createElement('div');
    h.className = 'forte-menu-sec';
    h.textContent = sec.title;
    menu.appendChild(h);
    for (const inst of INSTRUMENTS.filter((i) => i.section === sec.id)) {
      const a = document.createElement(inst.ready ? 'a' : 'span');
      a.className = `forte-menu-item${inst.id === here ? ' current' : ''}${inst.ready ? '' : ' soon'}`;
      if (inst.ready) a.href = `${root}${inst.id}/`;
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
  slot.replaceChildren(home, det);
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
