// credits.js — renders docs/PRIOR_ART.md (the project-wide prior art and credits)
// with the same Markdown renderer as the instruments' How it works notes.

import { renderMarkdown } from '../shared/markdown.js';

const REPO = 'https://github.com/jdthaler/forte/blob/live/';
const text = document.querySelector('#text'), toc = document.querySelector('#toc');
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

fetch('../docs/PRIOR_ART.md')
  .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
  .then((md) => {
    // the chips above the text are the contents, so the document's own list is left out
    const { html, sections } = renderMarkdown(md, { base: `${REPO}docs/`, idPrefix: 'c-', skip: ['Contents'] });
    text.innerHTML = html;
    toc.innerHTML = sections.map((s) => `<a href="#${s.id}">${esc(s.text)}</a>`).join('');
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  })
  .catch(() => {
    text.innerHTML = `<p>The credits could not be loaded here. They are also <a href="${REPO}docs/PRIOR_ART.md">on GitHub</a>.</p>`;
  });
