import type { TemplateCarouselConfig } from "../types";
import { ASSET_BASE } from "./assets";

export const carouselConfig: TemplateCarouselConfig = {
  images: [
    {
      id: "image-1",
      srcLight: `${ASSET_BASE}/images/revaea/carousel/pure-tea-light.png`,
      srcDark: `${ASSET_BASE}/images/revaea/carousel/pure-tea-dark.png`,
      alt: "A floating tea pavilion of the Pure Tea Dream Circle.",
      headline: "Pure Tea Dream Circle",
      description:
        "Tea steam curls into quiet rings, washing yesterday's dust from weary spirits.",
    },
    {
      id: "image-2",
      srcLight: `${ASSET_BASE}/images/revaea/carousel/memory-library-light.png`,
      srcDark: `${ASSET_BASE}/images/revaea/carousel/memory-library-dark.png`,
      alt: "A luminous gothic memory library filled with floating pages.",
      headline: "Memory Library",
      description:
        "Open a book and touch not ink, but the warmest image from a life once lived.",
    },
    {
      id: "image-3",
      srcLight: `${ASSET_BASE}/images/revaea/carousel/illusion-garden-light.png`,
      srcDark: `${ASSET_BASE}/images/revaea/carousel/illusion-garden-dark.png`,
      alt: "A translucent flower corridor in the Illusion Painting Garden.",
      headline: "Illusion Painting Garden",
      description:
        "Artists paint with intention; where the brush falls, glass-bright flowers rise into day.",
    },
  ],
};
