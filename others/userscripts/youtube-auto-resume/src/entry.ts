import { startYouTubeAutoResumeApp } from "./app.ts"

declare const GM_registerMenuCommand:
  | ((caption: string, onClick: () => void) => unknown)
  | undefined

const app = startYouTubeAutoResumeApp({
  loadedText: "脚本已加载",
})

if (typeof GM_registerMenuCommand === "function") {
  GM_registerMenuCommand("打开 YouTube Auto Resume 面板", () => {
    app.openPanel()
  })
  GM_registerMenuCommand("重置 YouTube Auto Resume 设置", () => {
    app.resetSettings()
    app.openPanel()
  })
}
