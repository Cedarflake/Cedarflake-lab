import type { PlayerInput } from "@/shared/types"

export interface GamepadButtonLike {
  pressed: boolean
  value: number
}

export interface GamepadLike {
  axes: readonly number[]
  buttons: readonly GamepadButtonLike[]
  connected: boolean
  id?: string
  index?: number
  mapping?: string
}

export interface GamepadOverlayInput {
  confirm: boolean
  pause: boolean
}

export interface GamepadStatus {
  id: string
  index: number | null
  isConnected: boolean
  isSupported: boolean
  mapping: string
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

const emptyGamepadStatus: GamepadStatus = {
  id: "",
  index: null,
  isConnected: false,
  isSupported: typeof navigator !== "undefined" && typeof navigator.getGamepads === "function",
  mapping: "",
}

function resolveConnectedGamepads(gamepads: readonly (GamepadLike | null)[]) {
  return gamepads.filter((gamepad): gamepad is GamepadLike => Boolean(gamepad?.connected))
}

function resolveAxis(value: number | undefined, deadzone = 0.16) {
  const magnitude = Math.abs(value ?? 0)

  if (magnitude <= deadzone) return 0

  return Math.sign(value ?? 0) * Math.min((magnitude - deadzone) / (1 - deadzone), 1)
}

function resolveButton(button: GamepadButtonLike | undefined) {
  if (!button) return 0

  return button.pressed ? 1 : button.value
}

function resolveTriggerAxis(value: number | undefined) {
  if (typeof value !== "number") return 0

  return value > 0.16 ? Math.min(value, 1) : 0
}

function resolveGamepadActivity(gamepad: GamepadLike) {
  const strongestButton = gamepad.buttons.reduce(
    (strongest, button) => Math.max(strongest, resolveButton(button)),
    0,
  )
  const strongestAxis = gamepad.axes.reduce(
    (strongest, axis) => Math.max(strongest, Math.abs(resolveAxis(axis))),
    0,
  )

  return Math.max(strongestButton, strongestAxis)
}

export function resolveActiveGamepad(
  gamepads: readonly (GamepadLike | null)[],
  preferredIndex: number | null = null,
) {
  const connectedGamepads = resolveConnectedGamepads(gamepads)

  if (connectedGamepads.length === 0) {
    return null
  }

  const preferredGamepad =
    preferredIndex === null
      ? null
      : connectedGamepads.find((gamepad) => gamepad.index === preferredIndex)

  if (preferredGamepad) {
    return preferredGamepad
  }

  return (
    [...connectedGamepads].sort((a, b) => {
      const activityDifference = resolveGamepadActivity(b) - resolveGamepadActivity(a)

      if (activityDifference !== 0) {
        return activityDifference
      }

      if (a.mapping === "standard" && b.mapping !== "standard") return -1
      if (a.mapping !== "standard" && b.mapping === "standard") return 1

      return (a.index ?? 0) - (b.index ?? 0)
    })[0] ?? null
  )
}

export function resolveGamepadStatus(
  gamepads: readonly (GamepadLike | null)[],
  preferredIndex: number | null = null,
): GamepadStatus {
  const gamepad = resolveActiveGamepad(gamepads, preferredIndex)

  if (!gamepad) {
    return emptyGamepadStatus
  }

  return {
    id: gamepad.id ?? "Gamepad",
    index: gamepad.index ?? null,
    isConnected: true,
    isSupported: true,
    mapping: gamepad.mapping ?? "",
  }
}

export function resolveGamepadInput(
  gamepads: readonly (GamepadLike | null)[],
  preferredIndex: number | null = null,
): PlayerInput {
  const gamepad = resolveActiveGamepad(gamepads, preferredIndex)

  if (!gamepad) {
    return emptyInput
  }

  const leftStickX = resolveAxis(gamepad.axes[0])
  const dpadAxisX = resolveAxis(gamepad.axes[6])
  const steerLeft = resolveButton(gamepad.buttons[standardGamepadButton.dpadLeft])
  const steerRight = resolveButton(gamepad.buttons[standardGamepadButton.dpadRight])
  const throttle = Math.max(
    resolveButton(gamepad.buttons[standardGamepadButton.rightTrigger]),
    resolveButton(gamepad.buttons[standardGamepadButton.primary]),
    resolveTriggerAxis(gamepad.axes[5]),
  )
  const brake = Math.max(
    resolveButton(gamepad.buttons[standardGamepadButton.leftTrigger]),
    resolveButton(gamepad.buttons[standardGamepadButton.secondary]),
    resolveTriggerAxis(gamepad.axes[2]),
  )

  return {
    steer: leftStickX || dpadAxisX || steerRight - steerLeft,
    throttle,
    brake,
    isDrifting:
      resolveButton(gamepad.buttons[standardGamepadButton.leftShoulder]) > 0 ||
      resolveButton(gamepad.buttons[standardGamepadButton.rightShoulder]) > 0,
  }
}

export function resolveGamepadOverlayInput(
  gamepads: readonly (GamepadLike | null)[],
  preferredIndex: number | null = null,
): GamepadOverlayInput {
  const gamepad = resolveActiveGamepad(gamepads, preferredIndex)

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
