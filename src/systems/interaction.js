import * as THREE from 'three';
import { hasPointerMoved } from './presentationState.js';

export function createInteraction({
  canvas,
  camera,
  solarSystem,
  onHover,
  onHoverEnd,
  onSelect,
}) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(2, 2);
  let enabled = true;
  let pointerPending = false;
  let hoveredId = null;
  let pointerDown = null;
  let moved = false;
  let lastClient = { x: 0, y: 0 };
  const activePointers = new Set();

  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    lastClient = { x: event.clientX, y: event.clientY };
    pointerPending = true;
  }

  function handlePointerMove(event) {
    if (!enabled) return;
    if (pointerDown?.id === event.pointerId) {
      moved ||= hasPointerMoved(pointerDown, { x: event.clientX, y: event.clientY });
    }
    if (event.pointerType === 'touch') return;
    updatePointer(event);
  }

  function handlePointerDown(event) {
    activePointers.add(event.pointerId);
    if (activePointers.size === 1) {
      pointerDown = { id: event.pointerId, x: event.clientX, y: event.clientY };
      moved = false;
    } else {
      moved = true;
    }
  }

  function getHit() {
    raycaster.setFromCamera(pointer, camera);
    const intersections = raycaster.intersectObjects(solarSystem.interactiveMeshes, false);
    return intersections[0]?.object || null;
  }

  function handlePointerUp(event) {
    activePointers.delete(event.pointerId);
    const isPrimaryTap = pointerDown?.id === event.pointerId && !moved && activePointers.size === 0;
    if (!enabled || !isPrimaryTap) {
      pointerDown = null;
      return;
    }
    updatePointer(event);
    const hit = getHit();
    const id = hit?.userData?.bodyId;
    if (id) onSelect?.(id);
    pointerDown = null;
  }

  function handlePointerCancel(event) {
    activePointers.delete(event.pointerId);
    pointerDown = null;
    moved = true;
  }

  function clearHover() {
    if (!hoveredId) return;
    hoveredId = null;
    solarSystem.setHovered(null);
    canvas.classList.remove('is-hovering');
    onHoverEnd?.();
  }

  function handlePointerLeave() {
    pointer.set(2, 2);
    pointerPending = false;
    pointerDown = null;
    activePointers.clear();
    clearHover();
  }

  function update() {
    if (!enabled || !pointerPending) return;
    pointerPending = false;
    const hit = getHit();
    const id = hit?.userData?.bodyId || null;
    if (id === hoveredId) {
      if (id) onHover?.(id, lastClient);
      return;
    }
    hoveredId = id;
    solarSystem.setHovered(id);
    canvas.classList.toggle('is-hovering', Boolean(id));
    if (id) onHover?.(id, lastClient);
    else onHoverEnd?.();
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (!enabled) clearHover();
  }

  canvas.addEventListener('pointermove', handlePointerMove, { passive: true });
  canvas.addEventListener('pointerdown', handlePointerDown, { passive: true });
  canvas.addEventListener('pointerup', handlePointerUp, { passive: true });
  canvas.addEventListener('pointercancel', handlePointerCancel, { passive: true });
  canvas.addEventListener('pointerleave', handlePointerLeave, { passive: true });

  function dispose() {
    canvas.removeEventListener('pointermove', handlePointerMove);
    canvas.removeEventListener('pointerdown', handlePointerDown);
    canvas.removeEventListener('pointerup', handlePointerUp);
    canvas.removeEventListener('pointercancel', handlePointerCancel);
    canvas.removeEventListener('pointerleave', handlePointerLeave);
  }

  return {
    update,
    setEnabled,
    dispose,
  };
}
