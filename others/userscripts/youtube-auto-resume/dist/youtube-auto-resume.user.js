// ==UserScript==
// @name         YouTube Auto Resume
// @namespace    https://github.com/Cedarflake/Cedarflake-Lab
// @version      0.2.1
// @description  Resume paused YouTube videos, skip skippable ads, and manage playback from a resilient panel.
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
"use strict";
(() => {
  // src/core/settings.ts
  var SETTINGS_STORAGE_PREFIX = "autoChick.ytAutoResume.";
  var DEFAULT_SETTINGS = {
    enabled: true,
    intervalMs: 1e3,
    minPausedSeconds: 2,
    autoSkipAds: false,
    bestQuality: false,
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
      bestQuality: readBoolean(
        source,
        "bestQuality",
        DEFAULT_SETTINGS.bestQuality
      ),
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
      saveRaw(current);
      return current;
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
  function isTypingContext(documentRef = document) {
    const activeElement = documentRef.activeElement;
    if (!activeElement) {
      return false;
    }
    const tagName = activeElement.tagName.toLowerCase();
    if (tagName === "input" || tagName === "textarea" || tagName === "select") {
      return true;
    }
    return activeElement instanceof HTMLElement && activeElement.isContentEditable;
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

  // src/ui/panel.ts
  var HOST_ID = "auto-chick-yt-auto-resume-host";
  var PANEL_CSS = `
  :host {
    all: initial;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  button,
  input {
    font: inherit;
  }

  .wrap {
    display: block;
    width: max-content;
    max-width: calc(100vw - 32px);
    color: #f1f1f1;
    font-family: "Roboto", "Arial", sans-serif;
    line-height: normal;
  }

  .hidden {
    display: none !important;
  }

  .fab {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    outline: none;
    background: rgba(33, 33, 33, 0.96);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
    color: #ff0000;
    cursor: pointer;
    backdrop-filter: blur(8px);
    transition: background-color 0.2s, transform 0.2s;
  }

  .fab:hover {
    background: rgba(63, 63, 63, 0.98);
  }

  .fab:active {
    transform: scale(0.95);
  }

  .fab:focus-visible,
  .icon-button:focus-visible,
  .button:focus-visible,
  .number-input:focus-visible {
    outline: 2px solid #3ea6ff;
    outline-offset: 2px;
  }

  .fab svg {
    width: 24px;
    height: 24px;
  }

  .panel {
    width: 340px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
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
  }

  .label-key {
    font-size: 14px;
    font-weight: 400;
  }

  .label-description {
    color: #aaaaaa;
    font-size: 12px;
  }

  .number-input {
    width: 80px;
    flex: 0 0 auto;
    padding: 6px 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    outline: none;
    background: rgba(0, 0, 0, 0.2);
    color: inherit;
    font-size: 13px;
    text-align: center;
    transition: border-color 0.2s;
  }

  .number-input:focus {
    border-color: #3ea6ff;
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

    .fab {
      border-color: rgba(0, 0, 0, 0.1);
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .fab:hover {
      background: rgba(240, 240, 240, 0.98);
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

    .number-input {
      border-color: rgba(0, 0, 0, 0.1);
      background: #ffffff;
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
`;
  function createLabel(title, description) {
    const label = document.createElement("div");
    const key = document.createElement("div");
    const detail = document.createElement("div");
    label.className = "label";
    key.className = "label-key";
    key.textContent = title;
    detail.className = "label-description";
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
    control.setAttribute("aria-label", title);
    input.id = id;
    input.type = "checkbox";
    track.className = "track";
    thumb.className = "thumb";
    track.appendChild(thumb);
    control.append(input, track);
    row.append(createLabel(title, description), control);
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
    input.setAttribute("aria-label", title);
    row.append(createLabel(title, description), input);
    return { row, input };
  }
  function applyHostStyles(host) {
    const styles = [
      ["position", "fixed"],
      ["right", "16px"],
      ["bottom", "16px"],
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
      ["max-width", "calc(100vw - 32px)"],
      ["max-height", "calc(100vh - 32px)"],
      ["margin", "0"],
      ["padding", "0"],
      ["border", "0"],
      ["overflow", "visible"],
      ["pointer-events", "auto"],
      ["isolation", "isolate"]
    ];
    for (const [property, value] of styles) {
      host.style.setProperty(property, value, "important");
    }
  }
  function resolvePanelMountTarget(documentRef = document) {
    return documentRef.fullscreenElement ?? documentRef.body ?? documentRef.documentElement;
  }
  function createPanelView(options) {
    const onResumeNow = options.onResumeNow ?? (() => void 0);
    const onSkipNow = options.onSkipNow ?? (() => void 0);
    let host = null;
    let shadow = null;
    let elements = null;
    let mountObserver = null;
    let observedMountTarget = null;
    let statusText = "";
    let currentLastActionText = "";
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
      ensureMounted();
      const saved = options.saveSettings({
        ...options.getSettings(),
        collapsed: !isOpen
      });
      render(saved, currentLastActionText);
    }
    function applySettingsFromUi() {
      if (!elements) {
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
        bestQuality: elements.bestQuality.checked,
        avoidTyping: elements.avoidTyping.checked,
        avoidEnded: elements.avoidEnded.checked
      };
      const saved = options.saveSettings(nextSettings);
      if (options.onSettingsApplied) {
        options.onSettingsApplied(saved);
        return;
      }
      render(saved, currentLastActionText);
    }
    function buildPanel() {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.setAttribute("data-auto-chick-ui", "youtube-auto-resume");
      applyHostStyles(host);
      shadow = host.attachShadow({ mode: "open" });
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
        "启用",
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
        "自动跳过广告",
        "检测跳过按钮和广告遮罩"
      );
      const bestQuality = createSwitchRow(
        "best-quality",
        "最佳画质",
        "自动切换到最高可用画质"
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
      fab.appendChild(createIcon("bolt"));
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
        bestQuality.row,
        avoidTyping.row,
        avoidEnded.row
      );
      status.className = "status";
      status.textContent = statusText;
      lastAction.className = "last-action";
      lastAction.textContent = currentLastActionText;
      footer.className = "footer";
      resumeNow.className = "button button-primary";
      resumeNow.type = "button";
      resumeNow.append(createIcon("play"), "立即恢复");
      skipNow.className = "button";
      skipNow.type = "button";
      skipNow.append(createIcon("forward"), "跳过广告");
      footer.append(resumeNow, skipNow);
      content.append(grid, status, lastAction, footer);
      panel.append(header, content);
      wrap.append(fab, panel);
      shadow.append(style, wrap);
      elements = {
        fab,
        panel,
        close,
        enabled: enabled.input,
        interval: interval.input,
        minPaused: minPaused.input,
        autoSkipAds: autoSkipAds.input,
        bestQuality: bestQuality.input,
        avoidTyping: avoidTyping.input,
        avoidEnded: avoidEnded.input,
        status,
        lastAction
      };
      fab.addEventListener("click", () => setOpen(true));
      close.addEventListener("click", () => setOpen(false));
      enabled.input.addEventListener("change", applySettingsFromUi);
      interval.input.addEventListener("change", applySettingsFromUi);
      minPaused.input.addEventListener("change", applySettingsFromUi);
      autoSkipAds.input.addEventListener("change", applySettingsFromUi);
      bestQuality.input.addEventListener("change", applySettingsFromUi);
      avoidTyping.input.addEventListener("change", applySettingsFromUi);
      avoidEnded.input.addEventListener("change", applySettingsFromUi);
      resumeNow.addEventListener("click", onResumeNow);
      skipNow.addEventListener("click", onSkipNow);
      render(options.getSettings(), currentLastActionText);
    }
    function ensureMounted() {
      if (!host) {
        buildPanel();
        watchMountState();
      }
      moveHostToCurrentTarget();
    }
    function setStatus(text) {
      statusText = text;
      ensureMounted();
      if (elements) {
        elements.status.textContent = statusText;
      }
    }
    function setLastActionText(text) {
      currentLastActionText = text;
      ensureMounted();
      if (elements) {
        elements.lastAction.textContent = currentLastActionText;
      }
    }
    function render(settings, nextLastActionText) {
      ensureMounted();
      if (!elements) {
        return;
      }
      if (typeof nextLastActionText === "string") {
        currentLastActionText = nextLastActionText;
      }
      const isOpen = !settings.collapsed;
      elements.panel.classList.toggle("hidden", !isOpen);
      elements.fab.classList.toggle("hidden", isOpen);
      elements.enabled.checked = settings.enabled;
      if (shadow?.activeElement !== elements.interval) {
        elements.interval.value = String(settings.intervalMs);
      }
      if (shadow?.activeElement !== elements.minPaused) {
        elements.minPaused.value = String(settings.minPausedSeconds);
      }
      elements.autoSkipAds.checked = settings.autoSkipAds;
      elements.bestQuality.checked = settings.bestQuality;
      elements.avoidTyping.checked = settings.avoidTyping;
      elements.avoidEnded.checked = settings.avoidEnded;
      elements.status.textContent = statusText;
      elements.lastAction.textContent = currentLastActionText;
    }
    function open() {
      setOpen(true);
    }
    function destroy() {
      mountObserver?.disconnect();
      mountObserver = null;
      observedMountTarget = null;
      document.removeEventListener("fullscreenchange", moveHostToCurrentTarget);
      host?.remove();
      host = null;
      shadow = null;
      elements = null;
    }
    return {
      destroy,
      ensureMounted,
      setStatus,
      setLastActionText,
      render,
      open
    };
  }

  // src/youtube/ads.ts
  var SKIP_AD_SELECTOR = [
    ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-slot button",
    ".ytp-skip-ad-button",
    ".videoAdUiSkipButton",
    ".ytp-ad-text.ytp-ad-skip-button-text",
    'button[class*="skip-ad"]'
  ].join(", ");
  var AD_OVERLAY_CLOSE_SELECTOR = [
    ".ytp-ad-overlay-close-button",
    'button[class*="overlay-close"]'
  ].join(", ");
  function findSkipAdButton(documentRef = document) {
    return documentRef.querySelector(SKIP_AD_SELECTOR);
  }
  function findAdOverlayCloseButton(documentRef = document) {
    return documentRef.querySelector(AD_OVERLAY_CLOSE_SELECTOR);
  }
  function isElementVisible(element) {
    if (!element) {
      return false;
    }
    const view = element.ownerDocument.defaultView;
    if (!view) {
      return false;
    }
    const style = view.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  function getAdUiSnapshot(documentRef = document) {
    return {
      canSkipAd: isElementVisible(findSkipAdButton(documentRef)),
      canCloseAdOverlay: isElementVisible(
        findAdOverlayCloseButton(documentRef)
      )
    };
  }
  function createAdSkipper(options = {}) {
    const getSettings = options.getSettings ?? (() => ({ autoSkipAds: DEFAULT_SETTINGS.autoSkipAds }));
    const onAction = options.onAction ?? (() => void 0);
    const documentRef = options.document ?? document;
    const cooldownMs = options.cooldownMs ?? 1200;
    const getNow = options.now ?? Date.now;
    let lastAdClickAt = Number.NEGATIVE_INFINITY;
    function trySkipAdsIfPossible(attemptOptions = {}) {
      const force = Boolean(attemptOptions.force);
      const settings = getSettings();
      if (!settings.autoSkipAds && !force) {
        return false;
      }
      const currentTime = getNow();
      if (currentTime - lastAdClickAt < cooldownMs) {
        return false;
      }
      let acted = false;
      const skipButton = findSkipAdButton(documentRef);
      if (skipButton && isElementVisible(skipButton)) {
        skipButton.click();
        acted = true;
        onAction("检测到可跳过广告，已点击“跳过”");
      }
      if (!acted) {
        const overlayCloseButton = findAdOverlayCloseButton(documentRef);
        if (overlayCloseButton && isElementVisible(overlayCloseButton)) {
          overlayCloseButton.click();
          acted = true;
          onAction("检测到广告遮罩，已点击关闭");
        }
      }
      if (acted) {
        lastAdClickAt = currentTime;
        return true;
      }
      if (force) {
        onAction("手动跳过：未检测到正在播放的广告");
      }
      return false;
    }
    return { trySkipAdsIfPossible };
  }

  // src/youtube/player.ts
  function getVideo(documentRef = document) {
    return documentRef.querySelector(
      "ytd-player video, video.html5-main-video, video"
    );
  }
  function getMoviePlayer(documentRef = document) {
    const element = documentRef.getElementById("movie_player") ?? documentRef.querySelector(".html5-video-player");
    return element;
  }
  function isAdShowing(documentRef = document) {
    const player = getMoviePlayer(documentRef);
    return Boolean(
      player && (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting"))
    );
  }
  function getPlaybackQuality(documentRef = document) {
    const player = getMoviePlayer(documentRef);
    if (!player?.getPlaybackQuality) {
      return null;
    }
    try {
      const quality = player.getPlaybackQuality();
      return typeof quality === "string" ? quality : null;
    } catch {
      return null;
    }
  }
  function getAvailableQualityLevels(documentRef = document) {
    const player = getMoviePlayer(documentRef);
    if (!player?.getAvailableQualityLevels) {
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
  function setPlaybackQuality(quality, documentRef = document) {
    const player = getMoviePlayer(documentRef);
    if (!player) {
      return;
    }
    try {
      player.setPlaybackQualityRange?.(quality, quality);
    } catch {
    }
    try {
      player.setPlaybackQuality?.(quality);
    } catch {
    }
  }

  // src/youtube/quality.ts
  var QUALITY_PRIORITY = [
    "highres",
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
  function pickBestQuality(levels) {
    if (!levels?.length) {
      return null;
    }
    for (const quality of QUALITY_PRIORITY) {
      if (levels.includes(quality)) {
        return quality;
      }
    }
    for (const quality of levels) {
      if (quality && quality !== "auto") {
        return quality;
      }
    }
    return levels[0] || null;
  }
  function createQualityManager(options = {}) {
    const getSettings = options.getSettings ?? (() => ({ bestQuality: DEFAULT_SETTINGS.bestQuality }));
    const onAction = options.onAction ?? (() => void 0);
    const documentRef = options.document ?? document;
    const throttleMs = options.throttleMs ?? 5e3;
    const getNow = options.now ?? Date.now;
    let lastQualitySetAt = 0;
    function trySetBestQualityIfPossible(attemptOptions = {}) {
      const force = Boolean(attemptOptions.force);
      if (!getSettings().bestQuality && !force) {
        return false;
      }
      const currentTime = getNow();
      if (!force && currentTime - lastQualitySetAt < throttleMs) {
        return false;
      }
      if (!force && isAdShowing(documentRef)) {
        return false;
      }
      const bestQuality = pickBestQuality(
        getAvailableQualityLevels(documentRef)
      );
      if (!bestQuality) {
        return false;
      }
      const currentQuality = getPlaybackQuality(documentRef);
      if (!force && currentQuality === bestQuality) {
        lastQualitySetAt = currentTime;
        return false;
      }
      setPlaybackQuality(bestQuality, documentRef);
      lastQualitySetAt = currentTime;
      onAction(`已尝试将画质调为最高：${bestQuality}`);
      return true;
    }
    return { trySetBestQualityIfPossible };
  }

  // src/app.ts
  function getStateSnapshot(video) {
    const adUi = getAdUiSnapshot();
    if (!video) {
      return {
        canCloseAdOverlay: adUi.canCloseAdOverlay,
        canSkipAd: adUi.canSkipAd,
        currentTime: null,
        ended: null,
        hasVideo: false,
        paused: null,
        readyState: null
      };
    }
    return {
      canCloseAdOverlay: adUi.canCloseAdOverlay,
      canSkipAd: adUi.canSkipAd,
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : null,
      ended: video.ended,
      hasVideo: true,
      paused: video.paused,
      readyState: video.readyState
    };
  }
  function formatStatus(snapshot, settings, playbackQuality) {
    if (!snapshot.hasVideo) {
      return "检测到视频：否\n提示：请确认页面中有正在播放的 YouTube 视频";
    }
    return [
      "检测到视频：是",
      `暂停：${snapshot.paused ? "是" : "否"}`,
      `结束：${snapshot.ended ? "是" : "否"}`,
      `播放位置：${snapshot.currentTime === null ? "-" : snapshot.currentTime.toFixed(1)}`,
      `可跳过广告：${snapshot.canSkipAd ? "是" : "否"}`,
      `可关闭广告遮罩：${snapshot.canCloseAdOverlay ? "是" : "否"}`,
      `最佳画质：${settings.bestQuality ? "是" : "否"}`,
      `当前画质：${playbackQuality ?? "-"}`,
      `检测间隔：${settings.intervalMs}ms`,
      `暂停阈值：${settings.minPausedSeconds}s`
    ].join("\n");
  }
  function startYouTubeAutoResumeApp(environment = {}) {
    const store = createSettingsStore({});
    let settings = store.get();
    let lastPausedAt = 0;
    let lastActionText = "尚未执行";
    let timerId = null;
    let isStopped = false;
    const setLastAction = (text) => {
      lastActionText = `${nowText()} ${text}`;
      panel.setLastActionText(lastActionText);
    };
    const qualityManager = createQualityManager({
      getSettings: () => settings,
      onAction: setLastAction
    });
    const adSkipper = createAdSkipper({
      getSettings: () => settings,
      onAction: setLastAction
    });
    const panel = createPanelView({
      getSettings: () => settings,
      onResumeNow: () => {
        setLastAction("手动触发恢复");
        void tryResume({ force: true });
      },
      onSettingsApplied: (savedSettings) => {
        settings = savedSettings;
        setLastAction("设置已保存");
        panel.render(settings, lastActionText);
        scheduleNextLoop(0);
      },
      onSkipNow: () => {
        setLastAction("手动触发跳过");
        adSkipper.trySkipAdsIfPossible({ force: true });
      },
      saveSettings: (nextSettings) => {
        settings = store.save(nextSettings);
        return settings;
      }
    });
    const ensurePanel = () => {
      panel.ensureMounted();
      panel.render(settings, lastActionText);
    };
    const tryResume = async (options = {}) => {
      const isForced = options.force === true;
      const video = getVideo();
      const snapshot = getStateSnapshot(video);
      ensurePanel();
      panel.setStatus(formatStatus(snapshot, settings, getPlaybackQuality()));
      if (!settings.enabled && !isForced || !video) {
        return;
      }
      if (settings.avoidTyping && isTypingContext() && !isForced) {
        return;
      }
      if (settings.avoidEnded && video.ended && !isForced) {
        return;
      }
      if (!video.paused) {
        lastPausedAt = 0;
        return;
      }
      const now = Date.now();
      if (lastPausedAt === 0) {
        lastPausedAt = now;
      }
      if (!isForced && (now - lastPausedAt) / 1e3 < settings.minPausedSeconds) {
        return;
      }
      try {
        await video.play();
        lastPausedAt = 0;
        setLastAction("检测到暂停，已尝试恢复播放");
      } catch {
        setLastAction("恢复播放失败，可能受到浏览器自动播放策略限制");
      }
    };
    const scheduleNextLoop = (delay = settings.intervalMs) => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      if (isStopped) {
        return;
      }
      timerId = window.setTimeout(runLoop, delay);
    };
    const runLoop = () => {
      settings = store.reload();
      adSkipper.trySkipAdsIfPossible();
      qualityManager.trySetBestQualityIfPossible();
      void tryResume();
      scheduleNextLoop();
    };
    ensurePanel();
    setLastAction(environment.loadedText ?? "脚本已加载");
    scheduleNextLoop(0);
    return {
      openPanel: () => {
        settings = store.save({
          ...settings,
          collapsed: false
        });
        panel.ensureMounted();
        panel.open();
        panel.render(settings, lastActionText);
      },
      resetSettings: () => {
        settings = store.save(DEFAULT_SETTINGS);
        panel.ensureMounted();
        panel.render(settings, lastActionText);
        scheduleNextLoop(0);
        return settings;
      },
      stop: () => {
        isStopped = true;
        if (timerId !== null) {
          window.clearTimeout(timerId);
          timerId = null;
        }
        panel.destroy();
      }
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
