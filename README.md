# cedarflake-lab

Personal monorepo for experiments, apps, packages, and local workbench projects.

## Workspaces

| Path | Project |
| --- | --- |
| `apps/copilot-task` | Vite/React AI Agent preview site. |
| `apps/focus-orb-demo` | Demo app for the Focus Orb package. |
| `apps/liminal-drift` | Vite/React game project. |
| `apps/maimai-transition` | Vite/React transition experience. |
| `apps/personal-email` | React Email templates and mail scripts. |
| `apps/shika` | Next.js status-page prototype. |
| `packages/focus-orb` | Reusable Focus Orb React package. |
| `workbench/*` | Local Python scripts, utilities, and small experiments. |

## Commands

```bash
pnpm install
pnpm check
pnpm build
pnpm dev:shika
pnpm dev:focus-orb
pnpm render:email
```

Use `pnpm --filter <package-name> <script>` for project-specific frontend/package commands.

Python workbench checks:

```powershell
uvx ruff format workbench
uvx ruff check workbench
```
