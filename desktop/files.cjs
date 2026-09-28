'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

// A selected pack may contain hostile filenames or symlinks. Never follow them
// outside its root, and only expose files explicitly listed in the catalog.
function containedPath(root, relative) {
  if (
    typeof relative !== 'string' ||
    relative.includes('\0') ||
    relative.includes('\\') ||
    path.isAbsolute(relative)
  )
    return null;
  const target = path.resolve(root, relative);
  const rel = path.relative(root, target);
  return rel && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)
    ? target
    : null;
}
async function safeFile(root, relative) {
  const candidate = containedPath(root, relative);
  if (!candidate) return null;
  try {
    const actual = await fs.realpath(candidate);
    const base = await fs.realpath(root);
    if (!containedPath(base, path.relative(base, actual))) return null;
    return (await fs.stat(actual)).isFile() ? actual : null;
  } catch {
    return null;
  }
}
async function atomicJSON(file, value) {
  const temp = file + '.tmp';
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(temp, JSON.stringify(value));
  await fs.rename(temp, file);
}
module.exports = { containedPath, safeFile, atomicJSON };
