const PAGE_SEGMENTS = Object.freeze({
  width: 96,
  height: 56
});

export const PERFORMANCE = Object.freeze({
  MAX_DPR: 1.5,
  SHADOWS_ENABLED: true,
  PAGE_SEGMENTS,
  STAR_COUNT: 250,
  TEXTURE_ANISOTROPY_MAX: 4,
  ADAPTIVE_AA_DPR_THRESHOLD: 1.25
});

export const DEBUG_ENABLED = false;

export function getCappedPixelRatio() {
  const devicePixelRatio =
    typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio)
      ? window.devicePixelRatio
      : 1;
  return Math.min(devicePixelRatio, PERFORMANCE.MAX_DPR);
}
