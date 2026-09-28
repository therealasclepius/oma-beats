'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { PackLibrary } = require('./library.cjs');
const { ClipImporter } = require('./importer.cjs');
const { safeFile } = require('./files.cjs');
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'";
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff'
};
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
async function createBackend({ dataRoot, appRoot }) {
  const packs = await new PackLibrary(path.join(dataRoot, 'packs')).init();
  const importer = await new ClipImporter(path.join(dataRoot, 'imports')).init();
  async function fileResponse(file) {
    if (!file) return json({ error: 'Not found' }, 404);
    return new Response(await fs.readFile(file), {
      headers: {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Content-Security-Policy': CSP,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache'
      }
    });
  }
  async function handle(request) {
    try {
      const url = new URL(request.url),
        route = decodeURIComponent(url.pathname);
      if (request.method === 'POST' && route === '/api/import-youtube') {
        if (!request.headers.get('content-type')?.startsWith('application/json'))
          return json({ error: 'Use JSON' }, 415);
        const body = await request.text();
        if (body.length > 4096) return json({ error: 'Request too large' }, 413);
        return json({ id: await importer.start(JSON.parse(body)) }, 202);
      }
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      if (route === '/packs/catalog.json') return json(packs.catalog);
      if (route.startsWith('/packs/')) return fileResponse(await packs.audio(route.slice(7)));
      if (route === '/api/library') return json(await importer.library());
      if (/^\/api\/library\/[a-f0-9-]{36}\.wav$/.test(route))
        return fileResponse(
          await safeFile(path.join(dataRoot, 'imports', 'clips'), route.split('/').at(-1))
        );
      if (/^\/api\/import-jobs\/[a-f0-9-]{36}$/.test(route)) {
        const job = importer.jobs.get(route.split('/').at(-1));
        return job ? json(job) : json({ error: 'Import not found' }, 404);
      }
      if (route.startsWith('/api/')) return json({ error: 'Not found' }, 404);
      // Only shipped frontend files are accessible, never the desktop source.
      return fileResponse(await safeFile(appRoot, route === '/' ? 'index.html' : route.slice(1)));
    } catch (error) {
      return json({ error: error.message }, 400);
    }
  }
  return { handle, packs, close: () => importer.close() };
}
module.exports = { createBackend, CSP };
