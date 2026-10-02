'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../app/studio-model.js'),
  Stretch = require('../app/stretch.js');
function project() {
  return M.upgrade({
    version: 2,
    bpm: 120,
    swing: 0,
    pattern: 0,
    pads: Array.from({ length: 128 }, () => ({})),
    patterns: Array.from({ length: 4 }, () => Array.from({ length: 128 }, () => Array(16).fill(0)))
  });
}
test('legacy sequence upgrade, resizing, deep duplication and editable notes', () => {
  const s = project();
  M.validate(s);
  assert.equal(s.version, 3);
  s.patterns[0][17][3] = 0.7;
  M.resize(s, 0, 8);
  assert.equal(s.patterns[0][17].length, 128);
  assert.equal(s.patterns[0][17][3], 0.7);
  s.studio.sequences[0].notes.push({
    id: 'one',
    pad: 17,
    time: 20,
    duration: 3,
    velocity: 0.8,
    midi: 60
  });
  const p = M.addSequence(s, 0);
  s.patterns[p][17][3] = 0.2;
  assert.equal(s.patterns[0][17][3], 0.7);
  s.studio.sequences[p].notes[0].midi = 62;
  assert.equal(s.studio.sequences[0].notes[0].midi, 60);
  M.resize(s, 0, 2);
  assert.equal(s.studio.sequences[0].notes.length, 0);
  M.validate(s);
});
test('song timeline repeats varying lengths; events preserve velocity, swing and absolute bank identity', () => {
  const s = project();
  M.resize(s, 1, 4);
  s.studio.song = [
    { sequence: 0, repeats: 2 },
    { sequence: 1, repeats: 1 }
  ];
  s.studio.mode = 'song';
  assert.deepEqual(M.arrangement(s), [
    { sequence: 0, start: 0, end: 4 },
    { sequence: 0, start: 4, end: 8 },
    { sequence: 1, start: 8, end: 24 }
  ]);
  s.swing = 40;
  s.patterns[0][99][1] = 0.5;
  const [e] = M.events(s, 0);
  assert.equal(e.pad, 99);
  assert.equal(e.time, 0.35);
  assert.equal(e.velocity, 0.5);
  assert.equal(e.step, 1);
});
test('quantization strength blends timing and keeps end-of-loop notes in range', () => {
  assert.equal(M.quantize(0.3, 0.25, 0, 4), 0.3);
  assert.equal(M.quantize(0.3, 0.25, 1, 4), 0.25);
  assert.equal(M.quantize(0.3, 0.25, 0.5, 4), 0.275);
  assert.ok(M.quantize(3.99, 0.25, 1, 4) < 4);
  assert.equal(M.quantize(0.314, 0, 1, 4), 0.314);
});
test('MIDI parses velocity, zero-velocity release, channels and bend without accepting malformed bytes', () => {
  assert.deepEqual(M.midi([0x92, 60, 127]), { type: 'on', channel: 2, note: 60, velocity: 1 });
  assert.equal(M.midi([0x90, 60, 0]).type, 'off');
  assert.equal(M.midi([0xe0, 0, 64]).value, 0);
  assert.equal(M.midi([0xb0, 123, 0]).type, 'panic');
  for (const bytes of [[], [0x90], [0x90, 60, 200], [0x90, -1, 0], [0xf0, 0, 0]])
    assert.equal(M.midi(bytes), null);
});
test('workstation data rejects invalid automation, lengths, MIDI, voices and oversized arrangements', () => {
  const s = project();
  for (const mutate of [
    (x) => (x.studio.tracks[0].volume = NaN),
    (x) => (x.studio.sequences[0].bars = 3),
    (x) => (x.studio.performance.velocityCurve = 0),
    (x) => (x.studio.song = [{ sequence: 99, repeats: 1 }]),
    (x) => (x.pads[0].chokeGroup = 17),
    (x) =>
      (x.studio.sequences[0].notes = [
        { id: 'n', pad: 0, time: 4, duration: 0.5, velocity: 1, midi: 60 }
      ]),
    (x) => (x.studio.sequences[0].automation = [{ track: 0, param: 'volume', time: 1, value: 8 }])
  ]) {
    const x = structuredClone(s);
    mutate(x);
    assert.throws(() => M.validate(x));
  }
  M.resize(s, 0, 16);
  s.studio.song = Array.from({ length: 5 }, () => ({ sequence: 0, repeats: 16 }));
  assert.throws(() => M.validate(s));
});
test('time stretch changes duration while retaining pitch and stereo alignment', () => {
  const rate = 22050,
    f = 440,
    mono = Float32Array.from(
      { length: rate },
      (_, i) => Math.sin((2 * Math.PI * f * i) / rate) * 0.5
    );
  for (const factor of [0.5, 0.75, 1, 1.5, 2]) {
    const [a, b] = Stretch.process([mono, mono.slice()], factor, rate);
    assert.equal(a.length, Math.round(rate * factor));
    assert.deepEqual(a, b);
    assert.ok(a.every(Number.isFinite));
    let crossings = 0;
    const first = Math.floor(a.length * 0.1),
      last = Math.floor(a.length * 0.9);
    for (let i = first + 1; i < last; i++) if (a[i - 1] < 0 && a[i] >= 0) crossings++;
    const measured = (crossings * rate) / (last - first);
    assert.ok(Math.abs(measured - f) < 12, `pitch ${measured} at duration ${factor}`);
  }
});
test('stretch rejects invalid input and handles tiny samples without NaNs', () => {
  assert.throws(() => Stretch.process([new Float32Array(10)], 1, NaN));
  assert.throws(() => Stretch.process([new Float32Array(10)], 3, 44100));
  const [a] = Stretch.process([new Float32Array([0, 0.2, 0, -0.2])], 2, 44100);
  assert.equal(a.length, 8);
  assert.ok(a.every(Number.isFinite));
});
