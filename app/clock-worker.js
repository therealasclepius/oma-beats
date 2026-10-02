'use strict';
let clock;
onmessage = ({ data }) => {
  clearInterval(clock);
  if (data === 'start') clock = setInterval(() => postMessage('tick'), 25);
};
