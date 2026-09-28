'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { safeFile, atomicJSON } = require('./files.cjs');
const AUDIO = new Set(['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aif', '.aiff']);
const emptyCatalog = () => ({ packs: [], samples: [], kits: [] });

function category(name) {
  const text = name.toLowerCase();
  for (const [label, pattern] of [
    ['808', /808|sub.?bass/],
    ['Kick', /kick|\bbd\b/],
    ['Snare', /snare|\bsd\b/],
    ['Clap', /clap/],
    ['Open hat', /open.?hat|\boh\b/],
    ['Hi-hat', /hi.?hat|hat|\bhh\b/],
    ['Percussion', /perc|tom|rim|shaker|cowbell/],
    ['Bass', /bass/],
    ['FX', /fx|riser|impact|sweep/],
    ['Loop', /loop/]
  ])
    if (pattern.test(text)) return label;
  return 'Sample';
}
function wavDuration(buffer) {
  if (
    buffer.length < 12 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE'
  )
    return 0;
  let rate = 0,
    bytes = 0;
  for (let pos = 12; pos + 8 <= buffer.length;) {
    const id = buffer.toString('ascii', pos, pos + 4),
      size = buffer.readUInt32LE(pos + 4);
    if (id === 'fmt ' && size >= 16 && pos + 24 <= buffer.length)
      rate = buffer.readUInt32LE(pos + 16);
    if (id === 'data') bytes += Math.min(size, buffer.length - pos - 8);
    pos += 8 + size + (size % 2);
  }
  return rate ? bytes / rate : 0;
}
class PackLibrary {
  constructor(root) {
    this.root = root;
    this.catalog = emptyCatalog();
    this.importing = false;
  }
  async init() {
    await fs.mkdir(this.root, { recursive: true });
    try {
      const value = JSON.parse(await fs.readFile(path.join(this.root, 'catalog.json'), 'utf8'));
      if (Array.isArray(value.packs) && Array.isArray(value.samples) && Array.isArray(value.kits))
        this.catalog = value;
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Could not read pack catalog:', error.message);
    }
    return this;
  }
  async audio(relative) {
    if (!this.catalog.samples.some((sample) => sample.path === relative)) return null;
    return safeFile(this.root, relative);
  }
  async importFolder(folder) {
    if (this.importing) throw Error('A pack import is already running.');
    this.importing = true;
    const created = [];
    try {
      folder = await fs.realpath(folder);
      if (folder === (await fs.realpath(this.root)))
        throw Error('Choose a downloaded pack folder, not the app library.');
      let legacy;
      try {
        legacy = JSON.parse(await fs.readFile(path.join(folder, 'catalog.json'), 'utf8'));
      } catch {}
      const legacySamples = new Map(
        (Array.isArray(legacy?.samples) ? legacy.samples : []).map((s) => [s.path, s])
      );
      const idMap = new Map(),
        entries = [],
        queue = [{ dir: folder, depth: 0 }];
      let visited = 0,
        total = 0,
        skipped = 0;
      while (queue.length) {
        const { dir, depth } = queue.shift();
        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
          if (++visited > 30000)
            throw Error('This folder is too large. Choose one sample pack at a time.');
          if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
          const file = path.join(dir, entry.name);
          if (entry.isDirectory() && depth < 12) {
            if (file !== this.root) queue.push({ dir: file, depth: depth + 1 });
            continue;
          }
          if (!entry.isFile() || !AUDIO.has(path.extname(file).toLowerCase())) continue;
          const size = (await fs.stat(file)).size;
          if (!size || size > 32 * 1024 * 1024) {
            skipped++;
            continue;
          }
          total += size;
          if (total > 2 * 1024 ** 3 || entries.length >= 10000)
            throw Error('Import up to 2 GB or 10,000 samples at a time.');
          const verified = await safeFile(folder, path.relative(folder, file));
          if (!verified) {
            skipped++;
            continue;
          }
          const data = await fs.readFile(verified),
            seconds = wavDuration(data);
          if (seconds > 120) {
            skipped++;
            continue;
          }
          const hash = createHash('sha256').update(data).digest('hex');
          const relative = path.relative(folder, file).split(path.sep).join('/'),
            old = legacySamples.get(relative);
          const id = 'local-' + hash.slice(0, 24),
            target = id + path.extname(file).toLowerCase();
          if (old?.id) idMap.set(old.id, id);
          if (this.catalog.samples.some((s) => s.id === id) || entries.some((s) => s.id === id))
            continue;
          await fs
            .writeFile(path.join(this.root, target), data, { flag: 'wx' })
            .then(() => created.push(target))
            .catch((error) => {
              if (error.code !== 'EEXIST') throw error;
            });
          entries.push({
            id,
            name: entry.name.replace(/\.[^.]+$/, '').slice(0, 100),
            path: target,
            seconds,
            category: category(relative),
            bpm: Number(relative.match(/(?:^|\D)(\d{2,3})[ _-]*bpm/i)?.[1]) || undefined,
            oldPack: old?.pack
          });
        }
      }
      if (!entries.length) return { added: 0, skipped, total: this.catalog.samples.length };
      const packId = 'pack-' + createHash('sha256').update(folder).digest('hex').slice(0, 12);
      const catalog = structuredClone(this.catalog);
      if (!catalog.packs.some((p) => p.id === packId))
        catalog.packs.push({
          id: packId,
          name: path.basename(folder).slice(0, 100),
          tags: 'Imported local samples',
          license: 'Your imported files — original publisher terms apply.',
          source: ''
        });
      for (const sample of entries) {
        const source = Array.isArray(legacy?.packs)
          ? legacy.packs.find((p) => p.id === sample.oldPack)
          : null;
        sample.pack = packId;
        if (source && typeof source.name === 'string') {
          sample.pack =
            packId + '-' + createHash('sha256').update(String(source.id)).digest('hex').slice(0, 8);
          if (!catalog.packs.some((p) => p.id === sample.pack))
            catalog.packs.push({
              id: sample.pack,
              name: source.name.slice(0, 100),
              tags: String(source.tags || '').slice(0, 300),
              license: String(source.license || 'Original publisher terms apply.').slice(0, 500),
              source: /^https:\/\//.test(source.source) ? source.source : ''
            });
        }
        delete sample.oldPack;
        catalog.samples.push(sample);
      }
      for (const kit of Array.isArray(legacy?.kits) ? legacy.kits : []) {
        if (
          !Array.isArray(kit.samples) ||
          kit.samples.length !== 16 ||
          !kit.samples.every((id) => idMap.has(id))
        )
          continue;
        const id =
          packId +
          '-' +
          String(kit.id)
            .replace(/[^\w-]/g, '')
            .slice(0, 80);
        if (!catalog.kits.some((k) => k.id === id))
          catalog.kits.push({
            id,
            name: String(kit.name).slice(0, 100),
            external: true,
            description: String(kit.description || 'Imported sample kit').slice(0, 300),
            samples: kit.samples.map((id) => idMap.get(id))
          });
      }
      await atomicJSON(path.join(this.root, 'catalog.json'), catalog);
      this.catalog = catalog;
      return { added: entries.length, skipped, total: catalog.samples.length };
    } catch (error) {
      await Promise.all(created.map((file) => fs.rm(path.join(this.root, file), { force: true })));
      throw error;
    } finally {
      this.importing = false;
    }
  }
}
module.exports = { PackLibrary, wavDuration, category };
