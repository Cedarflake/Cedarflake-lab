import { useEffect, useRef } from "react"

export function useEntranceReveal() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current

    if (!root) {
      return
    }

    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"))

    function revealAll() {
      for (const target of targets) {
        target.dataset["revealState"] = "visible"
      }
    }

    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      typeof IntersectionObserver === "undefined"
    ) {
      revealAll()
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue
          }

          const target = entry.target as HTMLElement
          target.dataset["revealState"] = "visible"
          observer.unobserve(target)
        }
      },
      {
        rootMargin: "0px 0px -10% 0px",
        threshold: 0,
      },
    )

    for (const target of targets) {
      observer.observe(target)
    }

    return () => {
      observer.disconnect()
    }
  }, [])

  return rootRef
}
