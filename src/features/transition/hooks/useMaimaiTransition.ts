import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

import { MAIMAI_SVG_PATH, MAIMAI_TIMINGS } from '../constants'
import { createMaimaiTimeline } from '../lib/createMaimaiTimeline'

const preloadedSvgAssetPromises = new Map<string, Promise<void>>()

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

function preloadImageAsset(assetUrl: string, signal: AbortSignal) {
  const existingPromise = preloadedSvgAssetPromises.get(assetUrl)

  if (existingPromise) {
    return existingPromise
  }

  const imagePromise = new Promise<void>((resolve, reject) => {
    const image = new Image()

    const cleanup = () => {
      image.onload = null
      image.onerror = null
      signal.removeEventListener('abort', handleAbort)
    }

    const handleAbort = () => {
      cleanup()
      preloadedSvgAssetPromises.delete(assetUrl)
      reject(new DOMException('资源预加载已取消。', 'AbortError'))
    }

    image.onload = () => {
      cleanup()
      resolve()
    }

    image.onerror = () => {
      cleanup()
      preloadedSvgAssetPromises.delete(assetUrl)
      reject(new Error(`SVG 资源加载失败：${assetUrl}`))
    }

    signal.addEventListener('abort', handleAbort, { once: true })

    if (signal.aborted) {
      handleAbort()
      return
    }

    image.decoding = 'async'
    image.src = assetUrl
  })

  preloadedSvgAssetPromises.set(assetUrl, imagePromise)

  return imagePromise
}

async function preloadSvgExternalAssets(markup: string, svgPath: string, signal: AbortSignal) {
  const assetUrls = collectSvgExternalAssetUrls(markup, svgPath)

  if (assetUrls.length === 0) {
    return
  }

  await Promise.all(assetUrls.map((assetUrl) => preloadImageAsset(assetUrl, signal)))
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
        const response = await fetch(svgPath, {
          signal: abortController.signal,
        })

        if (!response.ok) {
          throw new Error(`SVG 加载失败：${response.status} ${response.statusText}`)
        }

        const markup = await response.text()

        if (disposed) {
          return
        }

        await preloadSvgExternalAssets(markup, svgPath, abortController.signal)

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
