import * as THREE from 'three';

const QUALITY_COUNTS = {
  low: 650,
  medium: 1400,
  high: 2600,
  ultra: 3600,
};

const BELT_RANGES = {
  display: [53, 61],
  real: [118, 242],
};

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createAsteroidBelt(scene, quality = 'medium') {
  const root = new THREE.Group();
  root.name = 'asteroid-belt';
  root.rotation.z = THREE.MathUtils.degToRad(1.35);
  scene.add(root);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let mesh = null;
  let geometry = null;
  let material = null;
  let asteroids = [];
  let currentQuality = QUALITY_COUNTS[quality] ? quality : 'medium';
  let scaleMode = 'display';
  let updateAccumulator = 0;

  function build(nextQuality) {
    currentQuality = QUALITY_COUNTS[nextQuality] ? nextQuality : 'medium';
    const count = QUALITY_COUNTS[currentQuality];
    const random = mulberry32(918274 + count);

    if (mesh) {
      root.remove(mesh);
      geometry.dispose();
      material.dispose();
    }

    geometry = new THREE.IcosahedronGeometry(0.24, currentQuality === 'low' ? 0 : 1);
    material = new THREE.MeshStandardMaterial({
      color: 0x817b72,
      roughness: 0.96,
      metalness: 0.04,
      vertexColors: true,
    });
    mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = 'instanced-asteroids';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    asteroids = Array.from({ length: count }, (_, index) => {
      const clusterNoise = (random() + random() + random()) / 3;
      const sizeBias = random() ** 2.4;
      const shade = 0.48 + random() * 0.22;
      color.setRGB(shade * 1.04, shade, shade * 0.92);
      mesh.setColorAt(index, color);
      return {
        ratio: THREE.MathUtils.clamp(clusterNoise + (random() - 0.5) * 0.22, 0, 1),
        angle: random() * Math.PI * 2,
        eccentricity: 0.018 + random() * 0.16,
        height: (random() - 0.5) * (1.1 + random() * 3.8),
        orbitSpeed: 0.00045 + random() * 0.0011,
        spin: random() * Math.PI * 2,
        spinSpeed: (random() - 0.5) * 1.7,
        scale: 0.16 + sizeBias * 0.86,
        stretch: 0.68 + random() * 1.24,
        tiltX: random() * Math.PI,
        tiltZ: random() * Math.PI,
      };
    });

    root.add(mesh);
    writeMatrices(0, 1, true);
  }

  function writeMatrices(delta, multiplier, force = false) {
    if (!mesh) return;
    const [inner, outer] = BELT_RANGES[scaleMode];
    const span = outer - inner;
    const speedScale = Math.min(100, Math.max(0, multiplier));

    asteroids.forEach((asteroid, index) => {
      asteroid.angle += asteroid.orbitSpeed * delta * speedScale;
      asteroid.spin += asteroid.spinSpeed * delta * speedScale;
      const semiMajor = inner + asteroid.ratio * span;
      const eccentricity = asteroid.eccentricity;
      const x = semiMajor * (Math.cos(asteroid.angle) - eccentricity);
      const z = semiMajor * Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(asteroid.angle);
      const verticalScale = scaleMode === 'real' ? 4.4 : 1;
      dummy.position.set(x, asteroid.height * verticalScale, z);
      dummy.rotation.set(asteroid.tiltX + asteroid.spin * 0.43, asteroid.spin, asteroid.tiltZ);
      dummy.scale.set(
        asteroid.scale * asteroid.stretch,
        asteroid.scale * (0.68 + asteroid.stretch * 0.2),
        asteroid.scale,
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    if (force || delta > 0) mesh.instanceMatrix.needsUpdate = true;
  }

  function update(delta, multiplier = 1) {
    updateAccumulator += delta;
    if (updateAccumulator < 1 / 30) return;
    writeMatrices(updateAccumulator, multiplier);
    updateAccumulator = 0;
  }

  function setVisible(visible) {
    root.visible = Boolean(visible);
  }

  function setQuality(nextQuality) {
    if (nextQuality !== currentQuality) build(nextQuality);
  }

  function setScaleMode(mode) {
    scaleMode = mode === 'real' ? 'real' : 'display';
    writeMatrices(0, 1, true);
  }

  function dispose() {
    if (mesh) root.remove(mesh);
    geometry?.dispose();
    material?.dispose();
    scene.remove(root);
    asteroids = [];
  }

  build(currentQuality);

  return {
    root,
    get mesh() {
      return mesh;
    },
    update,
    setVisible,
    setQuality,
    setScaleMode,
    dispose,
  };
}
