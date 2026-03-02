import { createBookController } from "./bookController.js";
import {
  disposePageTextures,
  getPageDominantColor,
  loadPageTextures,
  setPageTextureAnisotropy
} from "./loadPageTextures.js";

let controller = null;

/**
 * Initializes the single-page book preview and attaches it to the scene.
 */
export async function initBook({ scene, onLoadingProgress, maxAnisotropy }) {
  if (!scene) {
    throw new Error("initBook requires a scene");
  }

  if (controller) {
    controller.dispose();
  }

  if (Number.isFinite(maxAnisotropy)) {
    setPageTextureAnisotropy(maxAnisotropy);
  }

  const pageTextureStore = await loadPageTextures(16, {
    onProgress: onLoadingProgress
  });
  controller = createBookController({ scene, pageTextureStore });
  return controller;
}

/**
 * Updates per-frame book animation state.
 */
export function updateBook(dt) {
  if (!controller) return;
  controller.update(dt);
}

export function flipBookForward() {
  if (!controller) return false;
  return controller.flipForward();
}

export function flipBookBackward() {
  if (!controller) return false;
  return controller.flipBackward();
}

/**
 * Sets current page flip progress in [0, 1].
 */
export function setBookFlipProgress(t) {
  if (!controller) return;
  controller.setFlipProgress(t);
}

export function getBookState() {
  if (!controller) return null;
  return controller.getState();
}

export function getBookController() {
  return controller;
}

export function getBookPageDominantColor(pageNumber) {
  return getPageDominantColor(pageNumber);
}

export function disposeBook() {
  if (controller) {
    controller.dispose();
    controller = null;
  }

  disposePageTextures();
}
