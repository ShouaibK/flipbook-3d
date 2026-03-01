import * as THREE from "three";
import { extractDominantColor, getCachedDominantColor } from "../utils/colorExtract.js";
import { PERFORMANCE } from "../config.js";

const DEFAULT_TOTAL_PAGES = 20;
const PAGE_PATH_PREFIX = `${import.meta.env.BASE_URL}pages`;
const PAGE_FILE_PREFIX = "book_";
const IMAGE_EXTENSION = "jpg";
const DEFAULT_ANISOTROPY = PERFORMANCE.TEXTURE_ANISOTROPY_MAX;

let cachedTextures = null;
let cachedDominantColors = null;
let loadingPromise = null;
let textureAnisotropy = DEFAULT_ANISOTROPY;
const textureLoader = new THREE.TextureLoader();

function getPageUrl(pageNumber) {
  const pageId = String(pageNumber).padStart(2, "0");
  return `${PAGE_PATH_PREFIX}/${PAGE_FILE_PREFIX}${pageId}.${IMAGE_EXTENSION}`;
}

function configureTexture(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = textureAnisotropy;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function loadTexture(loader, url, onLoaded) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        const configured = configureTexture(texture);
        onLoaded?.();
        resolve(configured);
      },
      undefined,
      () => reject(new Error(`Failed to load page texture: ${url}`))
    );
  });
}

export function setPageTextureAnisotropy(value) {
  const nextValue = THREE.MathUtils.clamp(
    Math.floor(value || DEFAULT_ANISOTROPY),
    1,
    PERFORMANCE.TEXTURE_ANISOTROPY_MAX
  );
  textureAnisotropy = nextValue;

  if (!cachedTextures) {
    return;
  }

  for (const texture of cachedTextures) {
    configureTexture(texture);
  }
}

export function loadPageTextures(totalPages = DEFAULT_TOTAL_PAGES, { onProgress } = {}) {
  if (cachedTextures && cachedTextures.length === totalPages) {
    onProgress?.(1);
    return Promise.resolve(cachedTextures);
  }

  if (loadingPromise) {
    onProgress?.(0);
    return loadingPromise;
  }

  const urls = Array.from({ length: totalPages }, (_, index) => getPageUrl(index + 1));
  let loadedCount = 0;

  onProgress?.(0);

  loadingPromise = Promise.all(
    urls.map((url) =>
      loadTexture(textureLoader, url, () => {
        loadedCount += 1;
        onProgress?.(loadedCount / urls.length);
      })
    )
  )
    .then(async (textures) => {
      const dominantColors = await Promise.all(
        textures.map((texture, index) => extractDominantColor(texture, index + 1))
      );

      cachedTextures = textures;
      cachedDominantColors = dominantColors;
      loadingPromise = null;
      onProgress?.(1);
      return textures;
    })
    .catch((error) => {
      loadingPromise = null;
      throw error;
    });

  return loadingPromise;
}

export function getPageDominantColor(pageNumber) {
  if (!cachedDominantColors) {
    return getCachedDominantColor(pageNumber);
  }

  const clampedPage = THREE.MathUtils.clamp(pageNumber, 1, cachedDominantColors.length);
  return cachedDominantColors[clampedPage - 1]?.clone() ?? null;
}
