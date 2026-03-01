const DEFAULT_VOLUME = 0.16;
const AUDIO_BASE_PATH = `${import.meta.env.BASE_URL}audio`;

function createAudioClip({ url, volume, label }) {
  const audio = new Audio(url);
  audio.preload = "auto";
  audio.volume = volume;

  let unavailable = false;
  let warned = false;

  function warnOnce(message, error) {
    if (warned) return;
    warned = true;
    if (error) {
      console.warn(message, error);
      return;
    }
    console.warn(message);
  }

  audio.addEventListener(
    "error",
    () => {
      unavailable = true;
      warnOnce(`[Audio] ${label} unavailable: ${url}`);
    },
    { once: true }
  );

  function play(muted) {
    if (muted || unavailable) {
      return;
    }

    try {
      audio.currentTime = 0;
      const playResult = audio.play();

      if (playResult && typeof playResult.catch === "function") {
        playResult.catch((error) => {
          warnOnce(`[Audio] ${label} playback disabled or failed`, error);
        });
      }
    } catch (error) {
      warnOnce(`[Audio] ${label} playback threw an error`, error);
    }
  }

  async function unlock() {
    if (unavailable) {
      return false;
    }

    const previousMuted = audio.muted;
    const previousVolume = audio.volume;

    try {
      audio.muted = true;
      audio.volume = 0;
      audio.currentTime = 0;
      const playResult = audio.play();
      if (playResult && typeof playResult.then === "function") {
        await playResult;
      }
      audio.pause();
      audio.currentTime = 0;
      audio.muted = previousMuted;
      audio.volume = previousVolume;
      return true;
    } catch (error) {
      audio.muted = previousMuted;
      audio.volume = previousVolume;
      warnOnce(`[Audio] ${label} unlock failed`, error);
      return false;
    }
  }

  return { play, unlock };
}

export function createAudioManager() {
  let muted = false;
  let unlocked = false;

  const whoosh = createAudioClip({
    url: `${AUDIO_BASE_PATH}/whoosh.mp3`,
    volume: DEFAULT_VOLUME,
    label: "whoosh"
  });

  function setMuted(value) {
    muted = Boolean(value);
  }

  function playWhoosh() {
    whoosh.play(muted);
  }

  function unlock() {
    if (unlocked) {
      return;
    }

    unlocked = true;
    void Promise.allSettled([whoosh.unlock()]);
  }

  return {
    setMuted,
    unlock,
    playWhoosh
  };
}
