import type { RolodexItem } from "@/pages/tasks-waitlist/types";

export interface TemplateBrandConfig {
  name: string;
  wordmarkAlt: string;
}

export interface TemplateHeroConfig {
  headlineTop: string;
  headlineBottom: string;
  description: string;
  backgroundLight: string;
  backgroundDark: string;
  scrollIndicator: string;
}

export interface TemplateRolodexConfig {
  introText: string;
  playLabel: string;
  pauseLabel: string;
  layouts: {
    threeLine: RolodexItem[];
    fiveLine: RolodexItem[];
  };
}

export interface TemplateFeatureAction {
  label: string;
  icon?: string;
}

export interface TemplateFeatureItem {
  title: string;
  description: string;
  actionItems: TemplateFeatureAction[];
}

export interface TemplateFeaturesConfig {
  headline: string;
  subtitle: string;
  items: TemplateFeatureItem[];
}

export interface TemplateCarouselImage {
  id: string;
  srcLight: string;
  srcDark: string;
  alt: string;
  headline: string;
  description: string;
}

export interface TemplateCarouselConfig {
  images: TemplateCarouselImage[];
}

export interface TemplateFinalCtaConfig {
  headline: string;
}

export interface TemplateCtaConfig {
  label: string;
  href: string;
  target?: "_self" | "_blank";
}

export interface TemplateAccessibilityConfig {
  skipToContent: string;
  sectionLabels: Record<string, string>;
}

export interface LandingPageTemplateConfig {
  meta: {
    pageViewId: string;
  };
  brand: TemplateBrandConfig;
  hero: TemplateHeroConfig;
  rolodex: TemplateRolodexConfig;
  features: TemplateFeaturesConfig;
  carousel: TemplateCarouselConfig;
  finalCta: TemplateFinalCtaConfig;
  cta: TemplateCtaConfig;
  accessibility: TemplateAccessibilityConfig;
}
