from __future__ import annotations

import os
import sys
from collections.abc import Iterator
from pathlib import Path

CONFIG_ENV = "CAMPUSNET_CONFIG"
PROJECT_MARKERS = ("pyproject.toml", "config.example.json")


def packaged_project_root(
    executable: str | os.PathLike[str] | None = None,
) -> Path | None:
    executable_directory = Path(executable or sys.executable).expanduser().absolute().parent
    if executable_directory.name.casefold() != "dist":
        return None
    project_root = executable_directory.parent
    if all((project_root / marker).is_file() for marker in PROJECT_MARKERS):
        return project_root
    return None


def config_candidates(
    configured_path: str | os.PathLike[str] | None = None,
    *,
    frozen: bool | None = None,
    executable: str | os.PathLike[str] | None = None,
    cwd: str | os.PathLike[str] | None = None,
    source_root: str | os.PathLike[str] | None = None,
    bundled_directory: str | os.PathLike[str] | None = None,
) -> Iterator[Path]:
    configured = configured_path
    if configured is None:
        configured = os.getenv(CONFIG_ENV)

    is_frozen = getattr(sys, "frozen", False) if frozen is None else frozen
    executable_path = Path(executable or sys.executable).expanduser()
    working_directory = Path(cwd or Path.cwd()).expanduser()
    project_root = Path(source_root or Path(__file__).resolve().parent.parent).expanduser()
    bundle_root_value = (
        getattr(sys, "_MEIPASS", None) if bundled_directory is None else bundled_directory
    )

    raw_candidates: list[Path] = []
    if configured:
        raw_candidates.append(Path(configured).expanduser())

    raw_candidates.append(working_directory / "config.json")

    if is_frozen:
        executable_directory = executable_path.absolute().parent
        raw_candidates.append(executable_directory / "config.json")
        packaged_root = packaged_project_root(executable_path)
        if packaged_root is not None:
            raw_candidates.append(packaged_root / "config.json")
    else:
        raw_candidates.append(project_root / "config.json")

    if bundle_root_value:
        raw_candidates.append(Path(bundle_root_value).expanduser() / "config.json")

    seen: set[str] = set()
    for candidate in raw_candidates:
        absolute = candidate.absolute()
        comparison_key = os.path.normcase(os.path.normpath(str(absolute)))
        if comparison_key not in seen:
            seen.add(comparison_key)
            yield absolute


def resolve_config_path(
    configured_path: str | os.PathLike[str] | None = None,
    **candidate_overrides: object,
) -> Path:
    if configured_path:
        explicit_path = Path(configured_path).expanduser().absolute()
        if explicit_path.is_file():
            return explicit_path
        raise FileNotFoundError(f"指定的配置文件不存在或不是普通文件：{explicit_path}")

    candidates = list(config_candidates(configured_path, **candidate_overrides))
    config_path = next((path for path in candidates if path.is_file()), None)
    if config_path is not None:
        return config_path

    searched_paths = "\n".join(f"- {path}" for path in candidates)
    raise FileNotFoundError(
        f"未找到 config.json。请创建本地配置或设置 CAMPUSNET_CONFIG。\n已检查：\n{searched_paths}"
    )


def preferred_config_path(
    configured_path: str | os.PathLike[str] | None = None,
    **candidate_overrides: object,
) -> Path:
    if configured_path:
        return Path(configured_path).expanduser().absolute()

    candidates = list(config_candidates(configured_path, **candidate_overrides))
    existing_path = next((path for path in candidates if path.is_file()), None)
    if existing_path is not None:
        return existing_path
    if not candidates:
        raise RuntimeError("没有可用的配置路径")
    return candidates[0]
