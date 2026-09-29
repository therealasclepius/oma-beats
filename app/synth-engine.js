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
  // Original instruments, generated locally; no commercial samples required.
  presets.push(
    ...[
      {
        id: '808-overdrive',
        name: '808 Overdrive',
        family: 'Bass',
        description: 'Trap \u00b7 saturated sub with a hard pitch drop',
        patch: {
          wave: 'sine',
          cutoff: 1600,
          octave: 1,
          detune: 0,
          drive: 4,
          sub: 0.25,
          pitchSweep: 24,
          decay: 0.6,
          sustain: 0.15,
          gate: 0.9,
          release: 0.25,
          mono: true
        }
      },
      {
        id: 'rubber-sub',
        name: 'Rubber Sub',
        family: 'Bass',
        description: 'House \u00b7 rounded, bouncy bass',
        patch: {
          wave: 'triangle',
          cutoff: 900,
          octave: 1,
          detune: 0,
          filterEnv: 2.5,
          decay: 0.14,
          sustain: 0.2,
          gate: 0.25,
          release: 0.09,
          drive: 1,
          mono: true
        }
      },
      {
        id: 'warehouse',
        name: 'Warehouse Reese',
        family: 'Bass',
        description: 'EDM \u00b7 wide detuned bass with a solid sub',
        patch: {
          wave: 'supersaw',
          cutoff: 650,
          octave: 1,
          detune: 32,
          sub: 0.45,
          drive: 2.2,
          gate: 0.8,
          mono: true
        }
      },
      {
        id: 'neuro',
        name: 'Neuro Bite',
        family: 'Bass',
        description: 'Bass music \u00b7 metallic FM movement',
        patch: {
          wave: 'growl',
          cutoff: 2300,
          octave: 1,
          detune: 7,
          fmRatio: 1.5,
          fmIndex: 4,
          drive: 2,
          filterRate: 5,
          filterDepth: 0.65,
          sub: 0.3,
          gate: 0.7,
          mono: true
        }
      },
      {
        id: 'acid-runner',
        name: 'Acid Runner',
        family: 'Bass',
        description: 'Rave \u00b7 resonant filter snap',
        patch: {
          wave: 'pulse',
          cutoff: 500,
          resonance: 6,
          octave: 2,
          detune: 0,
          filterEnv: 4,
          decay: 0.13,
          sustain: 0.3,
          drive: 1.5,
          gate: 0.25,
          release: 0.1,
          mono: true
        }
      },
      {
        id: 'fm-knock',
        name: 'FM Knock',
        family: 'Bass',
        description: 'House \u00b7 percussive metallic bass',
        patch: {
          wave: 'fm',
          fmRatio: 1,
          fmIndex: 3.8,
          cutoff: 3200,
          octave: 1,
          detune: 0,
          decay: 0.12,
          sustain: 0.08,
          gate: 0.22,
          release: 0.1,
          drive: 1,
          mono: true
        }
      },
      {
        id: 'wobble',
        name: 'Wobble Engine',
        family: 'Bass',
        description: 'Dubstep \u00b7 rhythmic filter movement',
        patch: {
          wave: 'square',
          cutoff: 1600,
          resonance: 2.5,
          octave: 1,
          detune: 14,
          filterRate: 4,
          filterDepth: 0.85,
          sub: 0.4,
          drive: 2,
          gate: 1,
          mono: true
        }
      },
      {
        id: 'skyline',
        name: 'Skyline Supersaw',
        family: 'Leads',
        description: 'EDM \u00b7 seven-voice stereo lead',
        patch: {
          wave: 'supersaw',
          cutoff: 10000,
          detune: 28,
          spread: 0.9,
          octave: 4,
          attack: 0.015,
          gate: 0.6,
          delayMix: 0.22,
          delayTime: 0.19
        }
      },
      {
        id: 'laser',
        name: 'Laser Hook',
        family: 'Leads',
        description: 'Trap / EDM \u00b7 biting pitch-swept lead',
        patch: {
          wave: 'pulse',
          cutoff: 6500,
          octave: 4,
          detune: 9,
          pitchSweep: 12,
          decay: 0.18,
          sustain: 0.25,
          gate: 0.35,
          drive: 1.6,
          delayMix: 0.18,
          delayTime: 0.15
        }
      },
      {
        id: 'rave-siren',
        name: 'Rave Siren',
        family: 'Leads',
        description: 'Rave \u00b7 rising resonant hook',
        patch: {
          wave: 'sawtooth',
          cutoff: 4200,
          resonance: 3,
          octave: 4,
          detune: 20,
          pitchSweep: -12,
          filterRate: 6,
          filterDepth: 0.4,
          gate: 0.65,
          drive: 1.2
        }
      },
      {
        id: 'chrome',
        name: 'Chrome Lead',
        family: 'Leads',
        description: 'EDM \u00b7 bright metallic FM lead',
        patch: {
          wave: 'growl',
          cutoff: 8500,
          octave: 3,
          detune: 10,
          fmRatio: 2,
          fmIndex: 2,
          gate: 0.4,
          delayMix: 0.2,
          delayTime: 0.17
        }
      },
      {
        id: 'octave-riot',
        name: 'Octave Riot',
        family: 'Leads',
        description: 'Festival \u00b7 stacked octave saws',
        patch: {
          wave: 'supersaw',
          cutoff: 7000,
          octave: 3,
          detune: 18,
          sub: 0.55,
          spread: 0.65,
          drive: 1.2,
          gate: 0.55,
          release: 0.4
        }
      },
      {
        id: 'trance-needle',
        name: 'Trance Needle',
        family: 'Leads',
        description: 'Trance \u00b7 sharp unison pluck',
        patch: {
          wave: 'supersaw',
          cutoff: 1300,
          filterEnv: 3,
          decay: 0.16,
          sustain: 0.08,
          gate: 0.2,
          release: 0.25,
          detune: 24,
          spread: 0.8,
          octave: 4,
          delayMix: 0.3,
          delayTime: 0.22
        }
      },
      {
        id: 'nightdrive',
        name: 'Nightdrive Pluck',
        family: 'Keys',
        description: 'Trap \u00b7 dark, glassy pluck',
        patch: {
          wave: 'fm',
          fmRatio: 3,
          fmIndex: 2.8,
          cutoff: 4500,
          octave: 3,
          detune: 0,
          decay: 0.25,
          sustain: 0.04,
          gate: 0.35,
          release: 0.5,
          delayMix: 0.25,
          delayTime: 0.24
        }
      },
      {
        id: 'crystal',
        name: 'Crystal Mallet',
        family: 'Keys',
        description: 'Trap \u00b7 sparkling struck glass',
        patch: {
          wave: 'bell',
          fmRatio: 5.4,
          fmIndex: 3.2,
          cutoff: 11000,
          octave: 4,
          detune: 0,
          decay: 0.45,
          sustain: 0.04,
          gate: 0.55,
          release: 0.75,
          delayMix: 0.2,
          delayTime: 0.2
        }
      },
      {
        id: 'house-organ',
        name: 'House Organ',
        family: 'Keys',
        description: 'House \u00b7 short punchy organ stab',
        patch: {
          wave: 'organ',
          cutoff: 2200,
          filterEnv: 1.5,
          octave: 3,
          detune: 0,
          decay: 0.12,
          sustain: 0.18,
          gate: 0.2,
          release: 0.13,
          drive: 2
        }
      },
      {
        id: 'velvet',
        name: 'Velvet Tines',
        family: 'Keys',
        description: 'R&B \u00b7 warm electric keys',
        patch: {
          wave: 'fm',
          fmRatio: 1,
          fmIndex: 0.8,
          cutoff: 2800,
          octave: 3,
          detune: 4,
          attack: 0.012,
          decay: 0.9,
          sustain: 0.22,
          gate: 1,
          release: 0.7,
          delayMix: 0.12,
          delayTime: 0.28
        }
      },
      {
        id: 'neon-stab',
        name: 'Neon Stab',
        family: 'Keys',
        description: 'House \u00b7 bright stereo synth stab',
        patch: {
          wave: 'supersaw',
          cutoff: 900,
          filterEnv: 3.5,
          octave: 3,
          detune: 20,
          spread: 0.65,
          decay: 0.12,
          sustain: 0.05,
          gate: 0.23,
          release: 0.14,
          drive: 1
        }
      },
      {
        id: 'orbit-pluck',
        name: 'Orbit Pluck',
        family: 'Keys',
        description: 'Melodic house \u00b7 pulsing pluck with echoes',
        patch: {
          wave: 'pulse',
          cutoff: 1500,
          filterEnv: 2.5,
          octave: 4,
          detune: 6,
          decay: 0.18,
          sustain: 0.05,
          gate: 0.24,
          release: 0.25,
          delayMix: 0.35,
          delayTime: 0.21
        }
      },
      {
        id: 'cinema',
        name: 'Wide Cinema',
        family: 'Pads',
        description: 'Cinematic \u00b7 sweeping stereo saw pad',
        patch: {
          wave: 'supersaw',
          cutoff: 1600,
          filterEnv: 1,
          octave: 3,
          detune: 30,
          spread: 1,
          attack: 0.8,
          decay: 0.7,
          sustain: 0.8,
          gate: 2.4,
          release: 2,
          filterRate: 0.3,
          filterDepth: 0.3
        }
      },
      {
        id: 'frozen',
        name: 'Frozen Glass',
        family: 'Pads',
        description: 'Ambient \u00b7 slow metallic shimmer',
        patch: {
          wave: 'bell',
          fmRatio: 2.7,
          fmIndex: 1.2,
          cutoff: 6200,
          octave: 4,
          detune: 16,
          spread: 0.8,
          attack: 0.6,
          decay: 1,
          sustain: 0.65,
          gate: 2,
          release: 2.3,
          delayMix: 0.24,
          delayTime: 0.32
        }
      },
      {
        id: 'dusk-choir',
        name: 'Dusk Choir',
        family: 'Pads',
        description: 'Dark trap \u00b7 hollow, drifting atmosphere',
        patch: {
          wave: 'pulse',
          cutoff: 1100,
          resonance: 2,
          octave: 3,
          detune: 28,
          spread: 0.8,
          attack: 0.5,
          decay: 0.5,
          sustain: 0.7,
          gate: 2,
          release: 1.8,
          filterRate: 0.6,
          filterDepth: 0.4
        }
      },
      {
        id: 'motion-cloud',
        name: 'Motion Cloud',
        family: 'Pads',
        description: 'Melodic EDM \u00b7 moving unison texture',
        patch: {
          wave: 'supersaw',
          cutoff: 2400,
          octave: 3,
          detune: 35,
          spread: 1,
          attack: 0.4,
          sustain: 0.8,
          gate: 2,
          release: 1.7,
          filterRate: 1.7,
          filterDepth: 0.6,
          delayMix: 0.16,
          delayTime: 0.27
        }
      },
      {
        id: 'low-orbit',
        name: 'Low Orbit',
        family: 'Pads',
        description: 'Cinematic \u00b7 deep, ominous drone',
        patch: {
          wave: 'growl',
          cutoff: 800,
          octave: 2,
          detune: 20,
          fmRatio: 0.5,
          fmIndex: 1.6,
          sub: 0.3,
          attack: 0.9,
          sustain: 0.85,
          gate: 2.5,
          release: 2.2,
          filterRate: 0.25,
          filterDepth: 0.4
        }
      }
    ]
  );
  const characterDefaults = {
    filterEnv: 0,
    filterRate: 0,
    filterDepth: 0,
    pitchSweep: 0,
    drive: 0,
    sub: 0,
    spread: 0,
    fmRatio: 0,
    fmIndex: 0,
    delayMix: 0,
    delayTime: 0.2
  };

  function preset(id) {
    const item = presets.find((p) => p.id === id);
    if (!item) throw Error('Unknown instrument preset');
    return { ...base, ...characterDefaults, ...item.patch, preset: id };
  }
  function validate(p) {
    if (
      !p ||
      !presets.some((item) => item.id === p.preset) ||
      ![
        'sine',
        'triangle',
        'sawtooth',
        'square',
        'fm',
        'organ',
        'bell',
        'supersaw',
        'pulse',
        'growl'
      ].includes(p.wave) ||
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
    for (const [key, min, max] of [
      ['filterEnv', 0, 5],
      ['filterRate', 0, 12],
      ['filterDepth', 0, 0.9],
      ['pitchSweep', -24, 36],
      ['drive', 0, 5],
      ['sub', 0, 1],
      ['spread', 0, 1],
      ['fmRatio', 0, 8],
      ['fmIndex', 0, 6],
      ['delayMix', 0, 0.5],
      ['delayTime', 0.05, 0.5]
    ]) {
      if (
        p[key] !== undefined &&
        (typeof p[key] !== 'number' || !Number.isFinite(p[key]) || p[key] < min || p[key] > max)
      )
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
    p = { ...characterDefaults, ...p };
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
      audio = new OfflineContext(
        p.spread > 0 ? 2 : 1,
        Math.ceil((env.end + (p.delayMix ? p.delayTime * 3 : 0) + 0.01) * sampleRate),
        sampleRate
      );
    const frequency = 440 * 2 ** ((midi - 69) / 12),
      filter = audio.createBiquadFilter(),
      amp = audio.createGain();
    filter.type = 'lowpass';
    filter.Q.value = p.resonance;
    filter.frequency.setValueAtTime(Math.min(p.cutoff, sampleRate * 0.45), 0);
    if (p.preset === 'acid')
      filter.frequency.exponentialRampToValueAtTime(Math.max(80, p.cutoff * 0.18), p.gate);
    if (p.filterEnv) {
      filter.frequency.setValueAtTime(Math.min(sampleRate * 0.45, p.cutoff * 2 ** p.filterEnv), 0);
      filter.frequency.exponentialRampToValueAtTime(
        Math.min(p.cutoff, sampleRate * 0.45),
        Math.max(0.02, env.attack + env.decay)
      );
    }
    if (p.filterRate && p.filterDepth) {
      const lfo = audio.createOscillator(),
        depth = audio.createGain();
      lfo.frequency.value = p.filterRate;
      depth.gain.value = p.cutoff * p.filterDepth;
      lfo.connect(depth).connect(filter.frequency);
      lfo.start(0);
      lfo.stop(env.end);
    }
    if (p.drive) {
      const shaper = audio.createWaveShaper();
      const amount = 1 + p.drive * 3;
      shaper.curve = Float32Array.from(
        { length: 2048 },
        (_, i) => Math.tanh(((i / 2047) * 2 - 1) * amount) / Math.tanh(amount)
      );
      shaper.oversample = '2x';
      filter.connect(shaper).connect(amp);
    } else filter.connect(amp);
    amp.connect(audio.destination);
    amp.gain.setValueAtTime(0, 0);
    amp.gain.linearRampToValueAtTime(0.3, env.attack);
    amp.gain.linearRampToValueAtTime(0.3 * p.sustain, env.attack + env.decay);
    amp.gain.setValueAtTime(0.3 * p.sustain, env.gate);
    amp.gain.linearRampToValueAtTime(0, env.end);
    function oscillator(type, ratio, level, cents = 0, pan = 0) {
      const osc = audio.createOscillator(),
        gain = audio.createGain();
      osc.type = type;
      osc.frequency.value = frequency * ratio;
      if (p.pitchSweep) {
        osc.frequency.setValueAtTime(frequency * ratio * 2 ** (p.pitchSweep / 12), 0);
        osc.frequency.exponentialRampToValueAtTime(frequency * ratio, Math.min(0.12, p.gate));
      }
      osc.detune.value = cents;
      gain.gain.value = level;
      osc.connect(gain);
      if (p.spread) {
        const panner = audio.createStereoPanner();
        panner.pan.value = pan * p.spread;
        gain.connect(panner).connect(filter);
      } else gain.connect(filter);
      osc.start(0);
      osc.stop(env.end);
      return osc;
    }
    if (p.wave === 'fm' || p.wave === 'bell' || p.wave === 'growl') {
      const carrier = oscillator(p.wave === 'growl' ? 'sawtooth' : 'sine', 1, 1, 0, -0.4),
        mod = audio.createOscillator(),
        depth = audio.createGain();
      mod.frequency.value = frequency * (p.fmRatio || (p.wave === 'bell' ? 3.5 : 2));
      depth.gain.setValueAtTime(frequency * (p.fmIndex || (p.wave === 'bell' ? 2.5 : 1.8)), 0);
      depth.gain.exponentialRampToValueAtTime(frequency * 0.03, Math.max(0.1, env.gate));
      mod.connect(depth).connect(carrier.frequency);
      mod.start(0);
      mod.stop(env.end);
      if (p.detune) oscillator('sine', 1, 0.25, p.detune, 0.7);
    } else if (p.wave === 'organ') {
      for (const [ratio, level] of [
        [1, 0.65],
        [2, 0.3],
        [3, 0.15],
        [4, 0.08]
      ])
        oscillator('sine', ratio, level, p.detune);
    } else if (p.wave === 'supersaw') {
      for (let i = -3; i <= 3; i++) oscillator('sawtooth', 1, 1.3 / 7, (i * p.detune) / 3, i / 3);
    } else if (p.wave === 'pulse') {
      oscillator('square', 1, 0.7, -p.detune / 2, -0.7);
      oscillator('sawtooth', 2, 0.3, p.detune / 2, 0.7);
    } else {
      oscillator(p.wave, 1, 0.65, -p.detune / 2, -1);
      oscillator(p.wave, 1, 0.65, p.detune / 2, 1);
    }
    if (p.sub) oscillator('sine', 0.5, p.sub);
    const buffer = await audio.startRendering();
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
      buffer.getChannelData(c)
    );
    if (p.delayMix) {
      const dry = channels.map((data) => data.slice());
      for (let c = 0; c < channels.length; c++) {
        for (let tap = 1; tap <= 3; tap++) {
          const offset = Math.round(p.delayTime * sampleRate * tap);
          const source = dry[(c + tap) % channels.length];
          const level = p.delayMix ** tap;
          for (let i = offset; i < channels[c].length; i++)
            channels[c][i] += source[i - offset] * level;
        }
      }
    }
    let peak = 0;
    for (const data of channels)
      for (const value of data) {
        if (!Number.isFinite(value)) throw Error('Instrument rendering failed');
        peak = Math.max(peak, Math.abs(value));
      }
    if (peak > 0.85)
      for (const data of channels) for (let i = 0; i < data.length; i++) data[i] *= 0.85 / peak;
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
