const GENERATED_ID_PREFIX = "cedarflake-youtube-native-control"

interface MutatedControlId {
  assignedId: string
  control: HTMLButtonElement
  originalId: string
}

export interface NativeButtonBridge {
  bind: (control: HTMLButtonElement | null) => boolean
  destroy: () => void
  getControl: () => HTMLButtonElement | null
}

let generatedIdSequence = 0

function createAvailableId(documentRef: Document): string {
  let id = ""

  do {
    generatedIdSequence += 1
    id = `${GENERATED_ID_PREFIX}-${generatedIdSequence}`
  } while (documentRef.getElementById(id))

  return id
}

export function createNativeButtonBridge(
  label: HTMLLabelElement,
): NativeButtonBridge {
  let control: HTMLButtonElement | null = null
  let mutatedControlId: MutatedControlId | null = null

  function restoreControlId(): void {
    if (!mutatedControlId) {
      return
    }

    const { assignedId, control: mutatedControl, originalId } = mutatedControlId

    if (mutatedControl.id === assignedId) {
      if (originalId) {
        mutatedControl.id = originalId
      } else {
        mutatedControl.removeAttribute("id")
      }
    }

    mutatedControlId = null
  }

  function clearBinding(): void {
    label.removeAttribute("aria-controls")
    label.removeAttribute("for")
    label.setAttribute("aria-disabled", "true")
    label.dataset.available = "false"
    label.tabIndex = -1
    restoreControlId()
    control = null
  }

  function assignUniqueId(nextControl: HTMLButtonElement): string {
    const originalId = nextControl.id
    const existingMatch = originalId
      ? nextControl.ownerDocument.getElementById(originalId)
      : null

    if (originalId && existingMatch === nextControl) {
      return originalId
    }

    const assignedId = createAvailableId(nextControl.ownerDocument)
    nextControl.id = assignedId
    mutatedControlId = {
      assignedId,
      control: nextControl,
      originalId,
    }
    return assignedId
  }

  function bind(nextControl: HTMLButtonElement | null): boolean {
    if (
      !(nextControl instanceof HTMLButtonElement) ||
      !nextControl.isConnected
    ) {
      clearBinding()
      return false
    }

    if (control === nextControl && label.control === nextControl) {
      return true
    }

    clearBinding()
    const controlId = assignUniqueId(nextControl)
    label.htmlFor = controlId

    if (label.control !== nextControl) {
      clearBinding()
      return false
    }

    control = nextControl
    label.setAttribute("aria-controls", controlId)
    label.setAttribute("aria-disabled", "false")
    label.dataset.available = "true"
    label.tabIndex = 0
    return true
  }

  function getControl(): HTMLButtonElement | null {
    if (!control?.isConnected || label.control !== control) {
      clearBinding()
      return null
    }

    return control
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Enter" || !event.isTrusted) {
      return
    }

    getControl()?.focus({ preventScroll: true })
  }

  function destroy(): void {
    label.removeEventListener("keydown", handleKeyDown)
    clearBinding()
  }

  label.addEventListener("keydown", handleKeyDown)
  clearBinding()

  return { bind, destroy, getControl }
}
