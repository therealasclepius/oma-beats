'use strict';
// Original demo compositions and procedural sounds. No third-party recordings.
const OmaDemo = (() => {
  const sr = 44100;
  const tracks = ['Kick', 'Clap', 'Hat', 'Perc', 'Bass', 'Keys'];
  const styles = {
    trap: {
      name: 'After hours',
      bpm: 86,
      bass: 49,
      notes: [196, 233.08, 293.66, 349.23],
      hits: [
        [0, 6, 10],
        [4, 12],
        [0, 2, 4, 6, 7, 8, 10, 12, 14, 15],
        [3, 11],
        [0, 6, 10, 14],
        [0, 10]
      ]
    },
    house: {
      name: 'Side street',
      bpm: 124,
      bass: 55,
      notes: [220, 261.63, 329.63, 392],
      hits: [
        [0, 4, 8, 12],
        [4, 12],
        [2, 6, 10, 14],
        [3, 7, 11, 15],
        [0, 3, 6, 8, 11, 14],
        [2, 6, 10, 14]
      ]
    },
    mellow: {
      name: 'Soft focus',
      bpm: 76,
      bass: 65.41,
      notes: [261.63, 311.13, 392, 466.16],
      hits: [[0, 7, 10], [4, 12], [0, 2, 4, 6, 8, 10, 12, 14], [11], [0, 7, 10], [0, 8]]
    }
  };
  function pattern(id) {
    return styles[id].hits.map((hits) => Array.from({ length: 16 }, (_, i) => hits.includes(i)));
  }
  function render(kind, frequency = 220, warm = false) {
    const durations = {
      kick: 0.55,
      clap: 0.25,
      hat: 0.09,
      perc: 0.2,
      bass: 0.7,
      keys: 1.25,
      open: 0.32,
      rim: 0.12,
      tom: 0.3,
      shaker: 0.08
    };
    const duration = durations[kind] || 0.5;
    const data = new Float32Array(Math.ceil(duration * sr));
    let seed = 9137,
      phase = 0,
      lastNoise = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / sr;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 2147483648 - 1,
        high = (noise - lastNoise) * 0.5;
      lastNoise = noise;
      let value = 0;
      if (kind === 'kick') {
        phase += (2 * Math.PI * (47 + 105 * Math.exp(-t * 45))) / sr;
        value = Math.sin(phase) * Math.exp(-t * 9) * 0.85 + high * Math.exp(-t * 150) * 0.08;
      } else if (kind === 'clap') {
        const burst =
          t < 0.027 ? 0.4 + 0.6 * Math.pow(Math.sin(t * 400), 2) : Math.exp(-(t - 0.027) * 26);
        value = high * burst * 0.6;
      } else if (kind === 'hat' || kind === 'open' || kind === 'shaker')
        value = high * Math.exp(-t * (kind === 'open' ? 16 : 65)) * 0.36;
      else if (kind === 'perc' || kind === 'rim' || kind === 'tom') {
        const f = kind === 'tom' ? 140 : kind === 'rim' ? 1100 : 420;
        value =
          (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 1.58 * t) * 0.35) *
          Math.exp(-t * 30) *
          0.27;
      } else if (kind === 'bass') {
        const env = Math.min(1, t / 0.008) * Math.exp(-t * 5) * (1 - Math.pow(t / duration, 5));
        value =
          (Math.sin(2 * Math.PI * frequency * t) +
            Math.sin(2 * Math.PI * frequency * 2 * t) * 0.15) *
          env *
          0.48;
      } else {
        const env = Math.min(1, t / 0.012) * Math.exp(-t * (warm ? 3.5 : 4.5)) * (1 - t / duration);
        value =
          (Math.sin(
            2 * Math.PI * frequency * t +
              Math.sin(2 * Math.PI * frequency * 2 * t) * Math.exp(-t * 9)
          ) +
            0.22 * Math.sin(2 * Math.PI * frequency * 1.005 * t)) *
          env *
          0.3;
      }
      const fade = Math.min(1, i / 40, (data.length - 1 - i) / 220);
      data[i] = value * Math.max(0, fade);
    }
    return data;
  }
  return { sr, tracks, styles, pattern, render };
})();
if (typeof module !== 'undefined') module.exports = OmaDemo;
