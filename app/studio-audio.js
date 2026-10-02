'use strict';
const StudioAudio = (() => {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function curve(amount) {
    return Float32Array.from({ length: 1024 }, (_, i) => {
      const x = (i / 1023) * 2 - 1;
      return amount ? Math.tanh(x * (1 + amount * 8)) / Math.tanh(1 + amount * 8) : x;
    });
  }
  function mixer(audio, destination, settings, bpm) {
    const reverb = audio.createConvolver(),
      reverbGain = audio.createGain(),
      delay = audio.createDelay(2),
      feedback = audio.createGain();
    const impulse = audio.createBuffer(2, Math.ceil(audio.sampleRate * 1.8), audio.sampleRate);
    let seed = 37;
    for (let c = 0; c < 2; c++)
      for (let i = 0; i < impulse.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        impulse.getChannelData(c)[i] =
          (seed / 2147483648 - 1) * Math.pow(1 - i / impulse.length, 3) * 0.5;
      }
    reverb.buffer = impulse;
    reverbGain.gain.value = 0.7;
    reverb.connect(reverbGain).connect(destination);
    delay.delayTime.value = (60 / bpm) * 0.75;
    feedback.gain.value = 0.32;
    delay.connect(feedback).connect(delay);
    delay.connect(destination);
    const channels = settings.map((t) => {
      const input = audio.createGain(),
        low = audio.createBiquadFilter(),
        mid = audio.createBiquadFilter(),
        high = audio.createBiquadFilter(),
        drive = audio.createWaveShaper(),
        comp = audio.createDynamicsCompressor(),
        duck = audio.createGain(),
        pan = audio.createStereoPanner(),
        gain = audio.createGain(),
        rev = audio.createGain(),
        echo = audio.createGain(),
        meter = audio.createAnalyser();
      low.type = 'lowshelf';
      low.frequency.value = 180;
      mid.type = 'peaking';
      mid.frequency.value = 1200;
      mid.Q.value = 0.8;
      high.type = 'highshelf';
      high.frequency.value = 6000;
      drive.oversample = '2x';
      meter.fftSize = 256;
      input
        .connect(low)
        .connect(mid)
        .connect(high)
        .connect(drive)
        .connect(comp)
        .connect(duck)
        .connect(pan)
        .connect(gain)
        .connect(meter)
        .connect(destination);
      gain.connect(rev).connect(reverb);
      gain.connect(echo).connect(delay);
      return {
        input,
        low,
        mid,
        high,
        drive,
        comp,
        duck,
        pan,
        gain,
        rev,
        echo,
        meter,
        driveValue: null
      };
    });
    function update(tracks, tempo = bpm, time = audio.currentTime) {
      delay.delayTime.setValueAtTime((60 / tempo) * 0.75, time);
      const solo = tracks.some((t) => t.solo);
      tracks.forEach((t, i) => {
        const n = channels[i];
        n.low.gain.setValueAtTime(t.low, time);
        n.mid.gain.setValueAtTime(t.mid, time);
        n.high.gain.setValueAtTime(t.high, time);
        if (n.driveValue !== t.drive) {
          n.drive.curve = curve(t.drive);
          n.driveValue = t.drive;
        }
        n.comp.threshold.setValueAtTime(-3 - t.compression * 27, time);
        n.comp.ratio.setValueAtTime(1 + t.compression * 7, time);
        n.comp.attack.value = 0.006;
        n.comp.release.value = 0.16;
        n.pan.pan.setValueAtTime(t.pan, time);
        n.gain.gain.setValueAtTime(t.mute || (solo && !t.solo) ? 0 : t.volume, time);
        n.rev.gain.setValueAtTime(t.reverb * 0.5, time);
        n.echo.gain.setValueAtTime(t.delay * 0.5, time);
      });
    }
    function automate(track, param, value, time, tracks) {
      const t = tracks[track];
      if (param === 'volume' && (t.mute || (tracks.some((x) => x.solo) && !t.solo))) return;
      const p = param === 'pan' ? channels[track].pan.pan : channels[track].gain.gain;
      p.setValueAtTime(value, time);
    }
    function trigger(bank, time, tracks) {
      tracks.forEach((t, i) => {
        if (t.duck && t.sidechain === bank && i !== bank) {
          const g = channels[i].duck.gain;
          g.setValueAtTime(1 - t.duck * 0.9, time);
          g.linearRampToValueAtTime(1, time + 0.22);
        }
      });
    }
    function dispose() {
      for (const c of channels) for (const n of Object.values(c)) n?.disconnect?.();
      reverb.disconnect();
      reverbGain.disconnect();
      delay.disconnect();
      feedback.disconnect();
    }
    update(settings);
    return { channels, update, automate, trigger, dispose };
  }
  function synth(audio, destination, patch, midi, time, velocity = 1) {
    const p = {
      delayMix: 0,
      delayTime: 0.2,
      filterEnv: 0,
      filterRate: 0,
      filterDepth: 0,
      pitchSweep: 0,
      drive: 0,
      sub: 0,
      spread: 0,
      fmRatio: 0,
      fmIndex: 0,
      ...patch
    };
    const frequency = 440 * 2 ** ((midi - 69) / 12),
      filter = audio.createBiquadFilter(),
      amp = audio.createGain(),
      bendNodes = [],
      nodes = [filter, amp],
      oscillators = [];
    let released = false,
      releaseAt = Infinity,
      ended = false,
      stopAt = Infinity;
    const level = 0.3 * velocity,
      attack = p.attack,
      decay = p.decay;
    filter.type = 'lowpass';
    filter.Q.value = p.resonance;
    filter.frequency.setValueAtTime(
      Math.min(audio.sampleRate * 0.45, p.cutoff * 2 ** p.filterEnv),
      time
    );
    if (p.filterEnv || p.preset === 'acid')
      filter.frequency.exponentialRampToValueAtTime(
        p.preset === 'acid' ? Math.max(80, p.cutoff * 0.18) : p.cutoff,
        time + attack + decay
      );
    if (p.drive) {
      const shaper = audio.createWaveShaper();
      shaper.curve = curve(p.drive / 5);
      shaper.oversample = '2x';
      filter.connect(shaper).connect(amp);
      nodes.push(shaper);
    } else filter.connect(amp);
    amp.connect(destination);
    // Three finite taps match rendered presets and keep live/export tails bounded.
    if (p.delayMix)
      for (let tap = 1; tap <= 3; tap++) {
        const delay = audio.createDelay(3),
          gain = audio.createGain();
        delay.delayTime.value = p.delayTime * tap;
        gain.gain.value = p.delayMix * Math.pow(0.42, tap - 1);
        amp.connect(delay).connect(gain).connect(destination);
        nodes.push(delay, gain);
      }
    const cleanup = audio.createConstantSource(),
      silent = audio.createGain();
    silent.gain.value = 0;
    cleanup.connect(silent).connect(destination);
    cleanup.start(time);
    nodes.push(cleanup, silent);
    amp.gain.setValueAtTime(0, time);
    amp.gain.linearRampToValueAtTime(level, time + attack);
    amp.gain.linearRampToValueAtTime(level * p.sustain, time + attack + decay);
    function osc(type, ratio, volume, cents = 0, pan = 0) {
      const o = audio.createOscillator(),
        g = audio.createGain();
      o.type = type;
      g.gain.value = volume;
      o.frequency.setValueAtTime(frequency * ratio * 2 ** (p.pitchSweep / 12), time);
      if (p.pitchSweep) o.frequency.exponentialRampToValueAtTime(frequency * ratio, time + 0.12);
      o.detune.value = cents;
      o.connect(g);
      if (p.spread) {
        const stereo = audio.createStereoPanner();
        stereo.pan.value = pan * p.spread;
        g.connect(stereo).connect(filter);
        nodes.push(stereo);
      } else g.connect(filter);
      o.start(time);
      nodes.push(o, g);
      oscillators.push(o);
      bendNodes.push({ o, ratio, cents });
      return o;
    }
    if (['fm', 'bell', 'growl'].includes(p.wave)) {
      const carrier = osc(p.wave === 'growl' ? 'sawtooth' : 'sine', 1, 1, 0, -0.4),
        mod = audio.createOscillator(),
        depth = audio.createGain(),
        ratio = p.fmRatio || (p.wave === 'bell' ? 3.5 : 2);
      mod.frequency.setValueAtTime(frequency * ratio, time);
      depth.gain.setValueAtTime(frequency * (p.fmIndex || (p.wave === 'bell' ? 2.5 : 1.8)), time);
      depth.gain.exponentialRampToValueAtTime(frequency * 0.03, time + Math.max(0.1, p.gate));
      mod.connect(depth).connect(carrier.frequency);
      mod.start(time);
      oscillators.push(mod);
      bendNodes.push({ o: mod, ratio, cents: 0 });
      nodes.push(mod, depth);
      if (p.detune) osc('sine', 1, 0.25, p.detune, 0.7);
    } else if (p.wave === 'organ') {
      [
        [1, 0.65],
        [2, 0.3],
        [3, 0.15],
        [4, 0.08]
      ].forEach(([r, l]) => osc('sine', r, l, p.detune));
    } else if (p.wave === 'supersaw') {
      for (let i = -3; i <= 3; i++) osc('sawtooth', 1, 1.3 / 7, (i * p.detune) / 3, i / 3);
    } else if (p.wave === 'pulse') {
      osc('square', 1, 0.7, -p.detune / 2, -0.7);
      osc('sawtooth', 2, 0.3, p.detune / 2, 0.7);
    } else {
      osc(p.wave, 1, 0.65, -p.detune / 2, -1);
      osc(p.wave, 1, 0.65, p.detune / 2, 1);
    }
    if (p.sub) osc('sine', 0.5, p.sub);
    if (p.filterRate && p.filterDepth) {
      const lfo = audio.createOscillator(),
        depth = audio.createGain();
      lfo.frequency.value = p.filterRate;
      depth.gain.value = p.cutoff * p.filterDepth;
      lfo.connect(depth).connect(filter.frequency);
      lfo.start(time);
      oscillators.push(lfo);
      nodes.push(lfo, depth);
    }
    function stop(at = audio.currentTime) {
      if (at >= stopAt) return;
      stopAt = at;
      for (const o of oscillators) {
        try {
          o.stop(at);
        } catch {}
      }
      cleanup.stop(at + (p.delayMix ? p.delayTime * 3 : 0) + 0.02);
    }
    function release(at = audio.currentTime) {
      if (at >= releaseAt) return;
      releaseAt = at;
      released = true;
      const elapsed = Math.max(0, at - time),
        value =
          elapsed < attack
            ? (level * elapsed) / attack
            : elapsed < attack + decay
              ? level * (1 - ((1 - p.sustain) * (elapsed - attack)) / decay)
              : level * p.sustain;
      amp.gain.cancelScheduledValues(at);
      amp.gain.setValueAtTime(value, at);
      amp.gain.linearRampToValueAtTime(0, at + p.release);
      stop(at + p.release + 0.01);
    }
    const handle = {
      release,
      stop,
      get released() {
        return released;
      },
      get ended() {
        return ended;
      },
      pitch(note, bend = 0, glide = 0, at = audio.currentTime) {
        const f = 440 * 2 ** ((note + bend - 69) / 12);
        for (const { o, ratio } of bendNodes) {
          o.frequency.cancelScheduledValues(at);
          if (glide) o.frequency.setTargetAtTime(f * ratio, at, Math.max(0.003, glide / 3));
          else o.frequency.setValueAtTime(f * ratio, at);
        }
      },
      onended: null
    };
    cleanup.onended = () => {
      ended = true;
      for (const n of nodes) n.disconnect();
      handle.onended?.();
    };
    return handle;
  }
  function click(audio, destination, time, accent = false) {
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.frequency.value = accent ? 1400 : 900;
    g.gain.setValueAtTime(0.12, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);
    o.connect(g).connect(destination);
    o.start(time);
    o.stop(time + 0.04);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
    return o;
  }
  return { mixer, synth, click };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = StudioAudio;
