// landing.js — instrument cards from the registry, demo playback, and a
// background of standing waves (a string's normal modes, slowly beating).

import { INSTRUMENTS, SECTIONS, FORTE_VERSION } from './shared/registry.js';

const main = document.querySelector('#instruments');
const player = document.querySelector('#player');
let examples = {};
let playing = null;

function render() {
  main.replaceChildren();
  for (const sec of SECTIONS) {
    const head = document.createElement('div');
    head.className = 'section-head';
    head.innerHTML = `<h2>${sec.title}</h2><p>${sec.blurb}</p>`;
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const inst of INSTRUMENTS.filter((i) => i.section === sec.id)) {
      const card = document.createElement('article');
      card.className = `card${inst.ready ? ' ready' : ''}`;
      card.style.setProperty('--c', inst.accent);
      const demo = (examples[inst.id] || [])[0];
      const title = inst.ready ? `<a href="${inst.id}/">${inst.name}</a>` : inst.name;
      card.innerHTML = `
        <h3>${title}${inst.version ? `<span class="ver">v${inst.version}</span>` : ''}</h3>
        ${inst.after ? `<div class="after">after ${inst.after}</div>` : ''}
        <p>${inst.tagline}</p>
        <div class="tags">${inst.physics}</div>
        <div class="actions">
          ${inst.ready ? `<a class="play" href="${inst.id}/">Play →</a>` : '<span class="soon">In the workshop</span>'}
          ${demo ? `<button type="button" data-src="examples/${inst.id}/${demo.file}" title="${demo.title}">▶ Listen</button>` : ''}
        </div>`;
      grid.appendChild(card);
    }
    main.append(head, grid);
  }
  for (const b of main.querySelectorAll('button[data-src]')) {
    b.addEventListener('click', () => {
      if (playing === b) { player.pause(); return; }
      if (playing) { playing.classList.remove('on'); playing.textContent = '▶ Listen'; }
      player.src = b.dataset.src;
      player.play().catch(() => {});
      playing = b;
      b.classList.add('on'); b.textContent = '■ Stop';
    });
  }
}
player.addEventListener('pause', () => { if (playing) { playing.classList.remove('on'); playing.textContent = '▶ Listen'; playing = null; } });
player.addEventListener('ended', () => player.dispatchEvent(new Event('pause')));

document.querySelector('#forte-version').textContent = FORTE_VERSION;
render();
fetch('examples/index.json').then((r) => (r.ok ? r.json() : {})).then((j) => { examples = j; render(); }).catch(() => {});

// --- background: the first few modes of a plucked string, drifting ---------
const cv = document.querySelector('#modes');
const ctx = cv.getContext('2d');
const colors = INSTRUMENTS.map((i) => i.accent);
function frame(t) {
  const dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
  if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = r.width, h = r.height;
  ctx.clearRect(0, 0, w, h);
  const s = t / 1000;
  for (let n = 1; n <= 7; n++) {
    const amp = (h * 0.16) / n ** 0.8;
    const y0 = h * (0.18 + 0.09 * n);
    ctx.strokeStyle = colors[(n * 3) % colors.length];
    ctx.globalAlpha = 0.16 + 0.05 * Math.sin(s * 0.3 + n);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const u = x / w;
      // standing wave n with a little stiffness-like stretch and slow beating
      const y = y0 + amp * Math.sin(Math.PI * n * u) * Math.cos(s * (0.6 + 0.15 * n * Math.sqrt(1 + 0.02 * n * n)));
      if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  requestAnimationFrame(frame);
}
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(frame);
