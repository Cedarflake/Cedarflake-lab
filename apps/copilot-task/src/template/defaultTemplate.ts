import type { LandingPageTemplateConfig } from "./types";
import { accessibilityConfig } from "./default/accessibility";
import { brandConfig } from "./default/brand";
import { carouselConfig } from "./default/carousel";
import { ctaConfig, finalCtaConfig } from "./default/cta";
import { featuresConfig } from "./default/features";
import { heroConfig } from "./default/hero";
import { metaConfig } from "./default/meta";
import { rolodexConfig } from "./default/rolodex";

export const copilotTasksTemplateConfig: LandingPageTemplateConfig = {
  meta: metaConfig,
  brand: brandConfig,
  hero: heroConfig,
  rolodex: rolodexConfig,
  features: featuresConfig,
  carousel: carouselConfig,
  finalCta: finalCtaConfig,
  cta: ctaConfig,
  accessibility: accessibilityConfig,
};
