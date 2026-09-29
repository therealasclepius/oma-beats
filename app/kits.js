'use strict';
const KITS = [
  {
    id: 'classic',
    name: 'Classic punch',
    description: 'Clean, punchy drums and melodic one-shots'
  },
  {
    id: '808',
    name: '808 nights',
    rate: 0.82,
    decay: 0.75,
    drive: 1.2,
    lowpass: 0.75,
    description: 'Long sub kicks, crisp hats, and tuned percussion'
  },
  {
    id: 'club',
    name: 'Club machine',
    rate: 1.1,
    decay: 1.2,
    drive: 2.8,
    lowpass: 0.9,
    description: 'Hard kicks, bright hats, and forward snares'
  },
  {
    id: 'dust',
    name: 'Dusty breaks',
    rate: 0.92,
    decay: 1.35,
    drive: 1.9,
    lowpass: 0.32,
    bits: 9,
    description: 'Warm, short drums with a grainy edge'
  },
  {
    id: 'lofi',
    name: 'Lo-fi tape',
    rate: 0.75,
    decay: 1.1,
    drive: 2.2,
    lowpass: 0.14,
    bits: 7,
    description: 'Softened transients, low tuning, and crunchy texture'
  },
  {
    id: 'electro',
    name: 'Electro circuit',
    rate: 1.32,
    decay: 0.85,
    drive: 1.6,
    lowpass: 0.8,
    ring: true,
    description: 'Metallic percussion and higher electronic tones'
  }
];
function kitKey(id, index) {
  return id === 'classic' ? 'kit' + index : 'kit-' + id + '-' + index;
}
function makeExtraKits() {
  for (const kit of KITS.slice(1))
    for (let index = 0; index < 16; index++) {
      const base = buffers['kit' + index],
        rate = kit.rate,
        length = Math.ceil(base.length / rate),
        b = ctx.createBuffer(1, length, ctx.sampleRate),
        out = b.getChannelData(0),
        input = base.getChannelData(0);
      let low = 0;
      for (let i = 0; i < length; i++) {
        const t = i / ctx.sampleRate,
          pos = i * rate,
          a = Math.floor(pos),
          f = pos - a;
        let value = (input[a] || 0) * (1 - f) + (input[a + 1] || 0) * f;
        if (kit.id === '808' && (index === 0 || index === 8))
          value =
            Math.sin(
              2 * Math.PI * (index === 8 ? 41.2 : 48) * t +
                (index === 0 ? 7 * (1 - Math.exp(-t * 35)) : 0)
            ) *
            0.85 *
            Math.exp(-t * (index === 8 ? 2.7 : 6)) *
            Math.min(t * 350, 1);
        if (kit.id === 'club' && index === 0)
          value = Math.tanh(value * 2 + Math.sin(2 * Math.PI * 52 * t) * 0.25 * Math.exp(-t * 10));
        if (kit.ring && (index === 1 || index === 5 || index === 6 || index === 9 || index === 12))
          value *= Math.cos(2 * Math.PI * (index === 12 ? 65 : 120) * t);
        value *= Math.exp(-t * Math.max(0, kit.decay - 1) * 8);
        low += kit.lowpass * (value - low);
        value = Math.tanh(low * kit.drive) / Math.tanh(kit.drive);
        if (kit.bits) {
          const levels = 2 ** (kit.bits - 1);
          value = Math.round(value * levels) / levels;
        }
        out[i] = value * 0.8 * Math.min(((length - i) / ctx.sampleRate) * 250, 1);
      }
      buffers[kitKey(kit.id, index)] = b;
    }
}

let kitPickerSession,
  kitPickerBank = 0,
  kitLoadGeneration = 0,
  kitLoading = false,
  kitInstrumentsOnly = false;
function renderKitSelector() {
  const button = $('kitSelect');
  if (!button) return;
  const pads = state.pads.slice(bankOffset(), bankOffset() + 16),
    matched = KITS.find((k) =>
      pads.every((p, i) => p.sample === (k.external ? 'sample-' + k.samples[i] : kitKey(k.id, i)))
    );
  const instrument = currentInstrument();
  const name = instrument
    ? SynthEngine.presets.find((p) => p.id === instrument.patch.preset)?.name || 'Instrument'
    : matched?.name || 'Custom / chopped';
  button.textContent = name + ' · Change';
  button.title = 'Choose drum kit or instrument: ' + name;
  button.setAttribute('aria-label', 'Choose drum kit or instrument. Current: ' + name);
}
function showKitBrowser(instrumentsOnly = false) {
  kitInstrumentsOnly = instrumentsOnly === true;
  kitPickerSession = state;
  kitPickerBank = state.padBank;
  kitLoading = false;
  kitLoadGeneration++;
  $('kitSearch').value = '';
  $('kitLoadStatus').textContent = '';
  $('kitBrowserTitle').textContent =
    (kitInstrumentsOnly ? 'Choose an instrument for bank ' : 'Choose a kit for bank ') +
    'ABCDEFGH'[kitPickerBank];
  $('kitBrowserHint').textContent =
    'Loading a kit replaces the 16 sounds in this bank. Your patterns and other banks stay. You can Undo the change.';
  renderKitChoices();
  $('kitBrowser').showModal();
}
function cancelKitBrowser() {
  kitLoadGeneration++;
  kitLoading = false;
  $('kitBrowser').close();
}
function renderKitChoices() {
  const query = $('kitSearch').value.trim().toLowerCase();
  const list = $('kitChoices');
  list.replaceChildren();
  let count = 0;
  const groups = [
    ['Downloaded sample kits', KITS.filter((k) => !kitInstrumentsOnly && k.external)],
    ['Starter kits', KITS.filter((k) => !kitInstrumentsOnly && !k.external)],
    [
      'Built-in instruments',
      SynthEngine.presets.map((p) => ({
        id: 'synth:' + p.id,
        name: p.name,
        description: p.family + (p.description ? ' · ' + p.description : '')
      }))
    ]
  ];
  for (const [label, items] of groups) {
    const matches = items.filter((k) =>
      (k.name + ' ' + (k.description || '')).toLowerCase().includes(query)
    );
    if (!matches.length) continue;
    const heading = document.createElement('h3');
    heading.textContent = label;
    list.append(heading);
    for (const item of matches) {
      count++;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'kit-choice';
      button.disabled = kitLoading;
      const text = document.createElement('span'),
        name = document.createElement('strong'),
        description = document.createElement('small'),
        action = document.createElement('span');
      name.textContent = item.name;
      description.textContent = item.description || '';
      text.append(name, description);
      action.textContent = item.id.startsWith('synth:') ? 'Configure' : 'Load';
      button.append(text, action);
      button.onclick = () => {
        if (kitLoading || kitPickerSession !== state) return;
        if (item.id.startsWith('synth:')) {
          $('kitBrowser').close();
          showSynth(item.id.slice(6));
          return;
        }
        return loadKit(item.id);
      };
      list.append(button);
    }
  }
  if (!count) {
    const empty = document.createElement('p');
    empty.textContent = 'No matching kits. Try another search.';
    list.append(empty);
  }
}
async function loadKit(id) {
  const kit = KITS.find((k) => k.id === id);
  if (!kit) {
    renderKitSelector();
    return;
  }
  if (kitLoading || kitPickerSession !== state) return;
  const offset = kitPickerBank * 16,
    bank = 'ABCDEFGH'[kitPickerBank],
    session = state,
    generation = ++kitLoadGeneration;
  kitLoading = true;
  $('kitLoadStatus').textContent = 'Loading ' + kit.name + '…';
  renderKitChoices();
  try {
    let pads;
    if (kit.external) {
      const items = kit.samples.map((id) => packMap.get(id)),
        audio = await Promise.all(items.map(getPackAudio));
      if (session !== state || generation !== kitLoadGeneration) return;
      items.forEach((item, i) => (buffers[packKey(item)] = audio[i]));
      pads = items.map((item) => ({
        name: item.name.slice(0, 100),
        sample: packKey(item),
        gain: 0.8,
        pitch: 0,
        start: 0,
        end: 1,
        reverse: false,
        sourcePack: item.pack
      }));
    } else
      pads = NAMES.map((name, i) => ({
        name,
        sample: kitKey(id, i),
        gain: 0.8,
        pitch: 0,
        start: 0,
        end: 1,
        reverse: false
      }));
    stop();
    state.pads.splice(offset, 16, ...pads);
    state.kit = id;
    state.bankMono[offset / 16] = false;
    state.padBank = offset / 16;
    selected = offset;
    pruneBuffers();
    render();
    changed();
    $('kitBrowser').close();
    toast(kit.name + ' loaded into bank ' + bank);
  } catch (error) {
    if (session === state && generation === kitLoadGeneration)
      $('kitLoadStatus').textContent = 'Kit could not load: ' + error.message;
  } finally {
    if (generation === kitLoadGeneration) {
      kitLoading = false;
      renderKitChoices();
    }
  }
}
function connectKits() {
  $('kitSelect').onclick = showKitBrowser;
  $('closeKitBrowser').onclick = cancelKitBrowser;
  $('kitBrowser').addEventListener('cancel', cancelKitBrowser);
  $('kitSearch').oninput = renderKitChoices;
  for (let i = 0; i < 16; i++) {
    const option = new Option(String(i + 1).padStart(2, '0'), i);
    $('chopDestination').append(option);
  }
}

async function runKitSmoke() {
  const expect = (condition, message) => {
    if (!condition) throw Error('Kit chooser smoke: ' + message);
  };
  // Match the fresh state created by New without invoking a native confirmation dialog.
  state = defaults();
  pattern = selected = 0;
  render();
  initHistory();
  $('kitSelect').click();
  expect($('kitBrowser').open, 'chooser opens in a new project');
  $('kitSearch').value = '808 nights';
  $('kitSearch').dispatchEvent(new Event('input'));
  const choice = $('kitChoices').querySelector('button');
  expect(choice?.textContent.includes('808 nights'), 'search finds kit');
  await choice.onclick();
  expect(!$('kitBrowser').open && state.pads[0].sample === 'kit-808-0', 'kit loads');
  expect($('kitSelect').textContent.includes('808 nights'), 'current kit label updates');
  undoEdit();
  expect(state.pads[0].sample === 'kit0', 'undo restores classic kit');
  state.padBank = 1;
  selected = 16;
  state.patterns[0][16][0] = 0.8;
  render();
  $('kitSelect').click();
  await loadKit('club');
  expect(state.pads[0].sample === 'kit0', 'other banks preserved');
  expect(state.pads[16].sample === 'kit-club-0', 'target bank loaded');
  expect(state.patterns[0][16][0] === 0.8, 'pattern preserved');
  $('kitSelect').click();
  $('closeKitBrowser').click();
  expect(!$('kitBrowser').open, 'cancel closes chooser');
  expect(ctx.state === 'suspended', 'no live audio during checks');
  console.log('PASS: new-project kit chooser, search, loading, undo, bank isolation and cancel');
}
