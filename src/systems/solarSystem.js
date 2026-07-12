import * as THREE from 'three';

import { ORBITAL_ELEMENTS } from '../data/orbitalElements.js';
import { PLANET_IDS, TEXTURE_MANIFEST } from '../data/textureManifest.js';
import { createAtmosphereMaterial } from '../shaders/atmosphereShader.js';
import { createSunSurfaceMaterial } from '../shaders/coronaShader.js';
import { createCoronaSystem } from './coronaSystem.js';
import { sampleHeliocentricOrbit } from './ephemerisSystem.js';
import { getLabelOpacity } from './presentationState.js';
import { createMaterialSystem } from './materialSystem.js';
import {
  chooseBulkTextureTier,
  createTextureTierController,
} from './textureTierController.js';

const PACKAGED_TEXTURES = new Set([
  'sun.jpg',
  'mercury.jpg',
  'venus.jpg',
  'venus_atmosphere.jpg',
  'earth_day.jpg',
  'earth_night.jpg',
  'earth_clouds.jpg',
  'moon.jpg',
  'mars.jpg',
  'jupiter.jpg',
  'saturn.jpg',
  'saturn_ring.png',
  'uranus.jpg',
]);

const QUALITY_SEGMENTS = {
  low: [38, 24],
  medium: [64, 40],
  high: [96, 64],
  ultra: [128, 84],
};

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createCanvasTexture(canvas, colorSpace = THREE.SRGBColorSpace) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function createProceduralTexture(data, size = 768) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const context = canvas.getContext('2d');
  const random = mulberry32([...data.id].reduce((sum, character) => sum + character.charCodeAt(0), 811));
  const colors = data.colors;
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(0.48, colors[1]);
  gradient.addColorStop(1, colors[2]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (['jupiter', 'saturn', 'uranus', 'neptune', 'venus'].includes(data.id)) {
    const bandCount = data.id === 'jupiter' ? 34 : 22;
    for (let index = 0; index < bandCount; index += 1) {
      const y = random() * canvas.height;
      const height = 2 + random() * (data.id === 'jupiter' ? 18 : 10);
      context.globalAlpha = 0.06 + random() * 0.18;
      context.fillStyle = random() > 0.5 ? colors[0] : colors[2];
      context.fillRect(0, y, canvas.width, height);
    }
    if (data.id === 'jupiter') {
      context.globalAlpha = 0.72;
      context.fillStyle = '#a94f38';
      context.beginPath();
      context.ellipse(canvas.width * 0.69, canvas.height * 0.64, canvas.width * 0.075, canvas.height * 0.052, -0.1, 0, Math.PI * 2);
      context.fill();
    }
  } else {
    context.globalCompositeOperation = 'soft-light';
    for (let index = 0; index < size * 9; index += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const radius = random() ** 2 * 5 + 0.4;
      const shade = Math.floor(90 + random() * 130);
      context.globalAlpha = 0.025 + random() * 0.09;
      context.fillStyle = `rgb(${shade},${shade * 0.88},${shade * 0.76})`;
      context.fillRect(x, y, radius, radius);
    }
    if (data.id === 'mercury' || data.id === 'moon') {
      context.globalCompositeOperation = 'multiply';
      for (let index = 0; index < 90; index += 1) {
        context.globalAlpha = 0.06 + random() * 0.16;
        context.strokeStyle = '#1d1d1b';
        context.lineWidth = 1 + random() * 2;
        context.beginPath();
        context.arc(random() * canvas.width, random() * canvas.height, 2 + random() * 13, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }

  context.globalCompositeOperation = 'source-over';
  context.globalAlpha = 0.035;
  for (let y = 0; y < canvas.height; y += 2) {
    context.fillStyle = y % 4 === 0 ? '#ffffff' : '#000000';
    context.fillRect(0, y, canvas.width, 1);
  }
  context.globalAlpha = 1;

  const texture = createCanvasTexture(canvas);
  texture.userData.isFallback = true;
  return texture;
}

function createNightTexture(size = 768) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const context = canvas.getContext('2d');
  const random = mulberry32(174920);
  context.fillStyle = '#00030a';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#f4b55a';
  for (let index = 0; index < 920; index += 1) {
    if (random() < 0.68) continue;
    const x = random() * canvas.width;
    const y = canvas.height * (0.19 + random() * 0.62);
    context.globalAlpha = random() * 0.6;
    context.fillRect(x, y, 0.7 + random() * 1.5, 0.7 + random() * 1.5);
  }
  context.globalAlpha = 1;
  const texture = createCanvasTexture(canvas);
  texture.userData.isFallback = true;
  return texture;
}

function createCloudTexture(size = 768) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const context = canvas.getContext('2d');
  const random = mulberry32(32012);
  context.fillStyle = '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.filter = 'blur(7px)';
  for (let index = 0; index < 1200; index += 1) {
    const y = random() * canvas.height;
    const alpha = 0.04 + random() * 0.15;
    context.fillStyle = `rgba(255,255,255,${alpha})`;
    context.beginPath();
    context.ellipse(random() * canvas.width, y, 3 + random() * 18, 1 + random() * 6, random() * 0.4, 0, Math.PI * 2);
    context.fill();
  }
  context.filter = 'none';
  const texture = createCanvasTexture(canvas, THREE.NoColorSpace);
  texture.userData.isFallback = true;
  return texture;
}

function createLabelTexture(name, englishName) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = 'rgba(236,245,248,.92)';
  context.font = '600 34px "PingFang SC", sans-serif';
  context.fillText(name, 256, 47);
  context.fillStyle = 'rgba(153,175,187,.8)';
  context.font = '500 16px ui-monospace, monospace';
  context.fillText(englishName, 256, 86);
  return createCanvasTexture(canvas);
}

function createMarkerTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const center = 64;
  const glow = context.createRadialGradient(center, center, 3, center, center, 48);
  glow.addColorStop(0, 'rgba(255,255,255,.98)');
  glow.addColorStop(0.14, color);
  glow.addColorStop(0.28, `${color}66`);
  glow.addColorStop(1, `${color}00`);
  context.fillStyle = glow;
  context.fillRect(0, 0, 128, 128);
  context.strokeStyle = `${color}bb`;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(center, center, 31, 0, Math.PI * 2);
  context.stroke();
  return createCanvasTexture(canvas);
}

function createEarthMaterial(dayTexture, nightTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uDay: { value: dayTexture },
      uNight: { value: nightTexture },
      uNormal: { value: dayTexture },
      uSpecular: { value: dayTexture },
      uRoughness: { value: dayTexture },
      uBump: { value: dayTexture },
      uClouds: { value: dayTexture },
      uBumpTexel: { value: new THREE.Vector2(1 / 768, 1 / 384) },
      uHighlight: { value: 0 },
      uDim: { value: 1 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      uniform sampler2D uDay;
      uniform sampler2D uNight;
      uniform sampler2D uNormal;
      uniform sampler2D uSpecular;
      uniform sampler2D uRoughness;
      uniform sampler2D uBump;
      uniform sampler2D uClouds;
      uniform vec2 uBumpTexel;
      uniform float uHighlight;
      uniform float uDim;

      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 terrainNormal = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;
        float bumpLeft = texture2D(uBump, vUv - vec2(uBumpTexel.x, 0.0)).r;
        float bumpRight = texture2D(uBump, vUv + vec2(uBumpTexel.x, 0.0)).r;
        float bumpDown = texture2D(uBump, vUv - vec2(0.0, uBumpTexel.y)).r;
        float bumpUp = texture2D(uBump, vUv + vec2(0.0, uBumpTexel.y)).r;
        vec2 heightGradient = vec2(bumpLeft - bumpRight, bumpDown - bumpUp) * 0.42;
        terrainNormal = normalize(terrainNormal + vec3(heightGradient, 0.0));
        vec3 positionDx = dFdx(vWorldPosition);
        vec3 positionDy = dFdy(vWorldPosition);
        vec2 uvDx = dFdx(vUv);
        vec2 uvDy = dFdy(vUv);
        vec3 tangent = normalize(positionDx * uvDy.y - positionDy * uvDx.y);
        vec3 bitangent = normalize(-positionDx * uvDy.x + positionDy * uvDx.x);
        normal = normalize(mat3(tangent, bitangent, normal) * terrainNormal);
        vec3 toSun = normalize(-vWorldPosition);
        vec3 toCamera = normalize(cameraPosition - vWorldPosition);
        float light = dot(normal, toSun);
        float dayMix = smoothstep(-0.18, 0.3, light);
        float cloudCover = texture2D(uClouds, vUv).r;
        float cloudShadow = mix(1.0, 0.68, smoothstep(0.18, 0.82, cloudCover) * dayMix);
        vec3 day = texture2D(uDay, vUv).rgb * (0.14 + max(light, 0.0) * 1.18) * cloudShadow;
        vec3 night = texture2D(uNight, vUv).rgb * (1.0 - dayMix) * 1.65;
        float oceanMask = texture2D(uSpecular, vUv).r;
        float surfaceRoughness = texture2D(uRoughness, vUv).r;
        float specularPower = mix(112.0, 18.0, surfaceRoughness);
        float specularMask = mix(0.035, 1.0, oceanMask) * (1.0 - surfaceRoughness * 0.72);
        float oceanSpecular = pow(max(dot(reflect(-toSun, normal), toCamera), 0.0), specularPower) * max(light, 0.0) * specularMask;
        vec3 color = day + night + vec3(0.32, 0.55, 0.72) * oceanSpecular * 0.26;
        color += vec3(0.22, 0.42, 0.56) * uHighlight * 0.2;
        gl_FragColor = vec4(color * uDim, 1.0);
      }
    `,
  });
}

function createRingMaterial(texture) {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uMap: { value: texture },
      uOpacity: { value: 0.92 },
      uDim: { value: 1 },
    },
    vertexShader: `
      varying float vRadius;
      void main() {
        vRadius = clamp((length(position.xy) - 1.22) / (2.36 - 1.22), 0.0, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying float vRadius;
      uniform sampler2D uMap;
      uniform float uOpacity;
      uniform float uDim;
      void main() {
        vec4 ring = texture2D(uMap, vec2(vRadius, 0.5));
        float edge = smoothstep(0.0, 0.035, vRadius) * smoothstep(1.0, 0.965, vRadius);
        float cassiniGap = 1.0 - smoothstep(0.54, 0.565, vRadius) * (1.0 - smoothstep(0.59, 0.62, vRadius));
        float ringBands = 0.82 + 0.18 * sin(vRadius * 190.0);
        float alpha = ring.a * edge * cassiniGap * ringBands * uOpacity * uDim;
        if (alpha < 0.015) discard;
        gl_FragColor = vec4(ring.rgb * (0.68 + ring.a * 0.48), alpha);
      }
    `,
  });
}

function createFallbackRingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, 'rgba(100,88,68,0)');
  gradient.addColorStop(0.08, 'rgba(185,163,123,.45)');
  gradient.addColorStop(0.19, 'rgba(225,205,165,.75)');
  gradient.addColorStop(0.28, 'rgba(108,95,75,.28)');
  gradient.addColorStop(0.45, 'rgba(238,217,174,.82)');
  gradient.addColorStop(0.68, 'rgba(138,120,91,.48)');
  gradient.addColorStop(0.86, 'rgba(225,203,158,.48)');
  gradient.addColorStop(1, 'rgba(100,88,68,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return createCanvasTexture(canvas);
}

function createOrbit(data, material) {
  const geometry = new THREE.BufferGeometry();
  const orbit = new THREE.Line(geometry, material);
  orbit.name = `${data.id}-orbit`;
  return orbit;
}

function applyOrbitalPosition(record, simulationTime, orbitMode, ephemerisPositions) {
  if (record.data.id === 'sun') return;
  const { data, state, anchor } = record;
  const vector = ephemerisPositions.get(data.id);
  const elements = ORBITAL_ELEMENTS[data.id];
  if (vector && elements) {
    const normalized = vector.clone().multiplyScalar(record.state.distance / elements.a[0]);
    record.anchor.position.copy(normalized);
    return;
  }
  if (orbitMode === 'ephemeris') return;
  const angle = data.phase + simulationTime * data.revolutionSpeed;
  const eccentricity = data.eccentricity;
  const inclination = THREE.MathUtils.degToRad(data.orbitInclination);
  const x = state.distance * (Math.cos(angle) - eccentricity);
  const rawZ = state.distance * Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(angle);
  anchor.position.set(x, -rawZ * Math.sin(inclination), rawZ * Math.cos(inclination));
}

function getTextureFile(path) {
  return path.split('/').pop();
}

export async function createSolarSystem(scene, bodyData, options = {}) {
  const quality = QUALITY_SEGMENTS[options.quality] ? options.quality : 'medium';
  const sphereGeometries = new Map(
    Object.entries(QUALITY_SEGMENTS).map(([key, segments]) => [
      key,
      new THREE.SphereGeometry(1, segments[0], segments[1]),
    ]),
  );
  let currentQuality = quality;
  let sphereGeometry = sphereGeometries.get(currentQuality);
  const root = new THREE.Group();
  const orbitGroup = new THREE.Group();
  const bodyGroup = new THREE.Group();
  const labelGroup = new THREE.Group();
  root.name = 'solar-system';
  orbitGroup.name = 'orbits';
  bodyGroup.name = 'celestial-bodies';
  labelGroup.name = 'body-labels';
  root.add(orbitGroup, bodyGroup, labelGroup);
  scene.add(root);

  const renderer = options.renderer;
  const camera = options.camera;
  const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() || 4;
  const deviceMemory = typeof navigator === 'undefined' ? 8 : navigator.deviceMemory;
  const coarsePointer = typeof window !== 'undefined'
    && window.matchMedia?.('(pointer: coarse)').matches;
  let currentTextureTier = chooseBulkTextureTier({ quality, coarsePointer, deviceMemory });
  let completedTextureJobs = 0;
  let completedMaterialJobs = 0;
  let totalTextureJobs = PLANET_IDS.reduce(
    (total, id) => total + Object.keys(TEXTURE_MANIFEST[id][currentTextureTier]).length,
    0,
  );
  const reportTextureProgress = () => {
    options.onProgress?.(
      completedTextureJobs + completedMaterialJobs,
      totalTextureJobs,
    );
  };
  const materialSystem = createMaterialSystem({
    renderer,
    quality,
    three: THREE,
    onProgress: (complete) => {
      completedMaterialJobs = complete;
      reportTextureProgress();
    },
    onFallback: ({ id, tier, error }) => {
      options.onTextureFallback?.(`${id}/${tier}`, error);
    },
  });
  const textureLoader = new THREE.TextureLoader();
  const records = new Map();
  const interactiveMeshes = [];
  const ownedTextures = new Set();
  const ownedMaterials = new Set();
  const ownedGeometries = new Set(sphereGeometries.values());
  const loadedTextures = new Map();
  const ephemerisPositions = new Map();
  let scaleMode = 'display';
  let orbitMode = 'ephemeris';
  let orbitsVisible = true;
  let orbitSampleYear = null;
  let labelsVisible = true;
  let dimTarget = null;

  function syncOrbitVisibility() {
    orbitGroup.visible = orbitsVisible;
  }

  syncOrbitVisibility();

  const orbitMaterial = new THREE.LineBasicMaterial({
    color: 0x8fa9b8,
    transparent: true,
    opacity: 0.19,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  orbitMaterial.userData.baseOpacity = 0.19;
  ownedMaterials.add(orbitMaterial);

  const sunlight = new THREE.PointLight(0xffd8a0, 2600, 0, 2);
  sunlight.position.set(0, 0, 0);
  root.add(sunlight);

  function registerTexture(texture) {
    texture.anisotropy = Math.min(maxAnisotropy, 8);
    ownedTextures.add(texture);
    return texture;
  }

  function registerMaterial(material) {
    ownedMaterials.add(material);
    return material;
  }

  function createLabel(data, radius) {
    const labelTexture = registerTexture(createLabelTexture(data.name, data.englishName));
    const material = registerMaterial(new THREE.SpriteMaterial({
      map: labelTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      depthTest: false,
    }));
    material.userData.baseOpacity = 0.72;
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(7, 1.75, 1);
    sprite.position.y = radius + 2.2;
    return sprite;
  }

  function createStandardMaterial(data, fallback) {
    return registerMaterial(new THREE.MeshStandardMaterial({
      map: fallback,
      color: 0xffffff,
      roughness: ['jupiter', 'saturn', 'uranus', 'neptune'].includes(data.id) ? 0.78 : 0.88,
      metalness: data.id === 'earth' ? 0.05 : 0.015,
      emissive: new THREE.Color(data.colors[0]).multiplyScalar(0.03),
      emissiveIntensity: 0.08,
      transparent: true,
      opacity: 1,
    }));
  }

  function createBody(data) {
    const anchor = new THREE.Group();
    const tilt = new THREE.Group();
    anchor.name = `${data.id}-anchor`;
    tilt.name = `${data.id}-tilt`;
    tilt.rotation.z = THREE.MathUtils.degToRad(data.axialTilt);
    anchor.add(tilt);
    bodyGroup.add(anchor);

    const fallback = registerTexture(createProceduralTexture(data, quality === 'high' ? 1024 : 768));
    const fallbackTextures = [fallback];
    let material;
    if (data.id === 'sun') {
      material = registerMaterial(createSunSurfaceMaterial(THREE, fallback, quality));
    } else if (data.id === 'earth') {
      const nightFallback = registerTexture(createNightTexture(quality === 'high' ? 1024 : 768));
      fallbackTextures.push(nightFallback);
      material = registerMaterial(createEarthMaterial(fallback, nightFallback));
    } else {
      material = createStandardMaterial(data, fallback);
    }

    const mesh = new THREE.Mesh(sphereGeometry, material);
    mesh.name = data.id;
    mesh.userData.bodyId = data.id;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    tilt.add(mesh);
    interactiveMeshes.push(mesh);

    const state = {
      distance: data.displayDistance,
      radius: data.displayRadius,
    };
    tilt.scale.setScalar(state.radius);

    let orbit = null;
    if (data.id !== 'sun') {
      orbit = createOrbit(data, orbitMaterial);
      orbit.scale.setScalar(state.distance / ORBITAL_ELEMENTS[data.id].a[0]);
      orbitGroup.add(orbit);
      ownedGeometries.add(orbit.geometry);
    }

    const label = createLabel(data, state.radius);
    anchor.add(label);

    let marker = null;
    if (data.id !== 'sun') {
      const markerTexture = registerTexture(createMarkerTexture(data.colors[1]));
      const markerMaterial = registerMaterial(new THREE.SpriteMaterial({
        map: markerTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.48,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      marker = new THREE.Sprite(markerMaterial);
      marker.name = `${data.id}-real-scale-marker`;
      marker.userData.bodyId = data.id;
      marker.visible = false;
      marker.renderOrder = 8;
      anchor.add(marker);
      interactiveMeshes.push(marker);
    }

    const record = {
      data,
      anchor,
      tilt,
      mesh,
      material,
      state,
      orbit,
      label,
      marker,
      atmosphere: null,
      clouds: null,
      ring: null,
      fallbackTextures,
    };

    const atmosphereConfig = {
      earth: {
        rayleighColor: 0x4fa7dd,
        mieColor: 0xff9d68,
        density: 0.58,
        terminatorWidth: 0.22,
        sunsetStrength: 0.78,
        scale: 1.06,
      },
      venus: {
        rayleighColor: 0xf0b869,
        mieColor: 0xff7847,
        density: 0.32,
        terminatorWidth: 0.3,
        sunsetStrength: 0.72,
        scale: 1.045,
      },
      jupiter: {
        rayleighColor: 0xd9a878,
        mieColor: 0xe67555,
        density: 0.16,
        terminatorWidth: 0.18,
        sunsetStrength: 0.46,
        scale: 1.025,
      },
      saturn: {
        rayleighColor: 0xe1c58e,
        mieColor: 0xee8d5b,
        density: 0.13,
        terminatorWidth: 0.2,
        sunsetStrength: 0.42,
        scale: 1.024,
      },
      uranus: {
        rayleighColor: 0x8bd5da,
        mieColor: 0xb6f2db,
        density: 0.3,
        terminatorWidth: 0.24,
        sunsetStrength: 0.34,
        scale: 1.035,
      },
      neptune: {
        rayleighColor: 0x4f91e8,
        mieColor: 0x82c7ff,
        density: 0.32,
        terminatorWidth: 0.22,
        sunsetStrength: 0.4,
        scale: 1.038,
      },
    }[data.id];
    if (atmosphereConfig) {
      const atmosphereMaterial = registerMaterial(createAtmosphereMaterial(atmosphereConfig));
      const atmosphere = new THREE.Mesh(sphereGeometry, atmosphereMaterial);
      atmosphere.scale.setScalar(atmosphereConfig.scale);
      atmosphere.renderOrder = 3;
      tilt.add(atmosphere);
      record.atmosphere = atmosphere;
    }

    if (data.id === 'earth') {
      const cloudFallback = registerTexture(createCloudTexture(quality === 'high' ? 1024 : 768));
      record.fallbackTextures.push(cloudFallback);
      record.material.uniforms.uClouds.value = cloudFallback;
      const cloudMaterial = registerMaterial(new THREE.MeshStandardMaterial({
        map: cloudFallback,
        alphaMap: cloudFallback,
        color: 0xe9f4f7,
        transparent: true,
        opacity: 0.68,
        alphaTest: 0.04,
        depthWrite: false,
        roughness: 0.9,
      }));
      cloudMaterial.userData.baseOpacity = 0.68;
      const clouds = new THREE.Mesh(sphereGeometry, cloudMaterial);
      clouds.scale.setScalar(1.018);
      clouds.renderOrder = 2;
      tilt.add(clouds);
      record.clouds = clouds;

    }

    if (data.id === 'saturn') {
      const ringFallback = registerTexture(createFallbackRingTexture());
      const ringGeometry = new THREE.RingGeometry(1.22, 2.36, 256, 1);
      const ringMaterial = registerMaterial(createRingMaterial(ringFallback));
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.renderOrder = 1;
      tilt.add(ring);
      ownedGeometries.add(ringGeometry);
      record.ring = ring;
    }

    if (data.id === 'uranus') {
      const ringGeometry = new THREE.RingGeometry(1.45, 1.82, 128);
      const ringMaterial = registerMaterial(new THREE.MeshBasicMaterial({
        color: 0x91c8ca,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      }));
      ringMaterial.userData.baseOpacity = 0.1;
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2;
      tilt.add(ring);
      ownedGeometries.add(ringGeometry);
      record.ring = ring;
    }

    records.set(data.id, record);
    applyOrbitalPosition(record, 0, 'simulation', ephemerisPositions);
    return record;
  }

  bodyData.forEach(createBody);
  const sunRecord = records.get('sun');
  const coronaSystem = sunRecord
    ? createCoronaSystem({
      sunRecord,
      quality: currentQuality,
      camera,
      mobile: coarsePointer,
      three: THREE,
    })
    : null;

  async function loadTexture(path, colorSpace = THREE.SRGBColorSpace) {
    const filename = getTextureFile(path);
    if (!PACKAGED_TEXTURES.has(filename)) {
      options.onTextureFallback?.(filename, new Error('纹理未打包，已启用程序化兼容材质'));
      return null;
    }
    if (loadedTextures.has(path)) return loadedTextures.get(path);
    try {
      const texture = await textureLoader.loadAsync(path);
      texture.colorSpace = colorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(maxAnisotropy, 8);
      loadedTextures.set(path, texture);
      ownedTextures.add(texture);
      return texture;
    } catch (error) {
      options.onTextureFallback?.(filename, error);
      return null;
    }
  }

  const textureJobs = [];
  const queueTexture = (path, apply, colorSpace = THREE.SRGBColorSpace) => {
    if (!path) return;
    textureJobs.push(
      loadTexture(path, colorSpace).then((texture) => {
        if (texture) apply(texture);
        completedTextureJobs += 1;
        reportTextureProgress();
      }),
    );
  };

  for (const record of records.values()) {
    if (record.data.id === 'sun') {
      queueTexture(record.data.texture, (texture) => {
        record.material.uniforms.uMap.value = texture;
      });
    }

    if (record.data.id === 'venus') {
      queueTexture(record.data.atmosphereTexture, (texture) => {
        const material = registerMaterial(new THREE.MeshStandardMaterial({
          map: texture,
          transparent: true,
          opacity: 0.24,
          depthWrite: false,
          roughness: 1,
        }));
        material.userData.baseOpacity = 0.24;
        const shell = new THREE.Mesh(sphereGeometry, material);
        shell.scale.setScalar(1.012);
        shell.rotation.y = 0.8;
        record.tilt.add(shell);
        record.clouds = shell;
      });
    }

    if (record.data.id === 'saturn') {
      queueTexture(record.data.ringTexture, (texture) => {
        record.ring.material.uniforms.uMap.value = texture;
      }, THREE.NoColorSpace);
    }
  }

  function applyMaterialBundle(record, bundle) {
    if (!record || !bundle) return;
    const previousMaterial = record.material;
    if (record.data.id === 'earth') {
      record.material.uniforms.uDay.value = bundle.textures.albedo;
      record.material.uniforms.uNight.value = bundle.textures.night;
      record.material.uniforms.uNormal.value = bundle.textures.normal;
      record.material.uniforms.uSpecular.value = bundle.textures.specular;
      record.material.uniforms.uRoughness.value = bundle.textures.roughness;
      record.material.uniforms.uBump.value = bundle.textures.bump;
      record.material.uniforms.uClouds.value = bundle.textures.clouds;
      const [bumpWidth, bumpHeight] = TEXTURE_MANIFEST.earth[bundle.tier].bump.runtimeResolution
        .split('x')
        .map(Number);
      record.material.uniforms.uBumpTexel.value.set(1 / bumpWidth, 1 / bumpHeight);
      record.clouds.material.map = bundle.textures.clouds;
      record.clouds.material.alphaMap = bundle.textures.clouds;
      record.clouds.material.needsUpdate = true;
    } else {
      record.material = bundle.material;
      record.mesh.material = bundle.material;
      record.material.needsUpdate = true;
    }
    for (const texture of record.fallbackTextures) {
      texture.dispose();
      ownedTextures.delete(texture);
    }
    record.fallbackTextures.length = 0;
    if (record.data.id !== 'earth' && ownedMaterials.has(previousMaterial)) {
      previousMaterial.dispose();
      ownedMaterials.delete(previousMaterial);
    }
  }

  totalTextureJobs += textureJobs.length;
  options.onTextureCount?.(totalTextureJobs);
  const textureTierController = createTextureTierController({
    materialSystem,
    planetIds: PLANET_IDS,
    quality,
    coarsePointer,
    deviceMemory,
    applyBundle: (id, bundle) => applyMaterialBundle(records.get(id), bundle),
  });
  await Promise.all([...textureJobs, textureTierController.loadInitial()]);

  const sunWorldPosition = new THREE.Vector3();
  const bodyWorldPosition = new THREE.Vector3();

  function updateSunDirection() {
    if (!sunRecord) return;
    sunRecord.anchor.getWorldPosition(sunWorldPosition);
    for (const record of records.values()) {
      if (!record.atmosphere) continue;
      record.atmosphere.getWorldPosition(bodyWorldPosition);
      const sunDirection = sunWorldPosition.clone().sub(bodyWorldPosition).normalize();
      record.atmosphere.material.uniforms.uSunDirection.value.copy(sunDirection);
    }
  }

  function update(simulationTime, delta) {
    materialSystem.update(simulationTime);
    for (const record of records.values()) {
      applyOrbitalPosition(record, simulationTime, orbitMode, ephemerisPositions);
      record.mesh.rotation.y += record.data.rotationSpeed * delta;
      record.tilt.scale.setScalar(record.state.radius);
      record.label.position.y = record.state.radius + Math.max(1.6, record.state.radius * 0.42);
      if (record.marker) {
        record.marker.visible = scaleMode === 'real' && !dimTarget;
        if (record.marker.visible && camera) {
          const markerDistance = camera.position.distanceTo(record.anchor.position);
          const markerSize = Math.max(record.state.radius * 3.2, markerDistance * 0.0085);
          record.marker.scale.set(markerSize, markerSize, 1);
        }
      }
      if (record.orbit) {
        record.orbit.scale.setScalar(
          record.state.distance / ORBITAL_ELEMENTS[record.data.id].a[0],
        );
      }
      if (record.clouds) record.clouds.rotation.y += delta * 0.012;
      if (record.data.id === 'sun') {
        record.material.uniforms.uTime.value = simulationTime;
      }
    }
    updateSunDirection();
  }

  function updateCorona(simulationTime, delta) {
    coronaSystem?.update(simulationTime, delta);
  }

  function updateOrbitGeometries(date) {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return;
    if (orbitSampleYear === date.getUTCFullYear()) return;
    for (const record of records.values()) {
      if (!record.orbit) continue;
      const points = sampleHeliocentricOrbit(record.data.id, date).map(
        (point) => new THREE.Vector3(point.x, point.z, point.y),
      );
      record.orbit.geometry.setFromPoints(points);
      record.orbit.geometry.computeBoundingSphere();
    }
    orbitSampleYear = date.getUTCFullYear();
  }

  function setEphemerisSnapshot(snapshot, date) {
    ephemerisPositions.clear();
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return;
    for (const [id, position] of Object.entries(snapshot)) {
      if (!records.has(id) || !ORBITAL_ELEMENTS[id]) continue;
      const coordinates = [position?.x, position?.y, position?.z];
      if (!coordinates.every(Number.isFinite)) continue;
      ephemerisPositions.set(id, new THREE.Vector3(position.x, position.z, position.y));
    }
    updateOrbitGeometries(date);
  }

  function setOrbitMode(mode) {
    if (mode !== 'ephemeris' && mode !== 'simulation') {
      throw new RangeError(`Unsupported orbit mode: ${mode}`);
    }
    orbitMode = mode;
    syncOrbitVisibility();
    return orbitMode;
  }

  function setScaleMode(mode, immediate = false) {
    scaleMode = mode === 'real' ? 'real' : 'display';
    const gsap = window.gsap;
    for (const record of records.values()) {
      const target = {
        distance: scaleMode === 'real' ? record.data.realDistance : record.data.displayDistance,
        radius: scaleMode === 'real' ? record.data.realRadius : record.data.displayRadius,
      };
      if (!immediate && gsap) {
        gsap.to(record.state, { ...target, duration: 1.65, ease: 'power3.inOut' });
      } else {
        Object.assign(record.state, target);
      }
    }
  }

  function setQuality(nextQuality) {
    if (!sphereGeometries.has(nextQuality) || nextQuality === currentQuality) return;
    currentQuality = nextQuality;
    sphereGeometry = sphereGeometries.get(currentQuality);
    for (const record of records.values()) {
      record.mesh.geometry = sphereGeometry;
      if (record.atmosphere) record.atmosphere.geometry = sphereGeometry;
      if (record.clouds) record.clouds.geometry = sphereGeometry;
    }
    coronaSystem?.setQuality(nextQuality);
    void textureTierController.setQuality(nextQuality);
    currentTextureTier = textureTierController.bulkTier;
  }

  function upgradeFocusedTexture(id) {
    return textureTierController.focusPlanet(id);
  }

  function setOrbitsVisible(visible) {
    orbitsVisible = Boolean(visible);
    syncOrbitVisibility();
  }

  function setLabelsVisible(visible) {
    labelsVisible = Boolean(visible);
    labelGroup.visible = labelsVisible;
    for (const record of records.values()) record.label.visible = labelsVisible;
  }

  function setHovered(id) {
    for (const [recordId, record] of records) {
      const active = id === recordId;
      if (record.material.isMeshStandardMaterial) {
        record.material.emissiveIntensity = active ? 0.42 : 0.08;
      } else if (record.data.id === 'sun') {
        record.material.uniforms.uIntensity.value = active ? 1.38 : 1;
      } else if (record.material.uniforms?.uHighlight) {
        record.material.uniforms.uHighlight.value = active ? 1 : 0;
      }
      if (record.atmosphere) record.atmosphere.material.uniforms.uHighlight.value = active ? 1 : 0;
      record.label.material.opacity = getLabelOpacity({
        labelsVisible,
        focused: Boolean(dimTarget),
        baseOpacity: active ? 1 : record.label.material.userData.baseOpacity,
      });
    }
  }

  function setDimmed(active, targetId = null) {
    dimTarget = active ? targetId : null;
    coronaSystem?.setVisible(!active || targetId === 'sun');
    for (const [id, record] of records) {
      const dim = !active || id === targetId ? 1 : 0.28;
      if (record.material.isMeshStandardMaterial) record.material.opacity = dim;
      else if (record.material.uniforms?.uDim) record.material.uniforms.uDim.value = dim;
      if (record.atmosphere) record.atmosphere.material.uniforms.uDim.value = dim;
      if (record.ring?.material.uniforms?.uDim) record.ring.material.uniforms.uDim.value = dim;
      else if (record.ring?.material) record.ring.material.opacity = (record.ring.material.userData.baseOpacity || 1) * dim;
      record.label.material.opacity = getLabelOpacity({
        labelsVisible,
        focused: active,
        baseOpacity: record.label.material.userData.baseOpacity,
      });
    }
    orbitMaterial.opacity = active ? 0.045 : orbitMaterial.userData.baseOpacity;
  }

  function getBodyPosition(id, target = new THREE.Vector3()) {
    const record = records.get(id);
    if (!record) return target.set(0, 0, 0);
    return record.anchor.getWorldPosition(target);
  }

  function getBodyRadius(id) {
    return records.get(id)?.state.radius || 1;
  }

  function dispose() {
    const tweenTargets = [...records.values()].map((record) => record.state);
    window.gsap?.killTweensOf(tweenTargets);
    coronaSystem?.dispose();
    materialSystem.dispose();
    for (const material of ownedMaterials) material.dispose();
    for (const geometry of ownedGeometries) geometry.dispose();
    for (const texture of ownedTextures) texture.dispose();
    scene.remove(root);
    records.clear();
    interactiveMeshes.length = 0;
  }

  return {
    root,
    bodies: records,
    camera,
    materialSystem,
    interactiveMeshes,
    orbitGroup,
    labelGroup,
    sunlight,
    coronaSystem,
    update,
    updateCorona,
    updateSunDirection,
    setEphemerisSnapshot,
    setOrbitMode,
    setScaleMode,
    setQuality,
    upgradeFocusedTexture,
    setOrbitsVisible,
    setLabelsVisible,
    setHovered,
    setDimmed,
    getBodyPosition,
    getBodyRadius,
    get scaleMode() {
      return scaleMode;
    },
    get orbitMode() {
      return orbitMode;
    },
    get dimTarget() {
      return dimTarget;
    },
    dispose,
  };
}
