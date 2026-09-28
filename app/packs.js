'use strict';
let packCatalog = { packs: [], samples: [], kits: [] },
  packMap = new Map(),
  packPage = 0,
  packPreview = null;
const packAudioCache = new Map();
const packKey = (item) => 'sample-' + item.id;
const packURL = (item) => '/packs/' + item.path.split('/').map(encodeURIComponent).join('/');
async function loadPackCatalog() {
  try {
    const response = await fetch('/packs/catalog.json');
    if (!response.ok) throw Error('Catalog unavailable');
    packCatalog = await response.json();
    packMap = new Map(packCatalog.samples.map((item) => [item.id, item]));
    for (let i = KITS.length - 1; i >= 0; i--) if (KITS[i].external) KITS.splice(i, 1);
    KITS.push(...packCatalog.kits);
  } catch (error) {
    console.error(error);
    toast('Sample packs unavailable. The built-in kits still work.');
  }
}
async function getPackAudio(item) {
  const key = packKey(item);
  if (buffers[key]) return buffers[key];
  if (packAudioCache.has(key)) return packAudioCache.get(key);
  const response = await fetch(packURL(item));
  if (!response.ok) throw Error('Could not load ' + item.name);
  const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
  if (buffer.duration > 120.1 || buffer.numberOfChannels > 2)
    throw Error('Use mono or stereo samples up to two minutes long.');
  packAudioCache.set(key, buffer);
  while (packAudioCache.size > 24) packAudioCache.delete(packAudioCache.keys().next().value);
  return buffer;
}
function stopPackPreview() {
  if (packPreview) {
    try {
      packPreview.stop();
    } catch {}
    packPreview = null;
  }
  $('packPreviewStatus').textContent = 'Preview is off';
}
async function previewPackSample(item) {
  stopPackPreview();
  await unlock();
  const buffer = await getPackAudio(item),
    source = ctx.createBufferSource(),
    gain = ctx.createGain();
  source.buffer = buffer;
  gain.gain.value = 0.6;
  source.connect(gain).connect(master);
  source.start();
  source.stop(ctx.currentTime + Math.min(buffer.duration, 8));
  packPreview = source;
  activeSources.add(source);
  $('packPreviewStatus').textContent = 'Preview: ' + item.name;
  source.onended = () => {
    activeSources.delete(source);
    source.disconnect();
    gain.disconnect();
    if (packPreview === source) {
      packPreview = null;
      $('packPreviewStatus').textContent = 'Preview is off';
    }
  };
}
async function loadPackSample(item) {
  const target = Number($('packTarget').value),
    session = state;
  try {
    const buffer = await getPackAudio(item);
    if (session !== state) return;
    buffers[packKey(item)] = buffer;
    state.pads[target] = {
      name: item.name.slice(0, 100),
      sample: packKey(item),
      gain: 0.8,
      pitch: 0,
      start: 0,
      end: 1,
      reverse: false,
      sourcePack: item.pack
    };
    selected = target;
    state.padBank = Math.floor(target / 16);
    pruneBuffers();
    render();
    changed();
    toast(
      item.name + ' → ' + 'ABCDEFGH'[state.padBank] + String((target % 16) + 1).padStart(2, '0')
    );
    refreshPackTarget();
  } catch (error) {
    toast(error.message);
  }
}
async function chopPackSample(item) {
  try {
    stopPackPreview();
    const response = await fetch(packURL(item));
    if (!response.ok) throw Error('Could not load this sample');
    $('packBrowser').close();
    await importToWorkshop(
      new File([await response.blob()], item.name + '.wav', { type: 'audio/wav' })
    );
  } catch (error) {
    toast(error.message);
  }
}
function refreshPackTarget() {
  const select = $('packTarget'),
    value = select.value || String(selected);
  select.replaceChildren();
  state.pads.forEach((pad, index) =>
    select.add(
      new Option(
        'ABCDEFGH'[Math.floor(index / 16)] +
          String((index % 16) + 1).padStart(2, '0') +
          ' · ' +
          pad.name,
        index
      )
    )
  );
  select.value = value;
}
function showPackBrowser() {
  packPage = 0;
  $('packTarget').value = selected;
  refreshPackTarget();
  $('packTarget').value = selected;
  renderPackBrowser();
  $('packBrowser').showModal();
}
function renderPackBrowser() {
  const query = $('packSearch').value.trim().toLowerCase().split(/\s+/).filter(Boolean),
    pack = $('packFilter').value,
    type = $('typeFilter').value;
  const filtered = packCatalog.samples.filter(
    (item) =>
      (!pack || item.pack === pack) &&
      (!type || item.category === type) &&
      query.every((word) =>
        (
          item.name +
          ' ' +
          item.category +
          ' ' +
          item.path +
          ' ' +
          (item.bpm || '') +
          ' ' +
          (packCatalog.packs.find((p) => p.id === item.pack)?.tags || '') +
          ' ' +
          (packCatalog.packs.find((p) => p.id === item.pack)?.name || '')
        )
          .toLowerCase()
          .includes(word)
      )
  );
  const size = 60,
    pages = Math.max(1, Math.ceil(filtered.length / size));
  packPage = clamp(packPage, 0, pages - 1);
  $('packResultCount').textContent =
    filtered.length + ' samples · page ' + (packPage + 1) + ' / ' + pages;
  $('packPrevious').disabled = packPage === 0;
  $('packNext').disabled = packPage === pages - 1;
  $('packRows').replaceChildren();
  for (const item of filtered.slice(packPage * size, (packPage + 1) * size)) {
    const row = document.createElement('div');
    row.className = 'sample-row';
    const name = document.createElement('div'),
      title = document.createElement('b'),
      meta = document.createElement('span');
    title.textContent = item.name;
    meta.textContent =
      (packCatalog.packs.find((p) => p.id === item.pack)?.name || item.pack) +
      ' · ' +
      item.category +
      ' · ' +
      (item.seconds ? item.seconds.toFixed(2) + 's' : 'Audio file') +
      (item.bpm ? ' · ' + item.bpm + ' BPM' : '');
    name.append(title, meta);
    row.append(name);
    for (const [text, action] of [
      ['▶ Preview', () => previewPackSample(item)],
      ['Load pad', () => loadPackSample(item)],
      ['Chop', () => chopPackSample(item)]
    ]) {
      const b = document.createElement('button');
      b.textContent = text;
      b.setAttribute('aria-label', text + ' ' + item.name);
      b.onclick = async () => {
        b.disabled = true;
        try {
          await action();
        } catch (error) {
          toast(error.message);
        } finally {
          b.disabled = false;
        }
      };
      row.append(b);
    }
    $('packRows').append(row);
  }
  const source = packCatalog.packs.find((p) => p.id === pack);
  $('packSource').textContent = source
    ? source.name + ' · ' + source.license
    : packCatalog.samples.length.toLocaleString() +
      ' installed samples · choose a pack to see its publisher and license.';
  $('packSourceLink').hidden = !source?.source;
  $('packSourceLink').href =
    source?.source ||
    'https://www.musicradar.com/news/tech/free-music-samples-royalty-free-loops-hits-and-multis-to-download-sampleradar';
}
function connectPackBrowser() {
  $('browsePacks').onclick = showPackBrowser;
  $('closePackBrowser').onclick = () => {
    stopPackPreview();
    $('packBrowser').close();
  };
  $('packBrowser').addEventListener('cancel', stopPackPreview);
  $('stopPackPreview').onclick = stopPackPreview;
  refreshPackFilters();

  for (const id of ['packSearch', 'packFilter', 'typeFilter'])
    $(id).addEventListener('input', () => {
      packPage = 0;
      renderPackBrowser();
    });
  $('packPrevious').onclick = () => {
    packPage--;
    renderPackBrowser();
    $('packRows').scrollTop = 0;
  };
  $('packNext').onclick = () => {
    packPage++;
    renderPackBrowser();
    $('packRows').scrollTop = 0;
  };
  refreshPackTarget();
}

function refreshPackFilters() {
  const pack = $('packFilter'),
    type = $('typeFilter');
  pack.replaceChildren(new Option('All packs', ''));
  type.replaceChildren(new Option('All sounds', ''));
  for (const item of packCatalog.packs) pack.add(new Option(item.name, item.id));
  for (const category of [...new Set(packCatalog.samples.map((s) => s.category))].sort())
    type.add(new Option(category, category));
}
