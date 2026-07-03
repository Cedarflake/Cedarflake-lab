import { create } from "zustand"

import type { PlayerInput } from "@/shared/types"

const emptyInput: PlayerInput = {
  steer: 0,
  throttle: 0,
  brake: 0,
  isDrifting: false,
}

interface InputState {
  gamepadInput: PlayerInput
  keyboardInput: PlayerInput
  touchInput: PlayerInput
  setGamepadInput: (input: PlayerInput) => void
  setKeyboardInput: (input: PlayerInput) => void
  setTouchInput: (input: PlayerInput) => void
  resetGamepadInput: () => void
  resetKeyboardInput: () => void
  resetTouchInput: () => void
}

export const useInputStore = create<InputState>((set) => ({
  gamepadInput: emptyInput,
  keyboardInput: emptyInput,
  touchInput: emptyInput,
  setGamepadInput: (input) => set({ gamepadInput: input }),
  setKeyboardInput: (input) => set({ keyboardInput: input }),
  setTouchInput: (input) => set({ touchInput: input }),
  resetGamepadInput: () => set({ gamepadInput: emptyInput }),
  resetKeyboardInput: () => set({ keyboardInput: emptyInput }),
  resetTouchInput: () => set({ touchInput: emptyInput }),
}))
