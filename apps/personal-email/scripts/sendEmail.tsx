import 'dotenv/config';
import { render } from '@react-email/render';
import nodemailer from 'nodemailer';
import TemplateRenderer from '../src/emails/TemplateRenderer.js';
import { interpolateTemplate } from '../src/config/emailContent.js';

async function main() {
  const templateName = process.argv[2] || process.env['EMAIL_TEMPLATE'] || 'welcome';
  const name = process.argv[3] || process.env['TO_NAME'] || '朋友';

  // interpolate subject/preview using centralized content (by template name)
  const tpl = interpolateTemplate(templateName, { name });

  const html = await render(<TemplateRenderer templateName={templateName} data={{ name }} />);

  const transporter = nodemailer.createTransport({
    host: process.env['SMTP_HOST'],
    port: Number(process.env['SMTP_PORT'] || 587),
    secure: process.env['SMTP_SECURE'] === 'true',
    auth: {
      user: process.env['SMTP_USER'],
      pass: process.env['SMTP_PASS'],
    },
  });

  const info = await transporter.sendMail({
    from: process.env['MAIL_FROM'] || 'no-reply@example.com',
    to: process.env['MAIL_TO'] || 'recipient@example.com',
    subject: tpl.subject,
    html,
  });

  console.log('Message sent:', info.messageId ?? '');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
