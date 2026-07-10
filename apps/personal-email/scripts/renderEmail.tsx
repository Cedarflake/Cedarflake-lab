import { render } from '@react-email/render';
import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
	try {
		const TemplateModule = await import('../src/emails/TemplateRenderer.js');
		const TemplateRenderer = TemplateModule.default;

		const template = process.argv[2] || process.env['EMAIL_TEMPLATE'] || 'welcome';
		const name = process.argv[3] || process.env['TO_NAME'] || '张三';

		const html = await render(<TemplateRenderer templateName={template} data={{ name }} />);

		// 默认将渲染结果保存到 dist/output/<template>.html，保留旧行为可通过环境变量打印完整 HTML
		const outputDir = path.join(process.cwd(), 'dist', 'output');
		await fs.mkdir(outputDir, { recursive: true });
		const outPath = path.join(outputDir, `${template}.html`);
		await fs.writeFile(outPath, html, 'utf8');

		if (process.env['PRINT_HTML'] === '1') {
			console.log(html);
		}
		console.log(`Saved rendered HTML to: ${outPath}`);
	} catch (err: unknown) {
		// More robust error logging without using `any`.
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
