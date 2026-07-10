import { useEffect, useRef } from "react"

import type { GameStatus } from "@/shared/types"

function getDialogFocusTargets(dialog: HTMLElement) {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled") && element.offsetParent !== null)
}

export function useDialogFocusTrap(status: GameStatus) {
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (status === "running") {
      return
    }

    const dialog = dialogRef.current

    if (!dialog) {
      return
    }

    const activeDialog = dialog
    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusTargets = getDialogFocusTargets(activeDialog)
    focusTargets[0]?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") {
        return
      }

      const targets = getDialogFocusTargets(activeDialog)

      if (targets.length === 0) {
        event.preventDefault()
        return
      }

      const firstTarget = targets[0]
      const lastTarget = targets.at(-1)

      if (!firstTarget || !lastTarget) {
        return
      }

      if (event.shiftKey && document.activeElement === firstTarget) {
        event.preventDefault()
        lastTarget.focus()
      } else if (!event.shiftKey && document.activeElement === lastTarget) {
        event.preventDefault()
        firstTarget.focus()
      } else if (!activeDialog.contains(document.activeElement)) {
        event.preventDefault()
        firstTarget.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown, true)

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true)

      if (previousActiveElement?.isConnected) {
        previousActiveElement.focus()
      }
    }
  }, [status])

  return dialogRef
}
