import { TEXTURE_MANIFEST } from '../data/textureManifest.js';

const TIERS = new Set(['low', 'medium', 'high', 'ultra']);
const ROCKY_PLANETS = new Set(['mercury', 'venus', 'earth', 'mars']);
const GAS_PLANETS = new Set(['jupiter', 'saturn', 'uranus', 'neptune']);
const COLOR_CHANNELS = new Set(['albedo', 'night']);

export function chooseTextureTier({ quality, coarsePointer = false, deviceMemory } = {}) {
  const requested = TIERS.has(quality) ? quality : 'medium';
  const memory = Number.isFinite(deviceMemory) ? deviceMemory : 8;
  if (memory <= 2) return 'low';
  return requested === 'ultra' ? 'high' : requested;
}

function disposeBundle(bundle) {
  if (!bundle) return;
  const textures = new Set(Object.values(bundle.textures || {}));
  for (const texture of textures) texture?.dispose?.();
  bundle.material?.dispose?.();
}

function addGasBandMotion(material) {
  material.userData ||= {};
  material.userData.gasBandMotion = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBandTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGasObjectPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGasObjectPosition = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGasObjectPosition;\nuniform float uBandTime;')
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
         float gasBandWave = sin(vGasObjectPosition.y * 42.0 + uBandTime * 0.16);
         normal = normalize(normal + vec3(gasBandWave * 0.012, cos(vGasObjectPosition.y * 19.0 - uBandTime * 0.11) * 0.004, 0.0));`,
      );
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => 'gas-band-motion-v1';
}

export function createMaterialSystem({
  renderer,
  quality = 'medium',
  onProgress,
  onFallback,
  three = globalThis.THREE,
  textureLoader,
} = {}) {
  if (!three?.TextureLoader || !three?.MeshStandardMaterial) {
    throw new TypeError('createMaterialSystem requires a Three.js namespace');
  }

  const loader = textureLoader || new three.TextureLoader();
  const bundles = new Map();
  const pendingGeneration = new Map();
  const maxAnisotropy = Math.min(
    renderer?.capabilities?.getMaxAnisotropy?.() || 4,
    8,
  );
  let completed = 0;
  let disposed = false;

  async function loadChannel(metadata) {
    try {
      const texture = await loader.loadAsync(metadata.path);
      texture.colorSpace = COLOR_CHANNELS.has(metadata.channel)
        ? three.SRGBColorSpace
        : three.NoColorSpace;
      texture.wrapS = three.RepeatWrapping;
      texture.anisotropy = maxAnisotropy;
      return texture;
    } finally {
      completed += 1;
      onProgress?.(completed, undefined, metadata);
    }
  }

  async function buildBundle(id, tier) {
    const channelManifest = TEXTURE_MANIFEST[id]?.[tier];
    if (!channelManifest) throw new RangeError(`Unknown material tier: ${id}/${tier}`);
    const results = await Promise.allSettled(
      Object.entries(channelManifest).map(async ([channel, metadata]) => [
        channel,
        await loadChannel(metadata),
      ]),
    );
    const failed = results.find((result) => result.status === 'rejected');
    const entries = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
    if (failed) {
      for (const [, texture] of entries) texture?.dispose?.();
      throw failed.reason;
    }
    try {
      const textures = Object.fromEntries(entries);
      const material = id === 'earth'
        ? null
        : new three.MeshStandardMaterial({
          map: textures.albedo,
          roughnessMap: textures.roughness || null,
          bumpMap: textures.bump || null,
          normalMap: textures.normal || null,
          roughness: GAS_PLANETS.has(id) ? 0.76 : 0.9,
          metalness: 0,
          bumpScale: ROCKY_PLANETS.has(id) ? 0.045 : 0,
          transparent: true,
          opacity: 1,
        });
      if (GAS_PLANETS.has(id)) addGasBandMotion(material);
      return {
        id,
        tier,
        textures,
        material,
        update(time) {
          if (material?.userData?.shader?.uniforms?.uBandTime) {
            material.userData.shader.uniforms.uBandTime.value = time;
          }
        },
      };
    } catch (error) {
      for (const [, texture] of entries) texture?.dispose?.();
      throw error;
    }
  }

  async function replaceBody(id, tier) {
    if (disposed) throw new Error('Material system has been disposed');
    const targetTier = TIERS.has(tier) ? tier : chooseTextureTier({ quality });
    const generation = (pendingGeneration.get(id) || 0) + 1;
    pendingGeneration.set(id, generation);
    const previous = bundles.get(id) || null;
    try {
      const next = await buildBundle(id, targetTier);
      if (disposed) {
        disposeBundle(next);
        return null;
      }
      if (pendingGeneration.get(id) !== generation) {
        disposeBundle(next);
        return bundles.get(id) || null;
      }
      bundles.set(id, next);
      disposeBundle(previous);
      return next;
    } catch (error) {
      if (disposed) return null;
      const current = bundles.get(id) || null;
      if (pendingGeneration.get(id) !== generation) return current;
      onFallback?.({ id, tier: targetTier, error, retainedTier: current?.tier || null });
      return current;
    }
  }

  function loadBody(id, tier = chooseTextureTier({ quality })) {
    return replaceBody(id, tier);
  }

  function upgradeBody(id, tier) {
    return replaceBody(id, tier);
  }

  function getMaterialBundle(id) {
    return bundles.get(id) || null;
  }

  function update(time) {
    for (const bundle of bundles.values()) bundle.update(time);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const bundle of bundles.values()) disposeBundle(bundle);
    bundles.clear();
    pendingGeneration.clear();
  }

  return {
    loadBody,
    upgradeBody,
    getMaterialBundle,
    update,
    dispose,
  };
}
