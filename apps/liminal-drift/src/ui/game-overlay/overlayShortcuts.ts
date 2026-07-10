import { useEffect } from "react"

import type { GameStatus } from "@/shared/types"

interface OverlayShortcutsInput {
  onPause: () => void
  onResume: () => void
  status: GameStatus
}

export function useOverlayShortcuts({ onPause, onResume, status }: OverlayShortcutsInput) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat) {
        return
      }

      if (event.key === "Escape") {
        if (status === "running") onPause()
        if (status === "paused") onResume()
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden" && status === "running") {
        onPause()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [onPause, onResume, status])
}
