import { render } from '@react-email/render';
import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  try {
    const name = process.argv[2] || process.env['TO_NAME'] || '示例用户';

    const contentModule = await import('../src/config/emailContent.js');
    const templates: string[] = (contentModule.listTemplates ? contentModule.listTemplates() : []);

    const TemplateModule = await import('../src/emails/TemplateRenderer.js');
    const TemplateRenderer = TemplateModule.default;

    const outputDir = path.join(process.cwd(), 'dist', 'output');
    await fs.mkdir(outputDir, { recursive: true });

    const saved: string[] = [];
    for (const templateName of templates) {
      const html = await render(<TemplateRenderer templateName={templateName} data={{ name }} />);
      const outPath = path.join(outputDir, `${templateName}.html`);
      await fs.writeFile(outPath, html, 'utf8');
      saved.push(outPath);
    }

    console.log('Saved templates:');
    for (const p of saved) console.log(p);
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error(err.stack);
      console.error('Error message:', err.message);
    } else {
      console.error('Error:', String(err));
    }
    process.exit(1);
  }
}

main();
