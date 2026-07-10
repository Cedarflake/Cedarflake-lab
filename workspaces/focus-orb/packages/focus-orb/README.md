# @igcrystal/focus-orb

React WebGL focus orb component. It can be used as a round button or as a contained ambient surface.

## Source Layout

`src/index.ts` is the public package entry. Internal implementation is split by responsibility:

| Path | Responsibility |
| --- | --- |
| `src/components/focus-orb/` | React component shell. |
| `src/hooks/` | React renderer lifecycle hook. |
| `src/renderer/` | WebGL program, texture loading, and shader source. |
| `src/config/` | Default option objects. |
| `src/types/` | Public and resolved TypeScript option types. |
| `src/utils/` | Small React and option-resolution utilities. |
| `src/styles/` | Package CSS. |
| `src/assets/` | Bundled watercolor noise texture. |

## Usage

```tsx
import { FocusOrbBackground, FocusOrbButton } from "@igcrystal/focus-orb"
import "@igcrystal/focus-orb/style.css"

export function Example() {
  return (
    <div style={{ position: "relative", minHeight: 480, overflow: "hidden" }}>
      <FocusOrbBackground
        motion={{ intensity: 0.85, timeScale: 0.9 }}
        orbScale={2.2}
        shader={{ warpPower: 0.18, textureNoiseStrength: 0.08 }}
      />

      <FocusOrbButton
        ariaLabelActive="退出专注模式"
        ariaLabelInactive="进入专注模式"
        interaction={{ hoverScale: 1.025, pressedScale: 0.985 }}
      />
    </div>
  )
}
```

## Parameter Groups

The demo playground exposes these groups directly. Props that represent host styling hooks, such as `className` and `style`, are documented as API surface rather than slider controls.

### Surface

| Prop | Type | Description |
| --- | --- | --- |
| `variant` | `"button" \| "background"` | Render as a button or background. |
| `width` / `height` | `number \| string` | CSS size of the host element. |
| `className` / `canvasClassName` / `style` | React styling props | Extra styling hooks for the host and canvas. |
| `fit` | `"contain" \| "cover"` | How the orb maps into non-square areas. |
| `orbScale` | `number` | Scales the orb inside the shader viewport. |
| `textureSrc` | `string` | Watercolor noise texture URL. |
| `colors` | `Partial<FocusOrbColors>` | `main`, `low`, `mid`, and `high` color stops. |

### State And Motion

| Prop | Type | Description |
| --- | --- | --- |
| `active` / `defaultActive` | `boolean` | Controlled or uncontrolled button active state. |
| `state` | `"speak" \| "listen"` | Visual state. Defaults from `active`. |
| `paused` | `boolean` | Stops animation frames without unmounting WebGL. |
| `intensity` | `number` | Backward-compatible shortcut for `motion.intensity`. |
| `motion.intensity` | `number` | Scales simulated audio response and mic displacement. |
| `motion.timeScale` | `number` | Speed of the generated motion field. |
| `motion.hoverEase` / `motion.pressEase` | `number` | Pointer response smoothing. |
| `motion.voiceSpeedA/B/C` | `number` | Speeds of the built-in simulated audio bands. |

### Audio

| Prop | Type | Description |
| --- | --- | --- |
| `audio.simulated` | `boolean` | Set `false` to disable built-in simulated audio. |
| `audio.micLevel` | `number` | External mic level. |
| `audio.avgMag` | `[number, number, number, number]` | External band magnitudes. |
| `audio.cumulativeAudio` | `[number, number, number, number]` | External cumulative phase vector. |

### Interaction

| Prop | Type | Description |
| --- | --- | --- |
| `interaction.hoverScale` | `number` | Button hover and focus scale. |
| `interaction.pressedScale` | `number` | Button active scale. |
| `interaction.transitionMs` | `number` | Button transform transition duration. |
| `interactive` | `boolean` | Background mode pointer interaction. |
| `ariaHidden` | `boolean` | Background accessibility visibility. |
| `ariaLabelActive` / `ariaLabelInactive` | `string` | Button labels. |

### Rendering

| Prop | Type | Description |
| --- | --- | --- |
| `canvasSize` | `number` | Backward-compatible square render size shortcut. |
| `maxCanvasSize` | `number` | Backward-compatible maximum render dimension shortcut. |
| `rendering.canvasSize` | `number` | Square render size for button mode. |
| `rendering.canvasWidth` / `rendering.canvasHeight` | `number` | Explicit internal canvas buffer override. |
| `rendering.maxCanvasSize` | `number` | Maximum generated canvas dimension. |
| `rendering.pixelRatioCap` | `number` | Device pixel ratio cap for background mode. |
| `rendering.antialias` | `boolean` | WebGL context antialias flag. |
| `rendering.premultipliedAlpha` | `boolean` | WebGL context premultiplied alpha flag. |
| `rendering.textureCrossOrigin` | `"" \| "anonymous" \| "use-credentials"` | Image cross-origin mode for remote textures. |

### Shader Material

| Prop | Description |
| --- | --- |
| `shader.mainRadius`, `shader.listenRadius`, `shader.speakRadius`, `shader.micRadiusBoost` | Orb shape and state radii. |
| `shader.originX`, `shader.originY`, `shader.rotation` | Shader-space placement and rotation. |
| `shader.displacement`, `shader.oscillationPeriod` | Vertical breathing displacement. |
| `shader.warpPower`, `shader.noiseScale`, `shader.windSpeed` | Flow field behavior. |
| `shader.waterColorNoiseScale`, `shader.waterColorNoiseStrength`, `shader.textureNoiseStrength` | Watercolor and texture grain. |
| `shader.blurRadius`, `shader.edgeSoftness`, `shader.fbmPowerDamping`, `shader.colorMixAmount` | Edge, wave softness, and color blending. |
| `shader.layer1Amplitude/Frequency`, `shader.layer2Amplitude/Frequency`, `shader.layer3Amplitude/Frequency` | Internal wave layers. |
| `shader.idleSpringDamping`, `shader.stateSpringDamping` | Spring feel. |
| `shader.idleTransitionDuration`, `shader.stateTransitionDuration` | Entry and state transition duration. |
| `shader.timeScale`, `shader.verticalOffset`, `shader.waveSpread` | Material timing and wave placement. |

### Events

| Prop | Type | Description |
| --- | --- | --- |
| `onActiveChange` | `(active: boolean) => void` | Button mode active-state change. |
| `onRenderComplete` | `(status: FocusOrbRenderStatus) => void` | Fires after first render and after resize. |
| `onError` | `(error: Error) => void` | WebGL, shader, or texture load errors. |
