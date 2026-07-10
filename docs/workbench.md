# Workbench

`workbench/` contains local scripts and small projects that are useful to keep with the lab, but are not deployable frontend apps or reusable packages.

Use `uv` for Python tools. Each larger tool keeps its own dependency file, such as `requirements.txt` or `pyproject.toml`.

```powershell
uvx ruff format workbench
uvx ruff check workbench
```

Local configuration, API keys, logs, downloaded files, build output, and virtual environments are intentionally ignored.

## License

Workbench projects use the BSD 3-Clause License. See `workbench/LICENSE`.
