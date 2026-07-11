import { BODY_BY_ID } from './celestialBodies.js';

const localTexture = (name) => `./assets/textures/${name}`;

function satellite({ colors, ...data }) {
  return Object.freeze({
    ...data,
    colors: Object.freeze(colors),
  });
}

export function calculateSatelliteOrbitState(moon, daysSinceEpoch) {
  const days = Number.isFinite(daysSinceEpoch) ? daysSinceEpoch : 0;
  const angle = moon.phase + days * (Math.PI * 2 / moon.orbitPeriodDays);
  const radius = moon.displayOrbitRadius
    * (1 - moon.eccentricity ** 2)
    / (1 + moon.eccentricity * Math.cos(angle));
  return {
    angle,
    radius,
    normalY: Math.cos(moon.inclination * Math.PI / 180),
  };
}

export function calculateSatelliteVisibilityThreshold(bodyRadius, furthestOrbit) {
  const radius = Number.isFinite(bodyRadius) && bodyRadius > 0 ? bodyRadius : 0;
  const orbit = Number.isFinite(furthestOrbit) && furthestOrbit > 0 ? furthestOrbit : 0;
  return Math.min(30, Math.max(8, radius * 5.5, orbit * 1.25));
}

export function selectNearestSatelliteParent(distances, thresholds) {
  let selectedParentId = null;
  let nearestDistance = Infinity;
  for (const [parentId, distance] of Object.entries(distances || {})) {
    const threshold = thresholds?.[parentId];
    if (!Number.isFinite(distance) || !Number.isFinite(threshold)) continue;
    if (distance > threshold || distance >= nearestDistance) continue;
    selectedParentId = parentId;
    nearestDistance = distance;
  }
  return selectedParentId;
}

export function resolveSatelliteVisibility({
  id,
  parentId,
  viewState,
  focusedBodyId,
  selectedNearParentId,
}) {
  const focused = viewState === 'focused' && focusedBodyId === parentId;
  const overview = viewState === 'overview';
  const overviewSelected = overview && selectedNearParentId === parentId;
  const overviewMoon = overview && !selectedNearParentId && id === 'moon';
  return {
    mesh: focused || overviewSelected || overviewMoon,
    orbit: focused,
    label: focused,
  };
}

export const SATELLITES = Object.freeze([
  satellite({
    id: 'moon', parentId: 'earth', name: '月球', englishName: 'MOON',
    radiusKm: 1737.4, displayRadius: 0.44,
    orbitRadiusKm: 384400, displayOrbitRadius: 3.15, orbitPeriodDays: 27.321661,
    axialTilt: 6.68, inclination: 5.145, eccentricity: 0.0549, phase: 0.35,
    texture: localTexture('moon.jpg'), colors: ['#4d4b47', '#89857e', '#c4bdb0'],
  }),
  satellite({
    id: 'phobos', parentId: 'mars', name: '火卫一', englishName: 'PHOBOS',
    radiusKm: 11.267, displayRadius: 0.16,
    orbitRadiusKm: 9376, displayOrbitRadius: 2.1, orbitPeriodDays: 0.31891,
    axialTilt: 0, inclination: 1.093, eccentricity: 0.0151, phase: 1.1,
    texture: null, colors: ['#49392f', '#806654', '#b99b7d'],
  }),
  satellite({
    id: 'deimos', parentId: 'mars', name: '火卫二', englishName: 'DEIMOS',
    radiusKm: 6.2, displayRadius: 0.13,
    orbitRadiusKm: 23463.2, displayOrbitRadius: 2.85, orbitPeriodDays: 1.26244,
    axialTilt: 0, inclination: 0.93, eccentricity: 0.00033, phase: 3.1,
    texture: null, colors: ['#4a4037', '#746658', '#a99a87'],
  }),
  satellite({
    id: 'io', parentId: 'jupiter', name: '木卫一', englishName: 'IO',
    radiusKm: 1821.6, displayRadius: 0.35,
    orbitRadiusKm: 421700, displayOrbitRadius: 7.4, orbitPeriodDays: 1.769138,
    axialTilt: 0, inclination: 0.036, eccentricity: 0.0041, phase: 0.4,
    texture: null, colors: ['#7b5424', '#d2a844', '#f5da79'],
  }),
  satellite({
    id: 'europa', parentId: 'jupiter', name: '木卫二', englishName: 'EUROPA',
    radiusKm: 1560.8, displayRadius: 0.32,
    orbitRadiusKm: 671034, displayOrbitRadius: 9.35, orbitPeriodDays: 3.551181,
    axialTilt: 0.1, inclination: 0.466, eccentricity: 0.0094, phase: 2,
    texture: null, colors: ['#686057', '#c3ae8e', '#efe0bc'],
  }),
  satellite({
    id: 'ganymede', parentId: 'jupiter', name: '木卫三', englishName: 'GANYMEDE',
    radiusKm: 2634.1, displayRadius: 0.42,
    orbitRadiusKm: 1070412, displayOrbitRadius: 11.85, orbitPeriodDays: 7.154553,
    axialTilt: 0.33, inclination: 0.177, eccentricity: 0.0013, phase: 4.2,
    texture: null, colors: ['#403a36', '#766b61', '#aa9a87'],
  }),
  satellite({
    id: 'callisto', parentId: 'jupiter', name: '木卫四', englishName: 'CALLISTO',
    radiusKm: 2410.3, displayRadius: 0.39,
    orbitRadiusKm: 1882709, displayOrbitRadius: 14.7, orbitPeriodDays: 16.689018,
    axialTilt: 0, inclination: 0.192, eccentricity: 0.0074, phase: 5.3,
    texture: null, colors: ['#282523', '#554c45', '#84776c'],
  }),
  satellite({
    id: 'enceladus', parentId: 'saturn', name: '土卫二', englishName: 'ENCELADUS',
    radiusKm: 252.1, displayRadius: 0.22,
    orbitRadiusKm: 237948, displayOrbitRadius: 13.25, orbitPeriodDays: 1.370218,
    axialTilt: 0.009, inclination: 0.02, eccentricity: 0.0047, phase: 2.2,
    texture: null, colors: ['#73838a', '#c1d6dd', '#f3fbfc'],
  }),
  satellite({
    id: 'titan', parentId: 'saturn', name: '土卫六', englishName: 'TITAN',
    radiusKm: 2574.73, displayRadius: 0.44,
    orbitRadiusKm: 1221870, displayOrbitRadius: 18.2, orbitPeriodDays: 15.945421,
    axialTilt: 0.3, inclination: 0.349, eccentricity: 0.0288, phase: 4.8,
    texture: null, colors: ['#8b5b23', '#d7963f', '#f2c875'],
  }),
  satellite({
    id: 'iapetus', parentId: 'saturn', name: '土卫八', englishName: 'IAPETUS',
    radiusKm: 734.5, displayRadius: 0.29,
    orbitRadiusKm: 3560820, displayOrbitRadius: 21.3, orbitPeriodDays: 79.3215,
    axialTilt: 0, inclination: 15.47, eccentricity: 0.0286, phase: 5.7,
    texture: null, colors: ['#2e2a26', '#71685d', '#c2b8a6'],
  }),
  satellite({
    id: 'miranda', parentId: 'uranus', name: '米兰达', englishName: 'MIRANDA',
    radiusKm: 235.8, displayRadius: 0.21,
    orbitRadiusKm: 129390, displayOrbitRadius: 6.1, orbitPeriodDays: 1.413479,
    axialTilt: 0, inclination: 4.338, eccentricity: 0.0013, phase: 1.4,
    texture: null, colors: ['#596366', '#99a9aa', '#d2dddd'],
  }),
  satellite({
    id: 'ariel', parentId: 'uranus', name: '天卫一', englishName: 'ARIEL',
    radiusKm: 578.9, displayRadius: 0.27,
    orbitRadiusKm: 190900, displayOrbitRadius: 7.2, orbitPeriodDays: 2.520379,
    axialTilt: 0, inclination: 0.041, eccentricity: 0.0012, phase: 2.45,
    texture: null, colors: ['#667174', '#aab9ba', '#dce6e5'],
  }),
  satellite({
    id: 'umbriel', parentId: 'uranus', name: '天卫二', englishName: 'UMBRIEL',
    radiusKm: 584.7, displayRadius: 0.27,
    orbitRadiusKm: 266000, displayOrbitRadius: 8.2, orbitPeriodDays: 4.144177,
    axialTilt: 0, inclination: 0.128, eccentricity: 0.0039, phase: 4.65,
    texture: null, colors: ['#343b3d', '#657174', '#99a5a6'],
  }),
  satellite({
    id: 'titania', parentId: 'uranus', name: '天卫三', englishName: 'TITANIA',
    radiusKm: 788.9, displayRadius: 0.3,
    orbitRadiusKm: 436300, displayOrbitRadius: 9.4, orbitPeriodDays: 8.705872,
    axialTilt: 0, inclination: 0.079, eccentricity: 0.0011, phase: 3.5,
    texture: null, colors: ['#4b5557', '#86999a', '#c6d4d3'],
  }),
  satellite({
    id: 'oberon', parentId: 'uranus', name: '天卫四', englishName: 'OBERON',
    radiusKm: 761.4, displayRadius: 0.29,
    orbitRadiusKm: 583500, displayOrbitRadius: 11.5, orbitPeriodDays: 13.463239,
    axialTilt: 0, inclination: 0.068, eccentricity: 0.0014, phase: 5.4,
    texture: null, colors: ['#3b4142', '#707d7d', '#aebbbb'],
  }),
  satellite({
    id: 'triton', parentId: 'neptune', name: '海卫一', englishName: 'TRITON',
    radiusKm: 1353.4, displayRadius: 0.34,
    orbitRadiusKm: 354759, displayOrbitRadius: 5.3, orbitPeriodDays: 5.876854,
    axialTilt: 0, inclination: 156.865, eccentricity: 0.000016, phase: 2.7,
    texture: null, colors: ['#6f777a', '#b0bdc0', '#e0e9e8'],
  }),
]);

const grouped = new Map();
for (const moon of SATELLITES) {
  const current = grouped.get(moon.parentId) || [];
  current.push(moon);
  grouped.set(moon.parentId, current);
}

export const SATELLITES_BY_PARENT = new Map(
  [...grouped].map(([parentId, moons]) => [parentId, Object.freeze(moons)]),
);

const REQUIRED_FIELDS = Object.freeze([
  'id', 'parentId', 'name', 'englishName', 'radiusKm', 'displayRadius',
  'orbitRadiusKm', 'displayOrbitRadius', 'orbitPeriodDays', 'axialTilt',
  'inclination', 'eccentricity', 'phase', 'texture', 'colors',
]);

export function validateSatellites() {
  const errors = [];
  const ids = new Set();
  for (const moon of SATELLITES) {
    const missing = REQUIRED_FIELDS.filter((field) => !(field in moon));
    if (missing.length) errors.push(`${moon.id || 'unknown'} missing ${missing.join(', ')}`);
    if (ids.has(moon.id)) errors.push(`duplicate satellite id: ${moon.id}`);
    ids.add(moon.id);
    if (!BODY_BY_ID.has(moon.parentId) || moon.parentId === 'sun') {
      errors.push(`${moon.id} has invalid parent: ${moon.parentId}`);
    }
    for (const field of ['radiusKm', 'displayRadius', 'orbitRadiusKm', 'displayOrbitRadius', 'orbitPeriodDays']) {
      if (!Number.isFinite(moon[field]) || moon[field] <= 0) errors.push(`${moon.id}.${field} must be positive`);
    }
    if (!Number.isFinite(moon.eccentricity) || moon.eccentricity < 0 || moon.eccentricity >= 1) {
      errors.push(`${moon.id}.eccentricity must be in [0, 1)`);
    }
    if (!Array.isArray(moon.colors) || moon.colors.length !== 3) {
      errors.push(`${moon.id}.colors must contain three colors`);
    }
  }
  return errors;
}
