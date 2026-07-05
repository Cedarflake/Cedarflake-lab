import { fileURLToPath, URL } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import { preloadLoadingCakeInHtml } from "./scripts/viteLoadingCakePreload"

const reactVendorPackages = ["react", "react-dom", "scheduler", "zustand"]
const chunkSizeWarningLimit = 750
const reactThreeVendorPackages = [
  "@react-spring",
  "@react-three",
  "@use-gesture",
  "camera-controls",
  "maath",
  "meshline",
  "stats-gl",
  "stats.js",
  "suspend-react",
]
const threeAddonPackages = [
  "@monogrid/gainmap-js",
  "three-mesh-bvh",
  "three-stdlib",
  "troika-three-text",
  "troika-three-utils",
  "troika-worker-utils",
]

function includesPackage(moduleId: string, packageName: string) {
  const normalizedId = moduleId.replaceAll("\\", "/")

  return (
    normalizedId.includes(`/node_modules/${packageName}/`) ||
    normalizedId.includes(`/node_modules/.pnpm/${packageName.replace("/", "+")}@`)
  )
}

export default defineConfig({
  plugins: [preloadLoadingCakeInHtml(), react()],
  build: {
    chunkSizeWarningLimit,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: (moduleId) =>
                reactVendorPackages.some((packageName) => includesPackage(moduleId, packageName)),
            },
            {
              name: "three-core",
              test: (moduleId) => includesPackage(moduleId, "three"),
            },
            {
              name: "react-three-vendor",
              test: (moduleId) =>
                reactThreeVendorPackages.some((packageName) =>
                  includesPackage(moduleId, packageName),
                ),
            },
            {
              name: "three-addons",
              test: (moduleId) =>
                threeAddonPackages.some((packageName) => includesPackage(moduleId, packageName)),
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
