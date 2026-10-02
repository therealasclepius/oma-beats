'use strict';
// Waveform-similarity overlap-add. All channels share alignment to preserve stereo phase.
const SampleStretch = (() => {
  function process(channels, factor, sampleRate) {
    if (
      !Number.isFinite(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 192000 ||
      !Array.isArray(channels) ||
      channels.length < 1 ||
      channels.length > 2 ||
      !Number.isFinite(factor) ||
      factor < 0.5 ||
      factor > 2 ||
      !channels[0].length ||
      channels.some((c) => c.length !== channels[0].length)
    )
      throw Error('Stretch supports mono/stereo audio at 50–200% duration');
    if (factor === 1) return channels.map((c) => c.slice());
    const size = Math.min(2048, 2 ** Math.floor(Math.log2(sampleRate * 0.04))),
      hop = size / 2,
      search = Math.floor(sampleRate * 0.004),
      length = Math.round(channels[0].length * factor),
      out = channels.map(() => new Float32Array(length + size)),
      weight = new Float32Array(length + size),
      window = Float32Array.from(
        { length: size },
        (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1))
      );
    let previous = 0;
    for (let pos = 0; pos < length; pos += hop) {
      const expected = Math.round(pos / factor);
      let best = Math.min(expected, Math.max(0, channels[0].length - size)),
        score = -Infinity;
      if (pos) {
        for (
          let candidate = Math.max(0, expected - search);
          candidate <= Math.min(channels[0].length - size, expected + search);
          candidate += 4
        ) {
          let dot = 0,
            aa = 1e-12,
            bb = 1e-12;
          for (let j = 0; j < hop; j += 8) {
            const a = channels[0][previous + hop + j] || 0,
              b = channels[0][candidate + j];
            dot += a * b;
            aa += a * a;
            bb += b * b;
          }
          const value = dot / Math.sqrt(aa * bb);
          if (value > score) {
            score = value;
            best = candidate;
          }
        }
      }
      previous = best;
      for (let j = 0; j < size && pos + j < out[0].length; j++) {
        const w = window[j];
        weight[pos + j] += w;
        for (let c = 0; c < channels.length; c++)
          out[c][pos + j] += (channels[c][best + j] || 0) * w;
      }
    }
    return out.map((data) => {
      const result = data.slice(0, length);
      for (let i = 0; i < length; i++) result[i] = weight[i] > 1e-7 ? result[i] / weight[i] : 0;
      const fade = Math.min(128, Math.floor(length / 4));
      for (let i = 0; i < fade; i++) {
        result[i] *= i / fade;
        result[length - 1 - i] *= i / fade;
      }
      return result;
    });
  }
  return { process };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SampleStretch;
