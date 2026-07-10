import { useEffect, type MutableRefObject } from "react"

import type {
  FocusOrbAudioInput,
  FocusOrbFit,
  FocusOrbRenderStatus,
  FocusOrbState,
  FocusOrbVariant,
  ResolvedFocusOrbMotionOptions,
  ResolvedFocusOrbRenderingOptions,
  ResolvedFocusOrbShaderOptions,
} from "../types/focusOrb"
import { defaultTextureSrc } from "../config/defaults"
import { reportError, type FocusOrbColorVectors } from "../utils/focusOrb"
import { createFocusOrbProgram, getFocusOrbUniforms, loadTexture, type FocusOrbUniforms } from "../renderer/webgl"

export interface FocusOrbInput {
  hoverTarget: number
  pressedTarget: number
}

export interface FocusOrbTimeline {
  listenTimestamp: number
  readyTimestamp: number
  speakTimestamp: number
}

export interface FocusOrbRuntime {
  active: boolean
  audio?: FocusOrbAudioInput
  colors: FocusOrbColorVectors
  fit: FocusOrbFit
  motion: ResolvedFocusOrbMotionOptions
  onError?: (error: Error) => void
  onRenderComplete?: (status: FocusOrbRenderStatus) => void
  orbScale: number
  paused: boolean
  rendering: ResolvedFocusOrbRenderingOptions
  shader: ResolvedFocusOrbShaderOptions
  state: FocusOrbState
  textureSrc: string
  variant: FocusOrbVariant
}

interface UseFocusOrbRendererOptions {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>
  hostRef: MutableRefObject<HTMLElement | null>
  inputRef: MutableRefObject<FocusOrbInput>
  runtimeRef: MutableRefObject<FocusOrbRuntime>
  timelineRef: MutableRefObject<FocusOrbTimeline>
}

interface AudioFrameOptions {
  audio: FocusOrbAudioInput | undefined
  avgMag: Float32Array
  cumulativeAudio: Float32Array
  delta: number
  hover: number
  motion: ResolvedFocusOrbMotionOptions
  phase: number
  pressed: number
}

export function useFocusOrbRenderer({
  canvasRef,
  hostRef,
  inputRef,
  runtimeRef,
  timelineRef,
}: UseFocusOrbRendererOptions) {
  const effectRuntime = runtimeRef.current
  const effectRendering = effectRuntime.rendering

  useEffect(() => {
    const canvasElement = canvasRef.current
    const hostElement = hostRef.current

    if (!canvasElement || !hostElement) {
      return
    }

    const glContext = canvasElement.getContext("webgl2", {
      alpha: true,
      antialias: effectRendering.antialias,
      premultipliedAlpha: effectRendering.premultipliedAlpha,
    })

    if (!glContext) {
      reportError(runtimeRef.current.onError, new Error("WebGL2 is required for FocusOrb"))
      return
    }

    const canvas = canvasElement
    const host = hostElement
    const gl = glContext
    let program: WebGLProgram

    try {
      program = createFocusOrbProgram(gl)
    } catch (error) {
      reportError(runtimeRef.current.onError, error)
      return
    }

    const vao = gl.createVertexArray()
    const uniforms = getFocusOrbUniforms(gl, program)
    const avgMag = new Float32Array(4)
    const cumulativeAudio = new Float32Array(4)
    const timeline = timelineRef.current
    let animationFrame = 0
    let animationTime = 0
    let cssWidth = 1
    let cssHeight = 1
    let texture: WebGLTexture | null = null
    let loadedTextureSrc = effectRuntime.textureSrc
    let disposed = false
    let hover = 0
    let pressed = 0
    let shouldReportRenderStatus = true
    let lastFrameTime = performance.now() / 1000

    timeline.readyTimestamp = lastFrameTime
    timeline.speakTimestamp = lastFrameTime
    timeline.listenTimestamp = lastFrameTime

    function resizeCanvas() {
      const rect = host.getBoundingClientRect()
      const runtime = runtimeRef.current
      const size = resolveCanvasSize(runtime.rendering, runtime.variant, rect.width, rect.height)

      cssWidth = Math.max(rect.width, 1)
      cssHeight = Math.max(rect.height, 1)
      canvas.width = size.width
      canvas.height = size.height
      gl.viewport(0, 0, canvas.width, canvas.height)
      shouldReportRenderStatus = true
    }

    function render(nowMs: number) {
      if (disposed) {
        return
      }

      const runtime = runtimeRef.current
      const now = nowMs / 1000
      const delta = Math.min(Math.max(now - lastFrameTime, 0), 0.05)

      lastFrameTime = now

      if (runtime.paused) {
        animationFrame = requestAnimationFrame(render)
        return
      }

      animationTime += delta * runtime.motion.timeScale
      hover += (inputRef.current.hoverTarget - hover) * runtime.motion.hoverEase
      pressed += (inputRef.current.pressedTarget - pressed) * runtime.motion.pressEase

      const micLevel = updateAudioFrame({
        audio: runtime.audio,
        avgMag,
        cumulativeAudio,
        delta,
        hover,
        motion: runtime.motion,
        phase: animationTime,
        pressed,
      })

      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(program)
      gl.bindVertexArray(vao)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      setUniforms(gl, uniforms, runtime, timeline, now, animationTime, micLevel, avgMag, cumulativeAudio, {
        cssHeight,
        cssWidth,
        canvasHeight: canvas.height,
        canvasWidth: canvas.width,
      })
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 6)

      if (shouldReportRenderStatus) {
        shouldReportRenderStatus = false
        runtime.onRenderComplete?.({
          active: runtime.active,
          canvasHeight: canvas.height,
          canvasWidth: canvas.width,
          cssHeight,
          cssWidth,
          fit: runtime.fit,
          intensity: runtime.motion.intensity,
          orbScale: runtime.orbScale,
          state: runtime.state,
          textureSrc: loadedTextureSrc,
          variant: runtime.variant,
        })
      }

      animationFrame = requestAnimationFrame(render)
    }

    function loadRuntimeTexture(src: string, canFallback: boolean) {
      loadTexture(gl, src, effectRendering.textureCrossOrigin)
        .then((loadedTexture) => {
          if (disposed) {
            gl.deleteTexture(loadedTexture)
            return
          }

          texture = loadedTexture
          loadedTextureSrc = src
          animationFrame = requestAnimationFrame(render)
        })
        .catch((error: unknown) => {
          if (disposed) {
            return
          }

          reportError(runtimeRef.current.onError, error)

          if (canFallback && src !== defaultTextureSrc) {
            loadRuntimeTexture(defaultTextureSrc, false)
          }
        })
    }

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    resizeCanvas()

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(() => {
            resizeCanvas()
          })

    resizeObserver?.observe(host)
    window.addEventListener("resize", resizeCanvas)

    loadRuntimeTexture(effectRuntime.textureSrc, true)

    return () => {
      disposed = true
      cancelAnimationFrame(animationFrame)
      resizeObserver?.disconnect()
      window.removeEventListener("resize", resizeCanvas)
      gl.deleteTexture(texture)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
    }
  }, [
    canvasRef,
    effectRendering.antialias,
    effectRendering.canvasHeight,
    effectRendering.canvasSize,
    effectRendering.canvasWidth,
    effectRendering.maxCanvasSize,
    effectRendering.pixelRatioCap,
    effectRendering.premultipliedAlpha,
    effectRendering.textureCrossOrigin,
    effectRuntime.textureSrc,
    effectRuntime.variant,
    hostRef,
    inputRef,
    runtimeRef,
    timelineRef,
  ])
}

function resolveCanvasSize(
  rendering: ResolvedFocusOrbRenderingOptions,
  variant: FocusOrbVariant,
  rawCssWidth: number,
  rawCssHeight: number,
) {
  const cssWidth = Math.max(rawCssWidth, 1)
  const cssHeight = Math.max(rawCssHeight, 1)

  if (rendering.canvasWidth || rendering.canvasHeight) {
    return {
      height: clampCanvasDimension(rendering.canvasHeight ?? rendering.canvasSize, rendering.maxCanvasSize),
      width: clampCanvasDimension(rendering.canvasWidth ?? rendering.canvasSize, rendering.maxCanvasSize),
    }
  }

  if (variant === "button") {
    return {
      height: clampCanvasDimension(rendering.canvasSize, rendering.maxCanvasSize),
      width: clampCanvasDimension(rendering.canvasSize, rendering.maxCanvasSize),
    }
  }

  const pixelRatio = Math.min(window.devicePixelRatio || 1, Math.max(rendering.pixelRatioCap, 0.1))

  return {
    height: clampCanvasDimension(cssHeight * pixelRatio, rendering.maxCanvasSize),
    width: clampCanvasDimension(cssWidth * pixelRatio, rendering.maxCanvasSize),
  }
}

function clampCanvasDimension(value: number, maxCanvasSize: number) {
  return Math.min(Math.max(Math.round(value), 1), Math.max(Math.round(maxCanvasSize), 1))
}

function updateAudioFrame({
  audio,
  avgMag,
  cumulativeAudio,
  delta,
  hover,
  motion,
  phase,
  pressed,
}: AudioFrameOptions) {
  const shouldSimulate = audio?.simulated !== false
  const voiceA = Math.sin(phase * motion.voiceSpeedA) * 0.5 + 0.5
  const voiceB = Math.sin(phase * motion.voiceSpeedB + 1.2) * 0.5 + 0.5
  const voiceC = Math.sin(phase * motion.voiceSpeedC + 2.4) * 0.5 + 0.5

  if (shouldSimulate) {
    avgMag[0] = 0.18 + voiceA * 0.22 + hover * 0.08
    avgMag[1] = 0.16 + voiceB * 0.2 + pressed * 0.06
    avgMag[2] = 0.14 + voiceC * 0.18
    avgMag[3] = 0.2 + (voiceA + voiceB + voiceC) * 0.08
  } else {
    avgMag.fill(0)
  }

  if (audio?.avgMag) {
    avgMag.set(audio.avgMag)
  }

  const avgMag0 = (avgMag[0] ?? 0) * motion.intensity
  const avgMag1 = (avgMag[1] ?? 0) * motion.intensity
  const avgMag2 = (avgMag[2] ?? 0) * motion.intensity
  const avgMag3 = (avgMag[3] ?? 0) * motion.intensity

  avgMag[0] = avgMag0
  avgMag[1] = avgMag1
  avgMag[2] = avgMag2
  avgMag[3] = avgMag3

  if (audio?.cumulativeAudio) {
    cumulativeAudio.set(audio.cumulativeAudio)
  } else {
    cumulativeAudio[0] = (cumulativeAudio[0] ?? 0) + avgMag0 * delta
    cumulativeAudio[1] = (cumulativeAudio[1] ?? 0) + avgMag1 * delta
    cumulativeAudio[2] = (cumulativeAudio[2] ?? 0) + avgMag2 * delta
    cumulativeAudio[3] = (cumulativeAudio[3] ?? 0) + avgMag3 * delta
  }

  const simulatedMicLevel = shouldSimulate ? 0.07 + hover * 0.07 + pressed * 0.08 + voiceB * 0.045 : 0

  return (audio?.micLevel ?? simulatedMicLevel) * motion.intensity
}

function setUniforms(
  gl: WebGL2RenderingContext,
  uniforms: FocusOrbUniforms,
  runtime: FocusOrbRuntime,
  timeline: FocusOrbTimeline,
  now: number,
  animationTime: number,
  micLevel: number,
  avgMag: Float32Array,
  cumulativeAudio: Float32Array,
  viewport: {
    canvasHeight: number
    canvasWidth: number
    cssHeight: number
    cssWidth: number
  },
) {
  const shader = runtime.shader

  gl.uniform1i(uniforms.uTextureNoise, 0)
  gl.uniform1f(uniforms.uBackgroundMode, runtime.variant === "background" ? 1 : 0)
  gl.uniform1f(uniforms.uBlurRadius, shader.blurRadius)
  gl.uniform1f(uniforms.uColorMixAmount, shader.colorMixAmount)
  gl.uniform1f(uniforms.uDisplacement, shader.displacement)
  gl.uniform1f(uniforms.uEdgeSoftness, shader.edgeSoftness)
  gl.uniform1f(uniforms.uFbmPowerDamping, shader.fbmPowerDamping)
  gl.uniform1f(uniforms.uFitMode, runtime.fit === "cover" ? 1 : 0)
  gl.uniform1f(uniforms.uIdleSpringDamping, shader.idleSpringDamping)
  gl.uniform1f(uniforms.uIdleTransitionDuration, shader.idleTransitionDuration)
  gl.uniform1f(uniforms.uLayer1Amplitude, shader.layer1Amplitude)
  gl.uniform1f(uniforms.uLayer1Frequency, shader.layer1Frequency)
  gl.uniform1f(uniforms.uLayer2Amplitude, shader.layer2Amplitude)
  gl.uniform1f(uniforms.uLayer2Frequency, shader.layer2Frequency)
  gl.uniform1f(uniforms.uLayer3Amplitude, shader.layer3Amplitude)
  gl.uniform1f(uniforms.uLayer3Frequency, shader.layer3Frequency)
  gl.uniform1f(uniforms.uListenElapsed, Math.max(now - timeline.listenTimestamp, 0))
  gl.uniform1f(uniforms.uListenRadius, shader.listenRadius)
  gl.uniform1f(uniforms.uMainRadius, shader.mainRadius)
  gl.uniform1f(uniforms.uMicLevel, micLevel)
  gl.uniform1f(uniforms.uMicRadiusBoost, shader.micRadiusBoost)
  gl.uniform1f(uniforms.uNoiseScale, shader.noiseScale)
  gl.uniform1f(uniforms.uOrbScale, runtime.orbScale)
  gl.uniform1f(uniforms.uOscillationPeriod, shader.oscillationPeriod)
  gl.uniform1f(uniforms.uReadyElapsed, Math.max(now - timeline.readyTimestamp, 0))
  gl.uniform1f(uniforms.uRotation, shader.rotation)
  gl.uniform1f(
    uniforms.uScreenScaleFactor,
    Math.max(viewport.canvasWidth / viewport.cssWidth, viewport.canvasHeight / viewport.cssHeight, 1),
  )
  gl.uniform1f(uniforms.uSpeakElapsed, Math.max(now - timeline.speakTimestamp, 0))
  gl.uniform1f(uniforms.uSpeakRadius, shader.speakRadius)
  gl.uniform1f(uniforms.uStateListen, runtime.state === "listen" ? 1 : 0)
  gl.uniform1f(uniforms.uStateSpeak, runtime.state === "speak" ? 1 : 0)
  gl.uniform1f(uniforms.uStateSpringDamping, shader.stateSpringDamping)
  gl.uniform1f(uniforms.uStateTransitionDuration, shader.stateTransitionDuration)
  gl.uniform1f(uniforms.uTextureNoiseStrength, shader.textureNoiseStrength)
  gl.uniform1f(uniforms.uTime, animationTime)
  gl.uniform1f(uniforms.uTimeScale, shader.timeScale)
  gl.uniform1f(uniforms.uVerticalOffset, shader.verticalOffset)
  gl.uniform1f(uniforms.uWarpPower, shader.warpPower)
  gl.uniform1f(uniforms.uWaterColorNoiseScale, shader.waterColorNoiseScale)
  gl.uniform1f(uniforms.uWaterColorNoiseStrength, shader.waterColorNoiseStrength)
  gl.uniform1f(uniforms.uWaveSpread, shader.waveSpread)
  gl.uniform1f(uniforms.uWindSpeed, shader.windSpeed)
  gl.uniform2f(uniforms.uOrigin, shader.originX, shader.originY)
  gl.uniform2f(uniforms.uViewport, viewport.canvasWidth, viewport.canvasHeight)
  gl.uniform3fv(uniforms.uBloopColorMain, runtime.colors.main)
  gl.uniform3fv(uniforms.uBloopColorLow, runtime.colors.low)
  gl.uniform3fv(uniforms.uBloopColorMid, runtime.colors.mid)
  gl.uniform3fv(uniforms.uBloopColorHigh, runtime.colors.high)
  gl.uniform4fv(uniforms.uAvgMag, avgMag)
  gl.uniform4fv(uniforms.uCumulativeAudio, cumulativeAudio)
}
