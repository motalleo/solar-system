import * as THREE from 'three';

const DEFAULT_CONFIG = Object.freeze({
  rayleighColor: 0x63b3e6,
  mieColor: 0xffb16b,
  density: 0.5,
  terminatorWidth: 0.2,
  sunsetStrength: 0.55,
});

export function createAtmosphereMaterial(config = {}) {
  const settings = { ...DEFAULT_CONFIG, ...config };
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
      uRayleighColor: { value: new THREE.Color(settings.rayleighColor) },
      uMieColor: { value: new THREE.Color(settings.mieColor) },
      uDensity: { value: settings.density },
      uTerminatorWidth: { value: settings.terminatorWidth },
      uSunsetStrength: { value: settings.sunsetStrength },
      uDim: { value: 1 },
      uHighlight: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      uniform vec3 uSunDirection;
      uniform vec3 uRayleighColor;
      uniform vec3 uMieColor;
      uniform float uDensity;
      uniform float uTerminatorWidth;
      uniform float uSunsetStrength;
      uniform float uDim;
      uniform float uHighlight;

      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 sunDirection = normalize(uSunDirection);
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);

        float sunIncidence = dot(normal, sunDirection);
        float daylight = smoothstep(-uTerminatorWidth, uTerminatorWidth, sunIncidence);
        float sunsetBand = 1.0 - smoothstep(
          0.0,
          uTerminatorWidth,
          abs(sunIncidence)
        );
        float backlitEdge = smoothstep(-0.55, 0.08, -sunIncidence);
        float fresnel = pow(
          1.0 - clamp(abs(dot(normal, viewDirection)), 0.0, 1.0),
          2.35
        );

        vec3 daylightScattering = uRayleighColor * mix(0.08, 1.0, daylight);
        vec3 sunsetScattering = uMieColor * sunsetBand * uSunsetStrength;
        vec3 backScattering = mix(uRayleighColor, uMieColor, 0.42)
          * backlitEdge
          * 0.34;
        vec3 scattering = daylightScattering + sunsetScattering + backScattering;
        float illuminatedDensity = mix(0.24, 1.0, daylight)
          + sunsetBand * uSunsetStrength * 0.5
          + backlitEdge * 0.18;
        float alpha = fresnel
          * uDensity
          * illuminatedDensity
          * (1.0 + uHighlight * 0.28)
          * uDim;

        gl_FragColor = vec4(scattering * (1.0 + uHighlight * 0.14), alpha);
      }
    `,
  });
}
