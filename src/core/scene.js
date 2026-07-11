import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const PIXEL_RATIOS = {
  low: 1,
  medium: 1.5,
  high: 2,
};

export function createScene(canvas, quality = 'medium') {
  if (!canvas) throw new Error('缺少 WebGL 画布。');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010205);
  scene.fog = new THREE.FogExp2(0x010205, 0.000055);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 6000);
  camera.position.set(0, 118, 245);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: quality !== 'low',
    alpha: false,
    powerPreference: 'high-performance',
    logarithmicDepthBuffer: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.86;
  renderer.shadowMap.enabled = quality === 'high';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const mobileCap = matchMedia('(pointer: coarse)').matches ? 1.25 : Infinity;
  const setPixelRatio = (nextQuality) => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIOS[nextQuality] || 1.5, mobileCap));
  };
  setPixelRatio(quality);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.045;
  controls.enablePan = true;
  controls.panSpeed = 0.55;
  controls.rotateSpeed = 0.42;
  controls.zoomSpeed = 0.68;
  controls.minDistance = 8;
  controls.maxDistance = 2400;
  controls.minPolarAngle = 0.045;
  controls.maxPolarAngle = Math.PI * 0.955;
  controls.target.set(0, 0, 0);
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
  controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  controls.listenToKeyEvents(window);

  const ambient = new THREE.AmbientLight(0x273746, 0.055);
  scene.add(ambient);

  const clock = new THREE.Clock(false);

  function resize() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function setQuality(nextQuality) {
    setPixelRatio(nextQuality);
    renderer.shadowMap.enabled = nextQuality === 'high';
    resize();
  }

  function dispose() {
    controls.stopListenToKeyEvents();
    controls.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  resize();

  return {
    scene,
    camera,
    renderer,
    controls,
    clock,
    resize,
    setQuality,
    dispose,
  };
}

