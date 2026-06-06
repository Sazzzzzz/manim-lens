const vscode = acquireVsCodeApi();

// --- DOM Elements ---
const mediaContainer = document.querySelector(".media-container");
const videoPlayer = document.getElementById("video-media-player");
const video = document.getElementById("video-preview");
const imagePlayer = document.getElementById("image-media-player");
const image = document.getElementById("image-preview");
const audioTrack = document.getElementById("audio-track");

// Controls
const controlsContainer = document.querySelector(".controls-container");
const progressBar = document.querySelector(".progress-bar");
const progressBarBackground = document.querySelector(
  ".progress-bar-background",
);
const progressFill = document.querySelector(".color-fill");
const seekTooltip = document.querySelector(".demo-fill");
const volumeContainer = document.querySelector(".volume-container");

// Buttons
const playPauseButton = document.getElementById("play-pause-button");
const playIcon = document.getElementById("play-icon");
const pauseIcon = document.getElementById("pause-icon");
const volumeButton = document.getElementById("volume-button");
const volumeHighIcon = document.getElementById("volume-high-icon");
const volumeMutedIcon = document.getElementById("volume-muted-icon");
const volumeSlider = document.getElementById("volume-slider");
const loopButton = document.getElementById("loop-button");
const speedButton = document.getElementById("speed-button");
const speedOptionsList = document.getElementById("speed-options-list");
const pipButton = document.getElementById("pip-button");
const fullscreenButton = document.getElementById("fullscreen-button");
const fullscreenEnterIcon = document.getElementById("fullscreen-enter-icon");
const fullscreenExitIcon = document.getElementById("fullscreen-exit-icon");
const renderButton = document.getElementById("render-button");

// Displays
const timeDisplay = document.getElementById("time-display");
const moduleNameDisplay = document.getElementById("module-name");
const outputFileDisplay = document.getElementById("output-file");
const sourceFileDisplay = document.getElementById("source-file");

// --- State ---
let isVideoMode = !videoPlayer.hidden;
let hasAudio = true;
let controlsTimeout;
let wasPausedBeforeSeek = false;

// ============================================================
// PlaybackController — single source of truth for play/seek/volume
// ============================================================
const controller = {
  get hasAudio() {
    return hasAudio && !audioTrack.hidden && audioTrack.src;
  },

  getDuration() {
    let max = video.duration || 0;
    if (this.hasAudio && audioTrack.duration && !isNaN(audioTrack.duration)) {
      max = Math.max(max, audioTrack.duration);
    }
    return max;
  },

  getCurrentTime() {
    // When video ended but audio still plays, track audio position
    if (video.ended && this.hasAudio && !audioTrack.ended) {
      return audioTrack.currentTime;
    }
    return video.currentTime;
  },

  play() {
    if (!isVideoMode) return;
    if (this.hasAudio && !audioTrack.paused) {
      // already playing audio — just ensure video is playing
    }
    video.play();
    if (this.hasAudio) {
      // Sync audio to video position before playing, in case of drift
      audioTrack.currentTime = video.currentTime;
      audioTrack.play().catch((err) => console.log("Audio play failed:", err));
    }
  },

  pause() {
    video.pause();
    if (this.hasAudio) {
      audioTrack.pause();
    }
  },

  seek(ratio) {
    const maxDuration = this.getDuration();
    if (isNaN(maxDuration) || maxDuration <= 0) return;
    const targetTime = ratio * maxDuration;
    video.currentTime = Math.min(targetTime, video.duration || 0);
    if (this.hasAudio && !isNaN(audioTrack.duration)) {
      audioTrack.currentTime = Math.min(targetTime, audioTrack.duration);
    }
  },

  skip(seconds) {
    if (isNaN(video.duration)) return;
    video.currentTime += seconds;
    if (this.hasAudio && !isNaN(audioTrack.duration)) {
      audioTrack.currentTime += seconds;
    }
  },

  setVolume(value) {
    const vol = Math.max(0, Math.min(1, value));
    if (this.hasAudio) {
      audioTrack.volume = vol;
      audioTrack.muted = vol === 0;
    } else {
      video.volume = vol;
      video.muted = vol === 0;
    }
  },

  toggleMute() {
    if (this.hasAudio) {
      audioTrack.muted = !audioTrack.muted;
      if (!audioTrack.muted && audioTrack.volume === 0) {
        audioTrack.volume = 0.1;
      }
    } else {
      video.muted = !video.muted;
      if (!video.muted && video.volume === 0) {
        video.volume = 0.1;
      }
    }
  },

  setSpeed(speed) {
    video.playbackRate = speed;
    if (this.hasAudio) {
      audioTrack.playbackRate = speed;
    }
    speedButton.textContent = `${speed}x`;
    speedOptionsList.querySelectorAll("li").forEach((li) => {
      li.classList.toggle("active", parseFloat(li.dataset.value) === speed);
    });
  },

  setLoop(loop) {
    video.loop = loop;
    if (this.hasAudio) {
      audioTrack.loop = loop;
    }
  },

  isMuted() {
    return this.hasAudio ? audioTrack.muted : video.muted;
  },

  getVolume() {
    return this.hasAudio ? audioTrack.volume : video.volume;
  },
};

// ============================================================
// Drift correction — every 500ms, nudge audio to match video
// ============================================================
let driftInterval = null;

function startDriftCorrection() {
  stopDriftCorrection();
  driftInterval = setInterval(() => {
    if (!controller.hasAudio) return;
    if (video.paused || video.ended) return;
    const drift = Math.abs(video.currentTime - audioTrack.currentTime);
    if (drift > 0.1) {
      audioTrack.currentTime = video.currentTime;
    }
  }, 500);
}

function stopDriftCorrection() {
  if (driftInterval) {
    clearInterval(driftInterval);
    driftInterval = null;
  }
}

// ============================================================
// UI Helpers
// ============================================================

function formatTime(timeInSeconds) {
  if (isNaN(timeInSeconds) || !isFinite(timeInSeconds)) return "0:00";
  const mins = Math.floor(timeInSeconds / 60);
  const secs = Math.floor(timeInSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function updateProgressAndTime() {
  const maxDuration = controller.getDuration();
  if (isNaN(maxDuration) || maxDuration <= 0) return;
  const currentTime = controller.getCurrentTime();
  const progressPercent = (currentTime / maxDuration) * 100;
  progressFill.style.width = `${progressPercent}%`;
  timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(maxDuration)}`;
}

function updatePlayPauseIcon() {
  if (video.paused) {
    playIcon.style.display = "block";
    pauseIcon.style.display = "none";
    controlsContainer.classList.add("visible");
    clearTimeout(controlsTimeout);
  } else {
    playIcon.style.display = "none";
    pauseIcon.style.display = "block";
    hideControlsWithDelay();
  }
}

function updateVolumeIcon() {
  if (controller.isMuted() || controller.getVolume() === 0) {
    volumeHighIcon.style.display = "none";
    volumeMutedIcon.style.display = "block";
    volumeSlider.value = 0;
  } else {
    volumeHighIcon.style.display = "block";
    volumeMutedIcon.style.display = "none";
    volumeSlider.value = controller.getVolume();
  }
}

function updateFullscreenIcon() {
  if (document.fullscreenElement) {
    fullscreenEnterIcon.style.display = "none";
    fullscreenExitIcon.style.display = "block";
  } else {
    fullscreenEnterIcon.style.display = "block";
    fullscreenExitIcon.style.display = "none";
  }
}

function updateLoopUI(loop) {
  loopButton.classList.toggle("active", loop);
  loopButton.style.backgroundColor = loop ? "rgba(255, 255, 255, 0.3)" : "";
}

function hideControlsWithDelay() {
  if (document.activeElement === video || !video.paused) {
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
      if (
        !video.paused &&
        document.activeElement !== video &&
        !controlsContainer.matches(":hover") &&
        !progressBar.matches(":hover")
      ) {
        controlsContainer.classList.remove("visible");
      }
    }, 2000);
  }
}

function showControls() {
  clearTimeout(controlsTimeout);
  controlsContainer.classList.add("visible");
}

function showVolumeControls(visible) {
  if (volumeContainer) {
    volumeContainer.classList.toggle("hidden", !visible);
  }
}

// ============================================================
// Core actions (delegated to controller)
// ============================================================

function togglePlayPause() {
  if (!isVideoMode) return;
  if (video.paused) {
    controller.play();
    startDriftCorrection();
  } else {
    controller.pause();
    stopDriftCorrection();
  }
  updatePlayPauseIcon();
}

function toggleMute() {
  if (!isVideoMode) return;
  controller.toggleMute();
  updateVolumeIcon();
}

function toggleLoop() {
  if (!isVideoMode) return;
  const loop = !video.loop;
  controller.setLoop(loop);
  updateLoopUI(loop);
}

function enterPictureInPicture() {
  if (!isVideoMode) {
    vscode.postMessage({
      command: "errorMessage",
      text: "Manim Sideview: Picture In Picture is not supported on images.",
    });
    return;
  }
  try {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
    } else {
      video.requestPictureInPicture();
    }
  } catch (err) {
    console.error("PiP Error:", err);
    vscode.postMessage({
      command: "errorMessage",
      text: "Manim Sideview: Picture In Picture failed. " + err.message,
    });
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    mediaContainer.requestFullscreen().catch((err) => {
      console.error("Fullscreen Error:", err);
      vscode.postMessage({
        command: "errorMessage",
        text: "Manim Sideview: Fullscreen failed. " + err.message,
      });
    });
  }
}

function renderNew() {
  const srcPath = sourceFileDisplay.innerHTML;
  vscode.postMessage({
    command: "executeSelfCommand",
    name: "renderNewScene",
    args: [srcPath],
  });
}

// ============================================================
// Event Listeners
// ============================================================

// Video events
video.addEventListener("loadedmetadata", () => {
  updateLoopUI(video.loop);
  updatePlayPauseIcon();
  updateVolumeIcon();
});

video.addEventListener("play", () => {
  updatePlayPauseIcon();
  startDriftCorrection();
});
video.addEventListener("pause", () => {
  updatePlayPauseIcon();
  stopDriftCorrection();
});

video.addEventListener("timeupdate", updateProgressAndTime);
video.addEventListener("volumechange", updateVolumeIcon);
video.addEventListener("click", togglePlayPause);

// When video ends but audio continues: freeze video, drive progress from audio
video.addEventListener("ended", () => {
  stopDriftCorrection();
  updatePlayPauseIcon();
});

// Audio events
audioTrack.addEventListener("loadedmetadata", () => {
  if (!controller.hasAudio) return;
  updateProgressAndTime();
});

audioTrack.addEventListener("timeupdate", () => {
  // Drive progress bar when audio outlasts video
  if (!controller.hasAudio || !video.ended || audioTrack.ended) return;
  updateProgressAndTime();
});

audioTrack.addEventListener("ended", () => {
  stopDriftCorrection();
});

audioTrack.addEventListener("error", () => {
  console.warn(
    "Manim Sideview: Audio track failed to load. Playing video without audio.",
  );
  hasAudio = false;
  showVolumeControls(false);
});

// Progress bar events
progressBar.addEventListener("mousemove", (e) => {
  const maxDuration = controller.getDuration();
  if (!isVideoMode || isNaN(maxDuration) || maxDuration <= 0) return;
  const rect = progressBar.getBoundingClientRect();
  const seekRatio = Math.max(
    0,
    Math.min(1, (e.clientX - rect.left) / rect.width),
  );
  seekTooltip.style.width = `${seekRatio * 100}%`;
});

progressBar.addEventListener("mousedown", () => {
  const maxDuration = controller.getDuration();
  if (!isVideoMode || isNaN(maxDuration) || maxDuration <= 0) return;
  wasPausedBeforeSeek = video.paused;
  if (!wasPausedBeforeSeek) controller.pause();
});

progressBar.addEventListener("click", (e) => {
  const maxDuration = controller.getDuration();
  if (!isVideoMode || isNaN(maxDuration) || maxDuration <= 0) return;
  const rect = progressBar.getBoundingClientRect();
  const seekRatio = Math.max(
    0,
    Math.min(1, (e.clientX - rect.left) / rect.width),
  );
  controller.seek(seekRatio);
  if (!wasPausedBeforeSeek) {
    setTimeout(() => controller.play(), 50);
  }
});

// Button events
playPauseButton.addEventListener("click", togglePlayPause);
volumeButton.addEventListener("click", toggleMute);
volumeSlider.addEventListener("input", (e) => {
  if (!isVideoMode) return;
  controller.setVolume(e.target.value);
  updateVolumeIcon();
});
loopButton.addEventListener("click", toggleLoop);
pipButton.addEventListener("click", enterPictureInPicture);
fullscreenButton.addEventListener("click", toggleFullscreen);
renderButton.addEventListener("click", renderNew);

// Speed selection
speedOptionsList.addEventListener("click", (e) => {
  if (e.target.tagName === "LI") {
    controller.setSpeed(parseFloat(e.target.dataset.value));
  }
});

// Controls visibility
mediaContainer.addEventListener("mouseenter", showControls);
mediaContainer.addEventListener("mousemove", () => {
  showControls();
  if (!video.paused) hideControlsWithDelay();
});
mediaContainer.addEventListener("mouseleave", () => {
  if (!video.paused && !controlsContainer.matches(":hover")) {
    hideControlsWithDelay();
  }
});
controlsContainer.addEventListener("mouseenter", showControls);
controlsContainer.addEventListener("mouseleave", () => {
  if (!video.paused) hideControlsWithDelay();
});

// Fullscreen change
document.addEventListener("fullscreenchange", updateFullscreenIcon);
document.addEventListener("webkitfullscreenchange", updateFullscreenIcon);

// Keyboard shortcuts
window.addEventListener("keydown", (e) => {
  const targetTagName = document.activeElement.tagName.toLowerCase();
  if (targetTagName === "input" || targetTagName === "textarea") return;

  if (
    [" ", "Enter"].includes(e.key) &&
    document.activeElement.classList.contains("control-button")
  ) {
    return;
  }

  switch (e.key.toLowerCase()) {
    case " ":
      e.preventDefault();
      togglePlayPause();
      break;
    case "m":
      toggleMute();
      break;
    case "l":
      toggleLoop();
      break;
    case "f":
      toggleFullscreen();
      break;
    case "arrowleft":
      controller.skip(-5);
      break;
    case "arrowright":
      controller.skip(5);
      break;
  }
});

// ============================================================
// VS Code Message Handling
// ============================================================
window.addEventListener("message", (e) => {
  const message = e.data;
  switch (message.command) {
    case "reload":
      stopDriftCorrection();

      outputFileDisplay.innerText = message.outputFile;
      moduleNameDisplay.innerText = message.moduleName;
      sourceFileDisplay.innerText = message.sourceFile;
      outputFileDisplay.title = `Click to reveal ${message.outputFile} in Explorer`;
      sourceFileDisplay.title = `Click to open ${message.sourceFile}`;

      isVideoMode = message.mediaType !== 1;
      hasAudio = message.hasAudio === true;
      videoPlayer.hidden = !isVideoMode;
      imagePlayer.hidden = isVideoMode;

      showVolumeControls(hasAudio);
      controlsContainer.style.display = isVideoMode ? "" : "none";

      // Reset audio track
      if (hasAudio && message.audioResource) {
        audioTrack.removeAttribute("hidden");
        audioTrack.setAttribute("src", message.audioResource);
        audioTrack.load();
        audioTrack.volume = 1;
        audioTrack.muted = false;
      } else {
        audioTrack.setAttribute("hidden", "");
        audioTrack.removeAttribute("src");
      }

      if (isVideoMode) {
        video.setAttribute("src", message.resource);
        video.removeAttribute("poster");
        video.load();
        video.play().catch((err) => console.log("Autoplay prevented:", err));
        controller.setSpeed(1);
        updatePlayPauseIcon();
        updateVolumeIcon();
        timeDisplay.textContent = "0:00 / 0:00";
        progressFill.style.width = "0%";
        updateFullscreenIcon();
        startDriftCorrection();
      } else {
        image.setAttribute("src", message.resource);
        video.pause();
      }
      break;
  }
});

// ============================================================
// Initial setup
// ============================================================
updatePlayPauseIcon();
updateVolumeIcon();
updateFullscreenIcon();
controller.setSpeed(1);

if (isVideoMode) {
  showControls();
  hideControlsWithDelay();
} else {
  controlsContainer.style.display = "none";
}
