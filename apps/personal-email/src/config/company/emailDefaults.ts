import type { Brand, TemplateData } from '../types';

/**
 * Company-level brand defaults and interpolation utilities.
 */
export const brandDefaults: Required<Brand> = {
  name: 'Revaea',
  // placeholder logo URL — replace with your real asset
  logoUrl: 'https://revaea.com/favicon.ico',
  primaryColor: '#38BDF8',
  footerText: `© ${new Date().getFullYear()} Cedarflake All rights reserved.`,
};

export function mergeBrand(base?: Brand, override?: Partial<Brand>): Required<Brand> {
  return {
    name: override?.name ?? base?.name ?? brandDefaults.name,
    logoUrl: override?.logoUrl ?? base?.logoUrl ?? brandDefaults.logoUrl,
    primaryColor: override?.primaryColor ?? base?.primaryColor ?? brandDefaults.primaryColor,
    footerText: override?.footerText ?? base?.footerText ?? brandDefaults.footerText,
  };
}

export function interpolateString(str: string | undefined, data?: Record<string, string | undefined>): string | undefined {
  if (!str) return str;
  if (!data) return str;
  let out = str;
  for (const [k, v] of Object.entries(data)) {
    out = out.split(`{{${k}}}`).join(v ?? '');
  }
  return out;
}

export function interpolateTemplate(template: TemplateData, data?: Record<string, string | undefined>): TemplateData {
  const tpl: TemplateData = {
    subject: template.subject,
    preview: template.preview,
    heading: template.heading,
    intro: template.intro,
    cta: template.cta === null ? null : template.cta ? { ...template.cta } : undefined,
    brand: template.brand ? { ...template.brand } : undefined,
    footerText: template.footerText,
  };

  const derived: Record<string, string | undefined> = {
    company: tpl.brand?.name ?? brandDefaults.name,
    companyName: tpl.brand?.name ?? brandDefaults.name,
    year: String(new Date().getFullYear()),
    logoUrl: tpl.brand?.logoUrl ?? brandDefaults.logoUrl,
    primaryColor: tpl.brand?.primaryColor ?? brandDefaults.primaryColor,
    sender: tpl.brand?.name ?? brandDefaults.name,
    name: '朋友',
    event: '',
    date: '',
    location: '',
    rsvpUrl: '',
    topic: '',
  };

  const effectiveData: Record<string, string | undefined> = { ...derived, ...(data ?? {}) };

  const subject = interpolateString(tpl.subject, effectiveData);
  if (subject !== undefined) tpl.subject = subject;

  const preview = interpolateString(tpl.preview, effectiveData);
  if (preview !== undefined) tpl.preview = preview;

  const heading = interpolateString(tpl.heading, effectiveData);
  if (heading !== undefined) tpl.heading = heading;

  const intro = interpolateString(tpl.intro, effectiveData);
  if (intro !== undefined) tpl.intro = intro;

  const footer = interpolateString(tpl.footerText, effectiveData);
  if (footer !== undefined) tpl.footerText = footer;

  if (tpl.cta && tpl.cta !== null) {
    const ctaText = interpolateString(tpl.cta.text, effectiveData);
    if (ctaText !== undefined) tpl.cta.text = ctaText;
    const ctaUrl = interpolateString(tpl.cta.url, effectiveData);
    if (ctaUrl !== undefined) tpl.cta.url = ctaUrl;
  }

  tpl.brand = mergeBrand(tpl.brand, undefined);
  const bName = interpolateString(tpl.brand.name, effectiveData);
  if (bName !== undefined) tpl.brand.name = bName;
  const bFooter = interpolateString(tpl.brand.footerText, effectiveData);
  if (bFooter !== undefined) tpl.brand.footerText = bFooter;

  return tpl;
}
