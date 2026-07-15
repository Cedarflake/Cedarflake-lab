import { startYouTubeAutoResumeApp } from "./app.ts";

const RUNTIME_MARKER = "data-cedarflake-youtube-auto-resume-extension";

if (!document.documentElement.hasAttribute(RUNTIME_MARKER)) {
  document.documentElement.setAttribute(RUNTIME_MARKER, "active");
  startYouTubeAutoResumeApp({
    loadedText: "扩展已加载",
  });
}
