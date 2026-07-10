# GitHub Star Cycle

归档的 GitHub Actions 实验：通过 GitHub API 对指定仓库执行 Star/Unstar，并在文件中记录上次操作时间。

该自动化已经停止使用。工作流保存在 `workflows/star-cycle.yml`，并归档在 `others/github-actions/` 下，因此不会被 GitHub Actions 发现或执行。归档文件仅保留手动触发，不包含定时计划。

频繁改变 Star 状态可能触发平台限制，也可能被视为操纵活跃度。不要在未确认 GitHub 规则、Token 权限和目标仓库意愿时启用此示例。

## License

GNU General Public License v3.0. See `LICENSE`.
