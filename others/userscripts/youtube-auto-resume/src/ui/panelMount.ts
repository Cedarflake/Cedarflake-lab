export function applyHostStyles(host: HTMLDivElement): void {
  const styles: ReadonlyArray<readonly [string, string]> = [
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
      "calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))",
    ],
    [
      "max-height",
      "calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))",
    ],
    ["margin", "0"],
    ["padding", "0"],
    ["border", "0"],
    ["overflow", "visible"],
    ["pointer-events", "auto"],
    ["isolation", "isolate"],
  ]

  for (const [property, value] of styles) {
    if (
      host.style.getPropertyValue(property) !== value
      || host.style.getPropertyPriority(property) !== "important"
    ) {
      host.style.setProperty(property, value, "important")
    }
  }
}

export interface PanelMountDocument {
  fullscreenElement: Element | null
  body: HTMLElement | null
  documentElement: HTMLElement
}

export function resolvePanelMountTarget(
  documentRef: PanelMountDocument = document,
): Element {
  return (
    documentRef.fullscreenElement
    ?? documentRef.body
    ?? documentRef.documentElement
  )
}
