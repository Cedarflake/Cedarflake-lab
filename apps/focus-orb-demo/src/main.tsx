import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { DemoApp } from "./components/DemoApp"

import "@cedarflake/focus-orb/style.css"
import "./styles/index.css"

const root = document.querySelector("#root")

if (!root) {
  throw new Error("Root element not found")
}

createRoot(root).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>,
)
