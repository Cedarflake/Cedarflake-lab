"use client"

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ForwardedRef,
  type HTMLAttributes,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import "./focus-orb.css"

export type FocusOrbVariant = "button" | "background"
export type FocusOrbState = "speak" | "listen"
export type FocusOrbFit = "contain" | "cover"

export interface FocusOrbColors {
  main: string
  low: string
  mid: string
  high: string
}

export interface FocusOrbRenderStatus {
  canvasWidth: number
  canvasHeight: number
  cssWidth: number
  cssHeight: number
  textureSrc: string
  variant: FocusOrbVariant
}

interface FocusOrbBaseProps {
  textureSrc?: string
  colors?: Partial<FocusOrbColors>
  active?: boolean
  defaultActive?: boolean
  state?: FocusOrbState
  width?: number | string
  height?: number | string
  canvasSize?: number
  maxCanvasSize?: number
  className?: string
  canvasClassName?: string
  style?: CSSProperties
  intensity?: number
  fit?: FocusOrbFit
  orbScale?: number
  paused?: boolean
  onRenderComplete?: (status: FocusOrbRenderStatus) => void
  onError?: (error: Error) => void
}

export interface FocusOrbButtonProps
  extends FocusOrbBaseProps,
    Omit<
      ButtonHTMLAttributes<HTMLButtonElement>,
      "children" | "className" | "color" | "height" | "onError" | "style" | "width"
    > {
  variant?: "button"
  ariaLabelActive?: string
  ariaLabelInactive?: string
  onActiveChange?: (active: boolean) => void
}

export interface FocusOrbBackgroundProps
  extends FocusOrbBaseProps,
    Omit<
      HTMLAttributes<HTMLDivElement>,
      "children" | "className" | "color" | "height" | "onError" | "style" | "width"
    > {
  variant: "background"
  interactive?: boolean
  ariaHidden?: boolean
}

export type FocusOrbProps = FocusOrbButtonProps | FocusOrbBackgroundProps

type FocusOrbHost = HTMLButtonElement | HTMLDivElement
type Vec3 = Float32Array

interface FocusOrbColorVectors {
  main: Vec3
  low: Vec3
  mid: Vec3
  high: Vec3
}

interface FocusOrbRuntime {
  active: boolean
  state: FocusOrbState
  colors: FocusOrbColorVectors
  intensity: number
  fit: FocusOrbFit
  orbScale: number
  paused: boolean
  variant: FocusOrbVariant
  onRenderComplete?: (status: FocusOrbRenderStatus) => void
  onError?: (error: Error) => void
}

interface FocusOrbInput {
  hoverTarget: number
  pressedTarget: number
}

interface FocusOrbTimeline {
  readyTimestamp: number
  speakTimestamp: number
  listenTimestamp: number
}

interface FocusOrbUniforms {
  uTime: WebGLUniformLocation | null
  uReadyTimestamp: WebGLUniformLocation | null
  uSpeakTimestamp: WebGLUniformLocation | null
  uListenTimestamp: WebGLUniformLocation | null
  uStateSpeak: WebGLUniformLocation | null
  uStateListen: WebGLUniformLocation | null
  uMicLevel: WebGLUniformLocation | null
  uScreenScaleFactor: WebGLUniformLocation | null
  uViewport: WebGLUniformLocation | null
  uAvgMag: WebGLUniformLocation | null
  uCumulativeAudio: WebGLUniformLocation | null
  uBloopColorMain: WebGLUniformLocation | null
  uBloopColorLow: WebGLUniformLocation | null
  uBloopColorMid: WebGLUniformLocation | null
  uBloopColorHigh: WebGLUniformLocation | null
  uTextureNoise: WebGLUniformLocation | null
  uFitMode: WebGLUniformLocation | null
  uOrbScale: WebGLUniformLocation | null
}

type FocusOrbStyle = CSSProperties & {
  "--focus-orb-height"?: string
  "--focus-orb-width"?: string
}

const defaultTextureSrc = new URL("./assets/noise-watercolor-m3j88gni.webp", import.meta.url).toString()

const defaultColors: FocusOrbColors = {
  main: "#dcf7ff",
  low: "#0181fe",
  mid: "#a4efff",
  high: "#fffdef",
}

const vertexShaderSource = `#version 300 es
precision highp float;

out vec4 out_position;
out vec2 out_uv;

const vec4 blitFullscreenTrianglePositions[6] = vec4[](
  vec4(-1.0, -1.0, 0.0, 1.0),
  vec4(3.0, -1.0, 0.0, 1.0),
  vec4(-1.0, 3.0, 0.0, 1.0),
  vec4(-1.0, -1.0, 0.0, 1.0),
  vec4(3.0, -1.0, 0.0, 1.0),
  vec4(-1.0, 3.0, 0.0, 1.0)
);

void main() {
  out_position = blitFullscreenTrianglePositions[gl_VertexID];
  out_uv = out_position.xy * 0.5 + 0.5;
  out_uv.y = 1.0 - out_uv.y;
  gl_Position = out_position;
}
`

const fragmentShaderSource = `#version 300 es
#define E 2.71828182846
#define PI 3.14159265358979323844

precision highp float;

struct ColoredSDF {
  float distance;
  vec4 color;
};

struct SDFArgs {
  vec2 st;
  float amount;
  float duration;
  float time;
  float mainRadius;
};

in vec2 out_uv;
out vec4 fragColor;

uniform float uTime;
uniform float uReadyTimestamp;
uniform float uSpeakTimestamp;
uniform float uListenTimestamp;
uniform float uStateSpeak;
uniform float uStateListen;
uniform float uMicLevel;
uniform float uScreenScaleFactor;
uniform float uFitMode;
uniform float uOrbScale;
uniform vec2 uViewport;
uniform vec4 uAvgMag;
uniform vec4 uCumulativeAudio;
uniform vec3 uBloopColorMain;
uniform vec3 uBloopColorLow;
uniform vec3 uBloopColorMid;
uniform vec3 uBloopColorHigh;
uniform sampler2D uTextureNoise;

float scaled(float edge0, float edge1, float value) {
  return clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
}

float fixedSpring(float t, float damping) {
  float springValue = mix(
    1.0 - exp(-E * 2.0 * t) * cos((1.0 - damping) * 115.0 * t),
    1.0,
    scaled(0.0, 1.0, t)
  );

  return springValue * (1.0 - t) + t;
}

float random(vec2 point) {
  return fract(sin(dot(point.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 curve = local * local * (3.0 - 2.0 * local);
  float a = random(cell);
  float b = random(cell + vec2(1.0, 0.0));
  float c = random(cell + vec2(0.0, 1.0));
  float d = random(cell + vec2(1.0, 1.0));

  return mix(mix(a, b, curve.x), mix(c, d, curve.x), curve.y);
}

float random3(vec3 point) {
  point = fract(point * vec3(0.1031, 0.11369, 0.13787));
  point += dot(point, point.yzx + 19.19);

  return fract((point.x + point.y) * point.z);
}

float cnoise(vec3 point) {
  vec3 cell = floor(point);
  vec3 local = fract(point);
  vec3 curve = local * local * (3.0 - 2.0 * local);

  float n000 = random3(cell + vec3(0.0, 0.0, 0.0));
  float n100 = random3(cell + vec3(1.0, 0.0, 0.0));
  float n010 = random3(cell + vec3(0.0, 1.0, 0.0));
  float n110 = random3(cell + vec3(1.0, 1.0, 0.0));
  float n001 = random3(cell + vec3(0.0, 0.0, 1.0));
  float n101 = random3(cell + vec3(1.0, 0.0, 1.0));
  float n011 = random3(cell + vec3(0.0, 1.0, 1.0));
  float n111 = random3(cell + vec3(1.0, 1.0, 1.0));

  float x00 = mix(n000, n100, curve.x);
  float x10 = mix(n010, n110, curve.x);
  float x01 = mix(n001, n101, curve.x);
  float x11 = mix(n011, n111, curve.x);
  float y0 = mix(x00, x10, curve.y);
  float y1 = mix(x01, x11, curve.y);

  return mix(y0, y1, curve.z) * 2.0 - 1.0;
}

float fbm(vec2 point) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int index = 0; index < 4; index++) {
    value += noise(point) * amplitude;
    point = point * 2.02 + vec2(7.13, 19.31);
    amplitude *= 0.5;
  }

  return value;
}

vec3 blendLinearBurn(vec3 base, vec3 blend) {
  return max(base + blend - vec3(1.0), vec3(0.0));
}

vec3 blendLinearBurn(vec3 base, vec3 blend, float opacity) {
  return blendLinearBurn(base, blend) * opacity + base * (1.0 - opacity);
}

ColoredSDF applyIdleState(ColoredSDF sdf, SDFArgs args) {
  float entryAnimation = fixedSpring(scaled(0.0, 2.0, args.duration), 0.96);
  float radius = args.mainRadius * (0.74 + 0.26 * entryAnimation);
  float distanceToIdle = length(args.st) - radius;

  sdf.distance = mix(sdf.distance, distanceToIdle, args.amount);
  sdf.color = mix(sdf.color, vec4(uBloopColorMain, 1.0), args.amount);

  return sdf;
}

ColoredSDF applyListenAndSpeakState(ColoredSDF sdf, SDFArgs args, bool listening) {
  float entryAnimation = fixedSpring(scaled(0.0, 2.0, args.duration), 0.92);
  float radius =
    (listening ? 0.37 : 0.43) * (1.0 - (1.0 - entryAnimation) * 0.25) +
    uMicLevel * 0.065;
  float displacementOffset = 0.01 * sin(2.0 * PI / 4.0 * args.time);
  vec2 adjustedSt = args.st - vec2(0.0, displacementOffset);
  float scaleFactor = 1.0 / (2.0 * radius);
  vec2 uv = adjustedSt * scaleFactor + 0.5;

  uv.y = 1.0 - uv.y;

  float noiseScale = 1.25;
  float windSpeed = 0.075;
  float warpPower = 0.19;
  float waterColorNoiseScale = 18.0;
  float waterColorNoiseStrength = 0.01;
  float textureNoiseStrength = 0.08;
  float verticalOffset = 0.09;
  float waveSpread = 1.0;
  float blurRadius = 1.5;
  float time = args.time * 0.85;
  vec3 sinOffsets = vec3(
    uCumulativeAudio.x * 0.15,
    -uCumulativeAudio.y * 0.5,
    uCumulativeAudio.z * 1.5
  );
  float noiseX = cnoise(vec3(uv + vec2(0.0, 74.8572), (time + uCumulativeAudio.x * 0.05) * 0.3));
  float noiseY = cnoise(vec3(uv + vec2(203.91282, 10.0), (time + uCumulativeAudio.z * 0.05) * 0.3));

  uv += vec2(noiseX * 2.0, noiseY) * warpPower;

  float noiseA =
    cnoise(vec3(uv * waterColorNoiseScale + vec2(344.91282, 0.0), time * 0.3)) +
    cnoise(vec3(uv * waterColorNoiseScale * 2.2 + vec2(723.937, 0.0), time * 0.4)) * 0.5;

  uv += noiseA * waterColorNoiseStrength;
  uv.y -= verticalOffset;

  vec2 textureUv = uv;
  float textureSampleR0 = texture(uTextureNoise, textureUv).r;
  float textureSampleG0 = texture(uTextureNoise, vec2(textureUv.x, 1.0 - textureUv.y)).g;
  float textureNoiseDisp0 =
    mix(
      textureSampleR0 - 0.5,
      textureSampleG0 - 0.5,
      (sin(time + uCumulativeAudio.a * 2.0) + 1.0) * 0.5
    ) *
    textureNoiseStrength;

  textureUv += vec2(63.861 + uCumulativeAudio.x * 0.05, 368.937);

  float textureSampleR1 = texture(uTextureNoise, textureUv).r;
  float textureSampleG1 = texture(uTextureNoise, vec2(textureUv.x, 1.0 - textureUv.y)).g;
  float textureNoiseDisp1 =
    mix(
      textureSampleR1 - 0.5,
      textureSampleG1 - 0.5,
      (sin(time + uCumulativeAudio.a * 2.0) + 1.0) * 0.5
    ) *
    textureNoiseStrength;

  textureUv += vec2(272.861, 829.937 + uCumulativeAudio.y * 0.1);
  textureUv += vec2(180.302 - uCumulativeAudio.z * 0.1, 819.871);

  float textureSampleR3 = texture(uTextureNoise, textureUv).r;
  float textureSampleG3 = texture(uTextureNoise, vec2(textureUv.x, 1.0 - textureUv.y)).g;
  float textureNoiseDisp3 =
    mix(
      textureSampleR3 - 0.5,
      textureSampleG3 - 0.5,
      (sin(time + uCumulativeAudio.a * 2.0) + 1.0) * 0.5
    ) *
    textureNoiseStrength;

  uv += textureNoiseDisp0;

  vec2 st = uv * noiseScale;
  vec2 q = vec2(0.0);

  q.x = fbm(st * 0.5 + windSpeed * (time + uCumulativeAudio.a * 0.175));
  q.y = fbm(st * 0.5 + windSpeed * (time + uCumulativeAudio.x * 0.136));

  vec2 r = vec2(0.0);

  r.x = fbm(st + q + vec2(0.3, 9.2) + 0.15 * (time + uCumulativeAudio.y * 0.234));
  r.y = fbm(st + q + vec2(8.3, 0.8) + 0.126 * (time + uCumulativeAudio.z * 0.165));

  float f = fbm(st + r - q);
  float fullFbm = (f + 0.6 * f * f + 0.7 * f + 0.5) * 0.5;

  fullFbm = pow(fullFbm, 0.55);

  vec2 snUv =
    (uv + vec2((fullFbm - 0.5) * 1.2) + vec2(0.0, 0.025) + textureNoiseDisp0);
  float sn =
    noise(snUv * 2.0 + vec2(sin(sinOffsets.x * 0.25), time * 0.5 + sinOffsets.x)) *
    2.0;
  float sn2 = smoothstep(
    sn - 1.2 * blurRadius,
    sn + 1.2 * blurRadius,
    (snUv.y - 0.5 * waveSpread) * (5.0 - uAvgMag.x * 0.05) + 0.5
  );
  vec2 snUvBis =
    (uv + vec2((fullFbm - 0.5) * 0.85) + vec2(0.0, 0.025) + textureNoiseDisp1);
  float snBis =
    noise(snUvBis * 4.0 + vec2(sin(sinOffsets.y * 0.15) * 2.4 + 293.0, time + sinOffsets.y * 0.5)) *
    2.0;
  float sn2Bis = smoothstep(
    snBis - (0.9 + uAvgMag.y * 0.4) * blurRadius,
    snBis + (0.9 + uAvgMag.y * 0.8) * blurRadius,
    (snUvBis.y - 0.6 * waveSpread) * (5.0 - uAvgMag.y * 0.75) + 0.5
  );
  vec2 snUvThird =
    (uv + vec2((fullFbm - 0.5) * 1.1) + textureNoiseDisp3);
  float snThird =
    noise(snUvThird * 6.0 + vec2(sin(sinOffsets.z * 0.1) * 2.4 + 153.0, time * 1.2 + sinOffsets.z * 0.8)) *
    2.0;
  float sn2Third = smoothstep(
    snThird - 0.7 * blurRadius,
    snThird + 0.7 * blurRadius,
    (snUvThird.y - 0.9 * waveSpread) * 6.0 + 0.5
  );

  sn2 = pow(sn2, 0.8);
  sn2Bis = pow(sn2Bis, 0.9);

  vec3 sinColor = blendLinearBurn(uBloopColorMain, uBloopColorLow, 1.0 - sn2);

  sinColor = blendLinearBurn(
    sinColor,
    mix(uBloopColorMain, uBloopColorMid, 1.0 - sn2Bis),
    sn2
  );
  sinColor = mix(
    sinColor,
    mix(uBloopColorMain, uBloopColorHigh, 1.0 - sn2Third),
    sn2 * sn2Bis
  );
  sinColor = mix(sinColor, uBloopColorMain, 0.12);

  sdf.color = mix(sdf.color, vec4(sinColor, 1.0), args.amount);
  sdf.distance = mix(sdf.distance, length(adjustedSt) - radius, args.amount);

  return sdf;
}

void main() {
  vec2 st = out_uv - 0.5;

  if (uFitMode < 0.5) {
    if (uViewport.x > uViewport.y) {
      st.x *= uViewport.x / uViewport.y;
    } else {
      st.y *= uViewport.y / uViewport.x;
    }
  } else {
    if (uViewport.x > uViewport.y) {
      st.y *= uViewport.y / uViewport.x;
    } else {
      st.x *= uViewport.x / uViewport.y;
    }
  }

  st /= max(uOrbScale, 0.001);

  ColoredSDF sdf;
  sdf.distance = 1000.0;
  sdf.color = vec4(1.0);

  SDFArgs idleArgs;
  idleArgs.st = st;
  idleArgs.amount = 1.0;
  idleArgs.duration = uTime - uReadyTimestamp;
  idleArgs.time = uTime;
  idleArgs.mainRadius = 0.49;

  SDFArgs listenArgs = idleArgs;
  SDFArgs speakArgs = idleArgs;

  listenArgs.amount = uStateListen;
  listenArgs.duration = uTime - uListenTimestamp;
  speakArgs.amount = uStateSpeak;
  speakArgs.duration = uTime - uSpeakTimestamp;

  sdf = applyIdleState(sdf, idleArgs);

  if (listenArgs.amount > 0.0) {
    sdf = applyListenAndSpeakState(sdf, listenArgs, true);
  }

  if (speakArgs.amount > 0.0) {
    sdf = applyListenAndSpeakState(sdf, speakArgs, false);
  }

  float clampingTolerance = max(0.0075 / uScreenScaleFactor, fwidth(sdf.distance));
  float clampedShape = smoothstep(clampingTolerance, 0.0, sdf.distance);
  float alpha = sdf.color.a * clampedShape;

  fragColor = vec4(sdf.color.rgb * alpha, alpha);
}
`

function assignRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") {
    ref(value)
    return
  }

  if (ref) {
    const mutableRef = ref as MutableRefObject<T | null>

    mutableRef.current = value
  }
}

function toCssSize(value: number | string): string {
  return typeof value === "number" ? `${value}px` : value
}

function mergeClassNames(...names: Array<string | false | undefined>) {
  return names.filter(Boolean).join(" ")
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function reportError(runtimeRef: MutableRefObject<FocusOrbRuntime>, error: unknown) {
  const runtime = runtimeRef.current
  const normalizedError = toError(error)

  if (runtime.onError) {
    runtime.onError(normalizedError)
    return
  }

  console.error(normalizedError)
}

function hexToRgb(hex: string): Vec3 {
  const value = hex.replace("#", "")

  return new Float32Array([
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  ])
}

function createHostStyle(width: number | string, height: number | string, style: CSSProperties | undefined): FocusOrbStyle {
  return {
    "--focus-orb-height": toCssSize(height),
    "--focus-orb-width": toCssSize(width),
    ...style,
  }
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

function createProgram(gl: WebGL2RenderingContext) {
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

function getUniforms(gl: WebGL2RenderingContext, program: WebGLProgram): FocusOrbUniforms {
  return {
    uTime: gl.getUniformLocation(program, "uTime"),
    uReadyTimestamp: gl.getUniformLocation(program, "uReadyTimestamp"),
    uSpeakTimestamp: gl.getUniformLocation(program, "uSpeakTimestamp"),
    uListenTimestamp: gl.getUniformLocation(program, "uListenTimestamp"),
    uStateSpeak: gl.getUniformLocation(program, "uStateSpeak"),
    uStateListen: gl.getUniformLocation(program, "uStateListen"),
    uMicLevel: gl.getUniformLocation(program, "uMicLevel"),
    uScreenScaleFactor: gl.getUniformLocation(program, "uScreenScaleFactor"),
    uViewport: gl.getUniformLocation(program, "uViewport"),
    uAvgMag: gl.getUniformLocation(program, "uAvgMag"),
    uCumulativeAudio: gl.getUniformLocation(program, "uCumulativeAudio"),
    uBloopColorMain: gl.getUniformLocation(program, "uBloopColorMain"),
    uBloopColorLow: gl.getUniformLocation(program, "uBloopColorLow"),
    uBloopColorMid: gl.getUniformLocation(program, "uBloopColorMid"),
    uBloopColorHigh: gl.getUniformLocation(program, "uBloopColorHigh"),
    uTextureNoise: gl.getUniformLocation(program, "uTextureNoise"),
    uFitMode: gl.getUniformLocation(program, "uFitMode"),
    uOrbScale: gl.getUniformLocation(program, "uOrbScale"),
  }
}

function loadTexture(gl: WebGL2RenderingContext, src: string) {
  return new Promise<WebGLTexture>((resolve, reject) => {
    const image = new Image()

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

function getDefaultRuntime(colors: FocusOrbColorVectors): FocusOrbRuntime {
  return {
    active: true,
    state: "speak",
    colors,
    intensity: 1,
    fit: "contain",
    orbScale: 1,
    paused: false,
    variant: "button",
  }
}

export const FocusOrb = forwardRef<FocusOrbHost, FocusOrbProps>((props, forwardedRef) => {
  const variant = props.variant ?? "button"
  const {
    active,
    canvasClassName,
    canvasSize = 320,
    className,
    colors,
    defaultActive = true,
    fit,
    height,
    intensity = 1,
    maxCanvasSize = 2048,
    onError,
    onRenderComplete,
    orbScale,
    paused = false,
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
  const colorVectors = useMemo<FocusOrbColorVectors>(
    () => ({
      main: hexToRgb(resolvedColors.main),
      low: hexToRgb(resolvedColors.low),
      mid: hexToRgb(resolvedColors.mid),
      high: hexToRgb(resolvedColors.high),
    }),
    [resolvedColors],
  )
  const hostRef = useRef<FocusOrbHost | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const inputRef = useRef<FocusOrbInput>({
    hoverTarget: 0,
    pressedTarget: 0,
  })
  const timelineRef = useRef<FocusOrbTimeline>({
    readyTimestamp: 0,
    speakTimestamp: 0,
    listenTimestamp: 0,
  })
  const runtimeRef = useRef<FocusOrbRuntime>(getDefaultRuntime(colorVectors))
  const previousActiveRef = useRef(resolvedActive)
  const hostStyle = useMemo(
    () => createHostStyle(resolvedWidth, resolvedHeight, style),
    [resolvedHeight, resolvedWidth, style],
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
    state: resolvedState,
    colors: colorVectors,
    intensity,
    fit: resolvedFit,
    orbScale: resolvedOrbScale,
    paused,
    variant,
    onError,
    onRenderComplete,
  }

  useEffect(() => {
    const previousActive = previousActiveRef.current

    if (previousActive === resolvedActive) {
      return
    }

    const now = performance.now() / 1000

    previousActiveRef.current = resolvedActive
    if (resolvedActive) {
      timelineRef.current.speakTimestamp = now
    } else {
      timelineRef.current.listenTimestamp = now
    }
  }, [resolvedActive])

  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current

    if (!canvas || !host) {
      return
    }

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    })

    if (!gl) {
      reportError(runtimeRef, new Error("WebGL2 is required for FocusOrb"))
      return
    }

    let program: WebGLProgram

    try {
      program = createProgram(gl)
    } catch (error) {
      reportError(runtimeRef, error)
      return
    }

    const vao = gl.createVertexArray()
    const uniforms = getUniforms(gl, program)
    const avgMag = new Float32Array(4)
    const cumulativeAudio = new Float32Array(4)
    const timeline = timelineRef.current
    let animationFrame = 0
    let cssWidth = 1
    let cssHeight = 1
    let texture: WebGLTexture | null = null
    let disposed = false
    let didComplete = false
    let hover = 0
    let pressed = 0
    let lastFrameTime = performance.now() / 1000

    timeline.readyTimestamp = lastFrameTime
    timeline.speakTimestamp = lastFrameTime
    timeline.listenTimestamp = lastFrameTime

    function resizeCanvas() {
      const rect = host.getBoundingClientRect()

      cssWidth = Math.max(rect.width, 1)
      cssHeight = Math.max(rect.height, 1)

      if (runtimeRef.current.variant === "button") {
        canvas.width = canvasSize
        canvas.height = canvasSize
      } else {
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.min(Math.max(Math.round(cssWidth * ratio), 1), maxCanvasSize)
        canvas.height = Math.min(Math.max(Math.round(cssHeight * ratio), 1), maxCanvasSize)
      }

      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    function render(nowMs: number) {
      if (disposed) {
        return
      }

      const runtime = runtimeRef.current

      if (runtime.paused) {
        animationFrame = requestAnimationFrame(render)
        return
      }

      const now = nowMs / 1000
      const delta = Math.min(now - lastFrameTime, 0.05)
      const phase = now - timeline.readyTimestamp
      const isSpeak = runtime.state === "speak"
      const isListen = runtime.state === "listen"
      const voiceA = Math.sin(phase * 1.7) * 0.5 + 0.5
      const voiceB = Math.sin(phase * 2.3 + 1.2) * 0.5 + 0.5
      const voiceC = Math.sin(phase * 3.1 + 2.4) * 0.5 + 0.5

      lastFrameTime = now
      hover += (inputRef.current.hoverTarget - hover) * 0.12
      pressed += (inputRef.current.pressedTarget - pressed) * 0.2

      avgMag[0] = 0.18 + voiceA * 0.22 + hover * 0.08
      avgMag[1] = 0.16 + voiceB * 0.2 + pressed * 0.06
      avgMag[2] = 0.14 + voiceC * 0.18
      avgMag[3] = 0.2 + (voiceA + voiceB + voiceC) * 0.08

      for (let index = 0; index < cumulativeAudio.length; index++) {
        cumulativeAudio[index] += avgMag[index] * delta
      }

      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(program)
      gl.bindVertexArray(vao)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(uniforms.uTextureNoise, 0)
      gl.uniform1f(uniforms.uTime, now)
      gl.uniform1f(uniforms.uReadyTimestamp, timeline.readyTimestamp)
      gl.uniform1f(uniforms.uSpeakTimestamp, timeline.speakTimestamp)
      gl.uniform1f(uniforms.uListenTimestamp, timeline.listenTimestamp)
      gl.uniform1f(uniforms.uStateSpeak, isSpeak ? 1 : 0)
      gl.uniform1f(uniforms.uStateListen, isListen ? 1 : 0)
      gl.uniform1f(uniforms.uMicLevel, (0.07 + hover * 0.07 + pressed * 0.08 + voiceB * 0.045) * runtime.intensity)
      gl.uniform1f(uniforms.uScreenScaleFactor, Math.max(canvas.width / cssWidth, canvas.height / cssHeight, 1))
      gl.uniform1f(uniforms.uFitMode, runtime.fit === "cover" ? 1 : 0)
      gl.uniform1f(uniforms.uOrbScale, runtime.orbScale)
      gl.uniform2f(uniforms.uViewport, canvas.width, canvas.height)
      gl.uniform4fv(uniforms.uAvgMag, avgMag)
      gl.uniform4fv(uniforms.uCumulativeAudio, cumulativeAudio)
      gl.uniform3fv(uniforms.uBloopColorMain, runtime.colors.main)
      gl.uniform3fv(uniforms.uBloopColorLow, runtime.colors.low)
      gl.uniform3fv(uniforms.uBloopColorMid, runtime.colors.mid)
      gl.uniform3fv(uniforms.uBloopColorHigh, runtime.colors.high)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 6)

      if (!didComplete) {
        didComplete = true
        runtime.onRenderComplete?.({
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          cssWidth,
          cssHeight,
          textureSrc,
          variant: runtime.variant,
        })
      }

      animationFrame = requestAnimationFrame(render)
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

    loadTexture(gl, textureSrc)
      .then((loadedTexture) => {
        if (disposed) {
          gl.deleteTexture(loadedTexture)
          return
        }

        texture = loadedTexture
        animationFrame = requestAnimationFrame(render)
      })
      .catch((error: unknown) => {
        reportError(runtimeRef, error)
      })

    return () => {
      disposed = true
      cancelAnimationFrame(animationFrame)
      resizeObserver?.disconnect()
      window.removeEventListener("resize", resizeCanvas)
      gl.deleteTexture(texture)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
    }
  }, [canvasSize, maxCanvasSize, textureSrc, variant])

  if (variant === "background") {
    const {
      active: _active,
      ariaHidden = true,
      canvasClassName: _canvasClassName,
      canvasSize: _canvasSize,
      className: _className,
      colors: _colors,
      defaultActive: _defaultActive,
      fit: _fit,
      height: _height,
      intensity: _intensity,
      interactive = false,
      maxCanvasSize: _maxCanvasSize,
      onError: _onError,
      onPointerEnter,
      onPointerLeave,
      onRenderComplete: _onRenderComplete,
      orbScale: _orbScale,
      paused: _paused,
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
        onPointerEnter={(event: ReactPointerEvent<HTMLDivElement>) => {
          inputRef.current.hoverTarget = 1
          onPointerEnter?.(event)
        }}
        onPointerLeave={(event: ReactPointerEvent<HTMLDivElement>) => {
          inputRef.current.hoverTarget = 0
          inputRef.current.pressedTarget = 0
          onPointerLeave?.(event)
        }}
        style={hostStyle}
      >
        <canvas ref={canvasRef} className={mergeClassNames("focus-orb__canvas", canvasClassName)} />
      </div>
    )
  }

  const {
    active: _active,
    ariaLabelActive = "Exit focus mode",
    ariaLabelInactive = "Enter focus mode",
    canvasClassName: _canvasClassName,
    canvasSize: _canvasSize,
    className: _className,
    colors: _colors,
    defaultActive: _defaultActive,
    fit: _fit,
    height: _height,
    intensity: _intensity,
    maxCanvasSize: _maxCanvasSize,
    onActiveChange,
    onClick,
    onError: _onError,
    onPointerDown,
    onPointerEnter,
    onPointerLeave,
    onPointerUp,
    onRenderComplete: _onRenderComplete,
    orbScale: _orbScale,
    paused: _paused,
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
      aria-expanded={resolvedActive}
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
      <canvas ref={canvasRef} className={mergeClassNames("focus-orb__canvas", canvasClassName)} />
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
