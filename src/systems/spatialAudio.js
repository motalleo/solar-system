function createDefaultAudioContext() {
  const scope = typeof window === 'undefined' ? globalThis : window;
  const AudioContextConstructor = scope.AudioContext || scope.webkitAudioContext;
  return AudioContextConstructor ? new AudioContextConstructor() : null;
}

function setParam(param, value, time) {
  if (!param) return;
  if (typeof param.setValueAtTime === 'function') param.setValueAtTime(value, time);
  else param.value = value;
}

function safeDisconnect(node) {
  try {
    node?.disconnect();
  } catch (error) {
    // A partially constructed or already disconnected graph is safe to ignore.
  }
}

function safeStop(source) {
  try {
    source?.stop();
  } catch (error) {
    // OscillatorNode.stop() is one-shot and may already have been scheduled.
  }
}

/**
 * Creates a muted-by-default synthesized spatial audio controller.
 * AudioContext creation is deliberately deferred until enable() is called by a user gesture.
 */
export function createSpatialAudio({ camera, audioContextFactory = createDefaultAudioContext } = {}) {
  let context = null;
  let ambientOscillator = null;
  let ambientFilter = null;
  let ambientGain = null;
  let enabled = false;
  let disposed = false;
  const focusPosition = { x: 0, y: 0, z: 0 };
  const activeEffects = new Set();

  function relativeFocus() {
    const cameraPosition = camera?.position || { x: 0, y: 0, z: 0 };
    return {
      x: focusPosition.x - (Number(cameraPosition.x) || 0),
      y: focusPosition.y - (Number(cameraPosition.y) || 0),
      z: focusPosition.z - (Number(cameraPosition.z) || 0),
    };
  }

  function positionPanner(panner) {
    if (!panner || !context) return;
    const position = relativeFocus();
    const time = context.currentTime;
    if (panner.positionX && panner.positionY && panner.positionZ) {
      setParam(panner.positionX, position.x, time);
      setParam(panner.positionY, position.y, time);
      setParam(panner.positionZ, position.z, time);
    } else if (typeof panner.setPosition === 'function') {
      panner.setPosition(position.x, position.y, position.z);
    }
  }

  function releaseEffect(effect, stop = false) {
    if (!effect || !activeEffects.has(effect)) return;
    activeEffects.delete(effect);
    if (stop) safeStop(effect.oscillator);
    safeDisconnect(effect.oscillator);
    safeDisconnect(effect.gain);
    safeDisconnect(effect.panner);
  }

  function clearGraph() {
    activeEffects.forEach((effect) => releaseEffect(effect, true));
    safeStop(ambientOscillator);
    safeDisconnect(ambientOscillator);
    safeDisconnect(ambientFilter);
    safeDisconnect(ambientGain);
    ambientOscillator = null;
    ambientFilter = null;
    ambientGain = null;

    const closingContext = context;
    context = null;
    if (closingContext && closingContext.state !== 'closed' && typeof closingContext.close === 'function') {
      try {
        Promise.resolve(closingContext.close()).catch(() => {});
      } catch (error) {
        // Closing Web Audio is best-effort during page teardown.
      }
    }
  }

  function createAmbientLayer() {
    ambientOscillator = context.createOscillator();
    ambientFilter = context.createBiquadFilter();
    ambientGain = context.createGain();

    ambientOscillator.type = 'sine';
    setParam(ambientOscillator.frequency, 42, context.currentTime);
    ambientFilter.type = 'lowpass';
    setParam(ambientFilter.frequency, 180, context.currentTime);
    setParam(ambientFilter.Q, 0.72, context.currentTime);
    setParam(ambientGain.gain, 0.018, context.currentTime);

    ambientOscillator.connect(ambientFilter);
    ambientFilter.connect(ambientGain);
    ambientGain.connect(context.destination);
    ambientOscillator.start(context.currentTime);
  }

  async function enable() {
    if (disposed) return false;
    if (enabled && context) {
      if (context.state === 'suspended' && typeof context.resume === 'function') {
        try {
          await context.resume();
        } catch (error) {
          return false;
        }
      }
      return true;
    }

    try {
      context = audioContextFactory?.() || null;
      if (!context) return false;
      if (context.state === 'suspended' && typeof context.resume === 'function') await context.resume();
      createAmbientLayer();
      enabled = true;
      return true;
    } catch (error) {
      enabled = false;
      clearGraph();
      return false;
    }
  }

  function disable() {
    if (!enabled && !context) return false;
    enabled = false;
    clearGraph();
    return false;
  }

  function setFocusPosition(positionOrX, y, z) {
    const position = typeof positionOrX === 'object' && positionOrX !== null
      ? positionOrX
      : { x: positionOrX, y, z };
    focusPosition.x = Number(position.x) || 0;
    focusPosition.y = Number(position.y) || 0;
    focusPosition.z = Number(position.z) || 0;
    return true;
  }

  // Each short effect owns a PannerNode so simultaneous cues remain spatialized.
  function playCue({ duration, startFrequency, endFrequency, peakGain }) {
    if (!enabled || !context || context.state === 'closed') return false;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const panner = context.createPanner();
      const now = context.currentTime;
      const stopTime = now + Math.min(duration, 1.19);

      oscillator.type = 'sine';
      setParam(oscillator.frequency, startFrequency, now);
      if (typeof oscillator.frequency?.exponentialRampToValueAtTime === 'function') {
        oscillator.frequency.exponentialRampToValueAtTime(endFrequency, stopTime);
      } else {
        oscillator.frequency.value = endFrequency;
      }

      setParam(gain.gain, 0.0001, now);
      if (typeof gain.gain?.linearRampToValueAtTime === 'function') {
        gain.gain.linearRampToValueAtTime(peakGain, now + Math.min(0.045, duration * 0.18));
      }
      if (typeof gain.gain?.exponentialRampToValueAtTime === 'function') {
        gain.gain.exponentialRampToValueAtTime(0.0001, stopTime);
      } else {
        gain.gain.value = 0.0001;
      }

      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.maxDistance = 2400;
      panner.rolloffFactor = 0.65;
      oscillator.connect(gain);
      gain.connect(panner);
      panner.connect(context.destination);

      const effect = { oscillator, gain, panner };
      activeEffects.add(effect);
      oscillator.onended = () => releaseEffect(effect);
      positionPanner(panner);
      oscillator.start(now);
      oscillator.stop(stopTime);
      return true;
    } catch (error) {
      return false;
    }
  }

  function playSelect() {
    return playCue({
      duration: 0.34,
      startFrequency: 480,
      endFrequency: 270,
      peakGain: 0.055,
    });
  }

  function playFlyby() {
    return playCue({
      duration: 0.86,
      startFrequency: 165,
      endFrequency: 58,
      peakGain: 0.072,
    });
  }

  function update() {
    if (!enabled || !context) return false;
    activeEffects.forEach(({ panner }) => positionPanner(panner));
    return true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    disable();
  }

  return {
    enable,
    disable,
    setFocusPosition,
    playSelect,
    playFlyby,
    update,
    dispose,
  };
}
