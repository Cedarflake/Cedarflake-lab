export const vertexShaderSource = `#version 300 es
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

export const fragmentShaderSource = `#version 300 es
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

uniform float uBlurRadius;
uniform float uBackgroundMode;
uniform float uColorMixAmount;
uniform float uDisplacement;
uniform float uEdgeSoftness;
uniform float uFbmPowerDamping;
uniform float uFitMode;
uniform float uIdleSpringDamping;
uniform float uIdleTransitionDuration;
uniform float uLayer1Amplitude;
uniform float uLayer1Frequency;
uniform float uLayer2Amplitude;
uniform float uLayer2Frequency;
uniform float uLayer3Amplitude;
uniform float uLayer3Frequency;
uniform float uListenRadius;
uniform float uMainRadius;
uniform float uMicLevel;
uniform float uMicRadiusBoost;
uniform float uNoiseScale;
uniform float uOrbScale;
uniform float uOscillationPeriod;
uniform float uReadyElapsed;
uniform float uRotation;
uniform float uScreenScaleFactor;
uniform float uSpeakElapsed;
uniform float uSpeakRadius;
uniform float uStateListen;
uniform float uStateSpeak;
uniform float uStateSpringDamping;
uniform float uStateTransitionDuration;
uniform float uTextureNoiseStrength;
uniform float uTime;
uniform float uListenElapsed;
uniform float uTimeScale;
uniform float uVerticalOffset;
uniform float uWarpPower;
uniform float uWaterColorNoiseScale;
uniform float uWaterColorNoiseStrength;
uniform float uWaveSpread;
uniform float uWindSpeed;
uniform vec2 uOrigin;
uniform vec2 uViewport;
uniform vec3 uBloopColorHigh;
uniform vec3 uBloopColorLow;
uniform vec3 uBloopColorMain;
uniform vec3 uBloopColorMid;
uniform vec4 uAvgMag;
uniform vec4 uCumulativeAudio;
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

vec2 rotate2d(vec2 point, float angle) {
  float s = sin(angle);
  float c = cos(angle);

  return mat2(c, -s, s, c) * point;
}

vec3 blendLinearBurn(vec3 base, vec3 blend) {
  return max(base + blend - vec3(1.0), vec3(0.0));
}

vec3 blendLinearBurn(vec3 base, vec3 blend, float opacity) {
  return blendLinearBurn(base, blend) * opacity + base * (1.0 - opacity);
}

ColoredSDF applyIdleState(ColoredSDF sdf, SDFArgs args) {
  float entryAnimation = fixedSpring(
    scaled(0.0, max(uIdleTransitionDuration, 0.001), args.duration),
    uIdleSpringDamping
  );
  float radius = args.mainRadius * (0.74 + 0.26 * entryAnimation);
  float distanceToIdle = length(args.st) - radius;

  sdf.distance = mix(sdf.distance, distanceToIdle, args.amount);
  sdf.color = mix(sdf.color, vec4(uBloopColorMain, 1.0), args.amount);

  return sdf;
}

ColoredSDF applyListenAndSpeakState(ColoredSDF sdf, SDFArgs args, bool listening) {
  float entryAnimation = fixedSpring(
    scaled(0.0, max(uStateTransitionDuration, 0.001), args.duration),
    uStateSpringDamping
  );
  float radius =
    (listening ? uListenRadius : uSpeakRadius) * (1.0 - (1.0 - entryAnimation) * 0.25) +
    uMicLevel * uMicRadiusBoost;
  float displacementOffset = uDisplacement * sin(2.0 * PI / max(uOscillationPeriod, 0.001) * args.time);
  vec2 adjustedSt = args.st - vec2(0.0, displacementOffset);
  float scaleFactor = 1.0 / (2.0 * radius);
  vec2 uv = adjustedSt * scaleFactor + 0.5;

  uv.y = 1.0 - uv.y;

  float time = args.time * uTimeScale;
  vec3 sinOffsets = vec3(
    uCumulativeAudio.x * 0.15,
    -uCumulativeAudio.y * 0.5,
    uCumulativeAudio.z * 1.5
  );
  float noiseX = cnoise(vec3(uv + vec2(0.0, 74.8572), (time + uCumulativeAudio.x * 0.05) * 0.3));
  float noiseY = cnoise(vec3(uv + vec2(203.91282, 10.0), (time + uCumulativeAudio.z * 0.05) * 0.3));

  uv += vec2(noiseX * 2.0, noiseY) * uWarpPower;

  float noiseA =
    cnoise(vec3(uv * uWaterColorNoiseScale + vec2(344.91282, 0.0), time * 0.3)) +
    cnoise(vec3(uv * uWaterColorNoiseScale * 2.2 + vec2(723.937, 0.0), time * 0.4)) * 0.5;

  uv += noiseA * uWaterColorNoiseStrength;
  uv.y -= uVerticalOffset;

  vec2 textureUv = uv;
  float textureSampleR0 = texture(uTextureNoise, textureUv).r;
  float textureSampleG0 = texture(uTextureNoise, vec2(textureUv.x, 1.0 - textureUv.y)).g;
  float textureNoiseDisp0 =
    mix(
      textureSampleR0 - 0.5,
      textureSampleG0 - 0.5,
      (sin(time + uCumulativeAudio.a * 2.0) + 1.0) * 0.5
    ) *
    uTextureNoiseStrength;

  textureUv += vec2(63.861 + uCumulativeAudio.x * 0.05, 368.937);

  float textureSampleR1 = texture(uTextureNoise, textureUv).r;
  float textureSampleG1 = texture(uTextureNoise, vec2(textureUv.x, 1.0 - textureUv.y)).g;
  float textureNoiseDisp1 =
    mix(
      textureSampleR1 - 0.5,
      textureSampleG1 - 0.5,
      (sin(time + uCumulativeAudio.a * 2.0) + 1.0) * 0.5
    ) *
    uTextureNoiseStrength;

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
    uTextureNoiseStrength;

  uv += textureNoiseDisp0;

  vec2 st = uv * uNoiseScale;
  vec2 q = vec2(0.0);

  q.x = fbm(st * 0.5 + uWindSpeed * (time + uCumulativeAudio.a * 0.175));
  q.y = fbm(st * 0.5 + uWindSpeed * (time + uCumulativeAudio.x * 0.136));

  vec2 r = vec2(0.0);

  r.x = fbm(st + q + vec2(0.3, 9.2) + 0.15 * (time + uCumulativeAudio.y * 0.234));
  r.y = fbm(st + q + vec2(8.3, 0.8) + 0.126 * (time + uCumulativeAudio.z * 0.165));

  float f = fbm(st + r - q);
  float fullFbm = (f + 0.6 * f * f + 0.7 * f + 0.5) * 0.5;

  fullFbm = pow(fullFbm, uFbmPowerDamping);

  vec2 snUv =
    (uv + vec2((fullFbm - 0.5) * 1.2) + vec2(0.0, 0.025) + textureNoiseDisp0) *
    vec2(uLayer1Frequency, 1.0);
  float sn =
    noise(snUv * 2.0 + vec2(sin(sinOffsets.x * 0.25), time * 0.5 + sinOffsets.x)) *
    2.0 *
    uLayer1Amplitude;
  float sn2 = smoothstep(
    sn - 1.2 * uBlurRadius,
    sn + 1.2 * uBlurRadius,
    (snUv.y - 0.5 * uWaveSpread) * (5.0 - uAvgMag.x * 0.05) + 0.5
  );
  vec2 snUvBis =
    (uv + vec2((fullFbm - 0.5) * 0.85) + vec2(0.0, 0.025) + textureNoiseDisp1) *
    vec2(uLayer2Frequency, 1.0);
  float snBis =
    noise(snUvBis * 4.0 + vec2(sin(sinOffsets.y * 0.15) * 2.4 + 293.0, time + sinOffsets.y * 0.5)) *
    2.0 *
    uLayer2Amplitude;
  float sn2Bis = smoothstep(
    snBis - (0.9 + uAvgMag.y * 0.4) * uBlurRadius,
    snBis + (0.9 + uAvgMag.y * 0.8) * uBlurRadius,
    (snUvBis.y - 0.6 * uWaveSpread) * (5.0 - uAvgMag.y * 0.75) + 0.5
  );
  vec2 snUvThird =
    (uv + vec2((fullFbm - 0.5) * 1.1) + textureNoiseDisp3) *
    vec2(uLayer3Frequency, 1.0);
  float snThird =
    noise(snUvThird * 6.0 + vec2(sin(sinOffsets.z * 0.1) * 2.4 + 153.0, time * 1.2 + sinOffsets.z * 0.8)) *
    2.0 *
    uLayer3Amplitude;
  float sn2Third = smoothstep(
    snThird - 0.7 * uBlurRadius,
    snThird + 0.7 * uBlurRadius,
    (snUvThird.y - 0.9 * uWaveSpread) * 6.0 + 0.5
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
  sinColor = mix(sinColor, uBloopColorMain, uColorMixAmount);

  sdf.color = mix(sdf.color, vec4(sinColor, 1.0), args.amount);
  sdf.distance = mix(sdf.distance, length(adjustedSt) - radius, args.amount);

  return sdf;
}

void main() {
  vec2 st = out_uv - uOrigin;

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

  st = rotate2d(st, uRotation);
  st /= max(uOrbScale, 0.001);

  ColoredSDF sdf;
  sdf.distance = 1000.0;
  sdf.color = vec4(1.0);

  SDFArgs idleArgs;
  idleArgs.st = st;
  idleArgs.amount = 1.0;
  idleArgs.duration = uReadyElapsed;
  idleArgs.time = uTime;
  idleArgs.mainRadius = uMainRadius;

  SDFArgs listenArgs = idleArgs;
  SDFArgs speakArgs = idleArgs;

  listenArgs.amount = uStateListen;
  listenArgs.duration = uListenElapsed;
  speakArgs.amount = uStateSpeak;
  speakArgs.duration = uSpeakElapsed;

  sdf = applyIdleState(sdf, idleArgs);

  if (listenArgs.amount > 0.0) {
    sdf = applyListenAndSpeakState(sdf, listenArgs, true);
  }

  if (speakArgs.amount > 0.0) {
    sdf = applyListenAndSpeakState(sdf, speakArgs, false);
  }

  float clampingTolerance = max(uEdgeSoftness / uScreenScaleFactor, fwidth(sdf.distance));
  float clampedShape = smoothstep(clampingTolerance, 0.0, sdf.distance);
  float alphaMask = mix(clampedShape, 1.0, uBackgroundMode);
  float alpha = sdf.color.a * alphaMask;

  fragColor = vec4(sdf.color.rgb * alpha, alpha);
}
`
