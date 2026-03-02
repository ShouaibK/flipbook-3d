import * as THREE from "three";
import { createPageMesh, PAGE_WIDTH } from "./pageMesh.js";
import { getDominantColorFromUrl } from "../utils/colorExtract.js";
import { debugLog } from "../utils/debug.js";

const FLIP_SPEED = 0.5;
const TOTAL_PAGES = 16;
const SNAP_DURATION_SECONDS = 0.36;
const MAX_TURN_ROTATION_Y = -Math.PI;
const LEFT_HINGE_X = -PAGE_WIDTH * 0.5;
const PAGE_HEIGHT = 0.9;
const STACK_LAYER_COUNT = 8;
const UNDER_PAGE_Z_OFFSET = -0.01;
const SETTLE_DURATION_SECONDS = 0.2;
const SETTLE_BEND_AMPLITUDE = 0.06;
const SETTLE_ROTATION_Y_AMPLITUDE = 0.02;
const MID_FLIP_PROGRESS = 0.5;
const END_FLIP_PROGRESS = 0.95;
const PAGE_BASE_PATH = `${import.meta.env.BASE_URL}pages`;

function easeInOutCubic(t) {
  if (t < 0.5) {
    return 4 * t * t * t;
  }

  return 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Manages one preview page and exposes a small runtime API.
 */
export function createBookController({ scene, pageTextureStore }) {
  if (!scene) {
    throw new Error("createBookController requires a scene");
  }

  if (
    !pageTextureStore ||
    typeof pageTextureStore.getTexture !== "function" ||
    typeof pageTextureStore.setActivePage !== "function"
  ) {
    throw new Error("createBookController requires a page texture store");
  }

  const group = new THREE.Group();
  const pivotGroup = new THREE.Group();
  const page = createPageMesh();
  const underPageMesh = createUnderPageMesh();
  const stackGroup = new THREE.Group();

  pivotGroup.add(page.mesh);
  group.add(stackGroup, underPageMesh, pivotGroup);
  group.position.set(0, 0, 0);
  group.rotation.x = -0.08;

  page.mesh.renderOrder = 1;
  underPageMesh.renderOrder = 0;

  scene.add(group);

  let elapsed = 0;
  let currentPage = 1;
  const totalPages = TOTAL_PAGES;
  let flipProgress = 0;
  let isFlipping = false;
  let isDragging = false;
  let flipDirection = "forward";
  let displayFlip = 0;
  let pendingRimColorUpdate = null;
  let rimColorRequestToken = 0;
  let snapAnimation = null;
  let settleAnimation = null;
  let settleBend = 0;
  let settleRotationY = 0;
  let prevFlipProgress = 0;
  let flipSessionId = 0;
  let midTriggered = false;
  let endTriggered = false;
  let midTriggerPending = false;
  let endTriggerPending = false;
  let underPageNumber = null;
  let frontPageTexture = null;
  const flipSignals = {
    midTriggered: false,
    endTriggered: false,
    prevFlipProgress: 0,
    flipProgress: 0,
    isFlipping: false,
    isDragging: false,
    flipDirection: "forward",
    currentPage: 1,
    totalPages
  };

  function createUnderPageMesh() {
    const geometry = new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_HEIGHT, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.9,
      metalness: 0.02,
      side: THREE.FrontSide
    });
    material.toneMapped = true;
    material.transparent = false;
    material.opacity = 1;
    material.blending = THREE.NormalBlending;
    material.depthWrite = true;
    material.depthTest = true;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 0, UNDER_PAGE_Z_OFFSET);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    return mesh;
  }

  function createFakeStack() {
    const layerGeometry = new THREE.PlaneGeometry(PAGE_WIDTH * 0.995, PAGE_HEIGHT * 0.995);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: "#cdbca3",
      roughness: 0.94,
      metalness: 0.02,
      side: THREE.DoubleSide
    });

    for (let i = 0; i < STACK_LAYER_COUNT; i += 1) {
      const layer = new THREE.Mesh(layerGeometry, baseMaterial.clone());
      const depth = i * 0.0024;
      layer.position.set(i * 0.0007, -i * 0.0006 - 0.01, -0.02 - depth);
      layer.scale.setScalar(1 - i * 0.0022);
      layer.material.color.offsetHSL(0.0, -0.01, -i * 0.006);
      layer.castShadow = false;
      layer.receiveShadow = false;
      stackGroup.add(layer);
    }

    const spineBlock = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, PAGE_HEIGHT * 0.96, 0.036),
      new THREE.MeshStandardMaterial({
        color: "#221b17",
        roughness: 0.88,
        metalness: 0.05
      })
    );
    spineBlock.position.set(LEFT_HINGE_X + 0.03, -0.005, -0.03);
    spineBlock.castShadow = false;
    spineBlock.receiveShadow = false;
    stackGroup.add(spineBlock);
  }

  function getPageTexture(pageNumber) {
    const clampedPage = THREE.MathUtils.clamp(pageNumber, 1, totalPages);
    return pageTextureStore.getTexture(clampedPage);
  }

  function setTextureFocus(pageNumber) {
    const clampedPage = THREE.MathUtils.clamp(pageNumber, 1, totalPages);
    pageTextureStore.setActivePage(clampedPage);
  }

  function syncFrontTexture() {
    const texture = getPageTexture(currentPage);
    if (texture !== frontPageTexture) {
      frontPageTexture = texture;
      page.setTextures({
        frontTexture: texture
      });
    }
  }

  function setUnderPageTexture(pageNumber) {
    underPageNumber = THREE.MathUtils.clamp(pageNumber, 1, totalPages);
    const texture = getPageTexture(underPageNumber);
    const nextMap = texture ?? null;
    if (underPageMesh.material.map !== nextMap) {
      underPageMesh.material.map = nextMap;
      underPageMesh.material.needsUpdate = true;
    }
  }

  function showUnderPage(pageNumber) {
    setUnderPageTexture(pageNumber);
    underPageMesh.visible = true;
  }

  function hideUnderPage() {
    underPageNumber = null;
    underPageMesh.visible = false;
  }

  function syncVisibleTextures() {
    syncFrontTexture();

    if (underPageMesh.visible && underPageNumber !== null) {
      setUnderPageTexture(underPageNumber);
    }
  }

  function syncPageShadowState() {
    page.mesh.castShadow = false;
    page.mesh.receiveShadow = false;
  }

  function getPageImageUrl(pageNumber) {
    const clampedPage = THREE.MathUtils.clamp(pageNumber, 1, totalPages);
    return `${PAGE_BASE_PATH}/book_${String(clampedPage).padStart(2, "0")}.jpg`;
  }

  function requestRimColorForPage(pageNumber) {
    const page = THREE.MathUtils.clamp(pageNumber, 1, totalPages);
    const requestToken = ++rimColorRequestToken;
    const url = getPageImageUrl(page);

    void getDominantColorFromUrl(url)
      .then((rgb) => {
        if (requestToken !== rimColorRequestToken) {
          return;
        }

        pendingRimColorUpdate = { pageNumber: page, rgb };
      })
      .catch((error) => {
        console.error(`Failed to extract dominant color for page ${page}`, error);
      });
  }

  function consumeRimColorUpdate() {
    const update = pendingRimColorUpdate;
    pendingRimColorUpdate = null;
    return update;
  }

  function applyRestTextures() {
    syncFrontTexture();
    hideUnderPage();
  }

  function applyFlipTextures(direction) {
    const underPage = direction === "forward" ? currentPage + 1 : currentPage - 1;
    const clampedUnderPage = THREE.MathUtils.clamp(underPage, 1, totalPages);
    syncFrontTexture();
    showUnderPage(clampedUnderPage);
  }

  function resetFlipTriggerFlags() {
    prevFlipProgress = flipProgress;
    midTriggered = false;
    endTriggered = false;
    midTriggerPending = false;
    endTriggerPending = false;
  }

  function didCrossThreshold(previous, current, threshold) {
    return (
      (previous < threshold && current >= threshold) ||
      (previous > threshold && current <= threshold)
    );
  }

  function detectFlipThresholdCrossings(previous, current) {
    if (!isFlipping) {
      return;
    }

    if (!midTriggered && didCrossThreshold(previous, current, MID_FLIP_PROGRESS)) {
      midTriggered = true;
      midTriggerPending = true;
    }

    if (!endTriggered && didCrossThreshold(previous, current, END_FLIP_PROGRESS)) {
      endTriggered = true;
      endTriggerPending = true;
    }
  }

  function setFlipProgress(t, { applyEase = true } = {}) {
    const previous = flipProgress;
    const clamped = THREE.MathUtils.clamp(t, 0, 1);
    prevFlipProgress = previous;
    flipProgress = clamped;
    displayFlip = applyEase ? easeInOutCubic(clamped) : clamped;
    detectFlipThresholdCrossings(previous, clamped);
  }

  function resetSettle() {
    settleAnimation = null;
    settleBend = 0;
    settleRotationY = 0;
  }

  function startSettle() {
    settleAnimation = {
      elapsed: 0,
      duration: SETTLE_DURATION_SECONDS
    };
  }

  function updateSettle(dt) {
    if (!settleAnimation) {
      settleBend = 0;
      settleRotationY = 0;
      return;
    }

    settleAnimation.elapsed += dt;
    const t = THREE.MathUtils.clamp(settleAnimation.elapsed / settleAnimation.duration, 0, 1);
    const envelope = Math.pow(1 - t, 1.7);
    const pulse = Math.sin(t * Math.PI);

    settleBend = pulse * SETTLE_BEND_AMPLITUDE * envelope;
    settleRotationY = pulse * SETTLE_ROTATION_Y_AMPLITUDE * envelope;

    if (t >= 1) {
      resetSettle();
    }
  }

  function applyPageCurl() {
    const renderedFlip = THREE.MathUtils.clamp(displayFlip + settleBend, 0, 1);
    page.setFlipProgress(renderedFlip);
  }

  function setRimColor(color) {
    page.setRimColor(color);
  }

  function setupLeftHinge() {
    pivotGroup.position.set(LEFT_HINGE_X, 0, 0);
    page.mesh.position.set(PAGE_WIDTH * 0.5, 0, 0);
  }

  function startFlip(direction, { dragging = false } = {}) {
    if (isFlipping || isDragging || snapAnimation) {
      return false;
    }

    if (direction === "forward" && currentPage >= totalPages) {
      return false;
    }

    if (direction === "backward" && currentPage <= 1) {
      return false;
    }

    flipDirection = direction;
    const pageStep = direction === "forward" ? 1 : -1;
    const targetPage = THREE.MathUtils.clamp(currentPage + pageStep, 1, totalPages);
    setTextureFocus(targetPage);

    flipSessionId += 1;
    flipProgress = 0;
    isFlipping = true;
    isDragging = dragging;
    snapAnimation = null;
    resetSettle();
    resetFlipTriggerFlags();
    syncPageShadowState();
    applyFlipTextures(direction);
    setFlipProgress(0, { applyEase: false });
    return true;
  }

  function flipForward() {
    if (currentPage >= totalPages) {
      return false;
    }

    debugLog("[Book] flipForward", currentPage);

    return startFlip("forward");
  }

  function flipBackward() {
    if (currentPage <= 1) {
      return false;
    }

    debugLog("[Book] flipBackward", currentPage);

    return startFlip("backward");
  }

  function beginDrag(direction) {
    return startFlip(direction, { dragging: true });
  }

  function updateDragProgress(progress) {
    if (!isDragging) {
      return;
    }

    setFlipProgress(progress, { applyEase: false });
  }

  function startSnap(targetProgress, completeOnFinish) {
    snapAnimation = {
      from: flipProgress,
      to: THREE.MathUtils.clamp(targetProgress, 0, 1),
      elapsed: 0,
      duration: SNAP_DURATION_SECONDS,
      completeOnFinish
    };
    isDragging = false;
    isFlipping = true;
    resetSettle();
  }

  function endDrag(shouldComplete) {
    if (!isDragging) {
      return false;
    }

    const completeOnFinish = Boolean(shouldComplete);
    startSnap(completeOnFinish ? 1 : 0, completeOnFinish);
    return true;
  }

  function cancelDrag() {
    if (!isDragging) {
      return false;
    }

    startSnap(0, false);
    return true;
  }

  function completeFlip() {
    if (!isFlipping) {
      return;
    }

    if (!endTriggered) {
      endTriggered = true;
      endTriggerPending = true;
    }

    const pageStep = flipDirection === "forward" ? 1 : -1;
    currentPage = THREE.MathUtils.clamp(currentPage + pageStep, 1, totalPages);
    setTextureFocus(currentPage);

    isFlipping = false;
    isDragging = false;
    snapAnimation = null;
    flipProgress = 0;
    syncPageShadowState();
    setFlipProgress(0, { applyEase: false });
    applyRestTextures();
    startSettle();
    requestRimColorForPage(currentPage);
    debugLog("[Book] flipComplete", currentPage);
  }

  function revertFlip() {
    isFlipping = false;
    isDragging = false;
    snapAnimation = null;
    flipProgress = 0;
    syncPageShadowState();
    resetSettle();
    resetFlipTriggerFlags();
    setFlipProgress(0, { applyEase: false });
    setTextureFocus(currentPage);
    applyRestTextures();
  }

  function applyTurnTransform() {
    const turn = THREE.MathUtils.clamp(displayFlip, 0, 1);
    pivotGroup.rotation.y = turn * MAX_TURN_ROTATION_Y + settleRotationY;
    pivotGroup.position.y = 0;
    pivotGroup.position.z = 0;
    pivotGroup.position.x = LEFT_HINGE_X;
  }

  function update(dt) {
    elapsed += dt;
    page.update(dt);
    syncVisibleTextures();

    if (isDragging) {
      // Drag mode directly controls flip progress from pointer input.
    } else if (snapAnimation) {
      snapAnimation.elapsed += dt;
      const t = THREE.MathUtils.clamp(snapAnimation.elapsed / snapAnimation.duration, 0, 1);
      const eased = easeInOutCubic(t);
      const nextProgress = THREE.MathUtils.lerp(snapAnimation.from, snapAnimation.to, eased);
      setFlipProgress(nextProgress, { applyEase: false });

      if (t >= 1) {
        const shouldComplete = snapAnimation.completeOnFinish && snapAnimation.to >= 1;
        if (shouldComplete) {
          completeFlip();
        } else {
          revertFlip();
        }
      }
    } else if (isFlipping) {
      const step = dt * FLIP_SPEED;
      flipProgress = Math.min(1, flipProgress + step);

      setFlipProgress(flipProgress, { applyEase: true });

      if (flipProgress >= 1) {
        completeFlip();
      }
    }

    updateSettle(dt);
    applyPageCurl();
    applyTurnTransform();

    group.rotation.y = Math.sin(elapsed * 0.28) * 0.04;
    group.position.y = Math.sin(elapsed * 0.42) * 0.015;
  }

  function getState() {
    return {
      currentPage,
      totalPages,
      flipSessionId,
      prevFlipProgress,
      flipProgress,
      isFlipping,
      isDragging,
      isBusy: isFlipping || isDragging,
      flipDirection
    };
  }

  function consumeFlipSignals() {
    flipSignals.midTriggered = midTriggerPending;
    flipSignals.endTriggered = endTriggerPending;
    flipSignals.prevFlipProgress = prevFlipProgress;
    flipSignals.flipProgress = flipProgress;
    flipSignals.isFlipping = isFlipping;
    flipSignals.isDragging = isDragging;
    flipSignals.flipDirection = flipDirection;
    flipSignals.currentPage = currentPage;
    flipSignals.totalPages = totalPages;

    midTriggerPending = false;
    endTriggerPending = false;
    return flipSignals;
  }

  function dispose() {
    scene.remove(group);
    const disposedGeometries = new Set();
    const disposedMaterials = new Set();

    for (const child of stackGroup.children) {
      if (child.geometry && !disposedGeometries.has(child.geometry)) {
        child.geometry.dispose();
        disposedGeometries.add(child.geometry);
      }
      if (Array.isArray(child.material)) {
        for (const material of child.material) {
          if (!disposedMaterials.has(material)) {
            material.dispose();
            disposedMaterials.add(material);
          }
        }
      } else if (child.material && !disposedMaterials.has(child.material)) {
        child.material.dispose();
        disposedMaterials.add(child.material);
      }
    }
    if (underPageMesh.geometry && !disposedGeometries.has(underPageMesh.geometry)) {
      underPageMesh.geometry.dispose();
      disposedGeometries.add(underPageMesh.geometry);
    }
    if (underPageMesh.material && !disposedMaterials.has(underPageMesh.material)) {
      underPageMesh.material.dispose();
      disposedMaterials.add(underPageMesh.material);
    }
    page.dispose();
  }

  createFakeStack();
  setTextureFocus(currentPage);
  applyRestTextures();
  setupLeftHinge();
  syncPageShadowState();
  requestRimColorForPage(currentPage);

  return {
    mesh: page.mesh,
    setFlipProgress,
    setRimColor,
    consumeFlipSignals,
    consumeRimColorUpdate,
    beginDrag,
    updateDragProgress,
    endDrag,
    cancelDrag,
    flipForward,
    flipBackward,
    update,
    getState,
    dispose
  };
}
