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

// Offline: the service worker (sw.js, at the site's root) keeps a copy of the released site, so the
// pages, the home-screen app above all, open and play without a network. Only on the real site
// (https): on localhost a copy would hide each edit; localStorage 'forte/offline' = 'on' turns it
// on there (tools/check-offline.mjs).
(function () {
  if (!('serviceWorker' in navigator) || !document.currentScript) return;
  var sw = new URL('../sw.js', document.currentScript.src).href, on = location.protocol === 'https:';
  try { if (localStorage.getItem('forte/offline') === 'on') on = true; } catch (e) { /* no storage */ }
  if (!on) return;
  var reg = null, checked = Date.now();
  addEventListener('load', function () {
    navigator.serviceWorker.register(sw).then(function (r) { reg = r; }, function () {});
  });
  // A home-screen app can stay open for days: look for a new release when it comes back after an hour.
  document.addEventListener('visibilitychange', function () {
    if (!reg || document.visibilityState !== 'visible' || Date.now() - checked < 3600e3) return;
    checked = Date.now();
    reg.update().catch(function () {});
  });
  // A new release, once downloaded, takes over on the way to the next page of the site (sw.js says
  // when it can), so no page ever runs with files from two releases.
  document.addEventListener('click', function (e) {
    var next = reg && reg.waiting;
    if (!next || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    var to = new URL(a.href, location.href);
    if (to.href.indexOf(reg.scope) !== 0 || (to.pathname === location.pathname && to.search === location.search)) return;
    e.preventDefault();
    var gone = false, go = function () { if (!gone) { gone = true; location.href = to.href; } };
    var ch = new MessageChannel();
    ch.port1.onmessage = function (m) {
      if (!m.data) return go();
      navigator.serviceWorker.addEventListener('controllerchange', go);
    };
    next.postMessage({ type: 'forte-update' }, [ch.port2]);
    setTimeout(go, 1500);
  });
})();
