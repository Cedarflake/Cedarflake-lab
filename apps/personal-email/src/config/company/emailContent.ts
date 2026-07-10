import { brandDefaults as defaults, mergeBrand as defaultsMerge, interpolateTemplate as defaultsInterpolate } from './emailDefaults.js';
import type { TemplateData } from '../types';

export const brandDefaults = defaults;
export const mergeBrand = defaultsMerge;
export const interpolateTemplate = defaultsInterpolate;

export const templates: Record<string, TemplateData> = {
  welcome: {
    subject: '欢迎加入 {{name}}',
    preview: '欢迎使用 {{name}}！',
    heading: '你好，{{name}}',
    intro: '感谢你注册 {{name}}，我们很高兴你来了。点击下面开始：',
    cta: { text: '开始使用', url: 'https://example.com' },
    brand: brandDefaults,
    footerText: brandDefaults.footerText,
  },
  reset_password: {
    subject: '重置你的 {{name}} 密码',
    preview: '使用下面链接重置密码',
    heading: '密码重置请求',
    intro: '我们收到了密码重置请求。如果这不是你请忽略。点击下面链接以继续：',
    cta: { text: '重置密码', url: 'https://example.com/reset' },
    brand: brandDefaults,
    footerText: brandDefaults.footerText,
  },
  notification: {
    subject: '来自 {{name}} 的通知',
    preview: '你有一条新通知',
    heading: '新通知',
    intro: '你有一条来自系统的重要通知，请登录查看详情。',
    cta: { text: '查看通知', url: 'https://example.com/notifications' },
    brand: brandDefaults,
    footerText: brandDefaults.footerText,
  },
};

export function getTemplate(name: string, overrides?: Partial<TemplateData>): TemplateData {
  const base = templates[name] ?? templates['welcome'];
  if (!base) {
    throw new Error(`Template not found: ${name}`);
  }

  const tpl: TemplateData = {
    subject: base.subject,
    preview: base.preview,
    heading: base.heading,
    intro: base.intro,
    cta: base.cta === null ? null : base.cta ? { ...base.cta } : undefined,
    brand: base.brand ? { ...base.brand } : undefined,
    footerText: base.footerText,
  };

  if (overrides) {
    if (overrides.subject !== undefined) tpl.subject = overrides.subject;
    if (overrides.preview !== undefined) tpl.preview = overrides.preview;
    if (overrides.heading !== undefined) tpl.heading = overrides.heading;
    if (overrides.intro !== undefined) tpl.intro = overrides.intro;
    if (overrides.footerText !== undefined) tpl.footerText = overrides.footerText;

    if (Object.prototype.hasOwnProperty.call(overrides, 'cta')) {
      if (overrides.cta === null) {
        tpl.cta = null;
      } else if (overrides.cta) {
        tpl.cta = { ...(tpl.cta ?? {}), ...overrides.cta };
      }
    }
  }

  tpl.brand = mergeBrand(tpl.brand, overrides?.brand);

  return tpl;
}

export function listTemplates(): string[] {
  return Object.keys(templates);
}

export function addTemplate(name: string, data: TemplateData): void {
  templates[name] = data;
}
