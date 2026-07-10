import { defineConfig } from "vite"

export default defineConfig({
  build: {
    copyPublicDir: false,
    lib: {
      entry: "src/index.ts",
      fileName: (format) => (format === "es" ? "index.js" : "index.cjs"),
      formats: ["es", "cjs"],
      name: "FocusOrb",
    },
    rollupOptions: {
      external: ["react", "react/jsx-runtime"],
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "focus-orb.css") {
            return "style.css"
          }

          if (assetInfo.name === "noise-watercolor-m3j88gni.webp") {
            return "assets/noise-watercolor-m3j88gni.webp"
          }

          return "assets/[name][extname]"
        },
        banner: "\"use client\";",
        globals: {
          react: "React",
        },
      },
    },
  },
})
