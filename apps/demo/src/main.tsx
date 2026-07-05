import { StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"

import {
  FocusOrbBackground,
  FocusOrbButton,
  focusOrbTextureUrl,
  type FocusOrbState,
} from "@igcrystal/focus-orb"
import "@igcrystal/focus-orb/style.css"

import "./styles.css"

function DemoApp() {
  const [isActive, setIsActive] = useState(true)
  const [state, setState] = useState<FocusOrbState>("speak")

  return (
    <main className="demo-shell">
      <FocusOrbBackground
        className="demo-background"
        intensity={0.82}
        orbScale={2.28}
        state={state}
        textureSrc={focusOrbTextureUrl}
      />

      <section className="demo-stage" aria-label="Focus orb component demo">
        <div className="demo-preview">
          <FocusOrbButton
            active={isActive}
            ariaLabelActive="退出专注模式"
            ariaLabelInactive="进入专注模式"
            onActiveChange={(nextActive) => {
              setIsActive(nextActive)
              setState(nextActive ? "speak" : "listen")
            }}
            state={state}
            textureSrc={focusOrbTextureUrl}
          />
        </div>

        <div className="demo-panel">
          <div className="demo-tabs" role="tablist" aria-label="Orb state">
            <button
              aria-selected={state === "speak"}
              className="demo-tab"
              onClick={() => {
                setState("speak")
                setIsActive(true)
              }}
              role="tab"
              type="button"
            >
              Speak
            </button>
            <button
              aria-selected={state === "listen"}
              className="demo-tab"
              onClick={() => {
                setState("listen")
                setIsActive(false)
              }}
              role="tab"
              type="button"
            >
              Listen
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

const root = document.querySelector("#root")

if (!root) {
  throw new Error("Root element not found")
}

createRoot(root).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>,
)
