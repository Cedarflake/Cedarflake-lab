import { fileURLToPath, URL } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@cedarflake/focus-orb/style.css": fileURLToPath(
        new URL("../../packages/focus-orb/src/styles/focus-orb.css", import.meta.url),
      ),
      "@cedarflake/focus-orb": fileURLToPath(new URL("../../packages/focus-orb/src/index.ts", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
})
