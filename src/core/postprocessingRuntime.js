const BLOOM = {
  low: { strength: 0.54, radius: 0.24, threshold: 0.78, scale: 0.62 },
  medium: { strength: 0.76, radius: 0.34, threshold: 0.72, scale: 0.8 },
  high: { strength: 0.88, radius: 0.4, threshold: 0.68, scale: 1 },
};

export function createPostprocessingRuntime(
  renderer,
  scene,
  camera,
  quality = 'medium',
  dependencies,
) {
  const {
    EffectComposer,
    RenderPass,
    UnrealBloomPass,
    BokehPass,
    OutputPass,
    Vector2,
    getViewport,
    capabilities = {},
  } = dependencies;
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(new Vector2(1, 1), 0.76, 0.34, 0.72);
  const bokehPass = new BokehPass(scene, camera, {
    focus: 10,
    aperture: 0.0002,
    maxblur: 0.006,
  });
  const outputPass = new OutputPass();

  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(bokehPass);
  composer.addPass(outputPass);

  let currentQuality = quality;
  let depthOfFieldRequested = false;
  let disposed = false;
  const depthOfField = {
    focusDistance: 10,
    aperture: 0.0002,
    maxBlur: 0.006,
  };
  bokehPass.enabled = false;

  function clampFinite(value, fallback, minimum, maximum) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(maximum, Math.max(minimum, numeric));
  }

  function setDepthOfField({
    enabled = depthOfFieldRequested,
    focusDistance = depthOfField.focusDistance,
    aperture = depthOfField.aperture,
    maxBlur = depthOfField.maxBlur,
  } = {}) {
    depthOfFieldRequested = Boolean(enabled);
    depthOfField.focusDistance = clampFinite(focusDistance, depthOfField.focusDistance, 0.01, 10000);
    depthOfField.aperture = clampFinite(aperture, depthOfField.aperture, 0, 0.01);
    depthOfField.maxBlur = clampFinite(maxBlur, depthOfField.maxBlur, 0, 0.05);
    bokehPass.uniforms.focus.value = depthOfField.focusDistance;
    bokehPass.uniforms.aperture.value = depthOfField.aperture;
    bokehPass.uniforms.maxblur.value = depthOfField.maxBlur;
    bokehPass.enabled = depthOfFieldRequested
      && currentQuality === 'high'
      && !capabilities.coarsePointer
      && !capabilities.reducedMotion;
    return bokehPass.enabled;
  }

  function updateFocus(activeCamera, targetPosition) {
    if (!activeCamera?.position || !targetPosition) return depthOfField.focusDistance;
    const focusDistance = activeCamera.position.distanceTo(targetPosition);
    depthOfField.focusDistance = clampFinite(focusDistance, depthOfField.focusDistance, 0.01, 10000);
    bokehPass.uniforms.focus.value = depthOfField.focusDistance;
    return depthOfField.focusDistance;
  }

  function setQuality(nextQuality) {
    currentQuality = BLOOM[nextQuality] ? nextQuality : 'medium';
    const config = BLOOM[currentQuality];
    bloomPass.strength = config.strength;
    bloomPass.radius = config.radius;
    bloomPass.threshold = config.threshold;
    setDepthOfField({ enabled: depthOfFieldRequested });
    resize();
  }

  function setCapabilities(nextCapabilities = {}) {
    if (Object.prototype.hasOwnProperty.call(nextCapabilities, 'coarsePointer')) {
      capabilities.coarsePointer = Boolean(nextCapabilities.coarsePointer);
    }
    if (Object.prototype.hasOwnProperty.call(nextCapabilities, 'reducedMotion')) {
      capabilities.reducedMotion = Boolean(nextCapabilities.reducedMotion);
    }
    return setDepthOfField({ enabled: depthOfFieldRequested });
  }

  function setBloomIntensity(multiplier = 1) {
    const config = BLOOM[currentQuality];
    bloomPass.strength = Math.min(1.35, config.strength * multiplier);
  }

  function resize() {
    const config = BLOOM[currentQuality];
    const viewport = getViewport();
    const width = Math.max(1, Math.floor(viewport.width * config.scale));
    const height = Math.max(1, Math.floor(viewport.height * config.scale));
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
  }

  function render(delta) {
    composer.render(delta);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    bokehPass.dispose();
    bloomPass.dispose();
    outputPass.dispose();
    composer.dispose();
  }

  setQuality(quality);

  return {
    composer,
    bloomPass,
    bokehPass,
    render,
    resize,
    setQuality,
    setCapabilities,
    setBloomIntensity,
    setDepthOfField,
    updateFocus,
    dispose,
  };
}
