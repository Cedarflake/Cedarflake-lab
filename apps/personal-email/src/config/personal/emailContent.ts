import { brandDefaults as defaults, mergeBrand as defaultsMerge, interpolateTemplate as defaultsInterpolate } from './emailDefaults.js';
import type { TemplateData } from '../types';

export const brandDefaults = defaults;
export const mergeBrand = defaultsMerge;
export const interpolateTemplate = defaultsInterpolate;

export const templates: Record<string, TemplateData> = {
  // 个人使用模板（面向个人而非公司/服务）
  personal_note: {
    subject: '来自 {{name}} 的私信',
    preview: '{{name}} 给你写了一条消息',
    heading: '你好',
    intro: '只是想和你说声你好，顺便分享些最近的近况：',
    cta: null,
    brand: { name: '{{name}}', footerText: '来自 {{name}}' },
    footerText: '来自 {{name}}',
  },
  personal_invite: {
    subject: '邀请：{{event}} —— 来自 {{name}}',
    preview: '时间：{{date}}，地点：{{location}}，回复请见下方',
    heading: '你愿意参加吗？',
    intro: '我想邀请你参加 {{event}}，时间：{{date}}，地点：{{location}}。如能参加请点击下方确认。',
    cta: { text: '确认参加', url: '{{rsvpUrl}}' },
    brand: { name: '{{name}}', footerText: '— {{name}}' },
    footerText: '— {{name}}',
  },
  personal_thanks: {
    subject: '谢谢你！',
    preview: '衷心感谢你的帮助/支持',
    heading: '谢谢！',
    intro: '感谢你在 {{occasion}} 上的帮助/支持，真的很感激。',
    cta: null,
    brand: { name: '{{name}}', footerText: '感谢，{{name}}' },
    footerText: '感谢，{{name}}',
  },
  personal_followup: {
    subject: '跟进：关于 {{topic}}',
    preview: '简单跟进我们上次的交流',
    heading: '跟进：{{topic}}',
    intro: '你好，想简单跟进我们上次讨论的 {{topic}}，如有进展请告知。',
    cta: null,
    brand: { name: '{{name}}', footerText: '此致，{{name}}' },
    footerText: '此致，{{name}}',
  },
};

export function getTemplate(name: string, overrides?: Partial<TemplateData>): TemplateData {
  const base = templates[name] ?? templates['personal_note'];
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
