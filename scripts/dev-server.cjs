'use strict';
// Optional UI development server. The packaged desktop app has no HTTP listener.
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { createBackend } = require('../desktop/backend.cjs');
(async () => {
  const port = Number(process.env.OMA_DEV_PORT || 18744);
  const origin = `http://127.0.0.1:${port}`;
  const backend = await createBackend({
    appRoot: path.join(__dirname, '..', 'app'),
    dataRoot: process.env.OMA_DEV_DATA || path.join(os.tmpdir(), 'oma-beats-web-dev')
  });
  const server = http.createServer(async (req, res) => {
    if (
      req.headers.host !== `127.0.0.1:${port}` ||
      (req.method !== 'GET' && req.headers.origin !== origin)
    ) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 4096) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(chunk);
    }
    const request = new Request(origin + req.url, {
      method: req.method,
      headers: req.headers,
      ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {})
    });
    const response = await backend.handle(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  server.listen(port, '127.0.0.1', () => console.log('Oma Beats development UI: ' + origin));
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      backend.close();
      server.close();
    });
})();
