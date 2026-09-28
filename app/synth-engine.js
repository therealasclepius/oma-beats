'use strict';
// The same graph renders previews and pad notes offline. No synth operation
// connects to speakers until the user explicitly previews or plays a pad.
const SynthEngine = (() => {
  const scales = {
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    major: [0, 2, 4, 5, 7, 9, 11],
    pentatonic: [0, 3, 5, 7, 10]
  };
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const base = {
    wave: 'sawtooth',
    cutoff: 3500,
    resonance: 0.7,
    attack: 0.008,
    decay: 0.25,
    sustain: 0.55,
    release: 0.25,
    gate: 0.5,
    detune: 8,
    octave: 3,
    root: 0,
    scale: 'minor',
    mono: false
  };
  const presets = [
    {
      id: 'sub',
      name: 'Sub foundation',
      family: 'Bass',
      patch: {
        wave: 'sine',
        cutoff: 450,
        attack: 0.006,
        decay: 0.15,
        sustain: 0.85,
        release: 0.12,
        gate: 0.45,
        detune: 0,
        octave: 1,
        mono: true
      }
    },
    {
      id: 'reese',
      name: 'Reese bass',
      family: 'Bass',
      patch: { cutoff: 950, resonance: 1.4, detune: 22, octave: 1, gate: 0.65, mono: true }
    },
    {
      id: 'acid',
      name: 'Acid pulse',
      family: 'Bass',
      patch: {
        wave: 'square',
        cutoff: 1600,
        resonance: 5,
        decay: 0.16,
        sustain: 0.15,
        release: 0.1,
        detune: 0,
        octave: 1,
        gate: 0.22,
        mono: true
      }
    },
    {
      id: 'saw-lead',
      name: 'Festival lead',
      family: 'Leads',
      patch: { cutoff: 8500, resonance: 1, detune: 15, octave: 4, gate: 0.4 }
    },
    {
      id: 'pluck',
      name: 'Glass pluck',
      family: 'Leads',
      patch: {
        wave: 'triangle',
        cutoff: 7500,
        decay: 0.2,
        sustain: 0.08,
        release: 0.3,
        detune: 5,
        octave: 4,
        gate: 0.25
      }
    },
    {
      id: 'square-lead',
      name: 'Arcade lead',
      family: 'Leads',
      patch: { wave: 'square', cutoff: 4200, detune: 2, octave: 3, release: 0.12, gate: 0.3 }
    },
    {
      id: 'electric',
      name: 'Electric keys',
      family: 'Keys',
      patch: {
        wave: 'fm',
        cutoff: 6500,
        decay: 0.65,
        sustain: 0.18,
        release: 0.45,
        detune: 0,
        octave: 3,
        gate: 0.8
      }
    },
    {
      id: 'organ',
      name: 'Sunday organ',
      family: 'Keys',
      patch: {
        wave: 'organ',
        cutoff: 6500,
        attack: 0.012,
        decay: 0.08,
        sustain: 0.9,
        release: 0.15,
        detune: 0,
        octave: 3,
        gate: 0.6
      }
    },
    {
      id: 'bell',
      name: 'Midnight bells',
      family: 'Keys',
      patch: {
        wave: 'bell',
        cutoff: 10000,
        decay: 0.8,
        sustain: 0.08,
        release: 0.8,
        detune: 0,
        octave: 4,
        gate: 0.9
      }
    },
    {
      id: 'warm-pad',
      name: 'Warm horizon',
      family: 'Pads',
      patch: {
        cutoff: 1800,
        attack: 0.45,
        decay: 0.5,
        sustain: 0.8,
        release: 1.5,
        detune: 12,
        octave: 3,
        gate: 1.8
      }
    },
    {
      id: 'air-pad',
      name: 'Airwaves',
      family: 'Pads',
      patch: {
        wave: 'triangle',
        cutoff: 7000,
        attack: 0.7,
        decay: 0.3,
        sustain: 0.75,
        release: 2,
        detune: 25,
        octave: 4,
        gate: 2
      }
    },
    {
      id: 'dark-pad',
      name: 'Afterhours',
      family: 'Pads',
      patch: {
        wave: 'square',
        cutoff: 700,
        attack: 0.35,
        decay: 0.6,
        sustain: 0.7,
        release: 1.8,
        detune: 18,
        octave: 2,
        gate: 1.6
      }
    }
  ];
  function preset(id) {
    const item = presets.find((p) => p.id === id);
    if (!item) throw Error('Unknown instrument preset');
    return { ...base, ...item.patch, preset: id };
  }
  function validate(p) {
    if (
      !p ||
      !presets.some((item) => item.id === p.preset) ||
      !['sine', 'triangle', 'sawtooth', 'square', 'fm', 'organ', 'bell'].includes(p.wave) ||
      !Object.hasOwn(scales, p.scale) ||
      typeof p.mono !== 'boolean'
    )
      throw Error('Invalid instrument preset');
    for (const [key, min, max] of [
      ['cutoff', 80, 18000],
      ['resonance', 0.5, 8],
      ['attack', 0.003, 2],
      ['decay', 0.01, 2],
      ['sustain', 0, 1],
      ['release', 0.02, 3],
      ['gate', 0.08, 4],
      ['detune', 0, 35],
      ['octave', 0, 4],
      ['root', 0, 11]
    ]) {
      if (typeof p[key] !== 'number' || !Number.isFinite(p[key]) || p[key] < min || p[key] > max)
        throw Error('Invalid instrument ' + key);
    }
    if (!Number.isInteger(p.root) || !Number.isInteger(p.octave))
      throw Error('Invalid instrument tuning');
    return p;
  }
  function notes(p) {
    validate(p);
    const scale = scales[p.scale];
    return Array.from(
      { length: 16 },
      (_, i) =>
        (p.octave + 1) * 12 + p.root + scale[i % scale.length] + 12 * Math.floor(i / scale.length)
    );
  }
  const noteName = (midi) => names[midi % 12] + (Math.floor(midi / 12) - 1);
  function envelope(p) {
    const attack = Math.min(p.attack, p.gate * 0.5),
      decay = Math.min(p.decay, p.gate - attack);
    return { attack, decay, gate: p.gate, end: p.gate + p.release };
  }
  async function renderNote(p, midi, OfflineContext, sampleRate = 44100) {
    validate(p);
    if (
      !Number.isInteger(midi) ||
      midi < 12 ||
      midi > 107 ||
      !Number.isInteger(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 192000
    )
      throw Error('Invalid instrument note');
    const env = envelope(p),
      audio = new OfflineContext(1, Math.ceil((env.end + 0.01) * sampleRate), sampleRate);
    const frequency = 440 * 2 ** ((midi - 69) / 12),
      filter = audio.createBiquadFilter(),
      amp = audio.createGain();
    filter.type = 'lowpass';
    filter.Q.value = p.resonance;
    filter.frequency.setValueAtTime(Math.min(p.cutoff, sampleRate * 0.45), 0);
    if (p.preset === 'acid')
      filter.frequency.exponentialRampToValueAtTime(Math.max(80, p.cutoff * 0.18), p.gate);
    filter.connect(amp);
    amp.connect(audio.destination);
    amp.gain.setValueAtTime(0, 0);
    amp.gain.linearRampToValueAtTime(0.3, env.attack);
    amp.gain.linearRampToValueAtTime(0.3 * p.sustain, env.attack + env.decay);
    amp.gain.setValueAtTime(0.3 * p.sustain, env.gate);
    amp.gain.linearRampToValueAtTime(0, env.end);
    function oscillator(type, ratio, level, cents = 0) {
      const osc = audio.createOscillator(),
        gain = audio.createGain();
      osc.type = type;
      osc.frequency.value = frequency * ratio;
      osc.detune.value = cents;
      gain.gain.value = level;
      osc.connect(gain).connect(filter);
      osc.start(0);
      osc.stop(env.end);
      return osc;
    }
    if (p.wave === 'fm' || p.wave === 'bell') {
      const carrier = oscillator('sine', 1, 1),
        mod = audio.createOscillator(),
        depth = audio.createGain();
      mod.frequency.value = frequency * (p.wave === 'bell' ? 3.5 : 2);
      depth.gain.setValueAtTime(frequency * (p.wave === 'bell' ? 2.5 : 1.8), 0);
      depth.gain.exponentialRampToValueAtTime(frequency * 0.03, Math.max(0.1, env.gate));
      mod.connect(depth).connect(carrier.frequency);
      mod.start(0);
      mod.stop(env.end);
      if (p.detune) oscillator('sine', 1, 0.25, p.detune);
    } else if (p.wave === 'organ') {
      for (const [ratio, level] of [
        [1, 0.65],
        [2, 0.3],
        [3, 0.15],
        [4, 0.08]
      ])
        oscillator('sine', ratio, level, p.detune);
    } else {
      oscillator(p.wave, 1, 0.65, -p.detune / 2);
      oscillator(p.wave, 1, 0.65, p.detune / 2);
    }
    const buffer = await audio.startRendering(),
      data = buffer.getChannelData(0);
    let peak = 0;
    for (const value of data) {
      if (!Number.isFinite(value)) throw Error('Instrument rendering failed');
      peak = Math.max(peak, Math.abs(value));
    }
    if (peak > 0.85) for (let i = 0; i < data.length; i++) data[i] *= 0.85 / peak;
    return buffer;
  }
  function validateBanks(banks) {
    if (banks === undefined) return;
    if (!Array.isArray(banks) || banks.length !== 8) throw Error('Invalid instrument banks');
    for (const bank of banks)
      if (bank !== null) {
        if (!bank || typeof bank.group !== 'string' || !/^[a-f0-9-]{36}$/.test(bank.group))
          throw Error('Invalid instrument bank');
        validate(bank.patch);
      }
  }
  return {
    presets,
    scales,
    names,
    preset,
    validate,
    notes,
    noteName,
    envelope,
    renderNote,
    validateBanks
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SynthEngine;
