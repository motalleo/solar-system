import {
  SATELLITES,
  SATELLITES_BY_PARENT,
  calculateSatelliteOrbitState,
  calculateSatelliteVisibilityThreshold,
  resolveSatelliteVisibility,
  selectNearestSatelliteParent,
} from '../data/satellites.js';

const QUALITY_SEGMENTS = Object.freeze({
  low: [20, 12],
  medium: [32, 20],
  high: [48, 30],
  ultra: [64, 40],
});

const J2000_UTC_MS = Date.UTC(2000, 0, 1, 12);
const DAY_MS = 86400000;

function hashUnit(id, index) {
  let hash = 2166136261;
  const value = `${id}:${index}`;
  for (let position = 0; position < value.length; position += 1) {
    hash ^= value.charCodeAt(position);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function createProceduralSurface(data, quality, three) {
  const width = quality === 'ultra' ? 640 : quality === 'high' ? 512 : quality === 'medium' ? 384 : 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = width / 2;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, data.colors[0]);
  gradient.addColorStop(0.52, data.colors[1]);
  gradient.addColorStop(1, data.colors[2]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const icy = ['europa', 'enceladus', 'miranda', 'ariel', 'umbriel', 'titania', 'oberon', 'triton'].includes(data.id);
  context.globalCompositeOperation = icy ? 'screen' : 'multiply';
  const featureCount = quality === 'ultra' ? 96 : quality === 'high' ? 72 : quality === 'medium' ? 48 : 30;
  for (let index = 0; index < featureCount; index += 1) {
    const x = hashUnit(data.id, index * 4) * canvas.width;
    const y = hashUnit(data.id, index * 4 + 1) * canvas.height;
    const radius = 1.2 + hashUnit(data.id, index * 4 + 2) * (icy ? 8 : 12);
    const alpha = 0.035 + hashUnit(data.id, index * 4 + 3) * 0.12;
    context.globalAlpha = alpha;
    context.strokeStyle = icy ? '#eaf7f8' : '#24201d';
    context.lineWidth = icy ? 0.7 : 1.1;
    context.beginPath();
    if (icy && index % 3 === 0) {
      context.moveTo(x - radius * 2.8, y - radius * 0.35);
      context.lineTo(x + radius * 2.8, y + radius * 0.35);
    } else {
      context.arc(x, y, radius, 0, Math.PI * 2);
    }
    context.stroke();
  }
  context.globalCompositeOperation = 'source-over';
  context.globalAlpha = 1;

  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  texture.wrapS = three.RepeatWrapping;
  texture.userData.proceduralSatelliteSurface = true;
  texture.userData.surfaceType = icy ? 'ice' : 'rock';
  return texture;
}

function createLabelTexture(data, three) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = 'rgba(238,246,248,.94)';
  context.font = '600 27px "PingFang SC", sans-serif';
  context.fillText(data.name, 192, 34);
  context.fillStyle = 'rgba(161,182,191,.86)';
  context.font = '500 13px ui-monospace, monospace';
  context.fillText(data.englishName, 192, 66);
  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  return texture;
}

function createUnitOrbitGeometry(three, segments = 128) {
  const positions = new Float32Array(segments * 3);
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    positions[index * 3] = Math.cos(angle);
    positions[index * 3 + 1] = 0;
    positions[index * 3 + 2] = Math.sin(angle);
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.BufferAttribute(positions, 3));
  return geometry;
}

function epochDays(simulationDate) {
  if (simulationDate instanceof Date && Number.isFinite(simulationDate.getTime())) {
    return (simulationDate.getTime() - J2000_UTC_MS) / DAY_MS;
  }
  if (Number.isFinite(simulationDate)) {
    return Math.abs(simulationDate) > 1e10
      ? (simulationDate - J2000_UTC_MS) / DAY_MS
      : simulationDate;
  }
  return 0;
}

export function createSatelliteSystem({
  scene,
  solarSystem,
  materialSystem = null,
  quality = 'medium',
  three = globalThis.THREE,
}) {
  if (!scene || !solarSystem?.bodies) {
    throw new TypeError('Satellite system requires a scene and solar system anchors');
  }
  if (!three?.SphereGeometry || !three?.BufferGeometry || !three?.TextureLoader) {
    throw new TypeError('createSatelliteSystem requires a Three.js namespace');
  }

  const THREE = three;
  let currentQuality = QUALITY_SEGMENTS[quality] ? quality : 'medium';
  let viewState = 'overview';
  let focusedBodyId = null;
  let disposed = false;
  const camera = solarSystem.camera || null;
  const sphereGeometries = new Map(
    Object.entries(QUALITY_SEGMENTS).map(([tier, segments]) => [
      tier,
      new THREE.SphereGeometry(1, segments[0], segments[1]),
    ]),
  );
  const orbitGeometry = createUnitOrbitGeometry(THREE);
  const records = new Map();
  const materials = new Set();
  const textures = new Set();
  const parentWorldPosition = new THREE.Vector3();

  const orbitMaterial = new THREE.LineBasicMaterial({
    color: 0x91a8b2,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  materials.add(orbitMaterial);

  function registerTexture(texture) {
    textures.add(texture);
    return texture;
  }

  function createRecord(data) {
    const parentRecord = solarSystem.bodies.get(data.parentId);
    if (!parentRecord) throw new Error(`Missing satellite parent anchor: ${data.parentId}`);

    const inclinationGroup = new THREE.Group();
    inclinationGroup.name = `${data.id}-satellite-orbit`;
    inclinationGroup.rotation.x = THREE.MathUtils.degToRad(data.inclination);

    const semiMinor = data.displayOrbitRadius * Math.sqrt(1 - data.eccentricity ** 2);
    const orbitGuide = new THREE.LineLoop(orbitGeometry, orbitMaterial);
    orbitGuide.name = `${data.id}-orbit-guide`;
    orbitGuide.scale.set(data.displayOrbitRadius, 1, semiMinor);
    orbitGuide.position.x = -data.displayOrbitRadius * data.eccentricity;
    orbitGuide.visible = false;
    inclinationGroup.add(orbitGuide);

    const pivot = new THREE.Group();
    pivot.name = `${data.id}-orbit-pivot`;
    inclinationGroup.add(pivot);

    const fallback = registerTexture(createProceduralSurface(data, currentQuality, THREE));
    const material = new THREE.MeshStandardMaterial({
      map: fallback,
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.01,
      emissive: new THREE.Color(data.colors[0]).multiplyScalar(0.025),
      emissiveIntensity: 0.08,
      transparent: true,
      opacity: 1,
    });
    material.userData.surfaceSource = data.texture ? 'packaged' : 'procedural-rock-or-ice';
    material.userData.sharedMaterialSystemAvailable = Boolean(materialSystem);
    materials.add(material);

    const mesh = new THREE.Mesh(sphereGeometries.get(currentQuality), material);
    mesh.name = data.id;
    mesh.userData.satelliteId = data.id;
    mesh.userData.parentBodyId = data.parentId;
    mesh.scale.setScalar(data.displayRadius);
    mesh.rotation.z = THREE.MathUtils.degToRad(data.axialTilt);
    pivot.add(mesh);

    const labelTexture = registerTexture(createLabelTexture(data, THREE));
    const labelMaterial = new THREE.SpriteMaterial({
      map: labelTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.82,
      depthTest: false,
      depthWrite: false,
    });
    materials.add(labelMaterial);
    const label = new THREE.Sprite(labelMaterial);
    label.name = `${data.id}-label`;
    label.scale.set(3.25, 0.81, 1);
    label.visible = false;
    pivot.add(label);

    parentRecord.anchor.add(inclinationGroup);
    inclinationGroup.visible = false;

    const record = {
      data,
      parentRecord,
      inclinationGroup,
      pivot,
      orbitGuide,
      mesh,
      material,
      label,
      fallback,
    };
    records.set(data.id, record);

    if (data.texture) {
      const loadedTexture = new THREE.TextureLoader().load(
        data.texture,
        (texture) => {
          if (disposed) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = THREE.RepeatWrapping;
          textures.add(texture);
          record.material.map = texture;
          record.material.needsUpdate = true;
          record.material.userData.surfaceSource = 'packaged';
        },
        undefined,
        () => {
          record.material.map = record.fallback;
          record.material.needsUpdate = true;
          record.material.userData.surfaceSource = 'procedural-fallback';
        },
      );
      loadedTexture.colorSpace = THREE.SRGBColorSpace;
      textures.add(loadedTexture);
    }
  }

  SATELLITES.forEach(createRecord);

  function distanceToParent(parentId) {
    if (!camera) return Infinity;
    solarSystem.getBodyPosition(parentId, parentWorldPosition);
    return camera.position.distanceTo(parentWorldPosition);
  }

  function syncVisibility() {
    let selectedNearParentId = null;
    if (viewState === 'overview') {
      const distances = {};
      const thresholds = {};
      for (const [parentId, moons] of SATELLITES_BY_PARENT) {
        const furthestOrbit = Math.max(...moons.map(({ displayOrbitRadius }) => displayOrbitRadius));
        distances[parentId] = distanceToParent(parentId);
        thresholds[parentId] = calculateSatelliteVisibilityThreshold(
          solarSystem.getBodyRadius(parentId),
          furthestOrbit,
        );
      }
      selectedNearParentId = selectNearestSatelliteParent(distances, thresholds);
    }
    for (const record of records.values()) {
      const visibility = resolveSatelliteVisibility({
        id: record.data.id,
        parentId: record.data.parentId,
        viewState,
        focusedBodyId,
        selectedNearParentId,
      });
      record.inclinationGroup.visible = visibility.mesh;
      record.mesh.visible = visibility.mesh;
      record.orbitGuide.visible = visibility.orbit;
      record.label.visible = visibility.label;
    }
  }

  function update(simulationDate, delta) {
    if (disposed) return;
    const days = epochDays(simulationDate);
    syncVisibility();
    for (const record of records.values()) {
      if (!record.inclinationGroup.visible) continue;
      const orbitState = calculateSatelliteOrbitState(record.data, days);
      record.pivot.rotation.y = orbitState.angle;
      record.mesh.position.x = orbitState.radius;
      record.label.position.set(
        orbitState.radius,
        record.data.displayRadius + Math.max(0.48, record.data.displayRadius * 1.6),
        0,
      );
      record.mesh.rotation.y += Math.max(0, Number(delta) || 0) * 0.12;
    }
  }

  function setFocusedParent(id) {
    const overview = id === null || id === undefined;
    viewState = overview ? 'overview' : 'focused';
    focusedBodyId = overview ? null : id;
    syncVisibility();
    return focusedBodyId;
  }

  function setQuality(nextQuality) {
    if (disposed || !QUALITY_SEGMENTS[nextQuality] || nextQuality === currentQuality) return;
    currentQuality = nextQuality;
    const geometry = sphereGeometries.get(currentQuality);
    for (const record of records.values()) record.mesh.geometry = geometry;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const record of records.values()) {
      record.parentRecord.anchor.remove(record.inclinationGroup);
    }
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    for (const geometry of sphereGeometries.values()) geometry.dispose();
    orbitGeometry.dispose();
    records.clear();
  }

  syncVisibility();

  return {
    records,
    update,
    setFocusedParent,
    setQuality,
    dispose,
    get focusedParent() {
      return SATELLITES_BY_PARENT.has(focusedBodyId) ? focusedBodyId : null;
    },
    get focusedBodyId() {
      return focusedBodyId;
    },
    get viewState() {
      return viewState;
    },
  };
}
