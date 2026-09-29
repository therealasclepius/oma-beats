'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const synth = require('../app/synth-engine.js');
test('instrument note maps follow key, scale and octave across all sixteen pads', () => {
  const p = synth.preset('sub');
  assert.deepEqual(synth.notes(p).slice(0, 8), [24, 26, 27, 29, 31, 32, 34, 36]);
  assert.equal(synth.noteName(24), 'C1');
  p.root = 9;
  p.octave = 3;
  p.scale = 'major';
  assert.deepEqual(synth.notes(p).slice(0, 8), [57, 59, 61, 62, 64, 66, 68, 69]);
  p.scale = 'chromatic';
  assert.equal(synth.notes(p).at(-1), 72);
  p.octave = 4;
  p.root = 11;
  p.scale = 'pentatonic';
  assert.equal(synth.notes(p).at(-1), 107);
});
test('presets cover four instrument families with valid finite envelopes', () => {
  assert.equal(synth.presets.length, 36);
  assert.equal(new Set(synth.presets.map((p) => p.family)).size, 4);
  for (const p of synth.presets) {
    const patch = synth.preset(p.id);
    synth.validate(patch);
    const e = synth.envelope(patch);
    assert.ok(e.attack > 0);
    assert.ok(e.attack + e.decay <= e.gate + 1e-9);
    assert.ok(e.end > e.gate);
  }
  const patch = { ...synth.preset('warm-pad'), gate: 0.08, attack: 2, decay: 2 };
  const e = synth.envelope(patch);
  assert.ok(e.attack + e.decay <= e.gate + 1e-9);
});
test('untrusted project instrument data cannot inject invalid graphs or huge renders', () => {
  for (const value of [Infinity, NaN, -1, 1000, '0.5'])
    assert.throws(() => synth.validate({ ...synth.preset('sub'), gate: value }));
  for (const patch of [
    { wave: 'custom' },
    { scale: '__proto__' },
    { octave: 4.5 },
    { cutoff: 0 },
    { mono: 'true' }
  ])
    assert.throws(() => synth.validate({ ...synth.preset('sub'), ...patch }));
  assert.throws(() => synth.validateBanks([null]));
  assert.throws(() =>
    synth.validateBanks([{ group: 'bad', patch: synth.preset('sub') }, ...Array(7).fill(null)])
  );
  synth.validateBanks(undefined);
  synth.validateBanks(Array(8).fill(null));
});

test('character parameters reject invalid values and older projects still validate', () => {
  const legacy = synth.preset('reese');
  for (const key of [
    'filterEnv',
    'filterRate',
    'filterDepth',
    'pitchSweep',
    'drive',
    'sub',
    'spread',
    'fmRatio',
    'fmIndex',
    'delayMix',
    'delayTime'
  ]) {
    for (const value of [NaN, Infinity, '1', 1000])
      assert.throws(() => synth.validate({ ...legacy, [key]: value }));
    delete legacy[key];
  }
  synth.validate(legacy);
  assert.equal(new Set(synth.presets.map((p) => p.id)).size, synth.presets.length);
  assert.ok(synth.presets.some((p) => p.patch.wave === 'supersaw' && p.patch.spread));
  assert.ok(synth.presets.some((p) => p.patch.wave === 'growl' && p.patch.filterRate));
});
