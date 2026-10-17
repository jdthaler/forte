// plugins.js — where the native plugins are downloaded (docs/PLUGINS.md, step 5): the archives
// of the latest GitHub Release, one per system for every instrument together and one per system
// for each instrument (`plugin.ready` in the registry). The release-plugins workflow publishes
// them; the front page, each instrument's How it works, and tools/plugin-release.mjs link them.

import { INSTRUMENTS } from './registry.js';

export const LATEST = 'https://github.com/jdthaler/forte/releases/latest/download/';
export const INSTALL = 'https://github.com/jdthaler/forte/blob/main/native/INSTALL.md';
export const RELEASES = 'https://github.com/jdthaler/forte/releases';

// [system, archive suffix, formats]
export const SYSTEMS = [
  ['macOS', 'macos.zip', 'AU · VST3 · CLAP · app'],
  ['Windows', 'windows.zip', 'VST3 · CLAP · app'],
  ['Linux', 'linux.tar.gz', 'VST3 · CLAP · app'],
];

export const withPlugins = () => INSTRUMENTS.filter((i) => i.ready && i.plugin?.ready);

// The archive names: Forte-plugins-<system> holds every instrument, Forte-<id>-<system> one.
export const archive = (id, suffix) => `Forte-${id ?? 'plugins'}-${suffix}`;
export const downloads = (id) => SYSTEMS.map(([name, suffix, formats]) => ({ name, formats, file: archive(id, suffix), url: LATEST + archive(id, suffix) }));
