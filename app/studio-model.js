'use strict';
const StudioModel = (() => {
  const trackDefaults = (i) => ({
    name: ['Drums', 'Samples', 'Bass', 'Keys', 'Lead', 'Pads', 'Percussion', 'Textures'][i],
    volume: 1,
    pan: 0,
    mute: false,
    solo: false,
    low: 0,
    mid: 0,
    high: 0,
    compression: 0,
    drive: 0,
    reverb: 0,
    delay: 0,
    duck: 0,
    sidechain: 0
  });
  const performanceDefaults = () => ({
    quantize: 0.25,
    strength: 1,
    velocityCurve: 1,
    countIn: 0,
    metronome: false,
    repeat: 0,
    triplet: false,
    chord: 'off',
    arp: false,
    glide: 0.06,
    midiMode: 'pads',
    midiBase: 36,
    midiInput: 'all',
    recordMode: 'overdub'
  });
  function upgrade(s) {
    if (s.version < 3 || !s.studio)
      s.studio = {
        tracks: Array.from({ length: 8 }, (_, i) => trackDefaults(i)),
        sequences: s.patterns.map((p, i) => ({
          name: 'Sequence ' + (i + 1),
          bars: p[0].length / 16,
          notes: [],
          automation: []
        })),
        song: [],
        mode: 'sequence',
        performance: performanceDefaults()
      };
    s.version = 3;
    return s;
  }
  const beats = (s, p) => s.studio.sequences[p].bars * 4;
  const steps = (s, p) => beats(s, p) * 4;
  function resize(s, p, bars) {
    if (![1, 2, 4, 8, 16].includes(bars)) throw Error('Choose 1, 2, 4, 8 or 16 bars');
    if (
      s.studio.song.reduce(
        (n, a) => n + (a.sequence === p ? bars * 4 : beats(s, a.sequence)) * a.repeats,
        0
      ) > 4096
    )
      throw Error('Song exceeds 1024 bars');
    s.patterns[p] = s.patterns[p].map((row) =>
      Array.from({ length: bars * 16 }, (_, i) => row[i] || 0)
    );
    const seq = s.studio.sequences[p];
    seq.bars = bars;
    seq.notes = seq.notes
      .filter((n) => n.time < bars * 4)
      .map((n) => ({ ...n, duration: Math.min(n.duration, bars * 4 - n.time) }));
    seq.automation = seq.automation.filter((n) => n.time < bars * 4);
  }
  function addSequence(s, from = null) {
    if (s.patterns.length >= 64) throw Error('A project can contain up to 64 sequences');
    s.patterns.push(
      from === null
        ? Array.from({ length: 128 }, () => Array(16).fill(0))
        : structuredClone(s.patterns[from])
    );
    s.studio.sequences.push(
      from === null
        ? { name: 'Sequence ' + s.patterns.length, bars: 1, notes: [], automation: [] }
        : structuredClone(s.studio.sequences[from])
    );
    if (from !== null)
      s.studio.sequences.at(-1).name = s.studio.sequences.at(-1).name.slice(0, 50) + ' copy';
    return s.patterns.length - 1;
  }
  function quantize(time, grid, strength, length) {
    const snapped = grid ? time + (Math.round(time / grid) * grid - time) * strength : time;
    return Math.max(0, Math.min(length - 1 / 960, snapped));
  }
  function events(s, p) {
    const list = [];
    s.patterns[p].forEach((row, pad) =>
      row.forEach((velocity, step) => {
        if (velocity)
          list.push({
            pad,
            step,
            time: step / 4 + (step % 2 ? s.swing / 400 : 0),
            duration: 0.25,
            velocity,
            midi: null
          });
      })
    );
    return list.concat(s.studio.sequences[p].notes).sort((a, b) => a.time - b.time);
  }
  function arrangement(s, p = s.pattern) {
    if (s.studio.mode !== 'song') return [{ sequence: p, start: 0, end: beats(s, p) }];
    let at = 0;
    const result = [];
    for (const slot of s.studio.song)
      for (let i = 0; i < slot.repeats; i++) {
        const length = beats(s, slot.sequence);
        result.push({ sequence: slot.sequence, start: at, end: at + length });
        at += length;
      }
    return result;
  }
  function midi(data) {
    if (
      !data ||
      data.length < 3 ||
      !Number.isInteger(data[0]) ||
      data[0] < 128 ||
      data[0] > 239 ||
      ![data[1], data[2]].every((n) => Number.isInteger(n) && n >= 0 && n <= 127)
    )
      return null;
    const [status, a, b] = data,
      channel = status & 15,
      type = status & 240;
    if (type === 144 && b > 0) return { type: 'on', channel, note: a, velocity: b / 127 };
    if (type === 128 || (type === 144 && b === 0)) return { type: 'off', channel, note: a };
    if (type === 224) return { type: 'bend', channel, value: ((b << 7) + a - 8192) / 8192 };
    if (type === 176 && (a === 120 || a === 123)) return { type: 'panic' };
    return null;
  }
  function validate(s) {
    const num = (v, a, b) => typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;
    const int = (v, a, b) => Number.isInteger(v) && num(v, a, b);
    const str = (v, n) => typeof v === 'string' && v.length <= n;
    const fail = () => {
      throw Error('Invalid workstation project');
    };
    const w = s.studio;
    if (
      !w ||
      !Array.isArray(w.tracks) ||
      w.tracks.length !== 8 ||
      !Array.isArray(w.sequences) ||
      w.sequences.length !== s.patterns.length ||
      !int(s.patterns.length, 1, 64) ||
      !['sequence', 'song'].includes(w.mode)
    )
      fail();
    for (const t of w.tracks) {
      if (
        !t ||
        !str(t.name, 60) ||
        typeof t.mute !== 'boolean' ||
        typeof t.solo !== 'boolean' ||
        !int(t.sidechain, 0, 7)
      )
        fail();
      for (const [k, a, b] of [
        ['volume', 0, 1.5],
        ['pan', -1, 1],
        ['low', -18, 18],
        ['mid', -18, 18],
        ['high', -18, 18],
        ['compression', 0, 1],
        ['drive', 0, 1],
        ['reverb', 0, 1],
        ['delay', 0, 1],
        ['duck', 0, 1]
      ])
        if (!num(t[k], a, b)) fail();
    }
    for (let i = 0; i < w.sequences.length; i++) {
      const q = w.sequences[i];
      if (
        !q ||
        !str(q.name, 60) ||
        ![1, 2, 4, 8, 16].includes(q.bars) ||
        !Array.isArray(q.notes) ||
        q.notes.length > 16384 ||
        !Array.isArray(q.automation) ||
        q.automation.length > 8192
      )
        fail();
      for (const n of q.notes)
        if (
          !n ||
          !str(n.id, 80) ||
          !int(n.pad, 0, 127) ||
          !num(n.time, 0, q.bars * 4 - 1e-8) ||
          !num(n.duration, 1 / 960, 64) ||
          !num(n.velocity, 0.001, 1) ||
          (n.midi !== null && !int(n.midi, 12, 107))
        )
          fail();
      for (const a of q.automation)
        if (
          !a ||
          !int(a.track, 0, 7) ||
          !num(a.time, 0, q.bars * 4) ||
          !['volume', 'pan'].includes(a.param) ||
          !num(a.value, a.param === 'pan' ? -1 : 0, a.param === 'pan' ? 1 : 1.5)
        )
          fail();
    }
    if (!Array.isArray(w.song) || w.song.length > 128) fail();
    for (const a of w.song)
      if (!a || !int(a.sequence, 0, s.patterns.length - 1) || !int(a.repeats, 1, 16)) fail();
    if (w.song.reduce((n, a) => n + beats(s, a.sequence) * a.repeats, 0) > 4096) fail();
    const p = w.performance;
    if (
      !p ||
      ![0, 1, 0.5, 0.25, 0.125, 1 / 3, 1 / 6].includes(p.quantize) ||
      !num(p.strength, 0, 1) ||
      !num(p.velocityCurve, 0.25, 3) ||
      ![0, 1, 2].includes(p.countIn) ||
      ![0, 1, 0.5, 0.25, 0.125].includes(p.repeat) ||
      !num(p.glide, 0, 1) ||
      !int(p.midiBase, 0, 112) ||
      !str(p.midiInput, 256) ||
      !['pads', 'notes'].includes(p.midiMode) ||
      !['off', 'minor', 'major', 'seventh'].includes(p.chord) ||
      !['overdub', 'replace'].includes(p.recordMode) ||
      ['metronome', 'triplet', 'arp'].some((k) => typeof p[k] !== 'boolean')
    )
      fail();
    for (const pad of s.pads)
      if (
        (pad.chokeGroup !== undefined && !int(pad.chokeGroup, 0, 16)) ||
        (pad.playMode !== undefined && !['one-shot', 'gate'].includes(pad.playMode))
      )
        fail();
  }
  return {
    upgrade,
    trackDefaults,
    performanceDefaults,
    beats,
    steps,
    resize,
    addSequence,
    quantize,
    events,
    arrangement,
    midi,
    validate
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = StudioModel;
