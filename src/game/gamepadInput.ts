import type { PlayerInput } from "@/shared/types"

export interface GamepadButtonLike {
  pressed: boolean
  value: number
}

export interface GamepadLike {
  axes: readonly number[]
  buttons: readonly GamepadButtonLike[]
  connected: boolean
}

export interface GamepadOverlayInput {
  confirm: boolean
  pause: boolean
}

const emptyInput: PlayerInput = {
  steer: 0,
  throttle: 0,
  brake: 0,
  isDrifting: false,
}

const standardGamepadButton = {
  primary: 0,
  secondary: 1,
  leftShoulder: 4,
  rightShoulder: 5,
  leftTrigger: 6,
  rightTrigger: 7,
  view: 8,
  menu: 9,
  dpadLeft: 14,
  dpadRight: 15,
} as const

function resolveConnectedGamepad(gamepads: readonly (GamepadLike | null)[]) {
  return gamepads.find((gamepad) => gamepad?.connected) ?? null
}

function resolveAxis(value: number | undefined, deadzone = 0.16) {
  if (!value || Math.abs(value) < deadzone) return 0

  return value
}

function resolveButton(button: GamepadButtonLike | undefined) {
  if (!button) return 0

  return button.pressed ? 1 : button.value
}

export function resolveGamepadInput(gamepads: readonly (GamepadLike | null)[]): PlayerInput {
  const gamepad = resolveConnectedGamepad(gamepads)

  if (!gamepad) {
    return emptyInput
  }

  const leftStickX = resolveAxis(gamepad.axes[0])
  const steerLeft = resolveButton(gamepad.buttons[standardGamepadButton.dpadLeft])
  const steerRight = resolveButton(gamepad.buttons[standardGamepadButton.dpadRight])
  const throttle = Math.max(
    resolveButton(gamepad.buttons[standardGamepadButton.rightTrigger]),
    resolveButton(gamepad.buttons[standardGamepadButton.primary]),
  )
  const brake = Math.max(
    resolveButton(gamepad.buttons[standardGamepadButton.leftTrigger]),
    resolveButton(gamepad.buttons[standardGamepadButton.secondary]),
  )

  return {
    steer: leftStickX || steerRight - steerLeft,
    throttle,
    brake,
    isDrifting:
      resolveButton(gamepad.buttons[standardGamepadButton.leftShoulder]) > 0 ||
      resolveButton(gamepad.buttons[standardGamepadButton.rightShoulder]) > 0,
  }
}

export function resolveGamepadOverlayInput(
  gamepads: readonly (GamepadLike | null)[],
): GamepadOverlayInput {
  const gamepad = resolveConnectedGamepad(gamepads)

  if (!gamepad) {
    return {
      confirm: false,
      pause: false,
    }
  }

  const primary = resolveButton(gamepad.buttons[standardGamepadButton.primary]) > 0
  const menu = resolveButton(gamepad.buttons[standardGamepadButton.menu]) > 0
  const view = resolveButton(gamepad.buttons[standardGamepadButton.view]) > 0

  return {
    confirm: primary || menu,
    pause: menu || view,
  }
}
