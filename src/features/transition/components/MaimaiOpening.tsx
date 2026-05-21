import {
  forwardRef,
  useCallback,
  useState,
  useImperativeHandle,
  useRef,
  type CSSProperties,
} from 'react'

import { MAIMAI_SVG_PATH } from '../constants'
import { useMaimaiTransition, type TransitionStatus } from '../hooks/useMaimaiTransition'
import styles from './MaimaiOpening.module.css'

export type MaimaiOpeningFitMode = 'contain' | 'cover'
export type MaimaiOpeningLayoutMode = 'frame' | 'fullscreen'

export type MaimaiOpeningProps = {
  className?: string
  fitMode?: MaimaiOpeningFitMode
  initialStageBackgroundColor?: string
  initialStageBackgroundImage?: string
  initialStageBackgroundPosition?: string
  initialStageBackgroundSize?: string
  layoutMode?: MaimaiOpeningLayoutMode
  onComplete?: () => void
  onSceneSwap?: () => void
  onStatusChange?: (status: TransitionStatus) => void
  sceneSwapAt?: number
  stageBackgroundColor?: string
  stageBackgroundImage?: string
  stageBackgroundPosition?: string
  stageBackgroundSize?: string
  svgPath?: string
}

export type MaimaiOpeningHandle = {
  replay: () => void
}

export const MaimaiOpening = forwardRef<MaimaiOpeningHandle, MaimaiOpeningProps>(
  function MaimaiOpening({
    className,
    fitMode = 'contain',
    initialStageBackgroundColor,
    initialStageBackgroundImage,
    initialStageBackgroundPosition,
    initialStageBackgroundSize,
    layoutMode = 'frame',
    onComplete,
    onSceneSwap,
    onStatusChange,
    sceneSwapAt,
    stageBackgroundColor,
    stageBackgroundImage,
    stageBackgroundPosition,
    stageBackgroundSize,
    svgPath = MAIMAI_SVG_PATH,
  }: MaimaiOpeningProps,
  ref,
  ) {
    const frameRef = useRef<HTMLDivElement>(null)
    const [hasSwappedStage, setHasSwappedStage] = useState(false)

    const handleSceneSwap = useCallback(() => {
      onSceneSwap?.()
      setHasSwappedStage(true)
    }, [onSceneSwap])

    const { replay: replayTransition } = useMaimaiTransition(frameRef, {
      onComplete,
      onSceneSwap: handleSceneSwap,
      onStatusChange,
      preserveAspectRatio: fitMode === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet',
      sceneSwapAt,
      svgPath,
    })

    const replay = useCallback(() => {
      setHasSwappedStage(false)
      replayTransition()
    }, [replayTransition])

    useImperativeHandle(
      ref,
      () => ({
        replay,
      }),
      [replay],
    )

    const rootClassName = className ? `${styles.root} ${className}` : styles.root
    const currentStageBackgroundColor = hasSwappedStage
      ? (stageBackgroundColor ?? '#fff')
      : (initialStageBackgroundColor ?? '#fff')
    const currentStageBackgroundImage = hasSwappedStage
      ? (stageBackgroundImage ?? 'none')
      : (initialStageBackgroundImage ?? 'none')
    const currentStageBackgroundPosition = hasSwappedStage
      ? (stageBackgroundPosition ?? 'center center')
      : (initialStageBackgroundPosition ?? 'center center')
    const currentStageBackgroundSize = hasSwappedStage
      ? (stageBackgroundSize ?? 'cover')
      : (initialStageBackgroundSize ?? 'cover')

    const rootStyle: CSSProperties & {
      '--opening-color-stage-bg'?: string
      '--opening-stage-background-image'?: string
      '--opening-stage-background-position'?: string
      '--opening-stage-background-size'?: string
    } = {
      '--opening-color-stage-bg': currentStageBackgroundColor,
      '--opening-stage-background-image':
        currentStageBackgroundImage === 'none'
          ? 'none'
          : `url("${currentStageBackgroundImage}")`,
      '--opening-stage-background-position': currentStageBackgroundPosition,
      '--opening-stage-background-size': currentStageBackgroundSize,
    }

    const stageClassName = [
      styles.stage,
      layoutMode === 'fullscreen' ? styles.stageFullscreen : styles.stageFrame,
    ].join(' ')

    return (
      <div
        className={rootClassName}
        data-fit-mode={fitMode}
        data-layout-mode={layoutMode}
        style={rootStyle}
      >
        <div className={styles.sceneBackground} aria-hidden="true" />

        <div className={styles.viewport}>
          <div className={stageClassName}>
            <div
              ref={frameRef}
              className={styles.frame}
              aria-label="舞萌开场动画"
              role="img"
            />
          </div>
        </div>
      </div>
    )
  },
)
