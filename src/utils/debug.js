import { DEBUG_ENABLED } from "../config.js";

function readDebugStorageFlag() {
  try {
    return window.localStorage?.getItem("flipbook_debug") === "1";
  } catch {
    return false;
  }
}

export const DEBUG =
  DEBUG_ENABLED ||
  (typeof window !== "undefined" &&
    (window.location.search.includes("debug=1") || readDebugStorageFlag()));

export function debugLog(...args) {
  if (!DEBUG) {
    return;
  }

  console.debug(...args);
}
