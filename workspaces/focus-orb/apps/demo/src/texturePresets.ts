import { focusOrbTextureUrl } from "@igcrystal/focus-orb"

import textureNoise1 from "../../../packages/focus-orb/src/assets/noise-1.webp"
import textureNoise2 from "../../../packages/focus-orb/src/assets/noise-2.webp"
import textureNoise3 from "../../../packages/focus-orb/src/assets/noise-3.webp"
import textureNoise4 from "../../../packages/focus-orb/src/assets/noise-4.webp"
import textureNoise5 from "../../../packages/focus-orb/src/assets/noise-5.webp"
import textureNoise6 from "../../../packages/focus-orb/src/assets/noise-6.webp"
import textureNoise7 from "../../../packages/focus-orb/src/assets/noise-7.webp"
import textureNoise8 from "../../../packages/focus-orb/src/assets/noise-8.webp"
import textureNoise9 from "../../../packages/focus-orb/src/assets/noise-9.webp"
import textureNoise10 from "../../../packages/focus-orb/src/assets/noise-10.webp"

export type TextureChoice =
  | "default"
  | "noise-1"
  | "noise-2"
  | "noise-3"
  | "noise-4"
  | "noise-5"
  | "noise-6"
  | "noise-7"
  | "noise-8"
  | "noise-9"
  | "noise-10"

export interface TexturePreset {
  id: TextureChoice
  name: string
  src: string
}

export const texturePresets: TexturePreset[] = [
  {
    id: "default",
    name: "Default",
    src: focusOrbTextureUrl,
  },
  {
    id: "noise-1",
    name: "Noise 1",
    src: textureNoise1,
  },
  {
    id: "noise-2",
    name: "Noise 2",
    src: textureNoise2,
  },
  {
    id: "noise-3",
    name: "Noise 3",
    src: textureNoise3,
  },
  {
    id: "noise-4",
    name: "Noise 4",
    src: textureNoise4,
  },
  {
    id: "noise-5",
    name: "Noise 5",
    src: textureNoise5,
  },
  {
    id: "noise-6",
    name: "Noise 6",
    src: textureNoise6,
  },
  {
    id: "noise-7",
    name: "Noise 7",
    src: textureNoise7,
  },
  {
    id: "noise-8",
    name: "Noise 8",
    src: textureNoise8,
  },
  {
    id: "noise-9",
    name: "Noise 9",
    src: textureNoise9,
  },
  {
    id: "noise-10",
    name: "Noise 10",
    src: textureNoise10,
  },
]
