function finiteMetric(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * ratio) - 1));
  return ordered[index];
}

function rounded(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(finiteMetric(value) * factor) / factor;
}

export function createDiagnostics({
  renderer = null,
  sampleSize = 180,
  publishInterval = 500,
  onSnapshot = () => {},
  PerformanceObserverClass = globalThis.PerformanceObserver,
} = {}) {
  const frameTimes = [];
  const milestones = {};
  const longTasks = { count: 0, maxMs: 0 };
  const limit = Math.max(8, Math.floor(finiteMetric(sampleSize, 180)));
  let previousFrameStart = null;
  let frameStart = null;
  let cpuFrameMs = 0;
  let lastPublishedAt = -Infinity;
  let disposed = false;
  let observer = null;

  if (typeof PerformanceObserverClass === 'function') {
    try {
      observer = new PerformanceObserverClass((list) => {
        for (const entry of list.getEntries?.() || []) {
          const duration = finiteMetric(entry?.duration);
          if (duration <= 0) continue;
          longTasks.count += 1;
          longTasks.maxMs = Math.max(longTasks.maxMs, duration);
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch (error) {
      observer = null;
    }
  }

  function mark(name, timestamp) {
    if (!name || disposed) return null;
    const value = finiteMetric(timestamp, performance.now?.() || 0);
    milestones[name] = rounded(value, 2);
    return milestones[name];
  }

  function getRendererInfo() {
    const info = renderer?.info || {};
    return {
      render: {
        calls: finiteMetric(info.render?.calls),
        triangles: finiteMetric(info.render?.triangles),
      },
      memory: {
        geometries: finiteMetric(info.memory?.geometries),
        textures: finiteMetric(info.memory?.textures),
      },
    };
  }

  function snapshot(timestamp = performance.now?.() || 0) {
    const averageFrameMs = frameTimes.length
      ? frameTimes.reduce((total, value) => total + value, 0) / frameTimes.length
      : 0;
    const frameMsP99 = percentile(frameTimes, 0.99);
    const info = getRendererInfo();
    return {
      timestamp: rounded(timestamp, 2),
      fps: averageFrameMs ? rounded(1000 / averageFrameMs) : 0,
      p1Fps: frameMsP99 ? rounded(1000 / frameMsP99) : 0,
      averageFrameMs: rounded(averageFrameMs, 2),
      frameMsP99: rounded(frameMsP99, 2),
      cpuFrameMs: rounded(cpuFrameMs, 2),
      sampleCount: frameTimes.length,
      render: info.render,
      memory: info.memory,
      milestones: { ...milestones },
      longTasks: {
        count: longTasks.count,
        maxMs: rounded(longTasks.maxMs, 2),
      },
    };
  }

  function publish(timestamp) {
    if (disposed || timestamp - lastPublishedAt < publishInterval) return null;
    lastPublishedAt = timestamp;
    const next = snapshot(timestamp);
    onSnapshot(next);
    return next;
  }

  function beginFrame(timestamp = performance.now?.() || 0) {
    if (disposed) return;
    const now = finiteMetric(timestamp);
    if (previousFrameStart !== null) {
      const duration = now - previousFrameStart;
      if (duration > 0 && duration < 1000) {
        frameTimes.push(duration);
        if (frameTimes.length > limit) frameTimes.shift();
      }
    }
    previousFrameStart = now;
    frameStart = now;
  }

  function endFrame(timestamp = performance.now?.() || 0) {
    if (disposed || frameStart === null) return null;
    const now = finiteMetric(timestamp);
    cpuFrameMs = Math.max(0, now - frameStart);
    return publish(now);
  }

  function resetFrames() {
    previousFrameStart = null;
    frameStart = null;
    cpuFrameMs = 0;
    frameTimes.length = 0;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    observer?.disconnect?.();
    observer = null;
    resetFrames();
  }

  return {
    mark,
    beginFrame,
    endFrame,
    snapshot,
    resetFrames,
    dispose,
  };
}
