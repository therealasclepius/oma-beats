'use strict';
// Executed only by the isolated, muted desktop smoke profile.
async function runStudioSmoke() {
  const expect = (v, m) => {
    if (!v) throw Error('Workstation smoke: ' + m);
  };
  const energy = (b, c = 0) => b.getChannelData(c).reduce((n, x) => n + x * x, 0);
  state = defaults();
  pattern = 0;
  selected = 0;
  render();
  initHistory();
  // Controls and editing use the real DOM without native select popups.
  $('sequenceBars').children[3].click();
  expect(state.patterns[0][0].length === 128, 'eight bar control');
  state.patterns[0][0][100] = 0.6;
  changed();
  $('duplicateSequence').click();
  expect(pattern === 4 && state.patterns[4][0][100] === 0.6, 'duplicate longer sequence');
  $('sequenceName').value = 'Verse';
  $('sequenceName').dispatchEvent(new Event('change'));
  expect(state.studio.sequences[4].name === 'Verse', 'sequence naming');
  $('tab-song').click();
  $('addToSong').click();
  $('songMode').click();
  expect(StudioModel.arrangement(state)[0].end === 32, 'song timeline');
  const payload = sessionData();
  validate(payload.state, {});
  const older = defaults();
  older.version = 2;
  delete older.studio;
  validate(older, {});
  expect(migrateState(older).studio.sequences.length === 4, 'legacy migration');
  // Render live instruments with held sustain and release, including every waveform family.
  for (const preset of SynthEngine.presets) {
    const patch = SynthEngine.preset(preset.id),
      duration = 0.3 + patch.release + (patch.delayMix ? patch.delayTime * 3 : 0) + 0.3,
      a = new OfflineAudioContext(2, Math.ceil(duration * 22050), 22050);
    const h = StudioAudio.synth(a, a.destination, patch, 60, 0, 0.7);
    h.release(0.3);
    const b = await a.startRendering();
    expect(energy(b) > 1e-5, 'live voice ' + preset.name);
    expect(b.getChannelData(0).every(Number.isFinite), 'finite live audio');
    expect(
      b
        .getChannelData(0)
        .slice(-100)
        .every((x) => Math.abs(x) < 1e-5),
      'live release ' + preset.name
    );
  }
  state = defaults();
  pattern = 0;
  selected = 0;
  state.playScope = 'all';
  state.patterns[0][0][0] = 1;
  state.patterns[0][16][4] = 1;
  state.pads[16] = { ...state.pads[0] };
  state.studio.tracks[0].pan = -1;
  state.studio.tracks[1].pan = 1;
  render();
  const left = await Studio.renderAudio(0),
    right = await Studio.renderAudio(1);
  expect(energy(left, 0) > 0.01 && energy(left, 1) < 1e-8, 'left-panned isolated stem');
  expect(energy(right, 1) > 0.01 && energy(right, 0) < 1e-8, 'right-panned isolated stem');
  state.studio.tracks[0].reverb = 0.7;
  state.studio.tracks[0].delay = 0.6;
  state.studio.tracks[0].compression = 0.4;
  state.studio.tracks[0].drive = 0.3;
  state.studio.tracks[0].low = 5;
  state.studio.tracks[1].duck = 0.6;
  const fx = await Studio.renderAudio();
  expect(fx.getChannelData(0).every(Number.isFinite), 'mixer audio finite');
  expect(
    fx
      .getChannelData(0)
      .slice(44100, 88200)
      .some((x) => Math.abs(x) > 1e-6),
    'effect tail'
  );
  state.studio.tracks.forEach((t) => (t.mute = true));
  const silence = await Studio.renderAudio();
  expect(energy(silence) < 1e-12, 'muted tracks export silence');
  state.studio.tracks.forEach((t) => (t.mute = false));
  state.playScope = 'bank';
  state.padBank = 0;
  state.patterns[0][0].fill(0);
  const bankSilence = await Studio.renderAudio();
  expect(energy(bankSilence) < 1e-12, 'this-bank render excludes other banks');
  state.patterns[0][0][0] = 1;
  initHistory();
  await Studio.resample();
  expect(state.pads[0].sample.startsWith('sample-'), 'resampling');
  undoEdit();
  expect(state.pads[0].sample === 'kit0', 'resample undo');
  const before = buffers.kit0.duration;
  $('sourceBpm').value = '135';
  await Studio.stretch();
  expect(
    Math.abs(buffers[state.pads[0].sample].duration - before * 1.5) < 0.001,
    'worker pitch-preserving stretch'
  );
  undoEdit();
  // Real live key lifecycle stays muted by BrowserWindow; no audible output.
  recording = true;
  state.studio.performance.countIn = 0;
  state.studio.performance.quantize = 0.25;
  await Studio.toggle();
  await new Promise((r) => setTimeout(r, 90));
  await Studio.press(0, 0.6, null, 'smoke-key');
  await new Promise((r) => setTimeout(r, 60));
  Studio.release('smoke-key');
  Studio.stop();
  recording = false;
  expect(state.studio.sequences[0].notes.length === 1, 'live record');
  const note = state.studio.sequences[0].notes[0];
  expect(note.velocity === 0.6 && note.duration > 0, 'velocity and held duration');
  // MIDI repeat must not run faster than its selected audio-clock interval or retain cancelled future hits.
  state.studio.sequences[0].notes = [];
  state.studio.performance.repeat = 1;
  state.studio.performance.quantize = 0;
  state.bpm = 120;
  recording = true;
  await Studio.toggle();
  await new Promise((r) => setTimeout(r, 90));
  Studio.midiMessage([0x90, 36, 80], 'smoke');
  await new Promise((r) => setTimeout(r, 80));
  expect(state.studio.sequences[0].notes.length === 1, 'MIDI repeat respects selected interval');
  Studio.midiMessage([0x80, 36, 0], 'smoke');
  Studio.stop();
  expect(state.studio.sequences[0].notes.length === 1, 'MIDI note-off preserves played hit');
  expect(Math.abs(state.studio.sequences[0].notes[0].velocity - 80 / 127) < 1e-8, 'MIDI velocity');
  state.studio.sequences[0].notes = [];
  state.studio.performance.repeat = 0.125;
  await Studio.toggle();
  await new Promise((r) => setTimeout(r, 90));
  await Studio.press(0, 1, null, 'repeat-cancel');
  Studio.release('repeat-cancel');
  Studio.stop();
  recording = false;
  expect(
    state.studio.sequences[0].notes.length === 0,
    'released repeat removes unplayed lookahead hits'
  );
  state.studio.sequences[0].notes.push(note);
  state.studio.performance.repeat = 0;
  Studio.setView('piano');
  expect($('pianoRoll').querySelectorAll('.roll-note').length >= 1, 'piano roll renders');
  Studio.setView('mixer');
  expect($('mixerTracks').children.length === 8, 'eight mixer strips');
  Studio.setView('pads');
  for (const view of ['pads', 'piano', 'mixer', 'song']) {
    Studio.setView(view);
    expect(
      document.documentElement.scrollWidth <= window.innerWidth + 1,
      'no chassis overflow in ' + view
    );
    expect($('position').closest('.transport'), 'position stays in transport');
  }
  Studio.setView('pads');
  await Studio.backup(true);
  await persist();
  const backup = await new Promise((r) => {
    const q = db.transaction('session').objectStore('session').get('backups');
    q.onsuccess = () => r(q.result);
  });
  expect(backup.length > 0 && backup.length <= 5, 'rotating backups');
  validate(state, {});
  const file = await wav(fx).arrayBuffer();
  expect(new TextDecoder().decode(new Uint8Array(file, 0, 4)) === 'RIFF', 'workstation WAV');
  await ctx.suspend();
  recording = false;
  $('record').classList.remove('active');
  state = defaults();
  pattern = 0;
  selected = 0;
  render();
  initHistory();
  console.log(
    'PASS: workstation migration, eight-bar duplication, song, 36 live voices, mixer/stems, scope, resampling, stretch worker, live recording, MIDI repeat/release, piano roll and recovery'
  );
}
