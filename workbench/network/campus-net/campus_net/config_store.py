from __future__ import annotations

import hashlib
import hmac
import json
import os
import stat
import uuid
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Literal, TypeAlias

from .config import (
    CONFIG_VERSION_CAPTIVE_SSO,
    CONFIG_VERSION_LEGACY_EPORTAL,
    build_captive_http_config,
    build_legacy_runtime_from_config,
)

MAX_CONFIG_BYTES = 64 * 1024

PathInput: TypeAlias = str | os.PathLike[str]


class ConfigStoreError(RuntimeError):
    pass


class ConfigFormatError(ConfigStoreError):
    pass


class ConfigTooLargeError(ConfigFormatError):
    pass


class ConfigPathError(ConfigStoreError):
    pass


class ConfigRevisionError(ConfigStoreError):
    pass


class ConfigIntegrityError(ConfigStoreError):
    pass


class ConfigCommitUncertainError(ConfigStoreError):
    def __init__(
        self,
        message: str,
        *,
        backup: BackupReceipt | None,
    ) -> None:
        super().__init__(message)
        self.backup = backup


@dataclass(frozen=True, slots=True)
class LegacyConfigV1:
    login_url: str
    username: str = field(repr=False)
    encrypted_password: str = field(repr=False)
    carrier: str
    user_group: str | None = None
    session_id: str | None = field(default=None, repr=False)
    version: Literal[1] = field(
        default=CONFIG_VERSION_LEGACY_EPORTAL,
        init=False,
    )


@dataclass(frozen=True, slots=True)
class CaptiveConfigV2:
    interface_index: int
    portal_url: str
    username: str = field(repr=False)
    password: str = field(repr=False)
    carrier: str
    version: Literal[2] = field(
        default=CONFIG_VERSION_CAPTIVE_SSO,
        init=False,
    )


EditableConfig: TypeAlias = LegacyConfigV1 | CaptiveConfigV2


@dataclass(frozen=True, slots=True)
class ConfigRevision:
    exists: bool
    sha256: str | None

    def __post_init__(self) -> None:
        if self.exists:
            if self.sha256 is None or not _is_sha256(self.sha256):
                raise ValueError("存在的配置必须提供有效 SHA-256")
            object.__setattr__(self, "sha256", self.sha256.casefold())
        elif self.sha256 is not None:
            raise ValueError("不存在的配置不能携带 SHA-256")

    @classmethod
    def absent(cls) -> ConfigRevision:
        return cls(exists=False, sha256=None)

    @classmethod
    def from_bytes(cls, content: bytes) -> ConfigRevision:
        return cls(exists=True, sha256=_sha256_bytes(content))


@dataclass(frozen=True, slots=True)
class LoadedConfig:
    path: Path
    revision: ConfigRevision
    config: EditableConfig = field(repr=False)


@dataclass(frozen=True, slots=True)
class BackupReceipt:
    path: Path
    sha256: str
    size: int


@dataclass(frozen=True, slots=True)
class SaveReceipt:
    path: Path
    revision: ConfigRevision
    backup: BackupReceipt | None
    changed: bool


@dataclass(frozen=True, slots=True)
class _FileSnapshot:
    revision: ConfigRevision
    content: bytes | None = field(repr=False)


def load_editable_config(
    path: PathInput,
    *,
    max_bytes: int = MAX_CONFIG_BYTES,
) -> LoadedConfig:
    config_path = _absolute_path(path)
    try:
        content = _read_regular_file(config_path, max_bytes=max_bytes)
    except FileNotFoundError:
        raise ConfigPathError(f"配置文件不存在：{config_path}") from None

    config = _parse_config_bytes(content)
    return LoadedConfig(
        path=config_path,
        revision=ConfigRevision.from_bytes(content),
        config=config,
    )


def config_from_mapping(raw_config: Mapping[str, Any]) -> EditableConfig:
    return _parse_formal_mapping(dict(raw_config))


def config_to_mapping(config: EditableConfig) -> dict[str, Any]:
    return _mapping_from_config(config)


def save_editable_config(
    config: EditableConfig,
    *,
    path: PathInput,
    backup_dir: PathInput,
    expected_revision: ConfigRevision,
    max_bytes: int = MAX_CONFIG_BYTES,
) -> SaveReceipt:
    config_path = _absolute_path(path)
    backup_directory = _absolute_path(backup_dir)
    content = _encode_config(config)
    if len(content) > max_bytes:
        raise ConfigTooLargeError(f"配置大小超过限制：{len(content)} > {max_bytes} 字节")

    parent = config_path.parent
    if not parent.is_dir():
        raise ConfigPathError(f"配置目录不存在：{parent}")

    initial_snapshot = _snapshot(config_path, max_bytes=max_bytes)
    _require_revision(initial_snapshot.revision, expected_revision)

    if initial_snapshot.content == content:
        return SaveReceipt(
            path=config_path,
            revision=initial_snapshot.revision,
            backup=None,
            changed=False,
        )

    backup = None
    if initial_snapshot.content is not None:
        backup = _create_verified_backup(
            source_path=config_path,
            source_content=initial_snapshot.content,
            backup_directory=backup_directory,
        )

    temporary_path = _write_fsynced_temporary_file(
        parent,
        prefix=f".{config_path.name}.",
        content=content,
    )
    expected_content_hash = _sha256_bytes(content)
    try:
        temporary_hash = _sha256_file(temporary_path)
        if not hmac.compare_digest(temporary_hash, expected_content_hash):
            raise ConfigIntegrityError("配置临时文件 SHA-256 校验失败")

        current_snapshot = _snapshot(config_path, max_bytes=max_bytes)
        _require_revision(current_snapshot.revision, initial_snapshot.revision)

        os.replace(temporary_path, config_path)
        temporary_path = None
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)

    try:
        _fsync_directory(parent)
        final_snapshot = _snapshot(config_path, max_bytes=max_bytes)
        if final_snapshot.content is None or not hmac.compare_digest(
            final_snapshot.revision.sha256 or "",
            expected_content_hash,
        ):
            raise ConfigIntegrityError("配置原子写入后的 SHA-256 校验失败")
    except (OSError, ConfigStoreError) as error:
        raise ConfigCommitUncertainError(
            "配置已执行原子替换，但最终落盘状态无法确认",
            backup=backup,
        ) from error

    return SaveReceipt(
        path=config_path,
        revision=final_snapshot.revision,
        backup=backup,
        changed=True,
    )


def _parse_config_bytes(content: bytes) -> EditableConfig:
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ConfigFormatError(f"配置不是有效 UTF-8，错误位置：{error.start}") from None

    try:
        raw_config = json.loads(text, object_pairs_hook=_object_without_duplicates)
    except json.JSONDecodeError as error:
        raise ConfigFormatError(
            f"配置不是有效 JSON：第 {error.lineno} 行，第 {error.colno} 列"
        ) from None
    except _DuplicateKeyError as error:
        raise ConfigFormatError(str(error)) from None

    if not isinstance(raw_config, dict):
        raise ConfigFormatError("配置顶层必须是 JSON 对象")
    return _parse_formal_mapping(raw_config)


def _parse_formal_mapping(raw_config: dict[str, Any]) -> EditableConfig:
    version = raw_config.get("version")
    if isinstance(version, bool) or not isinstance(version, int):
        raise ConfigFormatError("正式 GUI 配置必须提供整数 version=1 或 version=2")

    try:
        if version == CONFIG_VERSION_LEGACY_EPORTAL:
            build_legacy_runtime_from_config(raw_config)
            return LegacyConfigV1(
                login_url=str(raw_config["login_url"]).strip(),
                username=str(raw_config["username"]).strip(),
                encrypted_password=str(raw_config["encrypted_password"]),
                carrier=str(raw_config["carrier"]).strip(),
                user_group=_optional_trimmed_value(raw_config, "user_group"),
                session_id=_optional_trimmed_value(raw_config, "session_id"),
            )
        if version == CONFIG_VERSION_CAPTIVE_SSO:
            runtime_config = build_captive_http_config(raw_config)
            return CaptiveConfigV2(
                interface_index=runtime_config.interface_index,
                portal_url=runtime_config.portal_origin,
                username=runtime_config.username,
                password=runtime_config.password,
                carrier=runtime_config.service_display_name,
            )
    except (KeyError, TypeError, ValueError) as error:
        raise ConfigFormatError(str(error)) from None

    raise ConfigFormatError(f"不支持的配置 version：{version}")


def _encode_config(config: EditableConfig) -> bytes:
    raw_config = config_to_mapping(config)
    normalized_config = _parse_formal_mapping(raw_config)
    normalized_mapping = config_to_mapping(normalized_config)
    text = json.dumps(normalized_mapping, ensure_ascii=False, indent=2) + "\n"
    return text.encode("utf-8")


def _mapping_from_config(config: EditableConfig) -> dict[str, Any]:
    if isinstance(config, LegacyConfigV1):
        raw_config: dict[str, Any] = {
            "version": CONFIG_VERSION_LEGACY_EPORTAL,
            "login_url": config.login_url,
            "username": config.username,
            "encrypted_password": config.encrypted_password,
            "carrier": config.carrier,
        }
        if config.user_group is not None:
            raw_config["user_group"] = config.user_group
        if config.session_id is not None:
            raw_config["session_id"] = config.session_id
        return raw_config

    if isinstance(config, CaptiveConfigV2):
        return {
            "version": CONFIG_VERSION_CAPTIVE_SSO,
            "interface_index": config.interface_index,
            "portal_url": config.portal_url,
            "username": config.username,
            "password": config.password,
            "carrier": config.carrier,
        }

    raise TypeError("config 必须是正式的 LegacyConfigV1 或 CaptiveConfigV2")


def _optional_trimmed_value(
    raw_config: dict[str, Any],
    key: str,
) -> str | None:
    value = raw_config.get(key)
    return None if value is None else str(value).strip()


class _DuplicateKeyError(ValueError):
    pass


def _object_without_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise _DuplicateKeyError(f"配置包含重复字段：{key}")
        result[key] = value
    return result


def _snapshot(path: Path, *, max_bytes: int) -> _FileSnapshot:
    try:
        content = _read_regular_file(path, max_bytes=max_bytes)
    except FileNotFoundError:
        return _FileSnapshot(revision=ConfigRevision.absent(), content=None)
    return _FileSnapshot(
        revision=ConfigRevision.from_bytes(content),
        content=content,
    )


def _read_regular_file(path: Path, *, max_bytes: int) -> bytes:
    if max_bytes < 1:
        raise ValueError("max_bytes 必须大于 0")

    file_status = path.lstat()
    if stat.S_ISLNK(file_status.st_mode):
        raise ConfigPathError(f"拒绝读取符号链接配置：{path}")
    if not stat.S_ISREG(file_status.st_mode):
        raise ConfigPathError(f"配置路径不是普通文件：{path}")
    if file_status.st_size > max_bytes:
        raise ConfigTooLargeError(f"配置大小超过限制：{file_status.st_size} > {max_bytes} 字节")

    with path.open("rb") as config_file:
        content = config_file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise ConfigTooLargeError(f"配置大小超过限制：{len(content)} > {max_bytes} 字节")
    return content


def _create_verified_backup(
    *,
    source_path: Path,
    source_content: bytes,
    backup_directory: Path,
) -> BackupReceipt:
    if backup_directory.exists() and not backup_directory.is_dir():
        raise ConfigPathError(f"备份路径不是目录：{backup_directory}")
    backup_directory.mkdir(parents=True, exist_ok=True)

    source_hash = _sha256_bytes(source_content)
    temporary_path = _write_fsynced_temporary_file(
        backup_directory,
        prefix=f".{source_path.stem}.backup.",
        content=source_content,
    )
    final_path = _unique_backup_path(source_path, backup_directory)
    try:
        temporary_hash = _sha256_file(temporary_path)
        if not hmac.compare_digest(temporary_hash, source_hash):
            raise ConfigIntegrityError("配置备份 SHA-256 校验失败")

        os.replace(temporary_path, final_path)
        temporary_path = None
        _fsync_directory(backup_directory)

        final_hash = _sha256_file(final_path)
        if not hmac.compare_digest(final_hash, source_hash):
            raise ConfigIntegrityError("配置备份落盘后的 SHA-256 校验失败")
        if final_path.stat().st_size != len(source_content):
            raise ConfigIntegrityError("配置备份落盘后的大小校验失败")
    except BaseException:
        final_path.unlink(missing_ok=True)
        raise
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)

    return BackupReceipt(
        path=final_path,
        sha256=source_hash,
        size=len(source_content),
    )


def _write_fsynced_temporary_file(
    directory: Path,
    *,
    prefix: str,
    content: bytes,
) -> Path:
    temporary_path: Path | None = None
    try:
        with NamedTemporaryFile(
            mode="wb",
            dir=directory,
            prefix=prefix,
            suffix=".tmp",
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)
            temporary_file.write(content)
            temporary_file.flush()
            os.fsync(temporary_file.fileno())
        return temporary_path
    except BaseException:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
        raise


def _unique_backup_path(source_path: Path, backup_directory: Path) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    for _attempt in range(10):
        token = uuid.uuid4().hex[:12]
        candidate = backup_directory / (f"{source_path.stem}.{timestamp}.{token}.backup.json")
        if not candidate.exists():
            return candidate
    raise ConfigStoreError("无法生成唯一的配置备份文件名")


def _require_revision(
    actual_revision: ConfigRevision,
    expected_revision: ConfigRevision,
) -> None:
    if actual_revision.exists != expected_revision.exists:
        raise ConfigRevisionError("配置文件状态已变化，请重新加载后再保存")
    if not actual_revision.exists:
        return
    if not hmac.compare_digest(
        actual_revision.sha256 or "",
        expected_revision.sha256 or "",
    ):
        raise ConfigRevisionError("配置文件内容已变化，请重新加载后再保存")


def _sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source_file:
        for chunk in iter(lambda: source_file.read(64 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _is_sha256(value: str) -> bool:
    return len(value) == 64 and all(character in "0123456789abcdefABCDEF" for character in value)


def _absolute_path(path: PathInput) -> Path:
    candidate = Path(path).expanduser()
    return candidate if candidate.is_absolute() else candidate.absolute()


def _fsync_directory(directory: Path) -> None:
    if os.name == "nt":
        return
    directory_descriptor = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(directory_descriptor)
    finally:
        os.close(directory_descriptor)
