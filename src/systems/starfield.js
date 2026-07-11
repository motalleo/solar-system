import * as THREE from 'three';

const QUALITY_COUNTS = {
  low: [2200, 900, 360],
  medium: [5200, 1900, 720],
  high: [9000, 3400, 1300],
};

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createStarTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.08, 'rgba(225,240,248,.96)');
  gradient.addColorStop(0.28, 'rgba(159,205,228,.35)');
  gradient.addColorStop(1, 'rgba(80,120,150,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLayer({ count, inner, outer, size, color, opacity, seed, texture }) {
  const random = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color(color);
  const warm = new THREE.Color(0xffd2b1);
  const cold = new THREE.Color(0xaad8ff);

  for (let index = 0; index < count; index += 1) {
    const radius = Math.cbrt(
      random() * (outer ** 3 - inner ** 3) + inner ** 3,
    );
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.cos(phi);
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

    const starColor = base.clone();
    const shift = random();
    if (shift > 0.965) starColor.lerp(warm, 0.5);
    else if (shift < 0.045) starColor.lerp(cold, 0.54);
    const luminance = 0.55 + random() * 0.45;
    colors[index * 3] = starColor.r * luminance;
    colors[index * 3 + 1] = starColor.g * luminance;
    colors[index * 3 + 2] = starColor.b * luminance;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    map: texture,
    color: 0xffffff,
    vertexColors: true,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity,
    alphaTest: 0.025,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

function createDust(count, seed = 4812) {
  const random = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const radius = 250 + random() * 760;
    const angle = random() * Math.PI * 2;
    const spread = (random() - 0.5) * 190;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = spread * 0.32 + Math.sin(angle * 2.3) * 30;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
    colors[index * 3] = 0.21 + random() * 0.12;
    colors[index * 3 + 1] = 0.32 + random() * 0.15;
    colors[index * 3 + 2] = 0.43 + random() * 0.18;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 1.6,
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geometry, material);
}

function createNebulaShell() {
  const geometry = new THREE.SphereGeometry(1550, 32, 24);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.11 },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDirection;
      uniform float uTime;
      uniform float uOpacity;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }

      void main() {
        vec3 direction = normalize(vDirection);
        float band = pow(max(0.0, 1.0 - abs(direction.y + sin(direction.x * 4.0) * 0.08)), 8.0);
        float detail = noise(direction * 6.0 + vec3(uTime * 0.002, 0.0, 0.0));
        float alpha = band * smoothstep(0.32, 0.78, detail) * uOpacity;
        vec3 color = mix(vec3(0.05, 0.10, 0.15), vec3(0.22, 0.34, 0.43), detail);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  return new THREE.Mesh(geometry, material);
}

export function createStarfield(scene, quality = 'medium') {
  const group = new THREE.Group();
  group.name = 'starfield';
  scene.add(group);

  const texture = createStarTexture();
  const nebula = createNebulaShell();
  group.add(nebula);

  let layers = [];
  let dust = null;
  let currentQuality = quality;

  function clearParticles() {
    for (const points of layers) {
      group.remove(points);
      points.geometry.dispose();
      points.material.dispose();
    }
    layers = [];
    if (dust) {
      group.remove(dust);
      dust.geometry.dispose();
      dust.material.dispose();
      dust = null;
    }
  }

  function build(nextQuality) {
    clearParticles();
    currentQuality = QUALITY_COUNTS[nextQuality] ? nextQuality : 'medium';
    const counts = QUALITY_COUNTS[currentQuality];
    layers = [
      createLayer({ count: counts[0], inner: 480, outer: 1500, size: 2.15, color: 0xbdd3df, opacity: 0.72, seed: 1421, texture }),
      createLayer({ count: counts[1], inner: 260, outer: 820, size: 1.55, color: 0xe8f2f4, opacity: 0.78, seed: 9427, texture }),
      createLayer({ count: counts[2], inner: 120, outer: 480, size: 1.1, color: 0x9fbfd0, opacity: 0.66, seed: 7201, texture }),
    ];
    layers.forEach((layer) => group.add(layer));
    dust = createDust(Math.floor(counts[1] * 0.62));
    group.add(dust);
  }

  function update(camera, elapsed) {
    if (!camera) return;
    layers.forEach((layer, index) => {
      const factor = [0.94, 0.86, 0.76][index];
      layer.position.set(
        camera.position.x * factor,
        camera.position.y * factor,
        camera.position.z * factor,
      );
      layer.rotation.y = elapsed * (0.00012 + index * 0.00004);
    });
    if (dust) {
      dust.position.copy(camera.position).multiplyScalar(0.72);
      dust.rotation.y = elapsed * 0.00028;
    }
    nebula.material.uniforms.uTime.value = elapsed;
    nebula.position.copy(camera.position);
  }

  function setQuality(nextQuality) {
    if (nextQuality !== currentQuality) build(nextQuality);
  }

  function dispose() {
    clearParticles();
    nebula.geometry.dispose();
    nebula.material.dispose();
    texture.dispose();
    scene.remove(group);
  }

  build(quality);

  return {
    group,
    update,
    setQuality,
    dispose,
  };
}
