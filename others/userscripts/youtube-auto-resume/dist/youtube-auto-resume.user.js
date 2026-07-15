// ==UserScript==
// @name         YouTube Auto Resume
// @namespace    https://github.com/Cedarflake/Cedarflake-Lab
// @version      0.4.1
// @description  Resume paused YouTube videos, click YouTube-provided ad controls, and manage playback from a resilient panel.
// @author       Cedarflake Lab
// @license      MIT
// @homepageURL  https://github.com/Cedarflake/Cedarflake-Lab/tree/main/others/userscripts/youtube-auto-resume
// @supportURL   https://github.com/Cedarflake/Cedarflake-Lab/issues
// @downloadURL  https://raw.githubusercontent.com/Cedarflake/Cedarflake-Lab/main/others/userscripts/youtube-auto-resume/dist/youtube-auto-resume.user.js
// @updateURL    https://raw.githubusercontent.com/Cedarflake/Cedarflake-Lab/main/others/userscripts/youtube-auto-resume/dist/youtube-auto-resume.user.js
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @noframes
// ==/UserScript==
(() => {
  // src/core/playbackState.ts
  function createPlaybackState() {
    let activeVideo = null;
    let generation = 0;
    let pauseStartedAt = null;
    let resumeAttempt = null;
    function activate(video, now) {
      if (video === activeVideo) {
        return false;
      }
      activeVideo = video;
      generation += 1;
      resumeAttempt = null;
      pauseStartedAt = video?.paused === true && video.ended === false ? now : null;
      return true;
    }
    function beginResume(video) {
      if (video !== activeVideo || resumeAttempt) {
        return null;
      }
      resumeAttempt = { generation, video };
      return resumeAttempt;
    }
    function finishResume(attempt) {
      const isCurrent = attempt === resumeAttempt && attempt.generation === generation && attempt.video === activeVideo;
      if (attempt === resumeAttempt) {
        resumeAttempt = null;
      }
      return isCurrent;
    }
    function getPauseStartedAt(video) {
      return video === activeVideo ? pauseStartedAt : null;
    }
    function markPaused(video, now) {
      if (video === activeVideo && pauseStartedAt === null) {
        pauseStartedAt = now;
      }
    }
    function markPlaying(video) {
      if (video === activeVideo) {
        pauseStartedAt = null;
      }
    }
    function renew(video, now) {
      if (video !== activeVideo) {
        return;
      }
      generation += 1;
      resumeAttempt = null;
      pauseStartedAt = video.paused && !video.ended ? now : null;
    }
    function reset() {
      activeVideo = null;
      generation += 1;
      pauseStartedAt = null;
      resumeAttempt = null;
    }
    return {
      activate,
      beginResume,
      finishResume,
      getPauseStartedAt,
      markPaused,
      markPlaying,
      renew,
      reset
    };
  }

  // src/core/settings.ts
  var SETTINGS_STORAGE_PREFIX = "autoChick.ytAutoResume.";
  var QUALITY_PREFERENCES = [
    "auto",
    "hd4320",
    "hd2880",
    "hd2160",
    "hd1440",
    "hd1080",
    "hd720",
    "large",
    "medium",
    "small",
    "tiny"
  ];
  var DEFAULT_SETTINGS = {
    enabled: true,
    intervalMs: 1e3,
    minPausedSeconds: 2,
    autoSkipAds: false,
    preferredQuality: "auto",
    avoidTyping: true,
    avoidEnded: true,
    collapsed: true
  };
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function readBoolean(source, key, fallback) {
    return key in source ? Boolean(source[key]) : fallback;
  }
  function isQualityPreference(value) {
    return QUALITY_PREFERENCES.includes(value);
  }
  function clampNumber(value, min, max, fallback) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, numericValue));
  }
  function normalizeSettings(input) {
    const source = isRecord(input) ? input : {};
    return {
      enabled: readBoolean(source, "enabled", DEFAULT_SETTINGS.enabled),
      intervalMs: Math.round(
        clampNumber(source.intervalMs, 200, 1e4, DEFAULT_SETTINGS.intervalMs)
      ),
      minPausedSeconds: clampNumber(
        source.minPausedSeconds,
        0,
        30,
        DEFAULT_SETTINGS.minPausedSeconds
      ),
      autoSkipAds: readBoolean(
        source,
        "autoSkipAds",
        DEFAULT_SETTINGS.autoSkipAds
      ),
      preferredQuality: isQualityPreference(source.preferredQuality) ? source.preferredQuality : DEFAULT_SETTINGS.preferredQuality,
      avoidTyping: readBoolean(
        source,
        "avoidTyping",
        DEFAULT_SETTINGS.avoidTyping
      ),
      avoidEnded: readBoolean(
        source,
        "avoidEnded",
        DEFAULT_SETTINGS.avoidEnded
      ),
      collapsed: readBoolean(source, "collapsed", DEFAULT_SETTINGS.collapsed)
    };
  }
  function createSettingsStore(options = {}) {
    const storage = options.storage ?? window.localStorage;
    const prefix = options.prefix ?? SETTINGS_STORAGE_PREFIX;
    const key = `${prefix}settings`;
    let current = normalizeSettings(null);
    function loadRaw() {
      try {
        const raw = storage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }
    function saveRaw(settings) {
      try {
        storage.setItem(key, JSON.stringify(settings));
        return true;
      } catch {
        return false;
      }
    }
    function reload() {
      current = normalizeSettings(loadRaw());
      return current;
    }
    function get() {
      return current;
    }
    function save(next) {
      current = normalizeSettings(next);
      const persisted = saveRaw(current);
      return { persisted, settings: current };
    }
    reload();
    return { key, get, reload, save };
  }

  // src/core/time.ts
  function nowText(date = /* @__PURE__ */ new Date()) {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  }

  // src/core/typing.ts
  function getDeepActiveElement(documentRef = document) {
    let activeElement = documentRef.activeElement;
    const visitedElements = /* @__PURE__ */ new Set();
    while (activeElement && !visitedElements.has(activeElement)) {
      visitedElements.add(activeElement);
      const nestedActiveElement = activeElement.shadowRoot?.activeElement ?? null;
      if (!nestedActiveElement) {
        break;
      }
      activeElement = nestedActiveElement;
    }
    return activeElement;
  }
  function isTypingContext(documentRef = document) {
    const activeElement = getDeepActiveElement(documentRef);
    if (!activeElement) {
      return false;
    }
    const tagName = activeElement.tagName.toLowerCase();
    if (tagName === "input" || tagName === "textarea" || tagName === "select") {
      return true;
    }
    return "isContentEditable" in activeElement && activeElement.isContentEditable === true;
  }

  // src/youtube/player.ts
  var PLAYER_SELECTOR = "#movie_player, .html5-video-player";
  var ACTIVE_SHORTS_SELECTOR = [
    "ytd-reel-video-renderer[is-active]",
    "ytd-reel-video-renderer[active]"
  ].join(", ");
  var MINIPLAYER_SELECTOR = "ytd-miniplayer, .ytdMiniplayerComponentHost";
  function hasHiddenStyle(element) {
    const view = element.ownerDocument.defaultView;
    if (!view) {
      return false;
    }
    let current = element;
    while (current) {
      const style = view.getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  }
  function getViewportArea(element, documentRef) {
    if (hasHiddenStyle(element)) {
      return 0;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return 0;
    }
    const view = documentRef.defaultView;
    const viewportWidth = view?.innerWidth ?? documentRef.documentElement.clientWidth;
    const viewportHeight = view?.innerHeight ?? documentRef.documentElement.clientHeight;
    if (viewportWidth <= 0 || viewportHeight <= 0) {
      return rect.width * rect.height;
    }
    const visibleWidth = Math.max(
      0,
      Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0)
    );
    const visibleHeight = Math.max(
      0,
      Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0)
    );
    return visibleWidth * visibleHeight;
  }
  function isFullscreenPlayer(player, fullscreenElement) {
    return Boolean(
      fullscreenElement && (player === fullscreenElement || player.contains(fullscreenElement) || fullscreenElement.contains(player))
    );
  }
  function getPlayerScore(context, documentRef) {
    const playerArea = getViewportArea(context.player, documentRef);
    const videoArea = getViewportArea(context.video, documentRef);
    const visibleArea = Math.min(playerArea, videoArea);
    const pathname = documentRef.location.pathname;
    const isWatchPlayer = pathname === "/watch" && context.player.closest("ytd-watch-flexy") !== null;
    const isActiveShortPlayer = (pathname === "/shorts" || pathname.startsWith("/shorts/")) && context.player.closest(ACTIVE_SHORTS_SELECTOR) !== null;
    const isMiniplayer = context.player.closest(MINIPLAYER_SELECTOR) !== null;
    const isFullscreen = isFullscreenPlayer(
      context.player,
      documentRef.fullscreenElement
    );
    if (!isWatchPlayer && !isActiveShortPlayer && !isMiniplayer && !isFullscreen) {
      return Number.NEGATIVE_INFINITY;
    }
    let score = Math.max(visibleArea, 0);
    if (isMiniplayer) {
      score += 2e12;
    }
    if (isWatchPlayer || isActiveShortPlayer) {
      score += 3e12;
    }
    if (isFullscreen) {
      score += 4e12;
    }
    return score;
  }
  function resolveActivePlayerContext(documentRef = document) {
    let activeContext = null;
    let activeScore = Number.NEGATIVE_INFINITY;
    const players = Array.from(
      documentRef.querySelectorAll(PLAYER_SELECTOR)
    );
    for (const player of players) {
      const video = player.querySelector("video.html5-main-video") ?? player.querySelector("video");
      if (!video) {
        continue;
      }
      const context = { player, video };
      const score = getPlayerScore(context, documentRef);
      if (score > activeScore) {
        activeContext = context;
        activeScore = score;
      }
    }
    return activeContext;
  }
  function isPlayerShowingAd(player) {
    return player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting");
  }
  function getPlayerPlaybackQuality(player) {
    if (!player.getPlaybackQuality) {
      return null;
    }
    try {
      const quality = player.getPlaybackQuality();
      return typeof quality === "string" ? quality : null;
    } catch {
      return null;
    }
  }
  function getPlayerAvailableQualityLevels(player) {
    if (!player.getAvailableQualityLevels) {
      return null;
    }
    try {
      const levels = player.getAvailableQualityLevels();
      if (!Array.isArray(levels)) {
        return null;
      }
      return levels.filter((level) => typeof level === "string");
    } catch {
      return null;
    }
  }
  function setPlayerPlaybackQuality(player, quality) {
    let applied = false;
    try {
      if (player.setPlaybackQualityRange) {
        player.setPlaybackQualityRange(quality, quality);
        applied = true;
      }
    } catch {
    }
    try {
      if (player.setPlaybackQuality) {
        player.setPlaybackQuality(quality);
        applied = true;
      }
    } catch {
    }
    return applied;
  }

  // src/youtube/ads.ts
  var SKIP_AD_SELECTOR = [
    ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-slot button",
    ".ytp-skip-ad-button",
    ".videoAdUiSkipButton",
    ".ytp-ad-text.ytp-ad-skip-button-text"
  ].join(", ");
  var PLAYBACK_ENFORCEMENT_SELECTOR = "#error-screen ytd-enforcement-message-view-model[in-player]";
  var DEFAULT_COOLDOWN_MS = 750;
  var DEFAULT_SAME_CONTROL_RETRY_MS = 1500;
  function isDisabled(element) {
    return element.getAttribute("aria-disabled") === "true" || "disabled" in element && Boolean(element.disabled);
  }
  function hasInteractionBlocker(element) {
    const view = element.ownerDocument.defaultView;
    if (!view) {
      return true;
    }
    if (view.getComputedStyle(element).pointerEvents === "none") {
      return true;
    }
    let current = element;
    while (current) {
      const style = view.getComputedStyle(current);
      if (current.hasAttribute("hidden") || current.hasAttribute("inert") || current.getAttribute("aria-disabled") === "true" || current.getAttribute("aria-hidden") === "true" || "disabled" in current && Boolean(current.disabled) || style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  }
  function findInteractiveElement(root, selector) {
    const elements = Array.from(root.querySelectorAll(selector));
    for (const candidate of elements) {
      const closestControl = candidate.closest(
        'button, [role="button"]'
      );
      const element = closestControl && root.contains(closestControl) ? closestControl : candidate;
      if (typeof element.click === "function" && !isDisabled(element) && isElementVisible(element)) {
        return element;
      }
    }
    return null;
  }
  function findSkipAdButton(player) {
    return findInteractiveElement(player, SKIP_AD_SELECTOR);
  }
  function isElementVisible(element) {
    if (!element) {
      return false;
    }
    if (!element.isConnected || hasInteractionBlocker(element)) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  function isPlaybackEnforcementVisible(documentRef = document) {
    return isElementVisible(
      documentRef.querySelector(PLAYBACK_ENFORCEMENT_SELECTOR)
    );
  }
  function getAdUiSnapshot(options = {}) {
    const context = (options.getPlayerContext ?? (() => resolveActivePlayerContext(options.document ?? document)))();
    if (!context) {
      return {
        canSkipAd: false
      };
    }
    return {
      canSkipAd: findSkipAdButton(context.player) !== null
    };
  }
  function createAdSkipper(options = {}) {
    const getSettings = options.getSettings ?? (() => ({ autoSkipAds: DEFAULT_SETTINGS.autoSkipAds }));
    const onAction = options.onAction ?? (() => void 0);
    const getPlayerContext = options.getPlayerContext ?? (() => resolveActivePlayerContext(options.document ?? document));
    const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    const sameControlRetryMs = Math.max(
      cooldownMs,
      options.sameControlRetryMs ?? DEFAULT_SAME_CONTROL_RETRY_MS
    );
    const getNow = options.now ?? Date.now;
    let lastAutomaticallyClickedControl = null;
    let lastAdActionAt = Number.NEGATIVE_INFINITY;
    function createResult(acted) {
      return { acted };
    }
    function clickControl(control, force, currentTime, message) {
      if (!force && lastAutomaticallyClickedControl === control && currentTime - lastAdActionAt < sameControlRetryMs) {
        return createResult(false);
      }
      control.click();
      lastAutomaticallyClickedControl = control;
      lastAdActionAt = currentTime;
      onAction(message);
      return createResult(true);
    }
    function trySkipAdsIfPossible(attemptOptions = {}) {
      const force = attemptOptions.force === true;
      if (!getSettings().autoSkipAds && !force) {
        lastAutomaticallyClickedControl = null;
        return createResult(false);
      }
      const currentTime = getNow();
      if (!force && currentTime - lastAdActionAt < cooldownMs) {
        return createResult(false);
      }
      const context = getPlayerContext();
      if (!context) {
        lastAutomaticallyClickedControl = null;
        if (force) {
          onAction("手动跳过：未找到 YouTube 提供的广告控件");
        }
        return createResult(false);
      }
      const skipButton = findSkipAdButton(context.player);
      if (skipButton) {
        return clickControl(
          skipButton,
          force,
          currentTime,
          "检测到 YouTube 跳过按钮，已点击"
        );
      }
      if (force) {
        onAction("手动跳过：当前广告没有可用的官方跳过按钮");
      }
      lastAutomaticallyClickedControl = null;
      return createResult(false);
    }
    return { trySkipAdsIfPossible };
  }

  // src/youtube/quality.ts
  var AVAILABLE_QUALITY_PRIORITY = [
    "highres",
    "hd4320",
    "hd2880",
    "hd2160",
    "hd1440",
    "hd1080",
    "hd720",
    "large",
    "medium",
    "small",
    "tiny"
  ];
  var DEFAULT_THROTTLE_MS = 5e3;
  function getQualityLabel(quality) {
    const labels = {
      auto: "YouTube 自动",
      hd4320: "4320p",
      hd2880: "2880p",
      hd2160: "2160p",
      hd1440: "1440p",
      hd1080: "1080p",
      hd720: "720p",
      large: "480p",
      medium: "360p",
      small: "240p",
      tiny: "144p"
    };
    return labels[quality] ?? quality;
  }
  function resolvePreferredQuality(preference, levels) {
    if (preference === "auto") {
      return preference;
    }
    if (!levels?.length) {
      return null;
    }
    if (levels.includes(preference)) {
      return preference;
    }
    const preferenceIndex = AVAILABLE_QUALITY_PRIORITY.indexOf(preference);
    if (preferenceIndex === -1) {
      return null;
    }
    return AVAILABLE_QUALITY_PRIORITY.slice(preferenceIndex + 1).find((quality) => levels.includes(quality)) ?? null;
  }
  function createQualityManager(options) {
    const getSettings = options.getSettings ?? (() => ({ preferredQuality: DEFAULT_SETTINGS.preferredQuality }));
    const getAvailableQualityLevels = options.getAvailableQualityLevels ?? getPlayerAvailableQualityLevels;
    const getPlaybackQuality = options.getPlaybackQuality ?? getPlayerPlaybackQuality;
    const setPlaybackQuality = options.setPlaybackQuality ?? setPlayerPlaybackQuality;
    const onAction = options.onAction ?? (() => void 0);
    const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
    const getNow = options.now ?? Date.now;
    let lastPlayer = null;
    let lastAppliedPreference = null;
    let lastAttemptAt = Number.NEGATIVE_INFINITY;
    let lastRequestedPreference = null;
    function trySetPreferredQualityIfPossible(attemptOptions = {}) {
      const force = attemptOptions.force === true;
      const preference = getSettings().preferredQuality;
      const context = options.getPlayerContext();
      if (!context || isPlayerShowingAd(context.player)) {
        return false;
      }
      if (lastPlayer !== context.player) {
        lastPlayer = context.player;
        lastAppliedPreference = null;
        lastAttemptAt = Number.NEGATIVE_INFINITY;
        lastRequestedPreference = null;
      }
      if (lastRequestedPreference !== preference) {
        lastAppliedPreference = null;
        lastAttemptAt = Number.NEGATIVE_INFINITY;
        lastRequestedPreference = preference;
      }
      const currentTime = getNow();
      if (!force && currentTime - lastAttemptAt < throttleMs) {
        return false;
      }
      lastAttemptAt = currentTime;
      const targetQuality = resolvePreferredQuality(
        preference,
        getAvailableQualityLevels(context.player)
      );
      if (!targetQuality || preference === "auto" && lastAppliedPreference === preference || preference !== "auto" && getPlaybackQuality(context.player) === targetQuality) {
        return false;
      }
      if (!setPlaybackQuality(context.player, targetQuality)) {
        return false;
      }
      lastAppliedPreference = preference;
      onAction(`已尝试将画质调为：${getQualityLabel(targetQuality)}`);
      return true;
    }
    return { trySetPreferredQualityIfPossible };
  }

  // src/appStatus.ts
  function getStateSnapshot(context) {
    const adUi = getAdUiSnapshot({
      getPlayerContext: () => context
    });
    if (!context) {
      return {
        canSkipAd: false,
        currentTime: null,
        ended: null,
        hasVideo: false,
        hasPlaybackEnforcement: isPlaybackEnforcementVisible(),
        paused: null,
        playbackQuality: null,
        readyState: null
      };
    }
    const video = context.video;
    return {
      canSkipAd: adUi.canSkipAd,
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : null,
      ended: video.ended,
      hasVideo: true,
      hasPlaybackEnforcement: isPlaybackEnforcementVisible(),
      paused: video.paused,
      playbackQuality: getPlayerPlaybackQuality(context.player),
      readyState: video.readyState
    };
  }
  function formatAppStatus(context, settings) {
    const snapshot = getStateSnapshot(context);
    if (!snapshot.hasVideo) {
      return [
        "检测到活动视频：否",
        `YouTube 播放限制提示：${snapshot.hasPlaybackEnforcement ? "已显示" : "无"}`,
        "提示：当前页面没有受支持的 YouTube 播放器"
      ].join("\n");
    }
    return [
      "检测到活动视频：是",
      `暂停：${snapshot.paused ? "是" : "否"}`,
      `结束：${snapshot.ended ? "是" : "否"}`,
      `播放位置：${snapshot.currentTime === null ? "-" : snapshot.currentTime.toFixed(1)}`,
      `可点击跳过按钮：${snapshot.canSkipAd ? "是" : "否"}`,
      `YouTube 播放限制提示：${snapshot.hasPlaybackEnforcement ? "已显示" : "无"}`,
      `目标画质：${getQualityLabel(settings.preferredQuality)}`,
      `当前画质：${snapshot.playbackQuality ?? "-"}`,
      `检测间隔：${settings.intervalMs}ms`,
      `暂停阈值：${settings.minPausedSeconds}s`
    ].join("\n");
  }

  // src/ui/panelMount.ts
  function applyHostStyles(host) {
    const styles = [
      ["position", "fixed"],
      ["right", "calc(16px + env(safe-area-inset-right, 0px))"],
      ["bottom", "calc(16px + env(safe-area-inset-bottom, 0px))"],
      ["left", "auto"],
      ["top", "auto"],
      ["z-index", "2147483647"],
      ["display", "block"],
      ["visibility", "visible"],
      ["opacity", "1"],
      ["width", "max-content"],
      ["height", "max-content"],
      ["min-width", "48px"],
      ["min-height", "48px"],
      [
        "max-width",
        "calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))"
      ],
      [
        "max-height",
        "calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))"
      ],
      ["margin", "0"],
      ["padding", "0"],
      ["border", "0"],
      ["overflow", "visible"],
      ["pointer-events", "auto"],
      ["isolation", "isolate"]
    ];
    for (const [property, value] of styles) {
      if (host.style.getPropertyValue(property) !== value || host.style.getPropertyPriority(property) !== "important") {
        host.style.setProperty(property, value, "important");
      }
    }
  }
  function resolvePanelMountTarget(documentRef = document) {
    return documentRef.fullscreenElement ?? documentRef.body ?? documentRef.documentElement;
  }

  // src/ui/fabAuroraMotion.ts
  var INTRO_BLUR_KEYFRAMES = [
    { offset: 0, value: 1 },
    { offset: 0.15, value: 5 },
    { offset: 0.25, value: 3 },
    { offset: 0.45, value: 5 },
    { offset: 1, value: 4 }
  ];
  function clampProgress(progress) {
    return Math.min(Math.max(progress, 0), 1);
  }
  function easeOutCubic(progress) {
    return 1 - (1 - progress) ** 3;
  }
  function smoothstep(progress) {
    return progress * progress * (3 - 2 * progress);
  }
  function interpolateKeyframes(progress, keyframes) {
    const first = keyframes[0];
    if (!first) {
      return 0;
    }
    for (let index = 1; index < keyframes.length; index += 1) {
      const next = keyframes[index];
      if (!next || progress > next.offset) {
        continue;
      }
      const previous = keyframes[index - 1] ?? first;
      const span = next.offset - previous.offset;
      if (span <= 0) {
        return next.value;
      }
      const localProgress = (progress - previous.offset) / span;
      return previous.value + (next.value - previous.value) * localProgress;
    }
    return keyframes[keyframes.length - 1]?.value ?? first.value;
  }
  function approachExponentially(current, target, response, deltaSeconds) {
    const progress = 1 - Math.exp(-response * deltaSeconds);
    return current + (target - current) * progress;
  }
  function formatCssNumber(value) {
    const normalizedValue = Math.abs(value) < 5e-5 ? 0 : value;
    return String(Number(normalizedValue.toFixed(4)));
  }
  function shortestAngleDelta(from, to) {
    const difference = to - from;
    const delta = ((difference + 180) % 360 + 360) % 360 - 180;
    return delta === -180 && difference < 0 ? 180 : delta;
  }
  function resolveFabAuroraIntroFrame(progress) {
    const clampedProgress = clampProgress(progress);
    const angleProgress = easeOutCubic(clampedProgress);
    const expansionProgress = clampProgress(
      (clampedProgress - 0.68) / 0.32
    );
    const opacity = clampedProgress < 0.22 ? easeOutCubic(clampedProgress / 0.22) : 1;
    return {
      blurPx: interpolateKeyframes(clampedProgress, INTRO_BLUR_KEYFRAMES),
      focus: 1 - smoothstep(expansionProgress),
      gradientAngle: 170 + 55 * angleProgress,
      maskAngle: -90 + 290 * angleProgress,
      opacity
    };
  }

  // src/ui/fabAurora.ts
  var INTRO_DURATION_MS = 1100;
  var MASK_ANGLE_OFFSET = 167;
  var GRADIENT_ANGLE_OFFSET = 142;
  var MOTION_QUERY = "(prefers-reduced-motion: reduce)";
  var ANGLE_STIFFNESS = 140;
  var ANGLE_DAMPING = 20;
  var GRADIENT_RESPONSE = 8;
  var FOCUS_IN_STIFFNESS = 180;
  var FOCUS_IN_DAMPING = 27;
  var FOCUS_OUT_STIFFNESS = 120;
  var FOCUS_OUT_DAMPING = 22;
  var OPACITY_RESPONSE = 14;
  function createSpan(className) {
    const element = document.createElement("span");
    element.className = className;
    return element;
  }
  function createAuroraClip(isSharp) {
    const clip = createSpan("fab-aurora-clip");
    const mask = createSpan("fab-aurora-mask");
    const gradient = createSpan("fab-aurora-gradient");
    if (isSharp) {
      clip.classList.add("fab-aurora-clip-sharp");
    }
    mask.appendChild(gradient);
    clip.appendChild(mask);
    return clip;
  }
  function mountFabAurora(button, icon) {
    const shell = createSpan("fab-aurora");
    const motion = createSpan("fab-aurora-motion");
    const stack = createSpan("fab-aurora-stack");
    const softClip = createAuroraClip(false);
    const sharpClip = createAuroraClip(true);
    const surface = createSpan("fab-surface");
    const content = createSpan("fab-content");
    const motionPreference = window.matchMedia(MOTION_QUERY);
    shell.setAttribute("aria-hidden", "true");
    surface.setAttribute("aria-hidden", "true");
    stack.append(softClip, sharpClip);
    motion.appendChild(stack);
    shell.appendChild(motion);
    content.appendChild(icon);
    button.replaceChildren(shell, surface, content);
    let bounds = null;
    let targetAngle = 0;
    let maskAngle = 0;
    let gradientAngle = 0;
    let angularVelocity = 0;
    let focus = 0;
    let focusTarget = 0;
    let focusVelocity = 0;
    let motionOpacity = 0;
    let frameId = 0;
    let lastFrameAt = null;
    let motionMode = "idle";
    let introStartedAt = null;
    let isPointerInside = false;
    let isVisible = false;
    let hasPlayedIntro = false;
    let isDestroyed = false;
    function writePercentageProperty(property, value) {
      motion.style.setProperty(property, `${formatCssNumber(value)}%`);
    }
    function writeFocus(nextFocus) {
      const clampedFocus = clampProgress(nextFocus);
      const visualFocus = smoothstep(clampedFocus);
      motion.style.setProperty(
        "--ytar-fab-aurora-focus",
        formatCssNumber(visualFocus)
      );
      writePercentageProperty(
        "--ytar-fab-aurora-soft-fade-start",
        50 * visualFocus
      );
      writePercentageProperty(
        "--ytar-fab-aurora-soft-solid-start",
        68 * visualFocus
      );
      writePercentageProperty(
        "--ytar-fab-aurora-soft-solid-end",
        100 - 25 * visualFocus
      );
      writePercentageProperty(
        "--ytar-fab-aurora-soft-fade-end",
        100 - 11 * visualFocus
      );
      writePercentageProperty(
        "--ytar-fab-aurora-sharp-fade-start",
        62 * visualFocus
      );
      writePercentageProperty(
        "--ytar-fab-aurora-sharp-solid-start",
        82 * visualFocus
      );
      writePercentageProperty(
        "--ytar-fab-aurora-sharp-solid-end",
        100 - 18 * visualFocus
      );
      writePercentageProperty(
        "--ytar-fab-aurora-sharp-fade-end",
        100 - 11 * visualFocus
      );
    }
    function writeVisualState() {
      motion.style.opacity = formatCssNumber(motionOpacity);
      writeFocus(focus);
      motion.style.setProperty(
        "--ytar-fab-aurora-mask-angle",
        `${formatCssNumber(maskAngle + MASK_ANGLE_OFFSET)}deg`
      );
      motion.style.setProperty(
        "--ytar-fab-aurora-gradient-angle",
        `${formatCssNumber(gradientAngle + GRADIENT_ANGLE_OFFSET)}deg`
      );
    }
    function writeIntroFrame(frame) {
      focus = frame.focus;
      focusTarget = 0;
      motionOpacity = frame.opacity;
      maskAngle = frame.maskAngle - MASK_ANGLE_OFFSET;
      gradientAngle = frame.gradientAngle - GRADIENT_ANGLE_OFFSET;
      motion.style.opacity = formatCssNumber(frame.opacity);
      writeFocus(frame.focus);
      motion.style.setProperty(
        "--ytar-fab-aurora-mask-angle",
        `${formatCssNumber(frame.maskAngle)}deg`
      );
      motion.style.setProperty(
        "--ytar-fab-aurora-gradient-angle",
        `${formatCssNumber(frame.gradientAngle)}deg`
      );
      softClip.style.filter = `blur(${formatCssNumber(frame.blurPx)}px)`;
    }
    function cancelFrame() {
      if (frameId === 0) {
        return;
      }
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
    function scheduleFrame() {
      if (frameId !== 0 || isDestroyed) {
        return;
      }
      frameId = requestAnimationFrame(renderFrame);
    }
    function renderTrackingFrame(timestamp) {
      const deltaSeconds = lastFrameAt === null ? 1 / 60 : Math.min(Math.max((timestamp - lastFrameAt) / 1e3, 0), 0.05);
      lastFrameAt = timestamp;
      angularVelocity += shortestAngleDelta(maskAngle, targetAngle) * ANGLE_STIFFNESS * deltaSeconds;
      angularVelocity *= Math.exp(-ANGLE_DAMPING * deltaSeconds);
      maskAngle += angularVelocity * deltaSeconds;
      gradientAngle = approachExponentially(
        gradientAngle,
        gradientAngle + shortestAngleDelta(gradientAngle, targetAngle),
        GRADIENT_RESPONSE,
        deltaSeconds
      );
      const focusStiffness = focusTarget === 1 ? FOCUS_IN_STIFFNESS : FOCUS_OUT_STIFFNESS;
      const focusDamping = focusTarget === 1 ? FOCUS_IN_DAMPING : FOCUS_OUT_DAMPING;
      focusVelocity += ((focusTarget - focus) * focusStiffness - focusVelocity * focusDamping) * deltaSeconds;
      focus = clampProgress(focus + focusVelocity * deltaSeconds);
      motionOpacity = approachExponentially(
        motionOpacity,
        1,
        OPACITY_RESPONSE,
        deltaSeconds
      );
      const maskDelta = Math.abs(shortestAngleDelta(maskAngle, targetAngle));
      const gradientDelta = Math.abs(
        shortestAngleDelta(gradientAngle, targetAngle)
      );
      const isAngleSettled = maskDelta < 0.05 && gradientDelta < 0.05 && Math.abs(angularVelocity) < 0.05;
      const isFocusSettled = Math.abs(focusTarget - focus) < 1e-3 && Math.abs(focusVelocity) < 0.01;
      const isOpacitySettled = Math.abs(1 - motionOpacity) < 1e-3;
      if (isAngleSettled) {
        maskAngle = targetAngle;
        gradientAngle = targetAngle;
        angularVelocity = 0;
      }
      if (isFocusSettled) {
        focus = focusTarget;
        focusVelocity = 0;
      }
      if (isOpacitySettled) {
        motionOpacity = 1;
      }
      writeVisualState();
      if (!isAngleSettled || !isFocusSettled || !isOpacitySettled) {
        scheduleFrame();
        return;
      }
      lastFrameAt = null;
      if (!isPointerInside && focus === 0) {
        motionMode = "idle";
      }
    }
    function renderFrame(timestamp) {
      frameId = 0;
      if (motionMode === "intro") {
        introStartedAt ??= timestamp;
        const progress = (timestamp - introStartedAt) / INTRO_DURATION_MS;
        writeIntroFrame(resolveFabAuroraIntroFrame(progress));
        if (progress < 1) {
          scheduleFrame();
          return;
        }
        motionMode = "idle";
        introStartedAt = null;
        lastFrameAt = null;
        softClip.style.removeProperty("filter");
        writeVisualState();
        return;
      }
      if (motionMode === "tracking") {
        renderTrackingFrame(timestamp);
      }
    }
    function updateTargetAngle(event) {
      if (!bounds) {
        return;
      }
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      targetAngle = Math.atan2(
        event.clientY - centerY,
        event.clientX - centerX
      ) * 180 / Math.PI;
      if (motionMode === "tracking") {
        scheduleFrame();
      }
    }
    function setIdleState() {
      motionMode = "idle";
      introStartedAt = null;
      lastFrameAt = null;
      angularVelocity = 0;
      focus = 0;
      focusTarget = 0;
      focusVelocity = 0;
      motionOpacity = 1;
      bounds = null;
      button.removeEventListener("pointermove", updateTargetAngle);
      cancelFrame();
      softClip.style.removeProperty("filter");
      writeVisualState();
    }
    function activateHover() {
      focusTarget = 1;
      if (motionPreference.matches) {
        motionMode = "idle";
        focus = 1;
        focusVelocity = 0;
        motionOpacity = 1;
        maskAngle = targetAngle;
        gradientAngle = targetAngle;
        angularVelocity = 0;
        writeVisualState();
        return;
      }
      motionMode = "tracking";
      lastFrameAt = null;
      button.addEventListener("pointermove", updateTargetAngle);
      scheduleFrame();
    }
    function startIntro() {
      if (hasPlayedIntro || !isVisible || isDestroyed) {
        setIdleState();
        return;
      }
      hasPlayedIntro = true;
      if (motionPreference.matches) {
        setIdleState();
        return;
      }
      motionMode = "intro";
      introStartedAt = null;
      lastFrameAt = null;
      angularVelocity = 0;
      focusVelocity = 0;
      writeIntroFrame(resolveFabAuroraIntroFrame(0));
      scheduleFrame();
    }
    function showAurora(event) {
      if (event.pointerType === "touch" || isDestroyed || !isVisible) {
        return;
      }
      isPointerInside = true;
      bounds = button.getBoundingClientRect();
      updateTargetAngle(event);
      button.removeEventListener("pointermove", updateTargetAngle);
      cancelFrame();
      introStartedAt = null;
      lastFrameAt = null;
      softClip.style.removeProperty("filter");
      activateHover();
    }
    function hideAurora() {
      if (!isPointerInside) {
        return;
      }
      isPointerInside = false;
      bounds = null;
      button.removeEventListener("pointermove", updateTargetAngle);
      if (isDestroyed || !isVisible) {
        setIdleState();
        return;
      }
      if (motionPreference.matches) {
        setIdleState();
        return;
      }
      focusTarget = 0;
      motionMode = "tracking";
      lastFrameAt = null;
      scheduleFrame();
    }
    function handleMotionPreferenceChange() {
      const shouldRestoreHover = isVisible && isPointerInside;
      cancelFrame();
      button.removeEventListener("pointermove", updateTargetAngle);
      introStartedAt = null;
      lastFrameAt = null;
      softClip.style.removeProperty("filter");
      if (!shouldRestoreHover) {
        setIdleState();
        return;
      }
      bounds = button.getBoundingClientRect();
      activateHover();
    }
    function resetInteraction() {
      if (isDestroyed) {
        return;
      }
      isPointerInside = false;
      setIdleState();
    }
    function setVisible(nextIsVisible) {
      if (isDestroyed || isVisible === nextIsVisible) {
        return;
      }
      isVisible = nextIsVisible;
      if (!isVisible) {
        isPointerInside = false;
        setIdleState();
        return;
      }
      startIntro();
    }
    function destroy() {
      if (isDestroyed) {
        return;
      }
      isDestroyed = true;
      isPointerInside = false;
      setIdleState();
      button.removeEventListener("pointerenter", showAurora);
      button.removeEventListener("pointerleave", hideAurora);
      button.removeEventListener("pointercancel", hideAurora);
      motionPreference.removeEventListener("change", handleMotionPreferenceChange);
    }
    button.addEventListener("pointerenter", showAurora);
    button.addEventListener("pointerleave", hideAurora);
    button.addEventListener("pointercancel", hideAurora);
    motionPreference.addEventListener("change", handleMotionPreferenceChange);
    return {
      destroy,
      resetInteraction,
      setVisible
    };
  }

  // src/ui/icons.ts
  var SVG_NS = "http://www.w3.org/2000/svg";
  var ICON_DEFINITIONS = {
    bolt: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      paths: ["M13 2L3 14h9l-1 8 10-12h-9l1-8z"]
    },
    x: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      paths: ["M6 6l12 12", "M18 6L6 18"]
    },
    play: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      paths: ["M8.5 5.5v13l11-6.5-11-6.5z"]
    },
    forward: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      paths: ["M13 5l7 7-7 7", "M4 5l7 7-7 7"]
    }
  };
  function createIcon(name) {
    const definition = ICON_DEFINITIONS[name];
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", definition.viewBox);
    svg.setAttribute("fill", definition.fill);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    if ("stroke" in definition) {
      svg.setAttribute("stroke", definition.stroke);
    }
    if ("strokeWidth" in definition) {
      svg.setAttribute("stroke-width", definition.strokeWidth);
    }
    if ("strokeLinecap" in definition) {
      svg.setAttribute("stroke-linecap", definition.strokeLinecap);
    }
    if ("strokeLinejoin" in definition) {
      svg.setAttribute("stroke-linejoin", definition.strokeLinejoin);
    }
    for (const pathData of definition.paths) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", pathData);
      svg.appendChild(path);
    }
    return svg;
  }

  // src/ui/panelControls.ts
  function createLabel(id, title, description) {
    const label = document.createElement("label");
    const key = document.createElement("div");
    const detail = document.createElement("div");
    label.className = "label";
    label.htmlFor = id;
    key.className = "label-key";
    key.id = `${id}-label`;
    key.textContent = title;
    detail.className = "label-description";
    detail.id = `${id}-description`;
    detail.textContent = description;
    label.append(key, detail);
    return label;
  }
  function createSwitchRow(id, title, description) {
    const row = document.createElement("div");
    const control = document.createElement("label");
    const input = document.createElement("input");
    const track = document.createElement("span");
    const thumb = document.createElement("span");
    row.className = "row";
    control.className = "switch";
    input.id = id;
    input.type = "checkbox";
    input.setAttribute("aria-labelledby", `${id}-label`);
    input.setAttribute("aria-describedby", `${id}-description`);
    track.className = "track";
    thumb.className = "thumb";
    track.appendChild(thumb);
    control.append(input, track);
    row.append(createLabel(id, title, description), control);
    return { row, input };
  }
  function createNumberRow(id, title, description, min, max, step) {
    const row = document.createElement("div");
    const input = document.createElement("input");
    row.className = "row";
    input.id = id;
    input.className = "number-input";
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.setAttribute("aria-labelledby", `${id}-label`);
    input.setAttribute("aria-describedby", `${id}-description`);
    row.append(createLabel(id, title, description), input);
    return { row, input };
  }
  function createSelectRow(id, title, description) {
    const row = document.createElement("div");
    const select = document.createElement("select");
    row.className = "row";
    select.id = id;
    select.className = "select-input";
    for (const quality of QUALITY_PREFERENCES) {
      const option = document.createElement("option");
      option.value = quality;
      option.textContent = getQualityLabel(quality);
      select.append(option);
    }
    row.append(createLabel(id, title, description), select);
    return { row, select };
  }

  // src/ui/panelBaseStyles.ts
  var PANEL_BASE_STYLES = `
  :host {
    all: initial;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  button,
  input,
  select {
    font: inherit;
  }

  .wrap {
    display: block;
    width: max-content;
    max-width: calc(
      100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)
    );
    color: #f1f1f1;
    font-family: "Roboto", "Arial", sans-serif;
    line-height: normal;
  }

  .hidden {
    display: none !important;
  }

  .fab {
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    overflow: visible;
    padding: 0;
    border: 0;
    border-radius: 50%;
    outline: none;
    background: transparent;
    color: #ff0000;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.2s;
  }

  .fab-aurora {
    --ytar-fab-aurora-blur: 4px;
    --ytar-fab-aurora-inset: -1px;
    --ytar-fab-aurora-scale-x: 1;
    --ytar-fab-aurora-scale-y: 1;
    --ytar-fab-aurora-gradient: conic-gradient(
      #3186ff 34%,
      #9378ff 37%,
      #f96bd6 39%,
      #fc413d 41%,
      #fc413d 48%,
      #ff6b2b 50%,
      #fec700 52%,
      #ffdb0f 56%,
      #88de42 58%,
      #0ebc5f 61%,
      #0ebc5f 65%,
      #2eaab2 70%,
      #00a9bb 72%,
      #3186ff 73%,
      #3186ff 83%,
      #3186ff 100%
    );

    position: absolute;
    inset: 0;
    z-index: 0;
    display: block;
    overflow: visible;
    border-radius: 50%;
    pointer-events: none;
  }

  .fab-aurora-motion {
    --ytar-fab-aurora-focus: 0;
    --ytar-fab-aurora-mask-angle: 0deg;
    --ytar-fab-aurora-gradient-angle: 0deg;
    --ytar-fab-aurora-soft-fade-start: 0%;
    --ytar-fab-aurora-soft-solid-start: 0%;
    --ytar-fab-aurora-soft-solid-end: 100%;
    --ytar-fab-aurora-soft-fade-end: 100%;
    --ytar-fab-aurora-sharp-fade-start: 0%;
    --ytar-fab-aurora-sharp-solid-start: 0%;
    --ytar-fab-aurora-sharp-solid-end: 100%;
    --ytar-fab-aurora-sharp-fade-end: 100%;

    position: absolute;
    inset: 0;
    z-index: 1;
    display: block;
    border-radius: inherit;
    opacity: 0;
    will-change:
      --ytar-fab-aurora-mask-angle,
      --ytar-fab-aurora-gradient-angle,
      opacity;
  }

  .fab-aurora-stack,
  .fab-aurora-clip,
  .fab-aurora-mask,
  .fab-aurora-gradient {
    position: absolute;
    display: block;
    border-radius: inherit;
  }

  .fab-aurora-stack,
  .fab-aurora-mask,
  .fab-aurora-gradient {
    inset: 0;
  }

  .fab-aurora-clip {
    inset: var(--ytar-fab-aurora-inset);
    overflow: hidden;
    backface-visibility: hidden;
    filter: blur(var(--ytar-fab-aurora-blur));
    opacity: calc(0.55 + var(--ytar-fab-aurora-focus) * 0.45);
    transform: translateZ(0);
  }

  .fab-aurora-clip-sharp {
    filter: blur(1px);
    opacity: calc(0.9 + var(--ytar-fab-aurora-focus) * 0.1);
  }

  .fab-aurora-mask {
    scale:
      var(--ytar-fab-aurora-scale-x)
      var(--ytar-fab-aurora-scale-y);
    -webkit-mask-image:
      conic-gradient(
        from var(--ytar-fab-aurora-mask-angle),
        transparent 0,
        transparent var(--ytar-fab-aurora-soft-fade-start),
        black var(--ytar-fab-aurora-soft-solid-start),
        black var(--ytar-fab-aurora-soft-solid-end),
        transparent var(--ytar-fab-aurora-soft-fade-end),
        transparent 100%
      );
    mask-image:
      conic-gradient(
        from var(--ytar-fab-aurora-mask-angle),
        transparent 0,
        transparent var(--ytar-fab-aurora-soft-fade-start),
        black var(--ytar-fab-aurora-soft-solid-start),
        black var(--ytar-fab-aurora-soft-solid-end),
        transparent var(--ytar-fab-aurora-soft-fade-end),
        transparent 100%
      );
  }

  .fab-aurora-clip-sharp .fab-aurora-mask {
    -webkit-mask-image:
      conic-gradient(
        from var(--ytar-fab-aurora-mask-angle),
        transparent 0,
        transparent var(--ytar-fab-aurora-sharp-fade-start),
        black var(--ytar-fab-aurora-sharp-solid-start),
        black var(--ytar-fab-aurora-sharp-solid-end),
        transparent var(--ytar-fab-aurora-sharp-fade-end),
        transparent 100%
      );
    mask-image:
      conic-gradient(
        from var(--ytar-fab-aurora-mask-angle),
        transparent 0,
        transparent var(--ytar-fab-aurora-sharp-fade-start),
        black var(--ytar-fab-aurora-sharp-solid-start),
        black var(--ytar-fab-aurora-sharp-solid-end),
        transparent var(--ytar-fab-aurora-sharp-fade-end),
        transparent 100%
      );
  }

  .fab-aurora-gradient {
    rotate: var(--ytar-fab-aurora-gradient-angle);
    backface-visibility: hidden;
    background: var(--ytar-fab-aurora-gradient);
    transform: translateZ(0);
  }

  .fab-surface {
    position: absolute;
    inset: 1px;
    z-index: 1;
    display: block;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    background: rgba(33, 33, 33, 0.96);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
    clip-path: circle(50%);
    pointer-events: none;
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    transition: background-color 0.2s, filter 0.2s;
  }

  .fab-surface::after {
    position: absolute;
    inset: -10px;
    border-radius: inherit;
    background: inherit;
    opacity: 0.5;
    content: "";
  }

  .fab:hover .fab-surface {
    background: rgba(48, 48, 48, 0.98);
    filter: blur(2px);
  }

  .fab-content {
    position: relative;
    z-index: 2;
    display: inline-flex;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .fab:active {
    transform: scale(0.95);
  }

  .fab:focus-visible,
  .icon-button:focus-visible,
  .button:focus-visible,
  .number-input:focus-visible,
  .select-input:focus-visible {
    outline: 2px solid #3ea6ff;
    outline-offset: 2px;
  }

  .switch input:focus-visible + .track {
    outline: 2px solid #3ea6ff;
    outline-offset: 3px;
  }

  .fab-content svg {
    width: 24px;
    height: 24px;
  }

  .panel {
    width: 340px;
    max-width: calc(
      100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)
    );
    max-height: calc(100vh - 32px);
    max-height: calc(
      100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)
    );
    overflow: hidden auto;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    background: #212121;
    box-shadow: 0 16px 32px rgba(0, 0, 0, 0.5);
    color: #f1f1f1;
    transform-origin: bottom right;
  }

  .header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 8px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: inherit;
  }

  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 500;
  }

  .badge {
    display: inline-flex;
    color: #ff0000;
  }

  .badge svg {
    width: 20px;
    height: 20px;
  }

  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    outline: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .icon-button:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .icon-button:active {
    background: rgba(255, 255, 255, 0.2);
  }

  .icon-button svg {
    width: 20px;
    height: 20px;
  }

  .content {
    padding: 12px 16px 16px;
  }

  .grid {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .label {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
    cursor: pointer;
  }

  .label-key {
    font-size: 14px;
    font-weight: 400;
  }

  .label-description {
    color: #aaaaaa;
    font-size: 12px;
  }

  .number-input,
  .select-input {
    width: 80px;
    flex: 0 0 auto;
    padding: 6px 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    outline: none;
    background-color: rgba(0, 0, 0, 0.2);
    color: inherit;
    font-size: 13px;
    text-align: center;
    transition: border-color 0.2s;
  }

  .number-input:focus {
    border-color: #3ea6ff;
  }

  .select-input {
    width: 132px;
    appearance: none;
    padding-right: 30px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23f1f1f1' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-position: right 9px center;
    background-repeat: no-repeat;
    text-align: left;
  }

  .select-input:focus {
    border-color: #3ea6ff;
  }

  .select-input option {
    background: #212121;
    color: #f1f1f1;
  }

  .switch {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    margin-right: 2px;
    cursor: pointer;
  }

  .switch input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .track {
    display: inline-flex;
    width: 36px;
    height: 14px;
    align-items: center;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.2);
    transition: background-color 0.2s;
  }

  .thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #aaaaaa;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
    transform: translateX(-2px);
    transition: background-color 0.2s, transform 0.2s;
  }

  input:checked + .track {
    background: rgba(62, 166, 255, 0.3);
  }

  input:checked + .track .thumb {
    background: #3ea6ff;
    transform: translateX(18px);
  }

  .status {
    margin-top: 16px;
    padding: 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    color: #aaaaaa;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-line;
  }

  .last-action {
    margin-top: 8px;
    color: #aaaaaa;
    font-size: 12px;
    text-align: center;
  }

  .footer {
    display: flex;
    gap: 8px;
    margin-top: 16px;
  }

  .button {
    display: inline-flex;
    min-width: 0;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    border: 0;
    border-radius: 18px;
    outline: none;
    background: rgba(255, 255, 255, 0.1);
    color: #f1f1f1;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .button:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .button:active {
    background: rgba(255, 255, 255, 0.3);
  }

  .button-primary {
    background: #f1f1f1;
    color: #0f0f0f;
  }

  .button-primary:hover {
    background: #d9d9d9;
  }

  .button svg {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
  }

  .fade-in {
    animation: fade-in 0.2s cubic-bezier(0.05, 0, 0, 1);
  }
`;

  // src/ui/panelVariantStyles.ts
  var PANEL_VARIANT_STYLES = `
  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-color-scheme: light) {
    .wrap {
      color: #0f0f0f;
    }

    .fab-surface {
      border-color: rgba(0, 0, 0, 0.1);
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .fab:hover .fab-surface {
      background: rgba(240, 240, 240, 0.98);
    }

    .fab:focus-visible,
    .icon-button:focus-visible,
    .button:focus-visible,
    .number-input:focus-visible,
    .select-input:focus-visible,
    .switch input:focus-visible + .track {
      outline-color: #065fd4;
    }

    .panel {
      border-color: rgba(0, 0, 0, 0.1);
      background: #ffffff;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      color: #0f0f0f;
    }

    .header {
      border-bottom-color: rgba(0, 0, 0, 0.1);
    }

    .icon-button:hover {
      background: rgba(0, 0, 0, 0.05);
    }

    .label-description,
    .last-action {
      color: #606060;
    }

    .number-input,
    .select-input {
      border-color: rgba(0, 0, 0, 0.1);
      background-color: #ffffff;
    }

    .select-input {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%230f0f0f' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    }

    .select-input option {
      background: #ffffff;
      color: #0f0f0f;
    }

    .track {
      background: rgba(0, 0, 0, 0.1);
    }

    .thumb {
      background: #606060;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }

    input:checked + .track {
      background: rgba(6, 95, 212, 0.2);
    }

    input:checked + .track .thumb {
      background: #065fd4;
    }

    .status {
      background: rgba(0, 0, 0, 0.03);
      color: #606060;
    }

    .button {
      background: rgba(0, 0, 0, 0.05);
      color: #0f0f0f;
    }

    .button:hover {
      background: rgba(0, 0, 0, 0.1);
    }

    .button-primary {
      background: #0f0f0f;
      color: #ffffff;
    }

    .button-primary:hover {
      background: #272727;
    }
  }

  @media (max-width: 420px) {
    .footer {
      flex-direction: column;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fab,
    .fab-surface,
    .icon-button,
    .number-input,
    .select-input,
    .track,
    .thumb,
    .button {
      transition: none;
    }

    .fade-in {
      animation: none;
    }

    .fab-aurora-motion {
      will-change: auto;
    }
  }

  @media (forced-colors: active) {
    .fab-aurora {
      display: none;
    }

    .fab-surface {
      border-color: ButtonText;
      background: ButtonFace;
      box-shadow: none;
      filter: none;
    }

    .fab-content {
      color: ButtonText;
    }
  }
`;

  // src/ui/panelStyles.ts
  var PANEL_CSS = [PANEL_BASE_STYLES, PANEL_VARIANT_STYLES].join("\n");

  // src/ui/panelShell.ts
  function createPanelShell(host, options) {
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    const wrap = document.createElement("div");
    const fab = document.createElement("button");
    const panel = document.createElement("div");
    const header = document.createElement("div");
    const title = document.createElement("div");
    const badge = document.createElement("span");
    const titleText = document.createElement("span");
    const close = document.createElement("button");
    const content = document.createElement("div");
    const grid = document.createElement("div");
    const enabled = createSwitchRow(
      "enabled",
      "自动恢复",
      "暂停后自动恢复播放"
    );
    const interval = createNumberRow(
      "interval",
      "检测间隔",
      "单位 ms（200~10000）",
      200,
      1e4,
      100
    );
    const minPaused = createNumberRow(
      "min-paused",
      "暂停阈值",
      "暂停多久才尝试恢复（秒）",
      0,
      30,
      0.5
    );
    const autoSkipAds = createSwitchRow(
      "auto-skip-ads",
      "自动点击跳过按钮",
      "仅点击 YouTube 明确显示的跳过按钮"
    );
    const preferredQuality = createSelectRow(
      "preferred-quality",
      "目标画质",
      "不可用时选择最接近的较低画质"
    );
    const avoidTyping = createSwitchRow(
      "avoid-typing",
      "打字时不干预",
      "避免影响搜索或评论输入"
    );
    const avoidEnded = createSwitchRow(
      "avoid-ended",
      "结束后不重播",
      "视频结束后不自动播放"
    );
    const status = document.createElement("div");
    const lastAction = document.createElement("div");
    const footer = document.createElement("div");
    const resumeNow = document.createElement("button");
    const skipNow = document.createElement("button");
    style.textContent = PANEL_CSS;
    wrap.className = "wrap";
    fab.className = "fab";
    fab.type = "button";
    fab.title = "YouTube Auto Resume";
    fab.setAttribute("aria-label", "打开 YouTube Auto Resume 面板");
    const fabAuroraController = mountFabAurora(fab, createIcon("bolt"));
    panel.className = "panel fade-in";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "YouTube Auto Resume");
    header.className = "header";
    title.className = "title";
    badge.className = "badge";
    badge.appendChild(createIcon("bolt"));
    titleText.textContent = "Auto Resume";
    title.append(badge, titleText);
    close.className = "icon-button";
    close.type = "button";
    close.title = "最小化面板";
    close.setAttribute("aria-label", "最小化面板");
    close.appendChild(createIcon("x"));
    header.append(title, close);
    content.className = "content";
    grid.className = "grid";
    grid.append(
      enabled.row,
      interval.row,
      minPaused.row,
      autoSkipAds.row,
      preferredQuality.row,
      avoidTyping.row,
      avoidEnded.row
    );
    status.className = "status";
    status.textContent = options.statusText;
    lastAction.className = "last-action";
    lastAction.textContent = options.lastActionText;
    lastAction.setAttribute("role", "status");
    lastAction.setAttribute("aria-live", "polite");
    lastAction.setAttribute("aria-atomic", "true");
    footer.className = "footer";
    resumeNow.className = "button button-primary";
    resumeNow.type = "button";
    resumeNow.append(createIcon("play"), "立即恢复");
    skipNow.className = "button";
    skipNow.type = "button";
    skipNow.append(createIcon("forward"), "点击跳过按钮");
    footer.append(resumeNow, skipNow);
    content.append(grid, status, lastAction, footer);
    panel.append(header, content);
    wrap.append(fab, panel);
    shadow.append(style, wrap);
    return {
      shadow,
      fabAuroraController,
      elements: {
        fab,
        panel,
        close,
        enabled: enabled.input,
        interval: interval.input,
        minPaused: minPaused.input,
        autoSkipAds: autoSkipAds.input,
        preferredQuality: preferredQuality.select,
        avoidTyping: avoidTyping.input,
        avoidEnded: avoidEnded.input,
        status,
        lastAction,
        resumeNow,
        skipNow
      }
    };
  }

  // src/ui/panel.ts
  var HOST_ID = "auto-chick-yt-auto-resume-host";
  function createPanelView(options) {
    const onResumeNow = options.onResumeNow ?? (() => void 0);
    const onSkipNow = options.onSkipNow ?? (() => void 0);
    let host = null;
    let shadow = null;
    let elements = null;
    let fabAuroraController = null;
    let mountObserver = null;
    let observedMountTarget = null;
    let statusText = "";
    let currentLastActionText = "";
    let focusReturnTarget = null;
    let hasRendered = false;
    let isDestroyed = false;
    function isExpanded() {
      if (isDestroyed) {
        return false;
      }
      if (!elements) {
        return !options.getSettings().collapsed;
      }
      return !elements.panel.classList.contains("hidden");
    }
    function setTextIfChanged(element, text) {
      if (element.textContent !== text) {
        element.textContent = text;
      }
    }
    function setCheckedIfChanged(input, checked) {
      if (input.checked !== checked) {
        input.checked = checked;
      }
    }
    function setValueIfChanged(input, value) {
      if (input.value !== value) {
        input.value = value;
      }
    }
    function setHiddenIfChanged(element, isHidden) {
      if (element.classList.contains("hidden") !== isHidden) {
        element.classList.toggle("hidden", isHidden);
      }
    }
    function getFocusedElement() {
      const shadowActiveElement = shadow?.activeElement;
      if (shadowActiveElement instanceof HTMLElement) {
        return shadowActiveElement;
      }
      return document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    function restoreFocusAfterCollapse() {
      const nextFocusTarget = focusReturnTarget;
      focusReturnTarget = null;
      if (nextFocusTarget?.isConnected && nextFocusTarget !== host) {
        nextFocusTarget.focus();
        return;
      }
      elements?.fab.focus();
    }
    function observeMountTarget(target) {
      if (!mountObserver || observedMountTarget === target) {
        return;
      }
      mountObserver.disconnect();
      mountObserver.observe(target, { childList: true });
      observedMountTarget = target;
    }
    function moveHostToCurrentTarget() {
      if (!host) {
        return;
      }
      applyHostStyles(host);
      const target = resolvePanelMountTarget();
      observeMountTarget(target);
      if (host.parentElement === target) {
        return;
      }
      target.appendChild(host);
      fabAuroraController?.resetInteraction();
    }
    function watchMountState() {
      if (mountObserver) {
        return;
      }
      mountObserver = new MutationObserver(() => {
        if (!host) {
          return;
        }
        const target = resolvePanelMountTarget();
        if (!host.isConnected || host.parentElement !== target) {
          moveHostToCurrentTarget();
        }
      });
      observeMountTarget(resolvePanelMountTarget());
      document.addEventListener("fullscreenchange", moveHostToCurrentTarget);
    }
    function setOpen(isOpen) {
      if (isDestroyed) {
        return;
      }
      ensureMounted();
      if (!elements) {
        return;
      }
      const wasOpen = isExpanded();
      if (isOpen && !wasOpen) {
        focusReturnTarget = getFocusedElement();
      }
      if (isOpen === wasOpen) {
        if (isOpen) {
          elements?.close.focus();
          options.onExpanded?.();
        }
        return;
      }
      const result = options.saveSettings({
        ...options.getSettings(),
        collapsed: !isOpen
      });
      render(result.settings, currentLastActionText);
      if (!result.persisted) {
        options.onPanelStatePersistenceFailed?.();
      }
      if (isOpen) {
        elements?.close.focus();
        options.onExpanded?.();
        return;
      }
    }
    function applySettingsFromUi() {
      if (isDestroyed || !elements) {
        return;
      }
      const nextSettings = {
        ...options.getSettings(),
        enabled: elements.enabled.checked,
        intervalMs: Math.round(
          clampNumber(
            elements.interval.value,
            200,
            1e4,
            DEFAULT_SETTINGS.intervalMs
          )
        ),
        minPausedSeconds: clampNumber(
          elements.minPaused.value,
          0,
          30,
          DEFAULT_SETTINGS.minPausedSeconds
        ),
        autoSkipAds: elements.autoSkipAds.checked,
        preferredQuality: isQualityPreference(elements.preferredQuality.value) ? elements.preferredQuality.value : DEFAULT_SETTINGS.preferredQuality,
        avoidTyping: elements.avoidTyping.checked,
        avoidEnded: elements.avoidEnded.checked
      };
      const result = options.saveSettings(nextSettings);
      setValueIfChanged(elements.interval, String(result.settings.intervalMs));
      setValueIfChanged(
        elements.minPaused,
        String(result.settings.minPausedSeconds)
      );
      if (options.onSettingsApplied) {
        options.onSettingsApplied(result);
        return;
      }
      render(result.settings, currentLastActionText);
    }
    function buildPanel() {
      if (isDestroyed) {
        return;
      }
      host = document.createElement("div");
      host.id = HOST_ID;
      host.setAttribute("data-auto-chick-ui", "youtube-auto-resume");
      applyHostStyles(host);
      const panelShell = createPanelShell(host, {
        statusText,
        lastActionText: currentLastActionText
      });
      shadow = panelShell.shadow;
      elements = panelShell.elements;
      fabAuroraController = panelShell.fabAuroraController;
      elements.fab.addEventListener("click", () => setOpen(true));
      elements.close.addEventListener("click", () => setOpen(false));
      elements.enabled.addEventListener("change", applySettingsFromUi);
      elements.interval.addEventListener("change", applySettingsFromUi);
      elements.minPaused.addEventListener("change", applySettingsFromUi);
      elements.autoSkipAds.addEventListener("change", applySettingsFromUi);
      elements.preferredQuality.addEventListener("change", applySettingsFromUi);
      elements.avoidTyping.addEventListener("change", applySettingsFromUi);
      elements.avoidEnded.addEventListener("change", applySettingsFromUi);
      elements.resumeNow.addEventListener("click", onResumeNow);
      elements.skipNow.addEventListener("click", onSkipNow);
      elements.panel.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !isExpanded()) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      });
      render(options.getSettings(), currentLastActionText);
    }
    function ensureMounted() {
      if (isDestroyed) {
        return;
      }
      if (!host) {
        buildPanel();
        watchMountState();
      }
      moveHostToCurrentTarget();
    }
    function setStatus(text) {
      if (isDestroyed) {
        return;
      }
      statusText = text;
      ensureMounted();
      if (elements) {
        setTextIfChanged(elements.status, statusText);
      }
    }
    function setLastActionText(text) {
      if (isDestroyed) {
        return;
      }
      currentLastActionText = text;
      ensureMounted();
      if (elements) {
        setTextIfChanged(elements.lastAction, currentLastActionText);
      }
    }
    function render(settings, nextLastActionText) {
      if (isDestroyed) {
        return;
      }
      ensureMounted();
      if (!elements) {
        return;
      }
      if (typeof nextLastActionText === "string") {
        currentLastActionText = nextLastActionText;
      }
      const wasOpen = hasRendered && isExpanded();
      const isOpen = !settings.collapsed;
      setHiddenIfChanged(elements.panel, !isOpen);
      setHiddenIfChanged(elements.fab, isOpen);
      fabAuroraController?.setVisible(!isOpen);
      setCheckedIfChanged(elements.enabled, settings.enabled);
      if (shadow?.activeElement !== elements.interval) {
        setValueIfChanged(elements.interval, String(settings.intervalMs));
      }
      if (shadow?.activeElement !== elements.minPaused) {
        setValueIfChanged(elements.minPaused, String(settings.minPausedSeconds));
      }
      setCheckedIfChanged(elements.autoSkipAds, settings.autoSkipAds);
      setValueIfChanged(elements.preferredQuality, settings.preferredQuality);
      setCheckedIfChanged(elements.avoidTyping, settings.avoidTyping);
      setCheckedIfChanged(elements.avoidEnded, settings.avoidEnded);
      setTextIfChanged(elements.status, statusText);
      setTextIfChanged(elements.lastAction, currentLastActionText);
      if (wasOpen && !isOpen) {
        restoreFocusAfterCollapse();
      }
      hasRendered = true;
    }
    function open() {
      if (isDestroyed) {
        return;
      }
      setOpen(true);
    }
    function destroy() {
      if (isDestroyed) {
        return;
      }
      isDestroyed = true;
      fabAuroraController?.destroy();
      fabAuroraController = null;
      mountObserver?.disconnect();
      mountObserver = null;
      observedMountTarget = null;
      document.removeEventListener("fullscreenchange", moveHostToCurrentTarget);
      host?.remove();
      host = null;
      shadow = null;
      elements = null;
      focusReturnTarget = null;
      hasRendered = false;
    }
    return {
      destroy,
      ensureMounted,
      setStatus,
      setLastActionText,
      render,
      isExpanded,
      open
    };
  }

  // src/app.ts
  function startYouTubeAutoResumeApp(environment = {}) {
    const store = createSettingsStore({});
    const playbackState = createPlaybackState();
    let settings = store.get();
    let activeContext = null;
    let lastActionText = "尚未执行";
    let timerId = null;
    let timerDueAt = 0;
    let nextResumeAllowedAt = 0;
    let isStopped = false;
    const setLastAction = (text) => {
      if (isStopped) {
        return;
      }
      lastActionText = `${nowText()} ${text}`;
      panel.setLastActionText(lastActionText);
    };
    const saveSettings = (nextSettings) => {
      if (isStopped) {
        return { persisted: false, settings };
      }
      const result = store.save(nextSettings);
      settings = result.settings;
      return result;
    };
    const adSkipper = createAdSkipper({
      getSettings: () => settings,
      getPlayerContext: () => activeContext,
      onAction: setLastAction
    });
    const qualityManager = createQualityManager({
      getSettings: () => settings,
      getPlayerContext: () => activeContext,
      onAction: setLastAction
    });
    const panel = createPanelView({
      getSettings: () => settings,
      onExpanded: () => {
        if (isStopped) {
          return;
        }
        refreshActiveContext();
        updatePanelStatus();
      },
      onPanelStatePersistenceFailed: () => {
        if (isStopped) {
          return;
        }
        setLastAction("面板显示状态已应用，但浏览器未能持久化");
      },
      onResumeNow: () => {
        if (isStopped) {
          return;
        }
        setLastAction("手动触发恢复");
        void tryResume({ force: true });
      },
      onSettingsApplied: (result) => {
        if (isStopped) {
          return;
        }
        settings = result.settings;
        renewActivePlaybackState();
        setLastAction(
          result.persisted ? "设置已保存" : "设置已应用，但浏览器未能持久化"
        );
        panel.render(settings, lastActionText);
        scheduleNextLoop(0);
      },
      onSkipNow: () => {
        if (isStopped) {
          return;
        }
        if (isPlaybackEnforcementVisible()) {
          setLastAction("检测到 YouTube 播放限制提示，未尝试绕过");
          return;
        }
        setLastAction("手动查找 YouTube 跳过按钮");
        adSkipper.trySkipAdsIfPossible({ force: true });
      },
      saveSettings
    });
    function detachVideoListeners(video) {
      video.removeEventListener("emptied", handleVideoSourceChange);
      video.removeEventListener("ended", handleVideoEnded);
      video.removeEventListener("loadedmetadata", handleVideoSourceChange);
      video.removeEventListener("pause", handleVideoPause);
      video.removeEventListener("play", handleVideoPlay);
    }
    function attachVideoListeners(video) {
      video.addEventListener("emptied", handleVideoSourceChange);
      video.addEventListener("ended", handleVideoEnded);
      video.addEventListener("loadedmetadata", handleVideoSourceChange);
      video.addEventListener("pause", handleVideoPause);
      video.addEventListener("play", handleVideoPlay);
    }
    function setActiveContext(nextContext) {
      const previousVideo = activeContext?.video ?? null;
      const nextVideo = nextContext?.video ?? null;
      activeContext = nextContext;
      if (previousVideo === nextVideo) {
        return false;
      }
      if (previousVideo) {
        detachVideoListeners(previousVideo);
      }
      playbackState.activate(nextVideo, Date.now());
      nextResumeAllowedAt = 0;
      if (nextVideo) {
        attachVideoListeners(nextVideo);
      }
      return true;
    }
    function refreshActiveContext() {
      return setActiveContext(resolveActivePlayerContext());
    }
    function renewActivePlaybackState() {
      const video = activeContext?.video;
      if (video) {
        playbackState.renew(video, Date.now());
      }
      nextResumeAllowedAt = 0;
    }
    function updatePanelStatus() {
      if (isStopped || !panel.isExpanded()) {
        return;
      }
      panel.setStatus(formatAppStatus(activeContext, settings));
    }
    function scheduleNextLoop(delay = settings.intervalMs) {
      if (isStopped) {
        return;
      }
      const normalizedDelay = Math.max(0, delay);
      const dueAt = Date.now() + normalizedDelay;
      if (timerId !== null && timerDueAt <= dueAt) {
        return;
      }
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      timerDueAt = dueAt;
      timerId = window.setTimeout(() => {
        timerId = null;
        timerDueAt = 0;
        runLoop();
      }, normalizedDelay);
    }
    function handleVideoPlay(event) {
      const video = event.currentTarget;
      playbackState.markPlaying(video);
      nextResumeAllowedAt = 0;
      updatePanelStatus();
    }
    function handleVideoPause(event) {
      const video = event.currentTarget;
      if (video.ended) {
        playbackState.markPlaying(video);
        return;
      }
      playbackState.markPaused(video, Date.now());
      scheduleNextLoop(settings.minPausedSeconds * 1e3);
      updatePanelStatus();
    }
    function handleVideoEnded(event) {
      playbackState.markPlaying(event.currentTarget);
      updatePanelStatus();
    }
    function handleVideoSourceChange(event) {
      const video = event.currentTarget;
      playbackState.renew(video, Date.now());
      nextResumeAllowedAt = 0;
      scheduleNextLoop(0);
    }
    function handleNavigationStart() {
      setActiveContext(null);
      updatePanelStatus();
    }
    function handleNavigationFinish() {
      scheduleNextLoop(0);
    }
    function handleStorage(event) {
      if (event.key !== null && event.key !== store.key) {
        return;
      }
      settings = store.reload();
      renewActivePlaybackState();
      panel.render(settings, lastActionText);
      scheduleNextLoop(0);
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        scheduleNextLoop(0);
      }
    }
    async function tryResume(options = {}) {
      if (isStopped) {
        return;
      }
      const isForced = options.force === true;
      if (options.shouldRefreshContext !== false) {
        refreshActiveContext();
      }
      updatePanelStatus();
      if (isPlaybackEnforcementVisible() || Boolean(
        activeContext && isPlayerShowingAd(activeContext.player)
      )) {
        if (isForced) {
          setLastAction("广告或播放限制期间不执行恢复播放");
        }
        return;
      }
      const video = activeContext?.video;
      if (!video) {
        return;
      }
      if (!video.paused) {
        playbackState.markPlaying(video);
        return;
      }
      const now = Date.now();
      playbackState.markPaused(video, now);
      if (!settings.enabled && !isForced || settings.avoidTyping && isTypingContext() && !isForced || settings.avoidEnded && video.ended && !isForced || !isForced && video.readyState < 2 || !isForced && now < nextResumeAllowedAt) {
        return;
      }
      const pausedAt = playbackState.getPauseStartedAt(video);
      if (!isForced && pausedAt !== null && (now - pausedAt) / 1e3 < settings.minPausedSeconds) {
        scheduleNextLoop(
          settings.minPausedSeconds * 1e3 - (now - pausedAt)
        );
        return;
      }
      const attempt = playbackState.beginResume(video);
      if (!attempt) {
        return;
      }
      try {
        await video.play();
        if (!playbackState.finishResume(attempt) || isStopped) {
          return;
        }
        playbackState.markPlaying(video);
        nextResumeAllowedAt = 0;
        setLastAction("检测到暂停，已恢复播放");
      } catch {
        if (!playbackState.finishResume(attempt) || isStopped) {
          return;
        }
        nextResumeAllowedAt = Date.now() + Math.max(5e3, settings.intervalMs * 3);
        setLastAction("恢复播放失败，等待浏览器允许后重试");
        scheduleNextLoop(nextResumeAllowedAt - Date.now());
      } finally {
        if (!isStopped) {
          updatePanelStatus();
        }
      }
    }
    function runLoop() {
      if (isStopped) {
        return;
      }
      refreshActiveContext();
      if (!isPlaybackEnforcementVisible()) {
        adSkipper.trySkipAdsIfPossible();
        qualityManager.trySetPreferredQualityIfPossible();
      }
      void tryResume({ shouldRefreshContext: false });
      scheduleNextLoop();
    }
    function stop() {
      if (isStopped) {
        return;
      }
      isStopped = true;
      if (timerId !== null) {
        window.clearTimeout(timerId);
        timerId = null;
        timerDueAt = 0;
      }
      const video = activeContext?.video;
      if (video) {
        detachVideoListeners(video);
      }
      activeContext = null;
      playbackState.reset();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("yt-navigate-finish", handleNavigationFinish);
      document.removeEventListener("yt-navigate-start", handleNavigationStart);
      window.removeEventListener("storage", handleStorage);
      panel.destroy();
    }
    panel.ensureMounted();
    setLastAction(environment.loadedText ?? "脚本已加载");
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("yt-navigate-finish", handleNavigationFinish);
    document.addEventListener("yt-navigate-start", handleNavigationStart);
    window.addEventListener("storage", handleStorage);
    scheduleNextLoop(0);
    return {
      openPanel: () => {
        if (isStopped) {
          return;
        }
        panel.ensureMounted();
        panel.open();
      },
      resetSettings: () => {
        if (isStopped) {
          return settings;
        }
        const result = saveSettings({ ...DEFAULT_SETTINGS });
        renewActivePlaybackState();
        setLastAction(
          result.persisted ? "设置已重置" : "设置已重置，但浏览器未能持久化"
        );
        panel.render(settings, lastActionText);
        scheduleNextLoop(0);
        return settings;
      },
      stop
    };
  }

  // src/entry.ts
  var app = startYouTubeAutoResumeApp({
    loadedText: "脚本已加载"
  });
  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("打开 YouTube Auto Resume 面板", () => {
      app.openPanel();
    });
    GM_registerMenuCommand("重置 YouTube Auto Resume 设置", () => {
      app.resetSettings();
      app.openPanel();
    });
  }
})();
