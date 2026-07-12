export function runFramePipeline(stages = {}) {
  const timing = stages.updateDateAndTime?.();
  const snapshot = stages.createEphemerisSnapshot?.(timing);
  stages.updatePlanets?.(timing, snapshot);
  stages.updateSatellites?.(timing, snapshot);
  stages.updateCorona?.(timing, snapshot);
  stages.updateCamera?.(timing, snapshot);
  stages.updateDepthOfField?.(timing, snapshot);
  stages.updateSpatialAudio?.(timing, snapshot);
  stages.updateControls?.(timing, snapshot);
  stages.updateStarfield?.(timing, snapshot);
  stages.renderComposer?.(timing, snapshot);
  return { timing, snapshot };
}

export function createRuntimeLifecycle({
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
  initialHidden = false,
  onFrame,
  onDisposeError,
} = {}) {
  const disposables = [];
  let hidden = Boolean(initialHidden);
  let started = false;
  let disposed = false;
  let frameId = 0;

  function own(resource) {
    if (!resource?.dispose) return resource;
    if (disposed) {
      resource.dispose();
      return resource;
    }
    disposables.push(resource);
    return resource;
  }

  function stopFrame() {
    if (!frameId) return;
    cancelFrame?.(frameId);
    frameId = 0;
  }

  function schedule() {
    if (disposed || !started || hidden || frameId || typeof requestFrame !== 'function') return 0;
    frameId = requestFrame(runFrame);
    return frameId;
  }

  function runFrame(timestamp) {
    frameId = 0;
    if (disposed || !started || hidden) return false;
    onFrame?.(timestamp);
    schedule();
    return true;
  }

  function start() {
    if (disposed) return false;
    started = true;
    schedule();
    return !hidden;
  }

  function setHidden(nextHidden) {
    hidden = Boolean(nextHidden);
    if (hidden) stopFrame();
    else schedule();
    return hidden;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    started = false;
    stopFrame();
    while (disposables.length) {
      try {
        disposables.pop()?.dispose();
      } catch (error) {
        onDisposeError?.(error);
      }
    }
  }

  async function runInitialiser(initialiser, onError) {
    try {
      return await initialiser(own);
    } catch (error) {
      onError?.(error);
      dispose();
      throw error;
    }
  }

  return {
    own,
    start,
    setHidden,
    runInitialiser,
    dispose,
    get hidden() {
      return hidden;
    },
    get started() {
      return started;
    },
    get disposed() {
      return disposed;
    },
    get frameId() {
      return frameId;
    },
  };
}
