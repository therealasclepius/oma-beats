'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { youtubeURL, importRequest, ClipImporter } = require('../desktop/importer.cjs');
const { safeFile, containedPath } = require('../desktop/files.cjs');
const { PackLibrary, wavDuration } = require('../desktop/library.cjs');
const { createBackend } = require('../desktop/backend.cjs');
async function temp(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'oma-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
function wav(seed = 0) {
  const data = Buffer.alloc(44 + 44100 * 2);
  data.write('RIFF');
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(44100, 24);
  data.writeUInt32LE(88200, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(data.length - 44, 40);
  data.writeInt16LE(seed, 44);
  return data;
}
test('YouTube links canonicalize and reject non-video hosts, credentials and invalid durations', () => {
  assert.equal(
    youtubeURL('https://youtu.be/AbCdEfGhI12?t=12'),
    'https://www.youtube.com/watch?v=AbCdEfGhI12'
  );
  assert.equal(
    youtubeURL('https://www.youtube.com/watch?v=AbCdEfGhI12&list=test'),
    'https://www.youtube.com/watch?v=AbCdEfGhI12'
  );
  for (const url of [
    'https://youtube.com.evil.test/watch?v=AbCdEfGhI12',
    'https://user@youtube.com/watch?v=AbCdEfGhI12',
    'file:///etc/passwd',
    'https://youtube.com/playlist?list=test'
  ])
    assert.throws(() => youtubeURL(url));
  for (const duration of [0, 121, NaN, Infinity, true, '30'])
    assert.throws(() => importRequest({ url: 'youtu.be/AbCdEfGhI12', duration }));
  assert.throws(() => importRequest({ url: 'youtu.be/AbCdEfGhI12', start: -1 }));
});
test('file serving prevents traversal and symlink escapes', async (t) => {
  const dir = await temp(t),
    root = path.join(dir, 'root');
  await fs.mkdir(root);
  await fs.writeFile(path.join(dir, 'private.txt'), 'private');
  await fs.writeFile(path.join(root, 'safe.txt'), 'safe');
  assert.equal(containedPath(root, '../private.txt'), null);
  assert.equal(containedPath(root, '..\\private.txt'), null);
  assert.equal(containedPath(root, '/etc/passwd'), null);
  assert.equal(await safeFile(root, '../private.txt'), null);
  assert.ok(await safeFile(root, 'safe.txt'));
  if (process.platform !== 'win32') {
    await fs.symlink(path.join(dir, 'private.txt'), path.join(root, 'link.txt'));
    assert.equal(await safeFile(root, 'link.txt'), null);
  }
});
test('pack import persists, deduplicates, preserves curated kits and ignores non-audio files', async (t) => {
  const dir = await temp(t),
    source = path.join(dir, 'Pack'),
    data = path.join(dir, 'library');
  await fs.mkdir(source);
  const samples = [];
  for (let i = 0; i < 16; i++) {
    const file = `kick-${i}.wav`;
    await fs.writeFile(path.join(source, file), wav(i));
    samples.push({ id: 'old-' + i, pack: 'old-pack', path: file });
  }
  await fs.writeFile(path.join(source, 'private.json'), '{"secret":"not imported"}');
  await fs.writeFile(
    path.join(source, 'catalog.json'),
    JSON.stringify({
      packs: [
        {
          id: 'old-pack',
          name: 'Owned drums',
          source: 'https://example.com/pack',
          license: 'Original terms'
        }
      ],
      samples,
      kits: [{ id: 'kit', name: 'Owned kit', external: true, samples: samples.map((s) => s.id) }]
    })
  );
  const library = await new PackLibrary(data).init();
  assert.equal((await library.importFolder(source)).added, 16);
  assert.equal(library.catalog.kits.length, 1);
  assert.equal(library.catalog.kits[0].external, true);
  assert.equal(library.catalog.samples[0].seconds, 1);
  assert.equal(wavDuration(wav()), 1);
  assert.equal((await library.importFolder(source)).added, 0);
  assert.equal((await new PackLibrary(data).init()).catalog.samples.length, 16);
  assert.equal(await library.audio('private.json'), null);
  assert.ok(await library.audio(library.catalog.samples[0].path));
  assert.equal((await fs.readdir(data)).filter((f) => f.endsWith('.json')).length, 1);
});
test('protocol backend serves the app and rejects unknown data and malformed import requests', async (t) => {
  const dir = await temp(t);
  const backend = await createBackend({
    dataRoot: dir,
    appRoot: path.join(__dirname, '..', 'app')
  });
  t.after(() => backend.close());
  const page = await backend.handle(new Request('oma://app/'));
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /object-src 'none'/);
  assert.match(await page.text(), /OMA/);
  const catalog = await backend.handle(new Request('oma://app/packs/catalog.json'));
  assert.deepEqual((await catalog.json()).samples, []);
  for (const url of [
    'oma://app/desktop/main.cjs',
    'oma://app/packs/catalog.json.bak',
    'oma://app/api/missing',
    'oma://app/%2e%2e%2fpackage.json'
  ])
    assert.equal((await backend.handle(new Request(url))).status, 404);
  const invalid = await backend.handle(
    new Request('oma://app/api/import-youtube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' })
    })
  );
  assert.equal(invalid.status, 400);
});
test('a previously imported YouTube clip is reused without invoking a downloader', async (t) => {
  const dir = await temp(t),
    importer = await new ClipImporter(dir).init();
  t.after(() => importer.close());
  const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const request = importRequest({ url: 'youtu.be/AbCdEfGhI12', start: 5, duration: 10 });
  await fs.writeFile(path.join(dir, 'clips', id + '.wav'), wav());
  await fs.writeFile(
    path.join(dir, 'clips', id + '.json'),
    JSON.stringify({ id, ...request, title: 'Test clip', created: 1 })
  );
  importer.download = () => {
    throw Error('Should use cached clip');
  };
  const job = importer.jobs.get(await importer.start(request));
  assert.equal(job.status, 'ready');
  assert.equal(job.audio, '/api/library/' + id + '.wav');
});
