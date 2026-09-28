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

function renderKitSelector() {
  const select = $('kitSelect');
  if (!select) return;
  select.replaceChildren();
  for (const [label, external] of [
    ['Downloaded sample kits', true],
    ['Synthesized starter kits', false]
  ]) {
    const group = document.createElement('optgroup');
    group.label = label;
    for (const kit of KITS.filter((k) => !!k.external === external)) {
      const option = new Option(kit.name, kit.id);
      option.title = kit.description;
      group.append(option);
    }
    select.append(group);
  }
  select.add(new Option('Custom / chopped', 'custom'));
  const pads = state.pads.slice(bankOffset(), bankOffset() + 16),
    matched = KITS.find((k) =>
      pads.every((p, i) => p.sample === (k.external ? 'sample-' + k.samples[i] : kitKey(k.id, i)))
    );
  select.value = matched?.id || 'custom';
}
async function loadKit(id) {
  const kit = KITS.find((k) => k.id === id);
  if (!kit) {
    renderKitSelector();
    return;
  }
  const offset = bankOffset(),
    bank = 'ABCDEFGH'[state.padBank],
    session = state;
  if (
    !confirm(
      'Load ' +
        kit.name +
        ' into bank ' +
        bank +
        '? Only this bank’s sounds will be replaced. Your patterns and other banks stay.'
    )
  ) {
    renderKitSelector();
    return;
  }
  $('kitSelect').disabled = true;
  try {
    let pads;
    if (kit.external) {
      const items = kit.samples.map((id) => packMap.get(id)),
        audio = await Promise.all(items.map(getPackAudio));
      if (session !== state) return;
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
    toast(kit.name + ' loaded into bank ' + bank);
  } catch (error) {
    toast('Kit could not load: ' + error.message);
    renderKitSelector();
  } finally {
    $('kitSelect').disabled = false;
  }
}
function connectKits() {
  $('kitSelect').onchange = () => loadKit($('kitSelect').value);
  for (let i = 0; i < 16; i++) {
    const option = new Option(String(i + 1).padStart(2, '0'), i);
    $('chopDestination').append(option);
  }
}
