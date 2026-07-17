from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from tempfile import NamedTemporaryFile

WINDOW_STATE_VERSION = 1
MAX_WINDOW_STATE_BYTES = 4096


@dataclass(frozen=True, slots=True)
class WindowState:
    width: int
    height: int
    x: int
    y: int
    maximized: bool = False

    @property
    def geometry(self) -> str:
        return f"{self.width}x{self.height}{self.x:+d}{self.y:+d}"


@dataclass(frozen=True, slots=True)
class ScreenRect:
    left: int
    top: int
    right: int
    bottom: int

    @property
    def width(self) -> int:
        return self.right - self.left

    @property
    def height(self) -> int:
        return self.bottom - self.top


def load_window_state(path: str | os.PathLike[str]) -> WindowState | None:
    state_path = Path(path).expanduser()
    try:
        if not state_path.is_file() or state_path.stat().st_size > MAX_WINDOW_STATE_BYTES:
            return None
        raw_state = json.loads(state_path.read_text(encoding="utf-8"))
        return _state_from_mapping(raw_state)
    except (OSError, UnicodeError, json.JSONDecodeError, TypeError, ValueError):
        return None


def save_window_state(
    state: WindowState,
    path: str | os.PathLike[str],
) -> None:
    _validate_state(state)
    state_path = Path(path).expanduser().absolute()
    state_path.parent.mkdir(parents=True, exist_ok=True)
    content = (
        json.dumps(
            {
                "version": WINDOW_STATE_VERSION,
                "width": state.width,
                "height": state.height,
                "x": state.x,
                "y": state.y,
                "maximized": state.maximized,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )

    temporary_path: Path | None = None
    try:
        with NamedTemporaryFile(
            mode="w",
            dir=state_path.parent,
            prefix=f".{state_path.name}.",
            suffix=".tmp",
            encoding="utf-8",
            newline="\n",
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)
            temporary_file.write(content)
            temporary_file.flush()
            os.fsync(temporary_file.fileno())
        os.replace(temporary_path, state_path)
        temporary_path = None
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def clamp_window_state(
    state: WindowState | None,
    work_areas: list[ScreenRect] | tuple[ScreenRect, ...],
    *,
    min_width: int = 940,
    min_height: int = 620,
    default_width: int = 1100,
    default_height: int = 720,
) -> WindowState:
    if min_width < 1 or min_height < 1:
        raise ValueError("窗口最小尺寸必须大于 0")
    if default_width < 1 or default_height < 1:
        raise ValueError("窗口默认尺寸必须大于 0")

    valid_areas = tuple(area for area in work_areas if area.width > 0 and area.height > 0)
    if not valid_areas:
        valid_areas = (
            ScreenRect(
                left=0,
                top=0,
                right=max(default_width, min_width),
                bottom=max(default_height, min_height),
            ),
        )

    if state is None:
        return _centered_state(
            valid_areas[0],
            width=default_width,
            height=default_height,
            min_width=min_width,
            min_height=min_height,
            maximized=False,
        )

    _validate_state(state)
    target_area = max(valid_areas, key=lambda area: _intersection_area(state, area))
    if _intersection_area(state, target_area) == 0:
        return _centered_state(
            valid_areas[0],
            width=default_width,
            height=default_height,
            min_width=min_width,
            min_height=min_height,
            maximized=state.maximized,
        )

    width = min(max(state.width, min_width), target_area.width)
    height = min(max(state.height, min_height), target_area.height)
    x = min(max(state.x, target_area.left), target_area.right - width)
    y = min(max(state.y, target_area.top), target_area.bottom - height)
    return WindowState(
        width=width,
        height=height,
        x=x,
        y=y,
        maximized=state.maximized,
    )


def _centered_state(
    area: ScreenRect,
    *,
    width: int,
    height: int,
    min_width: int,
    min_height: int,
    maximized: bool,
) -> WindowState:
    clamped_width = min(max(width, min_width), area.width)
    clamped_height = min(max(height, min_height), area.height)
    return WindowState(
        width=clamped_width,
        height=clamped_height,
        x=area.left + (area.width - clamped_width) // 2,
        y=area.top + (area.height - clamped_height) // 2,
        maximized=maximized,
    )


def _intersection_area(state: WindowState, area: ScreenRect) -> int:
    right = min(state.x + state.width, area.right)
    bottom = min(state.y + state.height, area.bottom)
    width = max(0, right - max(state.x, area.left))
    height = max(0, bottom - max(state.y, area.top))
    return width * height


def _state_from_mapping(raw_state: object) -> WindowState:
    if not isinstance(raw_state, dict) or raw_state.get("version") != WINDOW_STATE_VERSION:
        raise ValueError("窗口状态版本无效")
    state = WindowState(
        width=_required_int(raw_state, "width"),
        height=_required_int(raw_state, "height"),
        x=_required_int(raw_state, "x"),
        y=_required_int(raw_state, "y"),
        maximized=raw_state.get("maximized", False),
    )
    _validate_state(state)
    return state


def _required_int(raw_state: dict[str, object], key: str) -> int:
    value = raw_state.get(key)
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"窗口状态字段 {key} 必须是整数")
    return value


def _validate_state(state: WindowState) -> None:
    for name, value in (
        ("width", state.width),
        ("height", state.height),
        ("x", state.x),
        ("y", state.y),
    ):
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError(f"窗口状态字段 {name} 必须是整数")
    if not isinstance(state.maximized, bool):
        raise ValueError("窗口状态字段 maximized 必须是布尔值")
    if not 1 <= state.width <= 100_000 or not 1 <= state.height <= 100_000:
        raise ValueError("窗口尺寸超出允许范围")
    if abs(state.x) > 1_000_000 or abs(state.y) > 1_000_000:
        raise ValueError("窗口位置超出允许范围")
