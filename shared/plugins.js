// plugins.js — where the native plugins are downloaded (docs/PLUGINS.md, step 5): the archives
// of the latest GitHub Release, one per system for every instrument together and one per system
// for each instrument (`plugin.ready` in the registry). The release-plugins workflow publishes
// them; the front page, each instrument's How it works, and tools/plugin-release.mjs link them.

import { INSTRUMENTS } from './registry.js';

export const LATEST = 'https://github.com/jdthaler/forte/releases/latest/download/';
export const INSTALL = 'https://github.com/jdthaler/forte/blob/main/native/INSTALL.md';
export const RELEASES = 'https://github.com/jdthaler/forte/releases';

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
