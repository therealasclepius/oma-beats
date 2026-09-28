'use strict';
async function connectDesktop() {
  if (!window.omaDesktop) return;
  const button = document.getElementById('importPackFolder');
  button.hidden = false;
  button.onclick = async () => {
    button.disabled = true;
    button.textContent = 'Importing…';
    try {
      const result = await window.omaDesktop.importPackFolder();
      if (!result) return;
      if (result.error) throw Error(result.error);
      await loadPackCatalog();
      refreshPackFilters();
      renderPackBrowser();
      renderKitSelector();
      toast(
        `${result.added} samples imported${result.skipped ? ` · ${result.skipped} oversized or unsupported files skipped` : ''}`
      );
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = '＋ Import pack folder';
    }
  };
  window.omaDesktop.onBeforeClose(async () => {
    stop();
    clearTimeout(saveTimer);
    if (!(await persist())) throw Error('Session could not be saved');
  });
  // The native process uses this for startup/packaging smoke checks, and never
  // forces a close before the renderer can save its current session.
  if (document.querySelectorAll('#pads .pad').length !== 16 || !db || ctx.state !== 'suspended') {
    window.omaDesktop.ready(false);
    return;
  }
  if (window.omaDesktop.smokeTest) {
    try {
      await runSynthSmoke();
    } catch (error) {
      console.error(error);
      window.omaDesktop.ready(false);
      return;
    }
  }
  window.omaDesktop.ready(true);
}
