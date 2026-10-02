'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
class AudioMock {
  constructor() {
    this.sampleRate = 44100;
    this.currentTime = 0;
    this.sources = [];
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    return Promise.resolve();
  }
  parameter() {
    return { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} };
  }
  createGain() {
    return {
      gain: this.parameter(),
      connect(x) {
        return x;
      },
      disconnect() {}
    };
  }
  createDynamicsCompressor() {
    return { threshold: {}, knee: {}, ratio: {}, connect() {} };
  }
  createBiquadFilter() {
    return {
      frequency: {},
      Q: {},
      connect(x) {
        return x;
      },
      disconnect() {}
    };
  }
  createBufferSource() {
    const source = {
      playbackRate: {},
      stops: [],
      connect(x) {
        return x;
      },
      start(...args) {
        this.started = args;
      },
      stop(time) {
        this.stops.push(time);
      },
      disconnect() {}
    };
    this.sources.push(source);
    return source;
  }
}
function engine() {
  const elements = new Map();
  const element = () => ({
    value: '',
    textContent: '',
    classList: { add() {}, remove() {}, toggle() {} },
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  });
  const intervals = new Set();
  const context = vm.createContext({
    SynthEngine: require('../app/synth-engine.js'),
    StudioModel: require('../app/studio-model.js'),
    AudioContext: AudioMock,
    console,
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
      querySelectorAll: () => [],
      addEventListener() {}
    },
    window: { addEventListener() {} },
    connectChopper() {},
    connectKits() {},
    connectImporter() {},
    connectPackBrowser() {},
    connectHistory() {},
    connectSynth() {},
    recordEdit() {},
    setInterval() {
      const id = {};
      intervals.add(id);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    intervals,
    setTimeout: () => 1,
    clearTimeout() {},
    structuredClone
  });
  const source = fs
    .readFileSync(path.join(__dirname, '..', 'app', 'app.js'), 'utf8')
    .replace('\ninit();', '\n');
  vm.runInContext(source, context);
  vm.runInContext('state=defaults();buffers.kit0={duration:1};', context);
  return (code) => vm.runInContext(code, context);
}
test('all-bank playback keeps the original sounds when the visible bank changes', () => {
  const run = engine();
  run(
    "state.playScope='all';state.pads[16]={...state.pads[0],name:'Other bank',sample:'other'};buffers.other={duration:2};state.patterns[0][0][0]=1;state.patterns[0][16][0]=1;state.padBank=3;nextTime=.04;schedule();"
  );
  assert.equal(run('ctx.sources.length'), 2);
  assert.equal(run('ctx.sources[0].buffer.duration'), 1);
  assert.equal(run('ctx.sources[1].buffer.duration'), 2);
  assert.equal(run('ctx.sources[0].omaBank'), 0);
  assert.equal(run('ctx.sources[1].omaBank'), 1);
});
test('this-bank scope excludes patterns in other banks', () => {
  const run = engine();
  run(
    "state.playScope='bank';state.padBank=0;state.pads[16]={...state.pads[0]};state.patterns[0][0][0]=1;state.patterns[0][16][0]=1;nextTime=.04;schedule();"
  );
  assert.equal(run('ctx.sources.length'), 1);
});
test('mono cuts only voices in its own bank, including out-of-order scheduled notes', () => {
  const run = engine();
  run(
    'state.bankMono[0]=true;voice(ctx,master,state.pads[0],1,1,false,0);voice(ctx,master,state.pads[0],1.1,1,false,1);voice(ctx,master,state.pads[0],1.2,1,false,0);voice(ctx,master,state.pads[0],1.15,1,false,0);'
  );
  assert.equal(run('ctx.sources[0].stops.at(-1)'), 1.15);
  assert.equal(run('ctx.sources[1].stops.length'), 0);
  assert.equal(run('ctx.sources[3].stops[0]'), 1.2);
});
test('old 16-pad projects migrate without sharing pattern rows or pad objects', () => {
  const run = engine();
  run(
    'state.version=1;state.pads=state.pads.slice(0,16);state.patterns=state.patterns.map(p=>p.slice(0,16));delete state.bankMono;state.choke=true;migrateState(state);state.patterns[0][16][0]=1;'
  );
  assert.equal(run('state.pads.length'), 128);
  assert.equal(run('state.patterns[0][17][0]'), 0);
  assert.equal(run('state.pads[16]===state.pads[17]'), false);
  assert.equal(run('state.bankMono.every(Boolean)'), true);
});
test('project validation rejects corrupt sample references and bank modes', () => {
  const run = engine();
  run(
    "for(let i=0;i<16;i++)buffers['kit'+i]={duration:1};buffers['kit-empty']={duration:1};validate(state,{});"
  );
  assert.throws(() => run("state.pads[0].sample='missing';validate(state,{})"), /Invalid pad/);
  assert.throws(
    () => run("state=defaults();state.bankMono=['yes'];validate(state,{})"),
    /Invalid bank/
  );
});

test('playback buttons switch running audio between all banks and the selected bank', async () => {
  const run = engine();
  run(`connectControls();
    state.pads[16]={...state.pads[0]};
    state.patterns[0][0][0]=1;
    state.patterns[0][16][0]=1;
    state.padBank=1;`);
  await run('togglePlay()');
  assert.deepEqual(Array.from(run('ctx.sources.map(s=>s.omaBank)')), [1]);
  await run("$('playAllBanks').onclick();");
  assert.equal(run('state.playScope'), 'all');
  assert.equal(run("$('playAllBanks').attributes['aria-pressed']"), 'true');
  assert.equal(run("$('playThisBank').attributes['aria-pressed']"), 'false');
  assert.equal(run('playing'), true);
  assert.equal(run('ctx.sources[0].stops.length'), 1);
  assert.deepEqual(Array.from(run('ctx.sources.slice(1).map(s=>s.omaBank)')), [0, 1]);
  await run("$('playThisBank').onclick();");
  assert.equal(run('state.playScope'), 'bank');
  assert.equal(run("$('playThisBank').attributes['aria-pressed']"), 'true');
  assert.equal(run("$('playAllBanks').attributes['aria-pressed']"), 'false');
  assert.equal(run('ctx.sources.at(-1).omaBank'), 1);
  assert.equal(run('intervals.size'), 1);
  run('stop()');
  assert.equal(run('intervals.size'), 0);
});

test('scope buttons save the idle selection without starting audio', () => {
  const run = engine();
  run("connectControls();$('playAllBanks').onclick();");
  assert.equal(run('sessionData().state.playScope'), 'all');
  assert.equal(run('playing'), false);
  assert.equal(run('ctx.sources.length'), 0);
  const revision = run('revision');
  run("$('playAllBanks').onclick();");
  assert.equal(run('revision'), revision);
});
