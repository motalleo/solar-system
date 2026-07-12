const CORE_CACHE = 'solar-core-v3';
const TEXTURE_CACHE = 'solar-textures-v1';
const AUDIO_CACHE = 'solar-audio-v1';
const CACHE_PREFIX = 'solar-';
const BASE_URL = new URL('./', self.location);
const APP_SHELL_URL = new URL('./index.html', BASE_URL).href;

const CORE_ASSETS = [
  './index.html',
  './style.css',
  './main.js',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './src/core/postprocessing.js',
  './src/core/postprocessingRuntime.js',
  './src/core/scene.js',
  './src/data/celestialBodies.js',
  './src/data/orbitalElements.js',
  './src/data/satellites.js',
  './src/data/textureManifest.js',
  './src/pwa/pwaLifecycle.js',
  './src/runtime/runtimeLifecycle.js',
  './src/shaders/atmosphereShader.js',
  './src/shaders/coronaShader.js',
  './src/systems/asteroidBelt.js',
  './src/systems/cameraDirector.js',
  './src/systems/coronaSystem.js',
  './src/systems/diagnostics.js',
  './src/systems/ephemerisSystem.js',
  './src/systems/interaction.js',
  './src/systems/materialSystem.js',
  './src/systems/performance.js',
  './src/systems/presentationState.js',
  './src/systems/satelliteSystem.js',
  './src/systems/solarSystem.js',
  './src/systems/spatialAudio.js',
  './src/systems/starfield.js',
  './src/systems/timeSystem.js',
  './src/systems/textureTierController.js',
  './src/ui/interface.js',
  './vendor/three/three.core.js',
  './vendor/three/three.module.js',
  './vendor/three/addons/controls/OrbitControls.js',
  './vendor/three/addons/postprocessing/BokehPass.js',
  './vendor/three/addons/postprocessing/EffectComposer.js',
  './vendor/three/addons/postprocessing/MaskPass.js',
  './vendor/three/addons/postprocessing/OutputPass.js',
  './vendor/three/addons/postprocessing/Pass.js',
  './vendor/three/addons/postprocessing/RenderPass.js',
  './vendor/three/addons/postprocessing/ShaderPass.js',
  './vendor/three/addons/postprocessing/UnrealBloomPass.js',
  './vendor/three/addons/shaders/BokehShader.js',
  './vendor/three/addons/shaders/CopyShader.js',
  './vendor/three/addons/shaders/LuminosityHighPassShader.js',
  './vendor/three/addons/shaders/OutputShader.js',
  './vendor/gsap/gsap.min.js',
];

const OPTIONAL_TEXTURES = [
  './assets/textures/sun.jpg',
  './assets/textures/mercury.jpg',
  './assets/textures/venus.jpg',
  './assets/textures/venus_atmosphere.jpg',
  './assets/textures/earth_day.jpg',
  './assets/textures/earth_night.jpg',
  './assets/textures/earth_clouds.jpg',
  './assets/textures/moon.jpg',
  './assets/textures/mars.jpg',
  './assets/textures/jupiter.jpg',
  './assets/textures/saturn.jpg',
  './assets/textures/saturn_ring.png',
  './assets/textures/uranus.jpg',
  './assets/textures/low/earth_albedo.jpg',
  './assets/textures/low/earth_bump.jpg',
  './assets/textures/low/earth_clouds.jpg',
  './assets/textures/low/earth_night.jpg',
  './assets/textures/low/earth_normal.jpg',
  './assets/textures/low/earth_roughness.jpg',
  './assets/textures/low/earth_specular.jpg',
  './assets/textures/low/jupiter_albedo.jpg',
  './assets/textures/low/mars_albedo.jpg',
  './assets/textures/low/mars_bump.jpg',
  './assets/textures/low/mars_roughness.jpg',
  './assets/textures/low/mercury_albedo.jpg',
  './assets/textures/low/mercury_bump.jpg',
  './assets/textures/low/mercury_roughness.jpg',
  './assets/textures/low/neptune_albedo.jpg',
  './assets/textures/low/saturn_albedo.jpg',
  './assets/textures/low/uranus_albedo.jpg',
  './assets/textures/low/venus_albedo.jpg',
  './assets/textures/low/venus_bump.jpg',
  './assets/textures/low/venus_roughness.jpg',
];

// Music is deliberately cached after the visitor enables sound, not during app installation.
// This keeps the first mobile PWA install quick while preserving offline replay after one listen.
const OPTIONAL_AUDIO = [
  './assets/audio/deep-space-original.mp3',
];

function resolveAsset(asset) {
  return new URL(asset, BASE_URL).href;
}

const CORE_URLS = new Set(CORE_ASSETS.map(resolveAsset));

function isInScope(url) {
  return url.origin === BASE_URL.origin && url.pathname.startsWith(BASE_URL.pathname);
}

function coreCacheKey(url) {
  if (!isInScope(url)) return null;
  const canonical = new URL(url.href);
  canonical.search = '';
  canonical.hash = '';
  return CORE_URLS.has(canonical.href) ? canonical.href : null;
}

async function notifyClients(type) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  windows.forEach((client) => client.postMessage({ type }));
}

async function cacheOptionalTexture(cache, asset) {
  const request = new Request(resolveAsset(asset), { cache: 'reload' });
  const response = await fetch(request);
  if (!response.ok) throw new Error(`Texture ${asset} returned ${response.status}`);
  await cache.put(request, response);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const coreCache = await caches.open(CORE_CACHE);
    await coreCache.addAll(CORE_ASSETS.map(resolveAsset));
    const textureCache = await caches.open(TEXTURE_CACHE);
    await Promise.allSettled(OPTIONAL_TEXTURES.map((asset) => cacheOptionalTexture(textureCache, asset)));
    await notifyClients('OFFLINE_READY');
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const currentCaches = new Set([CORE_CACHE, TEXTURE_CACHE, AUDIO_CACHE]);
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith(CACHE_PREFIX) && !currentCaches.has(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
    await notifyClients('OFFLINE_READY');
  })());
});

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(CORE_CACHE);
    return cache.match(APP_SHELL_URL);
  }
}

async function coreCacheFirst(request, cacheKey) {
  const cache = await caches.open(CORE_CACHE);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const response = await fetch(cacheKey);
  if (response.ok) await cache.put(cacheKey, response.clone());
  return response;
}

function isTieredTexture(url) {
  return /\/assets\/textures\/(?:medium|high)\//.test(url.pathname);
}

function isPackagedTexture(url) {
  return url.origin === self.location.origin
    && url.pathname.startsWith(new URL('./assets/textures/', BASE_URL).pathname);
}

function isPackagedAudio(url) {
  return url.origin === self.location.origin
    && url.pathname.startsWith(new URL('./assets/audio/', BASE_URL).pathname);
}

async function textureCacheFirst(event) {
  const { request } = event;
  const cache = await caches.open(TEXTURE_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    if (isTieredTexture(new URL(request.url))) {
      const refresh = fetch(request).then(async (response) => {
        if (response.ok) await cache.put(request, response.clone());
        return response;
      });
      event.waitUntil(refresh.catch(() => undefined));
    }
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function audioCacheFirst(event) {
  const { request } = event;
  // Native media elements request MP3 data in byte ranges. Do not store or replay
  // a partial response as if it were the complete audio file.
  if (request.headers?.has?.('range')) return fetch(request);
  const cache = await caches.open(AUDIO_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!isInScope(url)) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  const cacheKey = coreCacheKey(url);
  if (cacheKey) {
    event.respondWith(coreCacheFirst(request, cacheKey));
    return;
  }
  if (isPackagedTexture(url)) {
    event.respondWith(textureCacheFirst(event));
    return;
  }
  if (isPackagedAudio(url)) {
    event.respondWith(audioCacheFirst(event));
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
