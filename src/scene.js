import * as THREE from "three";

export const TEXTURES_BASE_PATH = `${import.meta.env.BASE_URL}textures`;
export const MODELS_BASE_PATH = `${import.meta.env.BASE_URL}models`;

export function resolveTextureUrl(fileName) {
  return `${TEXTURES_BASE_PATH}/${fileName}`;
}

export function resolveModelUrl(fileName) {
  return `${MODELS_BASE_PATH}/${fileName}`;
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#090b10");
  return scene;
}
