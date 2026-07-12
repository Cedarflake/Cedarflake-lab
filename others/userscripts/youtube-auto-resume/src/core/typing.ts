export function isTypingContext(documentRef: Document = document): boolean {
  const activeElement = documentRef.activeElement

  if (!activeElement) {
    return false
  }

  const tagName = activeElement.tagName.toLowerCase()

  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true
  }

  return activeElement instanceof HTMLElement && activeElement.isContentEditable
}
