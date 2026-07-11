import * as THREE from 'three';
import { projectOutsideSphere, segmentIntersectsSphere } from './presentationState.js';

const OVERVIEW_POSITIONS = {
  display: new THREE.Vector3(0, 88, 218),
  real: new THREE.Vector3(0, 430, 1190),
};

const CRUISE_ORDER = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

export function createCameraDirector({
  camera,
  controls,
  solarSystem,
  postprocessing,
  onStateChange,
  onBodyChange,
}) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const targetPosition = new THREE.Vector3();
  const previousTargetPosition = new THREE.Vector3();
  let state = 'INTRO';
  let focusedId = null;
  let tracking = false;
  let cruiseToken = 0;
  let waitTimer = 0;
  let activeTimeline = null;
  let activeResolve = null;
  let waitResolve = null;
  let bloomTween = null;

  function setState(nextState) {
    state = nextState;
    onStateChange?.(state);
  }

  function killActiveAnimation() {
    const resolve = activeResolve;
    activeResolve = null;
    activeTimeline?.kill();
    activeTimeline = null;
    resolve?.({ cancelled: true });
  }

  function finishAnimation(resolve) {
    activeTimeline = null;
    activeResolve = null;
    controls.enabled = true;
    resolve({ cancelled: false });
  }

  function animateCamera(position, target, fov, duration = 1.8) {
    killActiveAnimation();
    tracking = false;
    controls.enabled = false;
    const gsap = window.gsap;
    const actualDuration = reducedMotion ? 0.01 : duration;

    if (!gsap) {
      camera.position.copy(position);
      controls.target.copy(target);
      camera.fov = fov;
      camera.updateProjectionMatrix();
      controls.enabled = true;
      return Promise.resolve({ cancelled: false });
    }

    return new Promise((resolve) => {
      activeResolve = resolve;
      activeTimeline = gsap.timeline({
        defaults: { duration: actualDuration, ease: 'power3.inOut' },
        onComplete: () => finishAnimation(resolve),
      });
      activeTimeline.to(camera.position, { x: position.x, y: position.y, z: position.z }, 0);
      activeTimeline.to(controls.target, { x: target.x, y: target.y, z: target.z }, 0);
      activeTimeline.to(camera, {
        fov,
        onUpdate: () => camera.updateProjectionMatrix(),
      }, 0);
    });
  }

  function keepOutsideSun(position, protectedRadius, fallback) {
    if (!protectedRadius) return;
    const safe = projectOutsideSphere(position, protectedRadius, fallback);
    position.set(safe.x, safe.y, safe.z);
  }

  function animateFocus(id, offset, fov, duration, protectedRadius = 0) {
    killActiveAnimation();
    tracking = false;
    controls.enabled = false;
    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    const startFov = camera.fov;
    const progress = { value: 0 };
    const gsap = window.gsap;

    if (!gsap) {
      solarSystem.getBodyPosition(id, targetPosition);
      camera.position.copy(targetPosition).add(offset);
      keepOutsideSun(camera.position, protectedRadius, startPosition);
      controls.target.copy(targetPosition);
      camera.fov = fov;
      camera.updateProjectionMatrix();
      controls.enabled = true;
      return Promise.resolve({ cancelled: false });
    }

    return new Promise((resolve) => {
      activeResolve = resolve;
      activeTimeline = gsap.timeline({
        onComplete: () => finishAnimation(resolve),
      });
      activeTimeline.to(progress, {
        value: 1,
        duration: reducedMotion ? 0.01 : duration,
        ease: 'power3.inOut',
        onUpdate: () => {
          solarSystem.getBodyPosition(id, targetPosition);
          const destination = targetPosition.clone().add(offset);
          camera.position.lerpVectors(startPosition, destination, progress.value);
          keepOutsideSun(camera.position, protectedRadius, startPosition);
          controls.target.lerpVectors(startTarget, targetPosition, progress.value);
          camera.fov = THREE.MathUtils.lerp(startFov, fov, progress.value);
          camera.updateProjectionMatrix();
        },
      });
    });
  }

  async function playIntro() {
    setState('INTRO');
    controls.enabled = false;
    solarSystem.setDimmed(false);
    camera.position.set(0, 182, 470);
    camera.fov = 48;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    const bloomProxy = { intensity: 0.55 };
    postprocessing.setBloomIntensity(0.55);
    bloomTween?.kill();
    bloomTween = window.gsap?.to(bloomProxy, {
      intensity: 1,
      duration: reducedMotion ? 0.01 : 4.8,
      ease: 'power2.inOut',
      onUpdate: () => postprocessing.setBloomIntensity(bloomProxy.intensity),
      onComplete: () => { bloomTween = null; },
    }) || null;
    const result = await animateCamera(OVERVIEW_POSITIONS.display, new THREE.Vector3(), 42, 5.4);
    if (!result.cancelled) controls.enabled = false;
    return result;
  }

  async function overview({ duration = 1.9 } = {}) {
    stopCruise(false);
    focusedId = null;
    tracking = false;
    solarSystem.setDimmed(false);
    postprocessing.setBloomIntensity(1);
    controls.minDistance = 8;
    controls.maxDistance = solarSystem.scaleMode === 'real' ? 2800 : 720;
    setState('OVERVIEW');
    onBodyChange?.(null);
    return animateCamera(
      OVERVIEW_POSITIONS[solarSystem.scaleMode].clone(),
      new THREE.Vector3(),
      solarSystem.scaleMode === 'real' ? 48 : 42,
      duration,
    );
  }

  function createSunDetour(destination, protectedRadius) {
    const travel = destination.clone().sub(camera.position).normalize();
    const tangent = new THREE.Vector3().crossVectors(travel, new THREE.Vector3(0, 1, 0));
    if (tangent.lengthSq() < 0.001) tangent.set(1, 0, 0);
    tangent.normalize().multiplyScalar(protectedRadius * 1.55);
    return camera.position.clone()
      .lerp(destination, 0.5)
      .add(tangent)
      .add(new THREE.Vector3(0, protectedRadius * 0.72, 0));
  }

  async function focus(id, { cruise = false, duration = 1.75 } = {}) {
    const record = solarSystem.bodies.get(id);
    if (!record) return { cancelled: true };
    if (!cruise) stopCruise(false);
    focusedId = id;
    solarSystem.getBodyPosition(id, targetPosition);
    const radius = solarSystem.getBodyRadius(id);
    const currentDirection = camera.position.clone().sub(targetPosition);
    if (currentDirection.lengthSq() < 0.001) currentDirection.set(1, 0.4, 1);
    currentDirection.normalize();
    const distance = Math.max(radius * (id === 'sun' ? 4.6 : 5.15), radius + 3.2);
    const offset = currentDirection.multiplyScalar(distance).add(new THREE.Vector3(0, radius * 0.52, 0));
    const destination = targetPosition.clone().add(offset);

    solarSystem.setDimmed(true, id);
    postprocessing.setBloomIntensity(id === 'sun' ? 1.22 : 0.86);
    controls.minDistance = Math.max(radius * 1.45, radius + 0.38);
    controls.maxDistance = Math.max(radius * 22, 34);
    setState(cruise ? 'CRUISE' : 'FOCUSED');
    onBodyChange?.(id);

    const protectedRadius = solarSystem.getBodyRadius('sun') * 1.18;
    const needsDetour = id !== 'sun' && segmentIntersectsSphere(camera.position, destination, protectedRadius);
    if (needsDetour) {
      const detour = createSunDetour(destination, protectedRadius);
      const firstLeg = await animateCamera(detour, controls.target.clone(), Math.max(camera.fov, 42), duration * 0.44);
      if (firstLeg.cancelled) return firstLeg;
    }

    const result = await animateFocus(
      id,
      offset,
      id === 'sun' ? 43 : (radius > 4 ? 35 : 38),
      duration * (needsDetour ? 0.68 : 1),
      id === 'sun' ? 0 : protectedRadius,
    );
    if (result.cancelled) return result;
    solarSystem.getBodyPosition(id, previousTargetPosition);
    tracking = true;
    controls.enabled = true;
    return result;
  }

  function wait(milliseconds, token) {
    if (waitResolve) waitResolve(false);
    return new Promise((resolve) => {
      waitResolve = resolve;
      waitTimer = window.setTimeout(() => {
        waitTimer = 0;
        waitResolve = null;
        resolve(token === cruiseToken);
      }, milliseconds);
    });
  }

  async function startCruise() {
    stopCruise(false);
    const token = ++cruiseToken;
    setState('CRUISE');
    for (const id of CRUISE_ORDER) {
      if (token !== cruiseToken) return;
      const result = await focus(id, { cruise: true, duration: id === 'sun' ? 2.1 : 1.65 });
      if (result.cancelled || token !== cruiseToken) return;
      const shouldContinue = await wait(reducedMotion ? 400 : 3400, token);
      if (!shouldContinue) return;
    }
    if (token === cruiseToken) {
      stopCruise(false);
      await overview({ duration: 2.2 });
    }
  }

  function stopCruise(updateState = true) {
    cruiseToken += 1;
    window.clearTimeout(waitTimer);
    waitTimer = 0;
    const resolve = waitResolve;
    waitResolve = null;
    resolve?.(false);
    if (state === 'CRUISE' && updateState) setState(focusedId ? 'FOCUSED' : 'OVERVIEW');
  }

  function update() {
    if (!tracking || !focusedId || activeTimeline) return;
    solarSystem.getBodyPosition(focusedId, targetPosition);
    const delta = targetPosition.clone().sub(previousTargetPosition);
    if (delta.lengthSq() > 0) {
      camera.position.add(delta);
      controls.target.add(delta);
      if (focusedId !== 'sun') {
        keepOutsideSun(camera.position, solarSystem.getBodyRadius('sun') * 1.18, previousTargetPosition);
      }
      previousTargetPosition.copy(targetPosition);
    }
  }

  function handleManualControl() {
    if (state === 'CRUISE') stopCruise(true);
  }

  controls.addEventListener('start', handleManualControl);

  function dispose() {
    stopCruise(false);
    killActiveAnimation();
    bloomTween?.kill();
    bloomTween = null;
    controls.removeEventListener('start', handleManualControl);
  }

  return {
    playIntro,
    focus,
    overview,
    startCruise,
    stopCruise,
    update,
    dispose,
    get state() {
      return state;
    },
    get focusedId() {
      return focusedId;
    },
  };
}
