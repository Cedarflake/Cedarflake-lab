import socket
import struct
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from urllib.parse import urlencode

import aiohttp
from campus_net.captive import (
    IP_UNICAST_IF,
    MAX_CAPTIVE_URL_LENGTH,
    CaptiveParseError,
    NetworkState,
    ResponseSnapshot,
    WindowsInterfaceSocketFactory,
    classify_response,
    extract_captive_url,
    probe_connectivity,
)
from campus_net.config import CaptiveHttpConfig, ProbeConfig

PORTAL_ORIGIN = "http://10.71.29.181"
ENTRY_PATH = "/eportal/index.jsp"


def captive_url(
    *,
    origin: str = PORTAL_ORIGIN,
    path: str = ENTRY_PATH,
    parameters: list[tuple[str, str]] | None = None,
    suffix: str = "",
) -> str:
    if parameters is None:
        parameters = [
            ("wlanuserip", "10.0.0.23"),
            ("wlanacname", "campus-ac"),
            ("ssid", "CampusWiFi"),
            ("nasip", "10.0.255.254"),
            ("mac", "00-00-00-00-00-00"),
            ("url", "http://connectivity.example/connecttest.txt"),
        ]
    return f"{origin}{path}?{urlencode(parameters)}{suffix}"


def script_body(url: str, *, quote: str = '"', target: str = "window.location.href") -> bytes:
    return (
        f"<!doctype html><html><head><script>{target} = {quote}{url}{quote};</script></head></html>"
    ).encode()


def http_config(
    *,
    online_body: str | None = "Microsoft Connect Test",
    online_location: str | None = None,
) -> CaptiveHttpConfig:
    return CaptiveHttpConfig(
        adapter="captive-sso-http",
        interface_index=24,
        user_agent="test-agent",
        probe=ProbeConfig(
            url="http://connectivity.example/connecttest.txt",
            online_status=200,
            online_body=online_body,
            online_location=online_location,
            timeout_seconds=8,
        ),
        portal_origin=PORTAL_ORIGIN,
        portal_entry_path=ENTRY_PATH,
        auth_mode="interactive-system-captcha",
        username="example-student",
        password="example-password",
        service_display_name="中国电信",
        captcha_attempts=0,
        verification_interval_seconds=2,
        verification_timeout_seconds=30,
    )


class TestCaptiveUrlExtraction(unittest.TestCase):
    def test_extracts_real_captive_script_shape_and_preserves_url(self):
        expected_url = captive_url()
        body = script_body(expected_url, quote="'", target="top.self.location.href")

        actual_url = extract_captive_url(body, PORTAL_ORIGIN, ENTRY_PATH)

        self.assertEqual(actual_url, expected_url)

    def test_accepts_default_port_equivalence_without_rewriting_url(self):
        expected_url = captive_url(origin="http://10.71.29.181:80")

        actual_url = extract_captive_url(
            script_body(expected_url),
            PORTAL_ORIGIN,
            ENTRY_PATH,
        )

        self.assertEqual(actual_url, expected_url)

    def test_accepts_single_and_double_quotes(self):
        expected_url = captive_url()
        for quote in ("'", '"'):
            with self.subTest(quote=quote):
                self.assertEqual(
                    extract_captive_url(
                        script_body(expected_url, quote=quote),
                        PORTAL_ORIGIN,
                        ENTRY_PATH,
                    ),
                    expected_url,
                )

    def test_unescapes_html_entities(self):
        expected_url = captive_url()
        encoded_url = expected_url.replace("&", "&amp;")

        actual_url = extract_captive_url(
            script_body(encoded_url),
            PORTAL_ORIGIN,
            ENTRY_PATH,
        )

        self.assertEqual(actual_url, expected_url)

    def test_rejects_wrong_host_path_userinfo_and_fragment(self):
        invalid_urls = {
            "host": captive_url(origin="http://portal.example"),
            "path": captive_url(path="/sam-sso/login"),
            "userinfo": captive_url(origin="http://student:secret@10.71.29.181"),
            "fragment": captive_url(suffix="#unexpected"),
            "params": captive_url(path=ENTRY_PATH + ";unexpected"),
        }
        for case, invalid_url in invalid_urls.items():
            with self.subTest(case=case):
                with self.assertRaises(CaptiveParseError):
                    extract_captive_url(
                        script_body(invalid_url),
                        PORTAL_ORIGIN,
                        ENTRY_PATH,
                    )

    def test_rejects_each_missing_required_parameter(self):
        required_parameters = ("wlanuserip", "wlanacname", "nasip", "mac")
        base_parameters = [
            ("wlanuserip", "10.0.0.23"),
            ("wlanacname", "campus-ac"),
            ("nasip", "10.0.255.254"),
            ("mac", "00-00-00-00-00-00"),
        ]
        for missing_key in required_parameters:
            with self.subTest(missing_key=missing_key):
                parameters = [item for item in base_parameters if item[0] != missing_key]

                with self.assertRaises(CaptiveParseError):
                    extract_captive_url(
                        script_body(captive_url(parameters=parameters)),
                        PORTAL_ORIGIN,
                        ENTRY_PATH,
                    )

    def test_rejects_duplicate_required_parameter(self):
        parameters = [
            ("wlanuserip", "10.0.0.23"),
            ("wlanuserip", "10.0.0.24"),
            ("wlanacname", "campus-ac"),
            ("nasip", "10.0.255.254"),
            ("mac", "00-00-00-00-00-00"),
        ]

        with self.assertRaises(CaptiveParseError):
            extract_captive_url(
                script_body(captive_url(parameters=parameters)),
                PORTAL_ORIGIN,
                ENTRY_PATH,
            )

    def test_rejects_multiple_distinct_entries(self):
        first_url = captive_url()
        second_url = captive_url(
            parameters=[
                ("wlanuserip", "10.0.0.24"),
                ("wlanacname", "campus-ac"),
                ("nasip", "10.0.255.254"),
                ("mac", "00-00-00-00-00-00"),
            ]
        )
        body = (
            f"<script>window.location.href = '{first_url}';location.href = '{second_url}';</script>"
        ).encode()

        with self.assertRaises(CaptiveParseError):
            extract_captive_url(body, PORTAL_ORIGIN, ENTRY_PATH)

    def test_rejects_overlong_entry(self):
        base_url = captive_url()
        overlong_url = base_url + "&padding=" + "x" * (MAX_CAPTIVE_URL_LENGTH - len(base_url))
        self.assertGreater(len(overlong_url), MAX_CAPTIVE_URL_LENGTH)

        with self.assertRaises(CaptiveParseError):
            extract_captive_url(
                script_body(overlong_url),
                PORTAL_ORIGIN,
                ENTRY_PATH,
            )


class TestResponseClassification(unittest.TestCase):
    def test_classifies_exact_online_fingerprint(self):
        result = classify_response(
            ResponseSnapshot(
                status=200,
                headers={},
                body=b"Microsoft Connect Test",
            ),
            http_config(),
        )

        self.assertEqual(result.state, NetworkState.ONLINE)
        self.assertIsNone(result.captive_url)

    def test_captive_entry_takes_priority_over_online_fingerprint(self):
        body = script_body(captive_url())
        result = classify_response(
            ResponseSnapshot(status=200, headers={}, body=body),
            http_config(online_body=body.decode()),
        )

        self.assertEqual(result.state, NetworkState.CAPTIVE)
        self.assertEqual(result.captive_url, captive_url())

    def test_invalid_captive_entry_takes_priority_over_online_fingerprint(self):
        body = script_body(captive_url(origin="http://portal.example"))
        result = classify_response(
            ResponseSnapshot(status=200, headers={}, body=body),
            http_config(online_body=body.decode()),
        )

        self.assertEqual(result.state, NetworkState.UNKNOWN)
        self.assertTrue(result.reason)

    def test_classifies_unrecognized_response_as_unknown(self):
        result = classify_response(
            ResponseSnapshot(status=200, headers={}, body=b"unexpected"),
            http_config(),
        )

        self.assertEqual(result.state, NetworkState.UNKNOWN)
        self.assertTrue(result.reason)


class TestConnectivityProbe(unittest.IsolatedAsyncioTestCase):
    async def test_reports_unreachable_bound_interface_without_raw_socket_error(self):
        session = Mock()
        session.get.side_effect = aiohttp.ClientConnectorError(
            SimpleNamespace(host="connectivity.example", port=80, ssl=True),
            OSError(10065, "raw socket failure"),
        )

        result = await probe_connectivity(session, http_config())

        self.assertEqual(result.state, NetworkState.UNKNOWN)
        self.assertIsNone(result.captive_url)
        self.assertEqual(result.reason, "配置接口未连接，或该接口当前没有可用路由")
        for private_detail in ("connectivity.example", "ssl", "10065", "raw socket failure"):
            self.assertNotIn(private_detail, result.reason)
        session.get.assert_called_once()
        _args, kwargs = session.get.call_args
        self.assertEqual(kwargs["allow_redirects"], False)
        self.assertEqual(kwargs["timeout"].total, 8)

    async def test_reports_probe_timeout_without_raw_exception_text(self):
        session = Mock()
        session.get.side_effect = TimeoutError("secret transport detail")

        result = await probe_connectivity(session, http_config())

        self.assertEqual(result.state, NetworkState.UNKNOWN)
        self.assertEqual(result.reason, "配置接口访问连通性探测地址超时")
        self.assertNotIn("secret transport detail", result.reason)


class TestWindowsInterfaceSocketFactory(unittest.TestCase):
    def test_binds_socket_with_network_byte_order_interface_index(self):
        client_socket = Mock()
        address_info = (
            socket.AF_INET,
            socket.SOCK_STREAM,
            socket.IPPROTO_TCP,
            "",
            ("203.0.113.1", 80),
        )

        with (
            patch("campus_net.captive.sys.platform", "win32"),
            patch("campus_net.captive.socket.socket", return_value=client_socket) as constructor,
        ):
            result = WindowsInterfaceSocketFactory(24)(address_info)

        constructor.assert_called_once_with(
            socket.AF_INET,
            socket.SOCK_STREAM,
            socket.IPPROTO_TCP,
        )
        client_socket.setsockopt.assert_called_once_with(
            socket.IPPROTO_IP,
            IP_UNICAST_IF,
            struct.pack("!I", 24),
        )
        self.assertIs(result, client_socket)

    def test_closes_socket_when_binding_fails(self):
        client_socket = Mock()
        client_socket.setsockopt.side_effect = OSError("binding failed")
        address_info = (
            socket.AF_INET,
            socket.SOCK_STREAM,
            socket.IPPROTO_TCP,
            "",
            ("203.0.113.1", 80),
        )

        with (
            patch("campus_net.captive.sys.platform", "win32"),
            patch("campus_net.captive.socket.socket", return_value=client_socket),
            self.assertRaises(OSError),
        ):
            WindowsInterfaceSocketFactory(24)(address_info)

        client_socket.close.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
