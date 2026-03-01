import * as THREE from "three";
import { PERFORMANCE } from "../config.js";

export const PAGE_WIDTH = 1.6;
const PAGE_HEIGHT = 0.9;
const WIDTH_SEGMENTS = PERFORMANCE.PAGE_SEGMENTS.width;
const HEIGHT_SEGMENTS = PERFORMANCE.PAGE_SEGMENTS.height;

const vertexShader = `
  uniform float uFlip;
  uniform float uTime;
  uniform float uHalfWidth;

  varying float vEdge;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    float pageWidth = uHalfWidth * 2.0;
    float localX = position.x + uHalfWidth;
    float t = clamp(localX / pageWidth, 0.0, 1.0);
    float spineLockWidth = pageWidth * 0.05;
    float spineMask = smoothstep(spineLockWidth, pageWidth, localX);
    float edgeWeight = smoothstep(0.0, 1.0, t);
    float bend = edgeWeight * clamp(uFlip, 0.0, 1.0) * spineMask;

    float theta = bend * 2.35;

    vec3 pos = position;
    float curl = sin(theta);
    float squeeze = 1.0 - cos(theta);

    // Keep a rigid spine strip so left edge stays welded to the hinge.
    pos.x -= squeeze * 0.18 * spineMask;
    pos.z += curl * (0.24 + 0.22 * edgeWeight) * spineMask;

    // Subtle paper ripple so the sheet reads as flexible, not rigid.
    pos.y += sin((t + uTime * 0.17) * 3.14159265) * 0.01 * bend * spineMask;
    pos.y += sin(position.y * 7.2 + uTime * 0.9) * 0.0035 * bend * spineMask;

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    vEdge = edgeWeight;
    vUv = uv;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = `
  uniform sampler2D uFrontMap;
  uniform vec3 uBaseColor;
  uniform vec3 uWarmColor;
  uniform vec3 uBackColor;
  uniform vec3 uLightDir;
  uniform vec3 uRimColor;

  varying float vEdge;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    if (!gl_FrontFacing) {
      gl_FragColor = vec4(uBackColor, 1.0);
      return;
    }

    vec3 dx = dFdx(vWorldPos);
    vec3 dy = dFdy(vWorldPos);
    vec3 normal = normalize(cross(dx, dy));

    vec3 lightDir = normalize(uLightDir);
    float diffuse = max(dot(normal, lightDir), 0.0);
    float ambient = 0.46;
    float rim = pow(1.0 - max(dot(normal, vec3(0.0, 0.0, 1.0)), 0.0), 2.0);
    float edgeShadow = smoothstep(0.55, 1.0, vEdge) * 0.12;

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 halfDir = normalize(lightDir + viewDir);
    float specular = pow(max(dot(normal, halfDir), 0.0), 20.0) * 0.06;

    vec3 paperColor = mix(uBaseColor, uWarmColor, vEdge * 0.35);
    vec3 frontMapColor = texture2D(uFrontMap, vUv).rgb;
    vec3 mapColor = frontMapColor;

    vec3 surfaceColor = mix(mapColor, paperColor, 0.08);
    float lightMix = ambient + diffuse * 0.54 + specular - edgeShadow;
    vec3 rimContribution = uRimColor * rim * 0.24;

    gl_FragColor = vec4(surfaceColor * lightMix + rimContribution, 1.0);
  }
`;

/**
 * Creates a single high-detail page mesh with shader-driven bending.
 */
export function createPageMesh() {
  const geometry = new THREE.PlaneGeometry(
    PAGE_WIDTH,
    PAGE_HEIGHT,
    WIDTH_SEGMENTS,
    HEIGHT_SEGMENTS
  );

  const fallbackTexture = new THREE.DataTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
    THREE.RGBAFormat
  );
  fallbackTexture.colorSpace = THREE.SRGBColorSpace;
  fallbackTexture.needsUpdate = true;

  const uniforms = {
    uFlip: { value: 0 },
    uTime: { value: 0 },
    uHalfWidth: { value: PAGE_WIDTH * 0.5 },
    uFrontMap: { value: fallbackTexture },
    uBaseColor: { value: new THREE.Color("#f4efe2") },
    uWarmColor: { value: new THREE.Color("#d9ccb5") },
    uBackColor: { value: new THREE.Color("#99845d") },
    uLightDir: { value: new THREE.Vector3(0.34, 0.58, 1.0).normalize() },
    uRimColor: { value: new THREE.Color("#8aa0c7") }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide
  });

  material.extensions.derivatives = true;
  material.toneMapped = true;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = PERFORMANCE.SHADOWS_ENABLED;
  mesh.receiveShadow = PERFORMANCE.SHADOWS_ENABLED;

  function setFlipProgress(t) {
    uniforms.uFlip.value = THREE.MathUtils.clamp(t, 0, 1);
  }

  function setTextures({ frontTexture }) {
    if (frontTexture) {
      uniforms.uFrontMap.value = frontTexture;
    }
  }

  function setRimColor(color) {
    if (!color) return;
    uniforms.uRimColor.value.copy(color);
  }

  function update(dt) {
    uniforms.uTime.value += dt;
  }

  function dispose() {
    fallbackTexture.dispose();
    geometry.dispose();
    material.dispose();
  }

  return { mesh, setFlipProgress, setTextures, setRimColor, update, dispose };
}
