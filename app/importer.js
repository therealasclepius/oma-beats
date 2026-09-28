'use strict';
let importing = false;
function parseTime(value) {
  const parts = String(value).trim().split(':');
  if (parts.length > 3 || parts.some((v) => !/^\d+(\.\d+)?$/.test(v)))
    throw Error('Use seconds or a time like 1:24 for the start.');
  return parts.reduce((total, value) => total * 60 + Number(value), 0);
}
function showImporter() {
  if (state.lastYoutube) $('youtubeUrl').value = state.lastYoutube;
  $('sampleImporter').showModal();
  refreshSampleLibrary();
}
async function importToWorkshop(file) {
  if (file.size > 32 * 1024 * 1024) throw Error('Choose an audio file smaller than 32 MB.');
  const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
  if (buffer.duration > 120.1) throw Error('Choose a clip up to two minutes long.');
  if (buffer.numberOfChannels > 2) throw Error('Choose mono or stereo audio.');
  const key = 'sample-' + crypto.randomUUID(),
    name = file.name.replace(/\.[^.]+$/, '').slice(0, 100);
  buffers[key] = buffer;
  state.chop = { sample: key, name, markers: [0, 1] };
  chopDraft = structuredClone(state.chop);
  chopSelected = 0;
  chopCursor = 0;
  chopView = [0, 1];
  chopUndo = [];
  pruneBuffers();
  changed();
  $('sampleImporter').close();
  $('chopDestination').value = '0';
  $('chopEditor').showModal();
  renderChopper();
  toast('Sample ready — Find chops or place your own cues');
}
async function fetchImportJob(id) {
  for (let attempt = 0; attempt < 180; attempt++) {
    const response = await fetch('/api/import-jobs/' + encodeURIComponent(id));
    const job = await response.json();
    if (!response.ok) throw Error(job.error || 'The import could not be found.');
    $('importStatus').textContent = job.message;
    if (job.status === 'error') throw Error(job.message);
    if (job.status === 'ready') {
      const audio = await fetch(job.audio);
      if (!audio.ok) throw Error('Could not retrieve the audio clip.');
      return { blob: await audio.blob(), title: job.title };
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw Error('This import is taking too long. Try another clip.');
}
async function importYoutube() {
  if (importing) return;
  const url = $('youtubeUrl').value.trim();
  try {
    const start = parseTime($('youtubeStart').value),
      duration = Number($('youtubeDuration').value);
    if (!url) throw Error('Paste a YouTube video link first.');
    if (!Number.isFinite(duration) || duration < 1 || duration > 120)
      throw Error('Choose a clip length from 1 to 120 seconds.');
    importing = true;
    $('importYoutube').disabled = true;
    $('importYoutube').textContent = 'Importing…';
    $('importStatus').textContent = 'Connecting to YouTube…';
    const response = await fetch('/api/import-youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, start, duration })
      }),
      data = await response.json();
    if (!response.ok) throw Error(data.error || 'Could not start the import.');
    state.lastYoutube = url;
    changed();
    const audio = await fetchImportJob(data.id);
    await importToWorkshop(new File([audio.blob], audio.title + '.wav', { type: 'audio/wav' }));
    $('importStatus').textContent = 'Clip loaded into the chop editor.';
  } catch (error) {
    $('importStatus').textContent = error.message;
    toast(error.message);
  } finally {
    importing = false;
    $('importYoutube').disabled = false;
    $('importYoutube').textContent = 'Import → chop';
  }
}
function connectImporter() {
  $('getSamples').onclick = showImporter;
  $('openLibrarySample').onclick = openLibrarySample;
  $('closeImporter').onclick = () => $('sampleImporter').close();
  $('importYoutube').onclick = importYoutube;
  $('localImport').onclick = () => $('workshopFile').click();
  $('workshopFile').onchange = async (e) => {
    try {
      if (e.target.files[0]) await importToWorkshop(e.target.files[0]);
    } catch (error) {
      toast(error.message);
    } finally {
      e.target.value = '';
    }
  };
  const area = $('localDrop');
  area.ondragover = (e) => {
    e.preventDefault();
    area.classList.add('drag');
  };
  area.ondragleave = () => area.classList.remove('drag');
  area.ondrop = async (e) => {
    e.preventDefault();
    area.classList.remove('drag');
    try {
      if (e.dataTransfer.files[0]) await importToWorkshop(e.dataTransfer.files[0]);
    } catch (error) {
      toast(error.message);
    }
  };
  $('youtubeUrl').addEventListener('paste', () =>
    setTimeout(() => {
      try {
        const u = new URL($('youtubeUrl').value),
          t = u.searchParams.get('t') || u.searchParams.get('start');
        if (t) {
          const seconds = /^\d+$/.test(t)
            ? Number(t)
            : [...t.matchAll(/(\d+)(h|m|s)/g)].reduce(
                (sum, m) => sum + Number(m[1]) * { h: 3600, m: 60, s: 1 }[m[2]],
                0
              );
          if (seconds) $('youtubeStart').value = seconds;
        }
      } catch {}
    }, 0)
  );
  $('resumeWorkshop').onclick = () => {
    if (!state.chop) {
      showImporter();
      return;
    }
    chopDraft = structuredClone(state.chop);
    chopSelected = 0;
    chopCursor = chopDraft.markers[0];
    chopView = [chopDraft.markers[0], chopDraft.markers.at(-1)];
    chopUndo = [];
    $('chopEditor').showModal();
    renderChopper();
  };
}

async function refreshSampleLibrary() {
  const select = $('sampleLibrary');
  select.replaceChildren();
  try {
    const response = await fetch('/api/library');
    if (!response.ok) throw Error('Library unavailable');
    const clips = await response.json();
    if (!clips.length) {
      const option = new Option('Imported clips will appear here', '');
      select.add(option);
    }
    for (const clip of clips) {
      const option = new Option(clip.title + ' · ' + clip.duration + 's', clip.id);
      option.dataset.title = clip.title;
      select.add(option);
    }
  } catch (error) {
    select.add(new Option(error.message, ''));
  }
  $('openLibrarySample').disabled = !select.value;
}
async function openLibrarySample() {
  const select = $('sampleLibrary'),
    id = select.value;
  if (!id) return;
  try {
    const response = await fetch('/api/library/' + encodeURIComponent(id) + '.wav');
    if (!response.ok) throw Error('Could not open that saved sample.');
    await importToWorkshop(
      new File([await response.blob()], select.selectedOptions[0].dataset.title + '.wav', {
        type: 'audio/wav'
      })
    );
  } catch (error) {
    toast(error.message);
  }
}
