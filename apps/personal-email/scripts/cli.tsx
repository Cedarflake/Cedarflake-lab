import prompts from 'prompts';
import { render } from '@react-email/render';
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireTemplateName } from '../src/config/emailContent.js';

async function renderTemplate(templateName: string, name: string) {
  const safeTemplateName = requireTemplateName(templateName);
  const TemplateModule = await import('../src/emails/TemplateRenderer.js');
  const TemplateRenderer = TemplateModule.default;
  const html = await render(<TemplateRenderer templateName={safeTemplateName} data={{ name }} />);

  const outputDir = path.join(process.cwd(), 'dist', 'output');
  await fs.mkdir(outputDir, { recursive: true });
  const outPath = path.join(outputDir, `${safeTemplateName}.html`);
  await fs.writeFile(outPath, html, 'utf8');
  console.log(`Saved: ${outPath}`);
}

async function main() {
  try {
    const argv = process.argv.slice(2);

    // non-interactive shortcuts: node dist/scripts/cli.js render <template> <name>
    if (argv[0] === 'render' && argv[1]) {
      await renderTemplate(argv[1], argv[2] || process.env['TO_NAME'] || '张三');
      return;
    }
    if (argv[0] === 'all') {
      const name = argv[1] || process.env['TO_NAME'] || '示例用户';
      const contentModule = await import('../src/config/emailContent.js');
      const templates: string[] = (contentModule.listTemplates ? contentModule.listTemplates() : []);
      for (const t of templates) await renderTemplate(t, name);
      return;
    }

    const contentModule = await import('../src/config/emailContent.js');
    const templates: string[] = (contentModule.listTemplates ? contentModule.listTemplates() : []);

    const action = await prompts({
      type: 'select',
      name: 'value',
      message: '选择操作',
      choices: [
        { title: '渲染单个模板并保存到 dist/output', value: 'render' },
        { title: '渲染所有模板并保存到 dist/output', value: 'all' },
        { title: '退出', value: 'exit' },
      ],
    });

    if (action.value === 'render') {
      const tpl = await prompts({ type: 'select', name: 'value', message: '选择模板', choices: templates.map((t) => ({ title: t, value: t })) });
      const nameResp = await prompts({ type: 'text', name: 'value', message: '收件人姓名', initial: process.env['TO_NAME'] || '张三' });
      await renderTemplate(tpl.value, nameResp.value);
    } else if (action.value === 'all') {
      const nameResp = await prompts({ type: 'text', name: 'value', message: '收件人姓名（用于占位符）', initial: process.env['TO_NAME'] || '示例用户' });
      for (const t of templates) await renderTemplate(t, nameResp.value);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
