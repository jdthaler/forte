// nav.js — the Forte header on every instrument page: a link home and an
// instrument switcher built from the registry.
//
// Usage on an instrument page:
//   <body data-instrument="organ">
//   <header> … <nav data-forte-nav></nav> … </header>
//   <script type="module" src="../shared/nav.js"></script>

import { INSTRUMENTS, SECTIONS } from './registry.js';

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
  det.appendChild(menu);
  slot.replaceChildren(home, det);
  // close the menu when clicking elsewhere or pressing Escape
  document.addEventListener('click', (e) => { if (!det.contains(e.target)) det.open = false; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') det.open = false; });
}
