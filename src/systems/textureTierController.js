import { chooseTextureTier } from './materialSystem.js';

export function chooseBulkTextureTier({ quality, coarsePointer, deviceMemory }) {
  const requested = chooseTextureTier({ quality, coarsePointer, deviceMemory });
  return requested === 'high' ? 'medium' : requested;
}

export function createTextureTierController({
  materialSystem,
  planetIds,
  quality = 'medium',
  coarsePointer = false,
  deviceMemory,
  applyBundle = () => {},
} = {}) {
  const ids = Object.freeze([...(planetIds || [])]);
  const planetSet = new Set(ids);
  const pendingHigh = new Map();
  let currentQuality = quality;
  let currentBulkTier = chooseBulkTextureTier({ quality, coarsePointer, deviceMemory });

  function applyCurrent(id, bundle) {
    if (bundle && bundle === materialSystem.getMaterialBundle(id)) applyBundle(id, bundle);
    return bundle;
  }

  async function loadInitial() {
    return Promise.all(ids.map(async (id) => (
      applyCurrent(id, await materialSystem.loadBody(id, currentBulkTier))
    )));
  }

  async function setQuality(nextQuality) {
    const previousQuality = currentQuality;
    currentQuality = nextQuality;
    const nextBulkTier = chooseBulkTextureTier({
      quality: nextQuality,
      coarsePointer,
      deviceMemory,
    });
    const mustReconcile = nextBulkTier !== currentBulkTier
      || (previousQuality === 'high' && nextQuality !== 'high');
    currentBulkTier = nextBulkTier;
    if (!mustReconcile) return [];

    const jobs = ids.map(async (id) => {
      const current = materialSystem.getMaterialBundle(id);
      if (current?.tier === currentBulkTier && !pendingHigh.has(id)) return current;
      return applyCurrent(id, await materialSystem.upgradeBody(id, currentBulkTier));
    });
    return Promise.all(jobs);
  }

  function focusPlanet(id) {
    if (currentQuality !== 'high' || !planetSet.has(id)) return Promise.resolve(null);
    const current = materialSystem.getMaterialBundle(id);
    if (current?.tier === 'high') return Promise.resolve(current);
    if (pendingHigh.has(id)) return pendingHigh.get(id);

    const operation = Promise.resolve(materialSystem.upgradeBody(id, 'high'))
      .then((bundle) => {
        if (currentQuality !== 'high') return materialSystem.getMaterialBundle(id) || null;
        return applyCurrent(id, bundle);
      })
      .finally(() => {
        if (pendingHigh.get(id) === operation) pendingHigh.delete(id);
      });
    pendingHigh.set(id, operation);
    return operation;
  }

  return {
    loadInitial,
    setQuality,
    focusPlanet,
    get quality() {
      return currentQuality;
    },
    get bulkTier() {
      return currentBulkTier;
    },
  };
}
