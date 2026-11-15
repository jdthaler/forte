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
// (https), and not in a plugin's window (a frame: the plugin has its own copy). On localhost a copy
// would hide each edit; localStorage 'forte/offline' = 'on' turns it on there (tools/check-offline.mjs).
//
// A new release downloads in the background and waits (sw.js), so no page runs with files from two
// releases. It comes to a page:
//   - on the way to another page of the site;
//   - by itself, with a reload, as soon as nobody is using the page: when it is hidden (another tab
//     or app in front, with nothing touched for ten seconds and no MIDI playing it from there for
//     ten minutes), or fresh (nothing touched since it loaded, or since it came back after half a
//     minute away with nothing played meanwhile); and either way nothing going on: no dialog open,
//     no text typed, and no part of the page busy (each cancels the 'forte-can-reload' event this
//     sends the page while a key is held, its sound still rings, or a song, a tour or a rhythm
//     plays or its card is open);
//   - or when the player presses Reload on the note that says one is ready, shown meanwhile.
// It takes over only when every other page open can reload too (sw.js asks each), so they all
// move together; Reload takes over at once, and a page still in use then says so and reloads as
// soon as it can. A page that reloaded by itself says Forte was updated.
(function () {
  if (!('serviceWorker' in navigator) || !document.currentScript || window.parent !== window) return;
  var sw = new URL('../sw.js', document.currentScript.src).href, on = location.protocol === 'https:';
  try { if (localStorage.getItem('forte/offline') === 'on') on = true; } catch (e) { /* no storage */ }
  if (!on) return;
  var SW = navigator.serviceWorker, reg = null, checked = Date.now();
  var had = SW.controller; // the release this page came from
  var ready = false;       // a new release is downloaded, waiting
  var stale = false;       // a new release took over while this page was in use
  var going = null;        // { to: a page, or null for a reload; auto }, once the new release was asked to take over
  var timer = 0, wait = 0;
  var now = function () { return Date.now(); };
  var hidden = function () { return document.visibilityState === 'hidden'; };

  // ---- is anybody using this page? -------------------------------------------------------------
  var fresh = true, active = 0, hiddenAt = 0, playedHidden = -Infinity;
  var touch = function () {
    fresh = false; active = now();
    if (hidden()) playedHidden = active; // MIDI, from another window
  };
  ['pointerdown', 'keydown', 'wheel', 'touchstart', 'dragenter'].forEach(function (t) { addEventListener(t, touch, { capture: true, passive: true }); });
  document.addEventListener('forte-activity', touch); // a MIDI message (shared/midi.js)
  var busy = function () {
    if (document.querySelector('dialog[open]')) return true;
    var fields = document.querySelectorAll('input, textarea');
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if ((f.tagName === 'TEXTAREA' || f.type === 'text' || f.type === 'search') && f.value !== f.defaultValue) return true;
    }
    var media = document.querySelectorAll('audio, video'); // the front page's demos
    for (var j = 0; j < media.length; j++) if (!media[j].paused) return true;
    return !document.dispatchEvent(new Event('forte-can-reload', { cancelable: true }));
  };
  var idle = function () {
    if (hidden() ? now() - active < 10e3 || now() - playedHidden < 600e3 : !fresh) return false;
    return !busy();
  };

  // ---- the note -------------------------------------------------------------------------------
  var note = null, closed = false;
  var button = function (text, title, cls) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = text; b.title = title;
    if (cls) b.className = cls;
    return b;
  };
  var place = function (el) {
    if (note) note.remove();
    note = el;
    if (!el) { document.documentElement.style.removeProperty('--forte-update-h'); return; }
    el.className = 'forte-update';
    el.setAttribute('role', 'status');
    document.body.append(el);
    // (the page's own toasts move up above it: shared/layout.css)
    document.documentElement.style.setProperty('--forte-update-h', el.offsetHeight + 8 + 'px');
  };
  var show = function () {
    if (closed || !(ready || stale) || !document.body) return;
    var text = stale ? 'Forte was updated in another tab.' : 'A new version of Forte is ready.';
    if (note && note.dataset.text === text) return;
    var el = document.createElement('div'), span = document.createElement('span');
    el.dataset.text = span.textContent = text;
    var reload = button('Reload', stale ? 'Reload this page with the new version' : 'Load the new version now', 'forte-update-go');
    reload.addEventListener('click', function () { if (stale || !(reg && reg.waiting)) location.reload(); else leave(null, true); });
    var later = button('✕', 'Not now: it loads by itself once nobody is using this page', 'forte-update-close');
    later.setAttribute('aria-label', 'Not now');
    later.addEventListener('click', function () { closed = true; place(null); });
    el.append(span, reload, later);
    place(el);
  };
  addEventListener('resize', function () { if (note) document.documentElement.style.setProperty('--forte-update-h', note.offsetHeight + 8 + 'px'); });
  // after a reload of its own: what happened, for a few seconds once the page is in sight
  var updated = false;
  try { updated = sessionStorage.getItem('forte/updated') === '1'; sessionStorage.removeItem('forte/updated'); } catch (e) { /* no storage */ }
  var told = function () {
    if (!updated || hidden() || !document.body || note) return;
    updated = false;
    var el = document.createElement('div'), span = document.createElement('span'), a = document.createElement('a');
    span.textContent = 'Forte has been updated. ';
    a.href = 'https://github.com/jdthaler/forte/blob/live/CHANGELOG.md'; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = 'What’s new';
    span.append(a);
    el.append(span);
    place(el);
    setTimeout(function () { if (note === el) place(null); }, 6000);
  };
  addEventListener('load', told);

  // ---- moving to the new release ---------------------------------------------------------------
  var go = function () {
    if (!going) return;
    var g = going; going = null; clearTimeout(wait);
    if (g.to) { location.href = g.to; return; }
    if (g.auto) try { sessionStorage.setItem('forte/updated', '1'); } catch (e) { /* no storage */ }
    location.reload();
  };
  var refused = function (g) {
    if (going !== g) return; // (Reload came since)
    going = null; clearTimeout(wait);
    if (g.to) location.href = g.to; // on to the next page, with this release
    else show();
  };
  // Asks the waiting release to take over (sw.js), then goes to `to`, or reloads; force: whatever
  // the other pages are doing (Reload).
  var leave = function (to, force) {
    var next = reg && reg.waiting;
    if (!next) return;
    var g = going = { to: to, auto: !to && !force };
    var ch = new MessageChannel();
    ch.port1.onmessage = function (m) { if (!m.data) refused(g); }; // yes: controllerchange goes
    next.postMessage({ type: 'forte-update', force: !!force }, [ch.port2]);
    clearTimeout(wait);
    wait = setTimeout(function () { if (to) go(); else refused(g); }, to ? 1500 : 4000);
  };
  var attempt = function () {
    if (going || !(ready || stale)) return;
    if (ready && !(reg && reg.waiting)) { ready = false; return; }
    if (!idle()) { show(); return; }
    if (stale) { going = { to: null, auto: true }; go(); } else leave(null, false);
  };
  var keepTrying = function () { if (!timer) timer = setInterval(attempt, 15e3); attempt(); };
  SW.addEventListener('controllerchange', function () {
    var was = had; had = SW.controller;
    if (going) { go(); return; }
    if (!was) return; // the first visit: the copy just made took this page over
    ready = false; stale = true; closed = false; // (worth saying again)
    keepTrying();
  });
  // sw.js asks, before a new release takes over, whether this page can reload now
  SW.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'forte-idle' && e.ports[0]) e.ports[0].postMessage(!!going || idle());
  });
  if (SW.startMessages) SW.startMessages();

  // ---- finding a new release -------------------------------------------------------------------
  var found = function () { if (reg && reg.waiting && reg.active) { ready = true; keepTrying(); } };
  var watch = function (w) { w.addEventListener('statechange', function () { if (w.state === 'installed') found(); }); };
  addEventListener('load', function () {
    SW.register(sw).then(function (r) {
      reg = r;
      if (r.installing) watch(r.installing);
      r.addEventListener('updatefound', function () { if (r.installing) watch(r.installing); });
      found();
    }, function () {});
  });
  // A home-screen app can stay open for days: look again when it comes back after an hour, every
  // hour it stays in sight, and when the network comes back.
  var check = function () {
    if (!reg || hidden() || now() - checked < 3600e3) return;
    checked = now();
    reg.update().catch(function () {});
  };
  setInterval(check, 600e3);
  addEventListener('online', check);
  document.addEventListener('visibilitychange', function () {
    if (hidden()) hiddenAt = now();
    else {
      if (hiddenAt && now() - hiddenAt > 30e3 && active < hiddenAt) fresh = true; // as good as just loaded
      check();
      told();
    }
    attempt();
  });
  // On the way to the next page of the site, a new release takes over first.
  document.addEventListener('click', function (e) {
    if (!(reg && reg.waiting) || going || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    var to = new URL(a.href, location.href);
    if (to.href.indexOf(reg.scope) !== 0 || (to.pathname === location.pathname && to.search === location.search)) return;
    e.preventDefault();
    leave(to.href, false);
  });
})();
