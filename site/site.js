'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const { styles, tracks, pattern, render, sr } = OmaDemo;
  const patterns = Object.fromEntries(Object.keys(styles).map((id) => [id, pattern(id)]));
  let style = 'trap',
    ctx,
    master,
    buffers = [],
    running = false,
    timer,
    frame,
    currentStep = -1;
  let nextTime = 0,
    nextStep = 0,
    queue = [],
    generation = 0;
  const voices = new Set(),
    steps = [],
    numbers = [];
  const padKinds = [
    'kick',
    'clap',
    'hat',
    'perc',
    'open',
    'rim',
    'tom',
    'shaker',
    'bass',
    'bass',
    'bass',
    'bass',
    'keys',
    'keys',
    'keys',
    'keys'
  ];
  const padLabels = [
    'Kick',
    'Clap',
    'Hat',
    'Perc',
    'Open hat',
    'Rim',
    'Tom',
    'Shaker',
    'Root',
    'Third',
    'Fifth',
    'Seventh',
    'Key 1',
    'Key 2',
    'Key 3',
    'Key 4'
  ];
  const keys = ['1', '2', '3', '4', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];
  const padButtons = padLabels.map((label, index) => {
    const b = document.createElement('button');
    b.className = 'pad';
    b.type = 'button';
    b.setAttribute('aria-label', `Play ${label}`);
    const number = document.createElement('b');
    number.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('span');
    name.textContent = label;
    b.append(number, name);
    $('pads').append(b);
    b.addEventListener('click', () => hitPad(index));
    return b;
  });
  $('sequencer').append(document.createElement('span'));
  for (let col = 0; col < 16; col++) {
    const n = document.createElement('span');
    n.className = 'step-number';
    n.textContent = col + 1;
    $('sequencer').append(n);
    numbers.push(n);
  }
  tracks.forEach((track, row) => {
    const label = document.createElement('span');
    label.className = 'track-name';
    label.textContent = track;
    $('sequencer').append(label);
    steps[row] = [];
    for (let col = 0; col < 16; col++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'step';
      b.setAttribute('aria-label', `${track}, step ${col + 1}`);
      b.addEventListener('click', () => {
        patterns[style][row][col] = !patterns[style][row][col];
        b.setAttribute('aria-pressed', patterns[style][row][col]);
      });
      b.addEventListener('keydown', (e) => {
        let r = row,
          c = col;
        if (e.key === 'ArrowRight') c = (col + 1) % 16;
        else if (e.key === 'ArrowLeft') c = (col + 15) % 16;
        else if (e.key === 'ArrowDown') r = (row + 1) % 6;
        else if (e.key === 'ArrowUp') r = (row + 5) % 6;
        else return;
        e.preventDefault();
        steps[r][c].focus();
      });
      steps[row][col] = b;
      $('sequencer').append(b);
    }
  });
  function refresh() {
    steps.forEach((row, r) =>
      row.forEach((b, c) => b.setAttribute('aria-pressed', patterns[style][r][c]))
    );
  }
  function makeBuffers() {
    if (!ctx) return;
    const preset = styles[style];
    buffers = padKinds.map((kind, i) => {
      const frequency =
        i < 12
          ? preset.bass * Math.pow(2, [0, 3, 7, 10][Math.max(0, i - 8)] / 12)
          : preset.notes[i - 12];
      const pcm = render(kind, frequency, style === 'mellow');
      const buffer = ctx.createBuffer(1, pcm.length, sr);
      buffer.copyToChannel(pcm, 0);
      return buffer;
    });
  }
  async function ready() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Web Audio unavailable');
    if (!ctx) {
      ctx = new Audio();
      master = ctx.createGain();
      master.gain.value = Number($('volume').value) * 0.5;
      const limiter = ctx.createDynamicsCompressor();
      master.connect(limiter);
      limiter.connect(ctx.destination);
      makeBuffers();
    }
    if (ctx.state === 'suspended') await ctx.resume();
  }
  function sound(index, time) {
    if (!buffers[index]) return;
    const source = ctx.createBufferSource();
    source.buffer = buffers[index];
    source.connect(master);
    voices.add(source);
    source.onended = () => {
      voices.delete(source);
      source.disconnect();
    };
    source.start(time);
  }
  function flash(index) {
    const b = padButtons[index];
    b.classList.add('hit');
    clearTimeout(b.flashTimer);
    b.flashTimer = setTimeout(() => b.classList.remove('hit'), 110);
  }
  async function hitPad(index) {
    try {
      await ready();
      sound(index, ctx.currentTime);
      flash(index);
    } catch {
      $('demo-status').textContent = 'Audio couldn’t start. Try Play again.';
    }
  }
  function paint() {
    if (!running) return;
    while (queue.length && queue[0].time <= ctx.currentTime) {
      const event = queue.shift();
      if (currentStep >= 0) {
        numbers[currentStep].classList.remove('current');
        steps.forEach((row) => row[currentStep].classList.remove('current'));
      }
      currentStep = event.step;
      numbers[currentStep].classList.add('current');
      steps.forEach((row) => row[currentStep].classList.add('current'));
      event.pads.forEach(flash);
    }
    frame = requestAnimationFrame(paint);
  }
  function schedule() {
    if (!running) return;
    // Recover after browser suspension without scheduling an audible burst.
    if (nextTime < ctx.currentTime - 0.1) nextTime = ctx.currentTime + 0.03;
    while (nextTime < ctx.currentTime + 0.1) {
      const played = [];
      patterns[style].forEach((row, r) => {
        if (row[nextStep]) {
          const index =
            r < 4 ? r : r === 4 ? 8 + (nextStep >= 8 ? 2 : 0) : 12 + (nextStep >= 8 ? 2 : 0);
          sound(index, nextTime);
          played.push(index);
          if (r === 5) {
            sound(index === 12 ? 13 : 15, nextTime);
          }
        }
      });
      queue.push({ step: nextStep, time: nextTime, pads: played });
      nextTime +=
        60 / Math.max(60, Math.min(180, Number($('tempo').value) || styles[style].bpm)) / 4;
      nextStep = (nextStep + 1) % 16;
    }
  }
  function stop() {
    generation++;
    running = false;
    clearInterval(timer);
    cancelAnimationFrame(frame);
    queue = [];
    currentStep = -1;
    for (const source of voices) {
      try {
        source.stop();
      } catch {}
    }
    voices.clear();
    steps.flat().forEach((b) => b.classList.remove('current'));
    numbers.forEach((n) => n.classList.remove('current'));
    $('play').setAttribute('aria-pressed', 'false');
    $('play').querySelector('span').textContent = 'Play beat';
    $('play').querySelector('path').setAttribute('d', 'm8 5 11 7-11 7z');
    $('demo-status').textContent = 'Ready when you are.';
  }
  async function start() {
    const ticket = ++generation;
    try {
      await ready();
      if (ticket !== generation) return;
      running = true;
      nextTime = ctx.currentTime + 0.05;
      nextStep = 0;
      $('play').setAttribute('aria-pressed', 'true');
      $('play').querySelector('span').textContent = 'Stop beat';
      $('play').querySelector('path').setAttribute('d', 'M6 6h12v12H6z');
      $('demo-status').textContent = `Playing ${styles[style].name}.`;
      schedule();
      timer = setInterval(schedule, 25);
      paint();
    } catch {
      $('demo-status').textContent = 'Audio couldn’t start. Try Play again.';
    }
  }
  $('play').disabled = false;
  $('play').setAttribute('aria-pressed', 'false');
  $('play').addEventListener('click', () => (running ? stop() : start()));
  document.querySelectorAll('[data-style]').forEach((b) =>
    b.addEventListener('click', () => {
      stop();
      style = b.dataset.style;
      $('tempo').value = styles[style].bpm;
      document.querySelectorAll('[data-style]').forEach((el) => {
        const selected = el === b;
        el.classList.toggle('selected', selected);
        el.setAttribute('aria-pressed', selected);
      });
      makeBuffers();
      refresh();
    })
  );
  $('reset').addEventListener('click', () => {
    patterns[style] = pattern(style);
    refresh();
    $('demo-status').textContent = `${styles[style].name} reset.`;
  });
  $('tempo').addEventListener('change', () => {
    $('tempo').value = Math.max(60, Math.min(180, Number($('tempo').value) || styles[style].bpm));
  });
  $('volume').addEventListener('input', () => {
    if (master) master.gain.setTargetAtTime(Number($('volume').value) * 0.5, ctx.currentTime, 0.01);
  });
  document.addEventListener('keydown', (e) => {
    if (
      !$('demo-disclosure').open ||
      e.repeat ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      e.target.closest('input,button,select,textarea,summary,a,[contenteditable]')
    )
      return;
    const rect = $('instrument').getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const index = keys.indexOf(e.key.toLowerCase());
    if (index !== -1) {
      e.preventDefault();
      hitPad(index);
    }
    if (e.code === 'Space') {
      e.preventDefault();
      running ? stop() : start();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
  });
  window.addEventListener('pagehide', stop);
  $('demo-disclosure').addEventListener('toggle', () => {
    if (!$('demo-disclosure').open) stop();
  });
  document.querySelector('nav a[href="#instrument"]').addEventListener('click', () => {
    $('demo-disclosure').open = true;
  });
  $('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('install-command').textContent);
      $('copy-status').textContent = 'Copied. Paste into your terminal.';
    } catch {
      const range = document.createRange();
      range.selectNodeContents($('install-command'));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      $('copy-status').textContent = 'Select and copy the command above.';
    }
  });
  refresh();
})();
