'use strict';
importScripts('stretch.js');
onmessage = ({ data }) => {
  try {
    const channels = SampleStretch.process(data.channels, data.factor, data.sampleRate);
    postMessage(
      { channels },
      channels.map((c) => c.buffer)
    );
  } catch (error) {
    postMessage({ error: error.message });
  }
};
