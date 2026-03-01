import * as THREE from "three";
import "./styles.css";
import { createParticleSystem } from "./particles/index.js";
import { createCamera } from "./three/createCamera.js";
import { createRenderer } from "./three/createRenderer.js";
import { createScene } from "./three/createScene.js";
import { disposeBook, getBookController, initBook, updateBook } from "./book/index.js";
import { PAGE_WIDTH } from "./book/pageMesh.js";
import { createAudioManager } from "./audio/audioManager.js";
import { createOverlayUI } from "./ui/overlay.js";
import { createDragFlipInteraction } from "./book/dragFlip.js";
import { getDominantColorFromUrl } from "./utils/colorExtract.js";
import { debugLog } from "./utils/debug.js";
import { PERFORMANCE, getCappedPixelRatio } from "./config.js";

const container = document.getElementById("app");
if (!container) {
  throw new Error("Missing #app container");
}

const scene = createScene();
const camera = createCamera();
const PAGE_HEIGHT = PAGE_WIDTH * (9 / 16);
const PAGE_TARGET_WIDTH_COVERAGE = 0.68;
const PAGE_SAFE_MARGIN = 0.07;
const PAGE_MAX_HEIGHT_COVERAGE = 1 - PAGE_SAFE_MARGIN * 2;
const CAMERA_MIN_DISTANCE = 1.2;
const CAMERA_MAX_DISTANCE = 8;
const CAMERA_VERTICAL_OFFSET_RATIO = 0.015625;
const CAMERA_LOOK_AT_Y_RATIO = 0.00625;
const CAMERA_DRIFT = true;
const CAMERA_DRIFT_POSITION_AMPLITUDE = new THREE.Vector3(0.006, 0.004, 0.004);
const CAMERA_DRIFT_LOOKAT_AMPLITUDE = new THREE.Vector3(0.012, 0.008, 0.0);
const CAMERA_DRIFT_SPEED = new THREE.Vector3(0.22, 0.18, 0.14);
const baseCameraPosition = new THREE.Vector3(0, 0.05, 3.2);
const baseCameraLookAt = new THREE.Vector3(0, 0.02, 0);
const driftedCameraPosition = new THREE.Vector3();
const driftedCameraLookAt = new THREE.Vector3();
camera.lookAt(baseCameraLookAt);

const rimLight = new THREE.DirectionalLight("#8aa0c7", 0.62);
rimLight.position.set(-1.25, 1.35, -3.5);

const keyLight = new THREE.DirectionalLight("#ffe9cb", 0.46);
keyLight.position.set(1.8, 2.4, 2.2);
keyLight.castShadow = PERFORMANCE.SHADOWS_ENABLED;
if (PERFORMANCE.SHADOWS_ENABLED) {
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 0.8;
  keyLight.shadow.camera.far = 8;
  keyLight.shadow.camera.left = -2;
  keyLight.shadow.camera.right = 2;
  keyLight.shadow.camera.top = 1.7;
  keyLight.shadow.camera.bottom = -1.7;
  keyLight.shadow.bias = -0.00018;
  keyLight.shadow.normalBias = 0.018;
}

const fillLight = new THREE.DirectionalLight("#8ca3c7", 0.2);
fillLight.position.set(-1.6, 0.9, 2.5);

const ambientLight = new THREE.AmbientLight("#18212f", 0.24);
const shadowCatcherGeometry = new THREE.PlaneGeometry(PAGE_WIDTH * 1.45, PAGE_HEIGHT * 1.2);
const shadowCatcherMaterial = new THREE.ShadowMaterial({
  color: new THREE.Color("#000000"),
  opacity: 0.22
});
const shadowCatcher = new THREE.Mesh(shadowCatcherGeometry, shadowCatcherMaterial);
shadowCatcher.rotation.x = -Math.PI * 0.5;
shadowCatcher.position.set(0, -PAGE_HEIGHT * 0.54, -0.24);
shadowCatcher.receiveShadow = PERFORMANCE.SHADOWS_ENABLED;
shadowCatcher.visible = PERFORMANCE.SHADOWS_ENABLED;
shadowCatcher.renderOrder = 0;

const lightTarget = new THREE.Object3D();
lightTarget.position.set(0, 0, 0);
scene.add(lightTarget);
keyLight.target = lightTarget;

scene.add(shadowCatcher, rimLight, keyLight, fillLight, ambientLight);

const renderer = createRenderer();
container.appendChild(renderer.domElement);

const loadingOverlay = document.createElement("div");
loadingOverlay.className = "loading-overlay";
const loadingShell = document.createElement("div");
loadingShell.className = "loading-overlay__shell";
const loadingTitle = document.createElement("div");
loadingTitle.className = "loading-overlay__title";
loadingTitle.textContent = "Loading pages";
const loadingPercent = document.createElement("div");
loadingPercent.className = "loading-overlay__percent";
loadingPercent.textContent = "0%";
const loadingTrack = document.createElement("div");
loadingTrack.className = "loading-overlay__track";
const loadingFill = document.createElement("div");
loadingFill.className = "loading-overlay__fill";
loadingTrack.appendChild(loadingFill);
loadingShell.append(loadingTitle, loadingPercent, loadingTrack);
loadingOverlay.appendChild(loadingShell);
container.appendChild(loadingOverlay);

const particleSystem = createParticleSystem(scene);
particleSystem.init();

const audioManager = createAudioManager();
const uiState = {
  muted: readStoredMuteState(),
  autoplayEnabled: false,
  autoplaySpeed: 1
};
const autoplayState = {
  cooldown: 0,
  loopEnabled: false
};

const overlayUI = createOverlayUI({
  container,
  onPrev: () => {
    const controller = getBookController();
    if (!controller) return;
    const state = controller.getState();
    if (state?.isBusy) return;
    pauseAutoplay();
    controller.flipBackward();
  },
  onNext: () => {
    const controller = getBookController();
    if (!controller) return;
    const state = controller.getState();
    if (state?.isBusy) return;
    pauseAutoplay();
    controller.flipForward();
  },
  onMuteToggle: (muted) => {
    setMuted(muted);
  },
  onAutoplayToggle: (enabled) => {
    uiState.autoplayEnabled = Boolean(enabled);
    autoplayState.cooldown = 0;
    updateOverlayUI();
  },
  onAutoplaySpeedChange: (speed) => {
    uiState.autoplaySpeed = Number.isFinite(speed) ? speed : 1;
    updateOverlayUI();
  }
});

const overlayViewState = {
  currentPage: 1,
  totalPages: 20,
  muted: uiState.muted,
  autoplayEnabled: uiState.autoplayEnabled,
  autoplaySpeed: uiState.autoplaySpeed,
  isBusy: false
};

const clock = new THREE.Clock();
let animationFrameId = 0;
let cameraDriftTime = 0;

const RIM_TRANSITION_SECONDS = 0.4;
const AUTOPLAY_BASE_DELAY_SECONDS = 1.55;
const AUDIO_MUTE_SESSION_KEY = "flipbook_audio_muted";

const rimState = {
  currentColor: rimLight.color.clone(),
  fromColor: rimLight.color.clone(),
  targetColor: rimLight.color.clone(),
  transitionProgress: 1,
  activeFlipSession: -1,
  rimSwitchedThisFlip: false,
  latestColorRequestId: 0
};

const audioState = {
  activeFlipSession: -1,
  whooshPlayedThisFlip: false
};
let audioUnlocked = false;

const dragFlipInteraction = createDragFlipInteraction({
  domElement: renderer.domElement,
  viewportElement: container,
  camera,
  getController: getBookController,
  onDragStart: pauseAutoplay
});

function readStoredMuteState() {
  try {
    return sessionStorage.getItem(AUDIO_MUTE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function persistMuteState(muted) {
  try {
    sessionStorage.setItem(AUDIO_MUTE_SESSION_KEY, muted ? "1" : "0");
  } catch {
    // Storage can be unavailable; ignore and keep runtime state.
  }
}

function setMuted(muted) {
  const isMuted = Boolean(muted);
  uiState.muted = isMuted;
  audioManager.setMuted(isMuted);
  persistMuteState(isMuted);
  updateOverlayUI();
}

function unlockAudioOnce() {
  if (audioUnlocked) {
    return;
  }

  audioUnlocked = true;
  audioManager.unlock?.();
  window.removeEventListener("pointerdown", unlockAudioOnce, true);
  window.removeEventListener("keydown", unlockAudioOnce, true);
}

function setLoadingProgress(progress) {
  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  loadingFill.style.width = `${(clamped * 100).toFixed(1)}%`;
  loadingPercent.textContent = `${Math.round(clamped * 100)}%`;
}

function completeLoadingOverlay() {
  setLoadingProgress(1);
  loadingOverlay.classList.add("loading-overlay--done");
  window.setTimeout(() => {
    loadingOverlay.remove();
  }, 380);
}

function updateOverlayUI() {
  const controller = getBookController();
  const state = controller?.getState();
  const nextCurrentPage = state?.currentPage ?? 1;
  const nextTotalPages = state?.totalPages ?? 20;
  const nextIsBusy = state?.isBusy ?? false;
  const nextMuted = uiState.muted;
  const nextAutoplayEnabled = uiState.autoplayEnabled;
  const nextAutoplaySpeed = uiState.autoplaySpeed;

  const changed =
    overlayViewState.currentPage !== nextCurrentPage ||
    overlayViewState.totalPages !== nextTotalPages ||
    overlayViewState.isBusy !== nextIsBusy ||
    overlayViewState.muted !== nextMuted ||
    overlayViewState.autoplayEnabled !== nextAutoplayEnabled ||
    overlayViewState.autoplaySpeed !== nextAutoplaySpeed;

  if (!changed) {
    return;
  }

  overlayViewState.currentPage = nextCurrentPage;
  overlayViewState.totalPages = nextTotalPages;
  overlayViewState.isBusy = nextIsBusy;
  overlayViewState.muted = nextMuted;
  overlayViewState.autoplayEnabled = nextAutoplayEnabled;
  overlayViewState.autoplaySpeed = nextAutoplaySpeed;

  overlayUI.update(overlayViewState);
}

function pauseAutoplay() {
  if (!uiState.autoplayEnabled) {
    return;
  }

  uiState.autoplayEnabled = false;
  autoplayState.cooldown = 0;
  updateOverlayUI();
}

function handleResize() {
  const width = container.clientWidth;
  const height = container.clientHeight;

  camera.aspect = width / height;
  updateCameraFraming();
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(getCappedPixelRatio());
  renderer.setSize(width, height, false);

  particleSystem.handleResize();
  dragFlipInteraction.update();
}

function updateCameraFraming() {
  const aspect = Math.max(container.clientWidth / Math.max(container.clientHeight, 1), 0.01);
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const tanVertical = Math.tan(verticalFov * 0.5);
  const tanHorizontal = tanVertical * aspect;

  const maxWidthCoverage = 1 - PAGE_SAFE_MARGIN * 2;
  const targetWidthCoverage = THREE.MathUtils.clamp(
    PAGE_TARGET_WIDTH_COVERAGE,
    0.6,
    maxWidthCoverage
  );

  const distanceForWidth =
    (PAGE_WIDTH * 0.5) / Math.max(targetWidthCoverage * tanHorizontal, 0.0001);
  const distanceForHeight =
    (PAGE_HEIGHT * 0.5) / Math.max(PAGE_MAX_HEIGHT_COVERAGE * tanVertical, 0.0001);

  const distance = THREE.MathUtils.clamp(
    Math.max(distanceForWidth, distanceForHeight),
    CAMERA_MIN_DISTANCE,
    CAMERA_MAX_DISTANCE
  );

  baseCameraPosition.set(0, distance * CAMERA_VERTICAL_OFFSET_RATIO, distance);
  baseCameraLookAt.set(0, distance * CAMERA_LOOK_AT_Y_RATIO, 0);
  camera.position.copy(baseCameraPosition);
  camera.lookAt(baseCameraLookAt);
}

function animate() {
  const dt = clock.getDelta();
  updateStarfield(dt);
  updateBook(dt);
  dragFlipInteraction.update();
  updateOverlayUI();
  updateAutoplay(dt);
  updateRimLighting(dt);
  updateCameraDrift(dt);

  renderer.render(scene, camera);
  animationFrameId = requestAnimationFrame(animate);
}

function updateCameraDrift(dt) {
  cameraDriftTime += dt;

  if (!CAMERA_DRIFT) {
    camera.position.copy(baseCameraPosition);
    camera.lookAt(baseCameraLookAt);
    return;
  }

  const t = cameraDriftTime;
  driftedCameraPosition.set(
    baseCameraPosition.x + Math.sin(t * CAMERA_DRIFT_SPEED.x + 0.7) * CAMERA_DRIFT_POSITION_AMPLITUDE.x,
    baseCameraPosition.y + Math.sin(t * CAMERA_DRIFT_SPEED.y + 2.1) * CAMERA_DRIFT_POSITION_AMPLITUDE.y,
    baseCameraPosition.z + Math.sin(t * CAMERA_DRIFT_SPEED.z + 1.4) * CAMERA_DRIFT_POSITION_AMPLITUDE.z
  );
  driftedCameraLookAt.set(
    baseCameraLookAt.x + Math.sin(t * 0.16 + 0.3) * CAMERA_DRIFT_LOOKAT_AMPLITUDE.x,
    baseCameraLookAt.y + Math.sin(t * 0.19 + 1.7) * CAMERA_DRIFT_LOOKAT_AMPLITUDE.y,
    baseCameraLookAt.z
  );

  camera.position.copy(driftedCameraPosition);
  camera.lookAt(driftedCameraLookAt);
}

function updateStarfield(dt) {
  particleSystem.update(dt);
}

function updateAutoplay(dt) {
  const controller = getBookController();
  if (!controller || !uiState.autoplayEnabled) {
    return;
  }

  const state = controller.getState();
  if (!state || state.isFlipping || state.isDragging) {
    return;
  }

  autoplayState.cooldown += dt;
  const interval = THREE.MathUtils.clamp(AUTOPLAY_BASE_DELAY_SECONDS / uiState.autoplaySpeed, 0.55, 2.6);

  if (autoplayState.cooldown < interval) {
    return;
  }

  autoplayState.cooldown = 0;

  if (state.currentPage >= state.totalPages) {
    if (!autoplayState.loopEnabled) {
      uiState.autoplayEnabled = false;
      updateOverlayUI();
    }
    return;
  }

  controller.flipForward();
}

function colorsClose(a, b, epsilon = 0.0005) {
  return (
    Math.abs(a.r - b.r) <= epsilon &&
    Math.abs(a.g - b.g) <= epsilon &&
    Math.abs(a.b - b.b) <= epsilon
  );
}

function setRimColorTarget(color) {
  if (!color || colorsClose(color, rimState.targetColor)) {
    return;
  }

  rimState.fromColor.copy(rimState.currentColor);
  rimState.targetColor.copy(color);
  rimState.transitionProgress = 0;
}

function stepRimTransition(dt) {
  if (rimState.transitionProgress >= 1) {
    rimState.currentColor.copy(rimState.targetColor);
    return;
  }

  rimState.transitionProgress = Math.min(1, rimState.transitionProgress + dt / RIM_TRANSITION_SECONDS);
  const t = rimState.transitionProgress;
  const eased = t * t * (3 - 2 * t);
  rimState.currentColor.copy(rimState.fromColor).lerp(rimState.targetColor, eased);
}

function pageUrl(pageNumber) {
  return `/pages/book_${String(pageNumber).padStart(2, "0")}.jpg`;
}

function requestRimColorForPage(pageNumber, { logSwitch = false } = {}) {
  const requestId = ++rimState.latestColorRequestId;
  const url = pageUrl(pageNumber);

  void getDominantColorFromUrl(url)
    .then((rgb) => {
      if (requestId !== rimState.latestColorRequestId) {
        return;
      }

      if (!rgb || !Number.isFinite(rgb.r) || !Number.isFinite(rgb.g) || !Number.isFinite(rgb.b)) {
        console.warn(`Invalid dominant color for page ${pageNumber}`, rgb);
        return;
      }

      const targetColor = new THREE.Color(rgb.r / 255, rgb.g / 255, rgb.b / 255);
      if (logSwitch) {
        debugLog(`MID TRIGGER @0.5 pageTarget=${pageNumber} color={r:${rgb.r},g:${rgb.g},b:${rgb.b}}`);
      }
      setRimColorTarget(targetColor);
    })
    .catch((error) => {
      console.error(`Failed to update rim color for page ${pageNumber}`, error);
    });
}

function updateRimLighting(dt) {
  const controller = getBookController();
  if (!controller) return;

  const state = controller.getState();
  if (!state) return;
  const signals = controller.consumeFlipSignals?.() ?? null;

  const activeFlipSession = state.isFlipping ? state.flipSessionId ?? -1 : -1;
  const previousAudioFlipSession = audioState.activeFlipSession;
  const previousRimFlipSession = rimState.activeFlipSession;

  if (activeFlipSession !== previousAudioFlipSession) {
    audioState.activeFlipSession = activeFlipSession;
    if (activeFlipSession >= 0) {
      audioState.whooshPlayedThisFlip = false;
      if (!audioState.whooshPlayedThisFlip) {
        audioManager.playWhoosh();
        audioState.whooshPlayedThisFlip = true;
        debugLog("WHOOSH fired");
      }
    }
  }

  if (activeFlipSession !== previousRimFlipSession) {
    rimState.activeFlipSession = activeFlipSession;
    rimState.rimSwitchedThisFlip = false;

    if (activeFlipSession < 0 && previousRimFlipSession >= 0) {
      requestRimColorForPage(state.currentPage, { logSwitch: false });
    }
  }

  if (signals?.midTriggered && !rimState.rimSwitchedThisFlip) {
    const candidatePage =
      state.flipDirection === "forward" ? state.currentPage + 1 : state.currentPage - 1;
    const targetPage = THREE.MathUtils.clamp(candidatePage, 1, state.totalPages);

    rimState.rimSwitchedThisFlip = true;
    requestRimColorForPage(targetPage, { logSwitch: true });
  }

  if (signals?.midTriggered && !state.isFlipping) {
    // Flip was canceled after crossing mid-point: restore current-page rim target.
    requestRimColorForPage(state.currentPage, { logSwitch: false });
  }

  const rimUpdate = controller.consumeRimColorUpdate();
  if (rimUpdate) {
    const { pageNumber } = rimUpdate;
    requestRimColorForPage(pageNumber, { logSwitch: false });
  }
  stepRimTransition(dt);

  rimLight.color.copy(rimState.currentColor);
  controller.setRimColor(rimState.currentColor);
}

function handleKeyDown(event) {
  if (event.repeat) return;

  if (event.key === "ArrowRight") {
    event.preventDefault();
    const controller = getBookController();
    if (!controller) return;
    const state = controller.getState();
    if (state?.isBusy) return;
    pauseAutoplay();
    controller.flipForward();
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    const controller = getBookController();
    if (!controller) return;
    const state = controller.getState();
    if (state?.isBusy) return;
    pauseAutoplay();
    controller.flipBackward();
  }
}

async function initBookWithTextures() {
  try {
    await initBook({
      scene,
      maxAnisotropy: Math.min(
        renderer.capabilities.getMaxAnisotropy(),
        PERFORMANCE.TEXTURE_ANISOTROPY_MAX
      ),
      onLoadingProgress: (progress) => {
        const eased = 0.05 + progress * 0.95;
        setLoadingProgress(eased);
      }
    });
    completeLoadingOverlay();
  } catch (error) {
    console.error("Unable to initialize book textures", error);
    loadingTitle.textContent = "Loading failed";
    loadingOverlay.classList.add("loading-overlay--error");
  }
}

function dispose() {
  cancelAnimationFrame(animationFrameId);
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("pointerdown", unlockAudioOnce, true);
  window.removeEventListener("keydown", unlockAudioOnce, true);

  overlayUI.dispose();
  dragFlipInteraction.dispose();
  disposeBook();
  particleSystem.dispose();
  scene.remove(shadowCatcher, keyLight, fillLight, ambientLight, lightTarget, rimLight);
  shadowCatcherGeometry.dispose();
  shadowCatcherMaterial.dispose();
  renderer.dispose();
}

window.addEventListener("resize", handleResize);
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("pointerdown", unlockAudioOnce, { passive: true, capture: true });
window.addEventListener("keydown", unlockAudioOnce, { capture: true });
window.addEventListener("beforeunload", dispose);
setMuted(readStoredMuteState());
setLoadingProgress(0.02);

handleResize();
animate();
void initBookWithTextures();
