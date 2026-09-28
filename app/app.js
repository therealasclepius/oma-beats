'use strict';
const $ = (id) => document.getElementById(id);
const KEYS = '1234qwerasdfzxcv'.split('');
const BANK_COUNT = 8,
  PADS_PER_BANK = 16,
  TOTAL_PADS = 128;
const bankOffset = () => 16 * (state?.padBank || 0);
const trackIsActive = (i) =>
  state.playScope === 'all' || Math.floor(i / 16) === (state.padBank || 0);
const emptyPad = () => ({
  name: 'Empty',
  sample: 'kit-empty',
  gain: 0.8,
  pitch: 0,
  start: 0,
  end: 1,
  reverse: false
});
function migrateState(s) {
  if (s.version === 1) {
    s.pads.push(...Array.from({ length: 112 }, emptyPad));
    s.patterns.forEach((p) => p.push(...Array.from({ length: 112 }, () => Array(16).fill(0))));
    s.version = 2;
    s.padBank = 0;
    s.playScope = 'bank';
  }
  if (!s.bankMono) s.bankMono = Array(8).fill(!!s.choke);
  return s;
}
const NAMES = [
  'Deep kick',
  'Dust snare',
  'Closed hat',
  'Open hat',
  'Soft clap',
  'Low tom',
  'Rim shot',
  'Shaker',
  '808 sub',
  'Mid tom',
  'Cowbell',
  'Clave',
  'Chord stab',
  'Pluck',
  'Noise rise',
  'Click'
];
const ctx = new AudioContext({ latencyHint: 'interactive' });
void ctx.suspend();
const master = ctx.createGain();
const limiter = ctx.createDynamicsCompressor();
limiter.threshold.value = -6;
limiter.knee.value = 6;
limiter.ratio.value = 10;
master.connect(limiter).connect(ctx.destination);
const reversedBuffers = new WeakMap();
const monoVoices = new WeakMap();
let buffers = {},
  state,
  selected = 0,
  pattern = 0,
  playing = false,
  recording = false,
  nextStep = 0,
  nextTime = 0,
  scheduler,
  visualTimers = [],
  activeSources = new Set(),
  saveTimer,
  toastTimer,
  db,
  lastStep = -1,
  playStart = 0;
let persistChain = Promise.resolve(),
  revision = 0;
const defaults = () => ({
  version: 2,
  padBank: 0,
  playScope: 'bank',
  bankMono: Array(8).fill(false),
  name: 'Late night sketch',
  kit: 'classic',
  choke: false,
  bpm: 90,
  swing: 0,
  master: 0.7,
  pattern: 0,
  pads: [
    ...NAMES.map((name, i) => ({
      name,
      sample: 'kit' + i,
      gain: 0.8,
      pitch: 0,
      start: 0,
      end: 1,
      reverse: false
    })),
    ...Array.from({ length: 112 }, emptyPad)
  ],
  patterns: Array.from({ length: 4 }, () => Array.from({ length: 128 }, () => Array(16).fill(0)))
});
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4000);
}
function makeKit() {
  buffers['kit-empty'] = ctx.createBuffer(1, 128, ctx.sampleRate);
  let seed = 91;
  const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
  for (let k = 0; k < 16; k++) {
    const duration = [
      0.6, 0.32, 0.12, 0.55, 0.28, 0.45, 0.12, 0.18, 1.3, 0.35, 0.35, 0.13, 0.8, 0.65, 1, 0.08
    ][k];
    const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate),
      d = b.getChannelData(0);
    let phase = 0,
      prev = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / ctx.sampleRate,
        n = noise(),
        hp = n - prev;
      prev = n;
      let v = 0;
      if (k === 0) {
        phase += (2 * Math.PI * (45 + 110 * Math.exp(-t * 40))) / ctx.sampleRate;
        v = Math.sin(phase) * Math.exp(-t * 9) + n * 0.15 * Math.exp(-t * 100);
      }
      if (k === 1)
        v =
          n * 0.65 * Math.exp(-t * 18) + Math.sin(t * 2 * Math.PI * 180) * 0.45 * Math.exp(-t * 25);
      if (k === 2 || k === 3) v = hp * 0.25 * Math.exp(-t * (k === 2 ? 42 : 8));
      if (k === 4)
        v =
          n *
          0.5 *
          (Math.exp(-t * 20) + ((t > 0.013 && t < 0.025) || (t > 0.028 && t < 0.045) ? 0.45 : 0));
      if (k === 5 || k === 9) {
        phase += (2 * Math.PI * ((k === 5 ? 85 : 140) + 75 * Math.exp(-t * 25))) / ctx.sampleRate;
        v = Math.sin(phase) * 0.8 * Math.exp(-t * 12);
      }
      if (k === 6)
        v =
          (Math.sin(t * 2 * Math.PI * 1700) + Math.sin(t * 2 * Math.PI * 850)) *
          0.4 *
          Math.exp(-t * 60);
      if (k === 7) v = hp * 0.25 * Math.sin(Math.min(t * 45, Math.PI)) * Math.exp(-t * 15);
      if (k === 8)
        v = Math.sin(t * 2 * Math.PI * 49) * 0.8 * Math.min(t * 150, 1) * Math.exp(-t * 3.5);
      if (k === 10)
        v =
          (Math.sign(Math.sin(t * 2 * Math.PI * 540)) +
            Math.sign(Math.sin(t * 2 * Math.PI * 800))) *
          0.2 *
          Math.exp(-t * 14);
      if (k === 11) v = Math.sin(t * 2 * Math.PI * 2400) * 0.7 * Math.exp(-t * 65);
      if (k === 12)
        v =
          [261.63, 311.13, 392].reduce(
            (a, f) => a + Math.sin(t * 2 * Math.PI * f) + 0.2 * Math.sin(t * 4 * Math.PI * f),
            0
          ) *
          0.18 *
          Math.min(t * 200, 1) *
          Math.exp(-t * 5);
      if (k === 13)
        v =
          (Math.sin(t * 2 * Math.PI * 523.25) + 0.3 * Math.sin(t * 2 * Math.PI * 1046.5)) *
          0.6 *
          Math.exp(-t * 9) *
          Math.min(t * 400, 1);
      if (k === 14) v = hp * 0.25 * Math.pow(t / duration, 2) * Math.min((duration - t) * 100, 1);
      if (k === 15) v = n * 0.6 * Math.exp(-t * 130);
      d[i] = Math.max(-1, Math.min(1, v)) * Math.min((duration - t) * 300, 1);
    }
    buffers['kit' + k] = b;
  }
}
function voice(
  audio,
  destination,
  pad,
  time,
  velocity = 1,
  track = true,
  bank = Math.max(
    0,
    Math.floor((state.pads.indexOf(pad) >= 0 ? state.pads.indexOf(pad) : selected) / 16)
  )
) {
  const original = buffers[pad.sample];
  if (!original) return;
  let buffer = original,
    offset = pad.start * buffer.duration,
    duration = (pad.end - pad.start) * buffer.duration;
  if (pad.reverse) {
    if (!reversedBuffers.has(original)) {
      const reversed = audio.createBuffer(
        original.numberOfChannels,
        original.length,
        original.sampleRate
      );
      for (let c = 0; c < reversed.numberOfChannels; c++)
        reversed.getChannelData(c).set(original.getChannelData(c).slice().reverse());
      reversedBuffers.set(original, reversed);
    }
    buffer = reversedBuffers.get(original);
    offset = (1 - pad.end) * buffer.duration;
  }
  const source = audio.createBufferSource(),
    gain = audio.createGain();
  source.buffer = buffer;
  source.playbackRate.value = Math.pow(2, pad.pitch / 12);
  const length = duration / source.playbackRate.value,
    level = pad.gain * velocity,
    attack = Math.min(pad.attack ?? 0.003, length * 0.5),
    release = Math.min(pad.release ?? 0.008, length - attack),
    filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = pad.cutoff ?? 20000;
  filter.Q.value = 0.707;
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(level, time + attack);
  gain.gain.setValueAtTime(level, time + length - release);
  gain.gain.linearRampToValueAtTime(0, time + length);
  source.connect(filter).connect(gain).connect(destination);
  source.start(time, offset, Math.max(0.001, duration));
  source.omaBank = bank;
  if (state.bankMono?.[bank]) {
    let bankVoices = monoVoices.get(audio);
    if (!bankVoices) {
      bankVoices = new Map();
      monoVoices.set(audio, bankVoices);
    }
    const entries = (bankVoices.get(bank) || []).filter((v) => v.end > audio.currentTime),
      previous = entries.filter((v) => v.time <= time).at(-1),
      next = entries.find((v) => v.time > time);
    if (previous) {
      try {
        previous.source.stop(time);
      } catch {}
    }
    if (next) source.stop(next.time);
    entries.push({ source, time, end: time + length });
    entries.sort((a, b) => a.time - b.time);
    bankVoices.set(bank, entries);
  }
  if (track) {
    activeSources.add(source);
    source.onended = () => {
      activeSources.delete(source);
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }
  return source;
}
async function unlock() {
  if (ctx.state !== 'running') await ctx.resume();
  $('audioState').textContent = 'AUDIO ONLINE';
}
function flash(i) {
  const el = $('pads').children[i - bankOffset()];
  if (!el) return;
  el.classList.add('hit');
  setTimeout(() => el.classList.remove('hit'), 100);
}
async function hit(i) {
  if (state.pads[i].sample === 'kit-empty') {
    selected = i;
    renderSelected();
    toast('Empty pad — load a sample or choose a kit');
    return;
  }
  await unlock();
  selected = i;
  renderSelected();
  voice(ctx, master, state.pads[i], ctx.currentTime);
  flash(i);
  if (recording && playing) {
    const unit = 60 / state.bpm / 4,
      elapsed = ctx.currentTime - playStart;
    let nearest = 0,
      distance = Infinity;
    for (let s = 0; s < 16; s++) {
      let pos = stepOffset(s, unit),
        mod = ((elapsed % (unit * 16)) + unit * 16) % (unit * 16),
        diff = Math.min(Math.abs(mod - pos), unit * 16 - Math.abs(mod - pos));
      if (diff < distance) {
        distance = diff;
        nearest = s;
      }
    }
    state.patterns[pattern][i][nearest] = 1;
    renderSteps();
    changed();
  }
}
function stepOffset(step, unit) {
  return step * unit + (step % 2 ? (unit * state.swing) / 100 : 0);
}
function schedule() {
  const unit = 60 / state.bpm / 4;
  while (nextTime < ctx.currentTime + 0.12) {
    const s = nextStep,
      at = nextTime,
      p = pattern;
    state.patterns[p].forEach((row, i) => {
      if (row[s] && trackIsActive(i)) voice(ctx, master, state.pads[i], at, row[s]);
    });
    const timer = setTimeout(
      () => {
        if (!playing) return;
        paintPosition(s);
        state.patterns[p].forEach((row, i) => {
          if (row[s] && trackIsActive(i)) flash(i);
        });
        visualTimers = visualTimers.filter((x) => x !== timer);
      },
      Math.max(0, (at - ctx.currentTime) * 1000)
    );
    visualTimers.push(timer);
    nextTime += unit * (s % 2 ? 1 - state.swing / 100 : 1 + state.swing / 100);
    nextStep = (s + 1) % 16;
  }
}
async function togglePlay() {
  if (playing) {
    stop();
    return;
  }
  await unlock();
  playing = true;
  nextStep = 0;
  nextTime = ctx.currentTime + 0.04;
  playStart = nextTime;
  $('play').textContent = '■ Stop';
  $('play').classList.add('active');
  schedule();
  scheduler = setInterval(schedule, 25);
}
function stop() {
  playing = false;
  clearInterval(scheduler);
  visualTimers.forEach(clearTimeout);
  visualTimers = [];
  for (const source of activeSources) {
    try {
      source.stop();
    } catch {}
  }
  activeSources.clear();
  monoVoices.delete(ctx);
  $('play').textContent = '▶ Play';
  $('play').classList.remove('active');
  paintPosition(-1);
}
function paintPosition(step) {
  lastStep = step;
  $('position').textContent = String(step < 0 ? 1 : step + 1).padStart(2, '0') + ' / 16';
  document
    .querySelectorAll('[data-step]')
    .forEach((el) => el.classList.toggle('current', Number(el.dataset.step) === step));
}
function render() {
  $('playScope').value = state.playScope || 'bank';
  $('projectName').value = state.name;
  $('bpm').value = state.bpm;
  $('swing').value = state.swing;
  $('swingValue').value = state.swing + '%';
  $('master').value = state.master;
  master.gain.value = state.master;
  $('patterns').replaceChildren();
  for (let p = 0; p < 4; p++) {
    let b = document.createElement('button');
    b.textContent = 'ABCD'[p];
    b.className = p === pattern ? 'active' : '';
    b.setAttribute('aria-label', 'Pattern ' + 'ABCD'[p]);
    b.onclick = () => {
      pattern = p;
      state.pattern = p;
      render();
      changed();
    };
    $('patterns').append(b);
  }
  renderPadBanks();
  $('pads').replaceChildren();
  state.pads.slice(bankOffset(), bankOffset() + 16).forEach((pad, local) => {
    const i = bankOffset() + local;
    let b = document.createElement('button');
    b.className = 'pad';
    b.setAttribute(
      'aria-label',
      'Pad ' + 'ABCDEFGH'[state.padBank] + (local + 1) + ': ' + pad.name
    );
    let top = document.createElement('span');
    top.className = 'pad-top';
    let num = document.createElement('span'),
      key = document.createElement('span');
    num.textContent = 'ABCDEFGH'[state.padBank] + String(local + 1).padStart(2, '0');
    key.textContent = KEYS[local].toUpperCase();
    top.append(num, key);
    let name = document.createElement('span');
    name.className = 'pad-name';
    name.textContent = pad.name;
    b.append(top, name);
    b.onclick = () => hit(i);
    b.ondragover = (e) => {
      e.preventDefault();
      b.classList.add('drag');
    };
    b.ondragleave = () => b.classList.remove('drag');
    b.ondrop = (e) => {
      e.preventDefault();
      b.classList.remove('drag');
      if (e.dataTransfer.files[0]) loadSample(e.dataTransfer.files[0], i);
    };
    $('pads').append(b);
  });
  renderSelected();
  renderSteps();
  renderChopControls();
  renderKitSelector();
}
function renderSelected() {
  const pad = state.pads[selected];
  Array.from($('pads').children).forEach((el, i) =>
    el.classList.toggle('selected', selected === bankOffset() + i)
  );
  document
    .querySelectorAll('.track-label')
    .forEach((el, i) => el.classList.toggle('selected', selected === bankOffset() + i));
  $('padNumber').textContent =
    'PAD ' + 'ABCDEFGH'[Math.floor(selected / 16)] + String((selected % 16) + 1).padStart(2, '0');
  $('sampleName').textContent = pad.name;
  $('sampleInfo').textContent =
    buffers[pad.sample].duration.toFixed(2) + ' SEC · ' + (pad.reverse ? 'REVERSED' : 'ONE SHOT');
  for (const key of ['gain', 'pitch', 'start', 'end']) {
    $(key).value = pad[key];
    $(key + 'Value').value =
      key === 'pitch'
        ? (pad[key] > 0 ? '+' : '') + pad[key] + ' st'
        : Math.round(pad[key] * 100) + '%';
  }
  $('reverse').classList.toggle('active', pad.reverse);
  drawWave();
}
function renderSteps() {
  let grid = $('sequencer');
  grid.replaceChildren();
  grid.append(document.createElement('span'));
  for (let s = 0; s < 16; s++) {
    let n = document.createElement('span');
    n.className = 'step-number';
    n.textContent = s + 1;
    n.dataset.step = s;
    grid.append(n);
  }
  state.pads.slice(bankOffset(), bankOffset() + 16).forEach((pad, local) => {
    const i = bankOffset() + local;
    let label = document.createElement('button');
    label.className = 'track-label' + (i === selected ? ' selected' : '');
    label.textContent =
      'ABCDEFGH'[state.padBank] + String(local + 1).padStart(2, '0') + '  ' + pad.name;
    label.onclick = () => {
      selected = i;
      renderSelected();
    };
    grid.append(label);
    for (let s = 0; s < 16; s++) {
      let b = document.createElement('button');
      b.className =
        'step' + (s % 4 === 0 ? ' beat' : '') + (state.patterns[pattern][i][s] ? ' on' : '');
      b.dataset.step = s;
      b.setAttribute('aria-label', pad.name + ' step ' + (s + 1));
      b.setAttribute('aria-pressed', !!state.patterns[pattern][i][s]);
      b.onclick = () => {
        state.patterns[pattern][i][s] = state.patterns[pattern][i][s] ? 0 : 1;
        b.classList.toggle('on', !!state.patterns[pattern][i][s]);
        b.setAttribute('aria-pressed', !!state.patterns[pattern][i][s]);
        changed();
      };
      grid.append(b);
    }
  });
  $('patternLabel').textContent = '/ ' + 'ABCD'[pattern] + ' · BANK ' + 'ABCDEFGH'[state.padBank];
  paintPosition(lastStep);
}
function drawWave() {
  if (!state) return;
  const canvas = $('waveform'),
    r = canvas.getBoundingClientRect(),
    dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  const g = canvas.getContext('2d'),
    w = canvas.width,
    h = canvas.height,
    pad = state.pads[selected],
    data = buffers[pad.sample].getChannelData(0);
  g.fillStyle = '#344b3318';
  g.fillRect(pad.start * w, 0, (pad.end - pad.start) * w, h);
  g.strokeStyle = '#46613c';
  g.lineWidth = dpr;
  g.beginPath();
  for (let x = 0; x < w; x++) {
    let min = 1,
      max = -1,
      a = Math.floor((x / w) * data.length),
      b = Math.max(a + 1, Math.floor(((x + 1) / w) * data.length));
    for (let n = a; n < b; n++) {
      min = Math.min(min, data[n]);
      max = Math.max(max, data[n]);
    }
    g.moveTo(x, h / 2 + min * h * 0.43);
    g.lineTo(x, h / 2 + max * h * 0.43);
  }
  g.stroke();
  g.strokeStyle = '#304b28';
  for (const pos of [pad.start, pad.end]) {
    g.beginPath();
    g.moveTo(pos * w, 0);
    g.lineTo(pos * w, h);
    g.stroke();
  }
}
function changed(group = '') {
  recordEdit(group);
  revision++;
  $('saveState').textContent = 'SAVING…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 650);
}
function usedSamples() {
  return [
    ...new Set([...state.pads.map((p) => p.sample), ...(state.chop ? [state.chop.sample] : [])])
  ].filter((key) => !key.startsWith('kit'));
}
function sessionData() {
  return {
    state: structuredClone(state),
    samples: Object.fromEntries(
      usedSamples().map((key) => {
        let b = buffers[key];
        return [
          key,
          {
            rate: b.sampleRate,
            channels: Array.from({ length: b.numberOfChannels }, (_, c) =>
              b.getChannelData(c).slice()
            )
          }
        ];
      })
    )
  };
}
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('oma-beats', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('session');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function persist() {
  if (!db) {
    $('saveState').textContent = 'USE SAVE PROJECT';
    return Promise.resolve(false);
  }
  const payload = sessionData(),
    rev = revision;
  persistChain = persistChain
    .catch(() => {})
    .then(
      () =>
        new Promise((resolve, reject) => {
          const tx = db.transaction('session', 'readwrite');
          tx.objectStore('session').put(payload, 'current');
          tx.oncomplete = () => {
            if (rev === revision) $('saveState').textContent = 'SAVED ON THIS DEVICE';
            resolve(true);
          };
          tx.onerror = () => reject(tx.error);
        })
    )
    .catch((e) => {
      $('saveState').textContent = 'USE SAVE PROJECT';
      toast('Local save failed. Use Save project to keep a backup.');
      console.error(e);
      return false;
    });
  return persistChain;
}
function restoreSamples(samples) {
  const restored = {};
  for (const [key, item] of Object.entries(samples || {})) {
    if (
      key.startsWith('kit') ||
      !Array.isArray(item.channels) ||
      item.channels.length < 1 ||
      item.channels.length > 2 ||
      !Number.isFinite(item.rate) ||
      item.rate < 8000 ||
      item.rate > 192000
    )
      throw Error('Invalid sample data');
    let channels = item.channels.map((c) =>
      typeof c === 'string' ? decodeFloat(c) : new Float32Array(c)
    );
    if (
      !channels[0].length ||
      channels[0].length > item.rate * 120 ||
      channels.some((c) => c.length !== channels[0].length || c.some((v) => !Number.isFinite(v)))
    )
      throw Error('Invalid sample length or values');
    const b = ctx.createBuffer(channels.length, channels[0].length, item.rate);
    channels.forEach((c, i) => b.copyToChannel(c, i));
    restored[key] = b;
  }
  return restored;
}
function validate(s, samples) {
  const bounded = (v, min, max) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  SynthEngine.validateBanks(s?.synthBanks);
  const count = s?.version === 1 ? 16 : 128;
  if (
    !s ||
    ![1, 2].includes(s.version) ||
    (s.version === 2 && (!Number.isInteger(s.padBank) || !bounded(s.padBank, 0, 7))) ||
    typeof s.name !== 'string' ||
    s.name.length > 60 ||
    !bounded(s.bpm, 40, 240) ||
    !bounded(s.swing, 0, 60) ||
    !bounded(s.master, 0, 1) ||
    !Number.isInteger(s.pattern) ||
    !bounded(s.pattern, 0, 3) ||
    s.pads?.length !== count ||
    s.patterns?.length !== 4
  )
    throw Error('Not a valid Oma Beats project');
  if (
    s.bankMono !== undefined &&
    (!Array.isArray(s.bankMono) ||
      s.bankMono.length !== 8 ||
      s.bankMono.some((v) => typeof v !== 'boolean'))
  )
    throw Error('Invalid bank playback modes');
  if (s.playScope !== undefined && !['all', 'bank'].includes(s.playScope))
    throw Error('Invalid playback scope');
  if (s.choke !== undefined && typeof s.choke !== 'boolean') throw Error('Invalid playback mode');
  if (s.chop) {
    const c = s.chop;
    if (
      typeof c.name !== 'string' ||
      typeof c.sample !== 'string' ||
      !((buffers[c.sample] && c.sample.startsWith('kit')) || samples[c.sample]) ||
      !Array.isArray(c.markers) ||
      c.markers.length < 2 ||
      c.markers.length > 17 ||
      c.markers.some((v, i) => !bounded(v, 0, 1) || (i > 0 && v <= c.markers[i - 1]))
    )
      throw Error('Invalid chop markers');
    if (c.settings) {
      if (!Array.isArray(c.settings) || c.settings.length !== c.markers.length - 1)
        throw Error('Invalid cue settings');
      for (const p of c.settings) {
        if (
          !p ||
          !bounded(p.gain, 0, 1.5) ||
          !bounded(p.pitch, -24, 24) ||
          !bounded(p.cutoff, 20, 20000) ||
          !bounded(p.attack, 0, 2) ||
          !bounded(p.release, 0, 5) ||
          typeof p.reverse !== 'boolean'
        )
          throw Error('Invalid cue settings');
      }
    }
  }
  for (const p of s.pads) {
    for (const [key, min, max] of [
      ['attack', 0, 2],
      ['release', 0, 5],
      ['cutoff', 20, 20000]
    ])
      if (p[key] !== undefined && !bounded(p[key], min, max)) throw Error('Invalid sound control');
    if (
      typeof p.name !== 'string' ||
      p.name.length > 100 ||
      typeof p.sample !== 'string' ||
      !((buffers[p.sample] && p.sample.startsWith('kit')) || samples[p.sample]) ||
      typeof p.reverse !== 'boolean' ||
      !bounded(p.gain, 0, 1.5) ||
      !bounded(p.pitch, -24, 24) ||
      !bounded(p.start, 0, 1) ||
      !bounded(p.end, 0, 1) ||
      p.end - p.start < 1e-8
    )
      throw Error('Invalid pad settings');
  }
  for (const p of s.patterns)
    if (
      !Array.isArray(p) ||
      p.length !== count ||
      p.some(
        (row) => !Array.isArray(row) || row.length !== 16 || row.some((v) => !bounded(v, 0, 1))
      )
    )
      throw Error('Invalid pattern');
}
async function loadSample(file, index) {
  try {
    if (file.size > 32 * 1024 * 1024) throw Error('Please choose a sample smaller than 32 MB');
    const b = await ctx.decodeAudioData(await file.arrayBuffer());
    if (b.duration > 120) throw Error('Please choose a sample shorter than two minutes');
    if (b.numberOfChannels > 2) throw Error('Please choose a mono or stereo sample');
    const key = 'sample-' + crypto.randomUUID();
    buffers[key] = b;
    state.pads[index] = {
      name: file.name.replace(/\.[^.]+$/, '').slice(0, 100),
      sample: key,
      gain: 0.8,
      pitch: 0,
      start: 0,
      end: 1,
      reverse: false
    };
    selected = index;
    state.kit = 'custom';
    pruneBuffers();
    render();
    changed();
    toast('Sample loaded onto pad ' + (index + 1));
    openChopper();
  } catch (e) {
    toast(e.message || 'Could not decode that audio file');
  }
}
function pruneBuffers() {
  const used = new Set([
    ...state.pads.map((p) => p.sample),
    ...(state.chop ? [state.chop.sample] : [])
  ]);
  for (const key of Object.keys(buffers))
    if (!key.startsWith('kit') && !used.has(key)) delete buffers[key];
}
function demo() {
  const p = state.patterns[pattern];
  p.slice(bankOffset(), bankOffset() + 16).forEach((row) => row.fill(0));
  for (const [track, hits] of [
    [0, [0, 6, 8, 14]],
    [1, [4, 12]],
    [2, [0, 2, 4, 6, 8, 10, 12, 14]],
    [3, [7, 15]],
    [6, [10]],
    [8, [0, 8]],
    [12, [0, 10]]
  ])
    hits.forEach((s) => (p[bankOffset() + track][s] = track === 2 ? 0.65 : 1));
  state.swing = 18;
  render();
  changed();
}
function download(blob, name) {
  const a = document.createElement('a'),
    url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function filename() {
  return state.name.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Oma Beats';
}
function encodeFloat(data) {
  let bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    str = '';
  for (let i = 0; i < bytes.length; i += 8192)
    str += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(str);
}
function decodeFloat(value) {
  const str = atob(value),
    bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  if (bytes.byteLength % 4) throw Error('Invalid audio data');
  return new Float32Array(bytes.buffer);
}
function wav(buffer) {
  const frames = buffer.length,
    ch = 2,
    ab = new ArrayBuffer(44 + frames * ch * 2),
    v = new DataView(ab);
  const str = (o, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, ab.byteLength - 8, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, frames * 4, true);
  for (let c = 0; c < ch; c++) {
    const data = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
    for (let i = 0; i < frames; i++) {
      const x = Math.max(-1, Math.min(1, data[i]));
      v.setInt16(44 + (i * ch + c) * 2, Math.round(x * (x < 0 ? 32768 : 32767)), true);
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
async function exportWav() {
  const button = $('export');
  button.disabled = true;
  button.textContent = 'Rendering…';
  try {
    const unit = 60 / state.bpm / 4,
      loop = unit * 16;
    let tail = 0;
    state.pads.forEach((p, i) => {
      if (trackIsActive(i) && state.patterns[pattern][i].some(Boolean))
        tail = Math.max(
          tail,
          ((p.end - p.start) * buffers[p.sample].duration) / Math.pow(2, p.pitch / 12)
        );
    });
    const offline = new OfflineAudioContext(
        2,
        Math.ceil((loop * 4 + Math.min(tail, 120)) * 44100),
        44100
      ),
      gain = offline.createGain(),
      comp = offline.createDynamicsCompressor();
    gain.gain.value = state.master;
    comp.threshold.value = -6;
    comp.knee.value = 6;
    comp.ratio.value = 10;
    gain.connect(comp).connect(offline.destination);
    for (let repeat = 0; repeat < 4; repeat++)
      for (let s = 0; s < 16; s++)
        state.patterns[pattern].forEach((row, i) => {
          if (row[s] && trackIsActive(i))
            voice(offline, gain, state.pads[i], repeat * loop + stepOffset(s, unit), row[s], false);
        });
    const rendered = await offline.startRendering();
    download(wav(rendered), filename() + ' - ' + 'ABCD'[pattern] + '.wav');
    toast('WAV exported: four bars plus sample tail');
  } catch (e) {
    toast('Export failed: ' + e.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Export WAV ↗';
  }
}
function connectControls() {
  $('playScope').onchange = () => {
    const wasPlaying = playing;
    if (wasPlaying) stop();
    state.playScope = $('playScope').value;
    changed();
    if (wasPlaying) togglePlay();
  };
  $('play').onclick = togglePlay;
  $('record').onclick = () => {
    recording = !recording;
    $('record').classList.toggle('active', recording);
    $('record').setAttribute('aria-pressed', recording);
    toast(recording ? 'Record armed — play the pattern, then hit pads' : 'Recording off');
  };
  $('bpm').onchange = () => {
    state.bpm = Math.max(40, Math.min(240, Number($('bpm').value) || 90));
    $('bpm').value = state.bpm;
    if (playing) {
      stop();
      togglePlay();
    }
    changed();
  };
  $('swing').oninput = () => {
    state.swing = Number($('swing').value);
    $('swingValue').value = state.swing + '%';
    changed('swing');
  };
  $('master').oninput = () => {
    state.master = Number($('master').value);
    master.gain.setTargetAtTime(state.master, ctx.currentTime, 0.01);
    changed('master');
  };
  $('projectName').oninput = () => {
    state.name = $('projectName').value;
    changed('project-name');
  };
  for (const key of ['gain', 'pitch', 'start', 'end'])
    $(key).oninput = () => {
      const p = state.pads[selected];
      p[key] = Number($(key).value);
      if (key === 'start') p.start = Math.min(p.start, p.end - 0.005);
      if (key === 'end') p.end = Math.max(p.end, p.start + 0.005);
      renderSelected();
      changed('parameter-' + key);
    };
  $('reverse').onclick = () => {
    state.pads[selected].reverse = !state.pads[selected].reverse;
    renderSelected();
    changed();
  };
  $('loadSample').onclick = () => $('sampleFile').click();
  $('sampleFile').onchange = async (e) => {
    if (e.target.files[0]) await loadSample(e.target.files[0], selected);
    e.target.value = '';
  };
  $('clear').onclick = () => {
    if (confirm('Clear pattern ' + 'ABCD'[pattern] + ' across all pad banks?')) {
      state.patterns[pattern].forEach((row) => row.fill(0));
      renderSteps();
      changed();
    }
  };
  $('demo').onclick = () => {
    if (
      state.patterns[pattern].some((row) => row.some(Boolean)) &&
      !confirm('Replace this pattern with the demo beat?')
    )
      return;
    demo();
    toast('Demo loaded — press Play');
  };
  $('newProject').onclick = () => {
    if (!confirm('Start a new project? Save project first to keep this one.')) return;
    stop();
    state = defaults();
    pattern = 0;
    selected = 0;
    pruneBuffers();
    render();
    changed();
  };
  $('saveProject').onclick = () => {
    try {
      const data = sessionData();
      for (const sample of Object.values(data.samples))
        sample.channels = sample.channels.map(encodeFloat);
      download(
        new Blob([JSON.stringify(data)], { type: 'application/json' }),
        filename() + '.omabeats'
      );
      toast('Choose where to save your project');
    } catch (e) {
      toast('Save failed: ' + e.message);
    }
  };
  $('openProject').onclick = () => $('projectFile').click();
  $('projectFile').onchange = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 180 * 1024 * 1024) throw Error('Project is too large');
      const data = JSON.parse(await file.text()),
        restored = restoreSamples(data.samples);
      validate(data.state, restored);
      if (!confirm('Open this project and replace the current session?')) return;
      stop();
      Object.assign(buffers, restored);
      state = migrateState(data.state);
      pattern = state.pattern;
      selected = bankOffset();
      pruneBuffers();
      render();
      changed();
      toast('Project loaded');
    } catch (err) {
      toast('Could not open project: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };
  $('export').onclick = exportWav;
  $('help').onclick = () => $('guide').showModal();
  $('closeHelp').onclick = () => $('guide').close();
  window.addEventListener('keydown', (e) => {
    if (
      e.repeat ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) ||
      $('guide').open ||
      $('chopEditor').open ||
      $('sampleImporter').open ||
      $('packBrowser').open ||
      $('synthEditor').open
    )
      return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
      return;
    }
    const i = KEYS.indexOf(e.key.toLowerCase());
    if (i >= 0) {
      e.preventDefault();
      hit(bankOffset() + i);
    }
  });
  connectChopper();
  connectKits();
  connectImporter();
  connectPackBrowser();
  connectHistory();
  connectSynth();
  window.addEventListener('resize', drawWave);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(saveTimer);
      persist();
    }
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
}
async function init() {
  makeKit();
  makeExtraKits();
  state = defaults();
  let restored = false;
  try {
    db = await openDb();
    const saved = await new Promise((resolve, reject) => {
      const r = db.transaction('session').objectStore('session').get('current');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    if (saved) {
      const custom = restoreSamples(saved.samples);
      validate(saved.state, custom);
      Object.assign(buffers, custom);
      state = migrateState(saved.state);
      pattern = state.pattern;
      selected = bankOffset();
      restored = true;
    }
  } catch (e) {
    console.error(e);
    toast('Could not restore the last session. You can open a saved project.');
  }
  await loadPackCatalog();
  connectControls();
  render();
  if (!restored) {
    demo();
    state.swing = 18;
    render();
  } else $('saveState').textContent = 'SAVED ON THIS DEVICE';
  initHistory();
  connectDesktop();
}
init();

function renderPadBanks() {
  $('padBanks').replaceChildren();
  for (let bank = 0; bank < 8; bank++) {
    const button = document.createElement('button');
    button.textContent = 'ABCDEFGH'[bank];
    button.className = bank === state.padBank ? 'active' : '';
    button.setAttribute('aria-label', 'Pad bank ' + 'ABCDEFGH'[bank]);
    button.title =
      state.pads.slice(bank * 16, bank * 16 + 16).filter((p) => p.sample !== 'kit-empty').length +
      ' sounds loaded';
    button.onclick = () => {
      const restart = playing && state.playScope !== 'all';
      if (restart) stop();
      state.padBank = bank;
      selected = bank * 16;
      render();
      changed();
      if (restart) togglePlay();
    };
    $('padBanks').append(button);
  }
}
