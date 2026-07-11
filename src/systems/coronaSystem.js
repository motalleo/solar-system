import { createCoronaMaterial } from '../shaders/coronaShader.js';

export const CORONA_QUALITY_PRESETS = Object.freeze({
  high: Object.freeze({ octaves: 4, flareCount: 8, shellSegments: [72, 44], flareSegments: 12, intensity: 1.08 }),
  medium: Object.freeze({ octaves: 3, flareCount: 4, shellSegments: [52, 32], flareSegments: 9, intensity: 0.94 }),
  low: Object.freeze({ octaves: 1, flareCount: 0, shellSegments: [32, 20], flareSegments: 0, intensity: 0.62 }),
});

function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createFlareDescriptors(count, seed = 0x51f15e) {
  const safeCount = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  const random = mulberry32(seed);
  return Array.from({ length: safeCount }, (_, index) => ({
    index,
    longitude: random() * Math.PI * 2,
    latitude: (random() - 0.5) * Math.PI * 0.86,
    span: 0.34 + random() * 0.34,
    height: 0.16 + random() * 0.24,
    width: 0.012 + random() * 0.019,
    phase: random() * Math.PI * 2,
    speed: 0.3 + random() * 0.42,
    brightness: 0.3 + random() * 0.34,
  }));
}

function createFlareGeometry(three, descriptor, segments) {
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const indices = [];
  const normal = new three.Vector3(
    Math.cos(descriptor.latitude) * Math.cos(descriptor.longitude),
    Math.sin(descriptor.latitude),
    Math.cos(descriptor.latitude) * Math.sin(descriptor.longitude),
  ).normalize();
  const reference = Math.abs(normal.y) > 0.9
    ? new three.Vector3(1, 0, 0)
    : new three.Vector3(0, 1, 0);
  const tangent = new three.Vector3().crossVectors(reference, normal).normalize();
  const ribbonNormal = new three.Vector3().crossVectors(normal, tangent).normalize();
  const center = new three.Vector3();
  const vertex = new three.Vector3();

  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments;
    const sideOffset = (progress - 0.5) * descriptor.span;
    const lift = descriptor.height * Math.sin(progress * Math.PI);
    center.copy(normal).multiplyScalar(1.02 + lift).addScaledVector(tangent, sideOffset);
    const width = descriptor.width * (0.35 + Math.sin(progress * Math.PI) * 0.65);
    vertex.copy(center).addScaledVector(ribbonNormal, -width);
    positions.set(vertex.toArray(), index * 6);
    vertex.copy(center).addScaledVector(ribbonNormal, width);
    positions.set(vertex.toArray(), index * 6 + 3);
    if (index < segments) {
      const first = index * 2;
      indices.push(first, first + 1, first + 2, first + 1, first + 3, first + 2);
    }
  }

  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

export function createCoronaSystem({
  sunRecord,
  quality = 'medium',
  camera = null,
  mobile = false,
  three = globalThis.THREE,
}) {
  if (!sunRecord?.tilt || !sunRecord?.material) {
    throw new TypeError('Corona system requires a sun record with tilt and material');
  }
  if (!three?.Group || !three?.SphereGeometry || !three?.ShaderMaterial) {
    throw new TypeError('createCoronaSystem requires a Three.js namespace');
  }

  const THREE = three;
  const root = new THREE.Group();
  root.name = 'sun-corona-system';
  root.renderOrder = 4;
  sunRecord.tilt.add(root);

  const shellGroup = new THREE.Group();
  const flareGroup = new THREE.Group();
  shellGroup.name = 'sun-corona-shell';
  flareGroup.name = 'sun-corona-flares';
  root.add(shellGroup, flareGroup);

  const ownedGeometries = new Set();
  const ownedMaterials = new Set();
  const flareRecords = [];
  const sunWorldPosition = new THREE.Vector3();
  const cameraWorldPosition = new THREE.Vector3();
  const cameraDirection = new THREE.Vector3(0, 0, 1);
  let currentQuality = CORONA_QUALITY_PRESETS[quality] ? quality : 'medium';
  let shell = null;
  let disposed = false;

  function registerGeometry(geometry) {
    ownedGeometries.add(geometry);
    return geometry;
  }

  function registerMaterial(material) {
    ownedMaterials.add(material);
    return material;
  }

  function clearOwnedVisuals() {
    shellGroup.clear();
    flareGroup.clear();
    for (const geometry of ownedGeometries) geometry.dispose();
    for (const material of ownedMaterials) material.dispose();
    ownedGeometries.clear();
    ownedMaterials.clear();
    flareRecords.length = 0;
    shell = null;
  }

  function buildVisuals() {
    const preset = CORONA_QUALITY_PRESETS[currentQuality];
    const shellGeometry = registerGeometry(new THREE.SphereGeometry(
      1.22,
      preset.shellSegments[0],
      preset.shellSegments[1],
    ));
    const shellMaterial = registerMaterial(createCoronaMaterial(THREE, preset));
    shell = new THREE.Mesh(shellGeometry, shellMaterial);
    shell.name = 'sun-corona-back-shell';
    shell.renderOrder = 4;
    shellGroup.add(shell);

    for (const descriptor of createFlareDescriptors(mobile ? 0 : preset.flareCount)) {
      const geometry = registerGeometry(createFlareGeometry(THREE, descriptor, preset.flareSegments));
      const material = registerMaterial(new THREE.MeshBasicMaterial({
        color: 0xff8a2c,
        transparent: true,
        opacity: descriptor.brightness,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `sun-flare-${descriptor.index + 1}`;
      mesh.renderOrder = 5;
      flareGroup.add(mesh);
      flareRecords.push({ mesh, material, descriptor });
    }

    if (sunRecord.material.uniforms?.uOctaves) {
      sunRecord.material.uniforms.uOctaves.value = preset.octaves;
    }
  }

  function update(time = 0, delta = 0) {
    if (disposed || !root.visible) return;
    const safeTime = Number.isFinite(time) ? time : 0;
    if (shell) {
      shell.material.uniforms.uTime.value = safeTime;
      if (camera) {
        sunRecord.anchor?.getWorldPosition?.(sunWorldPosition);
        if (camera.getWorldPosition) camera.getWorldPosition(cameraWorldPosition);
        else cameraWorldPosition.copy(camera.position);
        cameraDirection.copy(cameraWorldPosition).sub(sunWorldPosition).normalize();
        shell.material.uniforms.uCameraDirection.value.copy(cameraDirection);
      }
    }
    flareGroup.rotation.y += Math.max(0, Number.isFinite(delta) ? delta : 0) * 0.018;
    for (const { mesh, material, descriptor } of flareRecords) {
      const pulse = 0.5 + 0.5 * Math.sin(safeTime * descriptor.speed + descriptor.phase);
      material.opacity = descriptor.brightness * (0.48 + pulse * 0.52);
      mesh.scale.setScalar(0.985 + pulse * 0.035);
    }
  }

  function setQuality(nextQuality) {
    const normalized = CORONA_QUALITY_PRESETS[nextQuality] ? nextQuality : 'medium';
    if (disposed || normalized === currentQuality) return currentQuality;
    currentQuality = normalized;
    clearOwnedVisuals();
    buildVisuals();
    return currentQuality;
  }

  function setVisible(visible) {
    root.visible = Boolean(visible);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearOwnedVisuals();
    root.remove(shellGroup, flareGroup);
    root.removeFromParent();
  }

  buildVisuals();

  return {
    root,
    update,
    setQuality,
    setVisible,
    dispose,
    get quality() {
      return currentQuality;
    },
  };
}
