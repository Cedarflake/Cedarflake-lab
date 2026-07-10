export type CTA = { text: string; url: string };

export type Brand = {
  name?: string;
  logoUrl?: string;
  primaryColor?: string;
  footerText?: string;
};

export type TemplateData = {
  subject: string;
  preview?: string | undefined;
  heading?: string | undefined;
  intro?: string | undefined;
  cta?: CTA | null | undefined;
  brand?: Brand | undefined;
  footerText?: string | undefined;
};
