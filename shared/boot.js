// boot.js — a classic (non-module) script loaded first on every page.
// GitHub Pages lets browsers cache files for 10 minutes, so right after an update a
// returning visitor can get new and old modules mixed together; a module then fails to
// link and the page never starts. Say so, and offer a reload that first refreshes every
// file the page loaded (a plain reload would reuse the stale cached copies).
(function () {
  var shown = false;
  addEventListener('error', function (e) {
    if (shown || !/export|import|module/i.test(String(e.message))) return;
    shown = true;
    var show = function () {
      var bar = document.createElement('div');
      bar.className = 'forte-warning';
      bar.textContent = 'Forte was updated a moment ago and this page loaded a mix of old and new files. ';
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Reload';
      b.onclick = function () {
        var urls = performance.getEntriesByType('resource').map(function (r) { return r.name; }).filter(function (u) { return u.indexOf(location.origin) === 0; });
        Promise.all(urls.map(function (u) { return fetch(u, { cache: 'reload' }).catch(function () {}); })).then(function () { location.reload(); });
      };
      bar.appendChild(b);
      document.body.prepend(bar);
    };
    if (document.body) show(); else addEventListener('DOMContentLoaded', show);
  });
})();
