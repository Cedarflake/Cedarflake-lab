import { useCallback, useEffect, useId, useRef, useState } from "react"
import type { ReactNode } from "react"
import { ArrowLeft, ArrowRight } from "lucide-react"

interface CarouselItem {
  id: string
  title: string
}

interface CarouselProps<Project extends CarouselItem> {
  className?: string
  hint: string
  items: readonly Project[]
  labelledBy: string
  renderItem: (item: Project, index: number) => ReactNode
  showControls?: boolean
}

function getSlideScrollLeft(viewport: HTMLDivElement, slide: HTMLDivElement) {
  const targetScrollLeft =
    slide.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft

  return Math.max(0, Math.floor(targetScrollLeft) - 1)
}

function getScrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "auto"
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
}

export function Carousel<Project extends CarouselItem>({
  className,
  hint,
  items,
  labelledBy,
  renderItem,
  showControls = true,
}: CarouselProps<Project>) {
  const instructionsId = useId()
  const viewportRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<Array<HTMLDivElement | null>>([])
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isProgrammaticScrollRef = useRef(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isAtStart, setIsAtStart] = useState(true)
  const [isAtEnd, setIsAtEnd] = useState(false)

  const lastIndex = items.length - 1
  const shouldShowControls = showControls && items.length > 1

  const syncCarouselState = useCallback(() => {
    const viewport = viewportRef.current

    if (!viewport) {
      return
    }

    const viewportRect = viewport.getBoundingClientRect()
    const slides = slideRefs.current.slice(0, items.length)
    let nextIndex = 0
    let greatestVisibleWidth = -1

    for (const [index, slide] of slides.entries()) {
      if (!slide) {
        continue
      }

      const slideRect = slide.getBoundingClientRect()
      const isFullyVisible =
        slideRect.left >= viewportRect.left - 1 && slideRect.right <= viewportRect.right + 1

      if (isFullyVisible) {
        nextIndex = index
        break
      }

      const visibleWidth = Math.max(
        0,
        Math.min(slideRect.right, viewportRect.right) - Math.max(slideRect.left, viewportRect.left),
      )

      if (visibleWidth > greatestVisibleWidth) {
        greatestVisibleWidth = visibleWidth
        nextIndex = index
      }
    }

    const maximumScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)

    setActiveIndex((currentIndex) => (currentIndex === nextIndex ? currentIndex : nextIndex))
    setIsAtStart(viewport.scrollLeft <= 1)
    setIsAtEnd(viewport.scrollLeft >= maximumScrollLeft - 1)
  }, [items.length])

  const scrollToProject = useCallback(
    (index: number) => {
      const viewport = viewportRef.current
      const targetIndex = Math.max(0, Math.min(lastIndex, index))
      const slide = slideRefs.current[targetIndex]

      if (!viewport || !slide) {
        return
      }

      const maximumScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
      const targetScrollLeft = Math.max(
        0,
        Math.min(maximumScrollLeft, getSlideScrollLeft(viewport, slide)),
      )

      isProgrammaticScrollRef.current = true

      if (scrollEndTimerRef.current) {
        clearTimeout(scrollEndTimerRef.current)
      }

      viewport.scrollTo({
        left: targetScrollLeft,
        behavior: getScrollBehavior(),
      })
      setActiveIndex(targetIndex)
      setIsAtStart(targetScrollLeft <= 1)
      setIsAtEnd(targetScrollLeft >= maximumScrollLeft - 1)
      scrollEndTimerRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false
        syncCarouselState()
      }, 180)
    },
    [lastIndex, syncCarouselState],
  )

  const handleScroll = useCallback(() => {
    if (!isProgrammaticScrollRef.current) {
      syncCarouselState()
      return
    }

    if (scrollEndTimerRef.current) {
      clearTimeout(scrollEndTimerRef.current)
    }

    scrollEndTimerRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false
      syncCarouselState()
    }, 120)
  }, [syncCarouselState])

  useEffect(() => {
    const viewport = viewportRef.current
    const track = viewport?.querySelector<HTMLElement>(".carousel__track")

    syncCarouselState()

    if (!viewport || !track) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      if (!isProgrammaticScrollRef.current) {
        syncCarouselState()
      }
    })
    resizeObserver.observe(viewport)
    resizeObserver.observe(track)

    return () => {
      resizeObserver.disconnect()

      if (scrollEndTimerRef.current) {
        clearTimeout(scrollEndTimerRef.current)
      }
    }
  }, [syncCarouselState])

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return
    }

    const targetByKey = {
      ArrowLeft: Math.max(0, activeIndex - 1),
      ArrowRight: Math.min(lastIndex, activeIndex + 1),
      End: lastIndex,
      Home: 0,
    }[event.key]

    if (targetByKey === undefined) {
      return
    }

    event.preventDefault()
    scrollToProject(targetByKey)
  }

  if (items.length === 0) {
    return null
  }

  return (
    <div
      className={`carousel${className ? ` ${className}` : ""}`}
      role="region"
      aria-labelledby={labelledBy}
      aria-roledescription="carousel"
    >
      <p className="sr-only" id={instructionsId}>
        Focus the project slides, then use the left and right arrow keys to move between them.
      </p>

      {shouldShowControls ? (
        <div className="carousel__toolbar">
          <p className="carousel__hint">{hint}</p>
          <div className="carousel__controls">
            <output className="carousel__progress" aria-live="polite" aria-atomic="true">
              <span aria-hidden="true">{String(activeIndex + 1).padStart(2, "0")}</span>
              <span aria-hidden="true">/</span>
              <span aria-hidden="true">{String(items.length).padStart(2, "0")}</span>
              <span className="sr-only">
                Project {activeIndex + 1} of {items.length}
              </span>
            </output>
            <button
              type="button"
              onClick={() => {
                if (!isAtStart) scrollToProject(activeIndex - 1)
              }}
              aria-disabled={isAtStart}
              aria-label="Show previous project"
            >
              <ArrowLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isAtEnd) scrollToProject(activeIndex + 1)
              }}
              aria-disabled={isAtEnd}
              aria-label="Show next project"
            >
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="carousel__viewport"
        ref={viewportRef}
        role="group"
        aria-label="Project slides"
        aria-describedby={instructionsId}
        tabIndex={items.length > 1 ? 0 : -1}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
      >
        <div className="carousel__track">
          {items.map((item, index) => (
            <div
              className="carousel__slide"
              key={item.id}
              ref={(element) => {
                slideRefs.current[index] = element
              }}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${items.length}: ${item.title}`}
            >
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
