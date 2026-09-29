'use strict';
let undoStack = [],
  redoStack = [],
  historyCurrent = null,
  historyGroup = '',
  historyTime = 0,
  restoringHistory = false;
function historySnapshot() {
  return { state: structuredClone(state), buffers: { ...buffers }, selected };
}
function editSignature(s) {
  const copy = { ...s };
  delete copy.padBank;
  delete copy.pattern;
  return JSON.stringify(copy);
}
function initHistory() {
  undoStack = [];
  redoStack = [];
  historyCurrent = historySnapshot();
  updateHistoryButtons();
}
function recordEdit(group = '') {
  if (restoringHistory || !historyCurrent) return;
  const next = historySnapshot();
  if (editSignature(next.state) !== editSignature(historyCurrent.state)) {
    const now = Date.now();
    if (!(group && group === historyGroup && now - historyTime < 700)) {
      undoStack.push({ ...historyCurrent, selected });
      if (undoStack.length > 30) undoStack.shift();
    }
    redoStack = [];
    historyGroup = group;
    historyTime = now;
  }
  historyCurrent = next;
  updateHistoryButtons();
}
function restoreHistory(snapshot) {
  restoringHistory = true;
  stop();
  stopPreview();
  stopPackPreview();
  cancelKitBrowser();
  for (const id of ['chopEditor', 'packBrowser', 'sampleImporter', 'synthEditor']) $(id).close();
  state = structuredClone(snapshot.state);
  Object.assign(buffers, snapshot.buffers);
  pattern = state.pattern;
  selected = clamp(snapshot.selected, 0, 127);
  state.padBank = Math.floor(selected / 16);
  pruneBuffers();
  render();
  revision++;
  clearTimeout(saveTimer);
  persist();
  historyCurrent = historySnapshot();
  restoringHistory = false;
  historyGroup = '';
  updateHistoryButtons();
}
function undoEdit() {
  if (!undoStack.length) return;
  redoStack.push(historySnapshot());
  restoreHistory(undoStack.pop());
  toast('Undone');
}
function redoEdit() {
  if (!redoStack.length) return;
  undoStack.push(historySnapshot());
  restoreHistory(redoStack.pop());
  toast('Redone');
}
function updateHistoryButtons() {
  if (!$('undoEdit')) return;
  $('undoEdit').disabled = !undoStack.length;
  $('redoEdit').disabled = !redoStack.length;
}
function connectHistory() {
  $('undoEdit').onclick = undoEdit;
  $('redoEdit').onclick = redoEdit;
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || ['INPUT', 'TEXTAREA'].includes(e.target.tagName))
      return;
    if (e.code === 'KeyZ') {
      e.preventDefault();
      if ($('chopEditor').open) {
        if (!e.shiftKey) $('undoChop').click();
      } else if (e.shiftKey) redoEdit();
      else undoEdit();
    } else if (e.code === 'KeyY') {
      e.preventDefault();
      redoEdit();
    }
  });
}
