import * as THREE from "three";
import { debugLog } from "./debug.js";

const DOWNSAMPLE_SIZE = 32;
const IGNORE_BLACK_THRESHOLD = 24;
const IGNORE_WHITE_THRESHOLD = 232;
const MIN_ALPHA = 8;

const pageColorCache = new Map();
const urlColorCache = new Map();
const urlInFlightCache = new Map();
let sharedCanvas = null;
let sharedContext = null;

function getSourceImage(source) {
  if (source instanceof THREE.Texture) {
    return source.image;
  }

  return source;
}

function getWorkingContext(size) {
  if (!sharedCanvas) {
    sharedCanvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(size, size)
        : document.createElement("canvas");
  }

  if (sharedCanvas.width !== size || sharedCanvas.height !== size) {
    sharedCanvas.width = size;
    sharedCanvas.height = size;
  }

  if (!sharedContext) {
    sharedContext = sharedCanvas.getContext("2d", { willReadFrequently: true });
  }

  if (!sharedContext) {
    throw new Error("Unable to create 2D context for dominant color extraction");
  }

  return sharedContext;
}

function cloneRgb(color) {
  return { r: color.r, g: color.g, b: color.b };
}

function rgbToSaturation(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max <= 0) return 0;
  return (max - min) / max;
}

function computeWeightedColor(imageData, ignoreExtremePixels) {
  const data = imageData.data;
  let weightedR = 0;
  let weightedG = 0;
  let weightedB = 0;
  let totalWeight = 0;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < MIN_ALPHA) {
      continue;
    }

    const red = data[i];
    const green = data[i + 1];
    const blue = data[i + 2];

    if (ignoreExtremePixels) {
      const maxChannel = Math.max(red, green, blue);
      const minChannel = Math.min(red, green, blue);
      const nearBlack = maxChannel <= IGNORE_BLACK_THRESHOLD;
      const nearWhite = minChannel >= IGNORE_WHITE_THRESHOLD;

      if (nearBlack || nearWhite) {
        continue;
      }
    }

    // More saturated colors get stronger influence.
    const saturation = rgbToSaturation(red, green, blue);
    const weight = 0.15 + saturation * 1.85;

    weightedR += red * weight;
    weightedG += green * weight;
    weightedB += blue * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) {
    return null;
  }

  return {
    r: Math.round(weightedR / totalWeight),
    g: Math.round(weightedG / totalWeight),
    b: Math.round(weightedB / totalWeight)
  };
}

function rgbToThreeColor(color) {
  return new THREE.Color(color.r / 255, color.g / 255, color.b / 255);
}

function readDominantColorFromImage(image) {
  const context = getWorkingContext(DOWNSAMPLE_SIZE);

  context.clearRect(0, 0, DOWNSAMPLE_SIZE, DOWNSAMPLE_SIZE);
  context.drawImage(image, 0, 0, DOWNSAMPLE_SIZE, DOWNSAMPLE_SIZE);
  const imageData = context.getImageData(0, 0, DOWNSAMPLE_SIZE, DOWNSAMPLE_SIZE);

  return (
    computeWeightedColor(imageData, true) ??
    computeWeightedColor(imageData, false) ?? {
      r: 154,
      g: 164,
      b: 180
    }
  );
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image for color extraction: ${url}`));
    image.src = url;
  });
}

export async function getDominantColorFromUrl(url) {
  if (urlColorCache.has(url)) {
    return cloneRgb(urlColorCache.get(url));
  }

  if (urlInFlightCache.has(url)) {
    return urlInFlightCache.get(url).then((color) => cloneRgb(color));
  }

  const extractionPromise = loadImageFromUrl(url)
    .then((image) => readDominantColorFromImage(image))
    .then((color) => {
      urlColorCache.set(url, color);
      urlInFlightCache.delete(url);
      return color;
    })
    .catch((error) => {
      urlInFlightCache.delete(url);
      throw error;
    });

  urlInFlightCache.set(url, extractionPromise);
  return extractionPromise.then((color) => cloneRgb(color));
}

export async function extractDominantColor(source, pageIndex) {
  if (typeof pageIndex === "number" && pageColorCache.has(pageIndex)) {
    return pageColorCache.get(pageIndex).clone();
  }

  const image = getSourceImage(source);
  if (!image) {
    throw new Error("extractDominantColor requires a loaded image source");
  }

  const dominantRgb = readDominantColorFromImage(image);
  const color = rgbToThreeColor(dominantRgb);

  if (typeof pageIndex === "number") {
    pageColorCache.set(pageIndex, color.clone());
    debugLog(
      `[ColorExtract] page ${String(pageIndex).padStart(2, "0")} -> #${color.getHexString()}`
    );
  }

  return color;
}

export function getCachedDominantColor(pageIndex) {
  const color = pageColorCache.get(pageIndex);
  return color ? color.clone() : null;
}
