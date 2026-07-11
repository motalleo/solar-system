const ALLOWED_MULTIPLIERS = new Set([0.5, 1, 5, 20, 100]);

export function createTimeSystem() {
  let elapsed = 0;
  let multiplier = 1;
  let paused = false;

  function tick(realDelta) {
    if (paused || !Number.isFinite(realDelta) || realDelta <= 0) return 0;
    const safeDelta = Math.min(realDelta, 0.25);
    const simulationDelta = safeDelta * multiplier;
    elapsed += simulationDelta;
    return simulationDelta;
  }

  function setMultiplier(value) {
    const next = Number(value);
    multiplier = ALLOWED_MULTIPLIERS.has(next) ? next : 1;
    return multiplier;
  }

  function setPaused(value) {
    paused = Boolean(value);
    return paused;
  }

  function toggle() {
    paused = !paused;
    return paused;
  }

  function reset() {
    elapsed = 0;
    multiplier = 1;
    paused = false;
  }

  return {
    tick,
    setMultiplier,
    setPaused,
    toggle,
    reset,
    get elapsed() {
      return elapsed;
    },
    get multiplier() {
      return multiplier;
    },
    get highSpeed() {
      return multiplier > 1;
    },
    get paused() {
      return paused;
    },
  };
}
