import {
  forwardRef,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { defaultColors, defaultTextureSrc } from "../../config/defaults"
import type {
  FocusOrbBackgroundProps,
  FocusOrbButtonProps,
  FocusOrbColors,
  FocusOrbProps,
  FocusOrbState,
} from "../../types/focusOrb"
import {
  assignRef,
  createHostStyle,
  mergeClassNames,
  resolveColorVectors,
  resolveInteractionOptions,
  resolveMotionOptions,
  resolveRenderingOptions,
  resolveShaderOptions,
} from "../../utils/focusOrb"
import {
  useFocusOrbRenderer,
  type FocusOrbInput,
  type FocusOrbRuntime,
  type FocusOrbTimeline,
} from "../../hooks/useFocusOrbRenderer"

import "../../styles/focus-orb.css"

type FocusOrbHost = HTMLButtonElement | HTMLDivElement

export const FocusOrb = forwardRef<FocusOrbHost, FocusOrbProps>((props, forwardedRef) => {
  const variant = props.variant ?? "button"
  const {
    active,
    audio,
    canvasClassName,
    canvasSize,
    className,
    colors,
    defaultActive = true,
    fit,
    height,
    interaction,
    intensity,
    maxCanvasSize,
    motion,
    onError,
    onRenderComplete,
    orbScale,
    paused = false,
    rendering,
    shader,
    state,
    style,
    textureSrc = defaultTextureSrc,
    width,
  } = props
  const [internalActive, setInternalActive] = useState(defaultActive)
  const resolvedActive = active ?? internalActive
  const resolvedState = state ?? (resolvedActive ? "speak" : "listen")
  const resolvedFit = fit ?? (variant === "background" ? "cover" : "contain")
  const resolvedOrbScale = orbScale ?? (variant === "background" ? 1.9 : 1)
  const resolvedWidth = width ?? (variant === "button" ? 256 : "100%")
  const resolvedHeight = height ?? (variant === "button" ? 256 : "100%")
  const resolvedColors = useMemo<FocusOrbColors>(
    () => ({
      ...defaultColors,
      ...colors,
    }),
    [colors],
  )
  const colorVectors = useMemo(() => resolveColorVectors(resolvedColors), [resolvedColors])
  const resolvedInteraction = useMemo(() => resolveInteractionOptions(interaction), [interaction])
  const resolvedMotion = useMemo(() => resolveMotionOptions(motion, intensity), [intensity, motion])
  const resolvedRendering = useMemo(
    () => resolveRenderingOptions(rendering, canvasSize, maxCanvasSize),
    [canvasSize, maxCanvasSize, rendering],
  )
  const resolvedShader = useMemo(() => resolveShaderOptions(shader), [shader])
  const hostRef = useRef<HTMLElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const inputRef = useRef<FocusOrbInput>({
    hoverTarget: 0,
    pressedTarget: 0,
  })
  const timelineRef = useRef<FocusOrbTimeline>({
    listenTimestamp: 0,
    readyTimestamp: 0,
    speakTimestamp: 0,
  })
  const runtimeRef = useRef<FocusOrbRuntime>({
    active: resolvedActive,
    audio,
    colors: colorVectors,
    fit: resolvedFit,
    motion: resolvedMotion,
    onError,
    onRenderComplete,
    orbScale: resolvedOrbScale,
    paused,
    rendering: resolvedRendering,
    shader: resolvedShader,
    state: resolvedState,
    textureSrc,
    variant,
  })
  const previousStateRef = useRef<FocusOrbState>(resolvedState)
  const hostStyle = useMemo(
    () => createHostStyle(resolvedWidth, resolvedHeight, resolvedInteraction, style),
    [
      resolvedHeight,
      resolvedInteraction.hoverScale,
      resolvedInteraction.pressedScale,
      resolvedInteraction.transitionMs,
      resolvedWidth,
      style,
    ],
  )
  const setHostRef = useCallback(
    (element: FocusOrbHost | null) => {
      hostRef.current = element
      assignRef(forwardedRef, element)
    },
    [forwardedRef],
  )

  runtimeRef.current = {
    active: resolvedActive,
    audio,
    colors: colorVectors,
    fit: resolvedFit,
    motion: resolvedMotion,
    onError,
    onRenderComplete,
    orbScale: resolvedOrbScale,
    paused,
    rendering: resolvedRendering,
    shader: resolvedShader,
    state: resolvedState,
    textureSrc,
    variant,
  }

  useEffect(() => {
    if (previousStateRef.current === resolvedState) {
      return
    }

    const now = performance.now() / 1000

    previousStateRef.current = resolvedState

    if (resolvedState === "speak") {
      timelineRef.current.speakTimestamp = now
      return
    }

    timelineRef.current.listenTimestamp = now
  }, [resolvedState])

  useFocusOrbRenderer({
    canvasRef,
    hostRef,
    inputRef,
    runtimeRef,
    timelineRef,
  })

  if (props.variant === "background") {
    const {
      active: _active,
      ariaHidden = true,
      audio: _audio,
      canvasClassName: _canvasClassName,
      canvasSize: _canvasSize,
      className: _className,
      colors: _colors,
      defaultActive: _defaultActive,
      fit: _fit,
      height: _height,
      interaction: _interaction,
      intensity: _intensity,
      interactive = false,
      maxCanvasSize: _maxCanvasSize,
      motion: _motion,
      onError: _onError,
      onPointerCancel,
      onPointerDown,
      onPointerEnter,
      onPointerLeave,
      onPointerUp,
      onRenderComplete: _onRenderComplete,
      orbScale: _orbScale,
      paused: _paused,
      rendering: _rendering,
      shader: _shader,
      state: _state,
      style: _style,
      textureSrc: _textureSrc,
      variant: _variant,
      width: _width,
      ...divProps
    } = props

    return (
      <div
        {...divProps}
        ref={setHostRef}
        aria-hidden={ariaHidden}
        className={mergeClassNames("focus-orb", "focus-orb--background", className)}
        data-interactive={interactive ? "true" : undefined}
        onPointerCancel={(event: ReactPointerEvent<HTMLDivElement>) => {
          inputRef.current.pressedTarget = 0
          onPointerCancel?.(event)
        }}
        onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
          inputRef.current.pressedTarget = 1
          onPointerDown?.(event)
        }}
        onPointerEnter={(event: ReactPointerEvent<HTMLDivElement>) => {
          inputRef.current.hoverTarget = 1
          onPointerEnter?.(event)
        }}
        onPointerLeave={(event: ReactPointerEvent<HTMLDivElement>) => {
          inputRef.current.hoverTarget = 0
          inputRef.current.pressedTarget = 0
          onPointerLeave?.(event)
        }}
        onPointerUp={(event: ReactPointerEvent<HTMLDivElement>) => {
          inputRef.current.pressedTarget = 0
          onPointerUp?.(event)
        }}
        style={hostStyle}
      >
        <canvas aria-hidden="true" ref={canvasRef} className={mergeClassNames("focus-orb__canvas", canvasClassName)} />
      </div>
    )
  }

  const {
    active: _active,
    ariaLabelActive = "Exit focus mode",
    ariaLabelInactive = "Enter focus mode",
    audio: _audio,
    canvasClassName: _canvasClassName,
    canvasSize: _canvasSize,
    className: _className,
    colors: _colors,
    defaultActive: _defaultActive,
    fit: _fit,
    height: _height,
    interaction: _interaction,
    intensity: _intensity,
    maxCanvasSize: _maxCanvasSize,
    motion: _motion,
    onActiveChange,
    onClick,
    onError: _onError,
    onPointerCancel,
    onPointerDown,
    onPointerEnter,
    onPointerLeave,
    onPointerUp,
    onRenderComplete: _onRenderComplete,
    orbScale: _orbScale,
    paused: _paused,
    rendering: _rendering,
    shader: _shader,
    state: _state,
    style: _style,
    textureSrc: _textureSrc,
    variant: _variant,
    width: _width,
    ...buttonProps
  } = props

  return (
    <button
      {...buttonProps}
      ref={setHostRef}
      aria-label={resolvedActive ? ariaLabelActive : ariaLabelInactive}
      aria-pressed={resolvedActive}
      className={mergeClassNames("focus-orb", "focus-orb--button", className)}
      onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
        if (!buttonProps.disabled) {
          const nextActive = !resolvedActive

          if (active === undefined) {
            setInternalActive(nextActive)
          }

          onActiveChange?.(nextActive)
        }

        onClick?.(event)
      }}
      onPointerCancel={(event: ReactPointerEvent<HTMLButtonElement>) => {
        inputRef.current.pressedTarget = 0
        onPointerCancel?.(event)
      }}
      onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
        inputRef.current.pressedTarget = 1
        onPointerDown?.(event)
      }}
      onPointerEnter={(event: ReactPointerEvent<HTMLButtonElement>) => {
        inputRef.current.hoverTarget = 1
        onPointerEnter?.(event)
      }}
      onPointerLeave={(event: ReactPointerEvent<HTMLButtonElement>) => {
        inputRef.current.hoverTarget = 0
        inputRef.current.pressedTarget = 0
        onPointerLeave?.(event)
      }}
      onPointerUp={(event: ReactPointerEvent<HTMLButtonElement>) => {
        inputRef.current.pressedTarget = 0
        onPointerUp?.(event)
      }}
      style={hostStyle}
      type={buttonProps.type ?? "button"}
    >
      <canvas aria-hidden="true" ref={canvasRef} className={mergeClassNames("focus-orb__canvas", canvasClassName)} />
    </button>
  )
})

FocusOrb.displayName = "FocusOrb"

export function FocusOrbButton(props: Omit<FocusOrbButtonProps, "variant">) {
  return <FocusOrb {...props} variant="button" />
}

export function FocusOrbBackground(props: Omit<FocusOrbBackgroundProps, "variant">) {
  return <FocusOrb {...props} variant="background" />
}

export type {
  FocusOrbBackgroundProps,
  FocusOrbButtonProps,
  FocusOrbColors,
  FocusOrbProps,
  FocusOrbState,
}
