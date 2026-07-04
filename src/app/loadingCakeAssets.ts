type LoadingCakePreloadKind = "fetch" | "image"

interface LoadingCakePreloadAsset {
  as: LoadingCakePreloadKind
  href: string
  type: string
}

const loadingCakeBasePath = "/model/cake_is_a_lie"
const preloadAttribute = "data-loading-cake-preload"

export const loadingCakeModelPath = `${loadingCakeBasePath}/scene.gltf`

const loadingCakeAssetPreloads: LoadingCakePreloadAsset[] = [
  {
    as: "fetch",
    href: loadingCakeModelPath,
    type: "model/gltf+json",
  },
  {
    as: "fetch",
    href: `${loadingCakeBasePath}/scene.bin`,
    type: "application/octet-stream",
  },
  ...[0, 1, 2, 3, 4, 5].map((index) => ({
    as: "image" as const,
    href: `${loadingCakeBasePath}/textures/material_${index}_baseColor.png`,
    type: "image/png",
  })),
]

let hasPreloadedLoadingCakeAssets = false

function appendPreloadLink(asset: LoadingCakePreloadAsset) {
  const selector = `link[${preloadAttribute}="${asset.href}"]`

  if (document.head.querySelector(selector)) {
    return
  }

  const link = document.createElement("link")
  link.rel = "preload"
  link.as = asset.as
  link.href = asset.href
  link.type = asset.type
  link.setAttribute(preloadAttribute, asset.href)

  if (asset.as === "fetch") {
    link.crossOrigin = "anonymous"
    link.setAttribute("fetchpriority", "high")
  }

  document.head.append(link)
}

export function preloadLoadingCakeAssets() {
  if (hasPreloadedLoadingCakeAssets || typeof document === "undefined") {
    return
  }

  hasPreloadedLoadingCakeAssets = true

  for (const asset of loadingCakeAssetPreloads) {
    appendPreloadLink(asset)
  }
}
