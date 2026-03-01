import * as THREE from "three";

const HOT_RELOAD_CLEANUP_KEY = "__flipbookDragFlipCleanup__";
const EDGE_ZONE_FRACTION = 0.18;
const EDGE_ZONE_MIN = 24;
const EDGE_ZONE_MAX = 120;
const HIT_PADDING = 12;
const DRAG_RANGE_MIN = 160;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resolvePageRect(controller, camera, viewportElement, cornerWorld) {
  const mesh = controller?.mesh;
  if (!mesh || !mesh.geometry) {
    return null;
  }

  const geometry = mesh.geometry;
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }

  const box = geometry.boundingBox;
  if (!box) {
    return null;
  }

  const corners = [
    [box.min.x, box.min.y],
    [box.min.x, box.max.y],
    [box.max.x, box.min.y],
    [box.max.x, box.max.y]
  ];

  const bounds = {
    left: Number.POSITIVE_INFINITY,
    top: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    bottom: Number.NEGATIVE_INFINITY
  };

  for (const [x, y] of corners) {
    cornerWorld.set(x, y, 0);
    mesh.localToWorld(cornerWorld);
    cornerWorld.project(camera);

    const sx = (cornerWorld.x * 0.5 + 0.5) * viewportElement.clientWidth;
    const sy = (-cornerWorld.y * 0.5 + 0.5) * viewportElement.clientHeight;
    bounds.left = Math.min(bounds.left, sx);
    bounds.right = Math.max(bounds.right, sx);
    bounds.top = Math.min(bounds.top, sy);
    bounds.bottom = Math.max(bounds.bottom, sy);
  }

  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    ...bounds,
    width,
    height
  };
}

function releasePointerCapture(domElement, pointerId) {
  if (pointerId < 0) {
    return;
  }

  try {
    if (domElement.hasPointerCapture(pointerId)) {
      domElement.releasePointerCapture(pointerId);
    }
  } catch {
    // Ignore release errors for already-released pointers.
  }
}

export function createDragFlipInteraction({
  domElement,
  viewportElement,
  camera,
  getController,
  onDragStart
}) {
  if (!domElement || !viewportElement || !camera || typeof getController !== "function") {
    throw new Error("createDragFlipInteraction requires domElement, viewportElement, camera, getController");
  }

  const previousCleanup = window[HOT_RELOAD_CLEANUP_KEY];
  if (typeof previousCleanup === "function") {
    previousCleanup();
  }

  const cornerWorld = new THREE.Vector3();
  const dragState = {
    active: false,
    pointerId: -1,
    direction: "forward",
    startX: 0,
    progress: 0,
    dragRange: DRAG_RANGE_MIN
  };

  const pageRectState = {
    value: null
  };

  function updatePageRect() {
    pageRectState.value = resolvePageRect(getController(), camera, viewportElement, cornerWorld);
  }

  function clearDragState() {
    dragState.active = false;
    dragState.pointerId = -1;
    dragState.progress = 0;
  }

  function finalizeDrag({ cancelled = false, pointerId = -1 } = {}) {
    if (!dragState.active) {
      releasePointerCapture(domElement, pointerId);
      return;
    }

    const controller = getController();
    if (controller) {
      if (cancelled) {
        controller.cancelDrag();
      } else {
        controller.endDrag(dragState.progress >= 0.5);
      }
    }

    releasePointerCapture(domElement, pointerId >= 0 ? pointerId : dragState.pointerId);
    clearDragState();
  }

  function resolveDirectionFromPointer(state, pageRect, x, y) {
    if (!pageRect) {
      return null;
    }

    const withinX = x >= pageRect.left - HIT_PADDING && x <= pageRect.right + HIT_PADDING;
    const withinY = y >= pageRect.top - HIT_PADDING && y <= pageRect.bottom + HIT_PADDING;
    if (!withinX || !withinY) {
      return null;
    }

    const edgeZone = clamp(pageRect.width * EDGE_ZONE_FRACTION, EDGE_ZONE_MIN, EDGE_ZONE_MAX);
    const nearRightEdge = x >= pageRect.right - edgeZone;
    const nearLeftEdge = x <= pageRect.left + edgeZone;

    if (nearRightEdge && state.currentPage < state.totalPages) {
      return "forward";
    }

    if (nearLeftEdge && state.currentPage > 1) {
      return "backward";
    }

    return null;
  }

  function onPointerDown(event) {
    if (dragState.active) {
      return;
    }

    const controller = getController();
    const state = controller?.getState();
    if (!controller || !state || state.isBusy) {
      return;
    }

    const pageRect = pageRectState.value;
    const direction = resolveDirectionFromPointer(state, pageRect, event.clientX, event.clientY);
    if (!direction) {
      return;
    }

    if (!controller.beginDrag(direction)) {
      return;
    }

    onDragStart?.();
    dragState.active = true;
    dragState.pointerId = event.pointerId;
    dragState.direction = direction;
    dragState.startX = event.clientX;
    dragState.progress = 0;
    dragState.dragRange = Math.max(DRAG_RANGE_MIN, pageRect.width * 0.9);

    try {
      domElement.setPointerCapture(event.pointerId);
    } catch {
      // Ignore capture failures and continue with window-level listeners.
    }
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!dragState.active || event.pointerId !== dragState.pointerId) {
      return;
    }

    const controller = getController();
    if (!controller) {
      finalizeDrag({ cancelled: true, pointerId: event.pointerId });
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const progress =
      dragState.direction === "forward"
        ? clamp(-deltaX / dragState.dragRange, 0, 1)
        : clamp(deltaX / dragState.dragRange, 0, 1);

    dragState.progress = progress;
    controller.updateDragProgress(progress);
    event.preventDefault();
  }

  function onPointerUp(event) {
    if (!dragState.active || event.pointerId !== dragState.pointerId) {
      return;
    }

    finalizeDrag({ cancelled: false, pointerId: event.pointerId });
  }

  function onPointerCancel(event) {
    if (!dragState.active || event.pointerId !== dragState.pointerId) {
      return;
    }

    finalizeDrag({ cancelled: true, pointerId: event.pointerId });
  }

  function onLostPointerCapture(event) {
    if (!dragState.active || event.pointerId !== dragState.pointerId) {
      return;
    }

    finalizeDrag({ cancelled: true, pointerId: event.pointerId });
  }

  function onWindowBlur() {
    if (!dragState.active) {
      return;
    }

    finalizeDrag({ cancelled: true });
  }

  domElement.addEventListener("pointerdown", onPointerDown, { passive: false });
  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);
  window.addEventListener("blur", onWindowBlur);
  domElement.addEventListener("lostpointercapture", onLostPointerCapture);

  function dispose() {
    domElement.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("blur", onWindowBlur);
    domElement.removeEventListener("lostpointercapture", onLostPointerCapture);

    if (dragState.active) {
      finalizeDrag({ cancelled: true });
    }

    if (window[HOT_RELOAD_CLEANUP_KEY] === dispose) {
      delete window[HOT_RELOAD_CLEANUP_KEY];
    }
  }

  window[HOT_RELOAD_CLEANUP_KEY] = dispose;
  updatePageRect();

  return {
    update: updatePageRect,
    dispose
  };
}
