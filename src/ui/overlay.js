import "./styles.css";

function formatPageNumber(value) {
  return String(value).padStart(2, "0");
}

export function createOverlayUI({
  container,
  onPrev,
  onNext,
  onMuteToggle,
  onAutoplayToggle,
  onAutoplaySpeedChange
}) {
  const root = document.createElement("div");
  root.className = "overlay-ui";

  const nav = document.createElement("div");
  nav.className = "overlay-ui__nav";

  const prevButton = document.createElement("button");
  prevButton.type = "button";
  prevButton.className = "overlay-ui__btn";
  prevButton.setAttribute("aria-label", "Previous page");
  prevButton.textContent = "<";

  const pageCounter = document.createElement("div");
  pageCounter.className = "overlay-ui__counter";
  pageCounter.textContent = "01 / 20";

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "overlay-ui__btn";
  nextButton.setAttribute("aria-label", "Next page");
  nextButton.textContent = ">";

  nav.append(prevButton, pageCounter, nextButton);

  const extras = document.createElement("div");
  extras.className = "overlay-ui__extras";

  const muteButton = document.createElement("button");
  muteButton.type = "button";
  muteButton.className = "overlay-ui__pill";
  muteButton.setAttribute("aria-label", "Toggle audio mute");
  muteButton.textContent = "Mute";

  const autoplayWrap = document.createElement("label");
  autoplayWrap.className = "overlay-ui__autoplay";
  const autoplayCheckbox = document.createElement("input");
  autoplayCheckbox.type = "checkbox";
  autoplayCheckbox.setAttribute("aria-label", "Toggle autoplay");
  const autoplayText = document.createElement("span");
  autoplayText.textContent = "Autoplay";
  autoplayWrap.append(autoplayCheckbox, autoplayText);

  const speedWrap = document.createElement("div");
  speedWrap.className = "overlay-ui__speed";
  const speedLabel = document.createElement("span");
  speedLabel.className = "overlay-ui__speed-label";
  speedLabel.textContent = "1.0x";
  const speedSlider = document.createElement("input");
  speedSlider.type = "range";
  speedSlider.min = "0.5";
  speedSlider.max = "2";
  speedSlider.step = "0.1";
  speedSlider.value = "1";
  speedSlider.setAttribute("aria-label", "Autoplay speed");
  speedWrap.append(speedSlider, speedLabel);

  extras.append(muteButton, autoplayWrap, speedWrap);
  root.append(nav, extras);
  container.appendChild(root);

  function onPrevClick() {
    onPrev?.();
  }

  function onNextClick() {
    onNext?.();
  }

  function onMuteClick() {
    const muted = muteButton.getAttribute("aria-pressed") === "true";
    onMuteToggle?.(!muted);
  }

  function onAutoplayChange() {
    onAutoplayToggle?.(autoplayCheckbox.checked);
  }

  function onSpeedInput() {
    const value = Number(speedSlider.value);
    speedLabel.textContent = `${value.toFixed(1)}x`;
    onAutoplaySpeedChange?.(value);
  }

  prevButton.addEventListener("click", onPrevClick);
  nextButton.addEventListener("click", onNextClick);
  muteButton.addEventListener("click", onMuteClick);
  autoplayCheckbox.addEventListener("change", onAutoplayChange);
  speedSlider.addEventListener("input", onSpeedInput);

  function update({
    currentPage = 1,
    totalPages = 20,
    muted = false,
    autoplayEnabled = false,
    autoplaySpeed = 1,
    isBusy = false
  } = {}) {
    pageCounter.textContent = `${formatPageNumber(currentPage)} / ${formatPageNumber(totalPages)}`;

    prevButton.disabled = isBusy || currentPage <= 1;
    nextButton.disabled = isBusy || currentPage >= totalPages;

    muteButton.textContent = muted ? "Unmute" : "Mute";
    muteButton.setAttribute("aria-pressed", String(muted));

    autoplayCheckbox.checked = autoplayEnabled;
    speedSlider.disabled = !autoplayEnabled;
    const clampedSpeed = Math.min(2, Math.max(0.5, autoplaySpeed));
    speedSlider.value = clampedSpeed.toFixed(1);
    speedLabel.textContent = `${clampedSpeed.toFixed(1)}x`;
  }

  function dispose() {
    prevButton.removeEventListener("click", onPrevClick);
    nextButton.removeEventListener("click", onNextClick);
    muteButton.removeEventListener("click", onMuteClick);
    autoplayCheckbox.removeEventListener("change", onAutoplayChange);
    speedSlider.removeEventListener("input", onSpeedInput);
    root.remove();
  }

  return {
    update,
    dispose
  };
}
