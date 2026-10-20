// plugins.js — where the native plugins are downloaded (docs/PLUGINS.md, step 5): the archives
// of the latest GitHub Release, one per system for every instrument together and one per system
// for each instrument (`plugin.ready` in the registry). The release-plugins workflow publishes
// them; the front page, each instrument's How it works, and tools/plugin-release.mjs link them.
// The site goes live before the plugins finish building (CLAUDE.md), so the downloads also say
// which release they are and which instruments it holds (latestRelease, releaseLine).

import { INSTRUMENTS, FORTE_VERSION } from './registry.js';

export const LATEST = 'https://github.com/jdthaler/forte/releases/latest/download/';
export const INSTALL = 'https://github.com/jdthaler/forte/blob/live/native/INSTALL.md';
export const RELEASES = 'https://github.com/jdthaler/forte/releases';
const API = 'https://api.github.com/repos/jdthaler/forte/releases/latest';

// the formats, by the names the archives (and the downloads' Makefile) use
export const FORMATS = { au: 'AU', vst3: 'VST3', clap: 'CLAP', app: 'app' };

// [system, archive suffix, formats]
export const SYSTEMS = [
  ['macOS', 'macos.zip', ['au', 'vst3', 'clap', 'app']],
  ['Windows', 'windows.zip', ['vst3', 'clap', 'app']],
  ['Linux', 'linux.tar.gz', ['vst3', 'clap', 'app']],
];

export const withPlugins = () => INSTRUMENTS.filter((i) => i.ready && i.plugin?.ready);

// The archive names: Forte-plugins-<system> holds every instrument, Forte-<id>-<system> one,
// each in every format; Forte-<id>-<format>-<system> (and Forte-plugins-<format>-<system>) in one.
// Forte-app-<system> holds just the Forte app, every instrument in one standalone.
export const archive = (id, suffix, format) => `Forte-${id ?? 'plugins'}-${format ? `${format}-` : ''}${suffix}`;
export const APP = 'app'; // archive(APP, suffix): the Forte app alone
export const downloads = (id) => SYSTEMS.map(([name, suffix, formats]) => ({
  name, formats: formats.map((f) => FORMATS[f]).join(' · '), file: archive(id, suffix), url: LATEST + archive(id, suffix),
  each: formats.map((f) => ({ format: f, name: FORMATS[f], file: archive(id, suffix, f), url: LATEST + archive(id, suffix, f) })),
  app: id ? null : { file: archive(APP, suffix), url: LATEST + archive(APP, suffix) },
}));
// The downloads for an instrument (or, with no id, every instrument): a box per system with
// "All | AU · VST3 · CLAP · app", All being the archive with every format; with every
// instrument, also "| Forte app", the one app with all of them and nothing else.
export const downloadLinks = (id) => downloads(id).map((d) => `<div class="button forte-plugin-sys">${d.name}<span>
  <a href="${d.url}" title="${d.name}: every format">All</a><i>|</i>${d.each.map((e) => `<a href="${e.url}" title="${d.name}: just the ${e.format === 'app' ? 'standalone app' : `${e.name} plugin`}">${e.name}</a>`).join('<i>·</i>')}${d.app ? `<i>|</i><a href="${d.app.url}" title="${d.name}: just the Forte app, every instrument in one">Forte app</a>` : ''}
</span></div>`).join('');

// What a plugin release holds, from its notes (tools/plugin-release.mjs): the Forte version it was
// built with, and each instrument's version from its table, by id.
export function parseRelease({ tag_name: tag, html_url: url, body = '' }) {
  const versions = {};
  for (const m of body.matchAll(/^\| \[[^\]]*\]\(https:\/\/forte\.jthaler\.net\/([\w-]+)\/\) \| ([^ |]+) \|/gm)) versions[m[1]] = m[2];
  return { tag, url, forte: body.match(/\(Forte ([\w.-]+)\)/)?.[1] ?? null, versions };
}

// The latest plugin release, asked of GitHub once a visit (kept ten minutes in the tab); null
// when it can't be had (offline, GitHub's limit), and the downloads then just say nothing more.
const KEY = 'forte/plugin-release';
let asked = null;
export function latestRelease() {
  return (asked ??= (async () => {
    try {
      const kept = JSON.parse(sessionStorage.getItem(KEY));
      if (kept && Date.now() - kept.at < 600e3) return kept.release;
    } catch { /* no storage */ }
    const r = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const release = parseRelease(await r.json());
    try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), release })); } catch { /* no storage */ }
    return release;
  })().catch(() => (asked = null)));
}

// The line under the downloads saying what they are. For an instrument: its version in the
// release, or that its plugin (or this version of it) is still to come, in the plugin release
// that follows the site's; with no instrument, the release's Forte version, and whether the
// site is newer. `ok` is false when the instrument has no download in that release yet.
const NEXT = 'the next plugin release, which follows the site';
export function releaseLine(rel, inst) {
  const link = `<a href="${rel.url}" target="_blank" rel="noopener">${rel.tag}</a>`;
  if (inst) {
    const v = rel.versions[inst.id];
    if (!v) return { ok: false, html: `No plugin of the ${inst.name} yet: it comes in ${NEXT}. The latest is ${link}.` };
    return { ok: true, html: v === inst.version
      ? `The ${inst.name} ${v}, from ${link}.`
      : `The ${inst.name} ${v}, from ${link}. This page is ${inst.version}, whose plugin comes in ${NEXT}.` };
  }
  if (!rel.forte || rel.forte === FORTE_VERSION) return { ok: true, html: `${rel.forte ? `Forte ${rel.forte}'s plugins` : 'The plugins'}, from ${link}.` };
  return { ok: true, html: `Forte ${rel.forte}'s plugins, from ${link}. The site is Forte ${FORTE_VERSION}, whose plugins come in ${NEXT}.` };
}
