'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
for (const folder of ['app', 'desktop', 'scripts', 'test']) {
  for (const file of fs.readdirSync(folder)) {
    if (!/\.(c?js)$/.test(file)) continue;
    const result = spawnSync(process.execPath, ['--check', path.join(folder, file)], {
      stdio: 'inherit'
    });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('All JavaScript syntax checks passed.');
