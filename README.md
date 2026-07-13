<p align="center">
  <a href="https://test.i0c.cc/">
    <img src="./assets/Lab.png" alt="Cedarflake Lab" width="960"/>
  </a>
</p>

#

Personal monorepo for apps, packages, local Python projects, and assorted experiments.

## Workspaces

| Path | Project | Live |
| --- | --- | --- |
| `apps/copilot-task` | Vite/React AI Agent preview site. | [3kf1.test.i0c.cc](https://3kf1.test.i0c.cc/) |
| `apps/focus-orb-demo` | Demo app for the Focus Orb package. | — |
| `apps/landing` | Landing page for the Cedarflake Lab project index. | [test.i0c.cc](https://test.i0c.cc/) |
| `apps/liminal-drift` | Vite/React game project. | [4po7.test.i0c.cc](https://4po7.test.i0c.cc/) |
| `apps/maimai-transition` | Vite/React transition experience. | [7gkp.test.i0c.cc](https://7gkp.test.i0c.cc/) |
| `apps/personal-email` | React Email templates and mail scripts. | — |
| `apps/shika` | Next.js status-page prototype. | — |
| `packages/*` | Reusable frontend packages. | — |
| `workbench/*` | Local Python utilities and small projects. | — |
| `others/*` | Others. | — |

## Commands

```bash
pnpm install
pnpm check
pnpm build
pnpm dev:landing
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

## Repository Maintenance

See [Repository Rules](./docs/repository-rules.md) before adding, moving, archiving, or deleting a project. The rules define when to update the landing catalog, README indexes, Live links, licenses, workspace metadata, and CI.
