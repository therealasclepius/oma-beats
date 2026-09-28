'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildSite, rendererFiles } = require('../scripts/build-site.cjs');
test('website build ships the actual renderer without native bridge or private samples', (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'oma-public-build-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fixture, 'site'));
  fs.mkdirSync(path.join(fixture, 'app/packs'), { recursive: true });
  fs.writeFileSync(path.join(fixture, 'site/index.html'), 'public marketing page');
  fs.writeFileSync(path.join(fixture, 'site/browser-preview.js'), 'browser host');
  fs.writeFileSync(path.join(fixture, 'site/browser-preview.css'), 'browser guidance');
  fs.writeFileSync(path.join(fixture, 'install.sh'), 'installer');
  fs.writeFileSync(path.join(fixture, 'app/packs/catalog.json'), 'private catalog');
  fs.writeFileSync(path.join(fixture, 'app/packs/purchased.wav'), 'private sample');
  fs.writeFileSync(path.join(fixture, 'app/desktop.js'), 'native bridge');
  fs.writeFileSync(path.join(fixture, 'app/session.omabeats'), 'personal project');
  const realRoot = path.resolve(__dirname, '..');
  fs.copyFileSync(path.join(realRoot, 'app/index.html'), path.join(fixture, 'app/index.html'));
  for (const name of rendererFiles) {
    fs.copyFileSync(path.join(realRoot, 'app', name), path.join(fixture, 'app', name));
  }
  const out = buildSite(fixture);
  assert.deepEqual(
    fs.readdirSync(path.join(out, 'play')).sort(),
    [...rendererFiles, 'index.html', 'browser-preview.js', 'browser-preview.css'].sort()
  );
  const html = fs.readFileSync(path.join(out, 'play/index.html'), 'utf8');
  assert(!html.includes('src="desktop.js"'));
  assert(html.indexOf('src="browser-preview.js"') < html.indexOf('src="app.js"'));
  for (const name of rendererFiles) {
    assert.deepEqual(
      fs.readFileSync(path.join(out, 'play', name)),
      fs.readFileSync(path.join(realRoot, 'app', name)),
      `${name} must use the real renderer`
    );
  }
  assert(!fs.existsSync(path.join(out, 'browser-preview.js')));
});
