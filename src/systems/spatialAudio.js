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
  let enablePromise = null;
  let pendingCandidate = null;
  let generation = 0;
  let visibilitySuspended = false;
  let visibilityIntentGeneration = 0;
  let visibilityQueue = Promise.resolve(false);
  const focusPosition = { x: 0, y: 0, z: 0 };
  const activeEffects = new Set();
  const closedContexts = new WeakSet();

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

  function releaseEffect(effect) {
    if (!effect || effect.released) return;
    effect.released = true;
    activeEffects.delete(effect);
    effect.oscillator.onended = null;
    safeDisconnect(effect.oscillator);
    safeDisconnect(effect.gain);
    safeDisconnect(effect.panner);
  }

  function closeContext(audioContext) {
    if (!audioContext || closedContexts.has(audioContext)) return;
    closedContexts.add(audioContext);
    if (audioContext.state === 'closed' || typeof audioContext.close !== 'function') return;
    try {
      Promise.resolve(audioContext.close()).catch(() => {});
    } catch (error) {
      // Closing Web Audio is best-effort during cancellation and page teardown.
    }
  }

  function clearGraph() {
    activeEffects.forEach((effect) => releaseEffect(effect));
    safeStop(ambientOscillator);
    safeDisconnect(ambientOscillator);
    safeDisconnect(ambientFilter);
    safeDisconnect(ambientGain);
    ambientOscillator = null;
    ambientFilter = null;
    ambientGain = null;

    const closingContext = context;
    context = null;
    closeContext(closingContext);
  }

  function createAmbientLayer(audioContext) {
    const oscillator = audioContext.createOscillator();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();

    oscillator.type = 'sine';
    setParam(oscillator.frequency, 42, audioContext.currentTime);
    filter.type = 'lowpass';
    setParam(filter.frequency, 180, audioContext.currentTime);
    setParam(filter.Q, 0.72, audioContext.currentTime);
    setParam(gain.gain, 0.018, audioContext.currentTime);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(audioContext.currentTime);
    return { oscillator, filter, gain };
  }

  function trackEnable(operation) {
    enablePromise = operation;
    const clearPending = () => {
      if (enablePromise === operation) enablePromise = null;
    };
    operation.then(clearPending, clearPending);
    return operation;
  }

  function isCurrentContext(audioContext, activeGeneration) {
    return !disposed
      && generation === activeGeneration
      && (pendingCandidate === audioContext || context === audioContext);
  }

  async function reconcileVisibilityIntent(audioContext, activeGeneration) {
    const maxAttempts = 8;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (!isCurrentContext(audioContext, activeGeneration) || audioContext.state === 'closed') {
        return false;
      }
      const intentGeneration = visibilityIntentGeneration;
      const shouldSuspend = visibilitySuspended;
      try {
        if (shouldSuspend && audioContext.state === 'running') {
          if (typeof audioContext.suspend !== 'function') return false;
          await audioContext.suspend();
        } else if (!shouldSuspend && audioContext.state !== 'running') {
          if (typeof audioContext.resume !== 'function') return false;
          await audioContext.resume();
        }
      } catch (error) {
        return false;
      }
      if (!isCurrentContext(audioContext, activeGeneration)) return false;
      const stateMatches = visibilitySuspended
        ? audioContext.state !== 'running'
        : audioContext.state === 'running';
      if (intentGeneration === visibilityIntentGeneration && stateMatches) return true;
    }
    return false;
  }

  function enable() {
    if (disposed) return Promise.resolve(false);
    if (enablePromise) return enablePromise;
    if (enabled && context) {
      const activeContext = context;
      const activeGeneration = generation;
      return trackEnable(reconcileVisibilityIntent(activeContext, activeGeneration));
    }

    let candidate;
    try {
      candidate = audioContextFactory?.() || null;
    } catch (error) {
      return Promise.resolve(false);
    }
    if (!candidate) return Promise.resolve(false);

    const candidateGeneration = ++generation;
    pendingCandidate = candidate;
    return trackEnable((async () => {
      try {
        if (candidate.state === 'suspended' && typeof candidate.resume === 'function') {
          await candidate.resume();
        }
        if (disposed
          || generation !== candidateGeneration
          || pendingCandidate !== candidate) {
          closeContext(candidate);
          return false;
        }
        if (!await reconcileVisibilityIntent(candidate, candidateGeneration)) {
          closeContext(candidate);
          return false;
        }

        const ambient = createAmbientLayer(candidate);
        context = candidate;
        ambientOscillator = ambient.oscillator;
        ambientFilter = ambient.filter;
        ambientGain = ambient.gain;
        pendingCandidate = null;
        enabled = true;
        if (!await reconcileVisibilityIntent(candidate, candidateGeneration)) {
          enabled = false;
          clearGraph();
          return false;
        }
        return true;
      } catch (error) {
        if (pendingCandidate === candidate) pendingCandidate = null;
        closeContext(candidate);
        return false;
      }
    })());
  }

  function disable() {
    generation += 1;
    enabled = false;
    visibilitySuspended = false;
    visibilityIntentGeneration += 1;
    enablePromise = null;
    const candidate = pendingCandidate;
    pendingCandidate = null;
    closeContext(candidate);
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

      const effect = { oscillator, gain, panner, released: false };
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

  function runVisibilityOperation(operation) {
    const queued = visibilityQueue.then(operation, operation);
    visibilityQueue = queued.catch(() => false);
    return queued;
  }

  function suspendForVisibility() {
    visibilitySuspended = true;
    visibilityIntentGeneration += 1;
    return runVisibilityOperation(async () => {
      if (disposed
        || !enabled
        || !context
        || context.state === 'closed') return false;
      const activeContext = context;
      const activeGeneration = generation;
      return reconcileVisibilityIntent(activeContext, activeGeneration);
    });
  }

  function resumeForVisibility() {
    visibilitySuspended = false;
    visibilityIntentGeneration += 1;
    return runVisibilityOperation(async () => {
      if (disposed
        || !enabled
        || !context
        || context.state === 'closed') return false;
      const activeContext = context;
      const activeGeneration = generation;
      return reconcileVisibilityIntent(activeContext, activeGeneration);
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
    suspendForVisibility,
    resumeForVisibility,
    update,
    dispose,
  };
}
