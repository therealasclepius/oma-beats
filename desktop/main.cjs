'use strict';
const { app, BrowserWindow, protocol, ipcMain, dialog, shell, Menu, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { createBackend } = require('./backend.cjs');
const smoke = process.argv.includes('--smoke-test');
let window,
  backend,
  allowClose = false,
  closing = false,
  closeTimer,
  smokeRoot,
  smokeTimer,
  ready = false;
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'oma',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
]);
app.setName('Oma Beats');
app.setAppUserModelId('com.oma.beats');
// Isolate the smoke-test profile before acquiring the application lock.
if (smoke) {
  smokeRoot = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'oma-beats-smoke-'));
  app.setPath('userData', smokeRoot);
  app.setPath('sessionData', smokeRoot);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(start)
    .catch((error) => {
      console.error(error);
      if (!smoke) dialog.showErrorBox('Oma Beats could not start', error.message);
      app.exit(1);
    });
}
function trusted(event) {
  return (
    window &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame.url === 'oma://app/'
  );
}
async function start() {
  if (smoke) {
    smokeTimer = setTimeout(() => {
      console.error('Renderer did not become ready');
      app.exit(1);
    }, 30000);
  }
  backend = await createBackend({
    dataRoot: app.getPath('userData'),
    appRoot: path.join(__dirname, '..', 'app')
  });
  protocol.handle('oma', (request) => {
    const url = new URL(request.url);
    if (url.host !== 'app' || (request.initiatorOrigin && request.initiatorOrigin !== 'oma://app'))
      return new Response('Forbidden', { status: 403 });
    return backend.handle(request);
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  ipcMain.handle('packs:import-folder', async (event) => {
    if (!trusted(event)) throw Error('Untrusted request');
    const result = await dialog.showOpenDialog(window, {
      title: 'Import a sample pack folder',
      properties: ['openDirectory']
    });
    if (result.canceled) return null;
    try {
      return await backend.packs.importFolder(result.filePaths[0]);
    } catch (error) {
      return { error: error.message };
    }
  });
  ipcMain.on('app:ready', (event, healthy) => {
    if (!trusted(event)) return;
    ready = true;
    if (smoke && !healthy) {
      console.error('Desktop initialization checks failed');
      app.exit(1);
      return;
    }
    if (smoke) {
      clearTimeout(smokeTimer);
      console.log('PASS: renderer initialized, kits rendered, library loaded, audio suspended');
      window.close();
    }
  });
  ipcMain.on('app:close-result', async (event, saved) => {
    if (!trusted(event) || !closing) return;
    clearTimeout(closeTimer);
    if (!saved) return closeFailed();
    if (smoke) console.log('PASS: session saved before close');
    allowClose = true;
    window.close();
  });
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open app data folder', click: () => shell.openPath(app.getPath('userData')) },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }]
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' },
        ...(!app.isPackaged ? [{ role: 'toggleDevTools' }] : [])
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Oma Beats on GitHub',
          click: () => shell.openExternal('https://github.com/therealasclepius/oma-beats')
        },
        {
          label: 'About Oma Beats',
          click: () =>
            dialog.showMessageBox(window, {
              title: 'Oma Beats',
              message: `Oma Beats ${app.getVersion()}`,
              detail: 'Desktop sampler & sequencer.\n128 pads · 8 banks · sample workshop'
            })
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  createWindow();
}
function createWindow() {
  allowClose = false;
  closing = false;
  ready = false;
  window = new BrowserWindow({
    width: 1280,
    height: 980,
    minWidth: 480,
    minHeight: 600,
    show: !smoke,
    backgroundColor: '#202521',
    title: 'Oma Beats',
    icon: path.join(__dirname, '..', 'app', 'icon.svg'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: smoke ? ['--oma-smoke-test'] : [],
      backgroundThrottling: false
    }
  });
  if (smoke) window.webContents.setAudioMuted(true);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== 'oma://app/') event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer exited:', details.reason);
    if (smoke) app.exit(1);
  });
  window.webContents.on('console-message', (details) => {
    if (details.level === 'error') console.error('Renderer:', details.message);
    else if (smoke && details.message.startsWith('PASS:')) console.log(details.message);
  });
  window.webContents.session.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({
      title: 'Save ' + item.getFilename(),
      defaultPath: path.join(app.getPath('documents'), path.basename(item.getFilename()))
    });
  });
  window.on('close', (event) => {
    if (allowClose || !ready) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    window.webContents.send('app:before-close');
    closeTimer = setTimeout(closeFailed, 15000);
  });
  window.on('closed', () => {
    clearTimeout(closeTimer);
    window = null;
  });
  void window.loadURL('oma://app/');
}
async function closeFailed() {
  if (!window || !closing) return;
  closing = false;
  if (smoke) {
    console.error('Could not save smoke session');
    app.exit(1);
    return;
  }
  const result = await dialog.showMessageBox(window, {
    type: 'warning',
    message: 'Your last changes could not be saved.',
    detail: 'Stay in the app and use Save project to keep a backup.',
    buttons: ['Stay in app', 'Quit anyway'],
    defaultId: 0,
    cancelId: 0
  });
  if (result.response === 1) {
    allowClose = true;
    window.close();
  }
}
app.on('activate', () => {
  if (backend && !window) createWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || smoke) app.quit();
});
app.on('will-quit', () => {
  backend?.close();
  if (smokeRoot) void fs.rm(smokeRoot, { recursive: true, force: true });
});
