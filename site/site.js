'use strict';
(() => {
  const player = document.getElementById('oma-player');
  const status = document.getElementById('preview-status');
  let ready = false;
  const fallbackTimer = setTimeout(() => {
    if (!ready) status.textContent = 'Preview taking a moment? Open the app full size.';
  }, 12000);
  function stopPreview() {
    player.contentWindow?.postMessage({ type: 'oma-preview-stop' }, location.origin);
  }
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== player.contentWindow) return;
    if (event.data?.type !== 'oma-preview-ready') return;
    const height = Number(event.data.height);
    if (!Number.isFinite(height) || height < 400 || height > 10000) return;
    player.height = String(Math.ceil(height));
    player.hidden = false;
    document.getElementById('app-fallback').hidden = true;
    if (!ready) {
      ready = true;
      clearTimeout(fallbackTimer);
      status.textContent = 'Try it here. Click a pad or press Play.';
    }
  });
  // The child may initialize before this deferred script; ask for its current size.
  player.addEventListener('load', () => {
    player.contentWindow?.postMessage({ type: 'oma-preview-measure' }, location.origin);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPreview();
  });
  window.addEventListener('pagehide', stopPreview);
  document.getElementById('open-player').addEventListener('click', stopPreview);
  new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) stopPreview();
  }).observe(player);
  document.getElementById('copy').addEventListener('click', async () => {
    const command = document.getElementById('install-command');
    const copyStatus = document.getElementById('copy-status');
    try {
      await navigator.clipboard.writeText(command.textContent);
      copyStatus.textContent = 'Copied. Paste into your terminal.';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(command);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      copyStatus.textContent = 'Select and copy the command above.';
    }
  });
})();
