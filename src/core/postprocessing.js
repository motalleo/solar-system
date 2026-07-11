import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createPostprocessingRuntime } from './postprocessingRuntime.js';

export function createPostprocessing(renderer, scene, camera, quality = 'medium') {
  const coarsePointer = matchMedia('(pointer: coarse)').matches;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return createPostprocessingRuntime(renderer, scene, camera, quality, {
    EffectComposer,
    RenderPass,
    UnrealBloomPass,
    BokehPass,
    OutputPass,
    Vector2: THREE.Vector2,
    getViewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
    capabilities: { coarsePointer, reducedMotion },
  });
}
