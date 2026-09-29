'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function fixture() {
  const elements = new Map();
  const el = () => ({
    children: [],
    value: '',
    textContent: '',
    open: false,
    append(...items) {
      this.children.push(...items);
    },
    replaceChildren(...items) {
      this.children = items;
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    setAttribute() {},
    addEventListener() {}
  });
  const context = vm.createContext({
    document: { createElement: el },
    $: (id) => {
      if (!elements.has(id)) elements.set(id, el());
      return elements.get(id);
    },
    state: {
      padBank: 0,
      pads: Array.from({ length: 128 }, (_, i) => ({ sample: i < 16 ? 'kit' + i : 'kit-empty' })),
      patterns: [[1]],
      bankMono: Array(8).fill(false)
    },
    bankOffset: () => context.state.padBank * 16,
    currentInstrument: () => null,
    SynthEngine: { presets: [] },
    NAMES: Array.from({ length: 16 }, (_, i) => 'Sound ' + i),
    selected: 0,
    buffers: {},
    packMap: new Map(),
    packKey: (item) => 'sample-' + item.id,
    getPackAudio: async () => ({ duration: 1 }),
    stop() {},
    pruneBuffers() {},
    render() {},
    changed() {},
    toast() {}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/kits.js'), 'utf8'), context);
  return { run: (code) => vm.runInContext(code, context), context };
}
test('new project chooser opens, searches, loads a starter kit and preserves other banks', async () => {
  const { run } = fixture();
  run('showKitBrowser()');
  assert.equal(run("$('kitBrowser').open"), true);
  run("$('kitSearch').value='808 nights';renderKitChoices()");
  assert.equal(run("$('kitChoices').children.length"), 2);
  await run("$('kitChoices').children[1].onclick()");
  assert.equal(run('state.pads[0].sample'), 'kit-808-0');
  assert.equal(run('state.pads[16].sample'), 'kit-empty');
  assert.equal(run('state.patterns[0][0]'), 1);
  assert.equal(run("$('kitBrowser').open"), false);
  run('renderKitSelector()');
  assert.match(run("$('kitSelect').textContent"), /808 nights/);
});
function external(run) {
  run(
    "KITS.push({id:'downloaded',name:'Downloaded kit',external:true,samples:Array.from({length:16},(_,i)=>String(i))});for(let i=0;i<16;i++)packMap.set(String(i),{id:String(i),name:'Sample '+i,pack:'test'});showKitBrowser();"
  );
}
test('downloaded kits load their audio into only the selected bank', async () => {
  const { run } = fixture();
  run('state.padBank=2');
  external(run);
  await run("loadKit('downloaded')");
  assert.equal(run('state.pads[32].sample'), 'sample-0');
  assert.equal(run('state.pads[0].sample'), 'kit0');
  assert.equal(run('Object.keys(buffers).length'), 16);
});
test('canceling a pending kit load leaves the project intact', async () => {
  const { run, context } = fixture();
  let finish;
  const audio = new Promise((resolve) => {
    finish = resolve;
  });
  context.getPackAudio = () => audio;
  external(run);
  const pending = run("loadKit('downloaded')");
  run('cancelKitBrowser()');
  finish({ duration: 1 });
  await pending;
  assert.equal(run('state.pads[0].sample'), 'kit0');
  assert.equal(run('Object.keys(buffers).length'), 0);
});
test('failed download stays in the chooser and allows retry', async () => {
  const { run, context } = fixture();
  context.getPackAudio = async () => {
    throw Error('Offline');
  };
  external(run);
  await run("loadKit('downloaded')");
  assert.equal(run("$('kitBrowser').open"), true);
  assert.match(run("$('kitLoadStatus').textContent"), /Offline/);
  assert.equal(run('kitLoading'), false);
  assert.equal(run('state.pads[0].sample'), 'kit0');
});
