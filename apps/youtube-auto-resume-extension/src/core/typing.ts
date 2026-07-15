export function getDeepActiveElement(
  documentRef: Pick<Document, "activeElement"> = document,
): Element | null {
  let activeElement = documentRef.activeElement
  const visitedElements = new Set<Element>()

  while (activeElement && !visitedElements.has(activeElement)) {
    visitedElements.add(activeElement)
    const nestedActiveElement = activeElement.shadowRoot?.activeElement ?? null

    if (!nestedActiveElement) {
      break
    }

    activeElement = nestedActiveElement
  }

  return activeElement
}

export function isTypingContext(documentRef: Document = document): boolean {
  const activeElement = getDeepActiveElement(documentRef)

  if (!activeElement) {
    return false
  }

  const tagName = activeElement.tagName.toLowerCase()

  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true
  }

  return (
    "isContentEditable" in activeElement
    && activeElement.isContentEditable === true
  )
}
