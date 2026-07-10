import {
  FocusOrbBackground,
  FocusOrbButton,
  focusOrbDefaultTextureSrc,
  focusOrbTextureUrl,
  type FocusOrbButtonProps,
} from "@cedarflake/focus-orb"
import packageTextureUrl from "@cedarflake/focus-orb/noise-watercolor-m3j88gni.webp"

import "@cedarflake/focus-orb/style.css"

const buttonProps = {
  motion: {
    intensity: 0.8,
  },
  textureSrc: packageTextureUrl,
} satisfies FocusOrbButtonProps

const textureUrls: string[] = [focusOrbDefaultTextureSrc, focusOrbTextureUrl, packageTextureUrl]

export function PackageConsumerSmoke() {
  return (
    <div>
      <FocusOrbButton {...buttonProps} />
      <FocusOrbBackground textureSrc={textureUrls[0] ?? packageTextureUrl} />
    </div>
  )
}
