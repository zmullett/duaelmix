const drivenFilterType = 'highpass';
const drivenFilterFrequency = 2000;

const context = new window.AudioContext;

let analyser = undefined;
let startTime = undefined;
let bufferSources = [];
let filters = [];
let gainNodes = [];
let gainSelectedIndex = 0;

export const eventTarget = new EventTarget();

export const decodeAudioData = async (arrayBuffer) => {
  return await context.decodeAudioData(arrayBuffer);
};

export const updateGainSelector = (index, transition_seconds) => {
  gainSelectedIndex = index;
  refreshGainSettings(context.currentTime + transition_seconds);
};

const playDual = (drivingAudioBuffer, drivenAudioBuffer) => {
  reset();
  bufferSources = [
    createBufferSource(drivingAudioBuffer),
    createBufferSource(drivenAudioBuffer)
  ];
  wireEndedEvent(bufferSources[0]);
  wireToDestination(bufferSources[0], bufferSources[1]);
  syncedStart(bufferSources);
};

const playSingle = (audioBuffer) => {
  reset();
  bufferSources = [
    createBufferSource(audioBuffer),
    createBufferSource(audioBuffer)
  ];
  wireEndedEvent(bufferSources[0]);
  filters = [context.createBiquadFilter(), context.createBiquadFilter()];
  filters[0].type = 'allpass';
  filters[1].type = drivenFilterType;
  filters[1].frequency.setValueAtTime(drivenFilterFrequency, 0);
  bufferSources[0].connect(filters[0]);
  bufferSources[1].connect(filters[1]);
  wireToDestination(filters[0], filters[1]);
  unpause();
  syncedStart(bufferSources);
};

export const play = (audioBuffers) => {
  if (audioBuffers.length == 1) {
    const [audioBuffer] = audioBuffers;
    playSingle(audioBuffer);
  } else {
    const [drivingAudioBuffer, drivenAudioBuffer] = audioBuffers;
    playDual(drivingAudioBuffer, drivenAudioBuffer);
  }
};

export const pause = () => {
  context.suspend();
};

export const unpause = () => {
  context.resume();
};

export const getTrackPosition = () => {
  if (!startTime) return undefined;
  return context.currentTime - startTime;
};

export const getTrackDuration = () => {
  if (bufferSources.length == 0) return undefined;
  return bufferSources[0].buffer.duration;
};

const getAWeightCoefficient = (f) => {
  const f2 = f*f;
  return 1.2588966 * 148840000 * f2*f2 / ((f2 + 424.36)
    * Math.sqrt((f2 + 11599.29) * (f2 + 544496.41)) * (f2 + 148840000));
};

export const getLevel = () => {
  if (analyser === undefined) return 0;
  const bufferLength = analyser.frequencyBinCount;
  var dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  const rms = Math.sqrt(dataArray.reduce((prev, current, i) => {
    if (current === -Infinity) {
      current = 0;
    }
    const freq = context.sampleRate * (i + 0.5) / analyser.fftSize;
    const coeff = getAWeightCoefficient(freq);
    return prev + Math.pow(current / coeff, 2);
  }) / bufferLength) / 255;

  return Math.min(1, rms);
};

export const reset = () => {
  bufferSources.forEach((bufferSource) => {
    bufferSource.stop(0);
    bufferSource.onended = undefined;
  });
  disconnect(bufferSources);
  disconnect(filters);
  disconnect(gainNodes);
  if (analyser) {
    analyser.disconnect();
    analyser = undefined;
  }
  startTime = undefined;
};

const disconnect = (nodes) => {
  nodes.forEach(node => node.disconnect());
};

const wireEndedEvent = (bufferSource) => {
  bufferSource.onended = () => {
    eventTarget.dispatchEvent(new Event('track-ended'));
  };
};

const refreshGainSettings = (endTime) => {
  gainNodes.forEach((node, i) => {
    node.gain.linearRampToValueAtTime(gainSelectedIndex == i ? 1 : 0, endTime);
  });
};

const createBufferSource = (audioBuffer) => {
  const bufferSource = context.createBufferSource();
  bufferSource.buffer = audioBuffer;
  return bufferSource;
};

const wireToDestination = (drivingSource, drivenSource) => {
  analyser = context.createAnalyser();
  analyser.smoothingTimeConstant = 0.5;
  analyser.fftSize = 1024;
  analyser.connect(context.destination);
  gainNodes = [context.createGain(), context.createGain()];
  gainNodes.forEach(node => node.connect(analyser));
  refreshGainSettings(0);
  drivingSource.connect(gainNodes[0]);
  drivenSource.connect(gainNodes[1]);
};

const syncedStart = (bufferSources) => {
  startTime = context.currentTime;
  bufferSources.forEach((bufferSource) => {
    bufferSource.start(startTime);
  });
};