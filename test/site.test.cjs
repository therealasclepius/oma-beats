'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const demo = require('../site/demo-engine.js');
test('original website sounds are finite, bounded and fade to silence', () => {
  for (const kind of [
    'kick',
    'clap',
    'hat',
    'perc',
    'bass',
    'keys',
    'open',
    'rim',
    'tom',
    'shaker'
  ]) {
    const data = demo.render(kind, 196);
    assert(data.length > 3000, kind);
    let peak = 0;
    for (const value of data) {
      assert(Number.isFinite(value));
      peak = Math.max(peak, Math.abs(value));
    }
    assert(peak > 0.01 && peak <= 1, `${kind}: ${peak}`);
    assert.equal(Math.abs(data[0]), 0);
    assert.equal(Math.abs(data.at(-1)), 0);
  }
});
test('each demo is a complete independent editable six-track pattern', () => {
  for (const id of Object.keys(demo.styles)) {
    const a = demo.pattern(id),
      b = demo.pattern(id);
    assert.equal(a.length, 6);
    a.forEach((row) => {
      assert.equal(row.length, 16);
      assert(row.some(Boolean));
    });
    a[0][0] = !a[0][0];
    assert.notDeepEqual(a, b);
    assert(demo.styles[id].bpm >= 60 && demo.styles[id].bpm <= 180);
  }
});
