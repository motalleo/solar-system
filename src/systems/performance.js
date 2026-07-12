const QUALITY_PIXEL_RATIO = {
  low: 1,
  medium: 1.5,
  high: 2,
  ultra: 2,
};

const QUALITY_DOWNGRADE = Object.freeze({ ultra: 'high', high: 'medium', medium: 'low' });

export function isPageFocused(documentLike) {
  return Boolean(
    documentLike
    && !documentLike.hidden
    && typeof documentLike.hasFocus === 'function'
    && documentLike.hasFocus()
  );
}

export function getSafeStorage(windowLike) {
  try {
    return windowLike?.localStorage || null;
  } catch (error) {
    return null;
  }
}

export function readBooleanPreference(storage, key, fallback = true) {
  const safeFallback = Boolean(fallback);
  try {
    const stored = storage?.getItem(key);
    if (stored === null || stored === undefined) return safeFallback;
    return stored !== 'false';
  } catch (error) {
    return safeFallback;
  }
}

export function writeBooleanPreference(storage, key, value) {
  const preference = Boolean(value);
  try {
    storage?.setItem(key, String(preference));
  } catch (error) {
    // The caller keeps the returned in-memory preference when storage is unavailable.
  }
  return preference;
}

function listenMediaQueryChange(mediaQuery, listener) {
  if (typeof mediaQuery?.addEventListener === 'function') {
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }
  if (typeof mediaQuery?.addListener === 'function') {
    mediaQuery.addListener(listener);
    return () => mediaQuery.removeListener(listener);
  }
  return () => {};
}

export function observeDepthOfFieldCapabilities({
  coarsePointerQuery,
  reducedMotionQuery,
  onChange,
} = {}) {
  function snapshot() {
    return {
      coarsePointer: Boolean(coarsePointerQuery?.matches),
      reducedMotion: Boolean(reducedMotionQuery?.matches),
    };
  }

  function emit() {
    onChange?.(snapshot());
  }

  const removeCoarsePointer = listenMediaQueryChange(coarsePointerQuery, emit);
  const removeReducedMotion = listenMediaQueryChange(reducedMotionQuery, emit);
  emit();

  return {
    snapshot,
    dispose() {
      removeCoarsePointer();
      removeReducedMotion();
    },
  };
}

export function shouldEnableDepthOfField({
  userEnabled = false,
  quality = 'medium',
  coarsePointer = false,
  focusedId = null,
  reducedMotion = false,
  pageFocused = true,
  cameraMoving = false,
} = {}) {
  return Boolean(
    userEnabled
    && (quality === 'high' || quality === 'ultra')
    && !coarsePointer
    && focusedId
    && !reducedMotion
    && pageFocused
    && !cameraMoving
  );
}

export function applyDepthOfFieldRuntime({
  postprocessing,
  camera,
  getTargetPosition,
  aperture,
  maxBlur,
  ...policy
} = {}) {
  if (!postprocessing) return false;
  const enabled = shouldEnableDepthOfField(policy);
  postprocessing.setDepthOfField({ enabled, aperture, maxBlur });
  if (!enabled) return false;
  const targetPosition = getTargetPosition?.(policy.focusedId);
  if (!targetPosition) {
    postprocessing.setDepthOfField({ enabled: false, aperture, maxBlur });
    return false;
  }
  postprocessing.updateFocus(camera, targetPosition);
  return true;
}

export function inferQuality(capabilities = {}) {
  const memory = capabilities.deviceMemory ?? globalThis.navigator?.deviceMemory ?? 4;
  const cores = capabilities.hardwareConcurrency ?? globalThis.navigator?.hardwareConcurrency ?? 4;
  const coarse = capabilities.coarsePointer ?? globalThis.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  const pixelRatio = capabilities.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1;
  if (coarse || memory <= 3 || cores <= 4) return 'low';
  if (memory >= 16 && cores >= 8 && pixelRatio <= 2.25) return 'ultra';
  if (memory >= 8 && cores >= 8) return 'high';
  return 'medium';
}

export function createPerformanceManager(renderer, initialQuality = 'auto', callbacks = {}) {
  let quality = initialQuality === 'auto' ? inferQuality() : initialQuality;
  let lastFrameTime = 0;
  let frameDurations = [];
  let lastAdjustment = 0;
  let autoAdjust = initialQuality === 'auto';

  function applyPixelRatio() {
    const mobileCap = matchMedia('(pointer: coarse)').matches && autoAdjust ? 1.25 : Infinity;
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      QUALITY_PIXEL_RATIO[quality] || 1.5,
      mobileCap,
    );
    renderer.setPixelRatio(ratio);
    return ratio;
  }

  function setQuality(nextQuality, manual = true) {
    const selectingAuto = nextQuality === 'auto';
    if (selectingAuto) {
      autoAdjust = true;
      nextQuality = inferQuality();
    }
    if (!QUALITY_PIXEL_RATIO[nextQuality]) return quality;
    quality = nextQuality;
    if (manual && !selectingAuto) autoAdjust = false;
    const pixelRatio = applyPixelRatio();
    callbacks.onQualityChange?.(quality, pixelRatio);
    return quality;
  }

  function beginFrame() {
    const now = performance.now();
    if (lastFrameTime) {
      frameDurations.push(now - lastFrameTime);
      if (frameDurations.length > 150) frameDurations.shift();
    }
    lastFrameTime = now;
  }

  function endFrame() {
    const now = performance.now();
    if (!autoAdjust || frameDurations.length < 120 || now - lastAdjustment < 12000) return;
    const average = frameDurations.reduce((sum, duration) => sum + duration, 0) / frameDurations.length;
    if (average > 24 && quality !== 'low') {
      lastAdjustment = now;
      setQuality(QUALITY_DOWNGRADE[quality] || 'low', false);
      callbacks.onAutoDowngrade?.(quality);
      frameDurations = [];
    }
  }

  function onVisibilityChange() {
    lastFrameTime = 0;
    frameDurations = [];
    callbacks.onVisibilityChange?.(document.hidden);
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  applyPixelRatio();

  function dispose() {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    frameDurations = [];
  }

  return {
    beginFrame,
    endFrame,
    setQuality,
    onVisibilityChange,
    dispose,
    get quality() {
      return quality;
    },
    get pixelRatio() {
      return renderer.getPixelRatio();
    },
    get mode() {
      return autoAdjust ? 'auto' : 'manual';
    },
  };
}
