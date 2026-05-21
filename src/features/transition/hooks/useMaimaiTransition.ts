import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

import { MAIMAI_SVG_PATH, MAIMAI_TIMINGS } from '../constants'
import { createMaimaiTimeline } from '../lib/createMaimaiTimeline'

const svgMarkupPromises = new Map<string, Promise<string>>()
const resolvedSvgMarkupPromises = new Map<string, Promise<string>>()
const svgAssetObjectUrlPromises = new Map<string, Promise<string>>()
const svgAssetObjectUrls = new Set<string>()

let hasRegisteredSvgAssetCleanup = false

function ensureSvgAssetCleanupRegistered() {
  if (hasRegisteredSvgAssetCleanup || typeof window === 'undefined') {
    return
  }

  window.addEventListener('pagehide', () => {
    for (const objectUrl of svgAssetObjectUrls) {
      URL.revokeObjectURL(objectUrl)
    }

    svgAssetObjectUrls.clear()
    svgAssetObjectUrlPromises.clear()
    resolvedSvgMarkupPromises.clear()
  })

  hasRegisteredSvgAssetCleanup = true
}

function resolveAbsoluteUrl(url: string) {
  return new URL(url, window.location.href).toString()
}

function collectSvgExternalAssetUrls(markup: string, svgPath: string) {
  const parser = new DOMParser()
  const document = parser.parseFromString(markup, 'image/svg+xml')
  const svgUrl = new URL(svgPath, window.location.href)
  const imageElements = Array.from(document.querySelectorAll('image'))
  const assetUrls = imageElements
    .map((imageElement) => imageElement.getAttribute('href') ?? imageElement.getAttribute('xlink:href'))
    .filter((href): href is string => Boolean(href && href.trim() && !href.startsWith('#') && !href.startsWith('data:')))
    .map((href) => new URL(href, svgUrl).toString())

  return Array.from(new Set(assetUrls))
}

function fetchSvgMarkup(svgPath: string) {
  const absoluteSvgUrl = resolveAbsoluteUrl(svgPath)
  const existingPromise = svgMarkupPromises.get(absoluteSvgUrl)

  if (existingPromise) {
    return existingPromise
  }

  const markupPromise = fetch(absoluteSvgUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`SVG 加载失败：${response.status} ${response.statusText}`)
      }

      return response.text()
    })
    .catch((error) => {
      svgMarkupPromises.delete(absoluteSvgUrl)
      throw error
    })

  svgMarkupPromises.set(absoluteSvgUrl, markupPromise)

  return markupPromise
}

function fetchSvgAssetObjectUrl(assetUrl: string) {
  const existingPromise = svgAssetObjectUrlPromises.get(assetUrl)

  if (existingPromise) {
    return existingPromise
  }

  const objectUrlPromise = fetch(assetUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`SVG 资源加载失败：${assetUrl}`)
      }

      return response.blob()
    })
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob)
      svgAssetObjectUrls.add(objectUrl)

      return objectUrl
    })
    .catch((error) => {
      svgAssetObjectUrlPromises.delete(assetUrl)
      throw error
    })

  svgAssetObjectUrlPromises.set(assetUrl, objectUrlPromise)

  return objectUrlPromise
}

async function resolveSvgMarkupWithCachedAssets(svgPath: string) {
  ensureSvgAssetCleanupRegistered()

  const absoluteSvgUrl = resolveAbsoluteUrl(svgPath)
  const existingPromise = resolvedSvgMarkupPromises.get(absoluteSvgUrl)

  if (existingPromise) {
    return existingPromise
  }

  const resolvedMarkupPromise = fetchSvgMarkup(absoluteSvgUrl)
    .then(async (markup) => {
      const parser = new DOMParser()
      const document = parser.parseFromString(markup, 'image/svg+xml')
      const imageElements = Array.from(document.querySelectorAll('image'))
      const assetUrls = collectSvgExternalAssetUrls(markup, absoluteSvgUrl)

      const objectUrlEntries = await Promise.all(
        assetUrls.map(async (assetUrl) => [assetUrl, await fetchSvgAssetObjectUrl(assetUrl)] as const),
      )
      const objectUrlMap = new Map(objectUrlEntries)

      for (const imageElement of imageElements) {
        const rawHref = imageElement.getAttribute('href') ?? imageElement.getAttribute('xlink:href')

        if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('data:')) {
          continue
        }

        const absoluteAssetUrl = new URL(rawHref, absoluteSvgUrl).toString()
        const cachedObjectUrl = objectUrlMap.get(absoluteAssetUrl)

        if (!cachedObjectUrl) {
          continue
        }

        imageElement.setAttribute('href', cachedObjectUrl)

        if (imageElement.hasAttribute('xlink:href')) {
          imageElement.setAttribute('xlink:href', cachedObjectUrl)
        }
      }

      return new XMLSerializer().serializeToString(document)
    })
    .catch((error) => {
      resolvedSvgMarkupPromises.delete(absoluteSvgUrl)
      throw error
    })

  resolvedSvgMarkupPromises.set(absoluteSvgUrl, resolvedMarkupPromise)

  return resolvedMarkupPromise
}

export type TransitionStatus =
  | 'loading'
  | 'ready'
  | 'playing'
  | 'finished'
  | 'error'

type UseMaimaiTransitionResult = {
  duration: number
  error: string | null
  playCount: number
  replay: () => void
  status: TransitionStatus
  svgReady: boolean
}

type UseMaimaiTransitionOptions = {
  onComplete?: () => void
  onSceneSwap?: () => void
  onStatusChange?: (status: TransitionStatus) => void
  preserveAspectRatio?: 'xMidYMid meet' | 'xMidYMid slice'
  sceneSwapAt?: number
  svgPath?: string
}

export function useMaimaiTransition(
  frameRef: RefObject<HTMLDivElement | null>,
  options: UseMaimaiTransitionOptions = {},
): UseMaimaiTransitionResult {
  const {
    onComplete,
    onSceneSwap,
    onStatusChange,
    preserveAspectRatio = 'xMidYMid meet',
    sceneSwapAt = MAIMAI_TIMINGS.sceneSwapAt,
    svgPath = MAIMAI_SVG_PATH,
  } = options
  const markupRef = useRef<string | null>(null)
  const timelineRef = useRef<ReturnType<typeof createMaimaiTimeline> | null>(null)
  const onCompleteRef = useRef(onComplete)
  const onSceneSwapRef = useRef(onSceneSwap)
  const [status, setStatus] = useState<TransitionStatus>('loading')
  const [duration, setDuration] = useState<number>(
    MAIMAI_TIMINGS.estimatedTotalDuration,
  )
  const [error, setError] = useState<string | null>(null)
  const [playCount, setPlayCount] = useState(0)
  const [svgReady, setSvgReady] = useState(false)

  useEffect(() => {
    onStatusChange?.(status)
  }, [onStatusChange, status])

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    onSceneSwapRef.current = onSceneSwap
  }, [onSceneSwap])

  const mountSvg = useCallback(() => {
    const frame = frameRef.current
    const markup = markupRef.current

    if (!frame || !markup) {
      return null
    }

    timelineRef.current?.kill()
    timelineRef.current = null

    frame.innerHTML = markup

    const svg = frame.querySelector('svg')

    if (!(svg instanceof SVGSVGElement)) {
      throw new Error('SVG 注入失败，未找到根节点。')
    }

    const timeline = createMaimaiTimeline(svg, {
      onStart: () => {
        setStatus('playing')
      },
      onComplete: () => {
        setStatus('finished')
        onCompleteRef.current?.()
      },
      onSceneSwap: () => {
        onSceneSwapRef.current?.()
      },
      preserveAspectRatio,
      sceneSwapAt,
    })

    timelineRef.current = timeline
    setDuration(Number(timeline.totalDuration().toFixed(3)))
    setStatus('ready')
    setSvgReady(true)
    setError(null)

    return timeline
  }, [frameRef, preserveAspectRatio, sceneSwapAt])

  const replay = useCallback(() => {
    try {
      const timeline = mountSvg()

      if (!timeline) {
        return
      }

      setPlayCount((count) => count + 1)
      timeline.play(0)
    } catch (caughtError) {
      setStatus('error')
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : '重播失败，原因未知。',
      )
    }
  }, [mountSvg])

  useEffect(() => {
    const abortController = new AbortController()
    let disposed = false
    let playFrameId: number | null = null
    const frame = frameRef.current

    async function loadSvg() {
      setStatus('loading')
      setError(null)

      try {
        const markup = await resolveSvgMarkupWithCachedAssets(svgPath)

        if (disposed || abortController.signal.aborted) {
          return
        }

        markupRef.current = markup
        const timeline = mountSvg()

        if (!timeline) {
          throw new Error('转场容器尚未就绪。')
        }

        playFrameId = window.requestAnimationFrame(() => {
          if (disposed) {
            return
          }

          setPlayCount(1)
          timeline.play(0)
        })
      } catch (caughtError) {
        if (abortController.signal.aborted || disposed) {
          return
        }

        setStatus('error')
        setSvgReady(false)
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : '加载转场资源时发生未知错误。',
        )
      }
    }

    void loadSvg()

    return () => {
      disposed = true
      abortController.abort()

      if (playFrameId !== null) {
        window.cancelAnimationFrame(playFrameId)
      }

      timelineRef.current?.kill()
      timelineRef.current = null

      if (frame) {
        frame.innerHTML = ''
      }
    }
  }, [frameRef, mountSvg, svgPath])

  return {
    duration,
    error,
    playCount,
    replay,
    status,
    svgReady,
  }
}
