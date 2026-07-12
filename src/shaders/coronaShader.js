const SUN_SURFACE_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormalView;

  void main() {
    vUv = uv;
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SUN_SURFACE_FRAGMENT_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormalView;
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uDim;
  uniform float uOctaves;
  uniform float uSpotStrength;

  float hash21(vec2 point) {
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + 45.32);
    return fract(point.x * point.y);
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    float a = hash21(cell);
    float b = hash21(cell + vec2(1.0, 0.0));
    float c = hash21(cell + vec2(0.0, 1.0));
    float d = hash21(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
  }

  float surfaceNoise(vec2 point) {
    float value = 0.0;
    float amplitude = 0.56;
    for (int octave = 0; octave < 4; octave += 1) {
      if (float(octave) >= uOctaves) break;
      value += noise(point) * amplitude;
      point = point * 2.07 + vec2(17.3, 9.2);
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    float latitude = abs(vUv.y - 0.5) * 2.0;
    float differentialRotation = mix(0.0044, 0.0022, latitude * latitude);
    vec2 movingUv = vUv + vec2(
      uTime * differentialRotation,
      sin(vUv.x * 12.0 + uTime * 0.16) * 0.0024
    );
    vec3 base = texture2D(uMap, movingUv).rgb;
    float granulation = surfaceNoise(vUv * vec2(34.0, 17.0) + vec2(uTime * 0.055, -uTime * 0.034));
    float fineCells = noise(vUv * vec2(91.0, 45.5) - vec2(uTime * 0.018, uTime * 0.025));
    float spotField = noise(vUv * vec2(19.0, 10.0) + vec2(uTime * 0.004, -uTime * 0.001));
    spotField += noise(vUv * vec2(47.0, 23.0) - vec2(uTime * 0.007, uTime * 0.002)) * 0.34;
    float sunspotMask = smoothstep(0.98, 1.20, spotField)
      * smoothstep(0.98, 0.24, latitude);
    float limb = pow(1.0 - abs(vNormalView.z), 2.15);
    vec3 warm = mix(vec3(1.0, 0.22, 0.008), vec3(1.0, 0.9, 0.42), granulation);
    vec3 color = mix(base, warm, 0.26 + fineCells * 0.18);
    color += (granulation - 0.42) * vec3(0.68, 0.18, 0.015);
    color = mix(color, color * vec3(0.26, 0.17, 0.12), sunspotMask * uSpotStrength);
    color += limb * vec3(0.92, 0.2, 0.008) * 0.38;
    gl_FragColor = vec4(color * (1.2 + uIntensity * 0.2) * uDim, 1.0);
  }
`;

export const CORONA_VERTEX_SHADER = `
  varying vec3 vWorldNormal;
  varying vec3 vObjectPosition;

  void main() {
    vObjectPosition = position;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function coronaFragmentShader(octaves) {
  return `
    #define CORONA_OCTAVES ${octaves}
    varying vec3 vWorldNormal;
    varying vec3 vObjectPosition;
    uniform float uTime;
    uniform float uNoiseScale;
    uniform vec2 uFlow;
    uniform float uIntensity;
    uniform vec3 uCameraDirection;

    float hash31(vec3 point) {
      point = fract(point * 0.1031);
      point += dot(point, point.yzx + 33.33);
      return fract((point.x + point.y) * point.z);
    }

    float noise(vec3 point) {
      vec3 cell = floor(point);
      vec3 local = fract(point);
      local = local * local * (3.0 - 2.0 * local);
      return mix(
        mix(
          mix(hash31(cell), hash31(cell + vec3(1.0, 0.0, 0.0)), local.x),
          mix(hash31(cell + vec3(0.0, 1.0, 0.0)), hash31(cell + vec3(1.0, 1.0, 0.0)), local.x),
          local.y
        ),
        mix(
          mix(hash31(cell + vec3(0.0, 0.0, 1.0)), hash31(cell + vec3(1.0, 0.0, 1.0)), local.x),
          mix(hash31(cell + vec3(0.0, 1.0, 1.0)), hash31(cell + vec3(1.0, 1.0, 1.0)), local.x),
          local.y
        ),
        local.z
      );
    }

    float radialNoise(vec3 point) {
      float value = 0.0;
      float amplitude = 0.58;
      for (int octave = 0; octave < CORONA_OCTAVES; octave += 1) {
        value += noise(point) * amplitude;
        point = point * 2.03 + vec3(7.1, 11.7, 5.3);
        amplitude *= 0.5;
      }
      return value;
    }

    void main() {
      vec3 radial = normalize(vObjectPosition);
      vec3 flow = vec3(uFlow * uTime, uTime * 0.047);
      float filaments = radialNoise(radial * uNoiseScale + flow);
      float rays = pow(abs(sin(atan(radial.y, radial.x) * 13.0 + filaments * 5.0)), 3.0);
      float fresnel = pow(1.0 - abs(dot(normalize(vWorldNormal), normalize(uCameraDirection))), 2.4);
      float edge = smoothstep(0.08, 0.92, fresnel);
      float energy = (0.28 + filaments * 0.92 + rays * 0.24) * edge * uIntensity;
      vec3 color = mix(vec3(1.0, 0.18, 0.018), vec3(1.0, 0.72, 0.22), filaments);
      gl_FragColor = vec4(color * energy, energy * 0.46);
    }
  `;
}

export function createSunSurfaceMaterial(three, texture, quality = 'medium') {
  const octaveByQuality = { ultra: 4, high: 4, medium: 3, low: 1 };
  const spotStrengthByQuality = { ultra: 0.42, high: 0.34, medium: 0.22, low: 0.08 };
  return new three.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uDim: { value: 1 },
      uOctaves: { value: octaveByQuality[quality] || octaveByQuality.medium },
      uSpotStrength: { value: spotStrengthByQuality[quality] || spotStrengthByQuality.medium },
    },
    vertexShader: SUN_SURFACE_VERTEX_SHADER,
    fragmentShader: SUN_SURFACE_FRAGMENT_SHADER,
  });
}

export function createCoronaMaterial(three, { octaves = 3, intensity = 1 } = {}) {
  const safeOctaves = Math.max(1, Math.min(4, Math.round(octaves)));
  return new three.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: three.BackSide,
    blending: three.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uNoiseScale: { value: 3.8 },
      uFlow: { value: new three.Vector2(0.035, -0.022) },
      uIntensity: { value: intensity },
      uCameraDirection: { value: new three.Vector3(0, 0, 1) },
    },
    vertexShader: CORONA_VERTEX_SHADER,
    fragmentShader: coronaFragmentShader(safeOctaves),
  });
}
