# personal_email — email template scaffold

这是一个最小项目架构示例，展示如何使用 `@react-email/components` 编写邮件模板、将模板渲染为 HTML，并用 `nodemailer` 发送。

主要文件：

- `src/layouts/EmailLayout.tsx`：通用邮件布局（header/logo/footer/brand 样式）
 - `src/config/emailContent.ts`：集中化模板内容与占位符（在此处修改所有邮件内容）
- `src/emails/TemplateRenderer.tsx`：模板渲染器 — 将 `emailContent` 的数据注入 `EmailLayout`
- `src/emails/WelcomeEmail.tsx`：使用模板渲染器的示例邮件组件（向后兼容）
- `scripts/renderEmail.tsx`：将模板渲染为 HTML（打印到控制台），支持通过 CLI 或环境变量选择模板与参数
- `scripts/sendEmail.tsx`：使用 `nodemailer` 发送邮件的示例脚本（读取 `.env`，并使用 `emailContent` 中的 subject）

快速上手

1. 安装依赖：
```bash
pnpm install
```

（若尚未安装 dev/runtime 依赖，可执行：）
```bash
pnpm add -D typescript ts-node @types/node @types/react @types/react-dom @react-email/render
pnpm add react react-dom nodemailer dotenv
```

2. 复制并填写环境变量：
```bash
cp .env.example .env
# 编辑 .env 填入你的 SMTP 配置
```

3. 渲染模板（输出 HTML）：
```bash
# 默认渲染 welcome 模板并把 name 设为 张三：
pnpm run render:email

# 也可以通过参数传入模板名与姓名：
pnpm run render:email -- reset_password 李四

# 或使用环境变量：
EMAIL_TEMPLATE=notification TO_NAME=王五 pnpm run render:email
```

快捷脚本
- 一次生成所有模板到 dist/output：
```bash
pnpm run render:all
```
- 生成单个常用模板（无需额外参数）：
```bash
pnpm run render:welcome
pnpm run render:reset_password
pnpm run render:notification
```

4. 发送测试邮件：
```bash
# 会先编译 TypeScript，然后读取 .env 并发送邮件（默认使用 templates.welcome）
pnpm run send:email

# 可通过参数传模板名与收件人姓名：
pnpm run send:email -- reset_password 李四

# 或使用环境变量：
EMAIL_TEMPLATE=reset_password TO_NAME=李四 MAIL_TO=foo@example.com pnpm run send:email
```

说明
- 脚本会先用 `tsc` 编译到 `dist/`，再用 Node 运行编译后的 JS（因此在修改后请先运行 `pnpm run build:ts`，或者直接用 `pnpm run render:email` / `pnpm run send:email`，脚本会自动构建）。
- 邮件模板尽量使用内联样式以提升各种客户端的兼容性。

如何集中修改邮件内容
- 在 `src/emailContent.ts` 中维护 `templates` 对象，添加或编辑模板（例如 `welcome`、`reset_password`、`notification`）。
- 模板字符串支持占位符 `{{name}}` 等，脚本会在渲染前替换它们。
- `brandDefaults` 用于统一公司名称、logo、主色和页脚文本，修改此处可改变全局样式。

扩展提示
- 若需要更复杂的内容（如表格、多行项目），在 `TemplateRenderer.tsx` 中扩展渲染逻辑或创建新的模板组件，仍然使用 `EmailLayout` 以保持一致样式。

