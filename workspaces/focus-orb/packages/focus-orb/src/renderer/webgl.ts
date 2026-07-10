import { fragmentShaderSource, vertexShaderSource } from "./shader"
import type { FocusOrbTextureCrossOrigin } from "../types/focusOrb"

export interface FocusOrbUniforms {
  uAvgMag: WebGLUniformLocation | null
  uBloopColorHigh: WebGLUniformLocation | null
  uBloopColorLow: WebGLUniformLocation | null
  uBloopColorMain: WebGLUniformLocation | null
  uBloopColorMid: WebGLUniformLocation | null
  uBackgroundMode: WebGLUniformLocation | null
  uBlurRadius: WebGLUniformLocation | null
  uColorMixAmount: WebGLUniformLocation | null
  uCumulativeAudio: WebGLUniformLocation | null
  uDisplacement: WebGLUniformLocation | null
  uEdgeSoftness: WebGLUniformLocation | null
  uFbmPowerDamping: WebGLUniformLocation | null
  uFitMode: WebGLUniformLocation | null
  uIdleSpringDamping: WebGLUniformLocation | null
  uIdleTransitionDuration: WebGLUniformLocation | null
  uLayer1Amplitude: WebGLUniformLocation | null
  uLayer1Frequency: WebGLUniformLocation | null
  uLayer2Amplitude: WebGLUniformLocation | null
  uLayer2Frequency: WebGLUniformLocation | null
  uLayer3Amplitude: WebGLUniformLocation | null
  uLayer3Frequency: WebGLUniformLocation | null
  uListenRadius: WebGLUniformLocation | null
  uListenElapsed: WebGLUniformLocation | null
  uMainRadius: WebGLUniformLocation | null
  uMicLevel: WebGLUniformLocation | null
  uMicRadiusBoost: WebGLUniformLocation | null
  uNoiseScale: WebGLUniformLocation | null
  uOrbScale: WebGLUniformLocation | null
  uOrigin: WebGLUniformLocation | null
  uOscillationPeriod: WebGLUniformLocation | null
  uReadyElapsed: WebGLUniformLocation | null
  uRotation: WebGLUniformLocation | null
  uScreenScaleFactor: WebGLUniformLocation | null
  uSpeakElapsed: WebGLUniformLocation | null
  uSpeakRadius: WebGLUniformLocation | null
  uStateListen: WebGLUniformLocation | null
  uStateSpeak: WebGLUniformLocation | null
  uStateSpringDamping: WebGLUniformLocation | null
  uStateTransitionDuration: WebGLUniformLocation | null
  uTextureNoise: WebGLUniformLocation | null
  uTextureNoiseStrength: WebGLUniformLocation | null
  uTime: WebGLUniformLocation | null
  uTimeScale: WebGLUniformLocation | null
  uVerticalOffset: WebGLUniformLocation | null
  uViewport: WebGLUniformLocation | null
  uWarpPower: WebGLUniformLocation | null
  uWaterColorNoiseScale: WebGLUniformLocation | null
  uWaterColorNoiseStrength: WebGLUniformLocation | null
  uWaveSpread: WebGLUniformLocation | null
  uWindSpeed: WebGLUniformLocation | null
}

export function createFocusOrbProgram(gl: WebGL2RenderingContext) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)
  const program = gl.createProgram()

  if (!program) {
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    throw new Error("Unable to create WebGL program")
  }

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Program link failed"

    gl.deleteProgram(program)
    throw new Error(message)
  }

  return program
}

export function getFocusOrbUniforms(gl: WebGL2RenderingContext, program: WebGLProgram): FocusOrbUniforms {
  return {
    uAvgMag: gl.getUniformLocation(program, "uAvgMag"),
    uBloopColorHigh: gl.getUniformLocation(program, "uBloopColorHigh"),
    uBloopColorLow: gl.getUniformLocation(program, "uBloopColorLow"),
    uBloopColorMain: gl.getUniformLocation(program, "uBloopColorMain"),
    uBloopColorMid: gl.getUniformLocation(program, "uBloopColorMid"),
    uBackgroundMode: gl.getUniformLocation(program, "uBackgroundMode"),
    uBlurRadius: gl.getUniformLocation(program, "uBlurRadius"),
    uColorMixAmount: gl.getUniformLocation(program, "uColorMixAmount"),
    uCumulativeAudio: gl.getUniformLocation(program, "uCumulativeAudio"),
    uDisplacement: gl.getUniformLocation(program, "uDisplacement"),
    uEdgeSoftness: gl.getUniformLocation(program, "uEdgeSoftness"),
    uFbmPowerDamping: gl.getUniformLocation(program, "uFbmPowerDamping"),
    uFitMode: gl.getUniformLocation(program, "uFitMode"),
    uIdleSpringDamping: gl.getUniformLocation(program, "uIdleSpringDamping"),
    uIdleTransitionDuration: gl.getUniformLocation(program, "uIdleTransitionDuration"),
    uLayer1Amplitude: gl.getUniformLocation(program, "uLayer1Amplitude"),
    uLayer1Frequency: gl.getUniformLocation(program, "uLayer1Frequency"),
    uLayer2Amplitude: gl.getUniformLocation(program, "uLayer2Amplitude"),
    uLayer2Frequency: gl.getUniformLocation(program, "uLayer2Frequency"),
    uLayer3Amplitude: gl.getUniformLocation(program, "uLayer3Amplitude"),
    uLayer3Frequency: gl.getUniformLocation(program, "uLayer3Frequency"),
    uListenRadius: gl.getUniformLocation(program, "uListenRadius"),
    uListenElapsed: gl.getUniformLocation(program, "uListenElapsed"),
    uMainRadius: gl.getUniformLocation(program, "uMainRadius"),
    uMicLevel: gl.getUniformLocation(program, "uMicLevel"),
    uMicRadiusBoost: gl.getUniformLocation(program, "uMicRadiusBoost"),
    uNoiseScale: gl.getUniformLocation(program, "uNoiseScale"),
    uOrbScale: gl.getUniformLocation(program, "uOrbScale"),
    uOrigin: gl.getUniformLocation(program, "uOrigin"),
    uOscillationPeriod: gl.getUniformLocation(program, "uOscillationPeriod"),
    uReadyElapsed: gl.getUniformLocation(program, "uReadyElapsed"),
    uRotation: gl.getUniformLocation(program, "uRotation"),
    uScreenScaleFactor: gl.getUniformLocation(program, "uScreenScaleFactor"),
    uSpeakElapsed: gl.getUniformLocation(program, "uSpeakElapsed"),
    uSpeakRadius: gl.getUniformLocation(program, "uSpeakRadius"),
    uStateListen: gl.getUniformLocation(program, "uStateListen"),
    uStateSpeak: gl.getUniformLocation(program, "uStateSpeak"),
    uStateSpringDamping: gl.getUniformLocation(program, "uStateSpringDamping"),
    uStateTransitionDuration: gl.getUniformLocation(program, "uStateTransitionDuration"),
    uTextureNoise: gl.getUniformLocation(program, "uTextureNoise"),
    uTextureNoiseStrength: gl.getUniformLocation(program, "uTextureNoiseStrength"),
    uTime: gl.getUniformLocation(program, "uTime"),
    uTimeScale: gl.getUniformLocation(program, "uTimeScale"),
    uVerticalOffset: gl.getUniformLocation(program, "uVerticalOffset"),
    uViewport: gl.getUniformLocation(program, "uViewport"),
    uWarpPower: gl.getUniformLocation(program, "uWarpPower"),
    uWaterColorNoiseScale: gl.getUniformLocation(program, "uWaterColorNoiseScale"),
    uWaterColorNoiseStrength: gl.getUniformLocation(program, "uWaterColorNoiseStrength"),
    uWaveSpread: gl.getUniformLocation(program, "uWaveSpread"),
    uWindSpeed: gl.getUniformLocation(program, "uWindSpeed"),
  }
}

export function loadTexture(
  gl: WebGL2RenderingContext,
  src: string,
  crossOrigin: FocusOrbTextureCrossOrigin | undefined,
) {
  return new Promise<WebGLTexture>((resolve, reject) => {
    const image = new Image()

    if (crossOrigin !== undefined) {
      image.crossOrigin = crossOrigin
    }

    image.onload = () => {
      const texture = gl.createTexture()

      if (!texture) {
        reject(new Error("Unable to create WebGL texture"))
        return
      }

      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      resolve(texture)
    }
    image.onerror = () => reject(new Error(`Failed to load ${src}`))
    image.src = src
  })
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)

  if (!shader) {
    throw new Error("Unable to create WebGL shader")
  }

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Shader compile failed"

    gl.deleteShader(shader)
    throw new Error(message)
  }

  return shader
}
