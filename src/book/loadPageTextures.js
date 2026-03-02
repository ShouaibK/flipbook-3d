import * as THREE from "three";
import { extractDominantColor, getCachedDominantColor } from "../utils/colorExtract.js";
import { PERFORMANCE } from "../config.js";

const DEFAULT_TOTAL_PAGES = 16;
const ACTIVE_RADIUS = 1;
const PAGE_PATH_PREFIX = `${import.meta.env.BASE_URL}pages`;
const PAGE_FILE_PREFIX = "book_";
const IMAGE_EXTENSION = "jpg";
const DEFAULT_ANISOTROPY = PERFORMANCE.TEXTURE_ANISOTROPY_MAX;

let activeTextureStore = null;
let textureAnisotropy = DEFAULT_ANISOTROPY;
const textureLoader = new THREE.TextureLoader();

function getPageUrl(pageNumber) {
  const pageId = String(pageNumber).padStart(2, "0");
  return `${PAGE_PATH_PREFIX}/${PAGE_FILE_PREFIX}${pageId}.${IMAGE_EXTENSION}`;
}

function configureTexture(texture, { generateMipmaps = true } = {}) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = generateMipmaps ? textureAnisotropy : 1;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = generateMipmaps;
  texture.needsUpdate = true;
  return texture;
}

function createFallbackTexture() {
  const fallbackTexture = new THREE.DataTexture(
    new Uint8Array([236, 230, 217, 255]),
    1,
    1,
    THREE.RGBAFormat
  );
  return configureTexture(fallbackTexture, { generateMipmaps: false });
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

function getNeighborhood(centerPage, totalPages) {
  const pages = new Set();
  const center = THREE.MathUtils.clamp(centerPage, 1, totalPages);
  for (let delta = -ACTIVE_RADIUS; delta <= ACTIVE_RADIUS; delta += 1) {
    const page = center + delta;
    if (page >= 1 && page <= totalPages) {
      pages.add(page);
    }
  }
  return pages;
}

function createTextureStore(totalPages) {
  const textures = new Map();
  const inFlight = new Map();
  const fallbackTexture = createFallbackTexture();
  const activePages = new Set();
  let disposed = false;

  function clampPage(pageNumber) {
    return THREE.MathUtils.clamp(pageNumber, 1, totalPages);
  }

  async function ensureTexture(pageNumber, onLoaded) {
    const page = clampPage(pageNumber);

    if (textures.has(page)) {
      return textures.get(page);
    }

    if (inFlight.has(page)) {
      return inFlight.get(page);
    }

    const url = getPageUrl(page);
    const promise = loadTexture(textureLoader, url, onLoaded)
      .then((texture) => {
        inFlight.delete(page);

        if (disposed || !activePages.has(page)) {
          texture.dispose();
          return fallbackTexture;
        }

        textures.set(page, texture);
        void extractDominantColor(texture, page).catch(() => {});
        return texture;
      })
      .catch((error) => {
        inFlight.delete(page);
        throw error;
      });

    inFlight.set(page, promise);
    return promise;
  }

  function unloadInactiveTextures() {
    for (const [pageNumber, texture] of textures) {
      if (activePages.has(pageNumber)) {
        continue;
      }
      texture.dispose();
      textures.delete(pageNumber);
    }
  }

  function setActivePage(pageNumber) {
    if (disposed) {
      return;
    }

    activePages.clear();
    const neighborhood = getNeighborhood(pageNumber, totalPages);

    for (const page of neighborhood) {
      activePages.add(page);
      void ensureTexture(page);
    }

    unloadInactiveTextures();
  }

  async function preloadActivePages(pageNumber, { onProgress } = {}) {
    const neighborhood = getNeighborhood(pageNumber, totalPages);
    activePages.clear();

    for (const page of neighborhood) {
      activePages.add(page);
    }

    const total = Math.max(neighborhood.size, 1);
    let loaded = 0;
    onProgress?.(0);

    await Promise.all(
      [...neighborhood].map((page) =>
        ensureTexture(page, () => {
          loaded += 1;
          onProgress?.(loaded / total);
        })
      )
    );

    unloadInactiveTextures();
    onProgress?.(1);
  }

  function getTexture(pageNumber) {
    const page = clampPage(pageNumber);
    return textures.get(page) ?? fallbackTexture;
  }

  function applyTextureSettings() {
    for (const texture of textures.values()) {
      configureTexture(texture);
    }
  }

  function dispose() {
    if (disposed) {
      return;
    }

    disposed = true;
    for (const texture of textures.values()) {
      texture.dispose();
    }
    textures.clear();
    inFlight.clear();
    activePages.clear();
    fallbackTexture.dispose();
  }

  return {
    totalPages,
    getTexture,
    setActivePage,
    preloadActivePages,
    applyTextureSettings,
    dispose
  };
}

export function setPageTextureAnisotropy(value) {
  const nextValue = THREE.MathUtils.clamp(
    Math.floor(value || DEFAULT_ANISOTROPY),
    1,
    PERFORMANCE.TEXTURE_ANISOTROPY_MAX
  );
  textureAnisotropy = nextValue;

  if (!activeTextureStore) {
    return;
  }

  activeTextureStore.applyTextureSettings();
}

export async function loadPageTextures(
  totalPages = DEFAULT_TOTAL_PAGES,
  { onProgress, initialPage = 1 } = {}
) {
  if (activeTextureStore) {
    activeTextureStore.dispose();
  }

  const textureStore = createTextureStore(totalPages);
  activeTextureStore = textureStore;
  await textureStore.preloadActivePages(initialPage, { onProgress });
  return textureStore;
}

export function getPageDominantColor(pageNumber) {
  if (!activeTextureStore) {
    return getCachedDominantColor(pageNumber);
  }

  const clampedPage = THREE.MathUtils.clamp(pageNumber, 1, activeTextureStore.totalPages);
  return getCachedDominantColor(clampedPage);
}

export function disposePageTextures() {
  if (!activeTextureStore) {
    return;
  }

  activeTextureStore.dispose();
  activeTextureStore = null;
}
