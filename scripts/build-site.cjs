'use strict';
const fs = require('node:fs');
const path = require('node:path');
const rendererFiles = [
  'style.css',
  'studio.css',
  'sampler.css',
  'sampler.js',
  'studio-model.js',
  'studio-audio.js',
  'studio.js',
  'clock-worker.js',
  'stretch.js',
  'stretch-worker.js',
  'icon.svg',
  'synth-engine.js',
  'synth.js',
  'history.js',
  'packs.js',
  'importer.js',
  'chop.js',
  'kits.js',
  'app.js'
];
function buildSite(root = path.resolve(__dirname, '..'), out = path.join(root, 'dist/site')) {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.cpSync(path.join(root, 'site'), out, { recursive: true });
  fs.copyFileSync(path.join(root, 'install.sh'), path.join(out, 'install.sh'));
  fs.writeFileSync(path.join(out, '.nojekyll'), '');
  const play = path.join(out, 'play');
  fs.mkdirSync(play, { recursive: true });
  // Explicit public renderer allowlist: never copy app data, sample packs, or the native bridge.
  for (const file of rendererFiles) {
    fs.copyFileSync(path.join(root, 'app', file), path.join(play, file));
  }
  const sharedHead =
    fs
      .readFileSync(path.join(root, 'site/index.html'), 'utf8')
      .match(/<!-- Shared identity -->([\s\S]*?)<!-- \/Shared identity -->/)?.[1] || '';
  const html = fs
    .readFileSync(path.join(root, 'app/index.html'), 'utf8')
    .replace('<script src="desktop.js"></script>', '')
    .replace('<script src="studio-smoke.js"></script>', '')
    .replace('<link rel="icon" href="icon.svg" type="image/svg+xml" />', '')
    .replace(
      '</head>',
      sharedHead.replaceAll('href="./', 'href="../') +
        '<meta property="og:url" content="https://oma-beats.vercel.app/play/" />' +
        '<link rel="canonical" href="https://oma-beats.vercel.app/play/" /></head>'
    )
    .replace(
      '<link rel="stylesheet" href="style.css" />',
      '<link rel="stylesheet" href="style.css" /><link rel="stylesheet" href="browser-preview.css" />'
    )
    .replace(
      '    <script src="app.js"></script>',
      '    <script src="browser-preview.js"></script>\n    <script src="app.js"></script>'
    );
  fs.writeFileSync(path.join(play, 'index.html'), html);
  fs.renameSync(path.join(out, 'browser-preview.js'), path.join(play, 'browser-preview.js'));
  fs.renameSync(path.join(out, 'browser-preview.css'), path.join(play, 'browser-preview.css'));
  return out;
}
if (require.main === module) {
  buildSite();
  console.log('Built public website with allowlisted browser renderer in dist/site.');
}
module.exports = { buildSite, rendererFiles };
