import { StrictMode } from "react"
import { createRoot, hydrateRoot } from "react-dom/client"

import { App } from "./App"

import "@fontsource-variable/jetbrains-mono/index.css"
import "@fontsource-variable/manrope/index.css"
import "./styles.css"

const root = document.querySelector("#root")

if (!root) {
  throw new Error("Root element not found")
}

const app = (
  <StrictMode>
    <App />
  </StrictMode>
)

if (root.hasChildNodes()) {
  hydrateRoot(root, app)
} else {
  createRoot(root).render(app)
}
