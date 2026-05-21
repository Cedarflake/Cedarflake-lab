import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

import { MAIMAI_SVG_PATH, MAIMAI_TIMINGS } from '../constants'
import { createMaimaiTimeline } from '../lib/createMaimaiTimeline'

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
