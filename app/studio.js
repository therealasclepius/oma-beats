'use strict';
const Studio = (() => {
  let mix = null,
    ticker = null,
    origin = 0,
    scheduled = 0,
    timeline = [],
    total = 0,
    songEnd = 0,
    token = 0,
    view = 'pads',
    bar = 0,
    held = new Map(),
    live = new Set(),
    mono = new Map(),
    chokes = new WeakMap(),
    midiAccess = null,
    bend = 0,
    replacePass = new Set(),
    selectedNote = null,
    stretchWorker = null,
    stretchToken = 0,
    rollOctave = 0;
  const perf = () => state.studio.performance;
  const seq = () => state.studio.sequences[pattern];
  const activeBank = (bank) => state.playScope === 'all' || bank === state.padBank;
  const instrument = (bank) => currentInstrument(bank);
  function ensureMixer() {
    if (!mix) mix = StudioAudio.mixer(ctx, master, state.studio.tracks, state.bpm);
    return mix;
  }
  function syncMixer() {
    if (mix) mix.update(state.studio.tracks, state.bpm);
  }
  function trackVoice(handle, bank, group, audio, time) {
    if (!handle) return handle;
    handle.omaBank = bank;
    if (audio === ctx) {
      live.add(handle);
      const ended = handle.onended;
      handle.onended = () => {
        live.delete(handle);
        ended?.();
      };
    }
    if (group) {
      let map = chokes.get(audio);
      if (!map) {
        map = new Map();
        chokes.set(audio, map);
      }
      const entries = (map.get(group) || []).filter(
        (v) => !v.handle.ended && v.time >= audio.currentTime - 120
      );
      const prev = entries.filter((v) => v.time <= time).at(-1),
        next = entries.find((v) => v.time > time);
      if (prev) {
        try {
          prev.handle.stop(time);
        } catch {}
      }
      if (next) {
        try {
          handle.stop(next.time);
        } catch {}
      }
      entries.push({ handle, time });
      entries.sort((a, b) => a.time - b.time);
      map.set(group, entries);
    }
    return handle;
  }
  function trigger(audio, bus, event, time, seconds = null) {
    const bank = Math.floor(event.pad / 16),
      pad = state.pads[event.pad],
      inst = instrument(bank),
      group = pad.chokeGroup ? bank + ':' + pad.chokeGroup : null;
    bus.trigger(bank, time, state.studio.tracks);
    if (inst) {
      const note = event.midi ?? SynthEngine.notes(inst.patch)[event.pad % 16],
        h = StudioAudio.synth(
          audio,
          bus.channels[bank].input,
          inst.patch,
          note + pad.pitch,
          time,
          event.velocity * pad.gain
        );
      if (seconds !== null) h.release(time + seconds);
      return trackVoice(h, bank, state.bankMono[bank] ? 'mono:' + bank : group, audio, time);
    }
    const source = voice(
      audio,
      bus.channels[bank].input,
      pad,
      time,
      event.velocity,
      audio === ctx,
      bank
    );
    if (!source) return null;
    source.ended = false;
    const ended = source.onended;
    source.onended = () => {
      source.ended = true;
      ended?.();
    };
    const gateRelease = source.release;
    source.release = (at = audio.currentTime) => {
      if (pad.playMode === 'gate') gateRelease(at);
    };
    if (seconds !== null && pad.playMode === 'gate') source.release(time + seconds);
    return trackVoice(source, bank, group, audio, time);
  }
  function position(at = ctx.currentTime) {
    const beat = ((at - origin) * state.bpm) / 60;
    if (beat < 0) return { beat, sequence: pattern, time: 0, cycle: -1 };
    const cycle = state.studio.mode === 'song' ? 0 : Math.floor(beat / total),
      local = beat - cycle * total,
      slot = timeline.find((s) => local >= s.start && local < s.end) || timeline.at(-1);
    return {
      beat,
      sequence: slot?.sequence ?? pattern,
      time: slot ? local - slot.start : 0,
      cycle,
      slotStart: slot?.start || 0
    };
  }
  async function toggle() {
    if (playing) {
      stopAll();
      return;
    }
    const request = ++token;
    await unlock();
    if (request !== token) return;
    timeline = StudioModel.arrangement(state, pattern);
    if (!timeline.length) {
      toast('Add sequences to the song first');
      return;
    }
    total = timeline.at(-1).end;
    songEnd = renderLength(timeline);
    ensureMixer();
    syncMixer();
    origin = ctx.currentTime + 0.05 + (recording ? (perf().countIn * 4 * 60) / state.bpm : 0);
    scheduled = -(recording ? perf().countIn * 4 : 0);
    replacePass.clear();
    playing = true;
    playStart = origin;
    $('play').textContent = '■ Stop';
    $('play').classList.add('active');
    if (!ticker) {
      try {
        ticker = new Worker('clock-worker.js');
        ticker.onmessage = tick;
      } catch {
        ticker = null;
      }
    }
    if (ticker) ticker.postMessage('start');
    else scheduler = setInterval(tick, 25);
    tick();
  }
  function tick() {
    if (!playing) return;
    const elapsed = ((ctx.currentTime - origin) * state.bpm) / 60,
      horizon = ((ctx.currentTime + 0.13 - origin) * state.bpm) / 60;
    if (elapsed - scheduled > 0.5) scheduled = elapsed;
    const first = Math.max(0, Math.floor(scheduled / total)),
      last = Math.max(0, Math.floor(horizon / total));
    for (let cycle = first; cycle <= last; cycle++) {
      if (state.studio.mode === 'song' && cycle) break;
      for (const slot of timeline) {
        const start = cycle * total + slot.start,
          p = slot.sequence;
        if (start + StudioModel.beats(state, p) < scheduled || start >= horizon) continue;
        for (const a of state.studio.sequences[p].automation) {
          const beat = start + a.time;
          if (beat >= scheduled && beat < horizon)
            mix.automate(
              a.track,
              a.param,
              a.value,
              origin + (beat * 60) / state.bpm,
              state.studio.tracks
            );
        }
        for (const event of StudioModel.events(state, p)) {
          const beat = start + event.time;
          if (beat < scheduled || beat >= horizon || !activeBank(Math.floor(event.pad / 16)))
            continue;
          const at = origin + (beat * 60) / state.bpm;
          trigger(ctx, mix, event, at, (event.duration * 60) / state.bpm);
          const timer = setTimeout(
            () => {
              if (playing) flash(event.pad);
              visualTimers = visualTimers.filter((t) => t !== timer);
            },
            Math.max(0, (at - ctx.currentTime) * 1000)
          );
          visualTimers.push(timer);
        }
      }
    }
    if (perf().metronome || elapsed < 0) {
      for (let beat = Math.ceil(scheduled); beat < horizon; beat++) {
        if (beat >= 0 && !perf().metronome) continue;
        if (state.studio.mode === 'song' && beat >= total) continue;
        const o = StudioAudio.click(ctx, master, origin + (beat * 60) / state.bpm, beat % 4 === 0);
        activeSources.add(o);
        const end = o.onended;
        o.onended = () => {
          activeSources.delete(o);
          end?.();
        };
      }
    }
    scheduled = horizon;
    const pos = position();
    if (pos.beat < 0) $('position').textContent = 'COUNT IN ' + Math.ceil(-pos.beat);
    else {
      lastStep = Math.floor(pos.time * 4);
      $('position').textContent =
        (state.studio.sequences[pos.sequence]?.name || '') +
        ' · ' +
        (Math.floor(pos.time / 4) + 1) +
        '.' +
        ((Math.floor(pos.time) % 4) + 1);
      paintGrid(lastStep);
    }
    updateMeters();
    if (state.studio.mode === 'song' && elapsed >= (songEnd * state.bpm) / 60) stopAll();
  }
  function paintGrid(step) {
    document
      .querySelectorAll('[data-step]')
      .forEach((el) => el.classList.toggle('current', Number(el.dataset.step) === step));
    const line = $('rollPlayhead');
    if (line) line.style.left = 84 + (step / 4) * 48 + 'px';
  }
  function releaseAll() {
    for (const h of held.values()) releaseHeld(h);
    held.clear();
    for (const h of live) {
      try {
        h.stop();
      } catch {}
    }
    live.clear();
    mono.clear();
    chokes = new WeakMap();
  }
  function cutBank(bank) {
    for (const [key, item] of held) if (Math.floor(item.pad / 16) === bank) release(key);
    for (const h of live)
      if (h.omaBank === bank) {
        try {
          h.stop();
        } catch {}
      }
    mono.delete(bank);
  }
  function stopAll() {
    token++;
    playing = false;
    ticker?.postMessage('stop');
    clearInterval(scheduler);
    visualTimers.forEach(clearTimeout);
    visualTimers = [];
    releaseAll();
    for (const source of activeSources) {
      try {
        source.stop();
      } catch {}
    }
    activeSources.clear();
    monoVoices.delete(ctx);
    if (mix) {
      mix.dispose();
      mix = null;
    }
    $('play').textContent = '▶ Play';
    $('play').classList.remove('active');
    paintGrid(-1);
    lastStep = -1;
    $('position').textContent = 'STOPPED';
  }
  function record(event, when = ctx.currentTime) {
    if (!recording || !playing) return null;
    const pos = position(when);
    if (pos.beat < 0 || pos.time >= StudioModel.beats(state, pos.sequence)) return null;
    const bank = Math.floor(event.pad / 16),
      key = pos.sequence + ':' + bank + ':' + pos.cycle + ':' + pos.slotStart;
    if (perf().recordMode === 'replace' && !replacePass.has(key)) {
      state.patterns[pos.sequence].slice(bank * 16, bank * 16 + 16).forEach((r) => r.fill(0));
      state.studio.sequences[pos.sequence].notes = state.studio.sequences[
        pos.sequence
      ].notes.filter((n) => Math.floor(n.pad / 16) !== bank);
      replacePass.add(key);
    }
    const note = {
      id: crypto.randomUUID(),
      ...event,
      time: StudioModel.quantize(
        pos.time,
        perf().quantize,
        perf().strength,
        StudioModel.beats(state, pos.sequence)
      ),
      duration: 0.25
    };
    const list = state.studio.sequences[pos.sequence].notes;
    if (list.length >= 16384) {
      toast('This sequence is full');
      return null;
    }
    list.push(note);
    return { note, sequence: pos.sequence, at: when };
  }
  function single(pad, velocity, midi, time = ctx.currentTime, duration = null) {
    const bank = Math.floor(pad / 16),
      inst = instrument(bank);
    let h,
      gliding = false;
    const note =
      (midi ?? (inst ? SynthEngine.notes(inst.patch)[pad % 16] : 0)) + state.pads[pad].pitch;
    if (
      inst &&
      state.bankMono[bank] &&
      mono.get(bank) &&
      !mono.get(bank).released &&
      !mono.get(bank).ended &&
      perf().glide &&
      duration === null
    ) {
      h = mono.get(bank);
      h.pitch(note, bend, perf().glide, time);
      gliding = true;
    } else {
      h = trigger(ctx, ensureMixer(), { pad, velocity, midi, duration: 0.25 }, time, duration);
      if (inst && state.bankMono[bank]) mono.set(bank, h);
    }
    if (h && inst) {
      h.baseMidi = note;
      if (bend && !gliding) h.pitch(note, bend, 0, time);
    }
    flash(pad);
    return h;
  }
  async function press(pad, velocity = 1, midi = null, key = 'tap:' + pad) {
    if (held.has(key)) return;
    const marker = {
      handles: [],
      records: [],
      pendingRecords: [],
      released: false,
      timer: null,
      pad,
      midi,
      velocity
    };
    held.set(key, marker);
    await unlock();
    if (marker.released || held.get(key) !== marker) return;
    selected = pad;
    renderSelected();
    if (state.pads[pad].sample === 'kit-empty' && !instrument(Math.floor(pad / 16))) {
      held.delete(key);
      toast('Load a sound into this pad first');
      return;
    }
    const v = Math.max(0.01, Math.min(1, velocity) ** perf().velocityCurve),
      inst = instrument(Math.floor(pad / 16)),
      root = midi ?? (inst ? SynthEngine.notes(inst.patch)[pad % 16] : null),
      intervals = inst
        ? { off: [0], minor: [0, 3, 7], major: [0, 4, 7], seventh: [0, 4, 7, 10] }[perf().chord]
        : [0];
    let count = 0;
    const repeating = !!(perf().repeat || perf().arp),
      interval = (perf().repeat || 0.25) * (perf().triplet ? 2 / 3 : 1),
      seconds = (interval * 60) / state.bpm;
    marker.next = ctx.currentTime + 0.005;
    const fire = () => {
      if (marker.released) return;
      if (repeating && marker.next >= ctx.currentTime + 0.1) {
        marker.timer = setTimeout(fire, 25);
        return;
      }
      marker.pendingRecords = marker.pendingRecords.filter((r) => r.at > ctx.currentTime);
      let recorded = false;
      // Schedule repeats on the audio clock; timer jitter does not alter note spacing.
      if (marker.next < ctx.currentTime - 0.1) marker.next = ctx.currentTime;
      do {
        const at = marker.next,
          notes = perf().arp && inst ? [intervals[count++ % intervals.length]] : intervals;
        for (const offset of notes) {
          const note = root === null ? null : Math.min(107, root + offset),
            h = single(pad, v, note, at, repeating ? seconds * 0.85 : null),
            r = record({ pad, velocity: v, midi: note }, at);
          marker.handles = marker.handles.filter((v) => !v.ended);
          if (h) {
            h.startedAt = at;
            marker.handles.push(h);
          }
          if (r) {
            recorded = true;
            if (repeating) {
              r.note.duration = interval * 0.85;
              marker.pendingRecords.push(r);
            } else marker.records.push(r);
          }
        }
        marker.next += seconds;
      } while (repeating && marker.next < ctx.currentTime + 0.1);
      if (recorded) changed('record');
      if (repeating) marker.timer = setTimeout(fire, 25);
    };
    fire();
  }
  function releaseHeld(item) {
    item.released = true;
    clearTimeout(item.timer);
    const now = ctx.currentTime;
    for (const h of item.handles)
      if (
        ![...held.values()].some(
          (other) => other !== item && other.handles.includes(h) && !other.released
        )
      ) {
        if (h.startedAt > now) {
          try {
            h.stop(now);
          } catch {}
        } else h?.release?.(now);
      }
    let cancelled = false;
    for (const r of item.pendingRecords)
      if (r.at > now) {
        const sequence = state.studio.sequences[r.sequence];
        sequence.notes = sequence.notes.filter((n) => n !== r.note);
        cancelled = true;
      }
    for (const r of item.records) {
      r.note.duration = Math.max(1 / 960, Math.min(64, ((now - r.at) * state.bpm) / 60));
    }
    if (cancelled || item.records.length || recording) {
      changed('record');
      renderSteps();
      if (view === 'piano') renderRoll();
    }
  }
  function release(key) {
    const item = held.get(key);
    if (item) {
      held.delete(key);
      releaseHeld(item);
    }
  }
  function tap(pad, velocity = 1) {
    const key = 'tap:' + crypto.randomUUID();
    press(pad, velocity, null, key).then(() => setTimeout(() => release(key), 200));
  }
  function wirePad(button, pad) {
    button.onclick = (e) => {
      if (e.detail === 0) tap(pad);
    };
    button.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      press(
        pad,
        e.pointerType === 'pen' && e.pressure ? e.pressure : 1,
        null,
        'pointer:' + e.pointerId
      );
    };
    const up = (e) => release('pointer:' + e.pointerId);
    button.onpointerup = up;
    button.onpointercancel = up;
    button.onlostpointercapture = up;
  }
  function edit(action) {
    if (playing) stopAll();
    try {
      action();
      render();
      changed();
    } catch (e) {
      toast(e.message);
    }
  }
  function numberInput(label, value, min, max, step, onchange) {
    const wrap = document.createElement('label');
    wrap.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    Object.assign(input, { value, min, max, step });
    input.onchange = () => {
      const n = Number(input.value);
      if (Number.isFinite(n)) onchange(Math.max(min, Math.min(max, n)));
    };
    wrap.append(input);
    return wrap;
  }
  function button(text, action, active = false) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.onclick = action;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
    return b;
  }
  function cycle(id, key, values, labels) {
    const el = $(id);
    el.textContent = labels[values.indexOf(perf()[key])] || labels[0];
    el.onclick = () => {
      perf()[key] = values[(values.indexOf(perf()[key]) + 1) % values.length];
      renderControls();
      changed();
    };
  }
  function renderControls() {
    if (!$('studioTabs')) return;
    const p = perf();
    $('studioBanks').replaceChildren(
      ...state.studio.tracks.map((t, i) =>
        button(
          'ABCDEFGH'[i] + ' · ' + t.name,
          () => $('padBanks').children[i].click(),
          state.padBank === i
        )
      )
    );
    $('sequenceName').value = seq().name;
    $('trackName').value = state.studio.tracks[state.padBank].name;
    $('sequenceBars').replaceChildren(
      ...[1, 2, 4, 8, 16].map((n) =>
        button(
          n + ' bar' + (n === 1 ? '' : 's'),
          () =>
            edit(() => {
              StudioModel.resize(state, pattern, n);
              bar = Math.min(bar, n - 1);
            }),
          seq().bars === n
        )
      )
    );
    $('barPages').replaceChildren(
      ...Array.from({ length: seq().bars }, (_, i) =>
        button(
          String(i + 1),
          () => {
            bar = i;
            renderSteps();
            renderControls();
          },
          bar === i
        )
      )
    );
    cycle(
      'quantizeMode',
      'quantize',
      [0, 1, 0.5, 0.25, 0.125, 1 / 3, 1 / 6],
      [
        'Free timing',
        'Quarter notes',
        'Eighth notes',
        'Sixteenth notes',
        '32nd notes',
        'Eighth triplets',
        '16th triplets'
      ]
    );
    cycle(
      'repeatMode',
      'repeat',
      [0, 1, 0.5, 0.25, 0.125],
      ['Repeat off', 'Repeat 1/4', 'Repeat 1/8', 'Repeat 1/16', 'Repeat 1/32']
    );
    cycle(
      'countInMode',
      'countIn',
      [0, 1, 2],
      ['Count-in off', 'Count-in 1 bar', 'Count-in 2 bars']
    );
    cycle(
      'recordMode',
      'recordMode',
      ['overdub', 'replace'],
      ['Overdub', 'Replace track per pass']
    );
    cycle(
      'chordMode',
      'chord',
      ['off', 'minor', 'major', 'seventh'],
      ['Single notes', 'Minor chord', 'Major chord', 'Seventh chord']
    );
    cycle('midiMode', 'midiMode', ['pads', 'notes'], ['MIDI → pads', 'MIDI → notes']);
    for (const [id, key] of [
      ['metroMode', 'metronome'],
      ['tripletMode', 'triplet'],
      ['arpMode', 'arp']
    ]) {
      $(id).classList.toggle('active', p[key]);
      $(id).setAttribute('aria-pressed', String(p[key]));
    }
    $('quantizeStrength').value = p.strength;
    $('velocityCurve').value = p.velocityCurve;
    $('glideTime').value = p.glide;
    $('midiBase').value = p.midiBase;
    $('songMode').textContent = state.studio.mode === 'song' ? 'Play song' : 'Play sequence';
    $('songMode').classList.toggle('active', state.studio.mode === 'song');
    $('padChoke').value = state.pads[selected].chokeGroup || 0;
    $('padGate').textContent =
      state.pads[selected].playMode === 'gate' ? 'Gate: hold to play' : 'One shot';
    if (view === 'piano') renderRoll();
    if (view === 'mixer') renderMixer();
    if (view === 'song') renderSong();
  }
  function setView(next) {
    view = next;
    for (const name of ['pads', 'piano', 'mixer', 'song']) {
      $('view-' + name).hidden = name !== next;
      $('tab-' + name).classList.toggle('active', name === next);
      $('tab-' + name).setAttribute('aria-pressed', String(name === next));
    }
    renderControls();
  }
  function renderMixer() {
    const area = $('mixerTracks');
    area.replaceChildren();
    state.studio.tracks.forEach((t, i) => {
      const strip = document.createElement('section');
      strip.className = 'mixer-strip';
      const name = document.createElement('input');
      name.value = t.name;
      name.maxLength = 60;
      name.setAttribute('aria-label', 'Track ' + (i + 1) + ' name');
      name.onchange = () => {
        t.name = name.value;
        changed();
      };
      strip.append(
        name,
        button(
          'Mute',
          () => {
            t.mute = !t.mute;
            syncMixer();
            renderMixer();
            changed();
          },
          t.mute
        ),
        button(
          'Solo',
          () => {
            t.solo = !t.solo;
            syncMixer();
            renderMixer();
            changed();
          },
          t.solo
        )
      );
      const meter = document.createElement('meter');
      meter.id = 'meter-' + i;
      meter.min = 0;
      meter.max = 1;
      meter.value = 0;
      meter.setAttribute('aria-label', t.name + ' level');
      strip.append(meter);
      for (const [key, label, min, max, step] of [
        ['volume', 'Level', 0, 1.5, 0.01],
        ['pan', 'Pan', -1, 1, 0.01],
        ['low', 'Low EQ', -18, 18, 1],
        ['mid', 'Mid EQ', -18, 18, 1],
        ['high', 'High EQ', -18, 18, 1],
        ['compression', 'Compression', 0, 1, 0.01],
        ['drive', 'Saturation', 0, 1, 0.01],
        ['reverb', 'Reverb send', 0, 1, 0.01],
        ['delay', 'Delay send', 0, 1, 0.01],
        ['duck', 'Ducking', 0, 1, 0.01]
      ]) {
        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        const input = document.createElement('input'),
          out = document.createElement('output');
        input.type = 'range';
        Object.assign(input, { min, max, step, value: t[key] });
        input.setAttribute('aria-label', t.name + ' ' + label);
        out.textContent = String(t[key]);
        input.oninput = () => {
          t[key] = Number(input.value);
          out.textContent = input.value;
          syncMixer();
          if (recording && playing && ['volume', 'pan'].includes(key)) {
            const pos = position();
            if (pos.beat >= 0 && pos.time < StudioModel.beats(state, pos.sequence)) {
              const list = state.studio.sequences[pos.sequence].automation;
              if (list.length < 8192)
                list.push({ track: i, param: key, time: pos.time, value: t[key] });
            }
          }
          changed('mixer-' + i + '-' + key);
        };
        labelEl.append(input, out);
        strip.append(labelEl);
      }
      strip.append(
        numberInput('Sidechain track', t.sidechain + 1, 1, 8, 1, (n) => {
          t.sidechain = n - 1;
          changed();
        })
      );
      strip.append(button('Export stem', () => exportAudio(i)));
      area.append(strip);
    });
    renderAutomation();
    $('automationCount').textContent =
      seq().automation.length + ' recorded volume/pan points in this sequence';
  }

  function renderAutomation() {
    const root = $('automationPoints');
    root.replaceChildren();
    const points = seq()
      .automation.map((a, index) => ({ a, index }))
      .filter(({ a }) => a.track === state.padBank);
    for (const { a, index } of points.slice(-100)) {
      const row = document.createElement('div');
      row.className = 'automation-point';
      row.append(
        document.createTextNode(a.param),
        numberInput('Beat', a.time, 0, StudioModel.beats(state, pattern) - 1 / 960, 0.125, (n) =>
          edit(() => {
            a.time = n;
          })
        ),
        numberInput(
          'Value',
          a.value,
          a.param === 'pan' ? -1 : 0,
          a.param === 'pan' ? 1 : 1.5,
          0.01,
          (n) =>
            edit(() => {
              a.value = n;
            })
        ),
        button('Remove', () => edit(() => seq().automation.splice(index, 1)))
      );
      root.append(row);
    }
    if (points.length > 100) {
      const p = document.createElement('p');
      p.textContent = 'Showing the latest 100 points for this bank.';
      root.prepend(p);
    }
  }
  function updateMeters() {
    if (view !== 'mixer' || !mix) return;
    mix.channels.forEach((c, i) => {
      const values = new Float32Array(128);
      c.meter.getFloatTimeDomainData(values);
      const m = $('meter-' + i);
      if (m)
        m.value = Math.min(1, Math.sqrt(values.reduce((a, v) => a + v * v, 0) / values.length) * 3);
    });
  }
  function renderSong() {
    const list = $('songList');
    list.replaceChildren();
    state.studio.song.forEach((slot, i) => {
      const row = document.createElement('div');
      row.className = 'song-row';
      const title = document.createElement('span');
      title.textContent =
        i +
        1 +
        '. ' +
        state.studio.sequences[slot.sequence].name +
        ' · ' +
        state.studio.sequences[slot.sequence].bars +
        ' bars';
      row.append(
        title,
        numberInput('Repeats', slot.repeats, 1, 16, 1, (n) =>
          edit(() => {
            if (
              state.studio.song.reduce(
                (sum, s) =>
                  sum + StudioModel.beats(state, s.sequence) * (s === slot ? n : s.repeats),
                0
              ) > 4096
            )
              throw Error('Song exceeds 1024 bars');
            slot.repeats = n;
          })
        ),
        button('↑', () =>
          edit(() => {
            if (i)
              [state.studio.song[i - 1], state.studio.song[i]] = [slot, state.studio.song[i - 1]];
          })
        ),
        button('↓', () =>
          edit(() => {
            if (i < state.studio.song.length - 1)
              [state.studio.song[i + 1], state.studio.song[i]] = [slot, state.studio.song[i + 1]];
          })
        ),
        button('Remove', () => edit(() => state.studio.song.splice(i, 1)))
      );
      list.append(row);
    });
    if (!list.children.length) {
      const p = document.createElement('p');
      p.textContent =
        'Choose a sequence above, then add it to your song. Arrange verses, choruses and breaks here.';
      list.append(p);
    }
    const bars = state.studio.song.reduce(
      (n, s) => n + state.studio.sequences[s.sequence].bars * s.repeats,
      0
    );
    $('songLength').textContent =
      bars + ' bars · ' + ((bars * 240) / state.bpm).toFixed(1) + ' seconds';
  }
  function renderRoll() {
    const root = $('pianoRoll');
    root.replaceChildren();
    const bank = state.padBank,
      inst = instrument(bank),
      base = inst
        ? Math.max(12, Math.min(72, SynthEngine.notes(inst.patch)[0] - 12 + rollOctave * 12))
        : 0,
      rows = inst ? 36 : 16,
      length = StudioModel.beats(state, pattern),
      width = length * 48;
    root.style.width = width + 84 + 'px';
    root.style.height = rows * 24 + 28 + 'px';
    root.style.setProperty('--beat-width', '48px');
    const noteLabel = (n) =>
      ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][n % 12] +
      (Math.floor(n / 12) - 1);
    for (let r = 0; r < rows; r++) {
      const lane = document.createElement('div');
      lane.className = 'roll-lane';
      lane.style.top = 28 + r * 24 + 'px';
      const pitch = inst ? base + rows - 1 - r : null,
        pad = bank * 16 + (inst ? 0 : r),
        label = button(inst ? noteLabel(pitch) : state.pads[pad].name, () => {
          const key = 'roll:' + r;
          press(pad, 1, pitch, key).then(() => setTimeout(() => release(key), 200));
        });
      label.className = 'roll-key';
      lane.append(label);
      root.append(lane);
    }
    for (let b = 0; b < length; b++) {
      const t = document.createElement('span');
      t.className = 'roll-beat';
      t.style.left = 84 + b * 48 + 'px';
      t.textContent = b % 4 === 0 ? String(b / 4 + 1) : '·';
      root.append(t);
    }
    const all = StudioModel.events(state, pattern).filter((n) => Math.floor(n.pad / 16) === bank);
    for (const event of all) {
      const pitch = event.midi ?? (inst ? SynthEngine.notes(inst.patch)[event.pad % 16] : null),
        r = inst ? base + rows - 1 - pitch : event.pad % 16;
      if (r < 0 || r >= rows) continue;
      const n = document.createElement('button');
      n.type = 'button';
      n.className = 'roll-note' + (selectedNote === event.id ? ' selected' : '');
      n.style.left = 84 + event.time * 48 + 'px';
      n.style.top = 29 + r * 24 + 'px';
      n.style.width = Math.max(8, event.duration * 48) + 'px';
      n.style.opacity = 0.45 + event.velocity * 0.55;
      n.textContent = inst ? noteLabel(pitch) : Math.round(event.velocity * 100);
      n.setAttribute(
        'aria-label',
        (inst ? noteLabel(pitch) : state.pads[event.pad].name) +
          ' at beat ' +
          (event.time + 1).toFixed(2)
      );
      n.title = 'Drag to move · drag right edge to resize · double-click to delete';
      const materialize = () => {
        if (event.id) return seq().notes.find((x) => x.id === event.id);
        state.patterns[pattern][event.pad][event.step] = 0;
        const copy = { ...event, id: crypto.randomUUID() };
        seq().notes.push(copy);
        event.id = copy.id;
        return copy;
      };
      n.onpointerdown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (playing) stopAll();
        const note = materialize();
        selectedNote = note.id;
        const start = {
            x: e.clientX,
            y: e.clientY,
            time: note.time,
            duration: note.duration,
            pad: note.pad,
            midi: pitch
          },
          resize = e.offsetX > n.clientWidth - 9;
        n.setPointerCapture(e.pointerId);
        n.onpointermove = (ev) => {
          const delta = (ev.clientX - start.x) / 48,
            grid = perf().quantize || 1 / 96;
          if (resize)
            note.duration = Math.max(
              grid,
              Math.min(length - note.time, Math.round((start.duration + delta) / grid) * grid)
            );
          else {
            note.time = Math.max(
              0,
              Math.min(length - grid, Math.round((start.time + delta) / grid) * grid)
            );
            const dy = Math.round((ev.clientY - start.y) / 24);
            if (inst) note.midi = Math.max(base, Math.min(base + rows - 1, start.midi - dy));
            else note.pad = bank * 16 + Math.max(0, Math.min(15, (start.pad % 16) + dy));
          }
          n.style.left = 84 + note.time * 48 + 'px';
          n.style.width = Math.max(8, note.duration * 48) + 'px';
          n.style.top = 29 + (inst ? base + rows - 1 - note.midi : note.pad % 16) * 24 + 'px';
        };
        n.onpointerup = n.onpointercancel = () => {
          n.onpointermove = null;
          n.onpointerup = null;
          changed();
          renderSteps();
          renderRoll();
        };
        renderNoteInspector(note);
      };
      n.ondblclick = (e) => {
        e.stopPropagation();
        const note = materialize();
        seq().notes = seq().notes.filter((x) => x.id !== note.id);
        selectedNote = null;
        changed();
        renderSteps();
        renderRoll();
      };
      root.append(n);
    }
    root.onpointerdown = (e) => {
      if (e.target !== root && !e.target.classList.contains('roll-lane')) return;
      const rect = root.getBoundingClientRect(),
        x = e.clientX - rect.left - 84,
        r = Math.floor((e.clientY - rect.top - 28) / 24);
      if (x < 0 || r < 0 || r >= rows) return;
      if (playing) stopAll();
      const grid = perf().quantize || 0.25,
        time = Math.max(0, Math.min(length - grid, Math.floor(x / 48 / grid) * grid));
      if (seq().notes.length >= 16384) return;
      const note = {
        id: crypto.randomUUID(),
        pad: bank * 16 + (inst ? 0 : r),
        midi: inst ? base + rows - 1 - r : null,
        time,
        duration: Math.min(grid, length - time),
        velocity: 0.8
      };
      seq().notes.push(note);
      selectedNote = note.id;
      changed();
      renderRoll();
    };
    const line = document.createElement('i');
    line.id = 'rollPlayhead';
    line.hidden = !playing;
    root.append(line);
    renderNoteInspector(seq().notes.find((n) => n.id === selectedNote));
    $('rollHint').textContent = inst
      ? 'Draw notes · drag to move · drag right edge for length · double-click to delete'
      : 'Drum lanes · recorded hits retain timing, duration and velocity';
  }
  function renderNoteInspector(note) {
    const panel = $('noteInspector');
    panel.replaceChildren();
    if (!note) {
      panel.textContent = 'Select a note to edit its timing, length and velocity.';
      return;
    }
    for (const [key, label, min, max, step] of [
      ['time', 'Beat', 0, StudioModel.beats(state, pattern) - 1 / 960, 1 / 96],
      ['duration', 'Length', 1 / 960, 64, 1 / 96],
      ['velocity', 'Velocity', 0.01, 1, 0.01]
    ])
      panel.append(
        numberInput(label, note[key], min, max, step, (v) =>
          edit(() => {
            note[key] = v;
          })
        )
      );
    if (note.midi !== null)
      panel.append(
        numberInput('MIDI note', note.midi, 12, 107, 1, (v) =>
          edit(() => {
            note.midi = Math.round(v);
          })
        )
      );
    panel.append(
      button('Delete note', () =>
        edit(() => {
          seq().notes = seq().notes.filter((n) => n.id !== note.id);
          selectedNote = null;
        })
      )
    );
  }
  function midiMessage(data, device = 'test') {
    const e = StudioModel.midi(data);
    if (!e) return;
    const key = 'midi:' + device + ':' + e.channel + ':' + e.note;
    if (e.type === 'off') {
      release(key);
      return;
    }
    if (e.type === 'panic') {
      releaseAll();
      return;
    }
    if (e.type === 'bend') {
      bend = e.value * 2;
      for (const item of held.values())
        for (const h of item.handles) if (h.pitch) h.pitch(h.baseMidi, bend, 0);
      return;
    }
    if (e.type !== 'on' || document.querySelector('dialog[open]')) return;
    if (perf().midiMode === 'pads') {
      const local = e.note - perf().midiBase;
      if (local >= 0 && local < 16) press(bankOffset() + local, e.velocity, null, key);
    } else if (e.note >= 12 && e.note <= 107) {
      if (!instrument(state.padBank)) {
        toast('Load an instrument for MIDI notes');
        return;
      }
      press(bankOffset(), e.velocity, e.note, key);
    }
  }
  function bindMidi() {
    if (!midiAccess) return;
    const list = $('midiDevices');
    list.replaceChildren(
      button(
        'All devices',
        () => {
          perf().midiInput = 'all';
          bindMidi();
          changed();
        },
        perf().midiInput === 'all'
      )
    );
    for (const input of midiAccess.inputs.values()) {
      input.onmidimessage = (e) => {
        if (perf().midiInput === 'all' || perf().midiInput === input.id)
          midiMessage(e.data, input.id);
      };
      list.append(
        button(
          input.name || 'MIDI input',
          () => {
            releaseAll();
            perf().midiInput = input.id;
            bindMidi();
            changed();
          },
          perf().midiInput === input.id
        )
      );
    }
    $('midiStatus').textContent = midiAccess.inputs.size
      ? midiAccess.inputs.size + ' MIDI input(s) connected'
      : 'MIDI enabled — connect a keyboard or pad controller';
  }
  async function connectMidi() {
    try {
      if (!navigator.requestMIDIAccess) throw Error('MIDI is unavailable in this browser');
      midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      midiAccess.onstatechange = () => {
        releaseAll();
        bindMidi();
      };
      bindMidi();
    } catch (e) {
      $('midiStatus').textContent = e.message;
    }
  }
  function renderLength(slots) {
    const seconds = (slots.at(-1).end * 60) / state.bpm;
    let end = seconds + 3;
    for (const slot of slots)
      for (const e of StudioModel.events(state, slot.sequence)) {
        const bank = Math.floor(e.pad / 16);
        if (!activeBank(bank)) continue;
        const p = state.pads[e.pad],
          inst = instrument(bank),
          tail = inst
            ? (e.duration * 60) / state.bpm + inst.patch.release + 2
            : ((p.end - p.start) * buffers[p.sample].duration) / 2 ** (p.pitch / 12) + 3;
        end = Math.max(end, ((slot.start + e.time) * 60) / state.bpm + tail);
      }
    return end;
  }
  async function renderAudio(stem = null, forceSequence = false) {
    const slots = forceSequence
      ? [{ sequence: pattern, start: 0, end: StudioModel.beats(state, pattern) }]
      : StudioModel.arrangement(state, pattern);
    if (!slots.length) throw Error('Add sequences to the song first');
    const end = renderLength(slots);
    if (end > 900) throw Error('Render a song shorter than 15 minutes');
    const offline = new OfflineAudioContext(2, Math.ceil(end * 44100), 44100),
      out = offline.createGain(),
      comp = offline.createDynamicsCompressor();
    out.gain.value = state.master;
    comp.threshold.value = -6;
    comp.knee.value = 6;
    comp.ratio.value = 10;
    out.connect(comp).connect(offline.destination);
    const tracks = structuredClone(state.studio.tracks);
    if (stem !== null)
      tracks.forEach((t, i) => {
        t.mute = i !== stem;
        t.solo = false;
      });
    const bus = StudioAudio.mixer(offline, out, tracks, state.bpm);
    for (const slot of slots) {
      for (const a of state.studio.sequences[slot.sequence].automation)
        bus.automate(a.track, a.param, a.value, ((slot.start + a.time) * 60) / state.bpm, tracks);
      for (const e of StudioModel.events(state, slot.sequence)) {
        if (!activeBank(Math.floor(e.pad / 16))) continue;
        trigger(
          offline,
          bus,
          e,
          ((slot.start + e.time) * 60) / state.bpm,
          (e.duration * 60) / state.bpm
        );
      }
    }
    const rendered = await offline.startRendering();
    bus.dispose();
    return rendered;
  }
  let busy = false;
  async function exportAudio(stem = null) {
    if (busy) return;
    busy = true;
    $('export').disabled = true;
    $('export').textContent = 'Rendering…';
    try {
      stopAll();
      const rendered = await renderAudio(stem);
      download(
        wav(rendered),
        filename() +
          ' - ' +
          (stem === null
            ? state.studio.mode === 'song'
              ? 'song'
              : seq().name
            : state.studio.tracks[stem].name
          ).replace(/[^a-zA-Z0-9 _-]/g, '') +
          '.wav'
      );
      toast('Stereo WAV exported with mixer effects and tails');
    } catch (e) {
      toast(e.message);
    } finally {
      busy = false;
      $('export').disabled = false;
      $('export').textContent = 'Export WAV ↗';
    }
  }
  async function resample() {
    if (busy) return;
    busy = true;
    const target = selected,
      project = state,
      sequence = pattern,
      originalPad = state.pads[target];
    try {
      stopAll();
      toast('Resampling this sequence…');
      const b = await renderAudio(null, true);
      if (b.duration > 120) throw Error('Resampled audio must fit within two minutes');
      if (state !== project || pattern !== sequence || state.pads[target] !== originalPad)
        throw Error('Project changed; resampling cancelled');
      const key = 'sample-' + crypto.randomUUID();
      buffers[key] = b;
      state.pads[target] = {
        ...emptyPad(),
        name: (seq().name + ' resample').slice(0, 100),
        sample: key
      };
      state.kit = 'custom';
      render();
      changed();
      toast(
        'Sequence resampled onto ' +
          'ABCDEFGH'[Math.floor(target / 16)] +
          String((target % 16) + 1).padStart(2, '0') +
          ' · Undo restores the pad'
      );
    } catch (e) {
      toast(e.message);
    } finally {
      busy = false;
    }
  }
  async function stretch() {
    if (busy) return;
    busy = true;
    const target = selected,
      pad = state.pads[target],
      project = state,
      source = buffers[pad.sample],
      bpm = Number($('sourceBpm').value),
      factor = bpm / state.bpm;
    try {
      if (!Number.isFinite(factor) || factor < 0.5 || factor > 2)
        throw Error('Choose a source tempo within ½×–2× the project tempo');
      if (currentInstrument(Math.floor(target / 16)))
        throw Error('Time stretch works on audio samples. Resample the instrument first.');
      stopAll();
      const start = Math.floor(pad.start * source.length),
        end = Math.ceil(pad.end * source.length),
        channels = Array.from({ length: source.numberOfChannels }, (_, c) =>
          source.getChannelData(c).slice(start, end)
        );
      if (((end - start) * factor) / source.sampleRate > 120)
        throw Error('Stretched sample would exceed two minutes');
      const request = ++stretchToken;
      toast('Stretching audio while preserving pitch…');
      const result = await new Promise((resolve, reject) => {
        stretchWorker = new Worker('stretch-worker.js');
        stretchWorker.onmessage = (e) => {
          stretchWorker.terminate();
          stretchWorker = null;
          e.data.error ? reject(Error(e.data.error)) : resolve(e.data.channels);
        };
        stretchWorker.onerror = () => {
          stretchWorker?.terminate();
          stretchWorker = null;
          reject(Error('Time stretch failed'));
        };
        stretchWorker.postMessage(
          { channels, factor, sampleRate: source.sampleRate },
          channels.map((c) => c.buffer)
        );
      });
      if (request !== stretchToken || state !== project || state.pads[target] !== pad)
        throw Error('Pad changed; stretch cancelled');
      const b = ctx.createBuffer(result.length, result[0].length, source.sampleRate);
      result.forEach((c, i) => b.copyToChannel(c, i));
      const key = 'sample-' + crypto.randomUUID();
      buffers[key] = b;
      state.pads[target] = {
        ...pad,
        sample: key,
        start: 0,
        end: 1,
        name: (pad.name + ' stretched').slice(0, 100)
      };
      state.kit = 'custom';
      render();
      changed();
      toast('Tempo matched; original pitch preserved. Undo restores the source.');
    } catch (e) {
      toast(e.message);
    } finally {
      busy = false;
    }
  }
  let lastBackup = 0;
  async function backup(force = false, payload = null) {
    if (!db || (!force && Date.now() - lastBackup < 60000)) return;
    lastBackup = Date.now();
    const data = payload || sessionData();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('session', 'readwrite'),
        store = tx.objectStore('session'),
        r = store.get('backups');
      r.onsuccess = () =>
        store.put([{ time: Date.now(), data }, ...(r.result || [])].slice(0, 5), 'backups');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  async function showBackups() {
    if (!db) {
      toast('Local backups are unavailable; use Save project');
      return;
    }
    const items = await new Promise((resolve, reject) => {
      const r = db.transaction('session').objectStore('session').get('backups');
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
    const list = $('backupList');
    list.replaceChildren();
    if (!items.length) list.textContent = 'No backups yet. Your session is backed up as you edit.';
    for (const item of items)
      list.append(
        button(item.data.state.name + ' · ' + new Date(item.time).toLocaleString(), async () => {
          try {
            const data = structuredClone(item.data),
              restored = restoreSamples(data.samples);
            validate(data.state, restored);
            await backup(true);
            stopAll();
            Object.assign(buffers, restored);
            state = migrateState(data.state);
            pattern = state.pattern;
            selected = bankOffset();
            $('backupDialog').close();
            render();
            changed();
            toast('Backup restored · Undo returns to your previous session');
          } catch (e) {
            toast(e.message);
          }
        })
      );
    $('backupDialog').showModal();
  }
  function init() {
    for (const name of ['pads', 'piano', 'mixer', 'song'])
      $('tab-' + name).onclick = () => setView(name);
    $('tab-chop').onclick = () => openChopper();
    $('sequenceName').onchange = (e) => {
      seq().name = e.target.value.slice(0, 60) || 'Untitled sequence';
      render();
      changed();
    };
    $('trackName').onchange = (e) => {
      state.studio.tracks[state.padBank].name = e.target.value.slice(0, 60);
      changed();
    };
    for (const [id, source] of [
      ['newSequence', false],
      ['duplicateSequence', true]
    ])
      $(id).onclick = () => {
        try {
          edit(() => {
            pattern = StudioModel.addSequence(state, source ? pattern : null);
            state.pattern = pattern;
            bar = 0;
          });
        } catch (e) {
          toast(e.message);
        }
      };
    $('songMode').onclick = () =>
      edit(() => {
        state.studio.mode = state.studio.mode === 'song' ? 'sequence' : 'song';
      });
    $('addToSong').onclick = () => {
      if (
        state.studio.song.length >= 128 ||
        state.studio.song.reduce(
          (n, s) => n + StudioModel.beats(state, s.sequence) * s.repeats,
          0
        ) +
          StudioModel.beats(state, pattern) >
          4096
      ) {
        toast('A song can contain up to 128 sections');
        return;
      }
      edit(() => state.studio.song.push({ sequence: pattern, repeats: 1 }));
    };
    for (const [id, key] of [
      ['metroMode', 'metronome'],
      ['tripletMode', 'triplet'],
      ['arpMode', 'arp']
    ])
      $(id).onclick = () => {
        perf()[key] = !perf()[key];
        renderControls();
        changed();
      };
    for (const [id, key, min, max] of [
      ['quantizeStrength', 'strength', 0, 1],
      ['velocityCurve', 'velocityCurve', 0.25, 3],
      ['glideTime', 'glide', 0, 1],
      ['midiBase', 'midiBase', 0, 112]
    ])
      $(id).oninput = (e) => {
        perf()[key] = Math.max(min, Math.min(max, Number(e.target.value) || 0));
        changed('performance-' + key);
      };
    $('quantizeNotes').onclick = () =>
      edit(() => {
        const length = StudioModel.beats(state, pattern);
        seq()
          .notes.filter((n) => Math.floor(n.pad / 16) === state.padBank)
          .forEach(
            (n) => (n.time = StudioModel.quantize(n.time, perf().quantize, perf().strength, length))
          );
      });
    $('padChoke').onchange = (e) => {
      state.pads[selected].chokeGroup = Math.max(
        0,
        Math.min(16, Math.round(Number(e.target.value) || 0))
      );
      changed();
    };
    $('padGate').onclick = () => {
      const p = state.pads[selected];
      p.playMode = p.playMode === 'gate' ? 'one-shot' : 'gate';
      renderControls();
      changed();
    };
    $('rollDown').onclick = () => {
      rollOctave = Math.max(-7, rollOctave - 1);
      renderRoll();
    };
    $('rollUp').onclick = () => {
      rollOctave = Math.min(7, rollOctave + 1);
      renderRoll();
    };
    $('connectMidi').onclick = connectMidi;
    $('panic').onclick = () => {
      stopAll();
      stopPreview();
      stopPackPreview();
      synthGeneration++;
      stopSynthPreview();
    };
    $('resample').onclick = resample;
    $('stretchSample').onclick = stretch;
    $('backups').onclick = () => showBackups().catch((e) => toast(e.message));
    $('closeBackups').onclick = () => $('backupDialog').close();
    for (const param of ['volume', 'pan'])
      $('addAutomation-' + param).onclick = () =>
        edit(() => {
          if (seq().automation.length >= 8192) throw Error('Automation is full');
          seq().automation.push({
            track: state.padBank,
            param,
            time: 0,
            value: state.studio.tracks[state.padBank][param]
          });
        });
    $('clearAutomation').onclick = () =>
      edit(() => {
        seq().automation = [];
      });
    window.addEventListener('keydown', (e) => {
      if (
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) ||
        document.querySelector('dialog[open]')
      )
        return;
      if (e.code === 'Space') {
        if (e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        toggle();
        return;
      }
      const i = KEYS.indexOf(e.key.toLowerCase());
      if (i >= 0) {
        e.preventDefault();
        press(bankOffset() + i, 1, null, 'key:' + e.code);
      }
    });
    window.addEventListener('keyup', (e) => release('key:' + e.code));
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) releaseAll();
    });
  }
  return {
    init,
    cutBank,
    toggle,
    stop: stopAll,
    tap,
    press,
    release,
    wirePad,
    renderControls,
    setView,
    renderAudio,
    exportAudio,
    resample,
    stretch,
    backup,
    midiMessage,
    get pageStart() {
      bar = Math.min(bar, seq().bars - 1);
      return bar * 16;
    },
    get busy() {
      return busy;
    }
  };
})();
