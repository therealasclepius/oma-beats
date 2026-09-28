'use strict';
// A non-destructive cue draft. Only Apply writes slices to the performance pads.
const defaultCueSettings = () => ({
  gain: 0.8,
  pitch: 0,
  cutoff: 20000,
  attack: 0.003,
  release: 0.008,
  reverse: false
});
function ensureCueSettings() {
  chopDraft.settings = Array.from({ length: chopDraft.markers.length - 1 }, (_, i) => ({
    ...defaultCueSettings(),
    ...(chopDraft.settings?.[i] || {})
  }));
}
let chopDraft = null,
  chopCursor = 0,
  chopSelected = 0,
  chopView = [0, 1],
  chopUndo = [],
  chopDrag = null,
  previewSource = null,
  previewOrigin = 0,
  previewOffset = 0,
  previewAnimation = 0;
const cueColors = [
  '#eb7952',
  '#e2af50',
  '#9bc570',
  '#59b4aa',
  '#67a6d6',
  '#ab8dcf',
  '#db8fb3',
  '#c9b782'
];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function cueGap() {
  return Math.max(1 / buffers[chopDraft.sample].length, 0.003 / buffers[chopDraft.sample].duration);
}
function rememberChop() {
  chopUndo.push({
    markers: chopDraft.markers.slice(),
    settings: structuredClone(chopDraft.settings || []),
    selected: chopSelected
  });
  if (chopUndo.length > 40) chopUndo.shift();
}
function openChopper() {
  if (state.pads[selected].sample === 'kit-empty') {
    showImporter();
    return;
  }
  const pad = state.pads[selected],
    saved = state.chop;
  chopDraft =
    saved?.sample === pad.sample
      ? structuredClone(saved)
      : { sample: pad.sample, name: pad.name, markers: [pad.start, pad.end] };
  chopSelected = 0;
  chopCursor = chopDraft.markers[0];
  chopView = [chopDraft.markers[0], chopDraft.markers.at(-1)];
  chopUndo = [];
  $('chopDestination').value = '0';
  $('chopEditor').showModal();
  renderChopper();
}
function stopPreview() {
  cancelAnimationFrame(previewAnimation);
  if (previewSource) {
    try {
      previewSource.stop();
    } catch {}
    previewSource = null;
  }
  $('previewSample').textContent = '▶ Preview source';
}
function closeChopper() {
  stopPreview();
  $('chopEditor').close();
}
function previewTick() {
  if (!previewSource) return;
  chopCursor = clamp(
    previewOffset + (ctx.currentTime - previewOrigin) / buffers[chopDraft.sample].duration,
    chopDraft.markers[0],
    chopDraft.markers.at(-1)
  );
  drawChopper();
  previewAnimation = requestAnimationFrame(previewTick);
}
async function previewSample() {
  if (previewSource) {
    stopPreview();
    return;
  }
  await unlock();
  const source = ctx.createBufferSource(),
    gain = ctx.createGain();
  source.buffer = buffers[chopDraft.sample];
  gain.gain.value = 0.65;
  source.connect(gain).connect(master);
  const end = chopDraft.markers.at(-1);
  if (chopCursor >= end - cueGap()) chopCursor = chopDraft.markers[0];
  previewOffset = chopCursor;
  previewOrigin = ctx.currentTime;
  source.start(
    ctx.currentTime,
    chopCursor * source.buffer.duration,
    (end - chopCursor) * source.buffer.duration
  );
  previewSource = source;
  activeSources.add(source);
  source.onended = () => {
    activeSources.delete(source);
    source.disconnect();
    gain.disconnect();
    if (previewSource === source) stopPreview();
  };
  $('previewSample').textContent = '■ Stop preview';
  previewTick();
}
function addCue(position = chopCursor) {
  const marks = chopDraft.markers,
    gap = cueGap();
  if (marks.length >= 17) {
    toast('Up to 16 chops fit on the pads');
    return;
  }
  if (marks.some((v) => Math.abs(v - position) < gap)) {
    toast('Move the cursor away from an existing marker');
    return;
  }
  if (position <= marks[0] || position >= marks.at(-1)) return;
  rememberChop();
  ensureCueSettings();
  const splitIndex = marks.findIndex(
    (m, i) => i < marks.length - 1 && position > m && position < marks[i + 1]
  );
  chopDraft.settings.splice(splitIndex + 1, 0, { ...chopDraft.settings[splitIndex] });
  marks.push(position);
  marks.sort((a, b) => a - b);
  chopSelected = marks.indexOf(position);
  renderChopper();
}
function removeCue() {
  if (chopSelected === 0) {
    toast('The first cue is the start of the selected region');
    return;
  }
  rememberChop();
  chopDraft.markers.splice(chopSelected, 1);
  chopDraft.settings.splice(chopSelected, 1);
  chopSelected = Math.max(0, chopSelected - 1);
  renderChopper();
}
function splitEvenly() {
  const count = Number($('chopCount').value),
    a = chopDraft.markers[0],
    b = chopDraft.markers.at(-1);
  if ((b - a) / count < cueGap()) {
    toast('Choose a longer sample region');
    return;
  }
  rememberChop();
  chopDraft.settings = [];
  chopDraft.markers = Array.from({ length: count + 1 }, (_, i) => a + ((b - a) * i) / count);
  chopSelected = 0;
  renderChopper();
}
// Detect positive changes in short-window RMS energy. Keep the strongest separated onsets.
function detectTransients(buffer, start, end, count, sensitivity) {
  const hop = Math.max(1, Math.round(buffer.sampleRate * 0.005)),
    first = Math.floor(start * buffer.length),
    last = Math.floor(end * buffer.length),
    envelope = [];
  for (let i = first; i < last; i += hop) {
    let energy = 0,
      n = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let j = i; j < Math.min(i + hop, last); j++) {
        energy += data[j] * data[j];
        n++;
      }
    }
    envelope.push(Math.sqrt(energy / Math.max(1, n)));
  }
  const flux = envelope.map((value, i) => Math.max(0, value - (envelope[i - 1] || 0))),
    peak = Math.max(0, ...flux),
    threshold = peak * (0.04 + ((100 - sensitivity) / 100) * 0.65),
    candidates = [];
  for (let i = 1; i < flux.length - 1; i++)
    if (flux[i] > threshold && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1])
      candidates.push({ position: (first + i * hop) / buffer.length, strength: flux[i] });
  candidates.sort((a, b) => b.strength - a.strength);
  const marks = [start],
    spacing = 0.065 / buffer.duration;
  for (const candidate of candidates) {
    if (marks.length >= count) break;
    if (
      candidate.position < end - spacing &&
      marks.every((v) => Math.abs(v - candidate.position) >= spacing)
    )
      marks.push(candidate.position);
  }
  return [...marks.sort((a, b) => a - b), end];
}
function findChops() {
  rememberChop();
  chopDraft.settings = [];
  chopDraft.markers = detectTransients(
    buffers[chopDraft.sample],
    chopDraft.markers[0],
    chopDraft.markers.at(-1),
    Number($('chopCount').value),
    Number($('sensitivity').value)
  );
  chopSelected = 0;
  renderChopper();
  toast(chopDraft.markers.length - 1 + ' chops found — drag markers to refine');
}
function renderChopper() {
  ensureCueSettings();
  renderCueControls();
  const marks = chopDraft.markers,
    duration = buffers[chopDraft.sample].duration;
  $('chopTitle').textContent = chopDraft.name;
  $('cueCount').textContent = marks.length - 1 + ' CUES';
  $('undoChop').disabled = !chopUndo.length;
  $('cueStart').value = (marks[chopSelected] * duration).toFixed(3);
  $('cueEnd').value = (marks[chopSelected + 1] * duration).toFixed(3);
  $('cueStart').min = (chopSelected ? marks[chopSelected - 1] * duration + 0.003 : 0).toFixed(3);
  $('cueStart').max = (marks[chopSelected + 1] * duration - 0.003).toFixed(3);
  $('cueEnd').min = (marks[chopSelected] * duration + 0.003).toFixed(3);
  $('cueEnd').max = (
    chopSelected + 2 < marks.length ? marks[chopSelected + 2] * duration - 0.003 : duration
  ).toFixed(3);
  $('cueList').replaceChildren();
  for (let i = 0; i < marks.length - 1; i++) {
    const b = document.createElement('button');
    b.className = 'cue-button' + (i === chopSelected ? ' selected' : '');
    b.style.setProperty('--cue', cueColors[i % 8]);
    b.textContent = String(i + 1).padStart(2, '0') + ' · ' + (marks[i] * duration).toFixed(2) + 's';
    b.setAttribute('aria-label', 'Select cue ' + (i + 1));
    b.onclick = () => {
      chopSelected = i;
      chopCursor = marks[i];
      renderChopper();
    };
    $('cueList').append(b);
  }
  $('applyChops').textContent = 'Apply ' + (marks.length - 1) + ' chops to pads';
  drawChopper();
}
function drawChopper() {
  if (!chopDraft || !$('chopEditor').open) return;
  const canvas = $('chopWave'),
    rect = canvas.getBoundingClientRect(),
    dpr = devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const g = canvas.getContext('2d'),
    w = canvas.width,
    h = canvas.height,
    [start, end] = chopView,
    span = end - start,
    buffer = buffers[chopDraft.sample],
    data = buffer.getChannelData(0),
    marks = chopDraft.markers;
  const x = (p) => ((p - start) / span) * w;
  g.fillStyle = '#232d2d';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < marks.length - 1; i++) {
    g.fillStyle = cueColors[i % 8] + (i === chopSelected ? '45' : '15');
    g.fillRect(x(marks[i]), 0, x(marks[i + 1]) - x(marks[i]), h);
  }
  g.strokeStyle = '#b9d4c1';
  g.lineWidth = dpr;
  g.beginPath();
  for (let px = 0; px < w; px++) {
    const a = Math.floor((start + (px / w) * span) * data.length),
      b = Math.min(
        data.length,
        Math.max(a + 1, Math.floor((start + ((px + 1) / w) * span) * data.length))
      );
    let min = 0,
      max = 0;
    for (let j = a; j < b; j++) {
      min = Math.min(min, data[j]);
      max = Math.max(max, data[j]);
    }
    g.moveTo(px, h / 2 + min * h * 0.35);
    g.lineTo(px, h / 2 + max * h * 0.35);
  }
  g.stroke();
  g.font = 11 * dpr + 'px monospace';
  for (let i = 0; i < marks.length; i++) {
    const px = x(marks[i]);
    g.strokeStyle = cueColors[i % 8];
    g.lineWidth = (i === chopSelected ? 3 : 1) * dpr;
    g.beginPath();
    g.moveTo(px, 0);
    g.lineTo(px, h);
    g.stroke();
    if (i < marks.length - 1) {
      g.fillStyle = cueColors[i % 8];
      g.fillRect(px, 0, 24 * dpr, 20 * dpr);
      g.fillStyle = '#16201b';
      g.fillText(String(i + 1).padStart(2, '0'), px + 4 * dpr, 14 * dpr);
    }
  }
  g.strokeStyle = '#fff';
  g.lineWidth = dpr;
  g.beginPath();
  g.moveTo(x(chopCursor), 22 * dpr);
  g.lineTo(x(chopCursor), h);
  g.stroke();
  $('chopTime').textContent =
    (chopCursor * buffer.duration).toFixed(3) + 's / ' + buffer.duration.toFixed(2) + 's';
  $('zoomReadout').textContent = (1 / span).toFixed(1) + '×';
  $('waveScroll').max = Math.max(0, 1 - span);
  $('waveScroll').value = start;
  $('waveScroll').disabled = span >= 0.99999;
  drawChopOverview();
}
function changeZoom(factor) {
  const oldSpan = chopView[1] - chopView[0],
    span = clamp(oldSpan / factor, 0.005, 1),
    center = clamp(chopCursor, chopView[0], chopView[1]),
    start = clamp(center - span / 2, 0, 1 - span);
  chopView = [start, start + span];
  drawChopper();
}
function applyChops() {
  const count = chopDraft.markers.length - 1,
    local = Number($('chopDestination').value),
    start = bankOffset() + local;
  if (local + count > 16) {
    toast('These chops need ' + count + ' pads. Choose an earlier starting pad.');
    return;
  }
  if (
    !confirm(
      'Replace bank ' +
        'ABCDEFGH'[state.padBank] +
        ' pads ' +
        (local + 1) +
        '–' +
        (local + count) +
        ' with these chops? Existing patterns stay.'
    )
  )
    return;
  stop();
  const original = { ...state.pads[selected] };
  for (let i = 0; i < count; i++)
    state.pads[start + i] = {
      ...original,
      name: 'Chop ' + String(i + 1).padStart(2, '0'),
      sample: chopDraft.sample,
      start: chopDraft.markers[i],
      end: chopDraft.markers[i + 1],
      ...chopDraft.settings[i]
    };
  state.chop = structuredClone(chopDraft);
  state.kit = 'custom';
  state.bankMono[state.padBank] = true;
  selected = start;
  pruneBuffers();
  render();
  changed();
  closeChopper();
  toast(count + ' chops assigned — mono bank enabled');
}
function chromaticPads() {
  if (
    !confirm(
      'Spread the selected sound across all 16 pads in this bank at semitone intervals? This replaces this bank and keeps your patterns.'
    )
  )
    return;
  stop();
  state.kit = 'custom';
  const source = { ...state.pads[selected] };
  state.pads.splice(
    bankOffset(),
    16,
    ...Array.from({ length: 16 }, (_, i) => ({
      ...source,
      name: source.name.slice(0, 75) + ' ' + (i - 8 >= 0 ? '+' : '') + (i - 8) + ' st',
      pitch: clamp(source.pitch + i - 8, -24, 24)
    }))
  );
  selected = bankOffset() + 8;
  pruneBuffers();
  render();
  changed();
  toast('Chromatic pads ready — pad 9 is the original pitch');
}
function connectChopper() {
  $('chop').textContent = '✂ Chop editor';
  $('chop').onclick = openChopper;
  $('closeChopper').onclick = closeChopper;
  $('chopEditor').addEventListener('cancel', stopPreview);
  $('findChops').onclick = findChops;
  $('evenChops').onclick = splitEvenly;
  $('addCue').onclick = () => addCue();
  $('deleteCue').onclick = removeCue;
  $('undoChop').onclick = () => {
    const prior = chopUndo.pop();
    if (prior) {
      chopDraft.markers = prior.markers;
      chopDraft.settings = prior.settings;
      chopSelected = prior.selected;
      renderChopper();
    }
  };
  $('previewSample').onclick = previewSample;
  $('auditionCue').onclick = async () => {
    stopPreview();
    await unlock();
    const p = {
      ...state.pads[selected],
      sample: chopDraft.sample,
      start: chopDraft.markers[chopSelected],
      end: chopDraft.markers[chopSelected + 1],
      ...chopDraft.settings[chopSelected]
    };
    previewSource = voice(ctx, master, p, ctx.currentTime);
    const s = previewSource,
      ended = s.onended;
    s.onended = () => {
      ended?.();
      if (previewSource === s) stopPreview();
    };
  };
  $('applyChops').onclick = applyChops;
  $('zoomIn').onclick = () => changeZoom(2);
  $('zoomOut').onclick = () => changeZoom(0.5);
  $('zoomFit').onclick = () => {
    chopView = [0, 1];
    drawChopper();
  };
  $('waveScroll').oninput = () => {
    const span = chopView[1] - chopView[0],
      start = Number($('waveScroll').value);
    chopView = [start, start + span];
    drawChopper();
  };
  for (const id of ['cueStart', 'cueEnd'])
    $(id).onchange = () => {
      const index = chopSelected + (id === 'cueEnd' ? 1 : 0),
        marks = chopDraft.markers,
        duration = buffers[chopDraft.sample].duration,
        value = Number($(id).value) / duration;
      if (!Number.isFinite(value)) {
        renderChopper();
        return;
      }
      rememberChop();
      marks[index] = clamp(
        value,
        index ? marks[index - 1] + cueGap() : 0,
        index < marks.length - 1 ? marks[index + 1] - cueGap() : 1
      );
      renderChopper();
    };
  const canvas = $('chopWave'),
    point = (e) => {
      const r = canvas.getBoundingClientRect();
      return clamp(
        chopView[0] + ((e.clientX - r.left) / r.width) * (chopView[1] - chopView[0]),
        0,
        1
      );
    };
  canvas.onpointerdown = (e) => {
    const pos = point(e),
      r = canvas.getBoundingClientRect(),
      tolerance = (8 / r.width) * (chopView[1] - chopView[0]),
      marks = chopDraft.markers,
      index = marks.findIndex((m) => Math.abs(m - pos) < tolerance);
    stopPreview();
    chopCursor = pos;
    if (index >= 0) {
      rememberChop();
      chopDrag = index;
      chopSelected = Math.min(index, marks.length - 2);
      canvas.setPointerCapture(e.pointerId);
    } else {
      chopSelected = Math.max(
        0,
        marks.findIndex((m, i) => i < marks.length - 1 && pos >= m && pos < marks[i + 1])
      );
      if (e.shiftKey) addCue(pos);
    }
    renderChopper();
  };
  canvas.onpointermove = (e) => {
    if (chopDrag === null) return;
    const marks = chopDraft.markers,
      index = chopDrag;
    marks[index] = clamp(
      point(e),
      index ? marks[index - 1] + cueGap() : 0,
      index < marks.length - 1 ? marks[index + 1] - cueGap() : 1
    );
    renderChopper();
  };
  canvas.onpointerup = () => {
    chopDrag = null;
  };
  canvas.onpointercancel = () => {
    chopDrag = null;
  };
  canvas.ondblclick = (e) => addCue(point(e));
  $('choke').onclick = () => {
    const bank = state.padBank;
    monoVoices.get(ctx)?.delete(bank);
    state.bankMono[bank] = !state.bankMono[bank];
    if (state.bankMono[bank])
      for (const source of activeSources)
        if (source.omaBank === bank) {
          try {
            source.stop();
          } catch {}
        }
    renderChopControls();
    changed();
    toast(
      'Bank ' +
        'ABCDEFGH'[bank] +
        (state.bankMono[bank] ? ' · mono: one sound at a time' : ' · poly: sounds can overlap')
    );
  };
  $('chromatic').onclick = chromaticPads;
  $('chopEditor').addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT'].includes(e.target.tagName)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      previewSample();
    }
    if (e.code === 'KeyM') {
      e.preventDefault();
      addCue();
    }
    if (e.code === 'Delete') {
      e.preventDefault();
      removeCue();
    }
  });
  connectCueControls();
  window.addEventListener('resize', drawChopper);
}
function renderChopControls() {
  if (!$('choke')) return;
  $('choke').classList.toggle('active', !!state.bankMono?.[state.padBank]);
  $('choke').setAttribute('aria-pressed', !!state.bankMono?.[state.padBank]);
}

function renderCueControls() {
  const settings = chopDraft.settings[chopSelected];
  $('cueControlTitle').textContent = 'CUE ' + String(chopSelected + 1).padStart(2, '0');
  for (const key of ['gain', 'pitch', 'cutoff', 'attack', 'release']) {
    const input = $('cue-' + key),
      value = settings[key];
    input.value = key === 'cutoff' ? (Math.log(value / 20) / Math.log(1000)) * 100 : value;
    $('cue-' + key + '-value').value =
      key === 'gain'
        ? Math.round(value * 100) + '%'
        : key === 'pitch'
          ? (value > 0 ? '+' : '') + value + ' st'
          : key === 'cutoff'
            ? value >= 1000
              ? (value / 1000).toFixed(1) + ' kHz'
              : Math.round(value) + ' Hz'
            : Math.round(value * 1000) + ' ms';
  }
  $('cueReverse').classList.toggle('active', settings.reverse);
  $('cueReverse').setAttribute('aria-pressed', settings.reverse);
}
function connectCueControls() {
  for (const key of ['gain', 'pitch', 'cutoff', 'attack', 'release']) {
    const input = $('cue-' + key);
    input.onpointerdown = rememberChop;
    input.onkeydown = (e) => {
      if (e.key.startsWith('Arrow')) rememberChop();
    };
    input.oninput = () => {
      const value = Number(input.value);
      chopDraft.settings[chopSelected][key] =
        key === 'cutoff' ? 20 * Math.pow(1000, value / 100) : value;
      renderCueControls();
      $('undoChop').disabled = false;
    };
  }
  $('cueReverse').onclick = () => {
    rememberChop();
    chopDraft.settings[chopSelected].reverse = !chopDraft.settings[chopSelected].reverse;
    renderChopper();
  };
  $('cueReset').onclick = () => {
    rememberChop();
    chopDraft.settings[chopSelected] = defaultCueSettings();
    renderChopper();
  };
  $('randomChops').onclick = () => {
    rememberChop();
    const marks = chopDraft.markers,
      a = marks[0],
      b = marks.at(-1),
      count = Number($('chopCount').value);
    if ((b - a) / count < cueGap() * 2) {
      toast('Choose a longer region for random chops');
      return;
    }
    chopDraft.markers = [
      a,
      ...Array.from(
        { length: count - 1 },
        (_, i) => a + ((b - a) * (i + 1 + (Math.random() - 0.5) * 0.7)) / count
      ),
      b
    ];
    chopDraft.settings = [];
    chopSelected = 0;
    renderChopper();
  };
  $('chopOverview').onpointerdown = (e) => {
    const rect = e.currentTarget.getBoundingClientRect(),
      position = clamp((e.clientX - rect.left) / rect.width, 0, 1),
      span = chopView[1] - chopView[0],
      start = clamp(position - span / 2, 0, 1 - span);
    chopView = [start, start + span];
    chopCursor = position;
    drawChopper();
  };
}
function drawChopOverview() {
  const canvas = $('chopOverview'),
    r = canvas.getBoundingClientRect(),
    dpr = devicePixelRatio || 1;
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  const g = canvas.getContext('2d'),
    w = canvas.width,
    h = canvas.height,
    data = buffers[chopDraft.sample].getChannelData(0),
    marks = chopDraft.markers;
  g.fillStyle = '#151c1d';
  g.fillRect(0, 0, w, h);
  let cue = 0;
  for (let x = 0; x < w; x++) {
    const pos = x / w;
    while (cue < marks.length - 2 && pos >= marks[cue + 1]) cue++;
    let peak = 0;
    for (let i = Math.floor(pos * data.length); i < Math.floor(((x + 1) / w) * data.length); i++)
      peak = Math.max(peak, Math.abs(data[i]));
    g.fillStyle = cueColors[cue % 8];
    g.fillRect(x, h / 2 - peak * h * 0.43, dpr, Math.max(dpr, peak * h * 0.86));
  }
  g.fillStyle = '#e7f6e526';
  g.fillRect(chopView[0] * w, 0, (chopView[1] - chopView[0]) * w, h);
  g.strokeStyle = '#e7f6e5';
  g.lineWidth = 2 * dpr;
  g.strokeRect(chopView[0] * w, 0, (chopView[1] - chopView[0]) * w, h);
  g.fillStyle = '#fff';
  g.fillRect(chopCursor * w, 0, dpr, h);
}
