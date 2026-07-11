import type { TemplateData } from './types.js';

import { getTemplate as getCompanyTemplate, listTemplates as listCompanyTemplates, addTemplate as addCompanyTemplate } from './company/emailContent.js';
import { getTemplate as getPersonalTemplate, listTemplates as listPersonalTemplates, addTemplate as addPersonalTemplate } from './personal/emailContent.js';
import { interpolateTemplate as companyInterpolate } from './company/emailDefaults.js';
import { interpolateTemplate as personalInterpolate } from './personal/emailDefaults.js';

export * from './types.js';

export function getTemplate(name: string, overrides?: Partial<TemplateData>): TemplateData {
  const companyList = listCompanyTemplates();
  if (companyList.includes(name)) return getCompanyTemplate(name, overrides);
  const personalList = listPersonalTemplates();
  if (personalList.includes(name)) return getPersonalTemplate(name, overrides);

  // fallback to company welcome
  return getCompanyTemplate('welcome', overrides);
}

export function listTemplates(): string[] {
  return [...listCompanyTemplates(), ...listPersonalTemplates()];
}

export function requireTemplateName(name: string): string {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name) || !listTemplates().includes(name)) {
    throw new Error(`Unknown template: ${name}`);
  }

  return name;
}

export function addTemplate(name: string, data: TemplateData, category: 'company' | 'personal' = 'company'): void {
  if (category === 'company') addCompanyTemplate(name, data);
  else addPersonalTemplate(name, data);
}

/**
 * Interpolate by template name — chooses company or personal interpolation based on where the template is defined.
 */
export function interpolateTemplate(templateName: string, data?: Record<string, string | undefined>): TemplateData {
  const companyList = listCompanyTemplates();
  if (companyList.includes(templateName)) {
    const base = getCompanyTemplate(templateName);
    return companyInterpolate(base, data);
  }

  const personalList = listPersonalTemplates();
  if (personalList.includes(templateName)) {
    const base = getPersonalTemplate(templateName);
    return personalInterpolate(base, data);
  }

  // fallback
  const base = getCompanyTemplate('welcome');
  return companyInterpolate(base, data);
}
