import React from 'react';
import { Html, Head, Preview, Body, Container, Section, Text, Img } from '@react-email/components';

type Brand = {
  name?: string;
  logoUrl?: string;
  primaryColor?: string;
  footerText?: string;
};

type Props = {
  preview?: string | undefined;
  brand?: Brand | undefined;
  children: React.ReactNode;
};

const styles = {
  body: {
    margin: '0',
    padding: '32px 12px',
    backgroundColor: '#f0f9ff',
    fontFamily: 'Arial, sans-serif',
    color: '#0f172a',
  },
  shell: {
    width: '100%',
    maxWidth: '640px',
    margin: '0 auto',
    backgroundColor: '#ffffff',
    borderRadius: '24px',
    border: '1px solid #dbeafe',
    boxShadow: '0 18px 45px rgba(56, 189, 248, 0.16)',
    overflow: 'hidden',
  },
  hero: {
    padding: '32px 32px 24px',
    textAlign: 'center' as const,
    background: 'linear-gradient(180deg, #e0f2fe 0%, #f8fdff 100%)',
  },
  heroBadge: {
    display: 'inline-block',
    margin: '0 0 16px',
    padding: '6px 12px',
    borderRadius: '999px',
    backgroundColor: '#ffffff',
    border: '1px solid #bae6fd',
    color: '#0284c7',
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  },
  logoWrap: {
    width: '64px',
    height: '64px',
    margin: '0 auto 16px',
    borderRadius: '18px',
    backgroundColor: '#ffffff',
    border: '1px solid #bae6fd',
    boxShadow: '0 10px 24px rgba(56, 189, 248, 0.18)',
    textAlign: 'center' as const,
  },
  brandName: {
    margin: '0',
    fontSize: '28px',
    lineHeight: '34px',
    fontWeight: '700',
  },
  subtitle: {
    margin: '12px 0 0',
    fontSize: '14px',
    lineHeight: '22px',
    color: '#475569',
  },
  content: {
    padding: '0 32px 12px',
  },
  footer: {
    padding: '20px 32px 32px',
    textAlign: 'center' as const,
  },
  footerText: {
    margin: '0',
    fontSize: '12px',
    lineHeight: '20px',
    color: '#64748b',
  },
  divider: {
    height: '1px',
    margin: '0 32px',
    backgroundColor: '#e0f2fe',
  },
};

export default function EmailLayout({ preview, brand = {}, children }: Props) {
  const { name = 'Example Co', logoUrl = '', primaryColor = '#38BDF8', footerText = '© Example Co' } = brand;

  return (
    <Html>
      <Head />
      {preview ? <Preview>{preview}</Preview> : null}
      <Body style={styles.body}>
        <Container style={styles.shell}>
          <Section style={styles.hero}>
            <Text style={styles.heroBadge}>Sky Blue Theme</Text>
            {logoUrl ? (
              <Section style={styles.logoWrap}>
                <Img src={logoUrl} alt={name} width="64" height="64" style={{ borderRadius: '18px', display: 'block' }} />
              </Section>
            ) : null}
            <Text style={{ ...styles.brandName, color: primaryColor }}>{name}</Text>
            <Text style={styles.subtitle}>清爽、柔和且更有层次感的邮件视觉，让信息传达更舒服。</Text>
          </Section>

          <Section style={styles.content}>{children}</Section>

          <Section style={styles.divider} />

          <Section style={styles.footer}>
            <Text style={styles.footerText}>{footerText}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
