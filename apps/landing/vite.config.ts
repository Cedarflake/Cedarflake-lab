import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  build: {
    // Keep unicode-range font subsets as separate requests instead of forcing them into every CSS response.
    assetsInlineLimit: 0,
  },
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5176,
  },
})
