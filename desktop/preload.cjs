'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('omaDesktop', {
  importPackFolder: () => ipcRenderer.invoke('packs:import-folder'),
  ready: (healthy) => ipcRenderer.send('app:ready', healthy === true),
  onBeforeClose: (callback) =>
    ipcRenderer.on('app:before-close', async () => {
      try {
        await callback();
        ipcRenderer.send('app:close-result', true);
      } catch {
        ipcRenderer.send('app:close-result', false);
      }
    })
});
