'use strict';
// Keyboard workshop controls and a dedicated audition bus. Draft edits never write pads.
const Sampler = (() => {
  const fields = ['cursor', 'start', 'end', 'pitch', 'gain', 'cutoff', 'attack', 'release'];
  const labels = ['Cursor', 'Start', 'End', 'Pitch', 'Level', 'Filter', 'Attack', 'Release'];
  let focus = 'start',
    loop = false,
    gate = false,
    snap = 'transient',
    redo = [],
    draft = null,
    signature = '',
    preview = null,
    generation = 0,
    heldKey = null,
    editGroup = '',
    editTime = 0;
  const peakCache = new WeakMap();
  const snapshot = () => ({
    markers: chopDraft.markers.slice(),
    settings: structuredClone(chopDraft.settings),
    selected: chopSelected,
    cursor: chopCursor
  });
  function reset() {
    stop();
    draft = chopDraft;
    redo = [];
    signature = '';
    editGroup = '';
    heldKey = null;
  }
  function remember(group = '') {
    const now = Date.now();
    if (group && group === editGroup && now - editTime < 450) {
      editTime = now;
      return;
    }
    rememberChop();
    editGroup = group;
    editTime = now;
  }
  function clearRedo() {
    redo = [];
  }
  function restore(s) {
    chopDraft.markers = s.markers;
    chopDraft.settings = s.settings;
    chopSelected = s.selected;
    chopCursor = s.cursor ?? s.markers[s.selected];
    renderChopper();
  }
  function undo() {
    const prior = chopUndo.pop();
    if (!prior) return;
    redo.push(snapshot());
    editGroup = '';
    restore(prior);
  }
  function redoEdit() {
    const next = redo.pop();
    if (!next) return;
    chopUndo.push(snapshot());
    editGroup = '';
    restore(next);
  }
  function stop(release = false) {
    generation++;
    cancelAnimationFrame(previewAnimation);
    heldKey = null;
    const old = preview;
    preview = null;
    previewSource = null;
    if (old) {
      const at = ctx.currentTime,
        fade =
          release === true && old.mode === 'cue' ? Math.max(0.005, old.settings.release) : 0.005;
      try {
        old.gain.gain.cancelAndHoldAtTime(at);
        old.gain.gain.linearRampToValueAtTime(0, at + fade);
        old.source.stop(at + fade + 0.001);
      } catch {
        old.source.disconnect();
        old.filter.disconnect();
        old.gain.disconnect();
        activeSources.delete(old.source);
      }
    }

    paintTransport();
  }
  function paintTransport() {
    if (!$('samplerStatus')) return;
    $('previewSample').textContent =
      preview?.mode === 'source' ? '■ Stop source' : '▶ Source · Shift Space';
    $('auditionCue').textContent =
      preview?.mode === 'cue' ? '■ Stop cue · Space' : '▶ Play cue · Space';
    $('auditionCue').classList.toggle('active', preview?.mode === 'cue');
    $('samplerStatus').textContent = preview
      ? (preview.mode === 'source' ? 'SOURCE' : 'CUE ' + String(preview.cue + 1).padStart(2, '0')) +
        (preview.source.loop ? ' · LOOPING' : ' · PLAYING')
      : 'READY · SPACE TO AUDITION';
  }
  function position(at = ctx.currentTime) {
    if (!preview) return chopCursor;
    const p = preview,
      buffer = buffers[chopDraft.sample],
      span = p.end - p.start,
      delta = ((at - p.anchorTime) * p.rate) / buffer.duration;
    let offset = p.offset + (p.reverse ? -delta : delta);
    if (p.source.loop) offset = p.start + ((((offset - p.start) % span) + span) % span);
    return clamp(offset, p.start, p.end);
  }
  function tick() {
    if (!preview) return;
    chopCursor = position();
    drawChopper();
    previewAnimation = requestAnimationFrame(tick);
  }
  async function start(mode = 'cue', key = null) {
    stop();
    const request = generation,
      original = chopDraft;
    heldKey = key;
    await unlock();
    if (request !== generation || original !== chopDraft || !$('chopEditor').open) return;
    ensureCueSettings();
    const buffer = buffers[chopDraft.sample],
      settings = mode === 'cue' ? chopDraft.settings[chopSelected] : defaultCueSettings(),
      start = mode === 'cue' ? chopDraft.markers[chopSelected] : chopDraft.markers[0],
      end = mode === 'cue' ? chopDraft.markers[chopSelected + 1] : chopDraft.markers.at(-1),
      reverse = mode === 'cue' && settings.reverse,
      source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    let audio = buffer;
    if (reverse) {
      if (!reversedBuffers.has(buffer)) {
        audio = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
        for (let c = 0; c < buffer.numberOfChannels; c++)
          audio.copyToChannel(buffer.getChannelData(c).slice().reverse(), c);
        reversedBuffers.set(buffer, audio);
      }
      audio = reversedBuffers.get(buffer);
    }
    source.buffer = audio;
    const rate = 2 ** ((mode === 'cue' ? settings.pitch : 0) / 12),
      offset =
        mode === 'source'
          ? clamp(chopCursor >= end - cueGap() ? start : chopCursor, start, end - cueGap())
          : reverse
            ? end
            : start,
      at = ctx.currentTime;
    source.playbackRate.value = rate;
    source.loop = mode === 'cue' && loop;
    source.loopStart = (reverse ? 1 - end : start) * buffer.duration;
    source.loopEnd = (reverse ? 1 - start : end) * buffer.duration;
    filter.type = 'lowpass';
    filter.frequency.value = mode === 'cue' ? settings.cutoff : 20000;
    filter.Q.value = 0.707;
    source.connect(filter).connect(gain).connect(master);
    const length = ((reverse ? offset - start : end - offset) * buffer.duration) / rate,
      attack = Math.min(mode === 'cue' ? settings.attack : 0.003, length * 0.5),
      release = Math.min(mode === 'cue' ? settings.release : 0.008, Math.max(0, length - attack)),
      level = mode === 'cue' ? settings.gain : 0.65;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + attack);
    if (!source.loop) {
      gain.gain.setValueAtTime(level, at + length - release);
      gain.gain.linearRampToValueAtTime(0, at + length);
    }
    if (source.loop) source.start(at, (reverse ? 1 - offset : offset) * buffer.duration);
    else
      source.start(
        at,
        (reverse ? 1 - offset : offset) * buffer.duration,
        Math.max(1 / buffer.sampleRate, length * rate)
      );
    preview = {
      source,
      filter,
      gain,
      mode,
      cue: chopSelected,
      start,
      end,
      reverse,
      rate,
      offset,
      anchorTime: at,
      settings: { ...settings }
    };
    previewSource = source;
    heldKey = key;
    activeSources.add(source);
    source.onended = () => {
      activeSources.delete(source);
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      if (preview?.source === source) {
        preview = null;
        previewSource = null;
        heldKey = null;
        cancelAnimationFrame(previewAnimation);
        paintTransport();
      }
    };
    paintTransport();
    tick();
  }
  function source() {
    if (preview?.mode === 'source') stop();
    else return start('source');
  }
  function cue(retrigger = false, key = null) {
    if (!retrigger && preview?.mode === 'cue') stop();
    else return start('cue', key);
  }
  function updatePreview() {
    if (!preview || preview.mode !== 'cue') return;
    const s = chopDraft.settings[chopSelected],
      p = preview,
      at = ctx.currentTime,
      startAt = chopDraft.markers[chopSelected],
      endAt = chopDraft.markers[chopSelected + 1];
    if (
      p.cue !== chopSelected ||
      p.start !== startAt ||
      p.end !== endAt ||
      p.reverse !== s.reverse ||
      p.settings.attack !== s.attack ||
      p.settings.release !== s.release ||
      p.source.loop !== loop
    ) {
      const key = heldKey;
      void start('cue', key);
      return;
    }
    if (s.pitch !== p.settings.pitch) {
      p.offset = position(at);
      p.anchorTime = at;
      p.rate = 2 ** (s.pitch / 12);
      p.source.playbackRate.setValueAtTime(p.rate, at);
    }
    if (s.gain !== p.settings.gain) {
      p.gain.gain.cancelAndHoldAtTime(at);
      p.gain.gain.setTargetAtTime(s.gain, at, 0.008);
    }
    if (s.cutoff !== p.settings.cutoff) p.filter.frequency.setTargetAtTime(s.cutoff, at, 0.008);
    if (!p.source.loop && (s.gain !== p.settings.gain || s.pitch !== p.settings.pitch)) {
      const cursor = position(at),
        remaining =
          ((p.reverse ? cursor - p.start : p.end - cursor) * buffers[chopDraft.sample].duration) /
          p.rate,
        fade = Math.min(s.release, remaining);
      p.gain.gain.cancelAndHoldAtTime(at);
      p.gain.gain.linearRampToValueAtTime(
        s.gain,
        at + Math.min(0.008, Math.max(0, remaining - fade))
      );
      p.gain.gain.setValueAtTime(s.gain, at + Math.max(0, remaining - fade));
      p.gain.gain.linearRampToValueAtTime(0, at + remaining);
    }
    p.settings = { ...s };
  }
  function visible(position) {
    const span = chopView[1] - chopView[0];
    if (position < chopView[0] || position > chopView[1]) {
      const left = clamp(position - span / 2, 0, 1 - span);
      chopView = [left, left + span];
    }
  }
  function select(index, audition = false, key = null) {
    chopSelected = clamp(index, 0, chopDraft.markers.length - 2);
    chopCursor = chopDraft.markers[chopSelected];
    visible(chopCursor);
    renderChopper();
    if (audition) return start('cue', key);
  }
  function setFocus(value) {
    focus = value;
    render();
  }
  function nudge(direction, { fine = false, coarse = false } = {}) {
    ensureCueSettings();
    const buffer = buffers[chopDraft.sample],
      settings = chopDraft.settings[chopSelected],
      factor = fine ? 0.1 : coarse ? 10 : 1;
    if (['cursor', 'start', 'end'].includes(focus)) {
      const amount =
        direction * (fine ? 1 / buffer.length : (coarse ? 0.01 : 0.001) / buffer.duration);
      if (focus === 'cursor') {
        if (preview) stop();
        chopCursor = clamp(chopCursor + amount, chopDraft.markers[0], chopDraft.markers.at(-1));
      } else {
        remember('nudge-' + focus);
        const index = chopSelected + (focus === 'end' ? 1 : 0),
          marks = chopDraft.markers;
        marks[index] = clamp(
          marks[index] + amount,
          index ? marks[index - 1] + cueGap() : 0,
          index < marks.length - 1 ? marks[index + 1] - cueGap() : 1
        );
        chopCursor = marks[index];
      }
      visible(chopCursor);
    } else {
      remember('nudge-' + focus);
      const limits = {
        pitch: [-24, 24, 1],
        gain: [0, 1.5, 0.01],
        attack: [0, 2, 0.001],
        release: [0, 5, 0.001]
      };
      if (focus === 'cutoff')
        settings.cutoff = clamp(settings.cutoff * 2 ** ((direction * factor) / 12), 20, 20000);
      else {
        const [a, b, step] = limits[focus];
        settings[focus] = clamp(
          Number((settings[focus] + direction * step * factor).toFixed(6)),
          a,
          b
        );
      }
    }
    renderChopper();
  }
  function snapPoint(at) {
    const buffer = buffers[chopDraft.sample],
      data = buffer.getChannelData(0),
      center = Math.round(at * buffer.length),
      radius = Math.round(buffer.sampleRate * (snap === 'zero' ? 0.003 : 0.025));
    let best = center,
      score = snap === 'zero' ? Infinity : 0;
    if (snap === 'off') return at;
    if (snap === 'zero') {
      for (let i = Math.max(1, center - radius); i < Math.min(data.length, center + radius); i++)
        if (data[i] === 0 || Math.sign(data[i]) !== Math.sign(data[i - 1])) {
          const distance = Math.abs(i - center);
          if (distance < score) {
            score = distance;
            best = i;
          }
        }
    } else {
      const hop = Math.max(1, Math.round(buffer.sampleRate * 0.001));
      for (
        let i = Math.max(hop, center - radius);
        i < Math.min(data.length - hop, center + radius);
        i += hop
      ) {
        let before = 0,
          after = 0;
        for (let j = 0; j < hop; j++) {
          before += data[i - hop + j] ** 2;
          after += data[i + j] ** 2;
        }
        if (after - before > score) {
          score = after - before;
          best = i;
        }
      }
    }
    return best / buffer.length;
  }
  function snapBoundary() {
    if (!['start', 'end', 'cursor'].includes(focus)) return;
    remember();
    const marks = chopDraft.markers,
      index = chopSelected + (focus === 'end' ? 1 : 0),
      at = snapPoint(focus === 'cursor' ? chopCursor : marks[index]);
    if (focus === 'cursor') chopCursor = clamp(at, marks[0], marks.at(-1));
    else {
      marks[index] = clamp(
        at,
        index ? marks[index - 1] + cueGap() : 0,
        index < marks.length - 1 ? marks[index + 1] - cueGap() : 1
      );
      chopCursor = marks[index];
    }
    renderChopper();
  }
  function zoomCue() {
    const a = chopDraft.markers[chopSelected],
      b = chopDraft.markers[chopSelected + 1],
      margin = (b - a) * 0.07;
    chopView = [Math.max(0, a - margin), Math.min(1, b + margin)];
    drawChopper();
  }
  function trimAtCursor(end = false) {
    focus = end ? 'end' : 'start';
    remember();
    const marks = chopDraft.markers,
      i = chopSelected + (end ? 1 : 0);
    marks[i] = clamp(
      chopCursor,
      i ? marks[i - 1] + cueGap() : 0,
      i < marks.length - 1 ? marks[i + 1] - cueGap() : 1
    );
    renderChopper();
  }
  function render() {
    if (!$('samplerFocus')) return;
    if (draft !== chopDraft) reset();
    const current = JSON.stringify([chopDraft.markers, chopDraft.settings, chopSelected]);
    if (signature && signature !== current) updatePreview();
    signature = current;
    $('samplerFocus').textContent = labels[fields.indexOf(focus)];
    for (const [i, name] of fields.entries()) {
      const b = $('edit-' + name);
      b.classList.toggle('active', name === focus);
      b.setAttribute('aria-pressed', String(name === focus));
    }
    $('samplerLoop').classList.toggle('active', loop);
    $('samplerLoop').setAttribute('aria-pressed', String(loop));
    $('samplerGate').classList.toggle('active', gate);
    $('samplerGate').setAttribute('aria-pressed', String(gate));
    $('samplerSnap').textContent =
      'Snap: ' + { off: 'off', zero: 'zero crossing', transient: 'transient' }[snap] + ' · N';
    $('snapChops').checked = snap !== 'off';
    $('redoChop').disabled = !redo.length;
    $('samplerReadout').textContent = ['cursor', 'start', 'end'].includes(focus)
      ? '← → 1 ms · Shift 10 ms · Alt 1 sample'
      : '← → adjust · Shift coarse · Alt fine';
    $('samplerTarget').textContent =
      'Bank ' + 'ABCDEFGH'[state.padBank] + ' · pad ' + (Number($('chopDestination').value) + 1);
    $('samplerCount').textContent = $('chopCount').value + ' cues';
    paintTransport();
  }
  function keydown(e) {
    if (!$('chopEditor').open || e.isComposing) return;
    const mod = e.ctrlKey || e.metaKey,
      key = e.key.toLowerCase(),
      editing = e.target.matches(
        'input:not([type=range]):not([type=checkbox]),textarea,select,[contenteditable=true]'
      );
    if (mod && e.code === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) {
        if (['cueStart', 'cueEnd'].includes(e.target.id))
          e.target.dispatchEvent(new Event('change', { bubbles: true }));
        applyChops();
      }
      return;
    }
    if (editing) return;
    // Enter still activates a focused control; Space remains the audition shortcut.
    if (e.code === 'Enter' && e.target.tagName === 'BUTTON') return;
    if (mod && ['KeyZ', 'KeyY'].includes(e.code)) {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'KeyY' || e.shiftKey) redoEdit();
      else undo();
      return;
    }
    if (mod) return;
    const f = /^F([1-8])$/.exec(e.code);
    let handled = true;
    if (f) setFocus(fields[Number(f[1]) - 1]);
    else if (e.code === 'Space') {
      if (!e.repeat) {
        if (e.shiftKey) source();
        else cue(false, gate ? e.code : null);
      }
    } else if (e.code === 'Enter') {
      if (!e.repeat) cue(true, gate ? e.code : null);
    } else if (e.code === 'ArrowUp' || e.code === 'BracketLeft') select(chopSelected - 1);
    else if (e.code === 'ArrowDown' || e.code === 'BracketRight') select(chopSelected + 1);
    else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight')
      nudge(e.code === 'ArrowRight' ? 1 : -1, { fine: e.altKey, coarse: e.shiftKey });
    else if (e.code === 'Home' || e.code === 'End') {
      stop();
      chopCursor = chopDraft.markers[chopSelected + (e.code === 'End' ? 1 : 0)];
      visible(chopCursor);
      drawChopper();
    } else if (e.code === 'KeyB') {
      if (!e.repeat) findChops();
    } else if (e.code === 'KeyU') {
      if (!e.repeat) splitEvenly();
    } else if (e.code === 'KeyM') {
      if (!e.repeat) addCue(position());
    } else if (e.code === 'Delete' || e.code === 'Backspace') {
      if (!e.repeat) removeCue();
    } else if (e.code === 'Equal' || e.code === 'NumpadAdd') changeZoom(2);
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract') changeZoom(0.5);
    else if (e.code === 'KeyJ') zoomCue();
    else if (e.code === 'KeyO') {
      $('zoomFit').click();
    } else if (e.code === 'KeyL') {
      if (!e.repeat) $('samplerLoop').click();
    } else if (e.code === 'KeyH') {
      if (!e.repeat) $('samplerGate').click();
    } else if (e.code === 'KeyN') {
      if (!e.repeat) $('samplerSnap').click();
    } else if (e.code === 'KeyT') {
      if (!e.repeat) snapBoundary();
    } else if (e.code === 'F9') {
      if (!e.repeat) $('cueReverse').click();
    } else if (e.code === 'KeyI') {
      if (!e.repeat) trimAtCursor(false);
    } else if (e.code === 'KeyP') {
      if (!e.repeat) trimAtCursor(true);
    } else if (KEYS.includes(key)) {
      if (!e.repeat) {
        const i = KEYS.indexOf(key);
        if (i < chopDraft.markers.length - 1) select(i, true, gate ? e.code : null);
      }
    } else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
  function init() {
    $('chopEditor').addEventListener('keydown', keydown, { capture: true });
    $('chopEditor').addEventListener('keyup', (e) => {
      if (heldKey === e.code) {
        e.preventDefault();
        stop(true);
      }
    });
    $('chopEditor').addEventListener('close', stop);
    window.addEventListener('blur', () => {
      if ($('chopEditor').open) stop();
    });
    const focusControl = (e) => {
      const id = e.target.id;
      const map = { cueStart: 'start', cueEnd: 'end' };
      if (map[id]) setFocus(map[id]);
      else if (id.startsWith('cue-') && fields.includes(id.slice(4))) setFocus(id.slice(4));
    };
    $('chopEditor').addEventListener('pointerdown', focusControl);
    $('chopEditor').addEventListener('focusin', focusControl);
    fields.forEach((name) => ($('edit-' + name).onclick = () => setFocus(name)));
    $('samplerLoop').onclick = () => {
      loop = !loop;
      updatePreview();
      render();
    };
    $('samplerGate').onclick = () => {
      gate = !gate;
      if (!gate) heldKey = null;
      render();
    };
    $('samplerSnap').onclick = () => {
      snap = ['off', 'transient', 'zero'][(['off', 'transient', 'zero'].indexOf(snap) + 1) % 3];
      render();
    };
    $('samplerStop').onclick = stop;
    $('samplerRetrigger').onclick = () => cue(true);
    $('zoomCue').onclick = zoomCue;
    $('samplerSnapNow').onclick = snapBoundary;
    $('trimStart').onclick = () => trimAtCursor(false);
    $('trimEnd').onclick = () => trimAtCursor(true);
    $('redoChop').onclick = redoEdit;
    $('undoChop').onclick = undo;
    $('samplerCount').onclick = () => {
      const values = ['4', '8', '16'];
      $('chopCount').value = values[(values.indexOf($('chopCount').value) + 1) % 3];
      render();
    };
    $('targetPrevious').onclick = () => {
      $('chopDestination').value = String(Math.max(0, Number($('chopDestination').value) - 1));
      render();
    };
    $('targetNext').onclick = () => {
      $('chopDestination').value = String(Math.min(15, Number($('chopDestination').value) + 1));
      render();
    };
    $('samplerShortcuts').onclick = () => {
      $('samplerHelp').hidden = !$('samplerHelp').hidden;
      $('samplerShortcuts').setAttribute('aria-expanded', String(!$('samplerHelp').hidden));
    };
  }
  function peaks(buffer, start, end, width) {
    width = Math.max(1, width);
    let cache = peakCache.get(buffer);
    if (!cache) {
      const data = buffer.getChannelData(0),
        size = 256,
        low = new Float32Array(Math.ceil(data.length / size)),
        high = new Float32Array(low.length);
      for (let i = 0; i < data.length; i++) {
        const n = Math.floor(i / size);
        low[n] = Math.min(low[n], data[i]);
        high[n] = Math.max(high[n], data[i]);
      }
      cache = { data, low, high, views: new Map() };
      peakCache.set(buffer, cache);
    }
    const key = start + ':' + end + ':' + width;
    if (cache.views.has(key)) return cache.views.get(key);
    const low = new Float32Array(width),
      high = new Float32Array(width),
      data = cache.data;
    for (let x = 0; x < width; x++) {
      let i = Math.floor((start + (x / width) * (end - start)) * data.length),
        last = Math.min(
          data.length,
          Math.max(i + 1, Math.floor((start + ((x + 1) / width) * (end - start)) * data.length))
        );
      while (i < last) {
        if (i % 256 === 0 && i + 256 <= last) {
          low[x] = Math.min(low[x], cache.low[i / 256]);
          high[x] = Math.max(high[x], cache.high[i / 256]);
          i += 256;
        } else {
          low[x] = Math.min(low[x], data[i]);
          high[x] = Math.max(high[x], data[i]);
          i++;
        }
      }
    }
    const result = { low, high };
    if (cache.views.size >= 4) cache.views.delete(cache.views.keys().next().value);
    cache.views.set(key, result);
    return result;
  }
  return {
    init,
    reset,
    render,
    stop,
    source,
    cue,
    select,
    nudge,
    snapPoint,
    clearRedo,
    undo,
    redo: redoEdit,
    peaks,
    get focus() {
      return focus;
    },
    get preview() {
      return preview;
    },
    get generation() {
      return generation;
    }
  };
})();
