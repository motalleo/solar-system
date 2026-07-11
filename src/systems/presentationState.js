export function getLabelOpacity({ labelsVisible, focused, baseOpacity }) {
  if (!labelsVisible || focused) return 0;
  return baseOpacity;
}

export function hasPointerMoved(start, current, threshold = 5) {
  if (!start || !current) return false;
  return Math.hypot(current.x - start.x, current.y - start.y) > threshold;
}

export function projectOutsideSphere(position, radius, fallback = { x: 1, y: 0, z: 0 }) {
  const distance = Math.hypot(position.x, position.y, position.z);
  if (distance >= radius) return { x: position.x, y: position.y, z: position.z };
  const direction = distance > 1e-8 ? position : fallback;
  const directionLength = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const scale = radius / directionLength;
  return {
    x: direction.x * scale,
    y: direction.y * scale,
    z: direction.z * scale,
  };
}

export function segmentIntersectsSphere(start, end, radius) {
  const direction = {
    x: end.x - start.x,
    y: end.y - start.y,
    z: end.z - start.z,
  };
  const lengthSquared = direction.x ** 2 + direction.y ** 2 + direction.z ** 2;
  if (lengthSquared === 0) {
    return start.x ** 2 + start.y ** 2 + start.z ** 2 < radius ** 2;
  }
  const projection = Math.max(0, Math.min(1, -(
    start.x * direction.x + start.y * direction.y + start.z * direction.z
  ) / lengthSquared));
  const closest = {
    x: start.x + direction.x * projection,
    y: start.y + direction.y * projection,
    z: start.z + direction.z * projection,
  };
  return closest.x ** 2 + closest.y ** 2 + closest.z ** 2 < radius ** 2;
}
