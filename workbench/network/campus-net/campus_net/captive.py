from __future__ import annotations

import html
import re
import socket
import struct
import sys
from collections.abc import Mapping
from dataclasses import dataclass
from enum import Enum
from html.parser import HTMLParser
from urllib.parse import parse_qsl, urlparse

import aiohttp

from .config import CaptiveHttpConfig, ProbeConfig

MAX_RESPONSE_BYTES = 64 * 1024
MAX_CAPTIVE_URL_LENGTH = 4096
REQUIRED_CAPTIVE_PARAMETERS = frozenset({"wlanuserip", "wlanacname", "nasip", "mac"})
IP_UNICAST_IF = getattr(socket, "IP_UNICAST_IF", 31)

LOCATION_ASSIGNMENT = re.compile(
    r"(?<![\w.])(?:top\.self\.location\.href|window\.location\.href|location\.href)"
    r"\s*=\s*(?P<quote>['\"])(?P<url>[^'\"<>]+)(?P=quote)",
    re.IGNORECASE,
)

AddressInfo = tuple[
    int,
    int,
    int,
    str,
    tuple[str, int] | tuple[str, int, int, int],
]


class NetworkState(Enum):
    ONLINE = "online"
    CAPTIVE = "captive"
    UNKNOWN = "unknown"


class CaptiveParseError(ValueError):
    pass


@dataclass(frozen=True)
class ResponseSnapshot:
    status: int
    headers: Mapping[str, str]
    body: bytes


@dataclass(frozen=True)
class ProbeResult:
    state: NetworkState
    captive_url: str | None = None
    reason: str = ""


class _ScriptCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self._is_script = False
        self.scripts: list[str] = []
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.casefold() == "script":
            self._is_script = True
            self._parts = []

    def handle_data(self, data: str) -> None:
        if self._is_script:
            self._parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.casefold() == "script" and self._is_script:
            self.scripts.append("".join(self._parts))
            self._is_script = False
            self._parts = []


class WindowsInterfaceSocketFactory:
    def __init__(self, interface_index: int) -> None:
        if isinstance(interface_index, bool) or not 1 <= interface_index <= 0xFFFFFFFF:
            raise ValueError("interface_index 必须是有效的 Windows 接口索引")
        self.interface_index = interface_index

    def __call__(self, address_info: AddressInfo) -> socket.socket:
        if sys.platform != "win32":
            raise OSError("按接口绑定当前仅支持 Windows")

        family, socket_type, protocol = address_info[:3]
        if family != socket.AF_INET:
            raise OSError("captive-sso-http 当前仅支持 IPv4")

        client_socket = socket.socket(family, socket_type, protocol)
        try:
            client_socket.setsockopt(
                socket.IPPROTO_IP,
                IP_UNICAST_IF,
                struct.pack("!I", self.interface_index),
            )
        except OSError:
            client_socket.close()
            raise
        return client_socket


def create_bound_connector(interface_index: int) -> aiohttp.TCPConnector:
    return aiohttp.TCPConnector(
        family=socket.AF_INET,
        force_close=True,
        socket_factory=WindowsInterfaceSocketFactory(interface_index),
    )


def extract_captive_url(
    response_body: bytes,
    portal_origin: str,
    entry_path: str,
) -> str | None:
    if len(response_body) > MAX_RESPONSE_BYTES:
        raise CaptiveParseError("探测响应体过大")

    parser = _ScriptCollector()
    try:
        parser.feed(response_body.decode("utf-8", errors="replace"))
    except (UnicodeError, ValueError) as error:
        raise CaptiveParseError("无法解析探测响应") from error

    candidates: list[str] = []
    for script in parser.scripts:
        for match in LOCATION_ASSIGNMENT.finditer(script):
            candidate = html.unescape(match.group("url"))
            _validate_captive_url(candidate, portal_origin, entry_path)
            candidates.append(candidate)

    unique_candidates = list(dict.fromkeys(candidates))
    if not unique_candidates:
        return None
    if len(unique_candidates) > 1:
        raise CaptiveParseError("探测响应包含多个不同的 captive 入口")
    return unique_candidates[0]


def classify_response(
    snapshot: ResponseSnapshot,
    config: CaptiveHttpConfig,
) -> ProbeResult:
    try:
        captive_url = extract_captive_url(
            snapshot.body,
            config.portal_origin,
            config.portal_entry_path,
        )
    except CaptiveParseError as error:
        return ProbeResult(NetworkState.UNKNOWN, reason=str(error))

    if captive_url is not None:
        return ProbeResult(NetworkState.CAPTIVE, captive_url=captive_url)

    if _matches_online_fingerprint(snapshot, config.probe):
        return ProbeResult(NetworkState.ONLINE)

    return ProbeResult(NetworkState.UNKNOWN, reason="响应不匹配 captive 或精确在线指纹")


async def probe_connectivity(
    session: aiohttp.ClientSession,
    config: CaptiveHttpConfig,
) -> ProbeResult:
    timeout = aiohttp.ClientTimeout(total=config.probe.timeout_seconds)
    try:
        async with session.get(
            config.probe.url,
            allow_redirects=False,
            timeout=timeout,
        ) as response:
            body = await response.content.read(MAX_RESPONSE_BYTES + 1)
            snapshot = ResponseSnapshot(
                status=response.status,
                headers=dict(response.headers),
                body=body,
            )
    except (aiohttp.ClientError, TimeoutError) as error:
        return ProbeResult(NetworkState.UNKNOWN, reason=f"探测请求失败：{error}")

    return classify_response(snapshot, config)


def _validate_captive_url(candidate: str, portal_origin: str, entry_path: str) -> None:
    if len(candidate) > MAX_CAPTIVE_URL_LENGTH:
        raise CaptiveParseError("captive 入口 URL 过长")

    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise CaptiveParseError("captive 入口不是完整的 HTTP 或 HTTPS URL")
    if parsed.username is not None or parsed.password is not None:
        raise CaptiveParseError("captive 入口不能包含用户信息")
    if parsed.fragment:
        raise CaptiveParseError("captive 入口不能包含片段")
    if parsed.params:
        raise CaptiveParseError("captive 入口不能包含路径参数")
    if _normalized_origin(candidate) != _normalized_origin(portal_origin):
        raise CaptiveParseError("captive 入口不属于配置的门户 origin")
    if parsed.path != entry_path:
        raise CaptiveParseError("captive 入口路径与配置不匹配")

    parameters: dict[str, list[str]] = {}
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        parameters.setdefault(key, []).append(value)

    for key in REQUIRED_CAPTIVE_PARAMETERS:
        values = parameters.get(key, [])
        if len(values) != 1 or not values[0]:
            raise CaptiveParseError(f"captive 入口缺少唯一且非空的 {key}")


def _normalized_origin(value: str) -> tuple[str, str, int]:
    parsed = urlparse(value)
    if not parsed.hostname:
        raise CaptiveParseError("门户 origin 缺少 host")
    try:
        port = parsed.port
    except ValueError as error:
        raise CaptiveParseError("门户 origin 端口无效") from error
    if port is None:
        port = 80 if parsed.scheme == "http" else 443
    return parsed.scheme.casefold(), parsed.hostname.casefold(), port


def _matches_online_fingerprint(snapshot: ResponseSnapshot, probe: ProbeConfig) -> bool:
    if snapshot.status != probe.online_status:
        return False
    if probe.online_body is not None:
        try:
            if snapshot.body.decode("utf-8") != probe.online_body:
                return False
        except UnicodeDecodeError:
            return False
    if probe.online_location is not None:
        location = next(
            (value for key, value in snapshot.headers.items() if key.casefold() == "location"),
            None,
        )
        if location != probe.online_location:
            return False
    return True
