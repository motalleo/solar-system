export const PLANET_IDS = Object.freeze([
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
]);

const TIERS = Object.freeze(['low', 'medium', 'high']);
const ROCKY_PLANETS = new Set(['mercury', 'venus', 'earth', 'mars']);
const SOURCE_ROOT = 'https://www.solarsystemscope.com/textures/download/';
const LICENSE = 'CC BY 4.0';
const CREDIT = 'Solar System Scope / INOVE';

const SOURCE = Object.freeze({
  mercury: ['8k_mercury.jpg', '8192x4096'],
  venus: ['8k_venus_surface.jpg', '8192x4096'],
  earth: ['8k_earth_daymap.jpg', '8192x4096'],
  mars: ['8k_mars.jpg', '8192x4096'],
  jupiter: ['8k_jupiter.jpg', '4096x2048'],
  saturn: ['8k_saturn.jpg', '4096x2048'],
  uranus: ['2k_uranus.jpg', '2048x1024'],
  neptune: ['2k_neptune.jpg', '2048x1024'],
});

const RUNTIME_RESOLUTION = Object.freeze({
  standard: Object.freeze({ low: '512x256', medium: '2048x1024', high: '4096x2048' }),
  iceGiant: Object.freeze({ low: '512x256', medium: '1024x512', high: '2048x1024' }),
});

function record(id, tier, channel, sourceName, sourceResolution, derivedFrom) {
  return Object.freeze({
    id,
    tier,
    channel,
    path: `./assets/textures/${tier}/${id}_${channel}.jpg`,
    sourceUrl: `${SOURCE_ROOT}${sourceName}`,
    sourceResolution,
    runtimeResolution: RUNTIME_RESOLUTION[
      id === 'uranus' || id === 'neptune' ? 'iceGiant' : 'standard'
    ][tier],
    license: LICENSE,
    credit: CREDIT,
    derivedFrom,
  });
}

function createPlanetEntry(id) {
  const [sourceName, sourceResolution] = SOURCE[id];
  const tierEntry = {};
  for (const tier of TIERS) {
    const channels = {
      albedo: record(
        id,
        tier,
        'albedo',
        sourceName,
        sourceResolution,
        `${sourceName}; Lanczos resize and JPEG web export only`,
      ),
    };
    if (ROCKY_PLANETS.has(id)) {
      channels.bump = record(
        id,
        tier,
        'bump',
        sourceName,
        sourceResolution,
        `${sourceName}; grayscale, 1% autocontrast, 0.55px blur; visual relief proxy, not a scientific elevation product`,
      );
      if (id !== 'earth') {
        channels.roughness = record(
          id,
          tier,
          'roughness',
          sourceName,
          sourceResolution,
          `${sourceName}; inverted luminance blended 18% over neutral roughness 220; artistic PBR proxy, not measured roughness`,
        );
      }
    }
    tierEntry[tier] = Object.freeze(channels);
  }
  return tierEntry;
}

const earth = createPlanetEntry('earth');
for (const tier of TIERS) {
  earth[tier] = Object.freeze({
    ...earth[tier],
    night: record(
      'earth',
      tier,
      'night',
      '8k_earth_nightmap.jpg',
      '8192x4096',
      '8k_earth_nightmap.jpg; Lanczos resize and JPEG web export only',
    ),
    clouds: record(
      'earth',
      tier,
      'clouds',
      '8k_earth_clouds.jpg',
      '8192x4096',
      '8k_earth_clouds.jpg; grayscale conversion, Lanczos resize and JPEG web export',
    ),
    normal: record(
      'earth',
      tier,
      'normal',
      '8k_earth_normal_map.tif',
      '8192x4096',
      '8k_earth_normal_map.tif; Lanczos resize and high-quality JPEG web export',
    ),
    specular: record(
      'earth',
      tier,
      'specular',
      '8k_earth_specular_map.tif',
      '8192x4096',
      '8k_earth_specular_map.tif; grayscale conversion, Lanczos resize and JPEG web export',
    ),
    roughness: record(
      'earth',
      tier,
      'roughness',
      '8k_earth_specular_map.tif',
      '8192x4096',
      '8k_earth_specular_map.tif; grayscale inversion of specular mask; derived PBR control, not a measured roughness product',
    ),
  });
}

export const TEXTURE_MANIFEST = Object.freeze({
  mercury: Object.freeze(createPlanetEntry('mercury')),
  venus: Object.freeze(createPlanetEntry('venus')),
  earth: Object.freeze(earth),
  mars: Object.freeze(createPlanetEntry('mars')),
  jupiter: Object.freeze(createPlanetEntry('jupiter')),
  saturn: Object.freeze(createPlanetEntry('saturn')),
  uranus: Object.freeze(createPlanetEntry('uranus')),
  neptune: Object.freeze(createPlanetEntry('neptune')),
});

export function validateTextureManifest(manifest = TEXTURE_MANIFEST) {
  const errors = [];
  const requiredFields = [
    'id',
    'tier',
    'channel',
    'path',
    'sourceUrl',
    'sourceResolution',
    'runtimeResolution',
    'license',
    'credit',
    'derivedFrom',
  ];

  for (const id of PLANET_IDS) {
    const entry = manifest[id];
    if (!entry) {
      errors.push(`${id}: missing planet entry`);
      continue;
    }
    const albedoPaths = new Set();
    for (const tier of TIERS) {
      const channels = entry[tier];
      if (!channels?.albedo) {
        errors.push(`${id}/${tier}: missing albedo`);
        continue;
      }
      albedoPaths.add(channels.albedo.path);
      for (const [channelName, metadata] of Object.entries(channels)) {
        for (const field of requiredFields) {
          if (!metadata?.[field]) errors.push(`${id}/${tier}/${channelName}: missing ${field}`);
        }
        if (metadata?.id !== id || metadata?.tier !== tier || metadata?.channel !== channelName) {
          errors.push(`${id}/${tier}/${channelName}: identity metadata mismatch`);
        }
      }
    }
    if (albedoPaths.size !== TIERS.length) errors.push(`${id}: albedo tier paths are not independent`);
    if (ROCKY_PLANETS.has(id)) {
      for (const tier of TIERS) {
        if (!entry[tier]?.roughness) errors.push(`${id}/${tier}: missing roughness`);
        if (!entry[tier]?.bump) errors.push(`${id}/${tier}: missing bump`);
      }
    } else {
      for (const tier of TIERS) {
        if (entry[tier]?.bump) errors.push(`${id}/${tier}: gas or ice giant exposes rocky bump`);
      }
    }
  }
  return errors;
}

