import * as THREE from 'three';

import { BODY_BY_ID, CELESTIAL_BODIES } from './src/data/celestialBodies.js';
import { createScene } from './src/core/scene.js';
import { createPostprocessing } from './src/core/postprocessing.js';
import { createSolarSystem } from './src/systems/solarSystem.js';
import { createSatelliteSystem } from './src/systems/satelliteSystem.js';
import { createStarfield } from './src/systems/starfield.js';
import { createAsteroidBelt } from './src/systems/asteroidBelt.js';
import { createTimeSystem } from './src/systems/timeSystem.js';
import { createEphemerisSystem } from './src/systems/ephemerisSystem.js';
import { createCameraDirector } from './src/systems/cameraDirector.js';
import { createInteraction } from './src/systems/interaction.js';
import { createSpatialAudio } from './src/systems/spatialAudio.js';
import { createDiagnostics } from './src/systems/diagnostics.js';
import {
  createPerformanceManager,
  applyDepthOfFieldRuntime,
  getSafeStorage,
  inferQuality,
  isPageFocused,
  observeDepthOfFieldCapabilities,
  readBooleanPreference,
  writeBooleanPreference,
} from './src/systems/performance.js';
import { createInterface, parseEphemerisDate } from './src/ui/interface.js';
import { createPwaLifecycle } from './src/pwa/pwaLifecycle.js';
import {
  createRuntimeLifecycle,
  runFramePipeline,
} from './src/runtime/runtimeLifecycle.js';

document.documentElement.classList.add('js');
document.documentElement.dataset.bodyCount = String(CELESTIAL_BODIES.length);

let ui;
let sceneCore;
let postprocessing;
let starfield;
let solarSystem;
let satelliteSystem;
let asteroidBelt;
let timeSystem;
let ephemeris;
let cameraDirector;
let interaction;
let spatialAudio;
let performanceManager;
let diagnostics;
let resizeFrame = 0;
let disposed = false;
const openingTweens = [];
const coarsePointerQuery = matchMedia('(pointer: coarse)');
const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let coarsePointer = coarsePointerQuery.matches;
let reducedMotion = reducedMotionQuery.matches;
const depthOfFieldTarget = new THREE.Vector3();
const DEPTH_OF_FIELD_STORAGE_KEY = 'solar-experience-depth-of-field';
const depthOfFieldStorage = getSafeStorage(window);
let pageFocused = isPageFocused(document);
let depthCapabilityObserver;
let audioEnabled = false;
let audioTogglePromise = null;
const audioFocusTarget = new THREE.Vector3();
let pendingPwaToast = null;

let depthOfFieldPreference = readBooleanPreference(
  depthOfFieldStorage,
  DEPTH_OF_FIELD_STORAGE_KEY,
  true,
);

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

const runtimeLifecycle = createRuntimeLifecycle({
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
  initialHidden: document.hidden,
  onFrame: renderFrame,
  onDisposeError: (error) => console.warn('模块清理失败', error),
});
const ownDisposable = (resource) => runtimeLifecycle.own(resource);

const pwaLifecycle = ownDisposable(createPwaLifecycle({
  windowObject: window,
  navigatorObject: navigator,
  locationObject: location,
  serviceWorkerUrl: new URL('./sw.js', import.meta.url),
  scopeUrl: new URL('./', import.meta.url),
  onStateChange: (state) => ui?.setPwaState(state),
  onToast: (message, duration) => {
    if (ui) ui.toast(message, duration);
    else pendingPwaToast = [message, duration];
  },
  onWarning: (message, error) => console.warn(message, error),
}));

function setSceneQuality(quality) {
  sceneCore?.setQuality(quality);
  postprocessing?.setQuality(quality);
  solarSystem?.setQuality(quality);
  satelliteSystem?.setQuality(quality);
  starfield?.setQuality(quality);
  asteroidBelt?.setQuality(quality);
  ui?.setQuality(quality, performanceManager?.mode);
  if ((quality === 'high' || quality === 'ultra') && cameraDirector?.focusedId) {
    void solarSystem?.upgradeFocusedTexture(cameraDirector.focusedId);
  }
  syncDepthOfField();
  handleResize();
}

function disableDepthOfField() {
  postprocessing?.setDepthOfField({ enabled: false });
}

function handleDepthCapabilities(capabilities) {
  coarsePointer = capabilities.coarsePointer;
  reducedMotion = capabilities.reducedMotion;
  postprocessing?.setCapabilities(capabilities);
  ui?.setDepthOfField({
    enabled: depthOfFieldPreference,
    available: !coarsePointer,
  });
  syncDepthOfField();
}

function syncDepthOfField() {
  pageFocused = isPageFocused(document);
  if (!postprocessing || !sceneCore) return false;
  const focusedId = cameraDirector?.focusedId || null;
  return applyDepthOfFieldRuntime({
    postprocessing,
    camera: sceneCore.camera,
    getTargetPosition: (id) => {
      solarSystem.getBodyPosition(id, depthOfFieldTarget);
      return depthOfFieldTarget;
    },
    userEnabled: depthOfFieldPreference,
    quality: performanceManager?.quality,
    coarsePointer,
    focusedId,
    reducedMotion,
    pageFocused,
    cameraMoving: !sceneCore.controls.enabled,
    aperture: 0.0002,
    maxBlur: 0.006,
  });
}

function handleResize() {
  if (runtimeLifecycle.hidden || resizeFrame) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    sceneCore?.resize();
    postprocessing?.resize();
  });
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function syncEphemerisPresentation() {
  solarSystem.setOrbitMode(ephemeris.mode);
  solarSystem.setEphemerisSnapshot(ephemeris.getSnapshot(), ephemeris.date);
  ui.setDate(formatDateInput(ephemeris.date));
  ui.setDateMode(ephemeris.mode);
}

function renderFrame() {
  if (disposed) return;
  diagnostics?.beginFrame(performance.now());
  performanceManager.beginFrame();
  runFramePipeline({
    updateDateAndTime() {
      const realDelta = Math.min(sceneCore.clock.getDelta(), 0.1);
      const simulationDelta = timeSystem.tick(realDelta);
      const previousDate = ephemeris.date.getTime();
      if (simulationDelta > 0) ephemeris.advance(realDelta, timeSystem.multiplier);
      if (ephemeris.date.getTime() !== previousDate) {
        ui.setDate(formatDateInput(ephemeris.date));
        ui.setDateMode(ephemeris.mode);
      }
      return {
        realDelta,
        simulationDelta,
        ambientElapsed: performance.now() / 1000,
      };
    },
    createEphemerisSnapshot() {
      return ephemeris.getSnapshot();
    },
    updatePlanets(timing, snapshot) {
      solarSystem.setEphemerisSnapshot(snapshot, ephemeris.date);
      solarSystem.update(timeSystem.elapsed, timing.simulationDelta);
    },
    updateSatellites(timing) {
      satelliteSystem.update(ephemeris.date, timing.simulationDelta);
      asteroidBelt.update(
        timing.realDelta,
        timeSystem.paused ? 0 : timeSystem.multiplier,
      );
    },
    // Solar-system ownership includes creation/disposal; this explicit stage fixes frame order.
    updateCorona(timing) {
      solarSystem.updateCorona(timeSystem.elapsed, timing.simulationDelta);
    },
    updateCamera() {
      cameraDirector.update();
    },
    updateDepthOfField() {
      syncDepthOfField();
    },
    updateSpatialAudio() {
      const focusedId = cameraDirector.focusedId;
      if (focusedId) {
        solarSystem.getBodyPosition(focusedId, audioFocusTarget);
        spatialAudio.setFocusPosition(audioFocusTarget);
      }
      spatialAudio.update();
    },
    updateControls() {
      interaction.update();
      sceneCore.controls.update();
    },
    updateStarfield(timing) {
      starfield.update(sceneCore.camera, timing.ambientElapsed);
    },
    renderComposer(timing) {
      postprocessing.render(timing.realDelta);
    },
  });
  performanceManager.endFrame();
  diagnostics?.endFrame(performance.now());
}

function handleVisibilityChange() {
  pageFocused = isPageFocused(document);
  runtimeLifecycle.setHidden(document.hidden);
  diagnostics?.resetFrames();
  if (document.hidden) {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = 0;
    disableDepthOfField();
    sceneCore?.clock.stop();
    void spatialAudio?.suspendForVisibility();
  } else {
    if (audioEnabled) void spatialAudio?.resumeForVisibility();
    sceneCore?.resize();
    postprocessing?.resize();
    sceneCore?.clock.start();
    syncDepthOfField();
  }
}

function handleWindowBlur() {
  pageFocused = false;
  disableDepthOfField();
}

function handleWindowFocus() {
  pageFocused = isPageFocused(document);
  syncDepthOfField();
}

async function focusBody(id) {
  const body = BODY_BY_ID.get(id);
  if (!body) return;
  disableDepthOfField();
  ui.toggleSettings(false);
  ui.showBody(body);
  satelliteSystem?.setFocusedParent(id);
  solarSystem.getBodyPosition(id, audioFocusTarget);
  spatialAudio?.setFocusPosition(audioFocusTarget);
  spatialAudio?.playSelect();
  await cameraDirector.focus(id);
  if (!disposed && cameraDirector.focusedId === id) {
    await solarSystem.upgradeFocusedTexture(id);
  }
}

async function showOverview() {
  disableDepthOfField();
  ui.toggleSettings(false);
  ui.hideInfo();
  satelliteSystem?.setFocusedParent(null);
  spatialAudio?.playFlyby();
  await cameraDirector.overview();
}

function toggleSpatialAudio() {
  if (audioTogglePromise) return audioTogglePromise;
  const operation = (async () => {
    if (audioEnabled) {
      spatialAudio?.disable();
      audioEnabled = false;
      return false;
    }
    audioEnabled = Boolean(await spatialAudio?.enable());
    if (audioEnabled && !document.hidden) await spatialAudio.resumeForVisibility();
    if (!audioEnabled) ui.toast('当前浏览器不支持 Web Audio 空间音效');
    return audioEnabled;
  })();
  audioTogglePromise = operation;
  const clearPending = () => {
    if (audioTogglePromise === operation) audioTogglePromise = null;
  };
  operation.then(clearPending, clearPending);
  return operation;
}

function toggleTime() {
  const paused = timeSystem.toggle();
  ui.setPlaying(!paused);
  ui.toast(paused ? '模拟时间已暂停' : `模拟时间继续以 ${timeSystem.multiplier}× 运行`, 1700);
}

function resetTime() {
  timeSystem.reset();
  ui.setPlaying(true);
  ui.setMultiplier(1);
  ui.toast('模拟时间已重置', 1700);
}

function changeMultiplier(multiplier) {
  timeSystem.setMultiplier(multiplier);
  timeSystem.setPaused(false);
  ui.setPlaying(true);
  ui.setMultiplier(timeSystem.multiplier);
  if (timeSystem.highSpeed) changeDateMode('simulation');
}

function changeDate(isoDate) {
  try {
    ephemeris.setDate(parseEphemerisDate(isoDate));
    ephemeris.setMode('ephemeris');
    syncEphemerisPresentation();
    return true;
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    ui.setDate(formatDateInput(ephemeris.date));
    ui.toast('日期无效，请选择 1800-01-01 至 2050-12-31', 2400);
    return false;
  }
}

function changeDateMode(mode) {
  ephemeris.setMode(mode);
  syncEphemerisPresentation();
}

function resetToday() {
  ephemeris.resetToday();
  ephemeris.setMode('ephemeris');
  syncEphemerisPresentation();
  ui.toast('已回到今天的真实星历', 1700);
}

function changeScaleMode(mode) {
  disableDepthOfField();
  solarSystem.setScaleMode(mode);
  asteroidBelt.setScaleMode(mode);
  ui.setScaleMode(mode);
  ui.toast(mode === 'real' ? '已切换至真实比例近似视图' : '已切换至展示比例');
  cameraDirector.overview({ duration: 2.05 });
}

function changeQuality(quality) {
  const activeQuality = performanceManager.setQuality(quality);
  ui.setQuality(activeQuality, performanceManager.mode);
  const label = quality === 'auto'
    ? `自动（当前 ${{ low: '低', medium: '中', high: '高', ultra: 'Ultra' }[activeQuality]}）`
    : ({ low: '低', medium: '中', high: '高', ultra: 'Ultra' }[activeQuality] || '中');
  ui.toast(`画质已切换为${label}档`, 1800);
}

function changeDepthOfField(enabled) {
  if (coarsePointer) {
    ui.setDepthOfField({ enabled: false, available: false });
    disableDepthOfField();
    return;
  }
  depthOfFieldPreference = writeBooleanPreference(
    depthOfFieldStorage,
    DEPTH_OF_FIELD_STORAGE_KEY,
    enabled,
  );
  ui.setDepthOfField({ enabled: depthOfFieldPreference, available: true });
  syncDepthOfField();
}

function toggleCruise(active) {
  disableDepthOfField();
  if (active) {
    cameraDirector.startCruise();
    return;
  }
  cameraDirector.stopCruise();
  cameraDirector.overview({ duration: 1.6 });
}

function runOpeningChoreography() {
  const gsap = window.gsap;
  const orbitMaterial = solarSystem.orbitGroup.children[0]?.material;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    solarSystem.orbitGroup.scale.setScalar(1);
    if (orbitMaterial) orbitMaterial.opacity = orbitMaterial.userData.baseOpacity;
    gsap?.set('.intro-content > *', { opacity: 1, y: 0 });
    return;
  }
  if (!gsap) return;
  solarSystem.orbitGroup.scale.setScalar(0.22);
  if (orbitMaterial) orbitMaterial.opacity = 0;
  openingTweens.push(gsap.to(solarSystem.orbitGroup.scale, {
    x: 1,
    y: 1,
    z: 1,
    duration: 3.2,
    delay: 1.55,
    ease: 'power3.out',
  }));
  if (orbitMaterial) {
    openingTweens.push(gsap.to(orbitMaterial, {
      opacity: orbitMaterial.userData.baseOpacity,
      duration: 2.5,
      delay: 1.7,
      ease: 'power2.out',
    }));
  }
  openingTweens.push(gsap.fromTo(
    '.intro-content > *',
    { opacity: 0, y: 22 },
    { opacity: 1, y: 0, duration: 1.15, delay: 0.55, stagger: 0.1, ease: 'power3.out' },
  ));
}

async function initialise() {
  ephemeris = createEphemerisSystem(new Date());
  ui = ownDisposable(createInterface(CELESTIAL_BODIES, {
    onStart: async () => {
      ui.enterApp();
      interaction.setEnabled(true);
      await cameraDirector.overview({ duration: 1.15 });
    },
    onFocus: focusBody,
    onOverview: showOverview,
    onTogglePlay: toggleTime,
    onResetTime: resetTime,
    onMultiplier: changeMultiplier,
    onDateChange: changeDate,
    onDateMode: changeDateMode,
    onToday: resetToday,
    onOrbits: (visible) => solarSystem.setOrbitsVisible(visible),
    onAsteroids: (visible) => asteroidBelt.setVisible(visible),
    onLabels: (visible) => solarSystem.setLabelsVisible(visible),
    onDiagnostics: (visible) => {
      diagnostics?.resetFrames();
      ui.setDiagnosticsVisible(visible);
    },
    onScaleMode: changeScaleMode,
    onQuality: changeQuality,
    onDepthOfField: changeDepthOfField,
    onCruise: toggleCruise,
    onToggleSound: toggleSpatialAudio,
    onInstallApp: () => pwaLifecycle.requestInstall(),
    onUpdateApp: () => pwaLifecycle.requestUpdate(),
  }));
  ui.setPwaState(pwaLifecycle.getState());
  if (pendingPwaToast) {
    ui.toast(...pendingPwaToast);
    pendingPwaToast = null;
  }
  ui.setLoading(0.04, '初始化 WebGL 环境');

  const canvas = document.getElementById('space-canvas');
  const initialQuality = inferQuality();
  sceneCore = ownDisposable(createScene(canvas, initialQuality));
  diagnostics = ownDisposable(createDiagnostics({
    renderer: sceneCore.renderer,
    onSnapshot: (snapshot) => ui?.setDiagnostics(snapshot),
  }));
  diagnostics.mark('webgl-ready', performance.now());
  spatialAudio = ownDisposable(createSpatialAudio({ camera: sceneCore.camera }));
  ui.setLoading(0.12, '建立相机与空间坐标');

  postprocessing = ownDisposable(createPostprocessing(
    sceneCore.renderer,
    sceneCore.scene,
    sceneCore.camera,
    initialQuality,
  ));
  starfield = ownDisposable(createStarfield(sceneCore.scene, initialQuality));
  ui.setLoading(0.24, '生成分层星空');

  let textureTotal = 1;
  const fallbackTextures = new Set();
  solarSystem = ownDisposable(await createSolarSystem(sceneCore.scene, CELESTIAL_BODIES, {
    quality: initialQuality,
    renderer: sceneCore.renderer,
    camera: sceneCore.camera,
    onTextureCount: (total) => {
      textureTotal = Math.max(1, total);
    },
    onProgress: (complete, total) => {
      const ratio = complete / Math.max(total || textureTotal, 1);
      ui.setLoading(0.28 + ratio * 0.43, `加载本地天体纹理 ${complete}/${total || textureTotal}`);
    },
    onTextureFallback: (filename) => fallbackTextures.add(filename),
  }));
  if (disposed) return;

  satelliteSystem = ownDisposable(createSatelliteSystem({
    scene: sceneCore.scene,
    solarSystem,
    materialSystem: solarSystem.materialSystem,
    quality: initialQuality,
    three: THREE,
  }));

  asteroidBelt = ownDisposable(createAsteroidBelt(sceneCore.scene, initialQuality));
  ui.setLoading(0.77, '布置非均匀小行星带');

  timeSystem = createTimeSystem();
  syncEphemerisPresentation();
  performanceManager = ownDisposable(createPerformanceManager(sceneCore.renderer, 'auto', {
    onQualityChange: setSceneQuality,
    onAutoDowngrade: (quality) => ui.toast(`为保持流畅，画质已自动调整为${{ low: '低', medium: '中', high: '高', ultra: 'Ultra' }[quality]}档`),
  }));
  setSceneQuality(performanceManager.quality);

  cameraDirector = ownDisposable(createCameraDirector({
    camera: sceneCore.camera,
    controls: sceneCore.controls,
    solarSystem,
    postprocessing,
    onStateChange: (state) => ui.setViewState(state),
    onBodyChange: (id) => {
      satelliteSystem?.setFocusedParent(id);
      if (id) {
        solarSystem.getBodyPosition(id, audioFocusTarget);
        spatialAudio?.setFocusPosition(audioFocusTarget);
        spatialAudio?.playFlyby();
        if (performanceManager?.quality === 'high' || performanceManager?.quality === 'ultra') {
          void solarSystem.upgradeFocusedTexture(id);
        }
        ui.showBody(BODY_BY_ID.get(id));
      } else {
        ui.hideInfo();
      }
    },
  }));

  interaction = ownDisposable(createInteraction({
    canvas,
    camera: sceneCore.camera,
    solarSystem,
    onHover: (id, position) => ui.setHover(BODY_BY_ID.get(id), position),
    onHoverEnd: () => ui.hideHover(),
    onSelect: focusBody,
  }));
  interaction.setEnabled(false);

  ui.setQuality(performanceManager.quality, performanceManager.mode);
  ui.setDepthOfField({ enabled: depthOfFieldPreference, available: !coarsePointer });
  ui.setDiagnosticsVisible(false);
  depthCapabilityObserver = ownDisposable(observeDepthOfFieldCapabilities({
    coarsePointerQuery,
    reducedMotionQuery,
    onChange: handleDepthCapabilities,
  }));
  ui.setScaleMode('display');
  ui.setMultiplier(1);
  ui.setPlaying(true);
  ui.setDate(formatDateInput(ephemeris.date));
  ui.setDateMode(ephemeris.mode);
  ui.setLoading(0.92, '校准镜头与交互');

  window.addEventListener('resize', handleResize, { passive: true });
  window.addEventListener('blur', handleWindowBlur);
  window.addEventListener('focus', handleWindowFocus);
  sceneCore.resize();
  postprocessing.resize();
  if (!runtimeLifecycle.hidden) sceneCore.clock.start();
  runtimeLifecycle.start();
  diagnostics.mark('render-loop-started', performance.now());
  await wait(180);
  if (disposed) return;
  ui.completeLoading();
  runOpeningChoreography();
  await cameraDirector.playIntro();
  if (disposed) return;
  ui.enableStart();
  ui.toast(
    fallbackTextures.size
      ? `星图已就绪，${fallbackTextures.size} 张纹理使用兼容材质`
      : '星图已就绪',
    2200,
  );

  window.solarExperience = {
    focus: focusBody,
    overview: showOverview,
    cruise: () => toggleCruise(true),
    setTimeScale: changeMultiplier,
    setDate: changeDate,
    setDateMode: changeDateMode,
  };
}

function dispose() {
  if (disposed) return;
  disposed = true;
  sceneCore?.clock.stop();
  if (resizeFrame) cancelAnimationFrame(resizeFrame);
  openingTweens.splice(0).forEach((tween) => tween.kill());
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('blur', handleWindowBlur);
  window.removeEventListener('focus', handleWindowFocus);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('beforeunload', dispose);
  runtimeLifecycle.dispose();
  depthCapabilityObserver = null;
  spatialAudio = null;
  audioEnabled = false;
  audioTogglePromise = null;
  delete window.solarExperience;
}

document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('beforeunload', dispose, { once: true });
handleVisibilityChange();
pwaLifecycle.start();

runtimeLifecycle.runInitialiser(initialise, (error) => ui?.showError(error)).catch((error) => {
  dispose();
  console.error('太阳系体验初始化失败', error);
});
