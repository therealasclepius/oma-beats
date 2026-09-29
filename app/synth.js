'use strict';
let synthDraft,
  synthBank = 0,
  synthPreview = null,
  synthGeneration = 0;
const synthControls = [
  'cutoff',
  'resonance',
  'attack',
  'decay',
  'sustain',
  'release',
  'gate',
  'detune',
  'octave',
  'root',
  'scale',
  'wave',
  'mono'
];
const synthSampleKey = (group, index) => 'sample-synth-' + group + '-' + index;
function currentInstrument(bank = state.padBank) {
  const instrument = state.synthBanks?.[bank];
  return instrument &&
    state.pads
      .slice(bank * 16, bank * 16 + 16)
      .every((pad, i) => pad.sample === synthSampleKey(instrument.group, i))
    ? instrument
    : null;
}
function showSynth(id) {
  stopSynthPreview();
  synthGeneration++;
  synthBank = state.padBank;
  synthDraft = structuredClone(
    id ? SynthEngine.preset(id) : currentInstrument()?.patch || SynthEngine.preset('sub')
  );
  if (!id && currentInstrument()) synthDraft.mono = !!state.bankMono[synthBank];
  $('synthEditor').showModal();
  renderSynth();
}
function renderSynth() {
  $('synthPreset').textContent =
    SynthEngine.presets.find((p) => p.id === synthDraft.preset).name + ' · Change';
  for (const key of synthControls) {
    const el = $('synth-' + key);
    if (key === 'mono') el.checked = synthDraft[key];
    else el.value = synthDraft[key];
  }
  const notes = SynthEngine.notes(synthDraft),
    bank = 'ABCDEFGH'[synthBank];
  $('synthBankLabel').textContent = 'BANK ' + bank + ' · 16 NOTES';
  $('synthRange').textContent =
    SynthEngine.noteName(notes[0]) + ' → ' + SynthEngine.noteName(notes.at(-1));
  $('synthApply').textContent = 'Load instrument into bank ' + bank;
  $('synthHint').textContent =
    (SynthEngine.presets.find((p) => p.id === synthDraft.preset).description || '') +
    ' · Replaces the 16 sounds in bank ' +
    bank +
    '. Its patterns stay in place. Each hit plays the chosen note length plus release.';
  $('synthNotes').replaceChildren(
    ...notes.map((note, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = SynthEngine.noteName(note);
      b.setAttribute('aria-label', 'Preview synth ' + SynthEngine.noteName(note));
      b.onclick = () => previewSynth(i);
      return b;
    })
  );
  for (const key of [
    'cutoff',
    'resonance',
    'attack',
    'decay',
    'sustain',
    'release',
    'gate',
    'detune'
  ]) {
    const value = synthDraft[key];
    $('synth-' + key + '-value').textContent =
      key === 'cutoff'
        ? value >= 1000
          ? (value / 1000).toFixed(1) + ' kHz'
          : value + ' Hz'
        : key === 'detune'
          ? value + ' cents'
          : key === 'sustain'
            ? Math.round(value * 100) + '%'
            : key === 'resonance'
              ? value.toFixed(1)
              : value < 1
                ? Math.round(value * 1000) + ' ms'
                : value.toFixed(2) + ' s';
  }
}
function stopSynthPreview() {
  if (synthPreview) {
    try {
      synthPreview.stop();
    } catch {}
    synthPreview = null;
  }
}
function cancelSynth() {
  synthGeneration++;
  stopSynthPreview();
  $('synthApply').disabled = false;
}
async function previewSynth(index = 0) {
  stopSynthPreview();
  const token = ++synthGeneration,
    patch = structuredClone(synthDraft);
  try {
    await unlock();
    const buffer = await SynthEngine.renderNote(
      patch,
      SynthEngine.notes(patch)[index],
      OfflineAudioContext,
      ctx.sampleRate
    );
    if (token !== synthGeneration || !$('synthEditor').open) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(master);
    activeSources.add(source);
    synthPreview = source;
    source.onended = () => {
      activeSources.delete(source);
      source.disconnect();
      if (synthPreview === source) synthPreview = null;
    };
    source.start();
  } catch (error) {
    toast(error.message);
  }
}
async function applySynth() {
  const session = state,
    bank = synthBank,
    patch = structuredClone(synthDraft),
    token = ++synthGeneration;
  stopSynthPreview();
  $('synthApply').disabled = true;
  $('synthStatus').textContent = 'Preparing your instrument…';
  try {
    const notes = SynthEngine.notes(patch),
      audio = [];
    for (const note of notes) {
      audio.push(await SynthEngine.renderNote(patch, note, OfflineAudioContext, ctx.sampleRate));
      if (token !== synthGeneration || state !== session || !$('synthEditor').open) return;
    }
    const group = crypto.randomUUID(),
      name = SynthEngine.presets.find((p) => p.id === patch.preset).name;
    const pads = audio.map((buffer, i) => {
      const key = synthSampleKey(group, i);
      buffers[key] = buffer;
      return {
        name: name + ' · ' + SynthEngine.noteName(notes[i]),
        sample: key,
        gain: 0.8,
        pitch: 0,
        start: 0,
        end: 1,
        reverse: false
      };
    });
    stop();
    state.pads.splice(bank * 16, 16, ...pads);
    state.synthBanks ??= Array(8).fill(null);
    state.synthBanks[bank] = { group, patch };
    state.bankMono[bank] = patch.mono;
    state.padBank = bank;
    state.kit = 'custom';
    selected = bank * 16;
    pruneBuffers();
    render();
    changed();
    $('synthEditor').close();
    toast(name + ' loaded into bank ' + 'ABCDEFGH'[bank]);
  } catch (error) {
    toast('Could not load instrument: ' + error.message);
  } finally {
    $('synthApply').disabled = false;
    $('synthStatus').textContent = '';
  }
}
function connectSynth() {
  SynthEngine.names.forEach((name, i) => $('synth-root').add(new Option(name, i)));
  $('openSynth').onclick = () => showSynth();
  $('closeSynth').onclick = () => {
    cancelSynth();
    $('synthEditor').close();
  };
  $('synthEditor').addEventListener('cancel', cancelSynth);
  $('synthPreset').onclick = () => {
    cancelSynth();
    $('synthEditor').close();
    showKitBrowser(true);
  };
  for (const key of synthControls)
    $('synth-' + key).oninput = () => {
      synthGeneration++;
      stopSynthPreview();
      const el = $('synth-' + key);
      synthDraft[key] =
        key === 'mono' ? el.checked : ['wave', 'scale'].includes(key) ? el.value : Number(el.value);
      renderSynth();
    };
  $('synthReset').onclick = () => {
    synthGeneration++;
    stopSynthPreview();
    synthDraft = SynthEngine.preset(synthDraft.preset);
    renderSynth();
  };
  $('synthPreview').onclick = () => previewSynth();
  $('synthStop').onclick = () => {
    synthGeneration++;
    stopSynthPreview();
  };
  $('synthApply').onclick = applySynth;
}

// Runs only in the isolated, muted Electron smoke-test profile. This exercises
// real Chromium audio rendering, project serialization and undo, not mock audio.
async function runSynthSmoke() {
  const expect = (condition, message) => {
    if (!condition) throw Error('Synth smoke: ' + message);
  };
  for (const preset of SynthEngine.presets) {
    const patch = SynthEngine.preset(preset.id),
      notes = SynthEngine.notes(patch);
    for (const note of [notes[0], notes.at(-1)]) {
      const buffer = await SynthEngine.renderNote(patch, note, OfflineAudioContext);
      expect(buffer.numberOfChannels === (patch.spread ? 2 : 1), 'channel count ' + preset.name);
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel);
        let energy = 0,
          peak = 0;
        for (const v of data) {
          expect(Number.isFinite(v), 'finite audio');
          energy += v * v;
          peak = Math.max(peak, Math.abs(v));
        }
        expect(energy > 0.01, 'audible ' + preset.name);
        expect(peak <= 0.851, 'safe peak ' + preset.name);
        expect(
          data.slice(-100).every((v) => Math.abs(v) < 1e-5),
          'release reaches silence'
        );
        if (patch.delayMix)
          expect(
            data
              .slice(Math.ceil(SynthEngine.envelope(patch).end * buffer.sampleRate))
              .some((v) => Math.abs(v) > 1e-5),
            'echo tail ' + preset.name
          );
      }
      if (patch.spread) {
        const left = buffer.getChannelData(0),
          right = buffer.getChannelData(1);
        expect(
          left.some((v, i) => Math.abs(v - right[i]) > 1e-4),
          'real stereo width ' + preset.name
        );
      }
    }
  }
  const firstPad = state.pads[0].sample;
  state.padBank = 1;
  selected = 16;
  state.patterns[0][16][0] = 0.7;
  changed();
  showSynth('sub');
  $('synthPreset').click();
  expect(
    $('kitBrowser').open && !$('synthEditor').open,
    'preset chooser opens without native dropdown'
  );
  $('kitSearch').value = 'Skyline';
  $('kitSearch').dispatchEvent(new Event('input'));
  $('kitChoices').querySelector('button').click();
  expect(
    $('synthEditor').open && synthDraft.preset === 'skyline',
    'new preset selected from chooser'
  );
  synthDraft.mono = true;
  synthDraft.cutoff = 1230;
  await applySynth();
  expect(state.pads[0].sample === firstPad, 'other banks stay unchanged');
  expect(state.patterns[0][16][0] === 0.7, 'pattern preserved');
  expect(currentInstrument(1)?.patch.cutoff === 1230 && state.bankMono[1], 'patch and mono saved');
  expect(
    new Set(state.pads.slice(16, 32).map((p) => p.sample)).size === 16,
    'sixteen distinct notes'
  );
  undoEdit();
  expect(state.pads[16].sample === 'kit-empty', 'undo restores prior bank');
  redoEdit();
  expect(currentInstrument(1)?.patch.cutoff === 1230, 'redo restores patch');
  const payload = sessionData();
  for (const sample of Object.values(payload.samples))
    sample.channels = sample.channels.map(encodeFloat);
  const restored = JSON.parse(JSON.stringify(payload)),
    audio = restoreSamples(restored.samples);
  validate(restored.state, audio);
  expect(Object.keys(audio).length === 16, 'all notes embedded in project');
  expect(
    Object.values(audio).every((b) => b.numberOfChannels === 2),
    'stereo survives project round trip'
  );
  expect(restored.state.synthBanks[1].patch.cutoff === 1230, 'project patch round trip');
  const offline = new OfflineAudioContext(2, 44100, 44100);
  voice(offline, offline.destination, state.pads[16], 0, 1, false, 1);
  const mix = await offline.startRendering(),
    file = await wav(mix).arrayBuffer();
  expect(new TextDecoder().decode(new Uint8Array(file, 0, 4)) === 'RIFF', 'WAV export');
  expect(
    mix.getChannelData(0).some((v) => Math.abs(v) > 0.001),
    'synth reaches offline mix'
  );
  expect(ctx.state === 'suspended', 'no live playback during checks');
  console.log(
    'PASS: ' +
      SynthEngine.presets.length +
      ' synth presets, stereo, note maps, bank isolation, undo/redo, project round trip and WAV audio'
  );
}
