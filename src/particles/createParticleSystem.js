import * as THREE from "three";
import { PERFORMANCE, getCappedPixelRatio } from "../config.js";

const LAYER_TEMPLATES = [
  { weight: 0.3333333333, size: 1.2, depth: -18, twinkle: 5 },
  { weight: 0.3666666667, size: 1.0, depth: -28, twinkle: 3.5 },
  { weight: 0.3, size: 0.9, depth: -40, twinkle: 2.5 }
];
const LAYERS = resolveLayerConfig(PERFORMANCE.STAR_COUNT);

const STAR_COLOR = new THREE.Color("#c7d8ff");
const STARFIELD_BOUNDS = { x: 42, y: 24, z: 8 };
const PARTICLE_FOG_NEAR = 16;
const PARTICLE_FOG_FAR = 54;
const PARTICLE_FOG_MIN_ALPHA = 0.36;
const TIME_UNIFORM_UPDATE_INTERVAL_SECONDS = 0.033;

function resolveLayerConfig(totalStars) {
  const resolved = [];
  let allocated = 0;

  for (let i = 0; i < LAYER_TEMPLATES.length; i += 1) {
    const template = LAYER_TEMPLATES[i];
    const isLast = i === LAYER_TEMPLATES.length - 1;
    const count = isLast
      ? Math.max(totalStars - allocated, 1)
      : Math.max(Math.round(totalStars * template.weight), 1);
    allocated += count;
    resolved.push({
      count,
      size: template.size,
      depth: template.depth,
      twinkle: template.twinkle
    });
  }

  return resolved;
}

/**
 * Creates a minimal multi-layer starfield using THREE.Points.
 * The effect is intentionally subtle and stays in the distant background.
 */
export function createParticleSystem(scene) {
  const layers = [];
  let elapsedTime = 0;
  let uniformUpdateAccumulator = 0;

  function createLayer(config, index) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(config.count * 3);
    const twinkleOffsets = new Float32Array(config.count);

    for (let i = 0; i < config.count; i += 1) {
      const base = i * 3;
      positions[base] = (Math.random() - 0.5) * STARFIELD_BOUNDS.x;
      positions[base + 1] = (Math.random() - 0.5) * STARFIELD_BOUNDS.y;
      positions[base + 2] = config.depth + (Math.random() - 0.5) * STARFIELD_BOUNDS.z;
      twinkleOffsets[i] = Math.random() * Math.PI * 2;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aTwinkleOffset", new THREE.BufferAttribute(twinkleOffsets, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: getCappedPixelRatio() },
        uSize: { value: config.size },
        uColor: { value: STAR_COLOR },
        uTwinkleStrength: { value: config.twinkle },
        uFogNear: { value: PARTICLE_FOG_NEAR },
        uFogFar: { value: PARTICLE_FOG_FAR },
        uFogMinAlpha: { value: PARTICLE_FOG_MIN_ALPHA }
      },
      vertexShader: `
        attribute float aTwinkleOffset;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uSize;
        uniform float uTwinkleStrength;
        uniform float uFogNear;
        uniform float uFogFar;
        uniform float uFogMinAlpha;
        varying float vAlpha;

        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = uSize * uPixelRatio;

          float twinkle = 0.92 + sin(uTime * 0.004 + aTwinkleOffset) * uTwinkleStrength * 0.01;
          float fogFactor = clamp((-mvPosition.z - uFogNear) / max(uFogFar - uFogNear, 0.0001), 0.0, 1.0);
          float depthAlpha = mix(1.0, uFogMinAlpha, fogFactor);
          vAlpha = clamp(twinkle, 0.15, 1.0) * depthAlpha;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;

        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float falloff = smoothstep(0.5, 0.0, length(uv));
          gl_FragColor = vec4(uColor, vAlpha * falloff * 0.85);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const points = new THREE.Points(geometry, material);
    points.renderOrder = -10 - index;
    points.position.z = -2;
    scene.add(points);

    return {
      points,
      geometry,
      material
    };
  }

  function init() {
    for (let i = 0; i < LAYERS.length; i += 1) {
      layers.push(createLayer(LAYERS[i], i));
    }
  }

  function update(dt = 0) {
    elapsedTime += dt;
    uniformUpdateAccumulator += dt;

    if (uniformUpdateAccumulator < TIME_UNIFORM_UPDATE_INTERVAL_SECONDS) {
      return;
    }

    uniformUpdateAccumulator = 0;

    for (const layer of layers) {
      layer.material.uniforms.uTime.value = elapsedTime;
    }
  }

  function handleResize() {
    const pixelRatio = getCappedPixelRatio();

    for (const layer of layers) {
      layer.material.uniforms.uPixelRatio.value = pixelRatio;
    }
  }

  function dispose() {
    for (const layer of layers) {
      scene.remove(layer.points);
      layer.geometry.dispose();
      layer.material.dispose();
    }
    layers.length = 0;
  }

  return { init, update, handleResize, dispose };
}
