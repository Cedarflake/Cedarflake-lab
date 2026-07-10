import EmailLayout from '../layouts/EmailLayout.js';
import { interpolateTemplate } from '../config/emailContent.js';
import { Section, Text, Button } from '@react-email/components';

type Props = {
  templateName?: string;
  data?: Record<string, string>;
};

const styles = {
  card: {
    padding: '28px',
    margin: '0 0 20px',
    backgroundColor: '#ffffff',
    borderRadius: '20px',
    border: '1px solid #e0f2fe',
    boxShadow: '0 12px 30px rgba(14, 165, 233, 0.08)',
  },
  heading: {
    margin: '0 0 14px',
    fontSize: '26px',
    lineHeight: '34px',
    fontWeight: '700',
    color: '#0f172a',
  },
  intro: {
    margin: '0',
    fontSize: '15px',
    lineHeight: '28px',
    color: '#334155',
  },
  ctaWrap: {
    paddingTop: '24px',
  },
  cta: {
    display: 'inline-block',
    padding: '14px 22px',
    borderRadius: '12px',
    border: '1px solid rgba(2, 132, 199, 0.18)',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '700',
    textDecoration: 'none',
  },
  noteCard: {
    padding: '18px 20px',
    backgroundColor: '#f0f9ff',
    borderRadius: '16px',
    border: '1px solid #dbeafe',
  },
  noteTitle: {
    margin: '0 0 8px',
    fontSize: '13px',
    lineHeight: '20px',
    fontWeight: '700',
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    color: '#0284c7',
  },
  noteText: {
    margin: '0',
    fontSize: '14px',
    lineHeight: '24px',
    color: '#475569',
  },
};

export default function TemplateRenderer({ templateName = 'welcome', data = {} }: Props) {
  const tpl = interpolateTemplate(templateName, data as Record<string, string | undefined>);
  const primaryColor = tpl.brand?.primaryColor ?? '#38BDF8';

  return (
    <EmailLayout preview={tpl.preview} brand={tpl.brand}>
      <Section style={styles.card}>
        {tpl.heading ? <Text style={styles.heading}>{tpl.heading}</Text> : null}
        {tpl.intro ? <Text style={styles.intro}>{tpl.intro}</Text> : null}
        {tpl.cta ? (
          <Section style={styles.ctaWrap}>
            <Button href={tpl.cta.url} style={{ ...styles.cta, backgroundColor: primaryColor }}>
              {tpl.cta.text}
            </Button>
          </Section>
        ) : null}
      </Section>

      <Section style={styles.noteCard}>
        <Text style={styles.noteTitle}>温馨提示</Text>
        <Text style={styles.noteText}>如果按钮无法点击，可以直接复制邮件中的链接到浏览器打开。为了更好的阅读体验，本邮件采用了更清爽的天蓝色风格。</Text>
      </Section>
    </EmailLayout>
  );
}
