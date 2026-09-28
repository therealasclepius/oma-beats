'use strict';
// Browser host adapter for the shared desktop renderer. No native bridge or server API.
loadPackCatalog = async function () {
  packCatalog = { packs: [], samples: [], kits: [] };
  packMap = new Map();
};
showImporter = function () {
  document.getElementById('workshopFile').click();
};
function connectDesktop() {
  const source = document.querySelector('.source-strip');
  source.querySelector('span').textContent = 'Local audio → chops → pads';
  document.getElementById('browsePacks').hidden = true;
  document.getElementById('getSamples').textContent = '＋ Load audio';
  document.querySelector('footer > span').textContent = 'OMA BEATS · BROWSER SESSION';
  const scrollHint = document.createElement('p');
  scrollHint.className = 'browser-scroll-hint';
  scrollHint.textContent = 'Swipe the pattern to see all 16 steps.';
  document.getElementById('sequencer').before(scrollHint);
  document.documentElement.dataset.ready = 'true';
  const sendSize = () => {
    if (parent !== window)
      parent.postMessage(
        {
          type: 'oma-preview-ready',
          height: Math.ceil(document.body.getBoundingClientRect().height)
        },
        location.origin
      );
  };
  new ResizeObserver(sendSize).observe(document.body);
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== parent) return;
    if (event.data?.type === 'oma-preview-measure') sendSize();
    if (event.data?.type === 'oma-preview-stop') stop();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
  });
  window.addEventListener('pagehide', stop);
  sendSize();
}
