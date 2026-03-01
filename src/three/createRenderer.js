import * as THREE from "three";
import { PERFORMANCE, getCappedPixelRatio } from "../config.js";

export function createRenderer() {
  const cappedPixelRatio = getCappedPixelRatio();
  const renderer = new THREE.WebGLRenderer({
    antialias: cappedPixelRatio <= PERFORMANCE.ADAPTIVE_AA_DPR_THRESHOLD,
    alpha: false,
    powerPreference: "high-performance"
  });

  renderer.setPixelRatio(cappedPixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = PERFORMANCE.SHADOWS_ENABLED;
  if (PERFORMANCE.SHADOWS_ENABLED) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  return renderer;
}
